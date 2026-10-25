import { NextResponse } from "next/server";
import { db, storage } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "Twilio WhatsApp Webhook is active" });
}

export async function POST(req: Request) {
  try {
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const messageSid = params.get("MessageSid") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // 1. Download incoming attachments and upload to Firebase
    const finalizedMediaUrls: string[] = [];
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      const contentType = params.get(`MediaContentType${i}`) || "image/jpeg";

      if (mediaUrl) {
        try {
          const response = await fetch(mediaUrl, {
            headers: { Authorization: authHeader },
          });
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const ext = contentType.includes("pdf")
            ? "pdf"
            : contentType.includes("video")
            ? "mp4"
            : contentType.includes("png")
            ? "png"
            : "jpg";

          const fileName = `id_cards/${cleanSenderPhone}_${Date.now()}_${i}.${ext}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, buffer, { contentType });

          const publicUrl = await getDownloadURL(storageRef);
          finalizedMediaUrls.push(publicUrl);
        } catch (e) {
          console.error("Failed to upload media:", e);
        }
      }
    }

    // 2. Match Guest by phone number (last 10 digits)
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const data = d.data();
      const guestPhoneClean = (data.phone || "").replace(/[^0-9]/g, "");
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
      }
    });

    if (matchedGuestDoc) {
      const guestData = matchedGuestDoc.data();
      const currentIds = guestData.idCardUrls || [];
      const updatedIds = [...currentIds, ...finalizedMediaUrls];

      // Save incoming message in chat history
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: finalizedMediaUrls,
        sid: messageSid,
        status: "delivered",
        timestamp: new Date().toISOString(),
        senderName: guestData.name || "Guest",
      });

      // 3. 2-HOUR GAP CHECK
      const lastInboundTime = guestData.lastGuestInboundAt
        ? new Date(guestData.lastGuestInboundAt).getTime()
        : 0;
      const now = Date.now();
      const twoHoursInMs = 2 * 60 * 60 * 1000;
      const shouldSendAutoReply = !lastInboundTime || now - lastInboundTime > twoHoursInMs;

      let replyText = "";
      if (shouldSendAutoReply) {
        replyText = "Namaste,We have recieved your message and our team will get back to you ASAP Regards Team Brajwal";

        // Save auto-reply in chat history so executive sees it
        await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
          direction: "outbound",
          body: replyText,
          mediaUrls: [],
          status: "delivered",
          timestamp: new Date().toISOString(),
          senderName: "Team Brajwal (Auto-Reply)",
        });
      }

      // Update Guest Document with latest inbound time
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage:
          body.trim() ||
          (finalizedMediaUrls.length > 0
            ? `📷 Sent ${finalizedMediaUrls.length} file(s)`
            : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        lastGuestInboundAt: new Date().toISOString(), // resets 2-hr window
        hasUnreadMessages: true,
        ...(finalizedMediaUrls.length > 0 ? { status: "IDs Received" } : {}),
      });

      if (replyText) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
        return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
      }
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
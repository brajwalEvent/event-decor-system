import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";

// Handshake verification for Meta & Twilio (GET)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe") {
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }
  return NextResponse.json({ status: "Twilio & Meta Universal Webhook is Active" });
}

// Universal Inbound Handler (POST)
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    let cleanSenderPhone = "";
    let messageBody = "";
    let incomingMediaUrls: string[] = [];

    // 1. CHECK IF INCOMING PAYLOAD IS FROM META (JSON FORMAT)
    try {
      const json = JSON.parse(rawBody);
      if (json.entry && json.entry[0]?.changes) {
        const value = json.entry[0].changes[0].value;
        const msg = value?.messages?.[0];

        if (msg) {
          cleanSenderPhone = (msg.from || "").replace(/[^0-9]/g, "");
          messageBody = msg.text?.body || "";

          // If image received via Meta
          if (msg.image && msg.image.id) {
            // Meta image attachment placeholder/URL
            incomingMediaUrls.push(`https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${msg.image.id}`);
          }
        }
      }
    } catch (e) {
      // Not JSON, fall back to Twilio form-data
    }

    // 2. CHECK IF INCOMING PAYLOAD IS FROM TWILIO (URL-ENCODED FORMAT)
    if (!cleanSenderPhone) {
      const params = new URLSearchParams(rawBody);
      const from = params.get("From") || "";
      cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");
      messageBody = params.get("Body") || "";

      const numMedia = parseInt(params.get("NumMedia") || "0", 10);
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        if (mediaUrl) incomingMediaUrls.push(mediaUrl);
      }
    }

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // 3. FIND GUEST IN FIRESTORE BY LAST 10 DIGITS
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
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // Save to chat history subcollection
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: messageBody.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

      // Update Guest Profile document
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: messageBody.trim() || (incomingMediaUrls.length > 0 ? `📷 Sent ${incomingMediaUrls.length} ID photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(incomingMediaUrls.length > 0 ? { status: "IDs Received" } : {}),
      });

      const replyText = incomingMediaUrls.length > 0
        ? `Namaste! We have received ${incomingMediaUrls.length} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
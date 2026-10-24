import { NextResponse } from "next/server";
import { db, storage } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import twilio from "twilio";

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
  return NextResponse.json({ status: "Twilio WhatsApp Webhook is active" });
}

// Handle incoming WhatsApp messages and photos (POST)
export async function POST(req: Request) {
  try {
    console.log("==================================================");
    console.log("🚨 INBOUND WHATSAPP POST TRIGGERED!");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    console.log(`🔥 FROM: ${cleanSenderPhone} | MEDIA: ${numMedia} | BODY: ${body}`);

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // 1. DOWNLOAD & UPLOAD MEDIA TO FIREBASE STORAGE
    const finalizedMediaUrls: string[] = [];
    
    // Twilio Auth for downloading media
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64');

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      const contentType = params.get(`MediaContentType${i}`) || "image/jpeg";
      
      if (mediaUrl) {
        try {
          const response = await fetch(mediaUrl, {
            headers: { 'Authorization': authHeader }
          });
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const fileName = `id_cards/${cleanSenderPhone}_${Date.now()}_${i}.jpg`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, buffer, { contentType });
          
          const publicUrl = await getDownloadURL(storageRef);
          finalizedMediaUrls.push(publicUrl);
          console.log(`✅ Uploaded media to Firebase: ${publicUrl}`);
        } catch (e) {
          console.error("Failed to upload media:", e);
        }
      }
    }

    // 2. Match guest in Firestore
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
      const updatedIds = [...currentIds, ...finalizedMediaUrls];

      // Save to chat history
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: finalizedMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

      // Update Guest Profile
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (finalizedMediaUrls.length > 0 ? `📷 Sent ${finalizedMediaUrls.length} ID photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(finalizedMediaUrls.length > 0 ? { status: "IDs Received" } : {}),
      });

      const replyText = finalizedMediaUrls.length > 0
        ? `Namaste! We have received ${finalizedMediaUrls.length} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
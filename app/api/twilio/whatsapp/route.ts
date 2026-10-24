import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, addDoc, collection } from "firebase/firestore";

// Handshake verification for Meta & Twilio (GET)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe") {
      console.log("WEBHOOK_VERIFIED");
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
    console.log("🚨 INBOUND TWILIO WHATSAPP POST TRIGGERED! 🚨");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    // Extract clean phone number
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    console.log(`🔥 DEBUG - Incoming Number (Clean): ${cleanSenderPhone}`);
    console.log(`🔥 MESSAGE BODY: ${body}`);
    console.log(`📸 MEDIA COUNT: ${numMedia}`);

    if (!cleanSenderPhone) {
      console.log("❌ ERROR: Could not extract sender phone number.");
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // Extract incoming image URLs from Twilio
    const incomingMediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      if (mediaUrl) incomingMediaUrls.push(mediaUrl);
    }
    console.log("📸 Extracted Media URLs:", incomingMediaUrls);

    // Fetch all RSVPs to match
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    console.log(`🔥 Total guests in database: ${rsvpGroupSnap.size}`);

    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const data = d.data();
      const guestPhoneClean = (data.phone || "").replace(/[^0-9]/g, "");
      
      console.log(`DEBUG - Comparing In: ${cleanSenderPhone} vs DB: ${guestPhoneClean}`);
      
      // Match if the last 10 digits are identical
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
        console.log(`🎉 MATCH SUCCESSFUL FOR GUEST: ${data.name}`);
      }
    });

    if (matchedGuestDoc) {
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // Save message into guest's chat history
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

      // Update Guest Profile document
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (numMedia > 0 ? `📷 Sent ${numMedia} photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(numMedia > 0 ? { status: "IDs Received" } : {}),
      });

      const replyText = numMedia > 0
        ? `Namaste! We have received ${numMedia} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      console.log("✅ Sending Auto-Reply and database updated.");
      console.log("==================================================");
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    } else {
      console.log("❌ CRITICAL: No match found in database.");
      console.log("==================================================");
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }
  } catch (err) {
    console.error("❌ CRITICAL WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
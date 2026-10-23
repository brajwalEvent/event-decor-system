import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";

// Explicitly handle GET so browser doesn't throw 405 if visited directly
export async function GET() {
  return NextResponse.json({ status: "Twilio WhatsApp Webhook is active" });
}

// Handle incoming WhatsApp messages and photos from Twilio (POST)
export async function POST(req: Request) {
  try {
    console.log("==================================================");
    console.log("🚨 INBOUND TWILIO WHATSAPP POST TRIGGERED! 🚨");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    console.log(`🔥 LIVE TEST - INCOMING WHATSAPP FROM: ${cleanSenderPhone}`);
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

    // Fetch all guests to print them in Vercel logs for debugging
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    console.log(`🔥 Total guests found in database collection group: ${rsvpGroupSnap.size}`);

    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const data = d.data();
      const guestPhoneClean = (data.phone || "").replace(/[^0-9]/g, "");
      console.log(`Checking DB Guest: ${data.name} | Phone in DB: ${data.phone} (Clean: ${guestPhoneClean})`);
      
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
        console.log(`🎉 MATCH SUCCESSFUL FOR GUEST: ${data.name} (Doc Path: ${d.ref.path})`);
      }
    });

    if (matchedGuestDoc) {
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // 1. Save message to chat history
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });
      console.log("✅ Message saved to guest chat collection.");

      // 2. Update guest profile
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (numMedia > 0 ? `📷 Sent ${numMedia} photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(numMedia > 0 ? { status: "IDs Received" } : {}),
      });
      console.log("✅ Guest document successfully updated with IDs/status.");

      const replyText = numMedia > 0
        ? `Namaste! We have received ${numMedia} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${replyText}</Message>
</Response>`;

      console.log("✅ Sending TwiML Auto-Reply back to Twilio.");
      console.log("==================================================");
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    console.log(`❌ ERROR: No guest found matching phone number ending in ${cleanSenderPhone.slice(-10)}`);
    console.log("==================================================");
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("❌ CRITICAL WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
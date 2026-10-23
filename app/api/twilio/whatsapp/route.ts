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
    console.log("=== INBOUND TWILIO WHATSAPP POST TRIGGERED ===");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    console.log(`📱 From: ${from} | Media: ${numMedia} | Body: ${body}`);

    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    const incomingMediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      if (mediaUrl) incomingMediaUrls.push(mediaUrl);
    }

    // Match guest in Firestore
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const guestData = d.data();
      const guestPhoneClean = (guestData.phone || "").replace(/[^0-9]/g, "");
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
      }
    });

    if (matchedGuestDoc) {
      console.log(`✅ Matched Guest: ${matchedGuestDoc.data().name}`);
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // Save to chat
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

      // Update profile
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (numMedia > 0 ? `📷 Sent ${numMedia} photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(numMedia > 0 ? { status: "IDs Received" } : {}),
      });

      const replyText = numMedia > 0
        ? `Namaste! We have received ${numMedia} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    console.log("❌ No guest found matching phone:", cleanSenderPhone);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    console.log("=== INBOUND TWILIO WEBHOOK TRIGGERED ===");

    // Twilio sends data as urlencoded string. This is the safest way to parse it in Next.js:
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    console.log(`Received from: ${from} | Media Count: ${numMedia} | Body: ${body}`);

    // Extract clean phone number without "whatsapp:" prefix
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      console.log("Error: No valid sender phone found.");
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // Extract incoming image URLs from Twilio
    const incomingMediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      if (mediaUrl) incomingMediaUrls.push(mediaUrl);
    }

    console.log("Extracted Media URLs:", incomingMediaUrls);

    // Match guest in Firestore across RSVPs by phone number
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const data = d.data();
      const guestPhoneClean = (data.phone || "").replace(/[^0-9]/g, "");
      // Match last 10 digits to handle country code differences gracefully
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
      }
    });

    if (matchedGuestDoc) {
      console.log(`Matched Guest ID: ${matchedGuestDoc.id}`);
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // 1. Save message into guest's chat history
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

      // 2. Update guest document
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (numMedia > 0 ? `📷 Sent ${numMedia} photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(numMedia > 0 ? { status: "IDs Received" } : {}),
      });

      console.log("Successfully updated guest doc with new messages/media.");

      // Send auto-reply back to the guest
      const replyText = numMedia > 0
        ? `Namaste! We have received ${numMedia} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending. Thank you!`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${replyText}</Message>
</Response>`;

      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    console.log("No matching guest found in the database for phone:", cleanSenderPhone);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
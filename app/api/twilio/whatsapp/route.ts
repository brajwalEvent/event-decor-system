import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, addDoc, collection } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    console.log("==================================================");
    console.log("🚨 INBOUND TWILIO WEBHOOK FIRED! 🚨");

    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    console.log(`📱 Message From: ${from}`);
    console.log(`💬 Text Body: ${body}`);
    console.log(`📸 Media Count: ${numMedia}`);

    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");
    
    if (!cleanSenderPhone) {
      console.log("❌ ERROR: Could not extract phone number.");
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    console.log(`🔍 Searching Database for Phone ending in: ${cleanSenderPhone.slice(-10)}`);

    const incomingMediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      if (mediaUrl) incomingMediaUrls.push(mediaUrl);
    }

    // Search Database
    const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
    let matchedGuestDoc: any = null;

    rsvpGroupSnap.forEach((d) => {
      const guestData = d.data();
      const guestPhoneClean = (guestData.phone || "").replace(/[^0-9]/g, "");
      
      // Look for a match on the last 10 digits
      if (guestPhoneClean.slice(-10) === cleanSenderPhone.slice(-10)) {
        matchedGuestDoc = d;
        console.log(`✅ MATCH FOUND! Guest Name: ${guestData.name}`);
      }
    });

    if (matchedGuestDoc) {
      const currentIds = matchedGuestDoc.data().idCardUrls || [];
      const updatedIds = [...currentIds, ...incomingMediaUrls];

      // Save Message to Chat History
      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });
      console.log("✅ Message saved to chat history.");

      // Update Guest Document
      await updateDoc(doc(db, matchedGuestDoc.ref.path), {
        idCardUrls: updatedIds,
        lastMessage: body.trim() || (numMedia > 0 ? `📷 Sent ${numMedia} photo(s)` : "Replied on WhatsApp"),
        lastMessageAt: new Date().toISOString(),
        hasUnreadMessages: true,
        ...(numMedia > 0 ? { status: "IDs Received" } : {}),
      });
      console.log("✅ Guest profile updated with photos/status.");

      const replyText = numMedia > 0
        ? `Namaste! We have received ${numMedia} ID card photo(s) for your family. Thank you! 🙏`
        : `Namaste! We received your message. Please share photos of the ID cards for all family members attending.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      console.log("✅ Sending Auto-Reply back to guest.");
      console.log("==================================================");
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    console.log("❌ ERROR: No matching guest found in the database for that phone number.");
    console.log("==================================================");
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("❌ CRITICAL WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
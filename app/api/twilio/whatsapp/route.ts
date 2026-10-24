import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc } from "firebase/firestore";

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
  return NextResponse.json({ status: "WhatsApp Webhook is active" });
}

export async function POST(req: Request) {
  try {
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    const incomingMediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      if (mediaUrl) incomingMediaUrls.push(mediaUrl);
    }

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

      await addDoc(collection(db, matchedGuestDoc.ref.path, "messages"), {
        direction: "inbound",
        body: body.trim(),
        mediaUrls: incomingMediaUrls,
        timestamp: new Date().toISOString(),
        senderName: matchedGuestDoc.data().name || "Guest",
      });

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
      return new Response(twimlResponse, { headers: { "Content-Type": "text/xml" } });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
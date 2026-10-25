import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "../../../../lib/firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

export async function POST(req: Request) {
  try {
    const { handoverId, guestId, phone, message, mediaUrl, fileName } = await req.json();

    if (!phone || !handoverId || !guestId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!message?.trim() && !mediaUrl) {
      return NextResponse.json({ error: "Must provide message text or media" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);

    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    const formattedTo = `whatsapp:+${cleanPhone}`;
    const formattedFrom = fromWhatsAppNumber?.startsWith("whatsapp:")
      ? fromWhatsAppNumber
      : `whatsapp:${fromWhatsAppNumber}`;

    const callbackUrl = `https://brajwal.com/api/twilio/status?handoverId=${handoverId}&guestId=${guestId}`;

    const messageOptions: any = {
      from: formattedFrom,
      to: formattedTo,
      statusCallback: callbackUrl,
    };
    if (message?.trim()) messageOptions.body = message.trim();
    if (mediaUrl) messageOptions.mediaUrl = [mediaUrl];

    const response = await client.messages.create(messageOptions);

    await addDoc(collection(db, "handovers", handoverId, "rsvps", guestId, "messages"), {
      direction: "outbound",
      body: message?.trim() || "",
      mediaUrls: mediaUrl ? [mediaUrl] : [],
      fileName: fileName || null,
      sid: response.sid,
      status: "sent",
      timestamp: new Date().toISOString(),
      senderName: "Executive",
    });

    await updateDoc(doc(db, "handovers", handoverId, "rsvps", guestId), {
      lastMessage: message?.trim() || (mediaUrl ? "📎 Sent an attachment" : ""),
      lastMessageAt: new Date().toISOString(),
      whatsappStatus: "sent",
    });

    return NextResponse.json({ success: true, sid: response.sid });
  } catch (err: any) {
    console.error("Chat send error:", err);
    return NextResponse.json({ error: err.message || "Failed to send message" }, { status: 500 });
  }
}
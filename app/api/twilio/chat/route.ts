import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "../../../../lib/firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

export async function POST(req: Request) {
  try {
    const { handoverId, guestId, phone, message } = await req.json();

    if (!phone || !message?.trim() || !handoverId || !guestId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);

    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    const formattedTo = `whatsapp:+${cleanPhone}`;
    const formattedFrom = fromWhatsAppNumber?.startsWith("whatsapp:")
      ? fromWhatsAppNumber
      : `whatsapp:${fromWhatsAppNumber}`;

    // Send WhatsApp message via Twilio
    const response = await client.messages.create({
      from: formattedFrom,
      to: formattedTo,
      body: message.trim(),
    });

    // Save message to guest's conversation history in Firestore
    await addDoc(collection(db, "handovers", handoverId, "rsvps", guestId, "messages"), {
      direction: "outbound",
      body: message.trim(),
      sid: response.sid,
      status: "sent",
      timestamp: new Date().toISOString(),
      senderName: "Executive",
    });

    await updateDoc(doc(db, "handovers", handoverId, "rsvps", guestId), {
      lastMessage: message.trim(),
      lastMessageAt: new Date().toISOString(),
      whatsappStatus: "sent",
    });

    return NextResponse.json({ success: true, sid: response.sid });
  } catch (err: any) {
    console.error("Chat send error:", err);
    return NextResponse.json({ error: err.message || "Failed to send message" }, { status: 500 });
  }
}
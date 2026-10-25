import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const { phone, guestName, weddingTitle, resortName, handoverId, guestId } = await req.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const templateSid = process.env.TWILIO_TEMPLATE_SID;

    if (!accountSid || !authToken || !fromWhatsAppNumber || !templateSid) {
      return NextResponse.json({ error: "Missing Twilio server configuration" }, { status: 500 });
    }
    if (!phone || !guestName) {
      return NextResponse.json({ error: "Phone number and Guest Name are required" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);

    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    const formattedTo = `whatsapp:+${cleanPhone}`;
    const formattedFrom = fromWhatsAppNumber.startsWith("whatsapp:")
      ? fromWhatsAppNumber
      : `whatsapp:${fromWhatsAppNumber}`;

    const targetResort = resortName || "the resort";
    const targetWedding = weddingTitle || "the wedding";

    // Direct callback with route params so status updates are instant
    const callbackUrl = handoverId && guestId
      ? `https://brajwal.com/api/twilio/status?handoverId=${handoverId}&guestId=${guestId}`
      : "https://brajwal.com/api/twilio/status";

    const response = await client.messages.create({
      from: formattedFrom,
      to: formattedTo,
      contentSid: templateSid,
      contentVariables: JSON.stringify({
        "1": guestName,
        "2": targetResort,
        "3": targetWedding,
      }),
      statusCallback: callbackUrl,
    });

    const formattedMessageText = `Namaste ${guestName} ji, greetings from Brajwal Weddings & Events. For your upcoming stay at ${targetResort} for ${targetWedding}, government-issued photo IDs are mandatory for all attending guests. Please reply directly to this message with photos of ID cards (Aadhaar/Passport) for all family members attending. Thank you!`;

    return NextResponse.json({ 
      success: true, 
      sid: response.sid,
      formattedText: formattedMessageText 
    });
  } catch (err: any) {
    console.error("Twilio Template Send Error:", err);
    return NextResponse.json({ error: err.message || "Failed to trigger template" }, { status: 500 });
  }
}
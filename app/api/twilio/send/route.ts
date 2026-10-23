import { NextResponse } from "next/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
// Add this to your .env.local: TWILIO_TEMPLATE_SID=HX...
const templateSid = process.env.TWILIO_TEMPLATE_SID; 

export async function POST(req: Request) {
  try {
    const { phone, guestName, weddingTitle, resortName, paxCount } = await req.json();

    const client = twilio(accountSid, authToken);

    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    await client.messages.create({
      from: fromWhatsAppNumber,
      to: `whatsapp:+${cleanPhone}`,
      // Use contentSid for approved template, not 'body'
      contentSid: templateSid, 
      contentVariables: JSON.stringify({
        "1": guestName,
        "2": resortName,
        "3": weddingTitle
      })
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Twilio Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
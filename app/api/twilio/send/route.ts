import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const { phone, guestName, weddingTitle, resortName, paxCount } = await req.json();

    // 1. Validation for missing env vars
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const templateSid = process.env.TWILIO_TEMPLATE_SID;

    if (!accountSid || !authToken || !fromWhatsAppNumber || !templateSid) {
      console.error("Missing Twilio Environment Variables");
      return NextResponse.json({ 
        error: "Server configuration missing (Check TWILIO_ACCOUNT_SID, AUTH_TOKEN, WHATSAPP_NUMBER, TEMPLATE_SID on Vercel)" 
      }, { status: 500 });
    }

    if (!phone || !guestName) {
      return NextResponse.json({ error: "Phone number and Guest Name are required" }, { status: 400 });
    }

    // 2. Initialize Twilio client
    const client = twilio(accountSid, authToken);

    // 3. Format Phone Number
    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }
    const formattedTo = `whatsapp:+${cleanPhone}`;
    const formattedFrom = fromWhatsAppNumber.startsWith("whatsapp:") 
      ? fromWhatsAppNumber 
      : `whatsapp:${fromWhatsAppNumber}`;

    // 4. Send Message via Approved Template (CONTENT SID)
    const response = await client.messages.create({
      from: formattedFrom,
      to: formattedTo,
      contentSid: templateSid,
      contentVariables: JSON.stringify({
        "1": guestName,
        "2": resortName || "the resort",
        "3": weddingTitle || "your wedding"
      })
    });

    return NextResponse.json({ success: true, sid: response.sid });
    
  } catch (err: any) {
    console.error("Twilio API Error:", err);
    return NextResponse.json({ 
      error: err.message || "Failed to communicate with WhatsApp API" 
    }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const { guestPhone, guestName, executiveEmail } = await req.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const serviceSid = process.env.TWILIO_CHAT_SERVICE_SID;

    if (!accountSid || !authToken || !fromWhatsAppNumber || !serviceSid) {
      return NextResponse.json({ error: "Twilio credentials missing" }, { status: 500 });
    }

    if (!guestPhone || !executiveEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);

    // 1. Clean the guest phone number
    let cleanPhone = guestPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    const formattedGuestPhone = `whatsapp:+${cleanPhone}`;

    // Format your business number
    const formattedFrom = fromWhatsAppNumber.startsWith("whatsapp:")
      ? fromWhatsAppNumber
      : `whatsapp:${fromWhatsAppNumber}`;

    // 2. Check if a conversation already exists for this phone number
    const existingConversations = await client.conversations.v1.conversations.list();
    
    // Twilio doesn't let us easily search by participant phone, so we use the FriendlyName as a hack
    const conversationName = `RSVP_${cleanPhone}`;
    let conversation = existingConversations.find(c => c.friendlyName === conversationName);

    if (!conversation) {
      // 3. Create a new Conversation
      conversation = await client.conversations.v1.conversations.create({
        friendlyName: conversationName,
      });

      // 4. Add the Guest's WhatsApp Number to the Conversation
      await client.conversations.v1.conversations(conversation.sid)
        .participants
        .create({
          "messagingBinding.address": formattedGuestPhone,
          "messagingBinding.proxyAddress": formattedFrom,
        });
    }

    // 5. Add the Executive (Web User) to the Conversation
    // We wrap this in a try-catch because if they are already added, it throws an error which we can ignore
    try {
      await client.conversations.v1.conversations(conversation.sid)
        .participants
        .create({
          identity: executiveEmail
        });
    } catch (participantErr: any) {
      if (participantErr.code !== 50201) { // 50201 = Participant already exists
        console.error("Error adding executive to conversation:", participantErr);
      }
    }

    return NextResponse.json({ success: true, conversationSid: conversation.sid });

  } catch (err: any) {
    console.error("Twilio Create Conversation Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create conversation" }, { status: 500 });
  }
}
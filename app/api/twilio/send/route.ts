import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "../../../../lib/firebase";
import { collection, addDoc, doc, updateDoc, setDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { 
      phone, 
      guestName, 
      weddingTitle, 
      resortName, 
      checkInDate, 
      side,
      regardsName,
      handoverId, 
      guestId,
      templateSid: customTemplateSid,
      contentVariables: customVariables
    } = await req.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const templateSid = customTemplateSid || process.env.TWILIO_TEMPLATE_SID;

    if (!accountSid || !authToken || !fromWhatsAppNumber || !templateSid) {
      return NextResponse.json({ error: "Missing Twilio server configuration or Template SID" }, { status: 500 });
    }
    if (!phone || !guestName) {
      return NextResponse.json({ error: "Phone number and Guest Name are required" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);

    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    const tenDigit = cleanPhone.slice(-10);

    const formattedTo = `whatsapp:+${cleanPhone}`;
    const formattedFrom = fromWhatsAppNumber.startsWith("whatsapp:")
      ? fromWhatsAppNumber
      : `whatsapp:${fromWhatsAppNumber}`;

    const targetResort = resortName || "the resort";
    const targetWedding = weddingTitle || "the wedding";
    const targetCheckIn = checkInDate || "Wedding Day";
    const targetParents = regardsName || (side === "Groom" ? "Groom's Family" : "Bride's Family");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://brajwal.com";
    const callbackUrl = handoverId && guestId
      ? `${baseUrl}/api/twilio/status?handoverId=${handoverId}&guestId=${guestId}`
      : `${baseUrl}/api/twilio/status`;

    // Construct Twilio message parameters
    const messagePayload: any = {
      from: formattedFrom,
      to: formattedTo,
      contentSid: templateSid,
      statusCallback: callbackUrl,
    };

    if (customTemplateSid) {
      // Custom Meta template: only attach variables if the template actually expects them
      if (customVariables && typeof customVariables === "object" && Object.keys(customVariables).length > 0) {
        messagePayload.contentVariables = JSON.stringify(customVariables);
      }
    } else {
      // Default approved ID Request template: exactly 5 variables
      messagePayload.contentVariables = JSON.stringify({
        "1": guestName,
        "2": targetParents,
        "3": targetResort,
        "4": targetWedding,
        "5": targetCheckIn,
      });
    }

    const response = await client.messages.create(messagePayload);

    const formattedMessageText = customTemplateSid
      ? `[Custom Meta Template SID: ${templateSid}] Sent to ${guestName}`
      : `Namaste ${guestName} Ji,
Greetings from Brajwal Weddings & Events on behalf of ${targetParents},
for your upcoming stay at ${targetResort} for ${targetWedding}
Check-in date: ${targetCheckIn},
As Per Guidelines, government-issued photo IDs are mandatory for all attending guests for check-in process. Please reply directly to this message with Photos or PDF of ID cards (Aadhaar/Passport) for all family members attending the wedding.
For any other query feel free to reply to this message, our executive will get back to you.

Regards
Team Brajwal`;

    if (handoverId && guestId) {
      // 1. Save outbound message to subcollection
      await addDoc(collection(db, "handovers", handoverId, "rsvps", guestId, "messages"), {
        direction: "outbound",
        body: formattedMessageText,
        sid: response.sid,
        status: "sent",
        timestamp: new Date().toISOString(),
        senderName: customTemplateSid ? "Team Brajwal (Custom Template)" : "Team Brajwal (ID Request)",
      });

      // 2. Update guest doc
      await updateDoc(doc(db, "handovers", handoverId, "rsvps", guestId), {
        whatsappSentAt: new Date().toISOString(),
        whatsappStatus: "sent",
        status: "ID Requested",
        lastMessage: customTemplateSid ? `Template [${templateSid.slice(-6)}] sent` : "Official ID Request sent",
        lastMessageAt: new Date().toISOString(),
      });

      // 3. LOCK PHONE ROUTING to this specific wedding so replies return here
      await setDoc(doc(db, "phone_routing", tenDigit), {
        handoverId,
        guestId,
        weddingTitle: targetWedding,
        guestName,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

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
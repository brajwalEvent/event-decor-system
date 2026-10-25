import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const { identity } = await req.json();

    if (!identity) {
      return NextResponse.json({ error: "Identity (user email) is required" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const serviceSid = process.env.TWILIO_CHAT_SERVICE_SID;

    if (!accountSid || !apiKey || !apiSecret || !serviceSid) {
      console.error("Missing Twilio API Keys in environment variables.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Generate Twilio Access Token
    const AccessToken = twilio.jwt.AccessToken;
    const ChatGrant = AccessToken.ChatGrant;

    const chatGrant = new ChatGrant({
      serviceSid: serviceSid,
    });

    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity,
      ttl: 3600, // Token valid for 1 hour
    });

    token.addGrant(chatGrant);

    return NextResponse.json({ token: token.toJwt() });
  } catch (err: any) {
    console.error("Token generation error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate token" }, { status: 500 });
  }
}
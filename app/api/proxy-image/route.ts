import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mediaUrl = searchParams.get("url");

    if (!mediaUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    if (mediaUrl.includes("api.twilio.com")) {
      const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
      const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();

      if (accountSid && authToken) {
        headers["Authorization"] = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      }
    }

    const response = await fetch(mediaUrl, { 
      headers,
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream media returned status: ${response.status}` },
        { status: response.status }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ||
      (mediaUrl.toLowerCase().includes(".pdf") ? "application/pdf" : "image/jpeg");

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: any) {
    console.error("[Proxy Image Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch media" }, { status: 500 });
  }
}
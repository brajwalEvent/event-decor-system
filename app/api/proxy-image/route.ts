import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mediaUrl = searchParams.get("url");

    if (!mediaUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // Automatically inject Twilio authentication headers if requesting Twilio media
    const headers: Record<string, string> = {};
    if (mediaUrl.includes("api.twilio.com")) {
      const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
      const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();

      if (accountSid && authToken) {
        headers["Authorization"] = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      }
    }

    const response = await fetch(mediaUrl, { headers });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch media (status: ${response.status})` },
        { status: response.status }
      );
    }

    const blob = await response.blob();
    const contentType =
      response.headers.get("content-type") ||
      (mediaUrl.toLowerCase().includes(".pdf") ? "application/pdf" : "image/jpeg");

    return new Response(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline", // Allows PDFs to render directly inside the preview iframe
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
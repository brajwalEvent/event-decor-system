import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: response.status });
    }

    const blob = await response.blob();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new Response(blob, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
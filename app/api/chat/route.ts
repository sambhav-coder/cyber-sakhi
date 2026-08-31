import { NextRequest, NextResponse } from "next/server";
import { generateSakhiResponse } from "@/lib/sakhiAI";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, language = "en" } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message field is required." },
        { status: 400 }
      );
    }

    const response = generateSakhiResponse(message, language);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Sakhi companion service error.", details: String(error) },
      { status: 500 }
    );
  }
}

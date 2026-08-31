import { NextRequest, NextResponse } from "next/server";
import { analyzeMessage } from "@/lib/threatEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text field is required and must be a string." },
        { status: 400 }
      );
    }

    const result = analyzeMessage(text);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal threat analysis failed.", details: String(error) },
      { status: 500 }
    );
  }
}

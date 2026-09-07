import { NextRequest, NextResponse } from "next/server";
import { analyzeEmail } from "@/lib/emailForensics";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawEmail } = body;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "rawEmail field is required and must be a string." },
        { status: 400 }
      );
    }

    const trimmed = rawEmail.trim();
    if (trimmed.length < 30) {
      return NextResponse.json(
        { error: "Input is too short. Please paste a complete email header or raw email source." },
        { status: 400 }
      );
    }

    const result = await analyzeEmail(trimmed);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Email forensics analysis failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

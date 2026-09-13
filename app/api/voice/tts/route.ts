import { NextRequest, NextResponse } from "next/server";
import { synthesizeWithEdgeTTS, type EdgeVoiceLanguage } from "@/lib/voice/edgeTts";

const MARKDOWN_STRIP = /[*_`#>|~]/g;
const CONTROL_STRIP = /[\u0000-\u001f\u007f]/g;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const rawText =
      typeof body.text === "string" ? body.text.slice(0, 2000) : "";

    const text = rawText
      .replace(MARKDOWN_STRIP, "")
      .replace(CONTROL_STRIP, "")
      .replace(/\n{2,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!text) {
      return NextResponse.json(
        { available: false, code: "tts_no_text", note: "No text provided." },
        { status: 400 }
      );
    }

    const language: EdgeVoiceLanguage =
      body.language === "hi" || body.language === "hinglish"
        ? body.language
        : "en";

    const audio = await synthesizeWithEdgeTTS(text, language);

    return NextResponse.json({
      available: true,
      audioB64: audio.buffer.toString("base64"),
      mimeType: audio.mimeType,
      voice: audio.voice,
      language,
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        code: "tts_error",
        note:
          error instanceof Error
            ? error.message
            : "Speech synthesis failed.",
      },
      { status: 500 }
    );
  }
}

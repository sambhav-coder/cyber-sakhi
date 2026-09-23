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
      console.error("[TTS API] No text provided");
      return NextResponse.json(
        { available: false, code: "tts_no_text", note: "No text provided." },
        { status: 400 }
      );
    }

    const language: EdgeVoiceLanguage =
      body.language === "hi" || body.language === "hinglish"
        ? body.language
        : "en";

    // DETERMINISTIC TEST MODE DIAGNOSTICS
    const testMode = process.env.SAKHI_TEST_MODE === 'edge-tts-only';
    console.log("🧪 [TTS API] ENGINE DIAGNOSTICS:", {
      TTS_ENGINE: "edge-tts",
      TTS_LANGUAGE: language,
      TTS_TEXT_LENGTH: text.length,
      TEST_MODE: testMode ? "edge-tts-only" : "normal",
      ENVIRONMENT: process.env.VERCEL ? "vercel-production" : "local-development"
    });

    console.log("[TTS API] Synthesizing:", { language, textLength: text.length });

    const audio = await synthesizeWithEdgeTTS(text, language);

    console.log("🧪 [TTS API] SYNTHESIS RESULT:", {
      TTS_ENGINE: "edge-tts",
      TTS_VOICE: audio.voice,
      TTS_BUFFER_SIZE: audio.buffer.length,
      TTS_MIME_TYPE: audio.mimeType,
      SUCCESS: true
    });

    return NextResponse.json({
      available: true,
      audioB64: audio.buffer.toString("base64"),
      mimeType: audio.mimeType,
      voice: audio.voice,
      language,
      words: audio.words || [],
    });
  } catch (error) {
    console.error("🧪 [TTS API] SYNTHESIS FAILED:", {
      TTS_ENGINE: "edge-tts",
      ERROR: error instanceof Error ? error.message : "Unknown error",
      SUCCESS: false
    });
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

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getTtsSlotStatus } from "@/lib/voice/serverConfig";

/**
 * POST /api/voice/tts — server speech slot.
 *
 * Only active when SAKHI_TTS_PROVIDER + SAKHI_TTS_ENDPOINT + SAKHI_TTS_API_KEY
 * are set AND the backend answers. Otherwise it honestly returns 501 — the
 * companion falls back to on-device browser voice. API keys never reach the
 * browser.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const slot = getTtsSlotStatus();
    if (!slot.available) {
      return NextResponse.json(
        { available: false, code: "tts_unconfigured", note: slot.note },
        { status: 501 }
      );
    }

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
    if (!text) {
      return NextResponse.json(
        { available: false, code: "tts_no_text", note: "No text provided." },
        { status: 400 }
      );
    }

    const language = body.language === "hi" ? "hi-IN" : "en-IN";
    const endpoint = process.env.SAKHI_TTS_ENDPOINT!.trim();
    const apiKey = process.env.SAKHI_TTS_API_KEY!.trim();

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, language, voice: language }),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { available: false, code: "tts_upstream_error", note: `Speech backend returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const ct = upstream.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    return NextResponse.json({
      audioB64: audioBuffer.toString("base64"),
      mimeType: ct,
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        code: "tts_error",
        note: error instanceof Error ? error.message : "Speech synthesis failed.",
      },
      { status: 500 }
    );
  }
}
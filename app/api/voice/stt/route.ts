import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSttSlotStatus } from "@/lib/voice/serverConfig";
import { localSttAvailable, localSttTranscribe } from "@/lib/voice/localPiper";

/**
 * POST /api/voice/stt — server transcription slot.
 *
 * Order of preference (mirrors the TTS route):
 *   1. LOCAL — off-line Vosk on the warm voice sidecar. Free, private, no
 *      cloud, no Gemini. Audio is PCM16 ~16 kHz mono WAV (JSON `audioB64`) or
 *      a multipart `audio` file.
 *   2. UPSTREAM — only when SAKHI_STT_PROVIDER + SAKHI_STT_ENDPOINT +
 *      SAKHI_STT_API_KEY are explicitly configured.
 *   3. Otherwise an honest 501; the client falls back to browser speech or
 *      typing. API keys never reach the browser.
 *
 * No Gemini is ever used for speech-to-text (product policy).
 */
export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let audioB64 = "";
    let language = "auto";

    if (ct.includes("application/json")) {
      const body = await req.json();
      audioB64 = String(body?.audioB64 || "");
      language = String(body?.language || "auto").toLowerCase();
    } else {
      const formData = await req.formData();
      const audio = formData.get("audio");
      if (!audio || typeof audio === "string") {
        return NextResponse.json(
          { available: false, code: "stt_no_audio", note: "No audio file provided." },
          { status: 400 }
        );
      }
      audioB64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    }

    if (!audioB64) {
      return NextResponse.json(
        { available: false, code: "stt_no_audio", note: "No audio payload provided." },
        { status: 400 }
      );
    }

    // 1) Local off-line Vosk first.
    const local = localSttAvailable();
    if (local) {
      const result = await localSttTranscribe(audioB64, language);
      if (result && result.text) {
        return NextResponse.json({
          transcript: result.text,
          source: "local",
          model: result.model,
          language,
          stt_ms: result.sttMs,
        });
      }
      if (result) {
        // Sidecar answered but heard nothing — not an infra error.
        return NextResponse.json({
          transcript: "",
          source: "local",
          model: result.model,
          language,
          stt_ms: result.sttMs,
        });
      }
      return NextResponse.json(
        {
          available: false,
          code: "stt_local_error",
          note: "The local speech engine could not transcribe this audio.",
        },
        { status: 502 }
      );
    }

    // 2) Optional explicit upstream slot.
    const slot = getSttSlotStatus();
    if (slot.available && process.env.SAKHI_STT_ENDPOINT && process.env.SAKHI_STT_API_KEY) {
      const endpoint = process.env.SAKHI_STT_ENDPOINT.trim();
      const apiKey = process.env.SAKHI_STT_API_KEY.trim();
      const buffer = Buffer.from(audioB64, "base64");
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "audio/wav",
        },
        body: buffer,
      });

      if (!upstream.ok) {
        return NextResponse.json(
          {
            available: false,
            code: "stt_upstream_error",
            note: `Transcription backend returned HTTP ${upstream.status}.`,
          },
          { status: 502 }
        );
      }

      const uct = upstream.headers.get("content-type") || "";
      let transcript = "";
      if (uct.includes("application/json")) {
        const json = await upstream.json();
        transcript =
          json?.transcript || json?.text || json?.result || json?.transcription || "";
      } else {
        transcript = (await upstream.text()).trim();
      }

      if (!transcript) {
        return NextResponse.json(
          {
            available: false,
            code: "stt_empty",
            note: "The transcription backend returned no text.",
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ transcript, source: "upstream" });
    }

    // 3) Honest 501.
    return NextResponse.json(
      { available: false, code: "stt_unconfigured", note: slot.note },
      { status: 501 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        code: "stt_error",
        note: error instanceof Error ? error.message : "Transcription failed.",
      },
      { status: 500 }
    );
  }
}
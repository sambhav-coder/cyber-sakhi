import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSttSlotStatus } from "@/lib/voice/serverConfig";

/**
 * POST /api/voice/stt — server transcription slot.
 *
 * Only active when SAKHI_STT_PROVIDER + SAKHI_STT_ENDPOINT + SAKHI_STT_API_KEY
 * are set AND the backend answers. Otherwise it honestly returns 501 — the
 * companion falls back to on-device browser speech. API keys never reach the
 * browser.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const slot = getSttSlotStatus();
    if (!slot.available) {
      return NextResponse.json(
        { available: false, code: "stt_unconfigured", note: slot.note },
        { status: 501 }
      );
    }

    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!audio || typeof audio === "string") {
      return NextResponse.json(
        { available: false, code: "stt_no_audio", note: "No audio file provided." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const endpoint = process.env.SAKHI_STT_ENDPOINT!.trim();
    const apiKey = process.env.SAKHI_STT_API_KEY!.trim();

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: buffer,
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { available: false, code: "stt_upstream_error", note: `Transcription backend returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const ct = upstream.headers.get("content-type") || "";
    let transcript = "";
    if (ct.includes("application/json")) {
      const json = await upstream.json();
      transcript =
        json?.transcript || json?.text || json?.result || json?.transcription || "";
    } else {
      transcript = (await upstream.text()).trim();
    }

    if (!transcript) {
      return NextResponse.json(
        { available: false, code: "stt_empty", note: "The transcription backend returned no text." },
        { status: 502 }
      );
    }

    return NextResponse.json({ transcript });
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
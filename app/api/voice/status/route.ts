import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSttSlotStatus, getTtsSlotStatus } from "@/lib/voice/serverConfig";

/**
 * GET /api/voice/status — authenticates and reports honest voice capability.
 * The client merges this with its own on-device browser probes.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const stt = getSttSlotStatus();
    const tts = getTtsSlotStatus();

    return NextResponse.json({
      stt: {
        provider: stt.provider,
        available: stt.available,
        note: stt.note,
      },
      tts: {
        provider: tts.provider,
        available: tts.available,
        note: tts.note,
      },
      consent: {
        required: true,
        perSession: true,
        neverPassiveRecording: true,
        prompt:
          "Voice Mode needs your explicit per-session consent. No audio is recorded or uploaded silently.",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Voice status service error." },
      { status: 500 }
    );
  }
}
import { EdgeTTS } from "node-edge-tts";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export type EdgeVoiceLanguage = "en" | "hi" | "hinglish";

const VOICE_BY_LANGUAGE: Record<EdgeVoiceLanguage, { voice: string; lang: string }> = {
  en: { voice: "en-IN-NeerjaNeural", lang: "en-IN" },
  hi: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
  hinglish: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
};

export async function synthesizeWithEdgeTTS(
  text: string,
  language: EdgeVoiceLanguage
): Promise<{ buffer: Buffer; mimeType: string; voice: string }> {
  const cfg = VOICE_BY_LANGUAGE[language];
  const outputPath = path.join(
    os.tmpdir(),
    `sakhi-edge-${crypto.randomUUID()}.mp3`
  );

  try {
    const tts = new EdgeTTS({
      voice: cfg.voice,
      lang: cfg.lang,
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      timeout: 30000,
    });

    await tts.ttsPromise(text, outputPath);

    const buffer = await fs.readFile(outputPath);

    if (!buffer.length) {
      throw new Error("Edge TTS returned empty audio.");
    }

    return {
      buffer,
      mimeType: "audio/mpeg",
      voice: cfg.voice,
    };
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
  }
}

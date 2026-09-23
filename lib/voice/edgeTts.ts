import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export type EdgeVoiceLanguage = "en" | "hi" | "hinglish";

export const VOICE_BY_LANGUAGE: Record<EdgeVoiceLanguage, { voice: string; lang: string }> = {
  en: { voice: "en-IN-NeerjaNeural", lang: "en-IN" },
  hi: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
  hinglish: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
};

export interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

export async function synthesizeWithEdgeTTS(
  text: string,
  language: EdgeVoiceLanguage
): Promise<{ buffer: Buffer; mimeType: string; voice: string; words: WordTimestamp[] }> {
  const cfg = VOICE_BY_LANGUAGE[language];

  // Use Vercel-compatible temp directory
  // In Vercel serverless, /tmp is writable and cleaned between invocations
  const tempDir = process.env.VERCEL ? "/tmp" : os.tmpdir();
  const outputPath = path.join(
    tempDir,
    `sakhi-edge-${crypto.randomUUID()}.mp3`
  );
  const subPath = `${outputPath}.json`;

  try {
    // ws's optional native acceleration (bufferutil) is not installed. When
    // Next.js bundles ws it resolves that optional dep to an empty object, so
    // ws calls bufferUtil.mask() on client frames >= 48 bytes and crashes with
    // "bufferUtil.mask is not a function". Force the pure-JS masking path by
    // flagging ws BEFORE the module graph loads, regardless of bundling.
    process.env.WS_NO_BUFFER_UTIL = "1";
    const { EdgeTTS } = await import("node-edge-tts");
    const tts = new EdgeTTS({
      voice: cfg.voice,
      lang: cfg.lang,
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      saveSubtitles: true,
      timeout: 30000,
    });

    console.log("[EdgeTTS] Writing to temp file:", outputPath);

    await tts.ttsPromise(text, outputPath);

    const buffer = await fs.readFile(outputPath);

    if (!buffer.length) {
      throw new Error("Edge TTS returned empty audio.");
    }

    let words: WordTimestamp[] = [];
    try {
      const subExists = await fs.stat(subPath).then(() => true).catch(() => false);
      if (subExists) {
        const subRaw = await fs.readFile(subPath, "utf8");
        const cues = JSON.parse(subRaw);
        if (Array.isArray(cues)) {
          words = cues
            .map((c: any) => ({
              text: String(c.part || "").trim(),
              startMs: Math.round(Number(c.start) || 0),
              endMs: Math.round(Number(c.end) || 0),
            }))
            .filter((w) => w.text.length > 0 && w.endMs >= w.startMs);
        }
      }
    } catch (subErr) {
      console.warn("[EdgeTTS] Failed to parse subtitle cues:", subErr);
    }

    console.log("[EdgeTTS] Synthesis successful:", { 
      bufferSize: buffer.length, 
      voice: cfg.voice,
      wordCount: words.length
    });

    return {
      buffer,
      mimeType: "audio/mpeg",
      voice: cfg.voice,
      words,
    };
  } catch (error) {
    console.error("[EdgeTTS] Synthesis failed:", error);
    throw new Error(
      `Edge TTS synthesis failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  } finally {
    // Clean up temp files
    await fs.unlink(outputPath).catch(() => undefined);
    await fs.unlink(subPath).catch(() => undefined);
  }
}

import { describe, expect, it } from "vitest";
import { synthesizeWithEdgeTTS, VOICE_BY_LANGUAGE } from "../../lib/voice/edgeTts";

describe("Edge TTS Word-Synchronized Timing", () => {
  it("maintains the exact original voices without changes", () => {
    expect(VOICE_BY_LANGUAGE.en.voice).toBe("en-IN-NeerjaNeural");
    expect(VOICE_BY_LANGUAGE.hi.voice).toBe("hi-IN-SwaraNeural");
    expect(VOICE_BY_LANGUAGE.hinglish.voice).toBe("hi-IN-SwaraNeural");
  });

  it("synthesizes speech and extracts exact word boundary timestamps for English", async () => {
    const text = "Hello Officer Sakhi";
    const result = await synthesizeWithEdgeTTS(text, "en");

    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.voice).toBe("en-IN-NeerjaNeural");

    expect(result.words).toBeDefined();
    expect(Array.isArray(result.words)).toBe(true);
    expect(result.words.length).toBeGreaterThanOrEqual(2);

    for (const w of result.words) {
      expect(w.text).toBeTruthy();
      expect(w.startMs).toBeGreaterThanOrEqual(0);
      expect(w.endMs).toBeGreaterThan(w.startMs);
    }
  }, 20000);

  it("synthesizes speech and extracts exact word boundary timestamps for Hindi", async () => {
    const text = "नमस्ते मैं सखी हूँ";
    const result = await synthesizeWithEdgeTTS(text, "hi");

    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.voice).toBe("hi-IN-SwaraNeural");

    expect(result.words).toBeDefined();
    expect(Array.isArray(result.words)).toBe(true);
    expect(result.words.length).toBeGreaterThanOrEqual(2);
  }, 20000);
});

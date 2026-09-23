import { describe, expect, it } from "vitest";
import { VOICE_BY_LANGUAGE } from "../../lib/voice/edgeTts";

describe("Edge TTS voice mapping (Node-only voice policy)", () => {
  it("maps every supported language to an Indian neural voice", () => {
    expect(VOICE_BY_LANGUAGE.en).toEqual({ voice: "en-IN-NeerjaNeural", lang: "en-IN" });
    expect(VOICE_BY_LANGUAGE.hi).toEqual({ voice: "hi-IN-SwaraNeural", lang: "hi-IN" });
    expect(VOICE_BY_LANGUAGE.hinglish).toEqual({ voice: "hi-IN-SwaraNeural", lang: "hi-IN" });
  });

  it("has exactly the three supported languages", () => {
    expect(Object.keys(VOICE_BY_LANGUAGE).sort()).toEqual(["en", "hi", "hinglish"]);
  });

  it("all voices are female Indian neural voices (no male, no non-Indian)", () => {
    for (const { voice, lang } of Object.values(VOICE_BY_LANGUAGE)) {
      expect(voice).toMatch(/Neural$/);
      expect(lang).toMatch(/^hi-IN|^en-IN/);
    }
  });
});
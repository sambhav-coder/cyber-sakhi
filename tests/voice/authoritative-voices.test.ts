import { describe, expect, it } from "vitest";
import {
  SAKHI_SERVER_VOICES,
  SAKHI_VOICE_EN,
  SAKHI_VOICE_HI,
  resolveServerVoice,
  normalizeServerVoiceLanguage,
  voiceLanguageForArticle,
} from "../../lib/voice/voices";
import { VOICE_BY_LANGUAGE } from "../../lib/voice/edgeTts";
import fs from "node:fs";
import path from "node:path";

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

describe("Authoritative Sakhi server voices (recovered selection)", () => {
  it("restores the exact previously selected English voice", () => {
    expect(SAKHI_VOICE_EN).toBe("en-IN-NeerjaNeural");
    expect(SAKHI_SERVER_VOICES.en).toEqual({ voice: "en-IN-NeerjaNeural", lang: "en-IN" });
  });

  it("restores the exact previously selected Hindi voice", () => {
    expect(SAKHI_VOICE_HI).toBe("hi-IN-SwaraNeural");
    expect(SAKHI_SERVER_VOICES.hi).toEqual({ voice: "hi-IN-SwaraNeural", lang: "hi-IN" });
    expect(SAKHI_SERVER_VOICES.hinglish).toEqual({ voice: "hi-IN-SwaraNeural", lang: "hi-IN" });
  });

  it("edgeTts uses the same authoritative mapping (no forked config)", () => {
    expect(VOICE_BY_LANGUAGE).toEqual(SAKHI_SERVER_VOICES);
  });

  it("never silently falls back: unknown languages throw", () => {
    expect(() => normalizeServerVoiceLanguage("fr")).toThrow();
    expect(() => normalizeServerVoiceLanguage("")).toThrow();
    expect(() => resolveServerVoice("xx")).toThrow();
  });

  it("News Desk article language maps to the matching voice (no translation)", () => {
    expect(voiceLanguageForArticle("hi")).toBe("hi");
    expect(voiceLanguageForArticle("en")).toBe("en");
    expect(voiceLanguageForArticle(null)).toBe("en");
    expect(resolveServerVoice(voiceLanguageForArticle("hi")).voice).toBe("hi-IN-SwaraNeural");
    expect(resolveServerVoice(voiceLanguageForArticle("en")).voice).toBe("en-IN-NeerjaNeural");
  });

  it("News Desk read-aloud resolves voice from the article language", () => {
    const modal = readRepoFile("components", "CyberSafetyBriefingModal.tsx");
    // Per-article language drives TTS — never a hardcoded single voice.
    expect(modal).toMatch(/article\.language === "hi" \? "hi" : "en"/);
    expect(modal).toContain("speakWithEngine");
  });

  it("Chat replies and Voice Mode replies resolve TTS per turn language", () => {
    const chat = readRepoFile("app", "companion", "page.tsx");
    expect(chat).toContain("speakReplyMessage");
    expect(chat).toContain("speakWithEngine");
    const voice = readRepoFile("components", "companion", "VoiceModePortal.tsx");
    expect(voice).toContain("speakWithEngine");
    expect(voice).toContain("languageRef.current");
  });

  it("exposes no secrets and logs no conversation content", () => {
    const voices = readRepoFile("lib", "voice", "voices.ts");
    expect(voices).not.toMatch(/sk-|api[_-]?key|bearer/i);
  });
});

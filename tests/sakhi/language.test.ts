import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  explicitLanguageRequest,
  normalizeLanguage,
  SAKHI_SUPPORTED_LANGUAGES,
} from "../../lib/sakhiAI";

describe("detectLanguage — per-message, no session lock", () => {
  it("detects Devanagari as Hindi", () => {
    expect(detectLanguage("मैं ठीक हूँ")).toBe("hi");
    expect(detectLanguage("साइबर क्राइम रिपोर्ट करना है")).toBe("hi");
  });

  it("detects English small talk as English even with Hindi context", () => {
    expect(detectLanguage("Hi")).toBe("en");
    expect(detectLanguage("hello, how are you?")).toBe("en");
    expect(detectLanguage("ok")).toBe("en");
  });

  it("detects roman-script Hinglish markers", () => {
    expect(detectLanguage("mujhe kya karna chahiye")).toBe("hinglish");
    expect(detectLanguage("mujhe scam lag raha hai")).toBe("hinglish");
  });

  it("falls back to English for plain Latin-script text", () => {
    expect(detectLanguage("what should I do now")).toBe("en");
  });
});

describe("explicitLanguageRequest — explicit override wins", () => {
  it("returns hi for 'in Hindi'", () => {
    expect(explicitLanguageRequest("tell me in Hindi")).toBe("hi");
    expect(explicitLanguageRequest("hindi में batao")).toBe("hi");
  });

  it("returns hinglish for 'in hinglish'", () => {
    expect(explicitLanguageRequest("speak hinglish please")).toBe("hinglish");
  });

  it("returns null when no explicit request", () => {
    expect(explicitLanguageRequest("my account got hacked")).toBeNull();
  });
});

describe("normalizeLanguage", () => {
  it("normalizes valid and invalid languages", () => {
    expect(normalizeLanguage("hi")).toBe("hi");
    expect(normalizeLanguage("hinglish")).toBe("hinglish");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  it("exposes exactly the supported languages", () => {
    expect(SAKHI_SUPPORTED_LANGUAGES).toEqual(["en", "hi", "hinglish"]);
  });
});
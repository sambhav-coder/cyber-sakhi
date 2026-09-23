import { describe, expect, it } from "vitest";
import { hinglishToDevanagari, prepForHindiSpeech } from "../../lib/voice/translit";

describe("hinglishToDevanagari", () => {
  it("converts known Hinglish cyber vocabulary", () => {
    expect(hinglishToDevanagari("cybercrime report")).toContain("साइबरक्राइम");
    expect(hinglishToDevanagari("phishing email")).toContain("फ़िशिंग");
    expect(hinglishToDevanagari("bank account")).toContain("बैंक");
    expect(hinglishToDevanagari("bank account")).toContain("अकाउंट");
  });

  it("maps common Hinglish function words", () => {
    const out = hinglishToDevanagari("main theek hoon");
    expect(out).toBe("मैं ठीक हूँ");
    expect(hinglishToDevanagari("mujhe kya karna chahiye")).toContain("चाहिए");
  });

  it("passes Devanagari through unchanged (identity)", () => {
    expect(hinglishToDevanagari("मेरा अकाउंट हैक हो गया")).toBe("मेरा अकाउंट हैक हो गया");
  });

  it("leaves unknown latin words as a fluent close approximation, never drops text", () => {
    const out = hinglishToDevanagari("maine apna password kisi ko nahi bataya");
    expect(out).toContain("पासवर्ड");
    expect(out.length).toBeGreaterThan(5);
  });
});

describe("prepForHindiSpeech", () => {
  it("produces non-empty Devanagari-ready text", () => {
    const out = prepForHindiSpeech("mujhe fraud ka shak hai, kya karna chahiye");
    expect(out.length).toBeGreaterThan(5);
  });
});
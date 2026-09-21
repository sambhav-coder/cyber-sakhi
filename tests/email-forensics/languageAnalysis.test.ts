import { describe, expect, it } from "vitest";
import { analyzeLanguage } from "../../lib/languageAnalysis";

describe("analyzeLanguage — descriptive supporting signal only", () => {
  it("identifies the Devanagari script without asserting identity or intent", () => {
    const r = analyzeLanguage(
      "नमस्ते",
      "आपका खाता ब्लॉक हो गया है, तुरंत सत्यापन करें"
    );
    expect(r.script).toContain("Devanagari");
    expect(r.supporting).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.caveat.toLowerCase()).toContain("never implies");
  });

  it("returns the safe Unknown fallback for empty input", () => {
    const r = analyzeLanguage(undefined, null);
    expect(r.script).toBe("Unknown");
    expect(r.confidence).toBe("low");
    expect(r.supporting).toBe(true);
    expect(r.hints[0].toLowerCase()).toContain("no analyzable text");
  });

  it("classifies plain ASCII text as Latin", () => {
    const r = analyzeLanguage("Hi", "Your OTP is 123456");
    expect(r.script).toBe("Latin");
    expect(r.confidence).toBe("high");
  });

  it("never uses language as a threat verdict", () => {
    const r = analyzeLanguage("आपका खाता ब्लॉक हो गया है", null);
    expect(("verdict" in r)).toBe(false);
    expect(r.supporting).toBe(true);
  });
});
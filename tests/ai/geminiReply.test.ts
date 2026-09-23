import { describe, expect, it } from "vitest";
import {
  geminiReplyToSpec,
  base64ByteLength,
  sanitizeImages,
} from "../../lib/ai/gemini";

describe("geminiReplyToSpec — parse-time security allowlists", () => {
  it("coerces an unknown category to general", () => {
    const spec = geminiReplyToSpec({
      text: "ok",
      language: "en",
      category: "injection",
      confidence: "high",
      uses: [],
      quickActions: [],
    });
    expect(spec.category).toBe("general");
    expect(spec.language).toBe("en");
  });

  it("keeps valid categories but drops the rest", () => {
    for (const cat of ["emergency", "legal", "evidence", "emotional", "scam", "general", "education"]) {
      expect(geminiReplyToSpec({ text: "x", language: "en", category: cat }).category).toBe(cat);
    }
  });

  it("only allows whitelisted quick actions (within the 3-action window)", () => {
    const spec = geminiReplyToSpec({
      text: "do this",
      language: "en",
      category: "general",
      confidence: "medium",
      quickActions: [
        { label: "Dial 112", actionType: "DIAL_112" },
        { label: "Evil action", actionType: "DROP_TABLES" },
        { label: "Cyber portal", actionType: "OPEN_CYBERCRIME_PORTAL" },
        { label: "Cosplay", actionType: "SELF_DESTRUCT" },
      ],
    });
    expect(spec.quickActions.map((a) => a.actionType)).toEqual([
      "DIAL_112",
      "OPEN_CYBERCRIME_PORTAL",
    ]);
  });

  it("accepts only string entries in uses and caps at 8", () => {
    const spec = geminiReplyToSpec({
      text: "x",
      language: "en",
      category: "general",
      uses: ["1930", 42, { evil: true }, "evidence", "a", "b", "c", "d", "e", "f", "g"],
    });
    expect(spec.uses.every((u) => typeof u === "string")).toBe(true);
    expect(spec.uses.length).toBeLessThanOrEqual(8);
  });

  it("coerces language to a known SakhiLanguage", () => {
    expect(geminiReplyToSpec({ text: "x", language: "hi" }).language).toBe("hi");
    expect(geminiReplyToSpec({ text: "x", language: "hinglish" }).language).toBe("hinglish");
    expect(geminiReplyToSpec({ text: "x", language: "french" }).language).toBe("en");
  });

  it("throws on a model-emitted raw string or empty reply", () => {
    expect(() => geminiReplyToSpec("just a string")).toThrow();
  });

  it("truncates the reply to the max length", () => {
    const spec = geminiReplyToSpec({ text: "x".repeat(10000), language: "en", category: "general" });
    expect(spec.text.length).toBeLessThanOrEqual(4200);
  });
});

describe("base64ByteLength + sanitizeImages", () => {
  it("estimates base64 decoded bytes correctly", () => {
    // "abc" -> YWJj, no padding
    expect(base64ByteLength("YWJj")).toBe(3);
    // "ab" -> YWI=
    expect(base64ByteLength("YWI=")).toBe(2);
    expect(base64ByteLength("")).toBe(0);
  });

  it("sanitizeImages drops bad mime types and oversized images", () => {
    const bad = sanitizeImages([{ name: "x", mimeType: "text/html", dataBase64: "YWJj" }]);
    expect(bad).toHaveLength(0);
  });
});
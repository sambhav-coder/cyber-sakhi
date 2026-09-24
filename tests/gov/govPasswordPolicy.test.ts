import { describe, expect, it } from "vitest";
import { evaluateGovPassword } from "../../lib/gov/govPasswordPolicy";

describe("evaluateGovPassword", () => {
  it("accepts a strong password", () => {
    expect(evaluateGovPassword("Tranquil-River-88!Mango").ok).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = evaluateGovPassword("Sh0rt!xY");
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/12/);
  });

  it("requires three of four character classes", () => {
    expect(evaluateGovPassword("alllowercaseletters").ok).toBe(false);
    expect(evaluateGovPassword("ALLUPPERCASELETTERS1").ok).toBe(false);
    expect(evaluateGovPassword("ALLUPPERCASELETTERS1!").ok).toBe(true);
  });

  it("rejects guessable words and repeated characters", () => {
    expect(evaluateGovPassword("MyPassword-1234!").ok).toBe(false);
    expect(evaluateGovPassword("CyberSakhi-99!q").ok).toBe(false);
    expect(evaluateGovPassword("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("rejects overlong input", () => {
    expect(evaluateGovPassword(`A1!${"x".repeat(260)}`).ok).toBe(false);
  });
});

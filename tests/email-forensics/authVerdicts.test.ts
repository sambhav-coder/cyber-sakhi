import { describe, expect, it } from "vitest";
import { authVerdictPresentation } from "../../lib/riskAssessments";
import {
  parseAuthStatus,
  parseAuthentication,
} from "../../lib/emailForensics";

describe("parseAuthStatus — precise raw-token preservation", () => {
  it("keeps the normalized status stable while preserving softfail", () => {
    const r = parseAuthStatus("spf=softfail (domain owner discourages use of this host)", "spf");
    expect(r.status).toBe("neutral");
    expect(r.rawStatus).toBe("softfail");
  });

  it("preserves temperror as a temporary technical error", () => {
    const r = parseAuthStatus("dkim=temperror (no key for signature)", "dkim");
    expect(r.status).toBe("neutral");
    expect(r.rawStatus).toBe("temperror");
  });

  it("maps permerror onto fail while keeping its identity", () => {
    const r = parseAuthStatus("dmarc=permerror (invalid policy)", "dmarc");
    expect(r.status).toBe("fail");
    expect(r.rawStatus).toBe("permerror");
  });

  it("extracts scope details from a realistic header", () => {
    const authResults =
      "mx.victim.example;\n" +
      " spf=pass (google.com: domain of user@gmail.com designates 209.85.220.41 as permitted sender) smtp.mailfrom=user@gmail.com;\n" +
      " dkim=pass header.i=@google.com selector=20210112 header.b=AbCd;\n" +
      " dmarc=pass (p=REJECT sp=REJECT) header.from=gmail.com";
    const parsed = parseAuthentication(authResults);
    expect(parsed.spf.status).toBe("pass");
    expect(parsed.spf.rawStatus).toBe("pass");
    expect(parsed.spf.scope?.mailfrom).toBe("user@gmail.com");
    expect(parsed.dkim.scope?.selector).toBe("20210112");
    expect(parsed.dmarc.scope?.disposition).toBeUndefined();
  });

  it("returns none when the header is absent", () => {
    const parsed = parseAuthentication(undefined);
    expect(parsed.spf.status).toBe("none");
    expect(parsed.spf.rawStatus).toBeUndefined();
  });
});

describe("authVerdictPresentation — honest, non-fabricated labels", () => {
  const cases: Array<[string | undefined, string, string]> = [
    ["pass", "Verified Pass", "pass"],
    ["fail", "Suspicious Signal", "fail"],
    ["softfail", "Soft Fail", "warn"],
    ["temperror", "Temporary Error", "unknown"],
    ["permerror", "Permanent Error", "warn"],
    ["neutral", "Elevated Concern", "warn"],
    ["none", "Insufficient Evidence", "neutral"],
    [undefined, "Validation Unavailable", "unknown"],
  ];

  it.each(cases)("status %s -> label %s (tone %s)", (status, label, tone) => {
    const p = authVerdictPresentation(status);
    expect(p.label).toBe(label);
    expect(p.tone).toBe(tone);
    expect(p.explanation.length).toBeGreaterThan(0);
  });

  it("never implies a passed result is a clean bill of health", () => {
    const p = authVerdictPresentation("pass");
    expect(p.explanation.toLowerCase()).toContain("does not make the message content trustworthy");
  });

  it("never frames a temporary error as a verdict", () => {
    const p = authVerdictPresentation("temperror");
    expect(p.explanation.toLowerCase()).toContain("no verdict was reached");
  });
});
import { describe, expect, it } from "vitest";
import type { EmailAuthentication } from "../../lib/emailTypes";
import {
  assessContentRisk,
  assessOverall,
  assessSenderRisk,
  riskLevelForScore,
} from "../../lib/riskAssessments";

function auth(over: Partial<EmailAuthentication> = {}): EmailAuthentication {
  return {
    spf: { status: "pass" },
    dkim: { status: "pass" },
    dmarc: { status: "pass" },
    ...over,
  };
}

describe("risk dimension separation", () => {
  it("flags sender risk HIGH when authentication fails but keeps content risk SAFE", () => {
    const sender = assessSenderRisk({
      authentication: auth({ spf: { status: "fail" }, dkim: { status: "fail" }, dmarc: { status: "fail" } }),
      hasOriginatingIp: true,
    });
    const content = assessContentRisk({
      nlpScore: 0,
      nlpTriggers: [],
    });

    expect(sender.level).toBe("CRITICAL");
    expect(sender.signals.some((s) => s.id === "auth")).toBe(true);
    expect(content.level).toBe("SAFE");
  });

  it("flags content risk HIGH for manipulation language while sender stays SAFE", () => {
    const sender = assessSenderRisk({
      authentication: auth(),
      hasOriginatingIp: true,
    });
    const content = assessContentRisk({
      nlpScore: 100,
      nlpTriggers: ["urgent", "verify your password", "account suspended"],
      ml: { available: true, label: "phishing", confidence: 0.9 },
      mlPoints: 30,
      becDetected: true,
      becScore: 100,
    });

    expect(sender.level).toBe("SAFE");
    expect(content.level).not.toBe("SAFE");
    expect(
      content.signals.some((s) => s.label.includes("manipulation language"))
    ).toBe(true);
  });

  it("surfaces attachment and URL signals only on the content dimension", () => {
    const content = assessContentRisk({
      urlRisk: [
        { url: "http://bit.ly/abc123", flags: ["shortener"], severity: "HIGH", confidence: 0.9, evidence: "shortener" },
      ],
      suspiciousAttachments: [
        {
          filename: "invoice.pdf.exe",
          extension: "exe",
          doubleExtension: true,
          executable: true,
          scriptLike: false,
          archive: false,
          macroHint: false,
          suspicious: true,
        },
      ],
    });
    expect(content.signals.some((s) => s.id === "url")).toBe(true);
    expect(content.signals.some((s) => s.id === "attachment")).toBe(true);
  });

  it("does not draw content conclusions from a clean message", () => {
    const content = assessContentRisk({});
    expect(content.level).toBe("SAFE");
    expect(content.confidence).toBe(0);
  });
});

describe("assessOverall (backward-compatible aggregation)", () => {
  it("preserves the legacy threat level while combining sender + content weights", () => {
    const sender = assessSenderRisk({
      authentication: auth(),
      hasOriginatingIp: true,
    });
    const content = assessContentRisk({
      nlpScore: 90,
      nlpTriggers: ["final notice"],
      ml: { available: true, label: "phishing", confidence: 0.8 },
      mlPoints: 30,
    });
    const overall = assessOverall(sender, content, 60, "HIGH");
    expect(overall.level).toBe("HIGH");
    expect(overall.score).toBeGreaterThanOrEqual(60);
    expect(overall.score).toBeLessThanOrEqual(100);
  });

  it("returns SAFE level when everything is clean and legacy score is zero", () => {
    const sender = assessSenderRisk({ authentication: auth(), hasOriginatingIp: true });
    const content = assessContentRisk({});
    const overall = assessOverall(sender, content, 0, "SAFE");
    expect(overall.level).toBe("SAFE");
    expect(overall.score).toBe(0);
  });
});

describe("riskLevelForScore boundaries", () => {
  it("maps scores to the documented band boundaries", () => {
    expect(riskLevelForScore(0)).toBe("SAFE");
    expect(riskLevelForScore(1)).toBe("LOW");
    expect(riskLevelForScore(19)).toBe("LOW");
    expect(riskLevelForScore(20)).toBe("MEDIUM");
    expect(riskLevelForScore(39)).toBe("MEDIUM");
    expect(riskLevelForScore(40)).toBe("HIGH");
    expect(riskLevelForScore(64)).toBe("HIGH");
    expect(riskLevelForScore(65)).toBe("CRITICAL");
    expect(riskLevelForScore(100)).toBe("CRITICAL");
  });

  it("clamps out-of-range scores", () => {
    expect(riskLevelForScore(-5)).toBe("SAFE");
    expect(riskLevelForScore(1000)).toBe("CRITICAL");
  });
});
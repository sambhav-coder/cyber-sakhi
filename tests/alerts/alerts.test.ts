import { describe, expect, it } from "vitest";
import { generateAlerts } from "../../lib/alerts";
import type { EmailAnalysisResult } from "../../lib/emailTypes";

function fakeResult(over: Partial<EmailAnalysisResult> = {}): EmailAnalysisResult {
  return {
    id: "ef1",
    analyzedAt: new Date().toISOString(),
    headers: {
      from: "a@example.com", replyTo: "", returnPath: "", to: "v@example.org", subject: "Hi",
      date: "", messageId: "", authenticationResults: "", mimeVersion: "", contentType: "",
      userAgent: "", xMailer: "", xOriginatingIp: "", xMailFrom: "", xGmailReceived: "", rawHeaders: "",
    } as unknown as EmailAnalysisResult["headers"],
    authentication: { spf: { status: "pass" }, dkim: { status: "pass" }, dmarc: { status: "pass" } },
    senderDomain: "example.com",
    senderSpoofingDetected: false,
    spoofing: { detected: false, signals: [], lookalikeCandidates: [], brandsLikelyImpersonated: [] },
    smtpPath: [],
    smtpAnomalies: [],
    attachments: [],
    entities: [],
    indicators: [],
    threatLevel: "SAFE",
    threatScore: 0,
    findings: [],
    recommendations: [],
    ...over,
  } as EmailAnalysisResult;
}

const spoofingHit: EmailAnalysisResult["spoofing"] = {
  detected: true,
  score: 45,
  confidence: 0.8,
  signals: ["reply-to mismatch"],
  lookalikeDetected: false,
  lookalikeCandidates: [],
  punycodeDetected: false,
  homoglyphDetected: false,
  envelopeMismatchDetected: true,
  brandsLikelyImpersonated: [],
};

describe("generateAlerts", () => {
  it("emits nothing for a clean email below the policy threshold", () => {
    const alerts = generateAlerts(fakeResult());
    expect(alerts.length).toBe(0);
  });

  it("fires a CRITICAL alert for a high composite score", () => {
    const alerts = generateAlerts(fakeResult({ threatScore: 82, threatLevel: "CRITICAL" }));
    expect(alerts.some((a) => a.ruleId === "SC-02" && a.severity === "CRITICAL")).toBe(true);
  });

  it("alerts on spoofing detection", () => {
    const alerts = generateAlerts(
      fakeResult({
        spoofing: spoofingHit,
        threatScore: 45,
        threatLevel: "MEDIUM",
      })
    );
    expect(alerts.some((a) => a.ruleId === "SF-03")).toBe(true);
  });

  it("fires honeypot harassment alert even below score threshold", () => {
    const alerts = generateAlerts(
      fakeResult({ threatScore: 10, threatLevel: "LOW" }),
      { minScore: 40, capTo: 8 },
      { threatLevel: "CRITICAL", score: 90 }
    );
    expect(alerts.some((a) => a.ruleId === "HR-01" && a.severity === "CRITICAL")).toBe(true);
  });

  it("surfaces a BEC alert", () => {
    const alerts = generateAlerts(
      fakeResult({
        bec: { detected: true, score: 75, confidence: 0.8, patterns: [], summary: "BEC-like", caveat: "" },
        threatScore: 60,
        threatLevel: "HIGH",
      })
    );
    expect(alerts.some((a) => a.ruleId === "BC-06")).toBe(true);
  });

  it("emits ML alert only at high probability (>0.85)", () => {
    const ml = (confidence: number) =>
      fakeResult({
        ml: {
          available: true,
          label: "phishing",
          confidence,
          margin: confidence - 0.2,
          probabilities: { phishing: confidence, legitimate: 1 - confidence },
        },
        threatScore: 50,
        threatLevel: "HIGH",
      });
    expect(generateAlerts(ml(0.9)).some((a) => a.ruleId === "ML-07")).toBe(true);
    expect(generateAlerts(ml(0.6)).some((a) => a.ruleId === "ML-07")).toBe(false);
  });

  it("sorts by severity and respects the cap", () => {
    const alerts = generateAlerts(
      fakeResult({
        threatScore: 80,
        threatLevel: "CRITICAL",
        spoofing: { ...spoofingHit, signals: ["x"] },
        bec: { detected: true, score: 70, confidence: 0.7, patterns: [], summary: "", caveat: "" },
      }),
      { minScore: 40, capTo: 2 },
      { threatLevel: "CRITICAL" }
    );
    expect(alerts.length).toBeLessThanOrEqual(2);
    expect(alerts[0].severity).toBe("CRITICAL");
  });
});
import { describe, expect, it } from "vitest";
import { assessAttribution } from "../../lib/attribution";
import type { EmailAnalysisResult } from "../../lib/emailTypes";

function fakeResult(over: Partial<EmailAnalysisResult> = {}): EmailAnalysisResult {
  return {
    id: "ef1",
    analyzedAt: new Date().toISOString(),
    headers: {
      from: "chief@example.com",
      replyTo: "",
      returnPath: "",
      to: "v@example.org",
      subject: "Payment",
      date: "",
      messageId: "",
      authenticationResults: "",
      mimeVersion: "",
      contentType: "",
      userAgent: "",
      xMailer: "",
      xOriginatingIp: "",
      xMailFrom: "",
      xGmailReceived: "",
      rawHeaders: "",
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
    threatLevel: "LOW",
    threatScore: 5,
    findings: [],
    recommendations: [],
    ...over,
  } as EmailAnalysisResult;
}

describe("assessAttribution", () => {
  it("is low-confidence by construction and carries a caveat", () => {
    const a = assessAttribution(fakeResult());
    expect(a.confidence).toBeLessThanOrEqual(0.5);
    expect(a.caveat).toContain("heuristic");
  });

  it("maps Nigerian geolocation to West Africa with advance-fee phrasing", () => {
    const a = assessAttribution(
      fakeResult({
        ipIntelligence: { ip: "197.210.0.1", country: "Nigeria", region: "Lagos" },
      }),
      "CONGRATULATIONS! You have won 49 million. Contact the fund transfer office."
    );
    expect(a.originRegions[0].region).toBe("West Africa");
    expect(a.scamFamily).toBe("advance-fee");
  });

  it("detects the BEC family from the bec analysis hook", () => {
    const a = assessAttribution(
      fakeResult({
        bec: {
          detected: true,
          score: 80,
          confidence: 0.8,
          patterns: [],
          summary: "",
          caveat: "",
        },
      })
    );
    expect(a.scamFamily).toBe("business-email-compromise");
  });

  it("detects sextortion family from content language", () => {
    const a = assessAttribution(
      fakeResult(),
      "I recorded you on video and have your browser history. Send bitcoins or I release everything."
    );
    expect(a.scamFamily).toBe("sextortion");
  });

  it("detects credential-phishing family from login language", () => {
    const a = assessAttribution(
      fakeResult(),
      "Verify your account within 24 hours or your password and login will be disabled."
    );
    expect(a.scamFamily).toBe("credential-phishing");
  });

  it("does not fabricate regions when IP geo is absent", () => {
    const a = assessAttribution(fakeResult());
    expect(a.originRegions.length).toBe(0);
    expect(a.confidence).toBeCloseTo(0.1);
  });
});
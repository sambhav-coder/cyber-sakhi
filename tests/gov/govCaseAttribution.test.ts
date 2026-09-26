import { describe, expect, it } from "vitest";
import { buildGovCaseFields } from "../../lib/db/casePipeline";
import type { EmailAnalysisResult } from "../../lib/emailTypes";

function stubAnalysis(overrides: {
  threatLevel: EmailAnalysisResult["threatLevel"];
  threatScore: number;
  spf?: string;
  dkim?: string;
  dmarc?: string;
  spoofing?: boolean;
}): EmailAnalysisResult {
  return {
    authentication: {
      spf: { status: overrides.spf ?? "pass" },
      dkim: { status: overrides.dkim ?? "pass" },
      dmarc: { status: overrides.dmarc ?? "pass" },
    },
    senderSpoofingDetected: overrides.spoofing ?? false,
    threatLevel: overrides.threatLevel,
    threatScore: overrides.threatScore,
  } as unknown as EmailAnalysisResult;
}

describe("buildGovCaseFields", () => {
  it("starts every email-forensics case at NEW with source attribution", () => {
    const gov = buildGovCaseFields(
      stubAnalysis({ threatLevel: "HIGH", threatScore: 80, spf: "fail" }),
    );
    expect(gov.govStatus).toBe("NEW");
    expect(gov.caseSource).toBe("email_forensics");
  });

  it("mirrors the analysis risk level 1:1", () => {
    expect(buildGovCaseFields(stubAnalysis({ threatLevel: "CRITICAL", threatScore: 90 })).riskLevel).toBe("CRITICAL");
    expect(buildGovCaseFields(stubAnalysis({ threatLevel: "HIGH", threatScore: 60 })).riskLevel).toBe("HIGH");
    expect(buildGovCaseFields(stubAnalysis({ threatLevel: "MEDIUM", threatScore: 40 })).riskLevel).toBe("MEDIUM");
    expect(buildGovCaseFields(stubAnalysis({ threatLevel: "LOW", threatScore: 15 })).riskLevel).toBe("LOW");
  });

  it("leaves SAFE risk unset instead of inventing LOW", () => {
    expect(buildGovCaseFields(stubAnalysis({ threatLevel: "SAFE", threatScore: 2 })).riskLevel).toBeNull();
  });

  it("classifies PHISHING only on auth failure or proven spoofing", () => {
    expect(
      buildGovCaseFields(stubAnalysis({ threatLevel: "HIGH", threatScore: 80, spf: "fail" })).threatCategory,
    ).toBe("PHISHING");
    expect(
      buildGovCaseFields(stubAnalysis({ threatLevel: "HIGH", threatScore: 80, spoofing: true })).threatCategory,
    ).toBe("PHISHING");
  });

  it("leaves threat category unclassified when fraud is not provable", () => {
    // High score without auth failure: EMAIL_FRAUD bucket, which does not
    // reliably denote financial fraud — must stay NULL (Unclassified).
    const gov = buildGovCaseFields(stubAnalysis({ threatLevel: "MEDIUM", threatScore: 55 }));
    expect(gov.riskLevel).toBe("MEDIUM");
    expect(gov.threatCategory).toBeNull();
  });
});

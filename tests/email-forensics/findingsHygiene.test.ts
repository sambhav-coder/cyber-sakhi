import { describe, expect, it } from "vitest";
import type {
  AttachmentAnalysis,
  EmailAuthentication,
  ForensicFinding,
  SMTPAnomaly,
  SpoofingComposite,
} from "../../lib/emailTypes";
import {
  buildStructuredFindings,
  normalizeFindings,
} from "../../lib/advancedForensics";

function auth(over: Partial<EmailAuthentication> = {}): EmailAuthentication {
  return {
    spf: { status: "pass" },
    dkim: { status: "pass" },
    dmarc: { status: "pass" },
    ...over,
  };
}

const spoofingComposite: SpoofingComposite = {
  detected: false,
  score: 0,
  confidence: 0,
  signals: [],
  lookalikeDetected: false,
  lookalikeCandidates: [],
  punycodeDetected: false,
  homoglyphDetected: false,
  envelopeMismatchDetected: false,
  brandsLikelyImpersonated: [],
};

describe("normalizeFindings — stable INSEQ identifiers", () => {
  it("assigns deterministic FND-<category>-<n> ids", () => {
    const input = [
      {
        id: "random-1",
        category: "URL",
        severity: "HIGH",
        confidence: 0.7,
        description: "suspicious link",
        technicalEvidence: "x",
        humanExplanation: "x",
        recommendedAction: "x",
      },
      {
        id: "random-2",
        category: "AUTHENTICATION",
        severity: "HIGH",
        confidence: 0.9,
        description: "spoigned",
        technicalEvidence: "x",
        humanExplanation: "x",
        recommendedAction: "x",
      },
      {
        id: "random-3",
        category: "URL",
        severity: "HIGH",
        confidence: 0.7,
        description: "suspicious link",
        technicalEvidence: "x",
        humanExplanation: "x",
        recommendedAction: "x",
      },
    ] as ForensicFinding[];

    const out = normalizeFindings(input);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.id).sort()).toEqual([
      "FND-AUTHENTICATION-1",
      "FND-URL-1",
    ]);
  });

  it("is idempotent", () => {
    const input = [
      {
        id: "a",
        category: "URL",
        severity: "HIGH",
        confidence: 0.7,
        description: "suspicious link",
        technicalEvidence: "x",
        humanExplanation: "x",
        recommendedAction: "x",
      },
    ] as ForensicFinding[];
    const once = normalizeFindings(input);
    const twice = normalizeFindings(once);
    expect(twice.map((f) => f.id)).toEqual(once.map((f) => f.id));
  });
});

describe("buildStructuredFindings — every non-SAFE finding carries validation + benign context", () => {
  const attachments: AttachmentAnalysis[] = [
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
  ];

  const smtpAnomalies: SMTPAnomaly[] = [
    {
      type: "timestamp_inconsistency",
      severity: "HIGH",
      confidence: 0.8,
      description: "Timestamps are out of order across hops.",
      evidence: "Received chain",
    },
  ];

  const input = {
    authentication: auth({ spf: { status: "fail", details: "policy -all" } }),
    spoofingSignals: ["Domain \"amaz0n-login.com\" is a lookalike of trusted domain \"amazon.com\" (edit distance 1)"],
    spoofingComposite,
    smtpAnomalies,
    phishingTriggers: ["verify your password immediately"],
    urlSuspiciousCount: 2,
    attachments,
    domainSuspicious: true,
    hasOriginatingIp: false,
  };

  const findings = buildStructuredFindings(input);

  it("covers the expected categories", () => {
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has("AUTHENTICATION")).toBe(true);
    expect(categories.has("SENDER_SPOOFING")).toBe(true);
    expect(categories.has("SMTP_ROUTING")).toBe(true);
    expect(categories.has("NLP_SOCIAL_ENGINEERING")).toBe(true);
    expect(categories.has("URL")).toBe(true);
    expect(categories.has("ATTACHMENT")).toBe(true);
    expect(categories.has("DOMAIN")).toBe(true);
    expect(categories.has("IP")).toBe(true);
  });

  it("gives every non-SAFE finding a validationStatus and benignExplanation", () => {
    const nonSafe = findings.filter((f) => f.severity !== "SAFE");
    expect(nonSafe.length).toBeGreaterThan(0);
    for (const f of nonSafe) {
      expect(f.validationStatus, f.description).toBeTruthy();
      expect(f.benignExplanation, f.description).toBeTruthy();
    }
  });

  it("labels the SPF failure as a header claim with a benign caveat", () => {
    const spfFail = findings.find((f) => f.category === "AUTHENTICATION" && f.description.includes("SPF"));
    expect(spfFail?.validationStatus).toBe("Header Claim");
    expect(spfFail?.benignExplanation).toContain("not proof of fraud");
  });

  it("keeps the language honest about inconclusive checks", () => {
    const dkim = findings.find((f) => f.category === "AUTHENTICATION" && f.description.includes("DKIM"));
    expect(dkim?.severity).toBe("SAFE");
    expect(dkim?.validationStatus).toBe("Header Claim");
  });
});
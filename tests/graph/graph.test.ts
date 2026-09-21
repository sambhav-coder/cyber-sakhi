import { describe, expect, it } from "vitest";
import { buildInvestigationGraph } from "../../lib/graph";
import type { EmailAnalysisResult } from "../../lib/emailTypes";

function fakeResult(over: Partial<EmailAnalysisResult> = {}): EmailAnalysisResult {
  return {
    id: "ef_test",
    analyzedAt: new Date().toISOString(),
    headers: {
      from: "fake@example.com",
      replyTo: "reply-to@other.com",
      returnPath: "return@other.com",
      to: "victim@example.org",
      subject: "Phishing test",
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
    authentication: {
      spf: { status: "pass" },
      dkim: { status: "pass" },
      dmarc: { status: "pass" },
    },
    senderDomain: "example.com",
    senderSpoofingDetected: true,
    spoofing: {
      detected: true,
      signals: ["reply-to mismatch"],
      lookalikeCandidates: [],
      brandsLikelyImpersonated: ["paypal"],
    },
    smtpPath: [],
    smtpAnomalies: [],
    attachments: [],
    entities: [],
    originatingIP: "203.0.113.7",
    indicators: [],
    relatedDomainIntelligence: [],
    threatLevel: "MEDIUM",
    threatScore: 42,
    scoreBreakdown: { total: 42, groups: [] },
    verdict: { level: "MEDIUM", confidence: 0.6, summary: "", contributingSignals: [] },
    findings: [],
    structuredFindings: [],
    recommendations: [],
    urlRisk: [{ url: "https://phishing.example.com/", flags: ["tld-suspicious"], severity: "HIGH", confidence: 0.6, evidence: "" }],
    ...over,
  } as EmailAnalysisResult;
}

describe("buildInvestigationGraph", () => {
  it("includes sender domain, originating IP, and the email root node", () => {
    const g = buildInvestigationGraph(fakeResult());
    const kinds = g.nodes.map((n) => n.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("domain");
    expect(kinds).toContain("ip");
  });

  it("creates reply_to / return_path edges when headers differ from From", () => {
    const g = buildInvestigationGraph(fakeResult());
    const replyEdges = g.edges.filter((e) => e.kind === "reply_to" || e.kind === "return_path");
    expect(replyEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("links URLs extracted in urlRisk to the email", () => {
    const g = buildInvestigationGraph(fakeResult());
    expect(g.edges.some((e) => e.kind === "links_to")).toBe(true);
  });

  it("adds brand impersonation edges", () => {
    const g = buildInvestigationGraph(fakeResult());
    expect(g.edges.some((e) => e.kind === "impersonates")).toBe(true);
  });

  it("returns a deterministic node ID set (no duplicate nodes for the same entity)", () => {
    const g = buildInvestigationGraph(fakeResult());
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits RDAP data when absent", () => {
    const g = buildInvestigationGraph(fakeResult());
    expect(g.nodes.some((n) => n.kind === "registrar")).toBe(false);
  });

  it("includes registrar when RDAP data is present", () => {
    const g = buildInvestigationGraph(
      fakeResult({
        rdap: {
          domain: "example.com",
          registrar: "Test Registrar",
          created: "2020-01-01",
          expires: null,
          updated: null,
          registrantName: "Real Person",
          registrantCountry: "IN",
          status: [],
          nameservers: [],
          ageDays: 2000,
          rdapProvider: "test",
        },
      })
    );
    expect(g.nodes.some((n) => n.kind === "registrar" && n.label === "Test Registrar")).toBe(true);
  });
});
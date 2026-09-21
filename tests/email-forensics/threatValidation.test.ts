import { describe, expect, it } from "vitest";
import type { ThreatIndicator } from "../../lib/emailTypes";
import type { ThreatIntelResult } from "../../lib/intel/dnsbl";
import { applyThreatIntelValidation } from "../../lib/riskAssessments";

function ipIndicator(value: string): ThreatIndicator {
  return { type: "ip", value };
}

function domainIndicator(value: string): ThreatIndicator {
  return { type: "domain", value };
}

function intelResult(over: Partial<ThreatIntelResult> = {}): ThreatIntelResult {
  return {
    ip: { ip: "203.0.113.7", results: [], listed: false },
    domain: { domain: "phish.example", results: [], listed: false },
    providers: ["Spamhaus ZEN"],
    ...over,
  };
}

describe("applyThreatIntelValidation — a skipped/failed lookup never reads as clean", () => {
  it("marks indicators not-checked when threat intel never ran", () => {
    const indicators = [ipIndicator("203.0.113.7"), domainIndicator("phish.example")];
    const out = applyThreatIntelValidation(indicators, undefined);
    for (const i of out) {
      expect(i.validation?.state).toBe("not-checked");
      expect(i.validation?.label).toBe("Not Checked");
    }
  });

  it("surfaces a listing as corroboration, not a standalone verdict", () => {
    const indicators = [ipIndicator("203.0.113.7")];
    const result = intelResult({
      ip: {
        ip: "203.0.113.7",
        listed: true,
        results: [
          { source: "Spamhaus ZEN", listed: true, queryable: true, code: "127.0.0.2", reason: "SBL" },
        ],
      },
    });
    const out = applyThreatIntelValidation(indicators, result);
    expect(out[0].validation?.state).toBe("match");
    expect(out[0].validation?.label).toBe("Match Found");
  });

  it("marks a clean lookup checked-no-match so absence of a hit is explicit", () => {
    const indicators = [ipIndicator("203.0.113.7")];
    const result = intelResult({
      ip: {
        ip: "203.0.113.7",
        listed: false,
        results: [{ source: "Spamhaus ZEN", listed: false, queryable: true, code: null, reason: null }],
      },
    });
    const out = applyThreatIntelValidation(indicators, result);
    expect(out[0].validation?.state).toBe("checked-no-match");
    expect(out[0].validation?.label).toBe("Checked — No Match");
  });

  it("flags validation-failed when the network lookup itself failed", () => {
    const indicators = [ipIndicator("203.0.113.7")];
    const result = intelResult({
      ip: {
        ip: "203.0.113.7",
        listed: false,
        results: [{ source: "Spamhaus ZEN", listed: false, queryable: false, code: null, reason: null }],
      },
    });
    const out = applyThreatIntelValidation(indicators, result);
    expect(out[0].validation?.state).toBe("validation-failed");
  });

  it("does not fabricate a blocklist result for URL/email indicators", () => {
    const indicators: ThreatIndicator[] = [
      { type: "url", value: "http://phish.example/verify" },
      { type: "email", value: "attacker@phish.example" },
    ];
    const result = intelResult({});
    const out = applyThreatIntelValidation(indicators, result);
    for (const i of out) {
      expect(i.validation?.state).toBe("not-checked");
    }
  });
});
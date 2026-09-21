import { describe, expect, it } from "vitest";
import { rdapFraudSignals } from "../../lib/domainIntelligence";
import type { RdapDomainRecord } from "../../lib/emailTypes";

function rdap(over: Partial<RdapDomainRecord> = {}): RdapDomainRecord {
  return {
    domain: "x.example.com",
    registrar: "Example Registrar",
    created: null,
    expires: null,
    updated: null,
    registrantName: "Public Person",
    registrantCountry: "IN",
    status: [],
    nameservers: [],
    ageDays: null,
    rdapProvider: "test",
    ...over,
  };
}

describe("rdapFraudSignals", () => {
  it("flags very young domains", () => {
    const s = rdapFraudSignals(rdap({ ageDays: 2 }));
    expect(s.some((x) => x.includes("2 day(s) ago"))).toBe(true);
  });

  it("flags domains up to 90 days old", () => {
    const s = rdapFraudSignals(rdap({ ageDays: 60 }));
    expect(s.some((x) => x.includes("young"))).toBe(true);
  });

  it("does not flag mature domains", () => {
    expect(rdapFraudSignals(rdap({ ageDays: 800 })).filter((x) => x.includes("young") || x.includes("day(s) ago")).length).toBe(0);
  });

  it("flags WHOIS-redacted owners", () => {
    const s = rdapFraudSignals(rdap({ registrantName: null, registrantCountry: null }));
    expect(s.some((x) => x.includes("WHOIS-redacted"))).toBe(true);
  });

  it("combines locked status with hidden owners", () => {
    const s = rdapFraudSignals(
      rdap({ registrantName: null, status: ["clientTransferProhibited", "ok"] })
    );
    expect(s.some((x) => x.includes("Locked registrar status"))).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import type { VerifyOptions } from "../../lib/auth";
import {
  classifySpfPolicy,
  evaluateSpf,
  isPrivateIp,
  parseDmarc,
  tokenizeSpf,
  unquoteTxt,
  SpfMechanism,
} from "../../lib/auth/dns";

function stubHandlers(overrides: Partial<{
  txt: Record<string, string[]>;
  a: Record<string, string[]>;
  mx: Record<string, string[]>;
}> = {}) {
  const txt = overrides.txt ?? {};
  const a = overrides.a ?? {};
  const mx = overrides.mx ?? {};
  return {
    queryTxt: async (name: string) => txt[name] ?? [],
    resolveA: async (name: string) => a[name] ?? [],
    resolveMx: async (name: string) => mx[name] ?? [],
  };
}

describe("dns auth parsers", () => {
  it("strips quotes from TXT chunks", () => {
    expect(unquoteTxt('"v=spf1 -all"')).toBe("v=spf1 -all");
    expect(unquoteTxt('"a" "b"')).toBe("a\" \"b");
  });

  it("tokenizes SPF mechanisms with qualifiers", () => {
    const t = tokenizeSpf("v=spf1 include:_spf.example.com ip4:192.0.2.0/24 ~all")!;
    expect(t).not.toBeNull();
    expect(t[0]).toMatchObject({ kind: "include", qualifier: "+", value: "_spf.example.com" });
    expect(t[1]).toMatchObject({ kind: "ip4", qualifier: "+", value: "192.0.2.0/24" });
    expect(t[2]).toMatchObject({ kind: "all", qualifier: "~" });
  });

  it("returns null for non-SPF records", () => {
    expect(tokenizeSpf("hello world")).toBeNull();
  });

  it("classifies closing all policies", () => {
    expect(classifySpfPolicy(tokenizeSpf("v=spf1 -all")!).policy).toBe("-all");
    expect(classifySpfPolicy(tokenizeSpf("v=spf1 ~all")!).policy).toBe("~all");
    expect(classifySpfPolicy(tokenizeSpf("v=spf1 ip4:1.2.3.4")!).policy).toBe("none");
  });

  it("evaluates an ip4 CIDR match", async () => {
    const spf = tokenizeSpf("v=spf1 ip4:192.0.2.0/24 -all")!;
    const h = stubHandlers();
    const inside = await evaluateSpf("example.com", "192.0.2.44", spf, h);
    const outside = await evaluateSpf("example.com", "198.51.100.9", spf, h);
    expect(inside.result).toBe("pass");
    expect(outside.result).toBe("fail");
  });

  it("follows include chains and enforces the depth cap", async () => {
    const h = stubHandlers({
      txt: {
        "example.com": ["v=spf1 include:spf.svc.example.com -all"],
        "spf.svc.example.com": ["v=spf1 ip4:198.51.100.0/24 ~all"],
      },
    });
    const r = await evaluateSpf("example.com", "198.51.100.20", tokenizeSpf("v=spf1 include:spf.svc.example.com -all"), h);
    expect(r.result).toBe("pass");

    // Self-referencing include must terminate (returns neutral/neutral region, not hang).
    const looped = await evaluateSpf(
      "loop.example.com",
      "203.0.113.1",
      tokenizeSpf("v=spf1 include:loop.example.com -all"),
      h
    );
    expect(["neutral", "fail", "softfail", "pass"]).toContain(looped.result);
  });

  it("parses DMARC records and clamps pct", () => {
    expect(parseDmarc(null).present).toBe(false);
    const r = parseDmarc("v=DMARC1; p=reject; pct=150; sp=quarantine; rua=mailto:a@b.in");
    expect(r).toMatchObject({ present: true, policy: "reject", pct: 100, subdomainPolicy: "quarantine" });
  });

  it("classifies private IPs", () => {
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("172.16.4.4")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("::1")).toBe(true);
  });
});

describe("verifyDomainAuthentication", () => {
  it("is only importable server-side; type-level handlers allow offline fakes", async () => {
    const { verifyDomainAuthentication } = await import("../../lib/auth");
    const custom: NonNullable<VerifyOptions["handlers"]> = stubHandlers({
      txt: {
        "bank.example.com": ["v=spf1 -all"],
        "_dmarc.bank.example.com": ["v=DMARC1; p=reject"],
      },
    });
    const v = await verifyDomainAuthentication(
      "bank.example.com",
      { spf: null, dmarc: null },
      { clientIp: "203.0.113.7", handlers: custom }
    );
    expect(v.spf.status).toBe("fail");
    expect(v.spf.policy).toBe("-all");
    expect(v.dmarc.status).toBe("reject");
    expect(v.dmarc.policy).toBe("reject");
    expect(v.provider).toBe("dns-over-https");
  });

  it("does NOT flag a mismatch for dmarc=pass when the domain publishes p=reject", async () => {
    const { verifyDomainAuthentication } = await import("../../lib/auth");
    const custom: NonNullable<VerifyOptions["handlers"]> = stubHandlers({
      txt: {
        "strict.example.com": ["v=spf1 ip4:203.0.113.7/32 -all"],
        "_dmarc.strict.example.com": ["v=DMARC1; p=reject; pct=100"],
      },
    });
    const v = await verifyDomainAuthentication(
      "strict.example.com",
      { spf: { status: "pass" }, dmarc: { status: "pass" } },
      { clientIp: "203.0.113.7", handlers: custom }
    );
    // A strict published DMARC policy is the *disposition* for failed
    // messages; it is consistent with a pass verdict (alignment held).
    expect(v.dmarc.headerVerdictMismatch).toBe(false);
    expect(v.spf.headerVerdictMismatch).toBe(false);
  });

  it("does not flag a DMARC pass claim when the domain publishes no DMARC record (empty records)", async () => {
    const { verifyDomainAuthentication } = await import("../../lib/auth");
    const custom: NonNullable<VerifyOptions["handlers"]> = stubHandlers({
      txt: {
        "norec.example.com": ["v=spf1 +all"],
        "_dmarc.norec.example.com": [], // empty array to simulate no DMARC record
      },
    });
    const v = await verifyDomainAuthentication(
      "norec.example.com",
      { spf: { status: "pass" }, dmarc: { status: "pass" } },
      { clientIp: "203.0.113.9", handlers: custom }
    );
    expect(v.dmarc.status).toBe("not-found");
    expect(v.dmarc.headerVerdictMismatch).toBe(false);
  });

  it("flags an SPF pass claim when the domain publishes no SPF record", async () => {
    const { verifyDomainAuthentication } = await import("../../lib/auth");
    const custom: NonNullable<VerifyOptions["handlers"]> = stubHandlers({
      txt: {
        "nospf.example.com": ["v=DMARC1; p=none"],
      },
    });
    const v = await verifyDomainAuthentication(
      "nospf.example.com",
      { spf: { status: "pass" }, dmarc: { status: "none" } },
      { clientIp: "203.0.113.9", handlers: custom }
    );
    expect(v.spf.headerVerdictMismatch).toBe(true);
  });

  it("does not assert an SPF contradiction without a usable client IP", async () => {
    const { verifyDomainAuthentication } = await import("../../lib/auth");
    const custom: NonNullable<VerifyOptions["handlers"]> = stubHandlers({
      txt: {
        "pol.example.com": ["v=spf1 -all"],
        "_dmarc.pol.example.com": ["v=DMARC1; p=reject"],
      },
    });
    const v = await verifyDomainAuthentication(
      "pol.example.com",
      { spf: { status: "pass" }, dmarc: { status: "pass" } },
      { handlers: custom } // no clientIp -> no live evaluation
    );
    // Without an IP we cannot disprove authorization; the static policy is
    // reported but is NOT labelled a contradiction.
    expect(v.spf.headerVerdictMismatch).toBe(false);
  });
});
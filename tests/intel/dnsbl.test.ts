import { describe, expect, it } from "vitest";
import { queryThreatIntel } from "../../lib/intel/dnsbl";
import type { ThreatIndicator } from "../../lib/emailTypes";

const deps = {
  resolveA: async (hostname: string) => {
    if (hostname.includes("zen.spamhaus.org")) return ["127.0.0.2"];
    if (hostname.includes("dbl.spamhaus.org")) return ["127.0.1.2"];
    if (hostname.includes("surbl.org")) return ["127.0.0.8"];
    return [];
  },
  queryTxt: async () => [],
};

describe("queryThreatIntel", () => {
  it("flags a listed sender IP through Spamhaus ZEN", async () => {
    const indicators: ThreatIndicator[] = [
      { type: "ip", value: "203.0.113.9", source: "Received" },
    ];
    const r = await queryThreatIntel(indicators, deps);
    expect(r.ip?.listed).toBe(true);
    expect(r.ip?.results[0]).toMatchObject({
      source: "Spamhaus ZEN",
      listed: true,
      code: "127.0.0.2",
    });
  });

  it("flags a listed sender domain through DBL/SURBL", async () => {
    const indicators: ThreatIndicator[] = [
      { type: "domain", value: "free-gift-2026.com", source: "From" },
    ];
    const r = await queryThreatIntel(indicators, deps);
    expect(r.domain?.listed).toBe(true);
    expect(r.domain?.results.some((x) => x.source === "SURBL multi" && x.listed)).toBe(true);
  });

  it("turns lookup failure into 'not listed' with queryable=false", async () => {
    const indicators: ThreatIndicator[] = [{ type: "ip", value: "8.8.8.8", source: "t" }];
    const failing = {
      resolveA: async () => {
        throw new Error("network down");
      },
      queryTxt: async () => [],
    };
    const r = await queryThreatIntel(indicators, failing);
    expect(r.ip?.listed).toBe(false);
    // A resolver/network error is never a threat hit.
    expect(r.ip?.results[0]).toMatchObject({ listed: false, queryable: false });
  });

  it("never queries a malformed or timestamp-like IP indicator", async () => {
    const queried: string[] = [];
    const recording = {
      resolveA: async (hostname: string) => {
        queried.push(hostname);
        return [];
      },
      queryTxt: async () => [],
    };
    const indicators: ThreatIndicator[] = [
      { type: "ip", value: "09.17.02.11", source: "Received" },
      { type: "ip", value: "07:08:55", source: "Received" },
      { type: "ip", value: "999.1.1.1", source: "Received" },
    ];
    const r = await queryThreatIntel(indicators, recording);
    expect(queried).toHaveLength(0);
    expect(r.ip).toBeUndefined();
  });

  it("queries only the valid IP inside a mixed indicator set", async () => {
    const queried: string[] = [];
    const recording = {
      resolveA: async (hostname: string) => {
        queried.push(hostname);
        return [];
      },
      queryTxt: async () => [],
    };
    const indicators: ThreatIndicator[] = [
      { type: "ip", value: "09.17.02.11", source: "Received" },
      { type: "ip", value: "203.0.113.9", source: "Received" },
    ];
    await queryThreatIntel(indicators, recording);
    expect(queried).toEqual(["9.113.0.203.zen.spamhaus.org."]);
  });

  it("deduplicates and caps the indicator set", async () => {
    const indicators: ThreatIndicator[] = [
      { type: "ip", value: "203.0.113.9", source: "a" },
      { type: "ip", value: "203.0.113.9", source: "b" },
    ];
    const r = await queryThreatIntel(indicators, deps);
    expect(r.ip?.results).toHaveLength(1);
  });
});
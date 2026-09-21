import { describe, expect, it, vi } from "vitest";
import { TtlLruCache } from "../../lib/intel/geoCache";
import { checkProxy } from "../../lib/ipIntelligence";
import type { IPIntelligence } from "../../lib/emailTypes";

describe("TtlLruCache", () => {
  it("evicts entries past TTL", () => {
    let t = 1000;
    const c = new TtlLruCache<number>(100, 4, () => t);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    t = 1101; // past 100ms TTL
    expect(c.get("a")).toBeUndefined();
  });

  it("evicts LRU when over max entries", () => {
    const c = new TtlLruCache<number>(1000, 3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.get("a"); // touch a
    c.set("d", 4); // evicts b (least recently used)
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });
});

describe("checkProxy", () => {
  const geo = (org?: string, asn?: string): IPIntelligence => ({
    ip: "1.2.3.4",
    country: "XX",
    organization: org,
    asn,
  });

  it("flags IPv4 addresses present in the Tor exit list", async () => {
    const r = await checkProxy("45.83.66.1", geo("Some Corp"), {
      fetchTorExitList: async () => new Set(["45.83.66.1"]),
    });
    expect(r.kind).toBe("tor");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("flags VPN-pattern org names with transparent (heuristic) confidence", async () => {
    const r = await checkProxy("198.51.100.9", geo("NordVPN Networks"), {
      fetchTorExitList: async () => new Set(),
    });
    expect(r.kind).toBe("vpn");
    expect(r.confidence).toBe(0.5);
    expect(r.note).toContain("Heuristic");
  });

  it("flags datacenter-style orgs", async () => {
    const r = await checkProxy("203.0.113.3", geo("DigitalOcean, LLC"), {
      fetchTorExitList: async () => new Set(),
    });
    expect(r.kind).toBe("datacenter");
  });

  it("returns none for a plain org when the list loads", async () => {
    const r = await checkProxy("8.8.8.8", geo("Example Telecom"), {
      fetchTorExitList: async () => new Set(),
    });
    expect(r.kind).toBe("none");
  });

  it("degrades to unknown when the exit list is unreachable", async () => {
    const r = await checkProxy("8.8.8.8", geo("Example Telecom"), {
      fetchTorExitList: async () => null,
    });
    expect(r.kind).toBe("unknown");
    expect(r.note).toContain("unavailable");
  });
});
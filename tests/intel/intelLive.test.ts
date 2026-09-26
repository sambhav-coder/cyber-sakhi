/**
 * LIVE provider smoke tests (Phase 16).
 *
 * Opt-in: RUN_LIVE_INTEL_TESTS=true. Uses real environment credentials and
 * makes REAL requests — no mocks. Asserts contract behavior (typed
 * statuses, normalized shape), not specific verdicts, so upstream data
 * changes cannot flake them. Never submits anything: lookups only.
 */
import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { lookupUrlhaus } from "../../lib/intel/urlhaus";
import { lookupThreatFox } from "../../lib/intel/threatfox";
import { lookupReversingLabs } from "../../lib/intel/reversinglabs";
import { lookupVirusTotal } from "../../lib/intel/virustotal";
import { lookupTwitter } from "../../lib/intel/twitter";
import { lookupIpGeo } from "../../lib/intel/ipgeo";
import { enrichIndicators } from "../../lib/intel/orchestrator";

const LIVE = process.env.RUN_LIVE_INTEL_TESTS === "true";
const live = LIVE ? it : it.skip;

beforeAll(() => {
  // Vitest does not load Next.js env files: read .env.local explicitly so
  // live tests use the real configured credentials (never hardcoded).
  try {
    const file = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"|"$/g, "");
      }
    }
  } catch {
    // Missing file: providers report NOT_CONFIGURED honestly.
  }
});

describe("live provider smoke", () => {
  live("URLhaus answers benign (EMPTY) and known-malicious (DATA)", async () => {
    const empty = await lookupUrlhaus({ indicator: "http://example.com/", indicatorType: "url" });
    expect(["CONNECTED_EMPTY", "CONNECTED_DATA"]).toContain(empty.status);
    expect(empty.provider).toBe("URLhaus");

    const bad = await lookupUrlhaus({ indicator: "http://77.73.133.113/lego/mine.exe", indicatorType: "url" });
    // Documents the real upstream answer without demanding a verdict.
    expect(["CONNECTED_DATA", "CONNECTED_EMPTY", "UPSTREAM_ERROR", "RATE_LIMITED"]).toContain(bad.status);
    if (bad.status === "CONNECTED_DATA") {
      expect(bad.verdict).toBe("MALICIOUS");
      expect(bad.confidence).toBeNull();
    }
  }, 30_000);

  live("ThreatFox returns a TYPED status (never silent zero)", async () => {
    const r = await lookupThreatFox({ indicator: "8.8.8.8", indicatorType: "ip" });
    expect(r.provider).toBe("ThreatFox");
    expect(r.status).not.toBe("NOT_CONFIGURED");
    // 2026-09-26: upstream 502 -> UPSTREAM_ERROR. If the API recovers this
    // becomes CONNECTED_EMPTY/DATA — both acceptable, both typed.
    expect(["CONNECTED_EMPTY", "CONNECTED_DATA", "UPSTREAM_ERROR", "RATE_LIMITED", "AUTH_FAILED"]).toContain(r.status);
  }, 30_000);

  live("ReversingLabs reports honest auth state with token-only creds", async () => {
    const r = await lookupReversingLabs({
      indicator: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      indicatorType: "hash",
    });
    expect(["AUTH_FAILED", "CONNECTED_EMPTY", "CONNECTED_DATA", "FORBIDDEN"]).toContain(r.status);
  }, 30_000);

  live("X reports quota/auth state honestly (no fake mentions)", async () => {
    const r = await lookupTwitter({ indicator: "cybersecurity", indicatorType: "domain" });
    expect(["RATE_LIMITED", "CONNECTED_EMPTY", "CONNECTED_DATA", "AUTH_FAILED", "FORBIDDEN"]).toContain(r.status);
    if (r.status === "CONNECTED_DATA") expect(r.verdict).toBe("UNKNOWN");
  }, 30_000);

  live("ipgeolocation.io returns real geo for 8.8.8.8", async () => {
    const r = await lookupIpGeo({ indicator: "8.8.8.8", indicatorType: "ip" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.geo?.country).toBe("United States");
    expect(r.geo?.asn).toBeNull();
  }, 30_000);

  live("VirusTotal: URL, domain, IP, hash lookups + normalization", async () => {
    const url = await lookupVirusTotal({ indicator: "http://77.73.133.113/lego/mine.exe", indicatorType: "url" });
    expect(["CONNECTED_DATA", "CONNECTED_EMPTY", "RATE_LIMITED", "UPSTREAM_ERROR"]).toContain(url.status);
    if (url.status === "CONNECTED_DATA") {
      // Known Amadey distribution URL: multi-vendor conviction expected.
      expect(url.verdict).toBe("MALICIOUS");
      expect(url.confidence).toBeNull();
      expect(url.detail).toContain("malicious");
    }

    const domain = await lookupVirusTotal({ indicator: "example.com", indicatorType: "domain" });
    expect(["CONNECTED_DATA", "CONNECTED_EMPTY", "RATE_LIMITED", "UPSTREAM_ERROR"]).toContain(domain.status);
    if (domain.status === "CONNECTED_DATA") expect(domain.verdict).toBe("UNKNOWN");

    const ip = await lookupVirusTotal({ indicator: "8.8.8.8", indicatorType: "ip" });
    expect(["CONNECTED_DATA", "CONNECTED_EMPTY", "RATE_LIMITED", "UPSTREAM_ERROR"]).toContain(ip.status);

    const hash = await lookupVirusTotal({
      indicator: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      indicatorType: "hash",
    });
    expect(["CONNECTED_DATA", "CONNECTED_EMPTY", "RATE_LIMITED", "UPSTREAM_ERROR"]).toContain(hash.status);

    // Unknown object -> honest empty, not an error.
    const unknown = await lookupVirusTotal({
      indicator: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      indicatorType: "hash",
    });
    expect(["CONNECTED_EMPTY", "RATE_LIMITED", "UPSTREAM_ERROR"]).toContain(unknown.status);
  }, 60_000);

  live("orchestrator enriches mixed indicators without throwing", async () => {
    const report = await enrichIndicators(
      [
        { type: "url", value: "http://example.com/", source: "Email body" },
        { type: "domain", value: "example.com", source: "Email headers" },
        { type: "ip", value: "8.8.8.8", source: "Received headers" },
        { type: "email", value: "someone@example.com", source: "Email headers" },
      ],
      { userId: null, totalTimeoutMs: 25_000 },
    );
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.timedOut).toBe(false);
    // VirusTotal is routed; ReversingLabs stays out of the active path.
    expect(report.providersQueried).toContain("VirusTotal");
    expect(report.providersQueried).not.toContain("ReversingLabs");
    const emailRow = report.results.find((x) => x.type === "email");
    expect(emailRow).toBeDefined();
    const emailProviders = emailRow?.results.map((r) => r.provider) ?? [];
    expect(emailProviders).not.toContain("URLhaus");
    expect(emailProviders).not.toContain("ThreatFox");
    for (const row of report.results) {
      for (const res of row.results) {
        expect(res.indicator).toBe(row.value);
        expect(typeof res.fetchedAt).toBe("string");
      }
    }
  }, 60_000);
});

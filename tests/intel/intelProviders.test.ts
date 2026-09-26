import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  asIsoDate,
  statusFromError,
  statusFromHttp,
  IntelTimeoutError,
} from "../../lib/intel/providers";
import { lookupUrlhaus } from "../../lib/intel/urlhaus";
import { lookupThreatFox } from "../../lib/intel/threatfox";
import { lookupReversingLabs } from "../../lib/intel/reversinglabs";
import { lookupVirusTotal, virustotalUrlId } from "../../lib/intel/virustotal";
import { lookupTwitter } from "../../lib/intel/twitter";
import { lookupIpGeo, parseIpgeo } from "../../lib/intel/ipgeo";
import { lookupMlUrlRisk } from "../../lib/intel/mlIntel";
import { enrichIndicators } from "../../lib/intel/orchestrator";

const OLD_ENV = { ...process.env };

function mockFetchOnce(body: unknown, status = 200, contentType = "application/json") {
  global.fetch = vi.fn().mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": contentType },
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv("URLHAUS_AUTH_KEY", "test-urlhaus-key");
  vi.stubEnv("THREATFOX_AUTH_KEY", "test-threatfox-key");
  vi.stubEnv("REVERSINGLABS_TOKEN", "test-rl-token");
  vi.stubEnv("VIRUSTOTAL_API_KEY", "test-vt-key");
  vi.stubEnv("TWITTER_BEARER_TOKEN", "test-x-bearer");
  vi.stubEnv("IPGEOLOCATION_API_KEY", "test-geo-key");
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("status mapping", () => {
  it("maps HTTP codes to explicit provider states", () => {
    expect(statusFromHttp(200)).toBe("CONNECTED_DATA");
    expect(statusFromHttp(400)).toBe("BAD_REQUEST");
    expect(statusFromHttp(401)).toBe("AUTH_FAILED");
    expect(statusFromHttp(403)).toBe("FORBIDDEN");
    expect(statusFromHttp(404)).toBe("NOT_FOUND");
    expect(statusFromHttp(429)).toBe("RATE_LIMITED");
    expect(statusFromHttp(502)).toBe("UPSTREAM_ERROR");
    expect(statusFromError(new IntelTimeoutError())).toBe("TIMEOUT");
    expect(statusFromError(new Error("boom"))).toBe("NETWORK_ERROR");
  });

  it("parses abuse.ch UTC dates and rejects garbage", () => {
    expect(asIsoDate("2022-11-24 13:27:03 UTC")).toBe("2022-11-24T13:27:03.000Z");
    expect(asIsoDate("not a date")).toBeNull();
    expect(asIsoDate(null)).toBeNull();
  });
});

describe("URLhaus client", () => {
  it("parses ok with real fields, confidence stays null", async () => {
    mockFetchOnce({
      query_status: "ok",
      id: "2432003",
      urlhaus_reference: "https://urlhaus.abuse.ch/url/2432003/",
      url_status: "offline",
      threat: "malware_download",
      date_added: "2022-11-24 13:27:03 UTC",
      tags: ["Amadey"],
    });
    const r = await lookupUrlhaus({ indicator: "http://x.test/a.exe", indicatorType: "url" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("MALICIOUS");
    expect(r.confidence).toBeNull();
    expect(r.malwareFamily).toBe("Amadey");
    expect(r.firstSeen).toBe("2022-11-24T13:27:03.000Z");
    expect(r.rawSourceId).toBe("2432003");
    // Form-encoded per official sample scripts, Auth-Key header, no secret echo.
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Auth-Key"]).toBe("test-urlhaus-key");
    expect(init.body).toContain("url=");
  });

  it("maps no_results to CONNECTED_EMPTY (not failure)", async () => {
    mockFetchOnce({ query_status: "no_results" });
    const r = await lookupUrlhaus({ indicator: "http://cache-empty-1.test/", indicatorType: "url" });
    expect(r.status).toBe("CONNECTED_EMPTY");
    expect(r.verdict).toBe("UNKNOWN");
  });

  it("maps HTTP 401 to AUTH_FAILED, never zero-records", async () => {
    mockFetchOnce('{"error":"Unauthorized"}', 401);
    const r = await lookupUrlhaus({ indicator: "http://cache-401-1.test/", indicatorType: "url" });
    expect(r.status).toBe("AUTH_FAILED");
  });

  it("is NOT_CONFIGURED without a key and rejects non-url/hash types", async () => {
    vi.stubEnv("URLHAUS_AUTH_KEY", "");
    delete process.env.URLHAUS_API_KEY;
    const r = await lookupUrlhaus({ indicator: "http://example.com/", indicatorType: "url" });
    expect(r.status).toBe("NOT_CONFIGURED");
    vi.stubEnv("URLHAUS_AUTH_KEY", "test-urlhaus-key");
    const bad = await lookupUrlhaus({ indicator: "x@y.zz", indicatorType: "email" });
    expect(bad.status).toBe("BAD_REQUEST");
  });
});

describe("ThreatFox client", () => {
  it("parses ok rows with confidence scaled 0-100 -> 0-1", async () => {
    mockFetchOnce({
      query_status: "ok",
      data: [{
        id: "12",
        ioc: "1.2.3.4",
        threat_type: "botnet_cc",
        malware_printable: "Emotet",
        confidence_level: 90,
        first_seen: "2023-01-01 00:00:00 UTC",
        reference: "https://threatfox.abuse.ch/ioc/12/",
        tags: ["exe"],
      }],
    });
    const r = await lookupThreatFox({ indicator: "1.2.3.4", indicatorType: "ip" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("MALICIOUS");
    expect(r.confidence).toBe(0.9);
    expect(r.malwareFamily).toBe("Emotet");
    expect(r.sourceUrl).toContain("/ioc/12/");
  });

  it("never sends email addresses to ThreatFox", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const r = await lookupThreatFox({ indicator: "a@b.cc", indicatorType: "email" });
    expect(r.status).toBe("BAD_REQUEST");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps 502 to UPSTREAM_ERROR", async () => {
    const spy = vi.fn()
      .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
    global.fetch = spy as unknown as typeof fetch;
    const r = await lookupThreatFox({ indicator: "8.8.8.8", indicatorType: "ip" });
    expect(r.status).toBe("UPSTREAM_ERROR");
    // Initial + max 2 retries, then give up (never CONNECTED_EMPTY).
    expect(spy.mock.calls.length).toBe(3);
    expect(r.detail).toContain("retries");
  });

  it("retries transient 502 once and recovers", async () => {
    const spy = vi.fn()
      .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query_status: "no_result" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    global.fetch = spy as unknown as typeof fetch;
    const r = await lookupThreatFox({ indicator: "9.9.9.9", indicatorType: "ip" });
    expect(r.status).toBe("CONNECTED_EMPTY");
    expect(spy.mock.calls.length).toBe(2);
  });

  it("does NOT retry 401 (fails fast as AUTH_FAILED)", async () => {
    const spy = vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 401 }));
    global.fetch = spy as unknown as typeof fetch;
    const r = await lookupThreatFox({ indicator: "9.9.9.10", indicatorType: "ip" });
    expect(r.status).toBe("AUTH_FAILED");
    expect(spy.mock.calls.length).toBe(1);
  });

  it("maps 200 unknown_auth_key body to AUTH_FAILED", async () => {
    mockFetchOnce({ query_status: "unknown_auth_key" });
    const r = await lookupThreatFox({ indicator: "9.9.9.11", indicatorType: "ip" });
    expect(r.status).toBe("AUTH_FAILED");
  });
});

describe("ReversingLabs client", () => {
  it("maps 401 to AUTH_FAILED with token-only credentials", async () => {
    mockFetchOnce("", 401);
    const r = await lookupReversingLabs({ indicator: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", indicatorType: "hash" });
    expect(r.status).toBe("AUTH_FAILED");
  });

  it("maps 404 file reputation to CONNECTED_EMPTY", async () => {
    mockFetchOnce("", 404);
    const unique = "aa".repeat(32);
    const r = await lookupReversingLabs({ indicator: unique, indicatorType: "hash" });
    expect(r.status).toBe("CONNECTED_EMPTY");
  });

  it("rejects malformed hashes as BAD_REQUEST", async () => {
    const r = await lookupReversingLabs({ indicator: "notahash", indicatorType: "hash" });
    expect(r.status).toBe("BAD_REQUEST");
  });
});

describe("X client", () => {
  it("treats zero mentions as CONNECTED_EMPTY, never a verdict", async () => {
    mockFetchOnce({ data: [], meta: { result_count: 0 } });
    const r = await lookupTwitter({ indicator: "example.com", indicatorType: "domain" });
    expect(r.status).toBe("CONNECTED_EMPTY");
    expect(r.verdict).toBe("UNKNOWN");
  });

  it("mentions stay UNKNOWN verdict (discussion context)", async () => {
    mockFetchOnce({ data: [{ id: "123", text: "evil-mention.test is bad" }], meta: { result_count: 2 } });
    const r = await lookupTwitter({ indicator: "evil-mention.test", indicatorType: "domain" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.reference).toContain("123");
  });

  it("maps 402 credits-depleted to RATE_LIMITED", async () => {
    mockFetchOnce({ title: "Payment Required", detail: "credits depleted" }, 402);
    const r = await lookupTwitter({ indicator: "quota-empty.test", indicatorType: "domain" });
    expect(r.status).toBe("RATE_LIMITED");
  });
});

describe("ipgeo client", () => {
  it("parses location fields, leaves ASN/org/timezone null", () => {
    const geo = parseIpgeo({
      ip: "8.8.8.8",
      location: { country_name: "United States", country_code2: "US", state_prov: "California", city: "Mountain View", latitude: "37.42", longitude: "-122.08" },
    }, "8.8.8.8");
    expect(geo.country).toBe("United States");
    expect(geo.city).toBe("Mountain View");
    expect(geo.latitude).toBeCloseTo(37.42);
    expect(geo.asn).toBeNull();
    expect(geo.ispOrOrg).toBeNull();
    expect(geo.timezone).toBeNull();
  });
});

describe("ML URL-risk wrapper", () => {
  it("returns MODEL_DERIVED with experimental detail, never MALICIOUS verdict", () => {
    const r = lookupMlUrlRisk({ indicator: "http://bit.ly/verify-account-login-secure", indicatorType: "url" });
    expect(r.sourceKind).toBe("MODEL_DERIVED");
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict === "MALICIOUS").toBe(false);
    expect(r.detail).toContain("url-risk-lr-v1");
  });
});

describe("VirusTotal client", () => {
  it("builds the documented base64url URL id (no padding)", () => {
    expect(virustotalUrlId("http://example.com/")).toBe("aHR0cDovL2V4YW1wbGUuY29tLw");
    expect(virustotalUrlId("http://example.com/")).not.toContain("=");
  });

  it("maps >=2 malicious vendors to MALICIOUS, keeps counts in detail", async () => {
    mockFetchOnce({
      data: {
        id: "http://77.73.133.113/lego/mine.exe",
        type: "url",
        attributes: {
          url: "http://77.73.133.113/lego/mine.exe",
          last_analysis_stats: { malicious: 13, suspicious: 0, harmless: 56, undetected: 25, timeout: 0 },
          last_analysis_results: {
            BitDefender: { category: "malicious", result: "malware", engine_name: "BitDefender" },
            "ESET-NOD32": { category: "malicious", result: "malware", engine_name: "ESET-NOD32" },
            Google: { category: "harmless", result: "clean", engine_name: "Google Safebrowsing" },
          },
          threat_names: ["malware_download"],
          categories: { "Sophos": "spyware and malware" },
          reputation: 0,
          last_analysis_date: 1721909780,
          times_submitted: 6,
        },
      },
    });
    const r = await lookupVirusTotal({ indicator: "http://vt-malicious.test/mine.exe", indicatorType: "url" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("MALICIOUS");
    // No fabricated probability.
    expect(r.confidence).toBeNull();
    expect(r.threatType).toBe("spyware and malware");
    expect(r.malwareFamily).toBe("malware_download");
    expect(r.detail).toContain("13 malicious");
    expect(r.detail).toContain("BitDefender=malware");
    expect(r.sourceUrl).toContain("virustotal.com/gui/url/");
    // x-apikey header, never logged; correct v3 path.
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://www.virustotal.com/api/v3/urls/");
    expect((init.headers as Record<string, string>)["x-apikey"]).toBe("test-vt-key");
  });

  it("maps clean stats to UNKNOWN (never SAFE)", async () => {
    mockFetchOnce({
      data: {
        id: "example.com",
        type: "domain",
        attributes: {
          last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 62, undetected: 29, timeout: 0 },
          last_analysis_results: {},
          reputation: 27,
          last_analysis_date: 1721909780,
        },
      },
    });
    const r = await lookupVirusTotal({ indicator: "vt-clean.test", indicatorType: "domain" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("UNKNOWN");
  });

  it("maps single-vendor flag to SUSPICIOUS (no single-vendor convictions)", async () => {
    mockFetchOnce({
      data: {
        id: "1.2.3.4",
        type: "ip_address",
        attributes: {
          last_analysis_stats: { malicious: 1, suspicious: 0, harmless: 50, undetected: 30, timeout: 0 },
          last_analysis_results: { Lonely: { category: "malicious", result: "bad", engine_name: "Lonely" } },
          country: "US",
          as_owner: "Example ASN",
        },
      },
    });
    const r = await lookupVirusTotal({ indicator: "9.9.9.9", indicatorType: "ip" });
    expect(r.status).toBe("CONNECTED_DATA");
    expect(r.verdict).toBe("SUSPICIOUS");
    expect(r.detail).toContain("country=US");
  });

  it("maps 404 unknown object to CONNECTED_EMPTY", async () => {
    mockFetchOnce({ error: { code: "NotFoundError", message: "not found" } }, 404);
    const unique = "bb".repeat(32);
    const r = await lookupVirusTotal({ indicator: unique, indicatorType: "hash" });
    expect(r.status).toBe("CONNECTED_EMPTY");
    expect(r.verdict).toBe("UNKNOWN");
  });

  it("maps 401 to AUTH_FAILED and 429 to RATE_LIMITED", async () => {
    mockFetchOnce({ error: { code: "AuthenticationRequiredError" } }, 401);
    const a = await lookupVirusTotal({ indicator: "vt-auth.test", indicatorType: "domain" });
    expect(a.status).toBe("AUTH_FAILED");
    mockFetchOnce({ error: { code: "QuotaExceededError" } }, 429);
    const b = await lookupVirusTotal({ indicator: "vt-quota.test", indicatorType: "domain" });
    expect(b.status).toBe("RATE_LIMITED");
  });

  it("rejects malformed indicators as BAD_REQUEST without network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect((await lookupVirusTotal({ indicator: "notahash", indicatorType: "hash" })).status).toBe("BAD_REQUEST");
    expect((await lookupVirusTotal({ indicator: "nota url", indicatorType: "url" })).status).toBe("BAD_REQUEST");
    expect((await lookupVirusTotal({ indicator: "a@b.cc", indicatorType: "email" })).status).toBe("BAD_REQUEST");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is NOT_CONFIGURED without a key", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "");
    const r = await lookupVirusTotal({ indicator: "example.com", indicatorType: "domain" });
    expect(r.status).toBe("NOT_CONFIGURED");
  });
});

describe("orchestrator routing", () => {
  it("never sends email addresses to external feeds", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const report = await enrichIndicators(
      [{ type: "email", value: "someone@example.com", source: "Email headers" }],
      { userId: null },
    );
    expect(report.indicatorsEnriched).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.providersQueried).toContain("Cyber-Sakhi DB");
    expect(report.providersQueried).not.toContain("URLhaus");
  });

  it("routes VirusTotal (not ReversingLabs) for url/domain/ip/hash", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{"data":{"id":"x","type":"url","attributes":{"last_analysis_stats":{"malicious":0,"suspicious":0,"harmless":1,"undetected":0}}}}', { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const report = await enrichIndicators(
      [
        { type: "url", value: "http://routed-vt.test/a", source: "Email body" },
        { type: "domain", value: "routed-vt.test", source: "Email headers" },
        { type: "ip", value: "9.9.9.10", source: "Received headers" },
      ],
      { userId: null },
    );
    expect(report.providersQueried).toContain("VirusTotal");
    expect(report.providersQueried).not.toContain("ReversingLabs");
    for (const row of report.results) {
      expect(row.results.some((r) => r.provider === "VirusTotal")).toBe(true);
    }
  });

  it("skips private IPs for external routing and never throws", async () => {
    const report = await enrichIndicators(
      [{ type: "ip", value: "192.168.1.1", source: "Received headers" }],
      { userId: null },
    );
    expect(report.indicatorsSkipped).toBe(1);
    expect(report.results).toHaveLength(0);
  });

  it("survives total provider failure with typed statuses", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch;
    const report = await enrichIndicators(
      [{ type: "url", value: "http://fail-all.test/x", source: "Email body" }],
      { userId: null },
    );
    expect(report.results).toHaveLength(1);
    // Local ML model still answers (MODEL_DERIVED); every EXTERNAL_PROVIDER
    // row must carry a failure state, and nothing flips malicious.
    const externals = report.results[0].results.filter((r) => r.sourceKind === "EXTERNAL_PROVIDER");
    expect(externals.length).toBeGreaterThan(0);
    expect(externals.every((r) => r.status !== "CONNECTED_DATA")).toBe(true);
    expect(report.results[0].externalMalicious).toBe(false);
  });
});

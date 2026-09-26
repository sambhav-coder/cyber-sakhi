/**
 * URLhaus bulk-lookup client (Phase 3).
 *
 * Official endpoints (https://urlhaus.abuse.ch/api/ + abusech/URLhaus
 * sample scripts): POST https://urlhaus-api.abuse.ch/v1/url/ and
 * POST https://urlhaus-api.abuse.ch/v1/payload/, form-encoded body,
 * `Auth-Key` header. Read-only lookups only — never submissions.
 *
 * Live-verified 2026-09-26: benign URL -> query_status no_results;
 * known-malicious sample URL -> ok (Amadey tags, offline, reporter).
 */

import {
  asIsoDate,
  emptyIntel,
  providerFetch,
  safeJson,
  statusFromError,
  statusFromHttp,
  type IndicatorQuery,
  type NormalizedThreatIntel,
  type ProviderHealth,
} from "./providers";
import { TtlLruCache } from "./geoCache";

export const URLHAUS_PROVIDER = "URLhaus";
const URL_LOOKUP_ENDPOINT = "https://urlhaus-api.abuse.ch/v1/url/";
const HASH_LOOKUP_ENDPOINT = "https://urlhaus-api.abuse.ch/v1/payload/";
const LOOKUP_TIMEOUT_MS = 12_000;

const lookupCache = new TtlLruCache<NormalizedThreatIntel>(30 * 60_000, 1024);

function authKey(): string | null {
  // Canonical server-side name first; documented alias second.
  const key = process.env.URLHAUS_AUTH_KEY || process.env.URLHAUS_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function urlhausConfigured(): boolean {
  return authKey() !== null;
}

interface UrlhausUrlResponse {
  query_status?: string;
  id?: string;
  url?: string;
  urlhaus_reference?: string;
  url_status?: string;
  host?: string;
  date_added?: string;
  threat?: string;
  blacklists?: Record<string, string>;
  reporter?: string;
  tags?: string[];
}

interface UrlhausPayloadResponse {
  query_status?: string;
  md5_hash?: string;
  sha256_hash?: string;
  file_type?: string;
  file_size?: string | number;
  firstseen?: string;
  lastseen?: string;
  urlhaus_download?: string;
  signature?: string;
  imphash?: string;
  tlsh?: string;
}

function verdictForUrl(row: UrlhausUrlResponse): NormalizedThreatIntel["verdict"] {
  // URLhaus only lists malware-distribution URLs: presence is MALICIOUS.
  // url_status online/offline describes availability, not guilt.
  return row.query_status === "ok" ? "MALICIOUS" : "UNKNOWN";
}

function parseUrlRow(query: IndicatorQuery, row: UrlhausUrlResponse): NormalizedThreatIntel {
  const tags = Array.isArray(row.tags) ? row.tags.filter((t) => typeof t === "string") : [];
  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: URLHAUS_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    verdict: verdictForUrl(row),
    // URLhaus supplies no confidence score: null, never invented.
    confidence: null,
    threatType: typeof row.threat === "string" ? row.threat : null,
    malwareFamily: tags.length > 0 ? tags[0] : null,
    firstSeen: asIsoDate(row.date_added),
    lastSeen: null,
    reference: typeof row.urlhaus_reference === "string" ? row.urlhaus_reference : null,
    rawSourceId: row.id !== undefined ? String(row.id) : null,
    sourceUrl: "https://urlhaus.abuse.ch/",
    fetchedAt: new Date().toISOString(),
    detail:
      `url_status=${row.url_status ?? "unknown"}` +
      (tags.length > 0 ? ` tags=${tags.slice(0, 8).join(",")}` : "") +
      (row.reporter ? ` reporter=${row.reporter}` : ""),
  };
}

function parsePayloadRow(query: IndicatorQuery, row: UrlhausPayloadResponse): NormalizedThreatIntel {
  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: URLHAUS_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    verdict: "MALICIOUS",
    confidence: null,
    threatType: null,
    malwareFamily: typeof row.signature === "string" && row.signature.length > 0 ? row.signature : null,
    firstSeen: asIsoDate(row.firstseen),
    lastSeen: asIsoDate(row.lastseen),
    reference: typeof row.urlhaus_download === "string" ? row.urlhaus_download : null,
    rawSourceId: null,
    sourceUrl: "https://urlhaus.abuse.ch/",
    fetchedAt: new Date().toISOString(),
    detail: row.file_type ? `file_type=${row.file_type}` : null,
  };
}

/**
 * Look up one URL or hash. Never throws: every failure becomes a typed
 * status (401 -> AUTH_FAILED, never "0 records").
 */
export async function lookupUrlhaus(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const key = authKey();
  if (!key) {
    return emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "URLHAUS_AUTH_KEY is not configured.");
  }

  const cacheKey = `${query.indicatorType}:${query.indicator.toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  const isHash = query.indicatorType === "hash";
  // URLhaus payload lookup supports MD5/SHA256; URL lookup supports URLs.
  // Anything else is a caller bug, reported as BAD_REQUEST (not a lookup).
  if (!isHash && query.indicatorType !== "url") {
    return emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", `URLhaus supports url/hash lookups, not ${query.indicatorType}.`);
  }

  const endpoint = isHash ? HASH_LOOKUP_ENDPOINT : URL_LOOKUP_ENDPOINT;
  const body = new URLSearchParams(
    isHash ? { file_hash: query.indicator } : { url: query.indicator },
  ).toString();

  let response: Response;
  try {
    response = await providerFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Auth-Key": key,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "Cyber-Sakhi-Intel/1.0",
        },
        body,
      },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (!response.ok) {
    return emptyIntel(
      URLHAUS_PROVIDER,
      "EXTERNAL_PROVIDER",
      query,
      statusFromHttp(response.status),
      `HTTP ${response.status} from URLhaus lookup.`,
    );
  }

  const parsed = (await safeJson(response)) as UrlhausUrlResponse & UrlhausPayloadResponse | null;
  const status = typeof parsed?.query_status === "string" ? parsed.query_status : null;
  if (status === null) {
    return emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "URLhaus response was not recognized.");
  }
  if (status === "no_results") {
    const intel = emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "Indicator not present in URLhaus.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  if (status !== "ok") {
    // invalid_url, invalid_hash, no_auth_key, ... — explicit, never silent.
    const mapped = status === "no_auth_key" ? "AUTH_FAILED" : status === "invalid_url" || status === "invalid_hash" ? "BAD_REQUEST" : "UPSTREAM_ERROR";
    return emptyIntel(URLHAUS_PROVIDER, "EXTERNAL_PROVIDER", query, mapped, `URLhaus query_status=${status}.`);
  }

  const intel = isHash
    ? parsePayloadRow(query, parsed as UrlhausPayloadResponse)
    : parseUrlRow(query, parsed as UrlhausUrlResponse);
  lookupCache.set(cacheKey, intel);
  return intel;
}

/** Lightweight connectivity check: benign lookup, no bulk download. */
export async function urlhausHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupUrlhaus({ indicator: "http://example.com/", indicatorType: "url" });
  return {
    name: URLHAUS_PROVIDER,
    configured: urlhausConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: intel.detail,
  };
}

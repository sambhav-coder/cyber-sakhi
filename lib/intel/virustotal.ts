/**
 * VirusTotal lookup client (read-only).
 *
 * Official API v3 (https://docs.virustotal.com/docs/api-overview):
 * base https://www.virustotal.com/api/v3, auth via `x-apikey` header.
 * Read-only GET lookups only — never uploads, never URL/file submissions:
 * - URL:    GET /urls/{base64url-no-padding(url)}
 * - DOMAIN: GET /domains/{domain}
 * - IP:     GET /ip_addresses/{ip}
 * - FILE:   GET /files/{md5|sha1|sha256}
 *
 * VERDICT MAPPING (documented, conservative — single-vendor flags never
 * convict):
 * - last_analysis_stats.malicious >= 2        -> MALICIOUS
 * - malicious == 1 OR suspicious >= 1         -> SUSPICIOUS
 * - otherwise (incl. all-harmless/undetected) -> UNKNOWN (never SAFE:
 *   vendor coverage is partial and "undetected" is not exoneration)
 * - confidence is ALWAYS null: VT provides vendor counts, not a
 *   probability; no score is fabricated from them.
 *
 * Live-verified 2026-09-26: key authenticates (401 only with a wrong key);
 * example.com -> 200 clean stats; Amadey sample URL -> 200 with 13
 * vendors malicious; unknown hash -> 404.
 */

import {
  emptyIntel,
  providerFetch,
  safeJson,
  statusFromError,
  statusFromHttp,
  type IndicatorQuery,
  type IntelVerdict,
  type NormalizedThreatIntel,
  type ProviderHealth,
} from "./providers";
import { TtlLruCache } from "./geoCache";

export const VIRUSTOTAL_PROVIDER = "VirusTotal";
const API_BASE = "https://www.virustotal.com/api/v3";
const LOOKUP_TIMEOUT_MS = 12_000;
/** Community quota guard: lookups are cached 60 min (existing TTL layer). */
const lookupCache = new TtlLruCache<NormalizedThreatIntel>(60 * 60_000, 1024);

function apiKey(): string | null {
  const key = process.env.VIRUSTOTAL_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function virustotalConfigured(): boolean {
  return apiKey() !== null;
}

interface VtAnalysisStats {
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
  timeout?: number;
}

interface VtAttributes {
  last_analysis_stats?: VtAnalysisStats;
  last_analysis_results?: Record<string, { category?: string; result?: string; engine_name?: string }>;
  last_analysis_date?: number;
  reputation?: number;
  categories?: Record<string, string>;
  threat_names?: string[];
  tags?: string[];
  names?: string[];
  meaningful_name?: string;
  type_description?: string;
  first_submission_date?: number;
  last_submission_date?: number;
  times_submitted?: number;
  creation_date?: number;
  last_update_date?: number;
  asn?: number;
  as_owner?: string;
  country?: string;
  url?: string;
  popular_threat_classification?: { suggested_threat_label?: string };
}

interface VtObjectResponse {
  data?: { id?: string; type?: string; attributes?: VtAttributes };
  error?: { code?: string; message?: string };
}

/** VT URL identifier: base64url of the exact URL, no padding (per docs). */
export function virustotalUrlId(url: string): string {
  return Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function hashKind(value: string): "md5" | "sha1" | "sha256" | null {
  const v = value.trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(v)) return "md5";
  if (/^[0-9a-f]{40}$/.test(v)) return "sha1";
  if (/^[0-9a-f]{64}$/.test(v)) return "sha256";
  return null;
}

function isValidDomain(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/\.$/, "");
  if (v.length === 0 || v.length > 253 || !v.includes(".")) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v);
}

function isValidIp(value: string): boolean {
  const v = value.trim();
  const v4 = v.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return true;
  // IPv6: parseable by the URL constructor.
  try {
    const u = new URL(`http://[${v}]/`);
    return u.hostname === v.toLowerCase() && v.includes(":");
  } catch {
    return false;
  }
}

function epochToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

/** Resolve the indicator to a VT v3 lookup path, or a BAD_REQUEST reason. */
function lookupPath(query: IndicatorQuery): { path: string } | { badRequest: string } {
  const value = query.indicator.trim();
  switch (query.indicatorType) {
    case "url": {
      if (value.length === 0 || value.length > 2048 || !/^https?:\/\//i.test(value)) {
        return { badRequest: "Not a valid http(s) URL for VirusTotal lookup." };
      }
      // The identifier is derived from the exact trimmed representation;
      // no silent re-encoding beyond the documented base64url transform.
      return { path: `/urls/${virustotalUrlId(value)}` };
    }
    case "domain":
      if (!isValidDomain(value)) return { badRequest: "Not a valid domain for VirusTotal lookup." };
      return { path: `/domains/${value.toLowerCase().replace(/\.$/, "")}` };
    case "ip":
      if (!isValidIp(value)) return { badRequest: "Not a valid IP for VirusTotal lookup." };
      return { path: `/ip_addresses/${value}` };
    case "hash": {
      const kind = hashKind(value);
      if (!kind) return { badRequest: "Not a valid MD5/SHA1/SHA256 hash for VirusTotal lookup." };
      void kind;
      return { path: `/files/${value.toLowerCase()}` };
    }
    default:
      return { badRequest: `VirusTotal does not support ${query.indicatorType} lookups.` };
  }
}

function verdictForStats(stats: VtAnalysisStats): IntelVerdict {
  const malicious = stats.malicious ?? 0;
  const suspicious = stats.suspicious ?? 0;
  if (malicious >= 2) return "MALICIOUS";
  if (malicious === 1 || suspicious >= 1) return "SUSPICIOUS";
  return "UNKNOWN";
}

function parseObject(query: IndicatorQuery, id: string | undefined, attr: VtAttributes): NormalizedThreatIntel {
  const stats = attr.last_analysis_stats ?? {};
  const malicious = stats.malicious ?? 0;
  const suspicious = stats.suspicious ?? 0;
  const total =
    malicious + suspicious + (stats.harmless ?? 0) + (stats.undetected ?? 0) + (stats.timeout ?? 0);

  const detections = Object.entries(attr.last_analysis_results ?? {})
    .filter(([, v]) => v && (v.category === "malicious" || v.category === "suspicious"))
    .slice(0, 8)
    .map(([engine, v]) => `${engine}=${v.result ?? v.category}`);

  const categoryValues = Object.values(attr.categories ?? {}).filter((c) => typeof c === "string" && c.length > 0);
  const threatLabel =
    attr.popular_threat_classification?.suggested_threat_label ??
    (attr.threat_names && attr.threat_names.length > 0 ? attr.threat_names[0] : null);
  const name =
    attr.meaningful_name ?? (attr.names && attr.names.length > 0 ? attr.names[0] : null);

  // First/last seen: files + urls carry submission dates; domains carry
  // registration/update dates; IPs carry analysis dates. Only returned
  // fields are used — nothing is synthesized.
  const firstSeen =
    epochToIso(attr.first_submission_date) ??
    epochToIso(attr.creation_date);
  const lastSeen =
    epochToIso(attr.last_analysis_date) ??
    epochToIso(attr.last_submission_date) ??
    epochToIso(attr.last_update_date);

  const guiPath =
    query.indicatorType === "url"
      ? `https://www.virustotal.com/gui/url/${id ?? ""}`
      : query.indicatorType === "domain"
        ? `https://www.virustotal.com/gui/domain/${query.indicator.trim().toLowerCase()}`
        : query.indicatorType === "ip"
          ? `https://www.virustotal.com/gui/ip-address/${query.indicator.trim()}`
          : `https://www.virustotal.com/gui/file/${query.indicator.trim().toLowerCase()}`;

  const detailParts = [
    `${malicious} malicious / ${suspicious} suspicious of ${total} vendors`,
    threatLabel ? `threat=${threatLabel}` : null,
    categoryValues.length > 0 ? `categories=${categoryValues.slice(0, 4).join("; ")}` : null,
    typeof attr.reputation === "number" ? `reputation=${attr.reputation}` : null,
    attr.as_owner ? `as_owner=${attr.as_owner}` : null,
    attr.country ? `country=${attr.country}` : null,
    detections.length > 0 ? `detections: ${detections.join(", ")}` : null,
  ].filter((p): p is string => p !== null);

  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: VIRUSTOTAL_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    verdict: verdictForStats(stats),
    // VT exposes vendor counts, not a probability: confidence stays null.
    confidence: null,
    threatType: categoryValues.length > 0 ? categoryValues[0] : null,
    malwareFamily: threatLabel ?? name,
    firstSeen,
    lastSeen,
    reference: attr.url ?? null,
    rawSourceId: id ?? null,
    sourceUrl: guiPath,
    fetchedAt: new Date().toISOString(),
    detail: detailParts.join(" | ") || "VirusTotal object retrieved.",
  };
}

/**
 * Read-only lookup of one url/domain/ip/hash. Never throws: every failure
 * becomes a typed status (401 -> AUTH_FAILED, 404 -> CONNECTED_EMPTY for
 * unknown objects, 429 -> RATE_LIMITED, never silent zero).
 */
export async function lookupVirusTotal(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const key = apiKey();
  if (!key) {
    return emptyIntel(VIRUSTOTAL_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "VIRUSTOTAL_API_KEY is not configured.");
  }

  const resolved = lookupPath(query);
  if ("badRequest" in resolved) {
    return emptyIntel(VIRUSTOTAL_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", resolved.badRequest);
  }

  const cacheKey = `${query.indicatorType}:${query.indicator.trim().toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  let response: Response;
  try {
    response = await providerFetch(
      `${API_BASE}${resolved.path}`,
      {
        headers: {
          "x-apikey": key,
          Accept: "application/json",
          "User-Agent": "Cyber-Sakhi-Intel/1.0",
        },
      },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(VIRUSTOTAL_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (response.status === 404) {
    // VT lookup semantics: unknown object -> honest empty, never NOT_FOUND
    // noise for a routine reputation question.
    const intel = emptyIntel(VIRUSTOTAL_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "Indicator not known to VirusTotal.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  if (!response.ok) {
    return emptyIntel(
      VIRUSTOTAL_PROVIDER,
      "EXTERNAL_PROVIDER",
      query,
      statusFromHttp(response.status),
      `HTTP ${response.status} from VirusTotal.`,
    );
  }

  const parsed = (await safeJson(response)) as VtObjectResponse | null;
  const attr = parsed?.data?.attributes;
  if (!attr || typeof attr !== "object") {
    return emptyIntel(VIRUSTOTAL_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "VirusTotal response was not recognized.");
  }

  const intel = parseObject(query, parsed?.data?.id, attr);
  lookupCache.set(cacheKey, intel);
  return intel;
}

/** Lightweight connectivity check: read-only lookup of a benign domain. */
export async function virustotalHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupVirusTotal({ indicator: "example.com", indicatorType: "domain" });
  return {
    name: VIRUSTOTAL_PROVIDER,
    configured: virustotalConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: intel.detail,
  };
}

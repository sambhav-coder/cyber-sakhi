/**
 * ThreatFox lookup client (Phase 4).
 *
 * Official API (https://threatfox.abuse.ch/api/): POST
 * https://threatfox-api.abuse.ch/api/v1/ with `Auth-Key` header.
 * Read-only queries only — search_ioc / search_hash. Never submissions.
 *
 * Resilience (diagnosed 2026-09-26): the API backend intermittently
 * returns nginx 502 across all query shapes (provider-side outage; the
 * identical contract returned HTTP 200 once the backend recovered, and a
 * bogus key gets a clean 403 unknown_auth_key — so this is neither an
 * auth nor a request-format problem). Transient 502/503/504 is retried at
 * most twice with exponential backoff; anything else fails fast with its
 * typed status. After retries, UPSTREAM_ERROR — never CONNECTED_EMPTY.
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

export const THREATFOX_PROVIDER = "ThreatFox";
const API_ENDPOINT = "https://threatfox-api.abuse.ch/api/v1/";
const LOOKUP_TIMEOUT_MS = 12_000;
/** Conservative retry: transient gateway errors only, never auth/client. */
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRIABLE_STATUS = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const lookupCache = new TtlLruCache<NormalizedThreatIntel>(30 * 60_000, 1024);

function authKey(): string | null {
  const key = process.env.THREATFOX_AUTH_KEY;
  return key && key.length > 0 ? key : null;
}

export function threatfoxConfigured(): boolean {
  return authKey() !== null;
}

interface ThreatFoxRow {
  id?: string;
  ioc?: string;
  ioc_type?: string;
  ioc_type_desc?: string;
  threat_type?: string;
  threat_type_desc?: string;
  malware?: string;
  malware_printable?: string;
  confidence_level?: number;
  first_seen?: string;
  last_seen?: string;
  reference?: string;
  reporter?: string;
  tags?: string[];
  anonymous?: string;
}

interface ThreatFoxResponse {
  query_status?: string;
  data?: ThreatFoxRow[];
}

/** ThreatFox confidence_level is 0-100 when present; else null. */
function toConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value / 100;
}

function parseRow(query: IndicatorQuery, row: ThreatFoxRow): NormalizedThreatIntel {
  const malware = row.malware_printable || row.malware || null;
  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: THREATFOX_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    // Presence in ThreatFox means community-reported malicious IOC.
    verdict: "MALICIOUS",
    confidence: toConfidence(row.confidence_level),
    threatType: row.threat_type ?? null,
    malwareFamily: malware && malware.length > 0 ? malware : null,
    firstSeen: asIsoDate(row.first_seen),
    lastSeen: asIsoDate(row.last_seen),
    reference: row.reference ?? null,
    rawSourceId: row.id !== undefined ? String(row.id) : null,
    sourceUrl: row.id ? `https://threatfox.abuse.ch/ioc/${row.id}/` : "https://threatfox.abuse.ch/",
    fetchedAt: new Date().toISOString(),
    detail:
      `threat_type=${row.threat_type ?? "unknown"}` +
      (Array.isArray(row.tags) && row.tags.length > 0 ? ` tags=${row.tags.slice(0, 8).join(",")}` : "") +
      (row.reporter ? ` reporter=${row.reporter}` : ""),
  };
}

/**
 * Search one indicator (url/domain/ip via search_ioc, hash via
 * search_hash). Email addresses are not sent to ThreatFox (caller routing
 * responsibility; double-guarded here). Never throws.
 */
export async function lookupThreatFox(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const key = authKey();
  if (!key) {
    return emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "THREATFOX_AUTH_KEY is not configured.");
  }
  if (query.indicatorType === "email") {
    return emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", "Email addresses are not queried against ThreatFox.");
  }

  const cacheKey = `${query.indicatorType}:${query.indicator.toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  const body =
    query.indicatorType === "hash"
      ? { query: "search_hash", hash: query.indicator }
      : { query: "search_ioc", search_term: query.indicator, exact_match: true };

  let response: Response;
  let attempts = 0;
  for (;;) {
    try {
      response = await providerFetch(
        API_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Auth-Key": key,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "Cyber-Sakhi-Intel/1.0",
          },
          body: JSON.stringify(body),
        },
        LOOKUP_TIMEOUT_MS,
      );
    } catch (error) {
      return emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
    }
    // Retry transient gateway errors only (max 2, exponential backoff).
    // 400/401/403 and all other outcomes fail fast — retrying auth or
    // client errors would hammer ThreatFox for no benefit.
    if (!RETRIABLE_STATUS.has(response.status) || attempts >= MAX_RETRIES) break;
    attempts += 1;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1));
  }

  if (!response.ok) {
    return emptyIntel(
      THREATFOX_PROVIDER,
      "EXTERNAL_PROVIDER",
      query,
      statusFromHttp(response.status),
      attempts > 0
        ? `HTTP ${response.status} from ThreatFox after ${attempts} retr${attempts === 1 ? "y" : "ies"}.`
        : `HTTP ${response.status} from ThreatFox.`,
    );
  }

  const parsed = (await safeJson(response)) as ThreatFoxResponse | null;
  const status = typeof parsed?.query_status === "string" ? parsed.query_status : null;
  if (status === null) {
    return emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "ThreatFox response was not recognized.");
  }
  if (status === "no_result" || status === "no_results") {
    const intel = emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "Indicator not present in ThreatFox.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  if (status !== "ok") {
    // illegal_search_term, illegal_hash, etc.
    const mapped =
      status === "illegal_search_term" || status === "illegal_hash"
        ? "BAD_REQUEST"
        : status === "unknown_auth_key"
          ? "AUTH_FAILED"
          : "UPSTREAM_ERROR";
    return emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, mapped, `ThreatFox query_status=${status}.`);
  }

  const rows = Array.isArray(parsed?.data) ? (parsed as ThreatFoxResponse).data ?? [] : [];
  if (rows.length === 0) {
    const intel = emptyIntel(THREATFOX_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "ThreatFox returned ok with no rows.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  // First row is the exact match (exact_match=true); extra rows are context.
  const intel = parseRow(query, rows[0]);
  lookupCache.set(cacheKey, intel);
  return intel;
}

/** Lightweight connectivity check: exact-match lookup of a benign IP. */
export async function threatfoxHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupThreatFox({ indicator: "8.8.8.8", indicatorType: "ip" });
  return {
    name: THREATFOX_PROVIDER,
    configured: threatfoxConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: intel.detail,
  };
}

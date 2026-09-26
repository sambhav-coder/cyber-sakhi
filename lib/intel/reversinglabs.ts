/**
 * ReversingLabs Spectra Intelligence client — RETAINED BUT DISABLED.
 *
 * Status: NOT routed by the orchestrator and NOT listed by the health
 * endpoint. VirusTotal is the active replacement. This module is kept
 * intact (client + tests) so it can be re-enabled once a Spectra
 * Intelligence username/password pair is available; re-enablement means
 * restoring its routing entries in lib/intel/orchestrator.ts.
 *
 * Official docs (https://docs.reversinglabs.com/SpectraIntelligence/):
 * base https://data.reversinglabs.com, HTTP Basic auth (username/password).
 * Read-only reputation queries only — never submissions or downloads:
 * - File reputation (TCA-0101):
 *   GET /api/databrowser/malware_presence/query/{md5|sha1|sha256}/{hash}
 *   statuses MALICIOUS/SUSPICIOUS/KNOWN/UNKNOWN; 404 = not in database.
 * - URI search (TCA-0401): POST /api/uri_index/v1/query/ with
 *   { rl: { query: { uri } } } for email/URL/IPv4/domain correlation.
 *   404 = URI not found.
 *
 * Credential reality 2026-09-26: the environment provides only
 * REVERSINGLABS_TOKEN (no USERNAME/PASSWORD pair). The client attempts
 * Basic auth with the configured material and reports the real outcome —
 * live-verified HTTP 401 -> AUTH_FAILED. No entitlement is fabricated.
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

export const REVERSINGLABS_PROVIDER = "ReversingLabs";
const BASE_URL = "https://data.reversinglabs.com";
const FILE_REPUTATION_PATH = "/api/databrowser/malware_presence/query";
const URI_SEARCH_PATH = "/api/uri_index/v1/query/";
const LOOKUP_TIMEOUT_MS = 12_000;

const lookupCache = new TtlLruCache<NormalizedThreatIntel>(30 * 60_000, 512);

function basicAuthHeader(): string | null {
  const username = process.env.REVERSING_LABS_USERNAME || process.env.REVERSINGLABS_TOKEN;
  const password = process.env.REVERSING_LABS_PASSWORD || "";
  if (!username) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function reversinglabsConfigured(): boolean {
  return basicAuthHeader() !== null;
}

/** Which credential shape is in use (names only — never values). */
export function reversinglabsCredentialMode(): "username_password" | "token_only" | "none" {
  if (process.env.REVERSING_LABS_USERNAME && process.env.REVERSING_LABS_PASSWORD) return "username_password";
  if (process.env.REVERSINGLABS_TOKEN) return "token_only";
  return "none";
}

interface FileReputationResponse {
  rl?: {
    malware_presence?: {
      status?: string;
      query_hash?: Record<string, string>;
      reason?: string;
      classification?: string;
      threat_level?: number;
      trust_factor?: number;
      first_seen?: string;
      last_seen?: string;
    };
  };
}

interface UriSearchResponse {
  rl?: {
    uri_index?: {
      query_uri?: string;
      sha1_list?: string[];
      next_page_sha1?: string;
    };
  };
}

function verdictForPresence(status: string | undefined): IntelVerdict {
  switch ((status ?? "").toUpperCase()) {
    case "MALICIOUS":
      return "MALICIOUS";
    case "SUSPICIOUS":
      return "SUSPICIOUS";
    case "KNOWN":
      // KNOWN = seen goodware in RL taxonomy: an explicit non-malicious call.
      return "KNOWN_GOOD";
    default:
      return "UNKNOWN";
  }
}

function hashTypeOf(value: string): "md5" | "sha1" | "sha256" | null {
  const v = value.trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(v)) return "md5";
  if (/^[0-9a-f]{40}$/.test(v)) return "sha1";
  if (/^[0-9a-f]{64}$/.test(v)) return "sha256";
  return null;
}

function baseHeaders(auth: string): Record<string, string> {
  return {
    Authorization: auth,
    Accept: "application/json",
    "User-Agent": "Cyber-Sakhi-Intel/1.0",
  };
}

/** File/hash reputation (TCA-0101). hashes only — never file content. */
export async function lookupReversingLabsFile(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const auth = basicAuthHeader();
  if (!auth) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "No ReversingLabs credential configured (need REVERSING_LABS_USERNAME/PASSWORD).");
  }
  const hashType = hashTypeOf(query.indicator);
  if (!hashType) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", "Not a valid MD5/SHA1/SHA256 hash.");
  }

  const cacheKey = `file:${hashType}:${query.indicator.toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  let response: Response;
  try {
    response = await providerFetch(
      `${BASE_URL}${FILE_REPUTATION_PATH}/${hashType}/${query.indicator.trim().toLowerCase()}`,
      { headers: baseHeaders(auth) },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (response.status === 404) {
    const intel = emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "Hash not present in ReversingLabs reputation database.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  if (!response.ok) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromHttp(response.status), `HTTP ${response.status} from ReversingLabs file reputation.`);
  }

  const parsed = (await safeJson(response)) as FileReputationResponse | null;
  const presence = parsed?.rl?.malware_presence;
  if (!presence || typeof presence.status !== "string") {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "ReversingLabs response was not recognized.");
  }
  const intel: NormalizedThreatIntel = {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: REVERSINGLABS_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    verdict: verdictForPresence(presence.status),
    // RL exposes threat_level 0-5/trust 0-5, not a probability: no mapping invented.
    confidence: null,
    threatType: null,
    malwareFamily: presence.classification ?? null,
    firstSeen: presence.first_seen ?? null,
    lastSeen: presence.last_seen ?? null,
    reference: null,
    rawSourceId: null,
    sourceUrl: "https://docs.reversinglabs.com/SpectraIntelligence/",
    fetchedAt: new Date().toISOString(),
    detail: `malware_presence=${presence.status}` + (presence.reason ? ` reason=${presence.reason}` : ""),
  };
  lookupCache.set(cacheKey, intel);
  return intel;
}

/**
 * URI correlation search (TCA-0401): which analyzed samples reference this
 * email/URL/IPv4/domain. Returns sample SHA1s — correlation context, not a
 * verdict on the URI itself (verdict stays UNKNOWN unless file reputation
 * says otherwise downstream).
 */
export async function lookupReversingLabsUri(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const auth = basicAuthHeader();
  if (!auth) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "No ReversingLabs credential configured (need REVERSING_LABS_USERNAME/PASSWORD).");
  }

  const cacheKey = `uri:${query.indicatorType}:${query.indicator.toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  let response: Response;
  try {
    response = await providerFetch(
      `${BASE_URL}${URI_SEARCH_PATH}`,
      {
        method: "POST",
        headers: { ...baseHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ rl: { query: { uri: query.indicator } } }),
      },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (response.status === 404) {
    const intel = emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "URI not referenced by samples in ReversingLabs.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  if (!response.ok) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromHttp(response.status), `HTTP ${response.status} from ReversingLabs URI search.`);
  }

  const parsed = (await safeJson(response)) as UriSearchResponse | null;
  const list = parsed?.rl?.uri_index?.sha1_list;
  if (!Array.isArray(list)) {
    return emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "ReversingLabs URI response was not recognized.");
  }
  if (list.length === 0) {
    const intel = emptyIntel(REVERSINGLABS_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "No samples reference this URI in ReversingLabs.");
    lookupCache.set(cacheKey, intel);
    return intel;
  }
  const intel: NormalizedThreatIntel = {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: `${REVERSINGLABS_PROVIDER} URI`,
    sourceKind: "EXTERNAL_PROVIDER",
    // Correlation context only: sample references are not a verdict.
    status: "CONNECTED_DATA",
    verdict: "UNKNOWN",
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: null,
    lastSeen: null,
    reference: null,
    rawSourceId: null,
    sourceUrl: "https://docs.reversinglabs.com/SpectraIntelligence/",
    fetchedAt: new Date().toISOString(),
    detail: `${list.length} sample(s) reference this ${query.indicatorType} (SHA1 correlation, not a verdict).`,
  };
  lookupCache.set(cacheKey, intel);
  return intel;
}

/**
 * Router for ReversingLabs: hashes -> file reputation; url/domain/ip/email
 * -> URI correlation search. Never throws.
 */
export async function lookupReversingLabs(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  if (query.indicatorType === "hash") return lookupReversingLabsFile(query);
  return lookupReversingLabsUri(query);
}

/** Lightweight connectivity check: reputation lookup of a fixed benign hash. */
export async function reversinglabsHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupReversingLabsFile({
    indicator: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    indicatorType: "hash",
  });
  return {
    name: REVERSINGLABS_PROVIDER,
    configured: reversinglabsConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: `credential_mode=${reversinglabsCredentialMode()}; ${intel.detail ?? ""}`.trim(),
  };
}

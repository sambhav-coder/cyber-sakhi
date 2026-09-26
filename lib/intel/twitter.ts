/**
 * X (Twitter) API v2 recent-search client (Phase 6).
 *
 * Official docs (https://docs.x.com/x-api/posts/search/integrate/overview):
 * GET https://api.x.com/2/tweets/search/recent?query=... with
 * `Authorization: Bearer <app-only bearer token>`. Returns posts from the
 * last 7 days. Read-only; no scraping, no unofficial libraries.
 *
 * Live status 2026-09-26: the configured bearer token is accepted by the
 * API but the project quota is exhausted (HTTP 402 "credits depleted").
 * The client reports that honestly (RATE_LIMITED) instead of fake results.
 */

import {
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

export const TWITTER_PROVIDER = "X";
const RECENT_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/recent";
const LOOKUP_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 10;

const searchCache = new TtlLruCache<NormalizedThreatIntel>(10 * 60_000, 512);

function bearerToken(): string | null {
  const token = process.env.TWITTER_BEARER_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function twitterConfigured(): boolean {
  return bearerToken() !== null;
}

interface XSearchResponse {
  data?: Array<{ id?: string; text?: string; created_at?: string; author_id?: string }>;
  meta?: { result_count?: number; newest_id?: string; oldest_id?: string };
  errors?: Array<{ title?: string; detail?: string; type?: string }>;
  title?: string;
  detail?: string;
  status?: number;
}

/**
 * Search recent public posts mentioning the indicator. Results are
 * correlation context (who is talking about an indicator), never a
 * maliciousness verdict — verdict stays UNKNOWN by design.
 */
export async function lookupTwitter(query: IndicatorQuery): Promise<NormalizedThreatIntel> {
  const token = bearerToken();
  if (!token) {
    return emptyIntel(TWITTER_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "TWITTER_BEARER_TOKEN is not configured.");
  }
  if (query.indicatorType === "email") {
    return emptyIntel(TWITTER_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", "Email addresses are not searched on X.");
  }

  // Quoted exact-phrase search keeps results indicator-specific.
  const searchQuery = `"${query.indicator}" -is:retweet`;
  if (searchQuery.length > 500) {
    return emptyIntel(TWITTER_PROVIDER, "EXTERNAL_PROVIDER", query, "BAD_REQUEST", "Indicator too long for an X search query.");
  }

  const cacheKey = `${query.indicatorType}:${query.indicator.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() };

  const params = new URLSearchParams({
    query: searchQuery,
    max_results: String(MAX_RESULTS),
    "tweet.fields": "created_at,author_id",
  });

  let response: Response;
  try {
    response = await providerFetch(
      `${RECENT_SEARCH_ENDPOINT}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "Cyber-Sakhi-Intel/1.0",
        },
      },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(TWITTER_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (!response.ok) {
    const body = (await safeJson(response)) as XSearchResponse | null;
    const apiDetail = body?.detail || body?.title || null;
    // 402 credits-depleted / 403 suspended-tier: quota or entitlement, not "no mentions".
    const status = response.status === 402 ? "RATE_LIMITED" : statusFromHttp(response.status);
    return emptyIntel(
      TWITTER_PROVIDER,
      "EXTERNAL_PROVIDER",
      query,
      status,
      `HTTP ${response.status} from X API${apiDetail ? `: ${apiDetail}` : "."}`,
    );
  }

  const parsed = (await safeJson(response)) as XSearchResponse | null;
  const count = parsed?.meta?.result_count ?? (Array.isArray(parsed?.data) ? parsed.data.length : 0);
  if (!parsed || count === 0) {
    const intel = emptyIntel(TWITTER_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "No recent public posts mention this indicator.");
    searchCache.set(cacheKey, intel);
    return intel;
  }

  const first = Array.isArray(parsed.data) ? parsed.data[0] : undefined;
  const intel: NormalizedThreatIntel = {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: TWITTER_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    // Mentions are discussion context, never a verdict.
    verdict: "UNKNOWN",
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: null,
    lastSeen: null,
    reference: first?.id ? `https://x.com/i/status/${first.id}` : null,
    rawSourceId: first?.id ?? null,
    sourceUrl: "https://x.com/",
    fetchedAt: new Date().toISOString(),
    detail: `${count} recent public post(s) mention this ${query.indicatorType} (discussion context, not a verdict).`,
  };
  searchCache.set(cacheKey, intel);
  return intel;
}

/** Lightweight connectivity check: one small recent-search request. */
export async function twitterHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupTwitter({ indicator: "cybersecurity", indicatorType: "domain" });
  return {
    name: TWITTER_PROVIDER,
    configured: twitterConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: intel.detail,
  };
}

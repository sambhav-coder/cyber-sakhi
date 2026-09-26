/**
 * Shared threat-intelligence provider foundation (Phases 2 + 14 + 15).
 *
 * One normalized schema for every external/internal/model-derived source.
 * Failure is ALWAYS explicit: a provider that cannot answer returns a
 * typed ProviderStatus — never zero records masquerading as "clean".
 *
 * Security: no secrets are logged, stored, or returned. Auth material is
 * read from server-side environment only, at call time.
 */

/** Indicator kinds the orchestrator can route. */
export type IntelIndicatorType =
  | "url"
  | "domain"
  | "ip"
  | "hash"
  | "email";

/** Normalized indicator query (values pre-normalized by the orchestrator). */
export interface IndicatorQuery {
  indicator: string;
  indicatorType: IntelIndicatorType;
}

/**
 * Explicit provider states. CONNECTED_EMPTY (asked, answered: nothing
 * known) is distinct from every failure state; UNKNOWN verdicts stay
 * UNKNOWN unless the provider explicitly clears the indicator.
 */
export type ProviderStatus =
  | "CONNECTED_DATA"
  | "CONNECTED_EMPTY"
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR";

/** Verdict vocabulary. No SAFE-by-default: absence of data is UNKNOWN. */
export type IntelVerdict = "MALICIOUS" | "SUSPICIOUS" | "KNOWN_GOOD" | "UNKNOWN";

/** Provider family: external feed vs internal DB vs derived model output. */
export type IntelSourceKind = "EXTERNAL_PROVIDER" | "INTERNAL_DB" | "MODEL_DERIVED";

/** One normalized provider answer for one indicator. */
export interface NormalizedThreatIntel {
  indicator: string;
  indicatorType: IntelIndicatorType;
  provider: string;
  sourceKind: IntelSourceKind;
  status: ProviderStatus;
  /** Null unless the provider returned an explicit assessment. */
  verdict: IntelVerdict;
  /** Null unless the provider supplied a real confidence value. */
  confidence: number | null;
  threatType: string | null;
  malwareFamily: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  reference: string | null;
  /** Provider-side record id (URLhaus id, ThreatFox id, ...). */
  rawSourceId: string | null;
  sourceUrl: string | null;
  fetchedAt: string;
  /** Short human reason, e.g. "HTTP 401 from provider". Never secrets. */
  detail: string | null;
}

/** Health snapshot for one provider (no secrets, ever). */
export interface ProviderHealth {
  name: string;
  configured: boolean;
  status: ProviderStatus;
  lastCheckedAt: string;
  latencyMs: number | null;
  detail: string | null;
}

export interface ProviderResult {
  intel: NormalizedThreatIntel[];
  health: ProviderHealth;
}

export function emptyIntel(
  provider: string,
  sourceKind: IntelSourceKind,
  query: IndicatorQuery,
  status: ProviderStatus,
  detail: string | null = null,
): NormalizedThreatIntel {
  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider,
    sourceKind,
    status,
    verdict: "UNKNOWN",
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: null,
    lastSeen: null,
    reference: null,
    rawSourceId: null,
    sourceUrl: null,
    fetchedAt: new Date().toISOString(),
    detail,
  };
}

/** Map transport/HTTP outcome to a ProviderStatus (no body inspection). */
export function statusFromHttp(statusCode: number): ProviderStatus {
  if (statusCode === 200 || statusCode === 201) return "CONNECTED_DATA";
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "AUTH_FAILED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode >= 500) return "UPSTREAM_ERROR";
  return "UPSTREAM_ERROR";
}

export class IntelTimeoutError extends Error {
  constructor(message = "Provider request timed out.") {
    super(message);
    this.name = "IntelTimeoutError";
  }
}

/**
 * Secret-safe fetch: bounded timeout, no credential logging. Callers pass
 * fully-formed headers; this helper never inspects or prints them.
 */
export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new IntelTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Classify a caught fetch error into a status (transport layer only). */
export function statusFromError(error: unknown): ProviderStatus {
  if (error instanceof IntelTimeoutError) return "TIMEOUT";
  return "NETWORK_ERROR";
}

/** Parse JSON defensively: null on any malformed body (never throws). */
export async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** ISO date or null (providers use mixed formats; never invent dates). */
export function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // abuse.ch uses "YYYY-MM-DD HH:mm:ss UTC".
  const trimmed = value.trim().replace(/\s+UTC$/, "");
  const t = Date.parse(trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

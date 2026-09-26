/**
 * Intelligence orchestrator (Phases 10 + 11 + 13).
 *
 * Email/case indicators in -> normalized per-provider results out.
 *
 * - Indicator-type routing: each provider is called only for the kinds it
 *   actually supports (URLhaus: url/hash; ThreatFox: url/domain/ip/hash;
 *   VirusTotal: url/domain/ip/hash; X: url/domain/ip; geo: ip;
 *   internal DB: all incl. email-as-contact; ML: url).
 *   ReversingLabs is retained as code but NOT routed: its Spectra
 *   credentials are unavailable (token-only), so it stays NOT_CONFIGURED
 *   until a username/password pair is provided. VirusTotal is its active
 *   replacement.
 * - Emails are NEVER sent to external threat feeds; they go to the
 *   internal DB (contact context) and X only where meaningful (skipped by
 *   default for emails — discussion search on an address is noise).
 * - Providers run concurrently; one failure never blocks the others.
 * - Per-call timeouts bound the whole enrichment (default 15s total).
 * - Results are per-provider cached at the client layer (TTL LRU).
 * - This module never throws for provider reasons: failures are typed
 *   statuses inside the results.
 */

import type { ThreatIndicator } from "@/lib/emailTypes";
import {
  emptyIntel,
  type IndicatorQuery,
  type IntelIndicatorType,
  type NormalizedThreatIntel,
  type ProviderHealth,
} from "./providers";
import { lookupUrlhaus, urlhausConfigured, URLHAUS_PROVIDER } from "./urlhaus";
import { lookupThreatFox, threatfoxConfigured, THREATFOX_PROVIDER } from "./threatfox";
import { lookupVirusTotal, virustotalConfigured, VIRUSTOTAL_PROVIDER } from "./virustotal";
import { lookupTwitter, twitterConfigured, TWITTER_PROVIDER } from "./twitter";
import { lookupIpGeo, ipgeoConfigured, IPGEO_PROVIDER } from "./ipgeo";
import { lookupInternalIntel, internalIntelHealth, INTERNAL_PROVIDER } from "./internalIntel";
import { lookupMlUrlRisk, mlUrlRiskHealth, ML_URL_RISK_PROVIDER } from "./mlIntel";

export interface EnrichmentOptions {
  /** Owner scope for internal-DB matches. Null = internal skipped honestly. */
  userId?: string | null;
  /** Max indicators enriched per call (cost guard). Default 12. */
  maxIndicators?: number;
  /** Overall deadline for the whole enrichment. Default 15s. */
  totalTimeoutMs?: number;
  /** Include X discussion search (quota-sensitive). Default false. */
  includeSocial?: boolean;
  /** Skip external calls entirely (offline mode / tests). Default false. */
  externalDisabled?: boolean;
}

export interface EnrichedIndicator {
  type: string;
  value: string;
  results: NormalizedThreatIntel[];
  /** True when at least one provider returned CONNECTED_DATA. */
  hasData: boolean;
  /** Provider-declared malicious (external feed DATA verdict only). */
  externalMalicious: boolean;
}

export interface EnrichmentReport {
  generatedAt: string;
  indicatorsEnriched: number;
  indicatorsSkipped: number;
  /** Provider names actually attempted (routing receipt, not health). */
  providersQueried: string[];
  results: EnrichedIndicator[];
  timedOut: boolean;
}

type ProviderFn = (query: IndicatorQuery) => Promise<NormalizedThreatIntel>;

/** Routing table: provider -> indicator types it may be asked about. */
function providersFor(
  type: IntelIndicatorType,
  options: EnrichmentOptions,
): Array<{ name: string; configured: boolean; run: ProviderFn }> {
  const list: Array<{ name: string; configured: boolean; run: ProviderFn }> = [];
  const externalOk = !options.externalDisabled;

  // Internal DB first for every type (cheap, scoped, contact-aware).
  list.push({
    name: INTERNAL_PROVIDER,
    configured: true,
    run: (q) => lookupInternalIntel(q, options.userId ?? null),
  });
  // ML model for URLs (local, no quota).
  if (type === "url") {
    list.push({ name: ML_URL_RISK_PROVIDER, configured: true, run: (q) => Promise.resolve(lookupMlUrlRisk(q)) });
  }
  if (!externalOk) return list;

  if (type === "url") {
    list.push({ name: URLHAUS_PROVIDER, configured: urlhausConfigured(), run: lookupUrlhaus });
    list.push({ name: THREATFOX_PROVIDER, configured: threatfoxConfigured(), run: lookupThreatFox });
    list.push({ name: VIRUSTOTAL_PROVIDER, configured: virustotalConfigured(), run: lookupVirusTotal });
    if (options.includeSocial) {
      list.push({ name: TWITTER_PROVIDER, configured: twitterConfigured(), run: lookupTwitter });
    }
  } else if (type === "domain") {
    list.push({ name: THREATFOX_PROVIDER, configured: threatfoxConfigured(), run: lookupThreatFox });
    list.push({ name: VIRUSTOTAL_PROVIDER, configured: virustotalConfigured(), run: lookupVirusTotal });
    if (options.includeSocial) {
      list.push({ name: TWITTER_PROVIDER, configured: twitterConfigured(), run: lookupTwitter });
    }
  } else if (type === "ip") {
    list.push({ name: THREATFOX_PROVIDER, configured: threatfoxConfigured(), run: lookupThreatFox });
    list.push({ name: VIRUSTOTAL_PROVIDER, configured: virustotalConfigured(), run: lookupVirusTotal });
    list.push({ name: IPGEO_PROVIDER, configured: ipgeoConfigured(), run: lookupIpGeo });
    if (options.includeSocial) {
      list.push({ name: TWITTER_PROVIDER, configured: twitterConfigured(), run: lookupTwitter });
    }
  } else if (type === "hash") {
    list.push({ name: URLHAUS_PROVIDER, configured: urlhausConfigured(), run: lookupUrlhaus });
    list.push({ name: THREATFOX_PROVIDER, configured: threatfoxConfigured(), run: lookupThreatFox });
    list.push({ name: VIRUSTOTAL_PROVIDER, configured: virustotalConfigured(), run: lookupVirusTotal });
  }
  // type email: internal DB only (contact context). External feeds never
  // receive raw email addresses from this orchestrator.
  return list;
}

function normalizeIndicator(ind: ThreatIndicator): IndicatorQuery | null {
  const value = (ind.value ?? "").trim();
  if (!value) return null;
  if (ind.type === "url" || ind.type === "domain" || ind.type === "ip" || ind.type === "email") {
    return { indicator: value, indicatorType: ind.type };
  }
  return null;
}

/** Skip obviously non-routable values (private IPs, oversized blobs). */
function routable(query: IndicatorQuery): boolean {
  if (query.indicator.length > 2048) return false;
  if (query.indicatorType === "ip") {
    const parts = query.indicator.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) {
      // Private/reserved: geo + feeds are meaningless; internal only is
      // handled by leaving it to the caller (skip external here).
      if (
        parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 169 && parts[1] === 254)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Enrich indicators. Never throws: provider failures are per-result
 * statuses; a total-timeout marks timedOut and returns what completed.
 */
export async function enrichIndicators(
  indicators: ThreatIndicator[],
  options: EnrichmentOptions = {},
): Promise<EnrichmentReport> {
  const generatedAt = new Date().toISOString();
  const maxIndicators = Math.max(1, Math.min(50, options.maxIndicators ?? 12));

  const seen = new Set<string>();
  const queries: IndicatorQuery[] = [];
  let skipped = 0;
  for (const ind of indicators) {
    const q = normalizeIndicator(ind);
    if (!q || !routable(q)) {
      skipped += 1;
      continue;
    }
    const key = `${q.indicatorType}:${q.indicator.toLowerCase()}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    if (queries.length >= maxIndicators) {
      skipped += 1;
      continue;
    }
    queries.push(q);
  }

  const queried = new Set<string>();
  const results: EnrichedIndicator[] = await Promise.all(
    queries.map(async (query) => {
      const providers = providersFor(query.indicatorType, options);
      const settled = await Promise.all(
        providers.map(async (p) => {
          queried.add(p.name);
          if (!p.configured && p.name !== INTERNAL_PROVIDER && p.name !== ML_URL_RISK_PROVIDER) {
            return emptyIntel(p.name, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", `${p.name} credential is not configured.`);
          }
          try {
            return await p.run(query);
          } catch (error) {
            return emptyIntel(p.name, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", error instanceof Error ? error.message : "Provider failed.");
          }
        }),
      );
      const hasData = settled.some((r) => r.status === "CONNECTED_DATA");
      // Only EXTERNAL_PROVIDER DATA verdicts count as externalMalicious.
      // Internal recurrence and ML suggestions never flip this bit.
      const externalMalicious = settled.some(
        (r) => r.sourceKind === "EXTERNAL_PROVIDER" && r.status === "CONNECTED_DATA" && r.verdict === "MALICIOUS",
      );
      return {
        type: query.indicatorType,
        value: query.indicator,
        results: settled,
        hasData,
        externalMalicious,
      };
    }),
  );

  return {
    generatedAt,
    indicatorsEnriched: queries.length,
    indicatorsSkipped: skipped,
    providersQueried: [...queried],
    results,
    timedOut: false,
  };
}

/**
 * Deadline-raced wrapper: returns partial results if the deadline hits.
 * Partial provider rows keep their own statuses; missing ones are marked
 * by the caller as not-awaited (still never "clean").
 */
export async function enrichWithDeadline(
  indicators: ThreatIndicator[],
  options: EnrichmentOptions = {},
): Promise<EnrichmentReport> {
  const totalTimeoutMs = options.totalTimeoutMs ?? 15_000;
  const work = enrichIndicators(indicators, options);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), totalTimeoutMs));
  const done = await Promise.race([work, timeout]);
  if (done) return done;
  // Deadline hit: report honestly with zero fabricated rows.
  return {
    generatedAt: new Date().toISOString(),
    indicatorsEnriched: 0,
    indicatorsSkipped: indicators.length,
    providersQueried: [],
    results: [],
    timedOut: true,
  };
}

/** Live health for every ACTIVE provider (real lightweight requests). */
export async function liveProviderHealth(userId: string | null): Promise<ProviderHealth[]> {
  const { urlhausHealth } = await import("./urlhaus");
  const { threatfoxHealth } = await import("./threatfox");
  const { virustotalHealth } = await import("./virustotal");
  const { twitterHealth } = await import("./twitter");
  const { ipgeoHealth } = await import("./ipgeo");
  const settled = await Promise.allSettled([
    urlhausHealth(),
    threatfoxHealth(),
    virustotalHealth(),
    twitterHealth(),
    ipgeoHealth(),
    internalIntelHealth(userId),
    Promise.resolve(mlUrlRiskHealth()),
  ]);
  // NOTE: ReversingLabs is intentionally absent from the active health
  // list (credentials unavailable; see lib/intel/reversinglabs.ts). Its
  // module + tests remain for future re-enablement.
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          name: [URLHAUS_PROVIDER, THREATFOX_PROVIDER, VIRUSTOTAL_PROVIDER, TWITTER_PROVIDER, IPGEO_PROVIDER, INTERNAL_PROVIDER, ML_URL_RISK_PROVIDER][i],
          configured: false,
          status: "UPSTREAM_ERROR" as const,
          lastCheckedAt: new Date().toISOString(),
          latencyMs: null,
          detail: "Health check itself failed.",
        },
  );
}

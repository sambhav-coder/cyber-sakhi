/**
 * IP geolocation provider client (Phase 7).
 *
 * Primary: ipgeolocation.io v2 (IPGEOLOCATION_API_KEY, live-verified
 * 2026-09-26: real country/region/city/lat-lon for 8.8.8.8). The free-plan
 * response carries no ASN/org/timezone — those stay null, never invented.
 *
 * Every result is labeled "indicator geolocation": it describes a network
 * indicator, never a case jurisdiction. State/District values are never
 * derived from it.
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

export const IPGEO_PROVIDER = "ipgeolocation.io";
const GEO_ENDPOINT = "https://api.ipgeolocation.io/v2/ipgeo";
const LOOKUP_TIMEOUT_MS = 10_000;

const geoCache = new TtlLruCache<NormalizedThreatIntel>(60 * 60_000, 1024);

export interface IndicatorGeo {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  asn: string | null;
  ispOrOrg: string | null;
  timezone: string | null;
}

function apiKey(): string | null {
  const key = process.env.IPGEOLOCATION_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function ipgeoConfigured(): boolean {
  return apiKey() !== null;
}

interface IpgeoLocation {
  country_name?: string;
  country_code2?: string;
  state_prov?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
  district?: string;
}

interface IpgeoResponse {
  ip?: string;
  location?: IpgeoLocation;
  message?: string;
}

function numOrNull(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseIpgeo(body: IpgeoResponse, ip: string): IndicatorGeo {
  const loc = body.location ?? {};
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  return {
    country: str(loc.country_name),
    countryCode: str(loc.country_code2),
    region: str(loc.state_prov),
    city: str(loc.city),
    latitude: numOrNull(loc.latitude),
    longitude: numOrNull(loc.longitude),
    // Free-plan responses carry no ASN/org/timezone: null, never invented.
    asn: null,
    ispOrOrg: null,
    timezone: null,
  };
}

/** Keyed geolocation lookup for one IPv4/IPv6 indicator. Never throws. */
export async function lookupIpGeo(query: IndicatorQuery): Promise<NormalizedThreatIntel & { geo?: IndicatorGeo }> {
  const key = apiKey();
  if (!key) {
    return emptyIntel(IPGEO_PROVIDER, "EXTERNAL_PROVIDER", query, "NOT_CONFIGURED", "IPGEOLOCATION_API_KEY is not configured.");
  }

  const cacheKey = `geo:${query.indicator.toLowerCase()}`;
  const cached = geoCache.get(cacheKey);
  if (cached) return { ...cached, fetchedAt: new Date().toISOString() } as NormalizedThreatIntel & { geo?: IndicatorGeo };

  const params = new URLSearchParams({ ip: query.indicator });
  let response: Response;
  try {
    response = await providerFetch(
      `${GEO_ENDPOINT}?apiKey=${encodeURIComponent(key)}&${params.toString()}`,
      { headers: { Accept: "application/json", "User-Agent": "Cyber-Sakhi-Intel/1.0" } },
      LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    return emptyIntel(IPGEO_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromError(error), error instanceof Error ? error.message : "Request failed.");
  }

  if (!response.ok) {
    return emptyIntel(IPGEO_PROVIDER, "EXTERNAL_PROVIDER", query, statusFromHttp(response.status), `HTTP ${response.status} from ipgeolocation.io.`);
  }

  const parsed = (await safeJson(response)) as IpgeoResponse | null;
  if (!parsed || typeof parsed.location !== "object") {
    return emptyIntel(IPGEO_PROVIDER, "EXTERNAL_PROVIDER", query, "UPSTREAM_ERROR", "ipgeolocation.io response was not recognized.");
  }

  const geo = parseIpgeo(parsed, query.indicator);
  // 423/reserved IPs come back without a location: honest empty, not a place.
  if (!geo.country && !geo.city && geo.latitude === null) {
    const intel = emptyIntel(IPGEO_PROVIDER, "EXTERNAL_PROVIDER", query, "CONNECTED_EMPTY", "No geolocation for this IP (reserved/private or unknown).");
    geoCache.set(cacheKey, intel);
    return intel;
  }

  const intel: NormalizedThreatIntel & { geo?: IndicatorGeo } = {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: IPGEO_PROVIDER,
    sourceKind: "EXTERNAL_PROVIDER",
    status: "CONNECTED_DATA",
    // Geolocation is placement context, never a maliciousness verdict.
    verdict: "UNKNOWN",
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: null,
    lastSeen: null,
    reference: null,
    rawSourceId: null,
    sourceUrl: "https://ipgeolocation.io/",
    fetchedAt: new Date().toISOString(),
    detail: `indicator geolocation: ${[geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "unplaced"} (not a case jurisdiction)`,
    geo,
  };
  geoCache.set(cacheKey, intel);
  return intel;
}

/** Lightweight connectivity check: geolocate a fixed public resolver IP. */
export async function ipgeoHealth(): Promise<ProviderHealth> {
  const started = Date.now();
  const intel = await lookupIpGeo({ indicator: "8.8.8.8", indicatorType: "ip" });
  return {
    name: IPGEO_PROVIDER,
    configured: ipgeoConfigured(),
    status: intel.status,
    lastCheckedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    detail: intel.detail,
  };
}

import { IPIntelligence } from "./emailTypes";
import { TtlLruCache } from "./intel/geoCache";
import { lookupIpGeo } from "./intel/ipgeo";

interface IpApiResponse {
  ip?: string;
  city?: string;
  region?: string;
  country_name?: string;
  asn?: string;
  org?: string;
  error?: boolean;
  reason?: string;
  message?: string;
}

const ipGeoCache = new TtlLruCache<IPIntelligence>(30 * 60_000, 1024);

function isPrivateOrReservedIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  if (parts.some((part) => part < 0 || part > 255)) {
    return true;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  return false;
}

async function fetchIpGeo(ip: string): Promise<IPIntelligence | undefined> {
  try {
    const response = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Cyber-Sakhi/1.0",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as IpApiResponse;

    if (data.error || !data.ip) {
      return undefined;
    }

    return {
      ip: data.ip,
      country: data.country_name,
      region: data.region,
      city: data.city,
      organization: data.org,
      asn: data.asn,
    };
  } catch {
    return undefined;
  }
}

export async function lookupIpIntelligence(
  ip: string,
  cache = ipGeoCache
): Promise<IPIntelligence | undefined> {
  if (!ip || isPrivateOrReservedIp(ip)) {
    return undefined;
  }

  const cached = cache.get(ip);
  if (cached) return cached;

  // Preferred: keyed ipgeolocation.io (accurate city/lat-lon). It carries
  // no ASN/org, so a keyed hit without org keeps org/asn undefined rather
  // than borrowing them from elsewhere.
  try {
    const keyed = await lookupIpGeo({ indicator: ip, indicatorType: "ip" });
    if (keyed.status === "CONNECTED_DATA" && keyed.geo) {
      const g = keyed.geo;
      const result: IPIntelligence = {
        ip,
        country: g.country ?? undefined,
        region: g.region ?? undefined,
        city: g.city ?? undefined,
        organization: undefined,
        asn: undefined,
      };
      cache.set(ip, result);
      return result;
    }
  } catch {
    // Fall through to the keyless provider below.
  }

  const result = await fetchIpGeo(ip);
  if (result) cache.set(ip, result);
  return result;
}

export interface ProxyEnrichment {
  ip: string;
  /** none | vpn | tor | datacenter | unknown — a heuristic outcome. */
  kind: "none" | "vpn" | "tor" | "datacenter" | "unknown";
  /** 0..1 — transparency-limited confidence of the heuristic. */
  confidence: number;
  note: string;
}

const VPN_ORG_PATTERNS =
  /\b(vpn|virtual private network|proxy|anonymi[sz]|nordvpn|expressvpn|surfshark|privateinternetaccess|protonvpn|hide\.me|mullvad|cyberghost|ipvanish|tunnelbear|windscribe)\b/i;

const DATACENTER_ORG_PATTERNS =
  /\b(amazon|amazonaws|aws|microsoft azure|azure|google cloud|gcp|digitalocean|linode|vultr|ovh|hetzner|leaseweb|scaleway|voxility|psychz|quadranet|choopa|constant|server|hosting|datacenter|colo[c]?ation|dedicated|cloud provider|kinzinger|interoute|level9|broadreach|webhost|site ground|bluehost|hostinger|contabo|iovupert|cloudflare|fastly|rackspace|cogent)\b/i;

/**
 * VPN / TOR / datacenter screening.
 *
 * Honesty: without a commercial proxy-IP feed this is heuristic — org-name
 * patterns plus the Tor Project's public exit-node list. A "vpn" result means
 * "the ASN/org looks like a hosting/VPN provider", never "a human is using a
 * VPN". Missing list data degrades to "unknown", never to a verdict.
 */
export async function checkProxy(
  ip: string,
  ipInfo: IPIntelligence | undefined,
  deps: {
    fetchTorExitList?: () => Promise<Set<string> | null>;
    now?: () => number;
  } = {}
): Promise<ProxyEnrichment> {
  const org = ipInfo?.organization ?? "";
  const asn = ipInfo?.asn ?? "";

  const torHits = await getTorExitList(ip, deps);
  if (torHits?.has(ip)) {
    return {
      ip,
      kind: "tor",
      confidence: 0.9,
      note: "IP appears in the Tor Project's public exit-node list.",
    };
  }

  if (VPN_ORG_PATTERNS.test(`${org} ${asn}`)) {
    return {
      ip,
      kind: "vpn",
      confidence: 0.5,
      note: `ASN/org "${org || asn || "unknown"}" matches VPN/proxy naming patterns. Heuristic — not proof the sender used a VPN.`,
    };
  }

  if (DATACENTER_ORG_PATTERNS.test(`${org} ${asn}`)) {
    return {
      ip,
      kind: "datacenter",
      confidence: 0.4,
      note: `ASN/org "${org || asn || "unknown"}" looks like a datacenter/cloud host, common for botnets and bulk phishing infrastructure. Heuristic.`,
    };
  }

  return {
    ip,
    kind: torHits == null ? "unknown" : "none",
    confidence: torHits == null ? 0 : 0.3,
    note:
      torHits == null
        ? "Tor exit-list was unavailable; no VPN/DC markers detected either."
        : "No VPN, Tor or datacenter markers detected.",
  };
}

const TOR_LIST_TTL_MS = 30 * 60_000;
let torExitCache: { at: number; list: Set<string> } | null = null;

async function getTorExitList(
  ip: string,
  deps: { fetchTorExitList?: () => Promise<Set<string> | null>; now?: () => number }
): Promise<Set<string> | null> {
  const now = deps.now ?? Date.now;
  if (deps.fetchTorExitList) {
    return deps.fetchTorExitList();
  }
  if (torExitCache && now() - torExitCache.at < TOR_LIST_TTL_MS) {
    return torExitCache.list;
  }
  try {
    const res = await fetch(
      `https://check.torproject.org/cgi-bin/TorBulkExitList.py?ip=${encodeURIComponent(ip)}&port=25`,
      { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const list = new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^\d{1,3}(\.\d{1,3}){3}$/.test(l))
    );
    torExitCache = { at: now(), list };
    return list;
  } catch {
    return null;
  }
}
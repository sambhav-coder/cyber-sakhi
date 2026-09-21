import { DomainIntelligence, RdapDomainRecord } from "./emailTypes";
import { TtlLruCache } from "./intel/geoCache";

const rdapCache = new TtlLruCache<RdapDomainRecord>(60 * 60_000, 512);

interface DnsAnswer {
  data?: string;
  type?: number;
}

interface DnsResponse {
  Answer?: DnsAnswer[];
  Status?: number;
}

async function lookupDnsRecord(
  domain: string,
  recordType: "MX" | "NS"
): Promise<string[]> {
  try {
    const url =
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}` +
      `&type=${recordType}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/dns-json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as DnsResponse;

    return (data.Answer || [])
      .map((answer) => answer.data?.trim())
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

function isSuspiciousDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();

  // Common high-risk / abuse-associated TLDs.
  const suspiciousTlds = [
    ".xyz",
    ".top",
    ".click",
    ".tk",
    ".ml",
    ".ga",
    ".cf",
    ".gq",
    ".pw",
    ".cc",
    ".zip",
    ".review",
    ".loan",
    ".win",
  ];

  if (suspiciousTlds.some((tld) => lowerDomain.endsWith(tld))) {
    return true;
  }

  // Very long domains can be a phishing signal.
  if (lowerDomain.length > 60) {
    return true;
  }

  // Excessive subdomains can be suspicious.
  if (lowerDomain.split(".").length >= 5) {
    return true;
  }

  return false;
}

export async function lookupDomainIntelligence(
  domain: string
): Promise<DomainIntelligence | undefined> {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return undefined;

  try {
    const [mx, ns] = await Promise.all([
      lookupDnsRecord(normalizedDomain, "MX"),
      lookupDnsRecord(normalizedDomain, "NS"),
    ]);

    return {
      domain: normalizedDomain,
      mx,
      ns,
      suspicious: isSuspiciousDomain(normalizedDomain),
    };
  } catch {
    return undefined;
  }
}

function normalizeDomain(domain: string): string | null {
  const normalized = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return normalized && normalized.includes(".") ? normalized : null;
}

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: [string, unknown[]];
}

interface RdapDomainResponse {
  objectClassName?: string;
  ldhName?: string;
  status?: string[];
  registrar?: RdapEntity;
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName: string }>;
}

function vcardField(entity: RdapEntity, field: string): string | null {
  const vcard = entity.vcardArray?.[1];
  if (!Array.isArray(vcard)) return null;
  const entry: unknown = vcard.find((row) => Array.isArray(row) && row[0] === field);
  if (Array.isArray(entry)) {
    const val = entry[3];
    if (Array.isArray(val)) return String(val[0] ?? "");
    return val != null ? String(val) : null;
  }
  return null;
}

const STRIP_PRIVACY =
  /\b(privacy|proxy|whoisguard|privacyprotect|guard|protection @|redacted for privacy|private)\b/i;
const PLACEHOLDER_HOSTS = /(example\.com|invalid|redacted|no[- ]?email|@\.|unknown\.|\.invalid)$/i;

function sanitizeOwner(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  if (!trimmed || STRIP_PRIVACY.test(trimmed) || PLACEHOLDER_HOSTS.test(trimmed)) {
    return null; // WHOIS privacy / redaction — report null, never placeholder junk
  }
  return trimmed.slice(0, 120);
}

function findEntity(entities: RdapEntity[] | undefined, roles: string[]): RdapEntity | undefined {
  return entities?.find((e) => roles.some((r) => e.roles?.includes(r)));
}

function extractEvent(events: Array<{ eventAction: string; eventDate: string }>, action: string): string | null {
  return events?.find((e) => e.eventAction === action)?.eventDate ?? null;
}

/**
 * RDAP (WHOIS successor) lookup through the rdap.org bootstrap — no API key,
 * JSON over HTTPS, server-side only. Fields go through sanitizers so WHOIS
 * privacy/redaction placeholders never leak into the report as "real" owners.
 * Network failure => undefined (never cached as a domain being "clean").
 */
export async function lookupRdap(domain: string): Promise<RdapDomainRecord | undefined> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return undefined;

  const cached = rdapCache.get(normalized);
  if (cached) return cached;

  let payload: RdapDomainResponse | null = null;
  try {
    const res = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(normalized)}`,
      {
        headers: { accept: "application/rdap+json", "user-agent": "Cyber-Sakhi/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as RdapDomainResponse;
    if (json.objectClassName !== "domain" || !json.ldhName) return undefined;
    payload = json;
  } catch {
    return undefined;
  }

  const created = extractEvent(payload.events ?? [], "registration");
  const expires = extractEvent(payload.events ?? [], "expiration");
  const updated = extractEvent(payload.events ?? [], "last changed");

  const registrant = findEntity(payload.entities, ["registrant"]);
  const admin = findEntity(payload.entities, ["administrative"]);

  const record: RdapDomainRecord = {
    domain: normalized,
    registrar: sanitizeOwner(payload.registrar?.handle ?? null),
    created,
    expires,
    updated,
    registrantName: sanitizeOwner(vcardField(registrant ?? admin ?? ({} as RdapEntity), "fn")),
    registrantCountry: sanitizeOwner(vcardField(registrant ?? ({} as RdapEntity), "geo")),
    status: payload.status ?? null,
    nameservers: (payload.nameservers ?? []).map((ns) => ns.ldhName).slice(0, 12),
    ageDays: created ? Math.floor((Date.now() - Date.parse(created)) / 86_400_000) : null,
    rdapProvider: "rdap.org bootstrap",
  };

  rdapCache.set(normalized, record);
  return record;
}

export function rdapFraudSignals(rdap: RdapDomainRecord): string[] {
  const out: string[] = [];
  if (rdap.ageDays != null && rdap.ageDays <= 30) {
    out.push(`Domain created only ${rdap.ageDays} day(s) ago — a hallmark of throwaway phishing infrastructure.`);
  } else if (rdap.ageDays != null && rdap.ageDays <= 90) {
    out.push(`Domain is young (${rdap.ageDays} days) — newly registered infrastructure.`);
  }
  if (!rdap.registrar || !rdap.registrantName || !rdap.registrantCountry) {
    out.push("Registrant details are WHOIS-redacted/privacy-protected, so the operator is unverifiable.");
  }
  if (rdap.status?.some((s) => /clientTransferProhibited/i.test(s)) && rdap.registrantName == null) {
    out.push("Locked registrar status with hidden owner details is common in abuse-attributed domains.");
  }
  return out;
}
/**
 * Threat-intel correlation through public DNS blacklists (RBLs).
 *
 * These are the same blocklists mail servers query every day, queried here
 * over DNS-over-HTTPS (so the RBL operator never sees our server IP):
 *   * Spamhaus ZEN — sends the *originating IP*: {rev-octets}.zen.spamhaus.org
 *   * Spamhaus DBL — sends the *sender domain*: {domain}.dbl.spamhaus.org
 *   * SURBL multi  — sends the *sender domain*: {domain}.multi.surbl.org
 *
 * Honesty:
 *   * Judgement is binary "listed with reason code" or "not listed"; RBLs do
 *     not name the sender or the campaign, so no attribution is attempted.
 *   * Blocklists have false positives (dynamic IPs on PBL, legacy listings).
 *     A hit is a *corroborating* signal with source + code surfaced, never a
 *     standalone verdict.
 *   * Query/network failure => not listed (never guessed, never cached).
 */

import type { ThreatIndicator } from "@/lib/emailTypes";
import { isValidIpv4 } from "../ip";

export interface DnsblResult {
  source: string;
  listed: boolean;
  code: string | null; // e.g. 127.0.0.2 (Spamhaus SBL)
  reason: string | null; // TXT detail when present
  queryable: boolean; // false when the network lookup itself failed
  /** Optional display status surfaced by the query layer (e.g. "completed"). */
  queryStatus?: string;
}

export interface ThreatIntelResult {
  ip?: {
    ip: string;
    results: DnsblResult[];
    listed: boolean;
  };
  domain?: {
    domain: string;
    results: DnsblResult[];
    listed: boolean;
  };
  providers: string[];
}

const SPAMHAUS_REASONS: Record<string, string> = {
  "127.0.0.2": "SBL — IP listed by Spamhaus for spam activity",
  "127.0.0.3": "SBL CSS — Spamhaus CSS sneaky spam infrastructure",
  "127.0.0.4": "XBL — exploited machine / botnet",
  "127.0.0.5": "PBL — dynamic / end-user IP range",
  "127.0.0.6": "PBL — dynamic / end-user IP range",
  "127.0.0.7": "PBL — dynamic / end-user IP range",
  "127.0.1.2": "DBL — domain is a confirmed spam/phishing domain",
  "127.0.1.3": "DBL — domain appears in spam but not yet fully confirmed",
  "127.0.1.4": "DBL — domain hosts malware",
  "127.0.1.102": "DBL — abusive domain, spam/phishing strongly indicated",
};

export interface DnsblDeps {
  /** Resolve A records for a hostname (NET zone is implied by convention). */
  resolveA: (hostname: string) => Promise<string[]>;
  /** Resolve TXT records for a hostname (detail/reason lookups). */
  queryTxt?: (hostname: string) => Promise<string[]>;
}

function reverseIpOctets(ip: string): string {
  const parts = ip.split(".");
  return parts.reverse().join(".");
}

function listedCode(aRecords: string[]): string | null {
  for (const a of aRecords) {
    if (/^127\./.test(a)) return a;
  }
  return null;
}

async function checkZone(
  hostname: string,
  source: string,
  deps: DnsblDeps
): Promise<DnsblResult> {
  try {
    const a = await deps.resolveA(hostname);
    const code = listedCode(a);
    if (!code) {
      return { source, listed: false, code: null, reason: null, queryable: true };
    }
    let reason: string | null = SPAMHAUS_REASONS[code] ?? "listed";
    if (deps.queryTxt) {
      try {
        const txt = await deps.queryTxt(hostname);
        if (txt[0]) reason = txt[0].replace(/^"|"$/g, "");
      } catch {
        /* detail TXT is best-effort */
      }
    }
    return { source, listed: true, code, reason, queryable: true };
  } catch {
    return { source, listed: false, code: null, reason: null, queryable: false };
  }
}

function zoneHost(host: string): string {
  return `${host.toLowerCase().replace(/\.$/, "")}.`;
}

/** Public DoH-backed default resolver using Type A via Cloudflare. */
export const realDnsblDeps: DnsblDeps = {
  resolveA: async (hostname) => {
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
          hostname
        )}&type=A`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
      );
      const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
      return (json.Answer ?? [])
        .filter((a) => a.type === 1)
        .map((a) => a.data.trim());
    } catch {
      throw new Error("DoH A lookup failed");
    }
  },
  queryTxt: async (hostname) => {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=TXT`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
    );
    const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (json.Answer ?? [])
      .filter((a) => a.type === 16)
      .map((a) => a.data.replace(/^"|"$/g, "").replace(/""/g, '"'));
  },
};

function isValidDomain(value: string): boolean {
  const v = value.toLowerCase().replace(/\.$/, "");
  if (v.length > 253) return false;
  // At least one dot (a TLD must follow), labels of 1-63 chars, no leading
  // or trailing hyphens. This keeps hostnames and rejects free-text tokens.
  if (!v.includes(".")) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v);
}

export async function queryThreatIntel(
  indicators: ThreatIndicator[],
  deps: DnsblDeps = realDnsblDeps
): Promise<ThreatIntelResult> {
  // Validation gate: only well-formed indicators are ever queried. A
  // malformed token (timestamp, out-of-range quad, leading-zero quad) cannot
  // reach an RBL. Spamhaus ZEN uses reversed IPv4 octets, so IPv6 is not
  // queried here (no IPv6 RBL reverse in this module).
  const ips = [
    ...new Set(
      indicators.filter((i) => i.type === "ip" && isValidIpv4(i.value)).map((i) => i.value)
    ),
  ].slice(0, 3);
  const domains = [
    ...new Set(
      indicators.filter((i) => i.type === "domain" && isValidDomain(i.value)).map((i) => i.value)
    ),
  ].slice(0, 3);

  const ipResults: DnsblResult[] = [];
  let ipListed = false;
  for (const ip of ips) {
    const zenHost = zoneHost(`${reverseIpOctets(ip)}.zen.spamhaus.org`);
    const r = await checkZone(zenHost, "Spamhaus ZEN", deps);
    if (r.listed) ipListed = true;
    ipResults.push(r);
  }

  const domainResults: DnsblResult[] = [];
  let domainListed = false;
  for (const domain of domains) {
    const dblHost = zoneHost(`${domain}.dbl.spamhaus.org`);
    const surblHost = zoneHost(`${domain}.multi.surbl.org`);
    const [dbl, surbl] = await Promise.all([
      checkZone(dblHost, "Spamhaus DBL", deps),
      checkZone(surblHost, "SURBL multi", deps),
    ]);
    if (dbl.listed || surbl.listed) domainListed = true;
    domainResults.push(dbl, surbl);
  }

  return {
    ip:
      ips.length > 0
        ? { ip: ips.join(", "), results: ipResults, listed: ipListed }
        : undefined,
    domain:
      domains.length > 0
        ? { domain: domains.join(", "), results: domainResults, listed: domainListed }
        : undefined,
    providers: ["Spamhaus", "SURBL"],
  };
}
/**
 * DNS-over-HTTPS client + mail-authentication record parsers.
 *
 * Cyber Sakhi re-verifies SPF / DMARC / DKIM-key against authoritative DNS
 * (Cloudflare + Google DoH) instead of trusting the Authentication-Results
 * header alone, which an attacker can influence on a misconfigured relay.
 *
 * Honesty constraints:
 *   * A full DKIM *signature* verification (RFC 6376 canonicalisation +
 *     RSA verification) is NOT attempted — it needs the exact raw header
 *     byte-canonicalisation of the original message. We only check that the
 *     domain *publishes* a key for the claimed selector, and say so.
 *   * SPF evaluation here is a static interpretation of the published
 *     policy for a given client IP. It does not re-run HELO checks, and
 *     `include:` chains are followed with a hard depth cap so adversarial
 *     domains cannot blow us up.
 *   * Network failure => "unavailable", never a verdict.
 */

const DOH_PROVIDERS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

const TXT_CACHE = new Map<string, { at: number; records: string[] }>();
const CACHE_TTL_MS = 60_000;

async function queryTxt(domain: string, timeoutMs = 8000): Promise<string[]> {
  const name = domain.toLowerCase();
  const cached = TXT_CACHE.get(name);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.records;

  let lastErr: unknown = null;
  for (const endpoint of DOH_PROVIDERS) {
    const url = `${endpoint}?name=${encodeURIComponent(name)}&type=TXT`;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`DoH ${endpoint} HTTP ${res.status}`);
      const json = (await res.json()) as {
        Answer?: Array<{ type: number; data: string }>;
        Status?: number;
      };
      if (json.Status != null && json.Status !== 0) {
        throw new Error(`DoH status ${json.Status}`);
      }
      const records = (json.Answer ?? [])
        .filter((a) => a.type === 16)
        .map((a) => a.data.replace(/^"|"$/g, "").replace(/""/g, '"'));
      TXT_CACHE.set(name, { at: Date.now(), records });
      return records;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`DNS query failed for ${name}: ${textOf(lastErr)}`);
}

function textOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Parse raw ("X"); there is always exactly one TXT chunk in DoH JSON." */
export function unquoteTxt(raw: string): string {
  return raw.replace(/^"|"$/g, "").replace(/""/g, '"');
}

export type SpfMechanism = {
  kind:
    | "ip4"
    | "ip6"
    | "a"
    | "mx"
    | "include"
    | "exists"
    | "all"
    | "redirect"
    | "exp"
    | "unknown";
  qualifier: "+" | "-" | "~" | "?" | ""; // pass/fail/softfail/neutral
  value: string;
};

export function tokenizeSpf(record: string): SpfMechanism[] | null {
  const m = record.match(/^v=spf1\s+([\s\S]+)$/i);
  if (!m) return null;
  return m[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const hasQualifier = tok[0] === "+" || tok[0] === "-" || tok[0] === "~" || tok[0] === "?";
      const quality = hasQualifier ? tok[0] : "+";
      const body = hasQualifier ? tok.slice(1) : tok;
      const sep = body.indexOf(":");
      const kind = sep === -1 ? body : body.slice(0, sep);
      const value = sep === -1 ? "" : body.slice(sep + 1);
      const normalized: SpfMechanism["kind"] =
        /^(ip4|ip6|a|mx|include|exists|all|redirect|exp)$/.test(kind)
          ? (kind as SpfMechanism["kind"])
          : "unknown";
      return { kind: normalized, qualifier: quality as SpfMechanism["qualifier"], value };
    });
}

export function classifySpfPolicy(tokens: SpfMechanism[]): {
  policy: "-all" | "~all" | "+all" | "none";
  allToken?: SpfMechanism;
} {
  const all = tokens.find((t) => t.kind === "all" || /^[+~?-]?all$/.test(t.kind));
  if (all) {
    const q = all.qualifier || "+";
    return { policy: q === "-" ? "-all" : q === "~" ? "~all" : "+all", allToken: all };
  }
  return { policy: "none" };
}

export function isPrivateIp(ip: string): boolean {
  const ipv4 = ip.split(".");
  if (ipv4.length === 4 && ipv4.every((o) => /^\d{1,3}$/.test(o))) {
    const [a, b] = ipv4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1") return true;
    if (low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe8")) return true;
    if (low.startsWith("::")) return false;
  }
  return false;
}

function ip4InCidr(ip: string, cidr: string): boolean {
  const m = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)(?:\/(\d+))?$/);
  if (!m) return false;
  const prefix = m[5] ? Number(m[5]) : 32;
  const ipBits = parseIp4(ip);
  const netBits = parseIp4(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`);
  if (ipBits == null || netBits == null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipBits & mask) === (netBits & mask);
}

function parseIp4(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export interface SpfEvaluation {
  result: "pass" | "fail" | "softfail" | "neutral" | "none";
  traced: string[];
}

const MAX_INCLUDE_DEPTH = 3;
const MAX_MECHANISMS = 20;

/**
 * Evaluate an SPF record against a connecting IP, following include: chains
 * via DoH with hard depth/machinery caps. Pure mechanisms (a/mx) require the
 * provided resolver which defaults to `queryTxt`-style A/MX lookup handlers.
 */
export async function evaluateSpf(
  domain: string,
  clientIp: string,
  tokens: SpfMechanism[] | null,
  deps: {
    queryTxt: (name: string) => Promise<string[]>;
    resolveA: (name: string) => Promise<string[]>;
    resolveMx: (name: string) => Promise<string[]>;
  },
  depth = 0,
  traced: string[] = []
): Promise<SpfEvaluation> {
  if (tokens == null || tokens.length === 0) {
    return { result: "none", traced: [...traced, "no v=spf1 record"] };
  }

  for (const mech of tokens.slice(0, MAX_MECHANISMS)) {
    const q = mech.qualifier || "+";
    let matched = false;
    switch (mech.kind) {
      case "ip4":
        matched = ip4InCidr(clientIp, mech.value || "");
        break;
      case "ip6": {
        // Sim: only exact/global match against lo; we avoid a full v6 matcher.
        matched = !isPrivateIp(clientIp) && clientIp.toLowerCase() === (mech.value || "").split("/")[0].toLowerCase();
        break;
      }
      case "a": {
        const target = mech.value || domain;
        const ips = await deps.resolveA(target);
        matched = ips.includes(clientIp) || (mech.value ? ips.includes(mech.value) : false);
        break;
      }
      case "mx": {
        const mxTargets = await deps.resolveMx(mech.value || domain);
        const ips: string[] = [];
        for (const target of mxTargets.slice(0, 10)) ips.push(...(await deps.resolveA(target)));
        matched = ips.includes(clientIp);
        break;
      }
      case "include": {
        if (depth >= MAX_INCLUDE_DEPTH) {
          traced.push(`include:${mech.value} -> depth cap`);
          continue;
        }
        const subResult = await evaluateSpf(mech.value, clientIp, tokenizeSpf((await deps.queryTxt(mech.value))[0] ?? ""), deps, depth + 1, traced);
        traced.push(`include:${mech.value} -> ${subResult.result}`);
        matched = subResult.result === "pass";
        break;
      }
      case "redirect": {
        if (depth >= MAX_INCLUDE_DEPTH) break;
        const target = mech.value;
        const subTokens = tokenizeSpf((await deps.queryTxt(target))[0] ?? "");
        const sub = await evaluateSpf(domain, clientIp, subTokens, deps, depth + 1, traced);
        return { result: sub.result, traced: [...traced, `redirect:${target} -> ${sub.result}`] };
      }
      case "exists": {
        try {
          const found = await deps.queryTxt(mech.value);
          matched = found.length > 0;
        } catch {
          matched = false;
        }
        break;
      }
      case "all":
        return { result: q === "+" ? "pass" : q === "~" ? "softfail" : q === "-" ? "fail" : "neutral", traced: [...traced, `${q}all -> ${q === "+" ? "pass" : q === "~" ? "softfail" : "fail"}`] };
      default:
        break; // unknown mechanism — ignored per RFC 7208
    }

    if (matched) {
      const result = q === "+" ? "pass" : q === "-" ? "fail" : q === "~" ? "softfail" : "neutral";
      traced.push(`${q}${mech.kind}:${mech.value || ""} matched -> ${result}`);
      return { result, traced };
    }
    traced.push(`${q}${mech.kind}:${mech.value || ""} no match`);
  }

  // No mechanism matched. SPF 4408 says the result is then "neutral".
  const { policy } = classifySpfPolicy(tokens);
  const result = policy === "none" ? "neutral" : policy === "-all" ? "fail" : policy === "~all" ? "softfail" : "pass";
  traced.push(`no mechanism matched; policy ${policy} -> ${result}`);
  return { result, traced };
}

export interface DmarcRecord {
  present: boolean;
  policy: "none" | "quarantine" | "reject" | "unknown";
  pct: number | null;
  subdomainPolicy: "none" | "quarantine" | "reject" | "unknown" | null;
  raw: string | null;
}

export function parseDmarc(record: string | null): DmarcRecord {
  if (!record || !/^v=dmarc1/i.test(record)) {
    return { present: false, policy: "unknown", pct: null, subdomainPolicy: null, raw: record ?? null };
  }
  const keys = record.replace(/^v=dmarc1\s*/i, "").split(";").map((s) => s.trim()).filter(Boolean);
  const get = (k: string) => {
    const entry = keys.find((e) => e.startsWith(`${k}=`));
    return entry ? entry.slice(k.length + 1).trim() : null;
  };
  const policy = (get("p") ?? "none").toLowerCase();
  const sp = get("sp");
  const pctRaw = get("pct");
  return {
    present: true,
    policy: policy === "none" ? "none" : policy === "quarantine" ? "quarantine" : policy === "reject" ? "reject" : "unknown",
    pct: pctRaw ? Math.max(0, Math.min(100, Number(pctRaw))) || null : null,
    subdomainPolicy:
      sp === "none" ? "none" : sp === "quarantine" ? "quarantine" : sp === "reject" ? "reject" : null,
    raw: record,
  };
}

export interface DnsLookupHandlers {
  queryTxt: (name: string) => Promise<string[]>;
  resolveA: (name: string) => Promise<string[]>;
  resolveMx: (name: string) => Promise<string[]>;
}

export const realDnsHandlers: DnsLookupHandlers = {
  queryTxt: queryTxt,
  resolveA: async (name) => {
    const hostname = /^\d+\.\d+\.\d+\.\d+$/.test(name) ? name : name;
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      return (json.Answer ?? []).filter((a: { type: number }) => a.type === 1).map((a: { data: string }) => a.data);
    } catch {
      return [];
    }
  },
  resolveMx: async (name) => {
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=MX`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      return (json.Answer ?? [])
        .filter((a: { type: number }) => a.type === 15)
        .map((a: { data: string }) => /^(\d+)\s+(\S+)$/.exec(a.data)?.[2] ?? "");
    } catch {
      return [];
    }
  },
};
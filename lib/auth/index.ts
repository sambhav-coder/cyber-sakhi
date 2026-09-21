/**
 * Server-side DNS re-verification of the mail-authentication chain.
 *
 * `verifyDomainAuthentication` independently queries DNS and compares the
 * published SPF / DMARC policy against what the Authentication-Results header
 * claimed. This catches the common spoofing case where the domain publishes
 * a strict "-all" SPF plus "reject" DMARC, yet the email arrived anyway
 * (which should be impossible — meaning the header or relay was tampered
 * with, or the domain recently hardened its policy).
 *
 * DKIM: only selector/key *presence* is checked (RFC 6376 fully-specified
 * signature verification needs the exact raw bytes of the original message,
 * which Cyber Sakhi does not reconstruct). See `dns.ts` notes.
 */

import {
  SpfEvaluation,
  classifySpfPolicy,
  evaluateSpf,
  parseDmarc,
  realDnsHandlers,
  SpfMechanism,
  tokenizeSpf,
} from "./dns";
import type { DnsLookupHandlers } from "./dns";
import type { AuthenticationResult } from "@/lib/emailTypes";

export interface SpfDnsVerdict {
  status: "pass" | "softfail" | "fail" | "neutral" | "not-found" | "unavailable";
  mechanismTrace: string[];
  policy: string | null;
  explained: string;
  headerVerdictMismatch: boolean;
  /** True when the domain publishes an SPF record that was retrievable. */
  published: boolean;
}

export interface DmarcDnsVerdict {
  status: "reject" | "quarantine" | "none" | "not-found" | "unavailable";
  policy: string | null;
  pct: number | null;
  explained: string;
  headerVerdictMismatch: boolean;
  /** True when the domain publishes a DMARC record that was retrievable. */
  published: boolean;
}

export interface DnsAuthVerification {
  domain: string;
  spf: SpfDnsVerdict;
  dmarc: DmarcDnsVerdict;
  dkim: {
    checked: boolean;
    keyPublished: boolean | null;
    selector: string | null;
    explained: string;
  };
  provider: "dns-over-https";
}

export interface VerifyOptions {
  /** Sender IP from the outermost Received hop (for live SPF evaluation). */
  clientIp?: string;
  /** DKIM selector claimed in the DKIM-Signature header, if present. */
  dkimSelector?: string;
  /** Injectable handlers for tests; defaults to real DoH. */
  handlers?: DnsLookupHandlers;
}

export async function verifyDomainAuthentication(
  senderDomain: string,
  header: {
    spf?: AuthenticationResult | null;
    dmarc?: AuthenticationResult | null;
  },
  opts: VerifyOptions = {}
): Promise<DnsAuthVerification> {
  const h = opts.handlers ?? realDnsHandlers;
  const domain = senderDomain.toLowerCase();

  const spfOut = await resolveSpf(domain, opts.clientIp, h, header.spf);
  const dmarcOut = await resolveDmarc(domain, h, header.dmarc);
  const dkimOut = await resolveDkim(domain, opts.dkimSelector, h);

  return {
    domain,
    spf: spfOut,
    dmarc: dmarcOut,
    dkim: dkimOut,
    provider: "dns-over-https",
  };
}

async function resolveSpf(
  domain: string,
  clientIp: string | undefined,
  h: DnsLookupHandlers,
  header: AuthenticationResult | null | undefined
): Promise<SpfDnsVerdict> {
  let records: string[];
  try {
    records = await h.queryTxt(domain);
  } catch (err) {
    return {
      status: "unavailable",
      mechanismTrace: [],
      policy: null,
      explained: `Could not query DNS for ${domain} (${err instanceof Error ? err.message : err}).`,
      headerVerdictMismatch: false,
      published: false,
    };
  }

  const spfRecord = records.find((r) => /^v=spf1/i.test(r));
  if (!spfRecord) {
    const headerStatus = header ? normalizeHeaderStatus(header.status ?? headerVerdict(header)).status : null;
    return {
      status: "not-found",
      mechanismTrace: [],
      policy: null,
      explained: `${domain} publishes no SPF record (no v=spf1 TXT at the apex). Without SPF, any server may claim the domain.`,
      // An MTA cannot legitimately return a definitive SPF result (pass/fail/
      // softfail) for a domain with no published SPF record — such a claim is
      // a discrepancy. A "neutral"/'none'-style claim matches the RFC 7208
      // "none" result for a record-less domain and is NOT a discrepancy.
      headerVerdictMismatch: headerStatus != null && isDefinitiveClaim(headerStatus),
      published: false,
    };
  }

  const tokens = tokenizeSpf(spfRecord);
  const { policy } = classifySpfPolicy(tokens ?? []);
  const evalWithIp = clientIp && !/^(127\.|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(clientIp);

  let evaluation: SpfEvaluation | null = null;
  if (evalWithIp) {
    try {
      evaluation = await evaluateSpf(domain, clientIp, tokens, h);
    } catch {
      evaluation = null;
    }
  }

  const status: SpfDnsVerdict["status"] = evaluation
    ? (evaluation.result === "pass" ? "pass" : evaluation.result === "fail" ? "fail" : evaluation.result === "softfail" ? "softfail" : "neutral")
    : policy === "none"
    ? "neutral"
    : policy === "+all"
    ? "pass"
    : policy === "-all"
    ? "fail"
    : "softfail";

  const mechanismTrace = evaluation ? evaluation.traced : [policy];

  const headerStatus = header ? normalizeHeaderStatus(header.status ?? (header as { verbose?: string }).verbose) : null;
  const origin = evalWithIp
    ? "live evaluation against the sending IP"
    : "static interpretation of the published policy (no usable client IP)";
  const explained = `SPF policy: ${policy || "none (no closing all)"} (${origin}). ${
    evaluation ? `Mechanism trace: ${evaluation.traced.slice(0, 6).join(" -> ")}.` : "No live IP evaluation."
  }`;

  return {
    status,
    mechanismTrace,
    policy: policy || null,
    explained,
    // A discrepancy is only asserted when DNS actually contradicts the header
    // claim. Without a usable client IP we cannot disprove a legitimate
    // authorization, so we report the static policy but do NOT label a
    // contradiction. This avoids a false "authentication vs policy" finding.
    headerVerdictMismatch:
      evalWithIp && evaluation && headerStatus != null && headerStatus.status !== "unavailable"
        ? evaluation.result !== headerStatus.status
        : false,
    published: true,
  };
}

function headerVerdict(auth: AuthenticationResult): string {
  return auth.status ?? "unavailable";
}

function normalizeHeaderStatus(raw: string | undefined): { status: string } {
  const s = (raw ?? "").toLowerCase();
  if (s === "pass") return { status: "pass" };
  if (s === "fail" || s === "hardfail") return { status: "fail" };
  if (s === "softfail") return { status: "softfail" };
  if (s === "neutral" || s === "none") return { status: "neutral" };
  return { status: "unavailable" };
}

/** A header claim that asserts an actionable pass/fail result. */
function isDefinitiveClaim(status: string | undefined): boolean {
  return status === "pass" || status === "fail" || status === "softfail";
}

async function resolveDmarc(
  domain: string,
  h: DnsLookupHandlers,
  header: AuthenticationResult | null | undefined
): Promise<DmarcDnsVerdict> {
  let records: string[];
  try {
    records = await h.queryTxt(`_dmarc.${domain}`);
  } catch (err) {
    return {
      status: "unavailable",
      policy: null,
      pct: null,
      explained: `Could not query _dmarc.${domain} (${err instanceof Error ? err.message : err}).`,
      headerVerdictMismatch: false,
      published: false,
    };
  }

  const parsed = parseDmarc(records.length > 0 ? records[0] : null);
  if (!parsed.present) {
    return {
      status: "not-found",
      policy: null,
      pct: null,
      explained: `${domain} publishes no DMARC policy. Without DMARC alignment, mail that fails SPF/DKIM still lands in the inbox.`,
      headerVerdictMismatch: false,
      published: false,
    };
  }

  const status: DmarcDnsVerdict["status"] =
    parsed.policy === "reject" ? "reject" : parsed.policy === "quarantine" ? "quarantine" : "none";
  const explained = `DMARC policy: p=${parsed.policy}${
    parsed.pct != null ? `, pct=${parsed.pct}` : ""
  }${parsed.subdomainPolicy ? `, sp=${parsed.subdomainPolicy}` : ""}.`;

  const headerStatus = header ? normalizeHeaderStatus(header.status ?? (header as { verbose?: string }).verbose) : null;
  return {
    status,
    policy: parsed.policy,
    pct: parsed.pct,
    explained,
    // The published policy (p=none/quarantine/reject) is the *disposition*
    // applied to failed DMARC messages — it does not contradict a DMARC
    // "pass" verdict (a strictly-policed domain can still pass alignment).
    // The only genuine discrepancy is claiming a definitive result (pass/fail)
    // for a domain that publishes NO DMARC record at all.
    headerVerdictMismatch: false,
    published: true,
  };
}

async function resolveDkim(
  domain: string,
  selector: string | undefined,
  h: DnsLookupHandlers
): Promise<DnsAuthVerification["dkim"]> {
  if (!selector) {
    return {
      checked: false,
      keyPublished: null,
      selector: null,
      explained:
        "DKIM key presence not checked: no dkim-selector was provided (the raw DKIM-Signature header is not parsed — see RFC 6376 limitations in lib/auth/dns.ts).",
    };
  }
  try {
    const keyRecords = await h.queryTxt(`${selector}._domainkey.${domain}`);
    return {
      checked: true,
      keyPublished: keyRecords.some((r) => /^v=DKIM1|k=rsa|p=/.test(r)),
      selector,
      explained: keyRecords.length
        ? `DKIM key published for selector "${selector}" (${keyRecords.length} TXT record(s)). Key presence does not prove the signature is valid.`
        : `No DKIM key published for selector "${selector}". A genuine domain usually publishes one.`,
    };
  } catch (err) {
    return {
      checked: true,
      keyPublished: null,
      selector,
      explained: `DKIM key lookup failed (${err instanceof Error ? err.message : err}).`,
    };
  }
}

export function summarizeAuthMismatches(
  v: DnsAuthVerification,
  header: { spf?: AuthenticationResult | null; dmarc?: AuthenticationResult | null }
): string[] {
  const out: string[] = [];
  const spfClaim = normalizeHeaderStatus(header.spf?.status ?? (header.spf as { verbose?: string } | undefined)?.verbose).status;
  const dmarcClaim = normalizeHeaderStatus(header.dmarc?.status ?? (header.dmarc as { verbose?: string } | undefined)?.verbose).status;
  if (v.spf.headerVerdictMismatch) {
    out.push(
      v.spf.status === "not-found"
        ? `submitted Authentication-Results says SPF ${spfClaim}, but ${v.domain} publishes no SPF record (RFC 7208 result should be "none").`
        : `submitted Authentication-Results says SPF ${spfClaim}, but DNS verification of ${v.domain} evaluates the same sending context to SPF ${v.spf.status}.`,
    );
  }
  if (v.dmarc.headerVerdictMismatch) {
    out.push(
      v.dmarc.status === "not-found"
        ? `submitted Authentication-Results says DMARC ${dmarcClaim}, but ${v.domain} publishes no DMARC record.`
        : `submitted Authentication-Results says DMARC ${dmarcClaim}, but DNS verification of ${v.domain} evaluates to DMARC ${v.dmarc.status}.`,
    );
  }
  return out;
}
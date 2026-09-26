/**
 * Indicator normalization + validation (IOC quality gate).
 *
 * Root cause it fixes: the legacy email URL regex kept quoted-printable
 * tails and trailing punctuation, persisting values like
 * `https://link.internshala.com/v1/emailclick?q=` or `http://www.=` as
 * "valid" indicators. Those rows then polluted recurrence counts.
 *
 * Two layers:
 * 1. normalize*() — used at EXTRACTION time (emailForensics): clean and
 *    reject garbage before it ever becomes an indicator.
 * 2. isPersistableIndicator() — used at PERSISTENCE time
 *    (createIndicators): defense-in-depth gate. Rejected values are
 *    dropped with a count, never silently rewritten.
 *
 * Historical malformed rows are NOT deleted or rewritten here; read paths
 * (gov recurrence, trends) exclude provably-malformed values at display
 * time and document it. Unknown stays unknown.
 */

export type PersistableIndicatorType = "url" | "domain" | "ip" | "email" | "md5" | "sha1" | "sha256";

const TRAILING_JUNK_RE = /[=.,;:!?)\]}'"`…]+$/;
const QP_SOFT_BREAK_RE = /=\r?\n/g;

function stripQpSoftBreaks(value: string): string {
  return value.replace(QP_SOFT_BREAK_RE, "");
}

/** Remove trailing punctuation / qp artifacts (`=`, `.`, `,`, `)`, …). */
export function stripTrailingJunk(value: string): string {
  let out = stripQpSoftBreaks(value).trim();
  // Preserve base64-style `==` padding: only a lone trailing `=` is junk.
  const pad = /==$/.test(out) ? "==" : "";
  if (pad) out = out.slice(0, -2);
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(TRAILING_JUNK_RE, "");
  }
  return (out + pad).trim();
}

function hostOf(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/\s?#]+)/i);
  if (!m) return null;
  return m[1].toLowerCase();
}

function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  // Reject qp garbage and fragments: no `=`, whitespace, or `@` in hosts.
  if (/[=\s@]/.test(host)) return false;
  // IPv4 literal host is acceptable.
  if (/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(host)) return true;
  if (!host.includes(".")) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);
}

/**
 * Normalize a raw URL candidate. Returns null when the value cannot be a
 * real URL (garbage host, qp fragment, overlong). Never throws.
 *
 * Truncation-artifact rule: a URL whose query string ends in a bare `=`
 * (`?q=`, `&upn=`) is a quoted-printable truncation artifact, not the real
 * link — rejected. A `==` ending (base64 padding) is preserved.
 */
export function normalizeUrlIndicator(raw: string): string | null {
  if (typeof raw !== "string") return null;
  // Truncation-artifact check FIRST (before stripping removes the evidence):
  // a query string ending in a bare `=` (`?q=`, `&upn=`) is a
  // quoted-printable truncation artifact, not the real link. A `==` ending
  // (base64 padding) is legitimate.
  const rawTrimmed = raw.trim();
  if (/[?&][^=&?#\s]+=$/.test(rawTrimmed) && !/==$/.test(rawTrimmed)) return null;
  const cleaned = stripTrailingJunk(rawTrimmed);
  if (cleaned.length === 0 || cleaned.length > 2048) return null;
  if (!/^https?:\/\//i.test(cleaned)) return null;
  const host = hostOf(cleaned);
  if (!host || !isValidHost(host)) return null;
  // Reject qp-encoded query tails (`=20`, `=3D`) that survived stripping.
  if (/=[0-9A-Fa-f]{2}($|[&=])/.test(cleaned)) return null;
  return cleaned;
}

/** Normalize a domain candidate. Returns null when not a real domain. */
export function normalizeDomainIndicator(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = stripTrailingJunk(raw.toLowerCase()).replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
  if (!isValidHost(cleaned)) return null;
  // Single-label hosts are not routable domains for intel purposes.
  if (!cleaned.includes(".")) return null;
  return cleaned;
}

/** Validate an email candidate (syntax only — never a verdict). */
export function isValidEmailIndicator(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > 320 || /[=\s]/.test(v)) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
}

/** Validate an IPv4/IPv6 literal. */
export function isValidIpIndicator(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim();
  if (/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(v)) return true;
  if (!v.includes(":")) return false;
  try {
    const u = new URL(`http://[${v}]/`);
    return u.hostname === v.toLowerCase();
  } catch {
    return false;
  }
}

/** Validate MD5/SHA1/SHA256 hex digests. */
export function isValidHashIndicator(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(v) || /^[0-9a-f]{40}$/.test(v) || /^[0-9a-f]{64}$/.test(v);
}

/**
 * Persistence gate: true when a (type, value) pair is safe to store as an
 * indicator. Unknown/other types pass through (permissive by design —
 * the gate blocks provable garbage, not unfamiliar vocabularies).
 */
export function isPersistableIndicator(type: string, value: string): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  switch (type) {
    case "url":
      return normalizeUrlIndicator(value) !== null;
    case "domain":
      return normalizeDomainIndicator(value) !== null;
    case "email":
      return isValidEmailIndicator(value);
    case "ip":
      return isValidIpIndicator(value);
    case "md5":
    case "sha1":
    case "sha256":
    case "hash":
      return isValidHashIndicator(value);
    default:
      return true;
  }
}

/**
 * Read-path helper: false for values that are provably malformed, so
 * recurrence/aggregation displays can exclude historic garbage without
 * deleting it. Permissive for unknown types (same policy as persistence).
 */
export function isWellFormedIndicator(type: string, value: string): boolean {
  return isPersistableIndicator(type, value);
}

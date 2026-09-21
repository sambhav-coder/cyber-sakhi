/**
 * Strict, forensic-safe IP parsing.
 *
 * These helpers are used wherever an IP is promoted to a first-class value
 * (Received-header hops, "originating IP", indicators, threat-intel queries).
 *
 * Hard rules:
 *   * A timestamp like "07:08:55" is NEVER an IP.
 *   * A dotted-quad with an octet outside 0-255 is NEVER an IPv4 address.
 *   * A dotted-quad with leading-zero octets ("09.17.02.11") is rejected: the
 *     value is ambiguous (date/version text) and modern parsers reject it.
 *   * A colon-separated string is only an IPv6 address when it satisfies the
 *     full RFC 4291 grammar (including "::" compression and an embedded
 *     IPv4 tail). Three hex groups are not an address.
 *   * Anything that fails validation returns undefined / is omitted — it is
 *     NEVER fabricated into an IP.
 *
 * Little-endian-minded: IPv4-mapped IPv6 (::ffff:a.b.c.d) parses as one IPv6
 * address; the embedded IPv4 is not emitted separately.
 */

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_STRICT_RE = new RegExp(`^(?:${OCTET}\\.){3}${OCTET}$`);
// Boundary-safe scanner for potential IPv4 dotted-quads ("123.4.5.6x" and
// "x123.4.5.6" must not produce a partial match).
const IPV4_SCAN_RE = new RegExp(`(?<!\\d)(?:${OCTET}\\.){3}${OCTET}(?!\\d)`, "g");
// IPv6 tokens are runs of hex digits, colons and dots. Each candidate is
// validated separately; "::" compression and embedded IPv4 are handled inside
// isValidIpv6. Brackets around an IPv6 literal are not part of the token.
const IPV6_TOKEN_RE = /[0-9A-Fa-f:.]+/g;

const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/;

/** Strict IPv4 validator: four octets 0-255, no leading zeros. */
export function isValidIpv4(value: string): boolean {
  return IPV4_STRICT_RE.test(value);
}

/**
 * Strict IPv6 validator (RFC 4291).
 * Accepts the full 8-group form, the single "::" compressed form, and an
 * 32-bit IPv4 tail as the final groups (IPv4-mapped / compatible addresses).
 * Rejects timestamps and any colon-token that is not a real address.
 */
export function isValidIpv6(value: string): boolean {
  let v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  if (!v) return false;
  if ((v.match(/::/g) || []).length > 1) return false;

  const hasCompression = v.includes("::");
  const [left, right] = v.split("::");
  const leftGroups = countIpv6Groups(left);
  const rightGroups = countIpv6Groups(right);
  if (leftGroups === null || rightGroups === null) return false;

  const total = leftGroups + rightGroups;
  return hasCompression ? total <= 7 : total === 8;
}

function countIpv6Groups(side: string | undefined): number | null {
  if (!side) return 0;
  const parts = side.split(":");
  let groups = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "") return null;
    // The final group may be a 32-bit IPv4 tail (e.g. "::ffff:203.0.113.9").
    if (part.includes(".")) {
      if (i !== parts.length - 1 || !isValidIpv4(part)) return null;
      groups += 2;
      continue;
    }
    if (!HEX_GROUP.test(part)) return null;
    groups += 1;
  }
  return groups;
}

/** True for any validated IPv4 or IPv6 address. */
export function isValidIp(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

/** RFC1918 / loopback / link-local / ULA IPv6 / loopback IPv6 classification. */
export function isPrivateIp(ip: string): boolean {
  if (!isValidIp(ip)) return false;
  if (isValidIpv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1") return true;
  if (low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe8")) return true;
  return false;
}

/** True when the value is a validated address that is not private/reserved. */
export function isPublicIp(ip: string): boolean {
  return isValidIp(ip) && !isPrivateIp(ip);
}

interface IpSpan {
  value: string;
  start: number;
  end: number;
}

/**
 * Extract every validated IP address (IPv4 and IPv6, in textual order),
 * de-duplicated. IPv4 embedded inside a valid IPv6 token (IPv4-mapped) is
 * suppressed so the mapped address is emitted once, as IPv6.
 */
export function extractValidatedIps(text: string): string[] {
  const v6Spans: IpSpan[] = [];
  const v4Spans: IpSpan[] = [];

  let m: RegExpExecArray | null;
  const v6Re = new RegExp(IPV6_TOKEN_RE.source, "g");
  while ((m = v6Re.exec(text)) !== null) {
    const raw = m[0];
    const idx = m.index;
    const core = raw.replace(/^[.:]+|[.:]+$/g, "");
    if (!core.includes(":")) continue;
    if (!isValidIpv6(core)) continue;
    const start = idx;
    const end = idx + raw.length;
    v6Spans.push({ value: core, start, end });
  }

  const v4Re = new RegExp(IPV4_SCAN_RE.source, "g");
  while ((m = v4Re.exec(text)) !== null) {
    const value = m[0];
    const idx = m.index;
    if (!isValidIpv4(value)) continue;
    // IPv4-mapped IPv6 (e.g. "::ffff:203.0.113.9") is emitted once, as IPv6.
    // Check if this IPv4 is embedded within any IPv6 span.
    const isEmbedded = v6Spans.some((s) => idx >= s.start && idx + value.length <= s.end);
    if (isEmbedded) continue;
    v4Spans.push({ value, start: idx, end: idx + value.length });
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const span of [...v6Spans, ...v4Spans].sort((a, b) => a.start - b.start)) {
    if (seen.has(span.value)) continue;
    seen.add(span.value);
    out.push(span.value);
  }
  return out;
}

export interface IpHop {
  ip?: string;
}

/**
 * Origin selection used by the forensic pipeline.
 *
 * Conventions:
 *   * Received headers are newest-first (RFC 5322), so the LAST hop in the
 *     array is the oldest/outermost relay — the earliest public sending node
 *     visible in the chain.
 *   * The "originating IP" is that outermost hop's validated public IP when
 *     one exists; otherwise the last validated public IP in the whole
 *     Received text; otherwise undefined ("unavailable").
 *   * This is the visible sending node (a router, an MTA, possibly a NAT),
 *     NOT proof of the human sender's device. Invalid tokens (timestamps,
 *     malformed quads) can never become the origin.
 */
export function selectOriginatingIp(
  hops: readonly IpHop[],
  receivedText: string
): string | undefined {
  if (hops.length > 0) {
    const last = hops[hops.length - 1].ip;
    if (last && isPublicIp(last)) return last;
  }
  const publics = extractValidatedIps(receivedText).filter(isPublicIp);
  return publics[publics.length - 1];
}
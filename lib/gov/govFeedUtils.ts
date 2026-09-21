import { htmlToText, cleanSummary, collapseSpaces } from "@/lib/news/text";
import { isRelevant, classify, extractLocation } from "@/lib/news/filters";
import type { GovCurrentEvent } from "./govFeedTypes";

/** Lowercased Latin-only normal form used for title-based deduplication. */
export function normalizeKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** True when the value carries Latin script content (drop Hindi-only rows). */
export function hasLatin(value: string): boolean {
  return /[a-zA-Z]/.test(value || "");
}

/** True when the value contains Devanagari script (Hindi-only rows to drop). */
export function hasDevanagari(value: string): boolean {
  return /[\u0900-\u097F]/u.test(value || "");
}

/**
 * Guarantee uniqueness across similar titles: identical normalized basis
 * strings (e.g. true duplicate rows on an official page) get a numeric
 * suffix instead of colliding on the same id.
 */
export function uniqueId(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const out = `${base}-${n}`;
  used.add(out);
  return out;
}

/** Deduplicate in place order, keeping the first occurrence per key. */
export function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeKey(keyOf(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Parse a wide range of date strings the official pages emit:
 *   - "21 July 2026"
 *   - "March 16 2026"
 *   - ISO / RFC 822 date strings
 */
export function tryParseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const t = collapseSpaces(raw);
  const m = t.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/);
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIso(raw: string | null | undefined): string | null {
  const d = tryParseDate(raw);
  return d ? d.toISOString() : null;
}

/** Make a relative URL absolute against a base origin. */
export function absolutize(href: string, base: string): string {
  if (!href) return base;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  const origin = new URL(base).origin;
  const url = href.startsWith("/") ? `${origin}${href}` : `${base.replace(/\/[^/]*$/, "/")}${href}`;
  try {
    return new URL(url).href;
  } catch {
    return base;
  }
}

/** Sanitize untrusted external text for rendering (no markup, entities decoded). */
export function sanitizeText(value: string, maxLength = 500): string {
  if (!value) return "";
  return cleanSummary(htmlToText(value), maxLength);
}

/** Stability gauge: HTML that contains none of these anchors is likely a
 *  redirect/error shell (e.g. CERT-In's rss.xml "URL not found" page) rather
 *  than the expected content list. */
export function looksLikeHtml(html: string, anchors: string[]): boolean {
  if (!html) return false;
  return anchors.some((anchor) => html.includes(anchor));
}

/** Pick a GovEventType from advisory text. */
export function advisoryType(text: string): "ADVISORY" | "ALERT" | "GUIDELINE" {
  const t = text.toLowerCase();
  if (/\b(urgent|critical|emergency|immediate action|high risk)\b/.test(t)) return "ALERT";
  if (/\b(guideline|guidelines|how to|do's and don'ts|dos and donts)\b/.test(t)) return "GUIDELINE";
  return "ADVISORY";
}

/** Pick a program-ish GovEventType from event text. */
export function eventType(text: string): "WORKSHOP" | "AWARENESS" | "PROGRAM" {
  const t = text.toLowerCase();
  if (/\b(workshop|hands-on|training session)\b/.test(t)) return "WORKSHOP";
  if (/\b(awareness session|awareness programme|awareness program|session|outreach)\b/.test(t)) {
    return "AWARENESS";
  }
  if (/\b(training|certification|campaign|driver|competition|hackathon)\b/.test(t)) return "PROGRAM";
  return "PROGRAM";
}

/**
 * Focused cyber-domain keywords for official press-release rows. The I4C/PIB
 * listing carries a "Topics: Cyber Crimes" category on every row, so we must
 * judge the *content* (title + summary), not the category: a general PM-meeting
 * release catalogued under cyber-crimes must not surface on the portal.
 */
export const FOCUSED_CYBER_KEYWORD =
  /\b(cyber\w*|cybercrime\w*|cybercriminal\w*|scam\w*|fraud\w*|phishing|vishing|smishing|hack\w*|ransom\w*|malware|otp|mule\s*(?:bank\s*)?account\w*|(?:bank|payment)\s*gateway\w*|data\s*breach|digital\s*arrest|online\s*crime\w*|crime\s*against\s*(?:women|children)|identity\s*theft|credential\s*stuffing|spoof\w*|fake\s*site\w*|sim\s*swap|account\s*takeover|cyber-enabled|digital\s*fraud\w*|cyber\s*safety\w*)\b/i;

/**
 * Relevance gate for official press-release rows: I4C/PIB pages are cyber by
 * mission, but a few releases are general home-ministry news. The content
 * itself must carry a focused cyber keyword (category labels alone don't
 * count), with the main news pipeline's relevance/classification rules as a
 * secondary guard.
 */
export function isCyberRelevantForEvents(text: string): boolean {
  if (!FOCUSED_CYBER_KEYWORD.test(text)) return false;
  if (!isRelevant(text)) return false;
  return classify(text) !== null;
}

/** Location extraction reusing the news pipeline's Indian place list. */
export function eventLocation(text: string): string | null {
  return extractLocation(text);
}

/** Build a stable, deterministic id for a normalized event. */
export function eventId(sourceId: string, basis: string): string {
  return `gov-${sourceId}-${normalizeKey(basis).slice(0, 28)}`;
}

/** Build a stable, deterministic id for a normalized news item. */
export function newsId(sourceId: string, basis: string): string {
  return `govn-${sourceId}-${normalizeKey(basis).slice(0, 28)}`;
}

/** Shared fetcher with a hard timeout — always returns text or throws. */
export async function fetchHtmlText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CyberSakhiGovPortal/1.0 (+https://cyber-sakhi.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function makeEvent(
  partial: Pick<GovCurrentEvent, "title" | "summary" | "source" | "sourceUrl" | "type" | "id"> &
    Partial<Omit<GovCurrentEvent, "title" | "summary" | "source" | "sourceUrl" | "type" | "id">>
): GovCurrentEvent {
  const published = partial.publishedAt ?? toIso(partial.eventDate ?? null) ?? new Date().toISOString();
  const publishedAt = published ? published : new Date().toISOString();
  return {
    id: partial.id,
    title: collapseSpaces(partial.title).slice(0, 240),
    summary: sanitizeText(partial.summary, 420),
    source: partial.source,
    sourceUrl: partial.sourceUrl,
    publishedAt,
    category: partial.category ?? "Cyber awareness",
    location: partial.location ?? null,
    eventDate: partial.eventDate ?? null,
    imageUrl: partial.imageUrl ?? null,
    type: partial.type,
  };
}

/** Sort current events: recent events/dates first, official priority as tiebreak. */
export function sortEvents(events: GovCurrentEvent[], sourcePriority: Record<string, number>): GovCurrentEvent[] {
  const nowMs = Date.now();
  return [...events].sort((a, b) => {
    const ams = a.eventDate ? new Date(a.eventDate).getTime() : a.publishedAt ? new Date(a.publishedAt).getTime() : nowMs;
    const bms = b.eventDate ? new Date(b.eventDate).getTime() : b.publishedAt ? new Date(b.publishedAt).getTime() : nowMs;
    if (bms !== ams) return bms - ams;
    const ap = sourcePriority[a.source] ?? 9;
    const bp = sourcePriority[b.source] ?? 9;
    return ap - bp;
  });
}
import { extractLocation } from "@/lib/news/filters";
import {
  absolutize,
  advisoryType,
  eventType,
  eventId,
  hasDevanagari,
  hasLatin,
  isCyberRelevantForEvents,
  looksLikeHtml,
  sanitizeText,
  toIso,
  uniqueId,
} from "./govFeedUtils";
import type { GovCurrentEvent, GovEventType } from "./govFeedTypes";

const I4C_ORIGIN = "https://i4c.mha.gov.in";
const I4C_ADVISORIES_URL = `${I4C_ORIGIN}/advisories.aspx`;
const I4C_PRESS_URL = `${I4C_ORIGIN}/press-release.aspx`;
const I4C_EVENTS_URL = `${I4C_ORIGIN}/events.aspx`;

export interface GovEventSourceRunnable {
  id: string;
  name: string;
  homeUrl: string;
  run: () => Promise<GovCurrentEvent[]>;
}

/**
 * The official I4C (Indian Cybercrime Coordination Centre, Ministry of Home
 * Affairs) pages are the only curated "current events / updates" source: their
 * advisories, press releases and events are directly related to cyber safety,
 * cybercrime and awareness — exactly the portal's focus.
 *
 * Each parser is defensive: it validates that the page still looks like the
 * expected list before extracting, and normalizes every row into the
 * GovCurrentEvent model with the original URL preserved for attribution.
 */

export function parseI4cAdvisories(html: string): GovCurrentEvent[] {
  // More lenient validation - accept page even if some markers change
  if (!looksLikeHtml(html, ["fnc", "flex-column", "info", "h3", ".pdf", "advisory", "pdf"]) && !/theme\/resources\/advisories/i.test(html)) {
    console.warn("[I4C] Advisories page structure changed or invalid");
    return [];
  }
  const out: GovCurrentEvent[] = [];
  const usedIds = new Set<string>();
  // More flexible regex to handle structure variations
  const blockRe = /<a\s+href="([^"]+\.pdf)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>[\s\S]{0,2000}?<p\s+class="title">\s*([^<]+?)\s*<\/p>[\s\S]{0,2000}?<p[^>]*>\s*([\s\S]*?)\s*<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const [, href, titleHtml, dateRaw, summaryHtml] = m;
    const title = sanitizeText(titleHtml, 240);
    if (!title || !hasLatin(title) || hasDevanagari(title)) continue;
    const type = advisoryType(`${title} ${sanitizeText(summaryHtml, 800)}`);
    const date = toIso(dateRaw) ?? new Date().toISOString();
    out.push({
      id: uniqueId(usedIds, eventId("i4c-advisory", title)),
      title,
      summary: sanitizeText(summaryHtml, 420),
      source: "I4C",
      sourceUrl: absolutize(href, I4C_ADVISORIES_URL),
      publishedAt: date,
      category: "Cyber threat advisory",
      location: null,
      eventDate: toIso(dateRaw),
      imageUrl: null,
      type,
    });
  }
  return out;
}

export function parseI4cPressReleases(html: string): GovCurrentEvent[] {
  // More lenient validation
  if (!looksLikeHtml(html, ["entry-summary", "byline", "Cyber Crimes", "article", "h4"])) {
    console.warn("[I4C] Press releases page structure changed or invalid");
    return [];
  }
  const out: GovCurrentEvent[] = [];
  const usedIds = new Set<string>();
  // More flexible regex
  const articleRe = /<article>[\s\S]*?<header>\s*<h4><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/header>[\s\S]*?<div class="entry-summary">([\s\S]*?)<\/div>[\s\S]*?<p class="byline">([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = articleRe.exec(html)) !== null) {
    const [, href, titleHtml, summaryHtml, bylineHtml] = m;
    const title = sanitizeText(titleHtml, 240);
    const summary = sanitizeText(summaryHtml, 420);
    if (!title || !hasLatin(title) || hasDevanagari(`${title} ${summary}`)) continue;
    // The byline carries a "Topics: Cyber Crimes" category on every row — judge
    // the release's actual content instead of that label. Gate on exactly the
    // summary that will be served so gating and output never diverge.
    if (!isCyberRelevantForEvents(`${title} ${summary}`)) continue;
    const dateRaw = (bylineHtml.match(/\|\s*([0-9]{1,2}\s+[A-Za-z]+,?\s+[0-9]{4})/)?.[1] ?? "").trim();
    const date = toIso(dateRaw) ?? new Date().toISOString();
    out.push({
      id: uniqueId(usedIds, eventId("i4c-press", title)),
      title,
      summary,
      source: "I4C · PIB",
      sourceUrl: absolutize(href, I4C_PRESS_URL),
      publishedAt: date,
      category: sanitizeText(bylineHtml.match(/topics:[\s\S]*?>\s*([^<]+)/i)?.[1] ?? "Cyber crime", 50),
      location: "Delhi",
      eventDate: toIso(dateRaw),
      imageUrl: null,
      type: "ANNOUNCEMENT" as GovEventType,
    });
  }
  return out;
}

export function parseI4cEvents(html: string): GovCurrentEvent[] {
  // More lenient validation
  if (!looksLikeHtml(html, ["entry-summary", "inner-wrapper", "article", "h4"]) && html.indexOf("1560bd") === -1) {
    console.warn("[I4C] Events page structure changed or invalid");
    return [];
  }
  const out: GovCurrentEvent[] = [];
  const usedIds = new Set<string>();
  const articleRe = /<article>[\s\S]*?<header>\s*<h4>([\s\S]*?)<\/h4>\s*<\/header>[\s\S]*?<div class="entry-summary">\s*<p>([\s\S]*?)<\/p>[\s\S]*?(?:<p[^>]*style="[^"]*#1560bd[^"]*"[^>]*>\s*([^<]+?)\s*<\/p>)?[\s\S]*?<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = articleRe.exec(html)) !== null) {
    const [, titleHtml, summaryHtml, dateRaw] = m;
    const title = sanitizeText(titleHtml, 240);
    if (!title || !hasLatin(title) || hasDevanagari(title)) continue;
    const summary = sanitizeText(summaryHtml, 420);
    const combined = `${title} ${summary}`;
    const date = toIso(dateRaw ?? null) ?? new Date().toISOString();
    out.push({
      id: uniqueId(usedIds, eventId("i4c-event", title)),
      title,
      summary,
      source: "I4C",
      sourceUrl: I4C_EVENTS_URL,
      publishedAt: date,
      category: "Cyber awareness programme",
      location: extractLocation(combined),
      eventDate: toIso(dateRaw ?? null),
      imageUrl: null,
      type: eventType(combined),
    });
  }
  return out;
}

export function createI4cAdvisoriesSource(fetcher: (url: string) => Promise<string> = fetchI4cPage): GovEventSourceRunnable {
  return {
    id: "i4c-advisories",
    name: "I4C — Cyber Threat Advisories",
    homeUrl: I4C_ADVISORIES_URL,
    run: async () => parseI4cAdvisories(await fetcher(I4C_ADVISORIES_URL)),
  };
}

export function createI4cPressSource(fetcher: (url: string) => Promise<string> = fetchI4cPage): GovEventSourceRunnable {
  return {
    id: "i4c-press-releases",
    name: "I4C — Press Releases (PIB)",
    homeUrl: I4C_PRESS_URL,
    run: async () => parseI4cPressReleases(await fetcher(I4C_PRESS_URL)),
  };
}

export function createI4cEventsSource(fetcher: (url: string) => Promise<string> = fetchI4cPage): GovEventSourceRunnable {
  return {
    id: "i4c-events",
    name: "I4C — Awareness Events & Programmes",
    homeUrl: I4C_EVENTS_URL,
    run: async () => parseI4cEvents(await fetcher(I4C_EVENTS_URL)),
  };
}

async function fetchI4cPage(url: string): Promise<string> {
  // Reuse the shared timeout fetcher without creating a circular import.
  const { fetchHtmlText } = await import("./govFeedUtils");
  return fetchHtmlText(url);
}

export function createGovEventSources(): GovEventSourceRunnable[] {
  return [
    createI4cAdvisoriesSource(),
    createI4cPressSource(),
    createI4cEventsSource(),
  ];
}
import type { NewsArticle } from "./types";

export interface RotatableEdition {
  lead: NewsArticle | null;
  stories: NewsArticle[];
  cyberWatch: NewsArticle[];
}

/**
 * Default auto-scroll cadence (single configurable source of truth — the
 * briefing modal must import this, never a scattered literal). ~9 seconds:
 * long enough to read a headline, see the Read Aloud button, and click it
 * before the card changes; short enough that the desk still feels live.
 */
export const NEWS_AUTO_SCROLL_INTERVAL_MS = 9000;
/** Tick granularity for the progress bar (visual only, not card timing). */
export const NEWS_AUTO_SCROLL_TICK_MS = 250;
/**
 * Interaction hold: after the user touches a card (pointer, focus, manual
 * navigation), auto-advance stays frozen this long before resuming.
 */
export const NEWS_AUTO_SCROLL_HOLD_MS = 8000;

export interface AutoAdvanceGate {
  narrating: boolean;
  exiting: boolean;
  /** User explicitly paused auto-scroll via the toggle. */
  userPaused: boolean;
  /** Milliseconds since the last card interaction (pointer/focus/manual). */
  msSinceInteraction: number;
  reducedMotion: boolean;
  poolSize: number;
}

/**
 * Pure gate: may the carousel advance right now? False while narration is
 * active, while the user holds it (explicit pause or recent interaction),
 * with reduced motion, or with fewer than 2 cards.
 */
export function shouldAutoAdvance(gate: AutoAdvanceGate): boolean {
  if (gate.poolSize < 2) return false;
  if (gate.reducedMotion) return false;
  if (gate.narrating) return false;
  if (gate.exiting) return false;
  if (gate.userPaused) return false;
  if (gate.msSinceInteraction < NEWS_AUTO_SCROLL_HOLD_MS) return false;
  return true;
}

/** Pure progress step: advance the 0..1 bar by one tick, or hold at 0. */
export function tickProgress(
  prev: number,
  tickMs: number = NEWS_AUTO_SCROLL_TICK_MS,
  intervalMs: number = NEWS_AUTO_SCROLL_INTERVAL_MS
): number {
  if (intervalMs <= 0) return 0;
  return prev + tickMs / intervalMs;
}

/**
 * Builds the ordered rotation pool used by the briefing's live desk:
 * lead story, then the desk stories, then cyber-watch items, de-duplicated
 * by id. The server already prioritises sources, so order is preserved.
 */
export function buildRotationPool(edition: RotatableEdition): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const article of [edition.lead, ...edition.stories, ...edition.cyberWatch]) {
    if (!article) continue;
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    out.push(article);
  }
  return out;
}

/** Advances the lead index cyclically. Single-article pools stay put. */
export function nextLeadIndex(current: number, length: number): number {
  if (length <= 1) return 0;
  return (current + 1) % length;
}

/** Desk band keeps the current lead out of the deck so nothing duplicates. */
export function deskArticles(
  stories: NewsArticle[],
  currentLeadId: string,
  max = 3
): NewsArticle[] {
  return stories.filter((story) => story.id !== currentLeadId).slice(0, max);
}

/** Enhanced deduplication that excludes all pool stories from secondary sections */
export function excludePoolFromSecondary(
  secondary: NewsArticle[],
  pool: NewsArticle[]
): NewsArticle[] {
  const poolIds = new Set(pool.map((article) => article.id));
  return secondary.filter((article) => !poolIds.has(article.id));
}

/** Watch band keeps the current lead out of the deck. */
export function watchArticles(
  watch: NewsArticle[],
  currentLeadId: string,
  max = 2
): NewsArticle[] {
  return watch.filter((item) => item.id !== currentLeadId).slice(0, max);
}

/**
 * Merges a freshly fetched pool into the current one. Newer server order
 * comes first; previously shown articles we already know keep their story
 * so a live refresh never yanks the article currently on screen.
 */
export function mergePool(prev: NewsArticle[], next: NewsArticle[]): NewsArticle[] {
  const nextIds = new Set(next.map((article) => article.id));
  const merged: NewsArticle[] = [...next];
  for (const article of prev) {
    if (!nextIds.has(article.id)) merged.push(article);
  }
  return merged;
}

/** Desk band candidates taken from the live pool (current lead excluded). */
export function deskCandidates(
  pool: NewsArticle[],
  currentLeadId: string,
  max = 3
): NewsArticle[] {
  return pool.filter((article) => article.id !== currentLeadId).slice(0, max);
}

function sentenceCaseCategory(category: string): string {
  const words = category.split(/\s+/).filter(Boolean);
  const cased = words
    .map((word) =>
      /^[A-Z]{1,3}$/.test(word) || /[a-z]/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
  return cased;
}

/** English taxonomy → Hindi display names for Hindi narration. */
const HINDI_CATEGORY_NAMES: Record<string, string> = {
  "Digital arrest": "डिजिटल अरेस्ट",
  "Online child safety": "ऑनलाइन बाल सुरक्षा",
  "Sextortion & blackmail": "सेक्सटॉर्शन और ब्लैकमेल",
  "Deepfakes & AI abuse": "डीपफेक और एआई दुरुपयोग",
  "Ransomware & hacking": "रैनसमवेयर और हैकिंग",
  "Account takeover": "अकाउंट हैक",
  "Job scam": "नौकरी घोटाला",
  "Investment fraud": "निवेश घोटाला",
  "Phishing & identity theft": "फ़िशिंग और पहचान की चोरी",
  Cyberstalking: "ऑनलाइन उत्पीड़न",
  "Financial fraud": "वित्तीय धोखाधड़ी",
  Cybercrime: "साइबर अपराध",
};

function closeSentenceHi(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /[.?!।]$/.test(t) ? t : `${t}।`;
}

function spokenDate(iso: string | null | undefined, lang: "en" | "hi" = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (lang === "hi") {
    return `प्रकाशित ${new Intl.DateTimeFormat("hi-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d)}।`;
  }
  return `Published ${new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d)}.`;
}

function closeSentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/**
 * Deterministic narration text for the Read Aloud feature. Built ONLY from
 * the real article data (category, headline, summary, source, publication
 * date, location) — never AI-summarised or improvised. Hindi articles are
 * narrated with a Hindi template in Devanagari (original language, never a
 * translation of English text).
 */
export function buildNarration(article: NewsArticle): string {
  const hindi = article.language === "hi";
  const parts: string[] = [];
  const category = sentenceCaseCategory(article.category);
  const headline = closeSentence(article.title);
  const summary = closeSentence(article.summary);
  const source = article.sourceName?.trim();
  const location = article.location?.trim();

  if (hindi) {
    const hiCategory = HINDI_CATEGORY_NAMES[article.category] ?? article.category;
    if (hiCategory) parts.push(`${hiCategory}।`);
    parts.push(closeSentenceHi(article.title));
    if (summary) parts.push(closeSentenceHi(article.summary));
    if (source) parts.push(`${source} के अनुसार।`);
    const date = spokenDate(article.publishedAt, "hi");
    if (date) parts.push(date);
    if (location) parts.push(`स्थान: ${location}।`);
    return parts.join(" ");
  }

  if (category) parts.push(`${category}.`);
  parts.push(headline);
  if (summary) parts.push(summary);
  if (source) parts.push(`According to ${source}.`);
  const date = spokenDate(article.publishedAt);
  if (date) parts.push(date);
  if (location) parts.push(`Location: ${location}.`);
  return parts.join(" ");
}
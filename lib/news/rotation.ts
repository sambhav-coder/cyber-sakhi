import type { NewsArticle } from "./types";

export interface RotatableEdition {
  lead: NewsArticle | null;
  stories: NewsArticle[];
  cyberWatch: NewsArticle[];
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

function spokenDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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
 * date, location) — never AI-summarised or improvised.
 */
export function buildNarration(article: NewsArticle): string {
  const parts: string[] = [];
  const category = sentenceCaseCategory(article.category);
  const headline = closeSentence(article.title);
  const summary = closeSentence(article.summary);
  const source = article.sourceName?.trim();
  const location = article.location?.trim();

  if (category) parts.push(`${category}.`);
  parts.push(headline);
  if (summary) parts.push(summary);
  if (source) parts.push(`According to ${source}.`);
  const date = spokenDate(article.publishedAt);
  if (date) parts.push(date);
  if (location) parts.push(`Location: ${location}.`);
  return parts.join(" ");
}
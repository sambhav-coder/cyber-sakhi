import { createHash } from "node:crypto";
import {
  DEFAULT_NEWS_FEEDS,
  HINDI_NEWS_FEEDS,
  createProvider,
  type NewsProvider,
} from "./providers";
import { parseFeedXml, parsePublishedDate } from "./feedParser";
import { classify, extractLocation, isPolicyNoise, isRelevant, buildSummary } from "./filters";
import { collapseSpaces } from "./text";
import type {
  FeedConfig,
  FetcherLike,
  NewsArticle,
  NewsEdition,
  NewsLanguage,
  RawFeedItem,
} from "./types";

export interface NewsServiceDeps {
  feeds?: FeedConfig[];
  fetcher?: FetcherLike;
  now?: () => Date;
  ttlMs?: number;
  timeoutMs?: number;
  maxAgeDays?: number;
}

export interface NewsService {
  getEdition(opts?: { force?: boolean; language?: NewsLanguage }): Promise<NewsEdition>;
}

/** Card summary budget (~4–5 rendered lines). Feed text only, never invented. */
export const ARTICLE_SUMMARY_CHARS = 460;

interface CacheEntry {
  articles: NewsArticle[];
  storedAt: number;
}

interface DefaultFetcherInput {
  url: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const LEAD_COUNT = 1;
const STORY_COUNT = 3;
const WATCH_COUNT = 2;

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 20);
}

function defaultFetcher({ url, timeoutMs, signal }: DefaultFetcherInput): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  return fetch(url, { signal: controller.signal, headers: { "User-Agent": "CyberSakhiNewsDesk/1.0" } }).finally(
    () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  );
}

/**
 * Reads a response body robustly. Many Indian news feeds are mostly UTF-8 but
 * contain stray Windows-1252 bytes (e.g. curly quotes as 0x92); others are
 * genuinely cp1252. A single blanket re-decode corrupts valid UTF-8, so we
 * decode byte-by-byte with a streaming UTF-8 decoder and repair only the
 * bytes a strict UTF-8 decode rejects, mapping those to their cp1252 glyph.
 */
/* eslint-disable no-control-regex */
const CP1252_TO_UNICODE: number[] = (() => {
  const table: number[] = Array.from({ length: 256 }, (_, i) => i);
  const high: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
  };
  for (const [from, to] of Object.entries(high)) table[Number(from)] = to;
  return table;
})();

function decodeLenient(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder("utf-8");
  let out = "";
  for (const byte of bytes) {
    const chunk = decoder.decode(new Uint8Array([byte]), { stream: true });
    if (chunk) {
      if (chunk === "\uFFFD") {
        out += String.fromCharCode(CP1252_TO_UNICODE[byte] ?? byte);
      } else {
        out += chunk;
      }
    }
  }
  out += decoder.decode();
  return out;
}

async function readResponseBody(res: Response): Promise<string> {
  if (typeof (res as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
    return await res.text();
  }
  const buf = await res.arrayBuffer();
  const decoded = decodeLenient(buf);
  if (!decoded.includes("\uFFFD")) return decoded;
  return decoded.replace(/\uFFFD/g, "\u2022");
}

function toArticle(
  item: RawFeedItem,
  provider: NewsProvider,
  feed: FeedConfig,
  retrievedAt: string
): NewsArticle | null {
  if (!item.title) return null;
  if (!item.link) return null;
  const text = `${item.title} ${item.summary}`;
  if (!isRelevant(text)) return null;
  if (isPolicyNoise(text)) return null;
  const classified = classify(text);
  if (!classified) return null;
  const published = parsePublishedDate(item.publishedAtRaw);
  return {
    id: sha1(`${provider.id}:${item.title.toLowerCase()}:${item.link}`),
    title: collapseSpaces(item.title),
    summary: buildSummary(item.summary, ARTICLE_SUMMARY_CHARS),
    sourceName: provider.name,
    sourceKind: provider.kind,
    sourceUrl: item.link,
    publishedAt: published ? published.toISOString() : null,
    retrievedAt,
    category: classified.category,
    tags: classified.tags,
    location: extractLocation(text),
    imageUrl: item.imageUrl,
    verifiedSource: provider.kind === "government",
    language: feed.language ?? "en",
  };
}

export function createNewsService(deps?: NewsServiceDeps): NewsService {
  // Explicit custom feeds (tests, NEWS_FEED_URLS operators) are used for both
  // editions. The default set is English + Hindi; each language edition
  // fetches ONLY its own feeds into its OWN cache entry — Hindi never serves
  // English cache and vice versa.
  const customFeeds = deps?.feeds;
  const feedsEn = customFeeds ?? DEFAULT_NEWS_FEEDS;
  const feedsHi = customFeeds ?? HINDI_NEWS_FEEDS;
  const fetcher: FetcherLike = deps?.fetcher ?? ((url, init) =>
    defaultFetcher({
      url,
      timeoutMs: deps?.timeoutMs ?? 10000,
      signal: init?.signal,
    }));
  const now = deps?.now ?? (() => new Date());
  const ttlMs = deps?.ttlMs ?? 15 * 60 * 1000;
  const maxAgeDays = deps?.maxAgeDays ?? 30;

  // Separate cache entries per language — the core NO-FAKE-SWITCH guarantee.
  const cacheByLang: Record<NewsLanguage, CacheEntry | null> = {
    en: null,
    hi: null,
  };

  const providersByLang: Record<NewsLanguage, { provider: NewsProvider; feed: FeedConfig }[]> = {
    en: feedsEn.map((feed) => ({ provider: createProvider(feed, fetcher), feed })),
    hi: feedsHi.map((feed) => ({ provider: createProvider(feed, fetcher), feed })),
  };

  async function collect(
    language: NewsLanguage,
    force: boolean
  ): Promise<{ articles: NewsArticle[]; feedsOk: number; fresh: boolean }> {
    const fetchedAt = now();
    const retrievedAt = fetchedAt.toISOString();
    const entries = providersByLang[language];
    const results = await Promise.allSettled(
      entries.map(({ provider }) =>
        provider
          .fetch({})
          .then((res) => (res.ok ? readResponseBody(res) : Promise.reject(new Error(`HTTP ${res.status}`))))
      )
    );
    const articles: NewsArticle[] = [];
    let feedsOk = 0;
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (result.status === "rejected") continue;
      // Strict language separation: an edition contains ONLY articles from
      // feeds tagged with its language. A Hindi edition therefore can never
      // show an English article (and vice versa) — no translation, no mixing.
      // Untagged feeds default to English, so a NEWS_FEED_URLS override
      // yields an honestly-empty (offline) Hindi edition, never EN-as-HI.
      if ((entries[i].feed.language ?? "en") !== language) continue;
      feedsOk += 1;
      const items = parseFeedXml(result.value);
      for (const item of items) {
        const article = toArticle(item, entries[i].provider, entries[i].feed, retrievedAt);
        if (article) articles.push(article);
      }
    }

    const sorted = rankArticles(articles, maxAgeDays, now());
    const fresh = feedsOk > 0;
    if (fresh) {
      cacheByLang[language] = { articles: sorted, storedAt: fetchedAt.getTime() };
    }
    return { articles: sorted, feedsOk, fresh };
  }

  async function resolve(
    language: NewsLanguage,
    force: boolean
  ): Promise<{
    articles: NewsArticle[];
    storedAt: Date;
    feedsOk: number;
    status: NewsEdition["cacheStatus"];
    fallbackToCache: boolean;
  }> {
    const cache = cacheByLang[language];
    const feedCount = providersByLang[language].length;
    if (!force && cache && now().getTime() - cache.storedAt < ttlMs) {
      return {
        articles: cache.articles,
        storedAt: new Date(cache.storedAt),
        feedsOk: feedCount,
        status: "cached",
        fallbackToCache: false,
      };
    }
    const collected = await collect(language, force);
    if (collected.fresh) {
      return {
        articles: collected.articles,
        storedAt: new Date(now().getTime()),
        feedsOk: collected.feedsOk,
        status: "live",
        fallbackToCache: false,
      };
    }
    if (cache) {
      return {
        articles: cache.articles,
        storedAt: new Date(cache.storedAt),
        feedsOk: 0,
        status: "cached",
        fallbackToCache: true,
      };
    }
    return {
      articles: [],
      storedAt: now(),
      feedsOk: 0,
      status: "offline",
      fallbackToCache: false,
    };
  }

  return {
    async getEdition(opts) {
      const force = !!opts?.force;
      const language: NewsLanguage = opts?.language === "hi" ? "hi" : "en";
      const resolved = await resolve(language, force);
      const preparedAt = now();
      const [lead, ...rest] = resolved.articles;
      const stories = rest.slice(0, STORY_COUNT);
      const cyberWatch = rest.slice(STORY_COUNT, STORY_COUNT + WATCH_COUNT);
      return {
        preparedAt: preparedAt.toISOString(),
        fetchedAt: resolved.storedAt.toISOString(),
        cacheStatus: resolved.status,
        language,
        feedsTotal: providersByLang[language].length,
        feedsOk: resolved.feedsOk,
        articles: resolved.articles,
        lead: lead ?? null,
        stories,
        cyberWatch,
      };
    },
  };
}

function rankArticles(articles: NewsArticle[], maxAgeDays: number, reference: Date): NewsArticle[] {
  const nowMs = reference.getTime();
  const strictCutoffMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
  const lenientCutoffMs = nowMs - 365 * 24 * 60 * 60 * 1000;

  const fresh = articles.filter((a) => {
    const sortMs = a.publishedAt ? new Date(a.publishedAt).getTime() : nowMs;
    return sortMs >= strictCutoffMs;
  });
  const pool = fresh.length >= 3 ? fresh : articles.filter((a) => {
    const sortMs = a.publishedAt ? new Date(a.publishedAt).getTime() : nowMs;
    return sortMs >= lenientCutoffMs;
  });

  const kindPriority: Record<string, number> = { government: 0, news: 1 };
  const deduped: NewsArticle[] = [];
  const seen = new Set<string>();
  const ordered = [...pool].sort((a, b) => {
    const kindDiff = (kindPriority[a.sourceKind] ?? 1) - (kindPriority[b.sourceKind] ?? 1);
    if (kindDiff !== 0) return kindDiff;
    return 0;
  });
  for (const article of ordered) {
    const key = article.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(article);
  }

  return deduped.sort((a, b) => {
    const aMs = a.publishedAt ? new Date(a.publishedAt).getTime() : nowMs;
    const bMs = b.publishedAt ? new Date(b.publishedAt).getTime() : nowMs;
    return bMs - aMs;
  });
}

export const newsService = createNewsService();
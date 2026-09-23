import type { FeedConfig, FetcherLike } from "./types";

export interface NewsProvider {
  id: string;
  name: string;
  kind: FeedConfig["kind"];
  fetch: (opts: { signal?: AbortSignal }) => Promise<Response>;
}

export function createProvider(feed: FeedConfig, fetcher: FetcherLike): NewsProvider {
  return {
    id: feed.id,
    name: feed.name,
    kind: feed.kind,
    fetch: (opts) => fetcher(feed.feedUrl, { signal: opts?.signal }),
  };
}

/**
 * Verified working RSS feeds.
 *
 * ENGLISH feeds (tested 2026-09-19; every URL below returned RSS with
 * current items). Indian government sources (PIB, MHA, I4C / National
 * Cyber Crime Reporting Portal, CERT-In) do not currently expose public,
 * machine-readable feeds; add them here as `kind: "government"` when a
 * reliable feed/API becomes available — the pipeline already prioritises them.
 *
 * HINDI feeds (verified live 2026-09-23; each returned HTTP 200 RSS with
 * current original-Hindi <item>s — never translations of English articles):
 *   - BBC News Hindi (feeds.bbci.co.uk/hindi/rss.xml)
 *   - Navbharat Times · India + Crime desks (original Hindi)
 * Deliberately EXCLUDED: The Hindu Hindi feeder endpoint returns HTTP 200
 * but currently yields zero <item>s, so it is documented here instead of
 * being wired in (no silent empty source).
 */
export const DEFAULT_NEWS_FEEDS: FeedConfig[] = [
  {
    id: "thehindu-national",
    name: "The Hindu · National",
    kind: "news",
    feedUrl: "https://www.thehindu.com/news/national/feeder/default.rss",
    homeUrl: "https://www.thehindu.com/news/national/",
    section: "National",
  },
  {
    id: "thehindu-sci-tech",
    name: "The Hindu · Sci-Tech",
    kind: "news",
    feedUrl: "https://www.thehindu.com/sci-tech/feeder/default.rss",
    homeUrl: "https://www.thehindu.com/sci-tech/",
    section: "Technology",
  },
  {
    id: "indianexpress-india",
    name: "The Indian Express · India",
    kind: "news",
    feedUrl: "https://indianexpress.com/section/india/feed/",
    homeUrl: "https://indianexpress.com/section/india/",
    section: "India",
  },
  {
    id: "indianexpress-tech",
    name: "The Indian Express · Technology",
    kind: "news",
    feedUrl: "https://indianexpress.com/section/technology/feed/",
    homeUrl: "https://indianexpress.com/section/technology/",
    section: "Technology",
  },
  {
    id: "toi-india",
    name: "The Times of India · India",
    kind: "news",
    feedUrl: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
    homeUrl: "https://timesofindia.indiatimes.com/india",
    section: "India",
  },
  {
    id: "toi-tech",
    name: "The Times of India · Tech",
    kind: "news",
    feedUrl: "https://timesofindia.indiatimes.com/rssfeeds/66949542.cms",
    homeUrl: "https://timesofindia.indiatimes.com/technology",
    section: "Technology",
  },
  {
    id: "et-tech",
    name: "The Economic Times · Tech",
    kind: "news",
    feedUrl: "https://economictimes.indiatimes.com/tech/rssfeeds/13352306.cms",
    homeUrl: "https://economictimes.indiatimes.com/tech",
    section: "Technology",
  },
  {
    id: "thehindu-cities",
    name: "The Hindu · Cities",
    kind: "news",
    feedUrl: "https://www.thehindu.com/news/cities/feeder/default.rss",
    homeUrl: "https://www.thehindu.com/news/cities/",
    section: "Cities",
  },
  {
    id: "indianexpress-cities",
    name: "The Indian Express · Cities",
    kind: "news",
    feedUrl: "https://indianexpress.com/section/cities/feed/",
    homeUrl: "https://indianexpress.com/section/cities/",
    section: "Cities",
  },
  {
    id: "business-standard",
    name: "Business Standard · Top Stories",
    kind: "news",
    feedUrl: "https://www.business-standard.com/rss/home_page_top_stories.rss",
    homeUrl: "https://www.business-standard.com/",
    section: "Top stories",
  },
  {
    id: "livemint-tech",
    name: "Livemint · Technology",
    kind: "news",
    feedUrl: "https://www.livemint.com/rss/technology",
    homeUrl: "https://www.livemint.com/technology",
    section: "Technology",
  },
];

/** Original-Hindi feeds — fetched ONLY for the Hindi edition, never mixed. */
export const HINDI_NEWS_FEEDS: FeedConfig[] = [
  {
    id: "bbc-hindi",
    name: "BBC News Hindi",
    kind: "news",
    language: "hi",
    feedUrl: "https://feeds.bbci.co.uk/hindi/rss.xml",
    homeUrl: "https://www.bbc.com/hindi",
    section: "India",
  },
  {
    id: "nbt-india",
    name: "Navbharat Times · India",
    kind: "news",
    language: "hi",
    feedUrl: "https://navbharattimes.indiatimes.com/india/rssfeed/1564454.xml",
    homeUrl: "https://navbharattimes.indiatimes.com/india/articlelist/1564454.cms",
    section: "India",
  },
  {
    id: "nbt-crime",
    name: "Navbharat Times · Crime",
    kind: "news",
    language: "hi",
    feedUrl: "https://navbharattimes.indiatimes.com/crime/rssfeed/93273647.xml",
    homeUrl: "https://navbharattimes.indiatimes.com/crime/articlelist/93273647.cms",
    section: "Crime",
  },
];

/** Feeds for one language edition (env override applies to English only). */
export function feedsForLanguage(language: "en" | "hi"): FeedConfig[] {
  if (language === "hi") return HINDI_NEWS_FEEDS;
  return feedListFromEnv();
}

export function feedListFromEnv(): FeedConfig[] {
  const override = (process.env.NEWS_FEED_URLS || "").trim();
  if (!override) return DEFAULT_NEWS_FEEDS;
  return override
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((feedUrl, index) => ({
      id: `custom-${index}`,
      name: `News source ${index + 1}`,
      kind: "news" as const,
      feedUrl,
    }));
}
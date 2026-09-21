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
 * Verified working RSS feeds (tested 2026-09-19; every URL below returned RSS
 * with current items). Indian government sources (PIB, MHA, I4C / National
 * Cyber Crime Reporting Portal, CERT-In) do not currently expose public,
 * machine-readable feeds; add them here as `kind: "government"` when a
 * reliable feed/API becomes available — the pipeline already prioritises them.
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
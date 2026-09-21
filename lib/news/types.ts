export type NewsSourceKind = "government" | "news";

export interface FeedConfig {
  id: string;
  name: string;
  kind: NewsSourceKind;
  feedUrl: string;
  homeUrl?: string;
  section?: string;
}

export interface RawFeedItem {
  title: string;
  summary: string;
  link: string;
  publishedAtRaw: string;
  categories: string[];
  imageUrl: string | null;
  idHint?: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: NewsSourceKind;
  sourceUrl: string;
  publishedAt: string | null;
  retrievedAt: string;
  category: string;
  tags: string[];
  location: string | null;
  imageUrl: string | null;
  verifiedSource: boolean;
}

export type EditionCacheStatus = "live" | "cached" | "offline";

export interface NewsEdition {
  preparedAt: string;
  fetchedAt: string;
  cacheStatus: EditionCacheStatus;
  feedsTotal: number;
  feedsOk: number;
  articles: NewsArticle[];
  lead: NewsArticle | null;
  stories: NewsArticle[];
  cyberWatch: NewsArticle[];
}

export interface FetcherLike {
  (url: string, init?: { signal?: AbortSignal }): Promise<Response>;
}
export type NewsSourceKind = "government" | "news";

/** Original content language of a feed / article. Never translated. */
export type NewsLanguage = "en" | "hi";

export interface FeedConfig {
  id: string;
  name: string;
  kind: NewsSourceKind;
  feedUrl: string;
  homeUrl?: string;
  section?: string;
  /** Original feed language; defaults to "en" when omitted. */
  language?: NewsLanguage;
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
  /** Original article language (from its feed). Displayed + spoken as-is. */
  language: NewsLanguage;
}

export type EditionCacheStatus = "live" | "cached" | "offline";

export interface NewsEdition {
  preparedAt: string;
  fetchedAt: string;
  cacheStatus: EditionCacheStatus;
  /** Which language edition this is — EN and HI are fetched/cached separately. */
  language: NewsLanguage;
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
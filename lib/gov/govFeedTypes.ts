/**
 * Normalized data models for the Government Portal live information surfaces.
 *
 * Every external source (I4C pages, YouTube Data API, verified news RSS) is
 * normalized into one of these two shapes before it reaches the UI. All text
 * from external feeds is treated as untrusted and sanitized in GovFeedUtils
 * before being placed here.
 */

export type GovEventType =
  | "WORKSHOP"
  | "AWARENESS"
  | "ADVISORY"
  | "GUIDELINE"
  | "ANNOUNCEMENT"
  | "PROGRAM"
  | "ALERT";

export interface GovCurrentEvent {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  location?: string | null;
  eventDate?: string | null;
  imageUrl?: string | null;
  type: GovEventType;
}

export type GovNewsType = "VIDEO" | "ARTICLE" | "ADVISORY";

export interface GovCyberNewsItem {
  id: string;
  title: string;
  description: string;
  channelName: string;
  channelUrl: string;
  videoId?: string | null;
  publishedAt: string;
  thumbnailUrl?: string | null;
  sourceUrl: string;
  /** Type of the normalized item. */
  type: GovNewsType;
  /**
   * Present only when the embedded player is known to be blocked upstream
   * (YouTube Data API status.embeddable === false). The UI then hides the
   * iframe and offers "Open on YouTube" only.
   */
  embeddable?: boolean;
}

export interface GovFeedSourceMeta {
  id: string;
  name: string;
  homeUrl: string;
  ok: boolean;
  items: number;
  error?: string;
}

export type GovCacheStatus = "live" | "cached" | "offline" | "fallback";
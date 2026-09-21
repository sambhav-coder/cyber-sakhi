import { newsService } from "@/lib/news/service";
import { dedupeBy, newsId, toIso } from "./govFeedUtils";
import type { GovCacheStatus, GovCyberNewsItem, GovFeedSourceMeta } from "./govFeedTypes";

/**
 * Official / verified cyber-safety channels used with the YouTube Data API.
 * Only channels that were verified against a live channel page are listed.
 * CyberDost I4C (UCwNX6q3b_9mtKldvGoZZ7Gw) is the Ministry of Home Affairs /
 * I4C awareness channel referenced from i4c.mha.gov.in.
 */
export const CYBER_YOUTUBE_CHANNELS: { id: string; name: string; channelUrl: string }[] = [
  {
    id: "UCwNX6q3b_9mtKldvGoZZ7Gw",
    name: "CyberDost I4C",
    channelUrl: "https://www.youtube.com/channel/UCwNX6q3b_9mtKldvGoZZ7Gw",
  },
];

export function youtubeChannelsFromEnv(): typeof CYBER_YOUTUBE_CHANNELS {
  const raw = (process.env.YOUTUBE_CHANNEL_IDS || "").trim();
  if (!raw) return CYBER_YOUTUBE_CHANNELS;
  return raw.split(",").map((entry) => {
    const [id, name] = entry.split(":").map((s) => s.trim());
    return {
      id: id || "",
      name: name || `YouTube channel ${id}`,
      channelUrl: id ? `https://www.youtube.com/channel/${id}` : "",
    };
  }).filter((c) => c.id.length >= 16);
}

export interface GovNewsResult {
  news: GovCyberNewsItem[];
  sources: GovFeedSourceMeta[];
  youtubeConfigured: boolean;
  fetchedAt: string;
  cacheStatus: GovCacheStatus;
}

const CACHE_TTL_MS = 20 * 60 * 1000;
let cache: { result: GovNewsResult; storedAt: number } | null = null;

async function fetchYouTubeChannelVideos(channel: { id: string; name: string; channelUrl: string }, key: string): Promise<GovCyberNewsItem[]> {
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?part=snippet` +
    `&channelId=${encodeURIComponent(channel.id)}&maxResults=5&order=date&type=video&key=${encodeURIComponent(key)}`;
  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  if (!searchRes.ok) throw new Error(`YouTube search HTTP ${searchRes.status}`);
  const searchJson = (await searchRes.json()) as {
    error?: { code?: number; message?: string };
    items?: { id?: { videoId?: string }; snippet?: Record<string, unknown> }[];
  };
  if (searchJson.error || !Array.isArray(searchJson.items)) {
    throw new Error(searchJson.error?.message || "YouTube search failed");
  }

  const videoIds = searchJson.items
    .map((it) => it.id?.videoId)
    .filter((v): v is string => Boolean(v));

  // Embeddability check (best-effort). If it fails we optimistically allow
  // embedding; the modal always offers "Open on YouTube" as the fallback.
  let embeddableMap = new Map<string, boolean>();
  if (videoIds.length > 0) {
    try {
      const statusUrl =
        `https://www.googleapis.com/youtube/v3/videos?part=status` +
        `&id=${encodeURIComponent(videoIds.join(","))}&key=${encodeURIComponent(key)}`;
      const stRes = await fetch(statusUrl, { cache: "no-store" });
      if (stRes.ok) {
        const stJson = (await stRes.json()) as {
          items?: { id?: string; status?: { embeddable?: boolean } }[];
        };
        for (const it of stJson.items ?? []) {
          if (it.id && typeof it.status?.embeddable === "boolean") {
            embeddableMap.set(it.id, it.status.embeddable);
          }
        }
      }
    } catch {
      // keep optimistic defaults
    }
  }

  const items: GovCyberNewsItem[] = [];
  for (const raw of searchJson.items) {
    const videoId = raw.id?.videoId;
    const snippet = raw.snippet as {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
    } | undefined;
    if (!videoId || !snippet?.title) continue;
    items.push({
      id: newsId("yt", videoId),
      title: snippet.title.trim().slice(0, 240),
      description: (snippet.description || "").trim().slice(0, 420),
      channelName: channel.name,
      channelUrl: channel.channelUrl,
      videoId,
      publishedAt: toIso(snippet.publishedAt ?? null) ?? new Date().toISOString(),
      thumbnailUrl:
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        null,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      type: "VIDEO",
      embeddable: embeddableMap.has(videoId) ? embeddableMap.get(videoId) : undefined,
    });
  }
  return items;
}

async function collect(nowIso: string): Promise<GovNewsResult> {
  const youtubeKey = process.env.YOUTUBE_API_KEY?.trim();
  const sources: GovFeedSourceMeta[] = [];
  const news: GovCyberNewsItem[] = [];
  let youtubeConfigured = false;

  if (youtubeKey) {
    youtubeConfigured = true;
    const channels = youtubeChannelsFromEnv();
    const results = await Promise.allSettled(
      channels.map((ch) => fetchYouTubeChannelVideos(ch, youtubeKey))
    );
    results.forEach((res, i) => {
      if (res.status === "fulfilled") {
        news.push(...res.value);
        sources.push({
          id: `youtube-${channels[i].id}`,
          name: channels[i].name,
          homeUrl: channels[i].channelUrl,
          ok: true,
          items: res.value.length,
        });
      } else {
        sources.push({
          id: `youtube-${channels[i].id}`,
          name: channels[i].name,
          homeUrl: channels[i].channelUrl,
          ok: false,
          items: 0,
          error: res.reason instanceof Error ? res.reason.message : "YouTube API error",
        });
      }
    });
  }

  try {
    const edition = await newsService.getEdition();
    const articles = edition.articles.slice(0, 12);
    for (const a of articles) {
      const publishedAt = a.publishedAt ?? a.retrievedAt;
      news.push({
        id: newsId("rss", `${a.sourceName}:${a.title}`),
        title: a.title,
        description: a.summary,
        channelName: a.sourceName,
        channelUrl: a.sourceUrl,
        videoId: null,
        publishedAt: toIso(publishedAt) ?? nowIso,
        thumbnailUrl: a.imageUrl,
        sourceUrl: a.sourceUrl,
        type: "ARTICLE",
        embeddable: undefined,
      });
    }
    sources.push({
      id: "verified-cyber-rss",
      name: "Verified cyber safety news (RSS)",
      homeUrl: "https://www.thehindu.com/news/national/",
      ok: true,
      items: articles.length,
    });
  } catch (err) {
    sources.push({
      id: "verified-cyber-rss",
      name: "Verified cyber safety news (RSS)",
      homeUrl: "https://www.thehindu.com/news/national/",
      ok: false,
      items: 0,
      error: err instanceof Error ? err.message : "RSS news desk unavailable",
    });
  }

  // Videos first, then articles; dedupe wins for identical titles.
  const deduped = dedupeBy(news, (n) => n.title);
  const sorted = deduped.sort((a, b) => {
    const ams = new Date(a.publishedAt).getTime();
    const bms = new Date(b.publishedAt).getTime();
    if (bms !== ams) return bms - ams;
    return a.type === "VIDEO" ? -1 : 1;
  });

  return {
    news: sorted,
    sources,
    youtubeConfigured,
    fetchedAt: nowIso,
    cacheStatus: "live",
  };
}

/** Fetch (or serve cached) normalized cyber-safety news + YouTube updates. */
export async function getCyberNews(force = false): Promise<GovNewsResult> {
  const now = new Date();
  if (!force && cache && now.getTime() - cache.storedAt < CACHE_TTL_MS) {
    return { ...cache.result, cacheStatus: "cached" };
  }
  const result = await collect(now.toISOString());
  cache = { result, storedAt: now.getTime() };
  return result;
}

/** Invalidates the module cache (used by the on-demand refresh route). */
export function invalidateCyberNewsCache(): void {
  cache = null;
}

export function cyberNewsCacheTtlMs(): number {
  return CACHE_TTL_MS;
}
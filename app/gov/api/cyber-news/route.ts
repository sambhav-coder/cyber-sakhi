import { NextRequest, NextResponse } from "next/server";
import {
  cyberNewsCacheTtlMs,
  getCyberNews,
  invalidateCyberNewsCache,
} from "@/lib/gov/govCyberNewsService";

export const dynamic = "force-dynamic";

/**
 * GET /gov/api/cyber-news
 *
 * Server-side aggregator for cyber-safety news and YouTube-backed items.
 * Sources:
 *   - YouTube Data API (CyberDost I4C + any YOUTUBE_CHANNEL_IDS overrides)
 *     — only when the YOUTUBE_API_KEY environment variable is configured;
 *     the key never leaves the server.
 *   - Verified cyber-safety RSS news via the main news desk pipeline (real
 *     items only, relevance-filtered in lib/news/filters).
 *
 * Results are cached server-side for 20 minutes. `?force=1` invalidates and
 * refetches immediately.
 */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (force) invalidateCyberNewsCache();

  try {
    const result = await getCyberNews(force);
    return NextResponse.json({
      news: result.news,
      sources: result.sources,
      youtubeConfigured: result.youtubeConfigured,
      cached: result.cacheStatus === "cached",
      cacheStatus: result.cacheStatus,
      cacheTtlSeconds: Math.round(cyberNewsCacheTtlMs() / 1000),
      lastUpdated: result.fetchedAt,
      message:
        result.news.length > 0
          ? undefined
          : result.youtubeConfigured
            ? "Latest cyber safety news is temporarily unavailable. Please check official sources directly."
            : "YouTube API key not configured; cyber news is temporarily unavailable.",
      setupRequired: !result.youtubeConfigured && result.news.length === 0,
    });
  } catch (err) {
    console.error("[gov] cyber-news failed:", err);
    return NextResponse.json(
      {
        news: [],
        sources: [],
        youtubeConfigured: false,
        cached: false,
        cacheStatus: "offline" as const,
        error: "Failed to load cyber news",
        message:
          "Latest cyber safety news is temporarily unavailable. Please check official sources directly.",
      },
      { status: 500 }
    );
  }
}
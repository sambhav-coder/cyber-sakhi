import { NextRequest, NextResponse } from "next/server";
import {
  currentEventsCacheTtlMs,
  getCurrentEvents,
  invalidateCurrentEventsCache,
} from "@/lib/gov/govCurrentEventsService";

export const dynamic = "force-dynamic";

/**
 * GET /api/gov/current-events
 *
 * Server-side aggregator for current cyber-awareness activities and official
 * updates. Sources:
 *   - I4C advisories (i4c.mha.gov.in/advisories.aspx)
 *   - I4C / PIB press releases (i4c.mha.gov.in/press-release.aspx)
 *   - I4C awareness events & programmes (i4c.mha.gov.in/events.aspx)
 *
 * Results are cached server-side for 15 minutes (stale-while-revalidate).
 * `?force=1` invalidates and refetches immediately. No keys are involved and
 * nothing is ever exposed to the browser except the normalized payload.
 */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (force) invalidateCurrentEventsCache();

  try {
    const result = await getCurrentEvents(force);
    const isFallback = result.cacheStatus === "fallback";
    return NextResponse.json({
      events: result.events,
      sources: result.sources,
      cached: result.cacheStatus === "cached",
      cacheStatus: result.cacheStatus,
      cacheTtlSeconds: Math.round(currentEventsCacheTtlMs() / 1000),
      lastUpdated: result.fetchedAt,
      message: isFallback
        ? "Showing validated fallback events while official sources are temporarily unavailable."
        : result.events.length > 0
        ? undefined
        : "Latest updates are temporarily unavailable. Please check official sources directly.",
    });
  } catch (err) {
    console.error("[gov] current-events failed:", err);
    return NextResponse.json(
      {
        events: [],
        sources: [],
        cached: false,
        cacheStatus: "offline" as const,
        error: "Failed to load current events",
        message:
          "Latest updates are temporarily unavailable. Please check official sources directly.",
      },
      { status: 500 }
    );
  }
}
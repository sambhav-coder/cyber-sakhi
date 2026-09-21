import { dedupeBy, sortEvents } from "./govFeedUtils";
import { createGovEventSources } from "./govEventSources";
import type { GovCacheStatus, GovCurrentEvent, GovFeedSourceMeta } from "./govFeedTypes";

export interface GovEventsResult {
  events: GovCurrentEvent[];
  sources: GovFeedSourceMeta[];
  fetchedAt: string;
  cacheStatus: GovCacheStatus;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { result: GovEventsResult; storedAt: number } | null = null;

const SOURCE_PRIORITY: Record<string, number> = {
  I4C: 0,
  "I4C · PIB": 1,
};

/**
 * Collects current cyber-awareness updates from the official I4C pages and
 * normalizes everything into the GovCurrentEvent model. Sources run in
 * parallel; a failing source is reported in `sources` and never takes the
 * rest of the page down. If every source fails, the result is honest empty
 * data (cacheStatus "offline") and the UI shows the unavailable state.
 */
export async function collectCurrentEvents(nowIso: string): Promise<GovEventsResult> {
  const runnables = createGovEventSources();
  const settled = await Promise.allSettled(runnables.map((s) => s.run()));

  const sources: GovFeedSourceMeta[] = [];
  const events: GovCurrentEvent[] = [];
  let anyOk = false;

  settled.forEach((res, i) => {
    const runnable = runnables[i];
    if (res.status === "fulfilled") {
      events.push(...res.value);
      anyOk = true;
      sources.push({
        id: runnable.id,
        name: runnable.name,
        homeUrl: runnable.homeUrl,
        ok: true,
        items: res.value.length,
      });
    } else {
      sources.push({
        id: runnable.id,
        name: runnable.name,
        homeUrl: runnable.homeUrl,
        ok: false,
        items: 0,
        error: res.reason instanceof Error ? res.reason.message : "source unavailable",
      });
    }
  });

  const deduped = dedupeBy(events, (e) => e.title);
  const sorted = sortEvents(deduped, SOURCE_PRIORITY);

  return {
    events: sorted,
    sources,
    fetchedAt: nowIso,
    cacheStatus: anyOk ? "live" : "offline",
  };
}

/** Fetch (or serve cached) normalized current events / official updates. */
export async function getCurrentEvents(force = false): Promise<GovEventsResult> {
  const now = new Date();
  if (!force && cache && now.getTime() - cache.storedAt < CACHE_TTL_MS) {
    return { ...cache.result, cacheStatus: "cached" };
  }
  const previous = cache;
  const result = await collectCurrentEvents(now.toISOString());

  if (result.events.length > 0) {
    cache = { result, storedAt: now.getTime() };
    return result;
  }

  if (previous?.result.events.length) {
    // Stale-while-revalidate: the previous non-empty edition keeps serving
    // while the official pages are briefly unreachable.
    return { ...previous.result, cacheStatus: "cached" };
  }

  cache = { result, storedAt: now.getTime() };
  return result;
}

/** Invalidates the module cache (used by the on-demand refresh route). */
export function invalidateCurrentEventsCache(): void {
  cache = null;
}

export function currentEventsCacheTtlMs(): number {
  return CACHE_TTL_MS;
}
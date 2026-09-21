"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Calendar, MapPin, RefreshCw } from "lucide-react";

interface CurrentEvent {
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
  type: "WORKSHOP" | "AWARENESS" | "ADVISORY" | "GUIDELINE" | "ANNOUNCEMENT" | "PROGRAM" | "ALERT";
}

export type { CurrentEvent };

interface GovCurrentEventsProps {
  /** Event handler for when an event is clicked */
  onEventClick: (event: CurrentEvent) => void;
}

interface ApiPayload {
  events?: CurrentEvent[];
  lastUpdated?: string;
  message?: string;
}

function relativeUpdatedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/**
 * Current Events for the Government Portal.
 *
 * - Live data from /api/gov/current-events (I4C advisories, I4C/PIB press
 *   releases, I4C awareness programmes).
 * - Gentle auto-scroll paused by any hover, focus, wheel or pointer interaction;
 *   reduced-motion users get a native scrollbar and no auto movement.
 * - Per-item reveal animation, "Updated X ago" watermark, and open-in-modal.
 */
export const GovCurrentEvents: React.FC<GovCurrentEventsProps> = ({ onEventClick }) => {
  const [events, setEvents] = useState<CurrentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      try {
        const response = await fetch("/api/gov/current-events");
        const data = (await response.json()) as ApiPayload;
        if (cancelled) return;
        if (data.events) {
          setEvents(data.events);
          setLastUpdated(data.lastUpdated ?? null);
        } else {
          setError(data.message || "Failed to load events");
        }
      } catch {
        if (!cancelled) setError("Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  // Auto-scroll — delta-timed so speed is identical regardless of frame rate.
  useEffect(() => {
    if (reducedMotion || isPaused || events.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;

    const SPEED = 34; // px per second
    const animate = (now: number) => {
      const elapsed = lastFrameRef.current ? now - lastFrameRef.current : 0;
      lastFrameRef.current = now;
      if (!isPaused && el) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= 0) return;
        let next = el.scrollTop + (elapsed / 1000) * SPEED;
        if (next >= maxScroll) next = 0;
        el.scrollTop = next;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [reducedMotion, isPaused, events.length]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "WORKSHOP":
        return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
      case "AWARENESS":
        return "text-sky-300 border-sky-400/30 bg-sky-400/10";
      case "ADVISORY":
        return "text-amber-300 border-amber-400/30 bg-amber-400/10";
      case "ALERT":
        return "text-red-300 border-red-400/30 bg-red-400/10";
      default:
        return "text-teal-300 border-teal-400/30 bg-teal-400/10";
    }
  };

  const updatedLabel = relativeUpdatedAt(lastUpdated ?? undefined);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-slate-400">Loading current events...</div>
      </div>
    );
  }

  if (error || events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-400">
            {error || "Latest updates are temporarily unavailable."}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-600">
            Official sources can be checked directly while the portal syncs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onWheel={pause}
      onPointerDown={pause}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-50">Current Events</h2>
        <div className="flex items-center gap-2">
          {updatedLabel && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500">
              Updated {updatedLabel}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="gov-feed-scroll h-[calc(100%-3rem)] overflow-y-auto"
        style={reducedMotion ? {} : { scrollbarWidth: "none" }}
      >
        <div className="space-y-3 pb-4">
          {events.map((event, index) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onEventClick(event)}
              className="gov-feed-item w-full text-left rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 transition hover:border-slate-600/70 hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:outline-sky-400"
              style={{
                animationDelay: `${Math.min(index, 8) * 90}ms`,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getTypeColor(
                    event.type
                  )}`}
                >
                  {event.type}
                </span>
                {event.eventDate && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Calendar className="h-3 w-3" />
                    {formatDate(event.eventDate)}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-slate-100 mb-1 line-clamp-2">
                {event.title}
              </h3>

              <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                {event.summary}
              </p>

              <div className="flex items-center justify-between gap-2">
                {event.location ? (
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-[10px] text-slate-500">{event.source}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {!reducedMotion && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-900/90 to-transparent" />
      )}
    </div>
  );
};
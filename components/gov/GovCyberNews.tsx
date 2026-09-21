"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Youtube, Clock, RefreshCw, ExternalLink } from "lucide-react";

interface CyberNewsItem {
  id: string;
  title: string;
  description: string;
  channelName: string;
  channelUrl: string;
  videoId?: string | null;
  publishedAt: string;
  thumbnailUrl?: string | null;
  sourceUrl: string;
  type: "VIDEO" | "ARTICLE" | "ADVISORY";
  embeddable?: boolean;
}

export type { CyberNewsItem };

interface GovCyberNewsProps {
  /** Event handler for when a news item is clicked */
  onNewsClick: (news: CyberNewsItem) => void;
}

interface ApiPayload {
  news?: CyberNewsItem[];
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
 * Cyber Safety News for the Government Portal.
 *
 * - Live data from /api/gov/cyber-news (CyberDost I4C videos when the
 *   YOUTUBE_API_KEY is set, plus verified cyber-safety RSS news as fallback).
 * - Gentle auto-scroll paused by any hover, focus, wheel or pointer
 *   interaction; reduced-motion users get a native scrollbar and no movement.
 * - Per-item reveal animation and "Updated X ago" watermark.
 */
export const GovCyberNews: React.FC<GovCyberNewsProps> = ({ onNewsClick }) => {
  const [news, setNews] = useState<CyberNewsItem[]>([]);
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
    const fetchNews = async () => {
      try {
        const response = await fetch("/api/gov/cyber-news");
        const data = (await response.json()) as ApiPayload;
        if (cancelled) return;
        if (data.news) {
          setNews(data.news);
          setLastUpdated(data.lastUpdated ?? null);
        } else {
          setError(data.message || "Failed to load news");
        }
      } catch {
        if (!cancelled) setError("Failed to load news");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchNews();
    return () => {
      cancelled = true;
    };
  }, []);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  // Auto-scroll — delta-timed so speed is identical regardless of frame rate.
  useEffect(() => {
    if (reducedMotion || isPaused || news.length === 0) return;
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
  }, [reducedMotion, isPaused, news.length]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return "Today";
      } else if (diffDays === 1) {
        return "Yesterday";
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else {
        return date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      return dateString;
    }
  };

  const updatedLabel = relativeUpdatedAt(lastUpdated ?? undefined);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-slate-400">
          Loading cyber safety news...
        </div>
      </div>
    );
  }

  if (error || news.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-400">
            {error || "Latest cyber safety news is temporarily unavailable."}
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
        <h2 className="text-xl font-bold text-slate-50">
          Cyber Safety News
        </h2>
        <div className="flex items-center gap-2">
          {updatedLabel && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500">
              Updated {updatedLabel}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {news.length} {news.length === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="gov-feed-scroll h-[calc(100%-3rem)] overflow-y-auto"
        style={reducedMotion ? {} : { scrollbarWidth: "none" }}
      >
        <div className="space-y-3 pb-4">
          {news.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNewsClick(item)}
              className="gov-feed-item w-full text-left rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 transition hover:border-slate-600/70 hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:outline-sky-400"
              style={{
                animationDelay: `${Math.min(index, 8) * 90}ms`,
              }}
            >
              <div className="flex gap-3">
                {/* Thumbnail (decorative within the row button; modal opens source) */}
                {item.thumbnailUrl && (
                  <span className="relative shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-slate-800">
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {item.type === "VIDEO" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Youtube className="h-5 w-5 text-white/90" />
                      </span>
                    )}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100 mb-1 line-clamp-2">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                        {item.channelName}
                      </span>
                      {item.type === "VIDEO" ? (
                        <Youtube className="h-3 w-3 text-slate-500" />
                      ) : (
                        <ExternalLink className="h-3 w-3 text-slate-500" />
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.publishedAt)}
                    </span>
                  </div>
                </div>
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
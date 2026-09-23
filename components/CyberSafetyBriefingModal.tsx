"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  Volume2,
  X,
} from "lucide-react";
import type { NewsArticle } from "@/lib/news/types";
import {
  buildNarration,
  buildRotationPool,
  deskCandidates,
  excludePoolFromSecondary,
  mergePool,
  NEWS_AUTO_SCROLL_HOLD_MS,
  NEWS_AUTO_SCROLL_INTERVAL_MS,
  NEWS_AUTO_SCROLL_TICK_MS,
  nextLeadIndex,
  shouldAutoAdvance,
  tickProgress,
  watchArticles,
} from "@/lib/news/rotation";
import {
  resolveFemaleVoice,
  speakWithEngine,
  type SpeakHandle,
} from "@/lib/voice/speech";

interface CyberSafetyBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditionPayload {
  preparedAt: string;
  fetchedAt: string;
  cacheStatus: "live" | "cached" | "offline";
  language: "en" | "hi";
  feedsTotal: number;
  feedsOk: number;
  lead: NewsArticle | null;
  stories: NewsArticle[];
  cyberWatch: NewsArticle[];
}

type LoadState = "loading" | "ready" | "error";
type NewsLang = "en" | "hi";

const STORY_EXIT_MS = 280;
const WATCH_FALLBACK_MS = 1600;
const REFRESH_POLL_MS = 4 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const SWIPE_THRESHOLD_PX = 60;

const editionDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})
  .format(new Date())
  .toUpperCase();

function formatPublishedDate(iso: string | null, lang: NewsLang = "en"): string {
  if (!iso) return lang === "hi" ? "हाल में" : "Recent";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return lang === "hi" ? "हाल में" : "Recent";
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useRevealOnce(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!enabled || revealed) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, revealed]);
  return { ref, revealed };
}

function NewspaperBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none select-none opacity-45 overflow-hidden"
      aria-hidden="true"
    >
      {/* Editorial top masthead rule */}
      <div className="mx-6 mt-3 border-b-2 border-[#cfc4ad] pb-1 flex items-center justify-between text-[7px] font-mono tracking-widest text-[#8a7f6c] uppercase">
        <span>DAILY CYBER INTELLIGENCE DISPATCH</span>
        <span>SECTION A · NATIONAL EDITION</span>
        <span>ARCHIVE &amp; VIGILANCE</span>
      </div>

      {/* Broadsheet multi-column grid */}
      <div className="grid grid-cols-12 gap-4 px-6 py-4 h-full">
        {/* Left Column: 3 cols wide - narrow side articles */}
        <div className="col-span-3 flex flex-col gap-5 border-r border-[#d8ceb8] pr-3">
          {/* Miniature Article 1 */}
          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#9f1239] border-b border-[#9f1239]/40 pb-0.5">
              SECURITY BRIEF
            </span>
            <div className="h-2.5 w-11/12 bg-[#8a7f6c] rounded-[1px]" />
            <div className="h-2 w-3/4 bg-[#8a7f6c]/80 rounded-[1px]" />
            <div className="space-y-1 pt-1">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-4/5 bg-[#baa990]" />
              <div className="h-1 w-11/12 bg-[#baa990]" />
              <div className="h-1 w-2/3 bg-[#baa990]" />
            </div>
            <div className="pt-1 text-[6px] font-mono text-[#a39782]">ARCHIVE REF · DISPATCH</div>
          </div>

          <div className="h-px w-full bg-[#e2dac6]" />

          {/* Miniature Article 2 */}
          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#7a7160]">
              DIGITAL SAFETY
            </span>
            <div className="h-2.5 w-full bg-[#8a7f6c] rounded-[1px]" />
            <div className="space-y-1 pt-1">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-5/6 bg-[#baa990]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-3/4 bg-[#baa990]" />
            </div>
          </div>

          <div className="h-px w-full bg-[#e2dac6]" />

          {/* Miniature Article 3 */}
          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#9f1239]">
              FRAUD ALERT
            </span>
            <div className="h-2 w-5/6 bg-[#8a7f6c] rounded-[1px]" />
            <div className="space-y-1 pt-0.5">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-4/5 bg-[#baa990]" />
              <div className="h-1 w-full bg-[#baa990]" />
            </div>
          </div>
        </div>

        {/* Center Column: 6 cols wide - simulated secondary lead behind featured */}
        <div className="col-span-6 flex flex-col gap-4 px-2">
          {/* Editorial Banner */}
          <div className="flex items-center justify-between border-b border-[#d8ceb8] pb-1">
            <span className="text-[8px] font-serif font-bold uppercase tracking-[0.2em] text-[#6d6350]">
              PUBLIC ADVISORY
            </span>
            <span className="text-[6px] font-mono uppercase text-[#a39782]">DISPATCH NO. 1930</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-[#7a7160] rounded-[1px]" />
              <div className="h-2.5 w-4/5 bg-[#7a7160]/90 rounded-[1px]" />
              <div className="space-y-1 pt-1">
                <div className="h-1 w-full bg-[#baa990]" />
                <div className="h-1 w-full bg-[#baa990]" />
                <div className="h-1 w-11/12 bg-[#baa990]" />
                <div className="h-1 w-4/5 bg-[#baa990]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-[#7a7160] rounded-[1px]" />
              <div className="h-2.5 w-3/4 bg-[#7a7160]/90 rounded-[1px]" />
              <div className="space-y-1 pt-1">
                <div className="h-1 w-full bg-[#baa990]" />
                <div className="h-1 w-5/6 bg-[#baa990]" />
                <div className="h-1 w-full bg-[#baa990]" />
                <div className="h-1 w-2/3 bg-[#baa990]" />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-[#d8ceb8] my-1" />

          {/* Abstract lower micro-articles */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="space-y-1">
              <span className="text-[6px] font-bold uppercase text-[#9f1239]">THREAT UPDATE</span>
              <div className="h-2 w-full bg-[#8a7f6c] rounded-[1px]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-4/5 bg-[#baa990]" />
            </div>
            <div className="space-y-1">
              <span className="text-[6px] font-bold uppercase text-[#7a7160]">DIGITAL WATCH</span>
              <div className="h-2 w-full bg-[#8a7f6c] rounded-[1px]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-3/4 bg-[#baa990]" />
            </div>
            <div className="space-y-1">
              <span className="text-[6px] font-bold uppercase text-[#7a7160]">ACCOUNT SECURITY</span>
              <div className="h-2 w-full bg-[#8a7f6c] rounded-[1px]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-5/6 bg-[#baa990]" />
            </div>
          </div>
        </div>

        {/* Right Column: 3 cols wide - side columns */}
        <div className="col-span-3 flex flex-col gap-4 border-l border-[#d8ceb8] pl-3">
          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#9f1239]">
              CYBER WATCH
            </span>
            <div className="h-2.5 w-full bg-[#8a7f6c] rounded-[1px]" />
            <div className="h-2 w-4/5 bg-[#8a7f6c] rounded-[1px]" />
            <div className="space-y-1 pt-1">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-3/4 bg-[#baa990]" />
              <div className="h-1 w-5/6 bg-[#baa990]" />
            </div>
          </div>

          <div className="h-px w-full bg-[#e2dac6]" />

          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#7a7160]">
              ONLINE SAFETY
            </span>
            <div className="h-2.5 w-full bg-[#8a7f6c] rounded-[1px]" />
            <div className="space-y-1 pt-1">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-4/5 bg-[#baa990]" />
              <div className="h-1 w-full bg-[#baa990]" />
            </div>
          </div>

          <div className="h-px w-full bg-[#e2dac6]" />

          <div className="space-y-1.5">
            <span className="inline-block text-[7px] font-bold uppercase tracking-wider text-[#9f1239]">
              SECURITY BRIEF
            </span>
            <div className="h-2 w-full bg-[#8a7f6c] rounded-[1px]" />
            <div className="space-y-1 pt-0.5">
              <div className="h-1 w-full bg-[#baa990]" />
              <div className="h-1 w-2/3 bg-[#baa990]" />
            </div>
          </div>
        </div>
      </div>

      {/* Decorative vertical columns across the entire height */}
      <div className="absolute inset-y-0 left-[26%] w-px bg-[#d8ceb8]/50" />
      <div className="absolute inset-y-0 right-[26%] w-px bg-[#d8ceb8]/50" />
    </div>
  );
}

function StageImage({ article, reduced }: { article: NewsArticle; reduced: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed || !article.imageUrl) {
    return (
      <div className="relative flex aspect-[3/2] w-full sm:w-[240px] max-w-[260px] items-center justify-center overflow-hidden rounded-none border border-[#d8cfba] bg-[#ebe3d3] shrink-0">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 18px, rgba(160,140,105,0.08) 18px 19px), radial-gradient(ellipse at 20% 15%, rgba(159,18,57,0.10), transparent 60%)",
          }}
        />
        <div className="relative flex flex-col items-center gap-2 px-4 text-center">
          <Newspaper className="h-5 w-5 text-[#8a7f6c]" />
          <span className="font-serif text-[11px] italic tracking-wide text-[#786f5c]">
            Sakhi News Desk · India
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="relative aspect-[3/2] w-full sm:w-[240px] max-w-[260px] overflow-hidden rounded-none border border-[#d8cfba] bg-[#ebe3d3] shrink-0">
      <img
        src={article.imageUrl}
        alt={article.title}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${reduced ? "" : "csb-stage-zoom"}`}
      />
    </div>
  );
}

function SourceMeta({ article }: { article: NewsArticle }) {
  const lang: NewsLang = article.language === "hi" ? "hi" : "en";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7a7363]">
      <span className="font-semibold text-[#56503f]">{article.sourceName}</span>
      <span aria-hidden>·</span>
      <span>{formatPublishedDate(article.publishedAt, lang)}</span>
      <span aria-hidden>·</span>
      <span
        className="rounded-none border border-[#d8cfba] bg-[#efe8d8] px-1 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-[#7a7363]"
        title={lang === "hi" ? "Original Hindi source" : "Original English source"}
      >
        {lang === "hi" ? "हिंदी" : "EN"}
      </span>
      {article.location ? (
        <>
          <span aria-hidden>·</span>
          <span>{article.location}</span>
        </>
      ) : null}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mt-8 mb-4 flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#a49b84]">
      <div className="h-px flex-1 bg-[#e2dac6]" aria-hidden />
      <span>{label}</span>
      <div className="h-px flex-1 bg-[#e2dac6]" aria-hidden />
    </div>
  );
}

function WatchItem({ article }: { article: NewsArticle }) {
  return (
    <article className="border-t border-[#ded5c0] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="mt-0.5 shrink-0 rounded-none bg-[#efe8d8] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9f1239]">
          {article.category}
        </span>
        <h5 className="min-w-0 flex-1 font-serif text-base font-bold leading-snug text-[#1c1813]">
          {article.title}
        </h5>
      </div>
      {article.summary ? (
        <p className="mt-1.5 font-serif text-xs leading-relaxed text-[#4a4234] line-clamp-4">
          {article.summary}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <SourceMeta article={article} />
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-serif text-[10px] font-bold uppercase tracking-[0.16em] text-[#9f1239] hover:text-[#6d0e28]"
        >
          Read <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}

export function CyberSafetyBriefingModal({ isOpen, onClose }: CyberSafetyBriefingModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  // Separate English / Hindi editions: original content per language, separate
  // cache entries, never mixed or translated. Switching language never shows
  // the other language's articles.
  const [newsLang, setNewsLang] = useState<NewsLang>("en");
  const [editions, setEditions] = useState<Record<NewsLang, EditionPayload | null>>({
    en: null,
    hi: null,
  });
  const [states, setStates] = useState<Record<NewsLang, LoadState>>({ en: "loading", hi: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState(false);

  const [pool, setPool] = useState<NewsArticle[]>([]);
  const [leadIndex, setLeadIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [didRotate, setDidRotate] = useState(false);
  const [watchFallback, setWatchFallback] = useState(false);

  const [narrationId, setNarrationId] = useState<string | null>(null);
  const [narrationProgress, setNarrationProgress] = useState(0);
  // User-held auto-scroll: explicit pause toggle + timestamp of the last
  // card interaction (pointer, focus, manual navigation). The tick gate
  // freezes advancement while held; narration has its own gate.
  const [userPaused, setUserPaused] = useState(false);
  const userPausedRef = useRef(false);
  const lastInteractRef = useRef(0);

  const markInteracted = useCallback(() => {
    lastInteractRef.current = Date.now();
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(isOpen);
  const onCloseRef = useRef(onClose);
  const poolRef = useRef<NewsArticle[]>([]);
  const leadIndexRef = useRef(0);
  const progressRef = useRef(0);
  const exitingRef = useRef(false);
  const pausedRef = useRef(false);
  const narrationIdRef = useRef<string | null>(null);
  const speakTargetRef = useRef<string | null>(null);
  const speakHandleRef = useRef<SpeakHandle | null>(null);
  const narrationLenRef = useRef(0);
  const exitTimerRef = useRef<number | null>(null);
  const watchFallbackTimerRef = useRef<number | null>(null);
  const touchXRef = useRef<number | null>(null);

  const applyPool = useCallback((nextPool: NewsArticle[]) => {
    poolRef.current = nextPool;
    setPool(nextPool);
  }, []);

  const newsLangRef = useRef<NewsLang>("en");
  newsLangRef.current = newsLang;
  const data = editions[newsLang];
  const state = states[newsLang];

  const setEditionFor = useCallback((lang: NewsLang, edition: EditionPayload | null) => {
    setEditions((prev) => ({ ...prev, [lang]: edition }));
  }, []);

  const setStateFor = useCallback((lang: NewsLang, next: LoadState) => {
    setStates((prev) => ({ ...prev, [lang]: next }));
  }, []);

  const loadBriefing = useCallback(
    async (lang: NewsLang) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStateFor(lang, "loading");
      const timeoutId = window.setTimeout(() => {
        if (abortRef.current === controller) {
          controller.abort();
        }
      }, FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/news?lang=${lang}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (abortRef.current !== controller) {
          clearTimeout(timeoutId);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { edition: EditionPayload };
        if (abortRef.current !== controller) {
          clearTimeout(timeoutId);
          return;
        }
        clearTimeout(timeoutId);
        // Trust-but-verify: the server tags every article; refuse a payload
        // whose items do not match the requested language (no EN-as-HI).
        const edition = body.edition;
        const items = [edition.lead, ...edition.stories, ...edition.cyberWatch].filter(
          (a): a is NewsArticle => a !== null
        );
        if (items.length > 0 && items.some((a) => (a.language ?? "en") !== lang)) {
          throw new Error(`language mismatch in ${lang} edition`);
        }
        setEditionFor(lang, edition);
        setStateFor(lang, "ready");
      } catch (err) {
        clearTimeout(timeoutId);
        if (abortRef.current !== controller) return;
        if ((err as Error).name === "AbortError") {
          if (isOpenRef.current) setStateFor(lang, "error");
          return;
        }
        setStateFor(lang, "error");
      }
    },
    [setEditionFor, setStateFor]
  );

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      abortRef.current?.abort();
      return;
    }
    loadBriefing(newsLangRef.current);
    return () => abortRef.current?.abort();
  }, [isOpen, loadBriefing, attempt]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setOpened(false);
      return;
    }
    const raf = requestAnimationFrame(() => setOpened(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const stopNarration = useCallback(() => {
    if (speakHandleRef.current) {
      try {
        speakHandleRef.current.cancel();
      } catch {
        /* noop */
      }
      speakHandleRef.current = null;
    }
    narrationIdRef.current = null;
    speakTargetRef.current = null;
    setNarrationId(null);
    setNarrationProgress(0);
  }, []);

  /**
   * Language switch: stop any active playback FIRST (no overlapping speech,
   * no English audio over Hindi cards), reset the carousel, then show the
   * cached edition or fetch it fresh. A failed Hindi fetch shows the error
   * state — English articles are never substituted as Hindi content.
   */
  const switchNewsLang = useCallback(
    (lang: NewsLang) => {
      if (lang === newsLangRef.current) return;
      stopNarration();
      leadIndexRef.current = 0;
      setLeadIndex(0);
      progressRef.current = 0;
      setProgress(0);
      // Fresh edition, fresh cadence: don't let the old language's
      // interaction hold freeze the new content. Explicit user pause persists.
      lastInteractRef.current = 0;
      setNewsLang(lang);
      if (!editions[lang]) {
        void loadBriefing(lang);
      }
    },
    [stopNarration, editions, loadBriefing]
  );

  const changeLead = useCallback(
    (index: number) => {
      stopNarration();
      const length = poolRef.current.length;
      if (length === 0) return;
      const bounded = ((index % length) + length) % length;
      if (bounded === leadIndexRef.current) {
        progressRef.current = 0;
        setProgress(0);
        return;
      }
      if (exitingRef.current) return;
      exitingRef.current = true;
      setExiting(true);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = window.setTimeout(() => {
        leadIndexRef.current = bounded;
        setLeadIndex(bounded);
        progressRef.current = 0;
        setProgress(0);
        exitingRef.current = false;
        setExiting(false);
        setDidRotate(true);
      }, STORY_EXIT_MS);
    },
    [stopNarration]
  );

  const rotateLead = useCallback(() => {
    if (narrationIdRef.current !== null || exitingRef.current) return;
    changeLead(nextLeadIndex(leadIndexRef.current, poolRef.current.length));
  }, [changeLead]);

  /** Manual navigation: freezes auto-advance (hold window) and never fights narration. */
  const userChangeLead = useCallback(
    (index: number) => {
      markInteracted();
      changeLead(index);
    },
    [changeLead, markInteracted]
  );

  useEffect(() => {
    userPausedRef.current = userPaused;
  }, [userPaused]);

  useEffect(() => {
    if (!isOpen || state !== "ready" || poolRef.current.length < 2) return;
    const timer = window.setInterval(() => {
      const gate = shouldAutoAdvance({
        narrating: narrationIdRef.current !== null,
        exiting: exitingRef.current,
        userPaused: userPausedRef.current,
        msSinceInteraction: Date.now() - lastInteractRef.current,
        reducedMotion,
        poolSize: poolRef.current.length,
      });
      if (!gate) return;
      progressRef.current = tickProgress(progressRef.current);
      if (progressRef.current >= 1) {
        progressRef.current = 0;
        setProgress(0);
        rotateLead();
      } else {
        setProgress(progressRef.current);
      }
    }, NEWS_AUTO_SCROLL_TICK_MS);
    return () => clearInterval(timer);
  }, [isOpen, reducedMotion, state, rotateLead]);

  useEffect(() => {
    if (!data) return;
    const currentId = poolRef.current[leadIndexRef.current]?.id;
    const nextPool = buildRotationPool({
      lead: data.lead,
      stories: data.stories,
      cyberWatch: data.cyberWatch,
    });
    applyPool(nextPool);
    if (currentId) {
      const idx = nextPool.findIndex((article) => article.id === currentId);
      leadIndexRef.current = idx >= 0 ? idx : 0;
      setLeadIndex(leadIndexRef.current);
    } else {
      leadIndexRef.current = 0;
      setLeadIndex(0);
    }
    /* lead, desk and watch all animate on mount once data is ready */
  }, [data, applyPool]);

  useEffect(() => {
    if (!isOpen) return;
    const poll = window.setInterval(async () => {
      const lang = newsLangRef.current;
      try {
        const res = await fetch(`/api/news?lang=${lang}`, { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const body = (await res.json()) as { edition: EditionPayload };
        if (newsLangRef.current !== lang) return;
        setEditionFor(lang, body.edition);
        const freshPool = buildRotationPool({
          lead: body.edition.lead,
          stories: body.edition.stories,
          cyberWatch: body.edition.cyberWatch,
        });
        const merged = mergePool(poolRef.current, freshPool);
        const currentId = poolRef.current[leadIndexRef.current]?.id;
        applyPool(merged);
        if (currentId) {
          const idx = merged.findIndex((article) => article.id === currentId);
          leadIndexRef.current = idx >= 0 ? idx : 0;
          setLeadIndex(leadIndexRef.current);
        }
      } catch {
        /* silent: keep the current edition */
      }
    }, REFRESH_POLL_MS);
    return () => clearInterval(poll);
  }, [isOpen, applyPool, setEditionFor]);

  useEffect(() => {
    narrationIdRef.current = narrationId;
  }, [narrationId]);

  useEffect(() => {
    exitingRef.current = exiting;
  }, [exiting]);

  useEffect(() => {
    if (state !== "ready" || reducedMotion) return;
    watchFallbackTimerRef.current = window.setTimeout(
      () => setWatchFallback(true),
      WATCH_FALLBACK_MS
    );
    return () => {
      if (watchFallbackTimerRef.current) clearTimeout(watchFallbackTimerRef.current);
    };
  }, [state, reducedMotion]);

  useEffect(() => {
    if (!isOpen) {
      progressRef.current = 0;
      setProgress(0);
      exitingRef.current = false;
      setExiting(false);
      stopNarration();
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (watchFallbackTimerRef.current) clearTimeout(watchFallbackTimerRef.current);
      // Unmount/close while narrating: cancel audio so no stale callback can
      // resume, advance, or set state after unmount.
      stopNarration();
      abortRef.current?.abort();
    };
  }, [isOpen, stopNarration]);

  const speakStory = useCallback(
    async (article: NewsArticle) => {
      if (!article) return;
      if (narrationIdRef.current === article.id) {
        stopNarration();
        return;
      }
      stopNarration();
      const text = buildNarration(article);
      narrationLenRef.current = text.length;
      speakTargetRef.current = article.id;
      // TTS language follows the ARTICLE's original language: Hindi news is
      // spoken with the Hindi voice (hi-IN Swara), English with English.
      // Never translated — a Hindi article is never read in English.
      const articleLang: NewsLang = article.language === "hi" ? "hi" : "en";
      const voice = await resolveFemaleVoice(articleLang);
      if (speakTargetRef.current !== article.id) return;
      const handle = speakWithEngine(text, voice, {
        language: articleLang,
        rate: 1.02,
        onStart: () => {
          if (speakTargetRef.current !== article.id) return;
          setNarrationId(article.id);
          setNarrationProgress(0);
        },
        onBoundary: (charIndex) => {
          if (speakTargetRef.current !== article.id) return;
          const len = narrationLenRef.current;
          setNarrationProgress(len ? Math.min(1, charIndex / len) : 0);
        },
        onEnd: () => {
          if (speakTargetRef.current !== article.id) return;
          narrationIdRef.current = null;
          speakHandleRef.current = null;
          setNarrationId(null);
          setNarrationProgress(0);
          // Narration completed: stay on THIS card and restart the cadence
          // from zero — the next card must NOT start immediately when audio
          // ends. Auto-scroll resumes only after a full interval (unless the
          // user explicitly paused it, which persists).
          progressRef.current = 0;
          setProgress(0);
        },
        onError: () => {
          if (speakTargetRef.current !== article.id) return;
          narrationIdRef.current = null;
          speakHandleRef.current = null;
          setNarrationId(null);
          setNarrationProgress(0);
        },
      });
      speakHandleRef.current = handle;
    },
    [stopNarration]
  );

  // Must call all hooks before any conditional returns (React Rules of Hooks)
  const watchSection = useRevealOnce(
    isOpen && state === "ready" && data !== null && data.cyberWatch.length > 0 && !reducedMotion
  );

  if (!isOpen) return null;

  const lead = pool[leadIndex] ?? data?.lead ?? null;
  const deskItemsRaw = deskCandidates(pool, lead?.id ?? "", 3);
  const desk = excludePoolFromSecondary(deskItemsRaw, pool);
  const watchItemsRaw = watchArticles(data?.cyberWatch ?? [], lead?.id ?? "", 2);
  const watch = excludePoolFromSecondary(watchItemsRaw, pool);
  const updatedAt = data ? formatUpdatedAt(data.fetchedAt) : "";
  const isReady = state === "ready";
  const canRotate = isReady && !reducedMotion && pool.length > 1;
  const isReading = isReady && narrationId !== null;
  const staggerLead = !didRotate && !reducedMotion;
  const openedView = reducedMotion || opened;

  const animCls = (cls: string) => (reducedMotion ? "" : cls);
  const animDelay = (ms: number) => (reducedMotion ? undefined : { animationDelay: `${ms}ms` });

  const promoteStory = (article: NewsArticle) => {
    const idx = poolRef.current.findIndex((a) => a.id === article.id);
    userChangeLead(idx >= 0 ? idx : 0);
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-3 lg:p-5 transition-opacity duration-300 ${
        openedView ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Cyber Safety Briefing"
      onClick={() => onCloseRef.current()}
    >
      <div
        className={`relative flex h-[96vh] w-full max-w-[1150px] flex-col overflow-hidden rounded-none sm:rounded-sm border-2 border-[#d0c6af] bg-[#f7f3e8] text-[#221e18] shadow-[0_25px_70px_rgba(0,0,0,0.85)] transition-[opacity,transform] duration-500 ease-out sm:h-[92vh] sm:w-[94vw] ${
          openedView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top control bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ded5c0] bg-[#efe8d8] px-4 sm:px-8 py-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[#7a7363]">
            <Newspaper className="h-3.5 w-3.5 text-[#9f1239]" />
            <span className="hidden sm:inline">Cybercrime Intelligence · Safety Desk</span>
            <span className="sm:hidden">Safety Desk</span>
          </span>
          <div className="flex items-center gap-2">
            {/* News language switch: separate original editions, never translated */}
            <div
              role="group"
              aria-label="News language: original English or original Hindi sources"
              title="English fetches original English news · Hindi fetches original Hindi news"
              className="flex items-center gap-0.5 rounded-none border border-[#d8cfba] bg-[#fdfaf3] p-0.5"
            >
              <button
                type="button"
                onClick={() => switchNewsLang("en")}
                aria-pressed={newsLang === "en"}
                title="Original English news (The Indian Express, The Times of India and more)"
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition ${
                  newsLang === "en"
                    ? "bg-[#9f1239] text-[#fbf8f1]"
                    : "text-[#7a7363] hover:text-[#9f1239]"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => switchNewsLang("hi")}
                aria-pressed={newsLang === "hi"}
                title="मूल हिंदी समाचार (बीबीसी हिंदी, नवभारत टाइम्स)"
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition ${
                  newsLang === "hi"
                    ? "bg-[#9f1239] text-[#fbf8f1]"
                    : "text-[#7a7363] hover:text-[#9f1239]"
                }`}
              >
                हिंदी
              </button>
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close briefing"
              className="group inline-flex items-center gap-1.5 rounded-none border border-[#d8cfba] bg-[#fdfaf3] px-2.5 py-1 text-[#4a4436] hover:border-[#9f1239] hover:bg-[#9f1239] hover:text-[#fbf8f1] transition"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Close</span>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Masthead */}
        <div className="shrink-0 border-b border-[#ded5c0] px-4 sm:px-8 pb-5 pt-4">
          <div className="flex flex-col items-center pb-3 text-center">
            <h2
              className={`${animCls("csb-anim-up")} font-serif text-3xl font-black uppercase tracking-tight text-[#1c1813] sm:text-4xl`}
              style={animDelay(0)}
            >
              Cyber Safety Briefing
            </h2>
            <p
              className={`${animCls("csb-anim-up")} mt-1 text-[10px] uppercase tracking-[0.3em] text-[#7a7363] sm:text-[11px]`}
              style={animDelay(150)}
            >
              Sakhi News Desk · India
            </p>
            <div
              className={`${animCls("csb-rule-expand")} mt-3 h-[2px] w-3/5 max-w-72 origin-left bg-gradient-to-r from-[#9f1239] to-[#e8a1a1]`}
              style={animDelay(300)}
              aria-hidden
            />
          </div>
          <div
            className={`${animCls("csb-anim-up")} mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[#ded5c0] pt-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8b8371] sm:text-[10px]`}
            style={animDelay(450)}
          >
            <span>Today&apos;s edition — {editionDate}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex items-center gap-1.5">
                {isReading ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-[#9f1239] csb-live-pulse" />
                    <span className="text-[#9f1239]">Reading story</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      {!reducedMotion && <span className="csb-live-pulse absolute inline-flex h-full w-full rounded-full bg-[#b91c1c] opacity-75" />}
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b91c1c]" />
                    </span>
                    <span className="text-[#9f1239]">Live cyber desk</span>
                  </>
                )}
              </span>
              <span>
                {isReady && updatedAt ? (
                  <>Updated {updatedAt} IST</>
                ) : (
                  "Selected reports from the public record"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable article area */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden relative"
          onTouchStart={(e) => {
            touchXRef.current = e.touches[0].clientX;
          }}
            onTouchEnd={(e) => {
              if (touchXRef.current === null) return;
              const dx = e.changedTouches[0].clientX - touchXRef.current;
              touchXRef.current = null;
              if (Math.abs(dx) > SWIPE_THRESHOLD_PX && poolRef.current.length > 1) {
                userChangeLead(dx < 0 ? leadIndexRef.current + 1 : leadIndexRef.current - 1);
              }
            }}
          onPointerDown={markInteracted}
          onFocusCapture={markInteracted}
        >
          <NewspaperBackground />
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#9f1239]" />
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7a7363]">
                {newsLang === "hi"
                  ? "न्यूज़ डेस्क आज का हिंदी संस्करण तैयार कर रहा है…"
                  : "The news desk is setting today's edition…"}
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#a49b84]">
                {newsLang === "hi" ? "मूल हिंदी स्रोत" : "Original English sources"}
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
              <Newspaper className="h-9 w-9 text-[#b7ac93]" />
              <p className="max-w-md font-serif text-2xl font-bold text-[#221e18]">
                {newsLang === "hi" ? "साइबर सुरक्षा ब्रीफिंग" : "Cyber safety briefing"}
              </p>
              <p className="max-w-md text-sm text-[#7a7363]">
                {newsLang === "hi"
                  ? "आज की हिंदी ब्रीफिंग लोड नहीं हो सकी। अंग्रेज़ी खबरों को हिंदी बताकर नहीं दिखाया जाता — कृपया पुनः प्रयास करें।"
                  : "Today's cyber briefing could not be loaded."}
              </p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-none border border-[#9f1239]/50 bg-[#fbf8f1] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#9f1239] hover:bg-[#9f1239] hover:text-[#fbf8f1] transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {newsLang === "hi" ? "पुनः प्रयास करें" : "Retry"}
              </button>
            </div>
          )}

          {isReady && data && (data.lead || desk.length > 0) && (
            <div className="px-3 py-5 sm:px-8 sm:py-6">
              {/* Featured stage */}
              <div className={animCls("csb-anim-up")} style={animDelay(0)}>
                <div className="flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.34em] text-[#8a7f6c]">
                  <span className="h-px w-10 bg-[#d8cfba]" aria-hidden />
                  {newsLang === "hi" ? "प्रमुख साइबर रिपोर्ट" : "Featured cyber report"}
                  <span className="h-px w-10 bg-[#d8cfba]" aria-hidden />
                </div>

                <div className="mt-4 flex items-stretch gap-2 sm:gap-3">
                  <button
                    type="button"
                    aria-label="Previous story"
                    onClick={() => userChangeLead(leadIndexRef.current - 1)}
                    disabled={pool.length < 2}
                    className="hidden shrink-0 self-center rounded-none border border-[#d8cfba] bg-[#fdfaf3] p-2 text-[#7a7363] hover:border-[#9f1239] hover:text-[#9f1239] disabled:opacity-30 sm:block"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  {lead ? (
                    <article
                      key={lead.id}
                      aria-live="polite"
                      className={`min-w-0 flex-1 overflow-hidden border-y-2 border-[#2b251c] border-x border-[#d8ceb8] bg-[#fdfaf3] ${
                        exiting
                          ? "csb-anim-story-out"
                          : staggerLead
                            ? ""
                            : "csb-anim-story-in"
                      }`}
                    >
                      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:gap-6 sm:p-8 min-h-[300px] sm:min-h-[340px]">
                        <StageImage article={lead} reduced={reducedMotion} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-none bg-[#9f1239] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fbf8f1]">
                              {lead.category}
                            </span>
                            <span
                              className="rounded-none border border-[#d8cfba] bg-[#efe8d8] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a7363]"
                              title={
                                newsLang === "hi"
                                  ? "मूल हिंदी स्रोत से"
                                  : "From original English sources"
                              }
                            >
                              {newsLang === "hi" ? "मूल हिंदी" : "Original EN"}
                            </span>
                            {isReading && narrationId === lead.id ? (
                              <span className="inline-flex items-center gap-1.5 rounded-none border border-[#9f1239]/40 bg-[#f7e8e6] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9f1239]">
                                <Volume2 className="h-3 w-3" />
                                Reading
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 font-serif text-2xl font-black leading-snug text-[#1a1612] sm:text-3xl">
                            {lead.title}
                          </h3>
                          {lead.summary ? (
                            <p className="mt-3 font-serif text-[14px] sm:text-[15px] leading-relaxed text-[#3a342a]">
                              {lead.summary}
                            </p>
                          ) : null}
                          <div className="mt-3">
                            <SourceMeta article={lead} />
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => speakStory(lead)}
                              aria-label="Read this story aloud"
                              className={`inline-flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-[11px] font-serif font-bold uppercase tracking-[0.16em] transition ${
                                narrationId === lead.id
                                  ? "border-[#9f1239] bg-[#9f1239] text-[#fbf8f1]"
                                  : "border-[#9f1239] bg-[#fdfaf3] text-[#9f1239] hover:bg-[#9f1239] hover:text-[#fbf8f1]"
                              }`}
                            >
                              {narrationId === lead.id ? (
                                <>
                                  <Volume2 className="h-3.5 w-3.5" />
                                  Stop audio
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5" />
                                  Read aloud
                                </>
                              )}
                            </button>

                            {narrationId === lead.id && (
                              <span className="flex-1 self-center" aria-hidden>
                                <span className="block h-[3px] max-w-40 overflow-hidden rounded-full bg-[#ece5d4]">
                                  <span
                                    className="block h-full rounded-full bg-[#9f1239] transition-[width] duration-200 ease-linear"
                                    style={{ width: `${Math.round(narrationProgress * 100)}%` }}
                                  />
                                </span>
                              </span>
                            )}

                            {lead.sourceUrl ? (
                              <a
                                href={lead.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1.5 text-[11px] font-serif font-bold uppercase tracking-[0.16em] text-[#221e18] underline underline-offset-4 decoration-[#9f1239]/50 hover:text-[#9f1239] hover:decoration-[#9f1239] transition-colors"
                              >
                                Read full story
                                <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : null}

                  <button
                    type="button"
                    aria-label="Next story"
                    onClick={() => userChangeLead(leadIndexRef.current + 1)}
                    disabled={pool.length < 2}
                    className="hidden shrink-0 self-center rounded-none border border-[#d8cfba] bg-[#fdfaf3] p-2 text-[#7a7363] hover:border-[#9f1239] hover:text-[#9f1239] disabled:opacity-30 sm:block"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                {/* Story dots + rotation progress + auto-scroll pause */}
                <div className="mt-3 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    {pool.map((story, i) => (
                      <button
                        key={story.id}
                        type="button"
                        aria-label={`Go to story ${i + 1} of ${pool.length}`}
                        aria-current={i === leadIndex ? "true" : undefined}
                        onClick={() => userChangeLead(i)}
                        className={`h-2 w-2 rounded-full transition hover:scale-125 ${
                          i === leadIndex ? "bg-[#9f1239]" : "bg-[#d8cfba]"
                        }`}
                      />
                    ))}
                    {canRotate && (
                      <button
                        type="button"
                        onClick={() => {
                          markInteracted();
                          setUserPaused((p) => !p);
                        }}
                        aria-pressed={userPaused}
                        aria-label={userPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
                        title={userPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
                        className={`ml-1 rounded-none border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] transition ${
                          userPaused
                            ? "border-[#9f1239] bg-[#9f1239] text-[#fbf8f1]"
                            : "border-[#d8cfba] bg-[#fdfaf3] text-[#7a7363] hover:border-[#9f1239] hover:text-[#9f1239]"
                        }`}
                      >
                        {userPaused ? "▶" : "❚❚"}
                      </button>
                    )}
                  </div>
                  {canRotate && (
                    <span className="block h-[2px] w-44 max-w-full overflow-hidden rounded-full bg-[#e6dfcc]" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-[#9f1239]"
                        style={{
                          width: `${Math.min(100, progress * 100)}%`,
                          transition: "width 250ms linear",
                        }}
                      />
                    </span>
                  )}
                </div>
              </div>

              {desk.length > 0 && (
                <>
                  <SectionDivider label={newsLang === "hi" ? "डेस्क से और" : "More from the desk"} />
                  <ol className="border border-[#d8ceb8] bg-[#fdfaf3]">
                    {desk.map((story, i) => (
                      <li key={story.id} className="border-b border-[#ded5c0] last:border-b-0">
                        <button
                          type="button"
                          onClick={() => promoteStory(story)}
                          className="group flex w-full items-start gap-3 px-3 py-4 text-left transition hover:bg-[#f3edde] sm:px-4 sm:py-5"
                        >
                          <span className="pt-0.5 font-serif text-sm italic text-[#8a7f6c] group-hover:text-[#9f1239]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[#9f1239]">
                              {story.category}
                            </span>
                            <h4 className="font-serif text-base font-bold leading-snug text-[#221e18] group-hover:text-[#9f1239] sm:text-lg">
                              {story.title}
                            </h4>
                            {story.summary ? (
                              <span className="mt-1.5 block font-serif text-[13px] leading-relaxed text-[#4a4234] line-clamp-4">
                                {story.summary}
                              </span>
                            ) : null}
                            <span className="mt-1.5 block text-[11px] text-[#7a7363]">
                              <span className="font-semibold text-[#56503f]">{story.sourceName}</span>
                              {" · "}
                              {formatPublishedDate(story.publishedAt, newsLang)}
                              {" · "}
                              <span className="font-semibold">
                                {newsLang === "hi" ? "हिंदी" : "EN"}
                              </span>
                              {story.location ? (
                                <>
                                  {" · "}
                                  {story.location}
                                </>
                              ) : null}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#b7ac93] transition-transform group-hover:translate-x-1 group-hover:text-[#9f1239]" />
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {watch.length > 0 && (
                <>
                  <SectionDivider label={newsLang === "hi" ? "साइबर निगरानी" : "Cyber watch"} />
                  <div ref={watchSection.ref} className="space-y-0 px-2">
                    {(watchSection.revealed || watchFallback || reducedMotion) &&
                      watch.map((item) => (
                        <div key={item.id}>
                          <WatchItem article={item} />
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}

          {isReady && data && !data.lead && desk.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
              <Newspaper className="h-9 w-9 text-[#b7ac93]" />
              <p className="max-w-md text-sm text-[#7a7363]">
                {newsLang === "hi"
                  ? "न्यूज़ डेस्क अभी ऑफ़लाइन है — कोई ताज़ा हिंदी रिपोर्ट उपलब्ध नहीं है। कृपया थोड़ी देर बाद देखें।"
                  : "The News Desk is offline right now — no fresh reports are available. Please check back shortly."}
              </p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-md border border-[#9f1239]/50 bg-[#fbf8f1] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#9f1239] hover:bg-[#9f1239] hover:text-[#fbf8f1] transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {newsLang === "hi" ? "पुनः प्रयास करें" : "Retry"}
              </button>
            </div>
          )}
        </div>

        {/* Safety desk note */}
        <div className="shrink-0 border-t-2 border-[#e2dac6] bg-[#efe9db]">
          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-8">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.25em] text-[#9f1239] sm:pt-0.5">
              Safety desk
            </span>
            <p className="min-w-0 text-[11px] leading-relaxed text-[#56503f] sm:text-xs">
              In an active fraud, call{" "}
              <strong className="font-semibold text-[#9f1239]">1930</strong> within the first hour
              and file a report at{" "}
              <span className="font-semibold text-[#221e18]">cybercrime.gov.in</span>. Never
              transfer money under pressure — block the contact and tell a trusted person. Save
              screenshots to the Evidence Locker (SHA-256 hashed) before you call.
            </p>
          </div>
        </div>

        {/* Editorial motion keyframes */}
        <style jsx global>{`
          .csb-anim-up {
            animation: csb-slide-up 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both;
          }
          .csb-rule-expand {
            animation: csb-rule-expand 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .csb-anim-story-out {
            animation: csb-story-out 0.28s ease-in both;
          }
          .csb-anim-story-in {
            animation: csb-story-in 0.38s ease-out both;
          }
          .csb-stage-zoom {
            animation: csb-stage-zoom 5s ease-out both;
          }
          .csb-live-pulse {
            animation: csb-live-pulse 2.4s ease-out infinite;
          }
          @keyframes csb-slide-up {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes csb-rule-expand {
            from {
              opacity: 0;
              transform: scaleX(0);
            }
            to {
              opacity: 1;
              transform: scaleX(1);
            }
          }
          @keyframes csb-stage-zoom {
            from {
              transform: scale(1.02);
            }
            to {
              transform: scale(1);
            }
          }
          @keyframes csb-story-in {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes csb-story-out {
            from {
              opacity: 1;
              transform: translateX(0);
            }
            to {
              opacity: 0;
              transform: translateX(-20px);
            }
          }
          @keyframes csb-live-pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(159, 18, 57, 0.45);
            }
            70% {
              box-shadow: 0 0 0 6px rgba(159, 18, 57, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(159, 18, 57, 0);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
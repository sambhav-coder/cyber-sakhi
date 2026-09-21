"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  GOV_HERO_SLIDES,
  GOV_HERO_FADE_MS,
  GOV_HERO_ROTATION_MS,
} from "@/lib/gov/govPortalAssets";

/**
 * Full-page fixed background carousel for the Government Portal landing page.
 *
 * - Uses ONLY the four approved local images configured in
 *   lib/gov/govPortalAssets.ts (no remote/stock imagery).
 * - Fixed to viewport (position: fixed) so it continues behind all sections
 *   while scrolling.
 * - Composite images keep their native aspect ratio (background-size: cover
 *   with the slide's own focal position), so nothing is ever stretched.
 * - Layers all ready images underneath and crossfades between them.
 * - Performance: the first slide is preloaded eagerly; remaining slides are
 *   loaded staggered before rotation reaches them.
 * - Rotation and crossfade respect `prefers-reduced-motion`.
 */
export const GovPageBackground: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [ready, setReady] = useState<Set<number>>(() => new Set([0]));
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [parallax, setParallax] = useState(0);

  const liveImages = useMemo(
    () => GOV_HERO_SLIDES.map((img, i) => (ready.has(i) && !failed.has(i) ? img : null)).filter(Boolean) as typeof GOV_HERO_SLIDES,
    [ready, failed]
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const timers = GOV_HERO_SLIDES.map((img, i) =>
      window.setTimeout(() => {
        const preload = new Image();
        preload.onload = () =>
          setReady((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
        preload.onerror = () =>
          setFailed((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
        preload.src = img.src;
      }, i === 0 ? 0 : 900 * i)
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!reducedMotion && liveImages.length > 1) {
      const t = setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % liveImages.length);
      }, GOV_HERO_ROTATION_MS);
      return () => clearInterval(t);
    }
  }, [reducedMotion, liveImages.length]);

  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, liveImages.length - 1));
  }, [liveImages.length]);

  // Subtle scroll parallax on the active frame. Capped and gated behind
  // reduced motion; the per-slide scale keeps the edges covered.
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const drift = Math.max(-20, Math.min(0, -window.scrollY * 0.04));
        setParallax((prev) => (prev === drift ? prev : drift));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <div
      className="fixed inset-0 z-0"
      aria-hidden
    >
      {/* Baseline navy fallback */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 85% 0%, rgba(37, 99, 235, 0.22), transparent 60%), radial-gradient(70% 60% at 0% 100%, rgba(13, 148, 136, 0.18), transparent 55%), linear-gradient(180deg, #08101f 0%, #060b16 100%)",
        }}
      />

      {/* Rotating photo layers */}
      {liveImages.map((img, layerIndex) => (
        <div
          key={img.src}
          className="absolute inset-0 opacity-0 transition-[opacity,transform]"
          style={{
            backgroundImage: `url(${img.src})`,
            backgroundSize: "cover",
            backgroundPosition: `${img.positionX}% ${img.positionY}%`,
            opacity: layerIndex === activeIndex ? 1 : 0,
            transitionDuration: `${GOV_HERO_FADE_MS}ms`,
            transform:
              layerIndex === activeIndex && !reducedMotion
                ? `translate3d(0, ${parallax}px, 0) scale(${img.scale ?? 1})`
                : "scale(1)",
            willChange: "opacity, transform",
          }}
        />
      ))}

      {/* Dark gradient overlay for readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(5, 10, 20, 0.75) 0%, rgba(5, 10, 20, 0.85) 50%, rgba(6, 11, 22, 0.92) 100%)",
        }}
      />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)",
        }}
      />

      {/* Subtle scanline texture */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.09) 2px 3px)",
        }}
      />
    </div>
  );
};

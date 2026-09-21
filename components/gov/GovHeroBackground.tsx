"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  GOV_HERO_SLIDES,
  GOV_HERO_FADE_MS,
  GOV_HERO_ROTATION_MS,
} from "@/lib/gov/govPortalAssets";

interface GovHeroBackgroundProps {
  /** Content placed above the background. */
  children: React.ReactNode;
}

/**
 * Full-bleed rotating photo background for the Government Portal hero.
 *
 * - Uses ONLY the four approved local images configured in
 *   lib/gov/govPortalAssets.ts (no remote/stock imagery).
 * - Composite images keep their native aspect ratio (background-size: cover
 *   with the slide's own focal position), so nothing is ever stretched.
 * - Layers all ready images underneath and crossfades between them. Because
 *   every layer stays mounted, the outgoing frame is always visible while the
 *   next one fades in — no empty flashing frame and no jump on rotation.
 * - Performance: the first slide is preloaded eagerly (initial LCP stays one
 *   image); the remaining slides are loaded one at a time long before rotation
 *   reaches them. A slide is only rendered once its image is ready, and a
 *   failed slide is dropped — the navy gradient remains as the fallback.
 * - Rotation and crossfade respect `prefers-reduced-motion` (rotation stops,
 *   no drifting scale).
 */
export const GovHeroBackground: React.FC<GovHeroBackgroundProps> = ({ children }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [ready, setReady] = useState<Set<number>>(() => new Set([0]));
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [reducedMotion, setReducedMotion] = useState(false);

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
    // Performance: eager preload for the first slide, staggered lazy preload
    // for the rest (well before the 7s rotation reaches them). A slide is only
    // mounted once its image has loaded, so the browser never fetches a layer
    // on paint.
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

  // Normalize index when the image set changes (a failure removed an image).
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, liveImages.length - 1));
  }, [liveImages.length]);

  return (
    <div className="relative min-h-svh w-full overflow-hidden">
      {/* Background layers (decorative only) */}
      <div className="absolute inset-0" aria-hidden>
        {/* Baseline navy fallback (also covers any failed/loading images). */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 70% at 85% 0%, rgba(37, 99, 235, 0.22), transparent 60%), radial-gradient(70% 60% at 0% 100%, rgba(13, 148, 136, 0.18), transparent 55%), linear-gradient(180deg, #08101f 0%, #060b16 100%)",
          }}
        />

        {/* Rotating photo layers (only mounted once their image is ready) */}
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
                layerIndex === activeIndex && !reducedMotion && img.scale
                  ? `scale(${img.scale})`
                  : "scale(1)",
              willChange: "opacity, transform",
            }}
          />
        ))}

        {/* Left-to-right gradient so text / CTAs stay readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(5, 10, 20, 0.92) 0%, rgba(5, 10, 20, 0.78) 38%, rgba(6, 11, 22, 0.45) 72%, rgba(6, 11, 22, 0.22) 100%)",
          }}
        />

        {/* Bottom fade into the page background */}
        <div
          className="absolute inset-x-0 bottom-0 h-48"
          style={{
            background: "linear-gradient(180deg, transparent 0%, rgba(6, 11, 22, 0.92) 82%)",
          }}
        />

        {/* Subtle scanline / grain texture for a premium, non-neon feel */}
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.09) 2px 3px)",
          }}
        />
      </div>

      {/* Foreground content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
"use client";

import React from "react";

export type SakhiOrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

/**
 * Sakhi's orbital control — a futuristic planetary sphere, not a button or a
 * shield icon. The globe is lit by a slowly rotating RGB sheen (cyan → violet →
 * pink) which shifts to a state colour so the user always knows what Sakhi is
 * doing:
 *
 *   idle      rotating RGB sheen, calm breathing globe
 *   listening emerald scanning rings + green glow (mic live)
 *   thinking  fast conic sweep + dashed orbit shimmer (Gemini reasoning)
 *   speaking  crimson energy waves + deep red glow (she is talking)
 *   error     rose alarm pulse
 *
 * The planet itself is pure CSS radial layers + craters — no emoji, no icon.
 */
export function SakhiOrb({
  state,
  label,
  size = 168,
}: {
  state: SakhiOrbState;
  label?: string;
  size?: number;
}) {
  const sheen =
    state === "listening"
      ? "conic-gradient(from var(--sakhi-orb-angle), rgba(52,211,153,0) 0deg, rgba(52,211,153,0.7) 60deg, rgba(16,185,129,0.15) 120deg, rgba(52,211,153,0) 180deg)"
      : state === "speaking"
        ? "conic-gradient(from var(--sakhi-orb-angle), rgba(248,113,113,0) 0deg, rgba(248,113,113,0.75) 60deg, rgba(239,68,68,0.2) 130deg, rgba(248,113,113,0) 185deg)"
        : state === "thinking"
          ? "conic-gradient(from var(--sakhi-orb-angle), rgba(253,230,138,0) 0deg, rgba(253,230,138,0.85) 55deg, rgba(245,158,11,0.2) 120deg, rgba(253,230,138,0) 175deg)"
          : state === "error"
            ? "conic-gradient(from var(--sakhi-orb-angle), rgba(244,63,94,0) 0deg, rgba(244,63,94,0.8) 70deg, rgba(190,18,60,0.2) 140deg, rgba(244,63,94,0) 200deg)"
            : "conic-gradient(from var(--sakhi-orb-angle), rgba(34,211,238,0) 0deg, rgba(34,211,238,0.7) 55deg, rgba(167,139,250,0.55) 130deg, rgba(244,114,182,0.35) 210deg, rgba(34,211,238,0) 280deg)";

  const glow =
    state === "listening"
      ? "0 0 44px 8px rgba(52,211,153,0.5)"
      : state === "speaking"
        ? "0 0 52px 12px rgba(239,68,68,0.5)"
        : state === "thinking"
          ? "0 0 48px 10px rgba(245,158,11,0.42)"
          : state === "error"
            ? "0 0 40px 8px rgba(244,63,94,0.5)"
            : "0 0 34px 6px rgba(99,102,241,0.32)";

  const spinSpeed = state === "thinking" ? 1.1 : state === "listening" || state === "speaking" ? 2.2 : 7;

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="status"
      aria-live="polite"
    >
      <style>{SAKHI_ORB_CSS}</style>

      {/* Rotating outer ring — slow planetary halo */}
      <span
        className="sakhi-planet-ring"
        style={{ "--sakhi-ring-speed": `${spinSpeed}s` } as React.CSSProperties}
      />

      {/* State effects outside the globe */}
      {state === "listening" && (
        <>
          <span className="sakhi-orb-radar absolute rounded-full border-2 border-emerald-400/70" />
          <span className="sakhi-orb-radar sakhi-orb-radar-delay absolute rounded-full border-2 border-emerald-300/50" />
        </>
      )}

      {state === "speaking" && (
        <>
          <span className="sakhi-orb-wave absolute rounded-full bg-red-500/25" />
          <span className="sakhi-orb-wave sakhi-orb-wave-delay absolute rounded-full bg-red-400/15" />
        </>
      )}

      {state === "thinking" && (
        <span className="sakhi-orb-sweep absolute rounded-full" />
      )}

      {state === "error" && (
        <span className="sakhi-orb-alarm absolute rounded-full border-2 border-rose-400/60" />
      )}

      {/* ── THE PLANET ─────────────────────────────────────────────── */}
      <div
        className="sakhi-planet relative rounded-full"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          boxShadow: glow,
        }}
      >
        {/* RGB conic sheen sweeping across the globe */}
        <div
          className="sakhi-planet-sheen absolute inset-0 rounded-full"
          style={{
            background: sheen,
            animationDuration: `${spinSpeed}s`,
          }}
        />
        {/* Equatorial highlight */}
        <div className="absolute inset-[7%] rounded-full sakhi-planet-body" />
        {/* Surface craters / moons */}
        <span className="sakhi-crater sakhi-crater-1" />
        <span className="sakhi-crater sakhi-crater-2" />
        <span className="sakhi-crater sakhi-crater-3" />
        {/* Top-left light bloom */}
        <div
          className="absolute top-[9%] left-[14%] w-[38%] h-[26%] rounded-full sakhi-planet-light"
        />
      </div>

      <span className="sr-only">{label || "Sakhi voice control"}</span>
    </div>
  );
}

const SAKHI_ORB_CSS = `
@property --sakhi-orb-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes sakhi-orb-rotate {
  to { --sakhi-orb-angle: 360deg; }
}
@keyframes sakhi-orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}
@keyframes sakhi-orb-radar {
  0% { transform: scale(0.55); opacity: 0.95; }
  100% { transform: scale(1); opacity: 0; }
}
@keyframes sakhi-orb-wave {
  0% { transform: scale(0.6); opacity: 0.85; }
  100% { transform: scale(1.06); opacity: 0; }
}
@keyframes sakhi-orb-sweep {
  to { transform: rotate(360deg); }
}
@keyframes sakhi-orb-alarm {
  0%, 100% { transform: scale(0.72); opacity: 0.9; }
  50% { transform: scale(0.92); opacity: 0.25; }
}

.sakhi-planet {
  animation: sakhi-orb-breathe 4.2s ease-in-out infinite;
}
.sakhi-planet-sheen {
  mix-blend-mode: screen;
  animation: sakhi-orb-rotate var(--sakhi-ring-speed, 7s) linear infinite;
  will-change: --sakhi-orb-angle;
}
.sakhi-planet-body {
  background:
    radial-gradient(circle at 30% 28%, rgba(186, 230, 253, 0.28), transparent 42%),
    radial-gradient(circle at 72% 78%, rgba(159, 175, 255, 0.16), transparent 48%),
    radial-gradient(circle at 50% 50%, #171733 0%, #0c0c20 58%, #050510 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: inset 0 -6px 22px rgba(0, 0, 0, 0.7), inset 0 6px 16px rgba(203, 213, 225, 0.08);
}
.sakhi-planet-light {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 70%);
  filter: blur(2px);
}
.sakhi-crater {
  position: absolute;
  border-radius: 9999px;
  background: radial-gradient(circle at 40% 35%, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.02) 70%);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.sakhi-crater-1 { width: 22%; height: 13%; left: 20%; top: 22%; }
.sakhi-crater-2 { width: 15%; height: 9%; right: 16%; top: 46%; }
.sakhi-crater-3 { width: 12%; height: 8%; left: 34%; bottom: 14%; }
.sakhi-planet-ring {
  position: absolute;
  inset: -7%;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  animation: sakhi-orb-rotate var(--sakhi-ring-speed, 7s) linear infinite reverse;
  will-change: transform;
  border-top-color: rgba(148, 163, 184, 0.5);
  border-right-color: transparent;
  box-shadow: 0 0 14px rgba(99, 102, 241, 0.12) inset;
}

.sakhi-orb-radar { animation: sakhi-orb-radar 1.5s ease-out infinite; }
.sakhi-orb-radar-delay { animation-delay: 0.75s; }
.sakhi-orb-wave { animation: sakhi-orb-wave 1.5s ease-out infinite; }
.sakhi-orb-wave-delay { animation-delay: 0.75s; }
.sakhi-orb-sweep {
  inset: 0;
  border: 2px dashed rgba(253, 230, 138, 0.55);
  animation: sakhi-orb-sweep 1.6s linear infinite;
}
.sakhi-orb-alarm { animation: sakhi-orb-alarm 0.9s ease-in-out infinite; }
`;
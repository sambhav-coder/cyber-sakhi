"use client";

import React from "react";

export type SakhiOrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Animated Sakhi orb.
 *  - idle:       slow teal "breathing" glow.
 *  - listening:  red radar pulses (mic live).
 *  - thinking:   amber conic sweep.
 *  - speaking:   green expanding waves (sakhi talking).
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
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="status"
      aria-live="polite"
    >
      <style>{SAKHI_ORB_CSS}</style>

      {state === "listening" && (
        <>
          <span className="sakhi-orb-ring absolute rounded-full border-2 border-emergency-500/80" />
          <span className="sakhi-orb-ring sakhi-orb-ring-delay absolute rounded-full border-2 border-emergency-400/60" />
        </>
      )}

      {state === "speaking" && (
        <>
          <span className="sakhi-orb-wave absolute rounded-full bg-emerald-400/30" />
          <span className="sakhi-orb-wave sakhi-orb-wave-delay absolute rounded-full bg-emerald-300/20" />
        </>
      )}

      {state === "thinking" && (
        <span className="sakhi-orb-spin absolute rounded-full" />
      )}

      <div
        className="relative rounded-full sakhi-orb-core border-2"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          boxShadow:
            state === "listening"
              ? "0 0 40px 6px rgba(239, 68, 68, 0.45)"
              : state === "speaking"
                ? "0 0 40px 6px rgba(52, 211, 153, 0.45)"
                : state === "thinking"
                  ? "0 0 40px 6px rgba(245, 158, 11, 0.35)"
                  : "0 0 30px 4px rgba(45, 212, 191, 0.35)",
          animation: "sakhi-orb-breathe 3s ease-in-out infinite",
        }}
      >
        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-emergency-800 via-emergency-950 to-[#0d0d1e] flex items-center justify-center">
          <span className="text-3xl" aria-hidden>
            {state === "listening" ? "🎙️" : state === "speaking" ? "🗣️" : state === "thinking" ? "💭" : "🛡️"}
          </span>
        </div>
      </div>

      <span className="sr-only">{label || "Sakhi voice mode"}</span>
    </div>
  );
}

const SAKHI_ORB_CSS = `
@keyframes sakhi-orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
@keyframes sakhi-orb-wave {
  0% { width: 40%; height: 40%; opacity: 0.9; }
  100% { width: 100%; height: 100%; opacity: 0; }
}
.sakhi-orb-ring {
  animation: sakhi-orb-wave 1.6s ease-out infinite;
}
.sakhi-orb-ring-delay {
  animation-delay: 0.8s;
}
@keyframes sakhi-orb-rise {
  0% { width: 20%; height: 20%; opacity: 0.8; }
  100% { width: 100%; height: 100%; opacity: 0; }
}
.sakhi-orb-wave {
  animation: sakhi-orb-rise 1.4s ease-out infinite;
}
.sakhi-orb-wave-delay {
  animation-delay: 0.7s;
}
@keyframes sakhi-orb-spin {
  to { transform: rotate(360deg); }
}
.sakhi-orb-spin {
  inset: 0;
  border: 3px dashed rgba(245, 158, 11, 0.6);
  animation: sakhi-orb-spin 2.2s linear infinite;
  border-radius: 9999px;
}
`;
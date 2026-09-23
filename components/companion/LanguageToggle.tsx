"use client";

import React from "react";

/**
 * ONE smart language switch — the ONLY language control in Cyber-Sakhi.
 *
 * Two modes, no Auto/Hinglish options in the UI:
 *   - "en" — English mode: intros, replies and TTS voice in English.
 *   - "hi" — Hindi mode: intros, replies and TTS voice in Hindi (Devanagari).
 *
 * The switch is a *preference default*, not a stale lock: an explicit
 * in-message request ("tell me in Hindi") still wins for that turn
 * (see resolveTurnLanguage), and Voice Mode adapts the switch itself when
 * the transcript is confidently in the other language. Hinglish input is
 * handled naturally per turn (server-side detection) without needing a
 * third visible option. Technical identifiers (IPs, domains, hashes,
 * commands) are never translated regardless of mode.
 */
export type SmartLangMode = "en" | "hi";

interface SmartLanguageSwitchProps {
  value: SmartLangMode;
  onChange: (v: SmartLangMode) => void;
  compact?: boolean;
}

export function LanguageToggle({ value, onChange, compact }: SmartLanguageSwitchProps) {
  const set = (v: SmartLangMode) => {
    if (v !== value) onChange(v);
  };
  return (
    <div
      role="group"
      aria-label="Sakhi language: English or Hindi"
      title="Smart language switch — controls reply language and voice language"
      className={`flex items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-950/60 p-1 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <button
        type="button"
        onClick={() => set("en")}
        title="English mode — replies and voice in English"
        aria-pressed={value === "en"}
        className={`rounded-lg px-2 py-1 font-bold transition ${
          value === "en"
            ? "bg-emergency-600 text-white shadow-sm"
            : "text-slate-400 hover:text-emergency-200 hover:bg-slate-900"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => set("hi")}
        title="Hindi mode — replies and voice in Hindi"
        aria-pressed={value === "hi"}
        className={`rounded-lg px-2 py-1 font-bold transition ${
          value === "hi"
            ? "bg-emergency-600 text-white shadow-sm"
            : "text-slate-400 hover:text-emergency-200 hover:bg-slate-900"
        }`}
      >
        हिं
      </button>
    </div>
  );
}

/**
 * Adapt the smart switch to a freshly detected turn language ("smart"
 * voice behaviour): a confident en/hi transcript moves the switch so the
 * reply, the TTS voice and the NEXT intro all follow what the user actually
 * spoke. Hinglish leaves the switch untouched (handled per turn).
 */
export function adaptSwitchToDetected(
  current: SmartLangMode,
  detected: string | null | undefined
): SmartLangMode {
  if (detected === "en" || detected === "hi") return detected;
  return current;
}

"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SakhiHub } from "@/components/companion/SakhiHub";
import {
  getEntryLanguage,
  setEntryLanguage,
  type EntryLang,
} from "@/lib/entryLanguage";
import {
  DEFAULT_AVATAR_ID,
  getAvatarPreset,
} from "@/lib/avatar/presets";

/**
 * Entry language gate for the Sakhi hub (/sakhi).
 *
 * No intro audio, no avatar speech, and no SakhiHub mount happens before the
 * user picks English or Hindi: the choice resolves FIRST, then the hub
 * mounts with that language, so displayed text, intro copy, and spoken TTS
 * are consistent from the very first frame. The choice persists in
 * sessionStorage so Chat and Voice modes inherit it as their default.
 */
export function EntryLanguageGate() {
  const [choice, setChoice] = useState<EntryLang | null>(() => getEntryLanguage());
  const [changing, setChanging] = useState(false);
  const searchParams = useSearchParams();
  // Reversible candidate preview: /sakhi?avatar=<preset-id>. Unknown ids
  // fall back to the existing avatar (never a broken model). No param (or
  // the default id) means the production avatar, byte-for-byte behaviour.
  const requestedAvatar = searchParams.get("avatar");
  const { preset: avatarPreset, fallback: avatarFallback } = getAvatarPreset(
    requestedAvatar ?? DEFAULT_AVATAR_ID
  );
  const isCandidatePreview =
    requestedAvatar !== null && avatarPreset.id !== DEFAULT_AVATAR_ID && !avatarFallback;

  if (!choice || changing) {
    const pick = (lang: EntryLang) => {
      setEntryLanguage(lang);
      setChoice(lang);
      setChanging(false);
    };
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-950/70 p-8 text-center space-y-5"
          role="group"
          aria-label="Choose Sakhi's language"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emergency-300">
            Sakhi AI
          </p>
          <h1 className="text-2xl font-black text-white">
            Choose your language
            <span className="block text-lg font-bold text-slate-300 mt-1">
              अपनी भाषा चुनें
            </span>
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Sakhi&apos;s introduction will play in the language you pick — text
            and voice always match.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => pick("en")}
              aria-label="Continue in English"
              className="rounded-2xl border border-emergency-600/60 bg-emergency-600/15 px-4 py-5 text-white font-bold transition hover:bg-emergency-600/30"
            >
              <span className="block text-lg">English</span>
              <span className="block text-[11px] font-normal text-slate-400 mt-1">
                Intro in English
              </span>
            </button>
            <button
              type="button"
              onClick={() => pick("hi")}
              aria-label="हिंदी में जारी रखें"
              className="rounded-2xl border border-emergency-600/60 bg-emergency-600/15 px-4 py-5 text-white font-bold transition hover:bg-emergency-600/30"
            >
              <span className="block text-lg">हिंदी</span>
              <span className="block text-[11px] font-normal text-slate-400 mt-1">
                हिंदी में परिचय
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end px-1 pb-1">
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-emergency-300 transition"
        >
          {choice === "hi" ? "भाषा बदलें" : "Change language"}
        </button>
      </div>
      {isCandidatePreview && (
        <p
          role="status"
          className="mx-auto mb-2 w-fit rounded-full border border-amber-500/50 bg-amber-950/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300"
        >
          Candidate preview: {avatarPreset.label} — reversible experiment
        </p>
      )}
      <SakhiHub
        key={`${choice}:${avatarPreset.id}`}
        language={choice}
        modelUrl={avatarPreset.modelUrl}
      />
    </div>
  );
}

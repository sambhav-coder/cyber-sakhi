"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Bot,
  MessageSquare,
  Mic,
  Play,
  Sparkles,
  Loader2,
  Volume2,
  Lock,
  ArrowRight,
} from "lucide-react";
import type {
  LiveSakhiAvatarHandle,
  SakhiAvatarStatus,
  SakhiExpression,
} from "@/components/companion/LiveSakhiAvatar";
import {
  getBrowserSpeechCapabilities,
  resolveFemaleVoice,
  speakWithEngine,
} from "@/lib/voice/speech";
import type { SpeakHandle } from "@/lib/voice/speech";
import { SAKHI_LANDING_INTRO } from "@/lib/voice/content";

// Live 3D Sakhi avatar — TalkingHead (WebGL) + Three.js. Imported client-side
// only so WebGL/browser APIs never execute during SSR.
const LiveSakhiAvatar = dynamic(
  () =>
    import("@/components/companion/LiveSakhiAvatar").then((m) => m.LiveSakhiAvatar),
  { ssr: false }
);

const AUTOPLAY_BLOCK_DETECT_MS = 5000;

const HUB_INTRO = SAKHI_LANDING_INTRO;

export function SakhiHub() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [introPhase, setIntroPhase] = useState<"idle" | "speaking" | "done">("idle");
  const [blocked, setBlocked] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<SakhiAvatarStatus>("loading");
  const [voiceReady, setVoiceReady] = useState(false);

  const avatarRef = useRef<LiveSakhiAvatarHandle | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const introStartedRef = useRef(false);
  const speechStartedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const setExpression = (exp: SakhiExpression) => {
    avatarRef.current?.setExpression(exp);
  };

  useEffect(() => {
    const caps = getBrowserSpeechCapabilities();
    setSpeechSupported(caps.tts);
    resolveFemaleVoice("en").then((v) => {
      voiceRef.current = v;
      setVoiceReady(true);
    });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      try {
        speakRef.current?.cancel();
      } catch { /* noop */ }
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelIntro = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    speakRef.current?.cancel();
    speakRef.current = null;
  };

  const revealIntro = (text: string) => {
    let steps = revealCount;
    const iv = window.setInterval(() => {
      steps += 2;
      setRevealCount(steps);
      if (steps >= text.length) {
        window.clearInterval(iv);
      }
    }, 60);
    timersRef.current.push(iv);
  };

  const attemptIntro = () => {
    if (introStartedRef.current) return;
    introStartedRef.current = true;
    speechStartedRef.current = false;
    setBlocked(false);
    setRevealCount(0);

    if (!speechSupported) {
      // No TTS — reveal the intro on its own, honestly paced.
      speechStartedRef.current = true;
      setIntroPhase("done");
      let steps = 0;
      const iv = window.setInterval(() => {
        steps += 3;
        setRevealCount(steps);
        if (steps >= HUB_INTRO.length) {
          window.clearInterval(iv);
        }
      }, 30);
      timersRef.current.push(iv);
      return;
    }

    setIntroPhase("speaking");
    setIsSpeaking(true);
    // Landing introduction is ALWAYS English (product policy) — the local
    // Piper English voice is used when available, else speechSynthesis.
    console.log("🧪 [SakhiHub] TTS REQUEST:", { 
      TTS_ENGINE: "edge-tts (via /api/voice/tts)",
      LANGUAGE: "en",
      TEXT_LENGTH: HUB_INTRO.length,
      TEST_MODE: process.env.SAKHI_TEST_MODE === 'edge-tts-only' ? "edge-tts-only" : "normal"
    });
    const handle = speakWithEngine(HUB_INTRO, voiceRef.current, {
      language: "en",
      rate: 0.97,
      pitch: 1.03,
      onStart: () => {
        console.log("🧪 [SakhiHub] TTS AUDIO STARTED");
        speechStartedRef.current = true;
        setBlocked(false);
        setIntroPhase("speaking");
        setIsSpeaking(true);
        setExpression("warm");
        avatarRef.current?.speakStart(HUB_INTRO);
        revealIntro(HUB_INTRO);
      },
      onEnd: () => {
        console.log("🧪 [SakhiHub] TTS AUDIO COMPLETED");
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setIsSpeaking(false);
        setRevealCount(HUB_INTRO.length);
        setIntroPhase("done");
        cancelIntro();
      },
      onError: () => {
        console.error("🧪 [SakhiHub] TTS AUDIO ERROR");
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setIsSpeaking(false);
        setRevealCount(HUB_INTRO.length);
        setIntroPhase("done");
        cancelIntro();
      },
    });
    speakRef.current = handle;

    // Autoplay-block detection: only surface the "blocked" card when the audio
    // NEVER started after the timeout. If onStart fired, Sakhi is ALREADY speaking
    // the full intro without truncation.
    const blockId = window.setTimeout(() => {
      if (speechStartedRef.current) return;
      if (!speakRef.current) return;
      setBlocked(true);
      setIsSpeaking(false);
      setIntroPhase("idle");
      setRevealCount(HUB_INTRO.length);
      cancelIntro();
    }, AUTOPLAY_BLOCK_DETECT_MS);
    timersRef.current.push(blockId);
  };

  useEffect(() => {
    if (voiceReady) {
      const id = window.setTimeout(attemptIntro, 1200);
      timersRef.current.push(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceReady]);

  const playManually = () => {
    introStartedRef.current = false;
    attemptIntro();
  };

  const introRevealed = revealCount >= HUB_INTRO.length;

  return (
    <div className="relative min-h-screen w-full overflow-x-clip">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute left-1/2 top-[-160px] -translate-x-1/2 w-[880px] h-[520px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(185,28,28,0.30) 0%, rgba(185,28,28,0.08) 42%, transparent 72%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute left-[-120px] bottom-[-140px] w-[520px] h-[420px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(127,29,29,0.26) 0%, transparent 72%)",
            filter: "blur(46px)",
          }}
        />
      </div>

      {/* Header strip */}
      <div className="relative z-20 w-full flex items-center justify-between px-5 sm:px-8 pt-5 sm:pt-7">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emergency-700 to-emergency-950 p-[2px] shadow-lg shadow-emergency-900/40">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[10px] flex items-center justify-center">
              <Bot className="w-[18px] h-[18px] text-emergency-400" />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-black tracking-tight text-white uppercase">
              Sakhi <span className="text-crimson-gradient">AI</span>
            </div>
            <div className="text-[9px] tracking-[0.22em] text-slate-500 uppercase font-bold">
              Hub · Chat + Voice
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800/90 bg-slate-950/40">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Private Space
            </span>
          </div>
        </div>
      </div>

      {/* Main hub */}
      <div className="relative z-10 w-full max-w-[1240px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-14 sm:pb-20">
        <div className="w-full grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:items-center">
          {/* Avatar */}
          <div className="relative w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[430px] mx-auto flex flex-col items-center justify-center">
            <div className="relative w-full">
              <div
                aria-hidden
                className="absolute inset-[-18px] rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(239,68,68,0.24) 0%, transparent 62%)",
                  filter: "blur(6px)",
                }}
              />
              <div className="relative rounded-[26px] overflow-hidden border border-emergency-900/50 bg-emergency-950/15 shadow-[0_30px_80px_-30px_rgba(127,29,29,0.7)]">
                <LiveSakhiAvatar
                  ref={avatarRef}
                  isSpeaking={isSpeaking}
                  reducedMotion={reducedMotion}
                  onStatus={setAvatarStatus}
                />
              </div>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emergency-900/40 bg-emergency-950/25 mx-auto">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    avatarStatus === "error"
                      ? "bg-rose-400"
                      : avatarStatus === "loading"
                        ? "bg-amber-300/70"
                        : isSpeaking
                          ? "bg-emergency-300 animate-pulse"
                          : "bg-emerald-400"
                  }`}
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {avatarStatus === "error"
                    ? "Avatar offline — modes below still work"
                    : avatarStatus === "loading"
                      ? "Loading Sakhi…"
                      : isSpeaking
                        ? "Sakhi speaking"
                        : "Sakhi online"}
                </span>
              </div>
            </div>
          </div>

          {/* Intro + two modes */}
          <div className="flex flex-col gap-6 sm:gap-7">
            <div className="space-y-3 sm:space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emergency-800/50 bg-emergency-950/30 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5 text-emergency-300 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emergency-200">
                  WELCOME TO SAKHI AI
                </span>
              </div>
              <h1 className="text-[32px] sm:text-[42px] lg:text-[50px] font-black tracking-[-0.02em] leading-[0.98] text-white">
                Chat or talk.
                <br />
                <span className="text-crimson-gradient">Just choose your mode.</span>
              </h1>
            </div>

            {/* Intro dialogue */}
            <div className="relative rounded-2xl border border-white/[0.07] overflow-hidden"
              style={{
                background:
                  "linear-gradient(155deg, rgba(10,10,22,0.7) 0%, rgba(6,6,16,0.82) 58%, rgba(4,4,12,0.9) 100%)",
                backdropFilter: "blur(18px)",
                boxShadow: isSpeaking
                  ? "0 28px 70px -30px rgba(127,29,29,0.55)"
                  : "0 22px 55px -32px rgba(0,0,0,0.9)",
              }}
            >
              <span aria-live="polite" className="sr-only">
                {isSpeaking
                  ? "Sakhi is speaking"
                  : introPhase === "done"
                    ? "Sakhi has finished introducing herself"
                    : ""}
              </span>
              <div
                aria-hidden
                className={`absolute top-0 left-0 w-full h-px transition-opacity duration-500 ${
                  isSpeaking ? "opacity-100" : "opacity-35"
                }`}
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(248,113,113,0.55), rgba(239,68,68,0.3), transparent)",
                }}
              />
              <div className="p-5 sm:p-6 space-y-4">
                {blocked && introPhase !== "speaking" && !introRevealed ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emergency-950/80 border border-emergency-700/40 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-emergency-300" />
                      </div>
                      <div>
                        <div className="text-[15px] font-black text-white">
                          Start Sakhi&apos;s Introduction
                        </div>
                        <div className="text-[11px] text-slate-400 leading-snug">
                          Your browser blocked auto-play — tap to meet Sakhi.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={playManually}
                      className="btn-emergency w-full !py-3.5 !text-sm"
                    >
                      <Play className="w-4 h-4" />
                      Meet Sakhi
                    </button>
                    {!speechSupported && (
                      <p className="text-[10px] text-slate-500 text-center pt-1">
                        This browser has no speech synthesis — the introduction appears as text.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {revealCount === 0 && !voiceReady && !speechSupported && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 italic py-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sakhi is waking up…
                      </div>
                    )}
                    <p className="text-[14px] sm:text-[15.5px] leading-[1.62] font-medium break-words text-white">
                      {HUB_INTRO.slice(0, revealCount)}
                      {isSpeaking && revealCount < HUB_INTRO.length && (
                        <span
                          aria-hidden
                          className="inline-block w-[2px] h-[1em] bg-emergency-400 align-text-bottom ml-0.5 sakhi-caret"
                        />
                      )}
                    </p>
                    <div className="flex items-center justify-between border-t border-white/5 pt-3.5">
                      <div
                        className={`rounded-full border px-3 py-1.5 flex items-center gap-2 transition-all duration-300 ${
                          isSpeaking
                            ? "border-emergency-700/50 bg-emergency-950/40 text-emergency-200"
                            : "border-slate-800 bg-slate-950/40 text-slate-500"
                        }`}
                        role="status"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-[0.22em]">
                          {isSpeaking ? "Speaking" : introPhase === "done" ? "Welcome ready" : introRevealed ? "Welcome ready" : "Getting ready…"}
                        </span>
                      </div>
                      {!introRevealed && !isSpeaking && introPhase !== "done" && (
                        <button
                          type="button"
                          onClick={playManually}
                          className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-emergency-300 transition px-2 py-1.5 rounded-lg"
                        >
                          <Play className="w-3 h-3 inline mr-1 -mt-0.5" />
                          Play welcome
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Two mode cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                href="/companion"
                className="group relative rounded-2xl border border-white/[0.07] overflow-hidden p-5 sm:p-6 space-y-3 transition-all duration-300 hover:scale-[1.01] hover:border-emergency-600/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(24,24,40,0.85) 0%, rgba(10,10,22,0.9) 60%, rgba(6,6,16,0.95) 100%)",
                  boxShadow: "0 20px 50px -28px rgba(0,0,0,0.9)",
                }}
              >
                <div className="w-11 h-11 rounded-2xl bg-emergency-950/70 border border-emergency-700/40 flex items-center justify-center group-hover:border-emergency-500/70 transition">
                  <MessageSquare className="w-5 h-5 text-emergency-300" />
                </div>
                <div>
                  <div className="text-[15px] font-black text-white flex items-center gap-2">
                    Chat Mode
                    <ArrowRight className="w-4 h-4 text-emergency-400 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className="text-[11.5px] text-slate-400 leading-relaxed mt-1">
                    Private text chat with Sakhi. Ask about cyber safety and scams, and
                    attach screenshots, documents, evidence and reports.
                  </p>
                </div>
              </Link>

              <Link
                href="/companion/voice"
                className="group relative rounded-2xl border border-white/[0.07] overflow-hidden p-5 sm:p-6 space-y-3 transition-all duration-300 hover:scale-[1.01] hover:border-emergency-600/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(24,24,40,0.85) 0%, rgba(10,10,22,0.9) 60%, rgba(6,6,16,0.95) 100%)",
                  boxShadow: "0 20px 50px -28px rgba(0,0,0,0.9)",
                }}
              >
                <div className="w-11 h-11 rounded-2xl bg-emergency-950/70 border border-emergency-700/40 flex items-center justify-center group-hover:border-emergency-500/70 transition">
                  <Mic className="w-5 h-5 text-emergency-300" />
                </div>
                <div>
                  <div className="text-[15px] font-black text-white flex items-center gap-2">
                    Voice Mode
                    <ArrowRight className="w-4 h-4 text-emergency-400 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className="text-[11.5px] text-slate-400 leading-relaxed mt-1">
                    Talk to Sakhi out loud. She listens with your microphone, understands,
                    and answers in her own voice — your privacy stays intact.
                  </p>
                </div>
              </Link>
            </div>

            <p className="text-[10.5px] text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emergency-400" />
              Same Sakhi brain in both modes — she automatically answers in whatever language
              you use: English, Hindi or Hinglish.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
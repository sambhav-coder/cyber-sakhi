"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Volume2, VolumeX, Upload, Lock, MessageCircle } from "lucide-react";
import { SakhiOrb } from "@/components/companion/SakhiOrb";
import type { SakhiOrbState } from "@/components/companion/SakhiOrb";
import {
  getBrowserSpeechCapabilities,
  startSttSession,
  speakNow,
} from "@/lib/voice/speech";
import type { SttSession, SpeakHandle } from "@/lib/voice/speech";
import type { SakhiLanguage } from "@/lib/sakhiAI";

export interface VoiceSegment {
  id: string;
  speaker: "user" | "sakhi";
  text: string;
}

interface VoiceModePortalProps {
  open: boolean;
  language: SakhiLanguage;
  onClose: () => void;
  /** Sends a spoken utterance to Sakhi; resolves with the reply text (null on failure). */
  onSendUtterance: (text: string) => Promise<string | null>;
  onUpload: (file: File) => void;
  onOpenLocker: () => void;
}

type Phase = "consent" | "active";

export function VoiceModePortal({
  open,
  language,
  onClose,
  onSendUtterance,
  onUpload,
  onOpenLocker,
}: VoiceModePortalProps) {
  const [phase, setPhase] = useState<Phase>("consent");
  const [orbState, setOrbState] = useState<SakhiOrbState>("idle");
  const [segments, setSegments] = useState<VoiceSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [capacities, setCapacities] = useState({ stt: false, tts: false });
  const sttRef = useRef<SttSession | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const segmentsEndRef = useRef<HTMLDivElement>(null);

  const stopListening = () => {
    sttRef.current?.stop();
    sttRef.current = null;
  };

  const fullstop = () => {
    stopListening();
    speakRef.current?.cancel();
    speakRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    setCapacities(getBrowserSpeechCapabilities());
    setPhase("consent");
    setSegments([]);
    setInterim("");
    setError(null);
    setOrbState("idle");
    setStatusText("Voice Mode is ready — nothing is started until you approve.");
    return () => {
      fullstop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interim]);

  if (!open) return null;

  const speakReply = (text: string) => {
    if (muted) return;
    speakRef.current?.cancel();
    setOrbState("speaking");
    setStatusText("Sakhi is speaking…");
    const handle = speakNow(text, {
      language,
      onStart: () => {
        setStatusText("Sakhi is speaking…");
      },
      onEnd: () => {
        setOrbState("listening");
        setStatusText("Listening…");
        startListening();
      },
      onError: (msg) => {
        setError(msg);
        setOrbState("listening");
        startListening();
      },
    });
    speakRef.current = handle;
  };

  const startListening = () => {
    if (!capacities.stt) {
      setOrbState("idle");
      setStatusText("This browser has no speech recognition — type below instead.");
      setError("Speech recognition is not supported here. Use the text box, or open Voice Mode in Chrome/Edge.");
      return;
    }
    stopListening();
    setError(null);
    setOrbState("listening");
    setStatusText("Listening… speak freely.");
    sttRef.current = startSttSession(language, {
      onResult: (interimText) => setInterim(interimText),
      onFinal: (finalText) => {
        setInterim("");
        void handleUtterance(finalText);
      },
      onEnd: () => {
        sttRef.current = null;
        if (orbStateRef.current !== "thinking") {
          setOrbState("idle");
          setStatusText("Mic stopped. Tap the mic to keep talking.");
        }
      },
      onError: (code, message) => {
        sttRef.current = null;
        if (code !== "no-speech" && code !== "aborted") {
          setError(message);
          setOrbState("idle");
          setStatusText("Voice input stopped.");
        }
      },
    });
  };

  const orbStateRef = useRef<SakhiOrbState>(orbState);
  orbStateRef.current = orbState;

  const handleUtterance = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setOrbState("listening");
      return;
    }
    pushSegment("user", trimmed);
    setOrbState("thinking");
    setStatusText("Sakhi is thinking…");
    void onSendUtterance(trimmed).then((reply) => {
      if (reply) {
        pushSegment("sakhi", reply);
        speakReply(reply);
      } else {
        setError("I couldn't reach the Sakhi service for that message. Please try again.");
        setOrbState("idle");
        setStatusText("Message delivery failed.");
      }
    });
  };

  const pushSegment = (speaker: VoiceSegment["speaker"], text: string) => {
    setSegments((prev) => [
      ...prev,
      { id: "vseg_" + Date.now() + "_" + prev.length, speaker, text },
    ]);
  };

  const begin = () => {
    setPhase("active");
    startListening();
  };

  const sendTyped = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    setInterim("");
    void handleUtterance(t);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Sakhi Voice Mode"
    >
      <div
        className="absolute inset-0 bg-[#07070f]/95 backdrop-blur-md"
        onClick={() => {
          fullstop();
          onClose();
        }}
      />
      <div className="relative w-full max-w-lg rounded-3xl glass-panel border-slate-800/90 p-5 sm:p-6 max-h-[92vh] overflow-hidden flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-emergency-300">
              Voice Mode
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emergency-950/70 text-emergency-300 border border-emergency-700/50 font-bold uppercase">
              {language === "hi" ? "हिंदी" : language === "hinglish" ? "Hinglish" : "English"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              fullstop();
              onClose();
            }}
            aria-label="Close voice mode"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === "consent" ? (
          <div className="flex flex-col items-center text-center gap-5 py-8">
            <SakhiOrb state="idle" size={150} />
            <div className="space-y-2 max-w-sm">
              <h3 className="text-lg font-bold text-white">Enable mic for this session?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Voice Mode uses your browser&apos;s on-device speech recognition and
                voice. This requires your explicit, per-session consent. No audio is
                recorded or uploaded unless a server speech provider is configured.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={begin}
                disabled={!capacities.stt}
                className="px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 disabled:opacity-40 text-white text-sm font-bold transition flex items-center gap-2"
              >
                <Mic className="w-4 h-4" />
                Begin Voice Session
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-sm font-semibold transition"
              >
                Cancel
              </button>
            </div>
            {!capacities.stt && (
              <p className="text-[11px] text-amber-300/90">
                Browser speech recognition isn&apos;t available here (try Chrome/Edge).
                You can still type in the box below.
              </p>
            )}
            <div className="flex gap-2 w-full max-w-sm">
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendTyped()}
                placeholder="Type instead of speaking…"
                className="flex-1 rounded-xl bg-slate-900/90 border border-slate-700 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
              />
              <button
                type="button"
                onClick={sendTyped}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            {/* Orb + live status */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <SakhiOrb state={orbState} size={150} label={statusText} />
              <p className="text-[11px] text-slate-300 h-4" aria-live="polite">
                {statusText}
              </p>
              {interim && (
                <p className="text-xs text-emergency-200 italic text-center max-w-sm">
                  {interim}
                </p>
              )}
            </div>

            {/* Transcript */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-950/70 border border-slate-800 p-3 space-y-2">
              {segments.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-6">
                  Your live transcript will appear here. It is also added to the chat
                  history below.
                </p>
              )}
              {segments.map((seg) => (
                <div key={seg.id} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {seg.speaker === "user" ? "You" : "Sakhi"}
                  </span>
                  <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                    {seg.text}
                  </p>
                </div>
              ))}
              <div ref={segmentsEndRef} />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (sttRef.current) {
                    stopListening();
                    setOrbState("idle");
                    setStatusText("Mic stopped.");
                  } else {
                    startListening();
                  }
                }}
                aria-label={sttRef.current ? "Stop listening" : "Start listening"}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition border ${
                  sttRef.current
                    ? "bg-emergency-600 hover:bg-emergency-500 border-emergency-400/60 text-white shadow-lg shadow-emergency-950/50"
                    : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300"
                }`}
              >
                {sttRef.current ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute Sakhi's voice" : "Mute Sakhi's voice"}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition border ${
                  muted ? "bg-slate-900 border-slate-600 text-slate-400" : "bg-emerald-950/50 border-emerald-700/50 text-emerald-300"
                }`}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  stopListening();
                  fullstop();
                  onClose();
                }}
                className="pl-3 pr-4 h-11 rounded-full inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                <Square className="w-4 h-4" />
                End Session
              </button>
            </div>

            {/* Secondary actions + status */}
            <div className="flex items-center justify-center gap-2">
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] font-semibold transition">
                <Upload className="w-3.5 h-3.5 text-emergency-400" />
                Attach document
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onOpenLocker}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] font-semibold transition"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                Evidence Locker
              </button>
            </div>

            {error && (
              <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
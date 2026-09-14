"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  Lock,
  RotateCcw,
  Keyboard,
  MessageCircle,
  Mic,
  X,
  Bot,
  User,
} from "lucide-react";
import { SakhiOrb } from "@/components/companion/SakhiOrb";
import type { SakhiOrbState } from "@/components/companion/SakhiOrb";
import { LockerPicker } from "@/components/companion/LockerPicker";
import type { LockerItem } from "@/components/companion/LockerPicker";
import type {
  LiveSakhiAvatarHandle,
  SakhiExpression,
} from "@/components/companion/LiveSakhiAvatar";
import {
  getBrowserSpeechCapabilities,
  startSttSession,
  speakWithEngine,
  resolveFemaleVoice,
} from "@/lib/voice/speech";
import type { SttSession, SpeakHandle } from "@/lib/voice/speech";
import { detectLanguage } from "@/lib/sakhiAI";
import type { SakhiLanguage } from "@/lib/sakhiAI";
import { startLocalSttRecording } from "@/lib/voice/localStt";
import type { LocalSttSession } from "@/lib/voice/localStt";
import { SAKHI_VOICE_INTRO } from "@/lib/voice/content";

const LiveSakhiAvatar = dynamic(
  () =>
    import("@/components/companion/LiveSakhiAvatar").then(
      (m) => m.LiveSakhiAvatar
    ),
  { ssr: false }
);

export interface VoiceSegment {
  id: string;
  speaker: "user" | "sakhi";
  text: string;
}

type Phase = "welcome" | "active";
type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

const AUTOPLAY_BLOCK_DETECT_MS = 2600;

/**
  * Voice Mode welcome = the SAME approved English introduction.
  * (single source of truth: SAKHI_VOICE_INTRO). It is spoken BEFORE the user
  * has ever spoken, so per product policy it is ALWAYS English — identical
  * wording, voice and quality in both surfaces. The moment the user speaks,
  * language is re-detected per CURRENT TURN (no session lock).
  */
const WELCOME_TEXT = SAKHI_VOICE_INTRO;

interface VoiceAttachment {
  kind: "document" | "evidence" | "report" | "image";
  name?: string;
  content?: string;
  note?: string;
  evidenceCode?: string;
  caseId?: string;
  title?: string;
  mimeType?: string;
  dataBase64?: string;
  previewUrl?: string;
}

interface VoiceModePortalProps {
  /** Last language known to the platform (from an earlier chat). Defaults to a bilingual welcome. */
  initialLanguage?: SakhiLanguage;
  /** Active case number (display only, so replies feel context-aware). */
  caseNumber?: string | null;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function VoiceModePortal({
  initialLanguage = "en",
  caseNumber = null,
}: VoiceModePortalProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [orbState, setOrbState] = useState<SakhiOrbState>("idle");
  const [segments, setSegments] = useState<VoiceSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [statusText, setStatusText] = useState(
    "Ready — start a new voice conversation to speak with Sakhi."
  );
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [typingBox, setTypingBox] = useState(false);
  const [capacities, setCapacities] = useState({ stt: false, tts: false });
  const [micCapable, setMicCapable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [welcomeReveal, setWelcomeReveal] = useState(0);
  const [welcomeSpoken, setWelcomeSpoken] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [attachments, setAttachments] = useState<VoiceAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [lockerLoading, setLockerLoading] = useState(false);
  const [lockerItems, setLockerItems] = useState<LockerItem[]>([]);
  const [language, setLanguage] = useState<SakhiLanguage>(initialLanguage);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);

  const sttRef = useRef<SttSession | null>(null);
  const localSttRef = useRef<LocalSttSession | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const avatarRef = useRef<LiveSakhiAvatarHandle | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Per-turn language: the CURRENT user turn decides Sakhi's reply AND the TTS
  // voice/script. A previous Hindi turn must never lock the next English turn.
  const languageRef = useRef<SakhiLanguage>(initialLanguage);
  languageRef.current = language; // keep ref in sync with React state
  const lastFinalRef = useRef("");
  const lastInterimRef = useRef("");
  const failedUtteranceRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const welcomeTimersRef = useRef<number[]>([]);
  const welcomeStartedRef = useRef(false);

  const voiceStateRef = useRef<VoiceState>(voiceState);
  voiceStateRef.current = voiceState;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const setExpression = (exp: SakhiExpression) => {
    avatarRef.current?.setExpression(exp);
  };

  const stopListening = () => {
    localSttRef.current?.abort();
    localSttRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
  };

  const fullstop = () => {
    stopListening();
    speakRef.current?.cancel();
    speakRef.current = null;
  };

  useEffect(() => {
    const caps = getBrowserSpeechCapabilities();
    setCapacities(caps);
    setMicCapable(Boolean(navigator.mediaDevices?.getUserMedia));
    resolveFemaleVoice("en").then((v) => {
      if (v) voiceRef.current = v;
    });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      fullstop();
      welcomeTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interim]);

  // ── Auto-attempt the spoken welcome once voices are resolved ──
  useEffect(() => {
    const startId = window.setTimeout(
      () => attemptWelcome(),
      AUTOPLAY_BLOCK_DETECT_MS + 400
    );
    welcomeTimersRef.current.push(startId);
    return () => {
      welcomeTimersRef.current.forEach((t) => window.clearTimeout(t));
      welcomeTimersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacities]);

  const cancelWelcome = () => {
    welcomeTimersRef.current.forEach((t) => window.clearTimeout(t));
    welcomeTimersRef.current = [];
    speakRef.current?.cancel();
    speakRef.current = null;
  };

  /** Speak the bilingual welcome with a text reveal; if autoplay is blocked we
   *  surface a friendly "Play Sakhi's welcome" instead of forcing audio. */
  const attemptWelcome = () => {
    if (welcomeStartedRef.current || phase !== "welcome") return;
    if (!capacities.tts) {
      // No TTS — reveal on its own, honestly paced.
      welcomeStartedRef.current = true;
      revealWelcome();
      return;
    }
    welcomeStartedRef.current = true;
    setVoiceState("speaking");
    setOrbState("speaking");
    setStatusText("Sakhi is introducing herself…");
    const handle = speakWithEngine(WELCOME_TEXT, voiceRef.current, {
      language: "en",
      rate: 0.97,
      pitch: 1.03,
      onStart: () => {
        welcomeStartedRef.current = true;
        setExpression("warm");
        avatarRef.current?.speakStart(WELCOME_TEXT);
        const iv = window.setInterval(() => {
          setWelcomeReveal((p) => Math.min(p + 3, WELCOME_TEXT.length));
        }, 32);
        welcomeTimersRef.current.push(iv);
      },
      onEnd: () => {
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setVoiceState("idle");
        setOrbState("idle");
        setWelcomeSpoken(true);
        setWelcomeReveal(WELCOME_TEXT.length);
        cancelWelcome();
        setStatusText("Tap the orb to talk, or start a new voice conversation.");
      },
      onError: () => {
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setVoiceState("idle");
        setOrbState("idle");
        setWelcomeSpoken(true);
        setWelcomeReveal(WELCOME_TEXT.length);
        cancelWelcome();
      },
    });
    speakRef.current = handle;
    // Detect autoplay block: no onStart after a moment → offer manual play.
    const blockId = window.setTimeout(() => {
      if (!welcomeStartedRef.current) {
        setBlocked(true);
        setVoiceState("idle");
        setOrbState("idle");
        setStatusText("Autoplay was blocked — play Sakhi's welcome to hear her introduce Voice Mode.");
        cancelWelcome();
        setWelcomeReveal(WELCOME_TEXT.length);
      }
    }, AUTOPLAY_BLOCK_DETECT_MS);
    welcomeTimersRef.current.push(blockId);
  };

  const revealWelcome = () => {
    let steps = 0;
    const iv = window.setInterval(() => {
      steps += 3;
      setWelcomeReveal(steps);
      if (steps >= WELCOME_TEXT.length) {
        window.clearInterval(iv);
        setWelcomeSpoken(true);
        cancelWelcome();
      }
    }, 30);
    welcomeTimersRef.current.push(iv);
  };

  const playWelcomeManually = () => {
    setBlocked(false);
    setWelcomeReveal(0);
    attemptWelcome();
  };

  // ── Conversation plumbing (same Sakhi brain + API as Chat Mode) ──
  const createConversation = async (title: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not create conversation.");
      return data.conversation?.id ?? null;
    } catch {
      return null;
    }
  };

  const sendUtterance = async (text: string): Promise<string> => {
    let conversationId = conversationIdRef.current;
    if (!conversationId) {
      conversationId = await createConversation("Voice conversation");
      conversationIdRef.current = conversationId;
    }
    const sentAttachments = attachments.length > 0 ? attachments : undefined;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        language,
        conversationId,
        attachments: sentAttachments,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Sakhi companion service error.");
    if (data.detectedLanguage) {
      // Server-authoritative language from THIS turn — TTS follows it.
      setLanguage(data.detectedLanguage);
      languageRef.current = data.detectedLanguage;
      sttRef.current?.setLang?.(data.detectedLanguage);
    }
    if (data.provider?.label) setProviderLabel(data.provider.label);
    // Images were consumed by this utterance — release their object URLs and
    // clear the chips now that analysis is complete.
    if (sentAttachments?.some((a) => a.kind === "image")) {
      sentAttachments.forEach((a) => {
        if (a.kind === "image" && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setAttachments([]);
    }
    return data?.text ?? "";
  };

  // ── Speech: Sakhi talks; the avatar mouth follows the real audio ──
  const speakReply = (text: string) => {
    if (mutedRef.current) {
      setVoiceState("idle");
      setOrbState("idle");
      setStatusText("Sakhi is muted — reply shown as text.");
      return;
    }
    speakRef.current?.cancel();
    setVoiceState("speaking");
    setOrbState("speaking");
    setStatusText("Sakhi is speaking…");
    // Per-turn language: THIS turn decides the voice — English -> aru,
    // Hindi/Hinglish -> priyamvada. Never a session lock.
    console.log("🧪 [Voice Mode] TTS REQUEST:", { 
      TTS_ENGINE: "edge-tts (via /api/voice/tts)",
      LANGUAGE: languageRef.current,
      TEXT_LENGTH: text.length,
      TEST_MODE: process.env.SAKHI_TEST_MODE === 'edge-tts-only' ? "edge-tts-only" : "normal"
    });
    const handle = speakWithEngine(text, voiceRef.current, {
      language: languageRef.current,
      rate: 0.98,
      pitch: 1.04,
      onStart: () => {
        console.log("🧪 [Voice Mode] TTS AUDIO STARTED");
        setExpression("warm");
        avatarRef.current?.speakStart(text);
      },
      onEnd: () => {
        console.log("🧪 [Voice Mode] TTS AUDIO COMPLETED");
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setVoiceState("idle");
        setOrbState("idle");
        setStatusText("Tap the orb to talk.");
      },
      onError: (msg) => {
        console.error("🧪 [Voice Mode] TTS AUDIO ERROR:", msg);
        avatarRef.current?.speakEnd();
        setExpression("neutral");
        setError(msg);
        setVoiceState("idle");
        setOrbState("idle");
        setStatusText("Voice playback stopped — tap the orb to continue.");
      },
    });
    speakRef.current = handle;
  };

  // ── STT pipeline: user → brain → reply → voice ──
  const pushSegment = (speaker: VoiceSegment["speaker"], text: string) => {
    setSegments((prev) => [
      ...prev,
      { id: "vseg_" + Date.now() + "_" + prev.length, speaker, text },
    ]);
  };

  const handleUtterance = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setVoiceState("idle");
      setOrbState("idle");
      setStatusText("Tap the orb to talk.");
      return;
    }
    // CRITICAL: Per-turn language detection from ACTUAL transcript
    // THIS message decides the reply + TTS language. A prior Hindi turn
    // cannot force a following English "Hi" into Hindi.
    const turnLang = detectLanguage(trimmed);
    setLanguage(turnLang);
    languageRef.current = turnLang;
    // Update STT language for NEXT turn based on current turn's detected language
    // This improves recognition accuracy for subsequent turns
    sttRef.current?.setLang?.(turnLang);
    setInterim("");
    pushSegment("user", trimmed);
    failedUtteranceRef.current = null;
    setError(null);
    setVoiceState("thinking");
    setOrbState("thinking");
    setStatusText("Sakhi is thinking…");
    void sendUtterance(trimmed)
      .then((reply) => {
        if (reply) {
          pushSegment("sakhi", reply);
          speakReply(reply);
        } else {
          failedUtteranceRef.current = trimmed;
          setError("I couldn't reach the Sakhi service for that message. Please try again.");
          setVoiceState("error");
          setOrbState("error");
          setStatusText("Message delivery failed.");
        }
      })
      .catch(() => {
        failedUtteranceRef.current = trimmed;
        setError("I couldn't reach the Sakhi service for that message. Please try again.");
        setVoiceState("error");
        setOrbState("error");
        setStatusText("Message delivery failed.");
      });
  };

  const toggleMic = () => {
    if (voiceState === "listening") {
      // Tap again = commit: the on-device session sends what it heard
      // (exactly one final utterance); the browser path just ends.
      if (localSttRef.current) {
        localSttRef.current.stop();
        localSttRef.current = null;
      } else {
        stopListening();
      }
      return;
    }
    startListening();
  };

  const startListening = () => {
    if (voiceState === "thinking" || voiceState === "speaking") return;
    stopListening();
    lastFinalRef.current = "";
    lastInterimRef.current = "";
    setInterim("");
    setError(null);
    setVoiceState("listening");
    setOrbState("listening");
    setStatusText("Listening… I'll take it when you pause.");

    // Production/Vercel: use the browser SpeechRecognition path directly.
    // Local development: keep the existing Vosk/Piper path for offline testing.
    if (process.env.NODE_ENV === "production") {
      startBrowserStt();
    } else {
      startLocalMic();
    }
  };

  /** Development-only mic: local Vosk/Piper speech engine.
   *  Production uses the browser SpeechRecognition path above. */
  const startLocalMic = () => {
    // CRITICAL: Use auto mode for STT to let the sidecar detect language from audio
    // The sidecar runs both Hindi and English models and intelligently selects
    // the best result based on Unicode character detection and Hinglish markers
    console.log("🧪 [Voice Mode] STT ENGINE: local-vosk (development-only, offline)");
    localSttRef.current = startLocalSttRecording("auto", {
      onLevel: () => {},
      onInterim: (text) => {
        lastInterimRef.current = text;
        setInterim(text);
      },
      onFinal: (finalText) => {
        console.log("🧪 [Voice Mode] STT RESULT:", { 
          STT_ENGINE: "local-vosk", 
          transcript: finalText,
          length: finalText.length 
        });
        localSttRef.current = null;
        if (voiceStateRef.current === "listening") handleUtterance(finalText);
      },
      onError: (code, message) => {
        console.log("🧪 [Voice Mode] STT ERROR:", { 
          STT_ENGINE: "local-vosk", 
          code, 
          message 
        });
        localSttRef.current = null;
        if (code === "no_speech") {
          setVoiceState("idle");
          setOrbState("idle");
          setStatusText("Mic stopped. Tap the orb to talk.");
        } else if (code === "mic_denied" || code === "mic_not_available") {
          setError(message);
          setVoiceState("error");
          setOrbState("error");
          setStatusText("Microphone access was denied — allow the mic and tap the orb again.");
        } else if (capacities.stt) {
          // On-device engine unavailable → browser web-speech fallback.
          console.log("🧪 [Voice Mode] FALLING BACK TO: browser-speech-recognition");
          setStatusText("Switching recognition…");
          startBrowserStt();
        } else {
          setError(message);
          setVoiceState("error");
          setOrbState("error");
          setStatusText("Voice input stopped — you can type instead.");
          setTypingBox(true);
        }
      },
      onEnd: () => {},
    });
  };

  /** Production mic: the browser's native Web Speech API. */
  const startBrowserStt = () => {
    if (!capacities.stt) {
      setVoiceState("error");
      setOrbState("error");
      setStatusText("Speech recognition isn't available here — please type instead.");
      setError("Speech recognition is not supported in this browser. Use the text box, or open Voice Mode in Chrome or Edge.");
      setTypingBox(true);
      return;
    }
    // Use the browser's native SpeechRecognition API in production.
    // The transcript is then language-detected per turn, and that detected
    // language controls Sakhi's response/TTS for the current turn.
    console.log("🧪 [Voice Mode] STT ENGINE: browser-speech-recognition");
    sttRef.current = startSttSession("auto", {
      onResult: (interimText) => {
        lastInterimRef.current = interimText;
        setInterim(interimText);
      },
      onFinal: (finalText) => {
        lastFinalRef.current = (lastFinalRef.current + " " + finalText).trim();
      },
      onEnd: () => {
        sttRef.current = null;
        const heard = lastFinalRef.current || lastInterimRef.current;
        console.log("🧪 [Voice Mode] STT RESULT:", { 
          STT_ENGINE: "browser-speech-recognition", 
          transcript: heard,
          length: heard?.length || 0
        });
        if (voiceStateRef.current === "listening" && heard) {
          handleUtterance(heard);
        } else {
          setVoiceState("idle");
          setOrbState("idle");
          setStatusText("Mic stopped. Tap the orb to talk.");
        }
      },
      onError: (code, message) => {
        console.log("🧪 [Voice Mode] STT ERROR:", { 
          STT_ENGINE: "browser-speech-recognition", 
          code, 
          message 
        });
        sttRef.current = null;
        if (code === "not-allowed") {
          setError(message);
          setVoiceState("error");
          setOrbState("error");
          setStatusText("Microphone access was denied — allow the mic and tap the orb again.");
        } else if (code === "no-speech") {
          setVoiceState("idle");
          setOrbState("idle");
          setStatusText("Mic stopped. Tap the orb to talk.");
        } else if (code === "aborted") {
          setVoiceState("idle");
          setOrbState("idle");
        } else {
          setError(message);
          setVoiceState("error");
          setOrbState("error");
          setStatusText("Voice input stopped — you can type instead.");
          setTypingBox(true);
        }
      },
    });
  };

  const retryFailed = () => {
    const t = failedUtteranceRef.current;
    failedUtteranceRef.current = null;
    if (t) handleUtterance(t);
    else {
      setError(null);
      setVoiceState("idle");
      setOrbState("idle");
      setStatusText("Tap the orb to talk.");
    }
  };

  const muteToggle = () => {
    stopListening();
    if (!muted) {
      speakRef.current?.cancel();
      avatarRef.current?.speakEnd();
      setExpression("neutral");
      setMuted(true);
      setVoiceState("idle");
      setOrbState("idle");
      setStatusText("Sakhi is muted — replies appear as text.");
    } else {
      setMuted(false);
      setStatusText("Unmuted. Tap the orb to talk.");
    }
  };

  /** The big Start gesture — creates the conversation, then Sakhi welcomes you
   *  OUT LOUD (user gesture unblocks autoplay) and the orb is ready. */
  const begin = () => {
    cancelWelcome();
    setError(null);
    void createConversation("Voice conversation").then((id) => {
      conversationIdRef.current = id;
    });
    pushSegment("sakhi", WELCOME_TEXT);
    setTimeout(() => {
      setPhase("active");
      setWelcomeSpoken(true);
      if (!mutedRef.current) {
        speakReply(WELCOME_TEXT);
      } else {
        setVoiceState("idle");
        setOrbState("idle");
        setStatusText("Tap the orb to talk.");
      }
    }, 120);
  };

  const sendTyped = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    setInterim("");
    setError(null);
    stopListening();
    sttRef.current = null;
    handleUtterance(t);
  };

  const endSession = () => {
    fullstop();
    router.push("/companion");
  };

  // ---- attachments ------------------------------------------------
  const handleUploadFile = async (file: File) => {
    const readFileAsBase64 = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          const comma = result.indexOf(",");
          resolve(comma === -1 ? result : result.slice(comma + 1));
        };
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(f);
      });

    // Images go to Gemini as real pixels (multimodal vision) — never merely
    // by filename, never a fake "OCR unavailable". Bytes live only in memory
    // and travel client -> API -> Gemini; they are never stored.
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name || "");
    if (isImage) {
      const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
      if (file.size > MAX_IMAGE_BYTES) {
        setError("That image is too large (max 8 MB). Please compress it and try again.");
        return;
      }
      setUploading(true);
      try {
        const dataBase64 = await readFileAsBase64(file);
        const previewUrl = URL.createObjectURL(file);
        setAttachments((prev) => [
          ...prev,
          { kind: "image", name: file.name || "image", mimeType: file.type || "image/png", dataBase64, previewUrl },
        ]);
      } catch {
        setError("Could not read that image. Try attaching it again.");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("That file is too large (max 5 MB for text analysis).");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      const extract = data.file;
      if (extract.content && extract.content.trim()) {
        await sendUtterance("Please review this document for safety signals.");
        setAttachments((prev) => [
          ...prev,
          { kind: "document", name: extract.name, content: extract.content, note: extract.note ?? undefined },
        ]);
      } else {
        setAttachments((prev) => [
          ...prev,
          { kind: "document", name: extract.name, note: extract.note || "No text was extracted." },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const openLockerPicker = async () => {
    setLockerOpen(true);
    setLockerLoading(true);
    try {
      const res = await fetch("/api/evidence", { cache: "no-store" });
      const data = await res.json();
      const items = Array.isArray(data) ? data : data?.evidence || [];
      setLockerItems(items.map((it: any) => ({
        id: it.id,
        evidenceCode: it.evidence_code || it.evidenceCode || "EV-UNKNOWN",
        title: it.title ?? null,
        mimeType: it.mime_type || it.mimeType || null,
        category: it.category || null,
        createdAt: it.created_at || "",
        size: it.file_size ?? null,
        isLocked: it.lock_metadata?.locked === true || it.metadata?.locked === true || Boolean(it.lock_method),
      })));
    } catch {
      setLockerItems([]);
      setError("Couldn't load your Evidence Locker.");
    } finally {
      setLockerLoading(false);
    }
  };

  const attachLockerItem = (item: LockerItem) => {
    setAttachments((prev) => [
      ...prev,
      { kind: "evidence", evidenceCode: item.evidenceCode, title: item.title || undefined },
    ]);
    setLockerOpen(false);
  };

  const micActive =
    voiceState === "listening" &&
    (Boolean(sttRef.current) || Boolean(localSttRef.current));

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="relative h-[calc(100vh-7rem)] min-h-[540px] flex flex-col overflow-hidden rounded-3xl border border-emergency-900/25 bg-[#08080f]/80">
      {/* Ambient atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div
          className="absolute left-1/2 top-[-140px] -translate-x-1/2 w-[820px] h-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(185,28,28,0.28) 0%, transparent 68%)", filter: "blur(36px)" }}
        />
        <div
          className="absolute bottom-[-160px] right-[-80px] w-[460px] h-[380px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(127,29,29,0.3) 0%, transparent 70%)", filter: "blur(42px)" }}
        />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emergency-700 to-emergency-950 p-[2px]">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[10px] flex items-center justify-center">
              <Bot className="w-[18px] h-[18px] text-emergency-400" />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-black tracking-tight text-white uppercase">
              Sakhi <span className="text-crimson-gradient">AI</span>
            </div>
            <div className="text-[9px] tracking-[0.22em] text-slate-500 uppercase font-bold">
              Voice Mode
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 font-bold">
            {voiceState === "listening" ? "Mic Live" : voiceState === "speaking" ? "Sakhi Speaking" : voiceState === "thinking" ? "Thinking…" : voiceState === "error" ? "Needs Attention" : "Online"}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700/60 text-emerald-300 font-bold">
            <Sparkles className="w-3 h-3" />
            Understands your language
          </span>
          {caseNumber && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-emergency-300 font-mono font-bold">
              {caseNumber}
            </span>
          )}
          <button
            type="button"
            onClick={() => router.push("/companion")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat Mode
          </button>
        </div>
      </div>

      {/* Error banner */}
      {(error || voiceState === "error") && (
        <div className="mx-4 sm:mx-6 shrink-0 flex items-center justify-between gap-2 rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-2">
          <p className="text-[11px] text-amber-300">
            {error || "Something went wrong with that message."}
          </p>
          <div className="flex items-center gap-2">
            {failedUtteranceRef.current && (
              <button
                type="button"
                onClick={retryFailed}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-800/40 hover:bg-amber-800/60 text-amber-200 text-[11px] font-bold transition"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="p-1 text-amber-300/70 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── WELCOME PHASE ─────────────────────────────────────────── */}
      {phase === "welcome" ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="min-h-full w-full max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center px-4 sm:px-8 py-6 sm:py-8">
            {/* Prominent, unclipped avatar over a dreamy glow */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-56 h-56 sm:w-72 sm:h-72 lg:w-80 lg:h-80 shrink-0">
                <div
                  aria-hidden
                  className="absolute inset-[-24px] rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(239,68,68,0.30) 0%, transparent 62%)", filter: "blur(6px)" }}
                />
                <div className="absolute inset-0 rounded-[26px] overflow-hidden border border-emergency-900/50 bg-emergency-950/15 shadow-[0_30px_80px_-30px_rgba(127,29,29,0.7)]">
                  <LiveSakhiAvatar
                    ref={avatarRef}
                    isSpeaking={voiceState === "speaking"}
                    reducedMotion={reducedMotion}
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* The welcome transcript — shown live as she speaks */}
              <div className="w-full max-w-md text-left">
                {blocked && !welcomeSpoken ? (
                  <div className="rounded-2xl border border-emergency-800/40 bg-emergency-950/40 p-4 space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your browser blocked auto-play. Tap below to hear Sakhi's
                      welcome to Voice Mode.
                    </p>
                    <button
                      type="button"
                      onClick={playWelcomeManually}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Play Sakhi's Welcome
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-white/[0.07] bg-slate-950/70 p-4 backdrop-blur-sm">
                    <span aria-live="polite" className="sr-only">
                      {voiceState === "speaking" ? "Sakhi is speaking her welcome" : welcomeSpoken ? "Sakhi's welcome has finished" : ""}
                    </span>
                    <p className="text-[13px] leading-[1.7] text-slate-100 font-medium min-h-[56px]">
                      {WELCOME_TEXT.slice(0, welcomeReveal)}
                      {voiceState === "speaking" && welcomeReveal < WELCOME_TEXT.length && (
                        <span aria-hidden className="inline-block w-[2px] h-[1em] align-text-bottom ml-0.5 bg-emergency-400 sakhi-caret" />
                      )}
                    </p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emergency-300">
                        {voiceState === "speaking" ? "Speaking…" : welcomeSpoken ? "Welcome ready" : "Revealing…"}
                      </span>
                      {!welcomeSpoken && (
                        <button
                          type="button"
                          onClick={playWelcomeManually}
                          className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-emergency-300 transition"
                        >
                          <Volume2 className="w-3 h-3 inline mr-1 -mt-0.5" />
                          Hear again
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: intent + the single Start CTA */}
            <div className="flex flex-col gap-5">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emergency-800/50 bg-emergency-950/30 backdrop-blur-sm">
                  <Sparkles className="w-3.5 h-3.5 text-emergency-300" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emergency-200">
                    SAKHI AI · Voice Mode
                  </span>
                </div>
                <h1 className="text-[32px] sm:text-[40px] font-black tracking-[-0.02em] leading-[1.02] text-white">
                  Your voice,<br />
                  <span className="text-crimson-gradient">your language.</span>
                </h1>
                <p className="text-[13px] sm:text-sm text-slate-400 leading-relaxed max-w-lg">
                  Talk to Sakhi naturally — English, Hindi or Hinglish. She listens
                  with her private on-device speech engine (your words never leave
                  this machine), understands with the same Sakhi brain, and
                  answers aloud in her own voice. No recordings are kept; your mic
                  is used only while you talk.
                </p>
              </div>

              <button
                type="button"
                onClick={begin}
                className="group relative inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl text-white text-[14px] font-black uppercase tracking-wide transition-all duration-300 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400 overflow-hidden w-fit"
                style={{
                  background: "linear-gradient(140deg, rgba(220,38,38,0.95) 0%, rgba(185,28,28,0.97) 60%, rgba(127,29,29,1) 100%)",
                  boxShadow: "0 20px 46px -16px rgba(127,29,29,0.75), inset 0 1px 0 rgba(254,202,202,0.25)",
                }}
              >
                <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-500" style={{ background: "radial-gradient(circle, rgba(254,202,202,0.45) 0%, transparent 65%)" }} />
                <Mic className="w-5 h-5" />
                Start Your New Voice Conversation
              </button>

              {!micCapable && (
                <p className="text-[11px] text-amber-300/90 max-w-md">
                  Recording isn&apos;t available in this browser — use the text
                  box instead, or open Voice Mode in Chrome or Edge for full voice.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-500" />
                  <span className="font-semibold">Your mic is never recorded</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-emerald-500" />
                  <span className="font-semibold">Sakhi answers out loud</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emergency-400" />
                  <span className="font-semibold">Understands your language</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── ACTIVE PHASE ─────────────────────────────────────────── */
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 lg:gap-6 px-4 sm:px-6 pt-3 pb-2 overflow-hidden">
            {/* Avatar column */}
            <div className="hidden lg:flex flex-col items-center justify-center gap-3 min-w-0">
              <div className="relative w-52 h-52 shrink-0">
                <div
                  aria-hidden
                  className="absolute inset-[-18px] rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(239,68,68,0.24) 0%, transparent 62%)" }}
                />
                <div className="absolute inset-0 rounded-3xl overflow-hidden border border-emergency-900/50 bg-emergency-950/20 shadow-[0_26px_70px_-30px_rgba(127,29,29,0.7)]">
                  <LiveSakhiAvatar
                    ref={avatarRef}
                    isSpeaking={voiceState === "speaking"}
                    reducedMotion={reducedMotion}
                    className="w-full h-full"
                  />
                </div>
                <p
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-300"
                  aria-live="polite"
                >
                  {statusText}
                </p>
              </div>
            </div>

            {/* Transcript */}
            <div className="flex flex-col min-h-0 min-w-0">
              <div className="flex items-center justify-between pb-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emergency-300">
                  Live Transcript
                </span>
                <span className="text-[10px] text-slate-500">
                  {segments.length} exchange{segments.length === 1 ? "" : "s"}
                  {providerLabel ? ` · ${providerLabel}` : ""}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-950/70 border border-slate-800 p-3 space-y-3">
                {segments.length === 0 && !interim && (
                  <p className="text-[11px] text-slate-500 text-center py-6 leading-relaxed">
                    Everything you say and everything Sakhi says back appears
                    here, live.
                  </p>
                )}
                {/* Mobile avatar chip */}
                <div className="lg:hidden flex items-center justify-center gap-2 pb-1 border-b border-slate-800/60 sticky top-0 -mx-3 px-3 bg-slate-950/95 backdrop-blur-sm">
                  <span className="relative w-14 h-14 rounded-xl overflow-hidden border border-emergency-900/50 shrink-0">
                    <LiveSakhiAvatar
                      ref={avatarRef}
                      isSpeaking={voiceState === "speaking"}
                      reducedMotion={reducedMotion}
                      className="w-full h-full"
                    />
                  </span>
                  <span
                    className="text-[11px] text-slate-300/90 font-semibold"
                    aria-live="polite"
                  >
                    {statusText}
                  </span>
                </div>
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className={`flex items-start gap-2.5 ${seg.speaker === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {seg.speaker === "sakhi" && (
                      <div className="w-7 h-7 rounded-full bg-emergency-950/70 border border-emergency-700/50 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-emergency-300" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        seg.speaker === "user"
                          ? "bg-emergency-900/60 text-white border border-emergency-800/50 rounded-br-none"
                          : "bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-none"
                      }`}
                    >
                      <p className="whitespace-pre-line">{seg.text}</p>
                      <span className={`block text-right text-[9px] mt-1.5 ${seg.speaker === "user" ? "text-emergency-200/50" : "text-slate-500"}`}>
                        {nowLabel()}
                      </span>
                    </div>
                    {seg.speaker === "user" && (
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-emergency-200" />
                      </div>
                    )}
                  </div>
                ))}
                {interim && voiceState === "listening" && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-none px-3.5 py-2.5 bg-slate-900/70 border border-dashed border-emergency-700/50 text-xs text-emergency-200/90 italic">
                      {interim}
                    </div>
                  </div>
                )}
                {voiceState === "thinking" && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-emergency-950/70 border border-emergency-700/50 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-emergency-300" />
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-75" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-150" />
                    </div>
                  </div>
                )}
                <div ref={segmentsEndRef} />
              </div>
            </div>
          </div>

          {/* Pending attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 sm:px-6 pt-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emergency-950/50 border border-emergency-700/40 text-[11px] text-emergency-200 font-semibold"
                >
                  {a.kind === "image" ? (
                    <>
                      {a.previewUrl && (
                        <img
                          src={a.previewUrl}
                          alt=""
                          className="w-8 h-8 rounded-md object-cover border border-emergency-700/50"
                        />
                      )}
                      <span className="max-w-[130px] truncate">{a.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-emergency-300/80 shrink-0">
                        {voiceState === "thinking" ? "Analyzing image…" : "Attached"}
                      </span>
                    </>
                  ) : a.kind === "evidence" ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span className="max-w-[180px] truncate font-mono">{a.evidenceCode || a.name}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3 h-3" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (a.kind === "image" && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
                      setAttachments((prev) => prev.filter((_, j) => j !== i));
                    }}
                    aria-label="Remove attachment"
                    className="text-emergency-300/70 hover:text-white transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom dock: planetary orb + small attach + mute + end */}
          <div className="shrink-0 px-4 sm:px-6 py-3 flex flex-col items-center gap-2.5">
            <div className="flex items-end justify-center gap-6">
              <label className="w-10 h-10 mb-3 cursor-pointer rounded-full flex items-center justify-center bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-emergency-300 transition" title="Attach a document or image to your next message">
                {uploading ? (
                  <span className="w-4 h-4 border-2 border-emergency-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <input
                  type="file"
                  accept="image/*,.txt,.pdf,.doc,.docx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFile(f);
                    if (e.target) e.target.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                onClick={toggleMic}
                disabled={voiceState === "thinking" || voiceState === "speaking"}
                aria-label={micActive ? "Stop and send" : "Start listening"}
                className={`relative rounded-full transition disabled:opacity-40 ${
                  micActive ? "scale-[1.03]" : "hover:scale-[1.02]"
                }`}
              >
                <SakhiOrb state={orbState} size={150} />
              </button>

              <button
                type="button"
                onClick={openLockerPicker}
                className="w-10 h-10 mb-3 rounded-full flex items-center justify-center bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-emerald-300 transition"
                aria-label="Attach from Evidence Locker"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={muteToggle}
                aria-label={muted ? "Unmute Sakhi's voice" : "Mute Sakhi's voice"}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition border ${
                  muted
                    ? "bg-slate-900 border-slate-600 text-slate-400"
                    : "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
                }`}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={endSession}
                className="h-11 px-4 rounded-full inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                End Session
              </button>
            </div>

            {!typingBox ? (
              <button
                type="button"
                onClick={() => setTypingBox(true)}
                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition"
              >
                <Keyboard className="w-3 h-3" />
                Type instead of speaking…
              </button>
            ) : (
              <div className="flex gap-2 w-full max-w-md">
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendTyped()}
                  autoFocus
                  placeholder="Type your question…"
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
            )}
          </div>
        </div>
      )}

      <LockerPicker
        open={lockerOpen}
        loading={lockerLoading}
        items={lockerItems}
        onClose={() => setLockerOpen(false)}
        onAttach={attachLockerItem}
      />
    </div>
  );
}

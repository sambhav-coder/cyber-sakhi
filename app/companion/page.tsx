"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Send,
  Sparkles,
  ShieldCheck,
  Lock,
  Bot,
  User,
  HeartHandshake,
  Plus,
  Trash2,
  Pencil,
  Paperclip,
  X,
  FileText,
  Loader2,
  Hash,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
  Shield,
  Radio,
  ChevronDown,
  Pin,
  PinOff,
  Share2,
} from "lucide-react";
import type { ChatMessage, SakhiLanguage } from "@/lib/sakhiAI";
import { LockerPicker } from "@/components/companion/LockerPicker";
import type { LockerItem } from "@/components/companion/LockerPicker";
import type {
  LiveSakhiAvatarHandle,
  SakhiAvatarStatus,
} from "@/components/companion/LiveSakhiAvatar";
import {
  getBrowserSpeechCapabilities,
  resolveFemaleVoice,
  speakWithEngine,
  waitForVoices,
  type SpeakHandle,
} from "@/lib/voice/speech";
import { SAKHI_CHAT_INTRO } from "@/lib/voice/content";

// Live 3D Sakhi avatar — TalkingHead (WebGL) + Three.js. Imported client-side
// only so WebGL/browser APIs never execute during SSR. Fully replaces the old
// static photo / WebGPU photo-mesh approach.
const LiveSakhiAvatar = dynamic(
  () => import("@/components/companion/LiveSakhiAvatar").then((m) => m.LiveSakhiAvatar),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[4/5] rounded-[18px] border border-emergency-900/20 bg-emergency-950/10 flex items-center justify-center">
        <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500 font-bold">
          Loading Sakhi&hellip;
        </span>
      </div>
    ),
  }
);

interface ConversationSummary {
  id: string;
  title: string;
  language: SakhiLanguage;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PendingAttachment {
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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

interface CaseSummary {
  id: string;
  caseNumber: string | null;
  title: string | null;
  severity: string | null;
  status: string | null;
  threatType: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UploadExtract {
  name: string;
  size: number;
  mimeType: string;
  kind: string;
  kindLabel: string;
  content: string | null;
  note: string | null;
  contentLength: number;
  preview: string;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Chat Mode speaks SAKHI_CHAT_INTRO — the SAME approved string rendered in the
 * welcome card below (single source of truth; distinct from the landing/hub
 * and voice-mode intros, so users never hear the same script twice).
 */
const SAKHI_INTRO_LINE_1 = SAKHI_CHAT_INTRO;
const AUTOPLAY_BLOCK_DETECT_MS = 2600;

function CompanionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [language, setLanguage] = useState<SakhiLanguage>("en");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [pinMap, setPinMap] = useState<Record<string, boolean>>({});
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [newConvoTitle, setNewConvoTitle] = useState("");
  const [chatWelcome, setChatWelcome] = useState(true);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [activeCase, setActiveCase] = useState<CaseSummary | null>(null);
  const [caseListOpen, setCaseListOpen] = useState(false);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const lastGeneralConvoRef = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [lockerLoading, setLockerLoading] = useState(false);
  const [lockerItems, setLockerItems] = useState<LockerItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [showLanding, setShowLanding] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [introPhase, setIntroPhase] = useState<"idle" | "speaking" | "done">("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<SakhiAvatarStatus>("loading");
  const avatarRef = useRef<LiveSakhiAvatarHandle | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechBlocked, setSpeechBlocked] = useState(false);
  const [introLines, setIntroLines] = useState<{ text: string; done: boolean }[]>([]);
  const [revealCount, setRevealCount] = useState(0);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [voiceReady, setVoiceReady] = useState(false);

  // ── THE critical fix: ONE female voice resolved ONCE, reused for every utterance. ──
  const introVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const introHandlesRef = useRef<SpeakHandle[]>([]);
  const introTimersRef = useRef<number[]>([]);
  const introAbortRef = useRef(false);
  const speechStartedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ---- conversations -------------------------------------------------------
  const refreshConversations = async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: ConversationSummary[] = data.conversations || [];
      const pins: Record<string, boolean> = {};
      for (const c of list) if (c.pinned) pins[c.id] = true;
      setPinMap(pins);
      const sorted = [...list].sort(
        (a, b) =>
          Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setConversations(sorted);
    } catch {
      /* offline */
    }
  };

  const openConversation = async (id: string) => {
    setLoadingHistory(true);
    setActiveConvoId(id);
    setActiveCase(null);
    setChatWelcome(false);
    try {
      const res = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setMessages((data.messages || []).map((m: any) => ({
        id: m.id,
        sender: m.sender as ChatMessage["sender"],
        text: m.text,
        timestamp: m.timestamp || nowLabel(),
        quickActions: m.quickActions || undefined,
      })));
    } catch {
      setMessages([]);
      setNotice("Couldn't load that conversation.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- cases -------------------------------------------------------------
  const loadCases = async () => {
    try {
      const res = await fetch("/api/cases", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCases(data.cases || []);
    } catch {
      /* offline */
    }
  };

  const openCase = async (c: CaseSummary) => {
    if (activeCase?.id === c.id) return;
    lastGeneralConvoRef.current = activeConvoId;
    setActiveConvoId(null);
    setActiveCase(c);
    setCaseListOpen(false);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/chat?caseId=${encodeURIComponent(c.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setMessages((data.messages || []).map((m: any) => ({
        id: m.id,
        sender: m.sender as ChatMessage["sender"],
        text: m.text,
        timestamp: m.timestamp || nowLabel(),
        quickActions: m.quickActions || undefined,
      })));
    } catch {
      setMessages([]);
      setNotice("Couldn't load that case conversation.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const clearCase = () => {
    setActiveCase(null);
    setCaseListOpen(false);
    const stash = lastGeneralConvoRef.current;
    lastGeneralConvoRef.current = null;
    if (stash) {
      void openConversation(stash);
    } else {
      setMessages([]);
      setActiveConvoId(null);
    }
  };

  const attachReport = () => {
    if (!activeCase) return;
    setAttachments((prev) => [
      ...prev,
      {
        kind: "report",
        caseId: activeCase.id,
        name: `Case ${activeCase.caseNumber || activeCase.id} report`,
      },
    ]);
  };

  useEffect(() => {
    loadCases();
    fetch("/api/ai/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.active?.label) setProviderStatus(data.active.label);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // 1) Initialize the ONE female voice ONCE, before any speech attempt.
  //    Speech only begins AFTER the voice is resolved and stored in the ref.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const caps = getBrowserSpeechCapabilities();
    setSpeechSupported(caps.tts);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = () => setReducedMotion(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onMq);

    void (async () => {
      try {
        // Guarantee voice list is populated before we pick anything.
        await waitForVoices();
        const v = await resolveFemaleVoice("en");
        if (cancelled) return;
        introVoiceRef.current = v;
        setVoiceReady(true);
      } catch {
        if (!cancelled) {
          introVoiceRef.current = null;
          setVoiceReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mq.removeEventListener) mq.removeEventListener("change", onMq);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2) Sakhi introduction — audio lifecycle is the source of truth.
  //    Both intro lines use the EXACT same SpeechSynthesisVoice stored in
  //    introVoiceRef, resolved once above. Zero chance of sentence 1 = male
  //    voice and sentence 2 = female voice.
  // ---------------------------------------------------------------------------
  const clearIntroTimers = () => {
    introTimersRef.current.forEach((t) => window.clearTimeout(t));
    introTimersRef.current = [];
  };

  const cancelAllIntroHandles = () => {
    introHandlesRef.current.forEach((h) => {
      try { h.cancel(); } catch { /* noop */ }
    });
    introHandlesRef.current = [];
  };

  const speakLine = (text: string, lineIndex: number): Promise<void> =>
    new Promise((resolve) => {
      if (introAbortRef.current) return resolve();
      setActiveLineIndex(lineIndex);
      setRevealCount(0);
      setIntroLines((prev) => {
        const next = prev.slice();
        if (!next[lineIndex]) next.push({ text, done: false });
        return next;
      });

      // Engine-first (local Piper en_GB-aru) with the pre-resolved browser
      // voice as fallback — the SAME English voice pipeline the landing uses,
      // so the approved English voice/quality is identical across surfaces.
      console.log("🧪 [Chat Mode] TTS REQUEST:", { 
        TTS_ENGINE: "edge-tts (via /api/voice/tts)",
        LANGUAGE: "en",
        TEXT_LENGTH: text.length,
        TEST_MODE: process.env.SAKHI_TEST_MODE === 'edge-tts-only' ? "edge-tts-only" : "normal"
      });
      let fallbackId: number | null = null;
      const handle = speakWithEngine(text, introVoiceRef.current, {
        language: "en",
        rate: 0.97,
        pitch: 1.03,
        onStart: () => {
          console.log("🧪 [Chat Mode] TTS AUDIO STARTED");
          speechStartedRef.current = true;
          setIsSpeaking(true);
          setSpeechBlocked(false);
          // Sakhi's mouth follows the real audio — page triggers the viseme track.
          avatarRef.current?.speakStart(text);
          // No per-word boundary events from the engine, so a light interval
          // drives the typewriter reveal for the full spoken duration.
          fallbackId = window.setInterval(() => {
            if (introAbortRef.current) return;
            setRevealCount((prev) => Math.min(prev + 3, text.length));
          }, 48);
        },
        onEnd: () => {
          console.log("🧪 [Chat Mode] TTS AUDIO COMPLETED");
          if (fallbackId !== null) window.clearInterval(fallbackId);
          setIsSpeaking(false);
          avatarRef.current?.speakEnd();
          setRevealCount(text.length);
          setIntroLines((prev) =>
            prev.map((l, i) => (i === lineIndex ? { ...l, done: true } : l))
          );
          resolve();
        },
        onError: () => {
          console.error("🧪 [Chat Mode] TTS AUDIO ERROR");
          if (fallbackId !== null) window.clearInterval(fallbackId);
          setIsSpeaking(false);
          avatarRef.current?.speakEnd();
          setRevealCount(text.length);
          setIntroLines((prev) =>
            prev.map((l, i) => (i === lineIndex ? { ...l, done: true } : l))
          );
          resolve();
        },
      });
      introHandlesRef.current.push(handle);
    });

  const beginIntroSpeech = () => {
    introAbortRef.current = false;
    clearIntroTimers();
    cancelAllIntroHandles();
    setIntroPhase("speaking");
    setSpeechBlocked(false);
    setIntroLines([]);
    setRevealCount(0);
    setActiveLineIndex(-1);
    avatarRef.current?.setExpression("warm");

    void (async () => {
      await speakLine(SAKHI_INTRO_LINE_1, 0);
      if (introAbortRef.current) return;
      avatarRef.current?.setExpression("neutral");
      setIntroPhase("done");
    })().catch(() => {
      if (!introAbortRef.current) setIntroPhase("done");
    });
  };

  const meetSakhi = () => {
    speechStartedRef.current = true;
    avatarRef.current?.setExpression("warm");
    beginIntroSpeech();
  };

  const skipIntro = () => {
    introAbortRef.current = true;
    clearIntroTimers();
    cancelAllIntroHandles();
    setIsSpeaking(false);
    avatarRef.current?.speakEnd();
    setIntroPhase("done");
  };

  const replayIntro = () => {
    // Reset everything but keep the same voice object.
    setIntroPhase("idle");
    setIntroLines([]);
    setRevealCount(0);
    avatarRef.current?.setExpression("warm");
    beginIntroSpeech();
  };

  const stopIntroAudio = () => {
    introAbortRef.current = true;
    clearIntroTimers();
    cancelAllIntroHandles();
    setIsSpeaking(false);
    avatarRef.current?.speakEnd();
  };

  // Autoplay attempt — WAIT for both the voice to be resolved and the page
  // to settle before attempting speech. If the browser blocks autoplay, we
  // surface a clean Meet Sakhi button instead of retrying.
  useEffect(() => {
    if (!voiceReady) return;
    speechStartedRef.current = false;

    const startId = window.setTimeout(() => {
      beginIntroSpeech();
      const blockId = window.setTimeout(() => {
        if (!speechStartedRef.current && speechSupported) {
          // Browser blocked autoplay — abort this run and offer the primary CTA.
          introAbortRef.current = true;
          clearIntroTimers();
          cancelAllIntroHandles();
          setIsSpeaking(false);
          avatarRef.current?.speakEnd();
          avatarRef.current?.setExpression("neutral");
          setIntroPhase("idle");
          setIntroLines([]);
          setRevealCount(0);
          setSpeechBlocked(true);
        }
      }, AUTOPLAY_BLOCK_DETECT_MS);
      introTimersRef.current.push(blockId);
    }, 600);
    introTimersRef.current.push(startId);

    return () => {
      clearIntroTimers();
      introAbortRef.current = true;
      cancelAllIntroHandles();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceReady]);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      doSend(initialQuery);
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const openNewConversationModal = () => {
    stopIntroAudio();
    setNewConvoTitle("");
    setNewConvoOpen(true);
  };

  const createNamedConversation = async () => {
    const title = newConvoTitle.trim() || "New conversation";
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not create conversation.");
      setNewConvoOpen(false);
      setNewConvoTitle("");
      setShowLanding(false);
      setActiveConvoId(data.conversation.id);
      setActiveCase(null);
      setCaseListOpen(false);
      setLastFailedText(null);
      setMessages([]);
      setAttachments([]);
      setEditingTitle(null);
      setChatWelcome(false);
      setNotice(null);
      await refreshConversations();
      window.setTimeout(() => inputRef.current?.focus(), 60);
      setProviderLabel(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create conversation.");
    }
  };

  const togglePin = async (id: string) => {
    const next = !pinMap[id];
    setPinMap((prev) => ({ ...prev, [id]: next }));
    try {
      await fetch("/api/chat/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, pinned: next }),
      });
    } catch { /* offline */ }
    void refreshConversations();
  };

  const shareConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not share conversation.");
      await navigator.clipboard.writeText(data.shareUrl).catch(() => undefined);
      setNotice("Share link copied — message text only, expires in 7 days. Revoke it from the menu any time.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not share conversation.");
    }
  };

  const enterChatMode = () => {
    stopIntroAudio();
    setActiveCase(null);
    setShowLanding(false);
    setChatWelcome(true);
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) {
      return;
    }
    try {
      await fetch("/api/chat/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });
      try {
        await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch { /* revoke shares best-effort */ }
    } catch { /* offline */ }
    if (activeConvoId === id) {
      setActiveConvoId(null);
      setMessages([]);
      setChatWelcome(true);
    }
    refreshConversations();
  };

  const renameConversation = async (id: string, title: string) => {
    try {
      await fetch("/api/chat/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, title }),
      });
    } catch { /* offline */ }
    setEditingTitle(null);
    refreshConversations();
  };

  // ---- sending -------------------------------------------------------------
  const doSend = async (
    text?: string,
    forcedAttachments?: PendingAttachment[]
  ): Promise<string | null> => {
    const query = (text ?? inputText).trim();
    const atts = forcedAttachments ?? attachments;
    if (!query) return null;

    setMessages((prev) => [...prev, {
      id: "user_" + Date.now(),
      sender: "user",
      text: query,
      timestamp: nowLabel(),
    }]);
    setInputText("");
    setNotice(null);
    setLastFailedText(null);
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          language,
          conversationId: activeConvoId,
          caseId: activeCase?.id || undefined,
          attachments: atts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sakhi companion service error.");

      const reply: ChatMessage = {
        id: data?.id || "sakhi_" + Date.now(),
        sender: "sakhi",
        text: data?.text || "",
        timestamp: data?.timestamp || nowLabel(),
        quickActions: data?.quickActions || [],
        category: data?.category,
      };
      setMessages((prev) => [...prev, reply]);
      if (data?.provider?.label) setProviderLabel(data.provider.label);
      if (data?.detectedLanguage) {
        setLanguage(data.detectedLanguage);
      }
      if (data?.context?.conversationId) {
        setActiveConvoId(data.context.conversationId);
        refreshConversations();
      }
      // Images were consumed by this message — release their object URLs and
      // clear the chips now that analysis is complete.
      atts.forEach((a) => {
        if (a.kind === "image" && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setAttachments([]);
      return reply.text || data?.text || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sakhi companion service error.";
      setLastFailedText(query);
      setMessages((prev) => [...prev, {
        id: "sakhi_err_" + Date.now(),
        sender: "sakhi",
        text: msg,
        timestamp: nowLabel(),
      }]);
      // Attachments stay attached so Retry resends the same content.
      return null;
    } finally {
      setIsTyping(false);
    }
  };

  // ---- uploads -------------------------------------------------------------
  const handleUploadFile = async (file: File) => {
    if (!file) return;

    // IMAGES (and screenshots) go to Gemini's multimodal vision as real pixels —
    // never filename-only, never an "OCR unavailable" fake. The base64 bytes are
    // sent to the server with the message, then to Gemini, and never persisted.
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name || "");
    if (isImage) {
      const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
      if (file.size > MAX_IMAGE_BYTES) {
        setNotice("That image is too large (max 8 MB). Please compress it and try again.");
        return;
      }
      setUploading(true);
      try {
        const dataBase64 = await readFileAsBase64(file);
        const previewUrl = URL.createObjectURL(file);
        setAttachments((prev) => [...prev, {
          kind: "image",
          name: file.name || "image",
          mimeType: file.type || "image/png",
          dataBase64,
          previewUrl,
        }]);
      } catch {
        setNotice("Could not read that image. Try attaching it again.");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setNotice("That file is too large (max 5 MB for text analysis).");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      const extract: UploadExtract = data.file;
      if (extract.content && extract.content.trim()) {
        await doSend(`Please review this document for safety signals.`, [
          {
            kind: "document",
            name: extract.name,
            content: extract.content,
            note: extract.note ?? undefined,
          },
        ]);
      } else {
        setAttachments((prev) => [...prev, {
          kind: "document",
          name: extract.name,
          note: extract.note || "No text was extracted.",
        }]);
        setNotice(
          extract.note ||
            "The file was attached, but no text could be extracted."
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // ---- evidence attach -----------------------------------------------------
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
        isLocked:
          it.lock_metadata?.locked === true ||
          it.metadata?.locked === true ||
          Boolean(it.lock_method),
      })));
    } catch {
      setLockerItems([]);
      setNotice("Couldn't load your Evidence Locker.");
    } finally {
      setLockerLoading(false);
    }
  };

  const attachLockerItem = (item: LockerItem) => {
    setAttachments((prev) => [...prev, {
      kind: "evidence",
      evidenceCode: item.evidenceCode,
      title: item.title || undefined,
    }]);
    setLockerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ---- quick actions --------------------------------------------------------
  const handleActionClick = (actionType: string) => {
    switch (actionType) {
      case "NAVIGATE_SOS": router.push("/sos"); break;
      case "NAVIGATE_LOCKER": router.push("/locker"); break;
      case "NAVIGATE_DETECTOR": router.push("/detector"); break;
      case "NAVIGATE_CONTACTS": router.push("/contacts"); break;
      case "DIAL_112": window.location.href = "tel:112"; break;
      case "DIAL_1091": window.location.href = "tel:1091"; break;
      case "DIAL_1930": window.location.href = "tel:1930"; break;
      case "DIAL_14416": window.location.href = "tel:14416"; break;
      case "OPEN_CYBERCRIME_PORTAL":
        window.open("https://cybercrime.gov.in", "_blank");
        break;
      default: break;
    }
  };

  const hasMessages = messages.length > 0;

  // Shared "Name your conversation" modal — rendered in both the immersive
  // Chat Mode landing and the workspace so the primary CTA always works.
  const newConversationModal = newConvoOpen && (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Name your new conversation"
    >
      <div className="w-full max-w-sm rounded-3xl glass-panel border-emergency-900/40 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            Name your conversation
          </h3>
          <button
            type="button"
            onClick={() => setNewConvoOpen(false)}
            aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[12px] text-slate-400">
          Give this chat a short, private name so you can find it again from
          the sidebar.
        </p>
        <input
          type="text"
          value={newConvoTitle}
          onChange={(e) => setNewConvoTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createNamedConversation();
            if (e.key === "Escape") setNewConvoOpen(false);
          }}
          autoFocus
          placeholder="e.g. WhatsApp risk — ask for a friend"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
        />
        <button
          type="button"
          onClick={() => void createNamedConversation()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emergency-600 hover:bg-emergency-500 text-white text-[13px] font-bold transition shadow-lg shadow-emergency-950/40"
        >
          <Plus className="w-4 h-4" />
          Start Chat
        </button>
      </div>
    </div>
  );

  // =========================================================
  // CINEMATIC SAKHI COMPANION LANDING — TWO-ZONE COMPOSITION
  // =========================================================
  if (showLanding && !hasMessages && !loadingHistory) {
    const introStarted = introPhase === "speaking" || introPhase === "done";
    return (
      <div className="relative min-h-screen w-full overflow-x-clip">
        {/* ── Ambient atmosphere layer ────────────────────────────── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          {/* Deep console grid — vignette masked to edges only */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(239,68,68,0.038) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.038) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage:
                "radial-gradient(ellipse 90% 85% at 50% 50%, black 35%, transparent 82%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 85% at 50% 50%, black 35%, transparent 82%)",
            }}
          />
          {/* Top crimson bloom */}
          <div
            className="absolute left-1/2 top-[-160px] -translate-x-1/2 w-[880px] h-[520px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(185,28,28,0.30) 0%, rgba(185,28,28,0.08) 42%, transparent 72%)",
              filter: "blur(40px)",
            }}
          />
          {/* Bottom-left ambient */}
          <div
            className="absolute left-[-120px] bottom-[-140px] w-[520px] h-[420px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(127,29,29,0.26) 0%, transparent 72%)",
              filter: "blur(46px)",
            }}
          />
          {/* Bottom-right ambient */}
          <div
            className="absolute right-[-100px] bottom-[-160px] w-[560px] h-[440px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(185,28,28,0.18) 0%, transparent 72%)",
              filter: "blur(46px)",
            }}
          />
        </div>

        {/* ── Header strip ────────────────────────────────────────── */}
        <div className="relative z-20 w-full flex items-center justify-between px-5 sm:px-8 pt-5 sm:pt-7">
          <div className="flex items-center gap-2.5 companion-fade-in">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emergency-700 to-emergency-950 p-[2px] shadow-lg shadow-emergency-900/40">
              <div className="w-full h-full bg-[#0d0d1e] rounded-[10px] flex items-center justify-center">
                <Bot className="w-[18px] h-[18px] text-emergency-400" />
              </div>
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-black tracking-tight text-white uppercase">
                Cyber <span className="text-crimson-gradient">Sakhi</span>
              </div>
              <div className="text-[9px] tracking-[0.22em] text-slate-500 uppercase font-bold">
                Companion · Private Space
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 companion-fade-in companion-fade-in-delay-1">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800/90 bg-slate-950/40">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Secure Channel
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-emergency-900/40 bg-emergency-950/25">
              <Radio
                className={`w-3.5 h-3.5 ${
                  avatarStatus === "error"
                    ? "text-rose-400"
                    : avatarStatus === "loading"
                      ? "text-amber-300/70"
                      : isSpeaking
                        ? "text-emergency-300"
                        : "text-emergency-500/60"
                }`}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                  avatarStatus === "error"
                    ? "text-rose-300"
                    : avatarStatus === "loading"
                      ? "text-amber-200/70"
                      : isSpeaking
                        ? "text-emergency-200"
                        : "text-slate-500"
                }`}
              >
                {avatarStatus === "error"
                  ? "Avatar Offline"
                  : avatarStatus === "loading"
                    ? "Loading Sakhi…"
                    : isSpeaking
                      ? "Sakhi Speaking"
                      : "Sakhi Online"}
              </span>
            </div>
          </div>
        </div>

        {/* ── MAIN TWO-ZONE HERO ─────────────────────────────────── */}
        <div className="relative z-10 w-full max-w-[1240px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-12 sm:pb-16 lg:min-h-[calc(100vh-120px)] lg:flex lg:items-center">
          <div className="w-full grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 lg:items-center">

            {/* ============== LEFT ZONE: SAKHI'S 3D AVATAR ============== */}
            <div className="relative w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[430px] mx-auto flex flex-col items-center justify-center companion-fade-in companion-fade-in-delay-2">
              <LiveSakhiAvatar
                ref={avatarRef}
                isSpeaking={isSpeaking}
                reducedMotion={reducedMotion}
                onStatus={setAvatarStatus}
              />
            </div>

            {/* ============ RIGHT ZONE: INTRO + INTERACTIONS ============ */}
            <div className="relative flex flex-col gap-6 sm:gap-7 companion-fade-in companion-fade-in-delay-3">

              {/* Eyebrow + Title — WELCOME TO SAKHI AI · CHAT MODE */}
              <div className="space-y-3 sm:space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emergency-800/50 bg-emergency-950/30 backdrop-blur-sm">
                  <HeartHandshake className="w-3.5 h-3.5 text-emergency-300 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emergency-200">
                    WELCOME TO SAKHI AI
                  </span>
                </div>

                <div className="space-y-2">
                  <h1 className="text-[34px] sm:text-[44px] lg:text-[52px] font-black tracking-[-0.02em] leading-[0.98] text-white">
                    Chat <span className="text-crimson-gradient">Mode</span>
                  </h1>
                  <p className="text-[13px] sm:text-sm text-slate-400 font-medium leading-relaxed max-w-lg">
                    You can talk to Sakhi about cyber safety, online threats, your
                    cases, evidence and more — in English, Hindi or Hinglish.
                  </p>
                </div>
              </div>

              {/* ── THE ONE dialogue area: Sakhi's introduction ── */}
              <div className="relative">
                {speechBlocked && !introStarted ? (
                  /* ──── Autoplay blocked — Meet Sakhi primary CTA ──── */
                  <div
                    className="relative rounded-2xl border border-emergency-800/40 overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(140deg, rgba(69,10,10,0.65) 0%, rgba(8,8,18,0.85) 55%, rgba(4,4,12,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      boxShadow: "0 22px 60px -22px rgba(127,29,29,0.55)",
                    }}
                  >
                    <div
                      aria-hidden
                      className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emergency-500/55 to-transparent"
                    />
                    <div className="p-5 sm:p-7 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emergency-950/80 border border-emergency-700/40 flex items-center justify-center shadow-inner">
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
                        onClick={meetSakhi}
                        className="btn-emergency w-full !py-3.5 !text-sm focus-visible:outline-offset-2"
                      >
                        <Play className="w-4 h-4" />
                        Meet Sakhi
                      </button>
                      {!speechSupported && (
                        <p className="text-[10px] text-slate-500 text-center pt-1">
                          This browser has no speech synthesis — the introduction will
                          appear as text.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ──── Intro speech / live dialogue ──── */
                  <div
                    className="relative rounded-2xl border border-white/[0.07] overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(155deg, rgba(10,10,22,0.7) 0%, rgba(6,6,16,0.82) 58%, rgba(4,4,12,0.9) 100%)",
                      backdropFilter: "blur(18px)",
                      boxShadow: isSpeaking
                        ? "0 28px 70px -30px rgba(127,29,29,0.55), inset 0 0 0 1px rgba(239,68,68,0.05)"
                        : "0 22px 55px -32px rgba(0,0,0,0.9)",
                    }}
                  >
                    {/* Screen-reader status — animation is NEVER the only information */}
                    <span aria-live="polite" className="sr-only">
                      {isSpeaking
                        ? "Sakhi is speaking"
                        : introPhase === "done"
                        ? "Sakhi has finished introducing herself"
                        : ""}
                    </span>

                    {/* Top accent line */}
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
                      {/* Intro lines — revealed in sync with real audio */}
                      <div className="min-h-[104px] sm:min-h-[98px] flex flex-col items-start gap-3.5">
                        {introLines.length === 0 && !voiceReady && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 italic py-3">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Sakhi is waking up…
                          </div>
                        )}
                        {introLines.map((line, i) => {
                          const isCurrent = i === activeLineIndex && introPhase === "speaking";
                          const chars = isCurrent
                            ? revealCount
                            : line.done
                            ? line.text.length
                            : 0;
                          const text = line.text.slice(0, chars);
                          return (
                            <p
                              key={i}
                              aria-live={isCurrent ? "assertive" : undefined}
                              className={`text-left text-[14px] sm:text-[15.5px] leading-[1.62] font-medium break-words ${
                                isCurrent ? "text-white" : "text-slate-200/90"
                              }`}
                            >
                              {text}
                              {isCurrent && chars < line.text.length && (
                                <span
                                  aria-hidden
                                  className="inline-block w-[2px] h-[1em] bg-emergency-400 align-text-bottom ml-0.5 sakhi-caret"
                                />
                              )}
                            </p>
                          );
                        })}
                      </div>

                      {/* Voice activity chip + skip / replay */}
                      <div className="flex items-center justify-between border-t border-white/5 pt-3.5">
                        <div
                          className={`rounded-full border px-3 py-1.5 flex items-center gap-2 transition-all duration-300 ${
                            isSpeaking
                              ? "border-emergency-700/50 bg-emergency-950/40 text-emergency-200"
                              : "border-slate-800 bg-slate-950/40 text-slate-500"
                          }`}
                          role="status"
                        >
                          <span aria-hidden className="flex items-end gap-[3px] h-3.5">
                            {[...Array(6)].map((_, i) => (
                              <span
                                key={i}
                                className={`w-[3px] rounded-full ${
                                  isSpeaking
                                    ? reducedMotion
                                      ? "h-1.5 bg-emergency-400"
                                      : "sakhi-wave bg-emergency-400"
                                    : "h-1 bg-slate-600"
                                }`}
                                style={{
                                  height: isSpeaking ? `${6 + ((i * 3) % 9)}px` : undefined,
                                  animationDelay: `${i * 0.11}s`,
                                }}
                              />
                            ))}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-[0.22em]">
                            {isSpeaking ? "Speaking" : introPhase === "done" ? "Standby" : "Listening"}
                          </span>
                        </div>

                        {introPhase === "speaking" && (
                          <button
                            type="button"
                            onClick={skipIntro}
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-200 transition px-2 py-1 rounded-lg hover:bg-slate-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emergency-400"
                          >
                            <SkipForward className="w-3 h-3" />
                            Skip
                          </button>
                        )}
                        {introPhase === "done" && (
                          <button
                            type="button"
                            onClick={replayIntro}
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-emergency-300 transition px-2.5 py-1.5 rounded-lg hover:bg-slate-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emergency-400"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Replay Intro
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── PRIMARY ACTION — exactly one, never gated ── */}
              <div className="space-y-2.5 companion-fade-in companion-fade-in-delay-4">
                <div className="flex items-center gap-2 pb-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-slate-800/80 via-slate-800/30 to-transparent" />
                </div>

                <button
                  type="button"
                  onClick={openNewConversationModal}
                  aria-label="Start a new conversation"
                  className="group relative inline-flex w-full items-center justify-center gap-2.5 px-6 py-4 rounded-2xl text-white text-[14px] font-black uppercase tracking-wide transition-all duration-300 hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400 overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(140deg, rgba(220,38,38,0.92) 0%, rgba(185,28,28,0.95) 55%, rgba(127,29,29,0.98) 100%)",
                    boxShadow:
                      "0 18px 42px -14px rgba(127,29,29,0.65), inset 0 1px 0 rgba(254,202,202,0.2)",
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-14 -top-14 w-44 h-44 rounded-full opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(254,202,202,0.4) 0%, transparent 65%)",
                    }}
                  />
                  <span className="relative flex items-center gap-2.5">
                    <Plus className="w-5 h-5" strokeWidth={2.4} />
                    Start New Conversation
                  </span>
                </button>

                {conversations.length > 0 && (
                  <button
                    type="button"
                    onClick={enterChatMode}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-emergency-200 transition px-2 py-1.5"
                  >
                    Open a previous conversation
                    <Send className="w-3 h-3 -rotate-45" />
                  </button>
                )}

                {/* Reassurance micro-copy */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 px-0.5 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span className="font-semibold">Judgement-Free</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-emerald-500" />
                    <span className="font-semibold">Private Session</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <HeartHandshake className="w-3 h-3 text-emergency-400" />
                    <span className="font-semibold">Always here for you</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer tagline */}
        <div className="relative z-10 w-full pb-6 pt-2 sm:pt-0 text-center">
          <div className="inline-flex items-center gap-3 text-[9px] font-black tracking-[0.28em] text-slate-600 uppercase">
            <span>Confidential</span>
            <span className="h-px w-8 bg-emergency-700/30" />
            <span>Secure</span>
            <span className="h-px w-8 bg-emergency-700/30" />
            <span>Empowering</span>
          </div>
        </div>

        {newConversationModal}
      </div>
    );
  }

  // =======================================================
  // CHAT MODE — Main conversation workspace
  // =======================================================
  const showWelcome = chatWelcome && !activeCase && !hasMessages;
  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Header Bar (no voice shortcut, no language buttons — language is auto) */}
      <div className="flex items-center justify-between gap-4 px-1 pt-2 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emergency-700 via-emergency-800 to-emergency-950 p-0.5 shadow-lg shadow-emergency-950/40 shrink-0">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[14px] flex items-center justify-center">
              <Bot className="w-5 h-5 text-emergency-400" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-white truncate">
                Sakhi Companion
              </h1>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emergency-950/70 text-emergency-300 border border-emergency-700/50 font-bold uppercase tracking-wider">
                Chat Mode
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Confidential support · private · auto language
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-emergency-300/90 font-semibold">
            <Sparkles className="w-3 h-3" />
            {providerLabel || providerStatus || "Gemini AI"}
          </span>
          <button
            type="button"
            onClick={openNewConversationModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-emergency-700/40 text-slate-400 hover:text-emergency-200 text-[11px] font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
      </div>

      {showWelcome ? (
        <div className="glass-panel border-slate-800/80 rounded-3xl px-6 py-14 sm:py-16 text-center flex flex-col items-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emergency-700 via-emergency-800 to-emergency-950 p-1 shadow-xl shadow-emergency-950/50">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[21px] flex items-center justify-center">
              <Bot className="w-8 h-8 text-emergency-300" />
            </div>
          </div>
          <div className="space-y-1.5 max-w-md">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Chat Mode
            </h2>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              {SAKHI_CHAT_INTRO}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={openNewConversationModal}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emergency-600 hover:bg-emergency-500 text-white text-[13px] font-bold transition shadow-lg shadow-emergency-950/40"
            >
              <Plus className="w-4 h-4" />
              Start New Conversation
            </button>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setChatWelcome(false)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[13px] font-semibold transition"
              >
                Open a previous conversation
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Tip: attach a case or evidence from the Evidence Locker any time
            for case-aware guidance.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[248px_1fr] gap-5 items-start">
        {/* Conversation rail */}
        <aside className="lg:sticky lg:top-6 rounded-2xl glass-panel border-slate-800/80 p-3 hidden md:block max-h-[560px] overflow-y-auto">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
              Conversations
            </span>
            <button
              type="button"
              onClick={openNewConversationModal}
              className="text-[11px] px-2 py-1 rounded-lg bg-emergency-950/60 hover:bg-emergency-900 text-emergency-200 font-semibold transition"
            >
              + New
            </button>
          </div>
          {conversations.length === 0 && (
            <p className="text-[11px] text-slate-500 px-1 py-3">
              No saved conversations yet. Your general Sakhi chats are kept here, private to your account.
            </p>
          )}
          <div className="space-y-1">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group relative rounded-xl border px-3 py-2 transition cursor-pointer ${
                  activeConvoId === c.id
                    ? "bg-emergency-950/50 border-emergency-700/50"
                    : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => openConversation(c.id)}
                >
                  {editingTitle === c.id ? (
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameConversation(c.id, editTitleValue);
                        if (e.key === "Escape") setEditingTitle(null);
                      }}
                      autoFocus
                      className="w-full rounded-md bg-slate-900 border border-emergency-600 px-2 py-0.5 text-[11px] text-white focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className={`text-xs font-semibold truncate leading-tight ${
                        c.pinned ? "text-emergency-200" : "text-slate-200"
                      }`}>
                        {c.pinned && (
                          <Pin className="w-3 h-3 inline-block mr-1 -mt-0.5 text-emergency-400" />
                        )}
                        {c.title || "New conversation"}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {timeAgo(c.updatedAt)} · {c.language}
                      </p>
                    </>
                  )}
                </button>
                {editingTitle !== c.id && (
                  <div className="opacity-0 group-hover:opacity-100 absolute right-1.5 top-1.5 flex gap-1 transition">
                    <button
                      type="button"
                      aria-label={c.pinned ? "Unpin conversation" : "Pin conversation"}
                      onClick={() => togglePin(c.id)}
                      className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emergency-200 transition"
                    >
                      {c.pinned ? (
                        <Pin className="w-3 h-3" />
                      ) : (
                        <PinOff className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Share conversation"
                      onClick={() => shareConversation(c.id)}
                      className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emergency-200 transition"
                    >
                      <Share2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Rename conversation"
                      onClick={() => {
                        setEditingTitle(c.id);
                        setEditTitleValue(c.title || "");
                      }}
                      className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={() => deleteConversation(c.id)}
                      className="p-1 rounded-md bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-300 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main column */}
        <div className="space-y-4 min-w-0">
          {/* Case context strip */}
          <div className="flex flex-wrap items-center gap-2">
            {activeCase ? (
              <div className="flex items-center gap-2 max-w-full">
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emergency-950/50 border border-emergency-700/40 text-[11px] font-semibold">
                  <Hash className="w-3.5 h-3.5 text-emergency-300 shrink-0" />
                  <span className="font-mono text-emergency-200">
                    {activeCase.caseNumber || activeCase.id}
                  </span>
                  {activeCase.title && (
                    <span className="hidden sm:inline text-slate-400 max-w-[220px] truncate">
                      · {activeCase.title}
                    </span>
                  )}
                  <span
                    className={`text-[9px] uppercase tracking-widest font-bold ${
                      String(activeCase.severity || "").toLowerCase() === "high" ||
                      String(activeCase.severity || "").toLowerCase() === "critical"
                        ? "text-rose-300"
                        : "text-slate-500"
                    }`}
                  >
                    {activeCase.severity || "case"}
                  </span>
                  <button
                    type="button"
                    onClick={clearCase}
                    className="text-emergency-300/70 hover:text-white transition"
                    aria-label="Clear case context"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={attachReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] font-semibold transition"
                >
                  <FileText className="w-3.5 h-3.5 text-emergency-400" />
                  Attach case report
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setCaseListOpen((v) => !v);
                    if (cases.length === 0) loadCases();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] font-semibold transition"
                >
                  <Hash className="w-3.5 h-3.5 text-emergency-400" />
                  {cases.length > 0 ? "Ask about a case" : "Add case context"}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {caseListOpen && (
                  <div className="absolute left-0 top-full mt-1.5 z-30 w-72 max-h-72 overflow-y-auto rounded-xl glass-panel border-slate-700/80 p-1.5 space-y-0.5 shadow-2xl">
                    {cases.length === 0 && (
                      <p className="text-[11px] text-slate-500 px-2 py-3">
                        No cases found on your account yet.
                      </p>
                    )}
                    {cases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCase(c)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-emergency-950/40 transition"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                          <Hash className="w-3 h-3 text-emergency-400 shrink-0" />
                          <span className="font-mono">{c.caseNumber || c.id}</span>
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 truncate">
                          {c.title || c.threatType || "Untitled case"} · {c.severity || "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile conversation chips */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={openNewConversationModal}
              className={`shrink-0 text-[11px] px-3 py-1.5 rounded-xl border font-semibold transition ${
                !activeConvoId
                  ? "bg-emergency-600 border-emergency-600 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              + New
            </button>
            {conversations.slice(0, 8).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`shrink-0 text-[11px] px-3 py-1.5 rounded-xl border transition ${
                  activeConvoId === c.id
                    ? "bg-emergency-950/60 border-emergency-700/50 text-emergency-200"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                {c.title || "New conversation"}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          {hasMessages ? (
            <div className="rounded-3xl glass-panel border-slate-800/80 p-4 sm:p-6 min-h-[420px] max-h-[580px] overflow-y-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.sender === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.sender === "user"
                        ? "bg-slate-800 text-emergency-200 border border-slate-700"
                        : "bg-emergency-950/70 text-emergency-300 border border-emergency-700/50"
                    }`}
                  >
                    {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-emergency-900/60 text-emergency-50 border border-emergency-800/50 rounded-tr-none shadow-md"
                        : "bg-slate-900/90 text-slate-100 border border-slate-800 rounded-tl-none shadow-lg"
                    }`}
                  >
                    <div className="text-[13px] leading-relaxed">
                      {msg.sender === "sakhi" ? (
                        <RichText text={msg.text} />
                      ) : (
                        <p className="whitespace-pre-line">{msg.text}</p>
                      )}
                    </div>
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
                        {msg.quickActions.map((qa, i) => (
                          <button
                            key={i}
                            onClick={() => handleActionClick(qa.actionType)}
                            className="px-3 py-1.5 rounded-lg bg-emergency-950/60 hover:bg-emergency-900 text-emergency-200 border border-emergency-700/40 text-[11px] font-semibold transition flex items-center gap-1.5"
                          >
                            <span>{qa.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.id.startsWith("sakhi_err_") && lastFailedText && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const t = lastFailedText;
                            setLastFailedText(null);
                            void doSend(t);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emergency-200 border border-emergency-700/40 text-[11px] font-semibold transition flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry
                        </button>
                      </div>
                    )}
                    <div
                      className={`text-[10px] text-right mt-1.5 ${
                        msg.sender === "user" ? "text-emergency-200/60" : "text-slate-500"
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emergency-950/70 text-emergency-300 border border-emergency-700/50 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-900 text-slate-400 text-xs rounded-tl-none border border-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-75" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-150" />
                    <span className="ml-1 text-[11px]">Sakhi is thinking…</span>
                  </div>
                </div>
              )}

              {loadingHistory && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading conversation…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="rounded-3xl glass-panel border-slate-800/80 p-10 text-center space-y-2">
              <Sparkles className="w-5 h-5 text-emergency-400 mx-auto" />
              <p className="text-[13px] text-slate-300 font-semibold">
                Ask me anything about cyber safety.
              </p>
              <p className="text-[11px] text-slate-500">
                Sakhi will reply in whatever language you use.
              </p>
            </div>
          )}

          {/* Pending attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emergency-950/50 border border-emergency-700/40 text-[11px] text-emergency-200 font-semibold"
                >
                  {a.kind === "evidence" ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span className="font-mono">{a.evidenceCode}</span>
                    </>
                  ) : a.kind === "report" ? (
                    <>
                      <Hash className="w-3 h-3" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                    </>
                  ) : a.kind === "image" ? (
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
                        {isTyping ? "Analyzing image…" : "Attached"}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3 h-3" />
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
              <span className="text-[10px] text-slate-500 self-center">
                Attachments are sent with your next message.
              </span>
            </div>
          )}

          {/* Notice */}
          {notice && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doSend();
            }}
            className="relative"
          >
            <div className="flex items-center gap-2 absolute left-3 top-1/2 -translate-y-1/2">
              <label className="cursor-pointer p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-emergency-200 transition" title="Attach a document or image">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,.txt,.pdf,.doc,.docx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFile(f);
                    if (uploadInputRef.current) uploadInputRef.current.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={openLockerPicker}
                title="Attach from Evidence Locker"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-emerald-200 transition"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>
            <textarea
              ref={inputRef}
              value={inputText}
              rows={1}
              onChange={(e) => {
                setInputText(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 140) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (inputText.trim()) void doSend();
                }
              }}
              placeholder={
                language === "hi"
                  ? "सखी से सुरक्षा या कानूनी सलाह के बारे में पूछें..."
                  : language === "hinglish"
                    ? "Koi bhi online threat ya sawaal poochein..."
                    : "Ask Sakhi about online threats, legal options, or emergency steps..."
              }
              className="w-full rounded-2xl bg-slate-900/90 border border-slate-700/80 pl-24 pr-24 py-3.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-1 focus:ring-emergency-500/40 resize-none overflow-y-auto leading-relaxed"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 top-2 px-4 py-2 rounded-xl bg-emergency-600 hover:bg-emergency-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emergency-950/40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>

          {/* Provider & privacy footer */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Reasoning: {providerLabel || providerStatus || "Gemini AI (auto language)"}
            </span>
            <span className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-emerald-500" />
              Memory: non-sensitive preferences only
            </span>
          </div>

          {/* Disclaimer */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
            <HeartHandshake className="w-4 h-4 text-emergency-400 shrink-0 mt-0.5" />
            <span>
              <strong>Important Guidance Note:</strong> Sakhi gives guidance and helps
              preserve evidence. She does not substitute for police emergency response
              (112), professional legal counsel, or medical providers. She never files
              complaints on your behalf.
            </span>
          </div>
        </div>
        </div>
      )}

      {/* Overlays */}
      {newConversationModal}

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

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(s: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(s)) !== null) {
    if (m.index > last) parts.push(escapeHtml(s.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={key++}>{escapeHtml(tok.slice(2, -2))}</strong>
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-slate-800 text-emergency-200 text-[11px]"
        >
          {escapeHtml(tok.slice(1, -1))}
        </code>
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(escapeHtml(s.slice(last)));
  return parts;
}

function RichText({ text }: { text: string }) {
  const blockLines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let key = 0;
  const flushList = (lines: string[], ordered: boolean) => {
    if (lines.length === 0) return;
    blocks.push(
      ordered ? (
        <ol key={key++} className="list-decimal pl-5 my-1.5 space-y-1">
          {lines.map((l, i) => (
            <li key={i}>{renderInline(l)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key++} className="list-disc pl-5 my-1.5 space-y-1">
          {lines.map((l, i) => (
            <li key={i}>{renderInline(l)}</li>
          ))}
        </ul>
      )
    );
  };

  let ulBuf: string[] = [];
  let olBuf: string[] = [];

  for (const rawLine of blockLines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (/^#{1,3}\s/.test(trimmed)) {
      flushList(ulBuf, false);
      ulBuf = [];
      flushList(olBuf, true);
      olBuf = [];
      blocks.push(
        <h4 key={key++} className="font-bold text-white mt-2 mb-1 text-sm">
          {renderInline(trimmed.replace(/^#{1,3}\s/, ""))}
        </h4>
      );
      continue;
    }
    if (/^[-*]\s/.test(trimmed) || /^•\s/.test(trimmed)) {
      flushList(olBuf, true);
      olBuf = [];
      ulBuf.push(trimmed.replace(/^[-*•]\s/, ""));
      continue;
    }
    if (/^\d+[.)]\s/.test(trimmed)) {
      flushList(ulBuf, false);
      ulBuf = [];
      olBuf.push(trimmed.replace(/^\d+[.)]\s/, ""));
      continue;
    }
    flushList(ulBuf, false);
    ulBuf = [];
    flushList(olBuf, true);
    olBuf = [];
    if (!trimmed) continue;
    blocks.push(
      <p key={key++} className="my-1 whitespace-pre-wrap">
        {renderInline(trimmed)}
      </p>
    );
  }
  flushList(ulBuf, false);
  flushList(olBuf, true);

  if (blocks.length === 0) {
    return <p className="whitespace-pre-line">{text}</p>;
  }
  return <div>{blocks}</div>;
}

export default function CompanionPage() {
  return (
    <Suspense fallback={<div className="text-emergency-400 py-10 text-center">Loading Sakhi Companion…</div>}>
      <CompanionContent />
    </Suspense>
  );
}

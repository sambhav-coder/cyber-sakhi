"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Maximize2, X } from "lucide-react";

/* ------------------------------------------------------------------ *
 * Sakhi AI mascot — pinned bottom-right on every app page.
 *
 * On each page entry (reload or client navigation) the mascot pops in,
 * shows a typing indicator, then a greeting bubble that stays put.
 * Clicking the mascot or the bubble opens a compact chat backed by the
 * same /api/chat general-companion endpoint the full /companion page uses.
 * ------------------------------------------------------------------ */

type Phase = "hidden" | "typing" | "greeting";

interface ChatMessage {
  id: string;
  sender: "user" | "sakhi";
  text: string;
}

const SUGGESTIONS = [
  "Is this message a scam?",
  "I shared my OTP by mistake",
  "Someone is threatening to leak my photos",
];

export function SakhiMascot({ size = 56, animated = true }: { size?: number; animated?: boolean }) {
  const uid = React.useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={animated ? "sakhi-mascot-svg" : undefined}
    >
      <defs>
        <clipPath id={id("sakhi-clip")}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
        <radialGradient id={id("sakhi-bg")} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#2a0f14" />
          <stop offset="1" stopColor="#0b0710" />
        </radialGradient>
        <linearGradient id={id("sakhi-hair")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b1a1f" />
          <stop offset="1" stopColor="#140b10" />
        </linearGradient>
      </defs>

      <circle cx="60" cy="60" r="58" fill={`url(#${id("sakhi-bg")})`} stroke="#ef4444" strokeOpacity="0.55" strokeWidth="2" />

      <g clipPath={`url(#${id("sakhi-clip")})`}>
        {/* Shoulders */}
        <path d="M24 122 C26 101 42 93 60 93 C78 93 94 101 96 122 Z" fill="#dc2626" />
        <path d="M50 93 L60 104 L70 93" fill="none" stroke="#fecaca" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" />
        <rect x="53" y="84" width="14" height="12" rx="5" fill="#e8b896" />

        {/* Hair (back) */}
        <path d="M30 64 C28 40 42 27 60 27 C78 27 92 40 90 64 L90 80 C86 74 84 70 84 64 L36 64 C36 70 34 74 30 80 Z" fill={`url(#${id("sakhi-hair")})`} />

        {/* Face */}
        <ellipse cx="60" cy="63" rx="24" ry="26" fill="#f3c9a8" />

        {/* Hair (fringe) + bun */}
        <path d="M35 58 C36 40 47 33 60 33 C74 33 85 41 85 57 C78 49 68 45 56 46 C47 47 40 51 35 58 Z" fill={`url(#${id("sakhi-hair")})`} />
        <circle cx="60" cy="24" r="9" fill={`url(#${id("sakhi-hair")})`} />

        {/* Eyes */}
        <g className="sakhi-eyes">
          <ellipse cx="50" cy="64" rx="3.2" ry="4" fill="#1b1220" />
          <ellipse cx="70" cy="64" rx="3.2" ry="4" fill="#1b1220" />
          <circle cx="51.2" cy="62.6" r="1" fill="#fff" />
          <circle cx="71.2" cy="62.6" r="1" fill="#fff" />
        </g>

        {/* Cheeks + smile */}
        <circle cx="44" cy="72" r="4" fill="#f58f8f" opacity="0.45" />
        <circle cx="76" cy="72" r="4" fill="#f58f8f" opacity="0.45" />
        <path d="M53 75 Q60 81.5 67 75" fill="none" stroke="#8a3434" strokeWidth="2.4" strokeLinecap="round" />

        {/* Headset */}
        <path d="M33 62 C33 42 45 33 60 33 C75 33 87 42 87 62" fill="none" stroke="#ef4444" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="28" y="57" width="9" height="15" rx="4.5" fill="#dc2626" />
        <rect x="83" y="57" width="9" height="15" rx="4.5" fill="#dc2626" />
        <path d="M32 71 C33 80 39 84 47 84" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="48" cy="84" r="2.6" fill="#fca5a5" />
      </g>
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Sakhi is typing">
      <span className="sakhi-dot h-1.5 w-1.5 rounded-full bg-slate-300" />
      <span className="sakhi-dot h-1.5 w-1.5 rounded-full bg-slate-300 [animation-delay:150ms]" />
      <span className="sakhi-dot h-1.5 w-1.5 rounded-full bg-slate-300 [animation-delay:300ms]" />
    </span>
  );
}

export function SakhiMascotWidget() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Replay the entrance on every page entry.
  useEffect(() => {
    setPhase("hidden");
    const t1 = setTimeout(() => setPhase("typing"), 700);
    const t2 = setTimeout(() => setPhase("greeting"), 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || isSending) return;

    setMessages((m) => [...m, { id: `u_${Date.now()}`, sender: "user", text }]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(conversationId ? { conversationId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));

      let reply: string;
      if (res.status === 401) {
        reply = "Please sign in so I can help you properly.";
      } else if (!res.ok) {
        reply = data.error || "I couldn't reach my brain just now. Please try again in a moment.";
      } else {
        reply = data.text || "I'm here. Could you tell me a little more?";
        if (data.context?.conversationId) setConversationId(data.context.conversationId);
      }
      setMessages((m) => [...m, { id: `s_${Date.now()}`, sender: "sakhi", text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: `s_${Date.now()}`, sender: "sakhi", text: "Network error. Check your connection and try again." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // The full companion page already is the chat.
  if (pathname.startsWith("/companion")) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      <style>{WIDGET_CSS}</style>

      {/* Chat panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Chat with Sakhi AI"
          className="sakhi-panel pointer-events-auto flex flex-col w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-2xl border border-white/[0.08] bg-[#0c0a12]/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <SakhiMascot size={36} />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-semibold text-slate-100">Sakhi AI</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online · cyber safety companion
              </div>
            </div>
            <Link
              href="/companion"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              title="Open full chat"
              aria-label="Open full chat"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-200">
              Hey, I&apos;m Sakhi AI. Tell me what happened, or paste a suspicious message,
              and I&apos;ll help you figure out what to do next.
            </div>

            {messages.length === 0 && (
              <div className="flex flex-col items-start gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-[12.5px] px-3 py-1.5 rounded-full border border-red-500/25 text-red-200/90 hover:bg-red-500/10 hover:border-red-500/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) =>
              m.sender === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-red-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div
                  key={m.id}
                  className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap"
                >
                  {m.text}
                </div>
              )
            )}

            {isSending && (
              <div className="inline-flex rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/[0.06] px-3.5 py-3">
                <TypingDots />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="p-3 border-t border-white/[0.06]"
          >
            <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] pl-3 pr-1.5 py-1.5 focus-within:border-red-500/40 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="Message Sakhi…"
                className="flex-1 resize-none bg-transparent py-1.5 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-28"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:bg-white/[0.06] disabled:text-slate-500 transition-colors"
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Greeting bubble + mascot */}
      <div className="flex items-end gap-3">
        {!isOpen && phase !== "hidden" && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="sakhi-bubble pointer-events-auto relative mb-2 max-w-[250px] text-left rounded-2xl rounded-br-md border border-white/[0.08] bg-[#0c0a12]/95 backdrop-blur-xl px-4 py-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] hover:border-red-500/30 transition-colors"
          >
            {phase === "typing" ? (
              <TypingDots />
            ) : (
              <span className="block">
                <span className="sakhi-line block text-[13.5px] font-semibold text-slate-100">
                  Hey, I&apos;m Sakhi AI <span className="sakhi-wave inline-block">👋</span>
                </span>
                <span className="sakhi-line sakhi-line-2 block mt-1 text-[12.5px] leading-snug text-slate-400">
                  Your cyber safety companion. Ask me about scams, blackmail or anything that feels off.
                </span>
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          key={pathname}
          onClick={() => setIsOpen((v) => !v)}
          className="sakhi-launcher pointer-events-auto relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label={isOpen ? "Close Sakhi AI chat" : "Chat with Sakhi AI"}
          aria-expanded={isOpen}
        >
          <span className="absolute inset-0 rounded-full shadow-[0_10px_30px_-8px_rgba(220,38,38,0.55)]" aria-hidden="true" />
          <SakhiMascot size={60} />
          <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-[#0b0710]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const WIDGET_CSS = `
@keyframes sakhi-pop {
  0%   { opacity: 0; transform: translateY(24px) scale(0.6); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.06); }
  80%  { transform: translateY(0) scale(0.98) rotate(-6deg); }
  90%  { transform: rotate(5deg); }
  100% { transform: translateY(0) scale(1) rotate(0); }
}
@keyframes sakhi-bubble-in {
  0%   { opacity: 0; transform: translate(8px, 8px) scale(0.85); }
  100% { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes sakhi-line-in {
  0%   { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes sakhi-wave {
  0%, 60%, 100% { transform: rotate(0); }
  10%, 30% { transform: rotate(16deg); }
  20%, 40% { transform: rotate(-8deg); }
}
@keyframes sakhi-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}
@keyframes sakhi-dot {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
@keyframes sakhi-panel-in {
  0%   { opacity: 0; transform: translateY(12px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.sakhi-launcher { animation: sakhi-pop 900ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.sakhi-bubble { transform-origin: bottom right; animation: sakhi-bubble-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.sakhi-line { animation: sakhi-line-in 360ms ease-out both; }
.sakhi-line-2 { animation-delay: 140ms; }
.sakhi-wave { transform-origin: 70% 80%; animation: sakhi-wave 1.8s ease-in-out 200ms 2; }
.sakhi-mascot-svg .sakhi-eyes { transform-box: fill-box; transform-origin: center; animation: sakhi-blink 4.5s infinite; }
.sakhi-dot { animation: sakhi-dot 1s ease-in-out infinite; }
.sakhi-panel { transform-origin: bottom right; animation: sakhi-panel-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .sakhi-launcher, .sakhi-bubble, .sakhi-line, .sakhi-wave, .sakhi-panel,
  .sakhi-mascot-svg .sakhi-eyes, .sakhi-dot { animation: none !important; }
}
`;

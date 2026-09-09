"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ShieldCheck,
  Fingerprint,
  Sparkles,
  Lock,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Sakhi ID hero.
 *
 * The greeting column is Sambhav's, unchanged. The ID card is rebuilt:
 *
 *  - The ID is split into a muted prefix and the 5-char code that is
 *    actually unique. That gives it hierarchy and, more importantly,
 *    fixes the width permanently: only 5 characters ever vary, so the
 *    number can no longer outgrow its container.
 *  - The mask uses exactly 5 dots, so toggling never reflows the card.
 *  - One soft gradient instead of gradient + two blur glows + diagonal
 *    stripes + inset highlight, so the ID is the brightest thing on it.
 * ------------------------------------------------------------------ */

export const SakhiHero: React.FC = () => {
  const { data: session } = useSession();
  const [sakhiVisible, setSakhiVisible] = useState(true);
  const [sakhiCopied, setSakhiCopied] = useState(false);

  const userName = session?.user?.name || "Sakhi User";
  const sakhiNumber = session?.user?.sakhiNumber || "SAKHI-2026-LOADING";
  const isAdmin = session?.user?.role === "ADMIN";

  // "SAKHI-2026-DEV02" -> prefix "SAKHI-2026-", code "DEV02"
  const segments = sakhiNumber.split("-");
  const hasPrefix = segments.length >= 3;
  const idPrefix = hasPrefix ? `${segments.slice(0, -1).join("-")}-` : "";
  const idCode = hasPrefix ? segments[segments.length - 1] : sakhiNumber;

  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Late night check-in"
      : hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : hour < 21
      ? "Good evening"
      : "Good night, stay safe";

  const onCopySakhi = async () => {
    try {
      await navigator.clipboard.writeText(sakhiNumber);
      setSakhiCopied(true);
      setTimeout(() => setSakhiCopied(false), 1800);
    } catch {
      /* clipboard blocked; the ID stays on screen to copy by hand */
    }
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-6 sm:p-8 md:p-10 border"
      style={{
        background:
          "linear-gradient(135deg, rgba(127, 29, 29, 0.35) 0%, rgba(5, 5, 10, 0.8) 45%, rgba(5, 5, 10, 0.9) 100%)",
        borderColor: "rgba(239, 68, 68, 0.22)",
        boxShadow: "0 30px 70px -40px rgba(220, 38, 38, 0.7)",
      }}
    >
      <div
        className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(220, 38, 38, 0.55), rgba(127, 29, 29, 0.15) 60%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
        {/* Left: Greeting + safety status (Sambhav's, unchanged) */}
        <div className="flex-1 min-w-0 space-y-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10.5px] font-bold tracking-[0.18em] uppercase border"
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              borderColor: "rgba(16, 185, 129, 0.35)",
              color: "#a7f3d0",
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            All Systems Protected
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
              {greeting},{" "}
              <span className="text-crimson-gradient">
                {userName.split(" ")[0]}
              </span>
              .
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300/90 leading-relaxed max-w-xl">
              Your safety console is ready. Today is a great day to stay one step
              ahead of phishing, blackmail, and financial scams. Save anything
              suspicious to the{" "}
              <Link
                href="/locker"
                className="text-emergency-300 underline underline-offset-2 decoration-emergency-500/40 hover:text-emergency-200"
              >
                Evidence Locker
              </Link>{" "}
              — chain of custody protects every screenshot.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-white/5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-semibold">NextAuth Secure</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-white/5 text-[11px]">
              <Sparkles className="w-3 h-3 text-emergency-400" />
              <span className="text-slate-300 font-semibold">Sakhi AI Online</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-white/5 text-[11px]">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span className="text-slate-300 font-semibold">AES-256 Vault</span>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-300 font-bold hover:bg-amber-950/80 transition"
              >
                <ShieldAlert className="w-3 h-3" />
                Admin Incident Portal →
              </Link>
            )}
          </div>
        </div>

        {/* Right: the ID credential */}
        <div className="w-full lg:w-[360px] shrink-0">
          <div className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-sm overflow-hidden">
            {/* Header strip */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.07] bg-white/[0.02]">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-emergency-300">
                <Fingerprint className="w-3.5 h-3.5" />
                Your Sakhi ID
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setSakhiVisible((v) => !v)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition"
                  aria-label={sakhiVisible ? "Mask Sakhi Number" : "Reveal Sakhi Number"}
                  title={sakhiVisible ? "Mask" : "Reveal"}
                >
                  {sakhiVisible ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onCopySakhi}
                  className={`p-1.5 rounded-md transition ${
                    sakhiCopied
                      ? "text-emerald-300 bg-emerald-500/15"
                      : "text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                  aria-label="Copy Sakhi Number"
                  title="Copy"
                >
                  {sakhiCopied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* The ID itself */}
            <div className="px-4 py-4">
              <div className="font-mono leading-none flex items-baseline gap-[0.1em] flex-wrap">
                <span className="text-sm sm:text-base text-slate-500 tracking-[0.06em]">
                  {idPrefix}
                </span>
                <span
                  className="text-2xl sm:text-3xl font-black text-white tracking-[0.08em] tabular-nums"
                  style={{ textShadow: "0 0 24px rgba(248, 113, 113, 0.45)" }}
                >
                  {sakhiVisible ? idCode : "•".repeat(idCode.length)}
                </span>
              </div>

              <p className="mt-2.5 text-[11px] text-slate-400 leading-snug">
                {sakhiCopied ? (
                  <span className="text-emerald-300 font-semibold inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Copied to clipboard
                  </span>
                ) : (
                  "Quote this when you sign in, call a helpline, or file a complaint."
                )}
              </p>
            </div>

            {/* Identity footer */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-3 border-t border-white/[0.07] bg-white/[0.02]">
              <div className="min-w-0">
                <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  Registered to
                </div>
                <div
                  className="text-xs font-semibold text-slate-200 truncate"
                  title={userName}
                >
                  {userName}
                </div>
              </div>
              <span
                className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-md border shrink-0 ${
                  isAdmin
                    ? "text-amber-300 border-amber-500/40 bg-amber-950/50"
                    : "text-emerald-300 border-emerald-500/40 bg-emerald-950/50"
                }`}
              >
                {isAdmin ? "ADMIN" : "STANDARD"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  MessageSquare,
  Search,
  Lock,
  Mail,
  Users,
  Code,
  AlertTriangle,
  ShieldCheck,
  Fingerprint,
  MapPin,
  Phone,
  CalendarDays,
  Sparkles,
  ExternalLink,
  ArrowRight,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  getStoredProfileDraft,
  ExtendedProfileDraft,
} from "@/lib/storage";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

interface QuickAccessTile {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "secondary" | "warning" | "success" | "info" | "calm";
  badge?: string;
}

const quickAccess: QuickAccessTile[] = [
  {
    href: "/companion",
    label: "Sakhi AI",
    description: "Talk to your AI safety companion — private short-term memory conversation",
    icon: MessageSquare,
    accent: "primary",
    badge: "AI",
  },
  {
    href: "/detector",
    label: "Threat Detector",
    description: "Paste a suspicious message, UPI link, or SMS — instant risk scoring",
    icon: Search,
    accent: "warning",
  },
  {
    href: "/locker",
    label: "Evidence Locker",
    description: "Encrypted evidence vault with SHA-256 chain of custody",
    icon: Lock,
    accent: "success",
  },
  {
    href: "/email-forensics",
    label: "Email Forensics",
    description: "Deep header analysis + Gmail integration for phishing investigation",
    icon: Mail,
    accent: "info",
  },
  {
    href: "/contacts",
    label: "Trusted Contacts",
    description: "Manage emergency SMS recipients for VoiceShield SOS dispatch",
    icon: Users,
    accent: "calm",
  },
  {
    href: "/developer",
    label: "SDK & API",
    description: "Documentation & endpoints for evidence integrations",
    icon: Code,
    accent: "secondary",
  },
];

const accentStyles: Record<
  QuickAccessTile["accent"],
  { iconWrap: string; icon: string; border: string; accentBar: string }
> = {
  primary: {
    iconWrap:
      "bg-gradient-to-br from-emergency-500/25 to-emergency-800/25 border-emergency-500/50",
    icon: "text-emergency-300",
    border: "hover:border-emergency-500/50",
    accentBar: "from-emergency-500 to-red-500",
  },
  warning: {
    iconWrap:
      "bg-gradient-to-br from-amber-500/25 to-orange-700/25 border-amber-500/50",
    icon: "text-amber-300",
    border: "hover:border-amber-500/40",
    accentBar: "from-amber-500 to-orange-500",
  },
  success: {
    iconWrap:
      "bg-gradient-to-br from-emerald-500/25 to-green-700/25 border-emerald-500/50",
    icon: "text-emerald-300",
    border: "hover:border-emerald-500/40",
    accentBar: "from-emerald-500 to-green-500",
  },
  info: {
    iconWrap:
      "bg-gradient-to-br from-sky-500/25 to-blue-700/25 border-sky-500/50",
    icon: "text-sky-300",
    border: "hover:border-sky-500/40",
    accentBar: "from-sky-500 to-blue-500",
  },
  calm: {
    iconWrap:
      "bg-gradient-to-br from-violet-500/25 to-fuchsia-700/25 border-violet-500/50",
    icon: "text-violet-300",
    border: "hover:border-violet-500/40",
    accentBar: "from-violet-500 to-fuchsia-500",
  },
  secondary: {
    iconWrap:
      "bg-gradient-to-br from-slate-500/25 to-slate-700/25 border-slate-500/50",
    icon: "text-slate-200",
    border: "hover:border-slate-500/40",
    accentBar: "from-slate-400 to-slate-600",
  },
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [draft, setDraft] = useState<ExtendedProfileDraft | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sakhiVisible, setSakhiVisible] = useState(true);
  const [sakhiCopied, setSakhiCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDraft(getStoredProfileDraft());
    } catch {
      /* silent */
    }
  }, []);

  const userName = session?.user?.name || "Sakhi User";
  const userEmail = session?.user?.email || "";
  const sakhiNumber = session?.user?.sakhiNumber || "SAKHI-2026-LOADING";
  const isAdmin = session?.user?.role === "ADMIN";

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
      /* silent */
    }
  };

  // Loading skeleton
  if (status === "loading" || !mounted) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-40 rounded-3xl bg-black/40 border border-white/5" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-black/40 border border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7 sm:space-y-9 animate-fade-in-up">
      {/* =========================================================
          HERO — SAKHI NUMBER PROMINENT
          ========================================================= */}
      <section
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 md:p-10 border"
        style={{
          background:
            "linear-gradient(135deg, rgba(127, 29, 29, 0.35) 0%, rgba(5, 5, 10, 0.8) 45%, rgba(5, 5, 10, 0.9) 100%)",
          borderColor: "rgba(239, 68, 68, 0.22)",
          boxShadow: "0 30px 70px -40px rgba(220, 38, 38, 0.7)",
        }}
      >
        {/* Background glow */}
        <div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(220, 38, 38, 0.55), rgba(127, 29, 29, 0.15) 60%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full blur-3xl opacity-40 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(16, 185, 129, 0.35), transparent 65%)",
          }}
        />
        {/* stripes */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(120deg, rgba(248,113,113,0.6) 0 2px, transparent 2px 16px)",
          }}
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
          {/* Left: Greeting + safety status */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10.5px] font-bold tracking-[0.18em] uppercase border"
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
                Your safety console is ready. Today is a great day to stay one step ahead of
                phishing, blackmail, and financial scams. Save anything suspicious to the{" "}
                <Link href="/locker" className="text-emergency-300 underline underline-offset-2 decoration-emergency-500/40 hover:text-emergency-200">
                  Evidence Locker
                </Link>{" "}
                — chain of custody protects every screenshot.
              </p>
            </div>

            {/* Status chips */}
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

          {/* Right: Sakhi Number card */}
          <div
            className="w-full lg:w-[380px] shrink-0 rounded-3xl p-5 sm:p-6 relative overflow-hidden"
            style={{
              background:
                "linear-gradient(160deg, rgba(239, 68, 68, 0.22) 0%, rgba(127, 29, 29, 0.3) 40%, rgba(5, 5, 10, 0.85) 100%)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              boxShadow:
                "inset 0 1px 0 rgba(254, 202, 202, 0.15), 0 20px 50px -25px rgba(220, 38, 38, 0.8)",
            }}
          >
            {/* Diagonal stripes */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.1]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(248, 113, 113, 0.7) 0 2px, transparent 2px 14px)",
              }}
            />
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-[0.22em] uppercase text-white"
                  style={{
                    background: "linear-gradient(135deg, #7f1d1d, #ef4444)",
                  }}
                >
                  <Fingerprint className="w-3 h-3" />
                  Your Sakhi ID
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSakhiVisible((v) => !v)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
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
                    className={cn(
                      "p-1.5 rounded-lg transition",
                      sakhiCopied
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                        : "hover:bg-white/10 text-slate-300 hover:text-white border border-transparent"
                    )}
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

              {/* Big number */}
              <div
                className="rounded-2xl p-4 sm:p-5 border border-white/5"
                style={{ background: "rgba(0, 0, 0, 0.55)" }}
              >
                <div className="text-[10px] tracking-[0.2em] uppercase text-slate-400 font-bold mb-1.5">
                  Use this every time you sign in
                </div>
                <div
                  className="font-mono font-black tracking-[0.12em] text-white whitespace-nowrap text-xl sm:text-2xl md:text-3xl"
                  style={{ textShadow: "0 0 28px rgba(248, 113, 113, 0.6)" }}
                >
                  {sakhiVisible ? (
                    sakhiNumber
                  ) : (
                    <span className="tracking-[0.3em] text-slate-500">●●●●●●●●●●●●●●●●●</span>
                  )}
                </div>
                {sakhiCopied && (
                  <div className="mt-2 text-[11px] text-emerald-300 font-semibold flex items-center gap-1.5 animate-fade-in-up">
                    <Check className="w-3.5 h-3.5" /> Sakhi Number copied to clipboard
                  </div>
                )}
              </div>

              {/* Email + account */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 min-w-0">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 font-bold mb-0.5">
                    Name
                  </div>
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    {userName}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 min-w-0">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 font-bold mb-0.5">
                    {isAdmin ? "Account" : "Role"}
                  </div>
                  <div className="text-xs font-bold tracking-wide">
                    {isAdmin ? (
                      <span className="text-amber-300">ADMIN</span>
                    ) : (
                      <span className="text-emerald-300">STANDARD USER</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          QUICK ACCESS — 6 TILES
          ========================================================= */}
      <section>
        <div className="flex items-end justify-between mb-5 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Quick <span className="text-crimson-gradient">Access</span>
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Jump straight into the Cyber Sakhi tools you use the most.
            </p>
          </div>
          <Link
            href="/companion"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-emergency-400 hover:text-emergency-300 transition"
          >
            Talk to Sakhi AI <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {quickAccess.map((tile, idx) => {
            const Icon = tile.icon;
            const styles = accentStyles[tile.accent];
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className={cn(
                  "group relative p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-1 flex flex-col gap-4 overflow-hidden",
                  "bg-black/45 border-white/5 backdrop-blur",
                  styles.border,
                  "hover:shadow-[0_25px_55px_-30px_rgba(220,38,38,0.7)]"
                )}
                style={{ animation: `fadeInUp 0.6s ease-out both`, animationDelay: `${80 + idx * 70}ms` }}
              >
                {/* Accent bar */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b opacity-80",
                    styles.accentBar
                  )}
                />

                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center border shrink-0",
                      styles.iconWrap
                    )}
                  >
                    <Icon className={cn("w-5 h-5", styles.icon)} />
                  </div>
                  {tile.badge && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black tracking-[0.16em] uppercase"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(220, 38, 38, 0.35), rgba(127, 29, 29, 0.35))",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        color: "#fecaca",
                      }}
                    >
                      {tile.badge}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 text-white font-bold text-[15px] tracking-wide">
                    {tile.label}
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emergency-400 group-hover:translate-x-0.5 transition" />
                  </div>
                  <p className="text-[12px] leading-relaxed text-slate-400">
                    {tile.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* =========================================================
          SOS CARD + PROFILE SUMMARY (2-column)
          ========================================================= */}
      <section className="grid lg:grid-cols-5 gap-4 sm:gap-5">
        {/* SOS */}
        <Link
          href="/sos"
          className="lg:col-span-2 relative overflow-hidden rounded-3xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1"
          style={{
            background:
              "linear-gradient(135deg, #b91c1c 0%, #dc2626 45%, #991b1b 100%)",
            border: "1px solid rgba(254, 202, 202, 0.25)",
            boxShadow:
              "0 25px 60px -25px rgba(220, 38, 38, 0.85), inset 0 1px 0 rgba(255,255,255,0.18)",
            clipPath:
              "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
          }}
        >
          {/* Pulse halo */}
          <div
            aria-hidden
            className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-3xl opacity-70 pointer-events-none animate-pulse"
            style={{ background: "radial-gradient(circle, rgba(254,202,202,0.6), transparent 70%)" }}
          />
          {/* stripes */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(120deg, rgba(255,255,255,1) 0 2px, transparent 2px 14px)",
            }}
          />

          <div className="relative space-y-4">
            <div className="flex items-start justify-between">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center border animate-pulse"
                style={{
                  background: "rgba(127, 29, 29, 0.4)",
                  borderColor: "rgba(254, 202, 202, 0.35)",
                }}
              >
                <AlertTriangle className="w-7 h-7 text-white" />
              </div>
              <ExternalLink className="w-4 h-4 text-white/60" />
            </div>

            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                VoiceShield Emergency
              </h3>
              <p className="mt-1 text-sm text-red-100/90 leading-relaxed">
                1-TAP SOS beacon. Triggers trusted contact SMS with live location + opens 112 dialer.
                Record ambient evidence, save to chain of custody automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-[11px] font-bold text-white">
                🚨 <span>Instant SMS Blast</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-[11px] font-bold text-white">
                📍 <span>Live Location</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-[11px] font-bold text-white">
                🎙️ <span>Ambient Audio</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                Tap to open SOS Console <ArrowRight className="w-4 h-4" />
              </span>
              <div className="flex items-center gap-1 text-[11px] text-red-100/80">
                <Phone className="w-3.5 h-3.5" />
                <span className="font-bold tracking-wider">112 · 181 · 1930</span>
              </div>
            </div>
          </div>
        </Link>

        {/* Profile summary */}
        <div
          className="lg:col-span-3 rounded-3xl p-5 sm:p-7 border relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(10, 10, 22, 0.85), rgba(5, 5, 10, 0.85))",
            border: "1px solid rgba(239, 68, 68, 0.16)",
          }}
        >
          {/* Decoration */}
          <div
            aria-hidden
            className="absolute -top-10 right-0 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(220, 38, 38, 0.35), transparent 70%)",
            }}
          />

          <div className="relative flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar + name */}
            <div className="flex items-center gap-4 sm:gap-5">
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #ef4444 100%)",
                  boxShadow: "0 15px 40px -15px rgba(220, 38, 38, 0.8)",
                }}
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Your Safety Profile
                </h3>
                <p className="mt-1 text-sm text-slate-400 max-w-md">
                  Used by Cyber Sakhi during an SOS to help responders reach you faster. Update
                  anytime — stored client-side with SHA-256 integrity.
                </p>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 grid grid-cols-2 gap-3 pt-1 min-w-0">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  <Mail className="w-3 h-3" /> Email
                </div>
                <div className="text-sm text-slate-200 font-semibold truncate">
                  {userEmail || "Not registered"}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  <Fingerprint className="w-3 h-3" /> Sakhi ID
                </div>
                <div className="text-sm font-mono font-bold tracking-wide truncate"
                  style={{ color: "#fca5a5" }}
                >
                  {sakhiNumber}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  <CalendarDays className="w-3 h-3" /> Age
                </div>
                <div className="text-sm text-slate-200 font-semibold">
                  {draft?.age ? `${draft.age} yrs` : <span className="text-slate-500">—</span>}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  <MapPin className="w-3 h-3" /> City
                </div>
                <div className="text-sm text-slate-200 font-semibold truncate">
                  {draft?.city || <span className="text-slate-500">—</span>}
                </div>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">
                  <Phone className="w-3 h-3" /> Emergency Contact
                </div>
                <div className="text-sm text-slate-200 font-semibold">
                  {draft?.phone || (
                    <span className="text-slate-500">
                      Add a trusted number in{" "}
                      <Link href="/contacts" className="underline decoration-emergency-500/40 text-slate-400 hover:text-emergency-300">
                        Contacts
                      </Link>{" "}
                      for fast SOS dispatch
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          SECURITY TIPS BANNER (info)
          ========================================================= */}
      <section
        className="rounded-3xl p-5 sm:p-7 border flex flex-col md:flex-row md:items-center gap-5 justify-between overflow-hidden relative"
        style={{
          background:
            "linear-gradient(135deg, rgba(6, 78, 59, 0.25) 0%, rgba(5, 5, 10, 0.8) 70%)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
        }}
      >
        <div
          aria-hidden
          className="absolute -bottom-14 -right-14 w-52 h-52 rounded-full blur-3xl opacity-50 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.35), transparent 70%)",
          }}
        />
        <div className="relative flex items-start gap-4">
          <div
            className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #059669, #047857)",
              boxShadow: "0 10px 25px -10px rgba(16, 185, 129, 0.7)",
            }}
          >
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-white tracking-tight">
              Today's 30-second safety tip
            </h3>
            <p className="text-sm text-slate-300/90 leading-relaxed max-w-2xl">
              If anyone calls claiming to be{" "}
              <strong className="text-white">delivery/customer care</strong> and says "enter your
              UPI PIN to receive ₹1 refund" —{" "}
              <strong className="text-emerald-300">hang up immediately</strong>. Receiving money
              NEVER requires a PIN. If you've been tricked, call{" "}
              <strong className="text-emergency-300 font-bold">1930</strong> within 60 minutes —
              UPI frauds are usually reversible.
            </p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <a
            href="tel:1930"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #b91c1c, #ef4444)",
              boxShadow: "0 10px 25px -10px rgba(220, 38, 38, 0.75)",
            }}
          >
            <Phone className="w-3.5 h-3.5" /> 🇮🇳 Call 1930 (Cyber)
          </a>
          <Link
            href="/detector"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-100 border border-white/10 bg-black/40 hover:bg-white/5 transition"
          >
            <Search className="w-3.5 h-3.5" /> Run a Threat Scan
          </Link>
        </div>
      </section>

      {/* Footer brand (small) */}
      <section className="flex items-center justify-between border-t border-white/5 pt-6 mt-2">
        <BrandLogo size={26} animated={false} />
        <span className="text-[11px] text-slate-600 tracking-wide">
          Cyber Sakhi · Built trust-first · End-to-end encrypted safety
        </span>
      </section>
    </div>
  );
}

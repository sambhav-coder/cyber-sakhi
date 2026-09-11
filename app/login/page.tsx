"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  KeyRound,
  UserCheck,
  ShieldAlert,
  Fingerprint,
  Copy,
  Check,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(
    registered ? "Account created successfully! Please sign in." : null
  );
  const [sakhiCopied, setSakhiCopied] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    try {
      const res = await signIn("credentials", {
        identifier: identifier.trim(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setErrorMessage("Invalid credentials.");
      } else if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage("Invalid credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const fillCredentials = (demoIdentifier: string, demoPass: string) => {
    setIdentifier(demoIdentifier);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
      {/* Ambient bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(220, 38, 38, 0.28), transparent 65%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(127, 29, 29, 0.35), transparent 65%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
        }}
      />
      {/* Film grain */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
        {/* Top back link */}
        <div className="flex justify-between items-center -mt-2 mb-1">
          <Link
            href="/"
            className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide flex items-center gap-1.5"
          >
            <ArrowRight className="w-3 h-3 rotate-180" />
            Back to Home
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-emergency-300 transition-colors"
          >
            <Lock className="w-3 h-3" />
            Admin
          </Link>
        </div>

        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="relative inline-flex mb-2">
            <div
              className="absolute -inset-5 rounded-full blur-3xl opacity-60 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(239, 68, 68, 0.55), rgba(185, 28, 28, 0.2) 55%, transparent 70%)",
              }}
            />
            <img
              src="/assets/cyber-sakhi-logo.png"
              alt="Cyber Sakhi Logo"
              className="relative w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_0_25px_rgba(239,68,68,0.6)]"
              style={{ background: "transparent", mixBlendMode: "screen" }}
              draggable={false}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            <span className="text-white">Welcome back to </span>
            <span className="text-crimson-gradient">Cyber Sakhi</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            Login with your <span className="text-emergency-300 font-semibold">Sakhi Number</span> or email. Your safety vault & evidence chain are waiting.
          </p>
        </div>

        {/* Main Card */}
        <div className="p-6 sm:p-8 rounded-3xl glass-panel space-y-5"
          style={{
            border: "1px solid rgba(239, 68, 68, 0.18)",
            boxShadow:
              "0 30px 80px -40px rgba(0,0,0,0.9), 0 0 60px -30px rgba(220, 38, 38, 0.35)",
          }}
        >
          {/* Success Banner (registered=true from signup) */}
          {successBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in-up">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successBanner}</span>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 animate-fade-in-up">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleCredentialsLogin} className="space-y-4 text-xs">
            {/* Identifier */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emergency-400" />
                Sakhi Number
              </label>
              <div className="relative">
                <Fingerprint className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="SAKHI-2026-XXXXX"
                  className="w-full rounded-xl bg-black/50 border border-slate-700/80 pl-11 pr-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                />
              </div>
              <p className="text-[10px] text-slate-500 pl-0.5 tracking-wide">
                🔒 Use the Sakhi Number you received at signup — e.g. SAKHI-2026-AB12X
              </p>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emergency-400" />
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500 opacity-50" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-black/50 border border-slate-700/80 pl-11 pr-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !identifier.trim() || !password}
              className="w-full py-3.5 px-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                boxShadow:
                  "0 15px 40px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
              }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
                  />
                  Authenticating...
                </span>
              ) : (
                <>
                  <span>Sign In Securely</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Forgot credentials link */}
          <div className="text-center -mt-1">
            <Link
              href="/recover"
              className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide underline decoration-emergency-500/30 underline-offset-4"
            >
              Forgot your Sakhi Number &amp; Password?
            </Link>
          </div>

          {/* Confidentiality Note */}
          <div
            className="p-3.5 rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(127, 29, 29, 0.22), rgba(5, 5, 10, 0.4))",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <div className="flex gap-2.5 items-start">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[10.5px] text-slate-400 leading-relaxed">
                Your credentials are never logged. Authentication is routed through NextAuth secure sessions; evidence vault uses client-side AES-256-GCM + SHA-256 integrity chain.
              </div>
            </div>
          </div>

          {/* Demo Fast-Fill Box */}
          <div
            className="p-3.5 rounded-2xl space-y-2.5 text-[11px]"
            style={{
              background:
                "linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(30, 41, 59, 0.35))",
              border: "1px solid rgba(239, 68, 68, 0.15)",
            }}
          >
            <div className="font-bold text-emergency-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emergency-400" />
              <span>Hackathon Quick-Demo Personas</span>
              <button
                type="button"
                onClick={() => {
                  const sample = "SAKHI-2026-D3M01";
                  navigator.clipboard?.writeText(sample).catch(() => {});
                  setSakhiCopied(true);
                  setTimeout(() => setSakhiCopied(false), 1800);
                }}
                className="ml-auto flex items-center gap-1 text-slate-400 hover:text-emergency-300 transition-colors"
                title="Copy sample Sakhi Number format"
              >
                {sakhiCopied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span className="tracking-wide">{sakhiCopied ? "Copied" : "SAKHI-2026-XXXXX"}</span>
              </button>
            </div>
            <div className="text-[10px] text-slate-500 leading-snug">
              <span className="text-slate-400">Backward-compat note:</span> Pre-registered demo accounts still accept their original email identifiers. Newly created accounts <span className="text-emergency-300 font-semibold">must</span> use their Sakhi Number.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials("admin@cybersakhi.org", "Admin@Sakhi2026!")}
                className="p-2.5 rounded-xl bg-black/60 hover:bg-emergency-950/40 border border-emergency-600/30 text-left transition flex items-center gap-2.5"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-100 text-[11.5px]">Admin Account</div>
                  <div className="text-[10px] text-slate-500 tracking-wide">Full RBAC · /admin panel</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials("user@cybersakhi.org", "User@Sakhi2026!")}
                className="p-2.5 rounded-xl bg-black/60 hover:bg-slate-800/60 border border-slate-700 text-left transition flex items-center gap-2.5"
              >
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-100 text-[11.5px]">User Account</div>
                  <div className="text-[10px] text-slate-500 tracking-wide">Standard USER · All features</div>
                </div>
              </button>
            </div>
          </div>

          {/* Switch to Signup */}
          <div className="text-center pt-2 text-xs text-slate-400 flex flex-col gap-1.5">
            <div>
              <span className="text-slate-500">New user? </span>
              <Link
                href={`/signup${callbackUrl !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
                className="text-emergency-400 hover:text-emergency-300 font-bold tracking-wide underline decoration-emergency-500/40 underline-offset-4"
              >
                Create Your Free Sakhi Account →
              </Link>
            </div>
            <div className="text-[10px] text-slate-600 tracking-wide">
              You will receive a unique <span className="text-slate-400 font-semibold">Sakhi Number</span> upon successful registration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-emergency-400 text-sm">
          Loading authentication...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

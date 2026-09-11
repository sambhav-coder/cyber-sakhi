"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import {
  ArrowRight,
  Mail,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Copy,
  Check,
  Fingerprint,
  Loader2,
  Lock,
  UserCheck,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

function RecoverFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token");

  // Security guard: password recovery is meaningless for a logged-in user and
  // could reset the wrong account. Show a clear state instead of the form.
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        if (!cancelled && session?.user?.id) setAlreadyLoggedIn(true);
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setAuthCheckDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(urlToken);
  const [isVerifying, setIsVerifying] = useState(Boolean(urlToken));
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [sakhiNumber, setSakhiNumber] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (!urlToken) return;
    setToken(urlToken);
    setLookupError(null);
    setSakhiNumber(null);
    setResetSuccess(false);

    const verify = async () => {
      setIsVerifying(true);
      try {
        const res = await fetch("/api/auth/recover/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: urlToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLookupError(data.error || "This recovery link is invalid or has expired.");
        } else {
          setSakhiNumber(data.sakhiNumber);
        }
      } catch {
        setLookupError("Something went wrong. Please try again.");
      } finally {
        setIsVerifying(false);
      }
    };
    verify();
  }, [urlToken]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setSentEmail(null);
    setDevLink(null);

    if (alreadyLoggedIn) {
      setEmailError(
        "You are already logged in. Use the Change Password screen instead of account recovery."
      );
      return;
    }

    if (!email.trim()) {
      setEmailError("Enter your registered email address.");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Something went wrong. Please try again.");
      } else {
        setSentEmail(data.message);
        setDevLink(data.devLink || null);
      }
    } catch {
      setEmailError("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!newPassword || !confirmPassword) {
      setResetError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("New passwords do not match.");
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch("/api/auth/recover/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || "Something went wrong. Please try again.");
      } else {
        setResetSuccess(true);
      }
    } catch {
      setResetError("Something went wrong. Please try again.");
    } finally {
      setIsResetting(false);
    }
  };

  const copySakhi = () => {
    if (!sakhiNumber) return;
    navigator.clipboard?.writeText(sakhiNumber).catch(() => {});
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1800);
  };

  if (authCheckDone && alreadyLoggedIn && !urlToken) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(220, 38, 38, 0.28), transparent 65%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(127, 29, 29, 0.35), transparent 65%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
          }}
        />
        <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="flex justify-start items-center -mt-2 mb-1">
            <Link
              href="/"
              className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide flex items-center gap-1.5"
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              Back to Home
            </Link>
          </div>

          <div
            className="p-6 sm:p-8 rounded-3xl glass-panel space-y-5 text-center"
            style={{
              border: "1px solid rgba(239, 68, 68, 0.25)",
              boxShadow:
                "0 30px 80px -40px rgba(0,0,0,0.9), 0 0 60px -30px rgba(220, 38, 38, 0.5)",
            }}
          >
            <div
              className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #052e2b 0%, #065f46 60%, #047857 100%)",
              }}
            >
              <UserCheck className="w-9 h-9 text-emerald-300" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              You are already logged in.
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Account recovery is for signed-out users. Since you&apos;re signed
              in, use the Change Password screen to update your password safely.
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => router.push("/change-password")}
                className="w-full py-3.5 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                  boxShadow:
                    "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <KeyRound className="w-4 h-4" />
                Change Password
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                Go to Dashboard
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut({ redirect: false });
                  router.push("/recover");
                  router.refresh();
                }}
                className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out / use another account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
      {/* Ambient bg (same visual language as the login page) */}
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
        <div className="flex justify-start items-center -mt-2 mb-1">
          <Link
            href="/"
            className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide flex items-center gap-1.5"
          >
            <ArrowRight className="w-3 h-3 rotate-180" />
            Back to Home
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
            <span className="text-white">Recover </span>
            <span className="text-crimson-gradient">Cyber Sakhi</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            Recover your Sakhi Number and set a new password using your registered email.
          </p>
        </div>

        {/* Main Card */}
        <div
          className="p-6 sm:p-8 rounded-3xl glass-panel space-y-5"
          style={{
            border: "1px solid rgba(239, 68, 68, 0.18)",
            boxShadow:
              "0 30px 80px -40px rgba(0,0,0,0.9), 0 0 60px -30px rgba(220, 38, 38, 0.35)",
          }}
        >
          {resetSuccess ? (
            /* Success state */
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <ShieldCheck className="w-12 h-12 text-emerald-400" />
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Your credentials have been recovered. You can now sign in using your Sakhi Number and new password.
                </span>
              </div>
              <Link
                href="/login"
                className="w-full py-3.5 px-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                  boxShadow:
                    "0 15px 40px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                Go to Login
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : isVerifying ? (
            /* Verifying recovery token */
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="w-6 h-6 text-emergency-400 animate-spin" />
              <p className="text-xs text-slate-400">Verifying your recovery link...</p>
            </div>
          ) : lookupError ? (
            /* Token lookup failed */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{lookupError}</span>
              </div>
              <Link
                href="/recover"
                onClick={() => {
                  setLookupError(null);
                  setToken(null);
                }}
                className="text-xs text-emergency-400 hover:text-emergency-300 font-bold tracking-wide underline decoration-emergency-500/40 underline-offset-4"
              >
                Request a new recovery link
              </Link>
            </div>
          ) : sakhiNumber ? (
            /* Verified: show Sakhi Number + set new password */
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5 text-xs">
                  <Fingerprint className="w-3.5 h-3.5 text-emergency-400" />
                  Your Sakhi Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={sakhiNumber}
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 pl-11 pr-24 py-3 text-sm text-white focus:outline-none"
                  />
                  <Fingerprint className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                  <button
                    type="button"
                    onClick={copySakhi}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] text-emergency-300 hover:text-emergency-200 transition-colors px-2.5 py-1.5 rounded-lg border border-emergency-600/40"
                  >
                    {copyState === "copied" ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copyState === "copied" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 pl-0.5 tracking-wide">
                  Use this Sakhi Number with your new password to sign in.
                </p>
              </div>

              <form onSubmit={handleReset} className="space-y-4 text-xs">
                {resetError && (
                  <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emergency-400" />
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                  <p className="text-[10px] text-slate-500 pl-0.5 tracking-wide">
                    At least 8 characters with uppercase, lowercase, number &amp; special character.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emergency-400" />
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResetting || !newPassword || !confirmPassword}
                  className="w-full py-3.5 px-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                    boxShadow:
                      "0 15px 40px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                    clipPath:
                      "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                  }}
                >
                  {isResetting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Saving new password...
                    </span>
                  ) : (
                    <>Save Password</>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Email request step */
            <div className="space-y-5">
              {sentEmail ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{sentEmail}</span>
                  </div>
                  {devLink && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-slate-500 tracking-wide">
                        Development build — email delivery is not configured. Use this local
                        recovery link to continue (this is never shown in production):
                      </p>
                      <Link
                        href={devLink}
                        className="text-[11px] text-emergency-300 hover:text-emergency-200 font-semibold tracking-wide underline decoration-emergency-500/40 underline-offset-4 break-all"
                      >
                        {devLink}
                      </Link>
                    </div>
                  )}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSentEmail(null);
                        setDevLink(null);
                        setEmail("");
                      }}
                      className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide"
                    >
                      ← Try a different email
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequest} className="space-y-4 text-xs">
                  {emailError && (
                    <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{emailError}</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-emergency-400" />
                      Registered Email
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSending || !email.trim()}
                    className="w-full py-3.5 px-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background:
                        "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                      boxShadow:
                        "0 15px 40px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                      clipPath:
                        "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                    }}
                  >
                    {isSending ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending recovery link...
                      </span>
                    ) : (
                      <>
                        <span>Send Recovery Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
              <div
                className="p-3.5 rounded-2xl flex gap-2.5 items-start"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(127, 29, 29, 0.22), rgba(5, 5, 10, 0.4))",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[10.5px] text-slate-400 leading-relaxed">
                  Your password can never be recovered — it is stored only as a secure hash.
                  Recovery lets you set a NEW password. Your Sakhi Number and data stay unchanged.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-emergency-400 text-sm">
          Loading recovery...
        </div>
      }
    >
      <RecoverFlow />
    </Suspense>
  );
}
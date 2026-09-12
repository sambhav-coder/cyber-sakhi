"use client";

import React, { useState, Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, getSession } from "next-auth/react";
import {
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  MapPin,
  Phone,
  CalendarDays,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  UserCheck,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

interface SignupSuccessData {
  sakhiNumber: string;
  name: string;
  email: string;
  password: string;
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  // Google-signup completion step: after OAuth (no age from Google) we ask
  // for the mandatory age field only. Name/email come from the Google session.
  const [googleProfile, setGoogleProfile] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [googleAge, setGoogleAge] = useState("");
  const [googleCity, setGoogleCity] = useState("");
  const [googlePhone, setGooglePhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<SignupSuccessData | null>(null);
  const [sakhiCopied, setSakhiCopied] = useState(false);
  const [pwCopied, setPwCopied] = useState(false);
  const [googleSignupInFlight, setGoogleSignupInFlight] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showGeneratedPw, setShowGeneratedPw] = useState(false);
  const [onetimePending, setOnetimePending] = useState(false);
  const [onetimeError, setOnetimeError] = useState<string | null>(null);

  // Latch that persists across StrictMode remounts so the Google-signup
  // discovery request is fired at most once per page session.
  const googleSignupStarted = useRef(false);

  // Security guard: opening /signup while already authenticated must NOT
  // let the user start a Google flow or create a second profile. We only
  // keep the form usable for the Google-return continuation (?google=true)
  // and the post-signup credential popup.
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        if (!cancelled && session?.user?.id) {
          setAlreadyLoggedIn(true);
        }
      } catch {
        /* session check is best-effort */
      } finally {
        if (!cancelled) setAuthCheckDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deterministic logout: call NextAuth's server-side sign-out (the supported
  // mechanism) and then VERIFY the session is actually gone before navigating.
  // The old arbitrary 300ms timer was unreliable — if the sign-out POST was slow
  // on a misbehaving runtime, navigation happened first and the stale session
  // cookie brought the user right back to an "already logged in" state.
  const clearAuthCookies = () => {
    for (const name of ["next-auth.session-token", "__Secure-next-auth.session-token"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  };

  const handleLogoutToSignup = async () => {
    setIsLoading(true);
    try {
      // Primary path — NextAuth's own sign-out (clears the JWT session cookie).
      await signOut({ redirect: false });
    } catch {
      /* fall through to defensive clean-up below */
    }

    // Verify the session was truly destroyed. If the server round-trip failed
    // (e.g. a corrupted/racing runtime), force the cookie out so no stale
    // session survives the navigation.
    try {
      const res = await fetch("/api/auth/session");
      const session = await res.json();
      if (session?.user?.email) {
        clearAuthCookies();
      }
    } catch {
      clearAuthCookies();
    }

    setIsLoading(false);
    router.push("/signup");
    router.refresh();
  };

  useEffect(() => {
    const token = searchParams.get("onetime");
    if (!token || success) return;

    let cancelled = false;
    setOnetimePending(true);
    setOnetimeError(null);

    (async () => {
      try {
        const res = await fetch(`/api/auth/onetime?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !data.sakhiNumber || !data.generatedPassword) {
          // Safe failure: missing / invalid / expired / already-consumed
          // token. Surface an explicit error instead of silently falling
          // back to another signup/login state, and never show partial
          // credentials.
          setOnetimeError(
            data?.error ||
              "This signup link is invalid or has expired. Please sign up again to receive your Sakhi Number."
          );
          return;
        }

        setSuccess({
          sakhiNumber: data.sakhiNumber,
          name: data.name || "Sakhi User",
          email: data.email || "",
          password: data.generatedPassword,
        });
      } catch {
        if (cancelled) return;
        setOnetimeError(
          "Could not retrieve your credentials. Please try signing up again."
        );
      } finally {
        if (!cancelled) setOnetimePending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, success]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Run at most once per page session, and only when ?google=true.
        // Cancelling/StrictMode remounts must not fire a duplicate request.
        if (
          cancelled ||
          googleSignupStarted.current ||
          searchParams.get("google") !== "true" ||
          success ||
          googleProfile
        )
          return;
        googleSignupStarted.current = true;

        setGoogleSignupInFlight(true);
        const res = await fetch("/api/auth/google-signup", { method: "POST" });
        const data = await res.json();
        const ok = res.ok;

        // The discovery response (`needsAge`) is a SUCCESS — it must not be
        // treated as a failure just because it carries no one-time token.
        // The server has already destroyed the OAuth session on any non-2xx,
        // but we sign out client-side too so retry starts unauthenticated.
        if (!ok) {
          try {
            await signOut({ callbackUrl: "/login", redirect: false });
          } catch {
            /* best-effort */
          }
          setErrorMessage(
            data?.error || "Google signup failed. Please try again."
          );
          setGoogleSignupInFlight(false);
          return;
        }

        if (data.needsAge && !success) {
          // Name/email come from the Google session — only age is missing.
          setGoogleProfile({ name: data.name || "", email: data.email || "" });
        } else if (data.token && !success) {
          // Redirect to signup with onetime token
          window.location.href = `/signup?onetime=${encodeURIComponent(data.token)}`;
        } else if (data.redirectTo) {
          // User already exists, redirect to dashboard
          window.location.href = data.redirectTo;
        } else {
          // 2xx but no actionable payload — treat as failure and clean up.
          try {
            await signOut({ callbackUrl: "/login", redirect: false });
          } catch {
            /* best-effort */
          }
          setErrorMessage("Google signup failed. Please try again.");
        }
      } catch (err) {
        // Network-level error – clean up session so retry is safe.
        try {
          await signOut({ callbackUrl: "/login", redirect: false });
        } catch {
          /* best-effort */
        }
        setErrorMessage(
          "An unexpected network error occurred. Please try again."
        );
        setGoogleSignupInFlight(false);
      } finally {
        setGoogleSignupInFlight(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, success, googleProfile]);

// Age step "Finish" — completes the Google signup and shows the same
  // credentials popup used by manual signup.
  const handleGoogleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = Number(googleAge);
    if (!googleAge || Number.isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
      setErrorMessage("Age must be a valid number between 10 and 120.");
      return;
    }
    if (googlePhone.trim() && googlePhone.replace(/[^\d+]/g, "").length < 8) {
      setErrorMessage("A valid phone number is required.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/google-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: String(ageNum),
          city: googleCity.trim(),
          phone: googlePhone.trim(),
        }),
      });
      const data = await res.json();

      if (data?.token) {
        // Force a server-side session refresh BEFORE showing the credentials
        // popup: the next /api/auth/session read re-runs the NextAuth jwt
        // callback, which re-attaches the session to the freshly created
        // Cyber Sakhi profile (profile UUID + Sakhi Number). This closes the
        // Google-UID window so the browser never keeps a stale identity.
        try {
          await getSession();
        } catch {
          /* best-effort — Continue still signs in with credentials */
        }
        window.location.href = `/signup?onetime=${encodeURIComponent(data.token)}`;
        return;
      }
      if (data?.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
      // Failure — the server already destroyed the OAuth session on any
      // non-2xx. Best-effort client clean-up keeps the browser consistent.
      try {
        await signOut({ callbackUrl: "/login", redirect: false });
      } catch {
        /* best-effort */
      }
      setErrorMessage(data?.error || "Failed to complete Google signup.");
      setIsLoading(false);
    } catch (err) {
      setErrorMessage("An unexpected network error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (alreadyLoggedIn) {
      setErrorMessage(
        "You are already logged in. Please log out before creating a new account."
      );
      return;
    }

    if (!name.trim()) {
      setErrorMessage("Name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("A valid email address is required.");
      return;
    }
    const ageNum = Number(age);
    if (!age || Number.isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
      setErrorMessage("Age must be a valid number between 10 and 120.");
      return;
    }
    if (phone.trim() && phone.replace(/[^\d+]/g, "").length < 8) {
      setErrorMessage("A valid phone number is required.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          age: String(ageNum),
          city: city.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to create account.");
        setIsLoading(false);
        return;
      }

      // Manual signup returns a one-time token (the password itself is never
      // sent in the API response). Redeem it to populate the credentials popup.
      if (data?.token) {
        try {
          const credRes = await fetch(
            `/api/auth/onetime?token=${encodeURIComponent(data.token)}`
          );
          const cred = await credRes.json();
          if (credRes.ok && cred?.sakhiNumber && cred?.generatedPassword) {
            setSuccess({
              sakhiNumber: cred.sakhiNumber,
              name: cred.name || name.trim(),
              email: cred.email || email.trim(),
              password: cred.generatedPassword,
            });
            setIsLoading(false);
            return;
          }
        } catch {
          /* fall through to fallback */
        }
        router.push(
          `/login?registered=true&sakhi=${encodeURIComponent(
            data?.user?.sakhi_number || ""
          )}`
        );
        setIsLoading(false);
        return;
      }

      setSuccess({
        sakhiNumber: data?.user?.sakhi_number || "SAKHI-2026-UNKNOWN",
        name: data?.user?.name || name.trim(),
        email: data?.user?.email || email.trim(),
        password: data?.generatedPassword || "",
      });
      setIsLoading(false);
    } catch (err) {
      setErrorMessage("An unexpected network error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleContinueToDashboard = async () => {
    if (!success) return;
    setRedirecting(true);
    try {
      const loginRes = await signIn("credentials", {
        identifier: success.sakhiNumber,
        password: success.password,
        redirect: false,
        callbackUrl,
      });
      if (loginRes?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        router.push(`/login?registered=true&sakhi=${encodeURIComponent(success.sakhiNumber)}`);
      }
    } catch {
      router.push(`/login?registered=true&sakhi=${encodeURIComponent(success.sakhiNumber)}`);
    } finally {
      setRedirecting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (alreadyLoggedIn) {
      setErrorMessage(
        "You are already logged in. Please log out before signing up with a different account."
      );
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await signIn("google", { callbackUrl: "/signup?google=true" });
    } catch (err) {
      setErrorMessage("Could not initialize Google authentication.");
      setIsLoading(false);
    }
  };

  const copySakhiNumber = async () => {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.sakhiNumber);
      setSakhiCopied(true);
      setTimeout(() => setSakhiCopied(false), 2200);
    } catch {
      /* silent */
    }
  };

  const copyGeneratedPassword = async () => {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.password);
      setPwCopied(true);
      setTimeout(() => setPwCopied(false), 2200);
    } catch {
      /* silent */
    }
  };

  // =========================
  // SUCCESS PANEL (POST SIGNUP)
  // =========================
  if (success) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 50% 20%, rgba(16, 185, 129, 0.22), transparent 60%), radial-gradient(ellipse 55% 45% at 20% 85%, rgba(220, 38, 38, 0.2), transparent 60%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
          }}
        />

        <div className="relative z-10 w-full max-w-md animate-fade-in-up">
          {/* Celebration icon */}
          <div className="text-center mb-7">
            <div className="relative inline-flex">
              <div
                className="absolute -inset-6 rounded-full blur-3xl opacity-70 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(16, 185, 129, 0.6), rgba(5, 150, 105, 0.15) 60%, transparent 70%)",
                }}
              />
              <div
                className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #059669 0%, #10b981 55%, #047857 100%)",
                  boxShadow: "0 20px 45px -15px rgba(16, 185, 129, 0.7)",
                }}
              >
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>

          <div className="text-center mb-5 space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome, <span className="text-crimson-gradient">{success.name.split(" ")[0]}</span> ✨
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
              Your Cyber Sakhi account has been created. Below is your{" "}
              <span className="text-white font-semibold">unique Sakhi Number</span>.{" "}
              <span className="text-emergency-300 font-semibold">Save it — you will need it every time you login.</span>
            </p>
          </div>

          {/* SAKHI NUMBER CARD */}
          <div
            className="relative mb-6 p-6 sm:p-8 rounded-3xl overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(220, 38, 38, 0.22) 0%, rgba(127, 29, 29, 0.22) 35%, rgba(5, 5, 10, 0.85) 100%)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              boxShadow:
                "0 30px 80px -40px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(254, 202, 202, 0.15)",
            }}
          >
            {/* Pattern stripes */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(248, 113, 113, 0.4) 0 2px, transparent 2px 14px)",
              }}
            />
            {/* Corner accents */}
            <div className="absolute top-3 right-3 flex gap-1 opacity-50 pointer-events-none">
              <Fingerprint className="w-4 h-4 text-emergency-400" />
            </div>

            <div className="relative space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase text-white"
                  style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
                >
                  <ShieldCheck className="w-3 h-3" />
                  Your Sakhi ID
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 bg-black/40 border border-emergency-500/20 rounded-2xl p-4 sm:p-5 backdrop-blur">
                <div className="overflow-hidden">
                  <div className="text-[10px] tracking-[0.2em] text-slate-500 uppercase font-bold mb-1">
                    Sakhi Number (keep private)
                  </div>
                  <div
                    className="font-mono font-black text-white tracking-[0.1em] text-xl sm:text-2xl md:text-3xl whitespace-nowrap"
                    style={{ textShadow: "0 0 28px rgba(248, 113, 113, 0.55)" }}
                  >
                    {success.sakhiNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copySakhiNumber}
                  className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
                    sakhiCopied
                      ? "bg-emerald-500/20 border border-emerald-500/60 text-emerald-300"
                      : "bg-emergency-500/15 border border-emergency-500/40 text-emergency-300 hover:bg-emergency-500/25 hover:scale-105"
                  }`}
                  title="Copy Sakhi Number"
                  aria-label="Copy Sakhi Number"
                >
                  {sakhiCopied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>

              {sakhiCopied && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold tracking-wide animate-fade-in-up">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sakhi Number copied to clipboard! Paste it somewhere safe.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 mb-1 font-bold">
                    Name
                  </div>
                  <div className="text-xs text-slate-200 font-semibold truncate">
                    {success.name}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 mb-1 font-bold">
                    Email
                  </div>
                  <div className="text-xs text-slate-200 font-semibold truncate">
                    {success.email}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GENERATED PASSWORD CARD */}
          <div
            className="relative mb-6 p-6 sm:p-8 rounded-3xl overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(79, 70, 229, 0.18) 35%, rgba(5, 5, 10, 0.85) 100%)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
              boxShadow:
                "0 30px 80px -40px rgba(124, 58, 237, 0.7), inset 0 1px 0 rgba(221, 214, 254, 0.15)",
            }}
          >
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, rgba(196, 181, 253, 0.4) 0 2px, transparent 2px 14px)",
              }}
            />
            <div className="absolute top-3 right-3 flex gap-1 opacity-50 pointer-events-none">
              <KeyRound className="w-4 h-4 text-violet-400" />
            </div>

            <div className="relative space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase text-white"
                  style={{ background: "linear-gradient(135deg, #4c1d95, #7c3aed)" }}
                >
                  <Lock className="w-3 h-3" />
                  Temporary Password
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 bg-black/40 border border-violet-500/20 rounded-2xl p-4 sm:p-5 backdrop-blur">
                <div className="overflow-hidden flex-1">
                  <div className="text-[10px] tracking-[0.2em] text-slate-500 uppercase font-bold mb-1">
                    One-time password (save now)
                  </div>
                  <div
                    className="font-mono font-black text-white tracking-[0.1em] text-lg sm:text-xl md:text-2xl whitespace-nowrap overflow-hidden"
                    style={{ textShadow: "0 0 24px rgba(167, 139, 250, 0.5)" }}
                  >
                    {showGeneratedPw ? success.password : "•".repeat(Math.max(success.password.length, 14))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowGeneratedPw((s) => !s)}
                    className="h-12 w-12 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 flex items-center justify-center transition-all hover:scale-105"
                    title={showGeneratedPw ? "Hide password" : "Show password"}
                    aria-label={showGeneratedPw ? "Hide password" : "Show password"}
                  >
                    {showGeneratedPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={copyGeneratedPassword}
                    className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
                      pwCopied
                        ? "bg-emerald-500/20 border border-emerald-500/60 text-emerald-300"
                        : "bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25 hover:scale-105"
                    }`}
                    title="Copy Password"
                    aria-label="Copy Password"
                  >
                    {pwCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {pwCopied && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold tracking-wide animate-fade-in-up">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Password copied to clipboard! Paste it somewhere safe right now.
                </div>
              )}

              <div className="p-3 rounded-xl" style={{ background: "rgba(220, 38, 38, 0.15)", border: "1px solid rgba(248, 113, 113, 0.3)" }}>
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-emergency-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-emergency-300 font-bold leading-relaxed tracking-wide">
                    This password is shown ONLY NOW — save it, it cannot be recovered.
                    After you click Continue below you will NOT see it again.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Continue */}
          <button
            type="button"
            onClick={handleContinueToDashboard}
            disabled={redirecting}
            className="w-full py-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
              boxShadow:
                "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
            }}
          >
            {redirecting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing you in securely...
              </span>
            ) : (
              <>
                <span>Continue to Cyber Sakhi Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors tracking-wide"
            >
              ← Go to Login page instead
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // ONE-TIME CREDENTIALS FLOW (PRIORITY)
  // =========================
  // While /signup?onetime=<token> is present, the credential hand-off MUST
  // take priority over the generic "already logged in" state: the popup has
  // to appear reliably, and an invalid/expired/consumed token must surface a
  // safe error instead of silently falling back to another auth screen.
  const onetimeToken = searchParams.get("onetime");
  if (onetimeToken && !success) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(220, 38, 38, 0.28), transparent 65%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(127, 29, 29, 0.35), transparent 65%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
          }}
        />

        <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {onetimeError ? (
                <span className="text-white">Signup link expired</span>
              ) : (
                <span className="text-white">
                  Preparing your <span className="text-crimson-gradient">Sakhi Number</span>
                </span>
              )}
            </h1>
            {onetimeError ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5 text-left animate-fade-in-up">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white mb-1">Credential retrieval failed</div>
                    <div className="text-red-200/90 leading-relaxed">{onetimeError}</div>
                  </div>
                </div>
                <Link
                  href="/signup"
                  className="w-full py-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2"
                  style={{
                    background:
                      "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                    boxShadow:
                      "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                    clipPath:
                      "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                  }}
                >
                  Sign Up Again
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2.5 text-slate-300 text-xs font-semibold">
                <span className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                Retrieving your one-time credentials...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // GOOGLE AGE COMPLETION STEP
  // =========================
  if (googleProfile) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(220, 38, 38, 0.28), transparent 65%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(127, 29, 29, 0.35), transparent 65%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
          }}
        />

        <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="flex justify-between items-center -mt-2 mb-1">
            <Link
              href="/"
              className="text-[11px] text-slate-400 hover:text-emergency-300 transition-colors tracking-wide flex items-center gap-1.5"
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              Back to Home
            </Link>
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              <span className="text-white">Almost there, </span>
              <span className="text-crimson-gradient">{googleProfile.name.split(" ")[0]}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Google brought your name &amp; email. One more detail and your
              unique <span className="text-emergency-300 font-semibold">Sakhi Number</span> is yours.
            </p>
          </div>

          <div
            className="p-6 sm:p-8 rounded-3xl glass-panel space-y-5"
            style={{
              border: "1px solid rgba(239, 68, 68, 0.18)",
              boxShadow:
                "0 30px 80px -40px rgba(0,0,0,0.9), 0 0 60px -30px rgba(220, 38, 38, 0.35)",
            }}
          >
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 animate-fade-in-up">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Google-provided name/email (read-only, not re-entered) */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 mb-1 font-bold">
                    Name
                  </div>
                  <div className="text-xs text-slate-200 font-semibold truncate">
                    {googleProfile.name}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-slate-500 mb-1 font-bold">
                    Email
                  </div>
                  <div className="text-xs text-slate-200 font-semibold truncate">
                    {googleProfile.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 font-semibold">
                <ShieldCheck className="w-3 h-3" />
                Verified via Google Sign-In
              </div>
            </div>

            <form onSubmit={handleGoogleFinish} className="space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-emergency-400" />
                  Age
                </label>
                <input
                  type="number"
                  required
                  min={10}
                  max={120}
                  value={googleAge}
                  onChange={(e) => setGoogleAge(e.target.value)}
                  placeholder="22"
                  className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emergency-400" />
                    City <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={googleCity}
                    onChange={(e) => setGoogleCity(e.target.value)}
                    placeholder="Bengaluru"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emergency-400" />
                    Contact <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={googlePhone}
                    onChange={(e) => setGooglePhone(e.target.value)}
                    placeholder="+91 98XXX XXXXX"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
              </div>

              <div
                className="p-3 rounded-xl flex gap-2.5 items-start"
                style={{
                  background: "rgba(5, 5, 10, 0.6)",
                  border: "1px solid rgba(239, 68, 68, 0.12)",
                }}
              >
                <Fingerprint className="w-4 h-4 text-emergency-400 shrink-0 mt-0.5" />
                <div className="text-[10.5px] text-slate-400 leading-relaxed">
                  <span className="text-emergency-300 font-bold">Auto-generated password:</span>{" "}
                  A secure password will be created and shown once after this step. Save it securely.
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !googleAge}
                className="w-full py-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
                style={{
                  background:
                    "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                  boxShadow:
                    "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                  clipPath:
                    "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                }}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating Your Sakhi Account...
                  </span>
                ) : (
                  <>
                    <span>Finish Creating My Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // ALREADY LOGGED IN PANEL
  // =========================
  if (
    authCheckDone &&
    alreadyLoggedIn &&
    searchParams.get("google") !== "true" &&
    !success &&
    !googleProfile
  ) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 py-10 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(220, 38, 38, 0.28), transparent 65%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(127, 29, 29, 0.35), transparent 65%), linear-gradient(180deg, #05050a 0%, #0a0a18 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
          }}
        />

        <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="flex justify-between items-center -mt-2 mb-1">
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
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #052e2b 0%, #065f46 60%, #047857 100%)",
              }}
            >
              <UserCheck className="w-9 h-9 text-emerald-300" />
            </div>
            <h1 className="text-2xl sm:text-2xl font-black tracking-tight text-white">
              You are already logged in.
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Signing up with Google while you are signed in would switch to a
              different account. To keep your current session and safety data
              safe, we don&apos;t allow that here.
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="w-full py-3.5 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                  boxShadow:
                    "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <LayoutDashboard className="w-4 h-4" />
                Go to Dashboard
              </button>
              <button
                type="button"
                onClick={handleLogoutToSignup}
                className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-emergency-500/40 text-slate-100 text-sm font-semibold transition flex items-center justify-center gap-2"
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

  // =========================
  // SIGNUP FORM
  // =========================
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

      <div className="relative z-10 w-full max-w-xl space-y-6 animate-fade-in-up">
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
            href="/login"
            className="text-[11px] text-slate-500 hover:text-emergency-300 transition-colors tracking-wide flex items-center gap-1.5"
          >
            <Lock className="w-3 h-3" />
            Already registered? Sign In
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
            <span className="text-white">Create Your </span>
            <span className="text-crimson-gradient">Cyber Sakhi</span>
            <span className="text-white"> Profile</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
            Register to get your unique{" "}
            <span className="text-emergency-300 font-semibold">Sakhi Number</span>. All personal safety data is client-side encrypted with SHA-256 evidence integrity chain.
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
          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 animate-fade-in-up">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Security notice */}
          <div
            className="p-3.5 rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(127, 29, 29, 0.22), rgba(6, 78, 59, 0.18))",
              border: "1px solid rgba(239, 68, 68, 0.22)",
            }}
          >
            <div className="flex gap-2.5 items-start">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[10.5px] text-slate-300/90 leading-relaxed">
                <strong className="text-white tracking-wide">
                  🔒 Confidentiality Promise
                </strong>
                : Your Name, Age, City, Phone &amp; Safety records are highly sensitive.
                Cyber Sakhi protects them with client-side AES-256-GCM encryption, SHA-256 chain-of-custody hashing &amp; zero-knowledge storage.
                <strong className="text-emerald-300"> We never sell or share your data.</strong>
              </div>
            </div>
          </div>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-emergency-500/40 text-slate-100 text-xs font-semibold transition flex items-center justify-center gap-3 group"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1c0 2.8.7 5.4 1.9 7.8l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
              />
            </svg>
            <span>Sign up with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <span>or create profile manually</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-3.5 text-xs">
            {/* NAME + AGE (row) */}
            <div className="grid sm:grid-cols-5 gap-3">
              <div className="sm:col-span-3 space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emergency-400" />
                  Your Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-emergency-400" />
                  Age
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={10}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="22"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
              </div>
            </div>

            {/* EMAIL */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-emergency-400" />
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@example.com"
                  className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                />
              </div>
            </div>

            {/* CITY + CONTACT (row) */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emergency-400" />
                  City <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Bengaluru, Mumbai (optional)"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emergency-400" />
                  Contact Number <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98XXX XXXXX (optional)"
                    className="w-full rounded-xl bg-black/50 border border-slate-700/80 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-2 focus:ring-emergency-500/25 transition"
                  />
                </div>
              </div>
            </div>

            {/* Password generation notice */}
            <div
              className="p-3 rounded-xl flex gap-2.5 items-start"
              style={{
                background: "rgba(5, 5, 10, 0.6)",
                border: "1px solid rgba(239, 68, 68, 0.12)",
              }}
            >
              <Fingerprint className="w-4 h-4 text-emergency-400 shrink-0 mt-0.5" />
              <div className="text-[10.5px] text-slate-400 leading-relaxed">
                <span className="text-emergency-300 font-bold">Auto-generated password:</span>{" "}
                A secure password will be generated automatically and shown once after signup. Save it securely.
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !name.trim() || !email.trim() || !age}
              className="w-full py-4 rounded-xl text-white font-bold tracking-wide text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
              style={{
                background:
                  "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
                boxShadow:
                  "0 18px 45px -12px rgba(220, 38, 38, 0.75), inset 0 1px 0 rgba(255,255,255,0.18)",
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
              }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating Your Sakhi Account...
                </span>
              ) : (
                <>
                  <span>Create Account &amp; Get My Sakhi Number</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Switch to Login */}
          <div className="text-center pt-2 text-xs text-slate-400 flex flex-col gap-1 border-t border-white/5 mt-1">
            <div className="pt-3">
              <span className="text-slate-500">Already have a Sakhi Number? </span>
              <Link
                href={`/login${callbackUrl !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
                className="text-emergency-400 hover:text-emergency-300 font-bold tracking-wide underline decoration-emergency-500/40 underline-offset-4"
              >
                Sign In with your Sakhi Number →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-emergency-400 text-sm">
          Loading registration...
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

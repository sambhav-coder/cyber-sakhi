"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { CyberSakhiLogo } from "@/components/CyberSakhiLogo";

type FormStatus = "idle" | "submitting" | "redirecting";
type LoginStep = "credentials" | "verify";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrator",
  STATE_ADMIN: "State Administrator",
  DISTRICT_OFFICER: "District Officer",
  INVESTIGATOR: "Investigator",
  ANALYST: "Analyst",
  AUDITOR: "Auditor",
};

const SCOPE_LABELS: Record<string, string> = {
  ALL_INDIA: "National",
  STATE: "State",
  DISTRICT: "District",
  ASSIGNED_CASES: "Assigned cases",
};

function jurisdictionOf(officer: {
  scope: string;
  state_code: string | null;
  district_code: string | null;
}): string | null {
  const scopeLabel = SCOPE_LABELS[officer.scope];
  if (officer.scope === "STATE") return `${scopeLabel} ${officer.state_code ?? "—"}`;
  if (officer.scope === "DISTRICT") {
    return `${scopeLabel} ${officer.state_code ?? "—"}${officer.district_code ? ` / ${officer.district_code}` : ""}`;
  }
  return scopeLabel ?? null;
}

const POSTURE_POINTS: { title: string; body: string }[] = [
  {
    title: "Single generic error",
    body: "Sign-in failures never reveal whether an officer account exists.",
  },
  {
    title: "Account lockout",
    body: "5 failed attempts lock the officer account for 15 minutes.",
  },
  {
    title: "Network throttling",
    body: "Repeated attempts from one network are rate-limited.",
  },
  {
    title: "Full audit trail",
    body: "Every sign-in attempt — success and failure — is recorded.",
  },
  {
    title: "Hardened session",
    body: "Secure, HttpOnly, SameSite cookie scoped to the console.",
  },
];

function signinErrorFor(status: number, code: string | null, message: string | null): string {
  if (status === 429) {
    return "Too many attempts from this network. Wait a few minutes and try again.";
  }
  if (status === 403) {
    return "Sign-in refused by the origin check. Refresh the page and try again.";
  }
  if (status === 500) {
    return "Sign-in service is temporarily unavailable. Try again shortly.";
  }
  if (status === 401) {
    return "Invalid sign-in credentials. Check your Officer ID, password, and authenticator code.";
  }
  if (code === "BAD_REQUEST") {
    return message ?? "Check your details and try again.";
  }
  return message ?? "Sign-in failed. Please try again.";
}

export const GovLoginForm: React.FC<{ officers: GovRosterOfficerLike[] }> = ({ officers }) => {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [selectedCode, setSelectedCode] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rosterAvailable = officers.length > 0;

  const handleOfficerChange = (code: string) => {
    setSelectedCode(code);
    setErrorMessage(null);
    const officer = officers.find((o) => o.officer_code === code);
    if (officer) {
      // Pre-fill the Officer ID only. Official emails are never exposed
      // on the unauthenticated login page.
      setUserId(officer.officer_code);
      setPassword("");
    }
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!userId.trim() || !password) {
      setErrorMessage("Enter your Officer ID and password to continue.");
      return;
    }
    setStep("verify");
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (status === "submitting" || status === "redirecting") return;
      setStatus("submitting");
      setErrorMessage(null);
      try {
        const res = await fetch("/gov/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: userId.trim(), password, mfaCode: mfaCode.trim() }),
        });
        if (res.ok) {
          setStatus("redirecting");
          router.replace("/gov/dashboard");
          return;
        }
        let code: string | null = null;
        let message: string | null = null;
        try {
          const body = await res.json();
          code = body?.error?.code ?? null;
          message = body?.error?.message ?? null;
        } catch {
          // Fall back to the generic message below.
        }
        setStatus("idle");
        setErrorMessage(signinErrorFor(res.status, code, message));
      } catch {
        setStatus("idle");
        setErrorMessage("A network error occurred. Please try again.");
      }
    },
    [userId, password, mfaCode, router, status],
  );

  const busy = status === "submitting" || status === "redirecting";

  return (
    <div className="w-full max-w-4xl">
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-start">
        {/* Sign-in form */}
        <div className="gov-panel p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <CyberSakhiLogo size={44} />
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-50">
                Secure Officer Access
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300">
                Government Portal — Authorised Access Only
              </p>
            </div>
          </div>

          {step === "credentials" ? (
            <form onSubmit={handleContinue} className="space-y-4" aria-label="Officer credentials form">
              {rosterAvailable && (
                <div>
                  <label htmlFor="gov-officer-select" className="gov-label">
                    Select Officer
                  </label>
                  <div className="relative">
                    <select
                      id="gov-officer-select"
                      name="officerCode"
                      value={selectedCode}
                      onChange={(e) => handleOfficerChange(e.target.value)}
                      className="gov-input appearance-none pr-11"
                      disabled={busy}
                    >
                      <option value="">— Choose your officer account —</option>
                      {officers.map((o) => {
                        const jurisdiction = jurisdictionOf(o);
                        return (
                          <option key={o.officer_code} value={o.officer_code}>
                            {o.officer_code} · {o.full_name}
                            {o.role ? ` (${ROLE_LABELS[o.role] ?? o.role})` : ""}
                            {jurisdiction ? ` · ${jurisdiction}` : ""}
                          </option>
                        );
                      })}
                    </select>
                    <UserRound className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-500" />
                  </div>
                  <p className="gov-hint mt-1.5">
                    Choosing an officer pre-fills your Officer ID. You can still type any ID manually.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="gov-user-id" className="gov-label">
                  Officer ID
                </label>
                <input
                  id="gov-user-id"
                  type="text"
                  name="identifier"
                  autoComplete="username"
                  required
                  spellCheck={false}
                  autoCapitalize="characters"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value.toUpperCase());
                    setErrorMessage(null);
                  }}
                  className="gov-input font-mono"
                  placeholder="DL-CYB-0001"
                  disabled={busy}
                />
                <p className="gov-hint mt-1.5">Your Officer ID (e.g. DL-CYB-0001), or official email.</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="gov-password" className="gov-label">
                    Password
                  </label>
                  <span className="gov-hint">8+ characters</span>
                </div>
                <div className="relative">
                  <input
                    id="gov-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="gov-input pr-11"
                    placeholder="••••••••••••"
                    enterKeyHint="go"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={busy}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" className="gov-btn-primary w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Continue
              </button>

              {errorMessage && (
                <p
                  id="gov-login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-xs leading-relaxed text-red-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <Link href="/gov/login/forgot-id" className="font-semibold text-slate-400 transition hover:text-teal-300">
                  Forgot User ID?
                </Link>
                <Link href="/gov/login/forgot-password" className="font-semibold text-slate-400 transition hover:text-teal-300">
                  Forgot Password?
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" aria-label="Officer verification form">
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
                Signing in as <span className="font-mono font-bold text-slate-200">{userId.trim() || "—"}</span>
              </div>

              {!useRecovery ? (
                <div>
                  <label htmlFor="gov-mfa-code" className="gov-label">
                    Authenticator code
                  </label>
                  <div className="relative">
                    <input
                      id="gov-mfa-code"
                      type="text"
                      name="mfaCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => {
                        setMfaCode(e.target.value.replace(/\D/g, ""));
                        setErrorMessage(null);
                      }}
                      className="gov-input pr-11 text-center font-mono text-lg tracking-[0.3em]"
                      placeholder="••••••"
                      disabled={busy}
                      autoFocus
                    />
                    <Smartphone className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-500" />
                  </div>
                  <p className="gov-hint mt-1.5">Enter the current 6-digit code from your enrolled authenticator app.</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="gov-recovery-code" className="gov-label">
                    Recovery code
                  </label>
                  <div className="relative">
                    <input
                      id="gov-recovery-code"
                      type="text"
                      name="mfaCode"
                      autoComplete="off"
                      required
                      spellCheck={false}
                      value={mfaCode}
                      onChange={(e) => {
                        setMfaCode(e.target.value.toUpperCase());
                        setErrorMessage(null);
                      }}
                      className="gov-input pr-11 text-center font-mono tracking-[0.15em]"
                      placeholder="XXXX-XXXX"
                      disabled={busy}
                      autoFocus
                    />
                    <KeyRound className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-500" />
                  </div>
                  <p className="gov-hint mt-1.5">Each recovery code works once. Generate a fresh set after signing in.</p>
                </div>
              )}

              <button type="submit" className="gov-btn-primary w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {status === "redirecting"
                  ? "Opening Console…"
                  : status === "submitting"
                    ? "Verifying…"
                    : "Verify & Sign In"}
              </button>

              {errorMessage && (
                <p
                  id="gov-login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-xs leading-relaxed text-red-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setErrorMessage(null);
                    setMfaCode("");
                  }}
                  className="flex items-center gap-1 font-semibold text-slate-400 transition hover:text-teal-300"
                  disabled={busy}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseRecovery((v) => !v);
                    setErrorMessage(null);
                    setMfaCode("");
                  }}
                  className="font-semibold text-slate-400 transition hover:text-teal-300"
                  disabled={busy}
                >
                  {useRecovery ? "Use authenticator code instead" : "Use a recovery code instead"}
                </button>
              </div>
            </form>
          )}

          {rosterAvailable && step === "credentials" && (
            <p className="gov-hint mt-4">
              Officer list shows active officer codes only. Select one to pre-fill your Officer ID.
            </p>
          )}

          <Link
            href="/gov"
            className="mt-5 flex w-fit items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-teal-300"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back to Portal Overview
          </Link>
        </div>

        {/* Security posture */}
        <aside className="gov-panel p-6" aria-label="Sign-in security protections">
          <div className="mb-4 flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-teal-300" />
            <h2 className="text-sm font-black uppercase tracking-[0.08em] text-slate-100">
              Protected Access
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Every sign-in on this console is guarded by the controls below:
          </p>
          <ul className="mt-4 space-y-3.5">
            {POSTURE_POINTS.map((point) => (
              <li key={point.title} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/80" />
                <div className="leading-tight">
                  <p className="text-xs font-bold text-slate-200">{point.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-start gap-2 border-t border-slate-800/70 pt-4">
            <Shield className="h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-[11px] leading-relaxed text-slate-500">
              This portal is restricted to authorised government officers. All sign-in and
              access activity is logged and auditable.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

// The unauthenticated roster carries officer codes only — official emails
// are never exposed before authentication.
export type GovRosterOfficerLike = {
  officer_code: string;
  full_name: string;
  role: string;
  department: string | null;
  scope: string;
  state_code: string | null;
  district_code: string | null;
};

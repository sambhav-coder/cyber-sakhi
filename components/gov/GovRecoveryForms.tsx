"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Loader2, ShieldAlert, UserRound } from "lucide-react";
import { CyberSakhiLogo } from "@/components/CyberSakhiLogo";

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <div className="gov-panel p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <CyberSakhiLogo size={40} />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-50">{title}</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300">
              {subtitle}
            </p>
          </div>
        </div>
        {children}
        <Link
          href="/gov/login"
          className="mt-5 flex w-fit items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-teal-300"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

function Notice({ kind, text }: { kind: "ok" | "error"; text: string }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-xs leading-relaxed text-red-200"
          : "rounded-xl border border-teal-400/25 bg-teal-400/10 px-4 py-3 text-xs leading-relaxed text-teal-100"
      }
    >
      {kind === "error" && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{text}</span>
    </p>
  );
}

export const GovForgotIdForm: React.FC = () => {
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/gov/api/recovery/forgot-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), phone: phone.trim() || undefined }),
      });
      const body = await res.json().catch(() => null);
      setMessage(
        body?.message ??
          "Request received. If the details match, follow the verified official channel.",
      );
    } catch {
      setMessage("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Recover Officer ID" subtitle="Government Portal — Identity Recovery">
      <form onSubmit={submit} className="space-y-4" aria-label="Forgot Officer ID form">
        <div>
          <label htmlFor="gov-recover-id" className="gov-label">
            Official Email or Officer ID fragment
          </label>
          <div className="relative">
            <input
              id="gov-recover-id"
              type="text"
              autoComplete="off"
              required
              maxLength={320}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="gov-input pr-11"
              placeholder="officer@gov.example / DL-CYB-…"
              disabled={busy}
            />
            <UserRound className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-500" />
          </div>
        </div>
        <div>
          <label htmlFor="gov-recover-phone" className="gov-label">
            Registered Phone (optional cross-check)
          </label>
          <input
            id="gov-recover-phone"
            type="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="gov-input"
            placeholder="+91 …"
            disabled={busy}
          />
        </div>
        <button type="submit" className="gov-btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Request Recovery
        </button>
        {message && <Notice kind="ok" text={message} />}
        <p className="gov-hint">
          For the SIH demonstration, an administrator verifies identity out-of-band and
          re-issues the Officer ID. Full IDs are never shown to unverified visitors.
        </p>
      </form>
    </Shell>
  );
};

export const GovForgotPasswordForm: React.FC = () => {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/gov/api/recovery/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const body = await res.json().catch(() => null);
      setMessage(
        body?.message ??
          "Request received. If the Officer ID matches, a reset has been initiated.",
      );
    } catch {
      setMessage("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Reset Password" subtitle="Government Portal — Credential Recovery">
      <form onSubmit={submit} className="space-y-4" aria-label="Forgot password form">
        <div>
          <label htmlFor="gov-reset-id" className="gov-label">
            Officer ID
          </label>
          <input
            id="gov-reset-id"
            type="text"
            autoComplete="username"
            required
            maxLength={320}
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
            className="gov-input font-mono"
            placeholder="DL-CYB-0001"
            disabled={busy}
          />
          <p className="gov-hint mt-1.5">
            A single-use reset link is issued by your department administrator over a
            verified channel. Links expire in 30 minutes.
          </p>
        </div>
        <button type="submit" className="gov-btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Request Reset
        </button>
        {message && <Notice kind="ok" text={message} />}
      </form>
    </Shell>
  );
};

export const GovResetPasswordForm: React.FC<{ token: string }> = ({ token }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || done) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/gov/api/recovery/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setDone(true);
        setPassword("");
        setConfirm("");
      } else {
        setError(body?.error?.message ?? "This reset link is invalid or has expired.");
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Set New Password" subtitle="Government Portal — Credential Recovery">
      {done ? (
        <div className="space-y-4">
          <Notice
            kind="ok"
            text="The password has been updated and all previous sessions were signed out. Sign in with the new password and authenticator code."
          />
          <Link href="/gov/login" className="gov-btn-primary flex w-full items-center justify-center">
            Go to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" aria-label="Reset password form">
          <div>
            <label htmlFor="gov-new-password" className="gov-label">
              New Password
            </label>
            <input
              id="gov-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="gov-input"
              placeholder="12+ characters, mixed classes"
              disabled={busy}
            />
            <p className="gov-hint mt-1.5">
              At least 12 characters with three of: lowercase, uppercase, digits, symbols.
            </p>
          </div>
          <div>
            <label htmlFor="gov-confirm-password" className="gov-label">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="gov-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="gov-input pr-11"
                placeholder="Repeat the new password"
                disabled={busy}
              />
              <KeyRound className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-500" />
            </div>
          </div>
          <button type="submit" className="gov-btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Set New Password
          </button>
          {error && <Notice kind="error" text={error} />}
        </form>
      )}
    </Shell>
  );
};

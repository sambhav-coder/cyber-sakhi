"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import QRCode from "qrcode";

type MfaStatus = "none" | "pending" | "enabled";
type Phase = "loading" | "overview" | "enrolling" | "confirming" | "done";

interface EnrollData {
  otpauthUrl: string;
  manualKey: string;
  expiresAt: string;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export const GovMfaManager: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<MfaStatus>("none");
  const [mfaFresh, setMfaFresh] = useState(false);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/gov/api/mfa/status", { cache: "no-store" });
      if (!res.ok) {
        setError(await readError(res, "Unable to check MFA status."));
        setPhase("overview");
        return;
      }
      const body = await res.json();
      setStatus(body.status ?? "none");
      setMfaFresh(Boolean(body.mfaFresh));
      setPhase("overview");
    } catch {
      setError("A network error occurred.");
      setPhase("overview");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/gov/api/mfa/enroll", { method: "POST" });
      if (!res.ok) {
        setError(await readError(res, "Unable to start enrollment."));
        return;
      }
      const body = (await res.json()) as EnrollData;
      setEnroll(body);
      setCode("");
      try {
        setQrDataUrl(await QRCode.toDataURL(body.otpauthUrl, { margin: 1, width: 220 }));
      } catch {
        setQrDataUrl(null);
      }
      setPhase("enrolling");
    } catch {
      setError("A network error occurred.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/gov/api/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        setError(await readError(res, "Unable to confirm enrollment."));
        return;
      }
      const body = await res.json();
      setRecoveryCodes(Array.isArray(body.recoveryCodes) ? body.recoveryCodes : []);
      setAcknowledged(false);
      setEnroll(null);
      setQrDataUrl(null);
      setCode("");
      setPhase("done");
    } catch {
      setError("A network error occurred.");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const finish = () => {
    // Recovery codes were displayed once; drop them from memory.
    setRecoveryCodes([]);
    setAcknowledged(false);
    void loadStatus();
  };

  if (phase === "loading") {
    return (
      <section className="gov-panel p-6 text-sm text-slate-400">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking authenticator status…
        </span>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {phase === "overview" && (
        <section className="gov-panel space-y-4 p-6" aria-label="Authenticator status">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-teal-300" />
            <h2 className="text-base font-bold text-slate-100">Authenticator (TOTP MFA)</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            {status === "enabled"
              ? "An authenticator is enrolled on this account. Sign-in requires the current 6-digit code from your app."
              : status === "pending"
                ? "An enrollment is in progress. Complete it below before it expires."
                : "No authenticator is enrolled yet. Enrollment is required before sign-in can succeed."}
          </p>
          {status === "enabled" && !mfaFresh && (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
              Replacing the enrolled authenticator needs a freshly verified session.
              Sign out and sign in again, then return here.
            </p>
          )}
          <button
            type="button"
            onClick={startEnrollment}
            disabled={busy || (status === "enabled" && !mfaFresh)}
            className="gov-btn-primary w-fit"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {status === "enabled" ? "Replace Authenticator" : "Start Enrollment"}
          </button>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-xs text-red-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </section>
      )}

      {phase === "enrolling" && enroll && (
        <section className="gov-panel space-y-5 p-6" aria-label="Enroll authenticator">
          <div className="flex items-center gap-3">
            <QrCode className="h-5 w-5 text-teal-300" />
            <h2 className="text-base font-bold text-slate-100">Scan with Google Authenticator</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-400">
            <li>Open Google Authenticator (or any TOTP app) and add a new account.</li>
            <li>Scan the QR code, or enter the manual key below.</li>
            <li>Enter the current 6-digit code to activate.</li>
          </ol>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {qrDataUrl ? (
              // The QR encodes this officer's own pending provisioning URI,
              // shown once over their authenticated session.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Authenticator provisioning QR code"
                width={220}
                height={220}
                className="rounded-xl border border-slate-700 bg-white p-2"
              />
            ) : (
              <p className="text-xs text-slate-500">QR unavailable — use the manual key.</p>
            )}
            <div className="w-full min-w-0 flex-1 space-y-2">
              <p className="gov-label">Manual setup key</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-teal-200">
                  {enroll.manualKey}
                </code>
                <button
                  type="button"
                  onClick={() => copyText("key", enroll.manualKey)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300"
                >
                  <span className="flex items-center gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> {copied === "key" ? "Copied" : "Copy"}
                  </span>
                </button>
              </div>
              <p className="gov-hint">Expires {new Date(enroll.expiresAt).toLocaleString("en-IN")}. Never share this key.</p>
            </div>
          </div>
          <form onSubmit={confirmEnrollment} className="space-y-3" aria-label="Confirm enrollment">
            <div>
              <label htmlFor="gov-enroll-code" className="gov-label">
                6-digit code from the app
              </label>
              <input
                id="gov-enroll-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError(null);
                }}
                className="gov-input max-w-xs text-center font-mono text-lg tracking-[0.3em]"
                placeholder="••••••"
                disabled={busy}
              />
            </div>
            <button type="submit" className="gov-btn-primary w-fit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Verify & Activate
            </button>
            {error && (
              <p role="alert" className="flex items-start gap-2 text-xs text-red-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}
          </form>
        </section>
      )}

      {phase === "done" && (
        <section className="gov-panel space-y-4 p-6" aria-label="Recovery codes">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-teal-300" />
            <h2 className="text-base font-bold text-slate-100">Save Your Recovery Codes</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            Authenticator enrolled. These {recoveryCodes.length} single-use codes are shown{" "}
            <strong className="text-slate-200">exactly once</strong> — each signs you in one
            time if the authenticator is unavailable. Store them offline now.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {recoveryCodes.map((c) => (
              <li
                key={c}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-sm tracking-[0.15em] text-teal-200"
              >
                {c}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => copyText("codes", recoveryCodes.join("\n"))}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300"
          >
            <span className="flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" /> {copied === "codes" ? "Copied" : "Copy all codes"}
            </span>
          </button>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            I have stored these codes offline. I understand they will never be shown again.
          </label>
          <button type="button" onClick={finish} disabled={!acknowledged} className="gov-btn-primary w-fit">
            Done
          </button>
        </section>
      )}
    </div>
  );
};

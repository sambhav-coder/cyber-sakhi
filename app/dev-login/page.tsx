"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ShieldAlert, LogIn, LogOut, ArrowRight } from "lucide-react";
import { DEV_PERSONAS, DEV_LOGIN_PROVIDER_ID } from "@/lib/devAuth";
import { OffenderNetworkSeedCard } from "@/components/OffenderNetworkSeedCard";

/* Local-only. The provider this page calls is not registered in a
 * production build, so these buttons cannot work off a dev machine. */

export default function DevLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (personaKey: string) => {
    setBusy(personaKey);
    setError(null);
    const res = await signIn(DEV_LOGIN_PROVIDER_ID, {
      persona: personaKey,
      redirect: false,
    });
    setBusy(null);

    if (res?.error) {
      setError(
        "Bypass rejected. Add ALLOW_DEV_LOGIN=true to .env.local and restart the dev server."
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-semibold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Local Development Only</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Developer Login Bypass
        </h1>
        <p className="text-sm text-slate-300">
          Real sign-in reads profiles from Supabase, which is not configured on
          this machine. These buttons mint a session directly so you can reach
          the dashboard and admin portal while demoing.
        </p>
      </div>

      <div className="p-4 rounded-2xl glass-card border-amber-900/40 text-[11px] text-slate-400 leading-relaxed">
        This route is double-gated: it needs a non-production build{" "}
        <span className="font-mono text-slate-300">and</span>{" "}
        <span className="font-mono text-amber-300">ALLOW_DEV_LOGIN=true</span>.
        A production build fixes NODE_ENV to{" "}
        <span className="font-mono text-slate-300">production</span>, so the
        provider is never registered when deployed. Do not set that flag on a
        server.
      </div>

      {status === "authenticated" && session?.user && (
        <div className="p-4 rounded-2xl glass-panel border-emerald-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-bold text-white">
              Signed in as {session.user.name}
            </div>
            <div className="text-slate-400">
              {session.user.email} · role{" "}
              <span className="font-mono text-emerald-300">
                {session.user.role}
              </span>
              {session.user.sakhiNumber && (
                <>
                  {" "}
                  · <span className="font-mono">{session.user.sakhiNumber}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/dev-login" })}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DEV_PERSONAS.map((persona) => (
          <button
            key={persona.key}
            onClick={() => handleSignIn(persona.key)}
            disabled={busy !== null}
            className="p-5 rounded-2xl glass-card text-left space-y-2 transition disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">
                {persona.name}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                  persona.role === "ADMIN"
                    ? "bg-emergency-950/70 text-emergency-300 border-emergency-700/50"
                    : "bg-slate-800/70 text-slate-200 border-slate-600/50"
                }`}
              >
                {persona.role}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{persona.blurb}</p>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emergency-300 pt-1">
              {busy === persona.key ? (
                <span>Signing in…</span>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign in as this user</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </div>
          </button>
        ))}
      </div>

      <OffenderNetworkSeedCard />

      <button
        onClick={() => router.push("/dashboard")}
        className="text-xs text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
      >
        <span>Skip to dashboard without signing in</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

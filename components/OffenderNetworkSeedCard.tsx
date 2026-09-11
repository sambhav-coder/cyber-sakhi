"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Radar, Loader2, ArrowRight } from "lucide-react";

/* Dev-only helper shown on /dev-login: plants earlier reports from
 * synthetic survivors so the Sakhi Network has a repeat offender to find
 * during a walkthrough. The route it calls refuses outside local dev. */

interface SeedResult {
  backend: "file" | "supabase";
  inserted: number;
  duplicates: number;
  demoMessage: string;
}

export const OffenderNetworkSeedCard: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/offender-network/seed-demo", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Seeding failed (${res.status})`);
      setResult(json as SeedResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl glass-card space-y-3">
      <div className="flex items-center gap-2">
        <Radar className="w-4 h-4 text-emergency-400" />
        <h2 className="text-sm font-bold text-white">Sakhi Network Demo Data</h2>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Plants earlier reports from 12 synthetic survivors against one phone
        number, one UPI ID and one Instagram handle, so the detector has a
        repeat offender to surface. Running it again adds nothing.
      </p>

      <button
        onClick={seed}
        disabled={busy}
        className="px-3.5 py-2 rounded-lg bg-emergency-600 hover:bg-emergency-500 text-white text-[11px] font-bold transition flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
        <span>Seed Network Demo</span>
      </button>

      {error && <p className="text-[11px] text-red-300">{error}</p>}

      {result && (
        <div className="space-y-2 text-[11px]">
          <p className="text-emerald-300">
            {result.inserted > 0
              ? `Planted ${result.inserted} reports (${result.backend} store).`
              : `Already seeded (${result.duplicates} reports present).`}
          </p>
          <p className="text-slate-400">Try this message in the detector:</p>
          <p className="font-mono text-slate-300 bg-black/40 border border-white/5 rounded-lg p-2">
            {result.demoMessage}
          </p>
          <Link
            href={`/detector?text=${encodeURIComponent(result.demoMessage)}`}
            className="inline-flex items-center gap-1 text-emergency-300 hover:underline font-semibold"
          >
            Open it in the Threat Detector <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
};

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Radar,
  RefreshCw,
  ShieldAlert,
  Info,
  Phone,
  IndianRupee,
  Mail,
  Globe,
  AtSign,
  Fingerprint,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Repeat offenders — the cross-victim view.
 *
 * One complaint gets dismissed; the same identifier reported by six
 * unrelated people is a pattern a cyber cell can act on. Nothing here
 * can identify anyone: identifiers are keyed fingerprints the server
 * cannot reverse, and reporters are counted, never named.
 * ------------------------------------------------------------------ */

interface Offender {
  fingerprint: string;
  type: string;
  distinctReporters: number;
  firstSeenDay: string;
  lastSeenDay: string;
  regions: string[];
  categories: string[];
}

interface Payload {
  backend: "file" | "supabase";
  minReporters: number;
  offenders: Offender[];
  totalVictimReports: number;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  phone: <Phone className="w-3.5 h-3.5" />,
  upi: <IndianRupee className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  domain: <Globe className="w-3.5 h-3.5" />,
  handle: <AtSign className="w-3.5 h-3.5" />,
};

const TYPE_LABEL: Record<string, string> = {
  phone: "Phone",
  upi: "UPI ID",
  email: "Email",
  domain: "Website",
  handle: "Handle",
};

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

export const RepeatOffenders: React.FC = () => {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minReporters, setMinReporters] = useState(3);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/offender-network?min=${minReporters}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [minReporters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Radar className="w-4 h-4 text-emergency-400" />
            <span>Repeat Offender Signals</span>
          </h2>
          <p className="text-[11px] text-slate-400 max-w-2xl">
            Identifiers reported independently by multiple survivors. A single
            complaint is easy to dismiss; a pattern across unrelated victims is
            a case.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>Min victims</span>
            <select
              value={minReporters}
              onChange={(e) => setMinReporters(Number(e.target.value))}
              className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200 text-[11px]"
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {data?.backend === "file" && (
        <span className="inline-block text-[9px] px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-600/40 text-amber-300 font-bold uppercase tracking-wide">
          Local demo store
        </span>
      )}

      {error && (
        <p className="text-[11px] text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="h-24 rounded-xl bg-slate-900/50 animate-pulse" />
      )}

      {data && data.offenders.length === 0 && (
        <p className="text-[11px] text-slate-500 py-6 text-center">
          No identifier has been reported by {data.minReporters} or more
          independent users yet.
        </p>
      )}

      {data && data.offenders.length > 0 && (
        <>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emergency-950/40 border border-emergency-800/50">
            <ShieldAlert className="w-4 h-4 text-emergency-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emergency-100">
              <span className="font-bold">{data.offenders.length}</span>{" "}
              identifier{data.offenders.length === 1 ? "" : "s"} flagged across{" "}
              <span className="font-bold">{data.totalVictimReports}</span>{" "}
              independent victim reports.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3 font-bold">Fingerprint</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Victims</th>
                  <th className="py-2 pr-3 font-bold">Cities</th>
                  <th className="py-2 pr-3 font-bold">Categories</th>
                  <th className="py-2 pr-3 font-bold">Active</th>
                </tr>
              </thead>
              <tbody>
                {data.offenders.map((o) => (
                  <tr
                    key={o.fingerprint}
                    className="border-b border-slate-900 hover:bg-slate-900/50 transition"
                  >
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5 font-mono text-slate-300">
                        <Fingerprint className="w-3 h-3 text-slate-600 shrink-0" />
                        {o.fingerprint}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {TYPE_ICON[o.type]}
                        <span>{TYPE_LABEL[o.type] ?? o.type}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-mono font-black ${
                          o.distinctReporters >= 5
                            ? "text-emergency-300"
                            : "text-amber-300"
                        }`}
                      >
                        {o.distinctReporters}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-400">
                      {o.regions.length > 0 ? o.regions.join(", ") : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex flex-wrap gap-1">
                        {o.categories.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded bg-emergency-950/60 border border-emergency-800/50 text-emergency-200 text-[10px]"
                          >
                            {c}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                      {formatDay(o.firstSeenDay)} – {formatDay(o.lastSeenDay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5 pt-1 border-t border-slate-800/80">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Identifiers are stored as keyed fingerprints, so the phone number or
          UPI ID behind a row cannot be recovered here — the prefix is a
          reference only. Counts are independent reports, not proof of guilt,
          and must be verified before any action is taken.
        </span>
      </p>
    </div>
  );
};

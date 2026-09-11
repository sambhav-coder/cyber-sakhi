"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Radar,
  Phone,
  IndianRupee,
  Mail,
  Globe,
  AtSign,
  ShieldAlert,
  Check,
  Loader2,
  Info,
  Send,
  EyeOff,
} from "lucide-react";
import { extractIndicators } from "@/lib/offenderNetwork/indicators";
import {
  K_ANONYMITY,
  REGIONS,
  type IndicatorType,
  type LookupResponse,
  type ReportCategory,
  type ReportResponse,
} from "@/lib/offenderNetwork/constants";

/* ------------------------------------------------------------------ *
 * Sakhi Network panel.
 *
 * Identifiers are pulled out of the message IN THE BROWSER; only those
 * identifiers are sent on, never the message. The server fingerprints
 * them with a key it never shares and answers with counts.
 * ------------------------------------------------------------------ */

const TYPE_META: Record<IndicatorType, { label: string; icon: React.ReactNode }> = {
  phone: { label: "Phone", icon: <Phone className="w-3.5 h-3.5" /> },
  upi: { label: "UPI ID", icon: <IndianRupee className="w-3.5 h-3.5" /> },
  email: { label: "Email", icon: <Mail className="w-3.5 h-3.5" /> },
  domain: { label: "Website", icon: <Globe className="w-3.5 h-3.5" /> },
  handle: { label: "Handle", icon: <AtSign className="w-3.5 h-3.5" /> },
};

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  BLACKMAIL: "Blackmail",
  STALKING: "Stalking",
  SCAM: "Scam",
  HARASSMENT: "Harassment",
  THREAT: "Threat",
  OTHER: "Other",
};

function formatDay(day: string | null): string {
  if (!day) return "";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

interface Props {
  text: string;
  category: ReportCategory;
}

export const OffenderNetworkPanel: React.FC<Props> = ({ text, category }) => {
  const { status } = useSession();
  const indicators = useMemo(() => extractIndicators(text), [text]);

  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportResult, setReportResult] = useState<ReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const payload = useMemo(
    () => indicators.map((i) => ({ type: i.type, value: i.value })),
    [indicators]
  );

  const runLookup = useCallback(async () => {
    if (payload.length === 0) {
      setLookup(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/offender-network/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicators: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Lookup failed (${res.status})`);
      setLookup(json as LookupResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [payload]);

  useEffect(() => {
    runLookup();
  }, [runLookup]);

  const handleReport = async () => {
    setReporting(true);
    setReportError(null);
    try {
      const res = await fetch("/api/offender-network/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicators: payload, category, region: region || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Report failed (${res.status})`);
      setReportResult(json as ReportResponse);
      await runLookup();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    } finally {
      setReporting(false);
    }
  };

  const results = lookup?.results ?? [];
  const maxOthers = results.reduce((m, r) => Math.max(m, r.otherReporters), 0);
  const allReportedByMe =
    results.length > 0 && results.every((r) => !r.valid || r.requesterHasReported);

  return (
    <div className="space-y-3 rounded-xl bg-black/40 border border-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Radar className="w-4 h-4 text-emergency-400" />
            <span>Sakhi Network</span>
          </h4>
          <p className="text-[11px] text-slate-400">
            Has anyone else reported the numbers, IDs or accounts in this message?
          </p>
        </div>
        {lookup?.backend === "file" && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-600/40 text-amber-300 font-bold uppercase tracking-wide shrink-0">
            Local demo store
          </span>
        )}
      </div>

      {indicators.length === 0 ? (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          No phone numbers, UPI IDs, emails, links or handles found in this
          message, so there is nothing to check against other reports.
        </p>
      ) : (
        <>
          {maxOthers >= K_ANONYMITY && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emergency-950/50 border border-emergency-700/50">
              <ShieldAlert className="w-4 h-4 text-emergency-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-emergency-100 leading-relaxed">
                <span className="font-bold">Repeat-offender signal.</span> An
                identifier in this message has been independently reported by{" "}
                <span className="font-bold">{maxOthers} other users</span>. Keep
                this message as evidence and report it to{" "}
                <span className="font-semibold">1930</span> or{" "}
                <span className="font-semibold">cybercrime.gov.in</span> — a
                pattern across victims strengthens a complaint.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <ul className="space-y-2">
            {indicators.map((ind, i) => {
              const r = results.find((x) => x.index === i);
              const others = r?.otherReporters ?? 0;
              const tone =
                others >= K_ANONYMITY
                  ? "border-emergency-700/50 bg-emergency-950/30"
                  : others > 0
                  ? "border-amber-700/40 bg-amber-950/20"
                  : "border-white/5 bg-white/[0.02]";

              return (
                <li key={`${ind.type}:${ind.value}`} className={`rounded-lg border p-2.5 ${tone}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400">{TYPE_META[ind.type].icon}</span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                        {TYPE_META[ind.type].label}
                      </span>
                      <span className="font-mono text-xs text-slate-200 truncate">
                        {ind.display}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5 shrink-0">
                      {r?.requesterHasReported && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 font-bold uppercase">
                          You reported
                        </span>
                      )}
                      {loading && !r ? (
                        <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                      ) : (
                        <span
                          className={`text-[11px] font-bold ${
                            others >= K_ANONYMITY
                              ? "text-emergency-300"
                              : others > 0
                              ? "text-amber-300"
                              : "text-slate-500"
                          }`}
                        >
                          {others === 0
                            ? "No other reports"
                            : `Reported by ${others} other user${others === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </span>
                  </div>

                  {r && others >= K_ANONYMITY && (
                    <div className="mt-2 space-y-1.5">
                      {r.firstSeenDay && (
                        <p className="text-[10px] text-slate-500">
                          First reported {formatDay(r.firstSeenDay)} · most recent{" "}
                          {formatDay(r.lastSeenDay)}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {r.regions.map((reg) => (
                          <span
                            key={reg}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-slate-300"
                          >
                            {reg}
                          </span>
                        ))}
                        {r.categories.map((c) => (
                          <span
                            key={c}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emergency-950/60 border border-emergency-800/50 text-emergency-200"
                          >
                            {CATEGORY_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {r?.detailWithheld && (
                    <p className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      City and dates stay hidden until {K_ANONYMITY} other people
                      have reported it, so no single reporter can be identified.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="pt-1 space-y-2 border-t border-white/5">
            {status === "authenticated" ? (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="text-[11px] rounded-lg bg-slate-950 border border-slate-700 text-slate-300 px-2 py-1.5"
                  aria-label="Your city (optional)"
                >
                  <option value="">City (optional)</option>
                  {REGIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleReport}
                  disabled={reporting || allReportedByMe || loading}
                  className="px-3.5 py-1.5 rounded-lg bg-emergency-600 hover:bg-emergency-500 text-white text-[11px] font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {reporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : allReportedByMe ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {allReportedByMe ? "Already Reported" : "Report to Sakhi Network"}
                  </span>
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 pt-2">
                <Link href="/login" className="text-emergency-300 hover:underline font-semibold">
                  Sign in
                </Link>{" "}
                to add your report. One account counts once, so counts cannot be
                inflated.
              </p>
            )}

            {reportResult && (
              <p className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                {reportResult.inserted > 0
                  ? `Added ${reportResult.inserted} report${
                      reportResult.inserted === 1 ? "" : "s"
                    }. Your identity is never shared with other users.`
                  : "You have already reported these."}
              </p>
            )}
            {reportError && <p className="text-[11px] text-red-300">{reportError}</p>}

            <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                The message stays on this device. Only a keyed fingerprint of
                each identifier is stored — never the number, the message, or
                who reported it. Counts are independent reports, not proof of
                guilt.
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

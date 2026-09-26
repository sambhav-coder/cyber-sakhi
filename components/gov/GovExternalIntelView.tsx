"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CheckCircle2, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

interface ExtIoc {
  source: string;
  source_record_id: string;
  indicator_type: string;
  normalized_value: string;
  first_seen: string | null;
  last_seen: string | null;
  observed_at: string | null;
  threat_category: string;
  tags: string[];
  status: string;
  source_url: string | null;
  reporter: string | null;
  record_key: string;
  enrichment?: { rules_version: string; rules_score: number; rules_band: string; rules_signals: string[] };
}

interface Aggregates {
  record_count: number;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  by_threat: Record<string, number>;
  actual_source_start: string | null;
  actual_source_end: string | null;
}

const PAGE_SIZE = 50;

const BAND_STYLE: Record<string, string> = {
  HIGH: "bg-rose-400/10 text-rose-300",
  MEDIUM: "bg-amber-400/10 text-amber-300",
  LOW: "bg-emerald-400/10 text-emerald-300",
};

/**
 * External Intelligence browser (DOMAIN B). Snapshot of the 2026-09-25
 * manual sync: full-corpus aggregates describe all 15,316 records while
 * row browsing covers the latest 2,852. Never cases, never merged into
 * production counts. Review + correlation actions are permission-gated
 * server-side; 403s surface as honest locked notes.
 */
export function GovExternalIntelView() {
  const [rows, setRows] = useState<ExtIoc[] | null>(null);
  const [agg, setAgg] = useState<Aggregates | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [threat, setThreat] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, string> | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [corr, setCorr] = useState<Record<string, { loading: boolean; result: null | Array<{ caseNumber?: string; caseId?: string; value: string }> ; error?: string }>>({});

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/data/ext-iocs-week.json", { cache: "force-cache" }).then((r) => {
        if (!r.ok) throw new Error(`snapshot (${r.status})`);
        return r.json();
      }),
      fetch("/data/ext-aggregates.json", { cache: "force-cache" }).then((r) => {
        if (!r.ok) throw new Error(`aggregates (${r.status})`);
        return r.json();
      }),
    ])
      .then(([rowsJson, aggJson]) => {
        if (!alive) return;
        setRows(rowsJson as ExtIoc[]);
        setAgg(aggJson as Aggregates);
      })
      .catch(() => { if (alive) setLoadError("External snapshot unavailable."); });
    fetch("/gov/api/external/reviews", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 403) { setReviewNote("Review actions need the indicator-correlation permission."); return; }
        if (!r.ok) return;
        const j = (await r.json()) as { reviewed: Record<string, string> };
        setReviews(j.reviewed ?? {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!type || r.indicator_type === type) &&
      (!source || r.source === source) &&
      (!threat || r.threat_category === threat) &&
      (!needle || r.normalized_value.toLowerCase().includes(needle)),
    );
  }, [rows, type, source, threat, q]);

  const last = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const reset = useCallback(() => {
    setType(""); setSource(""); setThreat(""); setQ(""); setPage(1);
  }, []);

  const markReviewed = useCallback(async (row: ExtIoc) => {
    if (reviewBusy) return;
    setReviewBusy(row.record_key);
    try {
      const res = await fetch("/gov/api/external/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordKey: row.record_key, source: row.source }),
      });
      if (res.status === 403) { setReviewNote("Review actions need the indicator-correlation permission."); return; }
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { at: string };
      setReviews((m) => ({ ...(m ?? {}), [row.record_key]: j.at }));
    } catch {
      setReviewNote("Unable to record review.");
    } finally {
      setReviewBusy(null);
    }
  }, [reviewBusy]);

  const correlate = useCallback(async (row: ExtIoc) => {
    setCorr((m) => ({ ...m, [row.record_key]: { loading: true, result: null } }));
    try {
      const res = await fetch("/gov/api/external/correlate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: row.normalized_value }),
      });
      if (res.status === 403) {
        setCorr((m) => ({ ...m, [row.record_key]: { loading: false, result: null, error: "Correlation needs the indicator-correlation permission." } }));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { matches: Array<{ caseNumber?: string; caseId?: string; value: string }> };
      setCorr((m) => ({ ...m, [row.record_key]: { loading: false, result: j.matches ?? [] } }));
    } catch {
      setCorr((m) => ({ ...m, [row.record_key]: { loading: false, result: null, error: "Correlation check failed." } }));
    }
  }, []);

  const types = useMemo(() => [...new Set((rows ?? []).map((r) => r.indicator_type))].sort(), [rows]);
  const sources = useMemo(() => [...new Set((rows ?? []).map((r) => r.source))].sort(), [rows]);
  const threats = useMemo(() => [...new Set((rows ?? []).map((r) => r.threat_category))].sort(), [rows]);

  return (
    <div className="space-y-5">
      <section aria-label="External intelligence summary" className="gov-panel space-y-3 p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-100">External Intelligence <span className="ml-1 rounded-full bg-sky-400/10 px-2 py-0.5 align-middle font-mono text-[10px] font-bold uppercase tracking-widest text-sky-300">Domain B · not cases</span></h2>
          <p className="mt-1 text-sm text-slate-400">
            Manual sync 2026-09-25 (batch ext-20260925-manual01). Aggregates describe the full corpus;
            row browsing covers the latest snapshot. Nothing here enters production case counts.
          </p>
        </div>
        {!agg ? (
          <p className="text-sm text-slate-500">{loadError ?? "Loading snapshot..."}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">Corpus records</p>
              <p className="mt-1 font-mono text-2xl text-slate-100">{agg.record_count.toLocaleString("en-IN")}</p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-600">{agg.actual_source_start} → {agg.actual_source_end}</p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">By type</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {Object.entries(agg.by_type).map(([k, v]) => `${k}: ${v.toLocaleString("en-IN")}`).join(" · ")}
              </p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">By source</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {Object.entries(agg.by_source).map(([k, v]) => `${k.split("-")[0]}: ${v.toLocaleString("en-IN")}`).join(" · ")}
              </p>
            </article>
            <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">Top threats</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {Object.entries(agg.by_threat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}: ${v.toLocaleString("en-IN")}`).join(" · ")}
              </p>
            </article>
          </div>
        )}
        {loadError && <p className="text-sm text-rose-300" role="alert">{loadError}</p>}
      </section>

      <section aria-label="External IOC browser" className="gov-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="IOC filters">
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by indicator type" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
            <option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} aria-label="Filter by source" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
            <option value="">All sources</option>{sources.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={threat} onChange={(e) => { setThreat(e.target.value); setPage(1); }} aria-label="Filter by threat" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
            <option value="">All threats</option>{threats.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} maxLength={320} placeholder="Search value..." aria-label="Search indicator values" className="min-w-0 flex-1 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-200" />
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
        {reviewNote && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{reviewNote}</p>}

        {!rows ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading snapshot...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No indicators match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700 text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th scope="col" className="px-2 py-2">Indicator</th><th scope="col" className="px-2 py-2">Type</th><th scope="col" className="px-2 py-2">Threat</th><th scope="col" className="px-2 py-2">Rules</th><th scope="col" className="px-2 py-2">Seen</th><th scope="col" className="px-2 py-2">Review</th></tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <React.Fragment key={r.record_key}>
                    <tr className="border-b border-slate-800/60">
                      <td className="max-w-64 truncate px-2 py-2 font-mono text-slate-200" title={r.normalized_value}>
                        <button type="button" onClick={() => setExpanded((e) => (e === r.record_key ? null : r.record_key))} className="hover:text-teal-300 hover:underline" aria-expanded={expanded === r.record_key}>
                          {r.normalized_value}
                        </button>
                      </td>
                      <td className="px-2 py-2 font-mono text-teal-300">{r.indicator_type}</td>
                      <td className="px-2 py-2 text-slate-300">{r.threat_category}</td>
                      <td className="px-2 py-2">
                        {r.enrichment ? (
                          <span className={clsx("rounded-full px-2 py-0.5 font-mono text-[10px] font-bold", BAND_STYLE[r.enrichment.rules_band] ?? "bg-slate-700/40 text-slate-300")}>
                            {r.enrichment.rules_band} {r.enrichment.rules_score}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-500">{r.observed_at ? new Date(r.observed_at).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">
                        {reviews && reviews[r.record_key] ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Reviewed</span>
                        ) : reviews ? (
                          <button type="button" disabled={reviewBusy === r.record_key} onClick={() => void markReviewed(r)} className="rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-teal-400/40 disabled:opacity-50">
                            {reviewBusy === r.record_key ? "Saving..." : "Mark reviewed"}
                          </button>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                    {expanded === r.record_key && (
                      <tr className="border-b border-slate-800 bg-slate-900/40">
                        <td colSpan={6} className="px-4 py-3 text-xs leading-relaxed text-slate-400">
                          <p><span className="font-mono uppercase text-slate-500">Source:</span> {r.source} · {r.source_record_id} · reporter {r.reporter ?? "—"}</p>
                          <p><span className="font-mono uppercase text-slate-500">Provenance:</span> <a className="text-teal-300 underline" href={r.source_url ?? undefined} target="_blank" rel="noreferrer">{r.source_url ?? "—"}</a> · status {r.status} · first {r.first_seen ? new Date(r.first_seen).toLocaleDateString("en-IN") : "—"} · last {r.last_seen ? new Date(r.last_seen).toLocaleDateString("en-IN") : "—"}</p>
                          {r.enrichment && <p><span className="font-mono uppercase text-slate-500">Rule signals:</span> {r.enrichment.rules_signals.join(", ") || "none"} <span className="text-slate-600">(suggestion, not verdict)</span></p>}
                          <p><span className="font-mono uppercase text-slate-500">Tags:</span> {(r.tags ?? []).join(", ") || "—"}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => void correlate(r)} disabled={corr[r.record_key]?.loading} className="rounded border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-teal-400/40 disabled:opacity-50">
                              {corr[r.record_key]?.loading ? "Checking..." : "Correlate with my cases"}
                            </button>
                            {corr[r.record_key]?.error && <span className="text-rose-300">{corr[r.record_key].error}</span>}
                            {corr[r.record_key]?.result && (
                              corr[r.record_key].result!.length === 0
                                ? <span className="text-slate-500">No scoped case contains this indicator.</span>
                                : <span className="text-slate-300">Possible shared indicator — observed in {corr[r.record_key].result!.length} scoped match(es):{" "}
                                  {corr[r.record_key].result!.slice(0, 5).map((m, i) => (
                                    <span key={i} className="font-mono text-teal-300">{m.caseNumber ?? m.caseId ?? m.value}{i < Math.min(4, corr[r.record_key].result!.length - 1) ? ", " : ""}</span>
                                  ))}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{filtered.length.toLocaleString("en-IN")} snapshot rows · full corpus {agg ? agg.record_count.toLocaleString("en-IN") : "—"}</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button>
            <span>{page} / {last}</span>
            <button type="button" disabled={page >= last} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Next</button>
          </span>
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Rule bands are triage suggestions from {rows?.[0]?.enrichment ? "url-risk-rules-v1" : "the versioned rule engine"}; statistical scores live in ML Intelligence with their OOD caveat. Correlation wording stays at “possible shared indicator” unless verified evidence exists.
        </p>
        <p className="text-center text-xs text-slate-600">
          Related: <Link href="/gov/indicators" className="text-teal-300 underline">Indicator Intelligence</Link> (production) · <Link href="/gov/ml" className="text-teal-300 underline">ML Intelligence</Link> · <Link href="/gov/sources" className="text-teal-300 underline">Data Sources</Link>
        </p>
      </section>
    </div>
  );
}

export function GovExternalIntelRefreshHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <RefreshCw className="h-3 w-3" /> Manual sync 2026-09-25 · scheduled sync architecture documented in sync-health
    </span>
  );
}

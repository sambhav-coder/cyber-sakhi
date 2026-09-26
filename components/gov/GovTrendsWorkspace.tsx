"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { RefreshCw, RotateCcw } from "lucide-react";

interface TrendsResult {
  rangeLabel: string;
  bucket?: "day" | "week";
  casesOverTime: Array<{ day: string; count: number }>;
  byStatus: Array<{ label: string; count: number }>;
  byRisk: Array<{ label: string; count: number }>;
  byThreat: Array<{ label: string; count: number }>;
  byState: Array<{ label: string; count: number }>;
  indicatorRecurrence: Array<{ value: string; type: string; cases: number; firstSeen: string | null; lastSeen: string | null }>;
  totals: { total: number; prevPeriod: number; changePct: number | null };
}

const PRESETS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "custom", label: "Custom" },
];

const THREAT_OPTIONS = ["PHISHING", "FINANCIAL_FRAUD", "BLACKMAIL", "THREAT", "OTHER"];
const RISK_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_OPTIONS = ["NEW", "TRIAGED", "ASSIGNED", "UNDER_INVESTIGATION", "AWAITING_EVIDENCE", "RESOLVED", "CLOSED"];

function BarList({ items, emptyText }: { items: Array<{ label: string; count: number }>; emptyText: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);
  if (items.length === 0) return <p className="py-4 text-center text-xs text-slate-600">{emptyText}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((x) => (
        <li
          key={x.label}
          className="flex items-center gap-2 text-sm"
          title={total > 0 ? `${x.label}: ${x.count} (${((x.count / total) * 100).toFixed(1)}%)` : `${x.label}: ${x.count}`}
        >
          <span className="w-32 shrink-0 truncate text-slate-300">{x.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
            <span className="block h-full rounded bg-teal-400/70" style={{ width: `${(x.count / max) * 100}%` }} />
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-slate-400">{x.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function GovTrendsWorkspace() {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [threat, setThreat] = useState("");
  const [risk, setRisk] = useState("");
  const [status, setStatus] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [data, setData] = useState<TrendsResult | null>(null);
  // Loading-first: the first fetch is in flight on mount, so "no data" copy
  // must never flash before it resolves.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  // State options come from the scoped cases table; officers without
  // case.view_meta get a 403 here and simply see no location filter.
  useEffect(() => {
    let alive = true;
    fetch("/gov/api/dashboard/filters", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as { states?: string[] };
        if (alive && Array.isArray(j.states)) setStateOptions(j.states);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!stateCode) {
      setDistrictOptions([]);
      setDistrictCode("");
      return;
    }
    let alive = true;
    fetch(`/gov/api/dashboard/filters?state=${encodeURIComponent(stateCode)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as { districts?: string[] };
        if (alive && Array.isArray(j.districts)) setDistrictOptions(j.districts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stateCode]);

  const load = useCallback(async () => {
    if (preset === "custom") {
      if (!from || !to) {
        setValidationError("Custom range needs both a from-date and a to-date.");
        return;
      }
      if (Date.parse(from) > Date.parse(to)) {
        setValidationError("From-date must be on or before to-date.");
        return;
      }
    }
    setValidationError(null);
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (preset === "custom") {
        p.set("from", from);
        p.set("to", to);
      } else {
        p.set("days", preset);
      }
      if (threat) p.set("threat", threat);
      if (risk) p.set("risk", risk);
      if (status) p.set("status", status);
      if (stateCode) p.set("state", stateCode);
      if (districtCode) p.set("district", districtCode);
      const res = await fetch(`/gov/api/trends?${p.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired — please sign in again.");
        if (res.status === 403) throw new Error("Your role cannot view analytics.");
        throw new Error(`Unable to load trends (${res.status}).`);
      }
      setData((await res.json()) as TrendsResult);
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load trends.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, from, to, threat, risk, status, stateCode, districtCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = useCallback(() => {
    setPreset("30");
    setFrom("");
    setTo("");
    setThreat("");
    setRisk("");
    setStatus("");
    setStateCode("");
    setDistrictCode("");
    setValidationError(null);
  }, []);

  const activeFilterCount = useMemo(
    () =>
      [threat, risk, status, stateCode, districtCode].filter(Boolean).length +
      (preset === "custom" ? 1 : 0),
    [threat, risk, status, stateCode, districtCode, preset],
  );

  const max = Math.max(1, ...(data?.casesOverTime ?? []).map((x) => x.count));
  const emerging = data?.totals.changePct !== null && (data?.totals.changePct ?? 0) >= 30;
  const days = data?.casesOverTime ?? [];
  const bucket = data?.bucket ?? "day";
  const bucketNoun = bucket === "week" ? "week" : "day";
  const firstDay = days[0]?.day ?? "—";
  const lastDay = days[days.length - 1]?.day ?? "—";

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <section aria-label="Trends filters" className="gov-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Analytics &amp; Trends</h2>
            <p className="mt-1 text-sm text-slate-400">
              Every filter narrows the live scoped query. An emerging label requires ≥30% growth over the
              preceding equal-length period.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-teal-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-teal-300">
                {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
              </span>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset filters
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-1.5 text-xs font-bold text-teal-200 hover:bg-teal-400/20 disabled:opacity-50"
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range preset">
          {PRESETS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPreset(r.key)}
              aria-pressed={preset === r.key}
              className={clsx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                preset === r.key
                  ? "border-teal-400/50 bg-teal-400/10 text-teal-200"
                  : "border-slate-700/60 text-slate-400 hover:border-teal-400/30 hover:text-slate-200",
              )}
            >
              {r.label}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input
                type="date"
                aria-label="From date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                aria-label="To date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
              />
            </>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Threat category
            <select value={threat} onChange={(e) => setThreat(e.target.value)} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
              <option value="">All categories</option>
              {THREAT_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Severity (risk)
            <select value={risk} onChange={(e) => setRisk(e.target.value)} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
              <option value="">All severities</option>
              {RISK_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          {stateOptions.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              State
              <select
                value={stateCode}
                onChange={(e) => {
                  setStateCode(e.target.value);
                  setDistrictCode("");
                }}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          {districtOptions.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              District
              <select value={districtCode} onChange={(e) => setDistrictCode(e.target.value)} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
                <option value="">All districts</option>
                {districtOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {validationError && (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200" role="alert">
            {validationError}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200" role="alert">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline hover:no-underline">Retry</button>
          </p>
        )}
      </section>

      {loading && !data ? (
        <section className="gov-panel p-5" aria-label="Loading trends">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            <span className="text-sm">Loading scoped analytics…</span>
          </div>
        </section>
      ) : data && (
        <>
          {/* Summary cards */}
          <section aria-label="Period summary" className="grid gap-4 sm:grid-cols-3">
            <article className="gov-panel p-4">
              <p className="text-xs text-slate-500">Cases in period</p>
              <p className="mt-2 font-mono text-3xl text-slate-100">{data.totals.total}</p>
            </article>
            <article className="gov-panel p-4">
              <p className="text-xs text-slate-500">Previous equal period</p>
              <p className="mt-2 font-mono text-3xl text-slate-100">{data.totals.prevPeriod}</p>
            </article>
            <article className="gov-panel p-4">
              <p className="text-xs text-slate-500">Period change</p>
              <p className="mt-2 font-mono text-3xl text-slate-100">
                {data.totals.changePct === null ? "—" : `${data.totals.changePct}%`}
              </p>
              {emerging && <p className="mt-1 text-xs font-semibold text-amber-200">Emerging: ≥30% threshold met</p>}
              {data.totals.changePct === null && (
                <p className="mt-1 text-[11px] text-slate-600">No prior-period baseline, so no change is computed.</p>
              )}
            </article>
          </section>

          {/* Time series */}
          <section aria-label="Cases over time" className="gov-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-100">Cases over time</h3>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                  {firstDay} → {lastDay} · one bar per {bucketNoun} · peak {max}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
                aria-expanded={showTable}
              >
                {showTable ? "Hide data table" : "Show data table"}
              </button>
            </div>
            {days.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-600">No cases match the current filters.</p>
            ) : (
              <>
                <div
                  className="mt-4 flex h-44 items-end gap-1"
                  role="img"
                  aria-label={`${bucket === "week" ? "Weekly" : "Daily"} case counts from ${firstDay} to ${lastDay}, peak ${max} cases in a ${bucketNoun}`}
                >
                  {days.map((x) => (
                    <div
                      key={x.day}
                      title={`${x.day}: ${x.count} case${x.count === 1 ? "" : "s"}`}
                      className="min-w-1 flex-1 rounded-t bg-teal-400/70 transition hover:bg-teal-300"
                      style={{ height: `${Math.max(3, (x.count / max) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-600" aria-hidden>
                  <span>{firstDay}</span>
                  <span>{lastDay}</span>
                </div>
                {showTable && (
                  <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr><th scope="col" className="px-3 py-2">{bucket === "week" ? "Week starting" : "Day"}</th><th scope="col" className="px-3 py-2 text-right">Cases</th></tr>
                      </thead>
                      <tbody>
                        {days.map((x) => (
                          <tr key={x.day} className="border-t border-slate-800/60 text-slate-300">
                            <td className="px-3 py-1.5 font-mono">{x.day}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{x.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Distributions */}
          <section aria-label="Distributions" className="grid gap-4 lg:grid-cols-3">
            <article className="gov-panel p-5">
              <h3 className="text-sm font-bold text-slate-100">By threat category</h3>
              <BarList items={data.byThreat} emptyText="No data under current filters." />
            </article>
            <article className="gov-panel p-5">
              <h3 className="text-sm font-bold text-slate-100">By severity</h3>
              <BarList items={data.byRisk} emptyText="No data under current filters." />
            </article>
            <article className="gov-panel p-5">
              <h3 className="text-sm font-bold text-slate-100">By status</h3>
              <BarList items={data.byStatus} emptyText="No data under current filters." />
            </article>
          </section>

          <section aria-label="Geography and recurrence" className="grid gap-4 lg:grid-cols-2">
            <article className="gov-panel p-5">
              <h3 className="text-sm font-bold text-slate-100">By state</h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Officer-entered, unverified
              </p>
              <BarList items={data.byState.slice(0, 12)} emptyText="No located cases under current filters." />
            </article>
            <article className="gov-panel p-5">
              <h3 className="text-sm font-bold text-slate-100">Recurring indicators</h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Observed in &gt;1 scoped case in-window
              </p>
              {data.indicatorRecurrence.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600">No recurring indicator in this window.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th scope="col" className="py-2 pr-2">Indicator</th>
                        <th scope="col" className="py-2 pr-2">Type</th>
                        <th scope="col" className="py-2 pr-2 text-right">Cases</th>
                        <th scope="col" className="py-2 text-right">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.indicatorRecurrence.map((r) => (
                        <tr key={`${r.type}:${r.value}`} className="border-b border-slate-800/50 text-slate-300">
                          <td className="max-w-44 truncate py-2 pr-2 font-mono" title={r.value}>{r.value}</td>
                          <td className="py-2 pr-2 font-mono text-teal-300">{r.type}</td>
                          <td className="py-2 pr-2 text-right font-mono">{r.cases}</td>
                          <td className="py-2 text-right font-mono text-slate-500">
                            {r.lastSeen ? new Date(r.lastSeen).toLocaleDateString("en-IN") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <p className="pb-2 text-center font-mono text-[10px] leading-relaxed text-slate-600">
            {refreshedAt ? `Refreshed ${new Date(refreshedAt).toLocaleString("en-IN")} · ` : ""}
            Source: Cyber-Sakhi Cases (live scoped query) · scope enforced before grouping · each case counted once per
            facet · threat labels use the canonical read-time mapping · external data: not connected.
          </p>
        </>
      )}

      {!loading && !data && !error && (
        <p className="gov-panel p-8 text-center text-sm text-slate-500">No analytics to show yet.</p>
      )}

      <p className="text-center text-xs text-slate-600">
        Need case-level detail? <Link href="/gov/cases" className="text-teal-300 underline hover:no-underline">Case Explorer</Link>
        {" "}· geographic drill-down lives in <Link href="/gov/geography" className="text-teal-300 underline hover:no-underline">Map</Link>.
      </p>
    </div>
  );
}

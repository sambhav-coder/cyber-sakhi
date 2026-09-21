"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Database,
  ExternalLink,
  Activity,
  AlertTriangle,
  ListChecks,
  CheckCircle2,
  FolderOpen,
  Search,
  LockKeyhole,
} from "lucide-react";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import type { GovRole } from "@/lib/gov/govTypes";

export interface GovDashboardMetricsSheet {
  generatedAt: string;
  window: { label: string; from: string | null; to: string | null };
  filters: { stateCode: string | null; districtCode: string | null };
  metrics: {
    total: number;
    new: number;
    highRisk: number;
    underInvestigation: number;
    resolved: number;
    open: number;
  };
  threatDistribution: Array<{ label: string; count: number }>;
  riskDistribution: Array<{ label: string; count: number }>;
  statusDistribution: Array<{ label: string; count: number }>;
}

interface JarProps {
  officer: {
    id: string;
    role: string;
    scope: string;
    state_code: string | null;
    district_code: string | null;
    full_name: string;
    official_email: string;
    department: string | null;
    officer_code: string;
  };
  options: { states: string[]; districts: string[] };
  initial: GovDashboardMetricsSheet;
}

const RANGES: Array<{ key: string; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "custom", label: "Custom" },
];

const METRIC_CARDS: Array<{ key: keyof GovDashboardMetricsSheet["metrics"]; label: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = [
  { key: "total", label: "Total Cases", icon: FolderOpen, accent: "text-teal-300" },
  { key: "new", label: "New (window)", icon: Activity, accent: "text-sky-300" },
  { key: "highRisk", label: "High Risk", icon: AlertTriangle, accent: "text-rose-300" },
  { key: "underInvestigation", label: "Under Investigation", icon: ListChecks, accent: "text-amber-300" },
  { key: "resolved", label: "Resolved", icon: CheckCircle2, accent: "text-emerald-300" },
  { key: "open", label: "Open", icon: Search, accent: "text-fuchsia-300" },
];

const WINDOW_LABELS: Record<string, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
  custom: "custom range",
};

export const GovDashboardView: React.FC<JarProps> = ({ officer, options, initial }) => {
  const canReadCases = roleHasDefaultPermission(officer.role as GovRole, "case.view_meta");

  const [range, setRange] = useState(initial.window.label);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stateCode, setStateCode] = useState<string>("");
  const [districtCode, setDistrictCode] = useState<string>("");
  const [sheet, setSheet] = useState<GovDashboardMetricsSheet>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districts = useMemo(() => options.districts, [options.districts]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      if (stateCode) params.set("state", stateCode);
      if (districtCode) params.set("district", districtCode);
      const res = await fetch(`/gov/api/dashboard?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not load metrics for the selected range.");
        return;
      }
      setSheet((await res.json()) as GovDashboardMetricsSheet);
    } catch {
      setError("Could not load metrics for the selected range.");
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo, stateCode, districtCode]);

  useEffect(() => {
    if (!canReadCases) return;
    void refresh();
  }, [refresh, canReadCases]);

  if (!canReadCases) {
    return (
      <div className="gov-panel flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/60 text-slate-400">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-100">No case-data access for this role</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {officer.role} is role-scoped to {officer.scope} without case-metrics permissions.
            Aggregate case figures are not shown for governance-only and audit-only roles.
          </p>
        </div>
      </div>
    );
  }

  const m = sheet.metrics;
  const maxThreat = Math.max(1, ...sheet.threatDistribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section aria-label="Dashboard filters" className="gov-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={clsx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                range === r.key
                  ? "border-teal-400/50 bg-teal-400/10 text-teal-200"
                  : "border-slate-700/60 text-slate-400 hover:border-teal-400/30 hover:text-slate-200",
              )}
            >
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                aria-label="To date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {options.states.length > 0 && officer.scope !== "DISTRICT" && (
            <select
              aria-label="Filter by state"
              value={stateCode}
              onChange={(e) => {
                setStateCode(e.target.value);
                setDistrictCode("");
              }}
              className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">All states</option>
              {options.states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {districts.length > 0 && (officer.scope === "STATE" || officer.scope === "ALL_INDIA") && stateCode && (
            <select
              aria-label="Filter by district"
              value={districtCode}
              onChange={(e) => setDistrictCode(e.target.value)}
              className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {officer.scope === "DISTRICT" && stateCode && (
            <span className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs font-semibold text-slate-300">
              {stateCode}
            </span>
          )}
          {loading && <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">loading…</span>}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">
          {error}
        </div>
      )}

      {/* Metric cards */}
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {METRIC_CARDS.map(({ key, label, icon: Icon, accent }) => (
          <article key={key} className="gov-panel flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</h3>
              <Icon className={clsx("h-4 w-4", accent)} />
            </div>
            <p className="font-mono text-3xl font-bold text-slate-100">{m[key]}</p>
          </article>
        ))}
      </section>

      {/* Source separation */}
      <section aria-label="Data sources" className="grid gap-4 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-teal-400/25 bg-teal-400/5 p-4">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
          <div>
            <p className="text-xs font-bold text-slate-100">
              Source: Cyber-Sakhi Cases <span className="font-mono font-normal text-teal-300">(live DB)</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              All figures above are computed from the scoped cases table at request time.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/30 p-4">
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-xs font-bold text-slate-400">Source: External government data — Not connected</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              No external intelligence feed is connected. This section stays separate and empty until one is authorized.
            </p>
          </div>
        </div>
      </section>

      {/* Distributions */}
      <section aria-label="Distributions" className="grid gap-4 lg:grid-cols-2">
        <article className="gov-panel p-5">
          <h3 className="text-sm font-bold text-slate-100">Threat-category distribution</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
            {WINDOW_LABELS[sheet.window.label] ?? sheet.window.label} · scoped cases
          </p>
          {sheet.threatDistribution.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">No data in this window.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {sheet.threatDistribution.map((d) => (
                <li key={d.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs text-slate-300">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-teal-400/70"
                      style={{ width: `${(d.count / maxThreat) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-slate-400">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="gov-panel p-5">
          <h3 className="text-sm font-bold text-slate-100">Risk & status mix</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
            {WINDOW_LABELS[sheet.window.label] ?? sheet.window.label} · scoped cases
          </p>
          <div className="mt-4 grid grid-cols-2 gap-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Risk level</p>
              <ul className="mt-2 space-y-1.5">
                {sheet.riskDistribution.map((d) => (
                  <li key={d.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{d.label}</span>
                    <span className="font-mono text-slate-400">{d.count}</span>
                  </li>
                ))}
                {sheet.riskDistribution.length === 0 && <li className="text-xs text-slate-600">No data.</li>}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</p>
              <ul className="mt-2 space-y-1.5">
                {sheet.statusDistribution.map((d) => (
                  <li key={d.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{d.label}</span>
                    <span className="font-mono text-slate-400">{d.count}</span>
                  </li>
                ))}
                {sheet.statusDistribution.length === 0 && <li className="text-xs text-slate-600">No data.</li>}
              </ul>
            </div>
          </div>
        </article>
      </section>

      <p className="pb-2 text-center font-mono text-[10px] text-slate-600">
        Data as of {new Date(sheet.generatedAt).toLocaleString("en-IN")} · every figure is a live scoped query, never cached
        or sampled.
      </p>
    </div>
  );
};
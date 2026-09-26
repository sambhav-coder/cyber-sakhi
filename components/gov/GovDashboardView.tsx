"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  RefreshCw,
  MapPin,
  FileBarChart2,
  ChevronRight,
  Globe,
  Cpu,
} from "lucide-react";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import type { GovRole } from "@/lib/gov/govTypes";
import extAggregates from "@/public/data/ext-aggregates.json";
import mlMetadata from "@/docs/ml/url-risk-v1/training-metadata.json";
import mlEvaluation from "@/docs/ml/url-risk-v1/evaluation.json";

export interface GovDashboardMetricsSheet {
  generatedAt: string;
  window: { label: string; from: string | null; to: string | null };
  filters: { stateCode: string | null; districtCode: string | null };
  metrics: {
    total: number;
    windowTotal: number;
    new: number;
    highRisk: number;
    underInvestigation: number;
    resolved: number;
    open: number;
    closed: number;
    awaitingEvidence: number;
    triageNeeded: number;
    unassigned: number;
    assignedToMe: number;
  };
  threatDistribution: Array<{ label: string; count: number }>;
  riskDistribution: Array<{ label: string; count: number }>;
  statusDistribution: Array<{ label: string; count: number }>;
}

interface OfficerProp {
  id: string;
  role: string;
  scope: string;
  state_code: string | null;
  district_code: string | null;
  full_name: string;
  official_email: string;
  department: string | null;
  officer_code: string;
}

interface JarProps {
  officer: OfficerProp;
  options: { states: string[]; districts: string[] };
  initial: GovDashboardMetricsSheet;
  /** Server-side fetch failed: render unavailable-state, never zeros. */
  initialError?: string | null;
}

interface CaseRow {
  id: string;
  caseNumber: string;
  threatCategory: string | null;
  riskLevel: string | null;
  govStatus: string;
  stateCode: string | null;
  districtCode: string | null;
  createdAt: string;
  assignedOfficer: { fullName: string | null; officerCode: string | null } | null;
}

interface TrendsData {
  totals: { total: number; prevPeriod: number; changePct: number | null };
  bucket?: "day" | "week";
  casesOverTime: Array<{ day: string; count: number }>;
}

interface GeoRegion {
  regionCode: string;
  displayName: string;
  totalCases: number;
  intensityLevel: string;
  suppressed?: boolean;
}

interface GeoContract {
  generatedAt: string;
  source: string;
  totals: { cases: number };
  regions: GeoRegion[];
  excludedCounts?: { unlocated: number; invalidOrIncomplete: number };
}

const RANGES: Array<{ key: string; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "custom", label: "Custom" },
];

const RANGE_TO_DAYS: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90, custom: 30 };

const METRIC_CARDS: Array<{
  key: keyof GovDashboardMetricsSheet["metrics"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  href: string;
  hint: string;
}> = [
  { key: "total", label: "Accessible Cases (All Time)", icon: FolderOpen, accent: "text-teal-300", href: "/gov/cases", hint: "All accessible cases, regardless of selected date window" },
  { key: "new", label: "New (window)", icon: Activity, accent: "text-sky-300", href: "/gov/cases", hint: "Open case explorer" },
  { key: "highRisk", label: "High Risk", icon: AlertTriangle, accent: "text-rose-300", href: "/gov/queue", hint: "Open risk-priority queue" },
  { key: "underInvestigation", label: "Under Investigation", icon: ListChecks, accent: "text-amber-300", href: "/gov/queue", hint: "Open investigation queue" },
  { key: "resolved", label: "Resolved", icon: CheckCircle2, accent: "text-emerald-300", href: "/gov/cases", hint: "Open case explorer" },
  { key: "open", label: "Open", icon: Search, accent: "text-fuchsia-300", href: "/gov/cases", hint: "Open case explorer" },
];

const WORKFLOW_CARDS: Array<{
  key: "awaitingEvidence" | "closed" | "triageNeeded" | "unassigned" | "assignedToMe";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  href: string;
  hint: string;
}> = [
  { key: "triageNeeded", label: "Needs Triage", icon: AlertTriangle, accent: "text-orange-300", href: "/gov/queue", hint: "Open triage queue" },
  { key: "awaitingEvidence", label: "Awaiting Evidence", icon: FolderOpen, accent: "text-amber-300", href: "/gov/queue", hint: "Open investigation queue" },
  { key: "unassigned", label: "Unassigned", icon: Search, accent: "text-slate-300", href: "/gov/queue", hint: "Open investigation queue" },
  { key: "assignedToMe", label: "Assigned to Me", icon: ListChecks, accent: "text-teal-300", href: "/gov/cases", hint: "Open case explorer" },
  { key: "closed", label: "Closed", icon: CheckCircle2, accent: "text-slate-400", href: "/gov/cases", hint: "Open case explorer" },
];

const WINDOW_LABELS: Record<string, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
  custom: "custom range",
};

const SCOPE_LABELS: Record<string, string> = {
  ALL_INDIA: "National scope",
  STATE: "State scope",
  DISTRICT: "District scope",
  ASSIGNED_CASES: "Assigned-cases scope",
};

function pct(count: number, total: number): string | null {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return null;
  return `${((count / total) * 100).toFixed(1)}%`;
}

export const GovDashboardView: React.FC<JarProps> = ({ officer, options, initial, initialError = null }) => {
  const canReadCases = roleHasDefaultPermission(officer.role as GovRole, "case.view_meta");
  const canViewAnalytics = roleHasDefaultPermission(officer.role as GovRole, "analytics.view");
  const canViewGeo = roleHasDefaultPermission(officer.role as GovRole, "geo.view");
  const canExport = roleHasDefaultPermission(officer.role as GovRole, "report.export");

  const [range, setRange] = useState(initial.window.label);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stateCode, setStateCode] = useState<string>("");
  const [districtCode, setDistrictCode] = useState<string>("");
  const [stateOptions, setStateOptions] = useState<string[]>(options.states);
  const [districtOptions, setDistrictOptions] = useState<string[]>(options.districts);
  const [sheet, setSheet] = useState<GovDashboardMetricsSheet>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  // lastRefresh is null until a REAL query succeeds: with no successful load
  // the view must show unavailable-state, never zeros.
  const [lastRefresh, setLastRefresh] = useState<string | null>(initialError ? null : (initial.generatedAt ?? null));
  const loadingRef = useRef(false);

  // Previews (each independently scoped, honest about its own state).
  const [trend, setTrend] = useState<TrendsData | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [recent, setRecent] = useState<CaseRow[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [queue, setQueue] = useState<CaseRow[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [geo, setGeo] = useState<GeoContract | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const districts = useMemo(() => districtOptions, [districtOptions]);

  /**
   * Client-side mirror of the server's govDashboardWindow: every preview
   * (trends, recent, queue, geography) receives the SAME window bounds as
   * the metrics query, so the date filter actually scopes all of them.
   * UTC throughout, matching the server. Custom "to" is end-of-day
   * inclusive; an empty custom bound means "no bound" (unwindowed).
   */
  const windowBounds = useCallback((): { from?: string; to?: string } => {
    const now = new Date();
    if (range === "today") {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { from: start.toISOString(), to: now.toISOString() };
    }
    if (range === "custom") {
      const out: { from?: string; to?: string } = {};
      if (customFrom && !Number.isNaN(Date.parse(customFrom))) {
        out.from = new Date(customFrom).toISOString();
      }
      if (customTo && !Number.isNaN(Date.parse(customTo))) {
        const end = new Date(customTo);
        end.setUTCHours(23, 59, 59, 999);
        out.to = end.toISOString();
      }
      return out;
    }
    const days = RANGE_TO_DAYS[range] ?? 7;
    return {
      from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
      to: now.toISOString(),
    };
  }, [range, customFrom, customTo]);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") {
        const b = windowBounds();
        if (b.from) params.set("from", b.from);
        if (b.to) params.set("to", b.to);
      }
      if (stateCode) params.set("state", stateCode);
      if (districtCode) params.set("district", districtCode);
      const res = await fetch(`/gov/api/dashboard?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired — please sign in again.");
        if (res.status === 403) throw new Error("Your role cannot view case metrics.");
        throw new Error("Could not load metrics for the selected range.");
      }
      const data = (await res.json()) as GovDashboardMetricsSheet;
      setSheet(data);
      setLastRefresh(data.generatedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load metrics for the selected range.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [range, customFrom, customTo, stateCode, districtCode, windowBounds]);

  useEffect(() => {
    if (!canReadCases) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, stateCode, districtCode]);

  // Narrow district options when a state is picked (server-derived, never hard-coded).
  useEffect(() => {
    if (!canReadCases) return;
    if (!stateCode) {
      setDistrictOptions(options.districts);
      return;
    }
    let alive = true;
    fetch(`/gov/api/dashboard/filters?state=${encodeURIComponent(stateCode)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { states: string[]; districts: string[] };
        if (alive && Array.isArray(data.districts)) setDistrictOptions(data.districts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stateCode, canReadCases, options.districts]);

  // Trend strip (requires analytics.view). Scoped by the SAME window and
  // location as the metrics cards: explicit from/to always wins over the
  // legacy days fallback, so Today/7d/30d/90d/Custom all re-query the
  // server instead of relabeling one dataset.
  useEffect(() => {
    if (!canViewAnalytics) return;
    let alive = true;
    setTrendLoading(true);
    setTrendError(null);
    const b = windowBounds();
    const p = new URLSearchParams();
    if (b.from) p.set("from", b.from);
    if (b.to) p.set("to", b.to);
    if (!b.from && !b.to) p.set("days", String(RANGE_TO_DAYS[range] ?? 7));
    if (stateCode) p.set("state", stateCode);
    if (districtCode) p.set("district", districtCode);
    fetch(`/gov/api/trends?${p.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Trends unavailable (${r.status}).`);
        const data = (await r.json()) as TrendsData;
        if (alive) setTrend(data);
      })
      .catch((e: unknown) => {
        if (alive) setTrendError(e instanceof Error ? e.message : "Trends unavailable.");
      })
      .finally(() => {
        if (alive) setTrendLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range, customFrom, customTo, stateCode, districtCode, canViewAnalytics, windowBounds]);

  // Recent cases preview (scoped server-side; links stay IDOR-safe).
  // Respects the selected date window and location like every other
  // Overview section — newest first within the window.
  useEffect(() => {
    if (!canReadCases) return;
    let alive = true;
    setRecentLoading(true);
    setRecentError(null);
    const p = new URLSearchParams({ page: "1", pageSize: "5" });
    const b = windowBounds();
    if (b.from) p.set("from", b.from);
    if (b.to) p.set("to", b.to);
    if (stateCode) p.set("state", stateCode);
    if (districtCode) p.set("district", districtCode);
    fetch(`/gov/api/cases?${p.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Recent cases unavailable (${r.status}).`);
        const data = (await r.json()) as { rows: CaseRow[] };
        if (alive) setRecent(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch((e: unknown) => {
        if (alive) setRecentError(e instanceof Error ? e.message : "Recent cases unavailable.");
      })
      .finally(() => {
        if (alive) setRecentLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canReadCases, stateCode, districtCode, range, customFrom, customTo, windowBounds]);

  // Investigation queue preview (NEW view, scoped server-side). Windowed by
  // the selected date filter so it reconciles with Needs Triage.
  useEffect(() => {
    if (!canReadCases) return;
    let alive = true;
    setQueueLoading(true);
    setQueueError(null);
    const qp = new URLSearchParams({ view: "NEW", pageSize: "5" });
    const qb = windowBounds();
    if (qb.from) qp.set("from", qb.from);
    if (qb.to) qp.set("to", qb.to);
    fetch(`/gov/api/queue?${qp.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Queue preview unavailable (${r.status}).`);
        const data = (await r.json()) as { newCases?: CaseRow[]; rows?: CaseRow[] };
        const rows = Array.isArray(data.newCases) ? data.newCases : Array.isArray(data.rows) ? data.rows : [];
        if (alive) setQueue(rows.slice(0, 5));
      })
      .catch((e: unknown) => {
        if (alive) setQueueError(e instanceof Error ? e.message : "Queue preview unavailable.");
      })
      .finally(() => {
        if (alive) setQueueLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canReadCases, range, customFrom, customTo, windowBounds]);

  // Geography preview (aggregate-only contract; never case IDs or coordinates).
  // Windowed and location-narrowed like the rest of the Overview.
  useEffect(() => {
    if (!canViewGeo) return;
    let alive = true;
    setGeoLoading(true);
    setGeoError(null);
    const gp = new URLSearchParams();
    const gb = windowBounds();
    if (gb.from) gp.set("from", gb.from);
    if (gb.to) gp.set("to", gb.to);
    if (stateCode) gp.set("state", stateCode);
    if (districtCode) gp.set("district", districtCode);
    const qs = gp.toString();
    fetch(`/gov/api/geo/map${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Geography preview unavailable (${r.status}).`);
        const data = (await r.json()) as GeoContract;
        if (alive) setGeo(data);
      })
      .catch((e: unknown) => {
        if (alive) setGeoError(e instanceof Error ? e.message : "Geography preview unavailable.");
      })
      .finally(() => {
        if (alive) setGeoLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canViewGeo, range, customFrom, customTo, stateCode, districtCode, windowBounds]);

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
  // No successful load yet: values must render as unavailable ("—"), never 0.
  const neverLoaded = !lastRefresh;
  const maxThreat = Math.max(1, ...sheet.threatDistribution.map((d) => d.count));
  const maxTrend = Math.max(1, ...(trend?.casesOverTime ?? []).map((x) => x.count));
  const totalForPct = m.windowTotal;
  const topGeo = [...(geo?.regions ?? [])].sort((a, b) => b.totalCases - a.totalCases).slice(0, 5);
  const scopeLabel = SCOPE_LABELS[officer.scope] ?? officer.scope;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section aria-label="Government overview header" className="gov-panel flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Government Overview</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Live investigation posture for your authorized jurisdiction. Every figure is a scoped
              server-side query — never sampled, never fabricated.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-teal-400/25 bg-teal-400/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-teal-300">
                {scopeLabel}
              </span>
              <span>
                Last refresh:{" "}
                {lastRefresh ? new Date(lastRefresh).toLocaleString("en-IN") : "never"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-2 text-xs font-bold text-teal-200 transition hover:bg-teal-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            {canExport && (
              <Link
                href="/gov/reports"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300"
              >
                <FileBarChart2 className="h-3.5 w-3.5" />
                Export
              </Link>
            )}
          </div>
        </div>

        {/* Filter bar: every control narrows the live backend query */}
        <div className="flex flex-col gap-3 border-t border-slate-800/70 pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
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
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-lg border border-slate-700/60 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {stateOptions.length > 0 && officer.scope !== "DISTRICT" && (
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
                {stateOptions.map((s) => (
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
            {(stateCode || districtCode) && (
              <button
                type="button"
                onClick={() => {
                  setStateCode("");
                  setDistrictCode("");
                }}
                className="rounded-lg border border-slate-700/60 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Reset
              </button>
            )}
            {loading && <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">loading…</span>}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void refresh()} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Metric cards */}
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {METRIC_CARDS.map(({ key, label, icon: Icon, accent, href, hint }) => (
          <Link
            key={key}
            href={href}
            title={hint}
            aria-label={`${label}: ${loading ? "loading" : neverLoaded && error ? "unavailable" : m[key]}. ${hint}`}
            className="gov-panel flex flex-col gap-3 p-4 transition hover:border-teal-400/40"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</h3>
              <Icon className={clsx("h-4 w-4", accent)} />
            </div>
            <p className={clsx("font-mono text-3xl font-bold text-slate-100", (loading || (neverLoaded && error)) && "animate-pulse text-slate-500")}>
              {loading ? "…" : neverLoaded && error ? "—" : m[key]}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              View <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </section>
      {/* Workflow posture: assignment and lifecycle states from the same scoped window */}
      <section aria-label="Workflow metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {WORKFLOW_CARDS.map(({ key, label, icon: Icon, accent, href, hint }) => (
          <Link
            key={key}
            href={href}
            title={hint}
            aria-label={`${label}: ${loading ? "loading" : neverLoaded && error ? "unavailable" : m[key]}. ${hint}`}
            className="gov-panel flex flex-col gap-3 p-4 transition hover:border-teal-400/40"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</h3>
              <Icon className={clsx("h-4 w-4", accent)} />
            </div>
            <p className={clsx("font-mono text-3xl font-bold text-slate-100", (loading || (neverLoaded && error)) && "animate-pulse text-slate-500")}>
              {loading ? "…" : neverLoaded && error ? "—" : m[key]}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              View <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </section>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600" aria-label="Metric scope and window">
        Total Cases counts every accessible case (all time); all other cards count the selected window
        ({WINDOW_LABELS[sheet.window.label] ?? sheet.window.label}) · scope {officer.scope}
        {officer.state_code ? ` · ${officer.state_code}` : ""}{officer.district_code ? ` / ${officer.district_code}` : ""}
        {lastRefresh ? ` · loaded ${new Date(lastRefresh).toLocaleString("en-IN")}` : " · never loaded successfully"}
      </p>
      {m.windowTotal === 0 && !loading && !error && (
        <p className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 px-4 py-3 text-center text-xs text-slate-500">
          No cases in scope {officer.scope}{officer.state_code ? ` (${officer.state_code}${officer.district_code ? ` / ${officer.district_code}` : ""})` : ""} for
          this reporting window — scope filtering (not missing data) is the usual cause.{" "}
          {m.total > 0 ? `${m.total} accessible case${m.total === 1 ? " exists" : "s exist"} outside it — open Case Explorer or widen the date range.` : "Widen the date range or reset location filters."}
        </p>
      )}

      {/* Trend strip */}
      <section aria-label="Cases over time" className="gov-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Cases over time</h3>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
              {WINDOW_LABELS[sheet.window.label] ?? sheet.window.label} · scoped cases · source: live DB
            </p>
          </div>
          {trend && !trendError && (
            <p className="text-xs text-slate-400">
              {trend.totals.total} in period · prev {trend.totals.prevPeriod} ·{" "}
              {trend.totals.changePct === null ? "change n/a" : `${trend.totals.changePct}%`}
            </p>
          )}
        </div>
        {!canViewAnalytics ? (
          <p className="flex items-center gap-2 py-6 text-center text-xs text-slate-600">
            <LockKeyhole className="h-4 w-4" /> Trend analytics is not granted to role {officer.role}.
          </p>
        ) : trendLoading && !trend ? (
          <div className="flex h-24 items-end gap-1 pt-4" aria-label="Loading trend">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="flex-1 animate-pulse rounded-t bg-slate-800" style={{ height: `${20 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        ) : trendError ? (
          <p className="py-6 text-center text-xs text-rose-300" role="alert">{trendError}</p>
        ) : !trend || trend.casesOverTime.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">No trend data in this window.</p>
        ) : (
          <>
            <div className="mt-4 flex h-36 items-end gap-1" role="img" aria-label={`Bar chart of cases per day, ${trend.casesOverTime.length} days, peak ${maxTrend} cases`}>
              {trend.casesOverTime.map((x) => (
                <div
                  key={x.day}
                  title={`${x.day}: ${x.count} case${x.count === 1 ? "" : "s"}`}
                  className="min-w-1 flex-1 rounded-t bg-teal-400/70 transition hover:bg-teal-300"
                  style={{ height: `${Math.max(4, (x.count / maxTrend) * 100)}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Each bar is one {trend?.bucket === "week" ? "week" : "day"}; hover for the live count. Full analysis with filters lives in{" "}
              <Link href="/gov/trends" className="text-teal-300 underline hover:no-underline">Trends</Link>.
            </p>
          </>
        )}
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

      {/* Separate domains: external intel + ML status are never merged into case metrics */}
      <section aria-label="External intelligence and ML status" className="grid gap-4 md:grid-cols-2">
        <Link
          href="/gov/external"
          className="gov-panel flex items-start gap-3 p-4 transition hover:border-sky-400/40"
          aria-label={`External intelligence: ${extAggregates.record_count} records. Open external intelligence.`}
        >
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <div>
            <p className="text-xs font-bold text-slate-100">
              External IOCs <span className="ml-1 rounded-full bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-sky-300">Domain B · not cases</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-100">
              {(extAggregates.record_count as number).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Manual sync 2026-09-25 · coverage {(extAggregates.actual_source_start as string)} → {(extAggregates.actual_source_end as string)} ·
              types {Object.entries(extAggregates.by_type as Record<string, number>).map(([k, v]) => `${k} ${v.toLocaleString("en-IN")}`).join(" · ")}
            </p>
          </div>
        </Link>
        <Link
          href="/gov/ml"
          className="gov-panel flex items-start gap-3 p-4 transition hover:border-fuchsia-400/40"
          aria-label={`ML intelligence: model ${(mlMetadata as { version: string }).version}, status ${(mlMetadata as { status: string }).status}. Open ML intelligence.`}
        >
          <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
          <div>
            <p className="text-xs font-bold text-slate-100">
              URL risk model <span className="ml-1 rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-200">{(mlMetadata as { status: string }).status}</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-100">
              {(mlMetadata as { version: string }).version}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Test F1 {(mlEvaluation as { f1_malicious: number }).f1_malicious} · OOD phishing flag rate{" "}
              {(((mlEvaluation as { ood_check: { flag_rate: number } }).ood_check.flag_rate) * 100).toFixed(1)}% ·
              suggestions only, analyst review required
            </p>
          </div>
        </Link>
      </section>

      {/* Distributions */}
      <section aria-label="Distributions" className="grid gap-4 lg:grid-cols-2">
        <article className="gov-panel p-5">
          <h3 className="text-sm font-bold text-slate-100">Threat-category distribution</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
            {WINDOW_LABELS[sheet.window.label] ?? sheet.window.label} · scoped cases · total {totalForPct}
          </p>
          {sheet.threatDistribution.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">No data in this window.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {sheet.threatDistribution.map((d) => (
                <li key={d.label} className="flex items-center gap-3" title={`${d.label}: ${d.count} cases${pct(d.count, totalForPct) ? ` (${pct(d.count, totalForPct)})` : ""}`}>
                  <span className="w-36 shrink-0 truncate text-xs text-slate-300">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-teal-400/70"
                      style={{ width: `${(d.count / maxThreat) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-400">
                    {d.count}{pct(d.count, totalForPct) ? ` · ${pct(d.count, totalForPct)}` : ""}
                  </span>
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
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Severity (risk level)</p>
              <ul className="mt-2 space-y-1.5">
                {sheet.riskDistribution.map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-2 text-xs">
                    <Link href="/gov/cases" className="truncate text-slate-300 hover:text-teal-300" title={`View cases (${d.label})`}>
                      {d.label}
                    </Link>
                    <span className="shrink-0 font-mono text-slate-400">
                      {d.count}{pct(d.count, totalForPct) ? ` · ${pct(d.count, totalForPct)}` : ""}
                    </span>
                  </li>
                ))}
                {sheet.riskDistribution.length === 0 && <li className="text-xs text-slate-600">No data.</li>}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</p>
              <ul className="mt-2 space-y-1.5">
                {sheet.statusDistribution.map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">{d.label}</span>
                    <span className="shrink-0 font-mono text-slate-400">
                      {d.count}{pct(d.count, totalForPct) ? ` · ${pct(d.count, totalForPct)}` : ""}
                    </span>
                  </li>
                ))}
                {sheet.statusDistribution.length === 0 && <li className="text-xs text-slate-600">No data.</li>}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Severity follows the backend risk_level classification (Critical / High / Medium / Low / Unset).
            Percentages are shown only when the window total is above zero.
          </p>
        </article>
      </section>

      {/* Recent cases + queue preview */}
      <section aria-label="Operational previews" className="grid gap-4 lg:grid-cols-2">
        <article className="gov-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 p-5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Recent cases</h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">Scoped · newest first</p>
            </div>
            <Link href="/gov/cases" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200">
              All cases <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentLoading && !recent ? (
            <p className="px-5 pb-5 text-xs text-slate-500">Loading recent cases…</p>
          ) : recentError ? (
            <p className="px-5 pb-5 text-xs text-rose-300" role="alert">{recentError}</p>
          ) : !recent || recent.length === 0 ? (
            <p className="px-5 pb-5 text-xs text-slate-600">No scoped cases to show. New investigations will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-y border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th scope="col" className="px-5 py-2">Case</th><th scope="col" className="px-2 py-2">Threat</th><th scope="col" className="px-2 py-2">Risk</th><th scope="col" className="px-2 py-2">Status</th></tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/60 text-slate-300">
                      <td className="px-5 py-2">
                        <Link href={`/gov/cases/${r.id}`} className="font-mono text-teal-300 hover:text-teal-200">
                          {r.caseNumber}
                        </Link>
                        <span className="block text-[10px] text-slate-600">
                          {new Date(r.createdAt).toLocaleDateString("en-IN")} · {r.stateCode ? `${r.stateCode}${r.districtCode ? ` / ${r.districtCode}` : ""}` : "Location unavailable"}
                        </span>
                      </td>
                      <td className="px-2 py-2">{r.threatCategory ?? "Unclassified"}</td>
                      <td className="px-2 py-2">{r.riskLevel ?? "Unset"}</td>
                      <td className="px-2 py-2">{r.govStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="gov-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 p-5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Investigation queue</h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">New · awaiting triage</p>
            </div>
            <Link href="/gov/queue" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200">
              Full queue <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {queueLoading && !queue ? (
            <p className="px-5 pb-5 text-xs text-slate-500">Loading queue…</p>
          ) : queueError ? (
            <p className="px-5 pb-5 text-xs text-rose-300" role="alert">{queueError}</p>
          ) : !queue || queue.length === 0 ? (
            <p className="px-5 pb-5 text-xs text-slate-600">Queue is clear. No new scoped cases awaiting triage.</p>
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {queue.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/gov/cases/${r.id}`} className="truncate font-mono text-xs text-teal-300 hover:text-teal-200">
                      {r.caseNumber}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {r.govStatus} · {r.riskLevel ?? "Unset"} risk · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                      {r.assignedOfficer?.fullName ? ` · ${r.assignedOfficer.fullName}` : " · Unassigned"}
                    </p>
                  </div>
                  <Link
                    href={`/gov/cases/${r.id}`}
                    aria-label={`Open case ${r.caseNumber}`}
                    className="shrink-0 rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:border-teal-400/40 hover:text-teal-300"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {/* Geography preview (aggregate-only) */}
      <section aria-label="Geography preview" className="gov-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-teal-300" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">Geography preview</h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Aggregate counts only · no case locations or identifiers
              </p>
            </div>
          </div>
          <Link href="/gov/geography" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200">
            Full map <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {!canViewGeo ? (
          <p className="flex items-center gap-2 py-6 text-xs text-slate-600">
            <LockKeyhole className="h-4 w-4" /> Geographic intelligence is not granted to role {officer.role}.
          </p>
        ) : geoLoading && !geo ? (
          <p className="py-6 text-center text-xs text-slate-500">Loading aggregate geography…</p>
        ) : geoError ? (
          <p className="py-6 text-center text-xs text-rose-300" role="alert">{geoError}</p>
        ) : !geo || geo.regions.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">No located cases to aggregate yet.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {topGeo.map((g) => (
                <li key={g.regionCode} className="flex items-center gap-3 text-xs">
                  <span className="w-40 shrink-0 truncate text-slate-300">{g.displayName}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-400/70"
                      style={{ width: `${(g.totalCases / Math.max(1, topGeo[0]?.totalCases ?? 1)) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-mono text-slate-400">
                    {g.suppressed ? "Suppressed" : `${g.totalCases} · ${g.intensityLevel}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[10px] text-slate-600">
              Source: {geo.source} · as of {new Date(geo.generatedAt).toLocaleString("en-IN")} · {geo.totals.cases} located cases in scope
              {geo.excludedCounts && (geo.excludedCounts.unlocated > 0 || geo.excludedCounts.invalidOrIncomplete > 0) && (
                <> · {geo.excludedCounts.unlocated + geo.excludedCounts.invalidOrIncomplete} without usable location (shown as “Not located”, never mapped to a real region)</>
              )}
              .
            </p>
          </>
        )}
      </section>

      <p className="pb-2 text-center font-mono text-[10px] text-slate-600">
        Data as of {new Date(sheet.generatedAt).toLocaleString("en-IN")} · every figure is a live scoped query, never cached
        or sampled.
      </p>
    </div>
  );
};

"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = { id: string; caseNumber: string; createdAt: string; updatedAt: string; stateCode: string | null; districtCode: string | null; threatCategory: string | null; riskLevel: string | null; govStatus: string; caseSource: string | null; sakhiNumber: string | null; assignedOfficer: { fullName: string | null; officerCode: string | null } | null };
type Result = { rows: Row[]; total: number; page: number; pageSize: number };

const THREAT_OPTIONS = ["PHISHING", "FINANCIAL_FRAUD", "BLACKMAIL", "THREAT", "OTHER"];
const RISK_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_OPTIONS = ["NEW", "TRIAGED", "ASSIGNED", "UNDER_INVESTIGATION", "AWAITING_EVIDENCE", "RESOLVED", "CLOSED"];

/** Privacy-safe case list: every filter/sort/page is a server-side scoped query. */
export function GovCaseExplorer({ fixedOfficerId = null }: { fixedOfficerId?: string | null }) {
  const [result, setResult] = useState<Result | null>(null); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [threat, setThreat] = useState(""); const [risk, setRisk] = useState(""); const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "status">("newest");
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (fixedOfficerId) p.set("officer", fixedOfficerId);
      if (q.trim()) p.set("q", q.trim());
      if (threat) p.set("threat", threat);
      if (risk) p.set("risk", risk);
      if (status) p.set("status", status);
      p.set("sort", sort === "status" ? "gov_status" : "created_at");
      p.set("dir", sort === "oldest" ? "asc" : "desc");
      const res = await fetch(`/gov/api/cases?${p}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired - please sign in again.");
        if (res.status === 403) throw new Error("Your role cannot view cases.");
        throw new Error(`Unable to load cases (${res.status}).`);
      }
      setResult(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load cases."); } finally { setLoading(false); }
  }, [page, q, threat, risk, status, sort, fixedOfficerId]);
  useEffect(() => { void load(); }, [load]);
  const resetFilters = useCallback(() => { setQ(""); setThreat(""); setRisk(""); setStatus(""); setSort("newest"); setPage(1); }, []);
  const rows = result?.rows ?? []; const last = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const activeFilters = [threat, risk, status].filter(Boolean).length + (q.trim() ? 1 : 0);
  return <section className="gov-panel space-y-5 p-5" aria-label="Case explorer">
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-bold text-slate-100">{fixedOfficerId ? "My Assigned Cases" : "Case Explorer"}</h2><p className="text-sm text-slate-500">{fixedOfficerId ? "Active assignments scoped to you. Privacy-safe list: no victim PII or precise locations." : "Privacy-safe list: no victim PII or precise locations. Every control narrows the server query."}</p></div>
        <form onSubmit={e => { e.preventDefault(); setPage(1); void load(); }} className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} maxLength={160} placeholder="Case ID, indicator, email, URL..." aria-label="Search cases" className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          <button className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-bold text-slate-950">Search</button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Case filters">
        <select value={threat} onChange={e => { setThreat(e.target.value); setPage(1); }} aria-label="Filter by threat category" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
          <option value="">All threats</option>{THREAT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={risk} onChange={e => { setRisk(e.target.value); setPage(1); }} aria-label="Filter by severity" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
          <option value="">All severities</option>{RISK_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
          <option value="">All statuses</option>{STATUS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={e => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Sort cases" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="status">By status</option>
        </select>
        {(activeFilters > 0 || sort !== "newest") && <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40 hover:text-teal-300">Reset{activeFilters > 0 ? ` (${activeFilters})` : ""}</button>}
        {loading && <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">loading...</span>}
      </div>
    </div>
    {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" role="alert">{error} <button type="button" onClick={() => void load()} className="ml-2 underline hover:no-underline">Retry</button></p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-700 text-xs uppercase text-slate-500"><tr><th scope="col" className="p-2">Case ID</th><th scope="col" className="p-2">Sakhi No.</th><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">State / District</th><th scope="col" className="p-2">Threat</th><th scope="col" className="p-2">Risk</th><th scope="col" className="p-2">Status</th><th scope="col" className="p-2">Source</th><th scope="col" className="p-2">Updated</th><th scope="col" className="p-2">Assigned</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-800 text-slate-300"><td className="p-2 font-mono text-teal-300"><Link href={`/gov/cases/${row.id}`}>{row.caseNumber}</Link></td><td className="p-2 font-mono">{row.sakhiNumber ?? "Not linked"}</td><td className="p-2">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td className="p-2">{row.stateCode ? `${row.stateCode} / ${row.districtCode ?? "—"}` : "Location unavailable"}</td><td className="p-2">{row.threatCategory ?? "Unclassified"}</td><td className="p-2">{row.riskLevel ?? "Unset"}</td><td className="p-2">{row.govStatus}</td><td className="p-2">{row.caseSource ?? "Unknown"}</td><td className="p-2">{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("en-IN") : "Unknown"}</td><td className="p-2">{row.assignedOfficer?.fullName ?? "Unassigned"}</td></tr>)}{result && !loading && rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500">No scoped cases match the current filter.</td></tr>}{!result && loading && <tr><td colSpan={10} className="p-8 text-center text-slate-500">Loading scoped cases...</td></tr>}</tbody></table></div>
    <div className="flex items-center justify-between text-sm text-slate-400"><span>{result ? `${result.total} scoped case${result.total === 1 ? "" : "s"}` : "Loading..."}</span><span className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button><span className="px-1 py-1">{page} / {last}</span><button disabled={page >= last} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Next</button></span></div>
  </section>;
}

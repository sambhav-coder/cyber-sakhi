"use client";

import React, { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Download, RefreshCw, RotateCcw, X } from "lucide-react";
import { GOV_AUDIT_ACTIONS } from "@/lib/gov/govAuditActions";

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  actorType: string | null;
  actorGovId: string | null;
  officerCode: string | null;
  officerRole: string | null;
  caseId: string | null;
  evidenceId: string | null;
  outcome: string | null;
  denialReason: string | null;
  permission: string | null;
  correlationId: string | null;
}

interface AuditResult {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

const OUTCOMES = ["allow", "deny", "error"];
const PAGE_SIZE = 25;

export function GovAuditCenter({ canExport }: { canExport: boolean }) {
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [caseId, setCaseId] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (action) p.set("action", action);
      if (outcome) p.set("outcome", outcome);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (caseId.trim()) p.set("caseId", caseId.trim());
      if (officerId.trim()) p.set("officer", officerId.trim());
      const res = await fetch(`/gov/api/audit?${p.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired - please sign in again.");
        if (res.status === 403) throw new Error("Your role cannot view audit logs.");
        throw new Error(`Unable to load audit logs (${res.status}).`);
      }
      setData((await res.json()) as AuditResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load audit logs.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, action, outcome, from, to, caseId, officerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the detail drawer.
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detail]);

  const reset = useCallback(() => {
    setAction("");
    setOutcome("");
    setFrom("");
    setTo("");
    setCaseId("");
    setOfficerId("");
    setPage(1);
  }, []);

  const activeFilters = [action, outcome, from, to, caseId.trim(), officerId.trim()].filter(Boolean).length;
  const last = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const exportCsv = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/gov/api/audit/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            ...(action ? { action } : {}),
            ...(outcome ? { outcome } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(caseId.trim() ? { caseId: caseId.trim() } : {}),
            ...(officerId.trim() ? { officerId: officerId.trim() } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status}).`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cyber-sakhi-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [exporting, action, outcome, from, to, caseId, officerId]);

  const outcomeBadge = (o: string | null) =>
    clsx(
      "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
      o === "allow" && "bg-emerald-400/10 text-emerald-300",
      o === "deny" && "bg-rose-400/10 text-rose-300",
      o === "error" && "bg-amber-400/10 text-amber-300",
      !o && "bg-slate-700/40 text-slate-400",
    );

  return (
    <div className="space-y-5">
      <section aria-label="Audit filters" className="gov-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Audit Center</h2>
            <p className="mt-1 text-sm text-slate-400">
              Immutable server-side records. Payloads, passwords, and tokens are never stored or shown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeFilters > 0 && (
              <span className="rounded-full bg-teal-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-teal-300">
                {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </span>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-1.5 text-xs font-bold text-teal-200 hover:bg-teal-400/20 disabled:opacity-50"
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
              {loading ? "Loading..." : "Refresh"}
            </button>
            {canExport && (
              <button
                type="button"
                onClick={() => void exportCsv()}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting..." : "CSV"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Action
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
              <option value="">All actions</option>
              {[...GOV_AUDIT_ACTIONS].sort().map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Outcome
            <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }} className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200">
              <option value="">All outcomes</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            From
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            To
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Case ID
            <input value={caseId} onChange={(e) => setCaseId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setPage(1); }} maxLength={160} placeholder="Filter by case" aria-label="Filter by case ID" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Officer ID
            <input value={officerId} onChange={(e) => setOfficerId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setPage(1); }} maxLength={160} placeholder="Filter by officer" aria-label="Filter by officer ID" className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-200" />
          </label>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200" role="alert">
            {error} <button type="button" onClick={() => void load()} className="ml-2 underline hover:no-underline">Retry</button>
          </p>
        )}
        {exportError && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200" role="alert">{exportError}</p>
        )}
      </section>

      <section aria-label="Audit events" className="gov-panel overflow-hidden">
        {loading && !data ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading audit ledger...</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No audit events match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2">Time</th>
                  <th scope="col" className="px-2 py-2">Action</th>
                  <th scope="col" className="px-2 py-2">Actor</th>
                  <th scope="col" className="px-2 py-2">Outcome</th>
                  <th scope="col" className="px-2 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-400">
                      {new Date(r.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="font-mono text-teal-300 hover:text-teal-200 hover:underline"
                        aria-label={`Audit event detail for ${r.action}`}
                      >
                        {r.action}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      {r.officerCode ?? r.actorGovId?.slice(0, 8) ?? r.actorType ?? "—"}
                      {r.officerRole && <span className="ml-1.5 text-slate-500">· {r.officerRole}</span>}
                    </td>
                    <td className="px-2 py-2"><span className={outcomeBadge(r.outcome)}>{r.outcome ?? "—"}</span></td>
                    <td className="max-w-56 truncate px-2 py-2 text-slate-500">
                      {r.denialReason ?? r.permission ?? r.caseId?.slice(0, 8) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <span>{data ? `${data.total} event${data.total === 1 ? "" : "s"}` : "—"}</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button>
            <span>{page} / {last}</span>
            <button type="button" disabled={page >= last} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Next</button>
          </span>
        </div>
      </section>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDetail(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Audit event ${detail.action}`}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-[#0a1222] p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-mono text-sm font-bold text-slate-100">{detail.action}</h3>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{new Date(detail.createdAt).toLocaleString("en-IN")}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close event detail" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-5 space-y-2.5 text-xs">
              {[
                ["Event ID", detail.id],
                ["Outcome", detail.outcome ?? "—"],
                ["Actor type", detail.actorType ?? "—"],
                ["Officer", detail.officerCode ?? detail.actorGovId ?? "—"],
                ["Role", detail.officerRole ?? "—"],
                ["Permission", detail.permission ?? "—"],
                ["Case", detail.caseId ?? "—"],
                ["Evidence", detail.evidenceId ?? "—"],
                ["Denial reason", detail.denialReason ?? "—"],
                ["Correlation", detail.correlationId ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-28 shrink-0 font-mono uppercase text-slate-500">{k}</dt>
                  <dd className="min-w-0 break-all font-mono text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-500">
              Payloads, passwords, tokens, and keys are never persisted in audit rows and cannot be
              shown here. History is append-only for authorized viewers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

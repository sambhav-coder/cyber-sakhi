"use client";

import React, { useMemo, useState } from "react";
import { Search, Eye, X } from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import type { ThreatSeverity } from "@/lib/types";

/* One row shape for both data sources: the live Supabase `cases` table and
 * the seeded demo ledger. The table should not care which it is looking at. */
export interface LedgerRow {
  id: string;
  code: string;
  threatType: string;
  severity: string;
  status: string;
  timestamp: string;
  region?: string;
  confidenceScore?: number;
}

function prettyStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("ESCALAT")) return "text-emergency-300 border-emergency-700/50 bg-emergency-950/50";
  if (s.includes("RESOLVED")) return "text-emerald-300 border-emerald-700/50 bg-emerald-950/50";
  if (s.includes("FLAG")) return "text-amber-300 border-amber-700/50 bg-amber-950/50";
  return "text-slate-300 border-slate-700 bg-slate-900/60";
}

function asSeverity(value: string): ThreatSeverity {
  const v = value.toUpperCase();
  return (["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).includes(
    v as ThreatSeverity
  )
    ? (v as ThreatSeverity)
    : "MEDIUM";
}

interface Props {
  rows: LedgerRow[];
}

export const CaseLedger: React.FC<Props> = ({ rows }) => {
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LedgerRow | null>(null);

  // Options come from the data, so the filters fit whichever source loaded.
  const severities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.severity.toUpperCase()))).sort(),
    [rows]
  );
  const statuses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status.toUpperCase()))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const okSeverity =
        filterSeverity === "ALL" || r.severity.toUpperCase() === filterSeverity;
      const okStatus =
        filterStatus === "ALL" || r.status.toUpperCase() === filterStatus;
      const okQuery =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.threatType.toLowerCase().includes(q) ||
        (r.region || "").toLowerCase().includes(q);
      return okSeverity && okStatus && okQuery;
    });
  }, [rows, filterSeverity, filterStatus, query]);

  return (
    <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Anonymised Case Ledger
        </h2>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search case or type"
              className="pl-8 pr-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs w-52 focus:outline-none focus:border-emergency-700"
            />
          </div>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-slate-200 text-xs"
            aria-label="Filter by severity"
          >
            <option value="ALL">All severities</option>
            {severities.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-slate-200 text-xs"
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {prettyStatus(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-[11px] text-slate-500">
        Showing {filtered.length} of {rows.length} cases
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 pr-3 font-bold">Case</th>
              <th className="py-2 pr-3 font-bold">Threat type</th>
              <th className="py-2 pr-3 font-bold">Severity</th>
              <th className="py-2 pr-3 font-bold">Status</th>
              <th className="py-2 pr-3 font-bold">Logged</th>
              <th className="py-2 pr-3 font-bold sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No cases match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-900 hover:bg-slate-900/50 transition"
                >
                  <td className="py-2.5 pr-3 font-mono text-slate-300 whitespace-nowrap">
                    {row.code}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-300">{row.threatType}</td>
                  <td className="py-2.5 pr-3">
                    <ThreatBadge severity={asSeverity(row.severity)} size="sm" />
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${statusTone(
                        row.status
                      )}`}
                    >
                      {prettyStatus(row.status)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                    {new Date(row.timestamp).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      onClick={() => setSelected(row)}
                      className="text-slate-400 hover:text-white transition inline-flex items-center gap-1"
                      aria-label={`View ${row.code}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0d18] border border-emergency-800/50 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white font-mono">
                  {selected.code}
                </h3>
                <p className="text-[11px] text-slate-500">{selected.threatType}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                aria-label="Close case detail"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[
                ["Severity", selected.severity.toUpperCase()],
                ["Status", prettyStatus(selected.status)],
                ["Logged", new Date(selected.timestamp).toLocaleString("en-IN")],
                ["Region", selected.region || "Not recorded"],
                [
                  "Confidence",
                  selected.confidenceScore != null
                    ? `${selected.confidenceScore}%`
                    : "Not recorded",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    {label}
                  </dt>
                  <dd className="text-slate-200 capitalize">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
              Operational metadata only. No owner identity, message content, or
              indicators are exposed through the admin portal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

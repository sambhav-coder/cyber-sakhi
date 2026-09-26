"use client";

import React, { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

export interface OfficerDirectoryEntry {
  officerCode: string;
  fullName: string;
  role: string;
  scope: string;
  stateCode: string | null;
  districtCode: string | null;
  department: string | null;
  status: string;
}

/**
 * Read-only officer directory. Rows are the server-scoped candidate set
 * (the viewer's jurisdiction covers every listed officer); the search box
 * only narrows those rows. Creation, suspension, and role/scope changes
 * stay behind the explicit grant workflow (restricted permissions) and are
 * documented, not rendered as dead buttons.
 */
export function GovOfficerDirectory({ initial }: { initial: OfficerDirectoryEntry[] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return initial;
    return initial.filter((o) =>
      [o.officerCode, o.fullName, o.role, o.department ?? ""].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [q, initial]);

  return (
    <div className="space-y-5">
      <section aria-label="Officer directory" className="gov-panel space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Administration · Officer Directory</h2>
            <p className="mt-1 text-sm text-slate-400">
              {initial.length} officer{initial.length === 1 ? "" : "s"} in your jurisdiction. Internal
              administrative data — officer codes and roles only, no credentials or contact details.
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={120}
            placeholder="Search code, name, role..."
            aria-label="Search officers"
            className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-slate-400">
            Officer creation, suspension, and role/scope changes require the explicit grant workflow
            (restricted permissions <span className="font-mono">officer.create</span>,{" "}
            <span className="font-mono">officer.suspend</span>, <span className="font-mono">role.manage</span>,{" "}
            <span className="font-mono">scope.manage</span>) and are not available in this console. This
            directory is read-only by design.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {initial.length === 0
              ? "No officers in scope."
              : "No officers match the current search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="p-2">Officer code</th>
                  <th scope="col" className="p-2">Name</th>
                  <th scope="col" className="p-2">Role</th>
                  <th scope="col" className="p-2">Scope</th>
                  <th scope="col" className="p-2">Jurisdiction</th>
                  <th scope="col" className="p-2">Department</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.officerCode} className="border-b border-slate-800 text-slate-300">
                    <td className="p-2 font-mono text-teal-300">{o.officerCode}</td>
                    <td className="p-2">{o.fullName || "—"}</td>
                    <td className="p-2">{o.role}</td>
                    <td className="p-2">{o.scope}</td>
                    <td className="p-2">{o.stateCode ?? "—"} / {o.districtCode ?? "—"}</td>
                    <td className="p-2">{o.department ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

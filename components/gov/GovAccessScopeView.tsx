"use client";

import React from "react";
import { clsx } from "clsx";
import { ShieldCheck } from "lucide-react";
import { GOV_PERMISSION_CATALOGUE, roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import type { GovPermission, GovRole } from "@/lib/gov/govTypes";

interface Props {
  officer: {
    officer_code: string;
    full_name: string;
    official_email: string;
    role: string;
    scope: string;
    state_code: string | null;
    district_code: string | null;
    department: string | null;
    status: string;
  };
  mfaFresh: boolean;
}

/**
 * Access and Scope (PART 10.14): what this session may do, derived from the
 * server-verified role — the same fail-closed matrix the API guards enforce.
 * Informational mirror only; enforcement stays server-side.
 */
export function GovAccessScopeView({ officer, mfaFresh }: Props) {
  const held = (GOV_PERMISSION_CATALOGUE as readonly GovPermission[]).filter((p) =>
    roleHasDefaultPermission(officer.role as GovRole, p),
  );
  return (
    <div className="space-y-5">
      <section aria-label="Session identity" className="gov-panel space-y-3 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-400/10 text-teal-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Access and Scope</h2>
            <p className="text-xs text-slate-400">Server-verified session · {officer.officer_code} · {officer.status}</p>
          </div>
          <span className="ml-auto rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-teal-300">
            {mfaFresh ? "MFA fresh" : "MFA not verified"}
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {[
            ["Officer", `${officer.full_name} (${officer.officer_code})`],
            ["Official email", officer.official_email],
            ["Role", officer.role],
            ["Department", officer.department ?? "—"],
            ["Scope", officer.scope],
            ["Jurisdiction", `${officer.state_code ?? "—"} / ${officer.district_code ?? "—"}`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-32 shrink-0 font-mono uppercase text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Permission matrix" className="gov-panel space-y-3 p-5">
        <h3 className="text-sm font-bold text-slate-100">
          Default permissions for role {officer.role} ({held.length} of {GOV_PERMISSION_CATALOGUE.length})
        </h3>
        <p className="text-xs leading-relaxed text-slate-500">
          Mirror of the server-side least-privilege matrix. Restricted permissions (role/scope
          management, exports, break-glass approval) require the explicit grant workflow.
          Hiding a control never grants or denies anything — every API re-checks.
        </p>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {(GOV_PERMISSION_CATALOGUE as readonly GovPermission[]).map((p) => {
            const has = held.includes(p);
            return (
              <li
                key={p}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px]",
                  has ? "border-teal-400/25 bg-teal-400/5 text-teal-200" : "border-slate-800 text-slate-600",
                )}
                aria-label={`${p}: ${has ? "granted" : "not granted"}`}
              >
                <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", has ? "bg-teal-300" : "bg-slate-700")} />
                {p}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

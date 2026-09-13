"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ShieldAlert,
  AlertOctagon,
  TrendingUp,
  Layers,
  Shield,
  Lock,
  LogIn,
  ArrowLeft,
  RefreshCw,
  Database,
  Users,
  Download,
} from "lucide-react";
import { CaseLedger, type LedgerRow } from "@/components/admin/CaseLedger";
import { CaseBreakdowns } from "@/components/admin/CaseBreakdowns";
import {
  RepeatOffenders,
  type Payload as OffenderPayload,
} from "@/components/admin/RepeatOffenders";
import type { AdminIncident } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Admin portal.
 *
 * Data comes from the live `cases` table when Supabase is configured.
 * When it is not — a laptop without keys — it falls back to the seeded
 * ledger and says so on screen, rather than presenting demo rows as if
 * they were real institutional data.
 * ------------------------------------------------------------------ */

interface CaseOverviewRow {
  case_number: string | null;
  threat_type: string | null;
  status: string | null;
  severity: string | null;
  created_at: string;
  updated_at?: string;
}

interface CaseOverview {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byThreatType: Record<string, number>;
  recent: CaseOverviewRow[];
}

type Source = "live" | "demo";

function fromCaseRow(row: CaseOverviewRow, i: number): LedgerRow {
  return {
    id: row.case_number || `case_${i}`,
    code: row.case_number || "UNASSIGNED",
    threatType: row.threat_type || "Unclassified",
    severity: row.severity || "MEDIUM",
    status: row.status || "UNKNOWN",
    timestamp: row.created_at,
  };
}

function fromIncident(inc: AdminIncident): LedgerRow {
  return {
    id: inc.id,
    code: inc.caseCode,
    threatType: inc.threatType,
    severity: inc.severity,
    status: inc.status,
    timestamp: inc.timestamp,
    region: inc.region,
    confidenceScore: inc.confidenceScore,
  };
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [overview, setOverview] = useState<CaseOverview | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offenderData, setOffenderData] = useState<OffenderPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cases-overview", { cache: "no-store" });

      if (res.ok) {
        const json = await res.json();
        const ov = json.overview as CaseOverview;
        setOverview(ov);
        setRows((ov.recent || []).map(fromCaseRow));
        setSource("live");
        return;
      }

      if (res.status === 401 || res.status === 403) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Not authorised to read case telemetry.");
        return;
      }

      // Supabase unreachable (typically: not configured on this machine).
      // Fall back to the seeded ledger so the portal still demonstrates.
      const demo = await fetch("/api/admin/incidents", { cache: "no-store" });
      if (!demo.ok) throw new Error(`Case sources unavailable (${res.status}).`);
      const demoJson = await demo.json();
      setOverview(null);
      setRows((demoJson.incidents as AdminIncident[]).map(fromIncident));
      setSource("demo");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const stats = useMemo(() => {
    const severity = (s: string) => s.toUpperCase();
    return {
      total: overview?.total ?? rows.length,
      critical: rows.filter((r) => severity(r.severity) === "CRITICAL").length,
      escalated: rows.filter((r) => r.status.toUpperCase().includes("ESCALAT"))
        .length,
      open: rows.filter((r) => {
        const s = r.status.toUpperCase();
        return !s.includes("RESOLVED") && !s.includes("CLOSED");
      }).length,
    };
  }, [rows, overview]);

  /* Builds the handover document an admin can give to a cyber cell. It
   * carries operational metadata only: no survivor identity, no message
   * content, and no raw indicators (which the server cannot recover). */
  const exportEscalationReport = () => {
    const line = "-".repeat(80);
    const rule = "=".repeat(80);
    const offenders = offenderData?.offenders ?? [];

    const body = [
      rule,
      "CYBER SAKHI - ESCALATION REPORT",
      "Prepared for cyber cell / institutional review",
      rule,
      `Generated       : ${new Date().toISOString()}`,
      `Prepared by     : ${session?.user?.email ?? "unknown"}`,
      `Case source     : ${
        source === "live"
          ? "Live case ledger"
          : "Seeded demo ledger (NOT real cases)"
      }`,
      `Network store   : ${offenderData?.backend ?? "unavailable"}`,
      "",
      line,
      "1. SUMMARY",
      line,
      `Total cases             : ${stats.total}`,
      `Critical severity       : ${stats.critical}`,
      `Escalated to cyber cell : ${stats.escalated}`,
      `Still open              : ${stats.open}`,
      `Flagged identifiers     : ${offenders.length} (reported by ${
        offenderData?.minReporters ?? 3
      }+ independent victims)`,
      `Total victim reports    : ${offenderData?.totalVictimReports ?? 0}`,
      "",
      line,
      "2. REPEAT OFFENDER SIGNALS",
      line,
      offenders.length === 0
        ? "No identifier has crossed the reporting threshold."
        : offenders
            .map((o, i) =>
              [
                `[${i + 1}] Fingerprint : ${o.fingerprint}`,
                `    Type        : ${o.type}`,
                `    Victims     : ${o.distinctReporters} independent reports`,
                `    Cities      : ${
                  o.regions.length ? o.regions.join(", ") : "not recorded"
                }`,
                `    Categories  : ${o.categories.join(", ")}`,
                `    Active      : ${o.firstSeenDay} to ${o.lastSeenDay}`,
              ].join("\n")
            )
            .join("\n\n"),
      "",
      "NOTE: identifiers are stored as HMAC-SHA256 fingerprints keyed with a",
      "server-side secret. The phone number, UPI ID or handle behind a",
      "fingerprint cannot be recovered from this report. Counts are independent",
      "reports, not proof of guilt, and must be verified before any action.",
      "",
      line,
      "3. CASE LEDGER",
      line,
      "CASE CODE            | THREAT TYPE               | SEVERITY | STATUS",
      ...rows.map((r) =>
        [
          r.code.padEnd(20).slice(0, 20),
          (r.threatType || "").padEnd(25).slice(0, 25),
          (r.severity || "").toUpperCase().padEnd(8).slice(0, 8),
          r.status.replace(/_/g, " "),
        ].join(" | ")
      ),
      "",
      line,
      "PRIVACY",
      line,
      "Operational metadata only. No survivor identity, message content, or raw",
      "indicators are included in this document.",
      rule,
      "",
    ].join("\n");

    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Cyber_Sakhi_Escalation_Report_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* --------------------------- gate states --------------------------- */

  if (status === "loading") {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3 animate-in fade-in">
        <div className="w-10 h-10 rounded-full border-2 border-emergency-500 border-t-transparent animate-spin" />
        <p className="text-xs text-emergency-300 font-semibold tracking-wider uppercase">
          Verifying administrator privileges…
        </p>
      </div>
    );
  }

  if (status === "unauthenticated" || !session) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl glass-panel border-emergency-800/40 text-center space-y-5">
        <div className="p-4 rounded-full bg-emergency-950/70 border border-emergency-700/50 text-emergency-400 w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-white">
            Administrator Login Required
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            This portal holds anonymised institutional threat intelligence and is
            restricted to authorised safety personnel.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/login?callbackUrl=/admin"
            className="w-full py-2.5 px-4 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white font-bold text-xs transition flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In to Access Admin Portal</span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl glass-panel border-amber-800/40 text-center space-y-5">
        <div className="p-4 rounded-full bg-amber-950/70 border border-amber-700/50 text-amber-400 w-fit mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-white">403 — Access Denied</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            You are signed in as{" "}
            <span className="font-mono text-amber-300">{session.user?.email}</span>{" "}
            with role{" "}
            <span className="font-mono text-amber-300">{session.user?.role}</span>
            . The admin portal requires an ADMIN role.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  /* ------------------------------ portal ------------------------------ */

  return (
    <div className="space-y-7 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emergency-950/70 border border-emergency-500/40 text-emergency-300 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Institutional Threat Intelligence & Triage</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Safety Admin & Case Management
          </h1>
          <p className="text-sm text-slate-300">
            Anonymised case telemetry and cross-victim offender patterns for
            safety teams and cyber cell escalation.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={exportEscalationReport}
            disabled={loading || rows.length === 0}
            className="px-3 py-2 rounded-lg bg-emergency-600 hover:bg-emergency-500 text-white text-[11px] font-bold transition flex items-center gap-1.5 disabled:opacity-50"
            title="Download a handover document for the cyber cell"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Escalation Report</span>
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <div className="p-2.5 rounded-xl bg-emergency-950/50 border border-emergency-900/50 text-xs text-emergency-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="font-mono font-medium truncate max-w-[200px]">
              {session.user?.email}
            </span>
          </div>
        </div>
      </div>

      {source === "demo" && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/30 border border-amber-800/50">
          <Database className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-300 leading-relaxed">
            <span className="font-bold text-amber-300">Seeded ledger.</span> The
            live case database is not reachable from this machine, so the table
            below shows the demo incident set. Configure Supabase to see real
            cases.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-xl p-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Cases",
            value: stats.total,
            sub: source === "live" ? "From live case ledger" : "Seeded demo set",
            icon: <Layers className="w-4 h-4 text-emergency-400" />,
            tone: "text-white",
          },
          {
            label: "Critical Severity",
            value: stats.critical,
            sub: "Immediate triage priority",
            icon: <AlertOctagon className="w-4 h-4 text-red-400" />,
            tone: "text-red-400",
          },
          {
            label: "Escalated to Cyber Cell",
            value: stats.escalated,
            sub: "Handed to law enforcement",
            icon: <TrendingUp className="w-4 h-4 text-amber-400" />,
            tone: "text-amber-300",
          },
          {
            label: "Still Open",
            value: stats.open,
            sub: "Not yet resolved",
            icon: <Users className="w-4 h-4 text-emerald-400" />,
            tone: "text-emerald-400",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="p-5 rounded-2xl glass-card space-y-1 border-emergency-900/25"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{tile.label}</span>
              {tile.icon}
            </div>
            <div className={`text-2xl font-black font-mono ${tile.tone}`}>
              {loading ? "—" : tile.value}
            </div>
            <div className="text-[11px] text-slate-500">{tile.sub}</div>
          </div>
        ))}
      </div>

      <CaseBreakdowns
        bySeverity={overview?.bySeverity}
        byStatus={overview?.byStatus}
        byThreatType={overview?.byThreatType}
        rows={rows}
      />

      <RepeatOffenders onData={setOffenderData} />

      {loading && rows.length === 0 ? (
        <div className="h-64 rounded-2xl bg-slate-900/50 animate-pulse" />
      ) : (
        <CaseLedger rows={rows} />
      )}
    </div>
  );
}

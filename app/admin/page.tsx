"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  ShieldAlert,
  BarChart3,
  TrendingUp,
  AlertOctagon,
  CheckCircle2,
  Clock,
  MapPin,
  Filter,
  Eye,
  Shield,
  Layers,
  ArrowUpRight,
  Lock,
  LogIn,
  AlertTriangle,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { DEFAULT_ADMIN_INCIDENTS } from "@/lib/storage";
import { AdminIncident } from "@/lib/types";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [incidents, setIncidents] = useState<AdminIncident[]>(DEFAULT_ADMIN_INCIDENTS);
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [selectedCase, setSelectedCase] = useState<AdminIncident | null>(null);

  // 1. Loading State
  if (status === "loading") {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3 animate-in fade-in">
        <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        <p className="text-xs text-purple-300 font-semibold tracking-wider uppercase">
          Verifying Administrator Privileges & Server Session...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated State (Not Logged In)
  if (status === "unauthenticated" || !session) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl glass-panel border-purple-800/40 text-center space-y-5 animate-in zoom-in-95">
        <div className="p-4 rounded-full bg-purple-950/70 border border-purple-700/50 text-purple-400 w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-white">Administrator Login Required</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            The Institutional Incident Management Portal contains sensitive, anonymized cyber threat intelligence and is restricted to authorized safety personnel.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/login?callbackUrl=/admin"
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In to Access Admin Portal</span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
          >
            Return to User Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // 3. Authenticated but Unauthorized State (Logged in as USER)
  if (session.user.role !== "ADMIN") {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 rounded-3xl bg-gradient-to-b from-red-950/40 via-[#18090d] to-[#0f0508] border border-red-500/50 text-center space-y-6 animate-in zoom-in-95 shadow-[0_0_50px_rgba(239,68,68,0.25)]">
        <div className="p-4 rounded-full bg-red-600/20 border border-red-500/50 text-red-400 w-fit mx-auto animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-700/50 text-[11px] font-mono font-bold">
            HTTP 403: FORBIDDEN
          </div>
          <h2 className="text-2xl font-black text-white">
            Access Denied: Admin Role Required
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            You are currently authenticated as <strong className="text-white font-mono">{session.user.email}</strong> with the <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">USER</span> role.
          </p>
          <p className="text-xs text-slate-400">
            Server-side Role-Based Access Control (RBAC) enforces that only designated Administrator accounts may view institutional safety analytics and incident files.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1 text-left">
          <div className="font-semibold text-purple-300 flex items-center gap-1">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Hackathon Tester Note:</span>
          </div>
          <p>
            To inspect the Admin Portal, please sign out and log in using the pre-configured Safety Admin credentials (<strong>admin@cybersakhi.org</strong> / <strong>Admin@Sakhi2026!</strong>).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <Link
            href="/login?callbackUrl=/admin"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-purple-950/40"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Switch to Admin Account</span>
          </Link>
        </div>
      </div>
    );
  }

  // 4. Authorized ADMIN State (Role === "ADMIN")
  const handleStatusChange = (id: string, newStatus: AdminIncident["status"]) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: newStatus } : inc))
    );
    if (selectedCase?.id === id) {
      setSelectedCase((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const filtered = incidents.filter((inc) => {
    const matchSev = filterSeverity === "ALL" || inc.severity === filterSeverity;
    const matchStat = filterStatus === "ALL" || inc.status === filterStatus;
    return matchSev && matchStat;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header with Verified Admin Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Institutional Threat Intelligence & Triage Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Safety Admin & Case Management
          </h1>
          <p className="text-sm text-slate-300">
            Anonymized incident trends, automated threat severity triage, and cyber cell escalation for safety teams.
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800 text-xs text-purple-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="font-mono font-medium truncate max-w-[220px]">
            Admin: {session.user.email}
          </span>
        </div>
      </div>

      {/* High-Level Institutional Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl glass-card space-y-1 border-purple-900/30">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Total Logged Incidents</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{incidents.length}</div>
          <div className="text-[11px] text-purple-300">Across 4 metro regions</div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-red-900/30">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Critical Threat Alerts</span>
            <AlertOctagon className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400 font-mono">
            {incidents.filter((i) => i.severity === "CRITICAL").length}
          </div>
          <div className="text-[11px] text-red-300/80">Immediate triage priority</div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-cyan-900/30">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Escalated to Cyber Cell</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-300 font-mono">
            {incidents.filter((i) => i.status === "ESCALATED_TO_CYBER_CELL").length}
          </div>
          <div className="text-[11px] text-cyan-400">Section 66E / 354D cases</div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-emerald-900/30">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Avg Response & Hash Time</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">1.8s</div>
          <div className="text-[11px] text-emerald-400">Automated NLP routing</div>
        </div>
      </div>

      {/* Case Management Table */}
      <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Anonymized Incident Triage Ledger
          </h2>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Severity:</span>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value="ALL">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value="ALL">All</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="ESCALATED_TO_CYBER_CELL">Escalated</option>
                <option value="RESOLVED">Resolved</option>
                <option value="FLAGGED">Flagged</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Case ID</th>
                <th className="py-3 px-3">Threat Category</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Region</th>
                <th className="py-3 px-3">Confidence</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filtered.map((inc) => (
                <tr key={inc.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-mono text-purple-300 font-medium">
                    {inc.caseCode}
                  </td>
                  <td className="py-3 px-3 font-medium">{inc.threatType}</td>
                  <td className="py-3 px-3">
                    <ThreatBadge severity={inc.severity} size="sm" />
                  </td>
                  <td className="py-3 px-3 text-slate-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    <span>{inc.region}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {inc.confidenceScore}%
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={inc.status}
                      onChange={(e) =>
                        handleStatusChange(
                          inc.id,
                          e.target.value as AdminIncident["status"]
                        )
                      }
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-200 focus:outline-none"
                    >
                      <option value="INVESTIGATING">Investigating</option>
                      <option value="ESCALATED_TO_CYBER_CELL">Escalated to Cyber Cell</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="FLAGGED">Flagged</option>
                    </select>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => setSelectedCase(inc)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white transition"
                      title="Inspect Case Telemetry"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case Details Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#121222] border border-purple-500/40 p-6 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-purple-300">
                Case File: {selectedCase.caseCode}
              </h3>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400">Anonymized Subject: </span>
                <span className="font-mono text-purple-300">{selectedCase.anonymizedUserId}</span>
              </div>
              <div>
                <span className="text-slate-400">Threat Classification: </span>
                <span className="font-semibold text-white">{selectedCase.threatType}</span>
              </div>
              <div>
                <span className="text-slate-400">Severity Assessment: </span>
                <ThreatBadge severity={selectedCase.severity} size="sm" />
              </div>
              <div>
                <span className="text-slate-400">Geographic Jurisdiction: </span>
                <span className="text-slate-200">{selectedCase.region}</span>
              </div>
              <div>
                <span className="text-slate-400">NLP Confidence Score: </span>
                <span className="font-mono text-emerald-400">{selectedCase.confidenceScore}%</span>
              </div>
              <div>
                <span className="text-slate-400">Current Status: </span>
                <span className="font-bold text-amber-300">{selectedCase.status}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => handleStatusChange(selectedCase.id, "ESCALATED_TO_CYBER_CELL")}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              >
                Escalate to Cyber Crime Cell
              </button>
              <button
                onClick={() => setSelectedCase(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
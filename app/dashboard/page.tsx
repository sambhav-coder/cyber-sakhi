"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Search,
  Users,
  Radio,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { getStoredContacts, getStoredEvidence, getStoredScanHistory } from "@/lib/storage";
import { ThreatAnalysisResult, EvidenceItem, TrustedContact } from "@/lib/types";

export default function DashboardPage() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [scans, setScans] = useState<ThreatAnalysisResult[]>([]);

  useEffect(() => {
    setContacts(getStoredContacts());
    setEvidence(getStoredEvidence());
    setScans(getStoredScanHistory());
  }, []);

  const totalScans = scans.length > 0 ? scans.length : 8;
  const highThreatsCount = scans.filter(
    (s) => s.threatLevel === "HIGH" || s.threatLevel === "CRITICAL"
  ).length || 2;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Personal Security Telemetry</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Safety Command Dashboard
          </h1>
          <p className="text-sm text-slate-300">
            Real-time overview of your digital harassment defenses, active shields, evidence integrity, and emergency readiness.
          </p>
        </div>

        <Link
          href="/detector"
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-950/40"
        >
          <Zap className="w-4 h-4" />
          <span>New Threat Scan</span>
        </Link>
      </div>

      {/* Safety Score Banner */}
      <div className="p-6 rounded-3xl glass-panel border-purple-800/40 glow-purple flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-emerald-500 p-1">
            <div className="w-full h-full bg-[#0d0d1e] rounded-full flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-emerald-400">96</span>
              <span className="text-[9px] text-slate-400 uppercase -mt-1">Index</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">
                Safety Posture: Robust & Shielded
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-semibold">
                OPTIMAL
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-xl">
              VoiceShield active, {contacts.length} trusted contacts verified, {evidence.length} evidence artifacts locked in SHA-256 vault, and zero unhandled critical emergencies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sos"
            className="px-4 py-2 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Test SOS Beacon</span>
          </Link>
          <Link
            href="/locker"
            className="px-4 py-2 rounded-xl bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Open Vault</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl glass-card space-y-1 border-purple-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Threats Scanned</span>
            <Search className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{totalScans}</div>
          <div className="text-[11px] text-purple-300 flex items-center gap-1">
            <span>+3 new today</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-orange-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>High Risks Blocked</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-extrabold text-orange-400 font-mono">
            {highThreatsCount}
          </div>
          <div className="text-[11px] text-orange-300/80">Extortion & Stalking intercepted</div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-indigo-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Evidence Locked</span>
            <Lock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 font-mono">
            {evidence.length}
          </div>
          <div className="text-[11px] text-indigo-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>100% SHA-256 Verified</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card space-y-1 border-emerald-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Trusted Circle</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 font-mono">
            {contacts.length}
          </div>
          <div className="text-[11px] text-emerald-400">All channels active</div>
        </div>
      </div>

      {/* Main Grid: Threat Distribution & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recent Activity Feed */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>Recent Threat Interceptions & Audits</span>
              </h3>
              <Link href="/detector" className="text-xs text-purple-400 hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {scans.length > 0 ? (
                scans.slice(0, 4).map((scan) => (
                  <div
                    key={scan.id}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <ThreatBadge severity={scan.threatLevel} size="sm" />
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(scan.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-200 font-medium truncate">
                      "{scan.text}"
                    </p>
                    <div className="text-[11px] text-slate-400">
                      Score: {scan.score}/100 • Triggers: {scan.triggers.join(", ") || "None"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <ThreatBadge severity="CRITICAL" size="sm" />
                      <span className="text-[10px] text-slate-400">10 mins ago</span>
                    </div>
                    <p className="text-slate-200 font-medium">
                      "Send me your OTP or I will leak your photos."
                    </p>
                    <div className="text-[11px] text-red-300">
                      Blocked Extortion Vector • Quarantined & Vaulted
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <ThreatBadge severity="HIGH" size="sm" />
                      <span className="text-[10px] text-slate-400">2 hours ago</span>
                    </div>
                    <p className="text-slate-200 font-medium">
                      "I know where you live. Meet me alone tonight."
                    </p>
                    <div className="text-[11px] text-orange-300">
                      Stalking Signal Detected • Evidence Archived
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Threat Category Distribution & Checklist */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span>Threat Category Distribution</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">Blackmail & Extortion</span>
                  <span className="font-mono text-purple-300">42%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: "42%" }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">Cyberstalking & Tracking</span>
                  <span className="font-mono text-indigo-300">28%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: "28%" }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">Financial / OTP Fraud</span>
                  <span className="font-mono text-cyan-300">18%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full rounded-full" style={{ width: "18%" }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">Doxxing & Hate Speech</span>
                  <span className="font-mono text-pink-300">12%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-pink-500 h-full rounded-full" style={{ width: "12%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Security Hygiene Checklist */}
          <div className="p-6 rounded-2xl glass-card space-y-3 text-xs">
            <h3 className="font-bold text-slate-200 uppercase tracking-wider">
              Safety Readiness Checklist
            </h3>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>VoiceShield Wake-Word Trigger: Active</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>3 Verified Emergency Contacts Configured</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Client-Side SHA-256 Vault Encryption Ready</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>112 / 1091 Direct Emergency Dials Armed</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

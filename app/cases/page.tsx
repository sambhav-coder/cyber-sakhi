"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FolderOpen,
  Loader2,
  AlertCircle,
  Trash2,
  ArrowRight,
  FileText,
  ShieldCheck,
  Lock,
  LogIn,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";

interface CaseSummary {
  id: string;
  caseNumber: string | null;
  title: string | null;
  threatType: string | null;
  status: string | null;
  severity: string | null;
  createdAt: string;
  updatedAt: string | null;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    open: "bg-sky-950 border-sky-700/50 text-sky-300",
    investigating: "bg-amber-950 border-amber-700/50 text-amber-300",
    escalated: "bg-red-950 border-red-700/50 text-red-300",
    resolved: "bg-emerald-950 border-emerald-700/50 text-emerald-300",
  };
  return map[status] || "bg-slate-900 border-slate-700 text-slate-300";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CasesPage() {
  const { data: session, status } = useSession();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cases");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load cases.");
        return;
      }
      setCases(data.cases || []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      loadCases();
    }
  }, [session]);

  if (status === "loading") {
    return (
      <div className="min-h-[300px] flex items-center justify-center animate-in fade-in">
        <Loader2 className="w-6 h-6 text-emergency-400 animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated" || !session) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl glass-panel border-emergency-800/30 text-center space-y-4 animate-in zoom-in-95">
        <Lock className="w-8 h-8 text-emergency-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Sign in to view your cases</h2>
        <Link
          href="/login?callbackUrl=/cases"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold"
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Link>
      </div>
    );
  }

  const handleDelete = async (caseId: string) => {
    if (!window.confirm("Delete this case and all of its evidence, reports and indicators?")) {
      return;
    }
    setDeletingId(caseId);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete case.");
      } else {
        setCases((prev) => prev.filter((c) => c.id !== caseId));
      }
    } catch {
      setError("Network error while deleting the case.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-2">
        <EyebrowBadge icon={FolderOpen}>
          <span>Case Dashboard</span>
        </EyebrowBadge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">My Investigation Cases</h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          Every email forensic scan you save becomes a private case with a unique Case Number,
          ownership-protected data, and downloadable forensic reports. Only you can view these cases.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Loader2 className="w-6 h-6 text-emergency-400 animate-spin" />
      ) : cases.length === 0 ? (
        <div className="p-10 rounded-2xl glass-panel border-emergency-900/30 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">No cases yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Run an email forensic scan and save it as a case — you will be able to track it here
            with its Case Number, threat assessment, indicators and reports.
          </p>
          <Link
            href="/email-forensics"
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold"
          >
            <FileText className="w-4 h-4" />
            Open Email Forensics
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cases.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl glass-card border-emergency-900/25 space-y-3 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-base font-bold text-emergency-300">{c.caseNumber}</div>
                  <div className="text-sm text-slate-300 mt-0.5 truncate">{c.title || "Untitled case"}</div>
                </div>
                <ThreatBadge
                  severity={(c.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "SAFE") || "LOW"}
                  size="sm"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className={`px-2 py-0.5 rounded-lg border font-bold uppercase ${statusBadge(c.status || "open")}`}>
                  {c.status || "open"}
                </span>
                {c.threatType && (
                  <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-mono uppercase">
                    {c.threatType}
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-500">Created {formatDate(c.createdAt)}</div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <Link
                  href={`/cases/${c.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emergency-400 hover:text-emergency-300 transition"
                >
                  <span>Open Case</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition disabled:opacity-50"
                  title="Delete case"
                >
                  {deletingId === c.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
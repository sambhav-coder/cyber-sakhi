"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  History,
  Inbox,
  Loader2,
  Mail,
  Search,
  Trash2,
} from "lucide-react";

interface HistoryItem {
  id: string;
  subject: string | null;
  sender: string | null;
  verdict: string | null;
  riskScore: number | null;
  source: string | null;
  caseId: string | null;
  createdAt: string;
}

const VERDICT_STYLE: Record<string, string> = {
  CRITICAL: "text-red-300 bg-red-500/10 border-red-500/25",
  HIGH: "text-orange-300 bg-orange-500/10 border-orange-500/25",
  MEDIUM: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  LOW: "text-sky-300 bg-sky-500/10 border-sky-500/25",
  SAFE: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
};

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"] as const;
type Filter = (typeof FILTERS)[number];

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailHistoryPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-forensics/history", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not load your analysis history.");
          setItems([]);
          return;
        }
        setItems(data.items || []);
      } catch {
        setError("Network error while loading your history.");
        setItems([]);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((i) => {
      if (filter !== "ALL" && i.verdict !== filter) return false;
      if (!q) return true;
      return (
        (i.subject || "").toLowerCase().includes(q) ||
        (i.sender || "").toLowerCase().includes(q)
      );
    });
  }, [items, query, filter]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this analysis from your history? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email-forensics/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => (prev || []).filter((i) => i.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete this analysis.");
      }
    } catch {
      setError("Network error while deleting.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/email-forensics"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Email Forensics
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-50">
              <History className="h-6 w-6 text-red-400" />
              Analysis history
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Every email you&apos;ve analyzed, newest first. Open one to see its full report.
            </p>
          </div>
          <Link
            href="/email-forensics"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Mail className="h-4 w-4" />
            Analyze an email
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by subject or sender"
            className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-red-500/40 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors ${
                filter === f ? "bg-white/[0.08] text-slate-50" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your history…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/[0.1] px-6 py-16 text-center">
          <Inbox className="h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-300">
            {items.length === 0 ? "No analyses yet" : "Nothing matches your search"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {items.length === 0
              ? "Emails you analyze by pasting or from Gmail will show up here."
              : "Try a different word or filter."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {visible.map((item) => (
            <li key={item.id} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03]">
              <Link
                href={`/email-forensics?history=${encodeURIComponent(item.id)}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span
                  className={`inline-flex w-[76px] shrink-0 justify-center rounded-md border px-2 py-1 text-[10px] font-bold tracking-wider ${
                    VERDICT_STYLE[item.verdict || ""] || "text-slate-300 bg-white/[0.04] border-white/[0.08]"
                  }`}
                >
                  {item.verdict || "—"}
                  {typeof item.riskScore === "number" ? ` · ${item.riskScore}` : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {item.subject || "(no subject)"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-500">
                    <span className="truncate">{item.sender || "unknown sender"}</span>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">{item.source === "gmail" ? "Gmail" : "Pasted"}</span>
                    {item.caseId && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-red-300/80">
                        <FolderOpen className="h-3 w-3" />
                        Case
                      </span>
                    )}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-slate-500 sm:block">{formatWhen(item.createdAt)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="shrink-0 rounded-lg p-2 text-slate-600 opacity-100 transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-100"
                aria-label="Delete from history"
                title="Delete from history"
              >
                {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

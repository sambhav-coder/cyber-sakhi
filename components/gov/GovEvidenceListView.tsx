"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface GovEvidenceListItem {
  id: string;
  evidenceCode: string;
  title: string;
  category: string | null;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  createdAt: string;
  source: string | null;
  blockchainAnchorId: string | null;
  caseId: string;
  caseNumber: string | null;
  stateCode: string | null;
  districtCode: string | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function GovEvidenceListView() {
  const [evidenceList, setEvidenceList] = useState<GovEvidenceListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvidenceList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/gov/api/evidence", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized - Please log in");
        }
        if (response.status === 403) {
          throw new Error("Access denied - Check your permissions");
        }
        throw new Error(`Failed to load evidence (${response.status})`);
      }
      const data = await response.json();
      setEvidenceList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evidence");
      setEvidenceList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvidenceList();
  }, [loadEvidenceList]);

  if (loading) {
    return (
      <section className="gov-panel p-6">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <span>Loading evidence list…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="gov-panel p-6">
        <div className="text-rose-300">
          <p className="font-semibold">Error loading evidence</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            onClick={() => void loadEvidenceList()}
            className="mt-3 rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!evidenceList || evidenceList.length === 0) {
    return (
      <section className="gov-panel p-6">
        <div className="text-slate-400">
          <p className="font-semibold">No evidence found</p>
          <p className="mt-1 text-sm">There are no evidence records in your jurisdiction scope.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="gov-panel p-5">
        <h2 className="text-xl font-bold text-slate-100">Evidence & Chain of Custody</h2>
        <p className="mt-1 text-sm text-slate-500">
          Evidence records across your jurisdiction scope. Click to view case details and chain of custody.
        </p>
      </section>

      <section className="gov-panel overflow-x-auto p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-2">Evidence Code</th>
              <th className="p-2">Title</th>
              <th className="p-2">Case</th>
              <th className="p-2">Location</th>
              <th className="p-2">Category</th>
              <th className="p-2">Size</th>
              <th className="p-2">Created</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {evidenceList.map((evidence) => (
              <tr key={evidence.id} className="border-b border-slate-800 text-slate-300">
                <td className="p-2">
                  <Link 
                    className="font-mono text-teal-300" 
                    href={`/gov/cases/${evidence.caseId}`}
                  >
                    {evidence.evidenceCode}
                  </Link>
                </td>
                <td className="p-2 truncate max-w-xs">{evidence.title}</td>
                <td className="p-2">
                  <Link 
                    className="font-mono text-teal-300" 
                    href={`/gov/cases/${evidence.caseId}`}
                  >
                    {evidence.caseNumber ?? evidence.caseId}
                  </Link>
                </td>
                <td className="p-2">
                  {evidence.stateCode ?? "—"} / {evidence.districtCode ?? "—"}
                </td>
                <td className="p-2">{evidence.category || "Uncategorized"}</td>
                <td className="p-2">{formatFileSize(evidence.fileSize)}</td>
                <td className="p-2">{formatTimestamp(evidence.createdAt)}</td>
                <td className="p-2">
                  {evidence.blockchainAnchorId ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      Anchored
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400">
                      Unanchored
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
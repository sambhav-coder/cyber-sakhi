"use client";

import { useCallback, useEffect, useState } from "react";

interface GovCaseEvidenceRow {
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
}

interface ChainOfCustodyRow {
  id: string;
  evidence_id: string;
  action: string;
  actor_id: string | null;
  notes: string | null;
  previous_hash: string | null;
  event_hash: string | null;
  hash: string | null;
  created_at: string;
}

interface EvidenceIntegrity {
  row: {
    id: string;
    evidence_code: string | null;
    title: string;
    category: string | null;
    mime_type: string | null;
    file_size: number | null;
    sha256: string | null;
    created_at: string;
    source: string | null;
    blockchain_anchor_id: string | null;
  } | null;
  custody: ChainOfCustodyRow[];
  custodyVerification: {
    isValid: boolean;
    errors: string[];
    verifiedEventCount: number;
    totalEventCount: number;
    schemaVersion: string;
  } | null;
  anchor: {
    network_name: string | null;
    chain_id: string | null;
    block_number: number | null;
    anchored_digest: string | null;
    anchored_at: string | null;
    status: string | null;
  } | null;
  anchorVerification: {
    status: string;
    reason?: string | null;
    chainName?: string | null;
    chainId?: string | null;
    blockNumber?: number | null;
    anchoredDigest?: string | null;
    expectedDigest?: string | null;
    verifiedAt?: string | null;
    anchoredAt?: string | null;
  } | null;
  expectedDigest: { source: string; value: string } | null;
  chain: string | null;
}

interface GovEvidenceViewProps {
  caseId: string;
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

function truncateHash(hash: string | null, length: number = 12): string {
  if (!hash) return "—";
  if (hash.length <= length) return hash;
  return `${hash.substring(0, length)}...`;
}

function getStatusBadge(status: string, isValid: boolean): JSX.Element {
  const styles = {
    verified: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    unavailable: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  };

  const statusKey = isValid ? "verified" : status === "unavailable" ? "unavailable" : "failed";
  const style = styles[statusKey as keyof typeof styles] || styles.unavailable;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
      {isValid ? "Verified" : status === "unavailable" ? "Unavailable" : "Failed"}
    </span>
  );
}

export function GovEvidenceView({ caseId }: GovEvidenceViewProps) {
  const [evidenceList, setEvidenceList] = useState<GovCaseEvidenceRow[] | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [evidenceDetail, setEvidenceDetail] = useState<EvidenceIntegrity | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadEvidenceList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/gov/api/cases/${caseId}/evidence`, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized - Please log in");
        }
        if (response.status === 403) {
          throw new Error("Access denied - Check your permissions");
        }
        if (response.status === 404) {
          throw new Error("Case not found or not in your scope");
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
  }, [caseId]);

  const loadEvidenceDetail = useCallback(async (evidenceId: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const response = await fetch(`/gov/api/evidence/${evidenceId}?verify=true`, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized - Please log in");
        }
        if (response.status === 403) {
          throw new Error("Access denied - Check your permissions");
        }
        if (response.status === 404) {
          throw new Error("Evidence not found or not in your scope");
        }
        throw new Error(`Failed to load evidence detail (${response.status})`);
      }
      const data = await response.json();
      setEvidenceDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load evidence detail");
      setEvidenceDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvidenceList();
  }, [loadEvidenceList]);

  const handleSelectEvidence = (evidenceId: string) => {
    setSelectedEvidence(evidenceId);
    void loadEvidenceDetail(evidenceId);
  };

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
          <p className="mt-1 text-sm">This case has no associated evidence records.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="gov-panel p-5">
        <h3 className="font-bold text-slate-100">Evidence ({evidenceList.length})</h3>
        <p className="mt-1 text-sm text-slate-500">
          Click an evidence item to view chain of custody and integrity details.
        </p>
        <div className="mt-4 space-y-2">
          {evidenceList.map((evidence) => (
            <button
              key={evidence.id}
              onClick={() => handleSelectEvidence(evidence.id)}
              className={`w-full rounded border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                selectedEvidence === evidence.id
                  ? "border-teal-500 bg-teal-500/5"
                  : "border-slate-700 bg-slate-950 hover:border-slate-600"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-teal-300">{evidence.evidenceCode}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-100 truncate">{evidence.title}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{evidence.category || "Uncategorized"}</span>
                    <span>·</span>
                    <span>{formatFileSize(evidence.fileSize)}</span>
                    <span>·</span>
                    <span>{formatTimestamp(evidence.createdAt)}</span>
                  </div>
                </div>
                {evidence.blockchainAnchorId && (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    Anchored
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedEvidence && (
        <section className="gov-panel p-5">
          <h3 className="font-bold text-slate-100">Evidence Details & Chain of Custody</h3>
          {detailLoading ? (
            <div className="mt-4 flex items-center gap-3 text-slate-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              <span>Loading evidence details…</span>
            </div>
          ) : detailError ? (
            <div className="mt-4 text-rose-300">
              <p className="font-semibold">Error loading evidence details</p>
              <p className="mt-1 text-sm">{detailError}</p>
              <button
                onClick={() => void loadEvidenceDetail(selectedEvidence)}
                className="mt-3 rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                Retry
              </button>
            </div>
          ) : evidenceDetail ? (
            <div className="mt-4 space-y-6">
              {/* Evidence Overview */}
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-200">Evidence Overview</h4>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Evidence Code</dt>
                    <dd className="font-mono text-teal-300">{evidenceDetail.row?.evidence_code || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Title</dt>
                    <dd className="text-slate-200">{evidenceDetail.row?.title || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Category</dt>
                    <dd className="text-slate-200">{evidenceDetail.row?.category || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">File Type</dt>
                    <dd className="text-slate-200">{evidenceDetail.row?.mime_type || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">File Size</dt>
                    <dd className="text-slate-200">{formatFileSize(evidenceDetail.row?.file_size ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">SHA-256</dt>
                    <dd className="font-mono text-xs text-slate-400">{truncateHash(evidenceDetail.row?.sha256 ?? null, 16)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-slate-200">{evidenceDetail.row?.created_at ? formatTimestamp(evidenceDetail.row.created_at) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Source</dt>
                    <dd className="text-slate-200">{evidenceDetail.row?.source || "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* Integrity Status */}
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-200">Integrity Status</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Chain of Custody</span>
                    {evidenceDetail.custodyVerification ? (
                      getStatusBadge(
                        evidenceDetail.custodyVerification.isValid ? "verified" : "failed",
                        evidenceDetail.custodyVerification.isValid
                      )
                    ) : (
                      <span className="text-xs text-slate-500">Not available</span>
                    )}
                  </div>
                  {evidenceDetail.custodyVerification && (
                    <div className="text-xs text-slate-500">
                      {evidenceDetail.custodyVerification.verifiedEventCount} of {evidenceDetail.custodyVerification.totalEventCount} events verified
                      {evidenceDetail.custodyVerification.errors.length > 0 && (
                        <div className="mt-1 text-rose-400">
                          Errors: {evidenceDetail.custodyVerification.errors.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Blockchain Anchor</span>
                    {evidenceDetail.anchorVerification ? (
                      getStatusBadge(
                        evidenceDetail.anchorVerification.status,
                        evidenceDetail.anchorVerification.status === "confirmed"
                      )
                    ) : (
                      <span className="text-xs text-slate-500">Not anchored</span>
                    )}
                  </div>
                  {evidenceDetail.anchorVerification && evidenceDetail.anchorVerification.reason && (
                    <div className="text-xs text-slate-500">{evidenceDetail.anchorVerification.reason}</div>
                  )}
                  {evidenceDetail.chain && (
                    <div className="text-xs text-slate-500">Chain: {evidenceDetail.chain}</div>
                  )}
                </div>
              </div>

              {/* Chain of Custody Timeline */}
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-200">Chain of Custody Timeline</h4>
                {!evidenceDetail.custody || evidenceDetail.custody.length === 0 ? (
                  <p className="text-sm text-slate-500">No chain of custody events recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {evidenceDetail.custody.map((event, index) => (
                      <div
                        key={event.id}
                        className="relative border-l-2 border-slate-700 pl-4 pb-4 last:pb-0"
                      >
                        <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-teal-500" />
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-200">{event.action}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatTimestamp(event.created_at)}
                            </p>
                            {event.actor_id && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                Actor: <span className="font-mono">{truncateHash(event.actor_id, 8)}</span>
                              </p>
                            )}
                            {event.notes && (
                              <p className="mt-1 text-xs text-slate-400 italic">"{event.notes}"</p>
                            )}
                          </div>
                          {event.event_hash && (
                            <div className="text-right">
                              <p className="text-xs text-slate-500">Hash verified</p>
                              <p className="font-mono text-xs text-slate-600">{truncateHash(event.event_hash, 8)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

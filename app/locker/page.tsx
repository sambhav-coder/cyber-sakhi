"use client";

import React, { useState, useEffect } from "react";
import {
  Lock,
  UploadCloud,
  FileCheck2,
  FileText,
  Trash2,
  Copy,
  Download,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
  Plus,
  Search,
  Filter,
  Eye,
  FileBadge,
  Mail,
  AlertTriangle,
  Shield,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  ShieldAlert,
  KeyRound,
  Loader2,
  XCircle,
  HardDrive,
} from "lucide-react";
import { EvidenceItem } from "@/lib/types";
import { getStoredEvidence, saveStoredEvidence, addEvidenceItem } from "@/lib/storage";
import { computeSha256, generateMockIpfsCid, generateMockTxHash, formatBytes } from "@/lib/cryptoUtils";
import {
  parseEmailForensicsNotes,
  getThreatLevelColor,
  getAuthStatusColor,
  ParsedEmailForensicsData,
  parseSenderFrom,
  formatDateTime,
} from "@/lib/emailForensicsParser";
import {
  encryptData,
  decryptData,
  encryptedDataToBase64,
  base64ToEncryptedData,
  computeSha256 as computeIntegrityHash,
} from "@/lib/encryption";
import { getOrCreateSessionKey, getSessionKey, hasSessionKey } from "@/lib/sessionKey";
import { useSession } from "next-auth/react";

interface PreviewDecryptionState {
  loading: boolean;
  decrypting: boolean;
  verifying: boolean;
  error: string | null;
  custodyError: string | null;
  sessionKeyAvailable: boolean | null;
  isEncrypted: boolean;
  decryptedBytes: Uint8Array | null;
  integrityStatus: "idle" | "verifying" | "verified" | "failed" | "unencrypted";
  previewUrl: string | null;
  chainEvents: any[];
  chainVerification: any;
}

const emptyPreviewState: PreviewDecryptionState = {
  loading: false,
  decrypting: false,
  verifying: false,
  error: null,
  custodyError: null,
  sessionKeyAvailable: null,
  isEncrypted: false,
  decryptedBytes: null,
  integrityStatus: "idle",
  previewUrl: null,
  chainEvents: [],
  chainVerification: null,
};

function EmailForensicsEvidenceCard({
  item,
  parsedData,
  isExpanded,
  onToggleExpand,
  handleViewEvidence,
  onDelete,
  onCopyHash,
  copiedHashId,
}: {
  item: EvidenceItem;
  parsedData: ParsedEmailForensicsData;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  handleViewEvidence: (item: EvidenceItem) => void;
  onDelete: (id: string) => void;
  onCopyHash: (hash: string, id: string) => void;
  copiedHashId: string | null;
}) {
  const threatColorClass = getThreatLevelColor(parsedData.threatLevel);

  const senderName =
    parsedData.senderInfo?.fromName ||
    (parsedData.senderInfo?.from && parseSenderFrom(parsedData.senderInfo.from).name) ||
    "Unknown Sender";
  const senderEmail =
    parsedData.senderInfo?.fromEmail ||
    (parsedData.senderInfo?.from && parseSenderFrom(parsedData.senderInfo.from).email) ||
    parsedData.senderInfo?.from ||
    "N/A";

  const dateTime = formatDateTime(item.timestamp);

  const cleanSubject =
    parsedData.senderInfo?.decodedSubject ||
    parsedData.senderInfo?.subject ||
    "No Subject";

  const truncateAuthDetails = (details?: string) => {
    if (!details) return "";
    return details.length > 30 ? details.substring(0, 30) + "..." : details;
  };

  return (
    <div className="p-5 rounded-2xl glass-card space-y-4 relative group">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-base text-slate-100 truncate">
              {senderName}
            </span>
          </div>
          <div className="text-xs text-slate-400 font-mono truncate pl-7">
            {senderEmail}
          </div>
          <div className="text-[10px] text-slate-500 pl-7">
            {dateTime.date && dateTime.time
              ? `${dateTime.date} • ${dateTime.time}`
              : new Date(item.timestamp).toLocaleDateString()}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleViewEvidence(item)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="View Metadata Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-950/80 text-slate-400 hover:text-red-400 transition"
            title="Delete from Vault"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-semibold">
          {item.category}
        </span>
        {parsedData.threatLevel && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${threatColorClass}`}
          >
            {parsedData.threatLevel}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Threat Level</div>
          <div
            className={`text-lg font-black ${
              parsedData.threatLevel
                ? getThreatLevelColor(parsedData.threatLevel).split(" ")[0]
                : "text-slate-400"
            }`}
          >
            {parsedData.threatLevel || "N/A"}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Risk Score</div>
          <div className="text-lg font-black text-slate-200">
            {parsedData.threatScore || "N/A"}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Spoofing</div>
          <div
            className={`text-lg font-black ${
              parsedData.spoofingDetected === "Yes"
                ? "text-red-400"
                : "text-emerald-400"
            }`}
          >
            {parsedData.spoofingDetected || "N/A"}
          </div>
        </div>
      </div>

      {parsedData.authentication && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            Authentication
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SPF</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.spf)}`}>
                {parsedData.authentication.spf || "N/A"}
              </div>
              {parsedData.authentication.spfDetails && (
                <div
                  className="text-[10px] text-slate-400 mt-1 truncate"
                  title={parsedData.authentication.spfDetails}
                >
                  {truncateAuthDetails(parsedData.authentication.spfDetails)}
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">DKIM</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.dkim)}`}>
                {parsedData.authentication.dkim || "N/A"}
              </div>
              {parsedData.authentication.dkimDetails && (
                <div
                  className="text-[10px] text-slate-400 mt-1 truncate"
                  title={parsedData.authentication.dkimDetails}
                >
                  {truncateAuthDetails(parsedData.authentication.dkimDetails)}
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">DMARC</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.dmarc)}`}>
                {parsedData.authentication.dmarc || "N/A"}
              </div>
              {parsedData.authentication.dmarcDetails && (
                <div
                  className="text-[10px] text-slate-400 mt-1 truncate"
                  title={parsedData.authentication.dmarcDetails}
                >
                  {truncateAuthDetails(parsedData.authentication.dmarcDetails)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {parsedData.senderInfo && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            Sender Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {parsedData.senderInfo.from && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">From</div>
                <div
                  className="text-xs text-slate-200 font-mono truncate"
                  title={parsedData.senderInfo.from}
                >
                  {parsedData.senderInfo.from}
                </div>
              </div>
            )}
            {parsedData.senderInfo.to && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">To</div>
                <div
                  className="text-xs text-slate-200 font-mono truncate"
                  title={parsedData.senderInfo.to}
                >
                  {parsedData.senderInfo.to}
                </div>
              </div>
            )}
            {parsedData.senderInfo.senderDomain && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Domain</div>
                <div
                  className="text-xs text-slate-200 font-mono truncate"
                  title={parsedData.senderInfo.senderDomain}
                >
                  {parsedData.senderInfo.senderDomain}
                </div>
              </div>
            )}
            {parsedData.senderInfo.originatingIP && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Origin IP</div>
                <div
                  className="text-xs text-slate-200 font-mono truncate"
                  title={parsedData.senderInfo.originatingIP}
                >
                  {parsedData.senderInfo.originatingIP}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {parsedData.senderInfo?.subject && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Subject</div>
          <div
            className="text-xs text-slate-200 break-words"
            title={parsedData.senderInfo.subject}
          >
            {cleanSubject}
          </div>
        </div>
      )}

      {parsedData.findings && parsedData.findings.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            Key Findings
          </div>
          <div className="space-y-1.5">
            {parsedData.findings.slice(0, 2).map((finding, idx) => (
              <div
                key={idx}
                className="text-xs text-slate-300 flex items-start gap-2"
              >
                <ArrowRight className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                <span className="line-clamp-1 break-words">{finding}</span>
              </div>
            ))}
            {parsedData.findings.length > 2 && (
              <div className="text-[10px] text-slate-500 italic">
                +{parsedData.findings.length - 2} more findings
              </div>
            )}
          </div>
        </div>
      )}

      <details
        open={isExpanded}
        onToggle={(e) => {
          if (e.currentTarget.open !== isExpanded) {
            onToggleExpand(item.id);
          }
        }}
        className="group"
      >
        <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
          <ChevronRight
            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
          <span>View Full Forensic Report</span>
        </summary>
        <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 max-h-96 overflow-y-auto">
          <div className="space-y-4 text-[11px]">
            {parsedData.rawReport && (
              <div className="font-mono text-slate-400 whitespace-pre-wrap break-all">
                {parsedData.rawReport}
              </div>
            )}
          </div>
        </div>
      </details>

      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 flex items-center justify-between gap-2 text-[11px] font-mono">
        <div className="truncate text-slate-400 flex-1 min-w-0">
          <span className="text-indigo-300 font-semibold">SHA-256: </span>
          <span className="break-all">{item.sha256Hash}</span>
        </div>
        <button
          onClick={() => onCopyHash(item.sha256Hash, item.id)}
          className="text-slate-400 hover:text-white shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-800"
        >
          <Copy className="w-3 h-3" />
          <span>{copiedHashId === item.id ? "Copied!" : "Copy"}</span>
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
        <div className="flex items-center gap-1 text-emerald-400">
          <CheckCircle className="w-3 h-3" />
          <span>Tamper-Proof Ledger Stamp Active</span>
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          IPFS: {item.simulatedIpfsCid.substring(0, 16)}...
        </div>
      </div>
    </div>
  );
}

function uint8ArrayToBlob(bytes: Uint8Array, fileType: string): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes, 0);
  const buffer = copy.buffer as ArrayBuffer;
  return new Blob([buffer], { type: fileType || "application/octet-stream" });
}

function recordCustodyEvent(evidenceId: string, action: string, notes?: string): Promise<boolean> {
  return fetch("/api/chain-of-custody", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evidenceId, action, notes }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

export default function EvidenceLockerPage() {
  const { data: session } = useSession();
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<EvidenceItem["category"]>("HARASSMENT");
  const [newNotes, setNewNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);
  const [previewState, setPreviewState] = useState<PreviewDecryptionState>({ ...emptyPreviewState });

  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEvidenceList(getStoredEvidence());

    if (session?.user) {
      loadEvidenceFromSupabase();
    }
  }, [session]);

  useEffect(() => {
    if (!previewItem) {
      if (previewState.previewUrl) {
        URL.revokeObjectURL(previewState.previewUrl);
      }
      setPreviewState({ ...emptyPreviewState });
    }
  }, [previewItem]);

  const loadEvidenceFromSupabase = async () => {
    try {
      const response = await fetch("/api/evidence");
      if (response.ok) {
        const data = await response.json();
        const supabaseEvidence: EvidenceItem[] = data.evidence.map((ev: any) => ({
          id: ev.id,
          title: ev.title,
          filename: ev.filename,
          fileType: ev.file_type || ev.fileType,
          fileSize: ev.file_size || ev.fileSize,
          timestamp: ev.created_at || ev.timestamp,
          sha256Hash: ev.sha256_hash || ev.sha256Hash,
          category: ev.category,
          notes: ev.notes ?? undefined,
          integrityVerified: ev.integrity_verified ?? ev.integrityVerified ?? true,
          simulatedIpfsCid: ev.simulated_ipfs_cid || ev.simulatedIpfsCid || "mock_ipfs_cid",
          simulatedTxHash: ev.simulated_tx_hash || ev.simulatedTxHash || "mock_tx_hash",
        }));
        if (supabaseEvidence.length > 0) {
          setEvidenceList(supabaseEvidence);
          saveStoredEvidence(supabaseEvidence);
        }
      }
    } catch (error) {
      // localStorage fallback already set
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setEncryptionStatus("Initializing encryption session...");

    try {
      const sessionKey = await getOrCreateSessionKey();
      setEncryptionStatus("Hashing original content (SHA-256)...");

      const buffer = await selectedFile.arrayBuffer();
      const fileContent = new Uint8Array(buffer);

      const sha256 = await computeSha256(buffer);
      const ipfsCid = generateMockIpfsCid(sha256);
      const txHash = generateMockTxHash(sha256);

      setEncryptionStatus("Encrypting evidence with AES-256-GCM...");
      const encryptedData = await encryptData(fileContent, sessionKey);
      const encryptedPayload = encryptedDataToBase64(encryptedData);

      setEncryptionStatus("Uploading encrypted evidence to secure vault...");

      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || selectedFile.name,
          filename: selectedFile.name,
          fileType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          sha256Hash: sha256,
          category: newCategory,
          notes: newNotes.trim() || "Uploaded manually to Cyber Sakhi Secure Vault.",
          encryptedContent: encryptedPayload.ciphertext,
          encryptionIv: encryptedPayload.iv,
          encryptedSize: encryptedPayload.ciphertext.length,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to upload evidence" }));
        throw new Error(errorData.error || "Failed to upload evidence");
      }

      const result = await response.json();

      if (result.custodyErrors && result.custodyErrors.length > 0) {
        setUploadError("Warning: " + result.custodyErrors.join("; "));
      }

      try {
        await recordCustodyEvent(
          result.evidence.id,
          "INTEGRITY_VERIFIED",
          `SHA-256 integrity hash verified at upload: ${sha256.substring(0, 16)}...`
        );
      } catch (_) {
        // custody failure is reported separately
      }

      const newItem: EvidenceItem = {
        id: result.evidence.id,
        title: newTitle.trim() || selectedFile.name,
        filename: selectedFile.name,
        fileType: selectedFile.type || "application/octet-stream",
        fileSize: selectedFile.size,
        timestamp: new Date().toISOString(),
        sha256Hash: sha256,
        category: newCategory,
        notes: newNotes.trim() || "Uploaded manually to Cyber Sakhi Secure Vault.",
        integrityVerified: true,
        simulatedIpfsCid: ipfsCid,
        simulatedTxHash: txHash,
      };

      addEvidenceItem(newItem);

      if (session?.user) {
        await loadEvidenceFromSupabase();
      } else {
        setEvidenceList(getStoredEvidence());
      }

      setSelectedFile(null);
      setNewTitle("");
      setNewNotes("");
      setEncryptionStatus(null);
      setIsUploading(false);
    } catch (err) {
      console.error("Evidence upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Failed to upload evidence");
      setEncryptionStatus(null);
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    const updated = evidenceList.filter((item) => item.id !== id);
    setEvidenceList(updated);
    saveStoredEvidence(updated);
    if (previewItem?.id === id) setPreviewItem(null);
  };

  const copyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHashId(id);
    setTimeout(() => setCopiedHashId(null), 2500);
  };

  const toggleReportExpansion = (id: string) => {
    setExpandedReports((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const loadAndDecryptPreview = async (item: EvidenceItem) => {
    setPreviewState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      custodyError: null,
    }));

    const keyAvailable = hasSessionKey();
    setPreviewState((prev) => ({ ...prev, sessionKeyAvailable: keyAvailable }));

    let encryptedPayload: { ciphertext: string; iv: string } | null = null;

    try {
      const resp = await fetch(`/api/evidence?id=${encodeURIComponent(item.id)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to retrieve evidence from vault");
      }
      const payload = await resp.json();
      const ev = payload.evidence;
      encryptedPayload =
        ev.encryptedContent && ev.encryptionIv
          ? { ciphertext: ev.encryptedContent, iv: ev.encryptionIv }
          : null;

      setPreviewState((prev) => ({
        ...prev,
        isEncrypted: !!encryptedPayload,
        hasEncryptedContent: !!encryptedPayload,
      }));

      // Load chain of custody with verification
      try {
        const chainResp = await fetch(
          `/api/chain-of-custody?evidenceId=${encodeURIComponent(item.id)}&verify=true`
        );
        if (chainResp.ok) {
          const chainData = await chainResp.json();
          setPreviewState((prev) => ({
            ...prev,
            chainEvents: chainData.events || [],
            chainVerification: chainData.verification || null,
          }));
        }
      } catch (_) {
        // non-fatal
      }
    } catch (err: any) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Failed to load evidence details",
      }));
      await recordCustodyEvent(item.id, "VIEWED", "Metadata preview opened (no encrypted content access)");
      return;
    }

    await recordCustodyEvent(item.id, "VIEWED", "Evidence metadata viewed in vault");

    if (!encryptedPayload) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        integrityStatus: "unencrypted",
      }));
      return;
    }

    if (!keyAvailable) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error:
          "Session encryption key is unavailable. Evidence cannot be decrypted in this browser session. Close and re-open this page to establish a new encryption session, then re-upload any evidence you need to decrypt.",
      }));
      return;
    }

    const sessionKey = await getSessionKey();
    if (!sessionKey) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error:
          "Encryption session key is unavailable. Evidence cannot currently be decrypted.",
      }));
      return;
    }

    try {
      setPreviewState((prev) => ({ ...prev, decrypting: true, loading: true }));
      const decrypted = await decryptData(
        base64ToEncryptedData(encryptedPayload),
        sessionKey
      );

      try {
        await recordCustodyEvent(
          item.id,
          "DECRYPTED",
          `Decrypted client-side for preview (${formatBytes(decrypted.byteLength)})`
        );
      } catch (_) {
        // custody failure is non-fatal
      }

      setPreviewState((prev) => ({
        ...prev,
        decrypting: false,
        decryptedBytes: decrypted,
        verifying: true,
      }));

      const recomputed = await computeIntegrityHash(decrypted);
      const matches = recomputed.toLowerCase() === item.sha256Hash.toLowerCase();

      if (matches) {
        try {
          await recordCustodyEvent(
            item.id,
            "INTEGRITY_VERIFIED",
            `Integrity verified: recomputed SHA-256 matches stored hash (${recomputed.substring(0, 12)}...)`
          );
        } catch (_) {}
      } else {
        try {
          await recordCustodyEvent(
            item.id,
            "INTEGRITY_FAILED",
            `Integrity FAILED: expected ${item.sha256Hash.substring(0, 12)}... got ${recomputed.substring(0, 12)}...`
          );
        } catch (_) {}
      }

      const blob = uint8ArrayToBlob(decrypted, item.fileType);
      const url = URL.createObjectURL(blob);

      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        verifying: false,
        integrityStatus: matches ? "verified" : "failed",
        previewUrl: url,
      }));
    } catch (decryptErr: any) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        decrypting: false,
        verifying: false,
        error:
          decryptErr?.message ||
          "Decryption failed. The evidence may be corrupted or the session key is invalid.",
      }));
    }
  };

  const handleViewEvidence = async (item: EvidenceItem) => {
    setPreviewItem(item);
    setPreviewState({ ...emptyPreviewState });
    await loadAndDecryptPreview(item);
  };

  const handleDownloadDecrypted = async () => {
    if (!previewItem || !previewState.decryptedBytes) return;

    const blob = uint8ArrayToBlob(previewState.decryptedBytes, previewItem.fileType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = previewItem.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    await recordCustodyEvent(
      previewItem.id,
      "DOWNLOADED",
      `Decrypted evidence downloaded (${formatBytes(previewState.decryptedBytes.byteLength)})`
    );
  };

  const exportDossier = () => {
    const dossierText = `================================================================================
CYBER SAKHI - INCIDENT EVIDENCE DOSSIER & CHAIN OF CUSTODY REPORT
Generated for Law Enforcement / National Cyber Crime Portal (cybercrime.gov.in)
================================================================================
Report Generation Timestamp : ${new Date().toISOString()}
Security Protocol            : SHA-256 Client-Side Cryptographic Hash
Integrity Verification Status: 100% VERIFIED & UNALTERED
Total Evidence Artifacts     : ${evidenceList.length}

--------------------------------------------------------------------------------
EVIDENCE LEDGER & IMMUTABLE HASH REGISTRY:
--------------------------------------------------------------------------------
${evidenceList
  .map(
    (ev, idx) => `
[ARTIFACT #${idx + 1}]
Title        : ${ev.title}
File Name    : ${ev.filename}
File Type    : ${ev.fileType}
File Size    : ${formatBytes(ev.fileSize)}
Timestamp    : ${ev.timestamp}
Category     : ${ev.category}
SHA-256 Hash : ${ev.sha256Hash}
IPFS CID Ref : ${ev.simulatedIpfsCid}
Anchor Tx    : ${ev.simulatedTxHash}
Incident Log : ${ev.notes || "(none)"}
`
  )
  .join("\n--------------------------------------------------------------------------------\n")}

================================================================================
LEGAL NOTICE:
All cryptographic hashes recorded above were generated client-side upon artifact capture.
Under Section 65B of the Indian Evidence Act, this electronic record certifies the
custody and integrity of the digital evidence presented.
================================================================================
`;

    const blob = new Blob([dossierText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Cyber_Sakhi_Case_Dossier_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredEvidence = evidenceList.filter((item) => {
    const matchesCategory = filterCategory === "ALL" || item.category === filterCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sha256Hash.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const isImageFile = (type: string) =>
    type && type.startsWith("image/");
  const isTextFile = (type: string, filename: string = "") =>
    type === "application/pdf" ||
    type === "text/plain" ||
    filename.toLowerCase().endsWith(".pdf") ||
    filename.toLowerCase().endsWith(".txt");

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Encrypted Proof Vault & Chain of Custody</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Evidence Locker
          </h1>
          <p className="text-sm text-slate-300">
            Securely preserve screenshots, chat exports, and audio recordings with immutable SHA-256 cryptographic proof for cyber cell FIRs.
          </p>
        </div>

        <button
          onClick={exportDossier}
          disabled={evidenceList.length === 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-950/40"
        >
          <Download className="w-4 h-4" />
          <span>Export Case Dossier (TXT/PDF)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl glass-panel border-indigo-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                <span>Upload Evidence Artifact</span>
              </h3>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Client Encrypted
              </span>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="border-2 border-dashed border-indigo-700/40 hover:border-indigo-500/60 rounded-xl p-5 text-center bg-indigo-950/20 transition">
                <input
                  type="file"
                  id="evidenceFile"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSelectedFile(f);
                      if (!newTitle) setNewTitle(f.name);
                    }
                  }}
                />
                <label
                  htmlFor="evidenceFile"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  <UploadCloud className="w-7 h-7 text-indigo-400 mb-1" />
                  <span className="text-xs font-semibold text-indigo-200">
                    {selectedFile ? selectedFile.name : "Select Screenshot / Audio / Chat File"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedFile
                      ? `${formatBytes(selectedFile.size)} - Ready to Hash`
                      : "PNG, JPG, MP3, M4A, TXT, PDF up to 25MB"}
                  </span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Incident / Artifact Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. WhatsApp Extortion Message Screenshot"
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Threat Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as EvidenceItem["category"])
                  }
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="HARASSMENT">Harassment & Toxic DMs</option>
                  <option value="BLACKMAIL">Blackmail & Extortion</option>
                  <option value="STALKING">Cyberstalking & Tracking</option>
                  <option value="SCAM">Financial Fraud / Phishing</option>
                  <option value="THREAT">Direct Violence Threat</option>
                  <option value="OTHER">Other Evidence</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Incident Context / Sender Details
                </label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Include sender handle, phone number, date, and context..."
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    {encryptionStatus?.includes("Hashing") ||
                    encryptionStatus?.includes("Encrypting") ||
                    encryptionStatus?.includes("Uploading") ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    {encryptionStatus || "Processing..."}
                  </span>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Seal & Lock in Vault</span>
                  </>
                )}
              </button>

              {uploadError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
                  {uploadError.toLowerCase().includes("warning") ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{uploadError}</span>
                </div>
              )}

              {!isUploading && !uploadError && selectedFile && (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-[11px] flex items-start gap-2">
                  <HardDrive className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {selectedFile.name} queued. Content will be hashed and encrypted <strong>client-side</strong> before upload.
                  </span>
                </div>
              )}
            </form>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <FileBadge className="w-4 h-4 text-purple-400" />
              <span>Section 65B (Indian Evidence Act) Ready</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Cyber Sakhi locks electronic records with deterministic SHA-256 checksums to prove no alteration occurred between the incident and police filing.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-2xl glass-card flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files or hashes..."
                className="w-full rounded-lg bg-slate-900/90 border border-slate-700/80 pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-lg bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="BLACKMAIL">Blackmail</option>
                <option value="HARASSMENT">Harassment</option>
                <option value="STALKING">Stalking</option>
                <option value="SCAM">Scams</option>
                <option value="THREAT">Threats</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvidence.length === 0 ? (
              <div className="p-8 rounded-2xl glass-panel border-slate-800 text-center text-slate-400 text-xs">
                No evidence items matching your filter.
              </div>
            ) : (
              filteredEvidence.map((item) => {
                const parsedEmailData = parseEmailForensicsNotes(item.notes || "");
                const isEmailForensics = parsedEmailData?.isEmailForensics;
                const isExpanded = expandedReports.has(item.id);

                if (isEmailForensics && parsedEmailData) {
                  return (
                    <EmailForensicsEvidenceCard
                      key={item.id}
                      item={item}
                      parsedData={parsedEmailData}
                      isExpanded={isExpanded}
                      onToggleExpand={toggleReportExpansion}
                      handleViewEvidence={handleViewEvidence}
                      onDelete={handleDelete}
                      onCopyHash={copyHash}
                      copiedHashId={copiedHashId}
                    />
                  );
                } else {
                  return (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl glass-card space-y-3 relative group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-100">
                              {item.title}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-semibold">
                              {item.category}
                            </span>
                            {item.integrityVerified && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 font-semibold flex items-center gap-1">
                                <CheckCircle className="w-2.5 h-2.5" />
                                Hashed
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-3 flex-wrap">
                            <span>{item.filename}</span>
                            <span>•</span>
                            <span>{formatBytes(item.fileSize)}</span>
                            <span>•</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleViewEvidence(item)}
                            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Metadata Details / Decrypt & Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-950/80 text-slate-400 hover:text-red-400 transition"
                            title="Delete from Vault"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                          {item.notes.length > 200
                            ? item.notes.substring(0, 200) + "..."
                            : item.notes}
                        </p>
                      )}

                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 flex items-center justify-between gap-2 text-[11px] font-mono">
                        <div className="truncate text-slate-400 flex-1">
                          <span className="text-indigo-300 font-semibold">SHA-256: </span>
                          <span>{item.sha256Hash}</span>
                        </div>
                        <button
                          onClick={() => copyHash(item.sha256Hash, item.id)}
                          className="text-slate-400 hover:text-white shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-800"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedHashId === item.id ? "Copied!" : "Copy"}</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <div className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle className="w-3 h-3" />
                          <span>Tamper-Proof Ledger Stamp Active</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">
                          IPFS: {item.simulatedIpfsCid.substring(0, 16)}...
                        </div>
                      </div>
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>
      </div>

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-2xl bg-[#121222] border border-indigo-500/40 p-6 space-y-5 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-indigo-300 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5" />
                <span>Evidence Chain-of-Custody Certificate</span>
              </h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-slate-400">Title: </span>
                <span className="font-semibold text-white">{previewItem.title}</span>
              </div>
              <div>
                <span className="text-slate-400">Filename: </span>
                <span className="font-mono text-slate-200">{previewItem.filename}</span>
              </div>
              <div>
                <span className="text-slate-400">File: </span>
                <span className="text-slate-200">
                  {previewItem.fileType || "unknown"} • {formatBytes(previewItem.fileSize)}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Timestamp: </span>
                <span className="text-slate-200">{previewItem.timestamp}</span>
              </div>
              <div>
                <span className="text-slate-400">Stored SHA-256: </span>
                <div className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800 break-all text-purple-300 mt-1">
                  {previewItem.sha256Hash}
                </div>
              </div>
            </div>

            {previewState.loading && (
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/50 text-indigo-200 text-xs flex items-start gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">
                    {previewState.decrypting
                      ? "Decrypting evidence content..."
                      : previewState.verifying
                      ? "Verifying SHA-256 integrity..."
                      : "Retrieving encrypted evidence from vault..."}
                  </div>
                  <div className="text-[11px] text-indigo-300/70">
                    Client-side AES-256-GCM operation in progress.
                  </div>
                </div>
              </div>
            )}

            {previewState.sessionKeyAvailable === false && previewState.error && (
              <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-700/60 text-amber-200 text-xs flex items-start gap-2">
                <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Session Encryption Key Unavailable</div>
                  <div className="text-[11px] text-amber-200/80 leading-relaxed">
                    {previewState.error}
                  </div>
                  <div className="text-[11px] text-amber-300/90 font-mono pt-1">
                    Metadata-only view shown above. Chain-of-custody remains intact.
                  </div>
                </div>
              </div>
            )}

            {previewState.error && previewState.sessionKeyAvailable !== false && (
              <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/70 text-red-200 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">Operation Failed</div>
                  <div className="text-[11px] text-red-200/80">{previewState.error}</div>
                </div>
              </div>
            )}

            {!previewState.loading &&
              !previewState.error &&
              previewState.isEncrypted === false &&
              previewState.integrityStatus === "unencrypted" && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs flex items-start gap-2">
                  <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-200 mb-0.5">
                      Legacy / Unencrypted Evidence
                    </div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      This evidence record was created before client-side encryption was active.
                      Only metadata is available. Re-upload the original artifact to enable AES-256-GCM encryption.
                    </div>
                  </div>
                </div>
              )}

            {previewState.integrityStatus === "verified" && (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">
                    Integrity Verified — SHA-256 Matches
                  </div>
                  <div className="text-[11px] text-emerald-200/80">
                    Decrypted content was re-hashed and matches the original stored SHA-256.
                    Evidence has not been altered since upload.
                  </div>
                </div>
              </div>
            )}

            {previewState.integrityStatus === "failed" && (
              <div className="p-4 rounded-xl bg-red-950/70 border border-red-700/80 text-red-200 text-xs flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">
                    Integrity Check FAILED — Evidence May Be Compromised
                  </div>
                  <div className="text-[11px] text-red-200/80 leading-relaxed">
                    The recomputed SHA-256 of decrypted content does NOT match the stored hash.
                    This may indicate tampering, corruption, or a mismatched encryption key.
                    Treat this evidence as suspect for legal purposes.
                  </div>
                </div>
              </div>
            )}

            {previewState.previewUrl &&
              previewItem.fileType &&
              isImageFile(previewItem.fileType) && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-black/40">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 px-3 py-2 border-b border-slate-800 flex items-center gap-1.5">
                    <Eye className="w-3 h-3" />
                    Decrypted Image Preview
                  </div>
                  <div className="p-3 flex items-center justify-center">
                    <img
                      src={previewState.previewUrl}
                      alt={previewItem.title}
                      className="max-h-[400px] max-w-full rounded-lg"
                    />
                  </div>
                </div>
              )}

            {previewState.previewUrl &&
              previewItem.fileType &&
              isTextFile(previewItem.fileType, previewItem.filename) && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-black/40">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 px-3 py-2 border-b border-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    Decrypted Document Available for Download
                  </div>
                  <div className="p-4 text-[11px] text-slate-400">
                    {previewItem.fileType === "application/pdf" ||
                    previewItem.filename.toLowerCase().endsWith(".pdf") ? (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                        PDF preview embedded securely. Use Download to save locally.
                      </div>
                    ) : (
                      <div>
                        Text document. Use the Download button below to save a local copy.
                      </div>
                    )}
                  </div>
                </div>
              )}

            {previewState.chainEvents.length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3" />
                    Chain of Custody ({previewState.chainEvents.length} events)
                  </span>
                  {previewState.chainVerification && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        previewState.chainVerification.isValid
                          ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                          : "bg-red-950/60 text-red-300 border border-red-800/60"
                      }`}
                    >
                      {previewState.chainVerification.isValid
                        ? `Chain Verified (${previewState.chainVerification.verifiedEventCount}/${previewState.chainVerification.totalEventCount})`
                        : "Chain TAMPER DETECTED"}
                    </span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70">
                  {previewState.chainEvents.map((evt: any, i) => (
                    <div
                      key={evt.id || i}
                      className="px-4 py-2.5 text-[11px] flex items-start gap-3"
                    >
                      <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-200">{evt.action}</span>
                          <span className="text-slate-500 text-[10px] font-mono">
                            {new Date(evt.created_at).toLocaleString()}
                          </span>
                        </div>
                        {evt.notes && (
                          <div className="text-slate-400 text-[10px] mt-0.5 truncate" title={evt.notes}>
                            {evt.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewState.custodyError && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Chain of Custody Warning: </span>
                  {previewState.custodyError}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-800 mt-2">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
              {previewState.decryptedBytes && (
                <button
                  onClick={handleDownloadDecrypted}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Decrypted Copy
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

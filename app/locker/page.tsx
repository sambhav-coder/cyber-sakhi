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
  formatDateTime
} from "@/lib/emailForensicsParser";

// ---------------------------------------------------------------------------
// Email Forensics Evidence Card Component
// ---------------------------------------------------------------------------

function EmailForensicsEvidenceCard({ 
  item, 
  parsedData, 
  isExpanded, 
  onToggleExpand,
  onView,
  onDelete,
  onCopyHash,
  copiedHashId 
}: { 
  item: EvidenceItem; 
  parsedData: ParsedEmailForensicsData; 
  isExpanded: boolean; 
  onToggleExpand: (id: string) => void;
  onView: (item: EvidenceItem) => void;
  onDelete: (id: string) => void;
  onCopyHash: (hash: string, id: string) => void;
  copiedHashId: string | null;
}) {
  const threatColorClass = getThreatLevelColor(parsedData.threatLevel);
  
  // Extract sender information
  const senderName = parsedData.senderInfo?.fromName || 
                      (parsedData.senderInfo?.from && parseSenderFrom(parsedData.senderInfo.from).name) ||
                      'Unknown Sender';
  const senderEmail = parsedData.senderInfo?.fromEmail || 
                     (parsedData.senderInfo?.from && parseSenderFrom(parsedData.senderInfo.from).email) ||
                     parsedData.senderInfo?.from ||
                     'N/A';
  
  // Format date and time
  const dateTime = formatDateTime(item.timestamp);
  
  // Get clean subject (decoded if available, otherwise use original)
  const cleanSubject = parsedData.senderInfo?.decodedSubject || 
                      parsedData.senderInfo?.subject ||
                      'No Subject';
  
  // Truncate authentication details for display
  const truncateAuthDetails = (details?: string) => {
    if (!details) return '';
    return details.length > 30 ? details.substring(0, 30) + '...' : details;
  };
  
  return (
    <div className="p-5 rounded-2xl glass-card space-y-4 relative group">
      {/* Professional Email Identity Header */}
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
            {dateTime.date && dateTime.time ? `${dateTime.date} • ${dateTime.time}` : new Date(item.timestamp).toLocaleDateString()}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onView(item)}
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

      {/* Category and Threat Level Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-semibold">
          {item.category}
        </span>
        {parsedData.threatLevel && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${threatColorClass}`}>
            {parsedData.threatLevel}
          </span>
        )}
      </div>

      {/* Threat Summary - Professional SOC Layout */}
      <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Threat Level</div>
          <div className={`text-lg font-black ${parsedData.threatLevel ? getThreatLevelColor(parsedData.threatLevel).split(' ')[0] : 'text-slate-400'}`}>
            {parsedData.threatLevel || 'N/A'}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Risk Score</div>
          <div className="text-lg font-black text-slate-200">
            {parsedData.threatScore || 'N/A'}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-black/20 border border-white/10 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Spoofing</div>
          <div className={`text-lg font-black ${parsedData.spoofingDetected === 'Yes' ? 'text-red-400' : 'text-emerald-400'}`}>
            {parsedData.spoofingDetected || 'N/A'}
          </div>
        </div>
      </div>

      {/* Authentication - Fixed Layout */}
      {parsedData.authentication && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            Authentication
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* SPF */}
            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SPF</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.spf)}`}>
                {parsedData.authentication.spf || 'N/A'}
              </div>
              {parsedData.authentication.spfDetails && (
                <div className="text-[10px] text-slate-400 mt-1 truncate" title={parsedData.authentication.spfDetails}>
                  {truncateAuthDetails(parsedData.authentication.spfDetails)}
                </div>
              )}
            </div>
            
            {/* DKIM */}
            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">DKIM</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.dkim)}`}>
                {parsedData.authentication.dkim || 'N/A'}
              </div>
              {parsedData.authentication.dkimDetails && (
                <div className="text-[10px] text-slate-400 mt-1 truncate" title={parsedData.authentication.dkimDetails}>
                  {truncateAuthDetails(parsedData.authentication.dkimDetails)}
                </div>
              )}
            </div>
            
            {/* DMARC */}
            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">DMARC</div>
              <div className={`text-sm font-black ${getAuthStatusColor(parsedData.authentication.dmarc)}`}>
                {parsedData.authentication.dmarc || 'N/A'}
              </div>
              {parsedData.authentication.dmarcDetails && (
                <div className="text-[10px] text-slate-400 mt-1 truncate" title={parsedData.authentication.dmarcDetails}>
                  {truncateAuthDetails(parsedData.authentication.dmarcDetails)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sender Information - Compact Grid */}
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
                <div className="text-xs text-slate-200 font-mono truncate" title={parsedData.senderInfo.from}>
                  {parsedData.senderInfo.from}
                </div>
              </div>
            )}
            {parsedData.senderInfo.to && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">To</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={parsedData.senderInfo.to}>
                  {parsedData.senderInfo.to}
                </div>
              </div>
            )}
            {parsedData.senderInfo.senderDomain && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Domain</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={parsedData.senderInfo.senderDomain}>
                  {parsedData.senderInfo.senderDomain}
                </div>
              </div>
            )}
            {parsedData.senderInfo.originatingIP && (
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 min-w-0">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Origin IP</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={parsedData.senderInfo.originatingIP}>
                  {parsedData.senderInfo.originatingIP}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subject - Clean Display */}
      {parsedData.senderInfo?.subject && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Subject</div>
          <div className="text-xs text-slate-200 break-words" title={parsedData.senderInfo.subject}>
            {cleanSubject}
          </div>
        </div>
      )}

      {/* Key Findings - Compact */}
      {parsedData.findings && parsedData.findings.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            Key Findings
          </div>
          <div className="space-y-1.5">
            {parsedData.findings.slice(0, 2).map((finding, idx) => (
              <div key={idx} className="text-xs text-slate-300 flex items-start gap-2">
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

      {/* Expandable Full Forensic Report */}
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
          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <span>View Full Forensic Report</span>
        </summary>
        <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 max-h-96 overflow-y-auto">
          {/* Structured Forensic Report */}
          <div className="space-y-4 text-[11px]">
            {parsedData.rawReport && (
              <div className="font-mono text-slate-400 whitespace-pre-wrap break-all">
                {parsedData.rawReport}
              </div>
            )}
          </div>
        </div>
      </details>

      {/* Hash Bar */}
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

export default function EvidenceLockerPage() {
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Upload Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<EvidenceItem["category"]>("HARASSMENT");
  const [newNotes, setNewNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Selected Evidence for Modal Preview
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);
  
  // Expanded Email Forensics Reports
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEvidenceList(getStoredEvidence());
  }, []);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const sha256 = await computeSha256(buffer);
      const ipfsCid = generateMockIpfsCid(sha256);
      const txHash = generateMockTxHash(sha256);

      const newItem: EvidenceItem = {
        id: "ev_" + Date.now(),
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
      setEvidenceList(getStoredEvidence());

      // Reset form
      setSelectedFile(null);
      setNewTitle("");
      setNewNotes("");
      setIsUploading(false);
    } catch (err) {
      console.error(err);
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
    setExpandedReports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
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
Incident Log : ${ev.notes}
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
    const matchesCategory =
      filterCategory === "ALL" || item.category === filterCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sha256Hash.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
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
        {/* Left Column: Upload Box */}
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
              {/* File Input */}
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
                    {selectedFile ? `${formatBytes(selectedFile.size)} - Ready to Hash` : "PNG, JPG, MP3, M4A, TXT, PDF up to 25MB"}
                  </span>
                </label>
              </div>

              {/* Title */}
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

              {/* Category */}
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

              {/* Notes */}
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
                  <span>Computing Cryptographic Hash...</span>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Seal & Lock in Vault</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Legal Section 65B Notice */}
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

        {/* Right Column: Vault Items List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filter & Search Bar */}
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
              </select>
            </div>
          </div>

          {/* Evidence Cards */}
          <div className="space-y-3">
            {filteredEvidence.length === 0 ? (
              <div className="p-8 rounded-2xl glass-panel border-slate-800 text-center text-slate-400 text-xs">
                No evidence items matching your filter.
              </div>
            ) : (
              filteredEvidence.map((item) => {
                // Check if this is Email Forensics evidence
                const parsedEmailData = parseEmailForensicsNotes(item.notes || '');
                const isEmailForensics = parsedEmailData?.isEmailForensics;
                const isExpanded = expandedReports.has(item.id);

                if (isEmailForensics && parsedEmailData) {
                  // Use specialized Email Forensics card
                  return (
                    <EmailForensicsEvidenceCard
                      key={item.id}
                      item={item}
                      parsedData={parsedEmailData}
                      isExpanded={isExpanded}
                      onToggleExpand={toggleReportExpansion}
                      onView={setPreviewItem}
                      onDelete={handleDelete}
                      onCopyHash={copyHash}
                      copiedHashId={copiedHashId}
                    />
                  );
                } else {
                  // Use standard evidence card
                  return (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl glass-card space-y-3 relative group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100">
                              {item.title}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-semibold">
                              {item.category}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-3">
                            <span>{item.filename}</span>
                            <span>•</span>
                            <span>{formatBytes(item.fileSize)}</span>
                            <span>•</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Metadata Details"
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
                          {item.notes.length > 200 ? item.notes.substring(0, 200) + '...' : item.notes}
                        </p>
                      )}

                      {/* Hash Bar */}
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

      {/* Metadata Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-[#121222] border border-indigo-500/40 p-6 space-y-4 text-white">
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
                <span className="text-slate-400">Timestamp: </span>
                <span className="text-slate-200">{previewItem.timestamp}</span>
              </div>
              <div>
                <span className="text-slate-400">SHA-256 Hash: </span>
                <div className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800 break-all text-purple-300">
                  {previewItem.sha256Hash}
                </div>
              </div>
              <div>
                <span className="text-slate-400">IPFS CID Reference: </span>
                <div className="font-mono text-[11px] text-slate-300">{previewItem.simulatedIpfsCid}</div>
              </div>
              <div>
                <span className="text-slate-400">Blockchain Anchor Tx: </span>
                <div className="font-mono text-[11px] text-slate-300 break-all">{previewItem.simulatedTxHash}</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold"
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

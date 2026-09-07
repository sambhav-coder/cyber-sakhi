"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Search,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ChevronRight,
  Copy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Minus,
  Server,
  Globe,
  Link2,
  AtSign,
  Lock,
  Network,
  FileText,
  Info,
  Loader2,
  ArrowRight,
  Inbox as InboxIcon,
} from "lucide-react";
import { EmailAnalysisResult, AuthenticationResult, SMTPHop, ThreatIndicator } from "@/lib/emailTypes";
import { addEvidenceItem } from "@/lib/storage";
import { computeSha256, generateMockIpfsCid, generateMockTxHash } from "@/lib/cryptoUtils";
import { EvidenceItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-800 mb-4">
      <Icon className="w-4 h-4 text-purple-400" />
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">{title}</h3>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono = false,
  missing = false,
  wrap = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  missing?: boolean;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-slate-800/50 last:border-0 text-xs">
      <span className="text-slate-400 font-semibold shrink-0 sm:w-36">{label}</span>
      {value ? (
        <div className={`flex items-start gap-2 flex-1 min-w-0 ${wrap ? "" : "overflow-hidden"}`}>
          <span
            className={`text-slate-200 ${mono ? "font-mono" : ""} ${wrap ? "break-all" : "truncate"} flex-1 min-w-0`}
          >
            {value}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition"
            title="Copy"
          >
            {copied ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      ) : (
        <span className={`flex items-center gap-1 ${missing ? "text-slate-600 italic" : "text-slate-500 italic"}`}>
          <Minus className="w-3 h-3" />
          {missing ? "Not present in input" : "Not found"}
        </span>
      )}
    </div>
  );
}

function AuthBadge({ result, label }: { result: AuthenticationResult; label: string }) {
  const cfg = {
    pass: { color: "bg-emerald-950 border-emerald-600/50 text-emerald-300", icon: CheckCircle2, iconColor: "text-emerald-400" },
    fail: { color: "bg-red-950 border-red-600/50 text-red-300", icon: XCircle, iconColor: "text-red-400" },
    neutral: { color: "bg-amber-950 border-amber-600/50 text-amber-300", icon: AlertCircle, iconColor: "text-amber-400" },
    none: { color: "bg-slate-900 border-slate-700 text-slate-400", icon: HelpCircle, iconColor: "text-slate-500" },
    unknown: { color: "bg-slate-900 border-slate-700 text-slate-400", icon: HelpCircle, iconColor: "text-slate-500" },
  }[result.status];

  const Icon = cfg.icon;

  // Truncate long technical details for cleaner display
  const shortDetails = result.details && result.details.length > 60 
    ? result.details.substring(0, 60) + "..." 
    : result.details;

  return (
    <div className={`p-4 rounded-xl border ${cfg.color} space-y-3 min-w-0`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest opacity-70">{label}</span>
        <Icon className={`w-5 h-5 ${cfg.iconColor} shrink-0`} />
      </div>
      
      <div className="text-2xl font-black uppercase">{result.status}</div>
      
      {result.details && (
        <div className="text-[11px] opacity-70 leading-tight break-words overflow-wrap-anywhere" title={result.details}>
          {shortDetails}
        </div>
      )}
    </div>
  );
}

function SMTPHopCard({ hop, index, total }: { hop: SMTPHop; index: number; total: number }) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div className={`relative pl-6 ${isLast ? "" : "pb-3"}`}>
      {/* Vertical connector */}
      {!isLast && (
        <div className="absolute left-2.5 top-5 bottom-0 w-px bg-slate-700" />
      )}
      {/* Node dot */}
      <div className={`absolute left-0 top-1.5 w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold ${
        isLast ? "bg-amber-950 border-amber-600 text-amber-300" : "bg-slate-800 border-slate-600 text-slate-400"
      }`}>
        {total - index}
      </div>

      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-300">
            {isLast ? "Outermost Observed Hop" : `Hop ${total - index}`}
          </span>
          {hop.ip && (
            <span className="font-mono text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-800/40">
              {hop.ip}
            </span>
          )}
        </div>
        {hop.from && (
          <div className="text-slate-400">
            <span className="text-slate-500 mr-1">from</span>
            <span className="font-mono text-slate-300">{hop.from}</span>
          </div>
        )}
        {hop.by && (
          <div className="text-slate-400">
            <span className="text-slate-500 mr-1">by</span>
            <span className="font-mono text-slate-300">{hop.by}</span>
          </div>
        )}
        {hop.timestamp && (
          <div className="text-slate-500">{hop.timestamp}</div>
        )}
      </div>
    </div>
  );
}

function IndicatorRow({ indicator }: { indicator: ThreatIndicator }) {
  const iconMap: Record<ThreatIndicator["type"], React.ElementType> = {
    ip: Network,
    domain: Globe,
    url: Link2,
    email: AtSign,
  };
  const Icon = iconMap[indicator.type];

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-800/50 last:border-0 text-[11px]">
      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
      <span className="font-mono text-slate-300 flex-1 break-all">{indicator.value}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase text-[9px] font-bold">
          {indicator.type}
        </span>
        {indicator.malicious === true && (
          <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-700/50 text-red-300 text-[9px] font-bold">
            SUSPICIOUS
          </span>
        )}
        {indicator.source && (
          <span className="text-slate-600">{indicator.source}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample email to help the user test
// ---------------------------------------------------------------------------

const SAMPLE_EMAIL = `Received: from mail.attacker-phish.xyz (mail.attacker-phish.xyz [203.0.113.47])
        by mx.victim.com with ESMTP id abc123xyz
        ; Mon, 01 Sep 2026 10:15:00 +0530
Received: from [10.0.0.5] (localhost [127.0.0.1])
        by mail.attacker-phish.xyz with SMTP id x99
        ; Mon, 01 Sep 2026 04:44:55 +0000
Authentication-Results: mx.victim.com;
        spf=fail (sender IP is 203.0.113.47) smtp.mailfrom=attacker@attacker-phish.xyz;
        dkim=fail header.d=hdfc-alerts.com reason="signature verification failed";
        dmarc=fail action=quarantine header.from=hdfc-alerts.com
From: HDFC Bank Security Alert <security@hdfc-alerts.com>
Reply-To: collect-your-refund@totally-not-phishing.top
Return-Path: <bounce@attacker-phish.xyz>
To: victim@example.com
Subject: [URGENT] Your HDFC NetBanking is suspended — Verify KYC within 24 hours
Date: Mon, 01 Sep 2026 10:15:00 +0530
Message-ID: <xyz.1234567890@hdfc-alerts.com>

Dear Valued Customer,

Your HDFC Bank NetBanking account has been SUSPENDED due to incomplete KYC verification.

Action Required: Click here to verify your KYC immediately to restore access:
http://hdfc-kyc-update.xyz/verify?token=a1b2c3d4e5f6g7h8i9j0

You must complete verification within 24 hours or your account will be permanently deactivated.

Please enter your:
- Customer ID / Net Banking Login
- OTP sent to your registered mobile
- Credit/Debit Card CVV for identity confirmation

Failure to act will result in suspension of all linked accounts.

HDFC Bank Customer Care
Toll Free: 1800-xxx-xxxx`;

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EmailForensicsPage() {
  const router = useRouter();
  const [rawEmail, setRawEmail] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<EmailAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "paste">("choose");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const stored = window.sessionStorage.getItem(
        "cyber_sakhi_gmail_analysis"
      );
      if (!stored) return;
      const parsed = JSON.parse(stored) as EmailAnalysisResult;
      if (parsed && typeof parsed === "object") {
        setResult(parsed);
        window.sessionStorage.removeItem("cyber_sakhi_gmail_analysis");
      }
    } catch {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("cyber_sakhi_gmail_analysis");
      }
    }
  }, []);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawEmail.trim()) return;

    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/email-forensics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawEmail: rawEmail.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed. Please check your input.");
      } else {
        setResult(data as EmailAnalysisResult);
      }
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadSample = () => {
    setRawEmail(SAMPLE_EMAIL);
    setResult(null);
    setError(null);
  };

  const handleSaveToLocker = async () => {
    if (!result) return;
    
    // Prevent duplicate saves
    if (savedEvidenceId) {
      setSaveError("This investigation has already been saved to the Evidence Locker.");
      setTimeout(() => setSaveError(null), 3000);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Create a comprehensive notes field with all forensic findings
      const notes = `
Email Forensic Analysis Report
===============================
Threat Level: ${result.threatLevel}
Threat Score: ${result.threatScore}/100
Spoofing Detected: ${result.senderSpoofingDetected ? "Yes" : "No"}

Authentication Results:
- SPF: ${result.authentication.spf.status} ${result.authentication.spf.details ? `(${result.authentication.spf.details})` : ""}
- DKIM: ${result.authentication.dkim.status} ${result.authentication.dkim.details ? `(${result.authentication.dkim.details})` : ""}
- DMARC: ${result.authentication.dmarc.status} ${result.authentication.dmarc.details ? `(${result.authentication.dmarc.details})` : ""}

Sender Information:
- From: ${result.headers.from || "N/A"}
- To: ${result.headers.to || "N/A"}
- Subject: ${result.headers.subject || "N/A"}
- Date: ${result.headers.date || "N/A"}
- Sender Domain: ${result.senderDomain || "N/A"}

SMTP Path:
- Originating IP: ${result.originatingIP || "N/A"}
- Hops: ${result.smtpPath.length}

Key Findings:
${result.findings.map(f => `• ${f}`).join("\n")}

Recommendations:
${result.recommendations.map(r => `• ${r}`).join("\n")}

Extracted Indicators: ${result.indicators.length}
${result.indicators.map(i => `• ${i.type}: ${i.value}${i.malicious ? " (SUSPICIOUS)" : ""}`).join("\n")}
      `.trim();

      // Compute SHA-256 hash of the analysis result
      const analysisString = JSON.stringify(result);
      const sha256 = await computeSha256(analysisString);
      const ipfsCid = generateMockIpfsCid(sha256);
      const txHash = generateMockTxHash(sha256);

      // Determine category based on threat level
      const categoryMap: Record<string, EvidenceItem["category"]> = {
        CRITICAL: "THREAT",
        HIGH: "THREAT",
        MEDIUM: "SCAM",
        LOW: "HARASSMENT",
        SAFE: "OTHER",
      };
      const category = categoryMap[result.threatLevel] || "OTHER";

      // Create evidence item
      const newEvidence: EvidenceItem = {
        id: "ev_" + Date.now(),
        title: `Email Investigation: ${result.headers.subject?.substring(0, 50) || "Unknown Subject"}${result.headers.subject?.length > 50 ? "..." : ""}`,
        filename: `email_forensic_${result.id}.json`,
        fileType: "application/json",
        fileSize: new Blob([analysisString]).size,
        timestamp: new Date().toISOString(),
        sha256Hash: sha256,
        category: category,
        notes: notes,
        integrityVerified: true,
        simulatedIpfsCid: ipfsCid,
        simulatedTxHash: txHash,
      };

      // Save to evidence locker
      addEvidenceItem(newEvidence);
      
      // Mark as saved to prevent duplicates
      setSavedEvidenceId(newEvidence.id);
      setSaveSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Navigate to Evidence Locker after successful save
      router.push("/locker");
    } catch (err) {
      console.error("Error saving to evidence locker:", err);
      setSaveError("Failed to save to Evidence Locker. Please try again.");
      setTimeout(() => setSaveError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const threatColorMap: Record<string, string> = {
    SAFE: "text-emerald-300",
    LOW: "text-sky-300",
    MEDIUM: "text-amber-300",
    HIGH: "text-orange-400",
    CRITICAL: "text-red-400",
  };

  const openGmailInvestigation = () => {
    router.push("/email-forensics/gmail");
  };

  const selectPasteMode = () => {
    setMode("paste");
  };

  const showChooseMode = !result && mode === "choose";
  const showPasteMode = !result && mode === "paste";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold">
          <Mail className="w-3.5 h-3.5" />
          <span>Email Forensic Investigator</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          {showPasteMode ? "Paste Raw Email" : result ? "Email Forensic Report" : "Email Forensics"}
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          {showPasteMode
            ? "Paste the full raw email source below and run Cyber Sakhi's forensic analysis engine on it."
            : result
            ? "Forensic results for the email you analyzed. Review authentication, SMTP path, indicators, risk score, and recommendations."
            : "Investigate suspicious email with Cyber Sakhi's unified forensic engine — either paste a raw email source directly, or connect Gmail and analyze a message from your real inbox. Both methods run the same SPF / DKIM / DMARC, spoofing, SMTP-path, and threat-indicator analysis."}
        </p>
      </div>

      {showChooseMode && (
        <>
          {/* Investigation Entry Points */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={selectPasteMode}
              className="group p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-purple-600/60 space-y-3 flex flex-col text-left transition cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-700/50 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-purple-300" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="text-sm font-black text-white flex items-center gap-2">
                    A) Paste Raw Email
                    <ArrowRight className="w-3.5 h-3.5 text-purple-400 opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-[12px] text-slate-400 leading-5">
                    Paste the complete raw email source (headers + body) for any email you already have exported. Works with any provider — Gmail, Outlook, Apple Mail, ProtonMail, etc.
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Full SPF / DKIM / DMARC authentication verification</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>SMTP relay-chain reconstruction + origin IP intelligence</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Domain, URL, email, and IP threat indicators</span>
                </li>
              </ul>

              <div className="pt-1 mt-auto flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 group-hover:text-purple-300 transition">
                  Open the Paste Raw Email workflow
                </span>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition shadow-md shadow-purple-950/50">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Continue</span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={openGmailInvestigation}
              className="group p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800 hover:border-purple-600/60 space-y-3 flex flex-col text-left transition cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-900/90 to-purple-700/80 border border-purple-600/50 flex items-center justify-center shrink-0 shadow-lg shadow-purple-950/40">
                  <InboxIcon className="w-5 h-5 text-white" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="text-sm font-black text-white flex items-center gap-2">
                    B) Connect Gmail
                    <ArrowRight className="w-3.5 h-3.5 text-purple-400 opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-[12px] text-slate-400 leading-5">
                    Securely connect Gmail with read-only access and investigate real suspicious messages from your Gmail inbox. No copying, no exports — point and investigate.
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Real Gmail messages — browse sender, subject, date, labels, preview</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>One-click analyze on the raw MIME source from Google directly</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Same forensic engine — phishing score, spoofing, SMTP path, indicators</span>
                </li>
              </ul>

              <div className="pt-1 mt-auto flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 group-hover:text-purple-300 transition">
                  <span>Takes you to the Gmail Investigation workspace</span>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition shadow-md shadow-purple-950/50">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open Gmail Investigation</span>
                </div>
              </div>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 flex items-start gap-1.5 px-1">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Both entry methods use Cyber Sakhi&apos;s single forensic analysis engine so results are identical regardless of how you get here.
            </span>
          </div>
        </>
      )}

      {/* Input Card (Method A - Paste Raw Email) */}
      {showPasteMode && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Paste Raw Email Source
            </h2>
            <button
              type="button"
              onClick={loadSample}
              className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
            >
              Load phishing sample
            </button>
          </div>

          <p className="text-[11px] text-slate-500 -mt-2">
            Include the full email — headers and body. Your input never leaves the Cyber Sakhi forensic pipeline.
          </p>

          <form onSubmit={handleAnalyze} className="space-y-3">
            <textarea
              value={rawEmail}
              onChange={(e) => setRawEmail(e.target.value)}
              placeholder={`Paste the full raw email source here (including headers).\n\nExample:\nReceived: from mail.sender.com ...\nFrom: noreply@sender.com\nSubject: Your account\n...`}
              rows={14}
              className="w-full rounded-xl bg-[#0a0a16] border border-slate-700/80 p-4 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-y"
            />

            {error && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAnalyzing || !rawEmail.trim()}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Run Forensic Analysis</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* ---- Risk Summary Banner ---- */}
          <div className={`p-5 rounded-2xl border ${
            result.threatLevel === "CRITICAL"
              ? "bg-red-950/40 border-red-500/50"
              : result.threatLevel === "HIGH"
              ? "bg-orange-950/40 border-orange-500/50"
              : result.threatLevel === "MEDIUM"
              ? "bg-amber-950/40 border-amber-600/50"
              : result.threatLevel === "LOW"
              ? "bg-sky-950/40 border-sky-600/50"
              : "bg-emerald-950/40 border-emerald-600/50"
          }`}>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-4">Threat Assessment</div>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Threat Level */}
              <div className="text-center p-3 rounded-xl bg-black/20 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Threat Level</div>
                <div className={`text-2xl font-black ${threatColorMap[result.threatLevel]}`}>
                  {result.threatLevel}
                </div>
              </div>
              
              {/* Risk Score */}
              <div className="text-center p-3 rounded-xl bg-black/20 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Risk Score</div>
                <div className="text-2xl font-black text-white">
                  {result.threatScore}
                  <span className="text-sm font-normal text-slate-400">/100</span>
                </div>
                {/* Risk Progress Indicator */}
                <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      result.threatScore >= 70 ? 'bg-red-500' :
                      result.threatScore >= 40 ? 'bg-amber-500' :
                      result.threatScore >= 20 ? 'bg-sky-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${result.threatScore}%` }}
                  />
                </div>
              </div>
              
              {/* Spoofing Status */}
              <div className="text-center p-3 rounded-xl bg-black/20 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Spoofing</div>
                <div className={`text-2xl font-black ${result.senderSpoofingDetected ? 'text-red-400' : 'text-emerald-400'}`}>
                  {result.senderSpoofingDetected ? 'Yes' : 'No'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <div className="text-xs text-slate-400">
                Analyzed at {new Date(result.analyzedAt).toLocaleTimeString()}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveToLocker}
                  disabled={isSaving || savedEvidenceId !== null}
                  className={`text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition ${
                    isSaving
                      ? "bg-slate-600 text-slate-300 cursor-not-allowed"
                      : savedEvidenceId !== null
                      ? "bg-emerald-600 text-white cursor-default"
                      : "bg-purple-600 hover:bg-purple-500 text-white"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : savedEvidenceId !== null ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Saved to Evidence Locker</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Save to Evidence Locker</span>
                    </>
                  )}
                </button>
                {saveError && (
                  <div className="text-xs text-red-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{saveError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- Authentication Results ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <SectionHeader title="Email Authentication (SPF / DKIM / DMARC)" icon={ShieldCheck} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="min-w-0">
                <AuthBadge result={result.authentication.spf} label="SPF" />
              </div>
              <div className="min-w-0">
                <AuthBadge result={result.authentication.dkim} label="DKIM" />
              </div>
              <div className="min-w-0">
                <AuthBadge result={result.authentication.dmarc} label="DMARC" />
              </div>
            </div>
            {result.headers.authenticationResults ? (
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
                  <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                  <span>View Raw Authentication-Results Header</span>
                </summary>
                <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 break-all overflow-x-auto">
                  {result.headers.authenticationResults}
                </div>
              </details>
            ) : (
              <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Authentication-Results header was not found in the input. SPF/DKIM/DMARC verdicts unavailable.
              </div>
            )}
          </div>

          {/* ---- Sender Information ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <SectionHeader title="Sender Identity & Spoofing Analysis" icon={Mail} />

            {/* 2x2 Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* From */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">From</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={result.headers.from || "N/A"}>
                  {result.headers.from || "N/A"}
                </div>
              </div>

              {/* To */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">To</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={result.headers.to || "N/A"}>
                  {result.headers.to || "N/A"}
                </div>
              </div>

              {/* Sender Domain */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Sender Domain</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={result.senderDomain || "N/A"}>
                  {result.senderDomain || "N/A"}
                </div>
              </div>

              {/* Originating IP */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Originating IP</div>
                <div className="text-xs text-slate-200 font-mono truncate" title={result.originatingIP || "N/A"}>
                  {result.originatingIP || "N/A"}
                </div>
              </div>
            </div>

            {/* Additional Details (collapsible) */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
                <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                <span>View Additional Details</span>
              </summary>
              <div className="mt-3 space-y-2">
                <DataRow label="Reply-To" value={result.headers.replyTo} missing />
                <DataRow label="Return-Path" value={result.headers.returnPath} missing />
                <DataRow label="Subject" value={result.headers.subject} missing wrap />
                <DataRow label="Date" value={result.headers.date} missing />
                <DataRow label="Message-ID" value={result.headers.messageId} mono missing />
              </div>
            </details>

            {/* Spoofing signals */}
            <div className="pt-2 border-t border-slate-800/50">
              {result.senderSpoofingDetected ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    Spoofing Signals Detected ({result.findings.filter(f => f.startsWith("⚠ Spoofing")).length})
                  </div>
                  {result.findings
                    .filter((f) => f.startsWith("⚠ Spoofing"))
                    .map((f, i) => (
                      <div key={i} className="text-[11px] text-red-200 bg-red-950/40 border border-red-700/40 rounded-lg px-3 py-2 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <span className="break-words">{f.replace("⚠ Spoofing signal: ", "")}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  No sender spoofing signals detected
                </div>
              )}
            </div>
          </div>

          {/* ---- Domain Intelligence ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <SectionHeader title="Domain Intelligence" icon={Globe} />

            {result.relatedDomainIntelligence && result.relatedDomainIntelligence.length > 0 ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-400">
                  Intelligence collected for the From, Reply-To, and Return-Path domains found in the email.
                </div>

                <div className="space-y-3">
                  {result.relatedDomainIntelligence.map((domainInfo) => (
                    <div
                      key={domainInfo.domain}
                      className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="font-mono text-sm text-slate-200 break-all">
                          {domainInfo.domain}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border ${
                            domainInfo.suspicious
                              ? "bg-red-950 border-red-700/50 text-red-300"
                              : "bg-emerald-950 border-emerald-700/50 text-emerald-300"
                          }`}
                        >
                          {domainInfo.suspicious ? "Suspicious Signals" : "No Basic Suspicious Signals"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] text-slate-400 font-semibold mb-2">
                            MX Records ({domainInfo.mx?.length || 0})
                          </div>
                          {domainInfo.mx && domainInfo.mx.length > 0 ? (
                            <div className="space-y-1.5">
                              {domainInfo.mx.map((mx, i) => (
                                <div
                                  key={i}
                                  className="font-mono text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 break-all"
                                >
                                  {mx}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">
                              No MX records found.
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 font-semibold mb-2">
                            NS Records ({domainInfo.ns?.length || 0})
                          </div>
                          {domainInfo.ns && domainInfo.ns.length > 0 ? (
                            <div className="space-y-1.5">
                              {domainInfo.ns.map((ns, i) => (
                                <div
                                  key={i}
                                  className="font-mono text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 break-all"
                                >
                                  {ns}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">
                              No NS records found.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Domain intelligence could not be retrieved for the email domains.
              </div>
            )}
          </div>

          {/* ---- SMTP Relay Path ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <SectionHeader title="SMTP Relay Path Reconstruction" icon={Network} />
            {result.smtpPath.length === 0 ? (
              <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                No Received headers found — SMTP path cannot be reconstructed from this input.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 mb-3">
                  {result.smtpPath.length} relay hop{result.smtpPath.length > 1 ? "s" : ""} reconstructed.
                  The bottom-most hop is the outermost observed relay in the supplied headers; its IP is treated as a candidate source IP when public.
                </div>
                {result.smtpPath.map((hop, i) => (
                  <SMTPHopCard
                    key={i}
                    hop={hop}
                    index={i}
                    total={result.smtpPath.length}
                  />
                ))}
              </div>
            )}

            {/* Originating IP */}
            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                Originating IP
              </div>
              {result.originatingIP ? (
                <div className="space-y-3">
                  <div className="font-mono text-purple-300 bg-purple-950/30 border border-purple-800/40 px-3 py-2 rounded-lg text-sm font-bold inline-block">
                    {result.originatingIP}
                  </div>

                  {result.ipIntelligence ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <DataRow
                        label="Country"
                        value={result.ipIntelligence.country}
                        missing
                      />
                      <DataRow
                        label="Region"
                        value={result.ipIntelligence.region}
                        missing
                      />
                      <DataRow
                        label="City"
                        value={result.ipIntelligence.city}
                        missing
                      />
                      <DataRow
                        label="Organization / ISP"
                        value={result.ipIntelligence.organization || result.ipIntelligence.isp}
                        missing
                        wrap
                      />
                      <DataRow
                        label="ASN"
                        value={result.ipIntelligence.asn}
                        mono
                        missing
                      />
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      IP intelligence could not be retrieved for this address.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
                  <Minus className="w-3.5 h-3.5" />
                  No public IP address could be extracted from the Received headers.
                </div>
              )}
            </div>
          </div>

                    {/* ---- Threat / Indicator Correlation ---- */}
          {result.indicatorCorrelations && result.indicatorCorrelations.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader title="Threat / Indicator Correlation" icon={Network} />

              <div className="text-xs text-slate-400">
                Extracted indicators are correlated with the forensic findings that reference or explain them.
              </div>

              <div className="space-y-2">
                {result.indicatorCorrelations.map((correlation, index) => {
                  const riskClass =
                    correlation.risk === "HIGH"
                      ? "bg-red-950 border-red-700/50 text-red-300"
                      : correlation.risk === "MEDIUM"
                      ? "bg-amber-950 border-amber-700/50 text-amber-300"
                      : "bg-slate-900 border-slate-700 text-slate-300";

                  return (
                    <div
                      key={`${correlation.indicator.type}-${correlation.indicator.value}-${index}`}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-slate-400">
                            {correlation.indicator.type}
                          </span>
                          <span className="font-mono text-xs text-slate-200 break-all">
                            {correlation.indicator.value}
                          </span>
                        </div>

                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border ${riskClass}`}>
                          {correlation.risk} RISK
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-400">
                        {correlation.reason}
                      </div>

                      {correlation.relatedFindings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {correlation.relatedFindings.map((finding, findingIndex) => (
                            <div
                              key={findingIndex}
                              className="text-[11px] text-slate-300 bg-slate-900/70 rounded-lg px-3 py-2"
                            >
                              ↳ {finding}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

{/* ---- Phishing & Findings ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <SectionHeader title="Phishing & Threat Findings" icon={AlertTriangle} />

            {/* Summary badges */}
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const passCount = result.findings.filter(f => f.startsWith("✓")).length;
                const warnCount = result.findings.filter(f => f.startsWith("⚠")).length;
                const failCount = result.findings.filter(f => f.startsWith("✗")).length;
                return (
                  <>
                    {passCount > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-950/40 border-emerald-700/50 text-emerald-300 font-semibold">
                        ✓ {passCount} Passed
                      </span>
                    )}
                    {warnCount > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-amber-950/40 border-amber-700/50 text-amber-300 font-semibold">
                        ⚠ {warnCount} Warnings
                      </span>
                    )}
                    {failCount > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-red-950/40 border-red-700/50 text-red-300 font-semibold">
                        ✗ {failCount} Failed
                      </span>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Collapsible detailed findings */}
            <details className="group" open={result.findings.length <= 5}>
              <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
                <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                <span>View All Findings ({result.findings.length})</span>
              </summary>
              <div className="mt-3 space-y-2">
                {result.findings.map((finding, i) => {
                  const isPass = finding.startsWith("✓");
                  const isWarn = finding.startsWith("⚠");
                  const isFail = finding.startsWith("✗");
                  const isInfo = finding.startsWith("–");
                  return (
                    <div
                      key={i}
                      className={`text-xs px-3 py-2 rounded-lg border flex items-start gap-2 ${
                        isPass
                          ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-200"
                          : isFail
                          ? "bg-red-950/30 border-red-800/40 text-red-200"
                          : isWarn
                          ? "bg-amber-950/30 border-amber-800/40 text-amber-200"
                          : "bg-slate-900/80 border-slate-800 text-slate-400"
                      }`}
                    >
                      <span className="shrink-0 font-bold">{finding.charAt(0)}</span>
                      <span className="break-words">{finding.slice(2)}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>

          {/* ---- Recommendations ---- */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <SectionHeader title="Recommendations" icon={Shield} />
            <details className="group" open={result.recommendations.length <= 3}>
              <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
                <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                <span>View Recommendations ({result.recommendations.length})</span>
              </summary>
              <div className="mt-3 space-y-2">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span className="break-words">{rec}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* ---- Extracted Indicators ---- */}
          {result.indicators.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <SectionHeader title={`Extracted Indicators (${result.indicators.length})`} icon={FileText} />
              <details className="group" open={result.indicators.length <= 5}>
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
                  <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                  <span>View All Indicators</span>
                </summary>
                <div className="mt-3 divide-y divide-slate-800/50">
                  {result.indicators.map((ind, i) => (
                    <IndicatorRow key={i} indicator={ind} />
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ---- Raw Header Preview ---- */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 list-none">
              <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
              View Parsed Raw Headers
            </summary>
            <div className="mt-2 p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap break-all">
              {result.headers.rawHeaders || "No raw headers available."}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  FolderOpen,
  ExternalLink,
  FileSearch,
  Fingerprint,
  RotateCcw,
} from "lucide-react";
import {
  EmailAnalysisResult,
  AuthenticationResult,
  SMTPHop,
  ThreatIndicator,
  ForensicFinding,
  ForensicCategory,
} from "@/lib/emailTypes";
import { addEvidenceItem } from "@/lib/storage";
import { computeSha256 } from "@/lib/cryptoUtils";
import { EvidenceItem } from "@/lib/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";

const TEXTAREA_MAX_HEIGHT = 320;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
            <span className="font-mono text-emergency-300 bg-emergency-950/50 px-2 py-0.5 rounded border border-emergency-800/40">
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

const FINDING_SEVERITY: Record<
  ForensicFinding["severity"],
  { chip: string; border: string }
> = {
  CRITICAL: {
    chip: "bg-red-950 border-red-600/60 text-red-300",
    border: "border-l-red-500",
  },
  HIGH: {
    chip: "bg-orange-950 border-orange-600/60 text-orange-300",
    border: "border-l-orange-500",
  },
  MEDIUM: {
    chip: "bg-amber-950 border-amber-600/60 text-amber-300",
    border: "border-l-amber-500",
  },
  LOW: {
    chip: "bg-sky-950 border-sky-600/60 text-sky-300",
    border: "border-l-sky-500",
  },
  SAFE: {
    chip: "bg-emerald-950 border-emerald-600/60 text-emerald-300",
    border: "border-l-emerald-500",
  },
};

const FINDING_CATEGORY_LABELS: Record<ForensicCategory, string> = {
  AUTHENTICATION: "Email Authentication",
  SENDER_SPOOFING: "Sender Spoofing",
  DOMAIN: "Domain Intelligence",
  IP: "IP Intelligence",
  SMTP_ROUTING: "SMTP Routing",
  URL: "Link Analysis",
  ATTACHMENT: "Attachment Analysis",
  NLP_SOCIAL_ENGINEERING: "Social Engineering",
  THREAT_INTELLIGENCE: "Threat Intelligence",
  ANOMALY: "Anomaly",
};

const FINDING_SEVERITY_RANK: Record<ForensicFinding["severity"], number> = {
  SAFE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function FindingSummaryChips({ findings }: { findings: ForensicFinding[] }) {
  const counts = findings.reduce<Partial<Record<ForensicFinding["severity"], number>>>(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {}
  );
  const order: ForensicFinding["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"];

  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((s) =>
        counts[s] ? (
          <span
            key={s}
            className={`text-[10px] px-2 py-1 rounded-lg border font-bold ${FINDING_SEVERITY[s].chip}`}
          >
            {s} {counts[s]}
          </span>
        ) : null
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: ForensicFinding }) {
  const sev = FINDING_SEVERITY[finding.severity] || FINDING_SEVERITY.LOW;
  const catLabel = FINDING_CATEGORY_LABELS[finding.category] || finding.category;

  return (
    <div className={`rounded-xl border-l-4 border border-slate-800 bg-slate-950/70 p-4 space-y-3 min-w-0 ${sev.border}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${sev.chip}`}
          >
            {finding.severity}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {catLabel}
          </span>
        </div>
        {finding.confidence != null && (
          <span className="text-[10px] font-mono text-slate-500 shrink-0">
            confidence {Math.round(finding.confidence * 100)}%
          </span>
        )}
      </div>

      <div className="text-sm font-semibold text-slate-100 break-words">
        {finding.description}
      </div>

      {finding.humanExplanation && (
        <p className="text-xs leading-relaxed text-slate-300 break-words">
          {finding.humanExplanation}
        </p>
      )}

      {finding.technicalEvidence && (
        <div className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">
            Technical Evidence
          </div>
          <div className="text-[11px] font-mono text-slate-400 break-all min-w-0">
            {finding.technicalEvidence}
          </div>
        </div>
      )}

      {finding.recommendedAction && (
        <div className="flex items-start gap-2 text-[11px] text-emergency-200">
          <Shield className="w-3.5 h-3.5 text-emergency-400 shrink-0 mt-0.5" />
          <span className="break-words">{finding.recommendedAction}</span>
        </div>
      )}
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
  const [caseLink, setCaseLink] = useState<{
    id: string;
    caseNumber: string | null;
    title: string | null;
    threatType: string | null;
    severity: string | null;
  } | null>(null);
  const [caseSaveError, setCaseSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const needs = el.scrollHeight;
    const capped = Math.min(needs, TEXTAREA_MAX_HEIGHT);
    el.style.height = `${capped}px`;
    el.style.overflowY = needs > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [rawEmail]);

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
    setCaseLink(null);
    setCaseSaveError(null);

    try {
      const res = await fetch("/api/email-forensics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawEmail: rawEmail.trim(), saveAsCase: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed. Please check your input.");
      } else {
        setResult(data as EmailAnalysisResult);
        if (data.case?.id) {
          setCaseLink({
            id: data.case.id,
            caseNumber: data.case.caseNumber || null,
            title: data.case.title || null,
            threatType: data.case.threatType || null,
            severity: data.case.severity || null,
          });
        } else if (data.caseSaveError) {
          setCaseSaveError(String(data.caseSaveError));
        }
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
        title: `Email Investigation: ${result.headers.subject?.substring(0, 50) || "Unknown Subject"}${(result.headers.subject?.length ?? 0) > 50 ? "..." : ""}`,
        filename: `email_forensic_${result.id}.json`,
        fileType: "application/json",
        fileSize: new Blob([analysisString]).size,
        timestamp: new Date().toISOString(),
        sha256Hash: sha256,
        category: category,
        notes: notes,
        integrityVerified: true,
        encrypted: false,
        evidenceCode: "",
        locked: false,
        lockedAt: null,
        caseId: null,
      };

      // Save to evidence locker
      addEvidenceItem(newEvidence);

      // Best-effort server-side link so this evidence lands in the secure
      // vault (optionally attached to the case created during this
      // investigation). A failure here is non-fatal — the local vault copy
      // is already saved, and the vault itself always shows the honest state.
      try {
        await fetch("/api/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newEvidence.title,
            filename: newEvidence.filename,
            fileType: newEvidence.fileType,
            fileSize: newEvidence.fileSize,
            sha256Hash: newEvidence.sha256Hash,
            category: newEvidence.category,
            notes: newEvidence.notes,
            ...(caseLink?.id ? { caseId: caseLink.id } : {}),
          }),
        });
      } catch (err) {
        console.warn("Could not link evidence to secure vault:", err);
      }
      
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

  const handleAnalyzeAnother = () => {
    setMode("choose");
    setResult(null);
    setRawEmail("");
    setError(null);
    setCaseLink(null);
    setCaseSaveError(null);
    setSavedEvidenceId(null);
    setSaveError(null);
    setSaveSuccess(false);
    window.scrollTo(0, 0);
  };

  const showChooseMode = !result && mode === "choose";
  const showPasteMode = !result && mode === "paste";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {showChooseMode ? (
        <>
          {/* ================= CINEMATIC ENTRY HERO ================= */}
          <section className="relative overflow-hidden pt-4 sm:pt-8">
            {/* Ambient crimson atmosphere + faint forensic grid */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(239,68,68,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.05) 1px, transparent 1px)",
                  backgroundSize: "44px 44px",
                  maskImage:
                    "radial-gradient(ellipse 75% 70% at 50% 20%, black 30%, transparent 78%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 75% 70% at 50% 20%, black 30%, transparent 78%)",
                }}
              />
              <div
                className="absolute left-1/2 -top-36 -translate-x-1/2 w-[680px] h-[420px] rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(185,28,28,0.30) 0%, rgba(185,28,28,0.07) 45%, transparent 70%)",
                  filter: "blur(34px)",
                }}
              />
              <div
                className="absolute -bottom-24 -left-28 w-[440px] h-[320px] rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(127,29,29,0.22) 0%, transparent 70%)",
                  filter: "blur(40px)",
                }}
              />
              <div
                className="absolute -bottom-20 -right-28 w-[440px] h-[320px] rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(185,28,28,0.16) 0%, transparent 70%)",
                  filter: "blur(40px)",
                }}
              />
            </div>

            {/* Live scan sweep */}
            <div className="hero-scanline" aria-hidden />

            {/* Corner focus brackets */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-tl-xl border-l-2 border-t-2 border-emergency-500/30"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-tr-xl border-r-2 border-t-2 border-emergency-500/30"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-bl-xl border-b-2 border-l-2 border-emergency-500/30"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 right-3 h-8 w-8 rounded-br-xl border-b-2 border-r-2 border-emergency-500/30"
            />

            <div className="relative z-10 mx-auto max-w-4xl px-4 pt-10 pb-4 text-center sm:pt-14">
              <div
                className={`transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "80ms" }}
              >
                <EyebrowBadge icon={Mail}>
                  <span>Email Forensic Investigator</span>
                </EyebrowBadge>
              </div>

              <h1
                className={`mt-6 transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "220ms" }}
              >
                <span className="font-black tracking-tight text-white text-4xl sm:text-6xl md:text-7xl">
                  Email <span className="text-crimson-gradient">Forensics</span>
                </span>
              </h1>

              <div
                className={`transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "380ms" }}
              >
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emergency-500/25 bg-emergency-950/50 px-3 py-1 backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emergency-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emergency-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-emergency-200">
                    Live Investigation Lab
                  </span>
                </div>
                <p className="mx-auto mt-5 max-w-2xl text-sm font-light leading-relaxed tracking-wide text-slate-200 sm:text-base">
                  Cyber Sakhi&apos;s forensic engine investigates suspicious email — authentication
                  checks, sender-spoofing analysis, SMTP path tracing, and threat-indicator
                  extraction.
                </p>
                <p className="mx-auto mt-2.5 max-w-2xl text-xs leading-relaxed text-slate-400">
                  One unified analysis engine runs both paths below, so results are identical no matter
                  which route you take.
                </p>
              </div>
            </div>
          </section>

          {/* ================= ENTRY OPTIONS ================= */}
          <div className="relative z-10 mx-auto mt-10 max-w-4xl px-4 pb-2 sm:mt-14 sm:px-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* OPTION 01 — Paste Raw Email */}
              <div
                className={`transition-all duration-700 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "520ms" }}
              >
                <button
                  type="button"
                  onClick={selectPasteMode}
                  className="glass-card group flex h-full w-full flex-col rounded-2xl p-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emergency-700/40 bg-emergency-950/50 shrink-0">
                        <FileText className="h-5 w-5 text-emergency-300" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          Option 01
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emergency-400">
                          Manual Input
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-600 transition group-hover:text-emergency-500">
                      RAW // PASTE
                    </span>
                  </div>

                  <h2 className="mt-5 text-lg font-black tracking-tight text-white">
                    Have an email? Paste here
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                    Paste the full raw email source — headers and body — and run the forensic analysis
                    engine on it. Works with Gmail, Outlook, Apple Mail, and ProtonMail exports.
                  </p>

                  <span className="btn-emergency mt-auto w-full pt-3 pb-3 text-xs">
                    <FileText className="h-4 w-4" />
                    <span>Paste Raw Email</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              </div>

              {/* OPTION 02 — Connect Gmail */}
              <div
                className={`transition-all duration-700 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "640ms" }}
              >
                <button
                  type="button"
                  onClick={openGmailInvestigation}
                  className="glass-card group flex h-full w-full flex-col rounded-2xl p-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emergency-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emergency-700/40 bg-emergency-950/40 shrink-0">
                        <InboxIcon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          Option 02
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emergency-400">
                          Live Inbox
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-600 transition group-hover:text-emergency-500">
                      GMAIL // READ-ONLY
                    </span>
                  </div>

                  <h2 className="mt-5 text-lg font-black tracking-tight text-white">
                    Connect your Gmail and find in a few seconds
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                    Securely connect Gmail with read-only access and investigate real suspicious
                    messages from your inbox — no copying, no exports, point and investigate.
                  </p>

                  <span className="btn-emergency mt-auto w-full pt-3 pb-3 text-xs">
                    <InboxIcon className="h-4 w-4" />
                    <span>Connect Gmail</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-7 flex items-start justify-center gap-1.5 px-1 text-[11px] text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>
                Both entry methods use Cyber Sakhi&apos;s single forensic analysis engine, so results
                are identical regardless of how you get here.
              </span>
            </div>
          </div>
        </>
      ) : showPasteMode ? (
        <>
          {/* CINEMATIC PASTE HERO — same forensic atmosphere as the landing screen */}
          <section className="relative overflow-hidden pt-4 sm:pt-6">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(239,68,68,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.05) 1px, transparent 1px)",
                  backgroundSize: "44px 44px",
                  maskImage:
                    "radial-gradient(ellipse 75% 70% at 50% 20%, black 30%, transparent 78%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 75% 70% at 50% 20%, black 30%, transparent 78%)",
                }}
              />
              <div
                className="absolute left-1/2 -top-28 -translate-x-1/2 w-[560px] h-[340px] rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(185,28,28,0.24) 0%, rgba(185,28,28,0.06) 45%, transparent 70%)",
                  filter: "blur(32px)",
                }}
              />
            </div>

            <div className="hero-scanline" aria-hidden />

            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-emergency-500/30"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-emergency-500/30"
            />

            <div className="relative z-10 mx-auto max-w-4xl px-4 pt-8 pb-2 text-left sm:pt-10">
              <div
                className={`transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "60ms" }}
              >
                <EyebrowBadge icon={FileText}>
                  <span>Raw Evidence Input</span>
                </EyebrowBadge>
              </div>

              <h1
                className={`mt-5 transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "160ms" }}
              >
                <span className="tracking-tight text-white font-black text-4xl sm:text-5xl md:text-6xl">
                  Paste <span className="text-crimson-gradient">Raw Email</span>
                </span>
              </h1>

              <div
                className={`transition-all duration-1000 ease-out ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                style={{ transitionDelay: "300ms" }}
              >
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emergency-500/25 bg-emergency-950/50 px-3 py-1 backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emergency-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emergency-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-emergency-200">
                    Evidence Intake Ready
                  </span>
                </div>
                <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed tracking-wide text-slate-200 sm:text-base">
                  Paste the full raw email source — headers and body — and run Cyber Sakhi&apos;s
                  forensic engine on it. Supports Gmail, Outlook, Apple Mail, and ProtonMail exports.
                </p>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
                  Your input runs inside the Cyber Sakhi forensic pipeline and never leaves it.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : result ? (
        <>
          {/* ================= FORENSIC REPORT HEADER ================= */}
          <section className="relative overflow-hidden pt-2">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(239,68,68,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.04) 1px, transparent 1px)",
                  backgroundSize: "44px 44px",
                  maskImage:
                    "radial-gradient(ellipse 80% 90% at 15% 0%, black 35%, transparent 80%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 80% 90% at 15% 0%, black 35%, transparent 80%)",
                }}
              />
            </div>

            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <EyebrowBadge icon={ShieldCheck}>
                    <span>Forensic Analysis Complete</span>
                  </EyebrowBadge>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 font-mono text-[10px] tracking-wider text-slate-400">
                    <FolderOpen className="h-3 w-3 text-emergency-400" />
                    ANALYSIS-ID {result.id || "N/A"}
                  </span>
                </div>

                <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
                  {result.headers.subject ? (
                    <span className="break-words">{result.headers.subject}</span>
                  ) : (
                    "Email Forensic Report"
                  )}
                </h1>

                <div className="flex flex-col gap-1.5 text-[11px] text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="text-slate-500 font-semibold">FROM</span>
                    <span className="font-mono text-slate-200 break-all">
                      {result.headers.from || "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="text-slate-500 font-semibold">TO</span>
                    <span className="font-mono text-slate-200 break-all">
                      {result.headers.to || "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-slate-500 font-semibold">RECEIVED</span>
                    <span className="font-mono text-slate-300">
                      {result.headers.date
                        ? new Date(result.headers.date).toLocaleString()
                        : "N/A"}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500 font-semibold">ANALYZED</span>
                    <span className="font-mono text-slate-300">
                      {result.analyzedAt
                        ? new Date(result.analyzedAt).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAnalyzeAnother}
                className="btn-emergency shrink-0 self-start"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Analyze Another</span>
              </button>
            </div>
          </section>
        </>
      ) : null}

      {/* Input Panel (Method A - Paste Raw Email) */}
      {showPasteMode && (
        <div className="rounded-2xl border border-slate-800/90 bg-[#0b0b17]/80 p-4 backdrop-blur-xl sm:p-6">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emergency-400">
                  Raw Email Source
                </span>
                <span
                  aria-hidden
                  className="hidden h-px w-16 bg-gradient-to-r from-emergency-500/60 to-transparent sm:inline-block"
                />
              </div>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs font-medium text-emergency-400 underline underline-offset-4 transition-colors hover:text-emergency-300"
              >
                Load phishing sample
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Include the full email — headers and body. The panel grows with your input, then
              scrolls internally at its compact maximum.
            </p>

            <textarea
              ref={textareaRef}
              value={rawEmail}
              onChange={(e) => setRawEmail(e.target.value)}
              placeholder={`Paste the full raw email source here (including headers).\n\nExample:\nReceived: from mail.sender.com ...\nFrom: noreply@sender.com\nSubject: Your account\n...`}
              rows={5}
              spellCheck={false}
              aria-label="Raw email source input"
              className="w-full min-w-0 resize-none rounded-xl border border-slate-700/80 bg-[#0a0a16] p-4 text-xs font-mono leading-relaxed text-slate-200 placeholder:text-slate-600 transition-[height,border-color] duration-150 ease-out focus:border-emergency-500 focus:outline-none motion-reduce:transition-none"
            />

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/80 p-3 text-xs text-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAnalyzing || !rawEmail.trim()}
              className="btn-emergency mt-1 w-full sm:w-auto"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
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
          {caseLink && (
            <div className="p-4 rounded-2xl bg-emergency-950/30 border border-emergency-700/40 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emergency-900/50 border border-emergency-700/40 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-emergency-300" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-black text-emergency-200">
                    Case Created: <span className="font-mono">{caseLink.caseNumber}</span>
                  </div>
                  <div className="text-[10px] text-emergency-300/80 truncate">
                    {caseLink.title} · {caseLink.threatType} · severity {caseLink.severity}
                  </div>
                </div>
              </div>
              <Link
                href={`/cases/${caseLink.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emergency-200 hover:text-white bg-emergency-900/50 hover:bg-emergency-800 border border-emergency-700/50 px-3 py-2 rounded-xl transition shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Open Case
              </Link>
            </div>
          )}
          {caseSaveError && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Analysis complete, but the case could not be saved to the database this time ({caseSaveError}).
                You can still view the forensic report below.
              </span>
            </div>
          )}

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
                      : "bg-emergency-600 hover:bg-emergency-500 text-white"
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

          {/* ---- Verdict: Why Suspicious ---- */}
          {result.verdict && (
            <div className="p-5 rounded-2xl bg-sky-950/30 border border-sky-800/50 space-y-4">
              <SectionHeader title="Why This Email Looks Suspicious" icon={ShieldAlert} />

              <div className="text-sm text-slate-100 font-semibold">
                {result.verdict.summary}
              </div>

              {result.verdict.confidence != null && (
                <div className="text-[11px] text-sky-300">
                  Analysis confidence {Math.round(result.verdict.confidence * 100)}% —
                  grounded only in signals actually detected.
                </div>
              )}

              {result.verdict.contributingSignals &&
                result.verdict.contributingSignals.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.verdict.contributingSignals.map((signal, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-slate-300 bg-slate-900/70 rounded-lg px-3 py-2 flex items-start gap-2"
                      >
                        <span className="text-sky-400 shrink-0 mt-0.5">▸</span>
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                )}

              {result.scoreBreakdown && result.scoreBreakdown.groups.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">
                    Score contributions (deterministic, capped at 100)
                  </div>
                  <div className="space-y-1.5">
                    {result.scoreBreakdown.groups.map((g, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-400 flex-1">{g.reason}</span>
                        <span className="font-mono text-emergency-300 shrink-0">+{g.points}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 text-[11px] border-t border-slate-800 pt-1.5">
                      <span className="text-slate-300">Total {result.threatScore}/100</span>
                      <span className={`font-black ${threatColorMap[result.threatLevel]}`}>
                        {result.threatLevel}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- Forensic Findings (structured) ---- */}
          {result.structuredFindings && result.structuredFindings.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader
                title={`Forensic Findings (${result.structuredFindings.length})`}
                icon={FileSearch}
              />

              <FindingSummaryChips findings={result.structuredFindings} />

              <p className="text-[11px] text-slate-500">
                Investigation-oriented breakdown of every signal flagged by the forensic engine.
                Severity, confidence, and evidence are reported exactly as produced by the analysis.
              </p>

              <div className="space-y-3">
                {[...result.structuredFindings]
                  .sort(
                    (a, b) =>
                      FINDING_SEVERITY_RANK[b.severity] - FINDING_SEVERITY_RANK[a.severity]
                  )
                  .map((finding, i) => (
                    <FindingCard key={finding.id || i} finding={finding} />
                  ))}
              </div>
            </div>
          )}

          {/* ---- Email Authentication (SPF / DKIM / DMARC) ---- */}
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
                <Globe className="w-3.5 h-3.5 text-emergency-400" />
                Originating IP
              </div>
              {result.originatingIP ? (
                <div className="space-y-3">
                  <div className="font-mono text-emergency-300 bg-emergency-950/30 border border-emergency-800/40 px-3 py-2 rounded-lg text-sm font-bold inline-block">
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

                    {/* ---- SMTP Relay Anomalies ---- */}
          {result.smtpAnomalies && result.smtpAnomalies.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader title="SMTP Relay Anomalies" icon={Network} />
              <div className="space-y-1.5">
                {result.smtpAnomalies.map((a, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-[11px] ${
                      a.severity === "HIGH"
                        ? "bg-red-950/30 border-red-700/40 text-red-200"
                        : a.severity === "MEDIUM"
                        ? "bg-amber-950/30 border-amber-700/40 text-amber-200"
                        : "bg-slate-900/60 border-slate-800 text-slate-300"
                    }`}
                  >
                    <span className="font-mono uppercase text-[9px] opacity-70">
                      {a.type.replace(/_/g, " ")}
                    </span>
                    <div>{a.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Attachment Structure Analysis ---- */}
          {result.attachments && result.attachments.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader title="Attachment Structure Analysis" icon={FileText} />
              <div className="space-y-1.5">
                {result.attachments.map((a, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-[11px] ${
                      a.suspicious
                        ? "bg-red-950/30 border-red-700/40"
                        : "bg-slate-900/60 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-slate-200">{a.filename}</span>
                      <span className="text-slate-500">({a.extension || "no ext"})</span>
                      {a.suspicious && (
                        <span className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 text-[9px] font-bold">
                          SUSPICIOUS
                        </span>
                      )}
                      <span className="ml-auto flex gap-2 text-[9px] font-mono text-slate-500">
                        {a.executable && <span className="text-red-400">EXE</span>}
                        {a.scriptLike && <span className="text-red-400">SCRIPT</span>}
                        {a.macroHint && <span className="text-amber-300">MACRO?</span>}
                        {a.doubleExtension && <span className="text-amber-300">DBL-EXT</span>}
                        {a.archive && <span className="text-slate-400">ARCHIVE</span>}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      Structural analysis only — attachment content is never executed or decoded.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Signal Extraction (Entities) ---- */}
          {result.entities && result.entities.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader title="Signal Extraction" icon={Link2} />
              <div className="flex flex-wrap gap-1.5">
                {result.entities.map((e, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[10px] font-mono text-slate-200"
                  >
                    <span className="uppercase text-[8px] text-emergency-400">{e.type}</span>
                    {e.value}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-slate-500">
                Pattern-based extraction. It flags content types referenced in the email; it does not
                confirm any organization or number actually sent this email.
              </div>
            </div>
          )}

          {/* ---- Content Language Analysis (NLP) ---- */}
          {result.nlp && result.nlp.detail && result.nlp.detail.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader title="Content Language Analysis" icon={Fingerprint} />

              <div className="flex flex-wrap gap-1.5">
                {result.nlp.categoriesDetected &&
                  result.nlp.categoriesDetected.length > 0 &&
                  result.nlp.categoriesDetected.map((cat) => (
                    <span
                      key={cat}
                      className="text-[10px] px-2 py-1 rounded-lg bg-emergency-950 border border-emergency-700/40 text-emergency-300 font-bold uppercase tracking-wider"
                    >
                      {cat.replace(/_/g, " ")}
                    </span>
                  ))}
                <span className="text-[10px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 font-mono">
                  {result.nlp.triggerCount} trigger
                  {result.nlp.triggerCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-3">
                {result.nlp.detail.map((trigger, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 min-w-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-200 break-all">
                        &ldquo;{trigger.phrase}&rdquo;
                      </span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-emerald-300">
                        {trigger.category.replace(/_/g, " ")}
                      </span>
                    </div>
                    {trigger.evidence && (
                      <div className="text-[11px] text-slate-400 break-words">
                        {trigger.evidence}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {result.nlp.disclaimer && (
                <div className="flex items-start gap-2 text-[10px] text-slate-500">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{result.nlp.disclaimer}</span>
                </div>
              )}
            </div>
          )}

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

          {/* ---- Embedded Link Analysis ---- */}
          {result.urlRisk && result.urlRisk.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <SectionHeader
                title={`Embedded Link Analysis (${result.urlRisk.length})`}
                icon={ExternalLink}
              />

              <p className="text-[11px] text-slate-500">
                Structure-and-pattern review of links found in the email. Links are never followed,
                fetched, or opened.
              </p>

              <div className="space-y-3">
                {result.urlRisk.map((url, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 min-w-0"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-mono text-xs text-slate-200 break-all min-w-0">
                        {url.url}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border shrink-0 ${
                          url.severity === "HIGH"
                            ? "bg-red-950 border-red-600/50 text-red-300"
                            : url.severity === "MEDIUM"
                            ? "bg-amber-950 border-amber-600/50 text-amber-300"
                            : "bg-sky-950 border-sky-600/50 text-sky-300"
                        }`}
                      >
                        {url.severity}
                      </span>
                    </div>

                    {url.evidence && (
                      <div className="text-[11px] text-slate-400 break-words">
                        {url.evidence}
                      </div>
                    )}

                    {url.flags && url.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {url.flags.map((flag, fi) => (
                          <span
                            key={fi}
                            className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
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
                    <ArrowRight className="w-3.5 h-3.5 text-emergency-400 shrink-0 mt-0.5" />
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

          {/* ---- Case Actions ---- */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-[11px] text-slate-500 min-w-0">
              Investigation{" "}
              {result.id && <span className="font-mono text-slate-400">{result.id}</span>}
              {" · "}Threat level{" "}
              <span className={`font-black ${threatColorMap[result.threatLevel]}`}>
                {result.threatLevel}
              </span>
              {" · "}Score {result.threatScore}/100
            </div>
            <div className="flex flex-wrap gap-2">
              {caseLink && (
                <Link
                  href={`/cases/${caseLink.id}`}
                  className="btn-emergency text-xs"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open Case
                </Link>
              )}
              <button
                type="button"
                onClick={handleAnalyzeAnother}
                className="btn-emergency text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Analyze Another Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

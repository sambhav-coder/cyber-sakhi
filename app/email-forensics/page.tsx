"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Search,
  ShieldCheck,
  FileText,
  Info,
  Loader2,
  ArrowRight,
  FolderOpen,
  RotateCcw,
  AlertCircle,
  Inbox as InboxIcon,
} from "lucide-react";
import { EmailAnalysisResult } from "@/lib/emailTypes";
import { addEvidenceItem } from "@/lib/storage";
import { computeSha256 } from "@/lib/cryptoUtils";
import { EvidenceItem } from "@/lib/types";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { EmailAnalysisReport } from "@/components/email-forensics/EmailAnalysisReport";

const TEXTAREA_MAX_HEIGHT = 320;

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
  const [showAlertNotification, setShowAlertNotification] = useState(false);
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
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        if (parsed.analysis && typeof parsed.analysis === "object") {
          setResult(parsed.analysis as EmailAnalysisResult);
          if (parsed.case?.id) {
            setCaseLink({
              id: parsed.case.id,
              caseNumber: parsed.case.caseNumber || null,
              title: parsed.case.title || null,
              threatType: parsed.case.threatType || null,
              severity: parsed.case.severity || null,
            });
          } else if (parsed.caseSaveError) {
            setCaseSaveError(String(parsed.caseSaveError));
          }
        } else {
          setResult(parsed as EmailAnalysisResult);
        }
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
    setShowAlertNotification(false);

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
        // Show alert notification if alerts were generated
        if (data.alerts && data.alerts.length > 0) {
          setShowAlertNotification(true);
        }
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
        <EmailAnalysisReport
          result={result}
          caseLink={caseLink}
          caseSaveError={caseSaveError}
          isSaving={isSaving}
          savedEvidenceId={savedEvidenceId}
          saveSuccess={saveSuccess}
          saveError={saveError}
          onSaveToLocker={handleSaveToLocker}
          onAnalyzeAnother={handleAnalyzeAnother}
        />
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Search,
  Lock,
  MessageSquare,
  Radio,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Users,
  CheckCircle2,
  FileCheck2,
  BellRing,
  Sparkles,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { SOSModal } from "@/components/SOSModal";
import { CyberSakhiLogo } from "@/components/CyberSakhiLogo";
import { analyzeMessage } from "@/lib/threatEngine";
import { ThreatAnalysisResult } from "@/lib/types";
import { getStoredContacts, getStoredEvidence, getStoredScanHistory, addScanHistoryItem } from "@/lib/storage";

export default function HomePage() {
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [quickResult, setQuickResult] = useState<ThreatAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stats, setStats] = useState({
    contactsCount: 3,
    evidenceCount: 2,
    scansCount: 5,
  });

  useEffect(() => {
    const contacts = getStoredContacts();
    const evidence = getStoredEvidence();
    const history = getStoredScanHistory();
    setStats({
      contactsCount: contacts.length,
      evidenceCount: evidence.length,
      scansCount: history.length > 0 ? history.length : 5,
    });
  }, []);

  const handleQuickAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setIsAnalyzing(true);
    setTimeout(() => {
      const res = analyzeMessage(quickInput);
      setQuickResult(res);
      addScanHistoryItem(res);
      setIsAnalyzing(false);
    }, 400);
  };

  const sampleDemoPrompts = [
    {
      label: "Blackmail Extortion Demo",
      text: "Send me your OTP or I will leak your photos.",
    },
    {
      label: "Stalking & Location Threat",
      text: "I know where you live and what gym you go to. Meet me alone tonight or else.",
    },
    {
      label: "Safe Message Control",
      text: "Hey, are you free tomorrow afternoon for the project discussion over coffee?",
    },
  ];

  return (
    <div className="space-y-12 pb-12 animate-in fade-in duration-300">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl p-8 sm:p-12 glass-panel border-purple-800/40 glow-purple">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>AI-Powered Safety Companion</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white flex items-center gap-3">
              <CyberSakhiLogo className="w-9 h-9 sm:w-11 sm:h-11 inline-block shrink-0" />
              <span className="bg-gradient-to-r from-purple-200 via-white to-purple-400 bg-clip-text text-transparent">
                Cyber Sakhi
              </span>
            </h1>
            <p className="text-xl sm:text-2xl font-bold tracking-tight text-purple-300">
              Your safety. Your privacy. Your Sakhi.
            </p>
          </div>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl pt-1">
            Cyber Sakhi unites digital threat detection with real-world physical safety. Detect harassment and scams in messages, preserve tamper-proof evidence, get 24/7 empathetic guidance, and trigger silent emergency SOS to your trusted network.
          </p>

          {/* Quick Stats Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-950/70 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Protection</div>
                <div className="text-sm font-bold text-emerald-400">Active Shield</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-950/70 text-purple-400 border border-purple-500/30">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Trusted Contacts</div>
                <div className="text-sm font-bold text-purple-200">{stats.contactsCount} Verified</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-950/70 text-indigo-400 border border-indigo-500/30">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Evidence Locker</div>
                <div className="text-sm font-bold text-indigo-200">{stats.evidenceCount} SHA Vaulted</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-950/70 text-cyan-400 border border-cyan-500/30">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Threat Scans</div>
                <div className="text-sm font-bold text-cyan-200">{stats.scansCount} Analyzed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Primary Action Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Primary Safety Actions
            </h2>
            <p className="text-xs text-slate-400">
              Immediate response tools and intelligent protection flows
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Action 1: Emergency SOS */}
          <div
            onClick={() => setIsSosOpen(true)}
            className="cursor-pointer group relative overflow-hidden rounded-2xl p-6 bg-gradient-to-b from-red-950/50 via-[#190d12] to-[#12080c] border border-red-500/40 hover:border-red-400 transition-all duration-200 hover:-translate-y-1 shadow-lg shadow-red-950/30"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-red-600/20 text-red-400 border border-red-500/40 group-hover:scale-110 transition">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-500/40 font-bold uppercase">
                Immediate
              </span>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-red-300 transition">
              🚨 Emergency / SOS
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Activate instant multi-channel SOS beacon with live GPS coordinates to trusted contacts and authorities.
            </p>
            <div className="mt-4 flex items-center text-xs font-semibold text-red-400 group-hover:translate-x-1 transition">
              <span>Trigger SOS Drill</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>

          {/* Action 2: Check a Message */}
          <Link
            href="/detector"
            className="group relative overflow-hidden rounded-2xl p-6 glass-card border-purple-500/30 hover:border-purple-400 transition-all duration-200 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/40 group-hover:scale-110 transition">
                <Search className="w-6 h-6" />
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40 font-semibold">
                NLP Engine
              </span>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition">
              🧠 Check a Message
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Paste suspicious messages, DMs, or emails to detect blackmail, OTP scams, cyberstalking, and legal violations.
            </p>
            <div className="mt-4 flex items-center text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition">
              <span>Scan Suspicious Text</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Action 3: Evidence Locker */}
          <Link
            href="/locker"
            className="group relative overflow-hidden rounded-2xl p-6 glass-card border-indigo-500/30 hover:border-indigo-400 transition-all duration-200 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 group-hover:scale-110 transition">
                <Lock className="w-6 h-6" />
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-500/40 font-semibold">
                SHA-256 Vault
              </span>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition">
              🔒 Evidence Locker
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Securely store screenshots and audio with tamper-proof cryptographic hashes and generate police complaint dossiers.
            </p>
            <div className="mt-4 flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition">
              <span>Open Secure Vault</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>

          {/* Action 4: Talk to Sakhi */}
          <Link
            href="/companion"
            className="group relative overflow-hidden rounded-2xl p-6 glass-card border-pink-500/30 hover:border-pink-400 transition-all duration-200 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-pink-600/20 text-pink-400 border border-pink-500/40 group-hover:scale-110 transition">
                <MessageSquare className="w-6 h-6" />
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-900/60 text-pink-300 border border-pink-500/40 font-semibold">
                24/7 AI Guide
              </span>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-pink-300 transition">
              💬 Talk to Sakhi
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Confidential, empathetic advice for online harassment, extortion threats, legal remedies, and emotional support.
            </p>
            <div className="mt-4 flex items-center text-xs font-semibold text-pink-400 group-hover:translate-x-1 transition">
              <span>Start Confidential Chat</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>
        </div>
      </section>

      {/* Interactive Quick Scanner on Homepage */}
      <section className="rounded-2xl p-6 glass-panel border-purple-900/40 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-900/30 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-400" />
              <span>Instant Message Threat Analyzer</span>
            </h3>
            <p className="text-xs text-slate-400">
              Try a suspicious message below or click a hackathon test sample
            </p>
          </div>
          <Link
            href="/detector"
            className="text-xs text-purple-300 hover:text-white flex items-center gap-1 font-medium"
          >
            <span>Open Full Threat Detector</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Sample Prompt Chips */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-400 self-center font-medium">
            Test Presets:
          </span>
          {sampleDemoPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuickInput(p.text);
                const res = analyzeMessage(p.text);
                setQuickResult(res);
                addScanHistoryItem(res);
              }}
              className="text-xs px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-purple-900/40 text-slate-300 hover:text-purple-200 border border-slate-700/60 hover:border-purple-500/40 transition"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleQuickAnalyze} className="space-y-3">
          <div className="relative">
            <textarea
              rows={3}
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Paste suspicious SMS, Instagram DM, WhatsApp message, or email here..."
              className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              *Runs on-device rule & heuristic NLP classification.
            </span>
            <button
              type="submit"
              disabled={isAnalyzing || !quickInput.trim()}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center gap-2"
            >
              {isAnalyzing ? (
                <span>Scanning Patterns...</span>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Analyze Threat</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Result Preview */}
        {quickResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900/95 border border-purple-500/40 space-y-3 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ThreatBadge severity={quickResult.threatLevel} size="md" />
                <span className="text-xs font-mono text-purple-300">
                  Risk Score: {quickResult.score}/100
                </span>
              </div>
              <Link
                href={`/detector?text=${encodeURIComponent(quickResult.text)}`}
                className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
              >
                View Full Legal & Risk Breakdown →
              </Link>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              {quickResult.summary}
            </p>

            {quickResult.triggers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickResult.triggers.map((trig, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800/40"
                  >
                    ⚠️ {trig}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Key USP & Presentation Architecture Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl p-6 glass-card space-y-3 border-purple-800/30">
          <div className="p-3 w-fit rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30">
            <Radio className="w-5 h-5" />
          </div>
          <h4 className="text-base font-bold text-white">VoiceShield Emergency</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Offline wake-word trigger architecture designed for discreet voice-activated alerts and live tracking dispatch without alerting perpetrators.
          </p>
        </div>

        <div className="rounded-2xl p-6 glass-card space-y-3 border-purple-800/30">
          <div className="p-3 w-fit rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
            <Lock className="w-5 h-5" />
          </div>
          <h4 className="text-base font-bold text-white">Tamper-Proof Locker</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Calculates client-side SHA-256 integrity hashes to create court-admissible chains of custody for police FIRs and cyber cell complaints.
          </p>
        </div>

        <div className="rounded-2xl p-6 glass-card space-y-3 border-purple-800/30">
          <div className="p-3 w-fit rounded-xl bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h4 className="text-base font-bold text-white">Institutional Portal</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Anonymized incident trends and severity analytics for university safety teams, NGOs, and cyber cell escalation committees.
          </p>
        </div>
      </section>

      {/* Global SOS Modal */}
      <SOSModal isOpen={isSosOpen} onClose={() => setIsSosOpen(false)} />
    </div>
  );
}

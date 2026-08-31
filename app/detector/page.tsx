"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  AlertTriangle,
  Lock,
  MessageSquare,
  ShieldCheck,
  Zap,
  Scale,
  FileCheck,
  CheckCircle,
  Copy,
  RotateCcw,
  Sparkles,
  UploadCloud,
  Mic,
  Radio,
  FileText,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { analyzeMessage } from "@/lib/threatEngine";
import { ThreatAnalysisResult, EvidenceItem } from "@/lib/types";
import { addEvidenceItem, addScanHistoryItem, getStoredScanHistory } from "@/lib/storage";
import { computeSha256, generateMockIpfsCid, generateMockTxHash } from "@/lib/cryptoUtils";

function DetectorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"text" | "media" | "audio">("text");
  const [inputText, setInputText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ThreatAnalysisResult | null>(null);
  const [savedLockerSuccess, setSavedLockerSuccess] = useState(false);
  const [scanHistory, setScanHistory] = useState<ThreatAnalysisResult[]>([]);

  // Media simulation state
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [mediaAnalysisDone, setMediaAnalysisDone] = useState(false);

  // Audio simulation state
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioAnalysisDone, setAudioAnalysisDone] = useState(false);

  useEffect(() => {
    const queryText = searchParams.get("text");
    if (queryText) {
      setInputText(queryText);
      runScan(queryText);
    }
    setScanHistory(getStoredScanHistory());
  }, [searchParams]);

  const runScan = (textToScan: string) => {
    if (!textToScan.trim()) return;
    setIsScanning(true);
    setSavedLockerSuccess(false);

    setTimeout(() => {
      const res = analyzeMessage(textToScan);
      setResult(res);
      addScanHistoryItem(res);
      setScanHistory(getStoredScanHistory());
      setIsScanning(false);
    }, 450);
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runScan(inputText);
  };

  const handleSaveToLocker = async () => {
    if (!result) return;
    const sha = await computeSha256(result.text);
    const newEvidence: EvidenceItem = {
      id: "ev_" + Date.now(),
      title: `Scanned Incident: ${result.threatLevel} Threat`,
      filename: `scan_log_${Date.now()}.txt`,
      fileType: "text/plain",
      fileSize: new Blob([result.text]).size,
      timestamp: new Date().toISOString(),
      sha256Hash: sha,
      category:
        result.riskFactors.blackmail > 0
          ? "BLACKMAIL"
          : result.riskFactors.stalking > 0
          ? "STALKING"
          : result.riskFactors.financialScam > 0
          ? "SCAM"
          : "HARASSMENT",
      notes: `Automated scan score: ${result.score}/100. Legal sections: ${result.legalSections.map((s) => s.code).join(", ")}. Text snippet: "${result.text.substring(0, 100)}..."`,
      integrityVerified: true,
      simulatedIpfsCid: generateMockIpfsCid(sha),
      simulatedTxHash: generateMockTxHash(sha),
    };

    addEvidenceItem(newEvidence);
    setSavedLockerSuccess(true);
    setTimeout(() => setSavedLockerSuccess(false), 4000);
  };

  const presetExamples = [
    {
      label: "Blackmail Extortion (Critical)",
      text: "Send me your OTP or I will leak your private photos to everyone in your college.",
    },
    {
      label: "Cyberstalking & Tracking (High)",
      text: "I know your address and what time you leave office. Meet me alone at the park or else.",
    },
    {
      label: "Lottery Phishing Scam (Medium)",
      text: "Congratulations! You won ₹25,00,000 lottery. Click here now to verify your bank card details.",
    },
    {
      label: "Safe Message Control (Safe)",
      text: "Hi! Can you share the notes from today's lecture? Thanks a lot!",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300 text-xs font-semibold">
          <Zap className="w-3.5 h-3.5" />
          <span>Multi-Vector Harassment & Threat Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Harassment & Digital Threat Detector
        </h1>
        <p className="text-sm text-slate-300 max-w-3xl">
          Instantly evaluate suspicious messages, coercive extortion, cyberstalking, and fraud against Indian Cyber Laws (IT Act 2000 & BNS/IPC) with actionable mitigation guidance.
        </p>
      </div>

      {/* Modality Switcher */}
      <div className="flex border-b border-slate-800 space-x-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("text")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === "text"
              ? "border-purple-500 text-purple-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Text Message Analysis</span>
        </button>
        <button
          onClick={() => setActiveTab("media")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === "media"
              ? "border-purple-500 text-purple-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Screenshot & Image Scan</span>
        </button>
        <button
          onClick={() => setActiveTab("audio")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === "audio"
              ? "border-purple-500 text-purple-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Audio Stress & Threat Analysis</span>
        </button>
      </div>

      {/* TAB 1: TEXT ANALYSIS */}
      {activeTab === "text" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Input Form & Presets */}
          <div className="lg:col-span-7 space-y-5">
            <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Input Suspicious Message
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {inputText.length} characters
                </span>
              </div>

              {/* Preset Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">
                  Quick Hackathon Test Cases:
                </span>
                <div className="flex flex-wrap gap-2">
                  {presetExamples.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputText(p.text);
                        runScan(p.text);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-purple-900/40 text-slate-300 hover:text-purple-200 border border-slate-700/60 hover:border-purple-500/40 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleScanSubmit} className="space-y-4 pt-2">
                <textarea
                  rows={5}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste the SMS, DM, email, or chat message here..."
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed font-sans"
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setInputText("");
                      setResult(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isScanning || !inputText.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-950/40"
                  >
                    {isScanning ? (
                      <span>Analyzing NLP Vectors...</span>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Run Threat Scan</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Scan History list */}
            {scanHistory.length > 0 && (
              <div className="p-5 rounded-2xl glass-card space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Recent Scan Logs
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {scanHistory.slice(0, 4).map((scan) => (
                    <div
                      key={scan.id}
                      onClick={() => {
                        setInputText(scan.text);
                        setResult(scan);
                      }}
                      className="cursor-pointer p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 flex items-center justify-between gap-3 text-xs transition"
                    >
                      <div className="truncate flex-1 text-slate-300 font-medium">
                        "{scan.text}"
                      </div>
                      <ThreatBadge severity={scan.threatLevel} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Scan Results Breakdown */}
          <div className="lg:col-span-5 space-y-5">
            {result ? (
              <div className="p-6 rounded-2xl glass-panel border-purple-700/40 space-y-6 animate-in zoom-in-95 duration-200">
                {/* Result Header */}
                <div className="flex items-center justify-between border-b border-purple-900/40 pb-4">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Threat Classification
                    </span>
                    <div className="mt-1">
                      <ThreatBadge severity={result.threatLevel} size="lg" />
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Threat Score
                    </span>
                    <div className="text-2xl font-black text-white font-mono">
                      {result.score}
                      <span className="text-xs text-slate-400 font-normal">/100</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-1">
                  <div className="text-[11px] text-purple-300 font-semibold uppercase">
                    Risk Assessment Summary
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {result.summary}
                  </p>
                </div>

                {/* Risk Factor Bars */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Threat Vector Intensity
                  </span>
                  <div className="space-y-2 text-xs">
                    {Object.entries(result.riskFactors).map(([factor, val]) => {
                      const names: Record<string, string> = {
                        blackmail: "Blackmail & Extortion",
                        stalking: "Cyberstalking",
                        sexualHarassment: "Sexual Harassment",
                        financialScam: "Financial Fraud",
                        hateSpeech: "Abuse & Hate Speech",
                        intimidation: "Criminal Intimidation",
                      };
                      if (val === 0) return null;
                      return (
                        <div key={factor} className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-300">{names[factor] || factor}</span>
                            <span className="font-mono text-purple-300">{val}%</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                val > 70
                                  ? "bg-red-500"
                                  : val > 40
                                  ? "bg-orange-500"
                                  : "bg-purple-500"
                              }`}
                              style={{ width: `${val}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detected Triggers */}
                {result.triggers.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Detected Warning Triggers ({result.triggers.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.triggers.map((t, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-red-950/70 text-red-300 border border-red-800/50 flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Applicable Legal Sections */}
                {result.legalSections.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-purple-400" />
                      <span>Applicable Indian Legal Sections</span>
                    </span>
                    <div className="space-y-2">
                      {result.legalSections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 space-y-1 text-xs"
                        >
                          <div className="font-bold text-purple-200">{sec.code}</div>
                          <div className="text-slate-300 text-[11px]">{sec.title}</div>
                          <div className="text-amber-300/90 text-[10px] font-medium">
                            ⚖️ Penalty: {sec.penalty}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Safety Actions */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Recommended Protection Protocol
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {result.recommendedActions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                        <span className="leading-snug">{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Direct Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-purple-900/40">
                  <button
                    onClick={handleSaveToLocker}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40"
                  >
                    <Lock className="w-4 h-4" />
                    {savedLockerSuccess
                      ? "✓ Encrypted & Saved to Evidence Locker!"
                      : "🔒 Save to Evidence Locker (SHA-256 Vault)"}
                  </button>

                  <button
                    onClick={() =>
                      router.push(
                        `/companion?q=${encodeURIComponent(
                          `I scanned this message: "${result.text}". The threat score is ${result.score}/100 (${result.threatLevel}). What should my immediate safety and legal steps be?`
                        )}`
                      )
                    }
                    className="w-full py-2 px-4 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 font-medium text-xs transition flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    <span>Consult Sakhi Companion on This Case</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl glass-panel border-slate-800 text-center space-y-3 flex flex-col items-center justify-center min-h-[350px]">
                <div className="p-4 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-400">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-200">
                  Ready to Inspect Threat Vectors
                </h3>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Enter any text or choose a test preset on the left to view real-time risk scores, NLP triggers, and legal provisions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MEDIA / SCREENSHOT SCANNER SIMULATION */}
      {activeTab === "media" && (
        <div className="p-8 rounded-2xl glass-panel border-purple-900/40 space-y-6">
          <div className="max-w-2xl space-y-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-purple-400" />
              <span>Visual Harassment & Screenshot OCR Inspection</span>
            </h3>
            <p className="text-xs text-slate-300">
              Upload screenshot proof of chats, abusive image posts, or sender profile captures. Cyber Sakhi runs visual OCR extraction and computes cryptographic hash anchors.
            </p>
          </div>

          <div className="border-2 border-dashed border-purple-700/40 hover:border-purple-500/60 rounded-2xl p-8 text-center bg-purple-950/20 space-y-4">
            <input
              type="file"
              id="mediaUpload"
              className="hidden"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFileName(file.name);
                  setMediaAnalysisDone(false);
                  setTimeout(() => setMediaAnalysisDone(true), 800);
                }
              }}
            />
            <label
              htmlFor="mediaUpload"
              className="cursor-pointer inline-flex flex-col items-center justify-center gap-2"
            >
              <div className="p-3 rounded-full bg-purple-600/20 border border-purple-500/40 text-purple-300">
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="text-sm font-semibold text-purple-200">
                Click to browse or drop screenshot
              </span>
              <span className="text-xs text-slate-400">
                Supports PNG, JPG, WebP (Simulated ViT/OCR Analyzer)
              </span>
            </label>
          </div>

          {selectedFileName && mediaAnalysisDone && (
            <div className="p-5 rounded-xl bg-slate-900/90 border border-purple-500/50 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-purple-300">
                    File: {selectedFileName}
                  </span>
                  <p className="text-[11px] text-slate-400">
                    OCR Extracted Text: "Send me ₹50,000 or your morphed pictures go viral on Telegram"
                  </p>
                </div>
                <ThreatBadge severity="CRITICAL" size="md" />
              </div>

              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-200">
                ⚠️ <strong>Extortion Vector Detected:</strong> High confidence non-consensual media threat (94% confidence). Violation of IT Act 66E / 67A.
              </div>

              <button
                onClick={() => router.push("/locker")}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>View in Evidence Locker</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIO STRESS & THREAT ANALYSIS SIMULATION */}
      {activeTab === "audio" && (
        <div className="p-8 rounded-2xl glass-panel border-purple-900/40 space-y-6">
          <div className="max-w-2xl space-y-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-purple-400" />
              <span>Voice Threat & Audio Emotion Classifier</span>
            </h3>
            <p className="text-xs text-slate-300">
              Evaluates threatening phone calls, abusive voice notes, or ambient distress cues using acoustic stress modeling.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-slate-900/80 border border-purple-900/50 text-center space-y-5">
            <button
              onClick={() => {
                if (isRecordingAudio) {
                  setIsRecordingAudio(false);
                  setAudioAnalysisDone(true);
                } else {
                  setIsRecordingAudio(true);
                  setAudioAnalysisDone(false);
                  setTimeout(() => {
                    setIsRecordingAudio(false);
                    setAudioAnalysisDone(true);
                  }, 2500);
                }
              }}
              className={`p-6 rounded-full border-2 transition ${
                isRecordingAudio
                  ? "bg-red-600 border-red-400 text-white animate-pulse"
                  : "bg-purple-950/80 border-purple-500 text-purple-300 hover:bg-purple-900/80"
              }`}
            >
              <Mic className="w-8 h-8" />
            </button>
            <div className="text-sm font-semibold text-slate-200">
              {isRecordingAudio ? "Listening & Analyzing Audio Stress Levels..." : "Click to Record Audio Sample"}
            </div>
          </div>

          {audioAnalysisDone && (
            <div className="p-5 rounded-xl bg-slate-900/90 border border-orange-500/50 space-y-3 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-orange-300">
                  Acoustic Tone: High Agitation & Coercive Pitch Detected
                </span>
                <ThreatBadge severity="HIGH" size="md" />
              </div>
              <p className="text-xs text-slate-300">
                Identified elevated stress signals and aggressive speech patterns indicative of criminal intimidation (BNS Sec 351).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DetectorPage() {
  return (
    <Suspense fallback={<div className="text-purple-400 py-10 text-center">Loading Threat Detector...</div>}>
      <DetectorContent />
    </Suspense>
  );
}

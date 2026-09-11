"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FolderOpen,
  FileText,
  Download,
  Trash2,
  Send,
  AtSign,
  Globe,
  Network,
  Link2,
  Lock,
  Shield,
  ShieldAlert,
  Mail,
  MessageSquare,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";

interface CaseDetail {
  case: {
    id: string;
    caseNumber: string | null;
    title: string | null;
    description: string | null;
    threatType: string | null;
    status: string | null;
    severity: string | null;
    createdAt: string;
    updatedAt: string | null;
  };
  investigations: Array<{
    id: string;
    subject: string | null;
    sender: string | null;
    risk_score: number | null;
    verdict: string | null;
    analysis: any;
    created_at: string;
  }>;
  indicators: Array<{
    id: string;
    type: string;
    value: string;
    malicious: boolean | null;
    source: string | null;
  }>;
  evidence: Array<{
    id: string;
    title: string;
    sha256: string | null;
    category: string | null;
    evidence_code: string | null;
    created_at: string;
  }>;
  reports: Array<{ id: string; title: string; reportType: string | null; createdAt: string }>;
}

interface ChatMessage {
  id: string;
  sender: "user" | "sakhi";
  text: string;
  timestamp: string;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    open: "bg-sky-950 border-sky-700/50 text-sky-300",
    investigating: "bg-amber-950 border-amber-700/50 text-amber-300",
    escalated: "bg-red-950 border-red-700/50 text-red-300",
    resolved: "bg-emerald-950 border-emerald-700/50 text-emerald-300",
  };
  return map[status] || "bg-slate-900 border-slate-700 text-slate-300";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const indicatorIcons: Record<string, React.ElementType> = {
  ip: Network,
  domain: Globe,
  url: Link2,
  email: AtSign,
};

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const caseId = params.caseId;

  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatMemory, setChatMemory] = useState<boolean | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!caseId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load case.");
        } else {
          setData(json);
        }
      } catch {
        setError("Network error while loading the case.");
      } finally {
        setLoading(false);
      }
    })();
  }, [caseId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!caseId) return;
    (async () => {
      try {
        const res = await fetch(`/api/chat?caseId=${encodeURIComponent(caseId)}`);
        const json = await res.json();
        if (res.ok && json.messages) {
          const loaded = (json.messages as ChatMessage[]).map((m) => ({
            id: m.id,
            sender: m.sender === "user" ? ("user" as const) : ("sakhi" as const),
            text: m.text,
            timestamp: m.timestamp,
          }));
          if (loaded.length > 0) setChatMessages(loaded);
          setChatMemory(true);
        }
      } catch {
        /* history is optional */
      }
    })();
  }, [caseId]);

  const copyCaseNumber = async () => {
    if (!data?.case.caseNumber) return;
    await navigator.clipboard.writeText(data.case.caseNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadReport = async (format: "text" = "text") => {
    if (!caseId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cases/${encodeURIComponent(caseId)}/report?format=${format}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to generate report.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cyber-sakhi-report-${data?.case.caseNumber || caseId}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download the report.");
    } finally {
      setDownloading(false);
    }
  };

  const deleteCase = async () => {
    if (!caseId) return;
    if (!window.confirm("Delete this case and all linked evidence, reports and indicators?")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/cases");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to delete case.");
      }
    } catch {
      setError("Network error while deleting the case.");
    } finally {
      setDeleting(false);
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !caseId || chatSending) return;

    setChatSending(true);
    setChatMessages((prev) => [
      ...prev,
      {
        id: "user_" + Date.now(),
        sender: "user",
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setChatInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, language: "en", caseId }),
      });
      const json = await res.json();
      if (res.ok) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: json.id || "sakhi_" + Date.now(),
            sender: "sakhi",
            text: json.text,
            timestamp: json.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setChatMemory(json.context?.memoryPersisted ?? null);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: "sakhi_err_" + Date.now(),
            sender: "sakhi",
            text: json.error || "Sakhi could not respond. Please try again.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: "sakhi_err_" + Date.now(),
          sender: "sakhi",
          text: "Network error. Sakhi could not respond.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center animate-in fade-in">
        <Loader2 className="w-6 h-6 text-emergency-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 rounded-3xl glass-panel border-red-500/40 text-center space-y-4 animate-in zoom-in-95">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Case unavailable</h2>
        <p className="text-xs text-slate-400">{error || "This case could not be loaded."}</p>
        <Link
          href="/cases"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Cases
        </Link>
      </div>
    );
  }

  const kase = data.case;
  const analysis = data.investigations?.[0]?.analysis as
    | (Record<string, any> & {
        authentication?: { spf?: any; dkim?: any; dmarc?: any };
        smtpPath?: Array<{ from?: string; by?: string; ip?: string }>;
        smtpAnomalies?: Array<{
          type: string;
          severity: string;
          description: string;
        }>;
        attachments?: Array<{
          filename: string;
          extension?: string;
          mimeType?: string;
          suspicious: boolean;
          executable?: boolean;
          scriptLike?: boolean;
          archive?: boolean;
          macroHint?: boolean;
          doubleExtension?: boolean;
        }>;
        entities?: Array<{ type: string; value: string; extraction: string }>;
        originatingIP?: string;
        threatScore?: number;
        threatLevel?: string;
        verdict?: {
          level?: string;
          summary?: string;
          confidence?: number;
          contributingSignals?: string[];
        };
        scoreBreakdown?: {
          total?: number;
          max?: number;
          confidence?: number;
          groups?: Array<{ group: string; points: number; reason: string }>;
        };
        structuredFindings?: Array<{
          id: string;
          category: string;
          severity: string;
          confidence: number;
          description: string;
          humanExplanation: string;
        }>;
        findings?: string[];
        recommendations?: string[];
      })
    | null
    | undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href="/cases"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emergency-300 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to My Cases
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReport("text")}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Download Report
          </button>
          <button
            onClick={deleteCase}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950 border border-red-700/50 text-red-300 text-xs font-bold transition hover:bg-red-900 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Delete Case
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <EyebrowBadge icon={FolderOpen}>
          <span>Investigation Case</span>
        </EyebrowBadge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white break-words">
          {kase.title || "Untitled case"}
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl">{kase.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <SectionHeader title="Case Overview" icon={FolderOpen} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={copyCaseNumber}
                className="inline-flex items-center gap-2 font-mono text-emergency-300 bg-emergency-950/40 border border-emergency-800/40 px-3 py-2 rounded-xl hover:border-emergency-600 transition"
                title="Copy Case Number"
              >
                {kase.caseNumber}
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <ThreatBadge severity={(kase.severity as any) || "LOW"} size="sm" />
              <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase ${statusColor(kase.status || "open")}`}>
                {kase.status || "open"}
              </span>
              {kase.threatType && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-mono uppercase">
                  {kase.threatType}
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-500">
              Created {formatDate(kase.createdAt)}
              {kase.updatedAt ? ` · Updated ${formatDate(kase.updatedAt)}` : ""}
            </div>
          </div>

          {analysis && (
            <>
              <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                <SectionHeader title="Threat Assessment" icon={ShieldAlert} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase">Threat Level</div>
                    <div className="text-lg font-black text-white">{analysis.threatLevel || "N/A"}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase">Risk Score</div>
                    <div className="text-lg font-black text-white">
                      {analysis.threatScore != null ? `${analysis.threatScore}/100` : "N/A"}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase">Spoofing</div>
                    <div className={`text-lg font-black ${analysis.senderSpoofingDetected ? "text-red-400" : "text-emerald-400"}`}>
                      {analysis.senderSpoofingDetected ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">Sender Domain</div>
                    <div className="font-mono text-slate-200 truncate">{analysis.senderDomain || "N/A"}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">Originating IP</div>
                    <div className="font-mono text-slate-200 truncate">{analysis.originatingIP || "N/A"}</div>
                  </div>
                </div>

                {analysis.authentication && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {(["spf", "dkim", "dmarc"] as const).map((proto) => {
                      const st = analysis.authentication?.[proto]?.status || "none";
                      const color =
                        st === "pass"
                          ? "text-emerald-300 border-emerald-700/50"
                          : st === "fail"
                          ? "text-red-300 border-red-700/50"
                          : "text-slate-400 border-slate-700";
                      return (
                        <div key={proto} className={`p-2 rounded-lg border bg-black/20 text-[10px] font-bold uppercase ${color}`}>
                          {proto}: {st}
                        </div>
                      );
                    })}
                  </div>
                )}

                {analysis.verdict && (
                  <div className="mt-3 p-3 rounded-xl bg-sky-950/30 border border-sky-800/40">
                    <div className="text-[10px] uppercase text-sky-400 font-bold mb-1">
                      Why this is {analysis.verdict.level || "assessed"} · confidence{" "}
                      {analysis.verdict.confidence != null ? `${Math.round(analysis.verdict.confidence * 100)}%` : "n/a"}
                    </div>
                    <div className="text-[11px] text-slate-200 whitespace-pre-wrap">
                      {analysis.verdict.summary}
                    </div>
                    {analysis.verdict.contributingSignals &&
                      analysis.verdict.contributingSignals.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {analysis.verdict.contributingSignals.map((signal: string, i: number) => (
                            <li key={i} className="text-[10px] text-slate-400 flex gap-1.5">
                              <span className="text-sky-500">▸</span>
                              {signal}
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                )}

                {analysis.scoreBreakdown?.groups &&
                  analysis.scoreBreakdown.groups.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">
                        Risk score breakdown (deterministic)
                      </div>
                      <div className="space-y-1.5">
                        {analysis.scoreBreakdown.groups.map((g, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="text-slate-400 flex-1">{g.reason}</span>
                            <span className="font-mono text-emergency-300 shrink-0">+{g.points}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 text-[11px] border-t border-slate-800 pt-1.5">
                          <span className="text-slate-300">Total {analysis.threatScore ?? analysis.scoreBreakdown.total}/100</span>
                          <span className={`font-black ${(analysis.threatScore ?? 0) >= 60 ? "text-red-400" : "text-amber-300"}`}>
                            {analysis.threatLevel || "UNKNOWN"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {analysis.structuredFindings && analysis.structuredFindings.length > 0 && (
                <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                  <SectionHeader title="Evidence-Backed Findings" icon={ShieldAlert} />
                  <div className="space-y-1.5">
                    {analysis.structuredFindings.map((f) => (
                      <div
                        key={f.id}
                        className={`p-3 rounded-xl border text-[11px] ${
                          f.severity === "HIGH"
                            ? "bg-red-950/30 border-red-700/40"
                            : f.severity === "MEDIUM"
                            ? "bg-amber-950/30 border-amber-700/40"
                            : "bg-slate-900/60 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              f.severity === "HIGH"
                                ? "bg-red-900/60 text-red-300"
                                : f.severity === "MEDIUM"
                                ? "bg-amber-900/60 text-amber-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="text-slate-300 font-semibold">{f.category}</span>
                          <span className="ml-auto text-[9px] text-slate-500">
                            conf {Math.round(f.confidence * 100)}%
                          </span>
                        </div>
                        <div className="mt-1.5 text-slate-300">{f.description}</div>
                        <div className="mt-1 text-slate-500">{f.humanExplanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.smtpAnomalies && analysis.smtpAnomalies.length > 0 && (
                <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                  <SectionHeader title="SMTP Relay Anomalies" icon={Network} />
                  <div className="space-y-1.5">
                    {analysis.smtpAnomalies.map((a, i) => (
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
                        <span className="font-mono uppercase text-[9px] opacity-70">{a.type.replace(/_/g, " ")}</span>
                        <div>{a.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.attachments && analysis.attachments.length > 0 && (
                <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                  <SectionHeader title="Attachment Structure Analysis" icon={FileText} />
                  <div className="space-y-1.5">
                    {analysis.attachments.map((a, i) => (
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
                            <span className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 text-[9px] font-bold">SUSPICIOUS</span>
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

              {analysis.entities && analysis.entities.length > 0 && (
                <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                  <SectionHeader title="Signal Extraction" icon={Link2} />
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.entities.map((e, i) => (
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
                    Pattern-based extraction. It flags content types; it does not confirm any
                    organization or number actually sent this email.
                  </div>
                </div>
              )}

              <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
                <SectionHeader title="Findings & Recommendations" icon={Shield} />
                <div className="text-xs text-slate-400">{data.investigations[0]?.subject || "Subject unavailable"}</div>
                <details open={!analysis.findings || analysis.findings.length <= 5}>
                  <summary className="text-xs font-semibold text-slate-400 cursor-pointer py-1">
                    Findings ({analysis.findings?.length || 0})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {(analysis.findings || []).map((finding: string, i: number) => (
                      <div key={i} className="text-[11px] text-slate-300 bg-slate-900/70 rounded-lg px-3 py-2">
                        {finding}
                      </div>
                    ))}
                  </div>
                </details>
                {analysis.recommendations && analysis.recommendations.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-slate-400 pt-2">Recommendations</div>
                    <div className="space-y-1.5">
                      {analysis.recommendations.map((rec: string, i: number) => (
                        <div key={i} className="text-[11px] text-emergency-200 bg-emergency-950/30 border border-emergency-800/30 rounded-lg px-3 py-2">
                          • {rec}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <SectionHeader title="Extracted Indicators" icon={Link2} />
            {data.indicators.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No indicators recovered for this case.</div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {data.indicators.map((ind) => {
                  const Icon = indicatorIcons[ind.type] || Link2;
                  return (
                    <div key={ind.id} className="flex items-start gap-2 py-1.5 border-b border-slate-800/50 last:border-0 text-[11px]">
                      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <span className="font-mono text-slate-300 flex-1 break-all">{ind.value}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase text-[9px] font-bold shrink-0">
                        {ind.type}
                      </span>
                      {ind.malicious && (
                        <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-700/50 text-red-300 text-[9px] font-bold shrink-0">
                          SUSPICIOUS
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <SectionHeader title="Linked Evidence & Reports" icon={FileText} />
            <div className="text-xs font-semibold text-slate-400">Evidence</div>
            {data.evidence.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic">
                No evidence is linked to this case yet. Save the email to the Evidence Locker and it will be linked here.
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.evidence.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2 text-[11px] bg-slate-900/60 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-300 flex-1 truncate">{ev.title}</span>
                    <span className="font-mono text-slate-500">{ev.evidence_code || "EVIDENCE"}</span>
                    <span className="font-mono text-[9px] text-slate-600">{ev.sha256?.substring(0, 12)}…</span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs font-semibold text-slate-400 pt-2">Reports</div>
            {data.reports.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic">
                No reports generated yet. Use "Download Report" to create and archive one.
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.reports.map((rep) => (
                  <div key={rep.id} className="flex items-center gap-2 text-[11px] bg-slate-900/60 rounded-lg px-3 py-2">
                    <FileText className="w-3.5 h-3.5 text-emergency-400 shrink-0" />
                    <span className="text-slate-300 flex-1 truncate">{rep.title}</span>
                    <span className="text-slate-500">{formatDate(rep.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <SectionHeader title="Ask Sakhi (case-aware)" icon={MessageSquare} />
            <div className="h-72 overflow-y-auto space-y-2 custom-scrollbar-thin pr-1">
              {chatMessages.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic py-6 text-center px-4">
                  Ask Sakhi about this case — verdict explanation, next steps, how to report,
                  or how to preserve evidence. Your conversation stays scoped to this case.
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`max-w-[90%] rounded-xl px-3 py-2 text-[11px] whitespace-pre-wrap break-words ${
                      msg.sender === "user"
                        ? "ml-auto bg-emergency-600 text-white"
                        : msg.text.startsWith("Network error") || msg.text.includes("could not respond")
                        ? "bg-red-950 border border-red-700/50 text-red-200"
                        : "bg-slate-900 border border-slate-800 text-slate-200"
                    }`}
                  >
                    {msg.text}
                    <div className={`mt-1 text-[9px] ${msg.sender === "user" ? "text-emergency-200" : "text-slate-500"} opacity-70`}>
                      {msg.timestamp}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {chatMemory !== null && (
              <div className="text-[10px] text-slate-600">
                {chatMemory
                  ? "Conversation memory is scoped to this case."
                  : "Conversation memory could not be persisted (DB migration pending)."}
              </div>
            )}

            <form onSubmit={sendChat} className="flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this case..."
                className="flex-1 rounded-xl bg-[#0a0a16] border border-slate-700/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emergency-500"
              />
              <button
                type="submit"
                disabled={chatSending || !chatInput.trim()}
                className="p-2 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white disabled:opacity-50 transition"
              >
                {chatSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>

          <div className="p-5 rounded-2xl glass-panel border-emergency-900/30 space-y-3">
            <SectionHeader title="Reporting Checklist" icon={Mail} />
            <ol className="list-decimal list-inside space-y-2 text-[11px] text-slate-300">
              <li>Download the forensic report and save it to the Evidence Locker.</li>
              <li>Preserve the original raw email — do not delete or forward it.</li>
              <li>
                File a complaint on{" "}
                <a
                  href="https://cybercrime.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emergency-300 underline"
                >
                  cybercrime.gov.in
                </a>{" "}
                and quote Case Number <span className="font-mono text-emergency-300">{kase.caseNumber}</span>.
              </li>
              <li>For financial fraud, call the National Cyber Helpline 1930.</li>
            </ol>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(239, 68, 68, 0.25);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
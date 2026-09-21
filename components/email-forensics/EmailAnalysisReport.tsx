"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Mail,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  AlertCircle,
  Search,
  Lock,
  Network,
  FileText,
  Info,
  Loader2,
  ArrowRight,
  FolderOpen,
  Fingerprint,
  Globe,
  Link2,
  Server,
  MapPin,
  Bell,
  Target,
  AlertOctagon,
  FileSearch,
  BrainCircuit,
  ExternalLink,
  AtSign,
  Minus,
  Eye,
  XCircle,
  Shield,
  RotateCcw,
} from "lucide-react";
import type {
  EmailAnalysisResult,
  AuthenticationResult,
  RiskDimensionAssessment,
  ForensicFinding,
  ThreatIndicator,
  SuspicionReason,
} from "@/lib/emailTypes";
import { authVerdictPresentation } from "@/lib/riskAssessments";
import type { InvestigationGraph } from "@/lib/graph";

import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InfoModal } from "@/components/ui/InfoModal";

// ---------------------------------------------------------------------------
// Presentation constants (careful, honest labels — no standalone
// "Social Engineering" module, signals live under Content Risk / findings).
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<string, string> = {
  SAFE: "bg-emerald-950/70 border-emerald-700/50 text-emerald-300",
  LOW: "bg-sky-950/70 border-sky-700/50 text-sky-300",
  MEDIUM: "bg-amber-950/70 border-amber-700/50 text-amber-300",
  HIGH: "bg-orange-950/70 border-orange-700/50 text-orange-300",
  CRITICAL: "bg-red-950/70 border-red-700/50 text-red-300",
};

const THREAT_TEXT: Record<string, string> = {
  SAFE: "text-emerald-300",
  LOW: "text-sky-300",
  MEDIUM: "text-amber-300",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTHENTICATION: "Authentication",
  SENDER_SPOOFING: "Sender Identity",
  DOMAIN: "Domain",
  IP: "Sending Host",
  SMTP_ROUTING: "SMTP Routing",
  URL: "Links",
  ATTACHMENT: "Attachments",
  NLP_SOCIAL_ENGINEERING: "Content Patterns",
  THREAT_INTELLIGENCE: "Threat Intelligence",
  ANOMALY: "Anomalies",
};

const SEVERITY_ORDER: ForensicFinding["severity"][] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "SAFE",
];

type ModalKey =
  | "overall"
  | "sender"
  | "content"
  | "reasoning"
  | "auth"
  | "findings"
  | "smtp"
  | "signals"
  | "validation"
  | "correlation"
  | "domain"
  | "links"
  | "evidence"
  | "alerts";

// ---------------------------------------------------------------------------
// Small presentational primitives
// ---------------------------------------------------------------------------

function SeverityChip({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
        SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.LOW
      }`}
    >
      {severity}
    </span>
  );
}

function DataRow({
  label,
  value,
  mono = false,
  missing = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  missing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:gap-3">
      <span className="w-36 shrink-0 font-semibold text-slate-400">{label}</span>
      {value ? (
        <span
          className={`min-w-0 flex-1 break-words text-slate-200 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
      ) : (
        <span className="flex items-center gap-1 italic text-slate-500">
          <Minus className="h-3 w-3" />
          {missing ? "Not present in input" : "Not found"}
        </span>
      )}
    </div>
  );
}

function ToneChip({ tone, label }: { tone: "pass" | "fail" | "warn" | "neutral" | "unknown"; label: string }) {
  const tones: Record<string, string> = {
    pass: "bg-emerald-950/70 border-emerald-700/50 text-emerald-300",
    fail: "bg-red-950/70 border-red-700/50 text-red-300",
    warn: "bg-amber-950/70 border-amber-700/50 text-amber-300",
    neutral: "bg-slate-800 border-slate-600 text-slate-300",
    unknown: "bg-slate-900 border-slate-700 text-slate-400",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function AuthChip({
  auth,
  label,
}: {
  auth: AuthenticationResult;
  label: string;
}) {
  const present = authVerdictPresentation(auth.rawStatus ?? auth.status);
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <div className="mt-1.5">
        <ToneChip tone={present.tone} label={present.label} />
      </div>
      <div className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
        {auth.details || "No details in Authentication-Results header."}
      </div>
    </div>
  );
}

function SignalsPanel({ dimension }: { dimension?: RiskDimensionAssessment }) {
  if (!dimension) {
    return <p className="text-xs italic text-slate-500">Assessment unavailable for this run.</p>;
  }
  if (dimension.signals.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        No risk signals detected in this dimension.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {dimension.signals.map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <div className="flex items-start gap-2">
            <SeverityChip severity={s.severity} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-200">{s.label}</div>
              {s.detail ? (
                <div className="mt-0.5 break-words text-[10px] text-slate-400">{s.detail}</div>
              ) : null}
            </div>
          </div>
          {s.evidenceRef ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500">
              <FileSearch className="h-3 w-3" />
              Evidence: {s.evidenceRef}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: ForensicFinding }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeverityChip severity={finding.severity} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {CATEGORY_LABELS[finding.category] ?? finding.category}
          </span>
        </div>
        <span className="font-mono text-[9px] text-slate-500">{finding.id}</span>
      </div>

      <p className="text-xs font-semibold text-slate-100">{finding.description}</p>

      <p className="text-[10px] leading-relaxed text-slate-400">{finding.humanExplanation}</p>

      <details className="group">
        <summary className="flex items-center gap-1.5 cursor-pointer text-[9px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 list-none">
          <ArrowRight className="h-2.5 w-2.5 group-open:rotate-90 transition-transform" />
          Technical evidence
        </summary>
        <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
          {finding.technicalEvidence}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
        <span>
          Confidence{" "}
          <span className="font-bold text-slate-300">
            {Math.round(finding.confidence * 100)}%
          </span>
        </span>
        {finding.validationStatus ? (
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emergency-400" />
            {finding.validationStatus}
          </span>
        ) : null}
      </div>

      {finding.benignExplanation ? (
        <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-400">
          <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
          <span>
            <span className="font-semibold text-slate-300">Could also be: </span>
            {finding.benignExplanation}
          </span>
        </div>
      ) : null}

      <div className="flex items-start gap-2 rounded-lg border border-emergency-800/40 bg-emergency-950/30 p-2 text-[10px] leading-relaxed text-emergency-200">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{finding.recommendedAction}</span>
      </div>
    </div>
  );
}

function IndicatorRow({ indicator }: { indicator: ThreatIndicator }) {
  const iconMap: Record<ThreatIndicator["type"], React.ElementType> = {
    ip: Server,
    domain: Globe,
    url: Link2,
    email: AtSign,
  };
  const Icon = iconMap[indicator.type];
  return (
    <div className="flex items-start gap-2 py-1.5 text-xs">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <span className="break-all font-mono text-slate-200">{indicator.value}</span>
        <span className="ml-2 text-[10px] text-slate-500">{indicator.source}</span>
      </div>
      {indicator.malicious ? (
        <SeverityChip severity="HIGH" />
      ) : indicator.validation?.state === "match" ? (
        <SeverityChip severity="MEDIUM" />
      ) : null}
      {indicator.validation ? (
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            indicator.validation.state === "match"
              ? "border-red-700/50 bg-red-950/70 text-red-300"
              : indicator.validation.state === "checked-no-match"
              ? "border-emerald-700/50 bg-emerald-950/70 text-emerald-300"
              : indicator.validation.state === "conflicting"
              ? "border-amber-700/50 bg-amber-950/70 text-amber-300"
              : "border-slate-700 bg-slate-900 text-slate-400"
          }`}
        >
          {indicator.validation.label}
        </span>
      ) : null}
    </div>
  );
}

function SuspicionItem({ reason }: { reason: SuspicionReason }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-start gap-2">
        <SeverityChip severity={reason.severity} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-100">{reason.headline}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
            {reason.category}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{reason.detail}</p>
      {reason.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reason.evidence.map((e, i) => (
            <span
              key={i}
              className="rounded-md bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
            >
              {e}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GraphSummary({ graph }: { graph?: InvestigationGraph }) {
  if (!graph || graph.nodes.length === 0) return null;
  const nodesByKind = graph.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {});
  const edgesByKind = graph.edges.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        Deterministic entity/edge map of this investigation ({graph.nodes.length} nodes,
        {graph.edges.length} edges).
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(nodesByKind).map(([k, n]) => (
          <span key={k} className="text-[10px] text-slate-400">
            <span className="font-bold text-slate-200">{n}</span> {k}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(edgesByKind).map(([k, n]) => (
          <span key={k} className="text-[10px] text-slate-500">
            <span className="font-bold text-slate-300">{n}</span> {k}
          </span>
        ))}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Entities
        </div>
        <div className="flex flex-wrap gap-1.5">
          {graph.nodes.map((n) => (
            <span
              key={n.id}
              className="rounded-md border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-300"
            >
              {n.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal bodies
// ---------------------------------------------------------------------------

function DimensionModalBody({
  title,
  dimension,
  summaryLabel,
}: {
  title: string;
  dimension?: RiskDimensionAssessment;
  summaryLabel: string;
}) {
  if (!dimension) {
    return <p className="text-xs italic text-slate-500">This assessment is unavailable for the current run.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{summaryLabel}</div>
          <div className={`text-2xl font-black ${THREAT_TEXT[dimension.level]}`}>{dimension.level}</div>
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Score</span>
            <span className="font-bold text-slate-200">{dimension.score}/100</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${
                dimension.score >= 65
                  ? "bg-red-500"
                  : dimension.score >= 40
                  ? "bg-amber-500"
                  : dimension.score >= 20
                  ? "bg-sky-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${dimension.score}%` }}
            />
          </div>
          <div className="mt-1 text-[9px] text-slate-500">
            Derived confidence{" "}
            {Math.round(dimension.confidence * 100)}% — grounded only in signals actually detected.
          </div>
        </div>
      </div>
      <p className="rounded-lg bg-slate-950/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
        {dimension.summary}
      </p>
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Signals ({dimension.signals.length})
        </div>
        <SignalsPanel dimension={dimension} />
      </div>
    </div>
  );
}

function SenderModalBody({ result }: { result: EmailAnalysisResult }) {
  const spoof = result.spoofing;
  return (
    <div className="space-y-4">
      <DimensionModalBody title="Sender" dimension={result.senderRisk} summaryLabel="Sender Risk" />

      <SectionHeader title="Identity & Addressing" icon={Fingerprint} />
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <DataRow label="From" value={result.headers.from} />
        <DataRow label="Reply-To" value={result.headers.replyTo} />
        <DataRow label="Return-Path" value={result.headers.returnPath} missing />
        <DataRow label="Sender domain" value={result.senderDomain} mono />
        <DataRow label="Message-ID" value={result.headers.messageId} mono />
        <DataRow label="DKIM signature" value={result.headers.dkimSignature ? "Present" : undefined} />
      </div>

      {spoof ? (
        <div className="space-y-2">
          <SectionHeader title="Spoofing Analysis" icon={ShieldAlert} />
          <div className="flex flex-wrap gap-2">
            {spoof.lookalikeCandidates.map((c) => (
              <span
                key={c.domain}
                className="rounded-md border border-amber-700/50 bg-amber-950/60 px-2 py-1 text-[10px] text-amber-200"
              >
                {c.domain} looks like {c.looksLike}
              </span>
            ))}
            {spoof.brandsLikelyImpersonated.map((b) => (
              <span
                key={b}
                className="rounded-md border border-amber-700/50 bg-amber-950/60 px-2 py-1 text-[10px] text-amber-200"
              >
                impersonates: {b}
              </span>
            ))}
            {spoof.punycodeDetected && <SeverityChip severity="HIGH" />}
            {spoof.homoglyphDetected && <SeverityChip severity="HIGH" />}
            {spoof.envelopeMismatchDetected && <SeverityChip severity="HIGH" />}
          </div>
          <div className="space-y-1.5">
            {spoof.signals.map((s, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-950/60 p-2 text-[10px] text-slate-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                {s}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.domainIntelligence || result.rdap ? (
        <div className="space-y-2">
          <SectionHeader title="Domain Intelligence" icon={Globe} />
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <DataRow label="Domain" value={result.senderDomain} mono />
            {result.domainIntelligence ? (
              <>
                <DataRow label="MX" value={result.domainIntelligence.mx?.join(", ")} mono />
                <DataRow label="NS" value={result.domainIntelligence.ns?.join(", ")} mono />
              </>
            ) : null}
            {result.rdap ? (
              <>
                <DataRow label="Registrar" value={result.rdap.registrar} />
                <DataRow label="Registered" value={result.rdap.created} />
                <DataRow label="Age (days)" value={result.rdap.ageDays != null ? String(result.rdap.ageDays) : undefined} />
                <DataRow label="Registrant" value={result.rdap.registrantName} />
              </>
            ) : null}
          </div>
          {result.rdap?.fraudSignals?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {result.rdap.fraudSignals.map((s, i) => (
                <SeverityChip key={i} severity="MEDIUM" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {result.originatingIP ? (
        <div className="space-y-2">
          <SectionHeader title="Sending Host" icon={Server} />
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <DataRow label="Originating IP" value={result.originatingIP} mono />
            {result.ipIntelligence ? (
              <>
                <DataRow label="Country" value={result.ipIntelligence.country} />
                <DataRow label="Region" value={result.ipIntelligence.region} />
                <DataRow label="City" value={result.ipIntelligence.city} />
                <DataRow label="ISP / Org" value={`${result.ipIntelligence.isp ?? ""} ${result.ipIntelligence.organization ?? ""}`.trim() || undefined} />
                <DataRow label="ASN" value={result.ipIntelligence.asn} mono />
              </>
            ) : null}
            {result.ipProxy && result.ipProxy.kind !== "none" ? (
              <div className="mt-1 rounded-lg border border-amber-700/50 bg-amber-950/60 p-2 text-[10px] text-amber-200">
                {result.ipProxy.kind === "tor"
                  ? "Originating IP is a Tor exit node."
                  : `Originating IP carries ${result.ipProxy.kind} markers.`}
                <div className="mt-0.5 text-[9px] text-amber-300/70">{result.ipProxy.note}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="flex items-start gap-2 rounded-lg bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Sender risk is scored only from sender-identity and sending-host evidence. Suspicious content
        never changes the sender verdict, and vice versa.
      </p>
    </div>
  );
}

function ContentModalBody({ result }: { result: EmailAnalysisResult }) {
  const urls = result.urlRisk ?? [];
  const attachments = result.attachments ?? [];
  return (
    <div className="space-y-4">
      <DimensionModalBody title="Content" dimension={result.contentRisk} summaryLabel="Content Risk" />

      {result.ml?.available ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Trained ML classifier
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">
              “{result.ml.label ?? "n/a"}”
            </span>
            {result.ml.confidence != null ? (
              <SeverityChip severity={result.ml.label && result.ml.label !== "legitimate" ? "HIGH" : "SAFE"} />
            ) : null}
          </div>
          {result.ml.probabilities ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(result.ml.probabilities).map(([k, v]) => (
                <span key={k} className="text-[10px] text-slate-400">
                  {k} <span className="font-bold text-slate-200">{Math.round(v * 100)}%</span>
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            The classifier is a statistical corroborating signal, never a standalone verdict.
          </p>
        </div>
      ) : result.ml && !result.ml.available ? (
        <p className="rounded-lg bg-slate-950/60 p-2 text-[10px] text-slate-500">
          ML classifier unavailable at runtime: {result.ml.unavailableReason ?? "no trained artifact"}.
        </p>
      ) : null}

      {result.bec?.detected ? (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Business Email Compromise behavioural profile
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">{result.bec.summary}</p>
          <p className="mt-1 text-[10px] text-amber-200/60">{result.bec.caveat}</p>
        </div>
      ) : null}

      {result.language ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Language analysis (supporting signal)
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">{result.language.script}</span>
            {result.language.hints.map((h, i) => (
              <span key={i} className="rounded-md bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-400">
                {h}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{result.language.caveat}</p>
        </div>
      ) : null}

      <SectionHeader title="Embedded Links" icon={Link2} />
      {urls.length === 0 ? (
        <p className="text-xs italic text-slate-500">No URLs found in the message.</p>
      ) : (
        <div className="space-y-1.5">
          {urls.map((u, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <div className="flex items-center gap-2">
                <SeverityChip severity={u.severity} />
                <span className="min-w-0 flex-1 break-all font-mono text-[10px] text-slate-200">{u.url}</span>
              </div>
              {u.flags.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.flags.map((f, j) => (
                    <span key={j} className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-400">
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-1 text-[9px] text-slate-500">{u.evidence}</div>
            </div>
          ))}
          <p className="text-[9px] text-slate-600">
            Links are inspected by shape only and are never opened or followed.
          </p>
        </div>
      )}

      <SectionHeader title="Attachments" icon={FileText} />
      {attachments.length === 0 ? (
        <p className="text-xs italic text-slate-500">No attachments detected.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((a, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <div className="flex items-center gap-2">
                {a.suspicious ? <SeverityChip severity={a.executable ? "CRITICAL" : "HIGH"} /> : <SeverityChip severity="SAFE" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-200">{a.filename}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-slate-500">
                <span>{a.extension || "no ext"}</span>
                <span>{a.mimeType || "unknown mime"}</span>
                {a.doubleExtension && <span className="text-red-300">double-extension</span>}
                {a.executable && <span className="text-red-300">executable</span>}
                {a.scriptLike && <span className="text-red-300">script-like</span>}
                {a.archive && <span>archive</span>}
                {a.macroHint && <span className="text-amber-300">macro-enabled</span>}
              </div>
            </div>
          ))}
          <p className="text-[9px] text-slate-600">
            Attachment contents are never decoded — only structural markers are inspected.
          </p>
        </div>
      )}
    </div>
  );
}

function ReasoningModalBody({ result }: { result: EmailAnalysisResult }) {
  const reasons = result.suspicionReasons ?? [];
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-400">
        Why Cyber Sakhi reached its overall assessment. Every headline links to the evidence that
        supports it; a signal is never presented as proof.
      </p>
      {reasons.length === 0 ? (
        <p className="text-xs italic text-slate-500">No suspicion reasoning available.</p>
      ) : (
        reasons.map((r, i) => <SuspicionItem key={i} reason={r} />)
      )}
    </div>
  );
}

function AuthModalBody({ result }: { result: EmailAnalysisResult }) {
  const auth = result.authentication;
  const dns = result.dnsAuth;
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-sky-900/50 bg-sky-950/30 p-2 text-[10px] leading-relaxed text-sky-200">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        A passing check authenticates the sending server&apos;s allowed identity and integrity — it does
        not make the message content trustworthy. Failed checks are strong signals, never proof of
        fraud on their own.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <AuthChip auth={auth.spf} label="SPF" />
        <AuthChip auth={auth.dkim} label="DKIM" />
        <AuthChip auth={auth.dmarc} label="DMARC" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <SectionHeader title="Header Scope" icon={Mail} />
        <DataRow label="header.from" value={auth.spf.scope?.fromDomain} mono />
        <DataRow label="mailfrom" value={auth.spf.scope?.mailfrom} mono />
        <DataRow label="header.d" value={auth.spf.scope?.headerD} mono />
        <DataRow label="client-ip" value={auth.spf.scope?.clientIp} mono />
        <DataRow label="policy" value={auth.spf.scope?.policy} mono />
        <DataRow label="disposition" value={auth.spf.scope?.disposition} mono />
        <DataRow label="selector" value={auth.spf.scope?.selector} mono />
      </div>

      {dns ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <SectionHeader title="DNS Re-Verification" icon={ShieldCheck} />
          <div className="space-y-1.5 text-[11px]">
            <p className="text-slate-400">
              <span className="font-semibold text-slate-200">SPF:</span> {dns.spf.status}
              {dns.spf.headerVerdictMismatch ? (
                <span className="ml-2 text-amber-300">(conflicts with header)</span>
              ) : null}
            </p>
            <p className="text-slate-400">
              <span className="font-semibold text-slate-200">DKIM:</span>{" "}
              {dns.dkim.checked
                ? dns.dkim.keyPublished
                  ? `key published (selector ${dns.dkim.selector ?? "n/a"})`
                  : "no published key for the claimed selector"
                : "not checked"}
            </p>
            <p className="text-slate-400">
              <span className="font-semibold text-slate-200">DMARC:</span> {dns.dmarc.status}
              {dns.dmarc.headerVerdictMismatch ? (
                <span className="ml-2 text-amber-300">(conflicts with header)</span>
              ) : null}
            </p>
            <p className="border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
              Cyber Sakhi queried the published DNS policy independently (over HTTPS); it never
              trusts the header alone.
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-950/60 p-2 text-[10px] text-slate-500">
          Independent DNS re-verification was unavailable for this run — the header verdicts above
          are reported as submitted.
        </p>
      )}
    </div>
  );
}

function FindingsModalBody({ result }: { result: EmailAnalysisResult }) {
  const findings = result.structuredFindings ?? [];
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {SEVERITY_ORDER.filter((s) => counts[s]).map((s) => (
          <span
            key={s}
            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[s]}`}
          >
            {counts[s]} {s}
          </span>
        ))}
      </div>
      {findings.length === 0 ? (
        <p className="text-xs italic text-slate-500">No structured findings.</p>
      ) : (
        findings.map((f) => <FindingCard key={f.id} finding={f} />)
      )}
      <p className="flex items-start gap-2 rounded-lg bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Findings are de-duplicated and carry stable identifiers (INSEQ). Each finding separates the
        observation from its interpretation, explicit validation status, and a possible benign
        explanation — nothing here is a standalone verdict.
      </p>
    </div>
  );
}

function SmtpModalBody({ result }: { result: EmailAnalysisResult }) {
  const anomalies = result.smtpAnomalies ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Received Path" icon={Server} />
      {result.smtpPath.length === 0 ? (
        <p className="text-xs italic text-slate-500">No Received headers to reconstruct a path from.</p>
      ) : (
        <div className="space-y-1">
          {result.smtpPath.map((hop, i) => {
            const isLast = i === result.smtpPath.length - 1;
            return (
              <div key={i} className="relative pl-6">
                {!isLast && <div className="absolute left-2.5 top-5 bottom-0 w-px bg-slate-700" />}
                <div
                  className={`absolute left-0 top-1.5 h-5 w-5 rounded-full border flex items-center justify-center text-[9px] font-bold ${
                    isLast ? "border-amber-600 bg-amber-950 text-amber-300" : "border-slate-600 bg-slate-800 text-slate-400"
                  }`}
                >
                  {result.smtpPath.length - i}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-[10px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {hop.ip ? (
                      <span className="font-mono text-emergency-300">{hop.ip}</span>
                    ) : null}
                    {hop.from && <span className="font-mono text-slate-400">from {hop.from}</span>}
                    {hop.by && <span className="font-mono text-slate-400">by {hop.by}</span>}
                    {hop.timestamp && <span className="text-slate-500">{hop.timestamp}</span>}
                  </div>
                  <div className="mt-1 break-all font-mono text-[9px] text-slate-600">{hop.raw}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionHeader title="Relay Anomalies" icon={AlertTriangle} />
      {anomalies.length === 0 ? (
        <p className="text-xs italic text-slate-500">No relay anomalies detected.</p>
      ) : (
        <div className="space-y-1.5">
          {anomalies.map((a, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center gap-2">
                <SeverityChip severity={a.severity} />
                <span className="text-[11px] font-semibold text-slate-200">{a.description}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">{a.evidence}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalsModalBody({ result }: { result: EmailAnalysisResult }) {
  const entities = result.entities ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title={`Threat Indicators (${result.indicators.length})`} icon={Target} />
      {result.indicators.length === 0 ? (
        <p className="text-xs italic text-slate-500">No indicators extracted.</p>
      ) : (
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50 px-3">
          {result.indicators.map((ind, i) => (
            <IndicatorRow key={i} indicator={ind} />
          ))}
        </div>
      )}

      <SectionHeader title={`Extracted Entities (${entities.length})`} icon={Fingerprint} />
      {entities.length === 0 ? (
        <p className="text-xs italic text-slate-500">No structured entities extracted.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entities.map((e, i) => (
            <span
              key={i}
              className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300"
            >
              <span className="uppercase tracking-wider text-slate-500">{e.type}: </span>
              <span className="font-mono">{e.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationModalBody({ result }: { result: EmailAnalysisResult }) {
  const stages = result.pipelineStages ?? [];
  const ti = result.threatIntel;
  const rdap = result.rdap;
  return (
    <div className="space-y-4">
      <SectionHeader title="Pipeline Stages" icon={Network} />
      {stages.length === 0 ? (
        <p className="text-xs italic text-slate-500">Pipeline metadata unavailable.</p>
      ) : (
        <div className="space-y-1.5">
          {stages.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center gap-2">
                {s.completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                  {s.name}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{s.description}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.artifacts.map((a, j) => (
                  <span key={j} className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-400">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionHeader title="Blocklist Threat Intelligence" icon={ShieldAlert} />
      {ti ? (
        <div className="space-y-2">
          {ti.ip?.results.filter((r) => r.listed).map((r, i) => (
            <div key={i} className="rounded-lg border border-red-800/50 bg-red-950/40 p-2.5 text-[10px] text-red-200">
              IP listed: {r.source} — {r.code}
              {r.reason ? ` (${r.reason})` : ""}
            </div>
          ))}
          {ti.domain?.results.filter((r) => r.listed).map((r, i) => (
            <div key={i} className="rounded-lg border border-red-800/50 bg-red-950/40 p-2.5 text-[10px] text-red-200">
              Domain listed: {r.source} — {r.code}
              {r.reason ? ` (${r.reason})` : ""}
            </div>
          ))}
          {(ti.ip?.results.some((r) => r.listed) || ti.domain?.results.some((r) => r.listed))
            ? null
            : (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-950/40 p-2 text-[10px] text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Queried blocklists returned no match for the examined IPs/domains.
            </p>
          )}
          <p className="text-[9px] text-slate-600">
            Sources: {ti.providers.join(", ")} (DNS over HTTPS). A hit is corroborating evidence,
            never a verdict.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-950/60 p-2 text-[10px] text-slate-500">
          Blocklist queries were unavailable for this run.
        </p>
      )}

      {rdap ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <SectionHeader title="RDAP Registration" icon={Globe} />
          <DataRow label="Domain" value={rdap.domain} mono />
          <DataRow label="Registrar" value={rdap.registrar} />
          <DataRow label="Created" value={rdap.created} />
          <DataRow label="Age (days)" value={rdap.ageDays != null ? String(rdap.ageDays) : "Unknown"} />
          <DataRow label="Status" value={rdap.status?.join(", ")} />
          {rdap.fraudSignals?.length ? (
            <div className="mt-1 space-y-1">
              {rdap.fraudSignals.map((s, i) => (
                <div key={i} className="rounded-md bg-amber-950/40 px-2 py-1 text-[9px] text-amber-200">
                  {s}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CorrelationModalBody({ result }: { result: EmailAnalysisResult }) {
  const correlations = result.indicatorCorrelations ?? [];
  return (
    <div className="space-y-3">
      {correlations.length === 0 ? (
        <p className="text-xs italic text-slate-500">No indicator correlations produced.</p>
      ) : (
        correlations.map((c, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="flex items-center gap-2">
              <SeverityChip severity={c.risk} />
              <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-200">{c.indicator.value}</span>
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-slate-500">
                {c.indicator.type}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{c.reason}</p>
            {c.relatedFindings.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.relatedFindings.map((f, j) => (
                  <span key={j} className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] text-slate-500">
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function DomainModalBody({ result }: { result: EmailAnalysisResult }) {
  const domains = result.relatedDomainIntelligence ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Sender Domain" icon={Globe} />
      {result.domainIntelligence ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <DataRow label="Domain" value={result.domainIntelligence.domain} mono />
          <DataRow label="MX" value={result.domainIntelligence.mx?.join(", ") || "not found"} mono />
          <DataRow label="NS" value={result.domainIntelligence.ns?.join(", ") || "not found"} mono />
          <DataRow label="Flagged suspicious" value={result.domainIntelligence.suspicious != null ? String(result.domainIntelligence.suspicious) : undefined} />
        </div>
      ) : (
        <p className="text-xs italic text-slate-500">Sender domain intelligence unavailable.</p>
      )}

      {result.rdap ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <SectionHeader title="RDAP Registration" icon={Globe} />
          <DataRow label="Registrar" value={result.rdap.registrar} />
          <DataRow label="Created" value={result.rdap.created} />
          <DataRow label="Expires" value={result.rdap.expires} />
          <DataRow label="Registrant" value={result.rdap.registrantName} />
          <DataRow label="Country" value={result.rdap.registrantCountry} />
          <DataRow label="Nameservers" value={result.rdap.nameservers.join(", ")} mono />
        </div>
      ) : null}

      {domains.length > 0 ? (
        <div className="space-y-2">
          <SectionHeader title="Related Domains" icon={Globe} />
          {domains.map((d, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
              <span className="font-mono text-[11px] text-slate-200">{d.domain}</span>
              {d.suspicious ? <span className="ml-2 text-[9px] text-amber-300">suspicious</span> : null}
              {d.mx?.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.mx.map((mx, j) => (
                    <span key={j} className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{mx}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinksModalBody({ result }: { result: EmailAnalysisResult }) {
  const urls = (result.indicators ?? []).filter((i) => i.type === "url");
  const attachments = result.attachments ?? [];
  return (
    <div className="space-y-4">
      <SectionHeader title={`Links (${urls.length})`} icon={Link2} />
      {urls.length === 0 ? (
        <p className="text-xs italic text-slate-500">No links extracted from the message.</p>
      ) : (
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50 px-3">
          {urls.map((u, i) => (
            <IndicatorRow key={i} indicator={u} />
          ))}
        </div>
      )}
      <SectionHeader title={`Attachments (${attachments.length})`} icon={FileText} />
      {attachments.length === 0 ? (
        <p className="text-xs italic text-slate-500">No attachments detected.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((a, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center gap-2">
                {a.suspicious ? <SeverityChip severity={a.executable ? "CRITICAL" : "HIGH"} /> : <SeverityChip severity="SAFE" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200">{a.filename}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-slate-500">
                <span>{a.extension || "no ext"}</span>
                <span>{a.mimeType || "unknown mime"}</span>
                {a.doubleExtension && <span className="text-red-300">double-extension</span>}
                {a.executable && <span className="text-red-300">executable</span>}
                {a.scriptLike && <span className="text-red-300">script-like</span>}
                {a.archive && <span>archive</span>}
                {a.macroHint && <span className="text-amber-300">macro-enabled</span>}
              </div>
            </div>
          ))}
          <p className="text-[9px] text-slate-600">Structural inspection only — contents are never decoded.</p>
        </div>
      )}
    </div>
  );
}

function EvidenceModalBody({ result }: { result: EmailAnalysisResult }) {
  const privacy = result.privacy;
  return (
    <div className="space-y-4">
      <SectionHeader title="Raw Headers" icon={FileSearch} />
      {result.headers.rawHeaders ? (
        <pre className="whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
          {result.headers.rawHeaders}
        </pre>
      ) : (
        <p className="text-xs italic text-slate-500">No raw headers captured.</p>
      )}

      <SectionHeader title="Privacy Mask" icon={Eye} />
      {privacy ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <DataRow label="Masked subject" value={privacy.maskedSubject} />
          {privacy.maskedBodyPreview ? <DataRow label="Masked body" value={privacy.maskedBodyPreview} /> : null}
          <DataRow label="Redactions" value={privacy.redactions.length ? `${privacy.redactions.length} value(s) masked` : "none"} />
          <DataRow label="Retention" value={privacy.retentionStage} />
          {privacy.retentionExpiresAt ? <DataRow label="Expires" value={new Date(privacy.retentionExpiresAt).toLocaleString()} /> : null}
        </div>
      ) : (
        <p className="text-xs italic text-slate-500">Privacy mask unavailable.</p>
      )}

      {result.attribution ? (
        <div className="space-y-2">
          <SectionHeader title="Attribution (low confidence)" icon={MapPin} />
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            {result.attribution.originRegions.map((r, i) => (
              <DataRow key={i} label={r.region} value={`${r.score}/100 — ${r.rationale}`} />
            ))}
            <DataRow
              label="Scam family"
              value={result.attribution.scamFamily ? String(result.attribution.scamFamily).replace(/-/g, " ") : "none identified"}
            />
            <DataRow
              label="Confidence"
              value={result.attribution.confidence != null ? `${Math.round(result.attribution.confidence * 100)}% (max 50%)` : undefined}
            />
          </div>
          <p className="rounded-lg bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-500">
            {result.attribution.caveat}
          </p>
        </div>
      ) : null}

      {result.investigationGraph ? (
        <div className="space-y-2">
          <SectionHeader title="Investigation Graph" icon={Network} />
          <GraphSummary graph={result.investigationGraph} />
        </div>
      ) : null}
    </div>
  );
}

function AlertsModalBody({ result }: { result: EmailAnalysisResult }) {
  const alerts = result.alerts ?? [];
  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <p className="text-xs italic text-slate-500">No security alerts were generated for this analysis.</p>
      ) : (
        alerts.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="flex items-center gap-2">
              <SeverityChip severity={a.severity} />
              <span className="text-[11px] font-semibold text-slate-100">{a.title}</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{a.detail}</p>
            <div className="mt-1 flex items-center gap-3 text-[9px] uppercase tracking-wider text-slate-500">
              <span>rule {a.ruleId}</span>
              <span>channel: {a.channel}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal configuration
// ---------------------------------------------------------------------------

interface ModalDef {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  maxWidth?: string;
  body: (result: EmailAnalysisResult) => React.ReactNode;
}

const MODAL_DEFS: Record<ModalKey, ModalDef> = {
  overall: {
    title: "Overall Assessment",
    subtitle: "Combines separated sender and content risk",
    icon: Shield,
    body: (r) => (
      <DimensionModalBody title="Overall" dimension={r.overallAssessment} summaryLabel="Overall Level" />
    ),
  },
  sender: {
    title: "Sender Analysis",
    subtitle: "Identity, domain and sending-host evidence",
    icon: Fingerprint,
    maxWidth: "max-w-4xl",
    body: (r) => <SenderModalBody result={r} />,
  },
  content: {
    title: "Content Analysis",
    subtitle: "Language, links, attachments and classifier signals",
    icon: FileText,
    maxWidth: "max-w-4xl",
    body: (r) => <ContentModalBody result={r} />,
  },
  reasoning: {
    title: "Suspicion Reasoning",
    subtitle: "Concise headlines tied to evidence",
    icon: Search,
    body: (r) => <ReasoningModalBody result={r} />,
  },
  auth: {
    title: "SPF / DKIM / DMARC Details",
    subtitle: "Authentication verdicts, scope and DNS re-verification",
    icon: ShieldCheck,
    body: (r) => <AuthModalBody result={r} />,
  },
  findings: {
    title: "Forensic Findings",
    subtitle: "Evidence-backed, de-duplicated findings with validation status",
    icon: FileSearch,
    maxWidth: "max-w-4xl",
    body: (r) => <FindingsModalBody result={r} />,
  },
  smtp: {
    title: "SMTP / Received Path",
    subtitle: "Reconstructed relay chain and anomalies",
    icon: Server,
    body: (r) => <SmtpModalBody result={r} />,
  },
  signals: {
    title: "Security Signals",
    subtitle: "Extracted indicators, validation states and entities",
    icon: AlertTriangle,
    maxWidth: "max-w-4xl",
    body: (r) => <SignalsModalBody result={r} />,
  },
  validation: {
    title: "Threat Validation",
    subtitle: "Pipeline stages, blocklist lookups and RDAP",
    icon: ShieldAlert,
    maxWidth: "max-w-4xl",
    body: (r) => <ValidationModalBody result={r} />,
  },
  correlation: {
    title: "Indicator Correlation",
    subtitle: "How each indicator relates to the findings",
    icon: Network,
    body: (r) => <CorrelationModalBody result={r} />,
  },
  domain: {
    title: "Domain Intelligence",
    subtitle: "MX/NS, RDAP registration and related domains",
    icon: Globe,
    body: (r) => <DomainModalBody result={r} />,
  },
  links: {
    title: "Links & Attachments",
    subtitle: "Inspected structural markers, never opened",
    icon: Link2,
    body: (r) => <LinksModalBody result={r} />,
  },
  evidence: {
    title: "Evidence Details",
    subtitle: "Raw headers, privacy mask, attribution and graph",
    icon: FileText,
    maxWidth: "max-w-4xl",
    body: (r) => <EvidenceModalBody result={r} />,
  },
  alerts: {
    title: "Security Alerts",
    subtitle: "Rule-derived alert decisions (delivery is separate)",
    icon: AlertOctagon,
    body: (r) => <AlertsModalBody result={r} />,
  },
};

// ---------------------------------------------------------------------------
// Main report component
// ---------------------------------------------------------------------------

export interface EmailAnalysisReportProps {
  result: EmailAnalysisResult;
  caseLink: {
    id: string;
    caseNumber: string | null;
    title: string | null;
    threatType: string | null;
    severity: string | null;
  } | null;
  caseSaveError: string | null;
  isSaving: boolean;
  savedEvidenceId: string | null;
  saveSuccess: boolean;
  saveError: string | null;
  onSaveToLocker: () => void;
  onAnalyzeAnother: () => void;
}

export function EmailAnalysisReport({
  result,
  caseLink,
  caseSaveError,
  isSaving,
  savedEvidenceId,
  saveSuccess,
  saveError,
  onSaveToLocker,
  onAnalyzeAnother,
}: EmailAnalysisReportProps) {
  const [modal, setModal] = useState<ModalKey | null>(null);

  const counts = useMemo(() => {
    const findings = result.structuredFindings ?? [];
    const urlIndicators = (result.indicators ?? []).filter((i) => i.type === "url");
    const riskyUrls = (result.urlRisk ?? []).filter((u) => u.severity !== "LOW");
    const validationMatches = (result.indicators ?? []).filter(
      (i) => i.validation?.state === "match"
    ).length;
    return {
      findings: findings.length,
      severeFindings: findings.filter(
        (f) => f.severity === "HIGH" || f.severity === "CRITICAL"
      ).length,
      indicators: (result.indicators ?? []).length,
      urls: urlIndicators.length,
      riskyUrls: riskyUrls.length,
      attachments: (result.attachments ?? []).length,
      flaggedAttachments: (result.attachments ?? []).filter((a) => a.suspicious).length,
      smtpAnomalies: (result.smtpAnomalies ?? []).filter((a) => a.severity !== "SAFE").length,
      validationMatches,
      dnsVerified: Boolean(result.dnsAuth),
    };
  }, [result]);

  const overall = result.overallAssessment;
  const sender = result.senderRisk;
  const content = result.contentRisk;
  const reasons = result.suspicionReasons ?? [];

  const open = (key: ModalKey) => setModal(key);
  const close = () => setModal(null);

  const exploreButtons: Array<{ key: ModalKey; label: string; icon: React.ElementType; hint?: string }> = [
    { key: "sender", label: "Sender Analysis", icon: Fingerprint, hint: "Identity, domain, host" },
    { key: "content", label: "Content Analysis", icon: FileText, hint: "Language, links, attachments" },
    { key: "reasoning", label: "Suspicion Reasoning", icon: Search, hint: "Why" },
    { key: "auth", label: "SPF / DKIM / DMARC", icon: ShieldCheck, hint: "Authentication" },
    { key: "findings", label: "INSEQ Findings", icon: FileSearch, hint: `${counts.findings} finding(s)` },
    { key: "smtp", label: "SMTP Relay Path", icon: Server, hint: `${result.smtpPath.length} hop(s)` },
    { key: "signals", label: "Security Signals", icon: AlertTriangle, hint: `${counts.indicators} indicator(s)` },
    { key: "validation", label: "Threat Validation", icon: ShieldAlert, hint: `pipeline + blocklists` },
    { key: "correlation", label: "Indicator Correlation", icon: Network, hint: "linking" },
    { key: "domain", label: "Domain Intelligence", icon: Globe, hint: "MX, RDAP" },
    { key: "links", label: "Links & Attachments", icon: Link2, hint: "structure only" },
    { key: "evidence", label: "Evidence Details", icon: FileText, hint: "raw + mask" },
    { key: "alerts", label: "Security Alerts", icon: AlertOctagon, hint: `${(result.alerts ?? []).length} alert(s)` },
  ];

  return (
    <div className="space-y-6">
      {/* ---------- Case header ---------- */}
      <section className="rounded-2xl border border-slate-800/90 bg-[#0b0b17]/80 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <EyebrowBadge icon={Mail}>Email Verification</EyebrowBadge>
          {result.id ? (
            <span className="font-mono text-[10px] text-slate-500">{result.id}</span>
          ) : null}
        </div>

        <h1 className="mt-4 text-xl font-black text-slate-100 sm:text-2xl">
          {result.headers.subject || "Untitled Email"}
        </h1>

        <div className="mt-1 text-xs text-slate-400">
          From: <span className="font-semibold text-slate-200">{result.headers.from || "unknown"}</span>
          {result.headers.to ? (
            <>
              {" · "}To: <span className="text-slate-300">{result.headers.to}</span>
            </>
          ) : null}
        </div>

        <div className="mt-3 grid gap-x-6 gap-y-1 border-t border-slate-800/70 pt-3 text-[11px] text-slate-500 sm:grid-cols-2">
          <span>Received: {result.headers.received.length > 0 ? result.headers.received.length : "0"} hop(s)</span>
          <span>Date: {result.headers.date || "unknown"}</span>
          <span>Analyzed: {new Date(result.analyzedAt).toLocaleString()}</span>
          {result.headers.messageId ? (
            <span className="truncate" title={result.headers.messageId}>Message-ID: {result.headers.messageId}</span>
          ) : null}
        </div>

        {caseLink ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emergency-800/40 bg-emergency-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-black text-emergency-200">
                Case Created: <span className="font-mono">{caseLink.caseNumber}</span>
              </div>
              <div className="truncate text-[10px] text-emergency-300/80">
                {caseLink.title} · {caseLink.threatType} · severity {caseLink.severity}
              </div>
            </div>
            <Link
              href={`/cases/${caseLink.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emergency-700/50 bg-emergency-900/50 px-3 py-2 text-xs font-bold text-emergency-200 transition hover:bg-emergency-800 hover:text-white"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open Case
            </Link>
          </div>
        ) : null}
        {caseSaveError ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Analysis complete, but the case could not be saved to the database this time (
              {caseSaveError}). You can still view the forensic report below.
            </span>
          </div>
        ) : null}
      </section>

      {/* ---------- Overall assessment banner ---------- */}
      <section
        className={`rounded-2xl border p-5 ${
          result.threatLevel === "CRITICAL"
            ? "border-red-500/50 bg-red-950/40"
            : result.threatLevel === "HIGH"
            ? "border-orange-500/50 bg-orange-950/40"
            : result.threatLevel === "MEDIUM"
            ? "border-amber-600/50 bg-amber-950/40"
            : result.threatLevel === "LOW"
            ? "border-sky-600/50 bg-sky-950/40"
            : "border-emerald-600/50 bg-emerald-950/40"
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Overall</div>
              <div className={`text-3xl font-black ${THREAT_TEXT[result.threatLevel]}`}>
                {overall?.level ?? result.threatLevel}
              </div>
            </div>
            <div className="h-14 w-px bg-white/10" />
            <div className="min-w-[220px] flex-1">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>Combined score</span>
                <span className="font-bold text-slate-200">
                  {overall?.score ?? result.threatScore}/100
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/25">
                <div
                  className={`h-full rounded-full ${
                    result.threatScore >= 65
                      ? "bg-red-500"
                      : result.threatScore >= 40
                      ? "bg-amber-500"
                      : result.threatScore >= 20
                      ? "bg-sky-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${overall?.score ?? result.threatScore}%` }}
                />
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">
                {overall?.summary ?? result.verdict?.summary}
                {overall ? (
                  <button
                    onClick={() => open("overall")}
                    className="ml-2 font-semibold text-emergency-300 underline underline-offset-2 hover:text-emergency-200"
                  >
                    How this is derived
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSaveToLocker}
              disabled={isSaving || savedEvidenceId !== null}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                isSaving
                  ? "cursor-not-allowed bg-slate-700 text-slate-300"
                  : savedEvidenceId !== null
                  ? "cursor-default bg-emerald-700 text-white"
                  : "bg-emergency-600 text-white hover:bg-emergency-500"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : savedEvidenceId !== null ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {saveSuccess ? "Saved to Evidence Locker" : "Saved"}
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Save to Evidence Locker
                </>
              )}
            </button>
            {saveError ? (
              <span className="flex items-center gap-1 text-xs text-red-300">
                <AlertCircle className="h-3.5 w-3.5" />
                {saveError}
              </span>
            ) : null}
            <button
              onClick={onAnalyzeAnother}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-xs font-bold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Analyze Another
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Three risk cards ---------- */}
      <section className="grid gap-4 md:grid-cols-3">
        <RiskCard
          title="Sender Risk"
          icon={Fingerprint}
          dimension={sender}
          accent={THREAT_TEXT[sender?.level ?? "SAFE"]}
          onView={() => open("sender")}
        />
        <RiskCard
          title="Content Risk"
          icon={FileText}
          dimension={content}
          accent={THREAT_TEXT[content?.level ?? "SAFE"]}
          onView={() => open("content")}
        />
        <RiskCard
          title="Overall Assessment"
          icon={Shield}
          dimension={overall}
          accent={THREAT_TEXT[overall?.level ?? result.threatLevel]}
          onView={() => open("overall")}
        />
      </section>

      {/* ---------- Suspicion reasoning (concise) ---------- */}
      {reasons.length > 0 ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <SectionHeader title="Suspicion Reasoning" icon={Search} />
          <div className="space-y-2">
            {reasons.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <SeverityChip severity={r.severity} />
                <span className="text-xs leading-relaxed text-slate-200">{r.headline}</span>
              </div>
            ))}
            <button
              onClick={() => open("reasoning")}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-emergency-300 underline underline-offset-2 hover:text-emergency-200"
            >
              <ExternalLink className="h-3 w-3" />
              View full reasoning ({reasons.length})
            </button>
          </div>
        </section>
      ) : null}

      {/* ---------- Authentication summary ---------- */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeader title="Authentication" icon={ShieldCheck} />
          <button
            onClick={() => open("auth")}
            className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-emergency-300 underline underline-offset-2 hover:text-emergency-200"
          >
            <ExternalLink className="h-3 w-3" />
            Details
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <AuthChip auth={result.authentication.spf} label="SPF" />
          <AuthChip auth={result.authentication.dkim} label="DKIM" />
          <AuthChip auth={result.authentication.dmarc} label="DMARC" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Authentication proves the sender&apos;s allowed identity — it does not make message content
          trustworthy. Independent DNS re-verification:{" "}
          <span className="font-semibold text-slate-300">
            {counts.dnsVerified ? "completed" : "unavailable"}
          </span>
          .
        </p>
      </section>

      {/* ---------- Recommended next action ---------- */}
      {result.recommendations.length > 0 ? (
        <section className="rounded-2xl border border-emergency-800/40 bg-emergency-950/25 p-5">
          <SectionHeader title="Recommended Next Action" icon={AlertTriangle} />
          <p className="text-sm font-semibold text-slate-100">
            {result.recommendations[0]}
          </p>
          {result.recommendations.length > 1 ? (
            <button
              onClick={() => open("findings")}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emergency-300 underline underline-offset-2 hover:text-emergency-200"
            >
              <ExternalLink className="h-3 w-3" />
              View all recommendations & findings
            </button>
          ) : null}
        </section>
      ) : null}

      {/* ---------- Compact security signal summary ---------- */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <SectionHeader title="Security Signal Summary" icon={AlertTriangle} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SignalChip label="Findings" value={counts.findings} onClick={() => open("findings")} />
          <SignalChip label="High/Critical" value={counts.severeFindings} danger onClick={() => open("findings")} />
          <SignalChip label="Indicators" value={counts.indicators} onClick={() => open("signals")} />
          <SignalChip label="Links flagged" value={counts.riskyUrls} onClick={() => open("links")} />
          <SignalChip label="Attachments" value={counts.attachments} onClick={() => open("links")} />
          <SignalChip label="Relay anomalies" value={counts.smtpAnomalies} onClick={() => open("smtp")} />
          <SignalChip label="Blocklist matches" value={counts.validationMatches} danger onClick={() => open("validation")} />
          <SignalChip label="DNS re-verified" value={counts.dnsVerified ? 1 : 0} check onClick={() => open("auth")} />
          <SignalChip label="Correlations" value={(result.indicatorCorrelations ?? []).length} onClick={() => open("correlation")} />
          <SignalChip
            label="URLs"
            value={counts.urls}
            onClick={() => open("signals")}
          />
          <SignalChip label="Entities" value={(result.entities ?? []).length} onClick={() => open("signals")} />
          <SignalChip label="Alerts" value={(result.alerts ?? []).length} onClick={() => open("alerts")} />
        </div>
      </section>

      {/* ---------- Explore buttons ---------- */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <SectionHeader title="Explore The Investigation" icon={Network} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {exploreButtons.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.key}
                onClick={() => open(b.key)}
                className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0b0b17]/70 p-3 text-left transition hover:border-emergency-700/60 hover:bg-emergency-950/20"
              >
                <span className="rounded-lg bg-slate-800 p-2 text-slate-300 transition group-hover:text-emergency-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-100">{b.label}</span>
                  {b.hint ? <span className="block text-[9px] uppercase tracking-wider text-slate-500">{b.hint}</span> : null}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:text-emergency-300" />
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Modals ---------- */}
      {(Object.keys(MODAL_DEFS) as ModalKey[]).map((key) => {
        const def = MODAL_DEFS[key];
        return (
          <InfoModal
            key={key}
            open={modal === key}
            onClose={close}
            title={def.title}
            subtitle={def.subtitle}
            icon={def.icon}
            maxWidth={def.maxWidth}
          >
            {modal === key ? def.body(result) : null}
          </InfoModal>
        );
      })}
    </div>
  );
}

function RiskCard({
  title,
  icon: Icon,
  dimension,
  accent,
  onView,
}: {
  title: string;
  icon: React.ElementType;
  dimension?: RiskDimensionAssessment;
  accent: string;
  onView: () => void;
}) {
  const level = dimension?.level ?? "SAFE";
  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emergency-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div className={`text-2xl font-black ${accent}`}>{level}</div>
        <div className="text-right">
          <div className="text-lg font-black text-slate-100">{dimension?.score ?? 0}</div>
          <div className="-mt-1 text-[9px] text-slate-500">/ 100</div>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${
            (dimension?.score ?? 0) >= 65
              ? "bg-red-500"
              : (dimension?.score ?? 0) >= 40
              ? "bg-amber-500"
              : (dimension?.score ?? 0) >= 20
              ? "bg-sky-500"
              : "bg-emerald-500"
          }`}
          style={{ width: `${dimension?.score ?? 0}%` }}
        />
      </div>

      <p className="mt-2 flex-1 text-[10px] leading-relaxed text-slate-400">
        {dimension?.summary ?? "Assessment unavailable for this run."}
      </p>

      {dimension && dimension.signals.length > 0 ? (
        <div className="mt-2 space-y-1">
          {dimension.signals
            .filter((s) => s.severity !== "SAFE")
            .slice(0, 2)
            .map((s) => (
              <div key={s.id} className="flex items-start gap-1.5 text-[9px] text-slate-500">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emergency-400" />
                <span className="line-clamp-2">{s.label}</span>
              </div>
            ))}
        </div>
      ) : null}

      <button
        onClick={onView}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[10px] font-bold text-slate-300 transition hover:border-emergency-700/60 hover:text-emergency-200"
      >
        <Eye className="h-3 w-3" />
        View details
      </button>
    </div>
  );
}

function SignalChip({
  label,
  value,
  onClick,
  danger = false,
  check = false,
}: {
  label: string;
  value: number;
  onClick: () => void;
  danger?: boolean;
  check?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-800 bg-[#0b0b17]/70 px-2.5 py-2 text-left transition hover:border-emergency-700/60"
    >
      <div
        className={`text-lg font-black ${
          danger && value > 0 ? "text-red-400" : check && value > 0 ? "text-emerald-400" : "text-slate-100"
        }`}
      >
        {check ? (value > 0 ? <CheckCircle2 className="h-4 w-4" /> : <HelpCircle className="h-4 w-4 text-slate-500" />) : value}
      </div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </button>
  );
}
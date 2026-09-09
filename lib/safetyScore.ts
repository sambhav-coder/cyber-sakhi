import {
  ThreatAnalysisResult,
  EvidenceItem,
  TrustedContact,
  SosEvent,
  ThreatSeverity,
} from "./types";

/* ------------------------------------------------------------------ *
 * Cyber Sakhi — Safety Analytics
 *
 * Every number the dashboard renders is produced here from the stored
 * records. Pure functions, no React, no side effects, so the scoring
 * model can be unit-tested and explained to a reviewer.
 * ------------------------------------------------------------------ */

export type PillarStatus = "GOOD" | "WARNING" | "SERIOUS" | "CRITICAL";

export interface ScorePillar {
  key: string;
  label: string;
  earned: number;
  max: number;
  status: PillarStatus;
  /** Why this pillar scored what it scored — shown verbatim in the UI. */
  detail: string;
  /** The single next step that would raise it, when there is one. */
  action?: string;
  href?: string;
}

export type ScoreBand = "ROBUST" | "GUARDED" | "ELEVATED" | "CRITICAL";

export interface SafetyScoreResult {
  score: number;
  band: ScoreBand;
  bandLabel: string;
  pillars: ScorePillar[];
}

export interface SafetyInputs {
  scans: ThreatAnalysisResult[];
  evidence: EvidenceItem[];
  contacts: TrustedContact[];
  sosEvents: SosEvent[];
}

/* ---------------------------- date helpers --------------------------- */

export function withinDays(iso: string, days: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown time";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/* --------------------------- severity helpers ------------------------ */

const SEVERITY_RANK: Record<ThreatSeverity, number> = {
  SAFE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function severityRank(s: ThreatSeverity): number {
  return SEVERITY_RANK[s] ?? 0;
}

export function isSevere(s: ThreatSeverity): boolean {
  return s === "HIGH" || s === "CRITICAL";
}

/* --------------------------- the score model ------------------------- */

function statusFor(earned: number, max: number): PillarStatus {
  const ratio = max === 0 ? 1 : earned / max;
  if (ratio >= 0.8) return "GOOD";
  if (ratio >= 0.5) return "WARNING";
  if (ratio >= 0.25) return "SERIOUS";
  return "CRITICAL";
}

/**
 * Weighted five-pillar model, 100 points total:
 *   Emergency network 25 · Evidence integrity 20 · Threat exposure 30
 *   Active vigilance 15 · Incident response 10
 */
export function computeSafetyScore(input: SafetyInputs): SafetyScoreResult {
  const { scans, evidence, contacts, sosEvents } = input;
  const pillars: ScorePillar[] = [];

  /* 1. Emergency network — 25 */
  const verified = contacts.filter((c) => c.isVerified);
  const hasPrimary = verified.some((c) => c.isPrimary);
  const dualChannel = contacts.filter((c) => c.notifyWhatsApp && c.notifySms);
  let network = (Math.min(verified.length, 3) / 3) * 15;
  if (hasPrimary) network += 5;
  if (dualChannel.length >= 1) network += 5;
  network = Math.round(network);
  pillars.push({
    key: "network",
    label: "Emergency Network",
    earned: network,
    max: 25,
    status: statusFor(network, 25),
    detail:
      verified.length === 0
        ? "No verified contact can receive an SOS dispatch."
        : `${verified.length} verified contact${
            verified.length === 1 ? "" : "s"
          }, ${hasPrimary ? "primary recipient set" : "no primary recipient"}, ${
            dualChannel.length
          } on both WhatsApp and SMS.`,
    action:
      verified.length < 3
        ? "Add and verify at least 3 contacts"
        : !hasPrimary
        ? "Mark one contact as primary"
        : dualChannel.length === 0
        ? "Enable both channels for one contact"
        : undefined,
    href: "/contacts",
  });

  /* 2. Evidence integrity — 20 */
  const verifiedEvidence = evidence.filter((e) => e.integrityVerified);
  const vault =
    evidence.length === 0
      ? 20
      : Math.round((verifiedEvidence.length / evidence.length) * 20);
  pillars.push({
    key: "vault",
    label: "Evidence Integrity",
    earned: vault,
    max: 20,
    status: statusFor(vault, 20),
    detail:
      evidence.length === 0
        ? "Vault is empty, so no artifact is at risk of a broken chain of custody."
        : `${verifiedEvidence.length} of ${evidence.length} artifact${
            evidence.length === 1 ? "" : "s"
          } pass their SHA-256 checksum.`,
    action:
      evidence.length > verifiedEvidence.length
        ? "Re-verify artifacts with a failed checksum"
        : undefined,
    href: "/locker",
  });

  /* 3. Threat exposure — 30 (inverse: recent severe traffic costs points) */
  const recent = scans.filter((s) => withinDays(s.timestamp, 14));
  const crit = recent.filter((s) => s.threatLevel === "CRITICAL").length;
  const high = recent.filter((s) => s.threatLevel === "HIGH").length;
  const med = recent.filter((s) => s.threatLevel === "MEDIUM").length;
  const penalty = crit * 6 + high * 4 + med * 1.5;
  const exposure = Math.max(0, Math.round(30 - penalty));
  pillars.push({
    key: "exposure",
    label: "Threat Exposure (14 Days)",
    earned: exposure,
    max: 30,
    status: statusFor(exposure, 30),
    detail:
      recent.length === 0
        ? "No threats detected in the last 14 days."
        : `${crit} critical, ${high} high and ${med} medium detection${
            med === 1 ? "" : "s"
          } in the last 14 days.`,
    action:
      crit + high > 0 ? "Vault the severe messages and escalate to 1930" : undefined,
    href: "/detector",
  });

  /* 4. Active vigilance — 15 */
  const last7 = scans.filter((s) => withinDays(s.timestamp, 7)).length;
  let vigilance: number;
  if (scans.length === 0) vigilance = 0;
  else if (last7 >= 3) vigilance = 15;
  else if (last7 >= 1) vigilance = 9;
  else vigilance = 3;
  pillars.push({
    key: "vigilance",
    label: "Active Vigilance",
    earned: vigilance,
    max: 15,
    status: statusFor(vigilance, 15),
    detail:
      scans.length === 0
        ? "No message has ever been screened."
        : `${last7} scan${last7 === 1 ? "" : "s"} in the last 7 days, ${
            scans.length
          } on record.`,
    action: last7 < 3 ? "Screen suspicious messages as they arrive" : undefined,
    href: "/detector",
  });

  /* 5. Incident response — 10 */
  const active = sosEvents.filter((e) => e.status === "ACTIVE");
  const drills = sosEvents.filter((e) => e.status === "SIMULATED");
  let response: number;
  let responseDetail: string;
  if (active.length > 0) {
    response = Math.max(0, 10 - active.length * 5);
    responseDetail = `${active.length} SOS beacon${
      active.length === 1 ? " is" : "s are"
    } still open and unresolved.`;
  } else if (sosEvents.length === 0) {
    response = 4;
    responseDetail = "The emergency beacon has never been drilled.";
  } else {
    response = 10;
    responseDetail = `${drills.length} drill${
      drills.length === 1 ? "" : "s"
    } completed, no beacon left open.`;
  }
  pillars.push({
    key: "response",
    label: "Incident Response",
    earned: response,
    max: 10,
    status: statusFor(response, 10),
    detail: responseDetail,
    action:
      active.length > 0
        ? "Resolve the open beacon"
        : sosEvents.length === 0
        ? "Run a cancel drill on the SOS page"
        : undefined,
    href: "/sos",
  });

  const score = pillars.reduce((sum, p) => sum + p.earned, 0);

  let band: ScoreBand;
  let bandLabel: string;
  if (score >= 85) {
    band = "ROBUST";
    bandLabel = "Robust & Shielded";
  } else if (score >= 70) {
    band = "GUARDED";
    bandLabel = "Guarded";
  } else if (score >= 50) {
    band = "ELEVATED";
    bandLabel = "Elevated Risk";
  } else {
    band = "CRITICAL";
    bandLabel = "Critical Exposure";
  }

  return { score, band, bandLabel, pillars };
}

/* ----------------------- threat category mix ------------------------- */

export interface DistributionSlice {
  key: string;
  label: string;
  weight: number;
  pct: number;
}

const RISK_LABELS: Record<string, string> = {
  blackmail: "Blackmail & extortion",
  stalking: "Cyberstalking",
  financialScam: "Financial / OTP fraud",
  sexualHarassment: "Sexual harassment",
  intimidation: "Intimidation & threats",
  hateSpeech: "Doxxing & hate speech",
};

/**
 * Sums the per-scan riskFactors the threat engine emits, then normalises to
 * a share of total detected risk. Returns [] when there is nothing to show,
 * so the caller renders an empty state rather than an invented distribution.
 */
export function computeThreatDistribution(
  scans: ThreatAnalysisResult[]
): DistributionSlice[] {
  const totals: Record<string, number> = {
    blackmail: 0,
    stalking: 0,
    financialScam: 0,
    sexualHarassment: 0,
    intimidation: 0,
    hateSpeech: 0,
  };

  for (const scan of scans) {
    const rf = scan.riskFactors as unknown as Record<string, number> | undefined;
    if (!rf) continue;
    for (const key of Object.keys(totals)) {
      totals[key] += Number(rf[key] ?? 0);
    }
  }

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grand === 0) return [];

  return Object.entries(totals)
    .map(([key, weight]) => ({
      key,
      label: RISK_LABELS[key] ?? key,
      weight,
      pct: Math.round((weight / grand) * 100),
    }))
    .filter((slice) => slice.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/* --------------------------- daily trend ----------------------------- */

export interface TrendDay {
  date: string;
  dayLabel: string;
  fullLabel: string;
  total: number;
  severe: number;
  peak: ThreatSeverity | null;
}

/** Scan volume per day for the last `days` days, oldest first. */
export function computeDailyTrend(
  scans: ThreatAnalysisResult[],
  days = 14
): TrendDay[] {
  const buckets: TrendDay[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      date: localDateKey(d),
      dayLabel: d.toLocaleDateString("en-IN", { day: "numeric" }),
      fullLabel: d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      total: 0,
      severe: 0,
      peak: null,
    });
  }

  const index = new Map(buckets.map((b) => [b.date, b]));

  for (const scan of scans) {
    const t = new Date(scan.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const bucket = index.get(localDateKey(t));
    if (!bucket) continue;
    bucket.total += 1;
    if (isSevere(scan.threatLevel)) bucket.severe += 1;
    if (!bucket.peak || severityRank(scan.threatLevel) > severityRank(bucket.peak)) {
      bucket.peak = scan.threatLevel;
    }
  }

  return buckets;
}

/** Local-time YYYY-MM-DD; toISOString would bucket by UTC and shift IST days. */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* --------------------------- activity feed --------------------------- */

export type ActivityKind = "SCAN" | "EVIDENCE" | "SOS";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  timestamp: string;
  severity?: ThreatSeverity;
  href: string;
}

/** One chronological stream across all three record types, newest first. */
export function buildActivityFeed(
  scans: ThreatAnalysisResult[],
  evidence: EvidenceItem[],
  sosEvents: SosEvent[],
  limit = 8
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const scan of scans) {
    entries.push({
      id: `scan_${scan.id}`,
      kind: "SCAN",
      title: scan.text.length > 110 ? `${scan.text.slice(0, 110)}…` : scan.text,
      subtitle: `Score ${scan.score}/100 · ${
        scan.triggers.length > 0 ? scan.triggers.join(", ") : "no rule triggered"
      }`,
      timestamp: scan.timestamp,
      severity: scan.threatLevel,
      href: "/detector",
    });
  }

  for (const item of evidence) {
    entries.push({
      id: `ev_${item.id}`,
      kind: "EVIDENCE",
      title: item.title,
      subtitle: `${item.category} · SHA-256 ${
        item.integrityVerified ? "verified" : "UNVERIFIED"
      } · ${item.filename}`,
      timestamp: item.timestamp,
      href: "/locker",
    });
  }

  for (const sos of sosEvents) {
    entries.push({
      id: `sos_${sos.id}`,
      kind: "SOS",
      title:
        sos.status === "SIMULATED"
          ? "SOS drill dispatched"
          : sos.status === "ACTIVE"
          ? "SOS beacon OPEN"
          : "SOS beacon resolved",
      subtitle: `${sos.triggerMethod.replace(/_/g, " ").toLowerCase()} · ${
        sos.notifiedContacts.length
      } contact${sos.notifiedContacts.length === 1 ? "" : "s"} notified · ${
        sos.location.address
      }`,
      timestamp: sos.timestamp,
      href: "/sos",
    });
  }

  return entries
    .filter((e) => !Number.isNaN(new Date(e.timestamp).getTime()))
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, limit);
}

/* ------------------------- readiness checklist ----------------------- */

export interface ReadinessItem {
  id: string;
  label: string;
  done: boolean;
  detail: string;
  href: string;
}

export function computeReadiness(input: SafetyInputs): ReadinessItem[] {
  const { scans, evidence, contacts, sosEvents } = input;
  const verified = contacts.filter((c) => c.isVerified);
  const primary = verified.find((c) => c.isPrimary);
  const dualChannel = contacts.filter((c) => c.notifyWhatsApp && c.notifySms);
  const unverifiedEvidence = evidence.filter((e) => !e.integrityVerified);
  const openSos = sosEvents.filter((e) => e.status === "ACTIVE");
  const scans7 = scans.filter((s) => withinDays(s.timestamp, 7));

  return [
    {
      id: "contacts",
      label: "Three Verified Emergency Contacts",
      done: verified.length >= 3,
      detail: `${verified.length} of 3 verified`,
      href: "/contacts",
    },
    {
      id: "primary",
      label: "Primary SOS Recipient Designated",
      done: Boolean(primary),
      detail: primary ? primary.name : "None designated",
      href: "/contacts",
    },
    {
      id: "channels",
      label: "Dual-Channel Dispatch (WhatsApp + SMS)",
      done: dualChannel.length > 0,
      detail: `${dualChannel.length} contact(s) on both channels`,
      href: "/contacts",
    },
    {
      id: "vault",
      label: "Every Vaulted Artifact Passes Its Checksum",
      done: unverifiedEvidence.length === 0,
      detail:
        evidence.length === 0
          ? "Vault empty"
          : `${unverifiedEvidence.length} unverified of ${evidence.length}`,
      href: "/locker",
    },
    {
      id: "drill",
      label: "SOS Beacon Drilled At Least Once",
      done: sosEvents.length > 0,
      detail:
        sosEvents.length === 0
          ? "Never drilled"
          : `Last: ${relativeTime(sosEvents[0].timestamp)}`,
      href: "/sos",
    },
    {
      id: "open",
      label: "No Emergency Beacon Left Open",
      done: openSos.length === 0,
      detail: openSos.length === 0 ? "All beacons closed" : `${openSos.length} open`,
      href: "/sos",
    },
    {
      id: "screening",
      label: "Message Screening Used This Week",
      done: scans7.length > 0,
      detail: `${scans7.length} scan(s) in 7 days`,
      href: "/detector",
    },
  ];
}

/* ---------------------------- vault summary -------------------------- */

export interface VaultSummary {
  total: number;
  verified: number;
  pct: number;
  bytes: number;
}

export function summarizeVault(evidence: EvidenceItem[]): VaultSummary {
  const verified = evidence.filter((e) => e.integrityVerified).length;
  return {
    total: evidence.length,
    verified,
    pct:
      evidence.length === 0 ? 100 : Math.round((verified / evidence.length) * 100),
    bytes: evidence.reduce((sum, e) => sum + (e.fileSize || 0), 0),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  // Sub-kilobyte artifacts are real (a sealed chat export is a few hundred
  // bytes), so round them to "0 KB" would read as an empty vault.
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

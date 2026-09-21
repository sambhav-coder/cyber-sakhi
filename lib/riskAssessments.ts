import type {
  AuthVerdictLabel,
  AuthVerdictPresentation,
  EmailAuthentication,
  ForensicFinding,
  LanguageAnalysis,
  RiskDimensionAssessment,
  RiskLevel,
  RiskSignal,
  SpoofingComposite,
  SuspicionReason,
  ThreatIndicator,
  ThreatValidationRecord,
  ThreatValidationState,
  UrlRiskAnalysis,
} from "./emailTypes";
import type { MlEmailClassification } from "./emailTypes";
import type { AttachmentAnalysis } from "./emailTypes";
import type { DnsAuthVerification } from "./auth";
import type { ProxyEnrichment } from "./ipIntelligence";
import type { ThreatIntelResult } from "./intel/dnsbl";

/**
 * RISK DIMENSION SEPARATION + SUSPICION REASONING
 * ------------------------------------------------
 * Sender risk and content risk are intentionally separated: a failed SPF check
 * is a *sender* signal, manipulation language is a *content* signal, and
 * neither alone proves the other. The overall assessment combines both the way
 * the legacy threat score did, so existing Case flow / threatLevel semantics are
 * unchanged.
 */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isDomainLike(value: string): boolean {
  const v = value.toLowerCase().replace(/\.$/, "");
  if (v.length > 253 || !v.includes(".")) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v);
}

/**
 * Attach a ThreatValidationRecord to every indicator based on the DNS-blocklist
 * query outcome. This is the "validate" pipeline stage: it distinguishes
 * not-checked / checked-no-match / match / validation-failed / conflicting and
 * never lets a skipped or failed lookup read as a clean result.
 */
export function applyThreatIntelValidation(
  indicators: ThreatIndicator[],
  threatIntel: ThreatIntelResult | undefined
): ThreatIndicator[] {
  if (!threatIntel) {
    return indicators.map((i) =>
      i.validation
        ? i
        : { ...i, validation: validationRecord("not-checked", i.source, "No independent blocklist/threat-intel check was run for this indicator.") }
    );
  }

  const queriedIps = [
    ...new Set(
      indicators
        .filter((i) => i.type === "ip" && IPV4_RE.test(i.value))
        .map((i) => i.value)
    ),
  ].slice(0, 3);
  const queriedDomains = [
    ...new Set(
      indicators
        .filter((i) => i.type === "domain" && isDomainLike(i.value))
        .map((i) => i.value)
    ),
  ].slice(0, 3);

  return indicators.map((ind) => {
    if (ind.type === "ip") {
      const idx = queriedIps.indexOf(ind.value);
      if (threatIntel.ip && idx >= 0 && idx < threatIntel.ip.results.length) {
        const r = threatIntel.ip.results[idx];
        return { ...ind, validation: blocklistValidation(r.queryable, r.listed, r.source) };
      }
      return {
        ...ind,
        validation: validationRecord("not-checked", "Spamhaus ZEN", `IP ${ind.value} was not eligible for a blocklist query (non-IPv4 or not selected).`),
      };
    }

    if (ind.type === "domain") {
      const idx = queriedDomains.indexOf(ind.value);
      if (threatIntel.domain && idx >= 0) {
        const pair = threatIntel.domain.results.slice(idx * 2, idx * 2 + 2);
        if (pair.length === 2 && pair[0].listed !== pair[1].listed) {
          return {
            ...ind,
            validation: validationRecord("conflicting", "Spamhaus DBL / SURBL", "Blocklist sources disagree on this domain."),
          };
        }
        if (pair.length > 0) {
          const r = pair[0];
          return {
            ...ind,
            validation: blocklistValidation(r.queryable, r.listed, r.source + (pair[1] ? " / SURBL multi" : "")),
          };
        }
      }
      return {
        ...ind,
        validation: validationRecord("not-checked", "Spamhaus DBL / SURBL", `Domain ${ind.value} was not eligible for a blocklist query.`),
      };
    }

    return {
      ...ind,
      validation: validationRecord("not-checked", undefined, "URL/email indicators are inspected structurally; no external blocklist is queried for them."),
    };
  });
}

// ---------------------------------------------------------------------------
// Level helpers
// ---------------------------------------------------------------------------

export function riskLevelForScore(score: number): RiskLevel {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s === 0) return "SAFE";
  if (s < 20) return "LOW";
  if (s < 40) return "MEDIUM";
  if (s < 65) return "HIGH";
  return "CRITICAL";
}

function push(
  signals: RiskSignal[],
  id: string,
  label: string,
  severity: RiskSignal["severity"],
  detail?: string,
  evidenceRef?: string
) {
  signals.push({ id, label, severity, detail, evidenceRef });
}

function authFailPoints(auth: EmailAuthentication): { points: number; parts: string[] } {
  let points = 0;
  const parts: string[] = [];
  if (auth.spf.status === "fail") { points += 25; parts.push("SPF failed (+25)"); }
  else if (auth.spf.status === "neutral") { points += 10; parts.push("SPF inconclusive (+10)"); }
  if (auth.dkim.status === "fail") { points += 25; parts.push("DKIM failed (+25)"); }
  else if (auth.dkim.status === "neutral") { points += 10; parts.push("DKIM inconclusive (+10)"); }
  if (auth.dmarc.status === "fail") { points += 20; parts.push("DMARC failed (+20)"); }
  else if (auth.dmarc.status === "neutral") { points += 8; parts.push("DMARC inconclusive (+8)"); }
  return { points, parts };
}

// ---------------------------------------------------------------------------
// Sender risk — derived ONLY from sender-identity + sending-host evidence.
// ---------------------------------------------------------------------------

export function assessSenderRisk(input: {
  authentication: EmailAuthentication;
  spoofing?: SpoofingComposite;
  senderDomain?: string;
  domainSuspicious?: boolean;
  dnsAuth?: DnsAuthVerification;
  rdapSignals?: string[];
  rdapAgeDays?: number | null;
  ipProxy?: ProxyEnrichment;
  threatIps?: string[];
  threatDomains?: string[];
  hasOriginatingIp?: boolean;
}): RiskDimensionAssessment {
  const signals: RiskSignal[] = [];
  let points = 0;
  const { authentication: auth, spoofing } = input;

  // --- Authentication ---
  const authPts = authFailPoints(auth);
  points += authPts.points;
  for (const p of authPts.parts) {
    push(signals, "auth", `Email authentication is incomplete or failing — ${p}`, p.startsWith("SPF failed") || p.startsWith("DKIM failed") || p.startsWith("DMARC failed") ? "HIGH" : "MEDIUM", undefined, "AUTHENTICATION");
  }

  // --- Spoofing / identity mismatch ---
  if (spoofing?.detected) {
    const severity = spoofing.lookalikeDetected || spoofing.homoglyphDetected || spoofing.punycodeDetected ? "HIGH" : "MEDIUM";
    points += Math.min(40, spoofing.signals.length * 12);
    push(signals, "spoofing", `Sender identity mismatch: ${spoofing.signals.length} spoofing signal(s)`, severity, spoofing.signals.slice(0, 3).join("; "), "SENDER_SPOOFING");
  } else if (spoofing) {
    push(signals, "spoofing-clean", "Sender addresses and domains are consistent", "SAFE", undefined, "SENDER_SPOOFING");
  }

  // --- Sender domain heuristics ---
  if (input.domainSuspicious) {
    points += 10;
    push(signals, "domain", "Sender domain uses a TLD/structure associated with disposable registrations", "HIGH", input.senderDomain, "DOMAIN");
  }

  // --- Independent DNS policy re-verification ---
  if (input.dnsAuth) {
    const spfBad = input.dnsAuth.spf.status === "fail" || input.dnsAuth.spf.status === "not-found" || input.dnsAuth.spf.status === "softfail";
    const dmarcMissing = input.dnsAuth.dmarc.status === "not-found" || input.dnsAuth.dmarc.status === "unavailable";
    if (spfBad) {
      points += 10;
      push(signals, "dns-spf", "Published SPF policy does not authorize this sender or does not exist", "HIGH", input.dnsAuth.spf.explained, "AUTHENTICATION");
    }
    if (dmarcMissing) {
      points += 6;
      push(signals, "dns-dmarc", "No protective DMARC policy is published for the sender domain", "MEDIUM", input.dnsAuth.dmarc.explained, "AUTHENTICATION");
    }
    const mismatchCount =
      (input.dnsAuth.spf.headerVerdictMismatch ? 1 : 0) +
      (input.dnsAuth.dmarc.headerVerdictMismatch ? 1 : 0);
    if (mismatchCount > 0) {
      points += 8;
      push(signals, "dns-mismatch", "Authentication-Results header conflicts with published DNS policy", "MEDIUM", undefined, "AUTHENTICATION");
    }
  }

  // --- Domain registration (RDAP) ---
  if (input.rdapSignals?.length) {
    points += Math.min(12, 4 + input.rdapSignals.length * 4);
    push(signals, "rdap", "Domain registration raises abuse flags", "MEDIUM", input.rdapSignals.join("; "), "DOMAIN");
  } else if (input.rdapAgeDays != null && input.rdapAgeDays <= 30) {
    points += 8;
    push(signals, "rdap-young", "Sender domain was registered very recently", "MEDIUM", `Registered ${input.rdapAgeDays} day(s) ago`, "DOMAIN");
  }

  // --- Sending host proxy/anonymization ---
  if (input.ipProxy && input.ipProxy.kind !== "none" && input.ipProxy.kind !== "unknown") {
    if (input.ipProxy.kind === "tor") {
      points += 15;
      push(signals, "proxy-tor", "Originating IP is a Tor exit node", "HIGH", input.ipProxy.note, "IP");
    } else {
      points += 5;
      push(signals, "proxy", `Originating IP carries ${input.ipProxy.kind} markers`, "MEDIUM", input.ipProxy.note, "IP");
    }
  }

  // --- Threat-intel blocklist hits ---
  if (input.threatIps?.length) {
    points += Math.min(24, input.threatIps.length * 12);
    push(signals, "intel-ip", "Originating IP appears on a DNS blocklist", "HIGH", input.threatIps.join("; "), "THREAT_INTELLIGENCE");
  }
  if (input.threatDomains?.length) {
    points += Math.min(24, input.threatDomains.length * 12);
    push(signals, "intel-domain", "Sender domain appears on a DNS blocklist", "HIGH", input.threatDomains.join("; "), "THREAT_INTELLIGENCE");
  }

  // --- Weak note when origin unreconstructable ---
  if (input.hasOriginatingIp === false) {
    points += 3;
    push(signals, "no-origin", "No public originating IP could be reconstructed", "LOW", undefined, "IP");
  }

  const capped = Math.min(100, points);
  const level = riskLevelForScore(capped);
  const strongCount = signals.filter((s) => s.severity === "HIGH" || s.severity === "CRITICAL").length;

  let summary: string;
  if (level === "SAFE") summary = "The sender identity and sending infrastructure show no significant risk signals.";
  else if (level === "LOW") summary = "A small number of weak sender-side signals were found; none are decisive on their own.";
  else if (level === "MEDIUM") summary = "Several sender-side signals warrant caution, but have not crossed into clear impersonation.";
  else if (level === "HIGH") summary = "Sender identity and/or sending host show strong mismatches. Treat the sender as unverified.";
  else summary = "Sender identity is strongly contradicted by multiple independent signal groups. Assume the sender is forged.";

  return {
    score: capped,
    level,
    summary,
    confidence: signals.length > 0 ? Math.min(0.9, 0.35 + signals.length * 0.1) : 0,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Content risk — derived ONLY from message-body / link / attachment evidence.
// Language is NEVER a content-risk signal and never flags a message by itself.
// ---------------------------------------------------------------------------

export function assessContentRisk(input: {
  nlpScore?: number;
  nlpTriggers?: string[];
  ml?: MlEmailClassification;
  mlPoints?: number;
  becDetected?: boolean;
  becScore?: number;
  harassmentScore?: number;
  harassmentLevel?: string;
  urlRisk?: UrlRiskAnalysis[];
  suspiciousAttachments?: AttachmentAnalysis[];
}): RiskDimensionAssessment {
  const signals: RiskSignal[] = [];
  let points = 0;

  // NLP / phishing language triggers (weighted down — a trigger is a lure, not proof).
  const nlpUnderlying = Math.min(100, input.nlpScore ?? 0);
  const nlpPts = Math.round(nlpUnderlying * 0.3);
  const nlpCount = input.nlpTriggers?.length ?? 0;
  if (nlpCount > 0) {
    points += nlpPts;
    push(signals, "nlp", "The message uses manipulation language common in fraud (urgency, credential/finance lures)", nlpPts >= 20 ? "HIGH" : "MEDIUM", undefined, "NLP_SOCIAL_ENGINEERING");
  }

  // ML classifier (statistical, never standalone).
  const mlPts = Math.min(30, input.mlPoints ?? 0);
  if (mlPts > 0 && input.ml?.label) {
    points += mlPts;
    push(signals, "ml", `Trained classifier labels this content "${input.ml.label}"`, input.ml.label === "phishing" || input.ml.label === "impersonated" || input.ml.label === "fraud-related" ? "HIGH" : "MEDIUM", undefined, "NLP_SOCIAL_ENGINEERING");
  }

  // BEC behavioural profile.
  if (input.becDetected) {
    const becPts = Math.min(25, Math.round((input.becScore ?? 0) * 0.25));
    points += becPts;
    push(signals, "bec", "Business Email Compromise behavioural markers detected (money/secrecy/urgency language)", becPts >= 15 ? "HIGH" : "MEDIUM", undefined, "NLP_SOCIAL_ENGINEERING");
  }

  // Harassment / credible threat engine (intentionally strong for this product).
  if (input.harassmentScore != null && (input.harassmentScore ?? 0) > 0) {
    const hs = Math.max(0, Math.min(100, input.harassmentScore));
    points += Math.round(hs * 0.8);
    push(signals, "harassment", `Content matches a credible-threat profile (${input.harassmentLevel ?? "flagged"})`, hs >= 65 ? "CRITICAL" : "HIGH", undefined, "ANOMALY");
  }

  // URL shape risk.
  const suspiciousUrls = (input.urlRisk ?? []).filter((u) => u.severity !== "LOW");
  if (suspiciousUrls.length > 0) {
    const urlPts = Math.min(20, suspiciousUrls.length * 5);
    points += urlPts;
    push(signals, "url", `${suspiciousUrls.length} embedded link(s) match risky shape patterns`, suspiciousUrls.some((u) => u.severity === "HIGH") ? "HIGH" : "MEDIUM", undefined, "URL");
  }

  // Attachment structure risk.
  const attach = input.suspiciousAttachments ?? [];
  if (attach.length > 0) {
    const attachPts = Math.min(15, attach.length * 5);
    points += attachPts;
    push(signals, "attachment", `${attach.length} attachment(s) carry suspicious structural characteristics`, attach.some((a) => a.executable || a.scriptLike) ? "HIGH" : "MEDIUM", attach.map((a) => a.filename).join("; "), "ATTACHMENT");
  }

  const capped = Math.min(100, points);
  const level = riskLevelForScore(capped);

  let summary: string;
  if (level === "SAFE") summary = "The message content shows no notable manipulation, malicious-link or unsafe-attachment signals.";
  else if (level === "LOW") summary = "A few weak content signals are present; none are decisive on their own.";
  else if (level === "MEDIUM") summary = "The content uses manipulation techniques or contains risky links/attachments — do not act on it without independent verification.";
  else if (level === "HIGH") summary = "Multiple independent content signals indicate manipulation or fraud lures.";
  else summary = "Content strongly matches fraud/manipulation patterns. Do not follow links, enter credentials, or open attachments.";

  return {
    score: capped,
    level,
    summary,
    confidence: signals.length > 0 ? Math.min(0.9, 0.35 + signals.length * 0.1) : 0,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Overall assessment — combines sender + content the way the legacy threat
// score did (max-plus-capped), preserving backward-compatible threatLevel.
// ---------------------------------------------------------------------------

export function assessOverall(
  sender: RiskDimensionAssessment,
  content: RiskDimensionAssessment,
  legacyThreatScore: number,
  legacyThreatLevel: RiskLevel
): RiskDimensionAssessment {
  const combined = Math.max(
    legacyThreatScore,
    sender.score * 0.6,
    content.score * 0.6
  );
  const score = Math.min(100, Math.round(combined));
  const level = legacyThreatLevel;

  const signals = [
    ...sender.signals.filter((s) => s.severity !== "SAFE").slice(0, 3),
    ...content.signals.filter((s) => s.severity !== "SAFE").slice(0, 3),
  ];

  return {
    score,
    level,
    summary:
      level === "SAFE"
        ? "No correlated threat signals were detected across sender identity or content."
        : "Sender-identity and content signals are assessed separately above; the overall level reflects their combined weight.",
    confidence: Math.min(0.9, (sender.confidence + content.confidence) / 2 + (sender.signals.length && content.signals.length ? 0.15 : 0)),
    signals,
  };
}

// ---------------------------------------------------------------------------
// Suspicion reasoning — concise headlines + a detailed expandable payload.
// ---------------------------------------------------------------------------

export function buildSuspicionReasons(input: {
  sender: RiskDimensionAssessment;
  content: RiskDimensionAssessment;
  auth?: EmailAuthentication;
  spoofing?: SpoofingComposite;
  nlpTriggers?: string[];
  urlRisk?: UrlRiskAnalysis[];
  attachments?: AttachmentAnalysis[];
  threatIps?: string[];
  threatDomains?: string[];
  rdapAgeDays?: number | null;
  rdapSignals?: string[];
}): SuspicionReason[] {
  const reasons: SuspicionReason[] = [];

  const highSignals = (dim: RiskDimensionAssessment, cat: SuspicionReason["category"]) =>
    dim.signals.filter((s) => s.severity !== "SAFE").map((s) => ({
      headline: s.label,
      severity: s.severity,
      category: cat,
      detail: s.detail ?? s.label,
      evidence: [],
    }));

  // Sender identity
  if (input.spoofing?.detected) {
    reasons.push({
      headline: "The visible sender may not be who it claims to be.",
      severity: input.spoofing.lookalikeDetected || input.spoofing.homoglyphDetected || input.spoofing.punycodeDetected ? "HIGH" : "MEDIUM",
      category: "Sender Identity",
      detail:
        "The email's visible sender identity does not match its real addressing: reply/return domains differ from the From domain, the domain mimics a trusted brand, or the SMTP envelope sender disagrees with the From header. This is a classic impersonation technique, but it is a signal — a mismatched envelope can also appear on legitimate bulk senders.",
      evidence: input.spoofing.signals.slice(0, 4),
    });
  }

  // Authentication
  const auth = input.auth;
  if (auth) {
    const fails = [
      auth.spf.status === "fail" && "SPF failed",
      auth.dkim.status === "fail" && "DKIM failed",
      auth.dmarc.status === "fail" && "DMARC failed",
    ].filter(Boolean) as string[];
    const neutrals = [
      auth.spf.status === "neutral" && "SPF inconclusive",
      auth.dkim.status === "neutral" && "DKIM inconclusive",
      auth.dmarc.status === "neutral" && "DMARC inconclusive",
    ].filter(Boolean) as string[];
    if (fails.length > 0) {
      reasons.push({
        headline: "Email authentication failed — the sender identity is unverified.",
        severity: "HIGH",
        category: "Authentication",
        detail:
          "One or more authentication checks failed (SPF/DKIM/DMARC). A single failed check alone does not prove phishing, but it removes the protection that legitimizes the sender. Treat the sender identity as unverified and confirm through a separate, known channel.",
        evidence: fails,
      });
    } else if (neutrals.length > 0) {
      reasons.push({
        headline: "Email authentication was inconclusive for some checks.",
        severity: "MEDIUM",
        category: "Authentication",
        detail:
          "Some authentication checks returned an inconclusive result (neutral/none). This limits how strongly we can verify the sender, but is not proof of fabrication.",
        evidence: neutrals,
      });
    }
  }

  // Content manipulation
  const contentHigh = input.content;
  const nlp = input.nlpTriggers ?? [];
  if (contentHigh.level !== "SAFE") {
    reasons.push({
      headline: "The message uses language or lures commonly found in fraud.",
      severity: contentHigh.level === "HIGH" || contentHigh.level === "CRITICAL" ? "HIGH" : "MEDIUM",
      category: "Content Manipulation",
      detail:
        "The message body, subject, or links match manipulation patterns — urgency, credential/finance requests, or impersonation phrasing. This is a content signal only and does not by itself prove the sender is malicious; it describes what the message is asking you to do.",
      evidence: nlp.slice(0, 4),
    });
  }

  // Links & attachments
  const urls = (input.urlRisk ?? []).filter((u) => u.severity !== "LOW");
  const riskyAttachment = (input.attachments ?? []).filter((a) => a.suspicious);
  if (urls.length > 0 || riskyAttachment.length > 0) {
    reasons.push({
      headline: `${urls.length} link(s) and ${riskyAttachment.length} attachment(s) raise risk flags.`,
      severity: urls.some((u) => u.severity === "HIGH") || riskyAttachment.some((a) => a.executable || a.scriptLike) ? "HIGH" : "MEDIUM",
      category: "Links & Attachments",
      detail:
        "Links in this email are hosted on suspicious domains, shorteners, IP literals, or credential-verification paths; attachments carry executable/script/double-extension characteristics. Links are inspected by shape only and never opened. Do not click or open them.",
      evidence: [
        ...urls.slice(0, 2).map((u) => u.url),
        ...riskyAttachment.slice(0, 2).map((a) => `${a.filename} (${a.extension || "no ext"})`),
      ],
    });
  }

  // Corroborating intelligence
  const corroborations: string[] = [];
  let corrSeverity: SuspicionReason["severity"] = "MEDIUM";
  for (const ip of input.threatIps ?? []) corroborations.push(`IP listed: ${ip}`);
  for (const d of input.threatDomains ?? []) corroborations.push(`Sender domain listed: ${d}`);
  if (input.rdapAgeDays != null && input.rdapAgeDays <= 30) corroborations.push(`Domain registered ${input.rdapAgeDays} day(s) ago`);
  if (input.rdapSignals?.length) corroborations.push("Domain registration abuse flags");
  if (corroborations.length >= 2) corrSeverity = "HIGH";
  if (corroborations.length > 0) {
    reasons.push({
      headline: "Independent checks partially corroborate the risk signals.",
      severity: corrSeverity,
      category: "Corroborating Intelligence",
      detail:
        "Independent lookups (DNS blocklists / domain registration) returned markers consistent with fraud infrastructure. These are corroborating signals, never conclusive by themselves — blocklists carry false positives and a young domain can be a legitimate new service.",
      evidence: corroborations.slice(0, 4),
    });
  }

  // Nothing flagged
  if (reasons.length === 0) {
    reasons.push({
      headline: "No significant suspicious signals were detected.",
      severity: "SAFE",
      category: "Sender Identity",
      detail:
        "Across authentication, sender identity, message content, links and attachments, no notable suspicious signal was found. This does not guarantee legitimacy, but nothing in the evaluated signals demands alarm.",
      evidence: [],
    });
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// SPF/DKIM/DMARC presentation tokens (careful, honest labels).
// ---------------------------------------------------------------------------

export function authVerdictPresentation(
  status: string | undefined,
  dnsCorroborated?: boolean
): AuthVerdictPresentation {
  switch (status) {
    case "pass":
      return {
        label: "Verified Pass",
        tone: "pass",
        explanation:
          "The last relay reported this check passed. This authenticates the sender identity — it does not make the message content trustworthy.",
      };
    case "fail":
      return {
        label: "Suspicious Signal",
        tone: "fail",
        explanation:
          "The check failed or was not authorized by the domain's policy. A single failed check alone does not prove phishing, but it is a strong signal to treat the sender identity as unverified.",
      };
    case "softfail":
      return {
        label: "Soft Fail",
        tone: "warn",
        explanation:
          "The domain policy leans against authorizing this sender but is not a hard reject. The sender identity is not reliably verified; treat it as unconfirmed.",
      };
    case "temperror":
      return {
        label: "Temporary Error",
        tone: "unknown",
        explanation:
          "The receiving system could not evaluate this check (temporary failure). No verdict was reached — this is a technical limitation, not an authentication result.",
      };
    case "permerror":
      return {
        label: "Permanent Error",
        tone: "warn",
        explanation:
          "The administrative domain of the sending address had a broken or syntactically invalid policy, so this check could not be evaluated. This does not, by itself, prove the sender is malicious.",
      };
    case "neutral":
      return {
        label: "Elevated Concern",
        tone: "warn",
        explanation:
          "The check returned an inconclusive/soft result — the domain's policy does not definitively authorize or reject this sender. Sender identity remains unverified.",
      };
    case "none":
      return {
        label: "Insufficient Evidence",
        tone: "neutral",
        explanation:
          "No usable result for this check was present in the Authentication-Results header. Absence of a verdict is not proof of a problem, but leaves the sender unverified.",
      };
    default:
      return {
        label: "Validation Unavailable",
        tone: "unknown",
        explanation:
          "The check could not be evaluated from the available headers. This does not indicate either success or failure.",
      };
  }
}

// ---------------------------------------------------------------------------
// Threat validation states for indicators (extract -> validate stage).
// ---------------------------------------------------------------------------

export function validationRecord(
  state: ThreatValidationState,
  source?: string,
  detail?: string
): ThreatValidationRecord {
  const labels: Record<ThreatValidationState, string> = {
    "not-checked": "Not Checked",
    "checked-no-match": "Checked — No Match",
    match: "Match Found",
    "validation-unavailable": "Validation Unavailable",
    "validation-failed": "Validation Failed",
    conflicting: "Conflicting Results",
  };
  return { state, label: labels[state], source, detail };
}

/**
 * Map a DNS-blocklist lookup outcome onto the six validation states.
 */
export function blocklistValidation(
  queried: boolean,
  listed: boolean,
  source: string
): ThreatValidationRecord {
  if (!queried) return validationRecord("validation-failed", source, "The blocklist lookup could not complete (network or DNS error).");
  if (listed) return validationRecord("match", source, "Listed — corroborating evidence, not a standalone verdict.");
  return validationRecord("checked-no-match", source, "Queried successfully; no blocklist match.");
}

// ---------------------------------------------------------------------------
// Finding-derived summaries for the report builder.
// ---------------------------------------------------------------------------

export function relevanceFindingRef(f: ForensicFinding): string {
  return `${f.category}:${f.description}`;
}
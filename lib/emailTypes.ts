export interface EmailHeaderAnalysis {
  from?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  returnPath?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  received: string[];
  authenticationResults?: string;
  rawHeaders: string;
  sender?: string;
  contentType?: string;
  xOriginatingIp?: string;
  xMailer?: string;
  userAgent?: string;
  dkimSignature?: string;
  arcHeaders?: string[];
  replyDomain?: string;
  senderDomain?: string;
}

export interface AuthenticationResult {
  status: "pass" | "fail" | "neutral" | "none" | "unknown";
  /**
   * Verbatim status token from the Authentication-Results header when one was
   * present (e.g. "softfail", "temperror", "permerror"). The normalized
   * `status` above stays backward-compatible; this preserves the precise raw
   * verdict so the UI can label Soft Fail / Temporary Error / Permanent Error
   * without inventing results.
   */
  rawStatus?: string;
  details?: string;
  scope?: {
    mailfrom?: string;
    headerD?: string;
    clientIp?: string;
    policy?: string;
    disposition?: string;
    selector?: string;
    fromDomain?: string;
  };
}

export interface EmailAuthentication {
  spf: AuthenticationResult;
  dkim: AuthenticationResult;
  dmarc: AuthenticationResult;
}

export interface SMTPHop {
  from?: string;
  by?: string;
  timestamp?: string;
  timestampIso?: string;
  timezone?: string;
  ip?: string;
  raw: string;
}

export interface IPIntelligence {
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  organization?: string;
  asn?: string;
  provenance?: "VERIFIED" | "INFERRED" | "UNAVAILABLE";
}

export interface DomainIntelligence {
  domain: string;
  mx?: string[];
  ns?: string[];
  suspicious?: boolean;
  ageDays?: number;
  provenanceDone?: boolean;
}

export interface RdapDomainRecord {
  domain: string;
  registrar: string | null;
  created: string | null;
  expires: string | null;
  updated: string | null;
  registrantName: string | null;
  registrantCountry: string | null;
  status: string[] | null;
  nameservers: string[];
  ageDays: number | null;
  rdapProvider: string;
  /** Optional corroborating fraud/abuse flag list surfaced by the RDAP layer. */
  fraudSignals?: string[];
}

export interface ThreatIndicator {
  type: "ip" | "domain" | "url" | "email";
  value: string;
  source?: string;
  malicious?: boolean;
  confidence?: number;
  /**
   * Result of the external validation stage (blocklist/threat-intel lookups).
   * Unset when the stage never ran for this indicator.
   */
  validation?: ThreatValidationRecord;
}

/**
 * Threat validation stage states. These distinguish *whether and how* an
 * independent check (blocklist / threat-intel / DNS) ran and what it returned —
 * never conflating "not checked" with a clean result.
 */
export type ThreatValidationState =
  | "not-checked"
  | "checked-no-match"
  | "match"
  | "validation-unavailable"
  | "validation-failed"
  | "conflicting";

export interface ThreatValidationRecord {
  state: ThreatValidationState;
  /** User-facing label, e.g. "Checked — No Match". */
  label: string;
  detail?: string;
  /** Which source produced the result, e.g. "Spamhaus ZEN (DNS over HTTPS)". */
  source?: string;
}

/**
 * Uniform risk dimension used for the separated Sender Risk / Content Risk /
 * Overall assessments. Each dimension is scored independently so a sender-identity
 * failure never by itself proves malicious content (and vice-versa).
 */
export type RiskLevel = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskSignal {
  id: string;
  label: string;
  severity: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detail?: string;
  /** Reference to the forensic finding / evidence that backs this signal. */
  evidenceRef?: string;
}

export interface RiskDimensionAssessment {
  score: number; // 0..100
  level: RiskLevel;
  summary: string;
  confidence: number; // 0..1
  signals: RiskSignal[];
}

/**
 * Concise + detailed suspicion reasoning. The headline is safe to show inline;
 * the detailed object backs an accessible expandable/modal view.
 */
export interface SuspicionReason {
  headline: string;
  severity: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category:
    | "Sender Identity"
    | "Authentication"
    | "Content Manipulation"
    | "Links & Attachments"
    | "Corroborating Intelligence";
  detail: string;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Language / script analysis (supporting signal only — never a verdict label,
// never an identity/geographic claim). See lib/languageAnalysis.ts.
// ---------------------------------------------------------------------------

export interface LanguageAnalysis {
  /** Dominant writing system(s), e.g. "Latin", "Devanagari", "Mixed (Latin+Devanagari)". */
  script: string;
  /** Informational hints, e.g. "code-mixed vernacular markers detected". */
  hints: string[];
  /** Detection confidence for the *script*, which is the only thing asserted. */
  confidence: "high" | "medium" | "low";
  /** Always true: language output is a supporting signal only. */
  supporting: true;
  /** Explicit caveat text shown next to the analysis. */
  caveat: string;
}

// ---------------------------------------------------------------------------
// Pipeline stage metadata (extract -> normalize -> validate -> correlate).
// ---------------------------------------------------------------------------

export type PipelineStageName =
  | "extract"
  | "normalize"
  | "validate"
  | "correlate";

export interface PipelineStage {
  name: PipelineStageName;
  description: string;
  completed: boolean;
  artifacts: string[];
}

// ---------------------------------------------------------------------------
// Auth presentation tokens for SPF/DKIM/DMARC (DB-friendly label mapping).
// ---------------------------------------------------------------------------

export type AuthVerdictLabel =
  | "Verified Pass"
  | "Suspicious Signal"
  | "Soft Fail"
  | "Temporary Error"
  | "Permanent Error"
  | "Elevated Concern"
  | "Insufficient Evidence"
  | "Validation Unavailable";

export interface AuthVerdictPresentation {
  label: AuthVerdictLabel;
  /** Tone drives chip styling: pass/concern/warn/neutral/unknown. */
  tone: "pass" | "fail" | "warn" | "neutral" | "unknown";
  explanation: string;
}

export type ForensicCategory =
  | "AUTHENTICATION"
  | "SENDER_SPOOFING"
  | "DOMAIN"
  | "IP"
  | "SMTP_ROUTING"
  | "URL"
  | "ATTACHMENT"
  | "NLP_SOCIAL_ENGINEERING"
  | "THREAT_INTELLIGENCE"
  | "ANOMALY";

export interface ForensicFinding {
  id: string;
  category: ForensicCategory;
  severity: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number; // 0..1
  description: string;
  technicalEvidence: string;
  humanExplanation: string;
  recommendedAction: string;
  /**
   * INSEQ hygiene: explicit validation status for this finding (e.g.
   * "Validation Unavailable", "Checked — No Match", "Match Found"). Distinct
   * from `confidence`; a finding can be observed (description) without being
   * independently validated.
   */
  validationStatus?: string;
  /**
   * INSEQ hygiene: a possible benign explanation for the observed signal, so
   * findings are never presented as definitive proof of malicious activity.
   */
  benignExplanation?: string;
  caseId?: string;
}

export interface SMTPAnomaly {
  type:
    | "private_ip"
    | "timestamp_inconsistency"
    | "hostname_ip_mismatch"
    | "geographic_jump"
    | "missing_timestamp"
    | "loopback_ip";
  severity: "SAFE" | "LOW" | "MEDIUM" | "HIGH";
  confidence: number; // 0..1
  description: string;
  evidence: string;
}

export interface ScoreContribution {
  group: string;
  points: number;
  reason: string;
}

export interface ScoreBreakdown {
  total: number;
  groups: ScoreContribution[];
}

export interface ForensicVerdict {
  level: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number; // 0..1
  summary: string;
  contributingSignals: string[];
}

export interface AttachmentAnalysis {
  filename: string;
  extension?: string;
  mimeType?: string;
  sizeEstimateBytes?: number;
  doubleExtension: boolean;
  executable: boolean;
  scriptLike: boolean;
  archive: boolean;
  macroHint: boolean;
  suspicious: boolean;
}

export interface ExtractedEntity {
  type: "phone" | "amount" | "date" | "account" | "organization" | "url" | "email" | "ip" | "domain";
  value: string;
  context?: string;
}

export interface SpoofingComposite {
  detected: boolean;
  score: number; // 0..100
  confidence: number; // 0..1
  signals: string[];
  lookalikeDetected: boolean;
  lookalikeCandidates: Array<{ domain: string; looksLike: string; distance: number }>;
  punycodeDetected: boolean;
  homoglyphDetected: boolean;
  envelopeMismatchDetected: boolean;
  brandsLikelyImpersonated: string[];
}

export type PhishingCategory =
  | "urgency"
  | "credential_harvesting"
  | "financial_fraud"
  | "malware_delivery"
  | "impersonation"
  | "url_pattern";

export interface PhishingTriggerDetail {
  phrase: string;
  category: PhishingCategory;
  weight: number;
  evidence: string;
}

export interface NlpAnalysisResult {
  model: string;
  categoriesDetected: PhishingCategory[];
  triggerCount: number;
  rawScore: number;
  detail: PhishingTriggerDetail[];
  disclaimer: string;
}

/**
 * Result of the trained ML/NLP email classifier (see lib/ml + DATASET.md).
 * Distinct from `nlp` (the deterministic keyword provider): this is a real
 * multinomial logistic-regression model on TF-IDF features. `available` is
 * false when no trained artifact exists at runtime — the pipeline then never
 * fabricates an ML answer.
 */
export interface MlEmailClassification {
  available: boolean;
  label?: "legitimate" | "suspicious" | "impersonated" | "phishing" | "fraud-related";
  confidence?: number;
  margin?: number;
  probabilities?: Record<string, number>;
  unavailableReason?: string;
  model?: {
    dataset: string;
    trainSize: number;
    testSize: number;
    accuracy: number;
    precisionMacro: number;
    recallMacro: number;
    f1Macro: number;
  };
}

export interface UrlRiskAnalysis {
  url: string;
  flags: string[];
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  evidence: string;
}

import type { BecAnalysis } from "./bec/bec";
import type { DnsAuthVerification } from "./auth";
import type { ProxyEnrichment } from "./ipIntelligence";
import type { ThreatIntelResult } from "./intel/dnsbl";
import type { EnrichmentReport } from "./intel/orchestrator";
import type { InvestigationGraph } from "./graph";
import type { AttributionAnalysis } from "./attribution";
import type { Alert } from "./alerts";
import type { PrivacyRedaction } from "./privacy/masking";

export interface EmailAnalysisResult {
  id: string;
  analyzedAt: string;
  headers: EmailHeaderAnalysis;
  authentication: EmailAuthentication;
  senderDomain?: string;
  senderSpoofingDetected: boolean;
  smtpPath: SMTPHop[];
  originatingIP?: string;
  ipIntelligence?: IPIntelligence;
  ipProxy?: ProxyEnrichment;
  domainIntelligence?: DomainIntelligence;
  rdap?: RdapDomainRecord;
  threatIntel?: ThreatIntelResult;
  /**
   * External/internal/model threat-intel enrichment (Step I3b). Present
   * when the enrichment stage ran; per-provider typed statuses, never
   * merged into scores. Absent in offline mode or on stage failure.
   */
  externalIntel?: EnrichmentReport;
  investigationGraph?: InvestigationGraph;
  attribution?: AttributionAnalysis;
  alerts?: Alert[];
  privacy?: PrivacyRedaction;
  relatedDomainIntelligence?: DomainIntelligence[];
  indicatorCorrelations?: Array<{
    indicator: ThreatIndicator;
    relatedFindings: string[];
    risk: "LOW" | "MEDIUM" | "HIGH";
    reason: string;
  }>;
  indicators: ThreatIndicator[];
  threatLevel: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threatScore: number;
  findings: string[];
  recommendations: string[];
  structuredFindings?: ForensicFinding[];
  spoofing?: SpoofingComposite;
  smtpAnomalies?: SMTPAnomaly[];
  attachments?: AttachmentAnalysis[];
  entities?: ExtractedEntity[];
  scoreBreakdown?: ScoreBreakdown;
  verdict?: ForensicVerdict;
  nlp?: NlpAnalysisResult;
  ml?: MlEmailClassification;
  bec?: BecAnalysis;
  dnsAuth?: DnsAuthVerification;
  urlRisk?: UrlRiskAnalysis[];
  senderRisk?: RiskDimensionAssessment;
  contentRisk?: RiskDimensionAssessment;
  overallAssessment?: RiskDimensionAssessment;
  suspicionReasons?: SuspicionReason[];
  language?: LanguageAnalysis;
  pipelineStages?: PipelineStage[];
}

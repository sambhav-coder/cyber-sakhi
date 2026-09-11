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

export interface ThreatIndicator {
  type: "ip" | "domain" | "url" | "email";
  value: string;
  source?: string;
  malicious?: boolean;
  confidence?: number;
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

export interface UrlRiskAnalysis {
  url: string;
  flags: string[];
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  evidence: string;
}

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
  domainIntelligence?: DomainIntelligence;
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
  urlRisk?: UrlRiskAnalysis[];
}

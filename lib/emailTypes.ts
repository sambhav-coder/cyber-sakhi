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
}

export interface AuthenticationResult {
  status: "pass" | "fail" | "neutral" | "none" | "unknown";
  details?: string;
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
}

export interface DomainIntelligence {
  domain: string;
  mx?: string[];
  ns?: string[];
  suspicious?: boolean;
  ageDays?: number;
}

export interface ThreatIndicator {
  type: "ip" | "domain" | "url" | "email";
  value: string;
  source?: string;
  malicious?: boolean;
  confidence?: number;
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
}

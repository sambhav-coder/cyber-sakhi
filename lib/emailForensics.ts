import { lookupIpIntelligence } from "./ipIntelligence";
import { lookupDomainIntelligence } from "./domainIntelligence";
import { correlateIndicators } from "./indicatorCorrelation";
import {
  EmailAnalysisResult,
  EmailAuthentication,
  AuthenticationResult,
  ThreatIndicator,
} from "./emailTypes";
import { extractHeaders, reconstructSMTPPath } from "./emailParser";

// ---------------------------------------------------------------------------
// 1. SPF / DKIM / DMARC — extract verdicts from Authentication-Results header
// ---------------------------------------------------------------------------

function parseAuthStatus(
  raw: string,
  protocol: "spf" | "dkim" | "dmarc"
): AuthenticationResult {
  if (!raw) return { status: "none", details: "Authentication-Results header absent" };

  // Find the protocol-specific segment, e.g. "spf=pass", "dkim=fail", "dmarc=none"
  const pattern = new RegExp(
    `${protocol}\\s*=\\s*(pass|fail|neutral|none|softfail|temperror|permerror|unknown)([^;\\r\\n]*)`,
    "i"
  );
  const match = raw.match(pattern);

  if (!match) {
    return {
      status: "none",
      details: `No ${protocol.toUpperCase()} record found in Authentication-Results`,
    };
  }

  const rawStatus = match[1].toLowerCase();
  // Normalize extended statuses to our union type
  const status: AuthenticationResult["status"] =
    rawStatus === "pass"
      ? "pass"
      : rawStatus === "fail" || rawStatus === "permerror"
      ? "fail"
      : rawStatus === "neutral" || rawStatus === "none"
      ? "neutral"
      : rawStatus === "softfail" || rawStatus === "temperror"
      ? "neutral"
      : "unknown";

  const details = (match[2] || "").trim().replace(/^\(|\)$/g, "").trim() || undefined;

  return { status, details };
}

function parseAuthentication(authResults?: string): EmailAuthentication {
  return {
    spf: parseAuthStatus(authResults || "", "spf"),
    dkim: parseAuthStatus(authResults || "", "dkim"),
    dmarc: parseAuthStatus(authResults || "", "dmarc"),
  };
}

// ---------------------------------------------------------------------------
// 2. Sender domain extraction helpers
// ---------------------------------------------------------------------------

function extractEmailAddress(header?: string): string | undefined {
  if (!header) return undefined;
  // Match angle-bracket address first: "Display Name <user@domain.com>"
  const angleMatch = header.match(/<([^>@\s]+@[^>@\s]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase().trim();
  // Fallback: bare email address
  const bareMatch = header.match(/\b([^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+)\b/);
  return bareMatch?.[1].toLowerCase().trim();
}

function extractDomain(emailOrHeader?: string): string | undefined {
  const email = extractEmailAddress(emailOrHeader) || emailOrHeader;
  if (!email) return undefined;
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return undefined;
  return email.slice(atIdx + 1).toLowerCase().replace(/[>)\s].*/, "").trim();
}

// ---------------------------------------------------------------------------
// 3. Spoofing detection
// ---------------------------------------------------------------------------

interface SpoofingResult {
  detected: boolean;
  signals: string[];
}

function detectSpoofing(
  fromHeader?: string,
  replyTo?: string,
  returnPath?: string,
  smtpEnvelopeFrom?: string // extracted from the last external Received header
): SpoofingResult {
  const signals: string[] = [];

  const fromDomain = extractDomain(fromHeader);
  const replyToDomain = extractDomain(replyTo);
  const returnPathDomain = extractDomain(returnPath);
  const envelopeDomain = extractDomain(smtpEnvelopeFrom);

  // Signal 1: Reply-To domain differs from From domain (classic phishing trick)
  if (replyToDomain && fromDomain && replyToDomain !== fromDomain) {
    signals.push(
      `Reply-To domain (${replyToDomain}) differs from From domain (${fromDomain})`
    );
  }

  // Signal 2: Return-Path domain differs from From domain (envelope spoofing)
  if (returnPathDomain && fromDomain && returnPathDomain !== fromDomain) {
    signals.push(
      `Return-Path domain (${returnPathDomain}) differs from From domain (${fromDomain})`
    );
  }


  // Signal 4: Missing Return-Path (legitimate mailers always include it)
  if (!returnPath) {
    signals.push("Return-Path header is absent — legitimate mailers always set this");
  }

  // Signal 5: From display name contains a different domain than the actual address
  if (fromHeader) {
    const displayNameDomainMatch = fromHeader.match(/@([\w.-]+)\b(?=.*<)/);
    const actualFromDomain = fromDomain;
    if (
      displayNameDomainMatch &&
      actualFromDomain &&
      displayNameDomainMatch[1].toLowerCase() !== actualFromDomain
    ) {
      signals.push(
        `Display name in From header references domain "${displayNameDomainMatch[1]}" but actual sender domain is "${actualFromDomain}"`
      );
    }
  }

  return {
    detected: signals.length > 0,
    signals,
  };
}

// ---------------------------------------------------------------------------
// 4. Phishing / content scoring (subject + body keywords)
// ---------------------------------------------------------------------------

interface PhishingResult {
  score: number; // 0–100
  triggers: string[];
}

const PHISHING_RULES: Array<{ regex: RegExp; weight: number; trigger: string }> = [
  // Urgency / account threat
  { regex: /your\s+account\s+(has\s+been\s+)?(suspended|blocked|locked|disabled|terminated)/i, weight: 30, trigger: "Account suspension threat" },
  { regex: /verify\s+(your\s+)?(account|email|identity|payment|details)/i, weight: 20, trigger: "Verification demand" },
  { regex: /action\s+required|immediate\s+action|act\s+now|respond\s+immediately/i, weight: 20, trigger: "Urgency language" },
  { regex: /within\s+\d+\s+(hours?|minutes?|days?)\s+(or\s+)?(your\s+account|access)/i, weight: 25, trigger: "Time-pressure deadline" },
  // Credential harvesting
  { regex: /click\s+(here|below|this\s+link)\s+to\s+(login|log\s+in|sign\s+in|confirm|reset|verify)/i, weight: 25, trigger: "Click-here login redirect" },
  { regex: /reset\s+your\s+password|update\s+your\s+password|confirm\s+your\s+password/i, weight: 15, trigger: "Password reset lure" },
  { regex: /enter\s+your\s+(otp|pin|password|credentials|credit\s+card|cvv|bank)/i, weight: 35, trigger: "Credential entry demand" },
  // Financial lures
  { regex: /won\s+(a\s+)?(lottery|prize|award|reward|gift|cash)/i, weight: 30, trigger: "Lottery/prize lure" },
  { regex: /unclaimed\s+(funds?|money|refund|reward)|pending\s+transfer|release\s+of\s+funds/i, weight: 25, trigger: "Unclaimed funds lure" },
  { regex: /kyc\s+(update|verification|suspended|required)|pan\s+card\s+(link|update)/i, weight: 30, trigger: "KYC/PAN phishing" },
  { regex: /income\s+tax\s+refund|it\s+department|gst\s+refund/i, weight: 25, trigger: "Fake government refund" },
  { regex: /upi\s+(blocked|suspended|limit)|aadhaar\s+(link|update|expired)/i, weight: 30, trigger: "UPI/Aadhaar phishing" },
  // Malware delivery
  { regex: /open\s+the\s+attachment|see\s+attached\s+(file|document|invoice)/i, weight: 15, trigger: "Suspicious attachment prompt" },
  { regex: /(invoice|receipt|shipment|delivery|parcel)\s+(attached|enclosed|is\s+ready)/i, weight: 10, trigger: "Fake invoice/delivery attachment" },
  // Impersonation keywords
  { regex: /paypal|amazon|hdfc|sbi|icici|axis\s+bank|rbi|irdai|sebi|nsdl|npci|google\s+security|microsoft\s+security/i, weight: 10, trigger: "Known-brand impersonation keyword" },
  { regex: /dear\s+(valued\s+)?(customer|user|member|client|subscriber)/i, weight: 10, trigger: "Generic impersonal salutation" },
];

const PHISHING_URL_PATTERNS: RegExp[] = [
  /https?:\/\/(?!\S*(google|microsoft|amazon|facebook|apple)\.(com|in|co\.in))\S+\.(click|xyz|top|tk|ml|ga|cf|gq|ru|cn|pw|cc|bid|review|loan|win|stream)\b/i,
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,            // IP-based URL
  /https?:\/\/[^/\s]+\.[^/\s]+\/[a-z0-9]{20,}/i,              // Long random path
  /bit\.ly|tinyurl|t\.co|ow\.ly|is\.gd|buff\.ly|goo\.gl/i,   // URL shorteners
];

function scorePhishing(text: string): PhishingResult {
  if (!text.trim()) return { score: 0, triggers: [] };

  const triggers: string[] = [];
  let score = 0;

  for (const rule of PHISHING_RULES) {
    if (rule.regex.test(text)) {
      triggers.push(rule.trigger);
      score += rule.weight;
    }
  }

  for (const urlPattern of PHISHING_URL_PATTERNS) {
    if (urlPattern.test(text)) {
      triggers.push("Suspicious / shortened URL pattern detected");
      score += 20;
      break;
    }
  }

  return { score: Math.min(100, score), triggers };
}

// ---------------------------------------------------------------------------
// 5. URL and indicator extraction
// ---------------------------------------------------------------------------

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return [...new Set(matches)];
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi) || [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

function extractIpAddresses(text: string): string[] {
  const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  const filtered = ipv4.filter((ip) => {
    // Exclude private/loopback ranges
    const parts = ip.split(".").map(Number);
    if (parts[0] === 127) return false;            // loopback
    if (parts[0] === 10) return false;             // RFC1918
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 0) return false;
    if (parts.some((p) => p > 255)) return false;
    return true;
  });
  return [...new Set(filtered)];
}

// ---------------------------------------------------------------------------
// 6. Composite threat scoring
// ---------------------------------------------------------------------------

function computeThreatScore(
  authResult: EmailAuthentication,
  spoofing: SpoofingResult,
  phishing: PhishingResult
): { score: number; level: EmailAnalysisResult["threatLevel"] } {
  let score = 0;

  // Authentication failures contribute heavily
  if (authResult.spf.status === "fail") score += 25;
  else if (authResult.spf.status === "neutral") score += 10;

  if (authResult.dkim.status === "fail") score += 25;
  else if (authResult.dkim.status === "neutral") score += 10;

  if (authResult.dmarc.status === "fail") score += 20;
  else if (authResult.dmarc.status === "neutral") score += 8;

  // Spoofing signals
  score += spoofing.signals.length * 15;

  // Phishing content
  score += phishing.score * 0.4; // weight phishing score at 40%

  score = Math.min(100, Math.round(score));

  const level: EmailAnalysisResult["threatLevel"] =
    score === 0
      ? "SAFE"
      : score < 20
      ? "LOW"
      : score < 40
      ? "MEDIUM"
      : score < 65
      ? "HIGH"
      : "CRITICAL";

  return { score, level };
}

// ---------------------------------------------------------------------------
// 7. Findings and recommendations builder
// ---------------------------------------------------------------------------

function buildFindings(
  auth: EmailAuthentication,
  spoofing: SpoofingResult,
  phishing: PhishingResult,
  hasOriginatingIp: boolean
): string[] {
  const findings: string[] = [];

  // Auth findings
  if (auth.spf.status === "pass") findings.push("✓ SPF check passed — sending server is authorized by the domain's DNS record.");
  else if (auth.spf.status === "fail") findings.push("✗ SPF FAIL — the sending server is NOT listed as an authorized sender for this domain. High spoofing risk.");
  else if (auth.spf.status === "neutral") findings.push("⚠ SPF result is neutral/softfail — domain policy does not definitively authorize or reject this sender.");
  else findings.push("– SPF status unavailable — Authentication-Results header absent or lacks SPF record.");

  if (auth.dkim.status === "pass") findings.push("✓ DKIM signature verified — email content has not been tampered with in transit.");
  else if (auth.dkim.status === "fail") findings.push("✗ DKIM signature FAILED — the email may have been modified after sending, or the signature is forged.");
  else if (auth.dkim.status === "neutral") findings.push("⚠ DKIM result neutral — signature present but inconclusive.");
  else findings.push("– DKIM status unavailable — no DKIM signature found in Authentication-Results.");

  if (auth.dmarc.status === "pass") findings.push("✓ DMARC policy passed — email alignment with domain policy verified.");
  else if (auth.dmarc.status === "fail") findings.push("✗ DMARC FAIL — email does not align with the sending domain's published DMARC policy. Likely phishing or spoofing.");
  else if (auth.dmarc.status === "neutral") findings.push("⚠ DMARC result neutral — policy exists but did not produce a definitive verdict.");
  else findings.push("– DMARC status unavailable — domain may not publish a DMARC policy.");

  // Spoofing findings
  for (const signal of spoofing.signals) {
    findings.push(`⚠ Spoofing signal: ${signal}`);
  }

  // Phishing content findings
  for (const trigger of phishing.triggers) {
    findings.push(`⚠ Phishing indicator: ${trigger}`);
  }

  // Originating IP
  if (!hasOriginatingIp) {
    findings.push("– Originating IP could not be extracted from Received headers.");
  }

  return findings;
}

function buildRecommendations(
  threatLevel: EmailAnalysisResult["threatLevel"],
  spoofing: SpoofingResult
): string[] {
  if (threatLevel === "SAFE") {
    return [
      "No significant threat signals detected.",
      "Maintain standard email hygiene. Do not share OTPs or passwords via email.",
    ];
  }

  const recs: string[] = [];

  if (threatLevel === "CRITICAL" || threatLevel === "HIGH") {
    recs.push("Do NOT click any links or open attachments in this email.");
    recs.push("Do NOT reply to this email or provide any personal/financial information.");
    recs.push("Report this email as phishing to your email provider.");
    recs.push("Forward the raw email source to cybercrime.gov.in or dial 1930 (Cyber Crime Helpline).");
    recs.push("Preserve this email as evidence in the Cyber Sakhi Evidence Locker with SHA-256 hash.");
  }

  if (spoofing.detected) {
    recs.push("The sender identity is likely forged. Verify the sender through a known, separate channel before acting on anything in this email.");
  }

  if (threatLevel === "MEDIUM") {
    recs.push("Exercise caution. Verify the sender's identity before responding.");
    recs.push("Do not click embedded links directly — navigate to the official website manually.");
  }

  if (threatLevel === "LOW") {
    recs.push("Minor risk signals present. Confirm the sender's identity through an alternate channel.");
  }

  return recs;
}

// ---------------------------------------------------------------------------
// 8. Main export: analyzeEmail()
// ---------------------------------------------------------------------------

export async function analyzeEmail(rawEmailInput: string): Promise<EmailAnalysisResult> {
  const id = "ef_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
  const analyzedAt = new Date().toISOString();

  // Step A: Parse headers using existing utility
  const headers = extractHeaders(rawEmailInput);

  // Step B: Reconstruct SMTP relay path using existing utility
  const smtpPath = reconstructSMTPPath(headers.received);

  // Step C: Parse Authentication-Results for SPF/DKIM/DMARC
  const authentication = parseAuthentication(headers.authenticationResults);

  // Step D: Extract sender domain
  const senderDomain = extractDomain(headers.from);

  // Step E: Extract SMTP envelope sender from the last (outermost) external Received hop
  // The last hop in the smtpPath array represents the outermost server (the original sender's MTA)
  const lastHop = smtpPath.length > 0 ? smtpPath[smtpPath.length - 1] : undefined;
  const smtpEnvelopeFrom = lastHop?.from;

  // Step F: Spoofing detection
  const spoofing = detectSpoofing(
    headers.from,
    headers.replyTo,
    headers.returnPath,
    smtpEnvelopeFrom
  );

  // Step G: Phishing scoring over subject + entire raw input
  const contentToScore = [
    headers.subject || "",
    rawEmailInput,
  ].join(" ");
  const phishing = scorePhishing(contentToScore);

  // Step H: Originating IP — the last external hop typically carries the real sender IP
  const allIps = extractIpAddresses(headers.rawHeaders);
  // Prefer IP found in the outermost (last) Received header
  const originatingIP = lastHop?.ip && !isPrivateIp(lastHop.ip)
    ? lastHop.ip
    : allIps[allIps.length - 1]; // fallback to last public IP found

  // Step H2: Look up public IP intelligence (geo/ISP/ASN)
  const ipIntelligence = originatingIP
    ? await lookupIpIntelligence(originatingIP)
    : undefined;

  // Step H3: Look up intelligence for all important email domains.
  const fromAddr = extractEmailAddress(headers.from);
  const replyAddr = extractEmailAddress(headers.replyTo);
  const returnAddr = extractEmailAddress(headers.returnPath);

  const domainsForIntelligence = [
    extractDomain(fromAddr),
    extractDomain(replyAddr),
    extractDomain(returnAddr),
  ].filter((domain): domain is string => Boolean(domain));

  const uniqueDomainsForIntelligence = [...new Set(domainsForIntelligence)];

  const domainResults = await Promise.all(
    uniqueDomainsForIntelligence.map((domain) =>
      lookupDomainIntelligence(domain)
    )
  );

  const relatedDomainIntelligence = domainResults.filter(
    (value): value is NonNullable<typeof value> => Boolean(value)
  );

  const domainIntelligence = senderDomain
    ? relatedDomainIntelligence.find((item) => item.domain === senderDomain)
    : undefined;

  // Step I: Extract threat indicators
  const indicators: ThreatIndicator[] = [];

  // IPs
  for (const ip of allIps) {
    indicators.push({
      type: "ip",
      value: ip,
      source: "Received headers",
      malicious: undefined,
      confidence: undefined,
    });
  }

  // Domains
  const domainsSet = new Set<string>();
  [fromAddr, replyAddr, returnAddr].forEach((addr) => {
    const d = extractDomain(addr);
    if (d) domainsSet.add(d);
  });

  for (const domain of domainsSet) {
    indicators.push({
      type: "domain",
      value: domain,
      source: "Email headers",
    });
  }

  // URLs from raw email body
  const urls = extractUrls(rawEmailInput);
  for (const url of urls.slice(0, 20)) {
    // cap at 20 URLs
    const isSuspicious = PHISHING_URL_PATTERNS.some((p) => p.test(url));
    indicators.push({
      type: "url",
      value: url,
      source: "Email body",
      malicious: isSuspicious || undefined,
    });
  }

  // Emails extracted from body (excluding the main sender/recipient)
  const emailsInBody = extractEmailsFromText(rawEmailInput);
  for (const addr of emailsInBody.slice(0, 10)) {
    if (addr === fromAddr) continue;
    indicators.push({
      type: "email",
      value: addr,
      source: "Email body",
    });
  }

  // Step J: Composite threat scoring
  const { score: threatScore, level: threatLevel } = computeThreatScore(
    authentication,
    spoofing,
    phishing
  );

  // Step K: Build findings and recommendations
  const findings = buildFindings(authentication, spoofing, phishing, !!originatingIP);
  const recommendations = buildRecommendations(threatLevel, spoofing);

  // Step L: Correlate extracted indicators with forensic findings
  const indicatorCorrelations = correlateIndicators(indicators, findings);

  return {
    id,
    analyzedAt,
    headers,
    authentication,
    senderDomain,
    senderSpoofingDetected: spoofing.detected,
    smtpPath,
    originatingIP,
    ipIntelligence,
    domainIntelligence,
    relatedDomainIntelligence,
    indicatorCorrelations,
    indicators,
    threatLevel,
    threatScore,
    findings,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

import { lookupIpIntelligence } from "./ipIntelligence";
import { lookupDomainIntelligence } from "./domainIntelligence";
import { correlateIndicators } from "./indicatorCorrelation";
import { analyzeMessage } from "./threatEngine";
import type { ThreatAnalysisResult } from "./types";
import {
  EmailAnalysisResult,
  EmailAuthentication,
  AuthenticationResult,
  ThreatIndicator,
} from "./emailTypes";
import {
  analyzeAttachmentStructure,
  analyzeSmtpAnomalies,
  analyzeSpoofingComposite,
  buildScoreBreakdown,
  buildStructuredFindings,
  buildVerdict,
  dedupeAnomalies,
  extractEntities,
} from "./advancedForensics";
import {
  PHISHING_URL_PATTERNS,
  analyzePhishingNlp,
  activePhishingProviderLabel,
} from "./nlpPhishing";
import { analyzeUrlRisk } from "./urlRisk";
import { extractHeaders, extractMimeAttachments, reconstructSMTPPath } from "./emailParser";

// ---------------------------------------------------------------------------
// 1. SPF / DKIM / DMARC — extract verdicts from Authentication-Results header
// ---------------------------------------------------------------------------

function parseAuthStatus(
  raw: string,
  protocol: "spf" | "dkim" | "dmarc"
): AuthenticationResult {
  if (!raw) {
    return {
      status: "none",
      details: "Authentication-Results header absent",
      scope: { fromDomain: extractDomainFromRaw(raw) },
    };
  }

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
      scope: { fromDomain: extractDomainFromRaw(raw) },
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

  const scope = {
    mailfrom: match?.[2]?.match(/(?:mailfrom|envelope-from)\s*=\s*([^\s;]+)/i)?.[1],
    headerD: match?.[2]?.match(/header\.d\s*=\s*([^\s;]+)/i)?.[1],
    clientIp: match?.[2]?.match(/client-ip(?:=|!)\s*([^\s;]+)/i)?.[1],
    policy: match?.[2]?.match(/p\s*=\s*(none|quarantine|reject)/i)?.[1],
    disposition: match?.[2]?.match(/disposition\s*=\s*([a-z]+)/i)?.[1],
    selector: match?.[2]?.match(/selector\s*=\s*([^\s;]+)/i)?.[1],
    fromDomain: extractDomainFromRaw(raw),
  };

  return { status, details, scope };
}

function extractDomainFromRaw(raw: string): string | undefined {
  const m = raw.match(/header\.from\s*=\s*([^\s;>]+)/i);
  if (!m) return undefined;
  return m[1].replace(/[<>]/g, "").split("@").pop()?.toLowerCase();
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

/**
 * Everything after the first blank line is the body. When a pasted email
 * has no blank line at all — someone pasting just the message — the whole
 * input is treated as the body, so the threat is still read.
 */
function extractBodyText(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/);
  return split === -1 ? raw.trim() : raw.slice(split).trim();
}

function computeThreatScore(
  authResult: EmailAuthentication,
  spoofing: SpoofingResult,
  phishing: PhishingResult,
  harassment: ThreatAnalysisResult | null
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

  /* Harassment content.
   *
   * The phishing rules only cover bank and credential scams, so a
   * sextortion email sent from a genuine Gmail account scored 0: every
   * header check correctly passes, and no content rule matches. The
   * harassment engine behind /detector is folded in at full weight,
   * because for this product a credible threat IS the headline finding,
   * not a supporting signal. */
  if (harassment) {
    score = Math.max(score, harassment.score);
  }

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
  hasOriginatingIp: boolean,
  harassment: ThreatAnalysisResult | null
): string[] {
  const findings: string[] = [];

  // Harassment leads the list: if someone is being threatened, that
  // matters more to the reader than an SPF verdict.
  if (harassment && harassment.threatLevel !== "SAFE") {
    findings.push(
      `⚠ Harassment content detected (${harassment.threatLevel}, ${harassment.score}/100): ${harassment.triggers.join(", ")}`
    );
    for (const section of harassment.legalSections) {
      findings.push(`§ Applicable law: ${section.code} — ${section.title}`);
    }
  }

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

  // Step F: Spoofing detection (basic signals)
  const basicSpoofing = detectSpoofing(
    headers.from,
    headers.replyTo,
    headers.returnPath,
    smtpEnvelopeFrom
  );

  // Step F2: Composite, correlated spoofing analysis (lookalike, homoglyph,
  // punycode, envelope-vs-header mismatch, brand impersonation).
  const headerBodySplit = rawEmailInput.search(/\r?\n\r?\n/);
  const bodyText =
    headerBodySplit === -1 ? rawEmailInput : rawEmailInput.slice(headerBodySplit);
  const spoofing = analyzeSpoofingComposite({
    fromHeader: headers.from,
    replyTo: headers.replyTo,
    returnPath: headers.returnPath,
    smtpEnvelopeFrom,
    bodyText: [headers.subject || "", bodyText].join(" "),
    basicSignals: basicSpoofing.signals,
  });

  // Step F3: SMTP relay anomalies
  const rawAnomalies = analyzeSmtpAnomalies(smtpPath);
  const smtpAnomalies = dedupeAnomalies(rawAnomalies);

  // Step F4: Attachment structural analysis (never decodes content)
  const mimeParts = extractMimeAttachments(rawEmailInput);
  const attachments = mimeParts.map(analyzeAttachmentStructure);

  // Step F5: Entity extraction (pattern-based)
  const entities = extractEntities({
    text: [headers.subject || "", bodyText].join(" "),
    headersDomain: headers.from,
  });

  // Step G: Phishing scoring over subject + entire raw input, via the
  // pluggable NLP provider (deterministic keyword classifier by default).
  const contentToScore = [
    headers.subject || "",
    rawEmailInput,
  ].join(" ");
  const nlp = await analyzePhishingNlp(contentToScore);
  const phishing: PhishingResult = {
    score: nlp.rawScore,
    triggers: nlp.detail.map((d) => d.phrase),
  };

  /* Step G2: Harassment / threat scoring.
   *
   * Reuses the engine behind /detector, so blackmail, stalking, sexual
   * harassment and violence — in English or Hinglish — are detected in
   * email too. The body is scored rather than the raw source, so header
   * boilerplate cannot trip the rules. */
  const harassmentBody = extractBodyText(rawEmailInput);
  const harassmentInput = [headers.subject || "", harassmentBody].join("\n").trim();
  const harassment =
    harassmentInput.length > 0 ? analyzeMessage(harassmentInput) : null;

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
    phishing,
    harassment
  );

  // Step J2: Explainable score breakdown + confidence
  const urlSuspiciousCount = indicators.filter(
    (i) => i.type === "url" && i.malicious === true
  ).length;
  const attachmentFlags = attachments.filter((a) => a.suspicious).length;
  const smtpHighAnomalies = smtpAnomalies.filter((a) => a.severity === "HIGH").length;
  const smtpMediumAnomalies = smtpAnomalies.filter((a) => a.severity === "MEDIUM").length;

  const domainSuspicious =
    Boolean(senderDomain) &&
    (domainIntelligence?.suspicious === true ||
      /\.(xyz|top|tk|ml|ga|cf|gq|ru|cn|pw|cc|bid|review|loan|win|stream|rest|cyou|icu|buzz|one|site|online|club|live)$/i.test(senderDomain as string));

  const scoreBreakdown = buildScoreBreakdown({
    auth: authentication,
    spoofingGroupPoints: spoofing.signals.length * 15,
    spoofingSignals: spoofing.signals.length,
    phishingAdjusted: Math.round(phishing.score * 0.4),
    smtpHighAnomalies,
    smtpMediumAnomalies,
    urlSuspiciousCount,
    attachmentFlags,
    domainSuspicious,
  });

  const verdict = buildVerdict({
    score: threatScore,
    level: threatLevel,
    scoreBreakdown,
    spoofing,
    smtpHighAnomalies,
    urlSuspiciousCount,
    attachmentFlags,
  });

  // Step K: Build findings and recommendations
  const findings = buildFindings(
    authentication,
    spoofing,
    phishing,
    !!originatingIP,
    harassment
  );
  const recommendations = buildRecommendations(threatLevel, spoofing);

  // Step K2: Structured, evidence-backed findings
  const structuredFindings = buildStructuredFindings({
    authentication,
    spoofingSignals: spoofing.signals,
    spoofingComposite: spoofing,
    smtpAnomalies,
    phishingTriggers: phishing.triggers,
    urlSuspiciousCount,
    attachments,
    domainSuspicious,
    hasOriginatingIp: !!originatingIP,
  });

  // Step K3: Structured URL risk (shape analysis only — URLs are never opened)
  const urlRisk = analyzeUrlRisk(
    indicators,
    spoofing.brandsLikelyImpersonated.length > 0
      ? spoofing.brandsLikelyImpersonated.map((b) => `${b}.com`)
      : []
  );
  for (const urlEntry of urlRisk) {
    if (urlEntry.severity === "LOW") continue;
    structuredFindings.unshift({
      id: "FND-URL-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
      category: "URL" as const,
      severity: urlEntry.severity,
      confidence: urlEntry.confidence,
      description: `URL in the message body raises structured risk flags (${urlEntry.flags.length}).`,
      technicalEvidence: urlEntry.evidence + "  [" + urlEntry.url + "]",
      humanExplanation:
        "Cyber Sakhi inspected the shape of a link in this email (it does not open or follow links). These patterns are common in phishing, but they are signals, not proof.",
      recommendedAction:
        "Do not click the link. If it claims to be from an organization you use, open that organization's app/website yourself instead.",
    });
  }

  // Attach the explainable NLP payload (model name + per-trigger evidence).
  const nlpPayload = {
    ...nlp,
    defaultDisclaimer:
      "Powered by " +
      activePhishingProviderLabel() +
      ". A trigger is a linguistic signal; it is not proof of fraud.",
  };

  // Step L: Correlate extracted indicators with forensic findings
  const indicatorCorrelations = correlateIndicators(indicators, findings);

  return {
    id,
    analyzedAt,
    headers,
    authentication,
    senderDomain,
    senderSpoofingDetected: spoofing.detected,
    spoofing,
    smtpPath,
    smtpAnomalies,
    attachments,
    entities,
    originatingIP,
    ipIntelligence,
    domainIntelligence,
    relatedDomainIntelligence,
    indicatorCorrelations,
    indicators,
    threatLevel,
    threatScore,
    scoreBreakdown,
    verdict,
    findings,
    structuredFindings,
    recommendations,
    nlp: nlpPayload,
    urlRisk,
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

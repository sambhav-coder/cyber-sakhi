import { lookupIpIntelligence, checkProxy } from "./ipIntelligence";
import type { ProxyEnrichment } from "./ipIntelligence";
import { lookupDomainIntelligence, lookupRdap, rdapFraudSignals } from "./domainIntelligence";
import { queryThreatIntel } from "./intel/dnsbl";
import type { ThreatIntelResult } from "./intel/dnsbl";
import type { RdapDomainRecord } from "./emailTypes";
import { correlateIndicators } from "./indicatorCorrelation";
import { analyzeMessage } from "./threatEngine";
import type { ThreatAnalysisResult } from "./types";
import {
  EmailAnalysisResult,
  EmailAuthentication,
  AuthenticationResult,
  MlEmailClassification,
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
  normalizeFindings,
} from "./advancedForensics";
import {
  PHISHING_URL_PATTERNS,
  analyzePhishingNlp,
  activePhishingProviderLabel,
} from "./nlpPhishing";
import {
  applyThreatIntelValidation,
  assessContentRisk,
  assessOverall,
  assessSenderRisk,
  buildSuspicionReasons,
} from "./riskAssessments";
import { analyzeLanguage } from "./languageAnalysis";
import type { PipelineStage, SuspicionReason } from "./emailTypes";
import { analyzeUrlRisk } from "./urlRisk";
import { extractHeaders, extractMimeAttachments, reconstructSMTPPath } from "./emailParser";
import {
  extractValidatedIps,
  isPrivateIp,
  selectOriginatingIp,
} from "./ip";
import { classifyEmail } from "@/lib/ml";
import { analyzeBec } from "./bec/bec";
import type { BecAnalysis } from "./bec/bec";
import { verifyDomainAuthentication, summarizeAuthMismatches } from "./auth";
import type { DnsAuthVerification } from "./auth";
import { buildInvestigationGraph } from "./graph";
import { assessAttribution } from "./attribution";
import type { AttributionAnalysis } from "./attribution";
import { generateAlerts } from "./alerts";
import { maskPii, retentionStageFor } from "./privacy/masking";

// ---------------------------------------------------------------------------
// 1. SPF / DKIM / DMARC — extract verdicts from Authentication-Results header
// ---------------------------------------------------------------------------

export function parseAuthStatus(
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

  return { status, rawStatus, details, scope };
}

function extractDomainFromRaw(raw: string): string | undefined {
  const m = raw.match(/header\.from\s*=\s*([^\s;>]+)/i);
  if (!m) return undefined;
  return m[1].replace(/[<>]/g, "").split("@").pop()?.toLowerCase();
}

export function parseAuthentication(authResults?: string): EmailAuthentication {
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

/**
 * Validated IP addresses (IPv4/IPv6) found in the header block, excluding
 * private/reserved ranges. Malformed tokens — timestamps such as "07:08:55"
 * or leading-zero quads like "09.17.02.11" — are rejected, never extracted.
 */
function extractIpAddresses(text: string): string[] {
  return extractValidatedIps(text).filter((ip) => !isPrivateIp(ip));
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
  harassment: ThreatAnalysisResult | null,
  mlPoints: number = 0,
  becPoints: number = 0
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

  // Trained ML/NLP classifier contribution (scaled by model probability)
  score += mlPoints;

  // Business Email Compromise behavioural contribution (capped so BEC alone
  // cannot push a message to CRITICAL without header/content corroboration).
  score += becPoints;

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

/**
 * Points contributed to the threat score by the trained ML classifier.
 * Base points per class are scaled by the model's output probability, so a
 * high-confidence "phishing" verdict contributes more than a low-confidence
 * "suspicious" one. "legitimate" never adds points. This is a signal group
 * like any other — never a standalone verdict.
 */
function scoreMlClassification(ml: MlEmailClassification): number {
  if (!ml.available || !ml.label || ml.confidence == null) return 0;
  const base: Record<string, number> = {
    legitimate: 0,
    suspicious: 8,
    impersonated: 22,
    phishing: 28,
    "fraud-related": 22,
  };
  const pts = base[ml.label] * ml.confidence;
  return Math.round(pts * 10) / 10;
}

const ML_LABEL_SEVERITY: Record<string, "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  legitimate: "SAFE",
  suspicious: "MEDIUM",
  impersonated: "HIGH",
  phishing: "HIGH",
  "fraud-related": "HIGH",
};

function mlSeverity(ml: MlEmailClassification) {
  return ml.label ? (ML_LABEL_SEVERITY[ml.label] ?? "LOW") : "SAFE";
}

function mlHumanExplanation(ml: MlEmailClassification): string {
  const label = ml.label ?? "unknown";
  return (
    `A supervised classifier (logistic regression over TF-IDF features) scored this email as "${label}" ` +
    `with probability ${ml.confidence != null ? `${Math.round(ml.confidence * 100)}%` : "n/a"}. ` +
    `The model was trained on public curated corpora: legitimate and suspicious classes come from ` +
    `published ham/spam corpora (ground-truth labels); phishing and fraud-related come from the Nazario ` +
    `and Nigerian-fraud corpora; the impersonated class is a documented derived split of phishing email ` +
    `that impersonates a known brand. Classification is statistical evidence, not proof — every ML ` +
    `finding is cross-checked against the header, routing and content signals in this report.`
  );
}

function buildFindings(
  auth: EmailAuthentication,
  spoofing: SpoofingResult,
  phishing: PhishingResult,
  hasOriginatingIp: boolean,
  harassment: ThreatAnalysisResult | null,
  ml?: MlEmailClassification,
  bec?: BecAnalysis,
  ipProxy?: ProxyEnrichment
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

  // ML/NLP classifier
  if (ml?.available && ml.label) {
    const pct = ml.confidence != null ? Math.round(ml.confidence * 100) : "?";
    findings.push(
      `🧠 ML classifier: "${ml.label}" (model probability ${pct}%, margin ${ml.margin != null ? Math.round(ml.margin * 100) : "?"}%). ` +
        (ml.model?.f1Macro != null ? `Hold-out macro-F1 ${ml.model.f1Macro}. ` : "") +
        (ml.label === "legitimate"
          ? "The classifier found no malicious class signal in the content."
          : "The classifier flags this content — statistical signal, not proof; see header, routing and URL findings.")
    );
  } else if (ml && !ml.available) {
    findings.push(
      `– ML classifier unavailable: ${ml.unavailableReason ?? "no trained model artifact."}`
    );
  }

  // Business Email Compromise behavioural profile
  if (bec?.detected) {
    findings.push(
      `💼 BEC behavioural profile detected (score ${bec.score}/100, derived confidence ${Math.round(
        bec.confidence * 100
      )}%): ${bec.patterns.map((p) => p.name).slice(0, 4).join("; ")}. ` + bec.caveat
    );
  } else if (bec && bec.score > 0) {
    findings.push(
      `ℹ BEC scan: some BEC-style language present (score ${bec.score}/100) but not enough decisive ` +
        `patterns to conclude Business Email Compromise. ${bec.caveat}`
    );
  }

  // Proxy / VPN / TOR markers on the originating IP
  if (ipProxy && ipProxy.kind !== "none" && ipProxy.kind !== "unknown") {
    findings.push(
      `🕵 Proxy marker (${ipProxy.kind}, heuristic confidence ${Math.round(
        ipProxy.confidence * 100
      )}%): ${ipProxy.note}`
    );
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

export interface AnalyzeEmailOptions {
  /**
   * Skip every live network enrichment (IP intelligence, proxy screening,
   * domain DNS, RDAP, DNS auth re-verification, blocklists). Used to triage
   * a whole inbox quickly without hammering third-party services. Scoring
   * logic is otherwise identical; only network-derived signals are absent.
   */
  offline?: boolean;
}

export async function analyzeEmail(
  rawEmailInput: string,
  options: AnalyzeEmailOptions = {}
): Promise<EmailAnalysisResult> {
  const offline = options.offline === true;
  // Leading blank lines (common in pasted emails) would otherwise make every
  // header/body split below treat the whole message as body.
  rawEmailInput = rawEmailInput.replace(/^(?:[ \t]*\r?\n)+/, "");
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

  // Step G3: Trained ML/NLP classification (logistic regression over TF-IDF;
  // see lib/ml + DATASET.md). Runs on the same subject+body text the model
  // was trained on. Never trained at runtime; absent artifact -> available=false.
  const ml = classifyEmail(headers.subject, bodyText);
  const mlPayload: MlEmailClassification = {
    available: ml.available,
    label: ml.label ?? undefined,
    confidence: ml.confidence ?? undefined,
    margin: ml.margin ?? undefined,
    probabilities: ml.probabilities ?? undefined,
    unavailableReason: ml.unavailableReason,
    model: ml.modelMeta
      ? {
          dataset: ml.modelMeta.dataset,
          trainSize: ml.modelMeta.trainSize,
          testSize: ml.modelMeta.testSize,
          accuracy: ml.modelMeta.accuracy,
          precisionMacro: ml.modelMeta.precisionMacro,
          recallMacro: ml.modelMeta.recallMacro,
          f1Macro: ml.modelMeta.f1Macro,
        }
      : undefined,
  };
  const mlPoints = scoreMlClassification(mlPayload);

  // Step G4: Business Email Compromise — behavioural analysis (finance +
  // urgency + secrecy + role language, reply-to hijack, offline excuse).
  // Behavioural signal, not an identity verdict: see caveat in bec.summary.
  const bec: BecAnalysis = analyzeBec(headers.subject, bodyText, {
    displayFrom: headers.from,
    fromDomain: senderDomain,
    replyToDomain: extractDomain(extractEmailAddress(headers.replyTo)),
    lookalikeDomains: spoofing.lookalikeCandidates.map((c) => c.domain),
  });
  // BEC contributes up to 30 points; reaching 30 requires several decisive
  // patterns (e.g. money request + secrecy + offline excuse).
  const becPoints = bec.detected ? Math.min(30, Math.round(bec.score * 0.3)) : 0;

  // Step H: Originating IP.
  // Received headers are newest-first, so the last hop is the outermost
  // (oldest) relay — the earliest PUBLIC sending node reconstructed from the
  // chain. This is the visible sending host (MTA/router/NAT), never claimed
  // to be the human sender's device, and it is "unavailable" when no valid
  // public IP exists. Timestamps and malformed tokens are never accepted as
  // an IP (strict validation in lib/ip.ts).
  const allIps = extractIpAddresses(headers.rawHeaders);
  const originatingIP = selectOriginatingIp(smtpPath, headers.rawHeaders);

  // Step H2: Look up public IP intelligence (geo/ISP/ASN)
  const ipIntelligence = originatingIP && !offline
    ? await lookupIpIntelligence(originatingIP)
    : undefined;

  // Step H2b: VPN / TOR / datacenter screening for the originating IP.
  // Heuristic org-name + Tor exit-list, never a storage/verdict of identity.
  let ipProxy: ProxyEnrichment | undefined;
  if (originatingIP && !offline) {
    try {
      ipProxy = await checkProxy(originatingIP, ipIntelligence);
    } catch {
      ipProxy = undefined;
    }
  }

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

  const domainResults = offline ? [] : await Promise.all(
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

  // Step H3b: RDAP (WHOIS successor) registration intelligence for the sender
  // domain — age, registrar, registrant country, status. Redacted/privacy
  // placeholders are sanitised to null, never surfaced as "real" owners.
  let rdap: RdapDomainRecord | undefined;
  if (senderDomain && !offline) {
    try {
      rdap = await lookupRdap(senderDomain);
    } catch {
      rdap = undefined;
    }
  }
  const rdapSignals = rdap ? rdapFraudSignals(rdap) : [];

  // Step H4: Independent DNS re-verification of SPF/DMARC (server-side DoH).
  // Compares the published policy with what the Authentication-Results header
  // claimed, catching tampered/absent auth headers. Never blocks the result:
  // network failure -> dnsAuth stays undefined.
  let dnsAuth: DnsAuthVerification | undefined;
  if (senderDomain && !offline) {
    try {
      dnsAuth = await verifyDomainAuthentication(
        senderDomain,
        { spf: authentication.spf, dmarc: authentication.dmarc },
        { clientIp: originatingIP }
      );
    } catch {
      dnsAuth = undefined;
    }
  }
  const authMismatches = dnsAuth
    ? summarizeAuthMismatches(dnsAuth, {
        spf: authentication.spf,
        dmarc: authentication.dmarc,
      })
    : [];

  // Step I: Extract threat indicators
  let indicators: ThreatIndicator[] = [];

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

  // Step I2: Threat-intel correlation — public DNS blocklists (Spamhaus ZEN
  // for the sender IP, DBL/SURBL for the sender domain). Keyless, over DoH.
  // A hit is corroborating evidence, never a verdict.
  let threatIntel: ThreatIntelResult | undefined;
  try {
    const intelInput = indicators.filter((i) => i.type === "ip" || i.type === "domain");
    if (intelInput.length > 0 && !offline) {
      threatIntel = await queryThreatIntel(intelInput);
    }
  } catch {
    threatIntel = undefined;
  }

  // Step I3: Attach per-indicator validation states (not-checked /
  // checked-no-match / match / validation-failed / conflicting). This is the
  // "validate" pipeline stage — a skipped or failed lookup never reads as clean.
  indicators = applyThreatIntelValidation(indicators, threatIntel);

  // Step I4: Structured URL risk (shape analysis only — URLs are never opened,
  // fetched or dereferenced). Computed now so content risk can consume it.
  const urlRisk = analyzeUrlRisk(
    indicators,
    spoofing.brandsLikelyImpersonated.length > 0
      ? spoofing.brandsLikelyImpersonated.map((b) => `${b}.com`)
      : []
  );

  // Step J: Composite threat scoring
  const { score: threatScore, level: threatLevel } = computeThreatScore(
    authentication,
    spoofing,
    phishing,
    harassment,
    mlPoints,
    becPoints
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
    mlPoints,
    becPoints,
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

  // Step J3: Separated risk dimensions (sender vs content) + suspicion
  // reasoning + language analysis. The overall level/scoring semantics above
  // are untouched — these are additive, presentation-level assessments.
  const listedValidationIps = indicators
    .filter((i) => i.type === "ip" && i.validation?.state === "match")
    .map((i) => i.value);
  const listedValidationDomains = indicators
    .filter((i) => i.type === "domain" && i.validation?.state === "match")
    .map((i) => i.value);

  const senderRisk = assessSenderRisk({
    authentication,
    spoofing,
    senderDomain,
    domainSuspicious,
    dnsAuth,
    rdapSignals,
    rdapAgeDays: rdap?.ageDays ?? null,
    ipProxy,
    threatIps: listedValidationIps,
    threatDomains: listedValidationDomains,
    hasOriginatingIp: !!originatingIP,
  });

  const contentRisk = assessContentRisk({
    nlpScore: phishing.score,
    nlpTriggers: phishing.triggers,
    ml: mlPayload,
    mlPoints,
    becDetected: bec.detected,
    becScore: bec.score,
    harassmentScore: harassment?.score,
    harassmentLevel: harassment?.threatLevel,
    urlRisk,
    suspiciousAttachments: attachments.filter((a) => a.suspicious),
  });

  const overallAssessment = assessOverall(senderRisk, contentRisk, threatScore, threatLevel);

  const suspicionReasons: SuspicionReason[] = buildSuspicionReasons({
    sender: senderRisk,
    content: contentRisk,
    auth: authentication,
    spoofing,
    nlpTriggers: phishing.triggers,
    urlRisk,
    attachments,
    threatIps: listedValidationIps,
    threatDomains: listedValidationDomains,
    rdapAgeDays: rdap?.ageDays ?? null,
    rdapSignals,
  });

  // Language analysis is a supporting, descriptive signal only — never a
  // verdict label, never an identity/geographic claim (see lib/languageAnalysis).
  const language = analyzeLanguage(headers.subject, bodyText);

  // Step K: Build findings and recommendations
  const findings = buildFindings(
    authentication,
    spoofing,
    phishing,
    !!originatingIP,
    harassment,
    mlPayload,
    bec,
    ipProxy
  );
  const recommendations = buildRecommendations(threatLevel, spoofing);

  // Step K2: Structured, evidence-backed findings
  let structuredFindings = buildStructuredFindings({
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

  // Step K2b: Structured ML classification finding (real supervised model —
  // evidence links to the model artifact, not a guess).
  if (mlPayload.available && mlPayload.label && mlPayload.label !== "legitimate") {
    const probaSummary = mlPayload.probabilities
      ? Object.entries(mlPayload.probabilities)
          .map(([k, v]) => `${k}=${v.toFixed(3)}`)
          .join(", ")
      : "unavailable";
    structuredFindings.unshift({
      id: "FND-ML-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
      category: "NLP_SOCIAL_ENGINEERING",
      severity: mlSeverity(mlPayload),
      confidence: mlPayload.confidence ?? 0,
      description: `Trained ML classifier labelled this email "${mlPayload.label}" (probability ${
        mlPayload.confidence != null ? `${Math.round(mlPayload.confidence * 100)}%` : "n/a"
      }${mlPayload.margin != null ? `, margin ${Math.round(mlPayload.margin * 100)}%` : ""}).`,
      technicalEvidence: `Model probabilities: ${probaSummary}. Model: logistic regression, TF-IDF (smooth-idf, sublinear-tf, L2), hold-out ${
        mlPayload.model?.f1Macro != null ? `macro-F1 ${mlPayload.model.f1Macro}` : "metrics n/a"
      }. Artifact regenerable via scripts/ml (see DATASET.md).`,
      humanExplanation: mlHumanExplanation(mlPayload),
      recommendedAction:
        "Treat this as one strong signal, not a verdict. Re-validate against the authentication, sending-server and URL findings in this report before acting.",
      validationStatus: mlPayload.available ? "Model Inferred" : "Validation Unavailable",
      benignExplanation:
        "Statistical models can misclassify; the classifier is a strong corroborating signal only when the header/routing/URL findings agree.",
    });
  }

  // Step K2c: Structured Business Email Compromise finding.
  if (bec.detected) {
    structuredFindings.push({
      id: "FND-BEC-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
      category: "NLP_SOCIAL_ENGINEERING",
      severity: bec.score >= 70 ? "CRITICAL" : "HIGH",
      confidence: Math.round(bec.confidence * 100) / 100,
      description: `Business Email Compromise behavioural profile detected (score ${bec.score}/100).`,
      technicalEvidence: `Matched patterns: ${bec.patterns
        .map((p) => `${p.name} [${p.severity}, w=${p.weight}]${p.evidence ? `: "${p.evidence}"` : ""}`)
        .join(" | ")}.`,
      humanExplanation:
        bec.summary +
        " " +
        bec.caveat,
      recommendedAction:
        "Do NOT comply with money/credential/gift-card requests made by email. Verify the sender through a known, separate channel (phone call to a trusted number, in person) before changing any payment details.",
      validationStatus: "Behavioural Pattern Match",
      benignExplanation:
        "BEC language can be mimicked by legitimate finance teams under time pressure; the key is verifying money/payment changes through a separate channel.",
    });
  }

  // Step K3.5: RDAP registration intelligence for the sender domain.
  if (rdap) {
    const ageLine =
      rdap.ageDays != null
        ? `Registered ${rdap.ageDays} day(s) ago (${rdap.created ?? "n/a"}).`
        : "Registration date unknown.";
    const ownerLine = rdap.registrantName
      ? `Registrant: ${rdap.registrantName}.`
      : "Registrant details redacted/privacy-protected.";
    findings.push(
      `🏢 RDAP: ${ageLine} ${ownerLine} ${rdap.registrar ? `Registrar: ${rdap.registrar}.` : ""}` +
        (rdapSignals.length ? ` ${rdapSignals.join(" ")}` : "")
    );
  }
  if (rdap && rdapSignals.length > 0) {
    structuredFindings.unshift({
      id: "FND-RDAP-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
      category: "DOMAIN",
      severity: rdap.ageDays != null && rdap.ageDays <= 30 ? "HIGH" : "MEDIUM",
      confidence: 0.6,
      description: `${rdap.domain}: registration intelligence raises abuse signals.`,
      technicalEvidence: rdapSignals.join(" ") + ` (via ${rdap.rdapProvider}).`,
      humanExplanation:
        "Cyber Sakhi looked up the domain's public registration record (RDAP, the WHOIS successor). Very young domains, hidden registrants and abuse-related status flags are each weak on their own, but together they match the profile of throwaway phishing domains.",
      recommendedAction:
        "Weigh domain age against the other report findings. A 2-day-old 'bank' domain alongside spoofing/URL risk is strong corroboration of fraud.",
      validationStatus: rdap ? "External Lookup Completed" : "Validation Unavailable",
      benignExplanation:
        "Young domains and privacy-protected registrants also occur for legitimate new businesses; RDAP is corroborating, not conclusive.",
    });
  }

  // Step K3.6: Threat-intel DNS blocklist hits for sender IP/domain.
  if (threatIntel) {
    const listedIps = threatIntel.ip?.results.filter((r) => r.listed) ?? [];
    const listedDomains = threatIntel.domain?.results.filter((r) => r.listed) ?? [];

    if (listedIps.length > 0 || listedDomains.length > 0) {
      const summaryLines = [
        ...listedIps.map(
          (r) => `IP ${r.source}: ${r.code}${r.reason ? ` (${r.reason})` : ""}`
        ),
        ...listedDomains.map(
          (r) => `Domain ${r.source}: ${r.code}${r.reason ? ` (${r.reason})` : ""}`
        ),
      ];
      findings.push(
        `🚨 Threat-intel blocklist hit(s): ${summaryLines.slice(0, 3).join("; ")}.`
      );
      structuredFindings.unshift({
        id: "FND-TI-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
        category: "THREAT_INTELLIGENCE",
        severity: listedDomains.some((r) => r.code === "127.0.1.2") ? "HIGH" : "MEDIUM",
        confidence: 0.8,
        description:
          "Sender IP and/or sender domain appear(s) in well-known DNS blocklists used by mail servers.",
        technicalEvidence:
          summaryLines.join(" | ") +
          ` (sources: ${threatIntel.providers.join(", ")}. A hit is corroborating evidence, never a standalone verdict.)`,
        humanExplanation:
          "Cyber Sakhi queried Spamhaus (via DoH) for the sender's IP and sender domain. A listing indicates the infrastructure has been tied to previous spam, phishing or botnet activity — but blocklists carry false positives and are corroborating, not conclusive.",
recommendedAction:
        "Treat a blocklist hit as strong corroboration when combined with URL/attachment/content signals. Verify independently before flagging to the user.",
      validationStatus: "Checked — Match",
      benignExplanation:
        "DNS blocklists carry false positives (shared hosting, previous legitimate owner); a hit corroborates but never concludes.",
    });
    }
  }

  // Step K4: DNS re-verification — published auth policy vs the header claim.
  if (dnsAuth) {
    const dnsSpfBad =
      dnsAuth.spf.status === "fail" ||
      dnsAuth.spf.status === "not-found" ||
      dnsAuth.spf.status === "softfail";
    if (authMismatches.length > 0) {
      findings.push(`🛰 DNS auth discrepancy: ${authMismatches.join(" ")}`);
    }
    if (dnsSpfBad) {
      structuredFindings.unshift({
        id: "FND-DNS-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
        category: "AUTHENTICATION",
        severity: dnsAuth.spf.status === "fail" || dnsAuth.spf.status === "not-found" ? "HIGH" : "MEDIUM",
        confidence: 0.7,
        description: `The sending domain ${dnsAuth.domain} does not authorize this sender under its published SPF/DMARC policy.`,
        technicalEvidence: `SPF: ${dnsAuth.spf.status} (${dnsAuth.spf.explained}). DMARC: ${dnsAuth.dmarc.status} (${dnsAuth.dmarc.explained}). ${dnsAuth.dkim.explained}`,
        humanExplanation:
          "Cyber Sakhi asked DNS directly (over HTTPS) for the domain's mail-authentication policy. A spoofing-proof domain publishes a strict SPF and DMARC policy; this domain does not authorize the sending server credited in the email, or publishes no authoritative policy at all.",
recommendedAction:
        "Verify the sender over a separate, known channel. Legitimate organisations publish DMARC reject and SPF -all; their absence does not prove fraud but removes the strongest protection against spoofed mail.",
      validationStatus: "DNS Re-Verified",
      benignExplanation:
        "Policies can be misconfigured or recently changed on legitimate domains; a missing/loose policy is a gap, not definitive proof of abuse.",
    });
    }
    if (authMismatches.length > 0) {
      structuredFindings.unshift({
        id: "FND-DNSX-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
        category: "AUTHENTICATION",
        severity: "MEDIUM",
        confidence: 0.6,
        description: "Authentication-Results header disagrees with the published DNS policy.",
        technicalEvidence: authMismatches.join(" "),
        humanExplanation:
          "The mail server inserted an Authentication-Results verdict, but Cyber Sakhi's independent lookup of the sender domain disagrees. Either the header was forged by a misconfigured relay, or the domain recently changed its policy.",
recommendedAction:
          "Treat the header verdict as unreliable. Verify through published DNS before trusting the sender.",
      validationStatus: "Conflicting",
      benignExplanation:
        "A disagreement can also mean the domain changed policy after the mail was sent; re-verify before concluding the header was forged.",
    });
    }
  }

  // Step K5: Proxy/VPN/TOR structural finding for the originating IP.
  if (ipProxy && ipProxy.kind !== "none" && ipProxy.kind !== "unknown") {
    structuredFindings.unshift({
      id: "FND-PX-" + structuredFindings.length + "-" + Math.floor(Math.random() * 1000),
      category: "IP",
      severity: ipProxy.kind === "tor" ? "HIGH" : "MEDIUM",
      confidence: ipProxy.confidence,
      description: `Originating IP ${ipProxy.ip} carries ${ipProxy.kind} markers.`,
      technicalEvidence: ipProxy.note,
      humanExplanation:
        "Cyber Sakhi cross-checked the sending IP against the Tor exit-node list and ASN/org naming. A Tor exit or datacenter host is common in bulk phishing and fraud infrastructure — but it is also a privacy choice, so this is a supporting signal, not proof of malice.",
      recommendedAction:
        "Treat the sending location as anonymised/untrusted. If the rest of the report agrees on fabrication, this corroborates it.",
      validationStatus: "External Markers",
      benignExplanation:
        "Tor/datacenter exit points are also a deliberate privacy choice for legitimate senders; this is a supporting signal only.",
    });
  }

  // Step K3b: Structured URL risk — findings for the URL analysis computed at
  // Step I4 above.
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
      validationStatus: "Checked — No Follow",
      benignExplanation:
        "A flagged link shape can also appear in benign marketing or expired-URL scenarios; treat it as one corroborating signal.",
    });
  }

  // Step K6: INSEQ hygiene — collapse structurally identical findings and
  // reassign stable, deterministic identifiers (FND-<category>-<n>). The legacy
  // pipeline produced random-id findings that could not be referenced across
  // persisted cases; Normalized findings carry observation + interpretation +
  // validation + benign context so nothing reads as a definitive verdict.
  structuredFindings = normalizeFindings(structuredFindings);

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

  // Step J4: Standalone pipeline-stage metadata (extract -> normalize ->
  // validate -> correlate) so the UI can show the investigation as distinct
  // stages instead of one opaque block. Built after correlation so the final
  // stage can reference the correlation + separated risk assessments.
  const pipelineStages: PipelineStage[] = [
    {
      name: "extract",
      description: "Raw headers, SMTP hops, attachments, entities and indicators are pulled out of the input.",
      completed: true,
      artifacts: [
        `${smtpPath.length} SMTP hop(s)`,
        `${indicators.length} indicator(s)`,
        `${attachments.length} attachment(s)`,
        `${entities.length} extracted entit(ies)`,
      ],
    },
    {
      name: "normalize",
      description: "Verdicts are normalized to a consistent vocabulary (SPF/DKIM/DMARC statuses, anomaly severities, finding categories, stable finding ids).",
      completed: true,
      artifacts: [
        "SPF/DKIM/DMARC verdicts",
        "attachment classifications",
        `${structuredFindings.length} normalized finding(s)`,
      ],
    },
    {
      name: "validate",
      description: "Independent checks re-verify claims: DNS policy lookup, RDAP registration, and DNS-blocklist threat-intel queries. Sender risk and content risk are assessed from separate evidence groups.",
      completed: true,
      artifacts: [
        ...(dnsAuth ? [`DNS policy verified for ${dnsAuth.domain}`] : ["DNS policy validation unavailable"]),
        ...(rdap ? [`RDAP record for ${rdap.domain}`] : ["RDAP unavailable"]),
        ...(threatIntel ? ["Blocklist queries completed"] : ["Blocklist queries unavailable"]),
        `sender risk ${senderRisk.level} / content risk ${contentRisk.level}`,
      ],
    },
    {
      name: "correlate",
      description: "Indicators are tied to the forensic findings that explain them, with per-indicator validation states attached.",
      completed: true,
      artifacts: [
        `${indicatorCorrelations.length} indicator correlation(s)`,
        `${indicators.filter((i) => i.validation?.state === "match").length} validated match(es)`,
        `${suspicionReasons.length} suspicion reason(s)`,
      ],
    },
  ];

  const result: EmailAnalysisResult = {
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
    ipProxy,
    domainIntelligence,
    rdap,
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
    ml: mlPayload,
    bec,
    dnsAuth,
    threatIntel,
    urlRisk,
    // Separated risk dimensions + suspicion reasoning + language + pipeline
    // stages. Additive and backward-compatible: existing consumers keep reading
    // threatScore/threatLevel/verdict; these power the summary-first UI.
    senderRisk,
    contentRisk,
    overallAssessment,
    suspicionReasons,
    language,
    pipelineStages,
  };

  // Step M2: Attribution / origin assessment — coarse region + scam family,
  // deliberately low-confidence (never an identity claim).
  try {
    result.attribution = assessAttribution(result, extractBodyText(rawEmailInput));
  } catch {
    result.attribution = undefined;
  }

  // Step M3: Alert policy evaluation over the completed analysis. Delivery is
  // the responsibility of the notification layer — this just decides.
  try {
    result.alerts = generateAlerts(result, undefined, {
      threatLevel: harassment?.threatLevel,
      score: harassment?.score,
    });
  } catch {
    result.alerts = undefined;
  }

  // Step M: Investigation graph — pure, deterministic entity/edge map over the
  // analysis data already computed. Attached for the case-management API and
  // forensic report builder; no live UI rendering assumed.
  try {
    result.investigationGraph = buildInvestigationGraph(result);
  } catch {
    // graph builder is pure; failure here indicates a code bug, not data loss.
    result.investigationGraph = undefined;
  }

  // Step M4: Privacy mask of the subject/body for display and any persistence.
  // Raw PII belongs only in the evidence locker under chain of custody, never
  // in a plaintext report/log. Masking keeps structure, drops the PII.
  try {
    const bodyPii = extractBodyText(rawEmailInput).slice(0, 600);
    const masked = maskPii(`${headers.subject ?? ""}\n${bodyPii}`);
    const retention = retentionStageFor(result.analyzedAt, "evidence");
    result.privacy = {
      maskedSubject: masked.text.split("\n")[0] ?? "",
      maskedBodyPreview: bodyPii ? masked.text.split("\n").slice(1).join("\n").slice(0, 400) : "",
      redactions: masked.redactions,
      retentionStage: retention.stage,
      retentionExpiresAt: retention.expiresAt,
    };
  } catch {
    result.privacy = undefined;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

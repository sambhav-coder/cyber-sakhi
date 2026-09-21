import {
  AttachmentAnalysis,
  EmailAuthentication,
  ExtractedEntity,
  ForensicCategory,
  ForensicFinding,
  ForensicVerdict,
  ScoreBreakdown,
  SMTPAnomaly,
  SMTPHop,
  SpoofingComposite,
} from "./emailTypes";

// ---------------------------------------------------------------------------
// Brand lexicon (canonical domains + display tokens). Used ONLY for pattern
// matching and similarity scoring. Never a source of authority by itself.
// ---------------------------------------------------------------------------

export interface BrandEntry {
  name: string;
  domains: string[];
  tokens: string[];
}

export const BRAND_LEXICON: BrandEntry[] = [
  { name: "HDFC Bank", domains: ["hdfcbank.com", "hdfcbank.co.in"], tokens: ["hdfc bank", "hdfc"] },
  { name: "ICICI Bank", domains: ["icicibank.com", "icici.com"], tokens: ["icici"] },
  { name: "State Bank of India", domains: ["sbi.co.in", "onlinesbi.sbi", "sbi"], tokens: ["state bank of india", "sbi"] },
  { name: "Axis Bank", domains: ["axisbank.com"], tokens: ["axis bank"] },
  { name: "Kotak Mahindra", domains: ["kotak.com", "kotakmahindra.com"], tokens: ["kotak"] },
  { name: "Paytm", domains: ["paytm.com", "paytm.in"], tokens: ["paytm"] },
  { name: "Google", domains: ["google.com", "google.co.in", "gmail.com"], tokens: ["google", "gmail"] },
  { name: "Microsoft", domains: ["microsoft.com", "outlook.com", "office.com", "live.com"], tokens: ["microsoft", "outlook", "office 365"] },
  { name: "Apple", domains: ["apple.com", "icloud.com"], tokens: ["apple", "icloud", "app store"] },
  { name: "Amazon", domains: ["amazon.in", "amazon.com"], tokens: ["amazon"] },
  { name: "Flipkart", domains: ["flipkart.com"], tokens: ["flipkart"] },
  { name: "RBI", domains: ["rbi.org.in"], tokens: ["rbi", "reserve bank of india"] },
  { name: "IRCTC", domains: ["irctc.co.in"], tokens: ["irctc"] },
  { name: "UPI / NPCI", domains: ["npci.org.in"], tokens: ["upi", "npci", "bhim"] },
  { name: "Aadhaar / UIDAI", domains: ["uidai.gov.in"], tokens: ["aadhaar", "uidai"] },
  { name: "Income Tax Dept", domains: ["incometax.gov.in", "incometaxindia.gov.in"], tokens: ["income tax", "it department", "itr refund"] },
  { name: "GST Council", domains: ["gst.gov.in"], tokens: ["gst"] },
  { name: "PayPal", domains: ["paypal.com"], tokens: ["paypal"] },
  { name: "Netflix", domains: ["netflix.com"], tokens: ["netflix"] },
  { name: "LinkedIn", domains: ["linkedin.com"], tokens: ["linkedin"] },
  { name: "WhatsApp", domains: ["whatsapp.com", "wa.me"], tokens: ["whatsapp"] },
];

// Cyrillic / Greek / accented confusables mapped to Latin lookalikes.
const HOMOGLYPH_MAP: Record<string, string> = {
  а: "a", "А": "A",
  е: "e", "Е": "E",
  о: "o", "О": "O",
  р: "p", "Р": "P",
  с: "c", "С": "C",
  у: "y", "У": "Y",
  х: "x", "Х": "X",
  і: "i", "І": "I",
  ј: "j", "Ј": "J",
  ѕ: "s", "Ѕ": "S",
  ѓ: "g",
  "ń": "n",
  "é": "e", "è": "e", "ê": "e",
  "á": "a", "à": "a", "â": "a",
  "í": "i", "ï": "i",
  "ó": "o", "ô": "o",
  "ú": "u", "û": "u",
  "ç": "c",
};

export function detectHomoglyphs(domain: string): boolean {
  return [...domain].some((ch) => HOMOGLYPH_MAP[ch] !== undefined);
}

export function normalizeHomoglyphs(domain: string): string {
  return [...domain]
    .map((ch) => HOMOGLYPH_MAP[ch] || ch)
    .join("")
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export function detectLookalikeDomain(
  domain: string
): Array<{ domain: string; looksLike: string; distance: number }> {
  const base = domain.toLowerCase().replace(/^www\./, "");
  if (base.startsWith("xn--") || base.includes("xn--")) {
    return [{ domain, looksLike: "punycode/IDN domain", distance: 0 }];
  }

  const normalized = normalizeHomoglyphs(base);
  const word = normalized.split(".")[0];
  const results: Array<{ domain: string; looksLike: string; distance: number }> = [];

  for (const brand of BRAND_LEXICON) {
    for (const canonical of brand.domains) {
      const canonWord = canonical.split(".")[0].toLowerCase();
      if (!canonWord || canonWord.length < 4) continue;
      const distance = levenshtein(word, canonWord);
      if (distance <= 2 && distance > 0) {
        results.push({ domain, looksLike: canonical, distance });
        break;
      }
    }
  }

  return results;
}

export function findImpersonatedBrands(
  fromHeader: string | undefined,
  text: string
): string[] {
  const mentionTokens = new Set<string>();
  for (const brand of BRAND_LEXICON) {
    for (const token of brand.tokens) {
      if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
        mentionTokens.add(brand.name);
        break;
      }
    }
  }
  return [...mentionTokens];
}

function extractDomain(emailOrHeader?: string): string | undefined {
  if (!emailOrHeader) return undefined;
  const angleMatch = emailOrHeader.match(/<([^>@\s]+@[^>@\s]+)>/);
  const address = angleMatch?.[1] || emailOrHeader.match(/\b([^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+)\b/)?.[1];
  if (!address) return undefined;
  const atIdx = address.lastIndexOf("@");
  if (atIdx === -1) return undefined;
  return address.slice(atIdx + 1).toLowerCase().replace(/[>)\s].*/, "").trim();
}

function extractEmailAddress(header?: string): string | undefined {
  if (!header) return undefined;
  const angleMatch = header.match(/<([^>@\s]+@[^>@\s]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase().trim();
  const bareMatch = header.match(/\b([^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+)\b/);
  return bareMatch?.[1].toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Composite spoofing analysis
// ---------------------------------------------------------------------------

export function analyzeSpoofingComposite(input: {
  fromHeader?: string;
  replyTo?: string;
  returnPath?: string;
  smtpEnvelopeFrom?: string;
  bodyText: string;
  basicSignals: string[];
}): SpoofingComposite {
  const fromDomain = extractDomain(input.fromHeader);
  const replyDomain = extractDomain(input.replyTo);
  const returnDomain = extractDomain(input.returnPath);
  const envelopeDomain = extractDomain(input.smtpEnvelopeFrom);

  const signals = [...input.basicSignals];
  const lookalikeCandidates: SpoofingComposite["lookalikeCandidates"] = [];
  const brandsLikelyImpersonated: string[] = [];

  let lookalikeDetected = false;
  let punycodeDetected = false;
  let homoglyphDetected = false;
  let envelopeMismatchDetected = false;

  const domainsToCheck = [fromDomain, replyDomain, returnDomain, envelopeDomain].filter(
    (d): d is string => Boolean(d)
  );

  for (const domain of new Set(domainsToCheck)) {
    if (domain.startsWith("xn--")) {
      punycodeDetected = true;
      signals.push(`Domain "${domain}" is an internationalized (punycode/IDN) domain — used to impersonate trusted hosts`);
    }
    if (detectHomoglyphs(domain)) {
      homoglyphDetected = true;
      signals.push(`Domain "${domain}" contains confusable (homoglyph) characters that visually mimic Latin letters`);
    }
    const lookalikes = detectLookalikeDomain(domain);
    if (lookalikes.length > 0) {
      lookalikeDetected = true;
      lookalikeCandidates.push(...lookalikes);
      for (const l of lookalikes.filter((x) => x.looksLike !== "punycode/IDN domain")) {
        signals.push(`Domain "${domain}" is a lookalike of trusted domain "${l.looksLike}" (edit distance ${l.distance})`);
      }
    }
  }

  // Envelope vs header mismatch using the outermost Received "from <...>" sender
  if (envelopeDomain && fromDomain && envelopeDomain !== fromDomain) {
    envelopeMismatchDetected = true;
    signals.push(`SMTP envelope sender domain (${envelopeDomain}) differs from visible From domain (${fromDomain})`);
  }

  // Brand impersonation: body/display mentions a brand whose canonical domain differs from sender
  const mentionedBrands = findImpersonatedBrands(input.fromHeader, input.bodyText);
  if (mentionedBrands.length > 0) {
    for (const brandName of mentionedBrands) {
      const brand = BRAND_LEXICON.find((b) => b.name === brandName);
      if (!brand) continue;
      const canonicalMatches =
        fromDomain &&
        brand.domains.some((d) => {
          const cd = d.replace(/^www\./, "");
          return fromDomain === cd || fromDomain.endsWith("." + cd);
        });
      if (!canonicalMatches) {
        brandsLikelyImpersonated.push(brandName);
        signals.push(`Email mentions "${brandName}" but was not sent from a verified ${brandName} domain (from: ${fromDomain || "unknown"})`);
      }
    }
  }

  const detected = signals.length > 0;
  const score = detected ? Math.min(100, 25 + signals.length * 12) : 0;
  const confidence = detected
    ? Math.min(0.95, 0.35 + signals.length * 0.12)
    : 0;

  return {
    detected,
    score,
    confidence,
    signals,
    lookalikeDetected,
    lookalikeCandidates,
    punycodeDetected,
    homoglyphDetected,
    envelopeMismatchDetected,
    brandsLikelyImpersonated,
  };
}

// ---------------------------------------------------------------------------
// SMTP relay anomaly detection
// ---------------------------------------------------------------------------

export function analyzeSmtpAnomalies(smtpPath: SMTPHop[]): SMTPAnomaly[] {
  const anomalies: SMTPAnomaly[] = [];
  if (smtpPath.length === 0) return anomalies;

  smtpPath.forEach((hop, index) => {
    if (!hop.ip) return;

    if (hop.ip.startsWith("127.") || hop.ip === "::1") {
      anomalies.push({
        type: "loopback_ip",
        severity: "LOW",
        confidence: 0.9,
        description: `Hop ${index + 1} was received from a loopback address (${hop.ip}).`,
        evidence: hop.raw,
      });
    }

    if (isPrivateIp(hop.ip)) {
      anomalies.push({
        type: "private_ip",
        severity: "SAFE",
        confidence: 0.9,
        description:
          `Hop ${index + 1} carries a private RFC1918 IP (${hop.ip}). ` +
          "This is common inside corporate/exchange relays and is informational, not malicious by itself.",
        evidence: hop.raw,
      });
    }
  });

  // Timestamp ordering: Received headers are newest-first, so timestamps must be
  // non-increasing as we walk outward (inner/newest hop first in array order).
  const dated = smtpPath
    .map((hop, index) => ({ index, iso: hop.timestampIso }))
    .filter((h) => h.iso);

  for (let i = 0; i + 1 < dated.length; i++) {
    const current = new Date(dated[i].iso as string).getTime();
    const next = new Date(dated[i + 1].iso as string).getTime();
    if (Number.isNaN(current) || Number.isNaN(next)) continue;
    if (next > current + 60_000) {
      anomalies.push({
        type: "timestamp_inconsistency",
        severity: "MEDIUM",
        confidence: 0.55,
        description:
          `Received timestamps are not monotonic: hop ${dated[i + 1].index + 1} is dated AFTER hop ${dated[i].index + 1} ` +
          "despite being the (older, outer) relay hop. Indicates forged or manipulated Received headers.",
        evidence: smtpPath[dated[i].index].raw + "\n" + smtpPath[dated[i + 1].index].raw,
      });
    }
  }

  smtpPath.forEach((hop, index) => {
    if (!hop.timestamp) return;
    anomalies.push({
      type: "missing_timestamp",
      severity: "SAFE",
      confidence: 0.2,
      description:
        `Hop ${index + 1} Received header cannot be parsed to a normalized timestamp — ` +
        "format unusual or absent. Informational.",
      evidence: hop.raw,
    });
  });

  // Inspect mask confusion. Hops whose IP appears as a literal inside `from` versus
  // `by` are flagged.
  smtpPath.forEach((hop, index) => {
    if (!hop.ip) return;
    const byLower = (hop.by || "").toLowerCase();
    const fromLower = (hop.from || "").toLowerCase();
    const publicIp = isPrivateIp(hop.ip) ? undefined : hop.ip;

    if (publicIp && byLower && byLower.includes(publicIp)) {
      anomalies.push({
        type: "hostname_ip_mismatch",
        severity: "LOW",
        confidence: 0.5,
        description:
          `Hop ${index + 1} reports a raw IP (${hop.ip}) in the receiving host (by) field instead of a hostname — ` +
          "a pattern seen when spoofing infrastructure hides behind bare IPs.",
        evidence: hop.raw,
      });
    }

    if (publicIp && fromLower && !byLower.includes(publicIp) && /\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\]/.test(fromLower)) {
      anomalies.push({
        type: "hostname_ip_mismatch",
        severity: "LOW",
        confidence: 0.45,
        description:
          `Hop ${index + 1} advertises its sending host as a bare IP literal (${hop.ip}) ` +
          "— unusual for trusted sending infrastructure.",
        evidence: hop.raw,
      });
    }
  });

  return anomalies; // silently cap
}

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return PartsPrivate6(ip);
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function PartsPrivate6(ip: string): boolean {
  if (!ip.includes(":")) return false;
  if (ip === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  if (/^fc|^fd/.test(ip)) return true;
  return false;
}

// Deduplicate structurally identical anomalies while keeping the most severe.
export function dedupeAnomalies(anomalies: SMTPAnomaly[]): SMTPAnomaly[] {
  const severityWeight = { SAFE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  const byKey = new Map<string, SMTPAnomaly>();
  for (const a of anomalies) {
    const key = a.type;
    const existing = byKey.get(key);
    if (!existing || severityWeight[a.severity] > severityWeight[existing.severity]) {
      byKey.set(key, a);
    }
  }
  return [...byKey.values()].sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
}

// ---------------------------------------------------------------------------
// Attachment structural analysis (never executes/decompresses content)
// ---------------------------------------------------------------------------

const EXECUTABLE_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "hta", "msi", "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1", "msp", "cpl",
]);

const SCRIPT_LIKE_EXTENSIONS = new Set([
  "js", "vbs", "vbe", "hta", "wsf", "ps1", "sh", "bat", "cmd",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "cab", "iso",
]);

const MACRO_EXTENSIONS = new Set(["docm", "xlsm", "pptm", "doc", "xls", "ppt"]);

export function analyzeAttachmentStructure(a: {
  filename: string;
  mimeType?: string;
  sizeEstimateBytes?: number;
}): AttachmentAnalysis {
  const filename = a.filename;
  const lower = filename.toLowerCase();

  const segments = filename.split(".");
  const extension = (segments.length > 1 ? segments.pop() : undefined)?.toLowerCase();

  const doubleExtension =
    segments.length > 1 &&
    /^(doc|xls|ppt|pdf|jpg|png|gif|txt|mp3|mp4|rar|zip)([ ._-]+)$/.test(
      segments[segments.length - 1].toLowerCase()
    ) ||
    /\.\w+\.[a-z]{2,4}$/.test(lower);

  const executable = !!extension && EXECUTABLE_EXTENSIONS.has(extension);
  const scriptLike = !!extension && SCRIPT_LIKE_EXTENSIONS.has(extension);
  const archive = !!extension && ARCHIVE_EXTENSIONS.has(extension);
  const macroHint =
    (!!extension && MACRO_EXTENSIONS.has(extension)) ||
    /macro/i.test(lower) ||
    /ole/i.test(lower);

  const suspicious =
    Boolean(executable) ||
    Boolean(scriptLike) ||
    Boolean(doubleExtension) ||
    Boolean(archive && /\.(zip|rar|7z)\..{1,4}$/i.test(lower)) ||
    Boolean(a.mimeType && /(?:octet-stream|javascript|vnd\.ms)/.test(a.mimeType));

  return {
    filename,
    extension,
    mimeType: a.mimeType,
    sizeEstimateBytes: a.sizeEstimateBytes,
    doubleExtension,
    executable,
    scriptLike,
    archive,
    macroHint,
    suspicious,
  };
}

// ---------------------------------------------------------------------------
// Entity extraction (pattern-based, conservative, clearly labeled)
// ---------------------------------------------------------------------------

export function extractEntities(input: {
  text: string;
  headersDomain?: string;
}): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const { text } = input;

  // Phones (Indian + international forms, bounded)
  const phones = [...new Set(
    text.match(/(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g) || []
  )];
  for (const value of phones.slice(0, 8)) {
    entities.push({ type: "phone", value });
  }

  // Monetary amounts
  const amounts = [...new Set(
    text.match(/(?:Rs\.?|₹|INR|USD|\$)\s?\d[\d,]*(?:\.\d{1,2})?/gi) || []
  )].filter((v) => !/\d{10}/.test(v));
  for (const value of amounts.slice(0, 8)) {
    entities.push({ type: "amount", value });
  }

  // Account / card / credential references
  const accountPatterns = [
    /(?:card\s+number|cvv|customer\s+id|account\s+number|your\s+otp|net\s+banking).{0,40}/gi,
  ];
  for (const pattern of accountPatterns) {
    const matches = text.match(pattern) || [];
    for (const value of matches.slice(0, 8)) {
      entities.push({ type: "account", value: value.trim().replace(/\s+/g, " ") });
    }
  }

  // Dates / deadlines
  const dates = [...new Set(
    text.match(/\b(?:within|in)\s+\d+\s+(?:hours?|minutes?|days?|weeks?)/gi) ||
    text.match(/\b(?:today|tomorrow|immediately|expires?\s+(?:on|in|today))/gi) || []
  )];
  for (const value of dates.slice(0, 8)) {
    entities.push({ type: "date", value });
  }

  // Organizations (brand lexicon + generic institutional patterns)
  const brands = findImpersonatedBrands(input.headersDomain, text);
  for (const value of brands.slice(0, 6)) {
    entities.push({ type: "organization", value });
  }
  const institutions = [...new Set(
    text.match(/\b[A-Z][a-zA-Z&]+(?:[ \t]+(?:Bank|Ministry|Department|Commission|Authority|Limited|Corporation|Court|Police|Tax|Office)){1}\b/g) || []
  )];
  for (const value of institutions.slice(0, 6)) {
    entities.push({ type: "organization", value });
  }

  return entities.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Structured findings
// ---------------------------------------------------------------------------

export function buildStructuredFindings(input: {
  authentication: EmailAuthentication;
  spoofingSignals: string[];
  spoofingComposite: SpoofingComposite;
  smtpAnomalies: SMTPAnomaly[];
  phishingTriggers: string[];
  urlSuspiciousCount: number;
  attachments: AttachmentAnalysis[];
  domainSuspicious: boolean;
  hasOriginatingIp: boolean;
}): ForensicFinding[] {
  const findings: ForensicFinding[] = [];
  let counter = 0;
  const nextId = (category: string) => `FND-${category}-${++counter}`;

  const make = (partial: {
    id: string;
    category: ForensicCategory;
    severity: ForensicFinding["severity"];
    confidence: number;
    description: string;
    technicalEvidence: string;
    humanExplanation: string;
    recommendedAction: string;
    validationStatus?: string;
    benignExplanation?: string;
  }): ForensicFinding => partial as ForensicFinding;

  const { authentication: auth } = input;

  const authSeverity = (status: string): ForensicFinding["severity"] =>
    status === "pass" ? "SAFE" : status === "fail" ? "HIGH" : status === "neutral" ? "MEDIUM" : "LOW";

  // ---- Authentication ----
  const authChecks: Array<[string, string, string]> = [
    ["spf", "SPF", "SPF record authorizes the sending server"],
    ["dkim", "DKIM", "DKIM signature validates email integrity"],
    ["dmarc", "DMARC", "DMARC policy enforces domain alignment"],
  ];
  for (const [key, label, what] of authChecks) {
    const status = auth[key as "spf"].status;
    findings.push(make({
      id: nextId("AUTH"),
      category: "AUTHENTICATION",
      severity: authSeverity(status),
      confidence: status === "pass" || status === "fail" ? 0.9 : 0.4,
      description: `${label} verdict: ${status.toUpperCase()}`,
      technicalEvidence:
        auth[key as "spf"].details ||
        `${label} status "${status}" from Authentication-Results header.`,
      humanExplanation:
        status === "pass"
          ? `${what} passed — this part of the email checks out.`
          : status === "fail"
          ? `${label} FAILED — the message does not match what the sender's domain authorized. A single failed check alone does not prove phishing, but it is a strong signal.`
          : `${label} was inconclusive or not published — we cannot confirm the sender using this method.`,
      recommendedAction:
        status === "fail"
          ? "Treat the sender identity as unverified. Verify through an independent known channel before acting."
          : "No action required for this check by itself.",
      validationStatus:
        status === "pass" || status === "fail"
          ? "Header Claim"
          : "Validation Unavailable",
      benignExplanation:
        status === "fail"
          ? "A failed or missing check can also appear on legitimate but misconfigured senders, or right after a domain migration — treat it as a strong signal, not proof of fraud."
          : undefined,
    }));
  }

  // ---- Spoofing ----
  for (const signal of input.spoofingSignals) {
    findings.push(make({
      id: nextId("SPOOF"),
      category: "SENDER_SPOOFING",
      severity: signal.includes("lookalike") || signal.includes("homoglyph") ? "HIGH" : "MEDIUM",
      confidence: signal.includes("punycode") || signal.includes("homoglyph") ? 0.85 : 0.6,
      description: signal,
      technicalEvidence: `Sender domains analyzed: from/${input.spoofingComposite.lookalikeCandidates.map((c) => c.domain).join(",") || "standard"}.`,
      humanExplanation:
        "The email presents a sender identity that does not match its real addressing or domain. This is a classic way attackers impersonate trusted organizations.",
      recommendedAction:
        "Do not trust the visible sender. Verify via a known, separate channel (official app, website, phone number).",
      validationStatus: "Independent Domain Comparison",
      benignExplanation:
        "Display-name and domain mismatches also appear in legitimate bulk-marketing systems that send on behalf of brands; verify through a trusted channel before acting.",
    }));
  }

  // ---- SMTP anomalies ----
  for (const a of input.smtpAnomalies) {
    if (a.severity === "SAFE") continue;
    findings.push(make({
      id: nextId("SMTP"),
      category: "SMTP_ROUTING",
      severity: a.severity,
      confidence: a.confidence,
      description: a.description,
      technicalEvidence: a.evidence,
      humanExplanation:
        a.type === "timestamp_inconsistency"
          ? "The email's travel history has timestamps that do not add up, which can mean the routing headers were edited or forged."
          : "The email's route includes unusual addressing. By itself this is informational, but combined with other signals it strengthens suspicion.",
      recommendedAction:
        a.type === "timestamp_inconsistency"
          ? "Preserve the raw email untouched as evidence before anything else."
          : "No action required on this signal alone.",
      validationStatus: "Route Reconstructed",
      benignExplanation:
        a.type === "timestamp_inconsistency"
          ? "Timestamp quirks can also come from clock drift on legitimate mail servers — preserve evidence, but do not conclude fraud from this alone."
          : "Unusual routing can occur with legitimate relaying configurations.",
    }));
  }

  // ---- Phishing / NLP ----
  let nlpScore = 0;
  for (const trigger of input.phishingTriggers) {
    nlpScore += 1;
    findings.push(make({
      id: nextId("NLP"),
      category: "NLP_SOCIAL_ENGINEERING",
      severity: /password|credential|otp|cvv|kyc|upcash|verification demand|account suspension|unclaimed funds/i.test(trigger)
        ? "HIGH"
        : trigger.includes("URL") ? "MEDIUM" : "LOW",
      confidence: 0.5,
      description: `Social-engineering trigger: ${trigger}`,
      technicalEvidence: `Trigger matched by keyword/pattern rules against subject + body.`,
      humanExplanation:
        "This email uses language designed to pressure or scare you into acting quickly — urgency, threats to your account, or requests to hand over credentials. These are common manipulation techniques.",
      recommendedAction:
        "Slow down. Never enter passwords, OTPs, CVV or bank details from a link in an unexpected email.",
      validationStatus: "Keyword Pattern Match",
      benignExplanation:
        "Urgent language is also used by legitimate services during real account alerts; a trigger is a lure signal, not proof of fraud.",
    }));
  }

  // ---- URL ----
  if (input.urlSuspiciousCount > 0) {
    findings.push(make({
      id: nextId("URL"),
      category: "URL",
      severity: "HIGH",
      confidence: 0.7,
      description: `${input.urlSuspiciousCount} embedded link(s) match phishing patterns (unusual TLD, IP-based target, shortener, long random path).`,
      technicalEvidence: `Suspicious URL pattern matches: ${input.urlSuspiciousCount}.`,
      humanExplanation:
        "Links in this email point to addresses that resemble trusted sites but are hosted on cheap, disposable domains or raw IP addresses.",
      recommendedAction:
        "Do not click any links. If you must visit the service, type the official address yourself in a fresh browser tab.",
      validationStatus: "Shape Analysis Only",
      benignExplanation:
        "Shortened or unusual links also appear in legitimate newsletters and marketing campaigns — shape analysis is a signal, not a conclusion.",
    }));
  }

  // ---- Attachment ----
  for (const a of input.attachments) {
    if (!a.suspicious) continue;
    findings.push(make({
      id: nextId("ATTACH"),
      category: "ATTACHMENT",
      severity: a.executable || a.scriptLike ? "CRITICAL" : "HIGH",
      confidence: a.executable || a.scriptLike ? 0.85 : 0.6,
      description: `Attachment "${a.filename}" is flagged as potentially dangerous.`,
      technicalEvidence: `extension=${a.extension || "none"} mime=${a.mimeType || "none"} doubleExtension=${a.doubleExtension} executable=${a.executable} scriptLike=${a.scriptLike} archive=${a.archive} macroHint=${a.macroHint}`,
      humanExplanation:
        "Attachments that run code (executables, scripts) or hide a second extension can install malware. Macro-enabled office files can execute code when opened.",
      recommendedAction:
        "Do not open the attachment. Report the email instead.",
      validationStatus: "Structural Analysis",
      benignExplanation:
        "Double extensions and archive attachments also occur in legitimate business documents; treat this as a strong signal but verify the sender before concluding.",
    }));
  }

  // ---- Domain intelligence ----
  if (input.domainSuspicious) {
    findings.push(make({
      id: nextId("DOM"),
      category: "DOMAIN",
      severity: "HIGH",
      confidence: 0.75,
      description: "Sender domain uses a suspicious top-level domain or abnormal structure.",
      technicalEvidence: "Domain vetting flagged the sender's registration pattern (unusual TLD, excessive subdomain length).",
      humanExplanation:
        "Legitimate banks and government bodies rarely use cheap, unregulated top-level domains for their official mail.",
      recommendedAction:
        "Treat any request from this domain as unverified regardless of branding in the email.",
      validationStatus: "Heuristic Vetting",
      benignExplanation:
        "Uncommon TLDs are also used by some legitimate startups — treat this as a supporting signal, not a standalone verdict.",
    }));
  }

  // ---- IP ----
  if (!input.hasOriginatingIp) {
    findings.push(make({
      id: nextId("IP"),
      category: "IP",
      severity: "LOW",
      confidence: 0.8,
      description: "No originating public IP could be reconstructed from the Received headers.",
      technicalEvidence: "Received chain did not expose a usable public IP.",
      humanExplanation:
        "We could not determine where on the internet this email actually originated, which limits how much of its route we can verify.",
      recommendedAction:
        "Nothing to act on directly; the missing origin is itself worth noting for evidence quality.",
      validationStatus: "Route Reconstruction",
      benignExplanation:
        "Some legitimate relays strip or obfuscate internal hops, so a missing public origin is a quality note, not proof of manipulation.",
    }));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Explainable score breakdown
// ---------------------------------------------------------------------------

export function buildScoreBreakdown(input: {
  auth: EmailAuthentication;
  spoofingGroupPoints: number;
  spoofingSignals: number;
  phishingAdjusted: number;
  mlPoints?: number;
  becPoints?: number;
  smtpHighAnomalies: number;
  smtpMediumAnomalies: number;
  urlSuspiciousCount: number;
  attachmentFlags: number;
  domainSuspicious: boolean;
}): ScoreBreakdown {
  const groups: Array<{ group: string; points: number; reason: string }> = [];

  let authPoints = 0;
  const authParts: string[] = [];
  const { auth } = input;
  if (auth.spf.status === "fail") { authPoints += 25; authParts.push("SPF fail (+25)"); }
  else if (auth.spf.status === "neutral") { authPoints += 10; authParts.push("SPF neutral (+10)"); }
  if (auth.dkim.status === "fail") { authPoints += 25; authParts.push("DKIM fail (+25)"); }
  else if (auth.dkim.status === "neutral") { authPoints += 10; authParts.push("DKIM neutral (+10)"); }
  if (auth.dmarc.status === "fail") { authPoints += 20; authParts.push("DMARC fail (+20)"); }
  else if (auth.dmarc.status === "neutral") { authPoints += 8; authParts.push("DMARC neutral (+8)"); }
  if (authPoints > 0) groups.push({ group: "AUTHENTICATION", points: authPoints, reason: authParts.join(", ") });

  if (input.spoofingGroupPoints > 0) {
    groups.push({ group: "SENDER_SPOOFING", points: input.spoofingGroupPoints, reason: `${input.spoofingSignals} spoofing/mismatch signal(s) (+15 each)` });
  }

  if (input.phishingAdjusted > 0) {
    groups.push({ group: "NLP_CONTENT", points: input.phishingAdjusted, reason: "social-engineering keyword score x0.4" });
  }

  if (input.mlPoints && input.mlPoints > 0) {
    groups.push({ group: "ML_CLASSIFIER", points: Math.round(input.mlPoints), reason: "trained classifier score scaled by model probability" });
  }

  if (input.becPoints && input.becPoints > 0) {
    groups.push({ group: "BEC", points: Math.round(input.becPoints), reason: "business email compromise behavioural patterns (capped +30)" });
  }

  const smtpPoints = Math.min(10, input.smtpHighAnomalies * 5 + input.smtpMediumAnomalies * 2);
  if (smtpPoints > 0) groups.push({ group: "SMTP_ROUTING", points: smtpPoints, reason: `${input.smtpHighAnomalies} high + ${input.smtpMediumAnomalies} medium relay anomalies` });

  const urlPoints = Math.min(10, input.urlSuspiciousCount * 5);
  if (urlPoints > 0) groups.push({ group: "URL", points: urlPoints, reason: `${input.urlSuspiciousCount} suspicious link(s) (+5 each)` });

  const attachPoints = Math.min(10, input.attachmentFlags * 5);
  if (attachPoints > 0) groups.push({ group: "ATTACHMENT", points: attachPoints, reason: `${input.attachmentFlags} flagged attachment(s)` });

  if (input.domainSuspicious) groups.push({ group: "DOMAIN", points: 10, reason: "suspicious sender TLD/domain structure" });

  const total = Math.min(100, groups.reduce((sum, g) => sum + g.points, 0));
  return { total, groups };
}

// ---------------------------------------------------------------------------
// Overall forensic verdict (correlation + narrative)
// ---------------------------------------------------------------------------

export function buildVerdict(input: {
  score: number;
  level: ForensicVerdict["level"];
  scoreBreakdown: ScoreBreakdown;
  spoofing: SpoofingComposite;
  smtpHighAnomalies: number;
  urlSuspiciousCount: number;
  attachmentFlags: number;
}): ForensicVerdict {
  const groups = input.scoreBreakdown.groups;
  const contributing = groups
    .filter((g) => g.points > 0)
    .map((g) => `${g.group} (+${g.points})`)
    .slice(0, 8);

  const distinctGroups = groups.filter((g) => g.points > 0).length;
  const confidence =
    distinctGroups >= 4 ? 0.85 : distinctGroups === 3 ? 0.7 : distinctGroups === 2 ? 0.55 : 0.35;

  const level = input.level;

  const summary =
    level === "SAFE"
      ? "No correlated threat signals were detected. This email appears legitimate from the signals we could evaluate."
      : level === "LOW"
      ? "A small number of weak signals were found. Independently they are inconclusive, so this email is only mildly concerning."
      : level === "MEDIUM"
      ? "Several signals are present but they do not yet cross into clear malicious territory. Treat this email as unverified and do not act on its requests."
      : level === "HIGH"
      ? "Multiple independent signals agree this email is likely fraudulent or phishing. The evidence correlates across authentication, sender identity and content."
      : "Multiple high-impact signals strongly correlate: authentication failures, identity mismatch, manipulative content and risky links. The evidence strongly indicates phishing/fraud.";

  const evidenceNarrative =
    contributiveSentence(groups, contributing) ||
    "No notable signal groups contributed points.";

  return {
    level,
    confidence,
    summary,
    contributingSignals: contributing,
  };
}

export function contributiveSentence(
  groups: Array<{ group: string; points: number; reason: string }>,
  contributing: string[]
): string {
  const groupNames = contributing;
  if (!groupNames.length) return "";

  const joined = groupNames.join(", ");
  return (
    `Correlated evidence: ${joined}. ` +
    "Individually, any single failed check is not proof of maliciousness, " +
    "but their combination significantly raises the likelihood this email is an attempt to deceive you."
  );
}

// Category color helpers stay in UI. Utility below:
export function severityRank(s: ForensicFinding["severity"]): number {
  return { SAFE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}

export const CATEGORY_LABELS: Record<ForensicCategory, string> = {
  AUTHENTICATION: "Email Authentication",
  SENDER_SPOOFING: "Sender Spoofing",
  DOMAIN: "Domain Intelligence",
  IP: "IP Intelligence",
  SMTP_ROUTING: "SMTP Routing",
  URL: "Link Analysis",
  ATTACHMENT: "Attachment Analysis",
  NLP_SOCIAL_ENGINEERING: "Content Risk",
  THREAT_INTELLIGENCE: "Threat Intelligence",
  ANOMALY: "Anomaly",
};

// ---------------------------------------------------------------------------
// Deduplication + id normalization for structured findings (INSEQ hygiene).
// Structurally identical findings (same category + normalized description with
// the same severity) are collapsed, keeping the highest-confidence instance.
// ---------------------------------------------------------------------------

export function normalizeFindingText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/with (probability|confidence)[^.]*\.?/g, "")
    .trim();
}

export function dedupeFindings(findings: ForensicFinding[]): ForensicFinding[] {
  const byKey = new Map<string, ForensicFinding>();
  for (const f of findings) {
    const key = `${f.category}::${normalizeFindingText(f.description)}::${f.severity}`;
    const existing = byKey.get(key);
    if (!existing || (f.confidence ?? 0) > (existing.confidence ?? 0)) {
      byKey.set(key, f);
    }
  }
  return [...byKey.values()];
}

/**
 * Reassign clean, stable, sequential identifiers (FND-<category>-<n>) and
 * deduplicate. The INSEQ pipeline previously produced random-id findings that
 * could not be referenced deterministically across persisted cases.
 */
export function normalizeFindings(findings: ForensicFinding[]): ForensicFinding[] {
  const counters = new Map<string, number>();
  return dedupeFindings(findings).map((f) => {
    const n = (counters.get(f.category) ?? 0) + 1;
    counters.set(f.category, n);
    return { ...f, id: `FND-${f.category}-${n}` };
  });
}

export { levenshtein };
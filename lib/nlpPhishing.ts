import type {
  NlpAnalysisResult,
  PhishingCategory,
  PhishingTriggerDetail,
} from "./emailTypes";

/**
 * NLP / CONTENT ANALYSIS ABSTRACTION (Stage C — ML/NLP extensibility)
 * -------------------------------------------------------------------
 * Every AI/ML conclusion produced by Cyber Sakhi must remain explainable.
 * This module defines a clean provider seam so the deterministic keyword
 * engine below can later be swapped for:
 *   - a local transformer model,
 *   - hosted inference (e.g. a fine-tuned phishing classifier),
 *   - an LLM-based classifier with retrieval,
 * WITHOUT rewriting analyzeEmail() or the scoring layer.
 *
 * The default provider is `deterministicPhishingProvider`, a transparent,
 * regex/lexicon classifier. Every trigger it emits carries a category,
 * weight, and the matched evidence. It does NOT claim to be ML.
 */

export type { PhishingCategory, PhishingTriggerDetail, NlpAnalysisResult };

export interface PhishingNlpProvider {
  readonly id: string;
  readonly name: string;
  readonly requiresExternalService: boolean;
  /**
   * Accepts the full raw message (subject + headers + body) and returns a
   * structured, explainable analysis. MUST be deterministic for a given
   * input (no stochastic sampling) and MUST provide matched evidence for
   * every raised trigger.
   */
  analyze(rawEmail: string): Promise<NlpAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Deterministic provider — lexicon/pattern classifier
// ---------------------------------------------------------------------------

/** Weak-signal keywords that only count when they corroborate a stronger one. */
const ISOLATED_WEAK_KEYWORDS: RegExp[] = [
  /https?:\/\/[^/\s]+\.[^/\s]+\/[a-z0-9]{20,}/i, // long random path
];

interface LexiconRule {
  regex: RegExp;
  weight: number;
  phrase: string;
  category: PhishingCategory;
}

const LEXICON_RULES: LexiconRule[] = [
  // Urgency / account threat
  { regex: /your\s+account\s+(has\s+been\s+)?(suspended|blocked|locked|disabled|terminated)/i, weight: 30, phrase: "Account suspension threat", category: "urgency" },
  { regex: /verify\s+(your\s+)?(account|email|identity|payment|details)/i, weight: 20, phrase: "Verification demand", category: "urgency" },
  { regex: /action\s+required|immediate\s+action|act\s+now|respond\s+immediately/i, weight: 20, phrase: "Urgency language", category: "urgency" },
  { regex: /within\s+\d+\s+(hours?|minutes?|days?)\s+(or\s+)?(your\s+account|access)/i, weight: 25, phrase: "Time-pressure deadline", category: "urgency" },
  // Credential harvesting
  { regex: /click\s+(here|below|this\s+link)\s+to\s+(login|log\s+in|sign\s+in|confirm|reset|verify)/i, weight: 25, phrase: "Click-here login redirect", category: "credential_harvesting" },
  { regex: /reset\s+your\s+password|update\s+your\s+password|confirm\s+your\s+password/i, weight: 15, phrase: "Password reset lure", category: "credential_harvesting" },
  { regex: /enter\s+your\s+(otp|pin|password|credentials|credit\s+card|cvv|bank)/i, weight: 35, phrase: "Credential entry demand", category: "credential_harvesting" },
  // Financial lures
  { regex: /won\s+(a\s+)?(lottery|prize|award|reward|gift|cash)/i, weight: 30, phrase: "Lottery/prize lure", category: "financial_fraud" },
  { regex: /unclaimed\s+(funds?|money|refund|reward)|pending\s+transfer|release\s+of\s+funds/i, weight: 25, phrase: "Unclaimed funds lure", category: "financial_fraud" },
  { regex: /kyc\s+(update|verification|suspended|required)|pan\s+card\s+(link|update)/i, weight: 30, phrase: "KYC/PAN phishing", category: "financial_fraud" },
  { regex: /income\s+tax\s+refund|it\s+department|gst\s+refund/i, weight: 25, phrase: "Fake government refund", category: "financial_fraud" },
  { regex: /upi\s+(blocked|suspended|limit)|aadhaar\s+(link|update|expired)/i, weight: 30, phrase: "UPI/Aadhaar phishing", category: "financial_fraud" },
  // Malware delivery
  { regex: /open\s+the\s+attachment|see\s+attached\s+(file|document|invoice)/i, weight: 15, phrase: "Suspicious attachment prompt", category: "malware_delivery" },
  { regex: /(invoice|receipt|shipment|delivery|parcel)\s+(attached|enclosed|is\s+ready)/i, weight: 10, phrase: "Fake invoice/delivery attachment", category: "malware_delivery" },
  // Impersonation keywords
  { regex: /paypal|amazon|hdfc|sbi|icici|axis\s+bank|rbi|irdai|sebi|nsdl|npci|google\s+security|microsoft\s+security/i, weight: 10, phrase: "Known-brand impersonation keyword", category: "impersonation" },
  { regex: /dear\s+(valued\s+)?(customer|user|member|client|subscriber)/i, weight: 10, phrase: "Generic impersonal salutation", category: "impersonation" },
];

export const PHISHING_URL_PATTERNS: RegExp[] = [
  /https?:\/\/(?!\S*(google|microsoft|amazon|facebook|apple)\.(com|in|co\.in))\S+\.(click|xyz|top|tk|ml|ga|cf|gq|ru|cn|pw|cc|bid|review|loan|win|stream)\b/i,
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,            // IP-based URL
  /https?:\/\/[^/\s]+\.[^/\s]+\/[a-z0-9]{20,}/i,              // Long random path
  /bit\.ly|tinyurl|t\.co|ow\.ly|is\.gd|buff\.ly|goo\.gl/i,   // URL shorteners
];

function evidenceSnippet(text: string, regex: RegExp): string {
  const match = regex.exec(text);
  if (!match) return "matched via pattern";
  const raw = match[0];
  return raw.length > 48 ? raw.slice(0, 48) + "…" : raw;
}

export const deterministicPhishingProvider: PhishingNlpProvider = {
  id: "deterministic-keyword-v1",
  name: "Deterministic lexicon/phrase classifier",
  requiresExternalService: false,

  async analyze(rawEmail: string): Promise<NlpAnalysisResult> {
    const detail: PhishingTriggerDetail[] = [];
    let score = 0;

    if (rawEmail && rawEmail.trim()) {
      for (const rule of LEXICON_RULES) {
        if (rule.regex.test(rawEmail)) {
          detail.push({
            phrase: rule.phrase,
            category: rule.category,
            weight: rule.weight,
            evidence: evidenceSnippet(rawEmail, rule.regex),
          });
          score += rule.weight;
        }
      }

      // URL pattern signal (added once, like the legacy engine).
      const urlMatched = PHISHING_URL_PATTERNS.some((p) => p.test(rawEmail));
      if (urlMatched) {
        detail.push({
          phrase: "Suspicious / shortened URL pattern detected",
          category: "url_pattern",
          weight: 20,
          evidence: evidenceSnippet(
            rawEmail,
            PHISHING_URL_PATTERNS.find((p) => p.test(rawEmail))!
          ),
        });
        score += 20;
      }
    }

    const categoriesDetected = [...new Set<PhishingCategory>(detail.map((d) => d.category))];

    return {
      model: deterministicPhishingProvider.id,
      categoriesDetected,
      triggerCount: detail.length,
      rawScore: Math.min(100, score),
      detail,
      disclaimer:
        "Pattern-based linguistic classification. It surfaces phrases and URL shapes that correlate with phishing; a detection is a signal, not proof of fraud.",
    };
  },
};

// ---------------------------------------------------------------------------
// Future ML adapter seam (disabled by default — never fake it)
// ---------------------------------------------------------------------------

/**
 * Adapter slot for a real ML/LLM classifier. It stays disabled until an
 * actual inference source is configured. If someone enables it without a
 * backend, the module still returns the deterministic analysis and records
 * that the ML provider was unavailable — it never fabricates an ML verdict.
 */
export function createMlPhishingProvider(config: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}): PhishingNlpProvider {
  const enabled = Boolean(config.endpoint && config.apiKey);
  return {
    id: enabled ? "hosted-classifier" : "hosted-classifier-disabled",
    name: enabled ? `Hosted classifier (${config.model || "unset"})` : "Hosted classifier (not configured)",
    requiresExternalService: true,

    async analyze(rawEmail: string): Promise<NlpAnalysisResult> {
      if (!enabled) {
        const fallback = await deterministicPhishingProvider.analyze(rawEmail);
        return {
          ...fallback,
          model: fallback.model + " (ML provider unconfigured)",
        };
      }
      throw new Error(
        "createMlPhishingProvider's hosted inference is an architecture seam; " +
          "no inference backend has been integrated in this build."
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Active provider selection
// ---------------------------------------------------------------------------

const ACTIVE_PROVIDER: PhishingNlpProvider = (() => {
  // Set CYBER_SAKHI_NLP_ML=1 and provide an endpoint/key here to switch the
  // forensic engine to a real ML classifier without touching analyzeEmail().
  if (typeof process !== "undefined" && process.env?.CYBER_SAKHI_ML_PHISHING === "1") {
    return createMlPhishingProvider({
      endpoint: process.env.CYBER_SAKHI_ML_PHISHING_ENDPOINT,
      apiKey: process.env.CYBER_SAKHI_ML_PHISHING_API_KEY,
      model: process.env.CYBER_SAKHI_ML_PHISHING_MODEL,
    });
  }
  return deterministicPhishingProvider;
})();

export function analyzePhishingNlp(rawEmail: string): Promise<NlpAnalysisResult> {
  return ACTIVE_PROVIDER.analyze(rawEmail);
}

/** Used by the report to note which NLP stage produced the analysis. */
export function activePhishingProviderLabel(): string {
  return `${ACTIVE_PROVIDER.name} (${ACTIVE_PROVIDER.id})`;
}

// Ensures the weak `ISOLATED_WEAK_KEYWORDS` list stays referenced so future
// classifiers can decide that isolated weak signals do not self-stand.
export { ISOLATED_WEAK_KEYWORDS };
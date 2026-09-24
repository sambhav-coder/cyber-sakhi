/**
 * Canonical government threat-category catalogue (Phase 1: India
 * Intelligence Map).
 *
 * The single controlled vocabulary for map statistics and officer triage.
 * Prior art is fragmented (see "Legacy vocabularies" below); this module
 * is the source of truth going forward. Pure string helpers only: no I/O,
 * no database access, suitable for write-path validation, read-time
 * mapping, and unit tests.
 *
 * Legacy vocabularies observed in the repository (read-only survey):
 * - Email pipeline `threat_type`: EMAIL_PHISHING, EMAIL_FRAUD,
 *   EMAIL_INVESTIGATION (lib/db/casePipeline.ts). Only the first is a
 *   reliable phishing signal; see alias table for why the others stay out.
 * - Evidence vault: HARASSMENT, BLACKMAIL, SCAM, STALKING, THREAT, OTHER
 *   (lib/evidenceConstants.ts).
 * - Offender-network reports: BLACKMAIL, STALKING, SCAM, HARASSMENT,
 *   THREAT, OTHER (lib/offenderNetwork/constants.ts).
 * - NLP trigger taxonomy (internal, NOT case categories): urgency,
 *   credential_harvesting, financial_fraud, malware_delivery,
 *   impersonation, url_pattern (lib/emailTypes.ts).
 * - Legacy admin demo incidents: ad-hoc free text such as "OTP &
 *   Financial Coercion" (lib/storage.ts, demo endpoint only, never in
 *   Supabase cases or gov aggregations).
 */

/** The five canonical categories. Frozen: extend only by deliberate review. */
export const GOV_THREAT_CATEGORIES = Object.freeze([
  "PHISHING",
  "FINANCIAL_FRAUD",
  "BLACKMAIL",
  "THREAT",
  "OTHER",
] as const);

export type GovThreatCategory = (typeof GOV_THREAT_CATEGORIES)[number];

/** Human-readable labels for map UI (counts are always shown beside them). */
export const GOV_THREAT_CATEGORY_LABELS: Readonly<Record<GovThreatCategory, string>> =
  Object.freeze({
    PHISHING: "Phishing",
    FINANCIAL_FRAUD: "Financial fraud",
    BLACKMAIL: "Blackmail",
    THREAT: "Threat",
    OTHER: "Other",
  });

/**
 * Strict canonical check: exact match, case-sensitive, no trimming.
 * Mirrors the existing gov triage style (`GOV_STATUSES.has(...)`). Input
 * normalization is the mapper's job, never this predicate's, so write
 * paths stay strict while read paths stay tolerant — deliberately.
 */
export function isGovThreatCategory(value: unknown): value is GovThreatCategory {
  return (
    typeof value === "string" &&
    (GOV_THREAT_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface GovCategoryMapping {
  /** Resolved canonical category. */
  category: GovThreatCategory;
  /**
   * True when the input was already canonical or an explicit legacy alias.
   * False means the input was NOT reliably classifiable and OTHER was
   * returned as a recorded fallback — never a silent reclassification.
   * In particular, a stored canonical "OTHER" (matched: true) and an
   * unmapped value (matched: false) must not be conflated downstream.
   */
  matched: boolean;
}

/**
 * Explicit legacy alias table. Deliberately narrow — every entry documents
 * why the source value reliably denotes the target:
 * - EMAIL_PHISHING → PHISHING: the pipeline emits it only on SPF/DKIM/DMARC
 *   failure or proven sender spoofing (lib/db/casePipeline.ts), i.e. mail
 *   phishing by construction.
 * - BLACKMAIL → BLACKMAIL, THREAT → THREAT: lexical identity across the
 *   evidence and offender-report vocabularies.
 *
 * Deliberately NOT aliased (each falls back to OTHER with matched: false):
 * - EMAIL_FRAUD: threatScore ≥ 40 is reachable through the harassment
 *   engine alone (lib/emailForensics.ts folds harassment score at full
 *   weight), so the label does not reliably denote financial fraud.
 * - EMAIL_INVESTIGATION: generic pipeline bucket, no category content.
 * - SCAM: spans financial and non-financial reports across vocabularies;
 *   narrowing it would invent data.
 * - HARASSMENT, STALKING: out of catalogue scope; folding them into THREAT
 *   would misclassify distinct harms.
 * - NLP trigger labels (credential_harvesting, impersonation, …): internal
 *   phrase taxonomy, not case categories.
 * - Legacy demo free text ("OTP & Financial Coercion", …): demo-only rows
 *   that never reach Supabase cases.
 */
const LEGACY_ALIASES: Readonly<Record<string, GovThreatCategory>> = Object.freeze({
  EMAIL_PHISHING: "PHISHING",
  BLACKMAIL: "BLACKMAIL",
  THREAT: "THREAT",
});

/**
 * Deterministic, pure read-time compatibility mapping. Normalizes
 * surrounding whitespace and letter case, then resolves canonical values
 * and explicit aliases; anything else — null, empty, unknown, or
 * out-of-scope legacy values — yields an explicit OTHER fallback.
 */
export function mapLegacyThreatCategory(
  value: string | null | undefined,
): GovCategoryMapping {
  if (typeof value !== "string") return { category: "OTHER", matched: false };
  const key = value.trim().toUpperCase();
  if (key.length === 0) return { category: "OTHER", matched: false };
  if (isGovThreatCategory(key)) return { category: key, matched: true };
  const aliased = LEGACY_ALIASES[key];
  if (aliased !== undefined) return { category: aliased, matched: true };
  return { category: "OTHER", matched: false };
}

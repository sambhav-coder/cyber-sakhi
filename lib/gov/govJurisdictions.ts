/**
 * Pure jurisdiction normalization and classification (Phase 2A: India
 * Intelligence Map foundation).
 *
 * Conservative read-time helpers only: no database, no environment, no
 * session, no I/O of any kind. They prepare officer-entered free text for
 * consistent aggregation WITHOUT certifying it — shape validity is never
 * official membership, and nothing here rewrites stored records.
 *
 * Design notes (all deliberate, all documented):
 * - State shape is exactly two uppercase ASCII letters (`^[A-Z]{2}$`).
 *   Input is trimmed and uppercased first: letter case carries no
 *   jurisdiction information, so `"dl"` normalizes to `"DL"` instead of
 *   fragmenting aggregates. This mirrors the Phase-1 split between a
 *   strict write predicate and a lenient read-time normalizer — the triage
 *   write path stays exact-match while aggregation stays tolerant.
 * - Shape is NOT membership: there is no state/UT master list in this
 *   phase, so a well-shaped code is "shape-valid", never "official".
 *   Every result is therefore unverified by construction.
 * - Invalid and missing stay distinguishable: normalization reports
 *   per-field `valid`/`missing` flags so later code can tell "no data"
 *   from "bad data" instead of merging both into null.
 * - District/sub-division/locality remain unverified free text. District
 *   is capped at 120 characters; overlong input is invalid, not
 *   truncated (truncation would silently merge distinct places).
 * - Display label precedent follows the existing aggregation display
 *   (`"Not located"`, lib/gov/govQueries.ts): anything that is not a
 *   complete shape-valid jurisdiction must never render as a real region.
 */

/** State-code shape policy: exactly two uppercase ASCII letters. */
export const GOV_STATE_CODE_PATTERN = /^[A-Z]{2}$/;

/** Maximum district length; overlong input is invalid, never truncated. */
export const GOV_DISTRICT_MAX_LENGTH = 120;

/** Maximum sub-division/locality length (same conservative cap). */
export const GOV_SUBDIVISION_MAX_LENGTH = 120;

/** Display label for anything that is not a complete jurisdiction. */
export const GOV_UNLOCATED_LABEL = "Not located";

export interface GovJurisdictionInput {
  state?: string | null;
  district?: string | null;
  subDivision?: string | null;
  locality?: string | null;
}

export interface GovNormalizedField {
  /** Normalized value, or null when missing, blank, or invalid. */
  value: string | null;
  /** True when no usable input was supplied at all. */
  missing: boolean;
  /** True when the normalized value is usable (shape/length rules pass). */
  valid: boolean;
}

export interface GovNormalizedJurisdiction {
  state: GovNormalizedField;
  district: GovNormalizedField;
  /** Unverified free text; normalized conservatively, never validated. */
  subDivision: GovNormalizedField;
  /** Unverified free text; normalized conservatively, never validated. */
  locality: GovNormalizedField;
}

/**
 * Classification states. Precedence is fixed: INVALID beats INCOMPLETE
 * beats UNLOCATED; LOCATED requires a valid state AND a valid district.
 * All states are unverified — LOCATED means "complete shape-valid input",
 * never "officially confirmed jurisdiction".
 */
export type GovJurisdictionStatus =
  | "LOCATED"
  | "INCOMPLETE"
  | "UNLOCATED"
  | "INVALID";

export interface GovJurisdictionClassification {
  status: GovJurisdictionStatus;
  normalized: GovNormalizedJurisdiction;
}

function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Normalize a state code: trim, uppercase, then shape-check. Lowercase
 * input is accepted and uppercased (case carries no jurisdiction meaning);
 * anything not matching `^[A-Z]{2}$` — full names, numbers, symbols,
 * wrong lengths — is invalid, never coerced into a code.
 */
export function normalizeGovStateCode(
  value: string | null | undefined,
): GovNormalizedField {
  const trimmed = blankToNull(value);
  if (trimmed === null) return { value: null, missing: true, valid: false };
  const code = trimmed.toUpperCase();
  if (!GOV_STATE_CODE_PATTERN.test(code)) {
    return { value: null, missing: false, valid: false };
  }
  return { value: code, missing: false, valid: true };
}

function normalizeFreeText(
  value: string | null | undefined,
  maxLength: number,
): GovNormalizedField {
  const trimmed = blankToNull(value);
  if (trimmed === null) return { value: null, missing: true, valid: false };
  // Collapse internal whitespace runs so "New  Delhi" and "New Delhi"
  // aggregate together; this is cosmetic dedup, not official mapping.
  const collapsed = trimmed.replace(/\s+/g, " ");
  if (collapsed.length > maxLength) {
    return { value: null, missing: false, valid: false };
  }
  return { value: collapsed, missing: false, valid: true };
}

/**
 * Normalize a district: trim, collapse internal whitespace, require
 * non-empty within 120 characters. No official-district claim is made;
 * the value stays unverified free text.
 */
export function normalizeGovDistrict(
  value: string | null | undefined,
): GovNormalizedField {
  return normalizeFreeText(value, GOV_DISTRICT_MAX_LENGTH);
}

/**
 * Normalize a sub-division or locality: same conservative free-text rules
 * as districts. Documented as unverified — no police-station or
 * administrative validation exists in this phase.
 */
export function normalizeGovSubDivision(
  value: string | null | undefined,
): GovNormalizedField {
  return normalizeFreeText(value, GOV_SUBDIVISION_MAX_LENGTH);
}

export function normalizeGovLocality(
  value: string | null | undefined,
): GovNormalizedField {
  return normalizeFreeText(value, GOV_SUBDIVISION_MAX_LENGTH);
}

/** Normalize a full jurisdiction input without mutating the argument. */
export function normalizeGovJurisdiction(
  input: GovJurisdictionInput,
): GovNormalizedJurisdiction {
  return {
    state: normalizeGovStateCode(input.state),
    district: normalizeGovDistrict(input.district),
    subDivision: normalizeGovSubDivision(input.subDivision),
    locality: normalizeGovLocality(input.locality),
  };
}

/**
 * Classify a jurisdiction input. Classification considers state and
 * district only; sub-division/locality are normalized alongside but never
 * promote or demote the status.
 *
 * - LOCATED: valid state shape AND valid district. Complete input only.
 * - INCOMPLETE: no invalid values, but state or district (or both) missing.
 *   A present district without a state is NOT located — it cannot be
 *   placed on a state drill-down and must not pretend otherwise.
 * - UNLOCATED: state and district both missing.
 * - INVALID: any supplied state/district value fails its rules. Invalid
 *   is never hidden inside another state.
 */
export function classifyGovJurisdiction(
  input: GovJurisdictionInput,
): GovJurisdictionClassification {
  const normalized = normalizeGovJurisdiction(input);
  const { state, district } = normalized;

  if (!state.valid && !state.missing) {
    return { status: "INVALID", normalized };
  }
  if (!district.valid && !district.missing) {
    return { status: "INVALID", normalized };
  }
  if (state.valid && district.valid) {
    return { status: "LOCATED", normalized };
  }
  if (state.missing && district.missing) {
    return { status: "UNLOCATED", normalized };
  }
  return { status: "INCOMPLETE", normalized };
}

/**
 * Safe display label. Only a LOCATED jurisdiction renders its codes
 * ("DL" or "DL / DL-07"); every other state renders "Not located" so
 * missing, incomplete, and invalid input can never appear as a real
 * geographic region. Codes shown are officer-entered and unverified.
 */
export function labelGovJurisdiction(
  classification: GovJurisdictionClassification,
): string {
  if (classification.status !== "LOCATED") return GOV_UNLOCATED_LABEL;
  const { state, district } = classification.normalized;
  if (state.value && district.value) return `${state.value} / ${district.value}`;
  return state.value ?? GOV_UNLOCATED_LABEL;
}

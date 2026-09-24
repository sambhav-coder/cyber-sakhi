/**
 * Government intelligence-map data contract (India → State → District).
 *
 * Pure, aggregate-only translation layer over {@link GovGeoSummary}:
 * no database, no environment, no request/session/auth access, no I/O.
 *
 * Privacy properties (deliberate):
 * - Aggregate counts only. No victim PII, no GPS, no evidence, no case
 *   UUIDs/numbers — the contract never carries row-level identifiers, so
 *   hover/drill-down/filter parameters cannot become a privacy bypass.
 * - Every region is explicitly marked `verificationStatus: "unverified"`:
 *   shape-valid codes are officer-entered free text, never officially
 *   verified regions (see lib/gov/govJurisdictions.ts).
 * - Source is always the truthful label "Cyber Sakhi case data".
 *
 * Intensity scale (data-derived, documented):
 * - `intensityRatio` = region cases / max region cases in the same response
 *   (0 when the response is empty). Thresholds below are fixed and relative
 *   to the current response only — they are NOT an official risk
 *   classification and must never be presented as one.
 *   - none: 0 cases | low: ratio < 0.25 | moderate: < 0.5 | high: < 0.8
 *   - peak: ratio >= 0.8 (and > 0 cases)
 * - Suggested UI colors: low → green tones (lower relative intensity),
 *   moderate → amber/teal, high/peak → red tones (higher relative
 *   intensity). "Suppressed"/"Insufficient data" get a neutral grey,
 *   visually distinct from zero.
 *
 * Suppression (opt-in, off by default):
 * - `GOV_MAP_SUPPRESSION_THRESHOLD_DEFAULT` is 0 (disabled) because the
 *   government geography surface is an authenticated, officer-scoped
 *   intelligence view whose existing consumers expect exact counts, and no
 *   suppression policy previously existed there. The offender-network
 *   K_ANONYMITY=3 rule is a separate public-anonymous surface and is not
 *   transplanted here silently.
 * - When a caller passes `suppressionThreshold > 0`, regions with
 *   `0 < totalCases <= threshold` are flagged `suppressed: true` (UI must
 *   render "Suppressed", never the count, and never imply zero). Totals
 *   remain exact for authorized officers; this is display-level protection,
 *   not an anonymous public release — small counts remain derivable from
 *   totals, which is documented rather than hidden.
 */

import type { GovGeoSummary } from "./govQueries";

/** Truthful source label for every map response. */
export const GOV_MAP_SOURCE = "Cyber Sakhi case data" as const;

/** Verification status: officer-entered values, never officially verified. */
export const GOV_MAP_VERIFICATION = "Officer-entered, unverified" as const;

/**
 * Suppression threshold default (0 = disabled). See module docs for why
 * suppression is opt-in on this authenticated surface.
 */
export const GOV_MAP_SUPPRESSION_THRESHOLD_DEFAULT = 0;

/** Data-derived relative intensity; never an official risk classification. */
export type GovMapIntensityLevel = "none" | "low" | "moderate" | "high" | "peak";

export type GovMapRegionType = "state" | "district" | "locality";

export interface GovMapCategoryCount {
  label: string;
  count: number;
}

export interface GovMapRegion {
  regionType: GovMapRegionType;
  /** Normalized aggregate key (e.g. "DL"); "UNKNOWN" only when unlocated. */
  regionCode: string;
  /** Safe display name ("Not located" for unlocated groups). */
  displayName: string;
  /** LOCATED for real shape-valid groups, UNLOCATED for missing/invalid. */
  jurisdictionStatus: "LOCATED" | "UNLOCATED";
  verificationStatus: "unverified";
  totalCases: number;
  intensityLevel: GovMapIntensityLevel;
  /** region cases / max region cases in this response (0 when empty). */
  intensityRatio: number;
  /** Per-region canonical category breakdown (may be empty, never PII). */
  categoryCounts: GovMapCategoryCount[];
  /** True when display must show "Suppressed" instead of the count. */
  suppressed: boolean;
  /** True when the region has no usable data for display. */
  insufficientData: boolean;
}

export interface GovMapExcludedCounts {
  unlocated: number;
  invalidOrIncomplete: number;
}

export interface GovMapContract {
  level: GovGeoSummary["level"];
  state: string | null;
  district: string | null;
  generatedAt: string;
  source: typeof GOV_MAP_SOURCE;
  verification: typeof GOV_MAP_VERIFICATION;
  totals: { cases: number; new7d: number; highRisk: number; open: number };
  regions: GovMapRegion[];
  categoryBreakdown: GovMapCategoryCount[];
  excludedCounts: GovMapExcludedCounts;
  suppressionThreshold: number;
}

/**
 * Data-derived intensity for one region count against the response maximum.
 * Pure and total: `max <= 0` yields none/0 without division by zero.
 */
export function intensityForCount(
  count: number,
  max: number,
): { level: GovMapIntensityLevel; ratio: number } {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(max) || max <= 0) {
    return { level: "none", ratio: 0 };
  }
  const ratio = Math.min(1, count / max);
  if (ratio < 0.25) return { level: "low", ratio };
  if (ratio < 0.5) return { level: "moderate", ratio };
  if (ratio < 0.8) return { level: "high", ratio };
  return { level: "peak", ratio };
}

function regionTypeForLevel(
  level: GovGeoSummary["level"],
): GovMapRegionType {
  if (level === "india") return "state";
  if (level === "state") return "district";
  return "locality";
}

/**
 * Build the stable map contract from a scoped {@link GovGeoSummary}.
 * Pure: reads the summary without mutating it and emits a fresh object
 * graph containing counts and labels only.
 */
export function buildGovMapContract(
  summary: GovGeoSummary,
  opts: { suppressionThreshold?: number } = {},
): GovMapContract {
  const suppressionThreshold =
    opts.suppressionThreshold ?? GOV_MAP_SUPPRESSION_THRESHOLD_DEFAULT;
  const regionType = regionTypeForLevel(summary.level);
  const max = Math.max(0, ...summary.rows.map((r) => r.metric.cases));
  const regions: GovMapRegion[] = summary.rows.map((row) => {
    const unlocated = row.code === "UNKNOWN" || row.label === "Not located";
    const { level, ratio } = intensityForCount(row.metric.cases, max);
    const suppressed =
      suppressionThreshold > 0 &&
      row.metric.cases > 0 &&
      row.metric.cases <= suppressionThreshold;
    return {
      regionType,
      regionCode: row.code,
      displayName: row.label,
      jurisdictionStatus: unlocated ? "UNLOCATED" : "LOCATED",
      verificationStatus: "unverified",
      totalCases: row.metric.cases,
      intensityLevel: level,
      intensityRatio: ratio,
      categoryCounts: (row.categories ?? []).map((c) => ({ ...c })),
      suppressed,
      insufficientData: suppressed || row.metric.cases === 0,
    };
  });

  return {
    level: summary.level,
    state: summary.state,
    district: summary.district,
    generatedAt: summary.generatedAt,
    source: GOV_MAP_SOURCE,
    verification: GOV_MAP_VERIFICATION,
    totals: { ...summary.total },
    regions,
    categoryBreakdown: (summary.threatBreakdown ?? []).map((c) => ({ ...c })),
    excludedCounts: { ...summary.excludedCounts },
    suppressionThreshold,
  };
}

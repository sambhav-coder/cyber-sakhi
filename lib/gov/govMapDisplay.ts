/**
 * Pure display helpers for the Geographic Intelligence choropleth.
 *
 * No database, no network, no DOM, no auth: these functions translate the
 * already-authorized aggregate rows (`/gov/api/geo`) into map rendering
 * decisions (region join, fill color, label treatment). All inputs are read
 * without mutation.
 *
 * Display-join honesty (deliberate):
 * - Aggregate keys are officer-entered 2-letter state codes (unverified
 *   free text). Geometry names follow the DataMeet boundary asset verbatim
 *   (see public/geo/ATTRIBUTION.txt), including its historical spellings.
 * - `STATE_CODE_TO_GEO_NAME` is a DISPLAY join only: it decides which
 *   polygon a count paints. It is not an official LGD/code registry, it
 *   confers no verification, and unmatched codes are reported via
 *   `unmatched` (rendered as an honest "not on map" note) instead of being
 *   forced onto a wrong polygon.
 * - Post-reorganization codes without separate geometry map to their
 *   documented fallback (LA → "Jammu & Kashmir" polygon); this is stated in
 *   the table and in the docs, never silently upgraded to a real region.
 */

export type GovMapVolumeLevel = "none" | "low" | "moderate" | "high" | "peak";

export interface GovMapLegendEntry {
  level: GovMapVolumeLevel;
  label: string;
  fill: string;
}

/**
 * Dark-theme choropleth fills keyed by relative volume level.
 * Stable, accessible, and red/green-meaningful: green = lower relative
 * volume, red = higher relative volume, slate = no data. These encode
 * RELATIVE case volume for the current view only — never official risk.
 */
export const GOV_MAP_VOLUME_FILLS: Readonly<Record<GovMapVolumeLevel, string>> =
  Object.freeze({
    none: "#1e293b",
    low: "#14532d",
    moderate: "#a16207",
    high: "#b91c1c",
    peak: "#ef4444",
  });

export const GOV_MAP_VOLUME_LEGEND: ReadonlyArray<GovMapLegendEntry> =
  Object.freeze([
    { level: "none", label: "No data", fill: GOV_MAP_VOLUME_FILLS.none },
    { level: "low", label: "Lower volume", fill: GOV_MAP_VOLUME_FILLS.low },
    {
      level: "moderate",
      label: "Moderate volume",
      fill: GOV_MAP_VOLUME_FILLS.moderate,
    },
    { level: "high", label: "Higher volume", fill: GOV_MAP_VOLUME_FILLS.high },
    { level: "peak", label: "Highest volume", fill: GOV_MAP_VOLUME_FILLS.peak },
  ]);

/**
 * Officer-entered 2-letter code → boundary-asset ST_NM (exact dataset
 * spelling). Covers standard codes plus common aliases (CT/CG, OR/OD,
 * TS/TG, UK/UT). LA has no separate polygon in this asset and falls back
 * to the pre-bifurcation "Jammu & Kashmir" polygon (documented).
 */
export const STATE_CODE_TO_GEO_NAME: Readonly<Record<string, string>> =
  Object.freeze({
    AN: "Andaman & Nicobar Island",
    AP: "Andhra Pradesh",
    AR: "Arunanchal Pradesh",
    AS: "Assam",
    BR: "Bihar",
    CG: "Chhattisgarh",
    CH: "Chandigarh",
    CT: "Chhattisgarh",
    DD: "Daman & Diu",
    DL: "NCT of Delhi",
    DN: "Dadara & Nagar Havelli",
    GA: "Goa",
    GJ: "Gujarat",
    HP: "Himachal Pradesh",
    HR: "Haryana",
    JH: "Jharkhand",
    JK: "Jammu & Kashmir",
    KA: "Karnataka",
    KL: "Kerala",
    LA: "Jammu & Kashmir",
    LD: "Lakshadweep",
    MH: "Maharashtra",
    ML: "Meghalaya",
    MN: "Manipur",
    MP: "Madhya Pradesh",
    MZ: "Mizoram",
    NL: "Nagaland",
    OD: "Odisha",
    OR: "Odisha",
    PB: "Punjab",
    PY: "Puducherry",
    RJ: "Rajasthan",
    SK: "Sikkim",
    TG: "Telangana",
    TN: "Tamil Nadu",
    TR: "Tripura",
    TS: "Telangana",
    UK: "Uttarakhand",
    UP: "Uttar Pradesh",
    UT: "Uttarakhand",
    WB: "West Bengal",
  });

/** Short on-map labels for small or long-named regions. */
export const GOV_MAP_SHORT_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    "Andaman & Nicobar Island": "A & N Islands",
    "Dadara & Nagar Havelli": "DNH",
    "Daman & Diu": "Daman & Diu",
    Lakshadweep: "Lakshadweep",
    "NCT of Delhi": "Delhi",
    Chandigarh: "Chandigarh",
    Puducherry: "Puducherry",
    Goa: "Goa",
    Sikkim: "Sikkim",
    Tripura: "Tripura",
  });

export interface GovMapAggregateRow {
  code: string;
  metric: { cases: number; new7d: number; highRisk: number; open: number };
}

export interface GovMapJoinedRegion {
  /** Boundary-asset ST_NM. */
  geoName: string;
  /** Aggregate total painted onto this polygon (0 when no data). */
  totalCases: number;
  hasData: boolean;
  metric: { cases: number; new7d: number; highRisk: number; open: number };
}

/**
 * Join aggregate rows onto geometry names. Returns per-geometry totals plus
 * the aggregate codes that match no polygon (caller must surface these
 * honestly instead of dropping them silently). Pure; inputs unmutated.
 */
export function joinAggregateToGeo(rows: GovMapAggregateRow[]): {
  byGeoName: Map<string, GovMapJoinedRegion>;
  unmatched: string[];
} {
  const byGeoName = new Map<string, GovMapJoinedRegion>();
  const unmatched: string[] = [];
  for (const row of rows) {
    if (row.code === "UNKNOWN") {
      unmatched.push(row.code);
      continue;
    }
    const geoName = STATE_CODE_TO_GEO_NAME[row.code];
    if (!geoName) {
      unmatched.push(row.code);
      continue;
    }
    const prev = byGeoName.get(geoName);
    if (!prev) {
      byGeoName.set(geoName, {
        geoName,
        totalCases: row.metric.cases,
        hasData: true,
        metric: { ...row.metric },
      });
    } else {
      prev.totalCases += row.metric.cases;
      prev.metric.cases += row.metric.cases;
      prev.metric.new7d += row.metric.new7d;
      prev.metric.highRisk += row.metric.highRisk;
      prev.metric.open += row.metric.open;
    }
  }
  return { byGeoName, unmatched };
}

/**
 * Volume level for a region count against the view maximum. Mirrors
 * `intensityForCount` (lib/gov/govMapContract.ts) so map fills and the data
 * contract never disagree: none = 0, low < 25%, moderate < 50%,
 * high < 80%, peak >= 80%.
 */
export function volumeLevelForCount(
  count: number,
  max: number,
): GovMapVolumeLevel {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(max) || max <= 0) {
    return "none";
  }
  const ratio = Math.min(1, count / max);
  if (ratio < 0.25) return "low";
  if (ratio < 0.5) return "moderate";
  if (ratio < 0.8) return "high";
  return "peak";
}

/** Fill color for a region count against the view maximum. */
export function volumeFillForCount(count: number, max: number): string {
  return GOV_MAP_VOLUME_FILLS[volumeLevelForCount(count, max)];
}

export type GovMapLabelTreatment =
  | { kind: "full" }
  | { kind: "short" }
  | { kind: "dot" };

/**
 * Label treatment from a region's projected bounding-box area (px²).
 * Large polygons get full names, mid-size get short labels, tiny ones get
 * a dot marker (name always remains available in the hover tooltip).
 * Thresholds are display heuristics, not data rules.
 */
export function labelTreatmentForArea(areaPx: number): GovMapLabelTreatment {
  if (!Number.isFinite(areaPx) || areaPx < 0) return { kind: "dot" };
  if (areaPx >= 9000) return { kind: "full" };
  if (areaPx >= 2200) return { kind: "short" };
  return { kind: "dot" };
}

/** Display label for a geometry name under a given treatment. */
export function displayLabelForGeoName(
  geoName: string,
  treatment: GovMapLabelTreatment,
): string | null {
  if (treatment.kind === "dot") return null;
  if (treatment.kind === "short")
    return GOV_MAP_SHORT_LABELS[geoName] ?? geoName;
  return geoName;
}

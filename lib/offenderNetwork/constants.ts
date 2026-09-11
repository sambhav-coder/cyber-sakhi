/* ------------------------------------------------------------------ *
 * Sakhi Network — shared constants and wire types.
 *
 * Imported by both the browser (panel, seed card) and the server
 * (routes, store), so this file must stay free of Node-only imports.
 * ------------------------------------------------------------------ */

export type IndicatorType = "phone" | "upi" | "email" | "domain" | "handle";

export const INDICATOR_TYPES: readonly IndicatorType[] = [
  "phone",
  "upi",
  "email",
  "domain",
  "handle",
];

export type ReportCategory =
  | "BLACKMAIL"
  | "STALKING"
  | "SCAM"
  | "HARASSMENT"
  | "THREAT"
  | "OTHER";

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  "BLACKMAIL",
  "STALKING",
  "SCAM",
  "HARASSMENT",
  "THREAT",
  "OTHER",
];

/**
 * Coarse, city-level only. A fixed list rather than free text so a
 * reporter can never type an address or other identifying detail into it.
 */
export const REGIONS = [
  "Delhi",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Chandigarh",
  "Bhopal",
  "Indore",
  "Patna",
  "Kochi",
  "Guwahati",
  "Bhubaneswar",
  "Nagpur",
  "Surat",
  "Other",
] as const;

/**
 * Region and category detail is only released once this many distinct
 * people have reported the same identifier. Below it, a single reporter's
 * city could identify them to the person they reported.
 */
export const K_ANONYMITY = 3;

export const MAX_INDICATORS_PER_REQUEST = 12;

/** New fingerprints a single account may add per rolling hour. */
export const REPORTS_PER_HOUR_LIMIT = 40;

/* ------------------------------ wire types ---------------------------- */

export interface IndicatorInput {
  type: IndicatorType;
  value: string;
}

export interface LookupResult {
  /** Position in the request's indicator array. */
  index: number;
  valid: boolean;
  /** Distinct accounts that reported it, not counting the requester. */
  otherReporters: number;
  requesterHasReported: boolean;
  /** Day precision only; exact timestamps could single out a reporter. */
  firstSeenDay: string | null;
  lastSeenDay: string | null;
  /** Empty unless at least K_ANONYMITY accounts have reported it. */
  regions: string[];
  categories: ReportCategory[];
  /** True when reports exist but detail is held back below K_ANONYMITY. */
  detailWithheld: boolean;
}

export interface LookupResponse {
  backend: "file" | "supabase";
  results: LookupResult[];
}

export interface ReportResponse {
  backend: "file" | "supabase";
  inserted: number;
  duplicates: number;
}

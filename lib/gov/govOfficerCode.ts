/**
 * Government Officer ID: canonical format, normalization, and validation.
 *
 * Canonical format: `SS-DDD-NNNN` (example: `DL-CYB-0001`)
 * - `SS`: 2-letter state / union-territory jurisdiction code (plus `DEMO`
 *   for demonstration accounts). The code is a jurisdiction *hint*: the
 *   officer's authorized jurisdiction is always resolved server-side from
 *   the `gov_officers` row, never trusted from user input.
 * - `DDD`: 3-letter department identifier (extensible catalogue below).
 * - `NNNN`: 4-digit unique serial (`0001`–`9999`).
 *
 * Pure string helpers only: no I/O, suitable for login routing, seed
 * scripts, and unit tests. Legacy officer codes (e.g. `GOV-01-XXXX`) issued
 * before this format remain valid login identifiers; `isGovOfficerCodeLike`
 * distinguishes "shaped like an Officer ID" from other identifiers so the
 * login layer can route without leaking existence.
 */

/** State / union-territory jurisdiction code → display name. */
export const GOV_STATE_JURISDICTIONS: Readonly<Record<string, string>> = Object.freeze({
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TG: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UT: "Uttarakhand",
  WB: "West Bengal",
  AN: "Andaman and Nicobar Islands",
  CH: "Chandigarh",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi (NCT)",
  JK: "Jammu and Kashmir",
  LA: "Ladakh",
  LD: "Lakshadweep",
  PY: "Puducherry",
  DEMO: "Demonstration jurisdiction",
});

/** Department identifier → display name. Extend here, never inline. */
export const GOV_DEPARTMENT_CODES: Readonly<Record<string, string>> = Object.freeze({
  CYB: "Cybersecurity",
  FOR: "Digital Forensics",
  INR: "Incident Response",
  THI: "Threat Intelligence",
  EVC: "Evidence Custody",
  AUD: "Audit",
  ADM: "Administration",
});

/** Serial range for the `NNNN` segment. */
export const GOV_OFFICER_SERIAL_MIN = 1;
export const GOV_OFFICER_SERIAL_MAX = 9999;

/**
 * Shape of a canonical Officer ID: `SS-DDD-NNNN`. The state segment allows
 * 2–4 letters so the `DEMO` demonstration jurisdiction fits the same shape;
 * every real state/UT code is 2 letters.
 */
export const GOV_OFFICER_CODE_PATTERN = /^([A-Z]{2,4})-([A-Z]{3})-(\d{4})$/;

export interface GovParsedOfficerCode {
  /** Normalized canonical code, e.g. `DL-CYB-0001`. */
  code: string;
  /** Jurisdiction hint from the `SS` segment (display only). */
  stateCode: string;
  /** Department hint from the `DDD` segment (display only). */
  departmentCode: string;
  /** Serial number 1–9999. */
  serial: number;
}

/**
 * Normalize raw user input toward canonical form: trim, uppercase,
 * unify spaces/underscores/slashes into hyphens, collapse repeats.
 * Normalization is display/routing hygiene only — existence and authority
 * are always checked against the database.
 */
export function normalizeGovOfficerCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_/.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** True when the state code is a known jurisdiction (incl. DEMO). */
export function isKnownGovStateCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOV_STATE_JURISDICTIONS, code);
}

/** True when the department code is in the approved catalogue. */
export function isKnownGovDepartmentCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOV_DEPARTMENT_CODES, code);
}

/**
 * Shape-only check: does the input look like a canonical Officer ID?
 * Used for identifier routing (code vs. email) BEFORE any existence
 * check, so routing itself reveals nothing about stored accounts.
 */
export function isGovOfficerCodeLike(input: string): boolean {
  return GOV_OFFICER_CODE_PATTERN.test(normalizeGovOfficerCode(input));
}

/**
 * Full validation: shape + known jurisdiction + known department +
 * serial in range. Returns the parsed code, or null for anything else.
 * A non-null result means "well-formed", never "exists and is active".
 */
export function parseGovOfficerCode(input: string): GovParsedOfficerCode | null {
  const code = normalizeGovOfficerCode(input);
  const match = GOV_OFFICER_CODE_PATTERN.exec(code);
  if (!match) return null;
  const [, stateCode, departmentCode, serialText] = match;
  if (!isKnownGovStateCode(stateCode) || !isKnownGovDepartmentCode(departmentCode)) {
    return null;
  }
  const serial = parseInt(serialText, 10);
  if (!Number.isFinite(serial) || serial < GOV_OFFICER_SERIAL_MIN || serial > GOV_OFFICER_SERIAL_MAX) {
    return null;
  }
  return { code, stateCode, departmentCode, serial };
}

/**
 * Build a canonical code from parts. Returns null when any part is
 * invalid, so provisioning paths fail closed instead of minting
 * ambiguous identifiers.
 */
export function formatGovOfficerCode(
  stateCode: string,
  departmentCode: string,
  serial: number,
): string | null {
  const state = stateCode.trim().toUpperCase();
  const dept = departmentCode.trim().toUpperCase();
  if (!isKnownGovStateCode(state) || !isKnownGovDepartmentCode(dept)) return null;
  if (!Number.isInteger(serial) || serial < GOV_OFFICER_SERIAL_MIN || serial > GOV_OFFICER_SERIAL_MAX) {
    return null;
  }
  return `${state}-${dept}-${String(serial).padStart(4, "0")}`;
}

/** Human-readable jurisdiction hint for a parsed code (display only). */
export function describeGovOfficerCode(parsed: GovParsedOfficerCode): string {
  const state = GOV_STATE_JURISDICTIONS[parsed.stateCode] ?? parsed.stateCode;
  const dept = GOV_DEPARTMENT_CODES[parsed.departmentCode] ?? parsed.departmentCode;
  return `${parsed.code} · ${dept}, ${state}`;
}

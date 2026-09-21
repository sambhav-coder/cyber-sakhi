/**
 * Government resource binding helpers (Unit 4B — pure, no I/O).
 *
 * Binding rules enforced here, before any authorization decision:
 * - Resource IDs are validated (UUID shape, same convention as
 *   `isValidUuid` in lib/db/cases.ts, intentionally local so this module
 *   stays free of database imports and stays unit-testable).
 * - Evidence is never authorized from an evidence ID alone: the parent
 *   case must be loaded first and the evidence row must belong to it.
 *   Client-supplied case IDs are never trusted for this check.
 * - Denials are uniform: existence and scope failures share one shape so
 *   callers cannot leak which one occurred.
 */

export const GOV_RESOURCE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID-shape check for case, evidence, assignment, and grant IDs. */
export function isValidGovResourceId(value: string | null | undefined): boolean {
  return typeof value === "string" && GOV_RESOURCE_ID_PATTERN.test(value.trim());
}

/** Minimal bound case row as loaded server-side (never client-supplied). */
export interface GovBoundCase {
  id: string;
}

/** Minimal bound evidence row as loaded server-side (never client-supplied). */
export interface GovBoundEvidence {
  id: string;
  /** Parent case ID from the evidence row itself. */
  caseId: string | null;
}

/**
 * Confirm a server-loaded evidence row belongs to a server-loaded case.
 * Null parent or ID mismatch denies: orphan or cross-case evidence must
 * never inherit the requested case's authorization.
 */
export function isEvidenceBoundToCase(evidence: GovBoundEvidence, caseId: string): boolean {
  return evidence.caseId !== null && evidence.caseId === caseId;
}

/** Uniform denial body: identical shape for missing and out-of-scope. */
export interface GovUniformDenial {
  error: string;
}

export function govUniformNotFound(): { status: 404; body: GovUniformDenial } {
  return { status: 404, body: { error: "Not found." } };
}

/**
 * Validate a caller-supplied resource ID before any database lookup.
 * Returns the trimmed ID, or null when malformed (caller maps to 422).
 */
export function parseGovResourceId(value: string | null | undefined): string | null {
  if (!isValidGovResourceId(value)) return null;
  return (value as string).trim();
}

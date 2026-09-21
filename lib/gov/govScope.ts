/**
 * Government jurisdiction scope predicate (Unit 4B — pure, no I/O).
 *
 * Decides scope access only. Must be combined with session validity, role
 * permission, resource binding, assignment/grant usability, tiers, MFA, and
 * audit by the authorization orchestrator (govAuthorization.ts). Never
 * trusts browser-supplied values: every input here must be server-resolved
 * (officer row, resource row, evaluated assignment/grant outcomes).
 *
 * Fail-closed rules (no OR shortcuts):
 * - Missing, invalid, or retired jurisdiction never satisfies a geographic
 *   scope. Unlocated resources are deniable only, never routable.
 * - ALL_INDIA requires explicit ALL_INDIA officer scope, never role alone.
 * - Grants narrow within jurisdiction; they cannot widen it. The grant path
 *   therefore re-checks officer geographic scope first.
 * - `unlocated_queue` is a recognized outcome with no approved capability
 *   behind it: this predicate never allows via that path until a D8
 *   catalogue decision lands. Unknown queue access stays denied.
 */

import type { GovScope, GovScopeDecision } from "./govTypes";

/** Officer jurisdiction snapshot, server-resolved from gov_officers. */
export interface GovScopeOfficer {
  scope: GovScope;
  stateCode: string | null;
  districtCode: string | null;
}

/**
 * Resource jurisdiction snapshot, server-resolved from the bound resource.
 * Codes are opaque strings here: LGD validity is established upstream by
 * the resource-binding layer against the approved reference source.
 * - located: current, valid codes present as required by the scope level.
 * - unlocated: incident jurisdiction absent (NULL).
 * - invalid: malformed or unverifiable codes.
 * - retired: well-formed codes that are no longer current.
 */
export interface GovScopeResource {
  id: string;
  stateCode: string | null;
  districtCode: string | null;
  jurisdictionStatus: "located" | "unlocated" | "invalid" | "retired";
}

/** Pre-evaluated assignment outcome for this officer and resource. */
export type GovScopeAssignment =
  | { state: "valid" }
  | { state: "missing" | "expired" | "revoked" };

/** Pre-evaluated grant outcome plus its recorded scope and case binding. */
export interface GovScopeGrant {
  usable: boolean;
  unusableReason?: "grant_missing" | "grant_expired" | "grant_revoked";
  grantId: string | null;
  scope: GovScope;
  stateCode: string | null;
  districtCode: string | null;
  caseId: string | null;
}

export interface GovScopeInput {
  officer: GovScopeOfficer;
  resource: GovScopeResource;
  /** Assignment outcome; required input when officer scope is ASSIGNED_CASES. */
  assignment?: GovScopeAssignment;
  /** Grant under evaluation; absent means the grant path is not attempted. */
  grant?: GovScopeGrant;
  correlationId: string;
}

type ScopeRank = 0 | 1 | 2 | 3;

/** Narrower-or-equal rank: ASSIGNED_CASES < DISTRICT < STATE < ALL_INDIA. */
function scopeRank(scope: GovScope): ScopeRank {
  switch (scope) {
    case "ASSIGNED_CASES":
      return 0;
    case "DISTRICT":
      return 1;
    case "STATE":
      return 2;
    case "ALL_INDIA":
      return 3;
  }
}

/**
 * Grant scope must sit within officer scope with matching codes: a grant
 * can only narrow context (case, time, tier), never widen jurisdiction.
 * Broader officer scopes encompass narrower grant scopes when the state
 * matches; an ALL_INDIA officer encompasses any grant scope.
 */
export function isGrantScopeCompatible(
  officer: GovScopeOfficer,
  grant: Pick<GovScopeGrant, "scope" | "stateCode" | "districtCode">,
): boolean {
  if (scopeRank(grant.scope) > scopeRank(officer.scope)) return false;
  if (grant.scope === "ALL_INDIA") return officer.scope === "ALL_INDIA";
  if (officer.scope === "ALL_INDIA") return true;
  if (grant.stateCode === null) {
    return grant.scope === "ASSIGNED_CASES" && officer.scope === "ASSIGNED_CASES";
  }
  if (grant.stateCode !== officer.stateCode) return false;
  if (grant.scope === "DISTRICT" || grant.districtCode !== null) {
    if (grant.districtCode === null) return false;
    if (officer.districtCode !== null && grant.districtCode !== officer.districtCode) {
      return false;
    }
  }
  return true;
}

function codesEqual(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

/**
 * Geographic scope check shared by the direct path and the grant path.
 * Returns the `via` value on success, or null with the denial reason.
 */
function geographicMatch(
  officer: GovScopeOfficer,
  resource: GovScopeResource,
): { via: "all_india" | "state" | "district" } | { deny: "out_of_scope" } {
  switch (officer.scope) {
    case "ALL_INDIA":
      return { via: "all_india" };
    case "STATE":
      return codesEqual(resource.stateCode, officer.stateCode)
        ? { via: "state" }
        : { deny: "out_of_scope" };
    case "DISTRICT":
      return codesEqual(resource.stateCode, officer.stateCode) &&
        codesEqual(resource.districtCode, officer.districtCode)
        ? { via: "district" }
        : { deny: "out_of_scope" };
    case "ASSIGNED_CASES":
      return { deny: "out_of_scope" };
  }
}

/**
 * Pure scope predicate. Conjunction only: every allow path requires its
 * full condition set; anything else denies with a safe reason code.
 */
export function evaluateGovScope(input: GovScopeInput): GovScopeDecision {
  const { officer, resource, correlationId } = input;

  if (resource.jurisdictionStatus === "invalid") {
    return { allow: false, reason: "malformed_code", correlationId };
  }
  if (resource.jurisdictionStatus === "unlocated") {
    return { allow: false, reason: "unlocated", correlationId };
  }
  if (resource.jurisdictionStatus === "retired") {
    // Frozen history stays readable elsewhere; it never authorizes scope.
    return { allow: false, reason: "out_of_scope", correlationId };
  }

  if (officer.scope === "ASSIGNED_CASES") {
    const assignment = input.assignment ?? { state: "missing" as const };
    if (assignment.state === "valid") {
      return { allow: true, via: "assigned", correlationId };
    }
    return {
      allow: false,
      reason:
        assignment.state === "expired"
          ? "assignment_expired"
          : assignment.state === "revoked"
            ? "assignment_revoked"
            : "assignment_missing",
      correlationId,
    };
  }

  const grant = input.grant;
  if (grant !== undefined) {
    if (!grant.usable) {
      return {
        allow: false,
        reason: grant.unusableReason ?? "grant_missing",
        correlationId,
      };
    }
    // D2 case-bound invariant: a grant without a case binding cannot
    // authorize any resource. Jurisdiction-wide grants do not exist.
    if (grant.caseId === null || grant.caseId !== resource.id) {
      return { allow: false, reason: "grant_scope_exceeded", correlationId };
    }
    if (!isGrantScopeCompatible(officer, grant)) {
      return { allow: false, reason: "grant_scope_exceeded", correlationId };
    }
    const geo = geographicMatch(officer, resource);
    if ("deny" in geo) return { allow: false, reason: geo.deny, correlationId };
    return { allow: true, via: "grant", correlationId };
  }

  const geo = geographicMatch(officer, resource);
  if ("deny" in geo) return { allow: false, reason: geo.deny, correlationId };
  return { allow: true, via: geo.via, correlationId };
}

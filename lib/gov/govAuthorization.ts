/**
 * Government authorization orchestrator (Unit 4B — pure, no I/O).
 *
 * Conjunctive pipeline over server-resolved, pre-evaluated inputs:
 * session → officer → permission → resource → scope (+assignment/grant) →
 * tiers → MFA → audit → decision. Every stage can only deny; allow requires
 * all stages to pass. No OR shortcuts.
 *
 * Boundaries (what this module does NOT do):
 * - No database access: session evaluation, resource loading, assignment
 *   and grant usability are computed by their owners and passed in.
 * - No break-glass workflow: break_glass.* permissions always deny with
 *   BREAK_GLASS_REQUIRED until a separately approved workflow exists.
 * - No field-level serialization: tiers flow through as labels; projection
 *   by tier belongs to route serializers (pending field-taxonomy policy).
 * - Audit events are BUILT here (pure, via govAudit builders) so every
 *   decision carries its audit record; persistence stays with the caller.
 */

import crypto from "node:crypto";
import type {
  GovAuthorizationDecision,
  GovEvidenceAccessTier,
  GovOfficerContext,
  GovPermission,
  GovPiiTier,
  GovScopeDecision,
} from "./govTypes";
import { roleHasDefaultPermission } from "./govPermissions";
import { buildGovAuditEvent, type GovAuditAction, type GovAuditEventRecord } from "./govAudit";
import {
  evaluateGovScope,
  type GovScopeAssignment,
  type GovScopeGrant,
  type GovScopeOfficer,
  type GovScopeResource,
} from "./govScope";
import type { GovSessionEvaluation } from "./govSession";

export type GovDenyReason =
  | "INVALID_SESSION"
  | "OFFICER_INACTIVE"
  | "SESSION_REVOKED"
  | "SESSION_VERSION_MISMATCH"
  | "PERMISSION_MISSING"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_OUT_OF_SCOPE"
  | "JURISDICTION_MISSING"
  | "ASSIGNMENT_REQUIRED"
  | "ASSIGNMENT_INVALID"
  | "GRANT_REQUIRED"
  | "GRANT_EXPIRED"
  | "GRANT_REVOKED"
  | "MFA_REQUIRED"
  | "MFA_STALE"
  | "TIER_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "BREAK_GLASS_REQUIRED"
  | "AUDIT_UNAVAILABLE"
  | "MALFORMED_REQUEST";

const DENY_HTTP: Record<GovDenyReason, 401 | 403 | 404 | 422 | 500> = {
  INVALID_SESSION: 401,
  OFFICER_INACTIVE: 403,
  SESSION_REVOKED: 401,
  SESSION_VERSION_MISMATCH: 401,
  PERMISSION_MISSING: 403,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_OUT_OF_SCOPE: 404,
  JURISDICTION_MISSING: 404,
  ASSIGNMENT_REQUIRED: 403,
  ASSIGNMENT_INVALID: 403,
  GRANT_REQUIRED: 403,
  GRANT_EXPIRED: 403,
  GRANT_REVOKED: 403,
  MFA_REQUIRED: 403,
  MFA_STALE: 403,
  TIER_NOT_ALLOWED: 403,
  APPROVAL_REQUIRED: 403,
  BREAK_GLASS_REQUIRED: 403,
  AUDIT_UNAVAILABLE: 500,
  MALFORMED_REQUEST: 422,
};

/** Scope-denial reasons that must present as uniform 404 (no existence oracle). */
function scopeDenyToAuthz(
  decision: Extract<GovScopeDecision, { allow: false }>,
): GovDenyReason {
  switch (decision.reason) {
    case "unlocated":
      return "JURISDICTION_MISSING";
    case "assignment_missing":
      return "ASSIGNMENT_REQUIRED";
    case "assignment_expired":
    case "assignment_revoked":
      return "ASSIGNMENT_INVALID";
    case "grant_missing":
      return "GRANT_REQUIRED";
    case "grant_expired":
      return "GRANT_EXPIRED";
    case "grant_revoked":
    case "grant_scope_exceeded":
      return "GRANT_REVOKED";
    case "out_of_scope":
    case "malformed_code":
    case "location_mismatch":
    case "inferred_quarantine":
      return "RESOURCE_OUT_OF_SCOPE";
  }
}

export interface GovAuthorizationInput {
  /** Pre-evaluated session (from validateGovSessionToken). */
  session: GovSessionEvaluation;
  officer: GovOfficerContext;
  /** Action permission under evaluation (never client-supplied). */
  permission: GovPermission;
  /** True when the caller-supplied resource ID was malformed. */
  resourceIdMalformed: boolean;
  /** Server-loaded resource snapshot, or null when not found. */
  resource: GovScopeResource | null;
  /** Assignment outcome for ASSIGNED_CASES scope evaluation. */
  assignment?: GovScopeAssignment;
  /** Grant under evaluation; absent means the grant path is not attempted. */
  grant?: GovScopeGrant;
  /** Requested tiers; granted only up to what the role catalogue allows. */
  requestedPiiTier: GovPiiTier;
  requestedEvidenceTier: GovEvidenceAccessTier;
  /** Whether this action needs step-up MFA, and its freshness state. */
  mfaRequired: boolean;
  mfaFresh: boolean;
  mfaEverVerified: boolean;
  /** Audit action describing this authorization check. */
  auditAction: GovAuditAction;
  correlationId?: string;
}

export interface GovAuthorizationResult {
  decision: GovAuthorizationDecision;
  /** Built audit record for this decision; persistence stays with the caller. */
  audit: GovAuditEventRecord | null;
  /** Deny classification for logging and HTTP mapping (null on allow). */
  denyReason: GovDenyReason | null;
}

/**
 * Least-privilege tier coupling against the frozen catalogue: a requested
 * tier is granted only when the officer's role defaults include a
 * permission capable of that tier. Structural guard, not policy.
 */
function tiersAllowed(
  role: GovOfficerContext["role"],
  piiTier: GovPiiTier,
  evidenceTier: GovEvidenceAccessTier,
): boolean {
  const has = (permission: GovPermission): boolean => roleHasDefaultPermission(role, permission);
  if (piiTier === "full" && !has("case.view_pii")) return false;
  if (piiTier === "masked" && !has("case.view_pii") && !has("case.view")) return false;
  if ((piiTier === "meta" || piiTier === "none") && !has("case.view_meta") && !has("case.view") && !has("case.view_pii")) {
    // Analyst-style aggregate paths carry their own analytics/geo permissions.
    if (!has("analytics.view") && !has("geo.view") && !has("indicator.view")) return false;
  }
  if (evidenceTier === "download" && !has("evidence.download")) return false;
  if (evidenceTier === "content" && !has("evidence.view_content") && !has("evidence.download")) {
    return false;
  }
  if (evidenceTier === "metadata" && !has("evidence.view") && !has("evidence.list") && !has("evidence.verify")) {
    return false;
  }
  if (evidenceTier === "list" && !has("evidence.list") && !has("evidence.view")) return false;
  return true;
}

function newCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Run the conjunctive authorization pipeline. Pure: all inputs are
 * server-resolved values; the only construction performed here is the
 * audit record and the decision object.
 */
export function authorizeGovRequest(input: GovAuthorizationInput): GovAuthorizationResult {
  const correlationId = input.correlationId ?? newCorrelationId();
  const auditBase = {
    caseId: input.resource?.id ?? null,
    correlationId,
  };

  const deny = (
    reason: GovDenyReason,
    auditAction: GovAuditAction = input.auditAction,
  ): GovAuthorizationResult => {
    const audit = buildGovAuditEvent(
      {
        action: auditAction,
        actor: {
          kind: "gov_officer",
          officerId: input.officer.officerId,
          officerCode: input.officer.officerCode,
          role: input.officer.role,
          scope: input.officer.scope,
          stateCode: input.officer.stateCode,
          districtCode: input.officer.districtCode,
        },
        ...auditBase,
        grantId: input.grant?.grantId ?? null,
        permission: input.permission,
        result: "deny",
        denialReason: reason,
      },
      Date.now(),
    );
    if (audit === null) {
      return {
        decision: { allow: false, reason: "AUDIT_UNAVAILABLE", http: 500, correlationId },
        audit: null,
        denyReason: "AUDIT_UNAVAILABLE",
      };
    }
    return {
      decision: { allow: false, reason, http: DENY_HTTP[reason], correlationId },
      audit,
      denyReason: reason,
    };
  };

  // 1-3. Session validity (pre-evaluated; map to safe reasons).
  if (!input.session.valid) {
    switch (input.session.reason) {
      case "revoked":
        return deny("SESSION_REVOKED");
      case "officer_missing":
        return deny("INVALID_SESSION");
      case "officer_inactive":
        return deny("OFFICER_INACTIVE");
      case "version_mismatch":
        return deny("SESSION_VERSION_MISMATCH");
      case "not_found":
      case "absolute_expired":
      case "idle_expired":
        return deny("INVALID_SESSION");
    }
  }

  // 4. Break-glass has no approved workflow: always deny, fail closed.
  if (input.permission === "break_glass.request" || input.permission === "break_glass.approve") {
    return deny("BREAK_GLASS_REQUIRED");
  }

  // 5. Role permission (catalogue defaults; never client-supplied).
  if (!roleHasDefaultPermission(input.officer.role, input.permission)) {
    return deny("PERMISSION_MISSING");
  }

  // 6. Request shape, then existence (uniform 404 thereafter).
  if (input.resourceIdMalformed) return deny("MALFORMED_REQUEST");
  if (input.resource === null) return deny("RESOURCE_NOT_FOUND");

  // 7-8. Scope (+assignment/grant) via the pure predicate.
  const scopeOfficer: GovScopeOfficer = {
    scope: input.officer.scope,
    stateCode: input.officer.stateCode,
    districtCode: input.officer.districtCode,
  };
  const scopeDecision = evaluateGovScope({
    officer: scopeOfficer,
    resource: input.resource,
    assignment: input.assignment,
    grant: input.grant,
    correlationId,
  });
  if (!scopeDecision.allow) {
    return deny(scopeDenyToAuthz(scopeDecision));
  }

  // 9. Tiers stay within catalogue capability.
  if (!tiersAllowed(input.officer.role, input.requestedPiiTier, input.requestedEvidenceTier)) {
    return deny("TIER_NOT_ALLOWED");
  }

  // 10. Step-up MFA where required.
  if (input.mfaRequired && !input.mfaFresh) {
    return deny(input.mfaEverVerified ? "MFA_STALE" : "MFA_REQUIRED");
  }

  // 11. Allow: build the positive audit record.
  const grantId = scopeDecision.via === "grant" ? (input.grant?.grantId ?? null) : null;
  const audit = buildGovAuditEvent(
    {
      action: input.auditAction,
      actor: {
        kind: "gov_officer",
        officerId: input.officer.officerId,
        officerCode: input.officer.officerCode,
        role: input.officer.role,
        scope: input.officer.scope,
        stateCode: input.officer.stateCode,
        districtCode: input.officer.districtCode,
      },
      ...auditBase,
      grantId,
      permission: input.permission,
      piiTier: input.requestedPiiTier,
      evidenceTier: input.requestedEvidenceTier,
      result: "allow",
      denialReason: null,
    },
    Date.now(),
  );
  if (audit === null) {
    return {
      decision: { allow: false, reason: "AUDIT_UNAVAILABLE", http: 500, correlationId },
      audit: null,
      denyReason: "AUDIT_UNAVAILABLE",
    };
  }
  return {
    decision: {
      allow: true,
      piiTier: input.requestedPiiTier,
      evidenceTier: input.requestedEvidenceTier,
      grantId,
      correlationId,
    },
    audit,
    denyReason: null,
  };
}

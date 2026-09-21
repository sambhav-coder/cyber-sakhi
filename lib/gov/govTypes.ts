/**
 * Government authorization shared types (Unit 1 — types only).
 *
 * This module declares strongly typed contracts for the future Cyber-Sakhi
 * government authorization system. It contains types only: no runtime logic,
 * no permission evaluation, no scope predicate, no session validation,
 * no database access, no middleware, no API routes, no UI.
 *
 * Design notes:
 * - Fail-closed: authorization and scope decisions default to deny; every
 *   denial carries a machine-readable reason and an HTTP mapping.
 * - `ALL_INDIA` is a bounded jurisdiction scope, NOT unrestricted access.
 *   A scope allow must still be combined with a permission check, assignment
 *   check, grant check, and PII/evidence tier check by later units.
 * - Permission evaluation lives in a later unit; `GovScopeDecision` therefore
 *   contains no permission fields by design.
 * - MFA freshness is represented separately from session validity so callers
 *   can require step-up authentication independently of session lifetime.
 * - Public `USER` / product `ADMIN` roles are intentionally absent here; the
 *   government domain uses its own `GovRole` namespace.
 */

export type GovRole =
  | "SUPER_ADMIN"
  | "STATE_ADMIN"
  | "DISTRICT_OFFICER"
  | "INVESTIGATOR"
  | "ANALYST"
  | "AUDITOR";

export type GovScope = "ALL_INDIA" | "STATE" | "DISTRICT" | "ASSIGNED_CASES";

export type GovPermission =
  | "case.view_meta"
  | "case.view"
  | "case.view_pii"
  | "case.note"
  | "case.update"
  | "case.severity"
  | "case.status"
  | "case.assign"
  | "case.reassign"
  | "case.close"
  | "case.reopen"
  | "evidence.list"
  | "evidence.view"
  | "evidence.view_content"
  | "evidence.download"
  | "evidence.verify"
  | "coc.view"
  | "indicator.view"
  | "indicator.correlate"
  | "analytics.view"
  | "geo.view"
  | "report.generate"
  | "report.export"
  | "audit.view"
  | "audit.export"
  | "officer.view"
  | "officer.create"
  | "officer.suspend"
  | "role.manage"
  | "scope.manage"
  | "policy.view"
  | "break_glass.request"
  | "break_glass.approve"
  | "session.revoke";

export type GovOfficerStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

/**
 * Government officer identity + jurisdiction context.
 * `status` is a full lifecycle union (never ACTIVE-only) so suspended,
 * revoked, and pending officers remain representable and deniable.
 * Secrets (password hashes, MFA seeds) are never part of this context.
 */
export interface GovOfficerContext {
  officerId: string;
  officerCode: string;
  role: GovRole;
  status: GovOfficerStatus;
  scope: GovScope;
  /** LGD state code; required for STATE/DISTRICT scopes, null otherwise. */
  stateCode: string | null;
  /** LGD district code; required for DISTRICT scope, null otherwise. */
  districtCode: string | null;
  /** Monotonic version bumped on role/scope/status/credential change. */
  sessionVersion: number;
}

/**
 * Government session validity context, kept separate from officer identity.
 * Contains only session lifecycle data; role/scope live in GovOfficerContext.
 */
export interface GovSessionContext {
  sessionId: string;
  officerId: string;
  sessionVersion: number;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/** MFA channel strength. Freshness is evaluated separately (see GovMfaContext). */
export type GovMfaLevel = "pwd" | "pwd+otp" | "pwd+passkey";

/**
 * MFA state, separate from session validity so sensitive actions can demand
 * fresh step-up authentication independently of a still-valid session.
 */
export interface GovMfaContext {
  enrolled: boolean;
  level: GovMfaLevel;
  /** ISO timestamp of the last successful MFA verification, null if never. */
  lastVerifiedAt: string | null;
  /** Required freshness window in seconds for the attempted action. */
  requiredFreshnessSeconds: number;
}

export type GovAssignmentStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "COMPLETED";

/**
 * Assignment of a case to a government officer.
 * `officerId` identifies the assigned officer; history rows are immutable
 * (status transitions only, never rewritten).
 */
export interface GovAssignmentContext {
  assignmentId: string;
  caseId: string;
  officerId: string;
  assignedBy: string;
  status: GovAssignmentStatus;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

export type GovGrantStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";

/**
 * Temporary grant / break-glass context, including full lifecycle and
 * revocation fields. `role.manage` and `scope.manage` must never appear in
 * `permissions` (enforced by a later unit, documented here as contract).
 */
export interface GovGrantContext {
  grantId: string;
  /** Officer receiving the grant. */
  officerId: string;
  permissions: GovPermission[];
  scope: GovScope;
  stateCode: string | null;
  districtCode: string | null;
  /** Null means jurisdiction-wide within `scope`; non-null restricts to one case/resource. */
  caseId: string | null;
  reason: string;
  ticket: string;
  grantorId: string;
  /** Null while pending; set on approval. Self-approval is forbidden (later unit). */
  approverId: string | null;
  status: GovGrantStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/** Victim/case PII exposure tiers, least-privilege ordered. */
export type GovPiiTier = "none" | "meta" | "masked" | "full";

/**
 * Evidence data exposure tiers, least-privilege ordered.
 * `verify` (cryptographic comparison) is permission-gated via
 * `evidence.verify` and does not by itself disclose content; content
 * disclosure requires the `content`/`download` tiers plus parent-case
 * authorization, ticket, and MFA in later units.
 */
export type GovEvidenceAccessTier = "none" | "list" | "metadata" | "content" | "download";

/** Fail-closed authorization decision: allow carries tiers, deny carries reason + HTTP mapping. */
export type GovAuthorizationDecision =
  | {
      allow: true;
      piiTier: GovPiiTier;
      evidenceTier: GovEvidenceAccessTier;
      grantId: string | null;
      correlationId: string;
    }
  | {
      allow: false;
      reason: string;
      // 500 is reserved for server-side authorization infrastructure
      // failure (e.g. audit record construction); never for policy denial.
      http: 401 | 403 | 404 | 422 | 500;
      correlationId: string;
    };

/**
 * Scope-only decision. Contains no permission fields by design: callers must
 * combine this with the permission catalogue result. `via` records which
 * jurisdiction path allowed access; ALL_INDIA is one bounded path among them.
 */
export type GovScopeDecision =
  | {
      allow: true;
      via: "all_india" | "state" | "district" | "assigned" | "grant" | "unlocated_queue";
      correlationId: string;
    }
  | {
      allow: false;
      reason:
        | "out_of_scope"
        | "unlocated"
        | "inferred_quarantine"
        | "location_mismatch"
        | "malformed_code"
        | "assignment_missing"
        | "assignment_expired"
        | "assignment_revoked"
        | "grant_missing"
        | "grant_expired"
        | "grant_revoked"
        | "grant_scope_exceeded";
      correlationId: string;
    };

/** Correlation + attribution context for blocking audit writes (persistence lives in a later unit). */
export interface GovAuditContext {
  correlationId: string;
  actorGovId: string;
  actorRole: GovRole;
  action: string;
  caseId: string | null;
  entityId: string | null;
  result: "allow" | "deny";
  reason: string | null;
  grantId: string | null;
}

/**
 * Government audit action catalogue (client-safe).
 *
 * Pure frozen string array with zero imports, so both server modules
 * (lib/gov/govAudit.ts builders, persistence) and client components (the
 * Audit Center filter) share one source of truth without pulling
 * Node-only dependencies (node:crypto, PII masking) into the browser
 * bundle. To add an action, extend this list AND the pinned catalogue
 * test in tests/gov/govAudit.test.ts.
 */

/** Frozen catalogue of government audit actions. */
export const GOV_AUDIT_ACTIONS = Object.freeze([
  "assignment.created",
  "assignment.renewal_requested",
  "assignment.renewed",
  "assignment.revoked",
  "assignment.expired",
  "assignment.completed",
  "assignment.denied",
  "assignment.access_denied",
  "grant.requested",
  "grant.approved",
  "grant.rejected",
  "grant.activated",
  "grant.expired",
  "grant.revoked",
  "grant.usability_denied",
  "grant.duplicate_approval_rejected",
  "grant.self_approval_rejected",
  "grant.mfa_failed",
  "grant.quorum_failed",
  "authorization.allowed",
  "authorization.denied",
  "auth.login_succeeded",
  "auth.login_failed",
  "auth.user_id_requested",
  "auth.password_reset_requested",
  "auth.password_reset_completed",
  "auth.password_reset_failed",
  "mfa.enroll_started",
  "mfa.enrolled",
  "mfa.enroll_failed",
  "mfa.recovery_used",
  "mfa.recovery_failed",
  "session.rejected",
  "session.revoked",
  "case.access_allowed",
  "case.access_denied",
  "case.updated",
  "case.note_added",
  "pii.access_allowed",
  "pii.access_denied",
  "evidence.access_allowed",
  "evidence.access_denied",
  "report.generated",
  "report.exported",
  "report.sealed",
  "report.unsealed",
  "report.unlock_failed",
  "audit.exported",
  "ml.reviewed",
  "scope.violation",
  "permission.denied",
  "mfa.freshness_failed",
  "resource.binding_failed",
]);

export type GovAuditAction = (typeof GOV_AUDIT_ACTIONS)[number];

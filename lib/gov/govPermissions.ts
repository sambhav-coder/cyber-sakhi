/**
 * Government permission catalogue and role defaults (Unit 2 — pure helpers).
 *
 * This module provides safe DEFAULT permission behavior only. It performs no
 * scope evaluation, session validation, MFA handling, database access,
 * assignment checks, location checks, grant handling, or audit writes.
 * Those belong to later units.
 *
 * Source-of-truth note: the permission strings are declared once as the
 * `GovPermission` union in `./govTypes.ts`. The runtime catalogue below
 * mirrors that union without renaming, omitting, or adding values.
 *
 * Fail-closed: unknown roles return no permissions; unknown permission
 * values are never implicitly allowed; `role.manage` and `scope.manage`
 * are code-only defaults and must never become grantable through ordinary
 * permission rows in future implementation.
 */

import type { GovPermission, GovRole } from "./govTypes";

/**
 * Immutable runtime mirror of the approved 34-permission `GovPermission`
 * catalogue. Covers case, evidence, chain of custody, indicators, analytics,
 * geographic intelligence, reports, audit, officer/role/scope management,
 * break-glass, session revocation, and policy access.
 */
export const GOV_PERMISSION_CATALOGUE: readonly GovPermission[] = Object.freeze([
  "case.view_meta",
  "case.view",
  "case.view_pii",
  "case.note",
  "case.update",
  "case.severity",
  "case.status",
  "case.assign",
  "case.reassign",
  "case.close",
  "case.reopen",
  "evidence.list",
  "evidence.view",
  "evidence.view_content",
  "evidence.download",
  "evidence.verify",
  "coc.view",
  "indicator.view",
  "indicator.correlate",
  "analytics.view",
  "geo.view",
  "report.generate",
  "report.export",
  "audit.view",
  "audit.export",
  "officer.view",
  "officer.create",
  "officer.suspend",
  "role.manage",
  "scope.manage",
  "policy.view",
  "break_glass.request",
  "break_glass.approve",
  "session.revoke",
]);

/**
 * Permissions that must remain explicitly restricted: granted only to the
 * minimal roles below, never broadly. `audit.export` is held by no role by
 * default and requires a future explicit grant workflow. Break-glass case and
 * evidence access for SUPER_ADMIN is likewise deferred to that workflow.
 */
export const RESTRICTED_PERMISSIONS: ReadonlySet<GovPermission> = new Set([
  "role.manage",
  "scope.manage",
  "officer.create",
  "officer.suspend",
  "session.revoke",
  "break_glass.approve",
  "evidence.download",
  "report.export",
  "audit.export",
]);

/**
 * Explicit default permission map for all six government roles, following
 * the approved Phase 1.2 least-privilege matrix.
 *
 * - SUPER_ADMIN: governance only (officers, roles, scopes, policy, audit
 *   view, break-glass request/approve, session revocation). No default
 *   case, evidence, indicator, analytics, geo, or report permissions:
 *   investigation access requires the future break-glass workflow.
 * - STATE_ADMIN: full state operations except role/scope management,
 *   session revocation, break-glass approval, and audit export.
 * - DISTRICT_OFFICER: district triage and workflow; proposes (never
 *   performs) assignment, reassignment, and reopening.
 * - INVESTIGATOR: assigned-case work only; no assignment, severity,
 *   close/reopen, correlation, analytics, geo, audit, or officer powers.
 * - ANALYST: de-identified intelligence only; no case content, PII,
 *   evidence content/download, modification, export, or audit powers.
 * - AUDITOR: read-only oversight (`audit.view`, `policy.view`); no case,
 *   evidence, modification, export, or management powers.
 */
export const GOV_ROLE_DEFAULTS: Record<GovRole, readonly GovPermission[]> = {
  SUPER_ADMIN: Object.freeze([
    "officer.view",
    "officer.create",
    "officer.suspend",
    "role.manage",
    "scope.manage",
    "policy.view",
    "audit.view",
    "break_glass.request",
    "break_glass.approve",
    "session.revoke",
  ]),
  STATE_ADMIN: Object.freeze([
    "case.view_meta",
    "case.view",
    "case.view_pii",
    "case.note",
    "case.update",
    "case.severity",
    "case.status",
    "case.assign",
    "case.reassign",
    "case.close",
    "case.reopen",
    "evidence.list",
    "evidence.view",
    "evidence.view_content",
    "evidence.download",
    "evidence.verify",
    "coc.view",
    "indicator.view",
    "indicator.correlate",
    "analytics.view",
    "geo.view",
    "report.generate",
    "report.export",
    "audit.view",
    "officer.view",
    "officer.create",
    "officer.suspend",
    "policy.view",
    "break_glass.request",
  ]),
  DISTRICT_OFFICER: Object.freeze([
    "case.view_meta",
    "case.view",
    "case.view_pii",
    "case.note",
    "case.update",
    "case.severity",
    "case.status",
    "case.close",
    "evidence.list",
    "evidence.view",
    "evidence.view_content",
    "evidence.download",
    "evidence.verify",
    "coc.view",
    "indicator.view",
    "indicator.correlate",
    "analytics.view",
    "geo.view",
    "report.generate",
    "report.export",
    "audit.view",
    "officer.view",
    "policy.view",
    "break_glass.request",
  ]),
  INVESTIGATOR: Object.freeze([
    "case.view_meta",
    "case.view",
    "case.view_pii",
    "case.note",
    "case.update",
    "case.status",
    "evidence.list",
    "evidence.view",
    "evidence.view_content",
    "evidence.download",
    "evidence.verify",
    "coc.view",
    "indicator.view",
    "report.generate",
    "report.export",
    "policy.view",
    "break_glass.request",
  ]),
  ANALYST: Object.freeze([
    "case.view_meta",
    "evidence.list",
    "evidence.view",
    "evidence.verify",
    "coc.view",
    "indicator.view",
    "indicator.correlate",
    "analytics.view",
    "geo.view",
    "report.generate",
    "policy.view",
  ]),
  AUDITOR: Object.freeze(["audit.view", "policy.view"]),
};

const EMPTY_PERMISSIONS: readonly GovPermission[] = Object.freeze([]);

/**
 * Return the default permissions for a role. Pure and deterministic: the
 * same role always yields an equal array, and callers receive a copy so the
 * frozen catalogue can never be mutated through the return value. Unknown
 * roles (possible only from untyped runtime callers) yield no permissions.
 */
export function getDefaultPermissionsForRole(role: GovRole): readonly GovPermission[] {
  const defaults = GOV_ROLE_DEFAULTS[role];
  if (defaults === undefined) return EMPTY_PERMISSIONS;
  return [...defaults];
}

/**
 * Check whether a role holds a specific default permission. Pure and
 * fail-closed: missing roles, missing permissions, and unsupported
 * permission values (from untyped runtime callers) all return false.
 * This function evaluates role defaults only — never jurisdiction scope,
 * assignment, location, grants, or MFA.
 */
export function roleHasDefaultPermission(role: GovRole, permission: GovPermission): boolean {
  const defaults = GOV_ROLE_DEFAULTS[role];
  if (defaults === undefined) return false;
  return defaults.includes(permission);
}

/**
 * Check whether a permission is in the explicitly restricted set. Pure and
 * fail-closed: unsupported values return false.
 */
export function isRestrictedPermission(permission: GovPermission): boolean {
  return RESTRICTED_PERMISSIONS.has(permission);
}

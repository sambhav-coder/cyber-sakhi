/**
 * Server-side government access guard (Phase 3).
 *
 * Central enforcement for every protected /gov page and /gov/api/* route:
 *   1. Session validity — opaque token → hash lookup → lifecycle checks
 *      (revocation, officer status, session_version, absolute + idle expiry).
 *   2. Permission check — role → approved permission catalogue
 *      (lib/gov/govPermissions) with fail-closed Postel's law: unknown
 *      permissions and unknown roles are denied.
 *   3. Best-effort audit of every denial (authorization.denied).
 *
 * Scope/resource authorization for case-scoped endpoints is layered on top
 * of this guard per endpoint (lib/gov/govAuthorization) in the data phases;
 * hiding nav links is cosmetic, this guard is the enforcement point.
 */

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { cookies as nextCookies } from "next/headers";
import crypto from "node:crypto";

import type { GovPermission } from "./govTypes";
import { roleHasDefaultPermission } from "./govPermissions";
import {
  validateGovSessionToken,
  type GovSessionEvaluation,
  type GovSessionRow,
} from "./govSession";
import { getGovRequestAuth } from "./govSessionHttp";
import {
  getClientIp,
  getUserAgent,
  govForbidden,
  govUnauthorized,
} from "./govHttp";
import { GOV_SESSION_COOKIE_NAME } from "./govCookie";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "./govAudit";
import { persistGovAuditEvent } from "./govAuditPersistence";
import type { GovOfficerRow } from "./govCredentials";

export type GovGuardDecision =
  | { allow: true }
  | { allow: false; status: 401 | 403; code: string; reason: string };

/**
 * Pure decision: valid session (optionally requiring a permission). Every
 * failure denies; 401 for no/invalid session, 403 for an authenticated but
 * under-privileged officer.
 */
export function evaluateGovGuard(
  evaluation: GovSessionEvaluation,
  permission: GovPermission | undefined,
): GovGuardDecision {
  if (!evaluation.valid) {
    return { allow: false, status: 401, code: "UNAUTHORIZED", reason: evaluation.reason };
  }
  if (permission && !roleHasDefaultPermission(evaluation.officer.role, permission)) {
    return {
      allow: false,
      status: 403,
      code: "PERMISSION_DENIED",
      reason: `permission.denied:${permission}`,
    };
  }
  return { allow: true };
}

export interface GovGuardContext {
  officer: GovOfficerRow;
  session: GovSessionRow;
  token: string | null;
  mfaFresh: boolean;
}

export type GovApiGuardResult =
  | { ok: true; context: GovGuardContext }
  | { ok: false; response: NextResponse };

/** Best-effort denial record; never permitted to change the response. */
async function auditGuardDenial(
  req: Request,
  evaluation: GovSessionEvaluation,
  decision: Extract<GovGuardDecision, { allow: false }>,
  permission: GovPermission | undefined,
): Promise<void> {
  const actor: GovAuditActor = evaluation.valid
    ? {
        kind: "gov_officer",
        officerId: evaluation.officer.id,
        officerCode: evaluation.officer.officer_code,
        role: evaluation.officer.role,
        scope: evaluation.officer.scope,
        stateCode: evaluation.officer.state_code,
        districtCode: evaluation.officer.district_code,
      }
    : { kind: "unknown", detail: "guard_denied" };

  const event = buildGovAuditEvent({
    action: "authorization.denied",
    actor,
    result: "deny",
    denialReason: decision.reason,
    permission: permission ?? null,
    correlationId: crypto.randomUUID(),
    remoteIp: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  if (event) {
    await persistGovAuditEvent(event, { swallow: true, onError: () => {} });
  }
}

/** Guard an API route handler request. Returns the response to send on denial. */
export async function guardGovApiRequest(
  req: Request,
  permission?: GovPermission,
): Promise<GovApiGuardResult> {
  const { token, evaluation } = await getGovRequestAuth(req);
  const decision = evaluateGovGuard(evaluation, permission);

  // Branch on the evaluation itself so TypeScript narrows the valid branch
  // (decision.allow implies evaluation.valid, but not for the type system).
  if (evaluation.valid) {
    if (decision.allow) {
      return {
        ok: true,
        context: {
          officer: evaluation.officer,
          session: evaluation.session,
          token,
          mfaFresh: evaluation.mfaFresh,
        },
      };
    }

    // Here decision.allow is false, so the denied shape is narrowed.
    await auditGuardDenial(req, evaluation, decision, permission);
    const response =
      decision.status === 401
        ? govUnauthorized()
        : govForbidden(
            "PERMISSION_DENIED",
            "You do not have permission to perform this action.",
          );
    return { ok: false, response };
  }

  // Invalid session: the guard always emits a 401 denial.
  if (!decision.allow) {
    await auditGuardDenial(req, evaluation, decision, permission);
    return { ok: false, response: govUnauthorized() };
  }
  throw new Error("gov guard invariant violated: invalid session was allowed");
}

export type GovPageGuardResult =
  | { ok: true; context: GovGuardContext }
  | { ok: false; redirectTo: string };

/** Page-level guard: reads the session cookie, returns context or a redirect target. */
export async function evaluateGovPageSession(
  permission?: GovPermission,
): Promise<GovPageGuardResult> {
  const token = nextCookies().get(GOV_SESSION_COOKIE_NAME)?.value ?? null;
  const evaluation = await validateGovSessionToken(token ?? "");
  const decision = evaluateGovGuard(evaluation, permission);

  // Branch on the evaluation itself so TypeScript narrows the valid branch.
  if (evaluation.valid && decision.allow) {
    return {
      ok: true,
      context: {
        officer: evaluation.officer,
        session: evaluation.session,
        token,
        mfaFresh: evaluation.mfaFresh,
      },
    };
  }
  return { ok: false, redirectTo: "/gov/login" };
}

/**
 * Page-level guard that throws Next's redirect when denied. Server components
 * call this and use the returned context directly.
 */
export async function requireGovPage(
  permission?: GovPermission,
): Promise<GovGuardContext> {
  const result = await evaluateGovPageSession(permission);
  if (!result.ok) redirect(result.redirectTo);
  return result.context;
}
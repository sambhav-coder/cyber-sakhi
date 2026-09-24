import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { guardGovApiRequest } from "@/lib/gov/govGuard";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { confirmGovMfaEnrollment } from "@/lib/gov/govMfaEnrollment";
import { govRecoveryRateLimiter } from "@/lib/gov/govRateLimit";
import { completeGovSessionTotp } from "@/lib/gov/govSession";

export const runtime = "nodejs";

/**
 * Confirm TOTP enrollment with a code from the officer's authenticator
 * app. On success the pending secret becomes the active factor, a fresh
 * set of single-use recovery codes is issued (returned exactly once),
 * and the session is upgraded to MFA-authenticated.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const gate = await guardGovApiRequest(req);
  if (!gate.ok) return gate.response;
  const { officer, session } = gate.context;

  const ip = getClientIp(req);
  const rate = govRecoveryRateLimiter.check(`confirm:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    return govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  }
  const { code } = (body ?? {}) as { code?: unknown };
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return govJsonError(400, "BAD_REQUEST", "Enter the 6-digit code from your authenticator app.");
  }

  const actor: GovAuditActor = {
    kind: "gov_officer",
    officerId: officer.id,
    officerCode: officer.officer_code,
    role: officer.role,
    scope: officer.scope,
    stateCode: officer.state_code,
    districtCode: officer.district_code,
  };
  const correlationId = crypto.randomUUID();
  const meta = { ip, userAgent: getUserAgent(req) };

  let result;
  try {
    result = await confirmGovMfaEnrollment(officer.id, code);
  } catch {
    return govJsonError(500, "MFA_UNAVAILABLE", "Unable to confirm enrollment.");
  }

  if (!result.ok) {
    const event = buildGovAuditEvent({
      action: "mfa.enroll_failed",
      actor,
      result: "deny",
      denialReason: result.reason ?? "confirm_failed",
      correlationId,
      remoteIp: meta.ip,
      userAgent: meta.userAgent,
    });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    if (result.reason === "no_pending") {
      return govJsonError(400, "NO_ENROLLMENT", "No pending enrollment. Start enrollment first.");
    }
    if (result.reason === "expired") {
      return govJsonError(400, "ENROLLMENT_EXPIRED", "Enrollment expired. Start enrollment again.");
    }
    if (result.reason === "unavailable") {
      return govJsonError(500, "MFA_UNAVAILABLE", "Unable to confirm enrollment.");
    }
    return govJsonError(401, "INVALID_CODE", "Invalid authenticator code. Check the current code and try again.");
  }

  try {
    await completeGovSessionTotp(session.id);
  } catch {
    return govJsonError(500, "MFA_UNAVAILABLE", "Unable to complete enrollment.");
  }

  // Fail closed: no recovery-code disclosure without a durable audit row.
  const event = buildGovAuditEvent({
    action: "mfa.enrolled",
    actor,
    result: "allow",
    correlationId,
    remoteIp: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!event) {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }
  try {
    await persistGovAuditEvent(event);
  } catch {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }

  return NextResponse.json({ enrolled: true, recoveryCodes: result.recoveryCodes ?? [] });
}

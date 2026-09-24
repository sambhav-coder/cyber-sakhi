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
import {
  classifyGovMfaFactor,
  getGovMfaFactor,
  startGovMfaEnrollment,
} from "@/lib/gov/govMfaEnrollment";
import { govRecoveryRateLimiter } from "@/lib/gov/govRateLimit";

export const runtime = "nodejs";

/**
 * Begin TOTP enrollment for the authenticated officer. Replacing an
 * existing active factor additionally requires fresh MFA (step-up), so a
 * stolen password-only session cannot silently swap the second factor.
 * Returns single-display provisioning material (otpauth URI + manual key).
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const gate = await guardGovApiRequest(req);
  if (!gate.ok) return gate.response;
  const { officer, mfaFresh } = gate.context;

  const ip = getClientIp(req);
  const rate = govRecoveryRateLimiter.check(`enroll:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    return govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
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

  try {
    const status = classifyGovMfaFactor(await getGovMfaFactor(officer.id));
    if (status === "enabled" && !mfaFresh) {
      const event = buildGovAuditEvent({
        action: "mfa.enroll_failed",
        actor,
        result: "deny",
        denialReason: "mfa_freshness_required",
        correlationId,
        remoteIp: meta.ip,
        userAgent: meta.userAgent,
      });
      if (event) await persistGovAuditEvent(event, { swallow: true });
      return govJsonError(
        403,
        "MFA_REQUIRED",
        "Verify your current authenticator code first, then replace the factor.",
      );
    }

    const started = await startGovMfaEnrollment(officer.id, officer.officer_code);

    const event = buildGovAuditEvent({
      action: "mfa.enroll_started",
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

    return NextResponse.json(started);
  } catch {
    const event = buildGovAuditEvent({
      action: "mfa.enroll_failed",
      actor,
      result: "error",
      denialReason: "enrollment_unavailable",
      correlationId,
      remoteIp: meta.ip,
      userAgent: meta.userAgent,
    });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(500, "MFA_UNAVAILABLE", "Unable to start enrollment.");
  }
}

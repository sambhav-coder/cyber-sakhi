import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import {
  GOV_FORGOT_PASSWORD_MESSAGE,
  requestGovPasswordReset,
} from "@/lib/gov/govAccountRecovery";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { govRecoveryRateLimiter } from "@/lib/gov/govRateLimit";

export const runtime = "nodejs";

const unknownActor: GovAuditActor = { kind: "unknown", detail: "password_reset_request" };

/**
 * Forgot Password (request). Always returns the same generic message
 * whether or not the Officer ID matches an account. For a matching active
 * account a short-lived single-use token row is prepared and any previous
 * live tokens are retired; fulfillment (out-of-band delivery of the reset
 * link) is an administrator workflow. The request is audit-logged.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const ip = getClientIp(req);
  const rate = govRecoveryRateLimiter.check(`forgot-pw:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    return govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  }
  const { identifier } = (body ?? {}) as { identifier?: unknown };
  if (typeof identifier !== "string" || identifier.trim().length === 0 || identifier.length > 320) {
    return NextResponse.json({ ok: true, message: GOV_FORGOT_PASSWORD_MESSAGE });
  }

  const correlationId = crypto.randomUUID();
  try {
    await requestGovPasswordReset(identifier.trim());
  } catch {
    return govJsonError(500, "RECOVERY_UNAVAILABLE", "Recovery service is temporarily unavailable.");
  }

  const event = buildGovAuditEvent({
    action: "auth.password_reset_requested",
    actor: unknownActor,
    result: "allow",
    correlationId,
    remoteIp: ip,
    userAgent: getUserAgent(req),
  });
  if (!event) {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }
  try {
    await persistGovAuditEvent(event);
  } catch {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }

  return NextResponse.json({ ok: true, message: GOV_FORGOT_PASSWORD_MESSAGE });
}

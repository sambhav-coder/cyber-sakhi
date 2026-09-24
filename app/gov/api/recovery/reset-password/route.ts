import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import {
  GOV_RESET_INVALID_MESSAGE,
  GOV_RESET_SUCCESS_MESSAGE,
  consumeGovPasswordReset,
} from "@/lib/gov/govAccountRecovery";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { govRecoveryRateLimiter } from "@/lib/gov/govRateLimit";

export const runtime = "nodejs";

const unknownActor: GovAuditActor = { kind: "unknown", detail: "password_reset" };

/**
 * Forgot Password (completion). Consumes a single-use administrator-issued
 * reset token and sets a policy-checked password. Invalid, expired, and
 * already-used tokens share one generic reply. Success rotates the
 * credential, clears lockout state, and invalidates every live session.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const ip = getClientIp(req);
  const rate = govRecoveryRateLimiter.check(`reset-pw:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    return govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  }
  const { token, newPassword } = (body ?? {}) as {
    token?: unknown;
    newPassword?: unknown;
  };
  if (typeof token !== "string" || typeof newPassword !== "string") {
    return govJsonError(400, "BAD_REQUEST", GOV_RESET_INVALID_MESSAGE);
  }

  const correlationId = crypto.randomUUID();
  const meta = { ip, userAgent: getUserAgent(req) };

  let result;
  try {
    result = await consumeGovPasswordReset(token, newPassword);
  } catch {
    return govJsonError(500, "RECOVERY_UNAVAILABLE", "Recovery service is temporarily unavailable.");
  }

  if (!result.ok) {
    if (result.reason === "weak_password") {
      // Policy text is public by design (it is also shown pre-submit);
      // token validity itself is never distinguished here.
      return govJsonError(400, "WEAK_PASSWORD", (result.details ?? ["Choose a stronger password."]).join(" "));
    }
    const event = buildGovAuditEvent({
      action: "auth.password_reset_failed",
      actor: unknownActor,
      result: "deny",
      denialReason: "invalid_or_expired_token",
      correlationId,
      remoteIp: meta.ip,
      userAgent: meta.userAgent,
    });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(400, "BAD_REQUEST", GOV_RESET_INVALID_MESSAGE);
  }

  // Success is fail-closed on audit like login: no completion without a
  // durable record.
  const event = buildGovAuditEvent({
    action: "auth.password_reset_completed",
    actor: {
      kind: "gov_officer",
      officerId: result.officerId,
      officerCode: "",
      role: "",
      scope: "",
      stateCode: null,
      districtCode: null,
    },
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

  return NextResponse.json({ ok: true, message: GOV_RESET_SUCCESS_MESSAGE });
}

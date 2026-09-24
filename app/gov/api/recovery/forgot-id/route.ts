import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import {
  GOV_FORGOT_USER_ID_MESSAGE,
  requestGovUserIdRecovery,
} from "@/lib/gov/govAccountRecovery";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { govRecoveryRateLimiter } from "@/lib/gov/govRateLimit";

export const runtime = "nodejs";

/**
 * Forgot User ID. Always returns the same generic message whether or not
 * the submitted details match an officer record: the endpoint is not
 * usable as an account oracle. Delivery to a verified official channel
 * (or administrator verification) happens out-of-band; the request itself
 * is audit-logged without storing the submitted details.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const ip = getClientIp(req);
  const rate = govRecoveryRateLimiter.check(`forgot-id:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    return govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  }
  const { identifier, phone } = (body ?? {}) as {
    identifier?: unknown;
    phone?: unknown;
  };
  if (typeof identifier !== "string" || identifier.trim().length === 0 || identifier.length > 320) {
    // Same generic reply: no field-level oracle.
    return NextResponse.json({ ok: true, message: GOV_FORGOT_USER_ID_MESSAGE });
  }

  const correlationId = crypto.randomUUID();
  try {
    // The matched officer (if any) is used for server-side follow-up only;
    // the caller always receives the same generic message.
    await requestGovUserIdRecovery({
      identifier: identifier.trim(),
      phone: typeof phone === "string" ? phone : undefined,
    });
  } catch {
    return govJsonError(500, "RECOVERY_UNAVAILABLE", "Recovery service is temporarily unavailable.");
  }

  const actor: GovAuditActor = { kind: "unknown", detail: "user_id_request" };
  const event = buildGovAuditEvent({
    action: "auth.user_id_requested",
    actor,
    result: "allow",
    correlationId,
    remoteIp: ip,
    userAgent: getUserAgent(req),
  });
  if (event) await persistGovAuditEvent(event, { swallow: true });

  return NextResponse.json({ ok: true, message: GOV_FORGOT_USER_ID_MESSAGE });
}

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { attemptGovLogin, GOV_LOGIN_FAILED_MESSAGE } from "@/lib/gov/govAuth";
import { govSessionCookieAttributes } from "@/lib/gov/govCookie";
import { normalizeGovEmail } from "@/lib/gov/govCredentials";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { govLoginRateLimiter } from "@/lib/gov/govRateLimit";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import type { GovOfficerContext } from "@/lib/gov/govTypes";
import { completeGovSessionTotp, revokeGovSession } from "@/lib/gov/govSession";
import { verifyGovOfficerTotp } from "@/lib/gov/govTotp";

export const runtime = "nodejs";

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 512;
const MIN_PASSWORD_LENGTH = 8;

function publicOfficer(officer: GovOfficerContext) {
  return {
    officerId: officer.officerId,
    officerCode: officer.officerCode,
    role: officer.role,
    scope: officer.scope,
    stateCode: officer.stateCode,
    districtCode: officer.districtCode,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  if (isCrossOriginRequest(req)) {
    return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  }

  const ip = getClientIp(req);
  const rate = govLoginRateLimiter.check(`login:ip:${ip ?? "unknown"}`);
  if (!rate.allowed) {
    const response = govJsonError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Try again later.",
    );
    if (rate.retryAfterMs !== null) {
      response.headers.set(
        "Retry-After",
        String(Math.ceil(rate.retryAfterMs / 1000)),
      );
    }
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  }

  const { email, password, mfaCode } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
    mfaCode?: unknown;
  };
  if (typeof email !== "string" || typeof password !== "string") {
    return govJsonError(400, "BAD_REQUEST", "Email and password are required.");
  }

  const normalizedEmail = normalizeGovEmail(email);
  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    // Deliberately identical to the generic failure: no field-level leaks.
    return govJsonError(400, "BAD_REQUEST", GOV_LOGIN_FAILED_MESSAGE);
  }

  const correlationId = crypto.randomUUID();
  const meta = { ip, userAgent: getUserAgent(req) };
  const unknownActor: GovAuditActor = { kind: "unknown", detail: "login_attempt" };

  const result = await attemptGovLogin(normalizedEmail, password);

  if (!result.ok) {
    // auth.login_failed is mandatory; a visible audit failure must surface
    // as a 500 (generic) so the missing-accountability state is not silent.
    const event = buildGovAuditEvent({
      action: "auth.login_failed",
      actor: unknownActor,
      result: "deny",
      denialReason: "invalid_credentials",
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
    return govJsonError(401, "INVALID_CREDENTIALS", GOV_LOGIN_FAILED_MESSAGE);
  }

  // A password-only session is never returned to the browser. The temporary
  // server-side session is revoked on any failed TOTP check.
  const otp = typeof mfaCode === "string" ? mfaCode.trim() : "";
  const mfaValid = await verifyGovOfficerTotp(result.officer.officerId, otp);
  if (!mfaValid) {
    await revokeGovSession(result.session.id, result.officer.officerId, "mfa_failed").catch(() => {});
    const event = buildGovAuditEvent({ action: "auth.login_failed", actor: unknownActor, result: "deny", denialReason: "mfa_failed", correlationId, remoteIp: meta.ip, userAgent: meta.userAgent });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(401, "INVALID_CREDENTIALS", GOV_LOGIN_FAILED_MESSAGE);
  }
  try { await completeGovSessionTotp(result.session.id); } catch {
    await revokeGovSession(result.session.id, result.officer.officerId, "mfa_completion_failed").catch(() => {});
    return govJsonError(500, "MFA_UNAVAILABLE", "Unable to complete sign-in.");
  }

  const actor: GovAuditActor = {
    kind: "gov_officer",
    officerId: result.officer.officerId,
    officerCode: result.officer.officerCode,
    role: result.officer.role,
    scope: result.officer.scope,
    stateCode: result.officer.stateCode,
    districtCode: result.officer.districtCode,
  };

  // Fail closed: never present a live session cookie without a durable
  // audit row for the successful login.
  const loginEvent = buildGovAuditEvent({
    action: "auth.login_succeeded",
    actor,
    result: "allow",
    correlationId,
    remoteIp: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!loginEvent) {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }
  try {
    await persistGovAuditEvent(loginEvent);
  } catch {
    return govJsonError(500, "AUDIT_UNAVAILABLE", "Unable to complete request.");
  }

  // Best-effort last_login_at bookkeeping (metadata, not audit-critical).
  try {
    await getSupabaseServer()
      .from("gov_officers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", result.officer.officerId);
  } catch {
    // Non-fatal.
  }

  // Successful login resets the IP throttle's accumulated failures so a
  // legitimate officer behind a shared NAT is not blocked after success.
  govLoginRateLimiter.reset(`login:ip:${ip ?? "unknown"}`);

  const response = NextResponse.json({
    authenticated: true,
    officer: publicOfficer(result.officer),
  });
  const attrs = govSessionCookieAttributes();
  response.cookies.set(attrs.name, result.token, {
    path: attrs.path,
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    maxAge: attrs.maxAge,
  });
  return response;
}

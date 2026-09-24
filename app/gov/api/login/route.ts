import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { attemptGovIdentifierLogin, GOV_LOGIN_FAILED_MESSAGE } from "@/lib/gov/govAuth";
import { govSessionCookieAttributes } from "@/lib/gov/govCookie";
import {
  getClientIp,
  getUserAgent,
  govJsonError,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { govLoginRateLimiter, govMfaRateLimiter } from "@/lib/gov/govRateLimit";
import { GOV_RECOVERY_CODE_PATTERN, verifyGovOfficerRecoveryCode } from "@/lib/gov/govMfaEnrollment";
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

  const { email, identifier, password, mfaCode } = (body ?? {}) as {
    email?: unknown;
    identifier?: unknown;
    password?: unknown;
    mfaCode?: unknown;
  };
  // Officer ID is the primary identifier; official email remains accepted
  // as a fallback. Both resolve to the same officer with identical
  // generic failures, so the identifier kind leaks nothing.
  const rawIdentifier =
    typeof identifier === "string" && identifier.trim().length > 0
      ? identifier
      : typeof email === "string"
        ? email
        : "";
  if (typeof password !== "string" || rawIdentifier.trim().length === 0) {
    return govJsonError(400, "BAD_REQUEST", "Officer ID and password are required.");
  }

  const trimmedIdentifier = rawIdentifier.trim();
  if (
    trimmedIdentifier.length === 0 ||
    trimmedIdentifier.length > MAX_EMAIL_LENGTH ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    // Deliberately identical to the generic failure: no field-level leaks.
    return govJsonError(400, "BAD_REQUEST", GOV_LOGIN_FAILED_MESSAGE);
  }

  const correlationId = crypto.randomUUID();
  const meta = { ip, userAgent: getUserAgent(req) };
  const unknownActor: GovAuditActor = { kind: "unknown", detail: "login_attempt" };

  const result = await attemptGovIdentifierLogin(trimmedIdentifier, password);

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
  // server-side session is revoked on any failed second-factor check.
  // Second factor is either a 6-digit TOTP code or a single-use recovery
  // code (both verified server-side; frontend input shape is untrusted).
  const mfaKey = `mfa:officer:${result.officer.officerId}`;
  const mfaRate = govMfaRateLimiter.check(mfaKey);
  if (!mfaRate.allowed) {
    await revokeGovSession(result.session.id, result.officer.officerId, "mfa_rate_limited").catch(() => {});
    const event = buildGovAuditEvent({ action: "auth.login_failed", actor: unknownActor, result: "deny", denialReason: "mfa_rate_limited", correlationId, remoteIp: meta.ip, userAgent: meta.userAgent });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    const response = govJsonError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
    if (mfaRate.retryAfterMs !== null) {
      response.headers.set("Retry-After", String(Math.ceil(mfaRate.retryAfterMs / 1000)));
    }
    return response;
  }
  const secondFactor = typeof mfaCode === "string" ? mfaCode.trim() : "";
  const isRecoveryShaped = GOV_RECOVERY_CODE_PATTERN.test(
    secondFactor.toUpperCase().replace(/[\s_]+/g, "-"),
  );
  let mfaOk = false;
  let viaRecovery = false;
  if (isRecoveryShaped) {
    viaRecovery = true;
    mfaOk = await verifyGovOfficerRecoveryCode(result.officer.officerId, secondFactor);
  } else {
    mfaOk = await verifyGovOfficerTotp(result.officer.officerId, secondFactor);
  }
  if (!mfaOk) {
    await revokeGovSession(result.session.id, result.officer.officerId, "mfa_failed").catch(() => {});
    const event = buildGovAuditEvent({
      action: viaRecovery ? "mfa.recovery_failed" : "auth.login_failed",
      actor: unknownActor,
      result: "deny",
      denialReason: viaRecovery ? "recovery_failed" : "mfa_failed",
      correlationId,
      remoteIp: meta.ip,
      userAgent: meta.userAgent,
    });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(401, "INVALID_CREDENTIALS", GOV_LOGIN_FAILED_MESSAGE);
  }
  if (viaRecovery) {
    // Recovery-code use is a security-relevant event of its own; logged
    // best-effort alongside the mandatory login-success event below.
    const actor: GovAuditActor = {
      kind: "gov_officer",
      officerId: result.officer.officerId,
      officerCode: result.officer.officerCode,
      role: result.officer.role,
      scope: result.officer.scope,
      stateCode: result.officer.stateCode,
      districtCode: result.officer.districtCode,
    };
    const event = buildGovAuditEvent({ action: "mfa.recovery_used", actor, result: "allow", correlationId, remoteIp: meta.ip, userAgent: meta.userAgent });
    if (event) await persistGovAuditEvent(event, { swallow: true });
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
  govMfaRateLimiter.reset(`mfa:officer:${result.officer.officerId}`);

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

/**
 * Government session lifecycle helpers (Unit 3).
 *
 * Opaque random token + database row (Unit 1 GovSessionContext shape).
 * Only the SHA-256 hash of the token is stored; validation order is fixed:
 *   1. session exists
 *   2. not revoked
 *   3. absolute expiry
 *   4. idle timeout
 *   5. officer exists
 *   6. officer active
 *   7. session_version matches
 *   8. role/scope context loads
 *
 * last_seen_at is refreshed ONLY after the idle check passes, via a single
 * conditional UPDATE (id + revoked_at IS NULL + expires_at in future), so a
 * concurrent revocation/expiry can never be revived. Throttled to 5 minutes
 * to bound write amplification.
 *
 * Transaction limitation (documented, not pretended): Supabase JS exposes no
 * multi-statement transactions outside SQL/RPC. Rotation is therefore
 * sequential insert-new-then-revoke-old; a crash between the two leaves both
 * rows live until the next rotation/revocation, which validation still gates
 * per-request. No silent privilege persistence: role/scope changes must bump
 * session_version (bumpGovSessionVersion) or old sessions keep working.
 *
 * MFA: rows carry mfa_level/mfa_verified_at and isMfaFresh() implements the
 * approved 15-minute step-up freshness check. No TOTP/WebAuthn verification
 * exists in this unit; a "pwd"-level session is NEVER treated as
 * MFA-approved for sensitive actions (enforced in a later unit).
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import type {
  GovMfaLevel,
  GovOfficerContext,
} from "./govTypes";
import { generateGovSessionToken, hashGovSessionToken } from "./govSessionId";
import type { GovOfficerRow } from "./govCredentials";

/** Absolute session lifetime: 12 hours. */
export const GOV_SESSION_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
/** Idle timeout: 8 hours without activity. */
export const GOV_SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
/** last_seen_at refresh throttle: 5 minutes. */
export const GOV_SESSION_SEEN_THROTTLE_MS = 5 * 60 * 1000;
/** Step-up MFA freshness window: 15 minutes. */
export const GOV_MFA_FRESHNESS_MS = 15 * 60 * 1000;

/** Database row shape for public.gov_sessions (hash only, never raw token). */
export interface GovSessionRow {
  id: string;
  officer_id: string;
  session_token_hash: string;
  session_version: number;
  mfa_level: GovMfaLevel;
  mfa_verified_at: string | null;
  issued_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  ip: string | null;
  user_agent: string | null;
}

export type GovSessionInvalidReason =
  | "not_found"
  | "revoked"
  | "absolute_expired"
  | "idle_expired"
  | "officer_missing"
  | "officer_inactive"
  | "version_mismatch";

export type GovSessionEvaluation =
  | {
      valid: true;
      officer: GovOfficerRow;
      session: GovSessionRow;
      /** True only when the idle check passed AND the throttle elapsed. */
      refreshLastSeen: boolean;
      /**
       * MFA step-up freshness at validation time, for downstream sensitive-
       * action gating (later units). A "pwd"-level session reports false
       * here unless mfa_verified_at is within the freshness window.
       */
      mfaFresh: boolean;
    }
  | { valid: false; reason: GovSessionInvalidReason };

/** True when the throttle interval has elapsed since the last refresh. */
export function shouldRefreshLastSeen(lastSeenAt: string, nowMs: number = Date.now()): boolean {
  return nowMs - new Date(lastSeenAt).getTime() >= GOV_SESSION_SEEN_THROTTLE_MS;
}

/**
 * Pure session evaluation in the mandated order:
 *   1. revocation, 2. officer existence, 3. officer active status,
 *   4. session version, 5. absolute expiry, 6. idle expiry.
 * Never performs I/O and never trusts client-provided role, scope, officer
 * ID, or status: every field is read from the database rows passed in.
 * Every failure denies; role/scope/MFA enforcement belongs to later units.
 */
export function evaluateGovSession(
  session: GovSessionRow,
  officer: GovOfficerRow | null,
  nowMs: number = Date.now(),
): GovSessionEvaluation {
  if (session.revoked_at !== null) return { valid: false, reason: "revoked" };
  if (officer === null) return { valid: false, reason: "officer_missing" };
  if (officer.status !== "ACTIVE") return { valid: false, reason: "officer_inactive" };
  if (session.session_version !== officer.session_version) {
    return { valid: false, reason: "version_mismatch" };
  }
  if (new Date(session.expires_at).getTime() <= nowMs) {
    return { valid: false, reason: "absolute_expired" };
  }
  if (nowMs - new Date(session.last_seen_at).getTime() >= GOV_SESSION_IDLE_TTL_MS) {
    return { valid: false, reason: "idle_expired" };
  }
  return {
    valid: true,
    officer,
    session,
    refreshLastSeen: shouldRefreshLastSeen(session.last_seen_at, nowMs),
    mfaFresh: isMfaFresh(session.mfa_verified_at, nowMs),
  };
}

/** Step-up MFA freshness: verified within the 15-minute window. */
export function isMfaFresh(
  mfaVerifiedAt: string | null,
  nowMs: number = Date.now(),
  windowMs: number = GOV_MFA_FRESHNESS_MS,
): boolean {
  if (mfaVerifiedAt === null) return false;
  return nowMs - new Date(mfaVerifiedAt).getTime() < windowMs;
}

/** Map a database officer row to the Unit 1 officer context (no secrets). */
export function toGovOfficerContext(officer: GovOfficerRow): GovOfficerContext {
  return {
    officerId: officer.id,
    officerCode: officer.officer_code,
    role: officer.role,
    status: officer.status,
    scope: officer.scope,
    stateCode: officer.state_code,
    districtCode: officer.district_code,
    sessionVersion: officer.session_version,
  };
}

export async function createGovSession(
  officer: GovOfficerRow,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; session: GovSessionRow }> {
  const token = generateGovSessionToken();
  const now = new Date();
  const row = {
    officer_id: officer.id,
    session_token_hash: hashGovSessionToken(token),
    session_version: officer.session_version,
    mfa_level: "pwd" as const,
    mfa_verified_at: null,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + GOV_SESSION_ABSOLUTE_TTL_MS).toISOString(),
    last_seen_at: now.toISOString(),
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
  };
  const { data, error } = await getSupabaseServer()
    .from("gov_sessions")
    .insert(row)
    .select("*")
    .single();
  throwIfError(error, "Failed to create government session.");
  return { token, session: data as GovSessionRow };
}

async function findGovSessionByHash(tokenHash: string): Promise<GovSessionRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("gov_sessions")
    .select("*")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up government session.");
  return (data as GovSessionRow | null) ?? null;
}

async function findGovOfficerById(officerId: string): Promise<GovOfficerRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("gov_officers")
    .select("*")
    .eq("id", officerId)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up government officer.");
  return (data as GovOfficerRow | null) ?? null;
}

/**
 * Conditionally refresh last_seen_at. The predicates re-assert liveness
 * atomically in the same statement so revocation/expiry racing the read can
 * never resurrect the session. Never called before idle validation.
 */
async function refreshGovSessionSeen(sessionId: string, nowIso: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_sessions")
    .update({ last_seen_at: nowIso })
    .eq("id", sessionId)
    .is("revoked_at", null)
    .gt("expires_at", nowIso);
  throwIfError(error, "Failed to refresh government session.");
}

/**
 * Full request validation: hash → lookup → pure evaluation → conditional
 * refresh. Returns the officer context for downstream permission/scope
 * checks; those checks (and MFA/ticket enforcement) belong to later units.
 */
export async function validateGovSessionToken(
  token: string,
  nowMs: number = Date.now(),
): Promise<GovSessionEvaluation> {
  if (!token) return { valid: false, reason: "not_found" };
  const session = await findGovSessionByHash(hashGovSessionToken(token));
  if (session === null) return { valid: false, reason: "not_found" };
  const officer = await findGovOfficerById(session.officer_id);
  const evaluation = evaluateGovSession(session, officer, nowMs);
  if (evaluation.valid && evaluation.refreshLastSeen) {
    await refreshGovSessionSeen(session.id, new Date(nowMs).toISOString());
  }
  return evaluation;
}

/** Explicit revocation checked on every request. */
export async function revokeGovSession(
  sessionId: string,
  revokedBy: string | null,
  reason: string,
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
      revoke_reason: reason,
    })
    .eq("id", sessionId)
    .is("revoked_at", null);
  throwIfError(error, "Failed to revoke government session.");
}

/** Mark a password-authenticated session as TOTP-authenticated after verification. */
export async function completeGovSessionTotp(sessionId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_sessions")
    .update({ mfa_level: "pwd+otp", mfa_verified_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("revoked_at", null);
  throwIfError(error, "Failed to complete government MFA.");
}

/**
 * Revoke ALL sessions for an officer by bumping session_version (stale rows
 * fail validation) and stamping live rows revoked. MUST be called on role or
 * scope changes so stale privileges are never silently permitted.
 */
export async function bumpGovSessionVersion(officerId: string): Promise<number> {
  const client = getSupabaseServer();
  const { data: officer, error: readError } = await client
    .from("gov_officers")
    .select("session_version")
    .eq("id", officerId)
    .maybeSingle();
  throwIfError(readError, "Failed to read government officer.");
  const next = ((officer as { session_version: number } | null)?.session_version ?? 0) + 1;
  const { error: updateError } = await client
    .from("gov_officers")
    .update({ session_version: next, updated_at: new Date().toISOString() })
    .eq("id", officerId);
  throwIfError(updateError, "Failed to bump government session version.");
  const { error: stampError } = await client
    .from("gov_sessions")
    .update({ revoked_at: new Date().toISOString(), revoke_reason: "session_version_bump" })
    .eq("officer_id", officerId)
    .is("revoked_at", null);
  // The version bump above is the primary control (stale rows fail
  // validation regardless). A stamp failure must still surface loudly so
  // callers never assume every live row was marked revoked.
  throwIfError(stampError, "Failed to stamp revoked government sessions.");
  return next;
}

/**
 * Rotation: insert-new-then-revoke-old (sequential; Supabase JS offers no
 * multi-statement transaction — see module note). A crash between steps
 * leaves both rows live; per-request validation still gates each use.
 */
export async function rotateGovSession(
  token: string,
  officer: GovOfficerRow,
): Promise<{ token: string; session: GovSessionRow }> {
  const created = await createGovSession(officer);
  const old = await findGovSessionByHash(hashGovSessionToken(token));
  if (old !== null) {
    await revokeGovSession(old.id, officer.id, "rotation");
  }
  return created;
}

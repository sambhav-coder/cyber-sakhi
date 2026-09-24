/**
 * Government account recovery: Forgot User ID + Forgot Password.
 *
 * Security posture (both flows):
 * - Every response is generic and identical whether or not the submitted
 *   details match an account: the flows are not usable as account oracles.
 * - Reset tokens are 256-bit random values; only their SHA-256 hash is
 *   stored. Tokens are short-lived (30 minutes) and single-use.
 * - A successful password reset rotates the bcrypt hash, clears failure
 *   counters, and invalidates ALL live sessions via session_version bump.
 * - No password, token, or secret is ever logged or placed in audit
 *   payloads. Request/completion events are audited by the API routes.
 * - There is no self-service email channel in this deployment: reset links
 *   are issued out-of-band by an administrator (scripts/gov-issue-reset.cjs)
 *   into the same table. The request endpoint records intent + audit trail.
 */

import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import {
  findGovOfficerByCode,
  findGovOfficerByEmail,
  hashGovPassword,
  type GovOfficerRow,
} from "./govCredentials";
import { resolveGovLoginIdentifier } from "./govAuth";
import { evaluateGovPassword } from "./govPasswordPolicy";
import { bumpGovSessionVersion } from "./govSession";

/** Reset-token lifetime: 30 minutes. */
export const GOV_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Generic responses shared by every recovery outcome (no oracle). */
export const GOV_FORGOT_USER_ID_MESSAGE =
  "If the details match an authorized officer record, recovery instructions will follow through the verified official channel. Otherwise contact your department administrator.";
export const GOV_FORGOT_PASSWORD_MESSAGE =
  "If the Officer ID matches an authorized account, a reset has been initiated through the verified official channel. Otherwise contact your department administrator.";
export const GOV_RESET_INVALID_MESSAGE =
  "This reset link is invalid or has expired. Request a fresh link from your department administrator.";
export const GOV_RESET_SUCCESS_MESSAGE =
  "The password has been updated. Sign in with the new password and authenticator code.";

/** SHA-256 hex of a raw reset token — the only form ever stored. */
export function hashGovResetToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Mint a raw reset token (256-bit, hex). Transport once, out-of-band. */
export function generateGovResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

interface GovPasswordResetRow {
  id: string;
  officer_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

/**
 * Resolve an identifier to an ACTIVE officer for recovery purposes.
 * Returns null for unknown, inactive, or malformed identifiers alike.
 */
export async function findActiveGovOfficerForRecovery(
  identifier: string,
): Promise<GovOfficerRow | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const resolved = resolveGovLoginIdentifier(trimmed);
  const officer =
    resolved.kind === "email"
      ? await findGovOfficerByEmail(resolved.value).catch(() => null)
      : await findGovOfficerByCode(resolved.value).catch(() => null);
  if (!officer || officer.status !== "ACTIVE") return null;
  return officer;
}

/**
 * Record a Forgot-User-ID request. Intentionally side-effect-light: the
 * verified-channel delivery is an administrator workflow. Returns the
 * matched officer id (or null) for audit attribution WITHOUT revealing it
 * to the caller — the route always returns the generic message.
 */
export async function requestGovUserIdRecovery(input: {
  identifier?: string;
  phone?: string;
}): Promise<{ officerId: string | null }> {
  const identifier = (input.identifier ?? "").trim();
  if (!identifier) return { officerId: null };
  const officer = await findActiveGovOfficerForRecovery(identifier);
  // A phone cross-check, when supplied, must also match (last-4 tolerant
  // comparison would leak; require exact match on the stored number).
  if (officer && input.phone && input.phone.trim()) {
    const supplied = input.phone.replace(/\D/g, "");
    const stored = (officer.official_phone ?? "").replace(/\D/g, "");
    if (!stored || stored !== supplied) return { officerId: null };
  }
  return { officerId: officer ? officer.id : null };
}

/**
 * Record a Forgot-Password request: retire live tokens and mint a fresh
 * one for an active officer. Returns the raw token to the CALLER (the
 * route keeps it server-side for admin-issued flows; the public endpoint
 * discards it and replies generically). Null when no active officer
 * matches — indistinguishable to the requester either way.
 */
export async function requestGovPasswordReset(
  identifier: string,
  nowMs: number = Date.now(),
): Promise<{ officerId: string | null; token: string | null; expiresAt: string | null }> {
  const officer = await findActiveGovOfficerForRecovery(identifier);
  if (!officer) return { officerId: null, token: null, expiresAt: null };
  const client = getSupabaseServer();
  const { error: retireError } = await client
    .from("gov_password_resets")
    .delete()
    .eq("officer_id", officer.id)
    .is("used_at", null);
  throwIfError(retireError, "Failed to retire old reset tokens.");
  const token = generateGovResetToken();
  const expiresAt = new Date(nowMs + GOV_PASSWORD_RESET_TTL_MS).toISOString();
  const { error: insertError } = await client.from("gov_password_resets").insert({
    officer_id: officer.id,
    token_hash: hashGovResetToken(token),
    expires_at: expiresAt,
  });
  throwIfError(insertError, "Failed to create reset token.");
  return { officerId: officer.id, token, expiresAt };
}

/**
 * Administrator-issued reset token (out-of-band delivery). Same table and
 * lifetime as self-service requests; retired live tokens first.
 */
export async function issueGovPasswordReset(
  officerId: string,
  nowMs: number = Date.now(),
): Promise<{ token: string; expiresAt: string }> {
  const client = getSupabaseServer();
  const { error: retireError } = await client
    .from("gov_password_resets")
    .delete()
    .eq("officer_id", officerId)
    .is("used_at", null);
  throwIfError(retireError, "Failed to retire old reset tokens.");
  const token = generateGovResetToken();
  const expiresAt = new Date(nowMs + GOV_PASSWORD_RESET_TTL_MS).toISOString();
  const { error: insertError } = await client.from("gov_password_resets").insert({
    officer_id: officerId,
    token_hash: hashGovResetToken(token),
    expires_at: expiresAt,
  });
  throwIfError(insertError, "Failed to create reset token.");
  return { token, expiresAt };
}

export type GovResetConsumeResult =
  | { ok: true; officerId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "weak_password"; details?: string[] };

/**
 * Consume a reset token and set a new password. Single-use, expiry-bound,
 * policy-gated; invalidates every live session for the officer. The
 * invalid/expired/used outcomes are intentionally NOT distinguished to
 * the caller (the route replies with one generic message).
 */
export async function consumeGovPasswordReset(
  token: string,
  newPassword: string,
  nowMs: number = Date.now(),
): Promise<GovResetConsumeResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: "invalid" };
  const { data, error } = await getSupabaseServer()
    .from("gov_password_resets")
    .select("id,officer_id,token_hash,expires_at,used_at")
    .eq("token_hash", hashGovResetToken(trimmed))
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error("Failed to look up reset token.");
  }
  const row = (data as GovPasswordResetRow | null) ?? null;
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() <= nowMs) return { ok: false, reason: "expired" };

  const policy = evaluateGovPassword(newPassword);
  if (!policy.ok) return { ok: false, reason: "weak_password", details: policy.reasons };

  const client = getSupabaseServer();
  const { error: credentialError } = await client
    .from("gov_credentials")
    .update({
      password_hash: await hashGovPassword(newPassword),
      password_updated_at: new Date(nowMs).toISOString(),
      must_rotate: false,
      cred_status: "ACTIVE",
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq("officer_id", row.officer_id);
  throwIfError(credentialError, "Failed to update password.");

  const { error: consumeError } = await client
    .from("gov_password_resets")
    .update({ used_at: new Date(nowMs).toISOString() })
    .eq("id", row.id)
    .is("used_at", null);
  throwIfError(consumeError, "Failed to consume reset token.");

  // Invalidate every live session: a rotated password must not leave
  // older sessions usable.
  await bumpGovSessionVersion(row.officer_id);
  return { ok: true, officerId: row.officer_id };
}

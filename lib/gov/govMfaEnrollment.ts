/**
 * Government TOTP enrollment + recovery codes.
 *
 * Enrollment is a two-phase, server-verified flow over an already
 * password-authenticated session (replacement of an existing factor
 * additionally requires fresh MFA — enforced by the API route, not here):
 *   1. `startGovMfaEnrollment` mints a fresh secret, stores it ONLY in the
 *      pending columns (the active factor keeps working until confirm),
 *      and returns the `otpauth://` provisioning URI + manual key for a
 *      single display to the authenticated officer.
 *   2. `confirmGovMfaEnrollment` verifies a code from the officer's
 *      authenticator app against the pending secret, promotes it to the
 *      active factor, and issues single-use recovery codes (plaintext
 *      returned exactly once; only hashes are stored).
 *
 * Recovery codes authenticate a login when the authenticator is
 * unavailable: `verifyGovOfficerRecoveryCode` checks and consumes one
 * atomically (single-use). All secrets stay out of logs and audit payloads.
 */

import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import {
  decryptGovTotpSecret,
  encryptGovTotpSecret,
  verifyTotpCode,
} from "./govTotp";

/** Pending enrollments expire after 15 minutes. */
export const GOV_MFA_ENROLL_EXPIRY_MS = 15 * 60 * 1000;

/** Recovery codes minted per successful enrollment confirmation. */
export const GOV_RECOVERY_CODE_COUNT = 10;

/** Recovery code shape: `XXXX-XXXX` over an unambiguous alphabet. */
export const GOV_RECOVERY_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** TOTP issuer shown in authenticator apps. */
export const GOV_TOTP_ISSUER = "Cyber-Sakhi-Gov";

/** Random `length` bytes rendered as unpadded base32 (TOTP secret). */
export function encodeBase32(data: Buffer): string {
  let bits = "";
  for (const byte of data) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

/** Mint a fresh 160-bit TOTP secret (Google Authenticator compatible). */
export function generateTotpSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

/**
 * Build the standard provisioning URI for QR / manual enrollment.
 * Pure: the secret is the officer's own pending factor, displayed once
 * over their authenticated session and never logged.
 */
export function buildTotpProvisioningUri(input: {
  issuer?: string;
  accountName: string;
  secret: string;
}): string {
  const issuer = input.issuer ?? GOV_TOTP_ISSUER;
  const label = `${issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/** Normalize a recovery code typed by an officer (case/space tolerant). */
export function normalizeGovRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s_]+/g, "-");
}

/** Mint `count` recovery codes (default 10). Plaintext: display once. */
export function generateGovRecoveryCodes(count: number = GOV_RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/** SHA-256 hex of the normalized code — the only form ever stored. */
export function hashGovRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeGovRecoveryCode(code), "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export type GovMfaFactorStatus = "none" | "pending" | "enabled";

export interface GovMfaFactorRow {
  officer_id: string;
  secret_ciphertext: string;
  enabled_at: string | null;
  revoked_at: string | null;
  pending_secret_ciphertext: string | null;
  pending_created_at: string | null;
}

/** Read the officer's factor row (null when never enrolled). */
export async function getGovMfaFactor(officerId: string): Promise<GovMfaFactorRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("gov_mfa_factors")
    .select(
      "officer_id,secret_ciphertext,enabled_at,revoked_at,pending_secret_ciphertext,pending_created_at",
    )
    .eq("officer_id", officerId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up MFA factor.");
  return (data as GovMfaFactorRow | null) ?? null;
}

/** Pure status classification used by routes and UI gating. */
export function classifyGovMfaFactor(
  factor: GovMfaFactorRow | null,
  nowMs: number = Date.now(),
): GovMfaFactorStatus {
  if (!factor) return "none";
  if (factor.pending_secret_ciphertext && factor.pending_created_at) {
    if (nowMs - new Date(factor.pending_created_at).getTime() < GOV_MFA_ENROLL_EXPIRY_MS) {
      return "pending";
    }
  }
  if (factor.enabled_at) return "enabled";
  return "none";
}

export interface GovMfaEnrollmentStart {
  otpauthUrl: string;
  manualKey: string;
  expiresAt: string;
}

/**
 * Begin enrollment: mint a secret into the pending columns. Any previous
 * pending secret is replaced; the active factor (if any) keeps working
 * until a successful confirm. Returns single-display provisioning material.
 */
export async function startGovMfaEnrollment(
  officerId: string,
  accountName: string,
): Promise<GovMfaEnrollmentStart> {
  const secret = generateTotpSecret();
  const pendingCiphertext = encryptGovTotpSecret(secret);
  const now = new Date();
  const row = {
    officer_id: officerId,
    secret_ciphertext: pendingCiphertext,
    enabled_at: null,
    revoked_at: null,
    pending_secret_ciphertext: pendingCiphertext,
    pending_created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  // Preserve an existing ACTIVE factor: only overwrite the pending
  // columns when a live factor already exists.
  const existing = await getGovMfaFactor(officerId);
  if (existing && existing.enabled_at) {
    const { error } = await getSupabaseServer()
      .from("gov_mfa_factors")
      .update({
        pending_secret_ciphertext: pendingCiphertext,
        pending_created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("officer_id", officerId)
      .is("revoked_at", null);
    throwIfError(error, "Failed to start MFA enrollment.");
  } else {
    const { error } = await getSupabaseServer()
      .from("gov_mfa_factors")
      .upsert(row, { onConflict: "officer_id" });
    throwIfError(error, "Failed to start MFA enrollment.");
  }
  return {
    otpauthUrl: buildTotpProvisioningUri({ accountName, secret }),
    manualKey: secret,
    expiresAt: new Date(now.getTime() + GOV_MFA_ENROLL_EXPIRY_MS).toISOString(),
  };
}

export interface GovMfaConfirmResult {
  ok: boolean;
  /** Plaintext recovery codes — returned exactly once on success. */
  recoveryCodes?: string[];
  reason?: "no_pending" | "expired" | "invalid_code" | "unavailable";
}

/**
 * Confirm enrollment with a code from the authenticator app. On success
 * the pending secret becomes the active factor and a fresh set of
 * recovery codes is issued (old unused codes are retired).
 */
export async function confirmGovMfaEnrollment(
  officerId: string,
  code: string,
  nowMs: number = Date.now(),
): Promise<GovMfaConfirmResult> {
  const factor = await getGovMfaFactor(officerId);
  if (!factor || !factor.pending_secret_ciphertext || !factor.pending_created_at) {
    return { ok: false, reason: "no_pending" };
  }
  if (nowMs - new Date(factor.pending_created_at).getTime() >= GOV_MFA_ENROLL_EXPIRY_MS) {
    await clearGovMfaPending(officerId).catch(() => {});
    return { ok: false, reason: "expired" };
  }
  const secret = decryptGovTotpSecret(factor.pending_secret_ciphertext);
  if (!secret) return { ok: false, reason: "unavailable" };
  if (!verifyTotpCode(secret, code.trim(), nowMs)) {
    return { ok: false, reason: "invalid_code" };
  }

  const now = new Date(nowMs).toISOString();
  const { error } = await getSupabaseServer()
    .from("gov_mfa_factors")
    .update({
      secret_ciphertext: factor.pending_secret_ciphertext,
      enabled_at: now,
      pending_secret_ciphertext: null,
      pending_created_at: null,
      updated_at: now,
    })
    .eq("officer_id", officerId)
    .is("revoked_at", null);
  throwIfError(error, "Failed to activate MFA factor.");

  const recoveryCodes = generateGovRecoveryCodes();
  await replaceGovRecoveryCodes(officerId, recoveryCodes);
  return { ok: true, recoveryCodes };
}

/** Drop an expired/unwanted pending secret without touching the active factor. */
export async function clearGovMfaPending(officerId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_mfa_factors")
    .update({
      pending_secret_ciphertext: null,
      pending_created_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("officer_id", officerId)
    .is("revoked_at", null);
  throwIfError(error, "Failed to clear pending MFA enrollment.");
}

/** Replace all unused recovery codes with a fresh hashed set. */
export async function replaceGovRecoveryCodes(
  officerId: string,
  codes: string[],
): Promise<void> {
  const client = getSupabaseServer();
  const { error: deleteError } = await client
    .from("gov_recovery_codes")
    .delete()
    .eq("officer_id", officerId)
    .is("used_at", null);
  throwIfError(deleteError, "Failed to retire old recovery codes.");
  const { error: insertError } = await client.from("gov_recovery_codes").insert(
    codes.map((code) => ({
      officer_id: officerId,
      code_hash: hashGovRecoveryCode(code),
    })),
  );
  throwIfError(insertError, "Failed to store recovery codes.");
}

/**
 * Verify and consume a single recovery code. Single-use: the row is
 * stamped on success and can never validate again. Comparison is
 * constant-time over the hash lookup result.
 */
export async function verifyGovOfficerRecoveryCode(
  officerId: string,
  code: string,
): Promise<boolean> {
  const normalized = normalizeGovRecoveryCode(code);
  if (!GOV_RECOVERY_CODE_PATTERN.test(normalized)) return false;
  const wanted = hashGovRecoveryCode(normalized);
  const { data, error } = await getSupabaseServer()
    .from("gov_recovery_codes")
    .select("id,code_hash")
    .eq("officer_id", officerId)
    .is("used_at", null);
  if (error) return false;
  const rows = (data as Array<{ id: string; code_hash: string }>) ?? [];
  const match = rows.find((row) => safeEqualHex(row.code_hash, wanted));
  if (!match) return false;
  const { error: consumeError } = await getSupabaseServer()
    .from("gov_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", match.id)
    .is("used_at", null);
  return !consumeError;
}

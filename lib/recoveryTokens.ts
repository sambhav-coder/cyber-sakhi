import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { findProfileById } from "@/lib/db/profiles";
import { throwIfError } from "@/lib/db/errors";
import type { AppUser } from "@/lib/authTypes";

export const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Cryptographically random, single-use recovery token. Only its SHA-256 hash
 * is ever persisted; the raw token exists only in the URL/recovery email and
 * is never logged.
 */
export function generateRecoveryToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashRecoveryToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createRecoveryToken(profileId: string): Promise<{
  token: string;
  expiresAt: string;
}> {
  const token = generateRecoveryToken();
  const tokenHash = hashRecoveryToken(token);
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS).toISOString();

  const { error } = await getSupabaseServer()
    .from("auth_recovery_tokens")
    .insert({ profile_id: profileId, token_hash: tokenHash, expires_at: expiresAt });

  throwIfError(error, "Failed to create recovery token.");
  return { token, expiresAt };
}

/**
 * Validate a recovery token and return the linked profile. Read-only: does
 * NOT consume the token (consumption happens only on successful reset).
 */
export async function findProfileByRecoveryToken(
  token: string
): Promise<{ profileId: string; profile: AppUser } | undefined> {
  const tokenHash = hashRecoveryToken(token);

  const { data, error } = await getSupabaseServer()
    .from("auth_recovery_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .is("used_at", null)
    .limit(1)
    .maybeSingle();

  throwIfError(error, "Failed to validate recovery token.");
  if (!data) return undefined;

  const profile = await findProfileById(String(data.profile_id));
  if (!profile) return undefined;

  return { profileId: String(data.profile_id), profile };
}

/** Single-use invalidation: removes the consumed token row immediately. */
export async function consumeRecoveryToken(profileId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("auth_recovery_tokens")
    .delete()
    .eq("profile_id", profileId);

  // Logged server-side only; never surfaces sensitive values to the client.
  throwIfError(error, "Failed to invalidate recovery token.");
}
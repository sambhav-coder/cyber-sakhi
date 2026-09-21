/**
 * Government opaque session token generation and hashing (Unit 3).
 *
 * Pure helpers with no I/O. Mirrors the repository's recovery-token pattern
 * (lib/recoveryTokens.ts): 32 cryptographically random bytes rendered as
 * base64url, SHA-256 hex for storage and lookup. The raw token is only ever
 * present in the government cookie and in transient memory; only the hash
 * reaches the database.
 */

import crypto from "node:crypto";

/** Entropy size for opaque government session tokens. */
export const GOV_SESSION_TOKEN_BYTES = 32;

/**
 * Generate a cryptographically random opaque session token using the
 * operating-system CSPRNG. Throws if no secure generator is available;
 * never falls back to Math.random.
 */
export function generateGovSessionToken(): string {
  return crypto.randomBytes(GOV_SESSION_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest of a session token for storage and indexed lookup. */
export function hashGovSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Server-authoritative evidence SHA-256 digest helpers.
 *
 * The evidence bytes the server actually stores are the base64-encoded
 * AES-256-GCM ciphertext (`encrypted_content`). The server is the single
 * authority for the SHA-256 digest that feeds blockchain anchoring and
 * server-side integrity verification: it recomputes the digest from those
 * stored bytes and never accepts a client-supplied hash as authoritative.
 *
 * The client-side plaintext hash (EvidenceItem.sha256Hash) may still be kept
 * for UI / transport validation, but it is never used for anchoring or
 * verification once a server-computed digest exists.
 *
 * Canonical bytes: the base64-decoded encrypted payload. This keeps the
 * digests deterministic and reproducible from the exact artifact the vault
 * holds, so an on-chain digest can be re-verified end-to-end from GET data.
 */

import { createHash } from "node:crypto";

/** Metadata key where the server-computed authoritative digest is persisted. */
export const EVIDENCE_DIGEST_META_KEY = "integrityDigest";

/** SHA-256 of raw bytes (lowercase hex). */
export function sha256Bytes(data: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Server-side SHA-256 over the canonical stored evidence bytes.
 *
 * Canonical bytes = base64-decoded encrypted payload. Returns null when no
 * evidence content is stored (the server has no bytes to hash), so callers
 * can fall back to legacy behavior for content-less records.
 */
export function computeEvidenceContentDigest(
  encryptedContent?: string | null
): string | null {
  if (!encryptedContent || typeof encryptedContent !== "string") return null;
  const bytes = Buffer.from(encryptedContent, "base64");
  if (bytes.length === 0) return null;
  return sha256Bytes(bytes);
}

/**
 * The authoritative digest used for blockchain anchoring and verification.
 *
 * Prefers the server-computed digest persisted in `metadata.integrityDigest`;
 * falls back to the stored `sha256` column for legacy / content-less records
 * so existing evidence keeps anchoring exactly as before.
 */
export function getAuthoritativeEvidenceDigest(input: {
  sha256?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const metaDigest = input.metadata?.[EVIDENCE_DIGEST_META_KEY];
  if (typeof metaDigest === "string" && metaDigest) return metaDigest;
  return input.sha256 || "";
}

/**
 * THE canonical evidence digest used by BOTH blockchain anchoring and
 * verification. This is the single, authoritative hashing function for the
 * evidence content commitment — callers on both the anchor and verify path
 * MUST use this so an unchanged evidence item always reproduces the same
 * digest (`localDigest === onChainDigest` -> verified).
 *
 * Order of precedence:
 *   1. Freshly recomputed SHA-256 over the currently stored bytes
 *      (base64-decoded `encrypted_content`). Recomputing from live state means
 *      evidence modified after anchoring produces a different digest and is
 *      detected as an integrity failure — a stored digest is never trusted.
 *   2. The server-computed digest persisted in `metadata.integrityDigest`
 *      (legacy rows / content-less records that have no stored bytes yet).
 *   3. The legacy `sha256` column (pre-S1 records).
 *
 * The digest never depends on mutable state such as the custody chain, so
 * anchoring is stable for unchanged evidence.
 */
export function getCanonicalEvidenceDigest(input: {
  encryptedContent?: string | null;
  sha256?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const fromBytes = computeEvidenceContentDigest(input.encryptedContent);
  if (fromBytes) return fromBytes;
  const metaDigest = input.metadata?.[EVIDENCE_DIGEST_META_KEY];
  if (typeof metaDigest === "string" && metaDigest) return metaDigest;
  return input.sha256 || "";
}
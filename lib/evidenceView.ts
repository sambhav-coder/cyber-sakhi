import type { EvidenceRow } from "@/lib/db/types";
import type { EvidenceItem, EvidenceLockEnvelope, EvidenceAnchorView } from "@/lib/types";
import type { BlockchainAnchorRow } from "./db/blockchainAnchors";
import { getAuthoritativeEvidenceDigest } from "./evidenceDigest";

/**
 * Server-side serializer for evidence rows.
 *
 * This is the single place that decides what a stored evidence record looks
 * like when it reaches the client. When evidence has crypto lock material
 * (password/key lock), sensitive fields are masked to prevent data leakage.
 */

export interface EvidenceMetadataFields {
  integrityVerified: boolean;
  encrypted: boolean;
  locked: boolean;
  lockedAt: string | null;
}

export function parseEvidenceMetadata(
  metadata: Record<string, unknown> | null
): EvidenceMetadataFields {
  const m = metadata || {};
  return {
    integrityVerified: m.integrityVerified !== false,
    encrypted: m.encrypted === true || m.encryption === "AES-256-GCM",
    locked: m.locked === true,
    lockedAt: typeof m.lockedAt === "string" ? m.lockedAt : null,
  };
}

/** Whether this evidence has real crypto lock material (not just soft-locked). */
export function isCryptoLocked(ev: EvidenceRow): boolean {
  const meta = parseEvidenceMetadata(ev.metadata);
  return meta.locked && Boolean(ev.wrapped_key || ev.lock_version);
}

/** Build the safe lock envelope from evidence columns (no secrets beyond wrapped blobs). */
function buildLockEnvelope(ev: EvidenceRow): EvidenceLockEnvelope {
  return {
    lockMethod: ev.lock_method || "password",
    lockVersion: ev.lock_version || 1,
    kdf: ev.kdf || "PBKDF2-SHA256",
    kdfSalt: ev.kdf_salt || "",
    kdfIterations: ev.kdf_iterations || 310000,
    kdfParams: (ev.kdf_params as Record<string, unknown>) || {
      hash: "SHA-256",
      keyLength: 256,
      algorithm: "PBKDF2",
    },
    wrappedKey: ev.wrapped_key || "",
    wrappedKeyIv: ev.wrapped_key_iv || "",
    verifierWrapped: ev.verifier_wrapped || "",
    verifierIv: ev.verifier_iv || "",
  };
}

/** Build anchor view from a blockchain anchor row (safe, no tx secrets). */
function buildAnchorView(
  anchor: BlockchainAnchorRow | null | undefined
): EvidenceAnchorView | null {
  if (!anchor) return null;
  return {
    anchorId: anchor.id,
    anchorType: anchor.anchor_type,
    anchorStatus: anchor.status as EvidenceAnchorView["anchorStatus"],
    txHash: anchor.tx_hash,
    blockNumber: anchor.block_number,
    networkName: anchor.network_name,
    chainId: anchor.chain_id,
    digest: anchor.anchored_digest,
    anchoredAt: anchor.anchored_at,
  };
}

/** Full (unlocked) evidence item — used when evidence has no crypto lock or is unlocked. */
export function toEvidenceItem(
  ev: EvidenceRow,
  opts?: {
    caseNumber?: string | null;
    custodyCount?: number;
    anchor?: BlockchainAnchorRow | null;
  }
): EvidenceItem {
  const meta = parseEvidenceMetadata(ev.metadata);
  const hasMaterial = Boolean(ev.wrapped_key || ev.lock_version);
  return {
    id: ev.id,
    title: ev.title,
    filename: ev.filename || "unknown",
    fileType: ev.mime_type || "application/octet-stream",
    fileSize: ev.file_size ?? 0,
    timestamp: ev.created_at,
    sha256Hash: ev.sha256 || "",
    integrityDigest: getAuthoritativeEvidenceDigest(ev),
    category: (ev.category as EvidenceItem["category"]) || "OTHER",
    notes: ev.description ?? undefined,
    integrityVerified: meta.integrityVerified,
    encrypted: meta.encrypted,
    evidenceCode: ev.evidence_code || "",
    locked: meta.locked,
    lockedAt: meta.lockedAt,
    caseId: ev.case_id,
    caseNumber: opts?.caseNumber ?? undefined,
    custodyCount:
      opts?.custodyCount !== undefined ? opts.custodyCount : undefined,
    hasLockMaterial: hasMaterial,
    lockEnvelope: hasMaterial && meta.locked ? buildLockEnvelope(ev) : null,
    anchor: buildAnchorView(opts?.anchor),
  };
}

/**
 * Masked (locked) evidence item for API responses when crypto lock material exists.
 * Only safe, non-sensitive fields are returned. No ciphertext, title, filename,
 * hash, notes, category, or size are exposed.
 */
export function toMaskedEvidenceItem(
  ev: EvidenceRow,
  opts?: {
    caseNumber?: string | null;
    custodyCount?: number;
    anchor?: BlockchainAnchorRow | null;
  }
): EvidenceItem {
  const meta = parseEvidenceMetadata(ev.metadata);
  return {
    id: ev.id,
    title: "",       // masked
    filename: "",    // masked
    fileType: "",    // masked
    fileSize: 0,     // masked
    timestamp: ev.created_at,
    sha256Hash: "",  // masked
    integrityDigest: "", // masked
    category: "OTHER", // masked
    notes: undefined, // masked
    integrityVerified: meta.integrityVerified,
    encrypted: false, // masked
    evidenceCode: ev.evidence_code || "",
    locked: true,
    lockedAt: meta.lockedAt,
    caseId: ev.case_id,
    caseNumber: opts?.caseNumber ?? undefined,
    custodyCount:
      opts?.custodyCount !== undefined ? opts.custodyCount : undefined,
    hasLockMaterial: true,
    lockEnvelope: buildLockEnvelope(ev),
    anchor: buildAnchorView(opts?.anchor),
    // Explicitly no encryptedContent, encryptionIv, etc.
  };
}
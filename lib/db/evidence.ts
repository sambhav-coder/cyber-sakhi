import type { EvidenceItem } from "@/lib/types";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import { getCaseForUser } from "./cases";
import { generateEvidenceCode } from "@/lib/caseId";
import type { EvidenceRow } from "./types";

export async function listEvidenceForUser(userId: string): Promise<EvidenceRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("uploaded_by", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list evidence.");
  return (data || []) as EvidenceRow[];
}

export async function getEvidenceById(
  evidenceId: string,
  userId: string
): Promise<EvidenceRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("id", evidenceId)
    .eq("uploaded_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve evidence.");
  return data as EvidenceRow | null;
}

/**
 * Resolve an Evidence Locker item by its public EV-XXXX-XXXXXXXX code,
 * scoped to the authenticated user. Used by the Sakhi chat attachment flow so
 * evidence is validated server-side by ownership — never trusted from the client.
 */
export async function getEvidenceByCode(
  code: string,
  userId: string
): Promise<EvidenceRow | null> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("evidence_code", normalized)
    .eq("uploaded_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve evidence by code.");
  return data as EvidenceRow | null;
}

export async function verifyEvidenceOwnership(
  evidenceId: string,
  userId: string
): Promise<boolean> {
  const evidence = await getEvidenceById(evidenceId, userId);
  return evidence !== null;
}

export async function getEvidenceForCase(
  caseId: string,
  userId: string
): Promise<EvidenceRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("case_id", caseId)
    .eq("uploaded_by", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list case evidence.");
  return (data || []) as EvidenceRow[];
}

export async function createEvidence(input: {
  userId: string;
  caseId?: string;
  item: EvidenceItem;
  encryptedContent?: string;
  encryptionIv?: string;
  encryptedSize?: number;
}): Promise<EvidenceRow> {
  if (input.caseId) {
    const owns = await getCaseForUser(input.caseId, input.userId);
    if (!owns) {
      throw new Error("Case not found or access denied.");
    }
  }

  const isEncrypted = Boolean(input.encryptedContent);
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .insert({
      case_id: input.caseId ?? null,
      uploaded_by: input.userId,
      title: input.item.title,
      filename: input.item.filename,
      mime_type: input.item.fileType,
      file_size: input.item.fileSize,
      sha256: input.item.sha256Hash,
      source: "upload",
      description: input.item.notes ?? null,
      metadata: {
        integrityVerified: input.item.integrityVerified,
        encrypted: isEncrypted,
        encryption: isEncrypted ? "AES-256-GCM" : null,
        locked: false,
        lockedAt: null,
      },
      category: input.item.category,
      evidence_code: generateEvidenceCode(),
      encrypted_content: input.encryptedContent ?? null,
      encryption_iv: input.encryptionIv ?? null,
      encrypted_size: input.encryptedSize ?? null,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to save evidence.");
  return data as EvidenceRow;
}

export async function updateEvidence(
  evidenceId: string,
  userId: string,
  patch: {
    caseId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<EvidenceRow | null> {
  const update: Record<string, unknown> = {};
  if (patch.caseId !== undefined) update.case_id = patch.caseId;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;

  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .update(update)
    .eq("id", evidenceId)
    .eq("uploaded_by", userId)
    .select("*")
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to update evidence.");
  return data as EvidenceRow | null;
}

/**
 * Apply crypto lock material to an evidence row.
 * Called by POST /api/evidence/[id]/lock.
 * The server never stores a plaintext password or raw DEK — only wrapped material.
 */
export async function applyEvidenceLock(
  evidenceId: string,
  userId: string,
  patch: {
    lockMethod: string;
    lockVersion: number;
    kdf: string;
    kdfSalt: string;
    kdfIterations: number;
    kdfParams: Record<string, unknown>;
    wrappedKey: string;
    wrappedKeyIv: string;
    verifierWrapped: string;
    verifierIv: string;
    verifierSha: string;
    reencryptedContent?: string;
    reencryptedIv?: string;
    reencryptedSize?: number;
  }
): Promise<EvidenceRow | null> {
  const { data: existing, error: loadErr } = await getSupabaseServer()
    .from("evidence")
    .select("metadata, lock_metadata")
    .eq("id", evidenceId)
    .maybeSingle();

  if (loadErr || !existing) {
    throwIfError(loadErr, "Failed to load evidence for lock.");
    return null;
  }

  const prevMeta = (existing.metadata || {}) as Record<string, unknown>;
  const lockedAt = new Date().toISOString();

  const update: Record<string, unknown> = {
    lock_method: patch.lockMethod,
    lock_version: patch.lockVersion,
    kdf: patch.kdf,
    kdf_salt: patch.kdfSalt,
    kdf_iterations: patch.kdfIterations,
    kdf_params: patch.kdfParams,
    wrapped_key: patch.wrappedKey,
    wrapped_key_iv: patch.wrappedKeyIv,
    verifier_wrapped: patch.verifierWrapped,
    verifier_iv: patch.verifierIv,
    verifier_sha: patch.verifierSha,
    lock_metadata: {
      locked: true,
      createdAt: lockedAt,
      method: patch.lockMethod,
      version: patch.lockVersion,
      kdf: patch.kdf,
      kdfIterations: patch.kdfIterations,
    },
    metadata: { ...prevMeta, locked: true, lockedAt },
  };

  if (patch.reencryptedContent !== undefined) update.encrypted_content = patch.reencryptedContent;
  if (patch.reencryptedIv !== undefined) update.encryption_iv = patch.reencryptedIv;
  if (patch.reencryptedSize !== undefined) update.encrypted_size = patch.reencryptedSize;

  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .update(update)
    .eq("id", evidenceId)
    .eq("uploaded_by", userId)
    .select("*")
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to apply evidence lock.");
  return data as EvidenceRow | null;
}

/**
 * Update lock metadata (e.g. unlock attempt count). Server-only; never exposed.
 */
export async function updateLockMetadata(
  evidenceId: string,
  patch: {
    failedAttempts?: number;
    lastFailedAt?: string;
  }
): Promise<void> {
  const { data: existing, error: loadErr } = await getSupabaseServer()
    .from("evidence")
    .select("lock_metadata")
    .eq("id", evidenceId)
    .maybeSingle();

  if (loadErr || !existing) return;

  const meta = (existing.lock_metadata || {}) as Record<string, unknown>;
  const updatedMeta = { ...meta };
  if (patch.failedAttempts !== undefined) updatedMeta.failedAttempts = patch.failedAttempts;
  if (patch.lastFailedAt !== undefined) updatedMeta.lastFailedAt = patch.lastFailedAt;

  const { error } = await getSupabaseServer()
    .from("evidence")
    .update({ lock_metadata: updatedMeta })
    .eq("id", evidenceId);

  throwIfError(error, "Failed to update lock metadata.");
}

/**
 * Link the latest blockchain anchor to an evidence row.
 */
export async function setEvidenceAnchorLink(
  evidenceId: string,
  anchorId: string | null
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("evidence")
    .update({ blockchain_anchor_id: anchorId })
    .eq("id", evidenceId);
  throwIfError(error, "Failed to link evidence to blockchain anchor.");
}

export async function deleteEvidenceCustody(evidenceId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("chain_of_custody")
    .delete()
    .eq("evidence_id", evidenceId);
  throwIfError(error, "Failed to delete chain of custody.");
}

export async function deleteEvidence(
  evidenceId: string,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("evidence")
    .delete()
    .eq("id", evidenceId)
    .eq("uploaded_by", userId);
  throwIfError(error, "Failed to delete evidence.");
}

/**
 * Deletes the custody chain first, then the evidence row itself. The base
 * schema does not guarantee ON DELETE CASCADE between evidence and
 * chain_of_custody, so the chain is cleaned up explicitly to avoid orphans.
 */
export async function deleteEvidenceWithCustody(
  evidenceId: string,
  userId: string
): Promise<boolean> {
  const owns = await verifyEvidenceOwnership(evidenceId, userId);
  if (!owns) return false;
  await deleteEvidenceCustody(evidenceId);
  await deleteEvidence(evidenceId, userId);
  return true;
}
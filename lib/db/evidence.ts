import type { EvidenceItem } from "@/lib/types";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { EvidenceRow } from "./types";

export async function listEvidenceForUser(userId: string): Promise<EvidenceRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list evidence.");
  return (data || []) as EvidenceRow[];
}

export async function getEvidenceById(evidenceId: string, userId: string): Promise<EvidenceRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("*")
    .eq("id", evidenceId)
    .eq("user_id", userId)
    .single();

  if (error && error.code === "PGRST116") {
    return null;
  }
  throwIfError(error, "Failed to retrieve evidence.");
  return data as EvidenceRow;
}

export async function verifyEvidenceOwnership(evidenceId: string, userId: string): Promise<boolean> {
  const evidence = await getEvidenceById(evidenceId, userId);
  return evidence !== null;
}

export async function createEvidence(input: {
  userId: string;
  caseId?: string;
  item: EvidenceItem;
  encryptedContent?: string;
  encryptionIv?: string;
  encryptedSize?: number;
}): Promise<EvidenceRow> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      title: input.item.title,
      filename: input.item.filename,
      file_type: input.item.fileType,
      file_size: input.item.fileSize,
      sha256_hash: input.item.sha256Hash,
      category: input.item.category,
      notes: input.item.notes ?? null,
      integrity_verified: input.item.integrityVerified,
      simulated_ipfs_cid: input.item.simulatedIpfsCid,
      simulated_tx_hash: input.item.simulatedTxHash,
      encrypted_content: input.encryptedContent ?? null,
      encryption_iv: input.encryptionIv ?? null,
      encrypted_size: input.encryptedSize ?? null,
      created_at: input.item.timestamp,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to save evidence.");
  return data as EvidenceRow;
}

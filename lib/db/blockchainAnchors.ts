/**
 * Database operations for blockchain_anchors.
 *
 * All operations go through the Supabase service-role client (RLS-safe).
 * No plaintext evidence or key material is ever stored in this table —
 * only integrity digests and transaction metadata.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { AnchorStatus } from "@/lib/blockchain/types";

export interface BlockchainAnchorRow {
  id: string;
  evidence_id: string | null;
  anchor_type: string;
  anchor_version: number;
  provider: string | null;
  network_name: string | null;
  chain_id: string | null;
  tx_hash: string | null;
  block_number: number | null;
  transaction_timestamp: string | null;
  anchored_digest: string;
  anchor_payload: string | null;
  payload_metadata: Record<string, unknown> | null;
  status: string;
  created_at: string;
  anchored_at: string | null;
}

/** Insert a new blockchain anchor record (status initially 'pending'). */
export async function createBlockchainAnchor(input: {
  evidenceId?: string | null;
  anchorType: string;
  anchorVersion?: number;
  provider?: string | null;
  networkName?: string | null;
  chainId?: string | null;
  payload: string;
  digest: string;
  payloadMetadata?: Record<string, unknown> | null;
}): Promise<BlockchainAnchorRow> {
  const { data, error } = await getSupabaseServer()
    .from("blockchain_anchors")
    .insert({
      evidence_id: input.evidenceId ?? null,
      anchor_type: input.anchorType,
      anchor_version: input.anchorVersion ?? 1,
      provider: input.provider ?? "evm",
      network_name: input.networkName ?? null,
      chain_id: input.chainId ?? null,
      anchored_digest: input.digest,
      anchor_payload: input.payload,
      payload_metadata: input.payloadMetadata ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  throwIfError(error, "Failed to create blockchain anchor record.");
  return data as BlockchainAnchorRow;
}

/** Update an anchor record after a real on-chain transaction is confirmed (or failed). */
export async function updateBlockchainAnchor(
  anchorId: string,
  patch: {
    status?: AnchorStatus;
    txHash?: string | null;
    blockNumber?: number | null;
    chainId?: string | null;
    networkName?: string | null;
    anchoredAt?: string | null;
    transactionTimestamp?: string | null;
  }
): Promise<BlockchainAnchorRow | null> {
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.txHash !== undefined) update.tx_hash = patch.txHash;
  if (patch.blockNumber !== undefined) update.block_number = patch.blockNumber;
  if (patch.chainId !== undefined) update.chain_id = patch.chainId;
  if (patch.networkName !== undefined) update.network_name = patch.networkName;
  if (patch.anchoredAt !== undefined) update.anchored_at = patch.anchoredAt;
  if (patch.transactionTimestamp !== undefined) update.transaction_timestamp = patch.transactionTimestamp;

  if (Object.keys(update).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from("blockchain_anchors")
    .update(update)
    .eq("id", anchorId)
    .select("*")
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to update blockchain anchor.");
  return data as BlockchainAnchorRow | null;
}

/** Get an anchor by id (safe for internal use only). */
export async function getBlockchainAnchorById(
  anchorId: string
): Promise<BlockchainAnchorRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("blockchain_anchors")
    .select("*")
    .eq("id", anchorId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve blockchain anchor.");
  return data as BlockchainAnchorRow | null;
}

/** Get the latest anchor for an evidence item by anchor type. */
export async function getLatestAnchorForEvidence(
  evidenceId: string,
  anchorType?: string
): Promise<BlockchainAnchorRow | null> {
  let query = getSupabaseServer()
    .from("blockchain_anchors")
    .select("*")
    .eq("evidence_id", evidenceId)
    .order("created_at", { ascending: false });

  if (anchorType) query = query.eq("anchor_type", anchorType);

  const { data, error } = await query.limit(1).maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve blockchain anchor.");
  return data as BlockchainAnchorRow | null;
}

/** List anchors for multiple evidence IDs. Returns latest anchor per evidence. */
export async function listLatestAnchorsForEvidence(
  evidenceIds: string[]
): Promise<Record<string, BlockchainAnchorRow>> {
  if (evidenceIds.length === 0) return {};

  const { data, error } = await getSupabaseServer()
    .from("blockchain_anchors")
    .select("*")
    .in("evidence_id", evidenceIds)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list blockchain anchors.");

  const latest: Record<string, BlockchainAnchorRow> = {};
  for (const row of (data || []) as BlockchainAnchorRow[]) {
    const eid = row.evidence_id;
    if (!eid) continue;
    if (!latest[eid]) latest[eid] = row;
  }
  return latest;
}

/** Delete all anchor records for an evidence item (used in cleanup). */
export async function deleteAnchorsForEvidence(evidenceId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("blockchain_anchors")
    .delete()
    .eq("evidence_id", evidenceId);
  throwIfError(error, "Failed to delete blockchain anchors.");
}

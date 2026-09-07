import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { ChainOfCustodyRow } from "./types";

export async function listChainOfCustody(
  evidenceId: string
): Promise<ChainOfCustodyRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("chain_of_custody")
    .select("*")
    .eq("evidence_id", evidenceId)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to list chain of custody.");
  return (data || []) as ChainOfCustodyRow[];
}

export async function appendChainOfCustody(input: {
  evidenceId: string;
  action: string;
  actorId?: string;
  notes?: string;
  hash?: string;
}): Promise<ChainOfCustodyRow> {
  const { data, error } = await getSupabaseServer()
    .from("chain_of_custody")
    .insert({
      evidence_id: input.evidenceId,
      action: input.action,
      actor_id: input.actorId ?? null,
      notes: input.notes ?? null,
      hash: input.hash ?? null,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to append chain of custody.");
  return data as ChainOfCustodyRow;
}

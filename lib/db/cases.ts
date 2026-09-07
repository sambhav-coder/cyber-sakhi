import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { CaseRow } from "./types";

export async function listCasesForUser(userId: string): Promise<CaseRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list cases.");
  return (data || []) as CaseRow[];
}

export async function createCase(input: {
  userId: string;
  caseCode?: string;
  title?: string;
  status?: string;
  threatType?: string;
  severity?: string;
}): Promise<CaseRow> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .insert({
      user_id: input.userId,
      case_code: input.caseCode ?? null,
      title: input.title ?? null,
      status: input.status ?? null,
      threat_type: input.threatType ?? null,
      severity: input.severity ?? null,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create case.");
  return data as CaseRow;
}

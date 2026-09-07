import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { ReportRow } from "./types";

export async function listReportsForUser(userId: string): Promise<ReportRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list reports.");
  return (data || []) as ReportRow[];
}

export async function createReport(input: {
  userId: string;
  caseId?: string;
  title: string;
  content?: string;
}): Promise<ReportRow> {
  const { data, error } = await getSupabaseServer()
    .from("reports")
    .insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      title: input.title,
      content: input.content ?? null,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create report.");
  return data as ReportRow;
}

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import { getCaseForUser } from "./cases";
import type { ReportRow } from "./types";

export async function listReportsForUser(
  userId: string,
  caseId?: string
): Promise<ReportRow[]> {
  let query = getSupabaseServer()
    .from("reports")
    .select("*")
    .eq("generated_by", userId)
    .order("created_at", { ascending: false });

  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error } = await query;
  throwIfError(error, "Failed to list reports.");
  return (data || []) as ReportRow[];
}

export async function createReport(input: {
  userId: string;
  caseId?: string;
  title: string;
  reportType?: string;
  reportData?: Record<string, unknown>;
}): Promise<ReportRow> {
  const { data, error } = await getSupabaseServer()
    .from("reports")
    .insert({
      case_id: input.caseId ?? null,
      generated_by: input.userId,
      title: input.title,
      report_type: input.reportType ?? "forensic",
      report_data: input.reportData ?? null,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create report.");
  return data as ReportRow;
}

export async function getReportForUser(
  reportId: string,
  userId: string
): Promise<ReportRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .eq("generated_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve report.");
  return data as ReportRow | null;
}

export async function getLatestReportForCase(
  caseId: string,
  userId: string
): Promise<ReportRow | null> {
  const owns = await getCaseForUser(caseId, userId);
  if (!owns) return null;

  const { data, error } = await getSupabaseServer()
    .from("reports")
    .select("*")
    .eq("case_id", caseId)
    .eq("generated_by", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve report.");
  return data as ReportRow | null;
}
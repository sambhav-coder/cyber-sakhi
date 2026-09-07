import type { EmailAnalysisResult } from "@/lib/emailTypes";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { EmailInvestigationRow } from "./types";

export async function listEmailInvestigationsForUser(
  userId: string
): Promise<EmailInvestigationRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list email investigations.");
  return (data || []) as EmailInvestigationRow[];
}

export async function createEmailInvestigation(input: {
  userId: string;
  caseId?: string;
  result: EmailAnalysisResult;
}): Promise<EmailInvestigationRow> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      subject: input.result.headers.subject ?? null,
      threat_level: input.result.threatLevel,
      threat_score: input.result.threatScore,
      analysis: input.result,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to save email investigation.");
  return data as EmailInvestigationRow;
}

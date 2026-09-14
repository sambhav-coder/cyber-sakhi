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
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list email investigations.");
  return (data || []) as EmailInvestigationRow[];
}

export async function createEmailInvestigation(input: {
  userId: string;
  caseId?: string;
  result: EmailAnalysisResult;
  source?: string;
  externalMessageId?: string | null;
}): Promise<EmailInvestigationRow> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .insert({
      case_id: input.caseId ?? null,
      created_by: input.userId,
      source: input.source ?? "pasted_headers",
      external_message_id: input.externalMessageId ?? null,
      subject: input.result.headers.subject ?? null,
      sender: input.result.headers.from ?? null,
      recipients: [input.result.headers.to ?? null, input.result.headers.cc ?? null]
        .filter(Boolean),
      risk_score: input.result.threatScore,
      verdict: input.result.threatLevel,
      headers: input.result.headers,
      analysis: input.result,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to save email investigation.");
  return data as EmailInvestigationRow;
}
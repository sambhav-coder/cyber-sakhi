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

/** Lightweight rows for the analysis history list (no full analysis blob). */
export type EmailHistoryRow = Pick<
  EmailInvestigationRow,
  "id" | "case_id" | "source" | "subject" | "sender" | "risk_score" | "verdict" | "created_at"
>;

export async function listEmailHistoryForUser(
  userId: string,
  limit = 200
): Promise<EmailHistoryRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .select("id, case_id, source, subject, sender, risk_score, verdict, created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "Failed to list analysis history.");
  return (data || []) as EmailHistoryRow[];
}

export async function getEmailInvestigationForUser(
  id: string,
  userId: string
): Promise<EmailInvestigationRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .select("*")
    .eq("id", id)
    .eq("created_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve analysis.");
  return data as EmailInvestigationRow | null;
}

/** Deletes one history entry. Its indicators go with it (FK cascade). */
export async function deleteEmailInvestigationForUser(
  id: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .delete()
    .eq("id", id)
    .eq("created_by", userId)
    .select("id");

  throwIfError(error, "Failed to delete analysis.");
  return (data || []).length > 0;
}

/** Links a history entry (and its indicators) to a case the user owns. */
export async function attachInvestigationToCase(
  id: string,
  userId: string,
  caseId: string
): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("email_investigations")
    .update({ case_id: caseId })
    .eq("id", id)
    .eq("created_by", userId);
  throwIfError(error, "Failed to link analysis to case.");

  const { error: indicatorError } = await sb
    .from("indicators")
    .update({ case_id: caseId })
    .eq("investigation_id", id);
  throwIfError(indicatorError, "Failed to link indicators to case.");
}
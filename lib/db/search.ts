import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import { maskPii } from "@/lib/privacy/masking";

export interface CaseSearchRow {
  id: string;
  case_number: string | null;
  title: string | null;
  description: string | null;
  threat_type: string | null;
  status: string | null;
  severity: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CaseSearchResult {
  id: string;
  caseNumber: string | null;
  title: string | null;
  description: string | null;
  threatType: string | null;
  status: string | null;
  severity: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Ownership-scoped, parameterized case search via public.search_cases().
 * The term travels as a bind parameter, so user input can never inject SQL,
 * and the SECURITY INVOKER function filters on created_by = owner.
 */
export async function searchCasesForUser(
  userId: string,
  term: string,
  maxRows = 25
): Promise<CaseSearchResult[]> {
  const trimmed = term.trim();
  const { data, error } = await getSupabaseServer().rpc("search_cases", {
    owner_at: userId,
    search_term: trimmed === "" ? null : trimmed,
    max_rows: maxRows,
  });

  throwIfError(error, "Failed to search cases.");

  return ((data as CaseSearchRow[] | null) ?? []).map((r) => {
    // Apply PII masking to text fields returned to UI for privacy
    // Search operates on original data, but results are masked for display
    const title = r.title || "";
    const description = r.description || "";
    const maskedTitle = title ? maskPii(title, "partial").text : title;
    const maskedDescription = description ? maskPii(description, "partial").text : description;

    return {
      id: r.id,
      caseNumber: r.case_number,
      title: maskedTitle,
      description: maskedDescription,
      threatType: r.threat_type,
      status: r.status,
      severity: r.severity,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}
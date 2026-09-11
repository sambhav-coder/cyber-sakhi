import { getSupabaseServer } from "@/lib/supabaseServer";
import { isUniqueViolation, throwIfError } from "./errors";
import { generateCaseNumber } from "@/lib/caseId";
import type {
  AdminCaseOverviewRow,
  CaseChatMessageRow,
  CaseRow,
  EmailInvestigationRow,
  IndicatorRow,
} from "./types";

const CASE_FIELDS =
  "id,case_number,title,description,threat_type,status,severity,created_by,created_at,updated_at";

export const isValidUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function listCasesForUser(userId: string): Promise<CaseRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select(CASE_FIELDS)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list cases.");
  return (data || []) as CaseRow[];
}

export async function getCaseForUser(
  caseId: string,
  userId: string
): Promise<CaseRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select(CASE_FIELDS)
    .eq("id", caseId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve case.");
  return data as CaseRow | null;
}

/**
 * Ownership-scoped lookup by the human-facing Case Number
 * (e.g. "CS-2026-XJY9D7"). Returns null when the case does not belong to
 * `userId` — the caller must treat "null" as "not found or not yours"
 * and must NOT hint which one.
 */
export async function getCaseForUserByCaseNumber(
  caseNumber: string,
  userId: string
): Promise<CaseRow | null> {
  const normalized = caseNumber.trim().toUpperCase();
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select(CASE_FIELDS)
    .ilike("case_number", normalized)
    .eq("created_by", userId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve case.");
  return data as CaseRow | null;
}

export async function createCase(input: {
  userId: string;
  title?: string;
  description?: string;
  threatType?: string;
  status?: string;
  severity?: string;
}): Promise<CaseRow> {
  const severity = (input.severity || "unknown").toLowerCase();
  const status = input.status || "open";

  const MAX_RETRIES = 5;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const caseNumber = generateCaseNumber();
    const { data, error } = await getSupabaseServer()
      .from("cases")
      .insert({
        case_number: caseNumber,
        title: input.title ?? null,
        description: input.description ?? null,
        threat_type: input.threatType ?? null,
        status,
        severity,
        created_by: input.userId,
      })
      .select(CASE_FIELDS)
      .maybeSingle();

    if (!error && data) {
      return data as CaseRow;
    }

    if (isUniqueViolation(error) && attempt < MAX_RETRIES - 1) {
      continue;
    }

    lastError = error;
    break;
  }

  throwIfError(lastError, "Failed to create case.");
  throw new Error("Failed to create case.");
}

export async function updateCaseStatus(
  caseId: string,
  userId: string,
  status: string
): Promise<CaseRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("created_by", userId)
    .select(CASE_FIELDS)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to update case status.");
  return data as CaseRow | null;
}

export async function deleteCase(
  caseId: string,
  userId: string
): Promise<boolean> {
  const owns = await getCaseForUser(caseId, userId);
  if (!owns) return false;

  // Evidence rows cascade with the case; wipe their custody chains first so
  // no orphaned chain records survive the cascade.
  const { data: caseEvidence } = await getSupabaseServer()
    .from("evidence")
    .select("id")
    .eq("case_id", caseId)
    .eq("uploaded_by", userId);
  const evidenceIds = ((caseEvidence || []) as Array<{ id: string }>).map(
    (r) => r.id
  );
  if (evidenceIds.length > 0) {
    const { error: custodyError } = await getSupabaseServer()
      .from("chain_of_custody")
      .delete()
      .in("evidence_id", evidenceIds);
    throwIfError(custodyError, "Failed to clean chain of custody.");
  }

  const { error } = await getSupabaseServer()
    .from("cases")
    .delete()
    .eq("id", caseId)
    .eq("created_by", userId);

  throwIfError(error, "Failed to delete case.");
  return true;
}

/**
 * Returns a map of owned case id -> human-facing case number. Only cases
 * belonging to `userId` are included, so evidence enrichment never leaks
 * another user's case identifiers.
 */
export async function listCaseNumbersByIds(
  ids: string[],
  userId: string
): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select("id,case_number")
    .in("id", ids)
    .eq("created_by", userId);

  throwIfError(error, "Failed to load case numbers.");
  const map: Record<string, string | null> = {};
  for (const row of (data || []) as Array<{
    id: string;
    case_number: string | null;
  }>) {
    map[row.id] = row.case_number;
  }
  return map;
}

export async function getCaseInvestigationsForUser(
  caseId: string,
  userId: string
): Promise<EmailInvestigationRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("email_investigations")
    .select("*")
    .eq("case_id", caseId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to list case investigations.");
  return (data || []) as EmailInvestigationRow[];
}

export async function getCaseIndicators(
  caseId: string,
  userId: string,
  investigationIds: string[]
): Promise<IndicatorRow[]> {
  if (investigationIds.length === 0) return [];

  const { data, error } = await getSupabaseServer()
    .from("indicators")
    .select("*")
    .in("investigation_id", investigationIds)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to list case indicators.");
  return (data || []) as IndicatorRow[];
}

export async function getCaseChat(
  caseId: string,
  userId: string
): Promise<CaseChatMessageRow[]> {
  const owns = await getCaseForUser(caseId, userId);
  if (!owns) return [];

  const { data, error } = await getSupabaseServer()
    .from("case_chat_messages")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to load case conversation.");
  return (data || []) as CaseChatMessageRow[];
}

export async function clearCaseChat(
  caseId: string,
  userId: string
): Promise<boolean> {
  const owns = await getCaseForUser(caseId, userId);
  if (!owns) return false;

  const { error } = await getSupabaseServer()
    .from("case_chat_messages")
    .delete()
    .eq("case_id", caseId);

  throwIfError(error, "Failed to clear case conversation.");
  return true;
}

export interface AdminCaseOverview {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byThreatType: Record<string, number>;
  recent: AdminCaseOverviewRow[];
}

export async function getAdminCaseOverview(): Promise<AdminCaseOverview> {
  const { data, error } = await getSupabaseServer()
    .from("cases")
    .select("case_number,threat_type,status,severity,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  throwIfError(error, "Failed to load case overview.");

  const rows = (data || []) as AdminCaseOverviewRow[];
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byThreatType: Record<string, number> = {};

  for (const row of rows) {
    const severity = row.severity ? row.severity.toLowerCase() : "unknown";
    const status = row.status ? row.status.toLowerCase() : "unknown";
    const threatType = row.threat_type || "unknown";

    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    byThreatType[threatType] = (byThreatType[threatType] || 0) + 1;
  }

  return {
    total: rows.length,
    bySeverity,
    byStatus,
    byThreatType,
    recent: rows,
  };
}
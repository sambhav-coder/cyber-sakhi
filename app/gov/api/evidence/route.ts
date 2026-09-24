import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { resolveGovScopeFilter, govEvidenceForCase, govExplorer } from "@/lib/gov/govQueries";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireGovApi(req, "evidence.view");
  if (!guard.ok) return guard.response;

  const scope = await resolveGovScopeFilter(guard.context.officer);

  // Get all cases in scope
  const casesResult = await govExplorer({
    scope,
    page: 1,
    pageSize: 1000, // Get all cases in scope
  });

  if (casesResult.rows.length === 0) {
    return NextResponse.json([]);
  }

  const caseIds = casesResult.rows.map((c) => c.id);

  // Get evidence for all cases in scope
  const { data: evidenceData, error: evidenceError } = await getSupabaseServer()
    .from("evidence")
    .select("id,evidence_code,title,category,mime_type,file_size,sha256,created_at,source,blockchain_anchor_id,case_id")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });

  throwIfError(evidenceError, "Failed to load evidence.");

  // Get case details for the cases
  const { data: casesData, error: casesError } = await getSupabaseServer()
    .from("cases")
    .select("id,case_number,state_code,district_code")
    .in("id", caseIds);

  throwIfError(casesError, "Failed to load case details.");

  // Create a map of case details
  const caseMap = new Map((casesData ?? []).map((c: any) => [c.id, c]));

  const evidenceList = ((evidenceData ?? []) as Array<{
    id: string;
    evidence_code: string;
    title: string;
    category: string | null;
    mime_type: string | null;
    file_size: number | null;
    sha256: string | null;
    created_at: string;
    source: string | null;
    blockchain_anchor_id: string | null;
    case_id: string;
  }>).map((e) => {
    const caseDetails = caseMap.get(e.case_id);
    return {
      id: e.id,
      evidenceCode: e.evidence_code,
      title: e.title,
      category: e.category,
      mimeType: e.mime_type,
      fileSize: e.file_size,
      sha256: e.sha256,
      createdAt: e.created_at,
      source: e.source,
      blockchainAnchorId: e.blockchain_anchor_id,
      caseId: e.case_id,
      caseNumber: caseDetails?.case_number ?? null,
      stateCode: caseDetails?.state_code ?? null,
      districtCode: caseDetails?.district_code ?? null,
    };
  });

  return NextResponse.json(evidenceList);
}
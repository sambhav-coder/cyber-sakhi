/** Shared server-only helpers for the public /api/gov route surface. */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { guardGovApiRequest, type GovGuardContext } from "./govGuard";
import { applyGovScopeFilter, resolveGovScopeFilter } from "./govQueries";
import { isValidGovResourceId } from "./govResource";
import type { GovPermission } from "./govTypes";

export async function requireGovApi(req: Request, permission: GovPermission) {
  return guardGovApiRequest(req, permission);
}

/**
 * Resolve a case only after both permission and the actor's server-side scope
 * have been applied.  A missing and an out-of-scope case intentionally share
 * the same 404 response, preventing an IDOR existence oracle.
 */
export async function requireScopedCase(
  context: GovGuardContext,
  caseId: string,
): Promise<{ id: string; state_code: string | null; district_code: string | null } | NextResponse> {
  if (!isValidGovResourceId(caseId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  const scope = await resolveGovScopeFilter(context.officer);
  let query = getSupabaseServer().from("cases").select("id,state_code,district_code").eq("id", caseId);
  query = applyGovScopeFilter(query, scope);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  return data as { id: string; state_code: string | null; district_code: string | null };
}

export function isGovApiError(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

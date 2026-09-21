import { NextResponse } from "next/server";
import { guardGovApiRequest } from "@/lib/gov/govGuard";
import { resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { govDashboardFilterOptions } from "@/lib/gov/govQueries";

export const runtime = "nodejs";

/**
 * Distinct filter options for the Overview selectors. Values come from the
 * real scoped cases table — never a hard-coded state/district list.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const guard = await guardGovApiRequest(req, "case.view_meta");
  if (!guard.ok) return guard.response;

  const { officer } = guard.context;
  const url = new URL(req.url);
  const state = url.searchParams.get("state");

  const scope = await resolveGovScopeFilter(officer);
  const options = await govDashboardFilterOptions(scope, state);
  return NextResponse.json(options);
}
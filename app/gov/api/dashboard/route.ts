import { NextResponse } from "next/server";
import { guardGovApiRequest } from "@/lib/gov/govGuard";
import { resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { govDashboardMetrics } from "@/lib/gov/govQueries";
import { govDashboardWindow } from "@/lib/gov/govQueries";

export const runtime = "nodejs";

const RANGES = new Set(["today", "7d", "30d", "90d", "custom"]);

/**
 * Phase 5 — Overview metrics. Every request re-checks session, role,
 * permission, and scope server-side; the officer can never widen their own
 * state/district view beyond what their scope allows (the scope predicate is
 * applied first, and extra filters can only narrow it).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const guard = await guardGovApiRequest(req, "case.view_meta");
  if (!guard.ok) return guard.response;

  const { officer } = guard.context;
  const url = new URL(req.url);
  const range = url.searchParams.get("range") ?? "7d";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const stateCode = url.searchParams.get("state");
  const districtCode = url.searchParams.get("district");

  const window = RANGES.has(range)
    ? govDashboardWindow(range, from, to)
    : govDashboardWindow("7d");

  const scope = await resolveGovScopeFilter(officer);
  const metrics = await govDashboardMetrics(scope, {
    window,
    stateCode: stateCode || null,
    districtCode: districtCode || null,
    officerId: officer.id,
  });

  return NextResponse.json(metrics);
}
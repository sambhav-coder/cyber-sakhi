import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govExplorer, resolveGovScopeFilter } from "@/lib/gov/govQueries";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireGovApi(req, "case.view_meta");
  if (!guard.ok) return guard.response;
  const p = new URL(req.url).searchParams;
  const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(p.get("pageSize") ?? 25) || 25));
  const result = await govExplorer({
    scope: await resolveGovScopeFilter(guard.context.officer), page, pageSize,
    term: p.get("q")?.slice(0, 160), stateCode: p.get("state") || undefined,
    districtCode: p.get("district") || undefined, threatCategory: p.get("threat") || undefined,
    riskLevel: p.get("risk") || undefined, govStatus: p.get("status") || undefined,
    officerId: p.get("officer") || undefined, from: p.get("from") || undefined, to: p.get("to") || undefined,
    sort: p.get("sort") === "gov_status" ? "gov_status" : "created_at",
    sortDir: p.get("dir") === "asc" ? "asc" : "desc",
  });
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govTrends, resolveGovScopeFilter } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "analytics.view"); if (!guard.ok) return guard.response;
 const now = new Date(); const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
 const to = now.toISOString(); const from = new Date(now.getTime() - days * 86400000).toISOString(); const prevTo = from; const prevFrom = new Date(now.getTime() - days * 2 * 86400000).toISOString();
 return NextResponse.json(await govTrends(await resolveGovScopeFilter(guard.context.officer), from, to, prevFrom, prevTo));
}

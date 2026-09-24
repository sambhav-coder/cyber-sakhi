import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govSearchIndicators, resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { govJsonError } from "@/lib/gov/govHttp";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "indicator.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams; const q = p.get("q")?.trim() ?? "";
 if (!q || q.length > 320) return govJsonError(400, "BAD_REQUEST", "An indicator search value is required.");
 return NextResponse.json(await govSearchIndicators(await resolveGovScopeFilter(guard.context.officer), q, Math.min(50, Math.max(1, Number(p.get("limit") ?? 10) || 10))));
}

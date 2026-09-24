import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govGeoSummary, resolveGovScopeFilter } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "geo.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams;
 return NextResponse.json(await govGeoSummary({ scope: await resolveGovScopeFilter(guard.context.officer), state: p.get("state"), district: p.get("district"), from: p.get("from"), to: p.get("to"), casesLimit: p.get("district") ? 50 : 0 }));
}

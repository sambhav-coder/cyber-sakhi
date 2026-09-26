import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import { govGeoSummary, resolveGovScopeFilter } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "geo.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams;
 const summary = await govGeoSummary({ scope: await resolveGovScopeFilter(guard.context.officer), state: p.get("state"), district: p.get("district"), from: p.get("from"), to: p.get("to"), casesLimit: p.get("district") ? 50 : 0 });
 // Location-privacy gate (§8): row-level cases ride this summary only for
 // officers who may also open them in the Case Explorer. geo.view-only
 // roles (e.g. ANALYST) receive the aggregate contract with no case rows;
 // aggregates themselves were already scope-filtered before grouping.
 if (!roleHasDefaultPermission(guard.context.officer.role, "case.view_meta")) {
   const { cases: _stripped, ...aggregate } = summary;
   void _stripped;
   return NextResponse.json(aggregate);
 }
 return NextResponse.json(summary);
}

import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import { govGeoSummary, resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { buildSihDemoGeoSummary } from "@/lib/gov/govDemoGis";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "geo.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams;
 const scope = await resolveGovScopeFilter(guard.context.officer);
 // The restricted DEMO jurisdiction is the sole consumer of this static
 // dataset. Production officer scopes always query only persisted cases.
 if (scope.kind === "unattributed" && scope.label === "DEMO") {
   return NextResponse.json(buildSihDemoGeoSummary(p.get("state"), p.get("district"), p.get("locality")));
 }
 const summary = await govGeoSummary({ scope, state: p.get("state"), district: p.get("district"), locality: p.get("locality"), from: p.get("from"), to: p.get("to"), casesLimit: p.get("district") ? 50 : 0 });
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

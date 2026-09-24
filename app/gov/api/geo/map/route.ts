import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govGeoSummary, resolveGovScopeFilter } from "@/lib/gov/govQueries";
import {
  GOV_MAP_SUPPRESSION_THRESHOLD_DEFAULT,
  buildGovMapContract,
} from "@/lib/gov/govMapContract";

export const runtime = "nodejs";

/**
 * Privacy-preserving intelligence-map contract.
 *
 * Aggregate counts only: no case rows, no case UUIDs/numbers, no victim
 * PII, no GPS, no evidence. Scope is enforced server-side before any
 * grouping via resolveGovScopeFilter; the optional `suppressAbove`
 * threshold only flags small regions for "Suppressed" display (default
 * disabled). Source/verification metadata is always included.
 */
export async function GET(req: Request) {
  const guard = await requireGovApi(req, "geo.view");
  if (!guard.ok) return guard.response;
  const p = new URL(req.url).searchParams;
  const rawState = (p.get("state") ?? "").trim().slice(0, 120);
  const rawDistrict = (p.get("district") ?? "").trim().slice(0, 120);
  const rawThreshold = Number(p.get("suppressAbove") ?? "");
  const suppressionThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0
      ? Math.min(1000, Math.floor(rawThreshold))
      : GOV_MAP_SUPPRESSION_THRESHOLD_DEFAULT;
  const summary = await govGeoSummary({
    scope: await resolveGovScopeFilter(guard.context.officer),
    state: rawState.length > 0 ? rawState : null,
    district: rawDistrict.length > 0 ? rawDistrict : null,
    from: p.get("from"),
    to: p.get("to"),
  });
  // Strip the row-level `cases` detail (present only when a district is
  // set): this endpoint is aggregate-only by design.
  const { cases: _omitted, ...aggregate } = summary;
  void _omitted;
  return NextResponse.json(buildGovMapContract(aggregate, { suppressionThreshold }));
}

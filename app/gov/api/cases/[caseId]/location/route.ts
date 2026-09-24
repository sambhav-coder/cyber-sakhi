import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { listCaseLocationsForGov } from "@/lib/db/caseLocations";

export const runtime = "nodejs";

/**
 * Government read path for case live-locations (exact coordinates are PII):
 *  - requires case.view_pii (STATE_ADMIN, DISTRICT_OFFICER, INVESTIGATOR;
 *    ANALYST/AUDITOR/SUPER_ADMIN do NOT hold it),
 *  - requires an in-scope case (requireScopedCase, 404-masked),
 *  - requires a 4–500 char investigation purpose/ticket,
 *  - mandatory audit (pii.access_allowed); failure fails CLOSED (500).
 * No global endpoint exists: one case per request, minimum fields only.
 */
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
  const guard = await requireGovApi(req, "case.view_pii");
  if (!guard.ok) return guard.response;
  const resource = await requireScopedCase(guard.context, params.caseId);
  if (isGovApiError(resource)) return resource;
  const purpose = new URL(req.url).searchParams.get("purpose")?.trim() ?? "";
  if (purpose.length < 4 || purpose.length > 500) {
    return NextResponse.json(
      {
        error: {
          code: "PURPOSE_REQUIRED",
          message: "A 4–500 character investigation purpose or ticket is required to view live-location data.",
        },
      },
      { status: 422 }
    );
  }
  const locations = await listCaseLocationsForGov(resource.id);
  const audit = buildGovAuditEvent({
    action: "pii.access_allowed",
    actor: govOfficerAuditActor(guard.context.officer),
    caseId: resource.id,
    permission: "case.view_pii",
    piiTier: "full",
    result: "allow",
    correlationId: crypto.randomUUID(),
    payload: { purpose, count: locations.length, kind: "live_location" },
  });
  if (!audit) {
    return NextResponse.json(
      { error: { code: "AUDIT_UNAVAILABLE", message: "Unable to record the location access." } },
      { status: 500 }
    );
  }
  try {
    await persistGovAuditEvent(audit);
  } catch {
    return NextResponse.json(
      { error: { code: "AUDIT_UNAVAILABLE", message: "Unable to record the location access." } },
      { status: 500 }
    );
  }
  return NextResponse.json({ locations });
}

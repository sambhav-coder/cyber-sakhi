import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import {
  getClientIp,
  getUserAgent,
  govUnauthorized,
} from "@/lib/gov/govHttp";
import { getGovRequestAuth } from "@/lib/gov/govSessionHttp";

export const runtime = "nodejs";

/** Safe, secret-free officer profile for the console header / session checks. */
function publicOfficer(
  officer: {
    id: string;
    officer_code: string;
    full_name: string;
    department: string | null;
    role: string;
    scope: string;
    state_code: string | null;
    district_code: string | null;
  },
  mfaFresh: boolean,
) {
  return {
    authenticated: true,
    officer: {
      officerId: officer.id,
      officerCode: officer.officer_code,
      fullName: officer.full_name,
      department: officer.department,
      role: officer.role,
      scope: officer.scope,
      stateCode: officer.state_code,
      districtCode: officer.district_code,
    },
    mfaFresh,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { evaluation } = await getGovRequestAuth(req);

  if (!evaluation.valid) {
    // Best-effort triage record; never blocks the denial itself.
    const event = buildGovAuditEvent({
      action: "session.rejected",
      actor: { kind: "unknown", detail: "session_check" } satisfies GovAuditActor,
      result: "deny",
      denialReason: evaluation.reason,
      resourceType: "gov_session",
      correlationId: crypto.randomUUID(),
      remoteIp: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    if (event) {
      await persistGovAuditEvent(event, { swallow: true, onError: () => {} });
    }
    return govUnauthorized();
  }

  return NextResponse.json(
    publicOfficer(evaluation.officer, evaluation.mfaFresh),
  );
}
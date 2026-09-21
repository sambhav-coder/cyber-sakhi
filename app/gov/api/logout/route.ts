import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { govSessionClearCookieAttributes } from "@/lib/gov/govCookie";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import {
  getClientIp,
  getUserAgent,
  isCrossOriginRequest,
} from "@/lib/gov/govHttp";
import { revokeGovSession } from "@/lib/gov/govSession";
import { getGovRequestAuth } from "@/lib/gov/govSessionHttp";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  // Logout is idempotent: an invalid/missing session still clears the cookie.
  const response = NextResponse.json({ ok: true });

  const { evaluation } = await getGovRequestAuth(req);
  if (evaluation.valid && evaluation.session) {
    try {
      await revokeGovSession(evaluation.session.id, evaluation.officer.id, "logout");
    } catch {
      // Cookie is cleared regardless; the session itself is gated per request.
    }

    if (!isCrossOriginRequest(req)) {
      const actor: GovAuditActor = {
        kind: "gov_officer",
        officerId: evaluation.officer.id,
        officerCode: evaluation.officer.officer_code,
        role: evaluation.officer.role,
        scope: evaluation.officer.scope,
        stateCode: evaluation.officer.state_code,
        districtCode: evaluation.officer.district_code,
      };
      const event = buildGovAuditEvent({
        action: "session.revoked",
        actor,
        result: "allow",
        resourceType: "gov_session",
        resourceId: evaluation.session.id,
        correlationId: crypto.randomUUID(),
        remoteIp: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      if (event) {
        // Logout must never fail because of a second-order audit problem.
        await persistGovAuditEvent(event, { swallow: true });
      }
    }
  }

  const clear = govSessionClearCookieAttributes();
  response.cookies.set(clear.name, "", {
    path: clear.path,
    httpOnly: clear.httpOnly,
    secure: clear.secure,
    sameSite: clear.sameSite,
    maxAge: 0,
  });
  return response;
}
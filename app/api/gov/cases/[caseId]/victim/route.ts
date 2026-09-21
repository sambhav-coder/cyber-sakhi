import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { govCaseVictim, govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
 const guard = await requireGovApi(req, "case.view_pii"); if (!guard.ok) return guard.response;
 const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
 const victim = await govCaseVictim(resource.id);
 const audit = buildGovAuditEvent({ action: "pii.access_allowed", actor: govOfficerAuditActor(guard.context.officer), caseId: resource.id, permission: "case.view_pii", piiTier: "full", result: "allow", correlationId: crypto.randomUUID() });
 if (audit) await persistGovAuditEvent(audit, { swallow: true });
 return NextResponse.json(victim);
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { govEvidenceForCase, govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
 const guard = await requireGovApi(req, "evidence.list"); if (!guard.ok) return guard.response;
 const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
 const data = await govEvidenceForCase(resource.id);
 const audit = buildGovAuditEvent({ action: "evidence.access_allowed", actor: govOfficerAuditActor(guard.context.officer), caseId: resource.id, permission: "evidence.list", evidenceTier: "list", result: "allow", correlationId: crypto.randomUUID() });
 if (audit) await persistGovAuditEvent(audit, { swallow: true });
 return NextResponse.json(data);
}

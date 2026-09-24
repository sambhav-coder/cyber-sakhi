import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { govCaseDetail, govOfficerAuditActor, govUpdateCaseTriage } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { isCrossOriginRequest, govJsonError } from "@/lib/gov/govHttp";

export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
  const guard = await requireGovApi(req, "case.view"); if (!guard.ok) return guard.response;
  const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
  const detail = await govCaseDetail(resource.id); if (!detail) return govJsonError(404, "NOT_FOUND", "Not found.");
  const audit = buildGovAuditEvent({ action: "case.access_allowed", actor: govOfficerAuditActor(guard.context.officer), caseId: resource.id, permission: "case.view", result: "allow", correlationId: crypto.randomUUID() });
  if (audit) await persistGovAuditEvent(audit, { swallow: true });
  return NextResponse.json(detail);
}
export async function PATCH(req: Request, { params }: { params: { caseId: string } }) {
  if (isCrossOriginRequest(req)) return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  const guard = await requireGovApi(req, "case.update"); if (!guard.ok) return guard.response;
  const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return govJsonError(400, "BAD_REQUEST", "Invalid request body.");
  const result = await govUpdateCaseTriage(resource.id, { govStatus: typeof body.govStatus === "string" ? body.govStatus : undefined, riskLevel: typeof body.riskLevel === "string" ? body.riskLevel : undefined, severity: typeof body.severity === "string" ? body.severity : undefined, threatCategory: typeof body.threatCategory === "string" ? body.threatCategory : undefined });
  const audit = buildGovAuditEvent({ action: "case.updated", actor: govOfficerAuditActor(guard.context.officer), caseId: resource.id, permission: "case.update", result: "allow", correlationId: crypto.randomUUID() });
  if (audit) await persistGovAuditEvent(audit, { swallow: true });
  return NextResponse.json(result);
}

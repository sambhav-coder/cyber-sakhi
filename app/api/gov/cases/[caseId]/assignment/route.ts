import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { govAssignCase, govOfficerAuditActor, govOfficerCandidates } from "@/lib/gov/govQueries";
import { govJsonError, isCrossOriginRequest } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { caseId: string } }) {
  const guard = await requireGovApi(req, "case.assign"); if (!guard.ok) return guard.response;
  const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
  return NextResponse.json(await govOfficerCandidates(guard.context.officer));
}

export async function POST(req: Request, { params }: { params: { caseId: string } }) {
  if (isCrossOriginRequest(req)) return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
  const guard = await requireGovApi(req, "case.assign"); if (!guard.ok) return guard.response;
  const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
  const body = await req.json().catch(() => null) as { officerId?: unknown; reason?: unknown; ticket?: unknown } | null;
  if (typeof body?.officerId !== "string" || typeof body.reason !== "string" || body.reason.trim().length < 4 || body.reason.length > 500 || (body.ticket !== undefined && typeof body.ticket !== "string")) {
    return govJsonError(400, "BAD_REQUEST", "A valid officer and assignment reason are required.");
  }
  const permitted = await govOfficerCandidates(guard.context.officer);
  if (!permitted.some((candidate) => candidate.id === body.officerId)) return govJsonError(404, "NOT_FOUND", "Not found.");
  const assignment = await govAssignCase({ caseId: resource.id, officerId: body.officerId, assignedBy: guard.context.officer.id, reason: body.reason.trim(), ticket: typeof body.ticket === "string" ? body.ticket.trim() : null }, govOfficerAuditActor(guard.context.officer), crypto.randomUUID());
  return NextResponse.json(assignment, { status: 201 });
}

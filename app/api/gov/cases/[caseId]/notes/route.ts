import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { addGovCaseNote, govOfficerAuditActor, listGovCaseNotes } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { govJsonError, isCrossOriginRequest } from "@/lib/gov/govHttp";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
 const guard = await requireGovApi(req, "case.view"); if (!guard.ok) return guard.response;
 const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
 return NextResponse.json(await listGovCaseNotes(resource.id));
}
export async function POST(req: Request, { params }: { params: { caseId: string } }) {
 if (isCrossOriginRequest(req)) return govJsonError(403, "CROSS_ORIGIN", "Request origin not allowed.");
 const guard = await requireGovApi(req, "case.note"); if (!guard.ok) return guard.response;
 const resource = await requireScopedCase(guard.context, params.caseId); if (isGovApiError(resource)) return resource;
 const body = await req.json().catch(() => null) as { content?: unknown } | null;
 if (typeof body?.content !== "string" || body.content.trim().length < 1 || body.content.length > 4000) return govJsonError(400, "BAD_REQUEST", "A note of up to 4000 characters is required.");
 const note = await addGovCaseNote(resource.id, guard.context.officer.id, body.content);
 const audit = buildGovAuditEvent({ action: "case.note_added", actor: govOfficerAuditActor(guard.context.officer), caseId: resource.id, permission: "case.note", result: "allow", correlationId: crypto.randomUUID() });
 if (audit) await persistGovAuditEvent(audit, { swallow: true });
 return NextResponse.json(note, { status: 201 });
}

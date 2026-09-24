import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireGovApi, requireScopedCase, isGovApiError } from "@/lib/gov/govApi";
import { isValidGovResourceId } from "@/lib/gov/govResource";
import { govEvidenceIntegrity, govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { govJsonError } from "@/lib/gov/govHttp";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { evidenceId: string } }) {
  const guard = await requireGovApi(req, "evidence.view"); if (!guard.ok) return guard.response;
  if (!isValidGovResourceId(params.evidenceId)) return govJsonError(404, "NOT_FOUND", "Not found.");
  const { data } = await getSupabaseServer().from("evidence").select("case_id").eq("id", params.evidenceId).maybeSingle();
  const caseId = (data as { case_id: string | null } | null)?.case_id;
  if (!caseId) return govJsonError(404, "NOT_FOUND", "Not found.");
  const resource = await requireScopedCase(guard.context, caseId); if (isGovApiError(resource)) return resource;
  const integrity = await govEvidenceIntegrity(params.evidenceId, new URL(req.url).searchParams.get("verify") === "true");
  const audit = buildGovAuditEvent({ action: "evidence.access_allowed", actor: govOfficerAuditActor(guard.context.officer), caseId, resourceType: "evidence", resourceId: params.evidenceId, permission: "evidence.view", evidenceTier: "metadata", result: "allow", correlationId: crypto.randomUUID() });
  if (audit) await persistGovAuditEvent(audit, { swallow: true });
  return NextResponse.json(integrity);
}

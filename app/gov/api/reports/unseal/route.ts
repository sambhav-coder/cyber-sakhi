import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isGovApiError, requireGovApi, requireScopedCase } from "@/lib/gov/govApi";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import { verifyGovPassword } from "@/lib/gov/govCredentials";
import { readGovReportSeal } from "@/lib/gov/govReportSeals";
import { GovRateLimiter } from "@/lib/gov/govRateLimit";
import {
  govCaseDetail,
  govEvidenceForCase,
  govOfficerAuditActor,
} from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { getClientIp, getUserAgent, govForbidden, govJsonError, govJsonOk } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

/**
 * Unseal one report dossier for a scoped case.
 *
 * Gate order (fail-closed): session + report.generate, then case.view
 * (the dossier carries case detail), then the scoped-case binding (a
 * missing and an out-of-scope case share one 404), then the
 * per-report password when a seal exists. Attempts are rate-limited
 * (process-local 10/min per officer+case; the audit trail is the
 * durable control) and every allow/deny is audited. Wrong passwords
 * and missing passwords share one generic message so failures do not
 * confirm whether a seal exists to an officer who already passed the
 * outer gates — and unauthorized callers never reach this point.
 */
const unsealLimiter = new GovRateLimiter(60_000, 10);

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "report.generate");
  if (!guard.ok) return guard.response;
  const { officer } = guard.context;

  if (!roleHasDefaultPermission(officer.role, "case.view")) {
    return govForbidden("PERMISSION_DENIED", "You do not have permission to perform this action.");
  }

  const body = (await req.json().catch(() => null)) as { caseId?: unknown; password?: unknown } | null;
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const password = typeof body?.password === "string" ? body.password : null;
  if (!caseId) {
    return govJsonError(400, "BAD_REQUEST", "A case is required.");
  }

  const scoped = await requireScopedCase(guard.context, caseId);
  if (isGovApiError(scoped)) return scoped;

  const limit = unsealLimiter.check(`${officer.id}:${scoped.id}`);
  if (!limit.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((limit.retryAfterMs ?? 60_000) / 1000));
    const event = buildGovAuditEvent({
      actor: govOfficerAuditActor(officer),
      action: "report.unlock_failed",
      permission: "report.generate",
      result: "deny",
      denialReason: "rate_limited",
      correlationId: crypto.randomUUID(),
      remoteIp: getClientIp(req),
      userAgent: getUserAgent(req),
      caseId: scoped.id,
      resourceType: "report",
      resourceId: scoped.id,
    });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: `Too many unlock attempts. Retry in ${retryAfterSec}s.` } },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const auditBase = {
    actor: govOfficerAuditActor(officer),
    permission: "report.generate" as const,
    correlationId: crypto.randomUUID(),
    remoteIp: getClientIp(req),
    userAgent: getUserAgent(req),
    caseId: scoped.id,
    resourceType: "report",
    resourceId: scoped.id,
  };

  let sealStatus: "sealed" | "unsealed" | "store_unavailable";
  let sealHash: string | null = null;
  let sealSetAt: string | null = null;
  try {
    const read = await readGovReportSeal(scoped.id);
    sealStatus = read.status;
    if (read.status === "sealed") {
      sealHash = read.seal.passwordHash;
      sealSetAt = read.seal.createdAt;
    }
  } catch {
    const event = buildGovAuditEvent({ ...auditBase, action: "report.unlock_failed", result: "error" });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(500, "UNSEAL_FAILED", "Unable to unseal this report.");
  }

  if (sealStatus === "sealed") {
    // Single bcrypt comparison; the seal hash never leaves the server.
    const match = sealHash && password ? await verifyGovPassword(password, sealHash).catch(() => false) : false;
    if (!match) {
      const event = buildGovAuditEvent({
        ...auditBase,
        action: "report.unlock_failed",
        result: "deny",
        denialReason: "seal_mismatch",
      });
      if (event) await persistGovAuditEvent(event, { swallow: true });
      return govJsonError(403, "UNSEAL_DENIED", "Unable to unseal this report.");
    }
  }

  const detail = await govCaseDetail(scoped.id).catch(() => null);
  if (!detail) {
    return govJsonError(404, "NOT_FOUND", "Not found.");
  }
  const evidence = await govEvidenceForCase(scoped.id).catch(() => []);

  const event = buildGovAuditEvent({ ...auditBase, action: "report.unsealed", result: "allow" });
  if (event) await persistGovAuditEvent(event, { swallow: true });

  return govJsonOk({
    reportId: `RPT-${detail.caseNumber}`,
    version: 1,
    generatedAt: new Date().toISOString(),
    passwordEnforced: sealStatus === "sealed",
    sealSetAt,
    case: {
      id: detail.id,
      caseNumber: detail.caseNumber,
      title: detail.title,
      description: detail.description,
      status: detail.status,
      govStatus: detail.govStatus,
      severity: detail.severity,
      riskLevel: detail.riskLevel,
      threatType: detail.threatType,
      threatCategory: detail.threatCategory,
      stateCode: detail.stateCode,
      districtCode: detail.districtCode,
      subDivision: detail.subDivision,
      locality: detail.locality,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      incidentDate: detail.incidentDate,
      incidentChannel: detail.incidentChannel,
      lossAmount: detail.lossAmount,
      currency: detail.currency,
      caseSource: detail.caseSource,
      assignedOfficer: detail.assignedOfficer,
    },
    assignments: detail.assignments,
    investigations: detail.investigations,
    indicators: detail.indicators,
    notes: detail.notes,
    evidence,
    evidenceCount: detail.evidenceCount,
    timeline: detail.timeline,
  });
}

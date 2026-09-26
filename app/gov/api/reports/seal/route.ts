import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isGovApiError, requireGovApi, requireScopedCase } from "@/lib/gov/govApi";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import { evaluateGovPassword } from "@/lib/gov/govPasswordPolicy";
import { hashGovPassword } from "@/lib/gov/govCredentials";
import { GovSealStoreUnavailable, upsertGovReportSeal } from "@/lib/gov/govReportSeals";
import { govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { getClientIp, getUserAgent, govForbidden, govJsonError, govJsonOk } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

/**
 * Set (or rotate) the per-report password seal for one scoped case.
 *
 * Requires report.generate AND case.view: the dossier a seal protects
 * contains case detail, so analysts holding only case.view_meta must not
 * be able to seal (or reason about) reports they cannot open.
 * The password is evaluated against the central policy, bcrypt-hashed
 * (cost 12), and stored in gov_report_seals. Plaintext is never logged.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "report.generate");
  if (!guard.ok) return guard.response;
  const { officer } = guard.context;

  if (!roleHasDefaultPermission(officer.role, "case.view")) {
    return govForbidden("PERMISSION_DENIED", "You do not have permission to perform this action.");
  }

  const body = (await req.json().catch(() => null)) as { caseId?: unknown; password?: unknown } | null;
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!caseId || !password) {
    return govJsonError(400, "BAD_REQUEST", "A case and a password are required.");
  }

  const scoped = await requireScopedCase(guard.context, caseId);
  if (isGovApiError(scoped)) return scoped;

  const policy = evaluateGovPassword(password);
  if (!policy.ok) {
    return govJsonError(400, "WEAK_PASSWORD", policy.reasons[0] ?? "The password does not meet policy.");
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

  try {
    const seal = await upsertGovReportSeal(scoped.id, await hashGovPassword(password), officer.id);
    const event = buildGovAuditEvent({ ...auditBase, action: "report.sealed", result: "allow" });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonOk({ caseId: scoped.id, sealed: true, sealedAt: seal.updatedAt });
  } catch (err) {
    if (err instanceof GovSealStoreUnavailable) {
      return govJsonError(
        503,
        "SEAL_STORE_UNAVAILABLE",
        "Report password protection is not provisioned yet. The report remains under access control.",
      );
    }
    const event = buildGovAuditEvent({ ...auditBase, action: "report.sealed", result: "error" });
    if (event) await persistGovAuditEvent(event, { swallow: true });
    return govJsonError(500, "SEAL_FAILED", "Unable to seal this report.");
  }
}

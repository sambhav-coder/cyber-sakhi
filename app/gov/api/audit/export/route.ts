import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govAuditLogs, govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { getClientIp, getUserAgent, govJsonError } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * Export the filtered audit ledger as CSV. Requires audit.export; the
 * export itself is audited (audit.exported) so ledger reads stay
 * accountable. Rows carry no payloads, tokens, or secrets by construction
 * (govAuditLogs selects curated columns only).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "audit.export");
  if (!guard.ok) return guard.response;
  const { officer } = guard.context;

  const body = (await req.json().catch(() => null)) as {
    filters?: { officerId?: unknown; action?: unknown; caseId?: unknown; outcome?: unknown; from?: unknown; to?: unknown };
  } | null;
  const f = body?.filters ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null);

  const result = await govAuditLogs({
    officerId: str(f.officerId),
    action: str(f.action),
    caseId: str(f.caseId),
    outcome: str(f.outcome),
    from: str(f.from),
    to: str(f.to),
    page: 1,
    pageSize: 5000,
  }).catch(() => null);
  if (!result) return govJsonError(500, "EXPORT_FAILED", "Unable to export audit logs.");

  const header = ["ID", "Created", "Action", "Actor type", "Officer code", "Officer role", "Case", "Outcome", "Denial reason", "Permission", "Correlation"];
  const lines = [header.map(csv).join(",")];
  for (const r of result.rows) {
    lines.push(
      [r.id, r.createdAt, r.action, r.actorType, r.officerCode, r.officerRole, r.caseId, r.outcome, r.denialReason, r.permission, r.correlationId]
        .map(csv)
        .join(","),
    );
  }

  const event = buildGovAuditEvent({
    actor: govOfficerAuditActor(officer),
    action: "audit.exported",
    permission: "audit.export",
    result: "allow",
    correlationId: crypto.randomUUID(),
    remoteIp: getClientIp(req),
    userAgent: getUserAgent(req),
    payload: { rows: result.rows.length },
  });
  if (event) await persistGovAuditEvent(event, { swallow: true });

  const filename = `cyber-sakhi-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govOfficerAuditActor } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getClientIp, getUserAgent, govJsonError, govJsonOk } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

const KEY_RE = /^[^|]{1,80}\|[^|]{1,40}\|[\s\S]{1,2048}$/;

/**
 * Analyst review ledger for external IOCs (PART 9), audit-backed.
 *
 * No new tables: a review is an append-only audit event (ml.reviewed)
 * carrying the record key. Review state is derived by reading those
 * events back. Both directions require indicator.correlate; IOC values
 * here are threat data, never victim PII.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "indicator.correlate");
  if (!guard.ok) return guard.response;
  const { data, error } = await getSupabaseServer()
    .from("audit_logs")
    .select("payload,created_at")
    .eq("action", "ml.reviewed")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return govJsonError(500, "REVIEW_READ_FAILED", "Unable to load review states.");
  const reviewed: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ payload: { record_key?: unknown } | null; created_at: string }>) {
    const k = r.payload && typeof r.payload.record_key === "string" ? r.payload.record_key : null;
    if (k && !reviewed[k]) reviewed[k] = r.created_at;
  }
  return govJsonOk({ reviewed, generatedAt: new Date().toISOString() });
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "indicator.correlate");
  if (!guard.ok) return guard.response;
  const { officer } = guard.context;
  const body = (await req.json().catch(() => null)) as { recordKey?: unknown; source?: unknown } | null;
  const recordKey = typeof body?.recordKey === "string" ? body.recordKey : "";
  const source = typeof body?.source === "string" ? body.source.slice(0, 120) : "";
  if (!recordKey || !KEY_RE.test(recordKey) || !source) {
    return govJsonError(400, "BAD_REQUEST", "A valid record key and source are required.");
  }
  const event = buildGovAuditEvent({
    actor: govOfficerAuditActor(officer),
    action: "ml.reviewed",
    permission: "indicator.correlate",
    result: "allow",
    correlationId: crypto.randomUUID(),
    remoteIp: getClientIp(req),
    userAgent: getUserAgent(req),
    payload: { record_key: recordKey, source },
  });
  if (!event) return govJsonError(500, "REVIEW_FAILED", "Unable to record review.");
  await persistGovAuditEvent(event, { swallow: true });
  return govJsonOk({ reviewed: true, recordKey, at: event.createdAt });
}

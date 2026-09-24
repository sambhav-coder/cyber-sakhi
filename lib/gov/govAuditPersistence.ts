/**
 * Government audit persistence: the database-backed GovAuditSink.
 *
 * Writes built audit events (lib/gov/govAudit.ts) into public.audit_logs
 * using the government extension columns defined by
 * supabase/migrations/gov_admin_panel_schema.sql (actor_type, actor_gov_id,
 * correlation_id, outcome, permission, pii_tier, evidence_tier, resource_*,
 * assignment_id, grant_id, approval_reference, idempotency_key).
 *
 * Policy: government events are mandatory, so the default posture is
 * fail-closed — an insert error propagates to the caller, which must refuse
 * to complete the audited operation. Callers may opt into best-effort via
 * persistGovAuditEvent({ swallow: true }) only for non-mandatory events
 * (e.g. session.rejected on an already-denied request).
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  flushGovAuditEvent,
  type GovAuditAction,
  type GovAuditEventRecord,
  type GovAuditSink,
} from "./govAudit";

/** Entities the government domain may write against audit_logs. */
export type GovAuditEntity =
  | "case"
  | "investigation"
  | "evidence"
  | "report"
  | "user"
  | "search"
  | "gov_auth"
  | "gov_session"
  | "gov_case"
  | "gov_evidence"
  | "gov_report"
  | "gov_admin"
  | "gov_grant"
  | "gov_assignment"
  | "system";

/**
 * Deterministic action → entity mapping for the widened audit_logs CHECK.
 * Kept in one place so the DB constraint and code can never drift silently.
 */
export function govAuditEntityForAction(action: GovAuditAction): GovAuditEntity {
  if (action.startsWith("assignment.")) return "gov_assignment";
  if (action.startsWith("grant.")) return "gov_grant";
  if (action.startsWith("auth.")) return "gov_auth";
  if (action.startsWith("mfa.")) return "gov_auth";
  if (action.startsWith("session.")) return "gov_session";
  if (action.startsWith("case.") || action.startsWith("pii.")) return "gov_case";
  if (action.startsWith("evidence.")) return "gov_evidence";
  if (action.startsWith("report.")) return "gov_report";
  return "gov_admin";
}

/**
 * Map a built event to the audit_logs row. Pure so the mapping is testable
 * without a database. Payloads arrive already PII-scrubbed from the builder.
 */
export function govAuditRecordToDbRow(
  event: GovAuditEventRecord,
): Record<string, unknown> {
  let actor_type: "profile" | "gov_officer" | "system" | "unknown" = "unknown";
  let actor_id: string | null = null;
  let actor_gov_id: string | null = null;
  let actor_role: string | null = null;
  let actor_snapshot: Record<string, unknown> = {};
  let system_job: string | null = null;

  switch (event.actor.kind) {
    case "gov_officer":
      actor_type = "gov_officer";
      actor_gov_id = event.actor.officerId;
      actor_role = event.actor.role;
      actor_snapshot = {
        officerCode: event.actor.officerCode,
        scope: event.actor.scope,
        stateCode: event.actor.stateCode,
        districtCode: event.actor.districtCode,
      };
      break;
    case "profile":
      actor_type = "profile";
      actor_id = event.actor.profileId;
      break;
    case "system":
      actor_type = "system";
      system_job = event.actor.job;
      actor_snapshot = { approvalRef: event.actor.approvalRef };
      break;
    case "unknown":
      actor_type = "unknown";
      actor_snapshot = { detail: event.actor.detail };
      break;
  }

  const entity = govAuditEntityForAction(event.action);

  return {
    actor_type,
    actor_id,
    actor_gov_id,
    actor_role,
    actor_snapshot,
    system_job,
    action: event.action,
    entity,
    entity_id:
      event.resourceId ?? event.caseId ?? event.assignmentId ?? event.grantId ?? null,
    case_id: event.caseId,
    remote_ip: event.remoteIp,
    user_agent: event.userAgent,
    payload: event.payload,
    redacted: event.redacted,
    outcome: event.result,
    denial_reason: event.denialReason,
    permission: event.permission,
    pii_tier: event.piiTier,
    evidence_tier: event.evidenceTier,
    resource_type: event.resourceType ?? entity,
    resource_id: event.resourceId,
    assignment_id: event.assignmentId,
    grant_id: event.grantId,
    correlation_id: event.correlationId,
    approval_reference: event.approvalRef,
    idempotency_key: event.eventId,
    created_at: event.createdAt,
  };
}

/** Persistence sink backed by getSupabaseServer() (service role). */
export const govSupabaseAuditSink: GovAuditSink = async (event) => {
  const { error } = await getSupabaseServer()
    .from("audit_logs")
    .insert(govAuditRecordToDbRow(event));
  if (error) {
    throw new Error(`Failed to persist government audit event: ${error.message}`);
  }
};

export interface GovAuditPersistOptions {
  /** Swallow a persistence failure instead of propagating (best-effort). */
  swallow?: boolean;
  onError?: (err: unknown) => void;
}

/**
 * Persist a government audit event. Fail-closed by default; opt in to
 * best-effort only for events on already-denied paths (session.rejected,
 * authorization.denied) where the denial itself is the requirement.
 */
export async function persistGovAuditEvent(
  event: GovAuditEventRecord,
  options: GovAuditPersistOptions = {},
): Promise<void> {
  try {
    await flushGovAuditEvent(event, govSupabaseAuditSink);
  } catch (err) {
    options.onError?.(err);
    if (options.swallow) return;
    throw err;
  }
}
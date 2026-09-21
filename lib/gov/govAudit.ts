/**
 * Government audit event builders (D5 audit foundation).
 *
 * Pure event catalogue + builders for authentication, session, case/PII/
 * evidence access, assignment and grant lifecycle, scope/permission/MFA
 * denials, and authorization decisions. Reuses the repository's PII
 * redaction (maskPii) with the same privacy contract as lib/audit.ts:
 * payloads never carry raw tokens, secrets, passwords, hashes, or
 * unnecessary victim PII.
 *
 * Deliberately NOT included here (pending schema approval + migration):
 * database persistence and wiring into the govAssignments/govGrants
 * database wrappers. Persistence arrives via an injectable sink so unit
 * tests never touch a database; the default sink throws loudly instead
 * of silently dropping mandatory events.
 */

import { maskPii } from "@/lib/privacy/masking";
import crypto from "node:crypto";
import type { GovEvidenceAccessTier, GovPiiTier } from "./govTypes";

/** Frozen catalogue of government audit actions. */
export const GOV_AUDIT_ACTIONS = Object.freeze([
  "assignment.created",
  "assignment.renewal_requested",
  "assignment.renewed",
  "assignment.revoked",
  "assignment.expired",
  "assignment.completed",
  "assignment.denied",
  "assignment.access_denied",
  "grant.requested",
  "grant.approved",
  "grant.rejected",
  "grant.activated",
  "grant.expired",
  "grant.revoked",
  "grant.usability_denied",
  "grant.duplicate_approval_rejected",
  "grant.self_approval_rejected",
  "grant.mfa_failed",
  "grant.quorum_failed",
  "authorization.allowed",
  "authorization.denied",
  "auth.login_succeeded",
  "auth.login_failed",
  "session.rejected",
  "session.revoked",
  "case.access_allowed",
  "case.access_denied",
  "case.updated",
  "case.note_added",
  "pii.access_allowed",
  "pii.access_denied",
  "evidence.access_allowed",
  "evidence.access_denied",
  "report.generated",
  "report.exported",
  "scope.violation",
  "permission.denied",
  "mfa.freshness_failed",
  "resource.binding_failed",
]);

export type GovAuditAction = (typeof GOV_AUDIT_ACTIONS)[number];

/** Controlled vocabulary for system-originated government audit events. */
export const GOV_SYSTEM_JOBS = Object.freeze([
  "expiry_sweeper",
  "purge_job",
  "migration",
  "system",
]);

export type GovSystemJob = (typeof GOV_SYSTEM_JOBS)[number];

export type GovAuditActor =
  | {
      kind: "gov_officer";
      officerId: string;
      officerCode: string;
      role: string;
      scope: string;
      stateCode: string | null;
      districtCode: string | null;
    }
  | { kind: "system"; job: GovSystemJob; approvalRef: string | null }
  | { kind: "profile"; profileId: string }
  | { kind: "unknown"; detail: string | null };

/** Outcome of the audited action. "error" means the operation itself failed. */
export type GovAuditOutcome = "allow" | "deny" | "error";

export interface GovAuditEventInput {
  /** Idempotency key; generated when omitted. Never reused across events. */
  eventId?: string;
  action: GovAuditAction;
  actor: GovAuditActor;
  caseId?: string | null;
  assignmentId?: string | null;
  grantId?: string | null;
  permission?: string | null;
  piiTier?: GovPiiTier | null;
  evidenceTier?: GovEvidenceAccessTier | null;
  resourceType?: string | null;
  resourceId?: string | null;
  result: GovAuditOutcome;
  denialReason?: string | null;
  correlationId: string;
  approvalRef?: string | null;
  remoteIp?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}

export interface GovAuditEventRecord {
  eventId: string;
  action: GovAuditAction;
  actor: GovAuditActor;
  caseId: string | null;
  assignmentId: string | null;
  grantId: string | null;
  permission: string | null;
  piiTier: GovPiiTier | null;
  evidenceTier: GovEvidenceAccessTier | null;
  resourceType: string | null;
  resourceId: string | null;
  result: GovAuditOutcome;
  denialReason: string | null;
  correlationId: string;
  approvalRef: string | null;
  remoteIp: string | null;
  userAgent: string | null;
  payload: Record<string, unknown>;
  redacted: boolean;
  createdAt: string;
}

/** Payload keys whose values are withheld entirely (backstop, not a permit). */
const SECRET_KEY_PATTERN = /passw|token|secret|private.?key|seed|hash|credential/i;

function scrubValue(key: string, value: unknown): { value: unknown; altered: boolean } {
  if (SECRET_KEY_PATTERN.test(key)) return { value: "[withheld]", altered: true };
  if (typeof value !== "string" || value.length === 0) return { value, altered: false };
  if (value.length > 4000) return { value: "[truncated]", altered: true };
  const masked = maskPii(value, "partial");
  if (masked.redactions.length > 0) return { value: masked.text, altered: true };
  return { value, altered: false };
}

function scrubPayload(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  altered: boolean;
} {
  let altered = false;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(payload)) {
    if (Array.isArray(raw)) {
      const items = raw.map((item) => scrubValue(key, item));
      out[key] = items.map((item) => item.value);
      if (items.some((item) => item.altered)) altered = true;
      continue;
    }
    if (raw !== null && typeof raw === "object") {
      const nested = scrubPayload(raw as Record<string, unknown>);
      out[key] = nested.payload;
      if (nested.altered) altered = true;
      continue;
    }
    const scrubbed = scrubValue(key, raw);
    out[key] = scrubbed.value;
    if (scrubbed.altered) altered = true;
  }
  return { payload: out, altered };
}

/**
 * Build a government audit event. Pure and fail-closed: unknown actions
 * yield null (mirroring buildAuditEvent), secrets are withheld, PII is
 * masked, and every record carries actor, correlation, and timestamp.
 */
export function buildGovAuditEvent(
  input: GovAuditEventInput,
  nowMs: number = Date.now(),
): GovAuditEventRecord | null {
  if (!(GOV_AUDIT_ACTIONS as readonly string[]).includes(input.action)) return null;
  if (!input.correlationId) return null;
  const scrubbed = scrubPayload(input.payload ?? {});
  return {
    eventId: input.eventId ?? crypto.randomUUID(),
    action: input.action,
    actor: input.actor,
    caseId: input.caseId ?? null,
    assignmentId: input.assignmentId ?? null,
    grantId: input.grantId ?? null,
    permission: input.permission ?? null,
    piiTier: input.piiTier ?? null,
    evidenceTier: input.evidenceTier ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    result: input.result,
    denialReason: input.denialReason ?? null,
    correlationId: input.correlationId,
    approvalRef: input.approvalRef ?? null,
    remoteIp: input.remoteIp ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    payload: scrubbed.payload,
    redacted: scrubbed.altered,
    createdAt: new Date(nowMs).toISOString(),
  };
}

export type GovAuditSink = (event: GovAuditEventRecord) => Promise<void>;

/**
 * Flush a built event through an injected sink. The default sink throws:
 * mandatory government events must never be silently dropped, and no
 * persistence backend exists until the D5/D6 audit migration is approved
 * and applied. Callers wire a real sink once it exists; until then any
 * flush attempt fails loudly at the call site, never quietly in a log.
 */
export async function flushGovAuditEvent(
  event: GovAuditEventRecord,
  sink?: GovAuditSink,
): Promise<void> {
  if (!sink) {
    throw new Error(
      "Government audit persistence is not yet implemented: provide a sink backed by the approved audit schema.",
    );
  }
  await sink(event);
}

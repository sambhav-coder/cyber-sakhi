/**
 * Government case-assignment lifecycle (Unit 4A-D, Phase F — D1 approved).
 *
 * Lifecycle only: creation, renewal-as-new-row, revocation, expiry,
 * completion, and request-time usability evaluation. Assignment-based
 * *authorization* (predicates, scope matching) belongs to Unit 4B and is
 * NOT implemented here.
 *
 * D1 policy encoded: default 30 days, absolute ceiling 90 days, shorter
 * allowed, renewal always inserts a new row with fresh reason/ticket and
 * re-approval, no reactivation or in-place extension, expiry enforced at
 * request time, suspension/deactivation and closure end access.
 *
 * Concurrency note: single-primary and no-duplicate-active rules are
 * enforced by partial unique indexes in gov_assignments_grants.sql, so
 * concurrent inserts fail closed (unique violation) instead of silently
 * overwriting. Helpers additionally pre-check to produce readable errors.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { isUniqueViolation, throwIfError } from "@/lib/db/errors";
import type { GovAssignmentStatus } from "./govTypes";
import type { GovOfficerRow } from "./govCredentials";

/** Default assignment duration: 30 days (D1 approved). */
export const GOV_ASSIGNMENT_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Absolute assignment ceiling: 90 days (D1 approved). */
export const GOV_ASSIGNMENT_MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type GovAssignmentType = "PRIMARY" | "SUPPORTING";

/** Database row shape for public.case_assignments (snake_case). */
export interface GovAssignmentRow {
  id: string;
  case_id: string;
  officer_id: string;
  assigned_by: string | null;
  assignment_type: GovAssignmentType;
  status: GovAssignmentStatus;
  reason: string;
  ticket: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  completed_at: string | null;
}

export interface GovAssignmentCreateInput {
  caseId: string;
  officerId: string;
  assignmentType: GovAssignmentType;
  reason: string;
  ticket?: string | null;
  /** Requested lifetime in ms; omitted means the 30-day default. */
  ttlMs?: number;
  assignedBy: string | null;
}

export type GovAssignmentCreateError =
  | { ok: false; reason: "ttl_exceeds_maximum" | "ttl_not_positive" | "reason_too_short" };

/**
 * Validate the requested lifetime and build the insert patch. Rejects
 * non-positive and over-ceiling TTLs; expires_at is always set (never NULL).
 */
export function buildGovAssignmentCreate(
  input: GovAssignmentCreateInput,
  nowMs: number = Date.now(),
): { ok: true; patch: Record<string, unknown> } | GovAssignmentCreateError {
  const ttlMs = input.ttlMs ?? GOV_ASSIGNMENT_DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return { ok: false, reason: "ttl_not_positive" };
  if (ttlMs > GOV_ASSIGNMENT_MAX_TTL_MS) return { ok: false, reason: "ttl_exceeds_maximum" };
  if (input.reason.trim().length < 4) return { ok: false, reason: "reason_too_short" };
  return {
    ok: true,
    patch: {
      case_id: input.caseId,
      officer_id: input.officerId,
      assigned_by: input.assignedBy,
      assignment_type: input.assignmentType,
      status: "ACTIVE",
      reason: input.reason.trim(),
      ticket: input.ticket?.trim() || null,
      expires_at: new Date(nowMs + ttlMs).toISOString(),
    },
  };
}

/**
 * Renewal builds a NEW insert patch (never mutates the old row) and always
 * requires a fresh reason and ticket plus re-approval upstream. The old row
 * must be revoked/completed separately; this builder does not touch it.
 */
export function buildGovAssignmentRenewal(
  previous: Pick<GovAssignmentRow, "case_id" | "officer_id" | "assignment_type">,
  input: { reason: string; ticket: string; ttlMs?: number; assignedBy: string | null },
  nowMs: number = Date.now(),
): { ok: true; patch: Record<string, unknown> } | GovAssignmentCreateError {
  if (!input.ticket || input.ticket.trim().length === 0) {
    return { ok: false, reason: "reason_too_short" };
  }
  return buildGovAssignmentCreate(
    {
      caseId: previous.case_id,
      officerId: previous.officer_id,
      assignmentType: previous.assignment_type,
      reason: input.reason,
      ticket: input.ticket,
      ttlMs: input.ttlMs,
      assignedBy: input.assignedBy,
    },
    nowMs,
  );
}

/** True when an ACTIVE PRIMARY already exists for the case (pre-check). */
export function hasActivePrimary(
  assignments: Array<Pick<GovAssignmentRow, "assignment_type" | "status">>,
): boolean {
  return assignments.some((a) => a.assignment_type === "PRIMARY" && a.status === "ACTIVE");
}

/** True when this officer already holds an ACTIVE row on the case. */
export function hasActiveAssignmentForOfficer(
  assignments: Array<Pick<GovAssignmentRow, "officer_id" | "status">>,
  officerId: string,
): boolean {
  return assignments.some((a) => a.officer_id === officerId && a.status === "ACTIVE");
}

export type GovAssignmentUsability =
  | { usable: true; assignment: GovAssignmentRow }
  | {
      usable: false;
      reason:
        | "not_active"
        | "expired"
        | "officer_inactive"
        | "officer_missing";
    };

/**
 * Request-time usability: status must be ACTIVE, expiry in the future, and
 * the officer present and ACTIVE (suspension/deactivation blocks even
 * unexpired rows). Stored status alone is never sufficient.
 */
export function evaluateGovAssignment(
  assignment: GovAssignmentRow,
  officer: GovOfficerRow | null,
  nowMs: number = Date.now(),
): GovAssignmentUsability {
  if (assignment.status !== "ACTIVE") return { usable: false, reason: "not_active" };
  if (new Date(assignment.expires_at).getTime() <= nowMs) {
    return { usable: false, reason: "expired" };
  }
  if (officer === null) return { usable: false, reason: "officer_missing" };
  if (officer.status !== "ACTIVE") return { usable: false, reason: "officer_inactive" };
  return { usable: true, assignment };
}

/** Patch marking a row REVOKED (old row preserved for audit). */
export function buildGovAssignmentRevocation(
  revokedBy: string | null,
  reason: string,
  nowMs: number = Date.now(),
): Record<string, unknown> {
  return {
    status: "REVOKED",
    revoked_at: new Date(nowMs).toISOString(),
    revoked_by: revokedBy,
    revoke_reason: reason,
    updated_at: new Date(nowMs).toISOString(),
  };
}

/** Patch marking rows COMPLETED on case closure (old rows preserved). */
export function buildGovAssignmentCompletion(nowMs: number = Date.now()): Record<string, unknown> {
  return {
    status: "COMPLETED",
    completed_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
  };
}

// --- Thin database wrappers (service-role; staging-tested later). ---

export async function createGovAssignment(
  input: GovAssignmentCreateInput,
): Promise<GovAssignmentRow> {
  const built = buildGovAssignmentCreate(input);
  if (!built.ok) {
    throw new Error(`Invalid assignment request: ${built.reason}.`);
  }
  const { data, error } = await getSupabaseServer()
    .from("case_assignments")
    .insert(built.patch)
    .select("*")
    .single();
  if (isUniqueViolation(error)) {
    throw new Error("Conflicting active assignment already exists for this case/officer.");
  }
  throwIfError(error, "Failed to create government assignment.");
  return data as GovAssignmentRow;
}

export async function revokeGovAssignment(
  assignmentId: string,
  revokedBy: string | null,
  reason: string,
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("case_assignments")
    .update(buildGovAssignmentRevocation(revokedBy, reason))
    .eq("id", assignmentId)
    .eq("status", "ACTIVE");
  throwIfError(error, "Failed to revoke government assignment.");
}

export async function completeCaseAssignments(caseId: string): Promise<number> {
  const { data, error } = await getSupabaseServer()
    .from("case_assignments")
    .update(buildGovAssignmentCompletion())
    .eq("case_id", caseId)
    .eq("status", "ACTIVE")
    .select("id");
  throwIfError(error, "Failed to complete government assignments.");
  return ((data as Array<{ id: string }> | null) ?? []).length;
}

export async function listActiveAssignmentsForOfficer(
  officerId: string,
): Promise<GovAssignmentRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("case_assignments")
    .select("*")
    .eq("officer_id", officerId)
    .eq("status", "ACTIVE")
    .order("expires_at", { ascending: true });
  throwIfError(error, "Failed to list government assignments.");
  return (data ?? []) as GovAssignmentRow[];
}

export async function listAssignmentsForCase(caseId: string): Promise<GovAssignmentRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("case_assignments")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to list case assignments.");
  return (data ?? []) as GovAssignmentRow[];
}

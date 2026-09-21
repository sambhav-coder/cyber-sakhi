/**
 * Government grant lifecycle (Unit 4A-D, Phase G — D2 approved).
 *
 * Lifecycle only: tier contracts, request validation, approval quorum,
 * expiry evaluation, revocation. Grants NEVER widen role, jurisdiction,
 * assignment, or scope authorization; that conjunction is enforced by Unit
 * 4B predicates, which are NOT implemented here.
 *
 * D2 policy encoded (durations in ms):
 *   Tier 1 metadata-only      72h, single approval, MFA not required.
 *   Tier 2 + masked PII       48h, single approval, fresh MFA required.
 *   Tier 3 + evidence meta    24h, dual approval,   fresh MFA required.
 *   Tier 4 full PII           12h single-operation, dual approval, fresh MFA.
 *   Tier 5 evidence content   PROPOSED duration below, single-operation,
 *                             dual approval, fresh MFA.
 * Renewal always creates a new row; no in-place extension, no reactivation.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import type { GovGrantStatus, GovPermission, GovScope } from "./govTypes";
import { roleHasDefaultPermission } from "./govPermissions";
import type { GovOfficerRow } from "./govCredentials";

const HOUR_MS = 60 * 60 * 1000;

export type GovGrantTier = 1 | 2 | 3 | 4 | 5;

export interface GovGrantTierContract {
  tier: GovGrantTier;
  maxDurationMs: number;
  dualApproval: boolean;
  mfaRequired: boolean;
  singleOperation: boolean;
}

/**
 * Tier 5 exact maximum duration is PROPOSED, not human-approved. It is
 * isolated in this named constant (instead of a literal inside the tier
 * table) so the value stays configurable and no reader mistakes it for an
 * approved default. Do not treat it as final without explicit approval.
 */
export const GOV_TIER5_MAX_DURATION_PROPOSED_MS = 4 * HOUR_MS;

/** Approval status of the Tier 5 duration value (informational contract). */
export const GOV_TIER5_DURATION_STATUS = "PROPOSED — HUMAN APPROVAL REQUIRED" as const;

/** Frozen D2 tier contracts. */
export const GOV_GRANT_TIERS: Record<GovGrantTier, GovGrantTierContract> = {
  1: { tier: 1, maxDurationMs: 72 * HOUR_MS, dualApproval: false, mfaRequired: false, singleOperation: false },
  2: { tier: 2, maxDurationMs: 48 * HOUR_MS, dualApproval: false, mfaRequired: true, singleOperation: false },
  3: { tier: 3, maxDurationMs: 24 * HOUR_MS, dualApproval: true, mfaRequired: true, singleOperation: false },
  4: { tier: 4, maxDurationMs: 12 * HOUR_MS, dualApproval: true, mfaRequired: true, singleOperation: true },
  5: { tier: 5, maxDurationMs: GOV_TIER5_MAX_DURATION_PROPOSED_MS, dualApproval: true, mfaRequired: true, singleOperation: true },
};

/** Database row shape for public.gov_grants (snake_case). */
export interface GovGrantRow {
  id: string;
  officer_id: string;
  permission: GovPermission;
  tier: GovGrantTier;
  scope: GovScope;
  state_code: string | null;
  district_code: string | null;
  case_id: string | null;
  reason: string;
  ticket: string;
  grantor_id: string | null;
  approver_id: string | null;
  second_approver_id: string | null;
  mfa_required: boolean;
  status: GovGrantStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

export interface GovGrantRequestInput {
  officerId: string;
  permission: GovPermission;
  tier: GovGrantTier;
  scope: GovScope;
  stateCode?: string | null;
  districtCode?: string | null;
  caseId: string;
  reason: string;
  ticket: string;
  durationMs?: number;
  grantorId: string | null;
  /** Role of the grantee, used to prove the grant stays within their permission set. */
  holderRole: Parameters<typeof roleHasDefaultPermission>[0];
}

export type GovGrantRequestError =
  | { ok: false; reason: "duration_exceeds_tier_max" | "duration_not_positive" | "reason_too_short" | "ticket_required" | "permission_outside_role" | "case_required" };

/**
 * Validate a grant request and build the PENDING insert patch. A grant for a
 * permission outside the holder's role defaults is rejected: grants narrow
 * context (case, time, tier), they never confer new permissions.
 */
export function buildGovGrantRequest(
  input: GovGrantRequestInput,
  nowMs: number = Date.now(),
): { ok: true; patch: Record<string, unknown> } | GovGrantRequestError {
  const contract = GOV_GRANT_TIERS[input.tier];
  const durationMs = input.durationMs ?? contract.maxDurationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: "duration_not_positive" };
  }
  if (durationMs > contract.maxDurationMs) {
    return { ok: false, reason: "duration_exceeds_tier_max" };
  }
  if (input.reason.trim().length < 4) return { ok: false, reason: "reason_too_short" };
  if (input.ticket.trim().length === 0) return { ok: false, reason: "ticket_required" };
  if (!input.caseId) return { ok: false, reason: "case_required" };
  if (!roleHasDefaultPermission(input.holderRole, input.permission)) {
    return { ok: false, reason: "permission_outside_role" };
  }
  return {
    ok: true,
    patch: {
      officer_id: input.officerId,
      permission: input.permission,
      tier: input.tier,
      scope: input.scope,
      state_code: input.stateCode ?? null,
      district_code: input.districtCode ?? null,
      case_id: input.caseId,
      reason: input.reason.trim(),
      ticket: input.ticket.trim(),
      grantor_id: input.grantorId,
      approver_id: null,
      second_approver_id: null,
      mfa_required: contract.mfaRequired,
      status: "PENDING",
      expires_at: new Date(nowMs + durationMs).toISOString(),
    },
  };
}

export interface GovGrantApprovalInput {
  approverId: string;
  secondApproverId?: string | null;
}

/**
 * Approve a PENDING grant. Dual tiers require two distinct approvers, and
 * the requester (grantor) can never approve their own request. Returns the
 * update patch; still PENDING when quorum is unmet (single approval on a
 * dual tier), ACTIVE only at quorum.
 */
export function buildGovGrantApproval(
  grant: Pick<GovGrantRow, "status" | "tier" | "grantor_id" | "approver_id" | "officer_id">,
  input: GovGrantApprovalInput,
  nowMs: number = Date.now(),
): { ok: true; patch: Record<string, unknown>; quorumMet: boolean } | { ok: false; reason: "not_pending" | "self_approval" | "duplicate_approver" } {
  if (grant.status !== "PENDING") return { ok: false, reason: "not_pending" };
  const contract = GOV_GRANT_TIERS[grant.tier];
  if (input.approverId === grant.grantor_id || input.approverId === grant.officer_id) {
    return { ok: false, reason: "self_approval" };
  }
  if (
    input.secondApproverId !== undefined &&
    input.secondApproverId !== null &&
    (input.secondApproverId === input.approverId ||
      input.secondApproverId === grant.grantor_id ||
      input.secondApproverId === grant.officer_id ||
      (grant.approver_id !== null && input.secondApproverId === grant.approver_id))
  ) {
    return { ok: false, reason: "duplicate_approver" };
  }
  const merged = grant.approver_id !== null ? [grant.approver_id, input.approverId] : [input.approverId];
  if (input.secondApproverId) merged.push(input.secondApproverId);
  const distinct = [...new Set(merged)];
  const quorumMet = contract.dualApproval ? distinct.length >= 2 : distinct.length >= 1;
  return {
    ok: true,
    patch: {
      approver_id: distinct[0] ?? null,
      second_approver_id: distinct[1] ?? null,
      status: quorumMet ? "ACTIVE" : "PENDING",
      updated_at: new Date(nowMs).toISOString(),
    },
    quorumMet,
  };
}

export type GovGrantUsability =
  | { usable: true; grant: GovGrantRow }
  | {
      usable: false;
      reason:
        | "not_active"
        | "expired"
        | "officer_inactive"
        | "officer_missing"
        | "quorum_incomplete"
        | "mfa_required";
    };

/**
 * Request-time usability: ACTIVE status, unexpired, quorum satisfied
 * (dual tiers need both approvers), officer present and ACTIVE. MFA
 * freshness itself is evaluated by the caller via isMfaFresh(); when the
 * tier requires MFA and no fresh verification is supplied, this returns
 * mfa_required. Stored status alone is never sufficient.
 */
export function evaluateGovGrant(
  grant: GovGrantRow,
  officer: GovOfficerRow | null,
  mfaFresh: boolean,
  nowMs: number = Date.now(),
): GovGrantUsability {
  if (grant.status !== "ACTIVE") return { usable: false, reason: "not_active" };
  if (new Date(grant.expires_at).getTime() <= nowMs) {
    return { usable: false, reason: "expired" };
  }
  if (officer === null) return { usable: false, reason: "officer_missing" };
  if (officer.status !== "ACTIVE") return { usable: false, reason: "officer_inactive" };
  if (GOV_GRANT_TIERS[grant.tier].dualApproval && grant.second_approver_id === null) {
    return { usable: false, reason: "quorum_incomplete" };
  }
  if (grant.mfa_required && !mfaFresh) return { usable: false, reason: "mfa_required" };
  return { usable: true, grant };
}

/** Patch revoking a grant (row preserved for audit). */
export function buildGovGrantRevocation(
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

// --- Thin database wrappers (service-role; staging-tested later). ---

export async function createGovGrant(input: GovGrantRequestInput): Promise<GovGrantRow> {
  const built = buildGovGrantRequest(input);
  if (!built.ok) throw new Error(`Invalid grant request: ${built.reason}.`);
  const { data, error } = await getSupabaseServer()
    .from("gov_grants")
    .insert(built.patch)
    .select("*")
    .single();
  throwIfError(error, "Failed to create government grant.");
  return data as GovGrantRow;
}

export async function approveGovGrant(
  grantId: string,
  input: GovGrantApprovalInput,
  current: Pick<GovGrantRow, "status" | "tier" | "grantor_id" | "approver_id" | "officer_id">,
): Promise<GovGrantRow> {
  const built = buildGovGrantApproval(current, input);
  if (!built.ok) throw new Error(`Invalid grant approval: ${built.reason}.`);
  const { data, error } = await getSupabaseServer()
    .from("gov_grants")
    .update(built.patch)
    .eq("id", grantId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error && error.code === "PGRST116") {
    throw new Error("Grant is no longer pending approval.");
  }
  throwIfError(error, "Failed to approve government grant.");
  return data as GovGrantRow;
}

export async function revokeGovGrant(
  grantId: string,
  revokedBy: string | null,
  reason: string,
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_grants")
    .update(buildGovGrantRevocation(revokedBy, reason))
    .eq("id", grantId)
    .eq("status", "ACTIVE");
  throwIfError(error, "Failed to revoke government grant.");
}

export async function listActiveGrantsForOfficer(officerId: string): Promise<GovGrantRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("gov_grants")
    .select("*")
    .eq("officer_id", officerId)
    .eq("status", "ACTIVE")
    .order("expires_at", { ascending: true });
  throwIfError(error, "Failed to list government grants.");
  return (data ?? []) as GovGrantRow[];
}

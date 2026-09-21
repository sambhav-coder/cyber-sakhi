import { describe, expect, it } from "vitest";
import type { GovOfficerRow } from "../../lib/gov/govCredentials";
import {
  GOV_GRANT_TIERS,
  GOV_TIER5_DURATION_STATUS,
  GOV_TIER5_MAX_DURATION_PROPOSED_MS,
  buildGovGrantApproval,
  buildGovGrantRequest,
  buildGovGrantRevocation,
  evaluateGovGrant,
  type GovGrantRow,
} from "../../lib/gov/govGrants";

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const iso = (ms: number): string => new Date(ms).toISOString();
const HOUR_MS = 60 * 60 * 1000;

function officer(overrides: Partial<GovOfficerRow> = {}): GovOfficerRow {
  return {
    id: "officer-1",
    officer_code: "GOV-DL-000123",
    full_name: "Test Officer",
    official_email: "officer@example.gov.in",
    official_phone: null,
    role: "INVESTIGATOR",
    status: "ACTIVE",
    department: null,
    scope: "DISTRICT",
    state_code: "DL",
    district_code: "DL-07",
    session_version: 1,
    created_at: iso(NOW - 100000),
    updated_at: iso(NOW - 100000),
    last_login_at: null,
    created_by: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    ...overrides,
  };
}

function grant(overrides: Partial<GovGrantRow> = {}): GovGrantRow {
  return {
    id: "grant-1",
    officer_id: "officer-1",
    permission: "evidence.view",
    tier: 2,
    scope: "DISTRICT",
    state_code: "DL",
    district_code: "DL-07",
    case_id: "case-1",
    reason: "Review linked evidence",
    ticket: "GT-1",
    grantor_id: "officer-9",
    approver_id: "officer-9",
    second_approver_id: null,
    mfa_required: true,
    status: "ACTIVE",
    created_at: iso(NOW - HOUR_MS),
    updated_at: iso(NOW - HOUR_MS),
    expires_at: iso(NOW + HOUR_MS),
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    ...overrides,
  };
}

describe("D2 tier contracts", () => {
  it("encodes approved durations, dual approval, and MFA rules", () => {
    expect(GOV_GRANT_TIERS[1]).toMatchObject({ maxDurationMs: 72 * HOUR_MS, dualApproval: false, mfaRequired: false });
    expect(GOV_GRANT_TIERS[2]).toMatchObject({ maxDurationMs: 48 * HOUR_MS, dualApproval: false, mfaRequired: true });
    expect(GOV_GRANT_TIERS[3]).toMatchObject({ maxDurationMs: 24 * HOUR_MS, dualApproval: true, mfaRequired: true });
    expect(GOV_GRANT_TIERS[4]).toMatchObject({ maxDurationMs: 12 * HOUR_MS, dualApproval: true, mfaRequired: true, singleOperation: true });
    expect(GOV_GRANT_TIERS[5]).toMatchObject({ maxDurationMs: GOV_TIER5_MAX_DURATION_PROPOSED_MS, dualApproval: true, mfaRequired: true, singleOperation: true });
  });

  it("marks the Tier 5 duration explicitly proposed, never approved", () => {
    expect(GOV_TIER5_DURATION_STATUS).toBe("PROPOSED — HUMAN APPROVAL REQUIRED");
    expect(GOV_GRANT_TIERS[5].maxDurationMs).toBe(GOV_TIER5_MAX_DURATION_PROPOSED_MS);
  });
});

describe("grant request validation", () => {
  function request(overrides: Record<string, unknown> = {}) {
    return {
      officerId: "officer-1",
      permission: "evidence.view" as const,
      tier: 2 as const,
      scope: "DISTRICT" as const,
      stateCode: "DL",
      districtCode: "DL-07",
      caseId: "case-1",
      reason: "Review linked evidence",
      ticket: "GT-1",
      grantorId: "officer-9",
      holderRole: "INVESTIGATOR" as const,
      ...overrides,
    };
  }

  it("builds a PENDING case-bound patch within tier limits", () => {
    const built = buildGovGrantRequest(request({ durationMs: HOUR_MS }), NOW);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.patch).toMatchObject({
        officer_id: "officer-1",
        permission: "evidence.view",
        tier: 2,
        case_id: "case-1",
        status: "PENDING",
        mfa_required: true,
        approver_id: null,
      });
      expect(built.patch["expires_at"]).toBe(iso(NOW + HOUR_MS));
    }
  });

  it("rejects over-tier durations, missing fields, and out-of-role permissions", () => {
    expect(buildGovGrantRequest(request({ durationMs: 49 * HOUR_MS }), NOW)).toEqual({
      ok: false,
      reason: "duration_exceeds_tier_max",
    });
    expect(buildGovGrantRequest(request({ reason: "x" }), NOW)).toEqual({
      ok: false,
      reason: "reason_too_short",
    });
    expect(buildGovGrantRequest(request({ ticket: " " }), NOW)).toEqual({
      ok: false,
      reason: "ticket_required",
    });
    expect(buildGovGrantRequest(request({ caseId: "" }), NOW)).toEqual({
      ok: false,
      reason: "case_required",
    });
    // INVESTIGATOR defaults lack evidence.download: grants cannot widen role permissions.
    expect(
      buildGovGrantRequest(request({ permission: "evidence.download", holderRole: "ANALYST" }), NOW),
    ).toEqual({ ok: false, reason: "permission_outside_role" });
  });
});

describe("dual approval quorum", () => {
  function pending(tier: 1 | 3 = 3) {
    return grant({ tier, status: "PENDING", approver_id: null, second_approver_id: null });
  }

  it("activates single-approval tiers with one independent approver", () => {
    const built = buildGovGrantApproval(pending(1), { approverId: "officer-7" }, NOW);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.quorumMet).toBe(true);
      expect(built.patch).toMatchObject({ approver_id: "officer-7", status: "ACTIVE" });
    }
  });

  it("keeps dual tiers pending until two distinct approvers exist", () => {
    const first = buildGovGrantApproval(pending(), { approverId: "officer-7" }, NOW);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.quorumMet).toBe(false);
      expect(first.patch["status"]).toBe("PENDING");
    }
    const second = buildGovGrantApproval(
      pending(),
      { approverId: "officer-7", secondApproverId: "officer-8" },
      NOW,
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.quorumMet).toBe(true);
      expect(second.patch["status"]).toBe("ACTIVE");
    }
  });

  it("rejects self-approval by grantor, grantee, or duplicate approvers", () => {
    expect(buildGovGrantApproval(pending(), { approverId: "officer-9" }, NOW)).toEqual({
      ok: false,
      reason: "self_approval",
    });
    expect(buildGovGrantApproval(pending(), { approverId: "officer-1" }, NOW)).toEqual({
      ok: false,
      reason: "self_approval",
    });
    expect(
      buildGovGrantApproval(pending(), { approverId: "officer-7", secondApproverId: "officer-7" }, NOW),
    ).toEqual({ ok: false, reason: "duplicate_approver" });
    expect(buildGovGrantApproval(grant(), { approverId: "officer-7" }, NOW)).toEqual({
      ok: false,
      reason: "not_pending",
    });
  });
});

describe("request-time grant usability", () => {
  it("accepts live grants with fresh MFA", () => {
    expect(evaluateGovGrant(grant(), officer(), true, NOW).usable).toBe(true);
  });

  it("denies expired, revoked, and quorum-incomplete grants", () => {
    expect(evaluateGovGrant(grant({ expires_at: iso(NOW - 1) }), officer(), true, NOW)).toEqual({
      usable: false,
      reason: "expired",
    });
    expect(evaluateGovGrant(grant({ status: "REVOKED" }), officer(), true, NOW)).toEqual({
      usable: false,
      reason: "not_active",
    });
    expect(
      evaluateGovGrant(grant({ tier: 3, second_approver_id: null }), officer(), true, NOW),
    ).toEqual({ usable: false, reason: "quorum_incomplete" });
  });

  it("denies suspended officers and stale MFA on MFA tiers", () => {
    expect(evaluateGovGrant(grant(), officer({ status: "SUSPENDED" }), true, NOW)).toEqual({
      usable: false,
      reason: "officer_inactive",
    });
    expect(evaluateGovGrant(grant(), officer(), false, NOW)).toEqual({
      usable: false,
      reason: "mfa_required",
    });
    expect(evaluateGovGrant(grant(), null, true, NOW)).toEqual({
      usable: false,
      reason: "officer_missing",
    });
  });

  it("revocation preserves the row with reason", () => {
    const patch = buildGovGrantRevocation("officer-9", "No longer needed", NOW);
    expect(patch).toMatchObject({
      status: "REVOKED",
      revoked_by: "officer-9",
      revoke_reason: "No longer needed",
      revoked_at: iso(NOW),
    });
  });
});

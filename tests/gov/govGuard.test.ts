import { describe, expect, it } from "vitest";
import { evaluateGovGuard } from "../../lib/gov/govGuard";
import type { GovSessionEvaluation } from "../../lib/gov/govSession";
import type { GovOfficerRow } from "../../lib/gov/govCredentials";

const officer: GovOfficerRow = {
  id: "off-1",
  officer_code: "GOV-00-1A",
  full_name: "Test Officer",
  official_email: "officer@gov.test",
  official_phone: null,
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  department: null,
  scope: "ALL_INDIA",
  state_code: null,
  district_code: null,
  session_version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  last_login_at: null,
  created_by: null,
  deactivated_at: null,
  deactivated_by: null,
  deactivation_reason: null,
};

function validEvaluation(): Extract<GovSessionEvaluation, { valid: true }> {
  return {
    valid: true,
    officer,
    session: {
      id: "sess-1",
      officer_id: officer.id,
      session_token_hash: "abc123",
      session_version: 1,
      mfa_level: "pwd",
      mfa_verified_at: null,
      issued_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-02T00:00:00.000Z",
      last_seen_at: "2026-01-01T00:00:00.000Z",
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      ip: null,
      user_agent: null,
    },
    refreshLastSeen: false,
    mfaFresh: false,
  };
}

describe("evaluateGovGuard", () => {
  it("allows a valid session with no required permission", () => {
    expect(evaluateGovGuard(validEvaluation(), undefined)).toEqual({ allow: true });
  });

  it("allows a valid session whose role holds the required permission", () => {
    const stateAdmin: GovOfficerRow = { ...officer, role: "STATE_ADMIN" };
    expect(evaluateGovGuard({ ...validEvaluation(), officer: stateAdmin }, "case.view")).toEqual({
      allow: true,
    });
  });

  it("denies 403 for a governance-only role requesting investigation permissions (break-glass posture)", () => {
    // Per the approved least-privilege matrix, SUPER_ADMIN is governance-only:
    // it holds officer/role/scope/audit permissions but no default case access.
    const decision = evaluateGovGuard(validEvaluation(), "case.view");
    expect(decision).toMatchObject({
      allow: false,
      status: 403,
      code: "PERMISSION_DENIED",
      reason: "permission.denied:case.view",
    });
  });

  it("denies 401 for every invalid session reason", () => {
    const reasons = [
      "not_found",
      "revoked",
      "absolute_expired",
      "idle_expired",
      "officer_missing",
      "officer_inactive",
      "version_mismatch",
    ] as const;
    for (const reason of reasons) {
      const decision = evaluateGovGuard({ valid: false, reason }, "case.view");
      expect(decision).toMatchObject({ allow: false, status: 401, code: "UNAUTHORIZED" });
    }
  });

  it("denies 403 when the role lacks the required permission", () => {
    const analyst: GovOfficerRow = { ...officer, role: "ANALYST" };
    const decision = evaluateGovGuard(
      { ...validEvaluation(), officer: analyst },
      "officer.suspend",
    );
    expect(decision).toMatchObject({
      allow: false,
      status: 403,
      code: "PERMISSION_DENIED",
      reason: "permission.denied:officer.suspend",
    });
  });

  it("does not require a permission when none is requested", () => {
    const analyst: GovOfficerRow = { ...officer, role: "ANALYST" };
    expect(evaluateGovGuard({ ...validEvaluation(), officer: analyst }, undefined)).toEqual({
      allow: true,
    });
  });

  it("denies even permission-holders when the session is invalid", () => {
    const decision = evaluateGovGuard({ valid: false, reason: "revoked" }, "case.view");
    expect(decision).toMatchObject({ status: 401 });
  });
});
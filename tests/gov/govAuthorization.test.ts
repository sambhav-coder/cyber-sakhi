import { describe, expect, it } from "vitest";
import { authorizeGovRequest, type GovAuthorizationInput } from "../../lib/gov/govAuthorization";
import type { GovOfficerContext } from "../../lib/gov/govTypes";
import type { GovOfficerRow } from "../../lib/gov/govCredentials";
import type { GovSessionEvaluation } from "../../lib/gov/govSession";
import type { GovScopeResource } from "../../lib/gov/govScope";

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const iso = (ms: number): string => new Date(ms).toISOString();
const CASE_ID = "11111111-1111-4111-8111-111111111111";

function officerRow(): GovOfficerRow {
  return {
    id: "officer-1",
    officer_code: "GOV-DL-000123",
    full_name: "Test Officer",
    official_email: "officer@example.gov.in",
    official_phone: null,
    role: "STATE_ADMIN",
    status: "ACTIVE",
    department: null,
    scope: "STATE",
    state_code: "DL",
    district_code: null,
    session_version: 3,
    created_at: iso(NOW - 100000),
    updated_at: iso(NOW - 100000),
    last_login_at: null,
    created_by: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
  };
}

function officerContext(): GovOfficerContext {
  return {
    officerId: "officer-1",
    officerCode: "GOV-DL-000123",
    role: "STATE_ADMIN",
    status: "ACTIVE",
    scope: "STATE",
    stateCode: "DL",
    districtCode: null,
    sessionVersion: 3,
  };
}

function liveSession(): GovSessionEvaluation {
  return {
    valid: true,
    officer: officerRow(),
    session: {
      id: "session-1",
      officer_id: "officer-1",
      session_token_hash: "hash",
      session_version: 3,
      mfa_level: "pwd",
      mfa_verified_at: null,
      issued_at: iso(NOW - 60000),
      expires_at: iso(NOW + 3600000),
      last_seen_at: iso(NOW - 60000),
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

function locatedCase(): GovScopeResource {
  return { id: CASE_ID, stateCode: "DL", districtCode: "DL-07", jurisdictionStatus: "located" };
}

function baseInput(overrides: Partial<GovAuthorizationInput> = {}): GovAuthorizationInput {
  return {
    session: liveSession(),
    officer: officerContext(),
    permission: "case.view",
    resourceIdMalformed: false,
    resource: locatedCase(),
    requestedPiiTier: "meta",
    requestedEvidenceTier: "none",
    mfaRequired: false,
    mfaFresh: false,
    mfaEverVerified: false,
    auditAction: "authorization.allowed",
    correlationId: "corr-auth-1",
    ...overrides,
  };
}

describe("conjunctive authorization", () => {
  it("allows when every stage passes and builds the allow audit record", () => {
    const result = authorizeGovRequest(baseInput());
    expect(result.denyReason).toBeNull();
    expect(result.decision).toMatchObject({
      allow: true,
      piiTier: "meta",
      evidenceTier: "none",
      grantId: null,
      correlationId: "corr-auth-1",
    });
    expect(result.audit).not.toBeNull();
    expect(result.audit).toMatchObject({ result: "allow", correlationId: "corr-auth-1" });
  });

  it("denies each stage in order with the safe HTTP mapping", () => {
    // Invalid session → 401.
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "not_found" } })).decision,
    ).toMatchObject({ allow: false, reason: "INVALID_SESSION", http: 401 });
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "revoked" } })).decision,
    ).toMatchObject({ allow: false, reason: "SESSION_REVOKED", http: 401 });
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "version_mismatch" } })).decision,
    ).toMatchObject({ allow: false, reason: "SESSION_VERSION_MISMATCH", http: 401 });
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "officer_inactive" } })).decision,
    ).toMatchObject({ allow: false, reason: "OFFICER_INACTIVE", http: 403 });
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "absolute_expired" } })).decision,
    ).toMatchObject({ allow: false, reason: "INVALID_SESSION", http: 401 });
    expect(
      authorizeGovRequest(baseInput({ session: { valid: false, reason: "idle_expired" } })).decision,
    ).toMatchObject({ allow: false, reason: "INVALID_SESSION", http: 401 });
    // Break-glass has no approved workflow → deny even for holders.
    expect(
      authorizeGovRequest(baseInput({ permission: "break_glass.request" })).decision,
    ).toMatchObject({ allow: false, reason: "BREAK_GLASS_REQUIRED", http: 403 });
    // Missing catalogue permission → 403.
    expect(
      authorizeGovRequest(baseInput({ permission: "audit.export" })).decision,
    ).toMatchObject({ allow: false, reason: "PERMISSION_MISSING", http: 403 });
    // Malformed ID → 422; missing or out-of-scope → uniform 404.
    expect(authorizeGovRequest(baseInput({ resourceIdMalformed: true })).decision).toMatchObject({
      allow: false,
      reason: "MALFORMED_REQUEST",
      http: 422,
    });
    expect(authorizeGovRequest(baseInput({ resource: null })).decision).toMatchObject({
      allow: false,
      reason: "RESOURCE_NOT_FOUND",
      http: 404,
    });
    expect(
      authorizeGovRequest(
        baseInput({ resource: { ...locatedCase(), stateCode: "MH", districtCode: "MH-01" } }),
      ).decision,
    ).toMatchObject({ allow: false, reason: "RESOURCE_OUT_OF_SCOPE", http: 404 });
    expect(
      authorizeGovRequest(
        baseInput({
          resource: { ...locatedCase(), stateCode: null, districtCode: null, jurisdictionStatus: "unlocated" },
        }),
      ).decision,
    ).toMatchObject({ allow: false, reason: "JURISDICTION_MISSING", http: 404 });
    // Missing and out-of-scope share status and shape (no oracle).
    const missing = authorizeGovRequest(baseInput({ resource: null })).decision;
    const outOfScope = authorizeGovRequest(
      baseInput({ resource: { ...locatedCase(), stateCode: "MH" } }),
    ).decision;
    expect(missing).toMatchObject({ allow: false, http: 404 });
    expect(outOfScope).toMatchObject({ allow: false, http: 404 });
  });

  it("denies tiers beyond catalogue capability and stale MFA", () => {
    // ANALYST holds case.view_meta/evidence.view but neither case.view_pii
    // nor evidence.view_content/download, isolating the tier denial.
    const analyst: GovOfficerContext = {
      ...officerContext(),
      role: "ANALYST",
      scope: "ALL_INDIA",
      stateCode: null,
    };
    expect(
      authorizeGovRequest(
        baseInput({ officer: analyst, permission: "case.view_meta", requestedPiiTier: "full" }),
      ).decision,
    ).toMatchObject({ allow: false, reason: "TIER_NOT_ALLOWED", http: 403 });
    expect(
      authorizeGovRequest(
        baseInput({
          officer: analyst,
          permission: "evidence.view",
          requestedEvidenceTier: "download",
        }),
      ).decision,
    ).toMatchObject({ allow: false, reason: "TIER_NOT_ALLOWED", http: 403 });
    expect(
      authorizeGovRequest(baseInput({ mfaRequired: true, mfaEverVerified: false })).decision,
    ).toMatchObject({ allow: false, reason: "MFA_REQUIRED", http: 403 });
    expect(
      authorizeGovRequest(baseInput({ mfaRequired: true, mfaEverVerified: true })).decision,
    ).toMatchObject({ allow: false, reason: "MFA_STALE", http: 403 });
    expect(
      authorizeGovRequest(baseInput({ mfaRequired: true, mfaFresh: true, mfaEverVerified: true })).decision,
    ).toMatchObject({ allow: true });
  });

  it("builds a deny audit record on every denial", () => {
    const result = authorizeGovRequest(baseInput({ permission: "audit.export" }));
    expect(result.denyReason).toBe("PERMISSION_MISSING");
    expect(result.audit).toMatchObject({
      result: "deny",
      denialReason: "PERMISSION_MISSING",
      permission: "audit.export",
      caseId: CASE_ID,
      correlationId: "corr-auth-1",
    });
    expect(JSON.stringify(result.audit)).not.toMatch(/password|token|secret|hash/i);
  });

  it("routes assignment and grant scope outcomes to safe reasons", () => {
    const investigator: GovOfficerContext = {
      ...officerContext(),
      role: "INVESTIGATOR",
      scope: "ASSIGNED_CASES",
      stateCode: null,
    };
    expect(
      authorizeGovRequest(
        baseInput({
          officer: investigator,
          permission: "case.view",
          assignment: { state: "missing" },
        }),
      ).decision,
    ).toMatchObject({ allow: false, reason: "ASSIGNMENT_REQUIRED", http: 403 });
    expect(
      authorizeGovRequest(
        baseInput({
          assignment: { state: "valid" },
          officer: investigator,
        }),
      ).decision,
    ).toMatchObject({ allow: true });
  });
});

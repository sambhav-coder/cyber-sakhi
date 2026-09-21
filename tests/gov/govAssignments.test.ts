import { describe, expect, it } from "vitest";
import type { GovOfficerRow } from "../../lib/gov/govCredentials";
import {
  GOV_ASSIGNMENT_DEFAULT_TTL_MS,
  GOV_ASSIGNMENT_MAX_TTL_MS,
  buildGovAssignmentCompletion,
  buildGovAssignmentCreate,
  buildGovAssignmentRenewal,
  buildGovAssignmentRevocation,
  evaluateGovAssignment,
  hasActiveAssignmentForOfficer,
  hasActivePrimary,
  type GovAssignmentRow,
} from "../../lib/gov/govAssignments";

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const iso = (ms: number): string => new Date(ms).toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

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

function assignment(overrides: Partial<GovAssignmentRow> = {}): GovAssignmentRow {
  return {
    id: "assignment-1",
    case_id: "case-1",
    officer_id: "officer-1",
    assigned_by: "officer-9",
    assignment_type: "PRIMARY",
    status: "ACTIVE",
    reason: "Lead investigator for this case",
    ticket: "T-1",
    created_at: iso(NOW - DAY_MS),
    updated_at: iso(NOW - DAY_MS),
    expires_at: iso(NOW + 10 * DAY_MS),
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    completed_at: null,
    ...overrides,
  };
}

describe("assignment TTL policy (D1)", () => {
  it("encodes the approved 30-day default and 90-day ceiling", () => {
    expect(GOV_ASSIGNMENT_DEFAULT_TTL_MS).toBe(30 * DAY_MS);
    expect(GOV_ASSIGNMENT_MAX_TTL_MS).toBe(90 * DAY_MS);
  });

  it("defaults to 30 days and always sets expires_at", () => {
    const built = buildGovAssignmentCreate(
      {
        caseId: "case-1",
        officerId: "officer-1",
        assignmentType: "PRIMARY",
        reason: "Lead investigator",
        assignedBy: "officer-9",
      },
      NOW,
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.patch["expires_at"]).toBe(iso(NOW + 30 * DAY_MS));
      expect(built.patch["status"]).toBe("ACTIVE");
    }
  });

  it("accepts shorter durations and rejects over-ceiling or non-positive TTLs", () => {
    const short = buildGovAssignmentCreate(
      {
        caseId: "c",
        officerId: "o",
        assignmentType: "SUPPORTING",
        reason: "Short task",
        ttlMs: 7 * DAY_MS,
        assignedBy: null,
      },
      NOW,
    );
    expect(short.ok).toBe(true);
    expect(buildGovAssignmentCreate(
      {
        caseId: "c",
        officerId: "o",
        assignmentType: "SUPPORTING",
        reason: "Too long",
        ttlMs: 91 * DAY_MS,
        assignedBy: null,
      },
      NOW,
    )).toEqual({ ok: false, reason: "ttl_exceeds_maximum" });
    expect(buildGovAssignmentCreate(
      {
        caseId: "c",
        officerId: "o",
        assignmentType: "SUPPORTING",
        reason: "Zero",
        ttlMs: 0,
        assignedBy: null,
      },
      NOW,
    )).toEqual({ ok: false, reason: "ttl_not_positive" });
  });

  it("rejects missing reasons", () => {
    const built = buildGovAssignmentCreate(
      { caseId: "c", officerId: "o", assignmentType: "PRIMARY", reason: "  ", assignedBy: null },
      NOW,
    );
    expect(built).toEqual({ ok: false, reason: "reason_too_short" });
  });
});

describe("renewal without extension", () => {
  it("builds a new patch requiring fresh reason and ticket", () => {
    const built = buildGovAssignmentRenewal(
      assignment(),
      { reason: "Continued investigation", ticket: "T-2", assignedBy: "officer-9" },
      NOW,
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.patch["reason"]).toBe("Continued investigation");
      expect(built.patch["ticket"]).toBe("T-2");
      expect(built.patch["status"]).toBe("ACTIVE");
      expect(built.patch).not.toHaveProperty("id");
    }
  });

  it("refuses renewal without a fresh ticket", () => {
    expect(
      buildGovAssignmentRenewal(assignment(), { reason: "Still needed", ticket: "  ", assignedBy: null }, NOW),
    ).toEqual({ ok: false, reason: "reason_too_short" });
  });
});

describe("request-time usability", () => {
  it("accepts live assignments", () => {
    const result = evaluateGovAssignment(assignment(), officer(), NOW);
    expect(result.usable).toBe(true);
  });

  it("denies non-active statuses without reactivation", () => {
    for (const status of ["REVOKED", "EXPIRED", "COMPLETED"] as const) {
      expect(evaluateGovAssignment(assignment({ status }), officer(), NOW)).toEqual({
        usable: false,
        reason: "not_active",
      });
    }
  });

  it("denies expired assignments even with ACTIVE status", () => {
    expect(
      evaluateGovAssignment(assignment({ expires_at: iso(NOW - 1) }), officer(), NOW),
    ).toEqual({ usable: false, reason: "expired" });
  });

  it("denies suspended officers and missing officers", () => {
    expect(
      evaluateGovAssignment(assignment(), officer({ status: "SUSPENDED" }), NOW),
    ).toEqual({ usable: false, reason: "officer_inactive" });
    expect(evaluateGovAssignment(assignment(), null, NOW)).toEqual({
      usable: false,
      reason: "officer_missing",
    });
  });
});

describe("uniqueness pre-checks", () => {
  it("detects an existing active primary and duplicate officer rows", () => {
    expect(hasActivePrimary([assignment()])).toBe(true);
    expect(
      hasActivePrimary([assignment({ status: "REVOKED" }), assignment({ assignment_type: "SUPPORTING" })]),
    ).toBe(false);
    expect(hasActiveAssignmentForOfficer([assignment()], "officer-1")).toBe(true);
    expect(hasActiveAssignmentForOfficer([assignment()], "officer-2")).toBe(false);
  });
});

describe("revocation and completion patches", () => {
  it("preserves history rows with reasons and timestamps", () => {
    const revocation = buildGovAssignmentRevocation("officer-9", "Reassigned", NOW);
    expect(revocation).toMatchObject({
      status: "REVOKED",
      revoked_by: "officer-9",
      revoke_reason: "Reassigned",
      revoked_at: iso(NOW),
    });
    const completion = buildGovAssignmentCompletion(NOW);
    expect(completion).toMatchObject({ status: "COMPLETED", completed_at: iso(NOW) });
    expect(JSON.stringify({ revocation, completion })).not.toMatch(/password|hash|token/i);
  });
});

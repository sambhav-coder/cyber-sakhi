import { describe, expect, it } from "vitest";
import {
  GOV_AUDIT_ACTIONS,
  GOV_SYSTEM_JOBS,
  buildGovAuditEvent,
  flushGovAuditEvent,
  type GovAuditActor,
  type GovAuditEventRecord,
} from "../../lib/gov/govAudit";

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const iso = (ms: number): string => new Date(ms).toISOString();

const OFFICER: GovAuditActor = {
  kind: "gov_officer",
  officerId: "officer-1",
  officerCode: "GOV-DL-000123",
  role: "STATE_ADMIN",
  scope: "STATE",
  stateCode: "DL",
  districtCode: null,
};

const EXPECTED_ACTIONS = [
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
  "auth.user_id_requested",
  "auth.password_reset_requested",
  "auth.password_reset_completed",
  "auth.password_reset_failed",
  "mfa.enroll_started",
  "mfa.enrolled",
  "mfa.enroll_failed",
  "mfa.recovery_used",
  "mfa.recovery_failed",
  "session.rejected",
  "session.revoked",
  "case.access_allowed",
  "case.access_denied",
  "pii.access_allowed",
  "pii.access_denied",
  "evidence.access_allowed",
  "evidence.access_denied",
  "scope.violation",
  "permission.denied",
  "mfa.freshness_failed",
  "resource.binding_failed",
  "case.updated",
  "case.note_added",
  "report.generated",
  "report.exported",
];

describe("government audit catalogue", () => {
  it("covers the full assignment and grant lifecycle exactly", () => {
    expect([...GOV_AUDIT_ACTIONS].sort()).toEqual([...EXPECTED_ACTIONS].sort());
    expect(new Set(GOV_AUDIT_ACTIONS).size).toBe(EXPECTED_ACTIONS.length);
    expect(Object.isFrozen(GOV_AUDIT_ACTIONS)).toBe(true);
  });

  it("rejects unknown actions instead of recording them", () => {
    expect(
      buildGovAuditEvent(
        {
          action: "case.viewed" as never,
          actor: OFFICER,
          result: "allow",
          correlationId: "corr-1",
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("uses a controlled system-job vocabulary", () => {
    expect([...GOV_SYSTEM_JOBS]).toContain("expiry_sweeper");
    expect(Object.isFrozen(GOV_SYSTEM_JOBS)).toBe(true);
  });
});

describe("government audit event building", () => {
  it("records actor, resource, tier, approval, and correlation context", () => {
    const event = buildGovAuditEvent(
      {
        action: "grant.approved",
        actor: OFFICER,
        caseId: "case-1",
        grantId: "grant-1",
        permission: "evidence.view",
        piiTier: "masked",
        evidenceTier: "metadata",
        result: "allow",
        correlationId: "corr-9",
        approvalRef: "officer-7/officer-8",
        payload: { ticket: "GT-1" },
      },
      NOW,
    );
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      action: "grant.approved",
      caseId: "case-1",
      grantId: "grant-1",
      permission: "evidence.view",
      result: "allow",
      denialReason: null,
      correlationId: "corr-9",
      approvalRef: "officer-7/officer-8",
      createdAt: iso(NOW),
    });
    expect(event?.actor).toEqual(OFFICER);
  });

  it("records denial reasons on denied events", () => {
    const event = buildGovAuditEvent(
      {
        action: "grant.self_approval_rejected",
        actor: OFFICER,
        grantId: "grant-2",
        result: "deny",
        denialReason: "self_approval",
        correlationId: "corr-3",
      },
      NOW,
    );
    expect(event?.result).toBe("deny");
    expect(event?.denialReason).toBe("self_approval");
  });

  it("withholds secrets and masks PII without logging raw values", () => {
    const event = buildGovAuditEvent(
      {
        action: "assignment.created",
        actor: OFFICER,
        caseId: "case-1",
        assignmentId: "assignment-1",
        result: "allow",
        correlationId: "corr-4",
        payload: {
          password: "hunter2",
          session_token: "raw-token-value",
          password_hash: "hash-value",
          reason: "Review for officer jane@example.com call 9876543210",
        },
      },
      NOW,
    );
    expect(event?.redacted).toBe(true);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("raw-token-value");
    expect(serialized).not.toContain("hash-value");
    expect(serialized).not.toContain("jane@example.com");
    expect(serialized).not.toContain("9876543210");
    expect(event?.payload["password"]).toBe("[withheld]");
  });

  it("supports system actors with approval references", () => {
    const event = buildGovAuditEvent(
      {
        action: "assignment.expired",
        actor: { kind: "system", job: "expiry_sweeper", approvalRef: null },
        assignmentId: "assignment-9",
        result: "allow",
        correlationId: "corr-5",
      },
      NOW,
    );
    expect(event?.actor).toEqual({ kind: "system", job: "expiry_sweeper", approvalRef: null });
  });

  it("produces JSON-serializable records", () => {
    const event = buildGovAuditEvent(
      { action: "grant.revoked", actor: OFFICER, result: "allow", correlationId: "c" },
      NOW,
    ) as GovAuditEventRecord;
    expect(() => JSON.stringify(event)).not.toThrow();
    expect(JSON.parse(JSON.stringify(event))).toMatchObject({ action: "grant.revoked" });
  });

  it("assigns idempotency keys and carries resource linkage", () => {
    const first = buildGovAuditEvent(
      {
        action: "case.access_denied",
        actor: OFFICER,
        caseId: "case-1",
        resourceType: "case",
        resourceId: "case-1",
        result: "deny",
        denialReason: "RESOURCE_OUT_OF_SCOPE",
        correlationId: "corr-6",
      },
      NOW,
    );
    const second = buildGovAuditEvent(
      {
        action: "case.access_denied",
        actor: OFFICER,
        caseId: "case-1",
        result: "deny",
        correlationId: "corr-6",
      },
      NOW,
    );
    expect(first?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second?.eventId).not.toBe(first?.eventId);
    expect(first?.resourceType).toBe("case");
    const explicit = buildGovAuditEvent(
      {
        eventId: "01J0000000000000000000001",
        action: "evidence.access_allowed",
        actor: OFFICER,
        result: "allow",
        correlationId: "corr-6",
      },
      NOW,
    );
    expect(explicit?.eventId).toBe("01J0000000000000000000001");
  });

  it("supports profile, unknown, and error-outcome events", () => {
    const profileEvent = buildGovAuditEvent(
      {
        action: "auth.login_failed",
        actor: { kind: "profile", profileId: "user-1" },
        result: "deny",
        correlationId: "corr-7",
      },
      NOW,
    );
    expect(profileEvent?.actor).toEqual({ kind: "profile", profileId: "user-1" });
    const unknownEvent = buildGovAuditEvent(
      {
        action: "session.rejected",
        actor: { kind: "unknown", detail: "pre-migration row" },
        result: "error",
        denialReason: "sink_unavailable",
        correlationId: "corr-7",
      },
      NOW,
    );
    expect(unknownEvent?.result).toBe("error");
    expect(unknownEvent?.actor).toEqual({ kind: "unknown", detail: "pre-migration row" });
  });

  it("rejects events without a correlation ID and caps user agents", () => {
    expect(
      buildGovAuditEvent(
        { action: "grant.approved", actor: OFFICER, result: "allow", correlationId: "" },
        NOW,
      ),
    ).toBeNull();
    const event = buildGovAuditEvent(
      {
        action: "auth.login_succeeded",
        actor: OFFICER,
        result: "allow",
        correlationId: "corr-8",
        remoteIp: "203.0.113.7",
        userAgent: "x".repeat(500),
      },
      NOW,
    );
    expect(event?.remoteIp).toBe("203.0.113.7");
    expect(event?.userAgent).toHaveLength(300);
  });
});

describe("government audit flush seam", () => {
  function sample(): GovAuditEventRecord {
    const event = buildGovAuditEvent(
      { action: "grant.revoked", actor: OFFICER, result: "allow", correlationId: "c" },
      NOW,
    );
    if (!event) throw new Error("fixture event must build");
    return event;
  }

  it("fails loudly without a sink instead of dropping mandatory events", async () => {
    await expect(flushGovAuditEvent(sample())).rejects.toThrow(
      /persistence is not yet implemented/,
    );
  });

  it("delivers each event to the injected sink exactly once", async () => {
    const seen: GovAuditEventRecord[] = [];
    const event = sample();
    await flushGovAuditEvent(event, (e) => {
      seen.push(e);
      return Promise.resolve();
    });
    expect(seen).toEqual([event]);
  });

  it("propagates sink failures instead of swallowing them", async () => {
    await expect(
      flushGovAuditEvent(sample(), () => Promise.reject(new Error("sink down"))),
    ).rejects.toThrow("sink down");
  });
});

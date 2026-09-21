import { describe, expect, it } from "vitest";
import {
  govAuditEntityForAction,
  govAuditRecordToDbRow,
} from "../../lib/gov/govAuditPersistence";
import { buildGovAuditEvent } from "../../lib/gov/govAudit";

describe("govAuditEntityForAction", () => {
  it("maps action families to entities inside the widened CHECK", () => {
    expect(govAuditEntityForAction("assignment.created")).toBe("gov_assignment");
    expect(govAuditEntityForAction("grant.approved")).toBe("gov_grant");
    expect(govAuditEntityForAction("auth.login_succeeded")).toBe("gov_auth");
    expect(govAuditEntityForAction("session.rejected")).toBe("gov_session");
    expect(govAuditEntityForAction("case.access_denied")).toBe("gov_case");
    expect(govAuditEntityForAction("pii.access_allowed")).toBe("gov_case");
    expect(govAuditEntityForAction("evidence.access_allowed")).toBe("gov_evidence");
    expect(govAuditEntityForAction("authorization.denied")).toBe("gov_admin");
    expect(govAuditEntityForAction("permission.denied")).toBe("gov_admin");
    expect(govAuditEntityForAction("scope.violation")).toBe("gov_admin");
  });
});

describe("govAuditRecordToDbRow", () => {
  it("maps a gov_officer login event with all linkage columns", () => {
    const event = buildGovAuditEvent(
      {
        action: "auth.login_succeeded",
        actor: {
          kind: "gov_officer",
          officerId: "officer-1",
          officerCode: "GOV-00-ABCD",
          role: "SUPER_ADMIN",
          scope: "ALL_INDIA",
          stateCode: null,
          districtCode: null,
        },
        result: "allow",
        correlationId: "corr-1",
        remoteIp: "203.0.113.9",
        userAgent: "test-agent",
      },
      1_700_000_000_000,
    )!;

    const row = govAuditRecordToDbRow(event);
    expect(row.actor_type).toBe("gov_officer");
    expect(row.actor_gov_id).toBe("officer-1");
    expect(row.actor_role).toBe("SUPER_ADMIN");
    expect(row.entity).toBe("gov_auth");
    expect(row.action).toBe("auth.login_succeeded");
    expect(row.outcome).toBe("allow");
    expect(row.correlation_id).toBe("corr-1");
    expect(row.idempotency_key).toBe(event.eventId);
    expect(row.created_at).toBe("2023-11-14T22:13:20.000Z");
    expect(row.actor_snapshot).toEqual({
      officerCode: "GOV-00-ABCD",
      scope: "ALL_INDIA",
      stateCode: null,
      districtCode: null,
    });
  });

  it("maps a system expiry-sweeper event to the system entity", () => {
    const event = buildGovAuditEvent(
      {
        action: "assignment.expired",
        actor: { kind: "system", job: "expiry_sweeper", approvalRef: null },
        result: "allow",
        correlationId: "corr-2",
      },
    )!;
    const row = govAuditRecordToDbRow(event);
    expect(row.actor_type).toBe("system");
    expect(row.system_job).toBe("expiry_sweeper");
    expect(row.actor_gov_id).toBeNull();
    expect(row.entity).toBe("gov_assignment");
    expect(row.actor_snapshot).toEqual({ approvalRef: null });
  });

  it("maps an evidence access event and fills resource columns", () => {
    const event = buildGovAuditEvent(
      {
        action: "evidence.access_allowed",
        actor: {
          kind: "gov_officer",
          officerId: "officer-2",
          officerCode: "GOV-01-XYZ",
          role: "INVESTIGATOR",
          scope: "DISTRICT",
          stateCode: "28",
          districtCode: "2801",
        },
        caseId: "case-uuid",
        evidenceTier: "content",
        resourceType: "evidence",
        resourceId: "evidence-uuid",
        result: "allow",
        correlationId: "corr-3",
      },
    )!;
    const row = govAuditRecordToDbRow(event);
    expect(row.entity).toBe("gov_evidence");
    expect(row.entity_id).toBe("evidence-uuid");
    expect(row.case_id).toBe("case-uuid");
    expect(row.resource_type).toBe("evidence");
    expect(row.resource_id).toBe("evidence-uuid");
    expect(row.evidence_tier).toBe("content");
  });

  it("withholds secret-bearing payload keys via the builder", () => {
    const event = buildGovAuditEvent(
      {
        action: "authorization.denied",
        actor: { kind: "unknown", detail: null },
        result: "deny",
        denialReason: "no_permission",
        permission: "case.view",
        correlationId: "corr-4",
        payload: { password: "hunter2", note: "safe text" },
      },
    )!;
    const row = govAuditRecordToDbRow(event);
    expect((row.payload as Record<string, unknown>).password).toBe("[withheld]");
    expect((row.payload as Record<string, unknown>).note).toBe("safe text");
    expect(row.permission).toBe("case.view");
    expect(row.actor_type).toBe("unknown");
  });
});
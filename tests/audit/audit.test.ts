import { describe, expect, it } from "vitest";
import { buildAuditEvent, AUDIT_ACTIONS } from "../../lib/audit";

describe("buildAuditEvent", () => {
  const base = {
    actorId: "u1",
    action: "case.searched",
    entity: "search" as const,
  };

  it("rejects unknown actions", () => {
    expect(buildAuditEvent({ ...base, action: "delete.everything" })).toBeNull();
  });

  it("redacts classic PII keys entirely", () => {
    const evt = buildAuditEvent({
      ...base,
      payload: { email: "jane@example.com", phone: "+91 9876543210", note: "ok" },
    });
    expect(evt).not.toBeNull();
    expect(evt!.payload.email).toBe("[redacted]");
    expect(evt!.payload.phone).toBe("[redacted]");
    expect(evt!.payload.note).toBe("ok");
    expect(evt!.redacted).toBe(true);
  });

  it("masks PII hidden inside free-text values", () => {
    const evt = buildAuditEvent({
      ...base,
      payload: { subject: "Re: invoice, call 9876543210 now" },
    });
    expect(evt).not.toBeNull();
    expect(evt!.payload.subject).not.toContain("9876543210");
    expect(evt!.redacted).toBe(true);
  });

  it("recognizes a live action vocabulary", () => {
    for (const a of ["case.created", "evidence.locked", "report.exported"]) {
      expect(AUDIT_ACTIONS.has(a)).toBe(true);
    }
  });

  it("caps user-agent length and truncates oversized text", () => {
    const evt = buildAuditEvent({
      ...base,
      userAgent: "x".repeat(500),
      payload: { big: "y".repeat(5000) },
    });
    expect(evt!.user_agent).toHaveLength(300);
    expect(evt!.payload.big).toBe("[truncated]");
  });
});
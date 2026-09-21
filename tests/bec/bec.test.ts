import { describe, expect, it } from "vitest";
import { analyzeBec } from "../../lib/bec/bec";

describe("analyzeBec", () => {
  it("detects a classic finance-urgency BEC email", () => {
    const r = analyzeBec(
      "URGENT: Payment correction",
      "Hi, I'm tied up in meetings all day. Please wire the outstanding invoice to our new "
        + "account immediately and keep this confidential between us. Confirm the transfer asap.",
      { fromDomain: "ceo-desk.example.com" }
    );
    expect(r.detected).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.patterns.some((p) => p.id === "bec_money_request")).toBe(true);
    expect(r.patterns.some((p) => p.id === "bec_offline_excuse")).toBe(true);
  });

  it("does not fire on ordinary meeting minutes", () => {
    const r = analyzeBec(
      "Meeting minutes",
      "Thanks for attending. We will share the minutes and the next sprint plan by Friday. Regards, team."
    );
    expect(r.detected).toBe(false);
    expect(r.score).toBeLessThan(40);
    expect(r.patterns.length).toBe(0);
  });

  it("flags Reply-To redirect toward an external mailbox", () => {
    const r = analyzeBec(
      "Invoice follow-up",
      "Please confirm the payment details change and transfer the amount.",
      {
        fromDomain: "vendor.example.com",
        replyToDomain: "getmoneynotnow.net",
      }
    );
    expect(r.patterns.some((p) => p.id === "bec_replyto_mismatch")).toBe(true);
  });

  it("detects credential/W-2 solicitation", () => {
    const r = analyzeBec(
      "HR: update your payroll file",
      "As CFO I need your W-2 and login credentials right away, don't share it with anyone.",
      { fromDomain: "hr.example.com" }
    );
    expect(r.patterns.some((p) => p.id === "bec_credential_solicitation")).toBe(true);
  });

  it("reports a honest caveat and derived confidence", () => {
    const r = analyzeBec(null, "Please buy gift cards urgently and send me the codes.");
    expect(r.caveat).toContain("no corporate directory");
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
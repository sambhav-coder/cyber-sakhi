import { describe, expect, it } from "vitest";
import { maskPii, retentionStageFor, defaultRetentionPolicy } from "../../lib/privacy/masking";

describe("maskPii", () => {
  it("masks an email address but keeps the domain", () => {
    const r = maskPii("Contact jane29doe@example.com today");
    expect(r.text).toContain("ja*******@example.com");
    expect(r.text).not.toContain("jane29doe@example.com");
    expect(r.redactions.some((x) => x.type === "email" && x.count === 1)).toBe(true);
  });

  it("masks a mobile number keeping only the last 4 digits", () => {
    const r = maskPii("Call +91 9876543210 immediately");
    expect(r.text).toContain("+91 •••••• 3210");
    expect(r.text).not.toContain("9876543210");
  });

  it("fully redacts PAN and Aadhaar forms", () => {
    const r = maskPii("PAN: ABCDE1234F Aadhaar: 2345 6789 0123");
    expect(r.text).toContain("[redacted-pan]");
    expect(r.text).toContain("[redacted-aadhaar]");
    expect(r.text).not.toContain("ABCDE1234F");
    expect(r.text).not.toContain("2345 6789 0123");
  });

  it("redacts OTP-prefixed digits", () => {
    const r = maskPii("Your one time password is 482913");
    expect(r.text).not.toContain("482913");
  });

  it("redacts long account-like digit runs keeping the last 4", () => {
    const r = maskPii("Account 1234567890123 (HDFC)");
    expect(r.text).toContain("•••• 0123");
    expect(r.text).not.toContain("1234567890123");
  });

  it("correctly classifies 12-digit numbers in account context as account, not Aadhaar", () => {
    const r = maskPii("Account: 987654321012");
    expect(r.text).toContain("•••• 1012");
    expect(r.text).not.toContain("987654321012");
    expect(r.redactions.some((x) => x.type === "account" && x.count === 1)).toBe(true);
    expect(r.redactions.some((x) => x.type === "aadhaar")).toBe(false);
  });

  it("full mode removes emails entirely", () => {
    const r = maskPii("a@b.com", "full");
    expect(r.text).toContain("[redacted-email]");
  });
});

describe("retentionStageFor", () => {
  const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("stages evidence accurately across the window", () => {
    expect(retentionStageFor(past(50), "evidence", defaultRetentionPolicy).stage).toBe("active");
    expect(retentionStageFor(past(300), "evidence", defaultRetentionPolicy).stage).toBe("review");
    expect(retentionStageFor(past(350), "evidence", defaultRetentionPolicy).stage).toBe("expiring");
    expect(retentionStageFor(past(400), "evidence", defaultRetentionPolicy).stage).toBe("expired");
  });

  it("handles invalid timestamps gracefully", () => {
    expect(retentionStageFor("not-a-date", "evidence").daysRemaining).toBeNull();
  });
});
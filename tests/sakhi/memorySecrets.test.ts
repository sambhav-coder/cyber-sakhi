import { describe, expect, it } from "vitest";
import { isForbiddenMemoryContent } from "../../lib/db/sakhiMemory";

describe("isForbiddenMemoryContent — no secrets stored in memory", () => {
  it("rejects secret-looking keys", () => {
    for (const key of [
      "user.password",
      "sakhi.authToken",
      "api_key",
      "private-key",
      "wallet.recovery_code",
      "bank.otp",
      "sakhi.credential",
      "email.passwd",
    ]) {
      expect(isForbiddenMemoryContent(key, "anything"), key).toBe(true);
    }
  });

  it("rejects values that assign a secret label", () => {
    expect(isForbiddenMemoryContent("sakhi.note", "password=Hunter2")).toBe(true);
    expect(isForbiddenMemoryContent("sakhi.note", "OTP: 123456")).toBe(true);
    expect(isForbiddenMemoryContent("sakhi.note", "api_key = a1b2c3")).toBe(true);
  });

  it("accepts normal preference, pin and language memory", () => {
    expect(isForbiddenMemoryContent("sakhi.language", "hi")).toBe(false);
    expect(isForbiddenMemoryContent("sakhi.language", "hinglish")).toBe(false);
    expect(isForbiddenMemoryContent("sakhi.preferred_safety_topics", "fraud")).toBe(false);
    expect(isForbiddenMemoryContent("convo.pinned.abc-123", "1")).toBe(false);
  });
});
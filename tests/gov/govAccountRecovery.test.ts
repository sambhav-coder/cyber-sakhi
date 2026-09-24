import { describe, expect, it } from "vitest";
import {
  generateGovResetToken,
  GOV_FORGOT_PASSWORD_MESSAGE,
  GOV_FORGOT_USER_ID_MESSAGE,
  GOV_PASSWORD_RESET_TTL_MS,
  GOV_RESET_INVALID_MESSAGE,
  GOV_RESET_SUCCESS_MESSAGE,
  hashGovResetToken,
} from "../../lib/gov/govAccountRecovery";

describe("reset tokens", () => {
  it("mints unique 256-bit tokens with stable hashes", () => {
    const a = generateGovResetToken();
    const b = generateGovResetToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(hashGovResetToken(a)).toBe(hashGovResetToken(a));
    expect(hashGovResetToken(a)).toHaveLength(64);
    expect(hashGovResetToken(a)).not.toBe(hashGovResetToken(b));
  });

  it("uses a 30-minute token lifetime", () => {
    expect(GOV_PASSWORD_RESET_TTL_MS).toBe(30 * 60 * 1000);
  });
});

describe("generic recovery messages", () => {
  it("reveals nothing about account existence", () => {
    for (const message of [
      GOV_FORGOT_USER_ID_MESSAGE,
      GOV_FORGOT_PASSWORD_MESSAGE,
      GOV_RESET_INVALID_MESSAGE,
      GOV_RESET_SUCCESS_MESSAGE,
    ]) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/not found|no such|unknown|does not exist/i);
    }
  });
});

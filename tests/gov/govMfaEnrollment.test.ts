import { describe, expect, it } from "vitest";
import { verifyTotpCode } from "../../lib/gov/govTotp";
import {
  buildTotpProvisioningUri,
  classifyGovMfaFactor,
  encodeBase32,
  generateGovRecoveryCodes,
  GOV_RECOVERY_CODE_PATTERN,
  hashGovRecoveryCode,
  normalizeGovRecoveryCode,
} from "../../lib/gov/govMfaEnrollment";

/**
 * RFC 6238 SHA-1 reference secret ("12345678901234567890") with the
 * 8-digit vectors reduced mod 10^6 to the 6-digit codes this console
 * verifies. Times are in milliseconds.
 */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("verifyTotpCode (RFC 6238 vectors)", () => {
  it.each([
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_111_111_111_000, "050471"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
    [20_000_000_000_000, "353130"],
  ])("accepts the reference code at t=%i", (nowMs, code) => {
    expect(verifyTotpCode(RFC_SECRET, code, nowMs)).toBe(true);
  });

  it("rejects wrong, malformed, and empty codes", () => {
    expect(verifyTotpCode(RFC_SECRET, "000000", 59_000)).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "28708", 59_000)).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "2870821", 59_000)).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "abcdef", 59_000)).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "", 59_000)).toBe(false);
  });

  it("tolerates one step of clock skew either way, but not two", () => {
    expect(verifyTotpCode(RFC_SECRET, "287082", 59_000 + 30_000)).toBe(true);
    expect(verifyTotpCode(RFC_SECRET, "287082", 59_000 - 30_000)).toBe(true);
    expect(verifyTotpCode(RFC_SECRET, "287082", 59_000 + 90_000)).toBe(false);
  });
});

describe("encodeBase32", () => {
  it("encodes standard base32 without padding (Hello -> JBSWY3DP)", () => {
    expect(encodeBase32(Buffer.from(""))).toBe("");
    expect(encodeBase32(Buffer.from("f"))).toBe("MY");
    expect(encodeBase32(Buffer.from("fo"))).toBe("MZXQ");
    expect(encodeBase32(Buffer.from("foo"))).toBe("MZXW6");
    expect(encodeBase32(Buffer.from("foob"))).toBe("MZXW6YQ");
    expect(encodeBase32(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(encodeBase32(Buffer.from("Hello"))).toBe("JBSWY3DP");
  });
});

describe("buildTotpProvisioningUri", () => {
  it("builds a standard otpauth URI", () => {
    const uri = buildTotpProvisioningUri({ accountName: "DL-CYB-0001", secret: "JBSWY3DPEHPK3PXP" });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Cyber-Sakhi-Gov");
    expect(uri).toContain("digits=6&period=30");
  });
});

describe("recovery codes", () => {
  it("mints unique, well-shaped codes", () => {
    const codes = generateGovRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(GOV_RECOVERY_CODE_PATTERN.test(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(10);
  });

  it("normalizes case tolerant input and hashes stably", () => {
    expect(normalizeGovRecoveryCode("  abcd-efgh ")).toBe("ABCD-EFGH");
    const code = generateGovRecoveryCodes(1)[0];
    expect(hashGovRecoveryCode(code)).toBe(hashGovRecoveryCode(code.toLowerCase()));
    expect(hashGovRecoveryCode(code)).toHaveLength(64);
    expect(hashGovRecoveryCode(code)).not.toBe(hashGovRecoveryCode(generateGovRecoveryCodes(1)[0]));
  });
});

describe("classifyGovMfaFactor", () => {
  const base = {
    officer_id: "officer-1",
    secret_ciphertext: "cipher",
    enabled_at: null,
    revoked_at: null,
    pending_secret_ciphertext: null,
    pending_created_at: null,
  };

  it("reports none without a factor row", () => {
    expect(classifyGovMfaFactor(null)).toBe("none");
  });

  it("reports pending inside the window and none after expiry", () => {
    const pending = { ...base, pending_secret_ciphertext: "p", pending_created_at: new Date(1_000).toISOString() };
    expect(classifyGovMfaFactor(pending, 2_000)).toBe("pending");
    expect(classifyGovMfaFactor(pending, 1_000 + 16 * 60_000)).toBe("none");
  });

  it("reports enabled for an active factor", () => {
    expect(
      classifyGovMfaFactor({ ...base, enabled_at: new Date(0).toISOString() }),
    ).toBe("enabled");
  });
});

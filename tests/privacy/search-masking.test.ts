import { describe, it, expect } from "vitest";
import { maskPii } from "../../lib/privacy/masking";

describe("PII Masking in Search Results", () => {
  describe("maskPii function", () => {
    it("should mask email addresses in search results", () => {
      const input = "Contact john.doe@example.com for support";
      const result = maskPii(input, "partial");

      expect(result.text).not.toContain("john.doe@example.com");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("email");
    });

    it("should mask phone numbers in search results", () => {
      const input = "Call +91 9876543210 for assistance";
      const result = maskPii(input, "partial");

      expect(result.text).not.toContain("9876543210");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("phone");
    });

    it("should mask PAN card numbers in search results", () => {
      const input = "PAN: ABCDE1234F";
      const result = maskPii(input, "partial");

      expect(result.text).toContain("[redacted-pan]");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("pan");
    });

    it("should mask Aadhaar numbers in search results", () => {
      const input = "Aadhaar: 1234 5678 9012";
      const result = maskPii(input, "partial");

      expect(result.text).not.toContain("1234 5678 9012");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("aadhaar");
    });

    it("should mask OTPs in search results", () => {
      const input = "Your OTP is 123456 valid for 10 minutes";
      const result = maskPii(input, "partial");

      expect(result.text).toContain("OTP: ••••");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("otp");
    });

    it("should mask account numbers in search results", () => {
      const input = "Account: 987654321012";
      const result = maskPii(input, "partial");

      expect(result.text).not.toContain("987654321012");
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe("account");
    });

    it("should handle multiple PII types in one string", () => {
      const input = "Email john@test.com and phone +91 9876543210";
      const result = maskPii(input, "partial");

      expect(result.redactions.length).toBeGreaterThan(1);
      expect(result.text).not.toContain("john@test.com");
      expect(result.text).not.toContain("9876543210");
    });

    it("should handle empty input", () => {
      const result = maskPii("", "partial");

      expect(result.text).toBe("");
      expect(result.redactions).toHaveLength(0);
    });

    it("should handle input with no PII", () => {
      const input = "This is a normal message with no sensitive data";
      const result = maskPii(input, "partial");

      expect(result.text).toBe(input);
      expect(result.redactions).toHaveLength(0);
    });

    it("should fully redact in full mode", () => {
      const input = "Email john@test.com for support";
      const result = maskPii(input, "full");

      expect(result.text).toContain("[redacted-email]");
      expect(result.text).not.toContain("test.com");
    });
  });

  describe("Search result privacy", () => {
    it("should preserve search functionality while masking results", () => {
      const title = "Urgent: Account verification needed for john.doe@example.com";
      const description = "Please call +91 9876543210 to verify your account";

      const maskedTitle = maskPii(title, "partial").text;
      const maskedDescription = maskPii(description, "partial").text;

      // Search should still work on original data, but display masked
      expect(maskedTitle).not.toContain("john.doe@example.com");
      expect(maskedDescription).not.toContain("9876543210");

      // But the structure should remain for search context
      expect(maskedTitle).toContain("Urgent");
      expect(maskedTitle).toContain("Account verification");
    });
  });
});
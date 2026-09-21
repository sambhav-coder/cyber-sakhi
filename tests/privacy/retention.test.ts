import { describe, it, expect, vi, beforeEach } from "vitest";
import { retentionStageFor, RetentionPolicy } from "../../lib/privacy/masking";

describe("Retention Policy", () => {
  describe("retentionStageFor function", () => {
    it("should calculate active stage for recent evidence", () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago

      const result = retentionStageFor(recentDate, "evidence");

      expect(result.stage).toBe("active");
      expect(result.daysRemaining).toBeGreaterThan(300);
      expect(result.expiresAt).toBeTruthy();
    });

    it("should calculate review stage for older evidence", () => {
      const now = new Date();
      const reviewDate = new Date(now.getTime() - 250 * 24 * 60 * 60 * 1000).toISOString(); // 250 days ago

      const result = retentionStageFor(reviewDate, "evidence");

      expect(result.stage).toBe("review");
      expect(result.daysRemaining).toBeLessThanOrEqual(120);
      expect(result.daysRemaining).toBeGreaterThan(30);
    });

    it("should calculate expiring stage for very old evidence", () => {
      const now = new Date();
      const expiringDate = new Date(now.getTime() - 340 * 24 * 60 * 60 * 1000).toISOString(); // 340 days ago

      const result = retentionStageFor(expiringDate, "evidence");

      expect(result.stage).toBe("expiring");
      expect(result.daysRemaining).toBeLessThanOrEqual(30);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it("should calculate expired stage for past-retention evidence", () => {
      const now = new Date();
      const expiredDate = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(); // 400 days ago

      const result = retentionStageFor(expiredDate, "evidence");

      expect(result.stage).toBe("expired");
      expect(result.daysRemaining).toBe(0);
    });

    it("should handle different retention policies for case metadata", () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(); // 400 days ago

      const evidenceResult = retentionStageFor(oldDate, "evidence");
      const caseResult = retentionStageFor(oldDate, "case-metadata");

      // Case metadata has longer retention period
      expect(evidenceResult.stage).toBe("expired");
      expect(caseResult.stage).not.toBe("expired");
    });

    it("should handle invalid dates gracefully", () => {
      const result = retentionStageFor("invalid-date", "evidence");

      expect(result.stage).toBe("active");
      expect(result.expiresAt).toBeNull();
      expect(result.daysRemaining).toBeNull();
    });

    it("should respect custom retention policies", () => {
      const customPolicy: RetentionPolicy = {
        evidenceDays: 180,
        caseMetadataDays: 365,
      };

      const now = new Date();
      const date = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago

      const result = retentionStageFor(date, "evidence", customPolicy);

      expect(result.daysRemaining).toBeLessThanOrEqual(80);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });
  });

  describe("Retention safety", () => {
    it("should preserve evidence integrity during retention calculation", () => {
      // This test verifies that retention calculation doesn't modify input data
      const originalDate = "2024-01-01T00:00:00.000Z";
      const result = retentionStageFor(originalDate, "evidence");

      // The function should be pure and not modify input
      expect(originalDate).toBe("2024-01-01T00:00:00.000Z");
      expect(result).toHaveProperty("stage");
      expect(result).toHaveProperty("expiresAt");
    });

    it("should handle evidence vs case metadata differently", () => {
      const now = new Date();
      const date = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString();

      const evidenceStage = retentionStageFor(date, "evidence");
      const caseStage = retentionStageFor(date, "case-metadata");

      // Evidence and case metadata should have different retention periods
      expect(evidenceStage.daysRemaining).not.toBe(caseStage.daysRemaining);
    });
  });
});
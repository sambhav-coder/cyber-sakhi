import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDemoSession, isDemoModeEnabled, canUseDemoMode } from "@/lib/demoMode";

describe("SIH Demo Authentication", () => {
  describe("Demo Mode Detection", () => {
    beforeEach(() => {
      // Reset environment before each test
      process.env.SIH_DEMO_ENABLED = "true";
    });

    it("should detect demo mode when SIH_DEMO_ENABLED is true", () => {
      process.env.SIH_DEMO_ENABLED = "true";
      expect(isDemoModeEnabled()).toBe(true);
    });

    it("should not detect demo mode when SIH_DEMO_ENABLED is false", () => {
      process.env.SIH_DEMO_ENABLED = "false";
      expect(isDemoModeEnabled()).toBe(false);
    });

    it("should default to demo mode enabled when SIH_DEMO_ENABLED is not set", () => {
      delete process.env.SIH_DEMO_ENABLED;
      expect(isDemoModeEnabled()).toBe(true);
    });
  });

  describe("Demo Session Detection", () => {
    it("should identify the SIH demo account correctly", () => {
      const demoSession = {
        user: {
          id: "demo-sih-ephemeral",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "USER",
        },
      };

      const result = isDemoSession(demoSession);
      expect(result.isDemo).toBe(true);
      expect(result.sakhiNumber).toBe("SAKHI-2026-DSAX");
      expect(result.email).toBe("dhairya.sharma.01315616124@adgips.ac.in");
    });

    it("should be case-insensitive for Sakhi Number", () => {
      const demoSession = {
        user: {
          id: "demo-sih-ephemeral",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "sakhi-2026-dsax",
          role: "USER",
        },
      };

      const result = isDemoSession(demoSession);
      expect(result.isDemo).toBe(true);
    });

    it("should be case-insensitive for email", () => {
      const demoSession = {
        user: {
          id: "demo-sih-ephemeral",
          email: "DHAIRYA.SHARMA.01315616124@ADGIPS.AC.IN",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "USER",
        },
      };

      const result = isDemoSession(demoSession);
      expect(result.isDemo).toBe(true);
    });

    it("should reject sessions with wrong Sakhi Number", () => {
      const wrongSession = {
        user: {
          id: "some-user-id",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "SAKHI-2026-ABCD",
          role: "USER",
        },
      };

      const result = isDemoSession(wrongSession);
      expect(result.isDemo).toBe(false);
    });

    it("should reject sessions with wrong email", () => {
      const wrongSession = {
        user: {
          id: "some-user-id",
          email: "other@example.com",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "USER",
        },
      };

      const result = isDemoSession(wrongSession);
      expect(result.isDemo).toBe(false);
    });

    it("should reject sessions with wrong role", () => {
      const wrongSession = {
        user: {
          id: "some-user-id",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "ADMIN",
        },
      };

      const result = isDemoSession(wrongSession);
      expect(result.isDemo).toBe(false);
    });

    it("should reject sessions without user data", () => {
      const result = isDemoSession({});
      expect(result.isDemo).toBe(false);
    });

    it("should reject null sessions", () => {
      const result = isDemoSession(null as any);
      expect(result.isDemo).toBe(false);
    });
  });

  describe("Combined Demo Mode Check", () => {
    beforeEach(() => {
      process.env.SIH_DEMO_ENABLED = "true";
    });

    it("should allow demo mode when both conditions are met", () => {
      const demoSession = {
        user: {
          id: "demo-sih-ephemeral",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "USER",
        },
      };

      expect(canUseDemoMode(demoSession)).toBe(true);
    });

    it("should not allow demo mode when demo is disabled", () => {
      process.env.SIH_DEMO_ENABLED = "false";

      const demoSession = {
        user: {
          id: "demo-sih-ephemeral",
          email: "dhairya.sharma.01315616124@adgips.ac.in",
          sakhiNumber: "SAKHI-2026-DSAX",
          role: "USER",
        },
      };

      expect(canUseDemoMode(demoSession)).toBe(false);
    });

    it("should not allow demo mode for non-demo sessions", () => {
      const normalSession = {
        user: {
          id: "normal-user-id",
          email: "normal@example.com",
          sakhiNumber: "SAKHI-2026-ABCD",
          role: "USER",
        },
      };

      expect(canUseDemoMode(normalSession)).toBe(false);
    });
  });

  describe("Security: Demo Credentials", () => {
    it("should not expose real demo password in client code", () => {
      // This test ensures the demo password is not hardcoded in client-accessible code
      // The demo password should only be in environment variables
      const fs = require("fs");
      const path = require("path");

      // Check that the demo password is not in client-side files
      const loginPagePath = path.join(process.cwd(), "app/login/page.tsx");
      if (fs.existsSync(loginPagePath)) {
        const content = fs.readFileSync(loginPagePath, "utf8");
        // The special token "SIH_DEMO_AUTH_TOKEN" is allowed in client code
        // But real passwords should not be present
        expect(content).not.toMatch(/SIH_DEMO_PASSWORD\s*=/);
      }
    });

    it("should use special token instead of real password in client", () => {
      // Verify the client uses the special token, not a real password
      const fs = require("fs");
      const path = require("path");

      const loginPagePath = path.join(process.cwd(), "app/login/page.tsx");
      const content = fs.readFileSync(loginPagePath, "utf8");

      // Should use the special token
      expect(content).toContain("SIH_DEMO_AUTH_TOKEN");
      // Should not reference environment variable for password
      expect(content).not.toMatch(/process\.env\.SIH_DEMO_PASSWORD/);
    });
  });
});
import { describe, expect, it } from "vitest";
import {
  GOV_THREAT_CATEGORIES,
  GOV_THREAT_CATEGORY_LABELS,
  isGovThreatCategory,
  mapLegacyThreatCategory,
  type GovThreatCategory,
} from "../../lib/gov/govThreatCategories";
import { buildGovTriagePatch } from "../../lib/gov/govQueries";

const CANONICAL: GovThreatCategory[] = [
  "PHISHING",
  "FINANCIAL_FRAUD",
  "BLACKMAIL",
  "THREAT",
  "OTHER",
];

describe("canonical catalogue", () => {
  it("contains exactly the five approved categories", () => {
    expect([...GOV_THREAT_CATEGORIES].sort()).toEqual([...CANONICAL].sort());
    expect(new Set(GOV_THREAT_CATEGORIES).size).toBe(5);
    expect(Object.isFrozen(GOV_THREAT_CATEGORIES)).toBe(true);
  });

  it("accepts every canonical category", () => {
    for (const category of CANONICAL) {
      expect(isGovThreatCategory(category)).toBe(true);
    }
  });

  it("rejects invalid canonical values", () => {
    for (const value of ["SCAM", "EMAIL_FRAUD", "EMAIL_PHISHING", "HARASSMENT", "", " ", "OTHER "] as unknown[]) {
      expect(isGovThreatCategory(value)).toBe(false);
    }
    expect(isGovThreatCategory(null)).toBe(false);
    expect(isGovThreatCategory(undefined)).toBe(false);
    expect(isGovThreatCategory(42)).toBe(false);
  });

  it("labels every catalogue member", () => {
    for (const category of GOV_THREAT_CATEGORIES) {
      expect(GOV_THREAT_CATEGORY_LABELS[category]?.length).toBeGreaterThan(0);
    }
  });
});

describe("legacy mapping", () => {
  it("maps EMAIL_PHISHING to PHISHING as an explicit alias", () => {
    expect(mapLegacyThreatCategory("EMAIL_PHISHING")).toEqual({ category: "PHISHING", matched: true });
  });

  it("does NOT map EMAIL_FRAUD to FINANCIAL_FRAUD (score is not reliably financial)", () => {
    expect(mapLegacyThreatCategory("EMAIL_FRAUD")).toEqual({ category: "OTHER", matched: false });
  });

  it("maps BLACKMAIL and THREAT by lexical identity", () => {
    expect(mapLegacyThreatCategory("BLACKMAIL")).toEqual({ category: "BLACKMAIL", matched: true });
    expect(mapLegacyThreatCategory("THREAT")).toEqual({ category: "THREAT", matched: true });
  });

  it("falls back explicitly for SCAM, HARASSMENT, STALKING, and investigation buckets", () => {
    for (const value of ["SCAM", "HARASSMENT", "STALKING", "EMAIL_INVESTIGATION", "OTP & Financial Coercion", "SOMETHING_ELSE"]) {
      expect(mapLegacyThreatCategory(value)).toEqual({ category: "OTHER", matched: false });
    }
  });

  it("handles null, undefined, and blank values safely", () => {
    expect(mapLegacyThreatCategory(null)).toEqual({ category: "OTHER", matched: false });
    expect(mapLegacyThreatCategory(undefined)).toEqual({ category: "OTHER", matched: false });
    expect(mapLegacyThreatCategory("   ")).toEqual({ category: "OTHER", matched: false });
  });

  it("normalizes case and whitespace on read, while the strict check stays exact", () => {
    expect(isGovThreatCategory("blackmail")).toBe(false);
    expect(isGovThreatCategory(" BLACKMAIL")).toBe(false);
    expect(mapLegacyThreatCategory("blackmail")).toEqual({ category: "BLACKMAIL", matched: true });
    expect(mapLegacyThreatCategory("  email_phishing ")).toEqual({ category: "PHISHING", matched: true });
  });

  it("is deterministic and pure", () => {
    const inputs = ["EMAIL_PHISHING", "blackmail", "SCAM", null, "OTHER", " Threat "];
    const first = inputs.map(mapLegacyThreatCategory);
    const second = inputs.map(mapLegacyThreatCategory);
    expect(second).toEqual(first);
    expect(mapLegacyThreatCategory("OTHER")).toEqual({ category: "OTHER", matched: true });
  });
});

describe("triage patch validation (authorization paths untouched)", () => {
  it("accepts canonical categories and clears on empty input", () => {
    expect(buildGovTriagePatch({ threatCategory: "PHISHING" })).toEqual({ threat_category: "PHISHING" });
    expect(buildGovTriagePatch({ threatCategory: "FINANCIAL_FRAUD" })).toEqual({ threat_category: "FINANCIAL_FRAUD" });
    expect(buildGovTriagePatch({ threatCategory: "" })).toEqual({ threat_category: null });
    expect(buildGovTriagePatch({ threatCategory: "   " })).toEqual({ threat_category: null });
  });

  it("rejects non-canonical category input safely", () => {
    for (const threatCategory of ["SCAM", "EMAIL_FRAUD", "blackmail", "Phishing", "HARASSMENT"]) {
      expect(() => buildGovTriagePatch({ threatCategory })).toThrow("Invalid threat_category");
    }
  });

  it("preserves existing validation behavior for unrelated fields", () => {
    expect(() => buildGovTriagePatch({})).toThrow("Nothing to update.");
    expect(() => buildGovTriagePatch({ govStatus: "BOGUS" })).toThrow("Invalid gov_status.");
    expect(() => buildGovTriagePatch({ riskLevel: "BOGUS" })).toThrow("Invalid risk level.");
    expect(buildGovTriagePatch({ govStatus: "TRIAGED", riskLevel: "HIGH" })).toEqual({
      gov_status: "TRIAGED",
      risk_level: "HIGH",
    });
  });
});

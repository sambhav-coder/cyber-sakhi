import { describe, expect, it } from "vitest";
import {
  displayThreatCategory,
  GOV_UNCLASSIFIED_LABEL,
} from "../../lib/gov/govThreatCategories";

describe("displayThreatCategory", () => {
  it("reports genuinely missing values as Unclassified, not OTHER", () => {
    expect(displayThreatCategory(null)).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory(undefined)).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory("")).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory("   ")).toBe(GOV_UNCLASSIFIED_LABEL);
  });

  it("keeps canonical values as-is", () => {
    expect(displayThreatCategory("PHISHING")).toBe("PHISHING");
    expect(displayThreatCategory("OTHER")).toBe("OTHER");
    expect(displayThreatCategory("FINANCIAL_FRAUD")).toBe("FINANCIAL_FRAUD");
  });

  it("is case/whitespace tolerant and resolves explicit legacy aliases", () => {
    expect(displayThreatCategory("  phishing ")).toBe("PHISHING");
    expect(displayThreatCategory("EMAIL_PHISHING")).toBe("PHISHING");
    expect(displayThreatCategory("blackmail")).toBe("BLACKMAIL");
  });

  it("does not invent categories for out-of-catalogue legacy values", () => {
    // EMAIL_FRAUD is reachable without financial-fraud evidence; SCAM spans
    // financial and non-financial reports. Both stay Unclassified.
    expect(displayThreatCategory("EMAIL_FRAUD")).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory("EMAIL_INVESTIGATION")).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory("SCAM")).toBe(GOV_UNCLASSIFIED_LABEL);
    expect(displayThreatCategory("HARASSMENT")).toBe(GOV_UNCLASSIFIED_LABEL);
  });
});

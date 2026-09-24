import { describe, expect, it } from "vitest";
import {
  describeGovOfficerCode,
  formatGovOfficerCode,
  GOV_OFFICER_CODE_PATTERN,
  isGovOfficerCodeLike,
  isKnownGovDepartmentCode,
  isKnownGovStateCode,
  normalizeGovOfficerCode,
  parseGovOfficerCode,
} from "../../lib/gov/govOfficerCode";

describe("normalizeGovOfficerCode", () => {
  it("trims, uppercases, and unifies separators", () => {
    expect(normalizeGovOfficerCode("  dl-cyb-0001 ")).toBe("DL-CYB-0001");
    expect(normalizeGovOfficerCode("dl_cyb_0001")).toBe("DL-CYB-0001");
    expect(normalizeGovOfficerCode("dl cyb 0001")).toBe("DL-CYB-0001");
    expect(normalizeGovOfficerCode("DL--CYB--0001")).toBe("DL-CYB-0001");
  });
});

describe("parseGovOfficerCode", () => {
  it("parses the canonical example", () => {
    expect(parseGovOfficerCode("DL-CYB-0001")).toEqual({
      code: "DL-CYB-0001",
      stateCode: "DL",
      departmentCode: "CYB",
      serial: 1,
    });
  });

  it("accepts lowercase and separator variants", () => {
    const parsed = parseGovOfficerCode("mh_for_0042");
    expect(parsed?.code).toBe("MH-FOR-0042");
    expect(parsed?.serial).toBe(42);
  });

  it("accepts the DEMO jurisdiction for demonstration accounts", () => {
    expect(parseGovOfficerCode("DEMO-CYB-0001")?.stateCode).toBe("DEMO");
  });

  it("rejects unknown states, departments, and bad serials", () => {
    expect(parseGovOfficerCode("XX-CYB-0001")).toBeNull();
    expect(parseGovOfficerCode("DL-XXX-0001")).toBeNull();
    expect(parseGovOfficerCode("DL-CYB-0000")).toBeNull();
    expect(parseGovOfficerCode("DL-CYB-10000")).toBeNull();
    expect(parseGovOfficerCode("GOV-01-AS")).toBeNull();
    expect(parseGovOfficerCode("not a code")).toBeNull();
    expect(parseGovOfficerCode("")).toBeNull();
  });
});

describe("isGovOfficerCodeLike", () => {
  it("matches shape only, for identifier routing", () => {
    expect(isGovOfficerCodeLike("DL-CYB-0001")).toBe(true);
    expect(isGovOfficerCodeLike("officer@gov.example")).toBe(false);
    expect(isGovOfficerCodeLike("GOV-01-AS")).toBe(false);
  });

  it("agrees with the canonical pattern", () => {
    expect(GOV_OFFICER_CODE_PATTERN.test("DL-CYB-0001")).toBe(true);
  });
});

describe("formatGovOfficerCode", () => {
  it("builds canonical codes and zero-pads serials", () => {
    expect(formatGovOfficerCode("dl", "cyb", 7)).toBe("DL-CYB-0007");
  });

  it("fails closed on invalid parts", () => {
    expect(formatGovOfficerCode("XX", "CYB", 1)).toBeNull();
    expect(formatGovOfficerCode("DL", "XXX", 1)).toBeNull();
    expect(formatGovOfficerCode("DL", "CYB", 0)).toBeNull();
    expect(formatGovOfficerCode("DL", "CYB", 10000)).toBeNull();
  });
});

describe("jurisdiction catalogues", () => {
  it("covers states, UTs, and DEMO without scattering conditionals", () => {
    for (const code of ["DL", "MH", "TN", "JK", "LA", "DEMO"]) {
      expect(isKnownGovStateCode(code)).toBe(true);
    }
    expect(isKnownGovStateCode("XX")).toBe(false);
    for (const dept of ["CYB", "FOR", "INR", "THI", "EVC", "AUD", "ADM"]) {
      expect(isKnownGovDepartmentCode(dept)).toBe(true);
    }
    expect(isKnownGovDepartmentCode("XXX")).toBe(false);
  });

  it("describes codes for display without leaking authority", () => {
    const parsed = parseGovOfficerCode("DL-CYB-0001");
    expect(parsed && describeGovOfficerCode(parsed)).toContain("DL-CYB-0001");
  });
});

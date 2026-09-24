import { describe, expect, it } from "vitest";
import {
  classifyGovJurisdiction,
  GOV_DISTRICT_MAX_LENGTH,
  GOV_STATE_CODE_PATTERN,
  GOV_SUBDIVISION_MAX_LENGTH,
  GOV_UNLOCATED_LABEL,
  labelGovJurisdiction,
  normalizeGovDistrict,
  normalizeGovJurisdiction,
  normalizeGovLocality,
  normalizeGovStateCode,
  normalizeGovSubDivision,
} from "../../lib/gov/govJurisdictions";

describe("state shape policy", () => {
  it("is exactly two uppercase ASCII letters (documented, not a master list)", () => {
    expect(GOV_STATE_CODE_PATTERN.source).toBe("^[A-Z]{2}$");
  });

  it("accepts a valid two-uppercase-letter state shape", () => {
    expect(normalizeGovStateCode("DL")).toEqual({ value: "DL", missing: false, valid: true });
  });

  it("uppercases lowercase input instead of rejecting it", () => {
    expect(normalizeGovStateCode("dl")).toEqual({ value: "DL", missing: false, valid: true });
  });

  it("uppercases mixed-case input", () => {
    expect(normalizeGovStateCode("dL")).toEqual({ value: "DL", missing: false, valid: true });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeGovStateCode("  MH  ")).toEqual({ value: "MH", missing: false, valid: true });
  });

  it("rejects incorrect lengths without coercion", () => {
    for (const value of ["D", "DEL", "DEMO", ""]) {
      const result = normalizeGovStateCode(value);
      expect(result.valid).toBe(false);
      expect(result.value).toBeNull();
    }
  });

  it("rejects numbers and symbols without coercion", () => {
    for (const value of ["D1", "D-L", "D L", "12", "@#"]) {
      expect(normalizeGovStateCode(value)).toEqual({ value: null, missing: false, valid: false });
    }
  });

  it("rejects full names rather than converting them into codes", () => {
    expect(normalizeGovStateCode("Delhi")).toEqual({ value: null, missing: false, valid: false });
  });

  it("treats null, undefined, and blank as missing (never invalid)", () => {
    for (const value of [null, undefined, "", "   ", "\t\n "] as unknown[]) {
      expect(normalizeGovStateCode(value as string | null)).toEqual({ value: null, missing: true, valid: false });
    }
  });

  it("makes no official membership claim: any shape-valid code passes", () => {
    expect(normalizeGovStateCode("XX").valid).toBe(true);
  });
});

describe("district normalization", () => {
  it("accepts a valid non-empty district", () => {
    expect(normalizeGovDistrict("South Delhi")).toEqual({ value: "South Delhi", missing: false, valid: true });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeGovDistrict("  Pune  ")).toEqual({ value: "Pune", missing: false, valid: true });
  });

  it("treats blank, null, and undefined districts as missing", () => {
    for (const value of ["", "   ", null, undefined] as unknown[]) {
      expect(normalizeGovDistrict(value as string | null)).toEqual({ value: null, missing: true, valid: false });
    }
  });

  it("rejects districts longer than 120 characters instead of truncating", () => {
    expect(GOV_DISTRICT_MAX_LENGTH).toBe(120);
    const long = "D".repeat(121);
    expect(normalizeGovDistrict(long)).toEqual({ value: null, missing: false, valid: false });
    expect(normalizeGovDistrict("D".repeat(120)).valid).toBe(true);
  });

  it("normalizes sub-division and locality as unverified free text under the same cap", () => {
    expect(GOV_SUBDIVISION_MAX_LENGTH).toBe(120);
    expect(normalizeGovSubDivision("  Karol Bagh  ")).toEqual({ value: "Karol Bagh", missing: false, valid: true });
    expect(normalizeGovLocality(null)).toEqual({ value: null, missing: true, valid: false });
    expect(normalizeGovLocality("X".repeat(121)).valid).toBe(false);
  });
});

describe("classification", () => {
  it("classifies present state and district as LOCATED", () => {
    const result = classifyGovJurisdiction({ state: "DL", district: "South Delhi" });
    expect(result.status).toBe("LOCATED");
    expect(result.normalized.state.value).toBe("DL");
    expect(result.normalized.district.value).toBe("South Delhi");
  });

  it("classifies doubly-missing jurisdiction as UNLOCATED", () => {
    for (const input of [{}, { state: null, district: null }, { state: "  ", district: "" }]) {
      expect(classifyGovJurisdiction(input).status).toBe("UNLOCATED");
    }
  });

  it("refuses to locate a district without a state", () => {
    expect(classifyGovJurisdiction({ district: "Pune" }).status).toBe("INCOMPLETE");
  });

  it("refuses to locate a state without a district", () => {
    expect(classifyGovJurisdiction({ state: "MH" }).status).toBe("INCOMPLETE");
  });

  it("classifies invalid input as INVALID rather than hiding it", () => {
    expect(classifyGovJurisdiction({ state: "Delhi", district: "Pune" }).status).toBe("INVALID");
    expect(classifyGovJurisdiction({ state: "MH", district: "X".repeat(121) }).status).toBe("INVALID");
    expect(classifyGovJurisdiction({ district: "Y".repeat(200) }).status).toBe("INVALID");
  });

  it("is deterministic for repeated identical inputs", () => {
    const inputs = [
      { state: "dl", district: " South  Delhi " },
      { state: null, district: undefined },
      { state: "XX", district: "Y".repeat(200) },
    ];
    for (const input of inputs) {
      expect(classifyGovJurisdiction({ ...input })).toEqual(classifyGovJurisdiction({ ...input }));
    }
  });

  it("never mutates the input object", () => {
    const input = Object.freeze({ state: " dl ", district: " Pune " });
    expect(() => classifyGovJurisdiction(input)).not.toThrow();
    expect(input).toEqual({ state: " dl ", district: " Pune " });
    expect(normalizeGovJurisdiction(input).state.value).toBe("DL");
  });
});

describe("unknown/unlocated labeling", () => {
  it("labels non-located results explicitly instead of a real region", () => {
    expect(GOV_UNLOCATED_LABEL).toBe("Not located");
    expect(labelGovJurisdiction(classifyGovJurisdiction({}))).toBe("Not located");
    expect(labelGovJurisdiction(classifyGovJurisdiction({ state: "MH" }))).toBe("Not located");
    expect(labelGovJurisdiction(classifyGovJurisdiction({ district: "Pune" }))).toBe("Not located");
    expect(labelGovJurisdiction(classifyGovJurisdiction({ state: "Delhi" }))).toBe("Not located");
  });

  it("labels located jurisdictions with their unverified codes", () => {
    expect(labelGovJurisdiction(classifyGovJurisdiction({ state: "dl", district: "Pune" }))).toBe("DL / Pune");
  });
});

import { describe, expect, it } from "vitest";
import {
  govUniformNotFound,
  isEvidenceBoundToCase,
  isValidGovResourceId,
  parseGovResourceId,
} from "../../lib/gov/govResource";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_ID = "22222222-2222-4222-8222-222222222222";

describe("resource ID validation", () => {
  it("accepts UUIDs and rejects malformed input", () => {
    expect(isValidGovResourceId(CASE_ID)).toBe(true);
    expect(isValidGovResourceId("  " + CASE_ID + "  ")).toBe(true);
    for (const bad of [null, undefined, "", "not-a-uuid", "CS-2026-XJY9D7", "11111111-1111-4111-8111"]) {
      expect(isValidGovResourceId(bad as unknown as string)).toBe(false);
    }
  });

  it("parses valid IDs trimmed and maps malformed IDs to null", () => {
    expect(parseGovResourceId("  " + CASE_ID + " ")).toBe(CASE_ID);
    expect(parseGovResourceId("nope")).toBeNull();
    expect(parseGovResourceId(null)).toBeNull();
  });
});

describe("evidence parent-case binding", () => {
  it("binds only when the server-loaded parent matches", () => {
    expect(isEvidenceBoundToCase({ id: EVIDENCE_ID, caseId: CASE_ID }, CASE_ID)).toBe(true);
    expect(
      isEvidenceBoundToCase({ id: EVIDENCE_ID, caseId: "33333333-3333-4333-8333-333333333333" }, CASE_ID),
    ).toBe(false);
    // Orphan evidence never inherits case authorization.
    expect(isEvidenceBoundToCase({ id: EVIDENCE_ID, caseId: null }, CASE_ID)).toBe(false);
  });

  it("returns a uniform denial shape for missing and out-of-scope", () => {
    expect(govUniformNotFound()).toEqual({ status: 404, body: { error: "Not found." } });
  });
});

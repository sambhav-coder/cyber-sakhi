import { describe, expect, it } from "vitest";
import {
  evaluateGovScope,
  isGrantScopeCompatible,
  type GovScopeInput,
  type GovScopeOfficer,
  type GovScopeResource,
} from "../../lib/gov/govScope";

const CID = "11111111-1111-4111-8111-111111111111";

function officer(overrides: Partial<GovScopeOfficer> = {}): GovScopeOfficer {
  return { scope: "STATE", stateCode: "DL", districtCode: null, ...overrides };
}

function resource(overrides: Partial<GovScopeResource> = {}): GovScopeResource {
  return {
    id: CID,
    stateCode: "DL",
    districtCode: "DL-07",
    jurisdictionStatus: "located",
    ...overrides,
  };
}

function input(overrides: Partial<GovScopeInput> = {}): GovScopeInput {
  return { officer: officer(), resource: resource(), correlationId: "corr-1", ...overrides };
}

describe("geographic scope matching", () => {
  it("allows ALL_INDIA officers on located resources only", () => {
    const allow = evaluateGovScope({
      officer: officer({ scope: "ALL_INDIA", stateCode: null, districtCode: null }),
      resource: resource({ stateCode: "MH", districtCode: "MH-01" }),
      correlationId: "c",
    });
    expect(allow).toEqual({ allow: true, via: "all_india", correlationId: "c" });
    expect(
      evaluateGovScope({
        officer: officer({ scope: "ALL_INDIA", stateCode: null, districtCode: null }),
        resource: resource({ stateCode: null, districtCode: null, jurisdictionStatus: "unlocated" }),
        correlationId: "c",
      }),
    ).toEqual({ allow: false, reason: "unlocated", correlationId: "c" });
  });

  it("matches STATE equality and denies mismatch", () => {
    expect(evaluateGovScope(input())).toEqual({ allow: true, via: "state", correlationId: "corr-1" });
    expect(evaluateGovScope(input({ resource: resource({ stateCode: "MH" }) }))).toEqual({
      allow: false,
      reason: "out_of_scope",
      correlationId: "corr-1",
    });
  });

  it("requires both codes for DISTRICT and denies state-only cases", () => {
    const districtOfficer = officer({ scope: "DISTRICT", districtCode: "DL-07" });
    expect(
      evaluateGovScope(input({ officer: districtOfficer })),
    ).toEqual({ allow: true, via: "district", correlationId: "corr-1" });
    // State-only case: district missing must not pass district scope.
    expect(
      evaluateGovScope(input({ officer: districtOfficer, resource: resource({ districtCode: null }) })),
    ).toEqual({ allow: false, reason: "out_of_scope", correlationId: "corr-1" });
    // District mismatch.
    expect(
      evaluateGovScope(input({ officer: districtOfficer, resource: resource({ districtCode: "DL-01" }) })),
    ).toEqual({ allow: false, reason: "out_of_scope", correlationId: "corr-1" });
  });

  it("denies unlocated, invalid, and retired jurisdiction for every scope", () => {
    for (const scope of ["ALL_INDIA", "STATE", "DISTRICT"] as const) {
      const base = officer({ scope, stateCode: scope === "ALL_INDIA" ? null : "DL", districtCode: scope === "DISTRICT" ? "DL-07" : null });
      expect(
        evaluateGovScope(input({ officer: base, resource: resource({ stateCode: null, districtCode: null, jurisdictionStatus: "unlocated" }) })),
      ).toMatchObject({ allow: false, reason: "unlocated" });
      expect(
        evaluateGovScope(input({ officer: base, resource: resource({ jurisdictionStatus: "invalid" }) })),
      ).toMatchObject({ allow: false, reason: "malformed_code" });
      // Retired codes stay readable elsewhere but never authorize scope.
      expect(
        evaluateGovScope(input({ officer: base, resource: resource({ jurisdictionStatus: "retired" }) })),
      ).toMatchObject({ allow: false, reason: "out_of_scope" });
    }
  });
});

describe("ASSIGNED_CASES scope", () => {
  const investigator = officer({ scope: "ASSIGNED_CASES", stateCode: null, districtCode: null });

  it("allows with a valid assignment and denies without one", () => {
    expect(
      evaluateGovScope(input({ officer: investigator, assignment: { state: "valid" } })),
    ).toEqual({ allow: true, via: "assigned", correlationId: "corr-1" });
    expect(evaluateGovScope(input({ officer: investigator }))).toEqual({
      allow: false,
      reason: "assignment_missing",
      correlationId: "corr-1",
    });
  });

  it("propagates expired and revoked assignment reasons", () => {
    expect(
      evaluateGovScope(input({ officer: investigator, assignment: { state: "expired" } })),
    ).toMatchObject({ allow: false, reason: "assignment_expired" });
    expect(
      evaluateGovScope(input({ officer: investigator, assignment: { state: "revoked" } })),
    ).toMatchObject({ allow: false, reason: "assignment_revoked" });
  });
});

describe("grant path", () => {
  const stateOfficer = officer();

  function grant(overrides: Record<string, unknown> = {}) {
    return {
      usable: true,
      grantId: "grant-1",
      scope: "STATE" as const,
      stateCode: "DL",
      districtCode: null,
      caseId: CID,
      ...overrides,
    };
  }

  it("allows a usable, compatible, case-bound grant within jurisdiction", () => {
    expect(evaluateGovScope(input({ grant: grant() }))).toEqual({
      allow: true,
      via: "grant",
      correlationId: "corr-1",
    });
  });

  it("denies unusable grants with grant reasons", () => {
    for (const reason of ["grant_missing", "grant_expired", "grant_revoked"] as const) {
      expect(
        evaluateGovScope(input({ grant: { ...grant(), usable: false, unusableReason: reason } })),
      ).toEqual({ allow: false, reason, correlationId: "corr-1" });
    }
  });

  it("rejects cross-case grant use and scope-widening grants", () => {
    expect(
      evaluateGovScope(input({ grant: grant({ caseId: "22222222-2222-4222-8222-222222222222" }) })),
    ).toMatchObject({ allow: false, reason: "grant_scope_exceeded" });
    // Jurisdiction-wide grants do not exist: null case binding denies.
    expect(
      evaluateGovScope(input({ grant: grant({ caseId: null }) })),
    ).toMatchObject({ allow: false, reason: "grant_scope_exceeded" });
    // Grant scope broader than officer scope cannot widen jurisdiction.
    expect(
      evaluateGovScope(
        input({
          officer: officer({ scope: "DISTRICT", districtCode: "DL-07" }),
          grant: grant({ scope: "STATE", stateCode: "DL" }),
        }),
      ),
    ).toMatchObject({ allow: false, reason: "grant_scope_exceeded" });
    // Grant cannot rescue an out-of-scope resource.
    expect(
      evaluateGovScope(input({ grant: grant(), resource: resource({ stateCode: "MH" }) })),
    ).toMatchObject({ allow: false, reason: "out_of_scope" });
  });

  it("checks grant scope compatibility structurally", () => {
    expect(isGrantScopeCompatible(officer(), { scope: "DISTRICT", stateCode: "DL", districtCode: "DL-07" })).toBe(true);
    expect(isGrantScopeCompatible(officer(), { scope: "STATE", stateCode: "MH", districtCode: null })).toBe(false);
    expect(
      isGrantScopeCompatible(officer({ scope: "DISTRICT", districtCode: "DL-07" }), { scope: "STATE", stateCode: "DL", districtCode: null }),
    ).toBe(false);
  });
});

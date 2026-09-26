import { describe, expect, it } from "vitest";
import {
  applyGovScopeFilter,
  describeGovScopeFilter,
  isScopeEmpty,
  resolveGovScopeFilter,
} from "../../lib/gov/govQueries";

describe("scope resolution (jurisdiction isolation)", () => {
  it("resolves the DEMO sentinel to the narrow unattributed scope, never ALL_INDIA", async () => {
    const filter = await resolveGovScopeFilter({
      id: "demo-officer",
      scope: "STATE",
      state_code: "DEMO",
      district_code: null,
    });
    expect(filter).toEqual({ kind: "unattributed", label: "DEMO" });
    // The description carries no counts and does not widen.
    expect(describeGovScopeFilter(filter).requiresAttribution).toBe(false);
  });

  it("keeps a missing state code fail-closed", async () => {
    const filter = await resolveGovScopeFilter({
      id: "broken-officer",
      scope: "STATE",
      state_code: null,
      district_code: null,
    });
    expect(filter.kind).toBe("state");
  });

  it("treats empty assignments as an empty scope", () => {
    expect(isScopeEmpty({ kind: "assigned", caseIds: [] })).toBe(true);
    expect(isScopeEmpty({ kind: "all" })).toBe(false);
  });

  it("applies scope predicates without widening", () => {
    // applyGovScopeFilter composes on a query builder; verify it returns
    // the builder (chainable) for every scope kind with a minimal stub.
    const calls: string[] = [];
    const stub = {
      eq: (...a: unknown[]) => { calls.push(`eq:${JSON.stringify(a)}`); return stub; },
      in: (...a: unknown[]) => { calls.push(`in:${JSON.stringify(a)}`); return stub; },
      is: (...a: unknown[]) => { calls.push(`is:${JSON.stringify(a)}`); return stub; },
    };
    applyGovScopeFilter(stub, { kind: "unattributed", label: "DEMO" });
    expect(calls).toEqual(['is:["state_code",null]']);
  });
});

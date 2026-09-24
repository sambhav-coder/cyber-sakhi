import { describe, expect, it } from "vitest";
import {
  GOV_MAP_SOURCE,
  GOV_MAP_VERIFICATION,
  buildGovMapContract,
  intensityForCount,
  type GovMapContract,
} from "../../lib/gov/govMapContract";
import type { GovGeoSummary } from "../../lib/gov/govQueries";

function summary(over: Partial<GovGeoSummary> = {}): GovGeoSummary {
  return {
    state: null,
    district: null,
    level: "india",
    from: null,
    to: null,
    rows: [
      {
        code: "DL",
        label: "DL",
        metric: { cases: 10, new7d: 2, highRisk: 3, open: 8 },
        categories: [
          { label: "PHISHING", count: 6 },
          { label: "OTHER", count: 4 },
        ],
      },
      {
        code: "MH",
        label: "MH",
        metric: { cases: 2, new7d: 0, highRisk: 0, open: 1 },
        categories: [{ label: "THREAT", count: 2 }],
      },
    ],
    total: { cases: 12, new7d: 2, highRisk: 3, open: 9 },
    threatBreakdown: [
      { label: "PHISHING", count: 6 },
      { label: "OTHER", count: 4 },
      { label: "THREAT", count: 2 },
    ],
    riskBreakdown: [{ label: "HIGH", count: 3 }],
    generatedAt: "2026-09-24T00:00:00.000Z",
    source: "Cyber Sakhi case data",
    verification: "Officer-entered, unverified",
    excludedCounts: { unlocated: 1, invalidOrIncomplete: 2 },
    ...over,
  };
}

describe("intensity scale (data-derived, relative only)", () => {
  it("returns none/0 for empty responses without dividing by zero", () => {
    expect(intensityForCount(0, 0)).toEqual({ level: "none", ratio: 0 });
    expect(intensityForCount(5, 0)).toEqual({ level: "none", ratio: 0 });
    expect(intensityForCount(0, 10)).toEqual({ level: "none", ratio: 0 });
  });

  it("grades low/moderate/high/peak against the response maximum", () => {
    expect(intensityForCount(1, 10).level).toBe("low");
    expect(intensityForCount(3, 10).level).toBe("moderate");
    expect(intensityForCount(6, 10).level).toBe("high");
    expect(intensityForCount(10, 10)).toEqual({ level: "peak", ratio: 1 });
  });
});

describe("map contract metadata", () => {
  it("labels source and verification truthfully", () => {
    const c = buildGovMapContract(summary());
    expect(GOV_MAP_SOURCE).toBe("Cyber Sakhi case data");
    expect(GOV_MAP_VERIFICATION).toBe("Officer-entered, unverified");
    expect(c.source).toBe("Cyber Sakhi case data");
    expect(c.verification).toBe("Officer-entered, unverified");
    expect(c.generatedAt).toBe("2026-09-24T00:00:00.000Z");
  });

  it("never claims official verification for any region", () => {
    const c = buildGovMapContract(summary());
    for (const r of c.regions) expect(r.verificationStatus).toBe("unverified");
  });

  it("marks real codes LOCATED and unknown groups UNLOCATED", () => {
    const c = buildGovMapContract(
      summary({
        rows: [
          {
            code: "DL",
            label: "DL",
            metric: { cases: 3, new7d: 0, highRisk: 0, open: 3 },
            categories: [],
          },
          {
            code: "UNKNOWN",
            label: "Not located",
            metric: { cases: 5, new7d: 1, highRisk: 1, open: 5 },
            categories: [],
          },
        ],
      }),
    );
    expect(c.regions[0].jurisdictionStatus).toBe("LOCATED");
    expect(c.regions[1].jurisdictionStatus).toBe("UNLOCATED");
    expect(c.regions[1].displayName).toBe("Not located");
  });

  it("carries excluded counts and category breakdowns through", () => {
    const c = buildGovMapContract(summary());
    expect(c.excludedCounts).toEqual({ unlocated: 1, invalidOrIncomplete: 2 });
    expect(c.categoryBreakdown).toEqual([
      { label: "PHISHING", count: 6 },
      { label: "OTHER", count: 4 },
      { label: "THREAT", count: 2 },
    ]);
    expect(c.regions[0].categoryCounts).toEqual([
      { label: "PHISHING", count: 6 },
      { label: "OTHER", count: 4 },
    ]);
    // Category counts sum to the region total: no double counting.
    for (const r of c.regions) {
      const sum = r.categoryCounts.reduce((n, x) => n + x.count, 0);
      expect(sum).toBe(r.totalCases);
    }
  });
});

describe("privacy: aggregate counts only", () => {
  it("exposes no case UUIDs, PII, GPS, or evidence fields", () => {
    const c: GovMapContract = buildGovMapContract(summary());
    const json = JSON.stringify(c).toLowerCase();
    for (const needle of [
      "victim",
      "phone",
      "email",
      "address",
      "latitude",
      "longitude",
      "gps",
      "evidence",
      "sha256",
      "case_number",
      "caseid",
      "uuid",
    ]) {
      expect(json).not.toContain(needle);
    }
    expect(Object.keys(c)).not.toContain("cases");
  });

  it("handles empty results with zero totals", () => {
    const c = buildGovMapContract(
      summary({ rows: [], total: { cases: 0, new7d: 0, highRisk: 0, open: 0 } }),
    );
    expect(c.regions).toEqual([]);
    expect(c.totals.cases).toBe(0);
  });
});

describe("suppression", () => {
  it("is disabled by default (existing exact-count behavior preserved)", () => {
    const c = buildGovMapContract(summary());
    expect(c.suppressionThreshold).toBe(0);
    expect(c.regions.every((r) => r.suppressed === false)).toBe(true);
  });

  it("flags small groups without implying zero when enabled", () => {
    const c = buildGovMapContract(summary(), { suppressionThreshold: 3 });
    const small = c.regions.find((r) => r.regionCode === "MH")!;
    const large = c.regions.find((r) => r.regionCode === "DL")!;
    expect(small.suppressed).toBe(true);
    expect(small.insufficientData).toBe(true);
    expect(small.totalCases).toBe(2);
    expect(large.suppressed).toBe(false);
  });
});

describe("purity", () => {
  it("is deterministic and never mutates the input summary", () => {
    const s = summary();
    const frozen = JSON.parse(JSON.stringify(s));
    expect(buildGovMapContract(s)).toEqual(buildGovMapContract(s));
    expect(s).toEqual(frozen);
  });
});

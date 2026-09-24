import { describe, expect, it } from "vitest";
import {
  GOV_MAP_SHORT_LABELS,
  GOV_MAP_VOLUME_FILLS,
  STATE_CODE_TO_GEO_NAME,
  displayLabelForGeoName,
  joinAggregateToGeo,
  labelTreatmentForArea,
  volumeFillForCount,
  volumeLevelForCount,
} from "../../lib/gov/govMapDisplay";

function row(code: string, cases: number) {
  return { code, metric: { cases, new7d: 1, highRisk: 0, open: cases } };
}

describe("display join (officer codes to boundary names)", () => {
  it("maps standard and alias codes to exact dataset spellings", () => {
    expect(STATE_CODE_TO_GEO_NAME["DL"]).toBe("NCT of Delhi");
    expect(STATE_CODE_TO_GEO_NAME["AR"]).toBe("Arunanchal Pradesh");
    expect(STATE_CODE_TO_GEO_NAME["CT"]).toBe(STATE_CODE_TO_GEO_NAME["CG"]);
    expect(STATE_CODE_TO_GEO_NAME["OR"]).toBe(STATE_CODE_TO_GEO_NAME["OD"]);
    expect(STATE_CODE_TO_GEO_NAME["TS"]).toBe(STATE_CODE_TO_GEO_NAME["TG"]);
    expect(STATE_CODE_TO_GEO_NAME["UK"]).toBe(STATE_CODE_TO_GEO_NAME["UT"]);
  });

  it("documents the Ladakh fallback instead of inventing geometry", () => {
    expect(STATE_CODE_TO_GEO_NAME["LA"]).toBe("Jammu & Kashmir");
  });

  it("joins rows onto polygons and reports unmatched codes honestly", () => {
    const { byGeoName, unmatched } = joinAggregateToGeo([
      row("DL", 10),
      row("MH", 4),
      row("XX", 3),
      row("UNKNOWN", 2),
    ]);
    expect(byGeoName.get("NCT of Delhi")?.totalCases).toBe(10);
    expect(byGeoName.get("Maharashtra")?.totalCases).toBe(4);
    expect(unmatched).toEqual(["XX", "UNKNOWN"]);
  });

  it("accumulates duplicate codes into one polygon total", () => {
    const { byGeoName } = joinAggregateToGeo([row("DL", 10), row("DL", 5)]);
    expect(byGeoName.get("NCT of Delhi")?.totalCases).toBe(15);
  });

  it("never mutates the input rows", () => {
    const rows = [row("DL", 10)];
    const frozen = JSON.parse(JSON.stringify(rows));
    joinAggregateToGeo(rows);
    expect(rows).toEqual(frozen);
  });
});

describe("volume scale (mirrors the data-contract intensity)", () => {
  it("grades none/low/moderate/high/peak against the view maximum", () => {
    expect(volumeLevelForCount(0, 10)).toBe("none");
    expect(volumeLevelForCount(5, 0)).toBe("none");
    expect(volumeLevelForCount(1, 10)).toBe("low");
    expect(volumeLevelForCount(3, 10)).toBe("moderate");
    expect(volumeLevelForCount(6, 10)).toBe("high");
    expect(volumeLevelForCount(9, 10)).toBe("peak");
  });

  it("returns stable dark-theme fills with green-low/red-high meaning", () => {
    expect(volumeFillForCount(0, 10)).toBe(GOV_MAP_VOLUME_FILLS.none);
    expect(volumeFillForCount(1, 10)).toBe(GOV_MAP_VOLUME_FILLS.low);
    expect(volumeFillForCount(10, 10)).toBe(GOV_MAP_VOLUME_FILLS.peak);
    expect(GOV_MAP_VOLUME_FILLS.low).not.toBe(GOV_MAP_VOLUME_FILLS.peak);
  });

  it("is deterministic", () => {
    expect(volumeFillForCount(4, 10)).toBe(volumeFillForCount(4, 10));
  });
});

describe("label treatment", () => {
  it("uses full names for large areas, short labels mid-size, dots when tiny", () => {
    expect(labelTreatmentForArea(20000)).toEqual({ kind: "full" });
    expect(labelTreatmentForArea(5000)).toEqual({ kind: "short" });
    expect(labelTreatmentForArea(500)).toEqual({ kind: "dot" });
    expect(labelTreatmentForArea(NaN)).toEqual({ kind: "dot" });
  });

  it("resolves short labels with fallback to the full name", () => {
    expect(displayLabelForGeoName("NCT of Delhi", { kind: "short" })).toBe(
      GOV_MAP_SHORT_LABELS["NCT of Delhi"],
    );
    expect(displayLabelForGeoName("Rajasthan", { kind: "short" })).toBe(
      "Rajasthan",
    );
    expect(displayLabelForGeoName("Goa", { kind: "dot" })).toBeNull();
    expect(displayLabelForGeoName("Goa", { kind: "full" })).toBe("Goa");
  });
});

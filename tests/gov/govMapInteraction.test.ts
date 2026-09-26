import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STATE_CODE_TO_GEO_NAME,
  joinAggregateToGeo,
  volumeFillForCount,
  volumeLevelForCount,
} from "../../lib/gov/govMapDisplay";
import { displayNameForGeoName } from "../../lib/gov/govGeo3D";
import { intensityForCount } from "../../lib/gov/govMapContract";

/**
 * Map interaction regression suite (PART 21, items 19-26; all DB-free).
 * Geometry lookup, normalization display, join semantics, and the
 * district asset contract. WebGL rendering itself is not executable here
 * and is documented as such; these tests pin everything around it.
 */

const ROOT = process.cwd();
const metric = (cases: number) => ({ cases, new7d: 0, highRisk: 0, open: cases });

describe("state code to geometry join", () => {
  it("maps DL to the exact geometry spelling (no Delhi mismatch)", () => {
    expect(STATE_CODE_TO_GEO_NAME.DL).toBe("NCT of Delhi");
    expect(STATE_CODE_TO_GEO_NAME.MH).toBe("Maharashtra");
    expect(STATE_CODE_TO_GEO_NAME.UP).toBe("Uttar Pradesh");
    expect(STATE_CODE_TO_GEO_NAME.KA).toBe("Karnataka");
  });

  it("every join target exists verbatim in the state asset", () => {
    const geo = JSON.parse(
      readFileSync(join(ROOT, "public", "geo", "india-states.geojson"), "utf8"),
    ) as { features: Array<{ properties: { ST_NM: string } }> };
    const names = new Set(geo.features.map((f) => f.properties.ST_NM));
    for (const target of Object.values(STATE_CODE_TO_GEO_NAME)) {
      expect(names.has(target), `join target missing from geometry: ${target}`).toBe(true);
    }
  });

  it("joins aggregate rows by officer code and reports unmatched honestly", () => {
    const joined = joinAggregateToGeo([
      { code: "MH", metric: metric(5) },
      { code: "XX", metric: metric(3) },
      { code: "UNKNOWN", metric: metric(2) },
    ]);
    expect(joined.byGeoName.get("Maharashtra")?.totalCases).toBe(5);
    expect(joined.unmatched).toEqual(expect.arrayContaining(["XX", "UNKNOWN"]));
  });

  it("display names shorten small regions and pass unknown names through", () => {
    expect(displayNameForGeoName("NCT of Delhi")).toBe("Delhi");
    expect(displayNameForGeoName("Some Future Region")).toBe("Some Future Region");
  });
});

describe("volume and intensity scales agree", () => {
  it("treats zero and empty maxima as none without division by zero", () => {
    expect(volumeLevelForCount(0, 10)).toBe("none");
    expect(volumeLevelForCount(5, 0)).toBe("none");
    expect(intensityForCount(5, 0)).toEqual({ level: "none", ratio: 0 });
  });

  it("grades relative volume on fixed thresholds", () => {
    expect(volumeLevelForCount(1, 10)).toBe("low");
    expect(volumeLevelForCount(4, 10)).toBe("moderate");
    expect(volumeLevelForCount(7, 10)).toBe("high");
    expect(volumeLevelForCount(9, 10)).toBe("peak");
  });

  it("fills are deterministic per level", () => {
    expect(volumeFillForCount(0, 10)).toBe(volumeFillForCount(0, 10));
    expect(volumeFillForCount(9, 10)).not.toBe(volumeFillForCount(0, 10));
  });
});

describe("district asset contract", () => {
  it("ships 641 validated district features with Census properties", () => {
    const path = join(ROOT, "public", "geo", "india-districts-census2011.geojson");
    expect(existsSync(path)).toBe(true);
    const fc = JSON.parse(readFileSync(path, "utf8")) as {
      features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown[] } }>;
    };
    expect(fc.features.length).toBe(641);
    const mh = fc.features.filter((f) => f.properties.ST_NM === "Maharashtra");
    expect(mh.length).toBe(35);
    for (const f of fc.features) {
      expect(typeof f.properties.DISTRICT).toBe("string");
      expect(f.geometry.coordinates.length).toBeGreaterThan(0);
    }
  });

  it("documents the Telangana vintage gap instead of hiding it", () => {
    const fc = JSON.parse(
      readFileSync(join(ROOT, "public", "geo", "india-districts-census2011.geojson"), "utf8"),
    ) as { features: Array<{ properties: { ST_NM: string } }> };
    const states = new Set(fc.features.map((f) => f.properties.ST_NM));
    expect(states.has("Telangana")).toBe(false);
    expect(states.has("Andhra Pradesh")).toBe(true);
  });
});

describe("drill-down view contracts (static)", () => {
  it("seeds selection from ?state= and syncs it back without history spam", () => {
    const view = readFileSync(join(ROOT, "components", "gov", "GovGeographyView.tsx"), "utf8");
    expect(view).toContain("initialSelected");
    expect(view).toContain("router.replace(`/gov/geography");
    expect(view).toContain("key={mapKey}");
  });

  it("keeps the India scene keyed separately from state scenes (remount, not overlay)", () => {
    const view = readFileSync(join(ROOT, "components", "gov", "GovGeographyView.tsx"), "utf8");
    expect(view).toMatch(/mapKey = selected \? `state:\$\{selected\}` : "india"/);
  });

  it("gives keyboard users the same transition as map clicks", () => {
    const view = readFileSync(join(ROOT, "components", "gov", "GovGeographyView.tsx"), "utf8");
    expect(view).toContain("Go to state");
    expect(view).toContain("requestState(e.target.value)");
  });
});

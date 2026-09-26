import { describe, expect, it } from "vitest";
import { SIH_DEMO_GIS_STATES, buildSihDemoGeoSummary, demoDistrictCodeForBoundary } from "../../lib/gov/govDemoGis";

describe("SIH GIS demo seed integrity", () => {
  it("covers all 36 State/UT records with reconciled district and city totals", () => {
    expect(SIH_DEMO_GIS_STATES).toHaveLength(36);
    expect(new Set(SIH_DEMO_GIS_STATES.map((state) => state.code)).size).toBe(36);
    for (const state of SIH_DEMO_GIS_STATES) {
      const summary = buildSihDemoGeoSummary(state.code, null, null);
      expect(summary.total.cases).toBeGreaterThan(0);
      expect(state.districts.length).toBeGreaterThan(0);
      expect(summary.total.cases).toBe(state.districts.reduce((total, district) => total + district.cities.reduce((cityTotal, city) => cityTotal + city.cases, 0), 0));
      for (const district of state.districts) {
        expect(demoDistrictCodeForBoundary(state.code, district.label)).toBe(district.code);
        expect(district.cities.length).toBeGreaterThan(0);
        for (const city of district.cities) {
          expect(city.code).toBeTruthy();
          expect(city.cases).toBeGreaterThan(0);
          expect(city.latitude).toBeGreaterThanOrEqual(-90);
          expect(city.latitude).toBeLessThanOrEqual(90);
          expect(city.longitude).toBeGreaterThanOrEqual(-180);
          expect(city.longitude).toBeLessThanOrEqual(180);
        }
      }
    }
  });
});

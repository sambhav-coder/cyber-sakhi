import { describe, expect, it } from "vitest";
import {
  GOV_CAMERA_PRESETS,
  GOV_CONTEXT_COUNTRY_FILLS,
  GOV_GEO3D_EXTRUSION_DEPTH,
  GOV_PREVIEW_ACCENTS,
  contextFillForCountry,
  displayNameForGeoName,
  illustrativeAccentForName,
  projectLonLat,
  resolveLabelCollisions,
  resolveMapDisplayMode,
  unprojectXZ,
  wrapGeoLabel,
  type GovLabelBox,
} from "../../lib/gov/govGeo3D";

describe("display-mode separation (preview vs live)", () => {
  it("stays in visual-preview without positive joined case counts", () => {
    expect(resolveMapDisplayMode({ regionCases: new Map() })).toBe("visual-preview");
    expect(
      resolveMapDisplayMode({ regionCases: new Map([["DL", 0], ["MH", 0]]) }),
    ).toBe("visual-preview");
  });

  it("switches to live-data when any polygon has cases", () => {
    expect(
      resolveMapDisplayMode({ regionCases: new Map([["DL", 0], ["MH", 3]]) }),
    ).toBe("live-data");
  });

  it("ignores non-finite counts instead of switching modes", () => {
    expect(
      resolveMapDisplayMode({ regionCases: new Map([["DL", NaN]]) }),
    ).toBe("visual-preview");
  });
});

describe("illustrative preview palette", () => {
  it("is deterministic per region name", () => {
    expect(illustrativeAccentForName("Maharashtra")).toBe(
      illustrativeAccentForName("Maharashtra"),
    );
  });

  it("only uses the documented hue-named entries", () => {
    const fills = new Set(GOV_PREVIEW_ACCENTS.map((a) => a.fill));
    for (const name of ["Maharashtra", "Assam", "Goa", "Bihar", "Kerala"]) {
      expect(fills.has(illustrativeAccentForName(name))).toBe(true);
    }
    for (const a of GOV_PREVIEW_ACCENTS) {
      expect(a.key).not.toMatch(/risk|threat|case|severity/i);
    }
  });
});

describe("display-name corrections (labels only)", () => {
  it("fixes dataset typos without touching the join keys", () => {
    expect(displayNameForGeoName("Arunanchal Pradesh")).toBe("Arunachal Pradesh");
    expect(displayNameForGeoName("Dadara & Nagar Havelli")).toBe(
      "Dadra and Nagar Haveli",
    );
    expect(displayNameForGeoName("NCT of Delhi")).toBe("Delhi");
    expect(displayNameForGeoName("Rajasthan")).toBe("Rajasthan");
  });
});

describe("lon/lat projection (pure math)", () => {
  it("centers the origin and points north to -z", () => {
    expect(projectLonLat(82.8, 22.5)).toEqual({ x: 0, z: -0 });
    const north = projectLonLat(82.8, 30);
    expect(north.z).toBeLessThan(0);
    expect(north.x).toBeCloseTo(0, 10);
  });

  it("round-trips through the inverse", () => {
    const { lon, lat } = unprojectXZ(...Object.values(projectLonLat(77.2, 28.6)) as [number, number]);
    expect(lon).toBeCloseTo(77.2, 9);
    expect(lat).toBeCloseTo(28.6, 9);
  });

  it("keeps extrusion depth positive and modest", () => {
    expect(GOV_GEO3D_EXTRUSION_DEPTH).toBeGreaterThan(0);
    expect(GOV_GEO3D_EXTRUSION_DEPTH).toBeLessThan(2);
  });
});

describe("camera presets", () => {
  it("covers all six faces plus reset handling", () => {
    for (const name of ["TOP", "FRONT", "BACK", "LEFT", "RIGHT", "BOTTOM"] as const) {
      const v = GOV_CAMERA_PRESETS[name];
      expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(0);
    }
  });

  it("bottom preset looks from underneath (negative y)", () => {
    expect(GOV_CAMERA_PRESETS.BOTTOM.y).toBeLessThan(0);
    expect(GOV_CAMERA_PRESETS.TOP.y).toBeGreaterThan(0);
  });
});

describe("neighbor-country contextual fills (never case-data colors)", () => {
  it("is deterministic and drawn from the muted palette only", () => {
    expect(contextFillForCountry("Pakistan")).toBe(contextFillForCountry("Pakistan"));
    for (const name of ["Pakistan", "China", "Nepal", "Sri Lanka", "Myanmar"]) {
      expect(GOV_CONTEXT_COUNTRY_FILLS).toContain(contextFillForCountry(name));
    }
  });

  it("avoids bright data-confusable hues", () => {
    for (const fill of GOV_CONTEXT_COUNTRY_FILLS) {
      expect(fill).not.toMatch(/^#(ef4444|dc2626|eab308|f97316|22c55e)$/i);
    }
  });
});

describe("label collision solver", () => {
  const box = (over: Partial<GovLabelBox> & { id: string }): GovLabelBox => ({
    x: 0,
    y: 0,
    w: 100,
    h: 20,
    priority: 50,
    ...over,
  });

  it("keeps non-overlapping labels and drops lower-priority overlaps", () => {
    const visible = resolveLabelCollisions([
      box({ id: "a", x: 0, priority: 80 }),
      box({ id: "b", x: 500, priority: 40 }),
      box({ id: "c", x: 10, priority: 40 }),
    ]);
    expect(visible.has("a")).toBe(true);
    expect(visible.has("b")).toBe(true);
    expect(visible.has("c")).toBe(false);
  });

  it("breaks ties deterministically by id", () => {
    const first = resolveLabelCollisions([box({ id: "b" }), box({ id: "a" })]);
    const second = resolveLabelCollisions([box({ id: "a" }), box({ id: "b" })]);
    expect(first).toEqual(second);
    expect(first.size).toBe(1);
  });

  it("grants stickiness to previously visible labels", () => {
    const boxes = [box({ id: "a", x: 0, priority: 50 }), box({ id: "b", x: 10, priority: 55 })];
    expect(resolveLabelCollisions(boxes).has("a")).toBe(false);
    expect(resolveLabelCollisions(boxes, new Set(["a"])).has("a")).toBe(true);
  });

  it("never mutates the input array", () => {
    const boxes = [box({ id: "a" })];
    const frozen = JSON.parse(JSON.stringify(boxes));
    resolveLabelCollisions(boxes);
    expect(boxes).toEqual(frozen);
  });
});

describe("geographic label wrapping", () => {
  const measure = (line: string) => line.length * 20;

  it("wraps long two-word names into balanced lines", () => {
    expect(wrapGeoLabel("Andhra Pradesh", measure, 200)).toEqual(["Andhra", "Pradesh"]);
  });

  it("leaves fitting and single-word names unwrapped", () => {
    expect(wrapGeoLabel("Goa", measure, 200)).toEqual(["Goa"]);
    expect(wrapGeoLabel("Uttarakhand", measure, 200)).toEqual(["Uttarakhand"]);
  });

  it("never breaks mid-word when nothing fits", () => {
    const lines = wrapGeoLabel("Andhra Pradesh", measure, 50);
    expect(lines.join(" ")).toBe("Andhra Pradesh");
    for (const line of lines) expect(line.includes("  ")).toBe(false);
  });
});

/**
 * Pure 3D-scene helpers for the Geographic Intelligence map.
 *
 * No three.js, DOM, network, auth, or I/O here: these are the testable
 * display decisions (projection math, preview/live separation, corrected
 * spellings) consumed by the WebGL scene component. All inputs are read
 * without mutation.
 *
 * Display honesty (deliberate):
 * - `resolveMapDisplayMode` decides the ONLY color semantic. Preview colors
 *   are explicitly illustrative; live colors come from authorized
 *   aggregates. Preview palette entries are hue-named (never
 *   low-risk/high-cases language).
 * - `STATE_DISPLAY_NAMES` corrects dataset typos (dataset spellings stay
 *   authoritative for the join in govMapDisplay.ts; these are labels only).
 * - Ladakh has no separate polygon in the boundary asset, so it gets no
 *   3D mesh and no fabricated position — documented, not drawn.
 */

/** Map color semantic: illustrative preview vs authorized live data. */
export type GovMapDisplayMode = "visual-preview" | "live-data";

export interface GovMapModeInput {
  /** Aggregate rows already joined to polygons (regionCode -> cases). */
  regionCases: ReadonlyMap<string, number>;
}

/**
 * Live-data mode requires at least one polygon with a positive case count.
 * Anything else (empty, zero-only, or error payloads) is visual-preview:
 * the scene paints illustrative colors under an explicit banner.
 */
export function resolveMapDisplayMode(input: GovMapModeInput): GovMapDisplayMode {
  for (const cases of input.regionCases.values()) {
    if (Number.isFinite(cases) && cases > 0) return "live-data";
  }
  return "visual-preview";
}

/**
 * Illustrative preview palette (hue-named, severity-free). Deterministic
 * per region so the preview is stable across renders; visually adjacent to
 * the reference mood (green/yellow/orange/red surfaces) without claiming
 * any data meaning.
 */
export const GOV_PREVIEW_ACCENTS: ReadonlyArray<{ key: string; fill: string }> =
  Object.freeze([
    { key: "emerald", fill: "#22c55e" },
    { key: "amber", fill: "#eab308" },
    { key: "orange", fill: "#f97316" },
    { key: "crimson", fill: "#dc2626" },
    { key: "slate", fill: "#475569" },
  ]);

/** Deterministic illustrative accent for a region name (stable, pure). */
export function illustrativeAccentForName(geoName: string): string {
  let hash = 0;
  for (let i = 0; i < geoName.length; i += 1) {
    hash = (hash * 31 + geoName.charCodeAt(i)) >>> 0;
  }
  return GOV_PREVIEW_ACCENTS[hash % GOV_PREVIEW_ACCENTS.length].fill;
}

/**
 * Corrected on-map spellings for boundary-asset ST_NM values (labels only;
 * the join still uses exact dataset strings). Covers the asset's known
 * typos; everything else passes through unchanged.
 */
export const STATE_DISPLAY_NAMES: Readonly<Record<string, string>> =
  Object.freeze({
    "Andaman & Nicobar Island": "Andaman & Nicobar Islands",
    "Arunanchal Pradesh": "Arunachal Pradesh",
    "Dadara & Nagar Havelli": "Dadra and Nagar Haveli",
    "NCT of Delhi": "Delhi",
  });
/** Reader-facing label for a boundary-asset region name. */
export function displayNameForGeoName(geoName: string): string {
  return STATE_DISPLAY_NAMES[geoName] ?? geoName;
}

/**
 * Equirectangular lon/lat → scene ground-plane (x, z), north = -z.
 * Longitude is compressed by cos(24°) (India's mid-latitude) so states keep
 * their real proportions instead of stretching east-west. Scale is chosen
 * so the whole country spans ~40 world units; the camera frames it.
 */
export const GOV_GEO3D_ORIGIN_LON = 82.8;
export const GOV_GEO3D_ORIGIN_LAT = 22.5;
export const GOV_GEO3D_LON_SCALE = 0.92;
export const GOV_GEO3D_WORLD_SCALE = 1.4;

export function projectLonLat(lon: number, lat: number): { x: number; z: number } {
  return {
    x: (lon - GOV_GEO3D_ORIGIN_LON) * GOV_GEO3D_LON_SCALE * GOV_GEO3D_WORLD_SCALE,
    z: -(lat - GOV_GEO3D_ORIGIN_LAT) * GOV_GEO3D_WORLD_SCALE,
  };
}

/** Inverse of projectLonLat (used by controls/tests, never for data). */
export function unprojectXZ(x: number, z: number): { lon: number; lat: number } {
  return {
    lon: x / (GOV_GEO3D_LON_SCALE * GOV_GEO3D_WORLD_SCALE) + GOV_GEO3D_ORIGIN_LON,
    lat: -z / GOV_GEO3D_WORLD_SCALE + GOV_GEO3D_ORIGIN_LAT,
  };
}

/** Extrusion height (world units) for state meshes. */
export const GOV_GEO3D_EXTRUSION_DEPTH = 0.7;

/** Camera preset directions (unit-ish vectors scaled by fit distance). */
export const GOV_CAMERA_PRESETS = Object.freeze({
  TOP: { x: 0, y: 1, z: 0.0001 },
  FRONT: { x: 0, y: 0.22, z: 1 },
  BACK: { x: 0, y: 0.22, z: -1 },
  LEFT: { x: -1, y: 0.22, z: 0 },
  RIGHT: { x: 1, y: 0.22, z: 0 },
  BOTTOM: { x: 0, y: -1, z: 0.25 },
} as const);

export type GovCameraPresetName = keyof typeof GOV_CAMERA_PRESETS | "RESET";

/**
 * Muted contextual fills for neighboring-country landmasses. Static
 * geography styling only: desaturated, never red/amber/green-bright, so
 * they cannot be confused with the Cyber Sakhi case-volume scale.
 */
export const GOV_CONTEXT_COUNTRY_FILLS: ReadonlyArray<string> = Object.freeze([
  "#334155", // muted slate blue
  "#3b3a55", // desaturated violet
  "#134e4a", // deep teal
  "#4a4433", // muted olive
  "#1f2f42", // soft charcoal blue
  "#4d3f33", // low-saturation brown
]);

/** Deterministic contextual fill for a country name (stable, data-free). */
export function contextFillForCountry(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GOV_CONTEXT_COUNTRY_FILLS[hash % GOV_CONTEXT_COUNTRY_FILLS.length];
}

/** Label priority bands (higher wins collisions; ties break by id). */
export const GOV_LABEL_PRIORITY = Object.freeze({
  selectedState: 100,
  largeState: 80,
  country: 65,
  mediumState: 55,
  smallState: 40,
  sea: 25,
});

export interface GovLabelBox {
  id: string;
  /** Screen-space center (px). */
  x: number;
  y: number;
  /** Screen-space size (px). */
  w: number;
  h: number;
  priority: number;
}

/**
 * Greedy screen-space collision solver. Deterministic: sort by
 * (effective priority desc, id asc), keep a box iff it overlaps no kept
 * box (2px padding). Previously visible ids get a stickiness bonus so
 * labels don't flicker during camera motion. Pure; inputs unmutated.
 */
export function resolveLabelCollisions(
  boxes: ReadonlyArray<GovLabelBox>,
  prevVisible: ReadonlySet<string> = new Set(),
  stickiness = 8,
): Set<string> {
  const ordered = [...boxes]
    .map((b) => ({
      box: b,
      score: b.priority + (prevVisible.has(b.id) ? stickiness : 0),
    }))
    .sort((a, b) => b.score - a.score || (a.box.id < b.box.id ? -1 : 1));
  const kept: GovLabelBox[] = [];
  const visible = new Set<string>();
  for (const { box } of ordered) {
    let hit = false;
    for (const k of kept) {
      if (
        Math.abs(box.x - k.x) * 2 < box.w + k.w + 4 &&
        Math.abs(box.y - k.y) * 2 < box.h + k.h + 4
      ) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      kept.push(box);
      visible.add(box.id);
    }
  }
  return visible;
}

/**
 * Wrap a geographic name into at most two balanced lines when the single
 * line exceeds maxWidth (canvas px at the label's font). Splits at the
 * space nearest the middle; single-word names are returned unwrapped so
 * they fall back to short-label/marker treatment instead of breaking
 * mid-word.
 */
export function wrapGeoLabel(
  text: string,
  measure: (line: string) => number,
  maxWidth: number,
): string[] {
  if (measure(text) <= maxWidth || !text.includes(" ")) return [text];
  const words = text.split(" ");
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = measure(words.slice(0, i).join(" "));
    const b = measure(words.slice(i).join(" "));
    const diff = Math.abs(a - b);
    if (Math.max(a, b) <= maxWidth && diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  if (bestDiff === Infinity) return [text];
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

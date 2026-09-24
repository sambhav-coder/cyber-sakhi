# Government Intelligence Map — data, privacy, and freshness

All map aggregates come from **real Cyber Sakhi case records** scoped to the
authenticated officer. Nothing here is official government data.

## Data source

- Source label on every response: `Cyber Sakhi case data`.
- Verification label on every response: `Officer-entered, unverified`.
- Jurisdiction values are officer-entered free text normalized at read time
  by `lib/gov/govJurisdictions.ts` (state shape `^[A-Z]{2}$`, district
  trimmed/collapsed, 120-char cap). Shape-valid codes (even `XX`) remain
  **unverified** — shape is not membership; there is no state/district
  master list and no LGD validation.
- Included cases: every scoped row in `cases` counts exactly once per
  aggregation — open, closed, and resolved included. Nothing is archived or
  deleted out of the table by these queries. Incomplete/invalid jurisdiction
  rows are grouped under `Not located` and reported in `excludedCounts`
  (`unlocated` vs `invalidOrIncomplete`).

## 3D scene (WebGL)

- Technology: plain `three` (already a dependency; no React Three Fiber, no
  new packages; `@types/three` added as a dev-only dependency for strict
  TypeScript). OrbitControls from `three/examples/jsm` — full rotate, zoom
  (clamped 14–170), pan, touch; unrestricted polar angle so TOP, FRONT,
  BACK, LEFT, RIGHT, BOTTOM, and RESET presets all work with eased camera
  flights. Keyboard: arrows rotate, +/− zoom, Escape clears selection.
- GeoJSON → 3D: each state/UT ring is projected equirectangularly
  (`projectLonLat`, cos-latitude corrected, `lib/gov/govGeo3D.ts`), built
  into `THREE.Shape` (inner rings as holes), and extruded
  (`ExtrudeGeometry`, depth 0.7 + small bevel) with cyan additive edge
  lines. No redrawn or fabricated boundaries.
- Environment: navy ocean disc, faint grid, drifting particles, glow ring,
  fog, and hemisphere/directional/cyan-rim lighting — calm operations
  aesthetic, no gameplay effects.
- Display modes (`resolveMapDisplayMode`): `visual-preview` paints
  deterministic hue-named illustrative accents under a
  "VISUAL PREVIEW — COLORS ARE ILLUSTRATIVE" banner until joined
  aggregates carry positive case counts, when `live-data` takes over with
  the existing volume scale driven by the selected metric. One color
  algorithm; preview entries never use risk/severity language.
- Click drill-down changes geographic level (breadcrumb INDIA → STATE,
  camera frames the state, district/locality lists from the existing scoped
  endpoints). No district polygon geometry exists in the repo, so districts
  render as aggregate lists; `India3DScene` accepts an optional
  `districtShapes` layer prop where a licensed district dataset can plug in
  later without restructuring.
- Labels: canvas sprites with corrected spellings (dataset typos fixed for
  display only); density follows camera distance; tiny UTs get glow markers.
  Ladakh has no polygon in the boundary asset and is not drawn or
  positioned — documented limitation, not silent omission.
- Performance: ~8.5k-vertex asset, one geometry build per dataset (fills /
  selection repaint materials only), raycast hover throttled via rAF,
  capped pixel ratio (≤2), full disposal on unmount.
- Environment: layered-blue radial ocean, lat/lon graticule, flat
  non-interactive neighbor landmasses (Natural Earth via world-atlas,
  bbox-included, India excluded), sea-name sprites, and cyan coastal-glow
  silhouettes under the states. Initial framing fits India tightly (1.02×
  bounding-sphere distance) so the model dominates without clipping
  J&K, the northeast, the southern tip, or island territories.

## Map boundaries, labels, and color

- Geometry: `public/geo/india-states.geojson` (36 state/UT polygons) derived
  from DataMeet's "India - State Boundaries"
  (https://github.com/datameet/maps, **CC BY 4.0**, attributed as "India
  boundaries by DataMeet India community (CC BY 4.0)"). Full provenance and
  processing notes live in `public/geo/ATTRIBUTION.txt`: Douglas-Peucker
  simplification (~0.02°) + 3-decimal rounding shrank 15.7 MB to ~138 KB;
  all 36 features verified intact, including small UTs.
- Inherited dataset limitations (DataMeet's own notes): community-digitized
  approximate boundaries; names follow the asset verbatim; Jammu & Kashmir
  is pre-bifurcation geometry (no separate Ladakh polygon — code `LA` maps
  to it as a documented display fallback); DNH and Daman & Diu remain
  separate features. Approximate — not for legal or official use.
- Code→polygon join (`STATE_CODE_TO_GEO_NAME`, `lib/gov/govMapDisplay.ts`)
  is display-only and unverified; unmatched aggregate codes are surfaced in
  the UI status ("N groups not matched to map shapes") rather than forced
  onto a wrong polygon.
- Labels sit on d3-computed polygon centroids (`path.centroid`), sized by
  projected area (full name ≥9000 px², short label ≥2200 px², dot marker
  below), with halo strokes for dark-theme legibility; names always remain
  available in the hover tooltip regardless of label treatment.
- Fills encode relative case volume for the current view
  (none/low/moderate/high/peak at 0 / <25% / <50% / <80% / ≥80% of the view
  maximum; green → red on dark slate), mirroring `intensityForCount`. The
  legend states they are not an official risk classification.

## Freshness

- `GET /gov/api/geo` returns `generatedAt` (ISO), `source`, `verification`,
  and `excludedCounts` alongside the existing `rows/total` contract.
- `GET /gov/api/geo/map` returns the aggregate-only `GovMapContract`
  (no case rows or UUIDs) with the same metadata.
- The geography UI shows "Last updated …", a manual Refresh button, and an
  opt-in 60s auto-refresh that pauses while the tab is hidden. Failed
  background refreshes keep the last good data and mark it stale instead of
  blanking the screen. Data is fetched with `cache: no-store` on every load;
  there is no cross-officer client cache.
- Nothing is labelled "live government data": refresh means re-querying
  internal case rows, not an external live feed (no such integration exists).

## Canonical threat categories

`PHISHING, FINANCIAL_FRAUD, BLACKMAIL, THREAT, OTHER`
(`lib/gov/govThreatCategories.ts`). Read-time aggregation maps legacy and
case-variant values through `mapLegacyThreatCategory` (explicit aliases
only; unknown/null/blank → `OTHER`), so counts never fragment by case and
each case increments exactly one bucket. Write-path triage validation stays
strict (`buildGovTriagePatch`).

## Suppression and privacy

- Aggregate responses contain counts and labels only: no victim PII, no GPS,
  no evidence content, no investigation details.
- `/gov/api/geo` returns lightweight case rows **only** when a district is
  selected (for the authorized locality table); each links to the existing
  scoped case workspace, which re-enforces scope and permission.
- `/gov/api/geo/map` is aggregate-only by design (no case IDs at all).
- Region suppression is opt-in (`?suppressAbove=N`, default off): flagged
  regions must render `Suppressed`, never a count and never zero. Totals stay
  exact for authorized officers; this is display-level protection, not an
  anonymous public release. The offender-network `K_ANONYMITY=3` rule is a
  separate surface and is not applied here.

## Scope and permission enforcement

- `GET /gov/api/geo` and `/gov/api/geo/map` both require `geo.view` via
  `requireGovApi`, then `resolveGovScopeFilter` + `applyGovScopeFilter`
  **before** grouping. `ASSIGNED_CASES` with no assignments fails closed to
  empty. Extra `?state/&district` parameters only narrow within scope; an
  unauthorized region queried via URL returns that officer's (empty) scoped
  slice, never another jurisdiction's data. Case workspaces additionally pass
  through `requireScopedCase` (uniform 404, no IDOR oracle).

## Map intensity calculation

Pure function `intensityForCount` (`lib/gov/govMapContract.ts`), mirrored in
the UI: ratio = region cases / response maximum; none (0), low (<0.25),
moderate (<0.5), high (<0.8), peak (≥0.8). UI colors: green (low) → amber →
red (high/peak); grey for none/suppressed. Relative to the current view only
— **not** an official risk classification; the legend states this.

## Aggregation placement (known limitation)

Grouping stays in JavaScript over scoped rows (no SQL `GROUP BY`): the
Supabase JS client exposes no grouped aggregation, and raw SQL/RPC would
bypass the shared `applyGovScopeFilter` path and risk an unscoped endpoint.
Scope/time filters are applied in the database query first; only scoped rows
are grouped in memory.

## What is not connected

No official government dataset, no LGD registry, no external live feed, no
verified boundary polygons below the national outline (world-atlas 110m
India outline only; state/district levels render real database labels, never
fabricated geometry).

## Local testing

- `npx vitest run tests/gov/govJurisdictions.test.ts`
- `npx vitest run tests/gov/govMapContract.test.ts`
- `npx vitest run tests/gov/`
- `npx tsc --noEmit`

No environment variables are required for the map contract itself. Database
access uses the existing server-side Supabase configuration.

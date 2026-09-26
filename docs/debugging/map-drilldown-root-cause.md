# Map Drill-Down Root Cause (verified 2026-09-25 by code inspection + asset checks)

No WebGL runtime exists in this environment, so scene rendering itself
could not be executed here. Every claim below is verified against code,
assets, and live HTTP — not against a rendered frame.

## Reproduction analysis (Delhi click journey)

1. Hover: `onHover3D` raycasts real meshes, brightens + lifts, positions a
   container-relative tooltip. Aggregate branch reads the scoped join;
   unmatched regions show the preview disclaimer. No navigation on hover. OK.
2. Click: `onSelect(name)` fires with the mesh's `ST_NM`. In India level,
   `requestState(name)` starts a 950 ms camera flight (`focusName`), shows
   an "Entering …" live region, then commits `selectState(name)`.
   Reduced-motion and repeat clicks commit instantly. OK by inspection.
3. Name normalization: click names come straight from `india-states.geojson`
   `ST_NM` values, so no normalization is needed on this path; officer-code
   mapping (`STATE_CODE_TO_GEO_NAME`) is only used for aggregate joins and
   maps DL to the exact geometry spelling `NCT of Delhi`.
4. Geometry lookup: `stateShapes` filters the loaded state collection by
   exact `ST_NM`. The asset was fetched live (200, 138,228 bytes) and holds
   36 features. OK when names match.
5. District layer: `india-districts-census2011.geojson` fetched live (200,
   2,356,143 bytes), 641 features validated, ST_NM join verified for 35/36
   states. OK.
6. Remount: scene `key` changes `india` → `state:<name>`; the scene effect
   disposes renderer/materials/listeners on unmount. OK by inspection.
7. Back: breadcrumb + panel close call `selectState(null)` → key returns to
   `india`. In-page back works. Browser back/refresh previously lost state.

## Findings (root causes of "useless" state views)

- **F1 (data, not code): zero geographic aggregates.** All 25 cases have
  NULL state/district, so every drill fetch returns rows=[] and the panel
  says "No scoped aggregate for this region". Geometry still renders, but
  the view feels empty. Fix: honest no-data copy now names the cause
  (no geographic attribution on in-scope cases) instead of implying a
  rendering failure.
- **F2 (checked, NOT a bug): join coverage is 36/36.** All
  `STATE_CODE_TO_GEO_NAME` targets, including DL → `NCT of Delhi`, exist
  verbatim in the geometry asset (verified by script). Delhi aggregates
  join correctly whenever geo-attributed cases exist; today there are none,
  so Delhi honestly shows no data.
- **F3 (real UX gap): refresh/back lost drill state.** Fixed with `?state=`
  URL sync: the page seeds the view from the query string and selection
  updates it (replace, no history spam), so refresh and browser back work.
- **F4 (diagnosability): no click-path telemetry.** Fixed with a
  development-only diagnostics block (mesh → normalized name → matched
  features → district count → scene key → API status), stripped from
  production builds.

## Not a root cause

- Raycast/selection plumbing, remount disposal, tooltip branching,
  permission-gated case rows, and preview-vs-live color semantics were all
  verified correct by inspection and left untouched.
- No fake city polygons were added; the locality level remains an
  aggregate list with an explicit no-geometry note.

# Map Verification (2026-09-25)

## Verified without a browser (code, assets, HTTP, unit tests)

- Assets live: states 138,228 B (36 features), districts 2,356,143 B (641).
- Join 36/36 exact; district ST_NM join 35/36 (Telangana vintage gap, documented).
- Click path: raycast → `requestState` → 950 ms flight (`focusName`) → commit →
  remount (`key` india → `state:<name>`) with disposal; district layer passed
  only in state mode; district clicks ignored for selection (list-driven).
- `?state=` seeding + replace-sync (refresh/back); unknown values → India.
- Reduced-motion instant commit; keyboard state selector; layer toggles
  (cases/districts) with legend/source notes; dev-only click-path diagnostics.
- Permission-gated case rows (server strip + client gate + regression suite).
- `govMapInteraction` suite: 12 tests (join, scales, asset contract, remount
  key, keyboard path) — all passing.

## Manual authenticated steps (requires officer account; needs a WebGL browser)

1. `/gov/geography`: India renders, hover shows state aggregates or the
   preview disclaimer; legend + source + freshness visible.
2. Click Maharashtra: highlight → flight → "Entering…" → state scene with
   35 district shapes + district list; breadcrumb `INDIA > MAHARASHTRA`;
   URL becomes `?state=Maharashtra`.
3. Hover a district: tooltip shows scoped aggregate or the honest
   no-aggregate note (production has no geo-attributed cases today, so
   expect the note — geometry still renders).
4. District list search filters; locality drill shows aggregate list + the
   no-city-polygon note; case rows visible only for case-authorized roles.
5. Back to India (control + breadcrumb + browser back); refresh on
   `?state=` restores the state view.
6. Repeat for Delhi, Uttar Pradesh, Karnataka + two more states.
7. Reduced-motion OS setting → instant transitions; keyboard-only run via
   the state selector; 360p-width responsive check.

Browser-result column: NOT RUN here (no WebGL/browser harness in this
environment). Frame rendering, flight smoothness, and visual polish remain
human-verified-only items.

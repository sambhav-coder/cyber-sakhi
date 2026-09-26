# Current State (verified 2026-09-25)

## Confirmed working (executed, not assumed)

- Gov login/session/MFA/recovery APIs + 45-test session suite.
- Guard/permission/scope enforcement (fail-closed; 307/401 live boundaries).
- Dashboard metrics, explorer (25/25 + Sakhi join), queue, trends, reports dataset — executed live with SUPER_ADMIN/ALL_INDIA fixture.
- Assignment name resolution (fixed; previously always Unassigned).
- Evidence list/detail/custody/integrity, blockchain verify paths (code-verified; 4/5 evidence anchored in prod).
- Reports seal/unseal flow (bcrypt, rate-limit, audit; store migration pending → honest 503).
- Audit center + CSV export (permission-gated).
- External intel ingestion (15,316 records staged) + browser (2,852-row snapshot served live).
- ML rules + LR scorer + evaluation artifacts (tests pin OOD honesty).
- Map assets served live (states 138,228 B; districts 2,356,143 B); join 36/36; district asset 641 features.
- Full suite 788+ tests green (now 324 gov + rest), tsc clean, build green.

## Confirmed broken (fixed this round)

1. Dashboard server-fetch failure rendered all-zero metrics with fresh timestamp (error-to-zero) → now `initialError` + unavailable-state.
2. Assignee names never resolved (fixed prior round; re-verified live).
3. District drill-down leaked case rows to geo-only roles (fixed prior round; re-verified).
4. Trends/queue first-paint "no data" flash → loading-first states.
5. Map drill state lost on refresh/back → `?state=` URL sync.
6. Metric semantics unclear (all-time Total vs windowed cards) → scope/window caption + in-window sub-count.
7. Scope-correct zeros unexplained (e.g., DEMO analyst) → scope-aware empty copy.

## Unverified (no capability here)

- WebGL frame rendering, camera-flight animation smoothness, map visual polish.
- Password-authenticated browser sessions (no officer credentials in repo; fixture-level backend execution + live HTTP boundaries instead).
- District geometry visual alignment beyond vertex/attribute validation.

## Database dependencies / pending migrations

See `docs/migrations/pending-migrations.md`. Nothing auto-applied.

## Reproduction steps (zero-case complaint)

1. Sign in as DEMO-CYB-0001 (ANALYST, STATE/DEMO): every case view shows 0 — correct scope behavior, previously unexplained (now labeled).
2. As SUPER_ADMIN/ALL_INDIA: dashboard shows 25 total with windowed facets; explorer lists 25/25.
3. Break Supabase connectivity (or empty env): dashboard previously showed zeros; now shows "temporarily unavailable" + retry.

## Initial hypotheses ( dispositioned)

- RLS blocking reads: REJECTED (service-role server client bypasses by design).
- INNER JOINs dropping NULL rows: REJECTED (joins post-mapping/LEFT-style; verified live).
- Contract mismatch: REJECTED (shapes verified live).
- Scope filtering + error-to-zero fallback: CONFIRMED (fixed).

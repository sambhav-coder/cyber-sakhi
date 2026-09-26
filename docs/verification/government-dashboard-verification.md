# Dashboard Verification (2026-09-25)

## Live query evidence (temporary harness, real code + live DB, deleted after run)

Scope ALL_INDIA: dashboard today/7d/30d/90d returned totals 25 with windowed
facets 9/14/25/25; explorer 25/25 with Sakhi numbers; queue NEW 25 (5 shown);
trends 25 over 6 days; reports 25/25. NULL threat/risk/geo mapped to
OTHER/Unset/Unknown — rows preserved.

## Page/API boundaries (live dev server)

- `/gov/dashboard`, `/gov/cases`, `/gov/sources`, `/gov/external`, `/gov/ml`,
  `/gov/my-cases`, `/gov/access`, `/gov/admin` → 307 `/gov/login` unauthenticated
- `/gov/api/dashboard|cases|audit|trends|geo`, `/gov/api/reports/unseal`,
  `/gov/api/external/reviews` → 401 unauthenticated
- `/gov/login` → 200; geo assets → 200 byte-exact

## UI states (code-verified + unit/integration-tested)

Loading / success-with-rows / success-zero (scope-aware copy) /
401 / 403 / 500-unavailable / never-loaded-unavailable ("—", not 0).
Metric caption states window + scope + last-load time; Total card is
all-time scoped inventory with in-window sub-count.

## Manual authenticated steps (requires an officer account + MFA)

1. Sign in at `/gov/login`, complete MFA at `/gov/mfa`.
2. `/gov/dashboard`: expect Total = accessible cases; window cards change with Today/7/30/90d; refresh updates the timestamp; kill Supabase access → "temporarily unavailable", never zeros.
3. `/gov/cases`: 25 rows as SUPER_ADMIN; search `CS-2026-9K4MP2`; filter threat/risk/status; paginate; open a case → workspace.
4. As DEMO-CYB-0001: expect scope-labeled zeros (STATE/DEMO), not errors.
5. Queue view switch NEW/TRIAGED/PRIORITY; error retry by stopping the DB.
6. Logout → `/gov/dashboard` redirects to `/gov/login`.

Browser-result column: NOT RUN here (no officer credentials or browser harness
in this environment). The steps above are the exact acceptance script.

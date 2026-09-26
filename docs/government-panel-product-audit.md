# Government Panel — Product Audit (Phase 0)

Date: 2026-09-25
Scope: Authenticated Government Panel ONLY (`/gov/*` after `/gov/login` + MFA).
Out of scope (untouched): `/gov` landing page, normal user profile/dashboard, user-side email forensics.

## 1. Route inventory (actual, verified)

| Route | File | State |
|---|---|---|
| `/gov` landing | `app/gov/page.tsx` | CORRECT — do not touch |
| `/gov/login` + forgot-id/forgot-password/reset-password | `app/gov/login/**` | Working (GovLoginForm, recovery forms, rate-limited APIs) |
| `/gov/mfa` | `app/gov/mfa/page.tsx` | Working (enroll/confirm/status APIs, TOTP) |
| `/gov/layout` | `app/gov/layout.tsx` | Working (metadata + gov.css scope) |
| `/gov/dashboard` (Overview) | `app/gov/dashboard/page.tsx` | PARTIAL — renders `GovDashboardShell` with placeholder cards; real `GovDashboardView` exists but is **orphaned (zero imports)** |
| `/gov/cases` + `/gov/cases/[caseId]` | wired to `GovCaseExplorer` + `GovInvestigationWorkspace` | Working / substantial |
| `/gov/queue` | wired to `GovQueueView` | Functional but minimal table |
| `/gov/indicators` | wired to `GovIndicatorView` | Functional search-only |
| `/gov/geography` | wired to `GovGeographyView` (25KB) + `India3DScene` (32KB) | Substantial 2D/3D implementation |
| `/gov/evidence` | wired to `GovEvidenceListView` + `GovEvidenceView` | Substantial |
| `/gov/trends` | wired to `GovTrendsView` (compact) | Functional but minimal, not full analytics workspace |
| `/gov/reports` | wired to generic `GovDataView` JSON dump | PARTIAL — no floating-letter UI, no per-report lock flow in UI (API supports CSV/PDF export + audit) |
| `/gov/audit` | wired to generic `GovDataView` JSON dump | PARTIAL — no filter bar, detail drawer, export UI (API exists) |
| Identity intelligence | NO dedicated route | MISSING (spec §11 mentions it; only indicator correlations exist) |
| Settings / Administration nav item | `href="#"` in shell | EMPTY placeholder |

## 2. API inventory (`/gov/api/*`)

All guarded by `guardGovApiRequest` / `requireGovApi` (session + `roleHasDefaultPermission`, fail-closed) + `resolveGovScopeFilter` (scope predicate applied first, extra filters only narrow). Denials audited as `authorization.denied`.

| Endpoint | Auth | State |
|---|---|---|
| `login`, `logout`, `session`, `mfa/enroll|confirm|status`, `recovery/*` | session/rate-limit/TOTP | Working |
| `dashboard?range&from&to&state&district` | `case.view_meta` | Working — live scoped aggregates via `govDashboardMetrics` |
| `dashboard/filters?state` | `case.view_meta` | Working — distinct states/districts from scoped cases table |
| `cases`, `cases/[caseId]` + assignment/evidence/location/notes/victim | `case.view_meta` + per-resource scope checks | Working |
| `queue?view=NEW\|TRIAGED\|PRIORITY` | `case.view_meta` | Working |
| `indicators?q=` | `indicator.view` | Working |
| `geo`, `geo/map?state&district&suppressAbove` | `geo.view` | Working — aggregate-only contract, `cases` rows stripped, suppression threshold |
| `evidence`, `evidence/[id]` | `evidence.view` | Working |
| `trends?days` | `analytics.view` | Working — `govTrends` with prev-period comparison |
| `reports` (GET JSON) + POST CSV/PDF export | `report.generate` / `report.export` | Working backend; frontend is raw JSON (no letter UI) |
| `audit` | `audit.view` | Working backend; frontend is raw JSON |
| `current-events`, `cyber-news` | public landing feeds | Working (landing only) |

## 3. Data models

- Supabase Postgres (not Prisma sqlite in this project): `cases` (threat_category, risk_level, gov_status, state_code, district_code, created_at, assigned officer), `gov_officers`, `gov_sessions` (opaque token hash, session_version, idle/absolute expiry, revocation), `gov_mfa`, `gov_audit` (+ persistence layer), `gov_assignments/grants`, evidence + chain-of-custody tables, recovery tokens.
- Dashboard aggregation rules (`govDashboardMetrics`): one increment per case, canonical `mapLegacyThreatCategory` mapping, `HIGH`+`CRITICAL` = highRisk, `UNDER_INVESTIGATION` counted separately, `RESOLVED` vs `open = NOT RESOLVED/CLOSED`. Timezone: ISO strings, `today` = local midnight → now. No double-count within one distribution; cross-distribution counts are independent facets (documented, not double-counting).

## 4. Auth / security posture

- Gov auth is SEPARATE from NextAuth user auth (`middleware.ts` explicitly excludes `/gov`). Opaque session cookie (`govCookie`), hash lookup, officer status, session_version, revocation, idle + absolute expiry (`govSession`).
- Page guard `requireGovPage(permission?)` → redirect `/gov/login`; API guard → 401/403 JSON; unknown roles/permissions denied.
- Scope enforcement `resolveGovScopeFilter` (ALL_INDIA / STATE / DISTRICT / ASSIGNED_CASES) applied server-side before grouping; map endpoint strips row-level `cases`.
- Risks / gaps: (a) dashboard page currently requires NO permission (intentional so all officers see shell, but metrics view must keep its own `case.view_meta` gate); (b) reports/audit JSON dump could expose more fields than a curated UI — mitigated by API scoping but UI should curate columns; (c) no per-report password flow exists — spec §6.3-6.6 requires design decision, do NOT fake encryption.

## 5. What must be implemented (ordered per master prompt)

- PHASE 1 (this task): Wire real Overview — replace shell placeholder with full dashboard (§4A–4H): header (scope, refresh time, refresh button, range selector, export link if `report.export`), 6 metric cards (clickable, skeletons, empty/error, no fake trends), trend strip (live `/gov/api/trends`), category + severity distributions with valid percentages, recent cases table (5, scoped, IDOR-safe links), queue preview (scoped actions), geography preview (aggregate-only + link to `/gov/geography`). No landing/user-profile changes.
- PHASE 3: Trends full workspace (filters affect query, table fallback, aggregation docs).
- PHASE 4–5: Reports letter UI + per-report lock (needs product decision; no fake crypto).
- PHASE 6–8: Map polish/labels/drill-down (already substantial; needs label/contrast/perf QA).
- PHASE 9–12: Indicators, Cases/Queue, Evidence/CoC, Audit completion; Administration + Identity are empty/missing — document blockers, don't fabricate.
- Cross-cutting: no new chart/map libs without bundle/perf review; no secrets in client; `git diff --check`, typecheck, vitest `tests/gov/*`.

## 6. Dashboard implementation plan (Phase 1)

UI: `app/gov/dashboard/page.tsx` (server: `requireGovPage()` + `resolveGovScopeFilter` + `govDashboardMetrics(7d)` + `govDashboardFilterOptions` → props) renders `GovDashboardShell > GovDashboardView` (extended). `GovDashboardView` keeps existing range/state/district controls, adds: header row (title, scope badge, generated-at, Refresh button with loading + duplicate-request guard + error, export link gated by `report.export`), metric cards as `<Link>` to scoped `/gov/cases` / `/gov/queue` (only where permission exists), trend strip from `/gov/api/trends`, distributions with counts + mathematically-valid percentages + total + text summary, recent-cases table (`/gov/api/cases?pageSize=5`), queue preview (`/gov/api/queue?view=NEW&pageSize=5`), geo preview (`/gov/api/geo/map`, top-5 states, suppressed-flag handling, link to full map). Every section: loading skeleton, empty state, error state with retry, responsive grid, `aria-label`s, keyboard-accessible controls. No fake percentages, no random numbers, no decorative filters (all affect backend query), no PII beyond officer name/email already in shell, no case IDs in geo tooltips.

API/DB: none — reuse existing endpoints. Page-level fetch failures degrade to client-side loading (never fabricate success).

Tests: `vitest run tests/gov/govGuard.test.ts tests/gov/govScope.test.ts tests/gov/govPermissions.test.ts` + `tsc --noEmit` + `next lint` (dashboard scope) + manual verification matrix (§3 Phase 6).

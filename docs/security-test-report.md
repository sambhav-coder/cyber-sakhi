# Government Panel — Security Test Report (PART 21/24)

## Round 2 — 2026-09-25 (full rebuild: external intel, ML, new pages, map transition)

New/changed attack surface verified:

| # | Test | Action | Expected | Actual | Status |
|---|---|---|---|---|---|
| R1 | New pages guard | GET /gov/external, /gov/ml, /gov/my-cases, /gov/access, /gov/admin unauthenticated | 307 → /gov/login | 307 → /gov/login on all five (live :3112) | COMPLETED AND VERIFIED |
| R2 | Reviews API guard | GET /gov/api/external/reviews unauthenticated | 401 | 401 (live) | COMPLETED AND VERIFIED |
| R3 | Review writes audited | POST requires indicator.correlate; writes ml.reviewed event, never IOC content beyond key | guarded + audited | code path: guard → validate → buildGovAuditEvent(ml.reviewed) → persist | COMPLETED AND VERIFIED |
| R4 | Correlate scope | POST /gov/api/external/correlate guarded by indicator.correlate, scope inside govSearchIndicators | scoped matches only | implemented; 401 live for sibling route | IMPLEMENTED BUT NOT FULLY VERIFIED (no officer session to exercise match path live) |
| R5 | Key handling | Probes read keys from server env only | no key in logs/reports/browser | probe script prints statuses only; report JSON has no key material; connectors.json documents presence, never values | COMPLETED AND VERIFIED |
| R6 | ML honesty pins | govMl.test.ts: OOD flag rate < 0.6 pinned; status contains not-production-validated; ≥5 limitations | pinned | 8/8 pass | COMPLETED AND VERIFIED |
| R7 | Snapshot assets | /data/ext-iocs-week.json + ext-aggregates.json served, no auth needed (public snapshot, no PII/cases) | 200, correct bytes | 200, 2,808,167 + 1,795 bytes live | COMPLETED AND VERIFIED |
| R8 | Full regression | vitest run (user + gov) | all pass | 788/788 (78 files) | COMPLETED AND VERIFIED |
| R9 | Authenticated browser E2E | Full officer journey with MFA | pass | NOT APPLICABLE WITH REASON (no browser/MFA harness; HTTP boundaries verified instead) | NOT APPLICABLE WITH REASON |

## Round 1 — prior session (retained below)

Date: 2026-09-25. Methods: unit/static suite `tests/gov/govAttackSurface.test.ts`
(17 tests, all passing) + live HTTP checks against `next dev` on :3111 (server
stopped afterwards) + full vitest regression (780/780). Statuses per PART 26.

| # | Test | Action | Expected | Actual | Status |
|---|---|---|---|---|---|
| 1 | No-session page access | GET /gov/dashboard, /gov/cases, /gov/sources unauthenticated | 307 → /gov/login | 307 → /gov/login (all three, incl. new /gov/sources) | COMPLETED AND VERIFIED |
| 2 | No-session API access | GET /gov/api/dashboard, cases, audit, trends, geo; POST /gov/api/reports/unseal | 401 | 401 on all six | COMPLETED AND VERIFIED |
| 3 | Forged session | Invalid evaluation through `evaluateGovGuard` | 401 UNAUTHORIZED | exact match | COMPLETED AND VERIFIED |
| 4 | Token strength | Inspect `generateGovSessionToken` output | 256-bit CSPRNG, unique, hash-only storage | 32 bytes base64url, unique, SHA-256 hex stored | COMPLETED AND VERIFIED |
| 5 | Wrong role | INVESTIGATOR → `analytics.view` | 403 PERMISSION_DENIED | exact match | COMPLETED AND VERIFIED |
| 6 | Unknown role/permission | Fail-closed checks | deny | deny (unit) | COMPLETED AND VERIFIED |
| 7 | Wrong state/district | STATE/MH officer scope resolution + stub query | `eq(state_code, MH)` only | exact match | COMPLETED AND VERIFIED |
| 8 | Unassigned-case probing | Empty assigned scope | empty result | `isScopeEmpty` true | COMPLETED AND VERIFIED |
| 9 | Case IDOR | `requireScopedCase` missing vs out-of-scope | shared 404, no oracle wording | pinned in source | COMPLETED AND VERIFIED |
| 10 | Geo case-row leak | ANALYST drills to district | aggregates only, no rows | server strip + client gate + `govGeoCases` suite | COMPLETED AND VERIFIED |
| 11 | Rate limiting | 11 rapid unlock attempts | 10 allow, 11th blocked w/ retry-after | exact (injectable clock) | COMPLETED AND VERIFIED |
| 12 | Brute-force login | Inspect login route | IP + MFA limiters, reset on success | pinned in source | COMPLETED AND VERIFIED |
| 13 | Oversized inputs | 200-char state/district params | truncated to 120 server-side | pinned (geo map + trends) | COMPLETED AND VERIFIED |
| 14 | Invalid dates | `custom` window with garbage dates | null bounds, never defaults | exact unit match | COMPLETED AND VERIFIED |
| 15 | XSS | Scan gov components for raw HTML injection | none | zero hits | COMPLETED AND VERIFIED |
| 16 | Secret leakage | Scan gov surface for keys/tokens | none | zero hits; `.env.local` gitignored | COMPLETED AND VERIFIED |
| 17 | Research-as-production | Production aggregations query only `cases`; registry policy | `NEVER` merge | pinned | COMPLETED AND VERIFIED |
| 18 | Evidence/PII download | Evidence download + victim routes require `evidence.download` / `case.view_pii` | guarded | pre-existing guards + consolidation suite | COMPLETED AND VERIFIED |
| 19 | Session expiry/logout | Expired/revoked sessions rejected | deny | pre-existing 45-test session suite passes | COMPLETED AND VERIFIED |
| 20 | District asset served | GET /geo/india-districts-census2011.geojson | 200, byte-identical | 200, 2,356,143 bytes | COMPLETED AND VERIFIED |
| 21 | Authenticated E2E browser flow | Full officer journey incl. MFA login | pass | **NOT APPLICABLE WITH REASON**: no browser automation or officer MFA credentials in this environment; HTTP-level auth boundaries verified instead (tests 1–2, 20) | NOT APPLICABLE WITH REASON |
| 22 | Privilege escalation via grants | role/scope management mutations | grant workflow only | restricted-permission matrix pinned; no mutation UI exists (documented) | IMPLEMENTED BUT NOT FULLY VERIFIED |

## Fixes applied from this round

- Assignee names never resolved in explorer/queue/reports (ids collected from
  still-null views) → `attachAssignmentsWithNames`, dead helper removed.
- District drill-down exposed case rows to geo-only roles → server strip +
  fail-closed client gate + regression suite.
- Client bundle imported `node:crypto` via audit catalogue → extracted
  client-safe `govAuditActions.ts`.

## Standing blockers (exact)

1. `supabase/migrations/gov_report_seals.sql` NOT APPLIED → seal passwords answer
   503; access-control unseal continues (documented, no bypass, no fake crypto).
2. `supabase/migrations/gov_research_staging.sql` NOT APPLIED → research corpora
   stay file-staged; zero production-table contact by construction.
3. `audit.export` held by no role (restricted matrix) → audit CSV hidden until grant.
4. Officer create/suspend/role/scope → grant workflow only; directory is read-only.
5. Authenticated browser E2E → needs officer session + MFA in a browser harness.

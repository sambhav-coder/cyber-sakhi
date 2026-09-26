# Zero-Case Root Cause (verified 2026-09-25, live Supabase + real query code)

Method: temporary vitest harness executed the REAL `govDashboardMetrics`,
`govExplorer`, `govQueue`, `govTrends`, `govReportDataset` against live
Supabase with a SUPER_ADMIN/ALL_INDIA fixture. Aggregate diagnostics only.
Harness deleted after the run (not committed).

## Live baseline at diagnosis time

- cases: **25** (was 22 earlier in the week; +3 created since — data moves)
- range 2026-09-14 → 2026-09-25, all status NEW, threat/risk/state/district NULL
- indicators 492, evidence 5 (4 anchored), audit 52, notes 0, assignments 0
- officers: 3× SUPER_ADMIN/ALL_INDIA, 1× ANALYST/STATE scope `DEMO`

## Stage trace (ALL_INDIA scope)

| Stage | today | 7d | 30d | 90d |
|---|---|---|---|---|
| base scoped cases | 25 | 25 | 25 | 25 |
| after window filter (`new`/`windowTotal`) | 9 | 14 | 25 | 25 |
| explorer total/rows | 25/25 | — | — | — |
| queue NEW total/newCases | 25/5 | — | — | — |
| trends total / days | 25 / 6 | — | — | — |
| reports total/rows | 25/25 | — | — | — |
| sakhi join | SAKHI-2026-P9BGC attached | — | — | — |
| assignment join | null (correct: table empty) | — | — | — |

**First stage where valid rows disappear: NONE for ALL_INDIA. The backend
returns real production rows at every stage, including with NULL
threat/risk/geo (mapped to OTHER/Unset/Unknown, never filtered).**

## Actual zero-producing paths (frontend/auth layer, not the query)

1. **Scope-correct zeros (by design, poorly explained).** The ANALYST officer
   (`STATE` scope, `state_code = DEMO`) matches zero cases because every
   case has NULL geography. Every view then renders honest-but-bare zeros.
   A tester logged in as DEMO-CYB-0001 sees "0 cases" everywhere with no
   indication that scope filtering is the cause. NOT a data bug; IS a UX
   honesty bug → fixed with scope-aware empty states naming the scope.
2. **`emptySheet()` error-to-zero fallback (real bug).**
   `app/gov/dashboard/page.tsx` caught ANY server-fetch failure and rendered
   all-zero metrics with a fresh timestamp and no error. A failed query was
   indistinguishable from "0 cases". → Fixed: server failures now surface
   `initialError` and the view renders "temporarily unavailable" instead of zeros.
3. **Window-vs-total confusion.** `total` is an all-time scoped inventory
   while all other cards are windowed; the range selector implied otherwise.
   → Fixed: metric section now captions the active window + scope, and the
   Total card shows its in-window sub-count (`windowTotal`).
4. **Loading-flash empties.** Trends workspace and queue rendered
   "no data" copy before the first fetch resolved. → Fixed with
   loading-first initial states.

## What was NOT the cause

- RLS (server uses the service-role key; RLS bypassed by design for
  service-side scope enforcement — verified in `lib/supabaseServer.ts`).
- INNER JOINs dropping NULL-enriched rows (all joins are post-mapping or
  LEFT-style; the one real join bug — assignee names — was fixed earlier
  and verified: explorer now attaches Sakhi numbers correctly).
- API/frontend contract mismatch (explorer/queue/trends/reports shapes
  verified live against the frontend types).
- user-session overlap (gov cookie is Path=/gov under a gov-only name;
  middleware excludes /gov; verified live: 307/401 boundaries).

## Limitation

No officer password exists in the repo, so no password-authenticated
browser session could be opened here. Backend paths were executed with a
fixture officer through the real guard-adjacent query layer; page/API auth
boundaries were verified live over HTTP (307→login, 401s). Manual
authenticated steps are listed in `docs/verification/government-dashboard-verification.md`.

# Government Panel — Feature Matrix (PART 3 audit)

Date: 2026-09-25. Source: code inspection + live Supabase counts (22 cases, 5 evidence/4 anchored,
492 indicators, 22 email investigations, 4 officers, 46 audit logs, 0 notes, 0 assignments).
Live-data caveat: all 22 cases are status NEW with NULL threat/risk/state/district/source —
triage and geography distributions are honestly empty until triage occurs.

| # | Feature | Existing Status | Required Work | Backend | Frontend | Security | Testing |
|---|---|---|---|---|---|---|---|
| 1 | Gov auth (login/session/logout/MFA) | Implemented + tested | Verify only | done | done | done | done (45 session tests) |
| 2 | Roles/permissions/scope | Implemented, fail-closed | Verify only | done | done | done | done |
| 3 | Shell + navigation | Implemented; Admin link was dead `#` | FIXED: real `/gov/admin` officer directory | done | done | officer.view gate | build |
| 4 | Dashboard | Implemented; needs PART-8 metrics | EXTEND: +Closed/Awaiting/Unassigned/Mine/Triage cards | extend metrics fn | extend view | scope kept | vitest+build |
| 5 | Data pipeline + registry + sources | MISSING | BUILD: import script, registry, staging SQL, `/gov/sources` | new | new | service-role only | script self-checks |
| 6 | Data quality/validation | Partial (policy/threat mappers) | Pipeline validators | new | n/a | n/a | script checks |
| 7 | Case Explorer | Implemented; needs Sakhi#/source/updated cols | EXTEND: batch profile join for sakhi_number | extend explorer | extend table | unchanged | build |
| 8 | Investigation Workspace | Implemented (11KB) | Verify only | done | done | scoped case gate | existing |
| 9 | Forensic findings | Implemented via govCaseDetail | Verify only | done | via reports/workspace | case.view gate | existing |
| 10 | Evidence mgmt + CoC + SHA-256 | Implemented (list/detail/verify) | Verify only | done | done | evidence perms | existing |
| 11 | Blockchain verify | Implemented (Sepolia, real verify) | Verify only | done | done | n/a | existing |
| 12 | Geo intelligence + drill-down | Implemented 3D; state-click keeps India mounted; district geometry absent | FIX: unmount/replace state map (real state geometry); district geo ATTEMPT+DOCKER doc | minor | replace-on-drill | cases stripped for non-case roles (done) | new static test |
| 13 | Indicator intel + correlation | Implemented search; wording "Possible shared" | Minor: loading/initial states (done prev.) | done | done | scoped | existing |
| 14 | Queue + assignment + status | Implemented + audited; assignments table empty in prod | Verify only | done | done | scope-aware | existing |
| 15 | Analytics/trends | Full workspace built | Verify only | done | done | analytics.view | build |
| 16 | Reports CSV/PDF + seals | Implemented + audited; seals table NOT applied | Blocker: `gov_report_seals` migration needs SQL-Editor apply | done | done | documented 503 | existing |
| 17 | Audit logs + export | Center built; export behind restricted audit.export | Verify only | done | done | audit perms | existing |
| 18 | Administration | Directory built; create/suspend behind grant workflow | Documented limitation | n/a | done | officer.view | build |
| 19 | Security testing | Guard/perm/scope suites (287 tests) | ADD attack-surface suite + HTTP checks + report | n/a | n/a | live curl | new tests |
| 20 | E2E browser verification | No browser in env | HTTP-level flow checks (redirects/401s); browser marked NOT-VERIFIED | n/a | n/a | n/a | curl |
| 21 | User regression | Untouched by gov work | Run full suite | n/a | n/a | scan consumers | full vitest |

Out of scope (untouched): `/gov` landing, user profile, user email-forensics, user evidence/blockchain flows.
Pre-existing local changes (voice deletions, avatar backups) preserved, not mine.

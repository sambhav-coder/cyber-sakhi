# Pending Migrations (nothing auto-applied; production views degrade honestly without them)

| File | Table(s) | Status | Behavior when absent | Apply via |
|---|---|---|---|---|
| `supabase/migrations/gov_report_seals.sql` | `gov_report_seals` | NOT APPLIED | `/seal` → 503 SEAL_STORE_UNAVAILABLE; `/unseal` → access-control-only (stated in response + UI) | Supabase SQL Editor, staging first |
| `supabase/migrations/gov_research_staging.sql` | `gov_research_sources`, `gov_research_url_observations` | NOT APPLIED | Research stays file-staged (`docs/datasets/`); panel reads registry; zero production contact | Supabase SQL Editor, staging first |
| `supabase/migrations/gov_external_iocs.sql` | `gov_external_syncs`, `gov_external_iocs` | NOT APPLIED | External IOCs stay file-staged + public snapshots; panel Sources view states file-staged | Supabase SQL Editor, staging first |

All three are additive (IF NOT EXISTS), service-role-only (FORCE RLS, no permissive policies), with fixed NOTIFY reload.
Code detects absence by relation-missing error codes (PGRST205/42P01) and degrades to documented capability states — never silent zeros:
- reports seal/unseal: explicit 503 / `passwordEnforced: false`
- research/external: registry + snapshot surfaces carry STAGED labels
- dashboard/audit/cases/queue/geo: unaffected (no dependency on these tables)

Rollback: drop the new tables (no existing table references them except `gov_external_iocs.ingestion_batch_id → gov_external_syncs`, internal to the migration).

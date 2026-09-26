BEGIN;

-- ============================================================
-- Cyber-Sakhi Government Security Domain — per-report seal store
-- Additive only. New table public.gov_report_seals; every existing
-- table and constraint is untouched. Follows
-- gov_mfa_enrollment_recovery.sql conventions: IF NOT EXISTS, TEXT +
-- CHECK (no enums), FORCE ROW LEVEL SECURITY, grants to service_role
-- only (deny-by-default, no permissive policies).
-- STATUS: NOT YET APPLIED — run in the Supabase SQL Editor (staging
-- first). Until applied, /gov/api/reports/seal answers 503
-- SEAL_STORE_UNAVAILABLE and /gov/api/reports/unseal enforces
-- access-control-only unsealing (documented, never a bypass and never
-- fake encryption: no password is accepted or verified until this
-- table exists).
-- ============================================================

-- One seal row per case: bcrypt hash (cost 12, see
-- lib/gov/govCredentials.ts GOV_BCRYPT_COST) of the report password.
-- Plaintext passwords are never stored, logged, or returned.
CREATE TABLE IF NOT EXISTS public.gov_report_seals (
  case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  set_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gov_report_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_report_seals FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gov_report_seals TO service_role;

-- No permissive policies: reads/writes remain service-role-only, reached
-- exclusively through the Next.js service-role client after the gov
-- session guard (report.generate + scoped case access) passes.

NOTIFY pgrst, 'reload schema';

COMMIT;

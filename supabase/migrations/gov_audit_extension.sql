BEGIN;

-- ============================================================
-- Cyber Sakhi Government Security Domain — audit extension (DRAFT)
-- Additive only. Extends public.audit_logs with nullable government
-- columns; every existing row and constraint is untouched. Follows
-- phase3_audit_logs_and_case_search.sql conventions: IF NOT EXISTS,
-- FORCE ROW LEVEL SECURITY retained, service-role-only grants.
-- STATUS: NOT YET APPLIED — requires D5/D6 schema approval and a
-- disposable staging run first. Run in the Supabase SQL Editor.
-- ============================================================

-- Actor identity: NULL actor_type means a legacy profile-era row.
-- gov_officers rows must never be hard-deleted while audit rows reference
-- them; the RESTRICT rule below encodes that policy in the database.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_type text
  CHECK (actor_type IS NULL OR actor_type IN ('profile','gov_officer','system','unknown'));
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_gov_id uuid
  REFERENCES public.gov_officers(id) ON DELETE RESTRICT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_snapshot jsonb
  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS system_job text NULL;

-- Correlation, approval, outcome, and resource linkage.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS correlation_id text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS approval_reference text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IS NULL OR outcome IN ('allow','deny','error'));
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS denial_reason text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS permission text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS pii_tier text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS evidence_tier text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type text NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id uuid NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS assignment_id uuid NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS grant_id uuid NULL;

-- Idempotency key: UNIQUE only when present, so legacy rows (NULL) are
-- unaffected and duplicate deliveries are rejected at the database.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS idempotency_key text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_idempotency
  ON public.audit_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_gov_actor
  ON public.audit_logs(actor_gov_id, created_at DESC) WHERE actor_gov_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_correlation
  ON public.audit_logs(correlation_id, created_at DESC) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_assignment
  ON public.audit_logs(assignment_id, created_at DESC) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_grant
  ON public.audit_logs(grant_id, created_at DESC) WHERE grant_id IS NOT NULL;

-- Existing RLS posture is unchanged: FORCE ROW LEVEL SECURITY stays on,
-- existing admin/owner SELECT policies stay in force, and writes remain
-- service-role-only. No permissive policies are added here.
-- (Existing GRANT SELECT, INSERT ON public.audit_logs TO service_role
-- already covers the new columns; no new grant is required.)

NOTIFY pgrst, 'reload schema';

COMMIT;

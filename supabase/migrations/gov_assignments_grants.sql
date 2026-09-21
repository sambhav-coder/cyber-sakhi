BEGIN;

-- ============================================================
-- Cyber Sakhi Government Security Domain — assignments + grants
-- Additive and idempotent. Creates ONLY new gov tables; existing public
-- tables, authentication structures, and the gov identity tables are
-- untouched. Conventions mirror gov_identity_sessions.sql and
-- phase3_audit_logs_and_case_search.sql: uuid PKs, timestamptz defaults,
-- TEXT + CHECK (no enums), IF NOT EXISTS everywhere, FORCE ROW LEVEL
-- SECURITY, grants to service_role only (deny-by-default, no policies).
-- Run in the Supabase SQL Editor. NOT YET APPLIED — staging first.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Case assignments: historical, append-only lifecycle.
--   ACTIVE -> REVOKED | EXPIRED | COMPLETED (never back to ACTIVE, never
--   extended in place; renewal always inserts a new row).
-- Officer history survives deactivation: officer FKs use RESTRICT (hard
-- delete of an officer with assignments is blocked) and SET NULL only for
-- attribution columns. expires_at is NOT NULL (D1: no permanent rows).
-- Single-primary and no-duplicate-active rules are partial unique indexes
-- so concurrent inserts fail closed instead of silently overwriting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  assigned_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('PRIMARY','SUPPORTING')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED','COMPLETED')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 4 AND 500),
  ticket text NULL CHECK (ticket IS NULL OR char_length(ticket) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  revoke_reason text NULL,
  completed_at timestamptz NULL
);

-- Exactly one ACTIVE PRIMARY per case (concurrent duplicates fail closed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_assignments_single_primary
  ON public.case_assignments(case_id)
  WHERE assignment_type = 'PRIMARY' AND status = 'ACTIVE';

-- No duplicate ACTIVE rows for the same officer on the same case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_assignments_no_dup_active
  ON public.case_assignments(case_id, officer_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_case_assignments_officer
  ON public.case_assignments(officer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_case_assignments_case
  ON public.case_assignments(case_id, status);

ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_assignments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.case_assignments TO service_role;

-- ---------------------------------------------------------------------------
-- Government grants: time-bound, case-bound capability exceptions within an
-- officer's existing permission set (D2). Grants never widen role,
-- jurisdiction, assignment, or scope authorization; that enforcement lives
-- in Unit 4B predicates. Statuses: PENDING -> ACTIVE -> EXPIRED | REVOKED.
-- Dual approval (approver + second_approver) is required for tiers 3-5 and
-- is enforced at the helper layer; the columns exist for all tiers.
-- Permission strings are validated against the frozen catalogue in code, so
-- no CHECK list here that could drift from lib/gov/govPermissions.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  permission text NOT NULL,
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 5),
  scope text NOT NULL CHECK (scope IN ('ALL_INDIA','STATE','DISTRICT','ASSIGNED_CASES')),
  state_code text NULL,
  district_code text NULL,
  case_id uuid NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 4 AND 500),
  ticket text NOT NULL CHECK (char_length(ticket) BETWEEN 1 AND 120),
  grantor_id uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  approver_id uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  second_approver_id uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  mfa_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','EXPIRED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  revoke_reason text NULL
);

-- No duplicate ACTIVE grants for the same officer + permission + case scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_grants_no_dup_active
  ON public.gov_grants(officer_id, permission, COALESCE(case_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_gov_grants_officer
  ON public.gov_grants(officer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_gov_grants_case
  ON public.gov_grants(case_id, status) WHERE case_id IS NOT NULL;

ALTER TABLE public.gov_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_grants TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

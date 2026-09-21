BEGIN;

-- ============================================================
-- Cyber Sakhi Government Admin Panel — schema batch
--
-- Additive and idempotent. Extends existing public tables only:
--   * public.cases       — admin investigation fields (geo, risk,
--                          pipeline status, PII, incident context)
--   * public.audit_logs  — government actor extension columns +
--                          widened entity CHECK (gov events)
-- New tables (gov_ prefixed, same conventions as
-- gov_identity_sessions.sql / gov_assignments_grants.sql):
--   * public.gov_case_notes     — attributed, append-only investigation notes
--   * public.gov_report_exports — reproducible report/export ledger
-- Existing tables, constraints, RLS posture, and service-role-only
-- grants are retained. No permissive policies are added.
-- Run in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Cases: admin investigation columns.
-- All nullable unless a default is sensible; existing rows get defaults
-- (gov_status 'NEW') and admin derives geo/risk from available data until
-- officers set explicit values. PII fields are tiered by lib/gov policy —
-- the UI never renders them without the case.view_pii permission.
-- ---------------------------------------------------------------------------

-- Jurisdiction / geography (state_code / district_code use LGD-style codes).
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS state_code text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS district_code text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS sub_division text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS locality text NULL;

-- Threat classification + risk. risk_level is an officer-set override;
-- when NULL the admin layer derives a level from algorithms/severity.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS threat_category text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS risk_level text NULL
  CHECK (risk_level IS NULL OR risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL'));

-- Government investigation pipeline status (distinct from the user-facing
-- `status` column, which continues to reflect the data-subject lifecycle).
-- Every existing case is placed at NEW; transitions are recorded in
-- audit_logs so history is reconstructable without mutating columns.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS gov_status text NOT NULL DEFAULT 'NEW'
  CHECK (gov_status IN ('NEW','TRIAGED','ASSIGNED','UNDER_INVESTIGATION','AWAITING_EVIDENCE','RESOLVED','CLOSED'));

-- Incident context.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS incident_date timestamptz NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS incident_summary text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS incident_channel text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS loss_amount numeric NULL
  CHECK (loss_amount IS NULL OR loss_amount >= 0);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS currency text NULL
  CHECK (currency IS NULL OR char_length(currency) <= 8);

-- Victim PII (tier-gated; not surfaced without case.view_pii).
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_name text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_phone text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_email text NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_age text NULL;

-- Origin of the case record (email_forensics | gmail | manual | reporter).
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_source text NULL;

-- Admin query indexes (geo filters, queue, risk, search ordering).
CREATE INDEX IF NOT EXISTS idx_cases_state ON public.cases(state_code, district_code);
CREATE INDEX IF NOT EXISTS idx_cases_district ON public.cases(district_code);
CREATE INDEX IF NOT EXISTS idx_cases_gov_status ON public.cases(gov_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_risk ON public.cases(risk_level);
CREATE INDEX IF NOT EXISTS idx_cases_threat_category ON public.cases(threat_category);
CREATE INDEX IF NOT EXISTS idx_cases_created_desc ON public.cases(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_case_number ON public.cases(case_number);

-- ---------------------------------------------------------------------------
-- 2. Audit log: government actor extension (supersedes the unapplied
-- gov_audit_extension.sql draft, but remains a pure superset — any prior
-- partial application is safe because every ALTER is IF NOT EXISTS).
-- ---------------------------------------------------------------------------

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

-- Widen the entity CHECK so government events record their true subject
-- instead of being forced into a profile-era value. Drop-then-add with an
-- explicit name keeps this idempotent across re-runs.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_entity_check CHECK
  (entity IN ('case','investigation','evidence','report','user','search',
              'gov_auth','gov_session','gov_case','gov_evidence','gov_report',
              'gov_admin','gov_grant','gov_assignment','system'));

-- Government audit query indexes (actor, correlation, linkage, permission).
CREATE INDEX IF NOT EXISTS idx_audit_gov_actor
  ON public.audit_logs(actor_gov_id, created_at DESC) WHERE actor_gov_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_correlation
  ON public.audit_logs(correlation_id, created_at DESC) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_assignment
  ON public.audit_logs(assignment_id, created_at DESC) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_grant
  ON public.audit_logs(grant_id, created_at DESC) WHERE grant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_permission
  ON public.audit_logs(permission, created_at DESC) WHERE permission IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON public.audit_logs(resource_type, resource_id, created_at DESC)
  WHERE resource_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_outcome
  ON public.audit_logs(outcome, created_at DESC) WHERE outcome IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Government case notes: attributed, append-only investigation notes.
-- Edits are flagged (is_edited) and audited; content is NOT PII-masked here
-- because notes are written by authorised officers for investigation use and
-- are gated by case.view_pii at the UI layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_case_notes_case
  ON public.gov_case_notes(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_case_notes_officer
  ON public.gov_case_notes(officer_id, created_at DESC);

ALTER TABLE public.gov_case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_case_notes FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_case_notes TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Government report/export ledger: reproducible record of every report
-- generated and every export download by a government officer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  report_type text NOT NULL CHECK (report_type IN ('QUEUE','TRENDS','GEOGRAPHY','CASES','EVIDENCE','INDICATORS','AUDIT_LOG')),
  format text NOT NULL CHECK (format IN ('CSV','PDF')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count int NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  file_name text NULL,
  checksum text NULL,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_report_exports_officer
  ON public.gov_report_exports(officer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_report_exports_type
  ON public.gov_report_exports(report_type, created_at DESC);

ALTER TABLE public.gov_report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_report_exports FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_report_exports TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
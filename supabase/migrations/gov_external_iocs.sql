BEGIN;

-- ============================================================
-- Cyber-Sakhi Government Security Domain — external IOC staging
-- Additive only. Two new tables; every existing table is untouched.
-- Follows gov_mfa_enrollment_recovery.sql conventions: IF NOT EXISTS,
-- FORCE ROW LEVEL SECURITY, grants to service_role only
-- (deny-by-default, no permissive policies).
-- STATUS: NOT YET APPLIED — run in the Supabase SQL Editor (staging
-- first). Until applied, external IOCs live as versioned file artifacts
-- (docs/datasets/ext-intel-YYYYMMDD/ + public/data snapshots) and the
-- panel reads those snapshots. IOCs NEVER enter production case tables
-- before or after this migration; sync writes go through guarded
-- service-role routes only.
-- ============================================================

-- Sync batches: one row per ingestion run (manual or scheduled).
CREATE TABLE IF NOT EXISTS public.gov_external_syncs (
  batch_id text PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'scheduled')),
  status_by_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  record_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0
);

-- Normalized external IOCs (PART 6 schema). No case linkage by design:
-- no case_id, no victim fields. Unique key per source+type+value makes
-- re-runs idempotent (upsert target).
CREATE TABLE IF NOT EXISTS public.gov_external_iocs (
  record_key text PRIMARY KEY,
  source text NOT NULL,
  source_record_id text NOT NULL,
  indicator_type text NOT NULL CHECK (indicator_type IN ('url', 'domain', 'ip', 'md5', 'hash-sha256', 'hash-sha1', 'email')),
  normalized_value text NOT NULL,
  first_seen timestamptz NULL,
  last_seen timestamptz NULL,
  observed_at timestamptz NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  malware_family text NULL,
  threat_category text NOT NULL DEFAULT 'UNSPECIFIED',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NULL,
  status text NULL,
  expiration timestamptz NULL,
  revocation text NULL,
  source_url text NULL,
  reporter text NULL,
  raw_record_hash text NOT NULL,
  ingestion_batch_id text NOT NULL REFERENCES public.gov_external_syncs(batch_id) ON DELETE RESTRICT,
  lifecycle text NOT NULL DEFAULT 'imported',
  enrichment_status text NOT NULL DEFAULT 'pending',
  enrichment jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_iocs_source
  ON public.gov_external_iocs(source, indicator_type);
CREATE INDEX IF NOT EXISTS idx_ext_iocs_observed
  ON public.gov_external_iocs(observed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ext_iocs_value
  ON public.gov_external_iocs(indicator_type, normalized_value);

ALTER TABLE public.gov_external_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_syncs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_iocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_iocs FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_external_syncs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gov_external_iocs TO service_role;

-- No permissive policies: service-role-only, reached exclusively through
-- guarded gov routes after session + indicator permission checks.

NOTIFY pgrst, 'reload schema';

COMMIT;

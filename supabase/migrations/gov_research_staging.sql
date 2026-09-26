BEGIN;

-- ============================================================
-- Cyber-Sakhi Government Security Domain — research staging tables
-- Additive only. Two new tables; every existing table is untouched.
-- Follows gov_mfa_enrollment_recovery.sql conventions: IF NOT EXISTS,
-- FORCE ROW LEVEL SECURITY, grants to service_role only
-- (deny-by-default, no permissive policies).
-- STATUS: NOT YET APPLIED — run in the Supabase SQL Editor (staging
-- first). Until applied, research datasets live as versioned file
-- artifacts under docs/datasets/ + registry.json, and the panel Data
-- Sources view reads that registry. Nothing research enters
-- production case tables before or after this migration.
-- ============================================================

-- Dataset/source registry (PART 4.4): one row per imported dataset.
CREATE TABLE IF NOT EXISTS public.gov_research_sources (
  id text PRIMARY KEY,
  source_name text NOT NULL,
  source_url text NOT NULL,
  dataset_name text NOT NULL,
  version_date text NULL,
  download_timestamp timestamptz NULL,
  license text NOT NULL,
  file_checksum_sha256 text NULL,
  schema_version text NULL,
  import_status text NOT NULL DEFAULT 'staged',
  source_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  transform_version text NULL,
  geographic_coverage text NULL,
  date_coverage text NULL,
  classification text NOT NULL DEFAULT 'RESEARCH' CHECK (classification = 'RESEARCH'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normalized research URL observations (UCI-327 corpus). Deliberately
-- WITHOUT case linkage: no case_id, no victim fields, no jurisdiction.
CREATE TABLE IF NOT EXISTS public.gov_research_url_observations (
  row_id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES public.gov_research_sources(id) ON DELETE CASCADE,
  features jsonb NOT NULL,
  label_original integer NOT NULL,
  label_normalized text NOT NULL CHECK (label_normalized IN ('PHISHING', 'LEGITIMATE')),
  label_basis text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_obs_source
  ON public.gov_research_url_observations(source_id);

ALTER TABLE public.gov_research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_research_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gov_research_url_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_research_url_observations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_research_sources TO service_role;
GRANT SELECT, INSERT ON public.gov_research_url_observations TO service_role;

-- No permissive policies: reads/writes remain service-role-only, reached
-- exclusively through guarded gov routes after session/permission checks.

NOTIFY pgrst, 'reload schema';

COMMIT;

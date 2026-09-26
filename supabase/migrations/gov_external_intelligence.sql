BEGIN;

-- External intelligence is deliberately isolated from public.cases. Apply in
-- Supabase before enabling any connector. No permissive RLS policies exist.
CREATE TABLE IF NOT EXISTS public.gov_external_intel_sources (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  classification text NOT NULL CHECK (classification = 'EXTERNAL_INTELLIGENCE'),
  enabled boolean NOT NULL DEFAULT false,
  last_success_at timestamptz NULL,
  last_attempt_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gov_external_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.gov_external_intel_sources(id) ON DELETE RESTRICT,
  source_record_id text NOT NULL,
  indicator_type text NOT NULL CHECK (indicator_type IN ('URL','DOMAIN','IP','HASH')),
  indicator_value text NOT NULL,
  indicator_sha256 text NOT NULL,
  masked_value text NOT NULL,
  observed_at timestamptz NULL,
  fetched_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','UNKNOWN','REVOKED','EXPIRED')),
  confidence text NULL,
  source_reference text NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NULL,
  UNIQUE(source_id, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_external_indicator_source_freshness
  ON public.gov_external_indicators(source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_indicator_digest
  ON public.gov_external_indicators(indicator_sha256);

CREATE TABLE IF NOT EXISTS public.gov_external_intel_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.gov_external_intel_sources(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  fetched_count integer NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  upserted_count integer NOT NULL DEFAULT 0 CHECK (upserted_count >= 0),
  error_code text NULL,
  error_detail text NULL,
  initiated_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL
);

ALTER TABLE public.gov_external_intel_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_intel_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_indicators FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_intel_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_external_intel_ingestions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_external_intel_sources TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gov_external_indicators TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gov_external_intel_ingestions TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

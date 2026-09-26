-- Government GIS location provenance.
-- This is deliberately independent of case_locations (live GPS captures)
-- and of indicator/IP enrichment.  A case is placed on the Government map
-- only from the jurisdiction fields on public.cases; IP geolocation never
-- writes this column or state/district/locality.

BEGIN;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS location_source text NULL
  CHECK (location_source IS NULL OR location_source IN (
    'CASE_REPORTED',
    'CASE_DATABASE',
    'VERIFIED_GEOCODE',
    'DISTRICT_MAPPING',
    'CITY_MAPPING',
    'UNKNOWN'
  ));

COMMENT ON COLUMN public.cases.location_source IS
  'Provenance for jurisdiction fields only. Never set from IP/indicator geolocation.';

CREATE INDEX IF NOT EXISTS idx_cases_location_source
  ON public.cases(location_source) WHERE location_source IS NOT NULL;

COMMIT;

BEGIN;

-- Secure one-time live-location captures, case-scoped and user-owned.
-- Additive and idempotent. No existing table is modified.
--
-- Privacy design:
--   * One row per explicit user capture (no background tracking table).
--   * Ownership is enforced in application code (created_by + case scoping);
--     the service-role key used server-side bypasses RLS by design, so no
--     RLS policies are declared here to avoid a false sense of row security.
--   * Retention follows the audit-log policy; see purge_case_locations().
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.case_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  accuracy_m numeric(10, 2) NULL,
  source text NOT NULL DEFAULT 'gps' CHECK (source IN ('gps', 'manual')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_locations_latitude_range CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT case_locations_longitude_range CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT case_locations_accuracy_range CHECK (accuracy_m IS NULL OR (accuracy_m >= 0 AND accuracy_m <= 100000))
);

CREATE INDEX IF NOT EXISTS idx_case_locations_case_created
  ON public.case_locations (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_locations_actor
  ON public.case_locations (actor_id);

-- Retention helper (mirrors purge_expired_audit_logs): keeps 365 days.
CREATE OR REPLACE FUNCTION public.purge_case_locations(retention_days integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.case_locations
  WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMIT;

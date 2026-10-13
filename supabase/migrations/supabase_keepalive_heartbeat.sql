BEGIN;

-- ============================================================
-- Supabase keep-alive heartbeat (read-only)
-- Additive and idempotent. Creates ONLY the new heartbeat table;
-- existing tables, RLS posture, grants, and policies are untouched.
-- Run once in the Supabase SQL Editor, then leave the scheduled
-- GitHub Actions workflow to perform one minimal SELECT per run.
--
-- Least-privilege properties:
--   * Contains NO application data and NO PII (single static row).
--   * ROW LEVEL SECURITY enabled + FORCED (deny-by-default).
--   * Exactly ONE policy: SELECT for anon/authenticated only.
--   * anon/authenticated receive GRANT SELECT only — no INSERT,
--     UPDATE, DELETE, TRUNCATE, or DDL is possible with the
--     publishable/anon key, even if the keep-alive configuration
--     is accidentally reused elsewhere.
--   * The scheduled workflow MUST use the publishable/anon key only.
--     Never use SUPABASE_SERVICE_ROLE_KEY / secret keys here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supabase_keepalive_heartbeat (
  id int PRIMARY KEY CHECK (id = 1),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT 'read-only keepalive marker (no PII)'
);

-- Single static row; no sensitive information.
INSERT INTO public.supabase_keepalive_heartbeat (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.supabase_keepalive_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supabase_keepalive_heartbeat FORCE ROW LEVEL SECURITY;

-- Deny-by-default, then allow SELECT only for the least-privileged roles.
REVOKE ALL ON public.supabase_keepalive_heartbeat FROM public;
REVOKE ALL ON public.supabase_keepalive_heartbeat FROM anon, authenticated;
GRANT SELECT ON public.supabase_keepalive_heartbeat TO anon, authenticated;
-- service_role bypasses RLS by design; grant kept explicit for clarity.
GRANT SELECT ON public.supabase_keepalive_heartbeat TO service_role;

DROP POLICY IF EXISTS supabase_keepalive_heartbeat_anon_select
  ON public.supabase_keepalive_heartbeat;
CREATE POLICY supabase_keepalive_heartbeat_anon_select
  ON public.supabase_keepalive_heartbeat
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.supabase_keepalive_heartbeat IS
  'Read-only keep-alive marker. Single row, no PII, no application data. Anon SELECT only.';
COMMENT ON COLUMN public.supabase_keepalive_heartbeat.id IS
  'Always 1. CHECK constraint prevents additional rows via any future write path.';
COMMENT ON COLUMN public.supabase_keepalive_heartbeat.heartbeat_at IS
  'Row creation timestamp. Never updated by the keep-alive workflow (SELECT only).';
COMMENT ON COLUMN public.supabase_keepalive_heartbeat.note IS
  'Static marker text. Contains no sensitive information.';

NOTIFY pgrst, 'reload schema';

COMMIT;

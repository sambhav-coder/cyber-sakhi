BEGIN;

-- Phase 3: audit trail + case search
-- Additive and idempotent, same rules as phase 2. Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Audit log: every sensitive action (case viewed, evidence locked, report
-- exported, search performed) is recorded with an opaque, PII-redacted
-- payload. Retention is handled by purge_expired_audit_logs(), and the
-- evidence locker owns raw artifacts via chain-of-custody (not here).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('case','investigation','evidence','report','user','search')),
  entity_id uuid,
  case_id uuid,
  remote_ip text,
  user_agent text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  redacted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_case ON public.audit_logs(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select ON public.audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND lower(p.role) = 'admin'));

DROP POLICY IF EXISTS audit_logs_owner_select ON public.audit_logs;
CREATE POLICY audit_logs_owner_select ON public.audit_logs FOR SELECT
  USING (actor_id = auth.uid());

-- Retention: audit rows live for the window below, then are removed. The
-- stored payload is already redacted at write time, so deletion is safe.
CREATE OR REPLACE FUNCTION public.purge_expired_audit_logs(retention_days int DEFAULT 365)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  n int;
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_audit_logs(int) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_logs(int) TO service_role;

-- ---------------------------------------------------------------------------
-- Case search: trigram GIN index + parameterized, ownership-scoped function.
-- term is passed as a bind parameter (never string-concatenated into SQL);
-- SECURITY INVOKER + created_by = owner keeps it scoped to the caller.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_cases_search_trgm ON public.cases
  USING GIN ((coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(case_number, '')) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_cases(owner_at uuid, search_term text DEFAULT NULL, max_rows int DEFAULT 25)
RETURNS TABLE (
  id uuid, case_number text, title text, description text, threat_type text,
  status text, severity text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT c.id, c.case_number, c.title, c.description, c.threat_type, c.status,
         c.severity, c.created_at, c.updated_at
  FROM public.cases c
  WHERE c.created_by = owner_at
    AND (
      search_term IS NULL
      OR btrim(search_term) = ''
      OR c.case_number ILIKE '%' || search_term || '%'
      OR c.title ILIKE '%' || search_term || '%'
      OR c.description ILIKE '%' || search_term || '%'
      OR c.threat_type ILIKE '%' || search_term || '%'
    )
  ORDER BY c.created_at DESC
  LIMIT greatest(1, least(max_rows, 50));
$$;

REVOKE ALL ON FUNCTION public.search_cases(uuid,text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_cases(uuid,text,int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
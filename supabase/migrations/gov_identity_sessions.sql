BEGIN;

-- ============================================================
-- Cyber Sakhi Government Security Domain — identity + sessions
-- Additive and idempotent. Creates ONLY new gov_* tables; existing
-- public tables and authentication structures are untouched.
-- Conventions mirror phase3_audit_logs_and_case_search.sql:
--   uuid PKs, timestamptz defaults, TEXT + CHECK (no enums),
--   IF NOT EXISTS everywhere, FORCE ROW LEVEL SECURITY,
--   grants to service_role only (deny-by-default, no policies).
-- Run in the Supabase SQL Editor.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Government officers: identity + role + jurisdiction scope.
-- Secrets live in gov_credentials; sessions in gov_sessions. Email is TEXT
-- (no citext extension); callers normalize (trim + lowercase) and the unique
-- index on lower(official_email) enforces case-insensitive uniqueness.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_code text NOT NULL,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  official_email text NOT NULL,
  official_phone text NULL,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN','STATE_ADMIN','DISTRICT_OFFICER','INVESTIGATOR','ANALYST','AUDITOR')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')),
  department text NULL CHECK (department IS NULL OR char_length(department) <= 120),
  scope text NOT NULL CHECK (scope IN ('ALL_INDIA','STATE','DISTRICT','ASSIGNED_CASES')),
  state_code text NULL,
  district_code text NULL,
  session_version int NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NULL,
  created_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  deactivated_at timestamptz NULL,
  deactivated_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  deactivation_reason text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_officers_code ON public.gov_officers(lower(officer_code));
CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_officers_email_lower ON public.gov_officers(lower(official_email));
CREATE INDEX IF NOT EXISTS idx_gov_officers_status ON public.gov_officers(status);
CREATE INDEX IF NOT EXISTS idx_gov_officers_scope ON public.gov_officers(scope, state_code, district_code);

ALTER TABLE public.gov_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_officers FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_officers TO service_role;

-- ---------------------------------------------------------------------------
-- Government credentials: password hash + lockout state. One row per officer.
-- No MFA secrets in this unit (deferred to a separately approved design).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_credentials (
  officer_id uuid PRIMARY KEY REFERENCES public.gov_officers(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  must_rotate boolean NOT NULL DEFAULT false,
  cred_status text NOT NULL DEFAULT 'ACTIVE' CHECK (cred_status IN ('ACTIVE','LOCKED','EXPIRED','REVOKED')),
  failed_attempts int NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gov_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_credentials FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_credentials TO service_role;

-- ---------------------------------------------------------------------------
-- Government sessions: one row per opaque session token. Only the SHA-256
-- hash of the token is stored (never the raw token). mfa_level starts at
-- 'pwd'; step-up verification timestamps gate sensitive actions in a later
-- authorization unit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  session_version int NOT NULL CHECK (session_version >= 1),
  mfa_level text NOT NULL DEFAULT 'pwd' CHECK (mfa_level IN ('pwd','pwd+otp','pwd+passkey')),
  mfa_verified_at timestamptz NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES public.gov_officers(id) ON DELETE SET NULL,
  revoke_reason text NULL,
  ip inet NULL,
  user_agent text NULL CHECK (user_agent IS NULL OR char_length(user_agent) <= 300)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_sessions_token_hash ON public.gov_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_gov_sessions_officer_expiry ON public.gov_sessions(officer_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_gov_sessions_expiry_live ON public.gov_sessions(expires_at) WHERE revoked_at IS NULL;

ALTER TABLE public.gov_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gov_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- Retention: remove sessions that expired or were revoked longer ago than
-- the retention window (proposed: 90 days). Audit-relevant login/logout
-- events must be recorded in audit logs separately; row deletion here only
-- removes idle session state, following purge_expired_audit_logs().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_gov_sessions(retention_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  n int;
BEGIN
  DELETE FROM public.gov_sessions
  WHERE (expires_at < now() - make_interval(days => retention_days))
     OR (revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => retention_days));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_gov_sessions(int) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_expired_gov_sessions(int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

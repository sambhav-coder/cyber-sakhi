BEGIN;

-- ============================================================
-- Cyber Sakhi Government Security Domain — MFA factors (self-
-- sufficient), enrollment, recovery codes, and password resets.
--
-- WHY THIS FILE IS SELF-SUFFICIENT: the factors table was defined in
-- gov_totp_mfa.sql, but on databases where that migration was never
-- applied the original enrollment migration failed with
--   ERROR 42P01: relation "public.gov_mfa_factors" does not exist
-- because its first statements ALTER a table that is not there.
-- This file therefore ENSURES the factors table first (identical
-- definition), then applies the enrollment delta. It converges to the
-- same schema whether gov_totp_mfa.sql runs before, after, or never:
-- every statement is IF NOT EXISTS / re-runnable DDL.
--
-- Additive and idempotent. Creates no duplicate tables, drops nothing,
-- preserves existing rows. Existing gov_officers / gov_credentials /
-- gov_sessions / gov_grants / audit_logs tables are untouched.
-- Conventions mirror gov_identity_sessions.sql: uuid PKs, timestamptz
-- defaults, TEXT + CHECK (no enums), FORCE ROW LEVEL SECURITY,
-- grants to service_role only (deny-by-default, no policies).
-- Run in the Supabase SQL Editor. Do NOT run against production
-- without the approved review for that environment.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure gov_mfa_factors exists. Definition matches gov_totp_mfa.sql
--    EXCEPT enabled_at is nullable (see step 2): a first-time enrollment
--    stores NULL here until the officer proves possession with an
--    authenticator code. No plaintext secret is ever stored — only the
--    AES-256-GCM ciphertext produced server-side with
--    GOV_MFA_ENCRYPTION_KEY.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_mfa_factors (
  officer_id uuid PRIMARY KEY REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  secret_ciphertext text NOT NULL,
  enabled_at timestamptz NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Relax enabled_at where the table pre-existed from gov_totp_mfa.sql
--    (which declared it NOT NULL). Additive-safe: DROP NOT NULL deletes
--    no data and changes no values. Required: first-time enrollments
--    upsert enabled_at = NULL while the pending secret awaits
--    confirmation; with NOT NULL that upsert fails and no new officer
--    could ever enroll. Re-running is a harmless no-op.
-- ---------------------------------------------------------------------------
ALTER TABLE public.gov_mfa_factors ALTER COLUMN enabled_at DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Pending enrollment columns. A pending secret lives ONLY here until
--    confirmation; the active factor (secret_ciphertext + enabled_at)
--    keeps working untouched until then.
-- ---------------------------------------------------------------------------
ALTER TABLE public.gov_mfa_factors
  ADD COLUMN IF NOT EXISTS pending_secret_ciphertext text NULL;
ALTER TABLE public.gov_mfa_factors
  ADD COLUMN IF NOT EXISTS pending_created_at timestamptz NULL;

ALTER TABLE public.gov_mfa_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_mfa_factors FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_mfa_factors TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Recovery codes: one row per code, single-use via used_at. Only the
--    SHA-256 hash is stored; plaintext is shown to the officer exactly
--    once at enrollment confirmation and never persisted or logged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_recovery_codes_hash
  ON public.gov_recovery_codes(officer_id, code_hash);
CREATE INDEX IF NOT EXISTS idx_gov_recovery_codes_officer
  ON public.gov_recovery_codes(officer_id) WHERE used_at IS NULL;

ALTER TABLE public.gov_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_recovery_codes FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gov_recovery_codes TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Password-reset tokens: short-lived, single-use. Only the SHA-256 hash
--    of the token is stored; the raw token travels once from the issuing
--    administrator to the officer over an out-of-band channel. Consumed or
--    expired rows are inert. Retention cleanup below purges them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.gov_officers(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_password_resets_token
  ON public.gov_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_gov_password_resets_officer
  ON public.gov_password_resets(officer_id, expires_at) WHERE used_at IS NULL;

ALTER TABLE public.gov_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_password_resets FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gov_password_resets TO service_role;

-- Retention: purge consumed/expired reset tokens and used recovery codes
-- older than the retention window (proposed: 90 days). Audit events for
-- reset request/completion live separately in audit_logs and are NOT
-- affected by this purge.
CREATE OR REPLACE FUNCTION public.purge_expired_gov_recovery(retention_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  n int := 0;
  m int := 0;
BEGIN
  DELETE FROM public.gov_password_resets
  WHERE used_at IS NOT NULL
     OR expires_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.gov_recovery_codes
  WHERE used_at IS NOT NULL AND used_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_gov_recovery(int) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_expired_gov_recovery(int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

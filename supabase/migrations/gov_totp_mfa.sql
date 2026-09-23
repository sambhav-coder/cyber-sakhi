BEGIN;

-- One encrypted TOTP factor per officer. Secrets are AES-256-GCM encrypted
-- by the server with GOV_MFA_ENCRYPTION_KEY; no plaintext secret is stored.
CREATE TABLE IF NOT EXISTS public.gov_mfa_factors (
  officer_id uuid PRIMARY KEY REFERENCES public.gov_officers(id) ON DELETE RESTRICT,
  secret_ciphertext text NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gov_mfa_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_mfa_factors FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.gov_mfa_factors TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

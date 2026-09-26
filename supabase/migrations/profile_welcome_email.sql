-- Persistent welcome-email idempotency state. This is intentionally stored
-- server-side; browser state must never decide transactional mail delivery.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_welcome_email_pending
  ON public.profiles(created_at)
  WHERE welcome_email_sent_at IS NULL;

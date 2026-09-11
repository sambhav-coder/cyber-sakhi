BEGIN;

-- Phase 2: case-centric forensic pipeline
-- Additive and idempotent. Existing tables are only extended (new columns),
-- never altered in place. Run this in the Supabase SQL Editor.

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS threat_type text;
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON public.cases(created_by);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);

CREATE INDEX IF NOT EXISTS idx_email_inv_created_by ON public.email_investigations(created_by);
CREATE INDEX IF NOT EXISTS idx_email_inv_case ON public.email_investigations(case_id);

ALTER TABLE public.indicators ADD COLUMN IF NOT EXISTS case_id uuid;
CREATE INDEX IF NOT EXISTS idx_indicators_investigation ON public.indicators(investigation_id);
CREATE INDEX IF NOT EXISTS idx_indicators_case ON public.indicators(case_id);

ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS evidence_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_code ON public.evidence(evidence_code) WHERE evidence_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON public.evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON public.evidence(case_id);

CREATE INDEX IF NOT EXISTS idx_reports_generated_by ON public.reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_reports_case ON public.reports(case_id);

ALTER TABLE public.evidence DROP CONSTRAINT IF EXISTS evidence_case_id_fkey;
ALTER TABLE public.evidence ADD CONSTRAINT evidence_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.email_investigations DROP CONSTRAINT IF EXISTS email_investigations_case_id_fkey;
ALTER TABLE public.email_investigations ADD CONSTRAINT email_investigations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.indicators DROP CONSTRAINT IF EXISTS indicators_case_id_fkey;
ALTER TABLE public.indicators ADD CONSTRAINT indicators_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.indicators DROP CONSTRAINT IF EXISTS indicators_investigation_id_fkey;
ALTER TABLE public.indicators ADD CONSTRAINT indicators_investigation_id_fkey FOREIGN KEY (investigation_id) REFERENCES public.email_investigations(id) ON DELETE CASCADE;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_case_id_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.case_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'sakhi')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_chat_case ON public.case_chat_messages(case_id, created_at);

ALTER TABLE public.case_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_chat_messages FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_chat_messages TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
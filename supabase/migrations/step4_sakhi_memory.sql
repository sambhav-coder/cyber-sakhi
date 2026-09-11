-- Phase 2 Step 4 SAKHI AI: general-companion memory architecture
--
-- Additive and idempotent. Safe to run more than once in the Supabase SQL Editor.
--
-- Purpose:
--   * sakhi_conversations  — a general (non-case) Sakhi chat thread owned by one user.
--   * sakhi_messages       — short-term transcript inside a conversation.
--   * sakhi_memory         — lightweight long-term preference memory (language, etc.).
--
-- Security invariants:
--   * Every conversation/memory row is owner-scoped (owner_id / conversation->owner).
--   * RLS is ENABLED and FORCED on all three tables; no row-level policies are
--     granted, so ordinary clients (anon/authenticated) cannot read or write them.
--   * Only the service role (server-side) can access these tables, matching the
--     existing evidence / blockchain_anchors pattern used by the API layer.
--   * The API layer always filters by the authenticated user id (owner_id).
--   * sakhi_messages stores only the short-term transcript (with a small
--     attachment preview). Full extracted document text and locked-evidence
--     plaintext are never persisted here.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) sakhi_conversations — a general companion chat thread.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sakhi_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  language text NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'hi', 'hinglish')),
  case_id uuid NULL,
  evidence_codes jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sakhi_conversations_owner
  ON public.sakhi_conversations(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sakhi_conversations_case
  ON public.sakhi_conversations(case_id);

COMMENT ON TABLE public.sakhi_conversations IS
  'General (non-case) Sakhi companion conversation threads. Owner-scoped; server-only access.';

-- ---------------------------------------------------------------------------
-- 2) sakhi_messages — short-term transcript rows inside a conversation.
--     attachment_meta holds only a small preview summary (name, kind, size,
--     preview, locked flag) — never full document text or evidence plaintext.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sakhi_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.sakhi_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'sakhi', 'system')),
  content text NOT NULL,
  attachment_meta jsonb NULL,
  meta jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sakhi_messages_conversation
  ON public.sakhi_messages(conversation_id, created_at ASC);

COMMENT ON TABLE public.sakhi_messages IS
  'Short-term conversation transcript. attachment_meta stores only small previews, never sensitive plaintext.';

-- ---------------------------------------------------------------------------
-- 3) sakhi_memory — lightweight long-term preference/fact memory.
--     sensitive=true rows are never surfaced into the chat reply context.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sakhi_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  kind text NOT NULL DEFAULT 'preference',
  sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sakhi_memory_owner_key_unique UNIQUE (owner_id, key)
);

CREATE INDEX IF NOT EXISTS idx_sakhi_memory_owner
  ON public.sakhi_memory(owner_id);

COMMENT ON TABLE public.sakhi_memory IS
  'Lightweight long-term memory (preferences, non-sensitive facts). sensitive rows are never echoed into chat context.';

-- Keep conversations/memory updated_at fresh on writes.
CREATE OR REPLACE FUNCTION public.touch_sakhi_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sakhi_conversations_updated ON public.sakhi_conversations;
CREATE TRIGGER trg_sakhi_conversations_updated
  BEFORE UPDATE ON public.sakhi_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_sakhi_updated_at();

DROP TRIGGER IF EXISTS trg_sakhi_memory_updated ON public.sakhi_memory;
CREATE TRIGGER trg_sakhi_memory_updated
  BEFORE UPDATE ON public.sakhi_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_sakhi_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Access control: service_role only (server-side). RLS forced on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sakhi_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sakhi_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sakhi_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sakhi_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sakhi_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sakhi_memory FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sakhi_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sakhi_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sakhi_memory TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
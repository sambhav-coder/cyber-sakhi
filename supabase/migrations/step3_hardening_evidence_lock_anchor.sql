-- Phase 2 Step 3 HARDENING: real password/key-protected evidence lock + real blockchain anchoring
--
-- Additive and idempotent. Existing columns/tables are only extended, never altered in place.
-- Run this in the Supabase SQL Editor (it is safe to run more than once).
--
-- Security invariants guaranteed by this migration:
--   * Only WRAPPED / derived key material is stored on evidence (never a plaintext password
--     or raw data-encryption key).
--   * blockchain_anchors stores only privacy-safe digests/commitments (never evidence
--     plaintext or secrets). RLS is forced on; writes go through the service role (server-side).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Evidence: password/key-protected lock material (server-side custody of the
--    client-side E2E key-wrapping envelope). NEVER a plaintext password or DEK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS lock_method       text,
  ADD COLUMN IF NOT EXISTS lock_version      integer,
  ADD COLUMN IF NOT EXISTS kdf               text,
  ADD COLUMN IF NOT EXISTS kdf_salt          text,
  ADD COLUMN IF NOT EXISTS kdf_iterations    integer,
  ADD COLUMN IF NOT EXISTS kdf_params        jsonb,
  ADD COLUMN IF NOT EXISTS wrapped_key       text,
  ADD COLUMN IF NOT EXISTS wrapped_key_iv    text,
  ADD COLUMN IF NOT EXISTS verifier_wrapped  text,
  ADD COLUMN IF NOT EXISTS verifier_iv       text,
  ADD COLUMN IF NOT EXISTS verifier_sha      text,
  ADD COLUMN IF NOT EXISTS lock_metadata     jsonb,
  ADD COLUMN IF NOT EXISTS blockchain_anchor_id uuid;

COMMENT ON COLUMN public.evidence.lock_method       IS 'password | security_key — how the unlock credential is presented';
COMMENT ON COLUMN public.evidence.lock_version      IS 'Cryptographic lock format version (currently 1)';
COMMENT ON COLUMN public.evidence.kdf               IS 'Key-derivation function identifier, e.g. PBKDF2-SHA256';
COMMENT ON COLUMN public.evidence.kdf_salt          IS 'Base64 random salt used for PBKDF2 key derivation';
COMMENT ON COLUMN public.evidence.kdf_iterations    IS 'PBKDF2 iteration count';
COMMENT ON COLUMN public.evidence.kdf_params        IS 'Structured KDF parameters (hash, key length, version)';
COMMENT ON COLUMN public.evidence.wrapped_key       IS 'AES-256-GCM wrapped (encrypted) data-encryption key — never the raw key';
COMMENT ON COLUMN public.evidence.wrapped_key_iv    IS 'Base64 IV of the key-wrapping AES-256-GCM operation';
COMMENT ON COLUMN public.evidence.verifier_wrapped  IS 'AES-256-GCM wrapped random unlock-verifier token';
COMMENT ON COLUMN public.evidence.verifier_sha      IS 'SHA-256 of the plaintext verifier token used to authenticate unlocks';
COMMENT ON COLUMN public.evidence.lock_metadata     IS 'Lock UX metadata (createdAt, attempts, notes)';
COMMENT ON COLUMN public.evidence.blockchain_anchor_id IS 'Latest blockchain anchor record for this evidence';

CREATE INDEX IF NOT EXISTS idx_evidence_lock_anchor ON public.evidence(blockchain_anchor_id);

-- ---------------------------------------------------------------------------
-- 2) blockchain_anchors: real on-chain commitment metadata.
--    Only digests/commitments are anchored; plaintext/keys are never stored here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blockchain_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid REFERENCES public.evidence(id) ON DELETE CASCADE,
  anchor_type text NOT NULL,
  anchor_version integer NOT NULL DEFAULT 1,
  provider text,
  network_name text,
  chain_id text,
  tx_hash text,
  block_number bigint,
  transaction_timestamp timestamptz,
  anchored_digest text NOT NULL,
  anchor_payload text,
  payload_metadata jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  anchored_at timestamptz,
  CONSTRAINT blockchain_anchors_status_check
    CHECK (status IN ('pending', 'confirmed', 'failed', 'unavailable', 'not_created', 'digest_mismatch'))
);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_evidence ON public.blockchain_anchors(evidence_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_tx ON public.blockchain_anchors(tx_hash);

COMMENT ON TABLE public.blockchain_anchors IS 'Real blockchain anchor metadata. Contains only integrity digests/commitments, never plaintext evidence, passwords, or keys.';
COMMENT ON COLUMN public.blockchain_anchors.tx_hash IS 'Real on-chain transaction hash (only when a transaction actually occurred)';
COMMENT ON COLUMN public.blockchain_anchors.block_number IS 'Block number of the anchoring transaction';
COMMENT ON COLUMN public.blockchain_anchors.anchored_digest IS 'Deterministic commitment hash actually committed on-chain';

-- Link evidence -> its latest anchor (SET NULL so deleting an anchor never destroys evidence).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_blockchain_anchor_id_fkey'
      AND conrelid = 'public.evidence'::regclass
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_blockchain_anchor_id_fkey
      FOREIGN KEY (blockchain_anchor_id) REFERENCES public.blockchain_anchors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Access control: service_role only (server-side). Never readable by RLS users.
-- ---------------------------------------------------------------------------
ALTER TABLE public.blockchain_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_anchors FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blockchain_anchors TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
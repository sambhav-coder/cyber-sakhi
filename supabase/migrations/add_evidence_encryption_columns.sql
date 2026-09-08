-- Add client-side encryption columns to evidence table
-- Plaintext evidence is NEVER stored; only AES-256-GCM ciphertext + IV persisted

ALTER TABLE evidence
ADD COLUMN IF NOT EXISTS encrypted_content TEXT NULL,
ADD COLUMN IF NOT EXISTS encryption_iv     TEXT NULL,
ADD COLUMN IF NOT EXISTS encrypted_size    BIGINT NULL;

COMMENT ON COLUMN evidence.encrypted_content IS 'Base64-encoded AES-256-GCM ciphertext of the original evidence bytes';
COMMENT ON COLUMN evidence.encryption_iv     IS 'Base64-encoded 12-byte random IV used when encrypting the payload';
COMMENT ON COLUMN evidence.encrypted_size    IS 'Size in bytes of the encrypted_content (ciphertext length, for quota/integrity checks)';

CREATE INDEX IF NOT EXISTS idx_evidence_user_id_created_at ON evidence(user_id, created_at DESC);

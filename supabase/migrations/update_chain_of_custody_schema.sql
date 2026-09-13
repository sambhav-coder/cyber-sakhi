-- Update chain_of_custody table schema for tamper-evident chain
-- This migration adds the required fields for secure chain of custody

-- Add new columns for tamper-evident chain
ALTER TABLE chain_of_custody
  ADD COLUMN IF NOT EXISTS previous_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS event_hash TEXT NULL;

UPDATE chain_of_custody
SET event_hash = MD5(
  COALESCE(evidence_id::text, '') ||
  COALESCE(action::text, '') ||
  COALESCE(actor_id::text, '') ||
  COALESCE(notes, '') ||
  COALESCE(created_at::text, '')
)
WHERE event_hash IS NULL OR event_hash = '';

CREATE INDEX IF NOT EXISTS idx_chain_of_custody_evidence_id
  ON chain_of_custody(evidence_id);

CREATE INDEX IF NOT EXISTS idx_chain_of_custody_created_at
  ON chain_of_custody(created_at);

COMMENT ON COLUMN chain_of_custody.previous_hash
  IS 'Hash of the previous event in the chain for tamper detection';

COMMENT ON COLUMN chain_of_custody.event_hash
  IS 'MD5 hash of this event for tamper detection';

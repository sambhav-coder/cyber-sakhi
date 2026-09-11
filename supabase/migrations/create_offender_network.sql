-- Sakhi Network: privacy-preserving cross-victim indicator reports.
--
-- A row records that one account reported one identifier (a phone number,
-- UPI ID, email, domain or social handle). Both sides are stored only as
-- HMAC-SHA256 fingerprints keyed with OFFENDER_NETWORK_PEPPER, a secret
-- held by the server. The raw identifier, the message text, and the
-- reporter's identity are never written to this table.

CREATE TABLE IF NOT EXISTS offender_indicator_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_hash  TEXT        NOT NULL CHECK (char_length(indicator_hash) = 64),
  indicator_type  TEXT        NOT NULL CHECK (indicator_type IN ('phone', 'upi', 'email', 'domain', 'handle')),
  reporter_hash   TEXT        NOT NULL CHECK (char_length(reporter_hash) = 64),
  category        TEXT        NOT NULL CHECK (category IN ('BLACKMAIL', 'STALKING', 'SCAM', 'HARASSMENT', 'THREAT', 'OTHER')),
  region          TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One account counts once per identifier, however often it reports it.
  CONSTRAINT uq_offender_indicator_reporter UNIQUE (indicator_hash, reporter_hash)
);

CREATE INDEX IF NOT EXISTS idx_offender_reports_indicator
  ON offender_indicator_reports (indicator_hash);

CREATE INDEX IF NOT EXISTS idx_offender_reports_reporter_time
  ON offender_indicator_reports (reporter_hash, created_at DESC);

-- Server-only table, reached with the service role key. RLS enabled with
-- no policies means the browser's publishable key can neither read nor
-- write it — lookups must go through the API, which applies k-anonymity.
ALTER TABLE offender_indicator_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  offender_indicator_reports                IS 'Sakhi Network: keyed fingerprints of reported identifiers. No plaintext identifiers, messages, or reporter identities.';
COMMENT ON COLUMN offender_indicator_reports.indicator_hash IS 'HMAC-SHA256(pepper, "indicator:<type>:<normalized value>")';
COMMENT ON COLUMN offender_indicator_reports.reporter_hash  IS 'HMAC-SHA256(pepper, "reporter:user:<account id>")';
COMMENT ON COLUMN offender_indicator_reports.region         IS 'Coarse city from a fixed list, or NULL. Never free text.';

CREATE TABLE IF NOT EXISTS processed_matches (
  match_id TEXT PRIMARY KEY,
  puuid TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_matches_puuid ON processed_matches(puuid);

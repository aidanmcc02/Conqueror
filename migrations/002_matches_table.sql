CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  game_name TEXT NOT NULL,
  tag_line TEXT NOT NULL,
  placement INTEGER NOT NULL,
  comp TEXT NOT NULL,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('normal', 'ranked', 'double_up')),
  game_end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (match_id, puuid)
);

CREATE INDEX IF NOT EXISTS idx_matches_game_end_time ON matches(game_end_time DESC);
CREATE INDEX IF NOT EXISTS idx_matches_game_mode ON matches(game_mode);

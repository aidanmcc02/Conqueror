-- Add optional columns for match card enhancements (units, duration, level, traits, url)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS units JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_duration INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS traits JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS region_group TEXT;

-- Add optional ranked TFT fields (LP change, tier, division, rating, formatted rank)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS lp_change INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rated_tier TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rated_division TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rated_rating INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS current_rank TEXT;

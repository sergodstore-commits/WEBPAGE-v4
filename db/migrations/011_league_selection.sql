-- Preserve the current ranking on upgrade; future imports require selection.
ALTER TABLE league_tournaments ADD COLUMN included_in_ranking boolean NOT NULL DEFAULT true;
ALTER TABLE league_tournaments ALTER COLUMN included_in_ranking SET DEFAULT false;

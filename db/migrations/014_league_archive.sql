ALTER TABLE league_tournaments ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE league_tournaments ADD CONSTRAINT league_archive_excluded CHECK (NOT archived OR NOT included_in_ranking);

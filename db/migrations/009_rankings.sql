CREATE TABLE league_tournaments (
 id uuid PRIMARY KEY, source text NOT NULL CHECK(source IN ('tor','file')),
 external_id text NOT NULL, board text NOT NULL CHECK(board IN ('myl-first-era','myl-first-block','yugioh')),
 title text NOT NULL, played_on date NOT NULL, source_url text NOT NULL DEFAULT '',
 round_id integer, final_round integer, file_hash text,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,external_id),
 CHECK((source='tor' AND board IN ('myl-first-era','myl-first-block')) OR (source='file' AND board='yugioh'))
);
CREATE UNIQUE INDEX league_file_once ON league_tournaments(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX league_board_dates ON league_tournaments(board,played_on DESC);
CREATE TABLE league_results (
 tournament_id uuid NOT NULL REFERENCES league_tournaments(id) ON DELETE CASCADE,
 player_key text NOT NULL, name text NOT NULL, position integer NOT NULL CHECK(position>0),
 points integer NOT NULL CHECK(points>=0 AND points<=100000),
 PRIMARY KEY(tournament_id,player_key)
);
CREATE TABLE league_previews (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id),
 payload jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);
ALTER TABLE league_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_previews ENABLE ROW LEVEL SECURITY;

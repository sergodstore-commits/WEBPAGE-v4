CREATE TABLE instagram_connection (
 id integer PRIMARY KEY CHECK(id=1), user_id text NOT NULL, username text NOT NULL,
 credentials text NOT NULL, expires_at timestamptz NOT NULL,
 refreshed_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE instagram_settings (id integer PRIMARY KEY CHECK(id=1), hashtag text NOT NULL DEFAULT 'SergodWeb');
INSERT INTO instagram_settings(id) VALUES(1);
CREATE TABLE instagram_oauth_states (
 state_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE instagram_previews (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id), user_id text NOT NULL,
 media_id text NOT NULL, payload jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);
CREATE TABLE instagram_news (
 id uuid PRIMARY KEY, media_id text NOT NULL UNIQUE, user_id text NOT NULL, username text NOT NULL,
 caption text NOT NULL DEFAULT '', recorded_at timestamptz NOT NULL, permalink text NOT NULL,
 media_type text NOT NULL, assets jsonb NOT NULL, import_hashtag text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
 tournament_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 league_tournament_id uuid REFERENCES league_tournaments(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_news_dates ON instagram_news(recorded_at DESC,id);
ALTER TABLE instagram_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_news ENABLE ROW LEVEL SECURITY;

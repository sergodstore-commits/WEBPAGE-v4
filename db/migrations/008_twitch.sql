CREATE TABLE twitch_connection (
 id integer PRIMARY KEY CHECK(id=1), user_id text NOT NULL, login text NOT NULL,
 display_name text NOT NULL, credentials text NOT NULL, expires_at timestamptz NOT NULL,
 validated_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE twitch_oauth_states (
 state_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL
);
CREATE TABLE twitch_live (
 id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
 channel text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '',
 tournament_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO twitch_live(id) VALUES(1);
CREATE TABLE twitch_videos (
 id uuid PRIMARY KEY, video_id text NOT NULL UNIQUE CHECK(video_id ~ '^[0-9]{1,30}$'),
 channel text NOT NULL, title text NOT NULL, recorded_at timestamptz NOT NULL,
 twitch_thumbnail text NOT NULL DEFAULT '', custom_thumbnail text NOT NULL DEFAULT '',
 tournament_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX twitch_videos_public ON twitch_videos(recorded_at DESC,id) WHERE status='published';
ALTER TABLE twitch_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_videos ENABLE ROW LEVEL SECURITY;

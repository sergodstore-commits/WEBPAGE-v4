-- YouTube replaces Twitch on the public tournament page. Historical Twitch data is retained.
CREATE TABLE youtube_settings (
 id integer PRIMARY KEY CHECK(id=1),
 channel_url text NOT NULL DEFAULT 'https://www.youtube.com/@SergodStore',
 channel_id text NOT NULL DEFAULT 'UCDm1utULK7cZC2-hutCPlaQ',
 enabled boolean NOT NULL DEFAULT false,
 video_id text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '',
 stage text NOT NULL DEFAULT 'scheduled' CHECK(stage IN ('scheduled','live')),
 tournament_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO youtube_settings(id) VALUES(1);
CREATE TABLE youtube_videos (
 id uuid PRIMARY KEY, video_id text NOT NULL UNIQUE CHECK(video_id ~ '^[A-Za-z0-9_-]{11}$'),
 title text NOT NULL, recorded_at timestamptz NOT NULL,
 youtube_thumbnail text NOT NULL DEFAULT '', custom_thumbnail text NOT NULL DEFAULT '',
 tournament_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX youtube_videos_public ON youtube_videos(recorded_at DESC,id) WHERE status='published';
ALTER TABLE youtube_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;

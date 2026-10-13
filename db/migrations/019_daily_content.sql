-- Server-only bookkeeping. Card archives survive news rotation and never duplicate image files.
CREATE TABLE content_daily_runs (
  day date PRIMARY KEY,
  token text NOT NULL,
  lease_until timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  translation_chars integer NOT NULL DEFAULT 0 CHECK (translation_chars >= 0),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE content_news_jobs (
  url text PRIMARY KEY,
  id text NOT NULL,
  provider text NOT NULL,
  published_on date NOT NULL,
  candidate jsonb,
  phase text NOT NULL DEFAULT 'queued',
  header_done boolean NOT NULL DEFAULT false,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_news_jobs_pending ON content_news_jobs (phase, published_on DESC);
CREATE TABLE news_card_archives (
  url text PRIMARY KEY,
  data jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content_retired_covers (
  image text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE content_daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_news_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_card_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_retired_covers ENABLE ROW LEVEL SECURITY;

ALTER TABLE instagram_news ADD COLUMN thumbnail_url text NOT NULL DEFAULT '';
ALTER TABLE instagram_news ADD COLUMN thumbnail_checked_at timestamptz;

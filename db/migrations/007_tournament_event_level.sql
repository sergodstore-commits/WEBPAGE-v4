-- Presentation metadata only; existing publications keep their content and dates.
ALTER TABLE posts
  ADD COLUMN event_level text NOT NULL DEFAULT 'normal',
  ADD CONSTRAINT posts_event_level_valid
    CHECK (event_level IN ('normal', 'featured', 'major'));

ALTER TABLE posts ADD COLUMN entry_price integer CHECK (entry_price >= 0);
ALTER TABLE posts ADD COLUMN repeat_weekly boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN repeat_until date;
ALTER TABLE posts ADD COLUMN excluded_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE posts ADD COLUMN exception_parent_id uuid REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN exception_day date;
CREATE UNIQUE INDEX posts_schedule_exception ON posts(exception_parent_id, exception_day)
  WHERE exception_parent_id IS NOT NULL;

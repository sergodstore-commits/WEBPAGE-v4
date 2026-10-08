ALTER TABLE products ADD COLUMN release_date date;
ALTER TABLE products ADD COLUMN auto_move_to_store boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN moved_to_store_at timestamptz;
CREATE INDEX products_pending_release ON products(release_date)
WHERE kind='preorder' AND status='published' AND deleted_at IS NULL AND auto_move_to_store;

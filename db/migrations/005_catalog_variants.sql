-- A catalog family is display metadata. Each product remains a separately stocked SKU.
ALTER TABLE products
  ADD COLUMN catalog_group text NOT NULL DEFAULT '',
  ADD COLUMN catalog_name text NOT NULL DEFAULT '',
  ADD COLUMN brand text NOT NULL DEFAULT '',
  ADD COLUMN options jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN tags jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN specifications jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN source_url text NOT NULL DEFAULT '',
  ADD CONSTRAINT products_catalog_group_format CHECK (
    length(catalog_group) <= 120 AND (catalog_group = '' OR catalog_group ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  ),
  ADD CONSTRAINT products_catalog_family_complete CHECK ((catalog_group = '') = (catalog_name = '')),
  ADD CONSTRAINT products_catalog_metadata_shape CHECK (
    jsonb_typeof(options) = 'object' AND jsonb_typeof(tags) = 'array' AND jsonb_typeof(specifications) = 'array'
  );

CREATE INDEX products_catalog_group ON products(catalog_group) WHERE deleted_at IS NULL AND catalog_group <> '';

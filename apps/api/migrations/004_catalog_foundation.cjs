const upSql = `
  CREATE TABLE resource_assets (
    resource_id uuid PRIMARY KEY,
    resource_class text NOT NULL CHECK (
      resource_class IN ('CATALOG_IMAGE', 'CONTENT_IMAGE', 'COMIC_PAGE', 'EVIDENCE_DOCUMENT')
    ),
    original_filename_safe text NOT NULL CHECK (
      length(trim(original_filename_safe)) BETWEEN 1 AND 255
      AND original_filename_safe !~ '[\\\\/]'
      AND original_filename_safe !~ '[[:cntrl:]]'
    ),
    mime_type_real text CHECK (
      mime_type_real IS NULL OR mime_type_real IN (
        'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'
      )
    ),
    byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
    width_px integer CHECK (width_px IS NULL OR width_px > 0),
    height_px integer CHECK (height_px IS NULL OR height_px > 0),
    sha256_hex text CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[0-9a-f]{64}$'),
    secure_storage_key text NOT NULL UNIQUE CHECK (
      length(trim(secure_storage_key)) > 0
      AND secure_storage_key !~ '[[:cntrl:]]'
    ),
    alt_text text,
    position integer CHECK (position IS NULL OR position > 0),
    state text NOT NULL CHECK (state IN ('QUARANTINED', 'ACTIVE', 'REPLACED', 'REMOVED')),
    uploaded_by uuid NOT NULL REFERENCES user_accounts(account_id),
    uploaded_at timestamptz NOT NULL,
    validated_at timestamptz,
    replaced_resource_id uuid REFERENCES resource_assets(resource_id),
    retired_by uuid REFERENCES user_accounts(account_id),
    retired_at timestamptz,
    physical_deleted_at timestamptz,
    CHECK (replaced_resource_id IS NULL OR replaced_resource_id <> resource_id),
    CHECK ((retired_by IS NULL) = (retired_at IS NULL)),
    CHECK (state <> 'ACTIVE' OR (
      mime_type_real IS NOT NULL AND byte_size IS NOT NULL AND sha256_hex IS NOT NULL
      AND validated_at IS NOT NULL
    )),
    CHECK (state <> 'ACTIVE' OR resource_class = 'EVIDENCE_DOCUMENT' OR (
      mime_type_real IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
      AND width_px BETWEEN 320 AND 8192
      AND height_px BETWEEN 320 AND 8192
      AND width_px::bigint * height_px::bigint <= 40000000
      AND byte_size <= 10485760
      AND length(trim(alt_text)) > 0
      AND position > 0
    )),
    CHECK (state <> 'ACTIVE' OR resource_class <> 'EVIDENCE_DOCUMENT' OR (
      byte_size <= 15728640
      AND (
        (mime_type_real = 'application/pdf' AND width_px IS NULL AND height_px IS NULL)
        OR (
          mime_type_real IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
          AND width_px BETWEEN 320 AND 8192
          AND height_px BETWEEN 320 AND 8192
          AND width_px::bigint * height_px::bigint <= 40000000
        )
      )
    )),
    CHECK (physical_deleted_at IS NULL OR state IN ('QUARANTINED', 'REPLACED', 'REMOVED'))
  );

  CREATE TABLE tcg_games (
    game_id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    slug text NOT NULL CHECK (length(trim(slug)) > 0),
    description text,
    publication_status text NOT NULL CHECK (
      publication_status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')
    ),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    archived_at timestamptz,
    CHECK ((publication_status = 'ARCHIVED') = (archived_at IS NOT NULL))
  );
  CREATE UNIQUE INDEX tcg_games_slug_ci_idx ON tcg_games (lower(slug));

  CREATE TABLE categories (
    category_id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    description text,
    publication_status text NOT NULL CHECK (
      publication_status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')
    ),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    archived_at timestamptz,
    CHECK ((publication_status = 'ARCHIVED') = (archived_at IS NOT NULL))
  );

  CREATE TABLE collections (
    collection_id uuid PRIMARY KEY,
    game_id uuid NOT NULL REFERENCES tcg_games(game_id),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    description text,
    publication_status text NOT NULL CHECK (
      publication_status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')
    ),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    archived_at timestamptz,
    UNIQUE (collection_id, game_id),
    CHECK ((publication_status = 'ARCHIVED') = (archived_at IS NOT NULL))
  );
  CREATE INDEX collections_game_idx ON collections (game_id);

  CREATE TABLE catalog_entity_media (
    media_id uuid PRIMARY KEY,
    source_type text NOT NULL CHECK (source_type IN ('TCG_GAME', 'CATEGORY', 'COLLECTION')),
    source_id uuid NOT NULL,
    resource_id uuid NOT NULL REFERENCES resource_assets(resource_id),
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    UNIQUE (source_type, source_id, resource_id)
  );
  CREATE UNIQUE INDEX catalog_entity_media_primary_idx
    ON catalog_entity_media (source_type, source_id) WHERE is_primary;

  CREATE TABLE products (
    product_id uuid PRIMARY KEY,
    sku text NOT NULL CHECK (length(trim(sku)) > 0),
    game_id uuid NOT NULL REFERENCES tcg_games(game_id),
    category_id uuid NOT NULL REFERENCES categories(category_id),
    collection_id uuid,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    description text,
    language text CHECK (language IS NULL OR length(language) BETWEEN 2 AND 35),
    edition text CHECK (edition IS NULL OR length(edition) BETWEEN 1 AND 80),
    condition text CHECK (condition IS NULL OR length(condition) BETWEEN 1 AND 40),
    sale_type text NOT NULL CHECK (sale_type IN ('REGULAR', 'PREORDER')),
    price_amount_clp bigint NOT NULL CHECK (price_amount_clp >= 0),
    publication_status text NOT NULL CHECK (
      publication_status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')
    ),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    archived_at timestamptz,
    FOREIGN KEY (collection_id, game_id) REFERENCES collections(collection_id, game_id),
    CHECK ((publication_status = 'ARCHIVED') = (archived_at IS NOT NULL)),
    CHECK (language IS NULL OR language = btrim(language)),
    CHECK (edition IS NULL OR edition = btrim(edition)),
    CHECK (condition IS NULL OR condition = btrim(condition))
  );
  CREATE UNIQUE INDEX products_sku_ci_idx ON products (lower(sku));
  CREATE INDEX products_game_idx ON products (game_id);
  CREATE INDEX products_category_idx ON products (category_id);
  CREATE INDEX products_collection_idx ON products (collection_id) WHERE collection_id IS NOT NULL;
  CREATE INDEX products_publication_idx ON products (publication_status, game_id, category_id);

  CREATE TABLE product_media (
    media_id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(product_id),
    resource_id uuid NOT NULL REFERENCES resource_assets(resource_id),
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    UNIQUE (product_id, resource_id)
  );
  CREATE UNIQUE INDEX product_media_primary_idx ON product_media (product_id) WHERE is_primary;

  CREATE TABLE product_relations (
    product_relation_id uuid PRIMARY KEY,
    source_product_id uuid NOT NULL REFERENCES products(product_id),
    related_product_id uuid NOT NULL REFERENCES products(product_id),
    relation_type text NOT NULL CHECK (relation_type = 'RELATED'),
    position integer NOT NULL CHECK (position > 0),
    state text NOT NULL CHECK (state IN ('ACTIVE', 'REMOVED')),
    created_by uuid NOT NULL REFERENCES user_accounts(account_id),
    created_at timestamptz NOT NULL,
    CHECK (source_product_id <> related_product_id)
  );
  CREATE UNIQUE INDEX product_relations_active_pair_idx
    ON product_relations (source_product_id, related_product_id, relation_type) WHERE state = 'ACTIVE';
  CREATE UNIQUE INDEX product_relations_active_position_idx
    ON product_relations (source_product_id, position) WHERE state = 'ACTIVE';

  CREATE FUNCTION sergod_catalog_enforce_publication_transition()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF OLD.publication_status = 'ARCHIVED' AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'ARCHIVED catalog entities are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.publication_status IS DISTINCT FROM NEW.publication_status AND NOT (
      (OLD.publication_status = 'DRAFT' AND NEW.publication_status IN ('PUBLISHED', 'ARCHIVED'))
      OR (OLD.publication_status = 'PUBLISHED' AND NEW.publication_status IN ('UNPUBLISHED', 'ARCHIVED'))
      OR (OLD.publication_status = 'UNPUBLISHED' AND NEW.publication_status IN ('PUBLISHED', 'ARCHIVED'))
    ) THEN
      RAISE EXCEPTION 'invalid catalog publication transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE FUNCTION sergod_catalog_enforce_resource_transition()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF OLD.state IS DISTINCT FROM NEW.state AND NOT (
      (OLD.state = 'QUARANTINED' AND NEW.state = 'ACTIVE')
      OR (OLD.state = 'ACTIVE' AND NEW.state IN ('REPLACED', 'REMOVED'))
    ) THEN
      RAISE EXCEPTION 'invalid resource transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE FUNCTION sergod_catalog_validate_media_reference()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    PERFORM 1 FROM public.resource_assets WHERE resource_id = NEW.resource_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'resource does not exist' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.catalog_entity_media
       WHERE resource_id = NEW.resource_id AND media_id <> NEW.media_id
      UNION ALL
      SELECT 1 FROM public.product_media
       WHERE resource_id = NEW.resource_id AND media_id <> NEW.media_id
    ) THEN
      RAISE EXCEPTION 'resource already belongs to another media relation' USING ERRCODE = '23505';
    END IF;
    IF (SELECT resource_class FROM public.resource_assets WHERE resource_id = NEW.resource_id) <> 'CATALOG_IMAGE' THEN
      RAISE EXCEPTION 'catalog media requires CATALOG_IMAGE' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'catalog_entity_media' THEN
      IF NOT (
        (NEW.source_type = 'TCG_GAME' AND EXISTS (SELECT 1 FROM public.tcg_games WHERE game_id = NEW.source_id))
        OR (NEW.source_type = 'CATEGORY' AND EXISTS (SELECT 1 FROM public.categories WHERE category_id = NEW.source_id))
        OR (NEW.source_type = 'COLLECTION' AND EXISTS (SELECT 1 FROM public.collections WHERE collection_id = NEW.source_id))
      ) THEN
        RAISE EXCEPTION 'catalog media source does not exist' USING ERRCODE = '23503';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE FUNCTION sergod_catalog_prevent_resource_delete()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    RAISE EXCEPTION 'ResourceAsset metadata cannot be physically deleted' USING ERRCODE = '55000';
  END;
  $$;

  CREATE FUNCTION sergod_catalog_protect_collection_game()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF OLD.game_id IS DISTINCT FROM NEW.game_id AND EXISTS (
      SELECT 1 FROM public.products WHERE collection_id = OLD.collection_id
    ) THEN
      RAISE EXCEPTION 'Collection.game_id is immutable after product use' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE FUNCTION sergod_catalog_protect_sale_type()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  DECLARE
    candidate text;
    used boolean;
  BEGIN
    IF OLD.sale_type IS NOT DISTINCT FROM NEW.sale_type THEN
      RETURN NEW;
    END IF;
    FOREACH candidate IN ARRAY ARRAY['preorder_campaigns', 'inventory_movements', 'order_lines', 'pos_sale_lines']
    LOOP
      IF pg_catalog.to_regclass('public.' || candidate) IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'SELECT EXISTS (SELECT 1 FROM public.%I WHERE product_id = $1)', candidate
        ) INTO used USING OLD.product_id;
        IF used THEN
          RAISE EXCEPTION 'sale_type is immutable after historical use' USING ERRCODE = '23514';
        END IF;
      END IF;
    END LOOP;
    RETURN NEW;
  END;
  $$;

  CREATE FUNCTION sergod_catalog_validate_all()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.tcg_games g
       WHERE g.publication_status = 'PUBLISHED'
         AND (SELECT count(*) FROM public.catalog_entity_media m
                JOIN public.resource_assets r ON r.resource_id = m.resource_id
               WHERE m.source_type = 'TCG_GAME' AND m.source_id = g.game_id
                 AND m.is_primary AND r.state = 'ACTIVE') <> 1
    ) THEN
      RAISE EXCEPTION 'published TcgGame requires exactly one ACTIVE primary resource' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.publication_status = 'PUBLISHED'
         AND (SELECT count(*) FROM public.catalog_entity_media m
                JOIN public.resource_assets r ON r.resource_id = m.resource_id
               WHERE m.source_type = 'CATEGORY' AND m.source_id = c.category_id
                 AND m.is_primary AND r.state = 'ACTIVE') <> 1
    ) THEN
      RAISE EXCEPTION 'published Category requires exactly one ACTIVE primary resource' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.collections c
        JOIN public.tcg_games g ON g.game_id = c.game_id
       WHERE c.publication_status = 'PUBLISHED'
         AND (g.publication_status <> 'PUBLISHED' OR
           (SELECT count(*) FROM public.catalog_entity_media m
              JOIN public.resource_assets r ON r.resource_id = m.resource_id
             WHERE m.source_type = 'COLLECTION' AND m.source_id = c.collection_id
               AND m.is_primary AND r.state = 'ACTIVE') <> 1)
    ) THEN
      RAISE EXCEPTION 'published Collection requires a published game and one ACTIVE primary resource' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products p
        JOIN public.tcg_games g ON g.game_id = p.game_id
        JOIN public.categories c ON c.category_id = p.category_id
        LEFT JOIN public.collections co ON co.collection_id = p.collection_id
       WHERE p.publication_status = 'PUBLISHED'
         AND (g.publication_status <> 'PUBLISHED' OR c.publication_status <> 'PUBLISHED'
           OR (p.collection_id IS NOT NULL AND co.publication_status <> 'PUBLISHED')
           OR (SELECT count(*) FROM public.product_media m
                 JOIN public.resource_assets r ON r.resource_id = m.resource_id
                WHERE m.product_id = p.product_id AND m.is_primary AND r.state = 'ACTIVE') <> 1)
    ) THEN
      RAISE EXCEPTION 'published Product has invalid dependencies or primary resource' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.catalog_entity_media a
      JOIN public.catalog_entity_media b
        ON b.source_type = a.source_type AND b.source_id = a.source_id AND b.media_id <> a.media_id
      JOIN public.resource_assets ar ON ar.resource_id = a.resource_id AND ar.state = 'ACTIVE'
      JOIN public.resource_assets br ON br.resource_id = b.resource_id AND br.state = 'ACTIVE'
      WHERE ar.position = br.position
    ) OR EXISTS (
      SELECT 1 FROM public.product_media a
      JOIN public.product_media b ON b.product_id = a.product_id AND b.media_id <> a.media_id
      JOIN public.resource_assets ar ON ar.resource_id = a.resource_id AND ar.state = 'ACTIVE'
      JOIN public.resource_assets br ON br.resource_id = b.resource_id AND br.state = 'ACTIVE'
      WHERE ar.position = br.position
    ) THEN
      RAISE EXCEPTION 'ACTIVE media positions must be unique within their source' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.resource_assets r
       WHERE r.physical_deleted_at IS NOT NULL AND (
         EXISTS (SELECT 1 FROM public.catalog_entity_media m WHERE m.resource_id = r.resource_id)
         OR EXISTS (SELECT 1 FROM public.product_media m WHERE m.resource_id = r.resource_id)
       )
    ) THEN
      RAISE EXCEPTION 'referenced resources cannot be physically deleted' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END;
  $$;

  CREATE TRIGGER tcg_games_transition BEFORE UPDATE ON tcg_games
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_enforce_publication_transition();
  CREATE TRIGGER categories_transition BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_enforce_publication_transition();
  CREATE TRIGGER collections_transition BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_enforce_publication_transition();
  CREATE TRIGGER products_transition BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_enforce_publication_transition();
  CREATE TRIGGER resource_assets_transition BEFORE UPDATE OF state ON resource_assets
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_enforce_resource_transition();
  CREATE TRIGGER resource_assets_no_delete BEFORE DELETE ON resource_assets
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_prevent_resource_delete();
  CREATE TRIGGER collections_game_guard BEFORE UPDATE OF game_id ON collections
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_protect_collection_game();
  CREATE TRIGGER products_sale_type_guard BEFORE UPDATE OF sale_type ON products
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_protect_sale_type();
  CREATE TRIGGER catalog_entity_media_reference BEFORE INSERT OR UPDATE ON catalog_entity_media
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_media_reference();
  CREATE TRIGGER product_media_reference BEFORE INSERT OR UPDATE ON product_media
    FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_media_reference();

  CREATE CONSTRAINT TRIGGER tcg_games_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON tcg_games
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER categories_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON categories
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER collections_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON collections
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER products_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON products
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER resources_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON resource_assets
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER catalog_media_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON catalog_entity_media
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();
  CREATE CONSTRAINT TRIGGER product_media_catalog_valid AFTER INSERT OR UPDATE OR DELETE ON product_media
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sergod_catalog_validate_all();

  COMMENT ON TABLE categories IS 'Independent catalog classification; it has no TcgGame or Collection foreign key.';
  COMMENT ON TABLE collections IS 'Catalog collection owned only by TcgGame; Category is not part of this relation.';
  COMMENT ON TABLE products IS 'Complete sellable catalog unit; inventory and availability belong to later phases.';
  COMMENT ON TABLE resource_assets IS 'Private binary resource metadata; ACTIVE requires a genuine validated descriptor.';

  ALTER TABLE resource_assets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tcg_games ENABLE ROW LEVEL SECURITY;
  ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalog_entity_media ENABLE ROW LEVEL SECURITY;
  ALTER TABLE products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
  ALTER TABLE product_relations ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE resource_assets, tcg_games, categories, collections,
    catalog_entity_media, products, product_media, product_relations FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_catalog_enforce_publication_transition(),
    sergod_catalog_enforce_resource_transition(), sergod_catalog_validate_media_reference(),
    sergod_catalog_prevent_resource_delete(), sergod_catalog_protect_collection_game(),
    sergod_catalog_protect_sale_type(), sergod_catalog_validate_all() FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON TABLE resource_assets, tcg_games, categories, collections,
        catalog_entity_media, products, product_media, product_relations FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON TABLE resource_assets, tcg_games, categories, collections,
        catalog_entity_media, products, product_media, product_relations FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE resource_assets, tcg_games, categories,
        collections, catalog_entity_media, products, product_media, product_relations TO service_role;
    END IF;
  END;
  $$;
`;

exports.up = (pgm) => {
  pgm.sql(upSql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE product_relations;
    DROP TABLE product_media;
    DROP TABLE products;
    DROP TABLE catalog_entity_media;
    DROP TABLE collections;
    DROP TABLE categories;
    DROP TABLE tcg_games;
    DROP TABLE resource_assets;
    DROP FUNCTION sergod_catalog_validate_all();
    DROP FUNCTION sergod_catalog_protect_sale_type();
    DROP FUNCTION sergod_catalog_protect_collection_game();
    DROP FUNCTION sergod_catalog_prevent_resource_delete();
    DROP FUNCTION sergod_catalog_validate_media_reference();
    DROP FUNCTION sergod_catalog_enforce_resource_transition();
    DROP FUNCTION sergod_catalog_enforce_publication_transition();
  `);
};

exports.upSql = upSql;

  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

  CREATE FUNCTION public.sergod_catalog_search_normalize(input text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
  SET search_path = ''
  AS $function$
    SELECT pg_catalog.lower(
      extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, input)
    )
  $function$;

  REVOKE ALL ON FUNCTION public.sergod_catalog_search_normalize(text) FROM PUBLIC;

  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.sergod_catalog_search_normalize(text) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.sergod_catalog_search_normalize(text) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      GRANT USAGE ON SCHEMA extensions TO service_role;
      GRANT EXECUTE ON FUNCTION public.sergod_catalog_search_normalize(text) TO service_role;
      GRANT EXECUTE ON FUNCTION extensions.unaccent(text),
        extensions.unaccent(pg_catalog.regdictionary, text) TO service_role;
    END IF;
  END;
  $$;

  CREATE INDEX tcg_games_public_name_order_idx
    ON tcg_games ((public.sergod_catalog_search_normalize(name) COLLATE "C"), game_id)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX categories_public_name_order_idx
    ON categories ((public.sergod_catalog_search_normalize(name) COLLATE "C"), category_id)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX collections_public_name_order_idx
    ON collections ((public.sergod_catalog_search_normalize(name) COLLATE "C"), collection_id)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX collections_public_game_name_order_idx
    ON collections (game_id, (public.sergod_catalog_search_normalize(name) COLLATE "C"), collection_id)
    WHERE publication_status = 'PUBLISHED';

  CREATE INDEX products_public_newest_order_idx
    ON products (created_at DESC, product_id DESC)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX products_public_name_order_idx
    ON products ((public.sergod_catalog_search_normalize(name) COLLATE "C"), product_id)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX products_public_price_asc_order_idx
    ON products (price_amount_clp ASC, product_id ASC)
    WHERE publication_status = 'PUBLISHED';
  CREATE INDEX products_public_price_desc_order_idx
    ON products (price_amount_clp DESC, product_id ASC)
    WHERE publication_status = 'PUBLISHED';

  CREATE INDEX products_public_language_filter_idx
    ON products (language COLLATE "C")
    WHERE publication_status = 'PUBLISHED' AND language IS NOT NULL;
  CREATE INDEX products_public_edition_filter_idx
    ON products (edition COLLATE "C")
    WHERE publication_status = 'PUBLISHED' AND edition IS NOT NULL;
  CREATE INDEX products_public_condition_filter_idx
    ON products (condition COLLATE "C")
    WHERE publication_status = 'PUBLISHED' AND condition IS NOT NULL;

  CREATE INDEX products_public_search_idx
    ON products USING gin (
      public.sergod_catalog_search_normalize(name || ' ' || sku) extensions.gin_trgm_ops
    ) WHERE publication_status = 'PUBLISHED';
  CREATE INDEX tcg_games_public_search_idx
    ON tcg_games USING gin (
      public.sergod_catalog_search_normalize(name) extensions.gin_trgm_ops
    ) WHERE publication_status = 'PUBLISHED';
  CREATE INDEX categories_public_search_idx
    ON categories USING gin (
      public.sergod_catalog_search_normalize(name) extensions.gin_trgm_ops
    ) WHERE publication_status = 'PUBLISHED';
  CREATE INDEX collections_public_search_idx
    ON collections USING gin (
      public.sergod_catalog_search_normalize(name) extensions.gin_trgm_ops
    ) WHERE publication_status = 'PUBLISHED';

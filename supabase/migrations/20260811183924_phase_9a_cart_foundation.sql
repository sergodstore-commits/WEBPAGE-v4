CREATE TABLE carts (
  cart_id uuid PRIMARY KEY,
  owner_account_id uuid REFERENCES user_accounts(account_id),
  anonymous_session_id text,
  state text NOT NULL CHECK (state IN ('ACTIVE','MERGED','EXPIRED')),
  expires_at timestamptz,
  merged_into_cart_id uuid REFERENCES carts(cart_id),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (num_nonnulls(owner_account_id, anonymous_session_id) = 1),
  CHECK (anonymous_session_id IS NULL OR anonymous_session_id ~ '^[0-9a-f]{64}$'),
  CHECK (
    (state='ACTIVE' AND merged_into_cart_id IS NULL AND
      ((owner_account_id IS NOT NULL AND expires_at IS NULL) OR
       (anonymous_session_id IS NOT NULL AND expires_at IS NOT NULL)))
    OR (state='MERGED' AND anonymous_session_id IS NOT NULL AND expires_at IS NULL
      AND merged_into_cart_id IS NOT NULL AND merged_into_cart_id<>cart_id)
    OR (state='EXPIRED' AND anonymous_session_id IS NOT NULL AND merged_into_cart_id IS NULL)
  )
);
CREATE UNIQUE INDEX carts_active_account_idx ON carts(owner_account_id)
  WHERE state='ACTIVE' AND owner_account_id IS NOT NULL;
CREATE UNIQUE INDEX carts_active_anonymous_idx ON carts(anonymous_session_id)
  WHERE state='ACTIVE' AND anonymous_session_id IS NOT NULL;
CREATE INDEX carts_anonymous_history_idx ON carts(anonymous_session_id,created_at DESC);
CREATE INDEX carts_expiration_idx ON carts(expires_at,cart_id)
  WHERE state='ACTIVE' AND owner_account_id IS NULL;
CREATE INDEX carts_merged_destination_idx ON carts(merged_into_cart_id)
  WHERE merged_into_cart_id IS NOT NULL;

CREATE TABLE cart_groups (
  cart_group_id uuid PRIMARY KEY,
  cart_id uuid NOT NULL REFERENCES carts(cart_id),
  group_type text NOT NULL CHECK (group_type IN ('REGULAR','PREORDER','CONFLICT')),
  preorder_fulfillment_group_key text,
  state text NOT NULL CHECK (state IN ('ACTIVE','CONFLICT','REMOVED')),
  conflict_reason_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (preorder_fulfillment_group_key IS NULL OR length(trim(preorder_fulfillment_group_key))>0),
  CHECK (
    (group_type IN ('REGULAR','PREORDER') AND state IN ('ACTIVE','REMOVED')
      AND cardinality(conflict_reason_codes)=0)
    OR (group_type='CONFLICT' AND state IN ('CONFLICT','REMOVED')
      AND cardinality(conflict_reason_codes)>0)
  ),
  CHECK (group_type='PREORDER' OR preorder_fulfillment_group_key IS NULL)
);
CREATE UNIQUE INDEX cart_groups_active_regular_idx ON cart_groups(cart_id)
  WHERE group_type='REGULAR' AND state='ACTIVE';
CREATE UNIQUE INDEX cart_groups_active_preorder_key_idx
  ON cart_groups(cart_id,preorder_fulfillment_group_key)
  WHERE group_type='PREORDER' AND state='ACTIVE' AND preorder_fulfillment_group_key IS NOT NULL;
CREATE INDEX cart_groups_cart_idx ON cart_groups(cart_id,created_at,cart_group_id);

CREATE TABLE cart_lines (
  cart_line_id uuid PRIMARY KEY,
  cart_group_id uuid NOT NULL REFERENCES cart_groups(cart_group_id),
  product_id uuid NOT NULL REFERENCES products(product_id),
  preorder_campaign_id uuid REFERENCES preorder_campaigns(preorder_campaign_id),
  quantity bigint NOT NULL CHECK (quantity>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX cart_lines_group_product_campaign_idx
  ON cart_lines(cart_group_id,product_id,preorder_campaign_id) NULLS NOT DISTINCT;
CREATE INDEX cart_lines_product_idx ON cart_lines(product_id);
CREATE INDEX cart_lines_campaign_idx ON cart_lines(preorder_campaign_id)
  WHERE preorder_campaign_id IS NOT NULL;

CREATE FUNCTION sergod_protect_cart_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'cart history cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF OLD.state IN ('MERGED','EXPIRED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'final cart cannot be changed' USING ERRCODE='55000';
  END IF;
  IF NEW.owner_account_id IS DISTINCT FROM OLD.owner_account_id
     OR NEW.anonymous_session_id IS DISTINCT FROM OLD.anonymous_session_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'cart ownership and creation are immutable' USING ERRCODE='55000';
  END IF;
  IF OLD.state='ACTIVE' AND NEW.state NOT IN ('ACTIVE','MERGED','EXPIRED') THEN
    RAISE EXCEPTION 'cart transition is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER carts_lifecycle_guard BEFORE UPDATE OR DELETE ON carts
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_cart_lifecycle();

CREATE FUNCTION sergod_protect_cart_group_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'cart group history cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF OLD.state='REMOVED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'removed cart group cannot be changed' USING ERRCODE='55000';
  END IF;
  IF NEW.cart_id IS DISTINCT FROM OLD.cart_id
     OR NEW.group_type IS DISTINCT FROM OLD.group_type
     OR NEW.preorder_fulfillment_group_key IS DISTINCT FROM OLD.preorder_fulfillment_group_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'cart group identity is immutable' USING ERRCODE='55000';
  END IF;
  IF NEW.state='REMOVED' AND EXISTS (
    SELECT 1 FROM public.cart_lines line WHERE line.cart_group_id=OLD.cart_group_id
  ) THEN
    RAISE EXCEPTION 'non-empty cart group cannot be removed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cart_groups_lifecycle_guard BEFORE UPDATE OR DELETE ON cart_groups
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_cart_group_lifecycle();

CREATE FUNCTION sergod_validate_cart_line() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  target_group public.cart_groups%ROWTYPE;
  product_sale_type text;
  campaign_product_id uuid;
  campaign_group_key text;
BEGIN
  SELECT * INTO target_group FROM public.cart_groups
    WHERE cart_group_id=NEW.cart_group_id;
  IF NOT FOUND OR target_group.state NOT IN ('ACTIVE','CONFLICT') THEN
    RAISE EXCEPTION 'cart line requires a mutable cart group' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.carts cart
    WHERE cart.cart_id=target_group.cart_id AND cart.state='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'cart line requires an active cart' USING ERRCODE='23514';
  END IF;
  SELECT sale_type INTO product_sale_type FROM public.products WHERE product_id=NEW.product_id;
  IF product_sale_type IS NULL THEN
    RAISE EXCEPTION 'cart product does not exist' USING ERRCODE='23503';
  END IF;
  IF NEW.preorder_campaign_id IS NOT NULL THEN
    SELECT product_id,fulfillment_group_key INTO campaign_product_id,campaign_group_key
      FROM public.preorder_campaigns WHERE preorder_campaign_id=NEW.preorder_campaign_id;
    IF campaign_product_id IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'cart preorder campaign does not belong to product' USING ERRCODE='23514';
    END IF;
  END IF;
  IF target_group.group_type='REGULAR' AND
     (product_sale_type<>'REGULAR' OR NEW.preorder_campaign_id IS NOT NULL) THEN
    RAISE EXCEPTION 'regular cart group requires regular product' USING ERRCODE='23514';
  END IF;
  IF target_group.group_type='PREORDER' THEN
    IF product_sale_type<>'PREORDER' OR NEW.preorder_campaign_id IS NULL
       OR campaign_group_key IS DISTINCT FROM target_group.preorder_fulfillment_group_key THEN
      RAISE EXCEPTION 'preorder cart group is incompatible' USING ERRCODE='23514';
    END IF;
    IF campaign_group_key IS NULL AND EXISTS (
      SELECT 1 FROM public.cart_lines other
      WHERE other.cart_group_id=target_group.cart_group_id
        AND other.cart_line_id<>NEW.cart_line_id
        AND other.preorder_campaign_id IS DISTINCT FROM NEW.preorder_campaign_id
    ) THEN
      RAISE EXCEPTION 'preorder campaigns without grouping key require separate groups'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF target_group.group_type='CONFLICT' AND
     ((product_sale_type='REGULAR' AND NEW.preorder_campaign_id IS NOT NULL)
      OR (product_sale_type='PREORDER' AND NEW.preorder_campaign_id IS NULL)) THEN
    RAISE EXCEPTION 'conflict line source is malformed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cart_lines_validated BEFORE INSERT OR UPDATE ON cart_lines
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_cart_line();

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON carts,cart_groups,cart_lines FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON carts,cart_groups,cart_lines FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON carts,cart_groups,cart_lines FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON carts,cart_groups,cart_lines TO service_role;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION sergod_protect_cart_lifecycle(),
  sergod_protect_cart_group_lifecycle(),sergod_validate_cart_line() FROM PUBLIC;

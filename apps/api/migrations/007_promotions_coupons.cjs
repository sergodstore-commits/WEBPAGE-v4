const upSql = `
  CREATE TABLE promotions (
    promotion_id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    state text NOT NULL CHECK (state IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED')),
    activation_mode text NOT NULL CHECK (activation_mode IN ('AUTOMATIC', 'COUPON_REQUIRED')),
    scope text NOT NULL CHECK (scope IN ('LINE', 'ORDER')),
    channel text NOT NULL CHECK (channel IN ('POS', 'ECOMMERCE', 'BOTH')),
    benefit_type text NOT NULL CHECK (benefit_type IN ('PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT', 'FIXED_PRICE', 'BUY_X_GET_Y')),
    percentage_basis_points integer,
    fixed_amount_clp bigint,
    fixed_price_clp bigint,
    buy_x_quantity bigint,
    get_y_quantity bigint,
    branch_id uuid REFERENCES branches(branch_id),
    minimum_eligible_quantity bigint CHECK (minimum_eligible_quantity > 0),
    minimum_eligible_amount_clp bigint CHECK (minimum_eligible_amount_clp > 0),
    global_limit bigint CHECK (global_limit > 0),
    per_account_limit bigint CHECK (per_account_limit > 0),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    priority integer NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    activated_at timestamptz,
    CHECK (starts_at < ends_at),
    CHECK (
      (benefit_type = 'PERCENTAGE_DISCOUNT' AND percentage_basis_points BETWEEN 1 AND 10000
        AND fixed_amount_clp IS NULL AND fixed_price_clp IS NULL AND buy_x_quantity IS NULL AND get_y_quantity IS NULL) OR
      (benefit_type = 'FIXED_AMOUNT_DISCOUNT' AND fixed_amount_clp > 0
        AND percentage_basis_points IS NULL AND fixed_price_clp IS NULL AND buy_x_quantity IS NULL AND get_y_quantity IS NULL) OR
      (benefit_type = 'FIXED_PRICE' AND fixed_price_clp >= 0
        AND percentage_basis_points IS NULL AND fixed_amount_clp IS NULL AND buy_x_quantity IS NULL AND get_y_quantity IS NULL) OR
      (benefit_type = 'BUY_X_GET_Y' AND buy_x_quantity > 0 AND get_y_quantity > 0
        AND percentage_basis_points IS NULL AND fixed_amount_clp IS NULL AND fixed_price_clp IS NULL)
    )
  );

  CREATE INDEX promotions_admin_list_idx ON promotions (created_at DESC, promotion_id DESC);
  CREATE INDEX promotions_state_admin_list_idx ON promotions (state, created_at DESC, promotion_id DESC);
  CREATE INDEX promotions_activation_admin_list_idx ON promotions (activation_mode, created_at DESC, promotion_id DESC);
  CREATE INDEX promotions_branch_idx ON promotions (branch_id) WHERE branch_id IS NOT NULL;
  CREATE INDEX promotions_scheduled_due_idx ON promotions (starts_at, promotion_id) WHERE state = 'SCHEDULED';
  CREATE INDEX promotions_expiration_due_idx ON promotions (ends_at, promotion_id)
    WHERE state IN ('SCHEDULED', 'ACTIVE', 'SUSPENDED');

  CREATE TABLE promotion_targets (
    promotion_target_id uuid PRIMARY KEY,
    promotion_id uuid NOT NULL REFERENCES promotions(promotion_id),
    side text NOT NULL CHECK (side IN ('BENEFITED', 'QUALIFYING', 'REWARD')),
    target_kind text NOT NULL CHECK (target_kind IN ('ALL_PRODUCTS', 'PRODUCT', 'CATEGORY', 'TCG_GAME')),
    product_id uuid REFERENCES products(product_id),
    category_id uuid REFERENCES categories(category_id),
    game_id uuid REFERENCES tcg_games(game_id),
    position integer NOT NULL CHECK (position > 0),
    CHECK (
      (target_kind = 'ALL_PRODUCTS' AND num_nonnulls(product_id, category_id, game_id) = 0) OR
      (target_kind = 'PRODUCT' AND product_id IS NOT NULL AND num_nonnulls(product_id, category_id, game_id) = 1) OR
      (target_kind = 'CATEGORY' AND category_id IS NOT NULL AND num_nonnulls(product_id, category_id, game_id) = 1) OR
      (target_kind = 'TCG_GAME' AND game_id IS NOT NULL AND num_nonnulls(product_id, category_id, game_id) = 1)
    ),
    UNIQUE (promotion_id, side, position)
  );

  CREATE TABLE promotion_eligible_accounts (
    promotion_id uuid NOT NULL REFERENCES promotions(promotion_id),
    account_id uuid NOT NULL REFERENCES user_accounts(account_id),
    PRIMARY KEY (promotion_id, account_id)
  );

  CREATE INDEX promotion_targets_product_idx ON promotion_targets (product_id) WHERE product_id IS NOT NULL;
  CREATE INDEX promotion_targets_category_idx ON promotion_targets (category_id) WHERE category_id IS NOT NULL;
  CREATE INDEX promotion_targets_game_idx ON promotion_targets (game_id) WHERE game_id IS NOT NULL;
  CREATE INDEX promotion_eligible_accounts_account_idx ON promotion_eligible_accounts (account_id);

  CREATE TABLE promotion_weekly_schedules (
    promotion_weekly_schedule_id uuid PRIMARY KEY,
    promotion_id uuid NOT NULL REFERENCES promotions(promotion_id),
    day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_minute_local integer NOT NULL CHECK (start_minute_local BETWEEN 0 AND 1439),
    end_minute_local integer NOT NULL CHECK (end_minute_local BETWEEN 1 AND 1440),
    position integer NOT NULL CHECK (position > 0),
    CHECK (start_minute_local < end_minute_local),
    UNIQUE (promotion_id, day_of_week, position)
  );

  CREATE FUNCTION sergod_validate_promotion_target_sides()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  DECLARE
    candidate_id uuid;
    candidate_type text;
  BEGIN
    IF TG_OP = 'DELETE' THEN candidate_id := OLD.promotion_id;
    ELSE candidate_id := NEW.promotion_id;
    END IF;
    SELECT benefit_type INTO candidate_type
      FROM public.promotions WHERE promotion_id = candidate_id;
    IF candidate_type IS NULL THEN RETURN NULL; END IF;
    IF candidate_type = 'BUY_X_GET_Y' THEN
      IF NOT EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = candidate_id AND side = 'BENEFITED')
         OR NOT EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = candidate_id AND side = 'QUALIFYING')
         OR NOT EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = candidate_id AND side = 'REWARD') THEN
        RAISE EXCEPTION 'BUY_X_GET_Y requires BENEFITED, QUALIFYING and REWARD targets' USING ERRCODE = '23514';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = candidate_id AND side = 'BENEFITED')
       OR EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = candidate_id AND side <> 'BENEFITED') THEN
      RAISE EXCEPTION 'ordinary benefit requires BENEFITED targets only' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END;
  $$;

  CREATE CONSTRAINT TRIGGER promotions_validate_target_sides
    AFTER INSERT OR UPDATE OF benefit_type ON promotions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION sergod_validate_promotion_target_sides();
  CREATE CONSTRAINT TRIGGER promotion_targets_validate_sides
    AFTER INSERT OR UPDATE OR DELETE ON promotion_targets
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION sergod_validate_promotion_target_sides();

  CREATE TABLE coupons (
    coupon_id uuid PRIMARY KEY,
    promotion_id uuid NOT NULL REFERENCES promotions(promotion_id),
    normalized_code text NOT NULL UNIQUE CHECK (
      length(trim(normalized_code)) > 0 AND normalized_code = upper(btrim(normalized_code))
    ),
    state text NOT NULL CHECK (state IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED')),
    starts_at timestamptz,
    ends_at timestamptz,
    global_limit bigint CHECK (global_limit > 0),
    per_account_limit bigint CHECK (per_account_limit > 0),
    created_at timestamptz NOT NULL,
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
  );

  CREATE INDEX coupons_admin_list_idx ON coupons (created_at DESC, coupon_id DESC);
  CREATE INDEX coupons_state_admin_list_idx ON coupons (state, created_at DESC, coupon_id DESC);
  CREATE INDEX coupons_promotion_idx ON coupons (promotion_id, created_at DESC, coupon_id DESC);
  CREATE INDEX coupons_expiration_due_idx ON coupons (ends_at, coupon_id)
    WHERE state IN ('DRAFT', 'ACTIVE', 'SUSPENDED') AND ends_at IS NOT NULL;

  CREATE FUNCTION sergod_validate_coupon_promotion_mode()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.promotions
       WHERE promotion_id = NEW.promotion_id AND activation_mode = 'COUPON_REQUIRED'
    ) THEN
      RAISE EXCEPTION 'coupon requires a COUPON_REQUIRED promotion' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER coupons_require_coupon_promotion
    BEFORE INSERT OR UPDATE OF promotion_id ON coupons
    FOR EACH ROW EXECUTE FUNCTION sergod_validate_coupon_promotion_mode();

  CREATE FUNCTION sergod_protect_promotion_coupon_mode()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF OLD.activation_mode = 'COUPON_REQUIRED' AND NEW.activation_mode <> OLD.activation_mode
       AND EXISTS (SELECT 1 FROM public.coupons WHERE promotion_id = OLD.promotion_id) THEN
      RAISE EXCEPTION 'promotion with coupons must remain COUPON_REQUIRED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER promotions_protect_coupon_mode
    BEFORE UPDATE OF activation_mode ON promotions
    FOR EACH ROW EXECUTE FUNCTION sergod_protect_promotion_coupon_mode();

  ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE promotion_targets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE promotion_eligible_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE promotion_weekly_schedules ENABLE ROW LEVEL SECURITY;
  ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE promotions, promotion_targets, promotion_eligible_accounts,
    promotion_weekly_schedules, coupons FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_validate_coupon_promotion_mode() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_protect_promotion_coupon_mode() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_validate_promotion_target_sides() FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON TABLE promotions, promotion_targets, promotion_eligible_accounts,
        promotion_weekly_schedules, coupons FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_validate_coupon_promotion_mode() FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_protect_promotion_coupon_mode() FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_validate_promotion_target_sides() FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON TABLE promotions, promotion_targets, promotion_eligible_accounts,
        promotion_weekly_schedules, coupons FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_validate_coupon_promotion_mode() FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_protect_promotion_coupon_mode() FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_validate_promotion_target_sides() FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE promotions, promotion_targets,
        promotion_eligible_accounts, promotion_weekly_schedules, coupons TO service_role;
    END IF;
  END;
  $$;
`;

const downSql = `
  DROP FUNCTION sergod_validate_promotion_target_sides() CASCADE;
  DROP FUNCTION sergod_protect_promotion_coupon_mode() CASCADE;
  DROP FUNCTION sergod_validate_coupon_promotion_mode() CASCADE;
  DROP TABLE coupons;
  DROP TABLE promotion_weekly_schedules;
  DROP TABLE promotion_eligible_accounts;
  DROP TABLE promotion_targets;
  DROP TABLE promotions;
`;

exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;

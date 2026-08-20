const upSql = `
  CREATE TABLE system_configurations (
    system_configuration_id uuid PRIMARY KEY,
    configuration_key text NOT NULL CHECK (length(trim(configuration_key)) > 0),
    scope text NOT NULL CHECK (scope IN ('GLOBAL', 'BRANCH')),
    branch_id uuid REFERENCES branches(branch_id),
    value_type text NOT NULL CHECK (value_type IN ('INTEGER', 'BOOLEAN', 'TEXT', 'REFERENCE')),
    integer_value bigint,
    boolean_value boolean,
    text_value text,
    reference_id uuid,
    version_number integer NOT NULL CHECK (version_number > 0),
    state text NOT NULL CHECK (state IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    created_by uuid NOT NULL REFERENCES user_accounts(account_id),
    created_at timestamptz NOT NULL,
    activated_by uuid REFERENCES user_accounts(account_id),
    activated_at timestamptz,
    retired_by uuid REFERENCES user_accounts(account_id),
    retired_at timestamptz,
    correlation_id uuid NOT NULL,
    CHECK ((scope = 'GLOBAL' AND branch_id IS NULL) OR (scope = 'BRANCH' AND branch_id IS NOT NULL)),
    CHECK (num_nonnulls(integer_value, boolean_value, text_value, reference_id) = 1),
    CHECK (
      (value_type = 'INTEGER' AND integer_value IS NOT NULL) OR
      (value_type = 'BOOLEAN' AND boolean_value IS NOT NULL) OR
      (value_type = 'TEXT' AND text_value IS NOT NULL) OR
      (value_type = 'REFERENCE' AND reference_id IS NOT NULL)
    ),
    CHECK (
      configuration_key <> 'DEFAULT_LOW_STOCK_THRESHOLD' OR
      (scope = 'GLOBAL' AND value_type = 'INTEGER' AND integer_value >= 0)
    ),
    CHECK (
      (state = 'DRAFT' AND activated_by IS NULL AND activated_at IS NULL AND retired_by IS NULL AND retired_at IS NULL) OR
      (state = 'ACTIVE' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NULL AND retired_at IS NULL) OR
      (state = 'RETIRED' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NOT NULL AND retired_at IS NOT NULL)
    ),
    UNIQUE (configuration_key, scope, branch_id, version_number)
  );

  CREATE UNIQUE INDEX system_configurations_active_global_idx
    ON system_configurations (configuration_key, scope)
    WHERE state = 'ACTIVE' AND scope = 'GLOBAL';
  CREATE UNIQUE INDEX system_configurations_active_branch_idx
    ON system_configurations (configuration_key, scope, branch_id)
    WHERE state = 'ACTIVE' AND scope = 'BRANCH';
  CREATE UNIQUE INDEX system_configurations_global_version_idx
    ON system_configurations (configuration_key, scope, version_number)
    WHERE scope = 'GLOBAL';
  CREATE UNIQUE INDEX system_configurations_branch_version_idx
    ON system_configurations (configuration_key, scope, branch_id, version_number)
    WHERE scope = 'BRANCH';

  CREATE TABLE inventory_positions (
    inventory_position_id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(product_id),
    branch_id uuid NOT NULL REFERENCES branches(branch_id),
    on_hand bigint NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
    low_stock_threshold_override bigint CHECK (low_stock_threshold_override >= 0),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL,
    UNIQUE (product_id, branch_id)
  );

  CREATE INDEX inventory_positions_branch_idx ON inventory_positions (branch_id, product_id);

  CREATE TABLE inventory_movements (
    movement_id uuid PRIMARY KEY,
    inventory_position_id uuid NOT NULL REFERENCES inventory_positions(inventory_position_id),
    movement_type text NOT NULL CHECK (movement_type IN (
      'STOCK_ENTRY', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'STOCK_CONSUMED',
      'POS_SALE_CONSUMED', 'RETURN_RESTOCKED', 'PREORDER_RETURN_RESTOCKED',
      'POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'PREORDER_POSITIVE_ADJUSTMENT',
      'PREORDER_NEGATIVE_ADJUSTMENT', 'PREORDER_RECEIPT'
    )),
    quantity bigint NOT NULL CHECK (quantity > 0),
    source_type text NOT NULL CHECK (length(trim(source_type)) > 0),
    source_id text NOT NULL CHECK (length(trim(source_id)) > 0),
    actor_id uuid REFERENCES user_accounts(account_id),
    reason text CHECK (reason IS NULL OR length(trim(reason)) > 0),
    reference text CHECK (reference IS NULL OR length(trim(reference)) > 0),
    idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
    correlation_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    UNIQUE (inventory_position_id, idempotency_key)
  );

  CREATE INDEX inventory_movements_position_history_idx
    ON inventory_movements (inventory_position_id, occurred_at DESC, movement_id DESC);

  CREATE TRIGGER inventory_movements_immutable
    BEFORE UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();

  CREATE OR REPLACE FUNCTION sergod_catalog_protect_sale_type()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  DECLARE
    candidate text;
    used boolean;
  BEGIN
    IF OLD.sale_type IS NOT DISTINCT FROM NEW.sale_type THEN
      RETURN NEW;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements movement
      JOIN public.inventory_positions position
        ON position.inventory_position_id = movement.inventory_position_id
      WHERE position.product_id = OLD.product_id
    ) THEN
      RAISE EXCEPTION 'sale_type is immutable after historical use' USING ERRCODE = '23514';
    END IF;
    FOREACH candidate IN ARRAY ARRAY['preorder_campaigns', 'order_lines', 'pos_sale_lines']
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

  INSERT INTO inventory_positions (
    inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
  )
  SELECT md5(p.product_id::text || ':' || b.branch_id::text)::uuid,
         p.product_id, b.branch_id, 0, 0, 1, CURRENT_TIMESTAMP
    FROM products p
    CROSS JOIN branches b
   WHERE b.state = 'ACTIVE'
  ON CONFLICT (product_id, branch_id) DO NOTHING;

  COMMENT ON TABLE inventory_positions IS
    'One shared inventory position per Product and Branch; available is derived as on_hand - reserved.';
  COMMENT ON TABLE inventory_movements IS
    'Immutable inventory ledger. This delivery executes only regular entries and regular adjustments.';

  ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inventory_positions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE system_configurations, inventory_positions, inventory_movements FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON TABLE system_configurations, inventory_positions, inventory_movements FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON TABLE system_configurations, inventory_positions, inventory_movements FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_configurations,
        inventory_positions, inventory_movements TO service_role;
    END IF;
  END;
  $$;
`;

const downSql = `
  DROP TABLE inventory_movements;
  DROP TABLE inventory_positions;
  DROP TABLE system_configurations;
  CREATE OR REPLACE FUNCTION sergod_catalog_protect_sale_type()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  DECLARE
    candidate text;
    used boolean;
  BEGIN
    IF OLD.sale_type IS NOT DISTINCT FROM NEW.sale_type THEN RETURN NEW; END IF;
    FOREACH candidate IN ARRAY ARRAY['preorder_campaigns', 'inventory_movements', 'order_lines', 'pos_sale_lines'] LOOP
      IF pg_catalog.to_regclass('public.' || candidate) IS NOT NULL THEN
        EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE product_id = $1)', candidate)
          INTO used USING OLD.product_id;
        IF used THEN RAISE EXCEPTION 'sale_type is immutable after historical use' USING ERRCODE = '23514'; END IF;
      END IF;
    END LOOP;
    RETURN NEW;
  END;
  $$;
`;

exports.up = (pgm) => {
  pgm.sql(upSql);
};

exports.down = (pgm) => {
  pgm.sql(downSql);
};

exports.upSql = upSql;
exports.downSql = downSql;

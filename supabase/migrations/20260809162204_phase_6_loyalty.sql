  CREATE TABLE loyalty_accounts (
    loyalty_account_id uuid PRIMARY KEY,
    account_id uuid NOT NULL UNIQUE REFERENCES user_accounts(account_id),
    balance bigint NOT NULL DEFAULT 0,
    reserved_points bigint NOT NULL DEFAULT 0 CHECK (reserved_points >= 0),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );

  CREATE FUNCTION sergod_create_loyalty_account_for_user()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    INSERT INTO public.loyalty_accounts (
      loyalty_account_id,account_id,balance,reserved_points,version,created_at,updated_at
    ) VALUES (gen_random_uuid(),NEW.account_id,0,0,1,NEW.created_at,NEW.created_at)
    ON CONFLICT (account_id) DO NOTHING;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER user_accounts_create_loyalty_account
    AFTER INSERT ON user_accounts
    FOR EACH ROW EXECUTE FUNCTION sergod_create_loyalty_account_for_user();

  INSERT INTO loyalty_accounts (
    loyalty_account_id,account_id,balance,reserved_points,version,created_at,updated_at
  )
  SELECT gen_random_uuid(),account_id,0,0,1,created_at,created_at
    FROM user_accounts
  ON CONFLICT (account_id) DO NOTHING;

  CREATE TABLE loyalty_configurations (
    loyalty_configuration_id uuid PRIMARY KEY,
    branch_id uuid NOT NULL REFERENCES branches(branch_id),
    version_number bigint NOT NULL CHECK (version_number > 0),
    earn_clp_per_point bigint NOT NULL CHECK (earn_clp_per_point > 0),
    redeem_clp_per_point bigint NOT NULL CHECK (redeem_clp_per_point > 0),
    minimum_redeem_points bigint NOT NULL CHECK (minimum_redeem_points >= 0),
    maximum_redeem_basis_points integer CHECK (maximum_redeem_basis_points BETWEEN 1 AND 10000),
    state text NOT NULL CHECK (state IN ('DRAFT','ACTIVE','RETIRED')),
    created_by uuid NOT NULL REFERENCES user_accounts(account_id),
    created_at timestamptz NOT NULL,
    activated_by uuid REFERENCES user_accounts(account_id),
    activated_at timestamptz,
    retired_by uuid REFERENCES user_accounts(account_id),
    retired_at timestamptz,
    UNIQUE (branch_id,version_number),
    CHECK (
      (state='DRAFT' AND activated_by IS NULL AND activated_at IS NULL AND retired_by IS NULL AND retired_at IS NULL) OR
      (state='ACTIVE' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NULL AND retired_at IS NULL) OR
      (state='RETIRED' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NOT NULL AND retired_at IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX loyalty_configurations_one_active_idx
    ON loyalty_configurations (branch_id) WHERE state='ACTIVE';
  CREATE INDEX loyalty_configurations_admin_list_idx
    ON loyalty_configurations (created_at DESC,loyalty_configuration_id DESC);
  CREATE INDEX loyalty_configurations_branch_list_idx
    ON loyalty_configurations (branch_id,created_at DESC,loyalty_configuration_id DESC);
  CREATE INDEX loyalty_configurations_state_list_idx
    ON loyalty_configurations (state,created_at DESC,loyalty_configuration_id DESC);
  CREATE INDEX loyalty_configurations_created_by_idx ON loyalty_configurations (created_by);
  CREATE INDEX loyalty_configurations_activated_by_idx
    ON loyalty_configurations (activated_by) WHERE activated_by IS NOT NULL;
  CREATE INDEX loyalty_configurations_retired_by_idx
    ON loyalty_configurations (retired_by) WHERE retired_by IS NOT NULL;

  CREATE FUNCTION sergod_protect_loyalty_configuration()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF OLD.loyalty_configuration_id <> NEW.loyalty_configuration_id
       OR OLD.branch_id <> NEW.branch_id
       OR OLD.version_number <> NEW.version_number
       OR OLD.created_by <> NEW.created_by
       OR OLD.created_at <> NEW.created_at THEN
      RAISE EXCEPTION 'loyalty configuration identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state='RETIRED' THEN
      RAISE EXCEPTION 'retired loyalty configuration is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state='ACTIVE' THEN
      IF NEW.state <> 'RETIRED'
         OR OLD.earn_clp_per_point <> NEW.earn_clp_per_point
         OR OLD.redeem_clp_per_point <> NEW.redeem_clp_per_point
         OR OLD.minimum_redeem_points <> NEW.minimum_redeem_points
         OR OLD.maximum_redeem_basis_points IS DISTINCT FROM NEW.maximum_redeem_basis_points
         OR OLD.activated_by <> NEW.activated_by
         OR OLD.activated_at <> NEW.activated_at THEN
        RAISE EXCEPTION 'active loyalty configuration is immutable except retirement' USING ERRCODE='23514';
      END IF;
    ELSIF OLD.state='DRAFT' AND NEW.state NOT IN ('DRAFT','ACTIVE') THEN
      RAISE EXCEPTION 'draft loyalty configuration transition is invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER loyalty_configurations_protect_lifecycle
    BEFORE UPDATE ON loyalty_configurations
    FOR EACH ROW EXECUTE FUNCTION sergod_protect_loyalty_configuration();

  CREATE TABLE loyalty_movements (
    movement_id uuid PRIMARY KEY,
    loyalty_account_id uuid NOT NULL REFERENCES loyalty_accounts(loyalty_account_id),
    type text NOT NULL CHECK (type IN ('EARN','REDEEM','EARN_REVERSAL','REDEEM_RESTORE','ADMIN_CORRECTION')),
    points_signed bigint NOT NULL CHECK (points_signed <> 0),
    source_type text NOT NULL CHECK (length(trim(source_type)) > 0),
    source_id uuid NOT NULL,
    actor_id uuid REFERENCES user_accounts(account_id),
    reason text,
    balance_after bigint NOT NULL,
    idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
    loyalty_configuration_id uuid REFERENCES loyalty_configurations(loyalty_configuration_id),
    earn_clp_per_point_snapshot bigint CHECK (earn_clp_per_point_snapshot > 0),
    redeem_clp_per_point_snapshot bigint CHECK (redeem_clp_per_point_snapshot > 0),
    loyalty_eligible_amount_snapshot bigint CHECK (loyalty_eligible_amount_snapshot >= 0),
    cumulative_refunded_loyalty_eligible_clp_snapshot bigint CHECK (cumulative_refunded_loyalty_eligible_clp_snapshot >= 0),
    occurred_at timestamptz NOT NULL,
    CHECK (
      (type IN ('EARN','REDEEM_RESTORE') AND points_signed > 0) OR
      (type IN ('REDEEM','EARN_REVERSAL') AND points_signed < 0) OR
      type='ADMIN_CORRECTION'
    ),
    CHECK (
      type <> 'ADMIN_CORRECTION' OR (
        actor_id IS NOT NULL AND length(trim(reason)) > 0
        AND source_type='ADMIN_CORRECTION' AND source_id=movement_id
        AND loyalty_configuration_id IS NULL
        AND earn_clp_per_point_snapshot IS NULL
        AND redeem_clp_per_point_snapshot IS NULL
        AND loyalty_eligible_amount_snapshot IS NULL
        AND cumulative_refunded_loyalty_eligible_clp_snapshot IS NULL
      )
    )
  );

  CREATE INDEX loyalty_movements_account_history_idx
    ON loyalty_movements (loyalty_account_id,occurred_at DESC,movement_id DESC);
  CREATE INDEX loyalty_movements_source_idx ON loyalty_movements (source_type,source_id);
  CREATE INDEX loyalty_movements_configuration_idx
    ON loyalty_movements (loyalty_configuration_id) WHERE loyalty_configuration_id IS NOT NULL;
  CREATE INDEX loyalty_movements_actor_idx
    ON loyalty_movements (actor_id) WHERE actor_id IS NOT NULL;

  CREATE FUNCTION sergod_protect_loyalty_movement()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    RAISE EXCEPTION 'loyalty movement ledger is immutable' USING ERRCODE='23514';
  END;
  $$;

  CREATE TRIGGER loyalty_movements_immutable
    BEFORE UPDATE OR DELETE ON loyalty_movements
    FOR EACH ROW EXECUTE FUNCTION sergod_protect_loyalty_movement();

  ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE loyalty_configurations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE loyalty_movements ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE loyalty_accounts,loyalty_configurations,loyalty_movements FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_create_loyalty_account_for_user() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_configuration() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_movement() FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
      REVOKE ALL ON TABLE loyalty_accounts,loyalty_configurations,loyalty_movements FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_create_loyalty_account_for_user() FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_configuration() FROM anon;
      REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_movement() FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
      REVOKE ALL ON TABLE loyalty_accounts,loyalty_configurations,loyalty_movements FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_create_loyalty_account_for_user() FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_configuration() FROM authenticated;
      REVOKE EXECUTE ON FUNCTION sergod_protect_loyalty_movement() FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
      GRANT SELECT,INSERT,UPDATE ON TABLE loyalty_accounts,loyalty_configurations TO service_role;
      GRANT SELECT,INSERT ON TABLE loyalty_movements TO service_role;
    END IF;
  END;
  $$;

ALTER TABLE cart_groups
  ADD COLUMN selected_coupon_id uuid REFERENCES coupons(coupon_id),
  ADD COLUMN requested_points bigint CHECK (requested_points IS NULL OR requested_points > 0),
  ADD COLUMN delivery_mode text CHECK (delivery_mode IS NULL OR delivery_mode IN ('PICKUP','SHIPPING')),
  ADD COLUMN pickup_branch_id uuid REFERENCES branches(branch_id),
  ADD COLUMN shipping_recipient_name text,
  ADD COLUMN shipping_address text,
  ADD COLUMN shipping_commune text,
  ADD COLUMN shipping_additional_details text,
  ADD COLUMN shipping_option_id uuid REFERENCES shipping_options(shipping_option_id),
  ADD COLUMN delivery_last_validated_at timestamptz,
  ADD COLUMN delivery_validation_status text NOT NULL DEFAULT 'NOT_VALIDATED'
    CHECK (delivery_validation_status IN ('NOT_VALIDATED','VALID','INVALID')),
  ADD COLUMN delivery_validation_error_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN checkout_version bigint NOT NULL DEFAULT 1 CHECK (checkout_version > 0),
  ADD CONSTRAINT cart_groups_delivery_intent_shape_ck CHECK (
    (delivery_mode IS NULL
      AND pickup_branch_id IS NULL
      AND shipping_recipient_name IS NULL
      AND shipping_address IS NULL
      AND shipping_commune IS NULL
      AND shipping_additional_details IS NULL
      AND shipping_option_id IS NULL)
    OR
    (delivery_mode='PICKUP'
      AND pickup_branch_id IS NOT NULL
      AND shipping_recipient_name IS NULL
      AND shipping_address IS NULL
      AND shipping_commune IS NULL
      AND shipping_additional_details IS NULL
      AND shipping_option_id IS NULL)
    OR
    (delivery_mode='SHIPPING'
      AND pickup_branch_id IS NULL
      AND length(trim(shipping_recipient_name))>0
      AND length(trim(shipping_address))>0
      AND length(trim(shipping_commune))>0
      AND (shipping_additional_details IS NULL OR length(trim(shipping_additional_details))>0)
      AND shipping_option_id IS NOT NULL)
  ),
  ADD CONSTRAINT cart_groups_delivery_validation_ck CHECK (
    (delivery_mode IS NULL
      AND delivery_validation_status='NOT_VALIDATED'
      AND delivery_last_validated_at IS NULL
      AND cardinality(delivery_validation_error_codes)=0)
    OR
    (delivery_mode IS NOT NULL AND (
      (delivery_validation_status='NOT_VALIDATED'
        AND delivery_last_validated_at IS NULL
        AND cardinality(delivery_validation_error_codes)=0)
      OR
      (delivery_validation_status='VALID'
        AND delivery_last_validated_at IS NOT NULL
        AND cardinality(delivery_validation_error_codes)=0)
      OR
      (delivery_validation_status='INVALID'
        AND delivery_last_validated_at IS NOT NULL
        AND cardinality(delivery_validation_error_codes)>0)
    ))
  );

CREATE INDEX cart_groups_selected_coupon_idx ON cart_groups(selected_coupon_id)
  WHERE selected_coupon_id IS NOT NULL;
CREATE INDEX cart_groups_pickup_branch_idx ON cart_groups(pickup_branch_id)
  WHERE pickup_branch_id IS NOT NULL;
CREATE INDEX cart_groups_shipping_option_idx ON cart_groups(shipping_option_id)
  WHERE shipping_option_id IS NOT NULL;

CREATE FUNCTION sergod_protect_cart_checkout_provisional() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  checkout_changed boolean;
BEGIN
  IF NEW.state<>'ACTIVE' THEN
    NEW.selected_coupon_id := NULL;
    NEW.requested_points := NULL;
    NEW.delivery_mode := NULL;
    NEW.pickup_branch_id := NULL;
    NEW.shipping_recipient_name := NULL;
    NEW.shipping_address := NULL;
    NEW.shipping_commune := NULL;
    NEW.shipping_additional_details := NULL;
    NEW.shipping_option_id := NULL;
    NEW.delivery_last_validated_at := NULL;
    NEW.delivery_validation_status := 'NOT_VALIDATED';
    NEW.delivery_validation_error_codes := '{}';
  END IF;

  checkout_changed := ROW(
    NEW.selected_coupon_id,NEW.requested_points,NEW.delivery_mode,NEW.pickup_branch_id,
    NEW.shipping_recipient_name,NEW.shipping_address,NEW.shipping_commune,
    NEW.shipping_additional_details,NEW.shipping_option_id,NEW.delivery_last_validated_at,
    NEW.delivery_validation_status,NEW.delivery_validation_error_codes
  ) IS DISTINCT FROM ROW(
    OLD.selected_coupon_id,OLD.requested_points,OLD.delivery_mode,OLD.pickup_branch_id,
    OLD.shipping_recipient_name,OLD.shipping_address,OLD.shipping_commune,
    OLD.shipping_additional_details,OLD.shipping_option_id,OLD.delivery_last_validated_at,
    OLD.delivery_validation_status,OLD.delivery_validation_error_codes
  );

  IF checkout_changed THEN
    IF NEW.state<>'ACTIVE' AND OLD.state<>'ACTIVE' THEN
      RAISE EXCEPTION 'checkout state belongs only to an active cart group' USING ERRCODE='23514';
    END IF;
    IF NEW.state='ACTIVE' AND NOT EXISTS (
      SELECT 1 FROM public.carts cart WHERE cart.cart_id=NEW.cart_id AND cart.state='ACTIVE'
    ) THEN
      RAISE EXCEPTION 'checkout state requires an active cart' USING ERRCODE='23514';
    END IF;
    NEW.checkout_version := OLD.checkout_version + 1;
  ELSIF NEW.checkout_version IS DISTINCT FROM OLD.checkout_version THEN
    RAISE EXCEPTION 'checkout version is managed by the database' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cart_groups_checkout_provisional_guard
  BEFORE UPDATE ON cart_groups
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_cart_checkout_provisional();

CREATE TABLE checkout_provisional_idempotency_results (
  idempotency_record_id uuid PRIMARY KEY REFERENCES idempotency_records(idempotency_record_id),
  cart_group_id uuid NOT NULL REFERENCES cart_groups(cart_group_id),
  response_json jsonb NOT NULL CHECK (jsonb_typeof(response_json)='object'),
  created_at timestamptz NOT NULL
);
CREATE INDEX checkout_provisional_results_group_idx
  ON checkout_provisional_idempotency_results(cart_group_id,created_at);

ALTER TABLE checkout_provisional_idempotency_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_provisional_idempotency_results FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON checkout_provisional_idempotency_results FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON checkout_provisional_idempotency_results FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT ON checkout_provisional_idempotency_results TO service_role;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM authenticated;
  END IF;
END $$;

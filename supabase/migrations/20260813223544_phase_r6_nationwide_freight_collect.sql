ALTER TABLE cart_groups
  ADD COLUMN delivery_intent_schema_version integer,
  ADD COLUMN shipping_payment_mode text,
  ADD COLUMN shipping_destination_type text,
  ADD COLUMN shipping_carrier text,
  ADD COLUMN shipping_agency_destination text,
  ADD COLUMN shipping_included_in_order_total boolean;

UPDATE cart_groups
   SET delivery_intent_schema_version=CASE WHEN delivery_mode='SHIPPING' THEN 1 ELSE 2 END,
       delivery_validation_status=CASE
         WHEN delivery_mode='SHIPPING' THEN 'INVALID'
         ELSE delivery_validation_status
       END,
       delivery_last_validated_at=CASE
         WHEN delivery_mode='SHIPPING' THEN COALESCE(delivery_last_validated_at,CURRENT_TIMESTAMP)
         ELSE delivery_last_validated_at
       END,
       delivery_validation_error_codes=CASE
         WHEN delivery_mode='SHIPPING' THEN ARRAY['DELIVERY_INTENT_REQUIRES_R6_UPDATE']::text[]
         ELSE delivery_validation_error_codes
       END
 WHERE delivery_mode IS NOT NULL;

ALTER TABLE cart_groups
  ADD CONSTRAINT cart_groups_delivery_intent_schema_version_ck CHECK (
    (delivery_mode IS NULL AND delivery_intent_schema_version IS NULL)
    OR (delivery_mode IS NOT NULL AND delivery_intent_schema_version IN (1,2))
  ),
  ADD CONSTRAINT cart_groups_shipping_payment_mode_ck CHECK (
    shipping_payment_mode IS NULL OR shipping_payment_mode='FREIGHT_COLLECT'
  ),
  ADD CONSTRAINT cart_groups_shipping_destination_type_ck CHECK (
    shipping_destination_type IS NULL OR shipping_destination_type='CARRIER_AGENCY'
  ),
  ADD CONSTRAINT cart_groups_shipping_carrier_ck CHECK (
    shipping_carrier IS NULL OR shipping_carrier IN ('CHILEXPRESS','STARKEN')
  );

ALTER TABLE cart_groups DROP CONSTRAINT cart_groups_delivery_intent_shape_ck;
ALTER TABLE cart_groups ADD CONSTRAINT cart_groups_delivery_intent_shape_ck CHECK (
  (delivery_mode IS NULL
    AND delivery_intent_schema_version IS NULL
    AND pickup_branch_id IS NULL
    AND shipping_recipient_name IS NULL
    AND shipping_address IS NULL
    AND shipping_commune IS NULL
    AND shipping_additional_details IS NULL
    AND shipping_option_id IS NULL
    AND shipping_payment_mode IS NULL
    AND shipping_destination_type IS NULL
    AND shipping_carrier IS NULL
    AND shipping_agency_destination IS NULL
    AND shipping_included_in_order_total IS NULL)
  OR
  (delivery_mode='PICKUP'
    AND delivery_intent_schema_version=2
    AND pickup_branch_id IS NOT NULL
    AND shipping_recipient_name IS NULL
    AND shipping_address IS NULL
    AND shipping_commune IS NULL
    AND shipping_additional_details IS NULL
    AND shipping_option_id IS NULL
    AND shipping_payment_mode IS NULL
    AND shipping_destination_type IS NULL
    AND shipping_carrier IS NULL
    AND shipping_agency_destination IS NULL
    AND shipping_included_in_order_total IS NULL)
  OR
  (delivery_mode='SHIPPING'
    AND delivery_intent_schema_version=1
    AND pickup_branch_id IS NULL
    AND length(trim(shipping_recipient_name))>0
    AND length(trim(shipping_address))>0
    AND length(trim(shipping_commune))>0
    AND (shipping_additional_details IS NULL OR length(trim(shipping_additional_details))>0)
    AND shipping_option_id IS NOT NULL
    AND shipping_payment_mode IS NULL
    AND shipping_destination_type IS NULL
    AND shipping_carrier IS NULL
    AND shipping_agency_destination IS NULL
    AND shipping_included_in_order_total IS NULL)
  OR
  (delivery_mode='SHIPPING'
    AND delivery_intent_schema_version=2
    AND pickup_branch_id IS NULL
    AND length(trim(shipping_recipient_name))>0
    AND shipping_address IS NULL
    AND length(trim(shipping_commune))>0
    AND shipping_additional_details IS NULL
    AND shipping_option_id IS NULL
    AND shipping_payment_mode='FREIGHT_COLLECT'
    AND shipping_destination_type='CARRIER_AGENCY'
    AND shipping_carrier IN ('CHILEXPRESS','STARKEN')
    AND length(trim(shipping_agency_destination))>0
    AND shipping_included_in_order_total=false)
);

CREATE OR REPLACE FUNCTION sergod_protect_cart_checkout_provisional() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  checkout_changed boolean;
BEGIN
  IF NEW.state<>'ACTIVE' THEN
    NEW.selected_coupon_id := NULL;
    NEW.requested_points := NULL;
    NEW.delivery_mode := NULL;
    NEW.delivery_intent_schema_version := NULL;
    NEW.pickup_branch_id := NULL;
    NEW.shipping_recipient_name := NULL;
    NEW.shipping_address := NULL;
    NEW.shipping_commune := NULL;
    NEW.shipping_additional_details := NULL;
    NEW.shipping_option_id := NULL;
    NEW.shipping_payment_mode := NULL;
    NEW.shipping_destination_type := NULL;
    NEW.shipping_carrier := NULL;
    NEW.shipping_agency_destination := NULL;
    NEW.shipping_included_in_order_total := NULL;
    NEW.delivery_last_validated_at := NULL;
    NEW.delivery_validation_status := 'NOT_VALIDATED';
    NEW.delivery_validation_error_codes := '{}';
  END IF;

  checkout_changed := ROW(
    NEW.selected_coupon_id,NEW.requested_points,NEW.delivery_mode,
    NEW.delivery_intent_schema_version,NEW.pickup_branch_id,
    NEW.shipping_recipient_name,NEW.shipping_address,NEW.shipping_commune,
    NEW.shipping_additional_details,NEW.shipping_option_id,NEW.shipping_payment_mode,
    NEW.shipping_destination_type,NEW.shipping_carrier,NEW.shipping_agency_destination,
    NEW.shipping_included_in_order_total,NEW.delivery_last_validated_at,
    NEW.delivery_validation_status,NEW.delivery_validation_error_codes
  ) IS DISTINCT FROM ROW(
    OLD.selected_coupon_id,OLD.requested_points,OLD.delivery_mode,
    OLD.delivery_intent_schema_version,OLD.pickup_branch_id,
    OLD.shipping_recipient_name,OLD.shipping_address,OLD.shipping_commune,
    OLD.shipping_additional_details,OLD.shipping_option_id,OLD.shipping_payment_mode,
    OLD.shipping_destination_type,OLD.shipping_carrier,OLD.shipping_agency_destination,
    OLD.shipping_included_in_order_total,OLD.delivery_last_validated_at,
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

ALTER TABLE pos_sales ALTER COLUMN shipping_fee_amount_clp DROP NOT NULL;
ALTER TABLE pos_sales DROP CONSTRAINT pos_sales_check;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_delivery_shape_ck CHECK (
  (sale_type='REGULAR' AND delivery_mode='NONE' AND delivery_snapshot IS NULL
    AND shipping_fee_amount_clp=0)
  OR
  (sale_type='PREORDER' AND delivery_mode='NONE' AND delivery_snapshot IS NULL
    AND shipping_fee_amount_clp=0)
  OR
  (sale_type='PREORDER' AND delivery_mode IN ('PICKUP','SHIPPING')
    AND delivery_snapshot IS NOT NULL AND (
      (delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v1'
        AND delivery_snapshot->>'snapshot_schema_version'='1'
        AND shipping_fee_amount_clp IS NOT NULL)
      OR
      (delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v2'
        AND delivery_snapshot->>'snapshot_schema_version'='2'
        AND (
          (delivery_mode='PICKUP' AND shipping_fee_amount_clp=0)
          OR
          (delivery_mode='SHIPPING'
            AND shipping_fee_amount_clp IS NULL
            AND delivery_snapshot->>'mode'='SHIPPING'
            AND delivery_snapshot->>'shippingPaymentMode'='FREIGHT_COLLECT'
            AND delivery_snapshot->>'destinationType'='CARRIER_AGENCY'
            AND delivery_snapshot->>'carrier' IN ('CHILEXPRESS','STARKEN')
            AND length(trim(delivery_snapshot->>'destinationCommune'))>0
            AND length(trim(delivery_snapshot->>'agencyDestination'))>0
            AND delivery_snapshot->'shippingCostAmountClp'='null'::jsonb
            AND delivery_snapshot->>'shippingIncludedInOrderTotal'='false')
        ))
    ))
);

CREATE OR REPLACE FUNCTION sergod_validate_pos_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='COMPLETED' AND OLD.state<>'COMPLETED' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_lines WHERE pos_sale_id=NEW.pos_sale_id) THEN
      RAISE EXCEPTION 'completed POS sale requires lines' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pos_sale_settlements s WHERE s.pos_sale_id=NEW.pos_sale_id
        AND s.amount_clp=NEW.total_amount_clp
        AND ((NEW.total_amount_clp=0 AND s.kind='ZERO_TOTAL') OR (NEW.total_amount_clp>0 AND s.kind='EXTERNAL_DECLARED'))
    ) THEN RAISE EXCEPTION 'completed POS sale requires an exact settlement' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (
      SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id
      WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'REGULAR' OR l.preorder_campaign_id IS NOT NULL)
    ) THEN RAISE EXCEPTION 'regular POS sale contains an incompatible line' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (
      SELECT 1 FROM public.pos_sale_lines l WHERE l.pos_sale_id=NEW.pos_sale_id AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements m JOIN public.inventory_positions ip USING(inventory_position_id)
        WHERE m.source_type='POS_SALE' AND m.source_id=NEW.pos_sale_id::text AND m.movement_type='POS_SALE_CONSUMED'
          AND ip.product_id=l.product_id AND ip.branch_id=NEW.branch_id AND m.quantity=l.quantity
      )
    ) THEN RAISE EXCEPTION 'regular POS sale inventory effect is missing' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND (
      NEW.delivery_mode NOT IN ('PICKUP','SHIPPING') OR NEW.delivery_snapshot IS NULL
      OR (NEW.account_id IS NULL AND (NEW.buyer_name IS NULL OR (NEW.buyer_email IS NULL AND NEW.buyer_phone IS NULL)))
    ) THEN RAISE EXCEPTION 'preorder POS sale requires identity and delivery' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND (
      NEW.delivery_snapshot->>'snapshot_contract'<>'DeliverySnapshot.v2'
      OR NEW.delivery_snapshot->>'snapshot_schema_version'<>'2'
    ) THEN RAISE EXCEPTION 'preorder POS sale requires an R6 delivery snapshot' USING ERRCODE='23514'; END IF;
    IF NEW.delivery_mode='SHIPPING' AND (
      NEW.shipping_fee_amount_clp IS NOT NULL
      OR NEW.delivery_snapshot->'shippingCostAmountClp'<>'null'::jsonb
      OR NEW.delivery_snapshot->>'shippingIncludedInOrderTotal'<>'false'
      OR (NEW.delivery_snapshot->>'orderTotalWithoutShippingClp')::bigint<>NEW.total_amount_clp
    ) THEN RAISE EXCEPTION 'freight collect delivery cannot alter the sale total' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND EXISTS (
      SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id
      WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'PREORDER' OR l.preorder_campaign_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.preorder_commitments c WHERE c.pos_sale_line_id=l.pos_sale_line_id AND c.state='PAID_COMMITTED'
      ))
    ) THEN RAISE EXCEPTION 'preorder POS sale commitment is missing' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM anon;
    REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion() FROM authenticated;
  END IF;
END $$;

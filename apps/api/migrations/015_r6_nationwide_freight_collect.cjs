const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260813223544_phase_r6_nationwide_freight_collect.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cart_groups
     WHERE delivery_mode='SHIPPING' AND delivery_intent_schema_version=2
  ) OR EXISTS (
    SELECT 1 FROM pos_sales
     WHERE delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v2'
       AND delivery_snapshot->>'snapshot_schema_version'='2'
  ) THEN
    RAISE EXCEPTION 'cannot remove R6 delivery schema while R6 records exist';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sergod_validate_pos_completion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='COMPLETED' AND OLD.state<>'COMPLETED' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_lines WHERE pos_sale_id=NEW.pos_sale_id) THEN RAISE EXCEPTION 'completed POS sale requires lines' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_settlements s WHERE s.pos_sale_id=NEW.pos_sale_id AND s.amount_clp=NEW.total_amount_clp AND ((NEW.total_amount_clp=0 AND s.kind='ZERO_TOTAL') OR (NEW.total_amount_clp>0 AND s.kind='EXTERNAL_DECLARED'))) THEN RAISE EXCEPTION 'completed POS sale requires an exact settlement' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'REGULAR' OR l.preorder_campaign_id IS NOT NULL)) THEN RAISE EXCEPTION 'regular POS sale contains an incompatible line' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l WHERE l.pos_sale_id=NEW.pos_sale_id AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m JOIN public.inventory_positions ip USING(inventory_position_id) WHERE m.source_type='POS_SALE' AND m.source_id=NEW.pos_sale_id::text AND m.movement_type='POS_SALE_CONSUMED' AND ip.product_id=l.product_id AND ip.branch_id=NEW.branch_id AND m.quantity=l.quantity)) THEN RAISE EXCEPTION 'regular POS sale inventory effect is missing' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND (NEW.delivery_mode NOT IN ('PICKUP','SHIPPING') OR NEW.delivery_snapshot IS NULL OR (NEW.account_id IS NULL AND (NEW.buyer_name IS NULL OR (NEW.buyer_email IS NULL AND NEW.buyer_phone IS NULL)))) THEN RAISE EXCEPTION 'preorder POS sale requires identity and delivery' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'PREORDER' OR l.preorder_campaign_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.preorder_commitments c WHERE c.pos_sale_line_id=l.pos_sale_line_id AND c.state='PAID_COMMITTED'))) THEN RAISE EXCEPTION 'preorder POS sale commitment is missing' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE pos_sales DROP CONSTRAINT pos_sales_delivery_shape_ck;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_check CHECK (
  (sale_type='REGULAR' AND delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
  OR (sale_type='PREORDER' AND ((delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
    OR (delivery_mode IN ('PICKUP','SHIPPING') AND delivery_snapshot IS NOT NULL)))
);
ALTER TABLE pos_sales ALTER COLUMN shipping_fee_amount_clp SET NOT NULL;

CREATE OR REPLACE FUNCTION sergod_protect_cart_checkout_provisional() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE checkout_changed boolean;
BEGIN
  IF NEW.state<>'ACTIVE' THEN
    NEW.selected_coupon_id := NULL; NEW.requested_points := NULL; NEW.delivery_mode := NULL;
    NEW.pickup_branch_id := NULL; NEW.shipping_recipient_name := NULL; NEW.shipping_address := NULL;
    NEW.shipping_commune := NULL; NEW.shipping_additional_details := NULL; NEW.shipping_option_id := NULL;
    NEW.delivery_last_validated_at := NULL; NEW.delivery_validation_status := 'NOT_VALIDATED'; NEW.delivery_validation_error_codes := '{}';
  END IF;
  checkout_changed := ROW(NEW.selected_coupon_id,NEW.requested_points,NEW.delivery_mode,NEW.pickup_branch_id,NEW.shipping_recipient_name,NEW.shipping_address,NEW.shipping_commune,NEW.shipping_additional_details,NEW.shipping_option_id,NEW.delivery_last_validated_at,NEW.delivery_validation_status,NEW.delivery_validation_error_codes) IS DISTINCT FROM ROW(OLD.selected_coupon_id,OLD.requested_points,OLD.delivery_mode,OLD.pickup_branch_id,OLD.shipping_recipient_name,OLD.shipping_address,OLD.shipping_commune,OLD.shipping_additional_details,OLD.shipping_option_id,OLD.delivery_last_validated_at,OLD.delivery_validation_status,OLD.delivery_validation_error_codes);
  IF checkout_changed THEN
    IF NEW.state<>'ACTIVE' AND OLD.state<>'ACTIVE' THEN RAISE EXCEPTION 'checkout state belongs only to an active cart group' USING ERRCODE='23514'; END IF;
    IF NEW.state='ACTIVE' AND NOT EXISTS (SELECT 1 FROM public.carts cart WHERE cart.cart_id=NEW.cart_id AND cart.state='ACTIVE') THEN RAISE EXCEPTION 'checkout state requires an active cart' USING ERRCODE='23514'; END IF;
    NEW.checkout_version := OLD.checkout_version + 1;
  ELSIF NEW.checkout_version IS DISTINCT FROM OLD.checkout_version THEN RAISE EXCEPTION 'checkout version is managed by the database' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

ALTER TABLE cart_groups DROP CONSTRAINT cart_groups_delivery_intent_shape_ck;
ALTER TABLE cart_groups
  DROP CONSTRAINT cart_groups_shipping_carrier_ck,
  DROP CONSTRAINT cart_groups_shipping_destination_type_ck,
  DROP CONSTRAINT cart_groups_shipping_payment_mode_ck,
  DROP CONSTRAINT cart_groups_delivery_intent_schema_version_ck,
  DROP COLUMN shipping_included_in_order_total,
  DROP COLUMN shipping_agency_destination,
  DROP COLUMN shipping_carrier,
  DROP COLUMN shipping_destination_type,
  DROP COLUMN shipping_payment_mode,
  DROP COLUMN delivery_intent_schema_version;
ALTER TABLE cart_groups ADD CONSTRAINT cart_groups_delivery_intent_shape_ck CHECK (
  (delivery_mode IS NULL AND pickup_branch_id IS NULL AND shipping_recipient_name IS NULL AND shipping_address IS NULL AND shipping_commune IS NULL AND shipping_additional_details IS NULL AND shipping_option_id IS NULL)
  OR (delivery_mode='PICKUP' AND pickup_branch_id IS NOT NULL AND shipping_recipient_name IS NULL AND shipping_address IS NULL AND shipping_commune IS NULL AND shipping_additional_details IS NULL AND shipping_option_id IS NULL)
  OR (delivery_mode='SHIPPING' AND pickup_branch_id IS NULL AND length(trim(shipping_recipient_name))>0 AND length(trim(shipping_address))>0 AND length(trim(shipping_commune))>0 AND (shipping_additional_details IS NULL OR length(trim(shipping_additional_details))>0) AND shipping_option_id IS NOT NULL)
);
`;

exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;

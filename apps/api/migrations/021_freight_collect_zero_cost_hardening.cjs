const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820123000_freight_collect_zero_cost_hardening.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pos_sales WHERE delivery_mode='SHIPPING'
      AND delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v2'
      AND delivery_snapshot->'shippingCostAmountClp'='0'::jsonb
  ) THEN
    RAISE EXCEPTION 'cannot restore nullable freight cost while zero-cost delivery evidence exists';
  END IF;
END $$;
ALTER TABLE pos_sales DROP CONSTRAINT pos_sales_delivery_shape_ck;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_delivery_shape_ck CHECK (
  (sale_type='REGULAR' AND delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
  OR (sale_type='PREORDER' AND delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
  OR (sale_type='PREORDER' AND delivery_mode IN ('PICKUP','SHIPPING') AND delivery_snapshot IS NOT NULL AND (
    (delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v1' AND delivery_snapshot->>'snapshot_schema_version'='1' AND shipping_fee_amount_clp IS NOT NULL)
    OR (delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v2' AND delivery_snapshot->>'snapshot_schema_version'='2' AND (
      (delivery_mode='PICKUP' AND shipping_fee_amount_clp=0)
      OR (delivery_mode='SHIPPING' AND shipping_fee_amount_clp IS NULL
        AND delivery_snapshot->>'mode'='SHIPPING'
        AND delivery_snapshot->>'shippingPaymentMode'='FREIGHT_COLLECT'
        AND delivery_snapshot->>'destinationType'='CARRIER_AGENCY'
        AND delivery_snapshot->>'carrier' IN ('CHILEXPRESS','STARKEN')
        AND length(trim(delivery_snapshot->>'destinationCommune'))>0
        AND length(trim(delivery_snapshot->>'agencyDestination'))>0
        AND delivery_snapshot->'shippingCostAmountClp'='null'::jsonb
        AND delivery_snapshot->>'shippingIncludedInOrderTotal'='false')))))
);
CREATE OR REPLACE FUNCTION sergod_validate_pos_completion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='COMPLETED' AND OLD.state<>'COMPLETED' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_lines WHERE pos_sale_id=NEW.pos_sale_id) THEN RAISE EXCEPTION 'completed POS sale requires lines' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_settlements s WHERE s.pos_sale_id=NEW.pos_sale_id AND s.amount_clp=NEW.total_amount_clp AND ((NEW.total_amount_clp=0 AND s.kind='ZERO_TOTAL') OR (NEW.total_amount_clp>0 AND s.kind='EXTERNAL_DECLARED'))) THEN RAISE EXCEPTION 'completed POS sale requires an exact settlement' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'REGULAR' OR l.preorder_campaign_id IS NOT NULL)) THEN RAISE EXCEPTION 'regular POS sale contains an incompatible line' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='REGULAR' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l WHERE l.pos_sale_id=NEW.pos_sale_id AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m JOIN public.inventory_positions ip USING(inventory_position_id) WHERE m.source_type='POS_SALE' AND m.source_id=NEW.pos_sale_id::text AND m.movement_type='POS_SALE_CONSUMED' AND ip.product_id=l.product_id AND ip.branch_id=NEW.branch_id AND m.quantity=l.quantity)) THEN RAISE EXCEPTION 'regular POS sale inventory effect is missing' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND (NEW.delivery_mode NOT IN ('PICKUP','SHIPPING') OR NEW.delivery_snapshot IS NULL OR (NEW.account_id IS NULL AND (NEW.buyer_name IS NULL OR (NEW.buyer_email IS NULL AND NEW.buyer_phone IS NULL)))) THEN RAISE EXCEPTION 'preorder POS sale requires identity and delivery' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND (NEW.delivery_snapshot->>'snapshot_contract'<>'DeliverySnapshot.v2' OR NEW.delivery_snapshot->>'snapshot_schema_version'<>'2') THEN RAISE EXCEPTION 'preorder POS sale requires an R6 delivery snapshot' USING ERRCODE='23514'; END IF;
    IF NEW.delivery_mode='SHIPPING' AND (NEW.shipping_fee_amount_clp IS NOT NULL OR NEW.delivery_snapshot->'shippingCostAmountClp'<>'null'::jsonb OR NEW.delivery_snapshot->>'shippingIncludedInOrderTotal'<>'false' OR (NEW.delivery_snapshot->>'orderTotalWithoutShippingClp')::bigint<>NEW.total_amount_clp) THEN RAISE EXCEPTION 'freight collect delivery cannot alter the sale total' USING ERRCODE='23514'; END IF;
    IF NEW.sale_type='PREORDER' AND EXISTS (SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'PREORDER' OR l.preorder_campaign_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.preorder_commitments c WHERE c.pos_sale_line_id=l.pos_sale_line_id AND c.state='PAID_COMMITTED'))) THEN RAISE EXCEPTION 'preorder POS sale commitment is missing' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion() FROM PUBLIC;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;

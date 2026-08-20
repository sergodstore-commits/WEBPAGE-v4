CREATE TABLE external_money_methods (
  external_money_method_id uuid PRIMARY KEY,
  code_normalized text NOT NULL CHECK (code_normalized ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  description text,
  public_instructions text,
  direction text NOT NULL CHECK (direction IN ('INBOUND','REFUND','BOTH')),
  requires_external_reference boolean NOT NULL,
  requires_receipt_resource boolean NOT NULL,
  requires_evidence_note boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  first_used_at timestamptz,
  activated_by uuid REFERENCES user_accounts(account_id),
  activated_at timestamptz,
  deactivated_by uuid REFERENCES user_accounts(account_id),
  deactivated_at timestamptz,
  retired_by uuid REFERENCES user_accounts(account_id),
  retired_at timestamptz,
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  updated_by uuid NOT NULL REFERENCES user_accounts(account_id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX external_money_methods_code_idx ON external_money_methods(code_normalized);
CREATE INDEX external_money_methods_created_by_idx ON external_money_methods(created_by);
CREATE INDEX external_money_methods_updated_by_idx ON external_money_methods(updated_by);
CREATE INDEX external_money_methods_activated_by_idx ON external_money_methods(activated_by);
CREATE INDEX external_money_methods_deactivated_by_idx ON external_money_methods(deactivated_by);
CREATE INDEX external_money_methods_retired_by_idx ON external_money_methods(retired_by);

CREATE TABLE external_money_method_history (
  history_id uuid PRIMARY KEY,
  external_money_method_id uuid NOT NULL REFERENCES external_money_methods(external_money_method_id),
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX external_money_method_history_method_idx ON external_money_method_history(external_money_method_id);
CREATE INDEX external_money_method_history_actor_idx ON external_money_method_history(actor_id);

CREATE TABLE pos_sales (
  pos_sale_id uuid PRIMARY KEY,
  public_sale_number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(branch_id),
  sale_type text NOT NULL CHECK (sale_type IN ('REGULAR','PREORDER')),
  state text NOT NULL CHECK (state IN ('DRAFT','AWAITING_EXTERNAL_PAYMENT_CONFIRMATION','COMPLETED','CANCELLATION_REQUESTED','CANCELLATION_PENDING_REFUND','CANCELLED','DISCARDED','RETURNED_PARTIALLY','RETURNED_FULLY')),
  account_id uuid REFERENCES user_accounts(account_id),
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  account_role_snapshot text,
  account_state_snapshot text,
  identity_frozen_at timestamptz,
  delivery_snapshot jsonb,
  delivery_mode text NOT NULL DEFAULT 'NONE' CHECK (delivery_mode IN ('NONE','PICKUP','SHIPPING')),
  shipping_fee_amount_clp bigint NOT NULL DEFAULT 0 CHECK (shipping_fee_amount_clp >= 0),
  automatic_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (automatic_discount_amount_clp >= 0),
  manual_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (manual_discount_amount_clp >= 0),
  loyalty_redeemed_amount_clp bigint NOT NULL DEFAULT 0 CHECK (loyalty_redeemed_amount_clp >= 0),
  subtotal_amount_clp bigint NOT NULL DEFAULT 0 CHECK (subtotal_amount_clp >= 0),
  total_amount_clp bigint NOT NULL DEFAULT 0 CHECK (total_amount_clp >= 0),
  loyalty_points_requested bigint NOT NULL DEFAULT 0 CHECK (loyalty_points_requested >= 0),
  coupon_code_normalized text,
  applied_coupon_snapshot jsonb,
  loyalty_configuration_snapshot jsonb,
  loyalty_points_redeemed bigint NOT NULL DEFAULT 0 CHECK (loyalty_points_redeemed >= 0),
  loyalty_points_earned bigint NOT NULL DEFAULT 0 CHECK (loyalty_points_earned >= 0),
  loyalty_eligible_amount_clp bigint NOT NULL DEFAULT 0 CHECK (loyalty_eligible_amount_clp >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  created_at timestamptz NOT NULL,
  prepared_at timestamptz,
  completed_at timestamptz,
  discarded_at timestamptz,
  updated_at timestamptz NOT NULL,
  CHECK ((sale_type='REGULAR' AND delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
    OR (sale_type='PREORDER' AND ((delivery_mode='NONE' AND delivery_snapshot IS NULL AND shipping_fee_amount_clp=0)
      OR (delivery_mode IN ('PICKUP','SHIPPING') AND delivery_snapshot IS NOT NULL)))),
  CHECK (state NOT IN ('AWAITING_EXTERNAL_PAYMENT_CONFIRMATION','COMPLETED') OR account_id IS NULL
    OR (account_role_snapshot IS NOT NULL AND account_state_snapshot='ACTIVE' AND identity_frozen_at IS NOT NULL)),
  CHECK (state <> 'COMPLETED' OR completed_at IS NOT NULL)
);
CREATE INDEX pos_sales_history_idx ON pos_sales(branch_id,created_at DESC,pos_sale_id DESC);
CREATE INDEX pos_sales_daily_idx ON pos_sales(branch_id,completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX pos_sales_account_idx ON pos_sales(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX pos_sales_created_by_idx ON pos_sales(created_by);

CREATE TABLE pos_sale_lines (
  pos_sale_line_id uuid PRIMARY KEY,
  pos_sale_id uuid NOT NULL REFERENCES pos_sales(pos_sale_id),
  product_id uuid NOT NULL REFERENCES products(product_id),
  preorder_campaign_id uuid REFERENCES preorder_campaigns(preorder_campaign_id),
  sku_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  product_attributes_snapshot jsonb NOT NULL,
  game_id_snapshot uuid NOT NULL,
  category_id_snapshot uuid NOT NULL,
  collection_id_snapshot uuid,
  unit_price_amount_clp bigint NOT NULL CHECK (unit_price_amount_clp >= 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  line_subtotal_amount_clp bigint NOT NULL CHECK (line_subtotal_amount_clp >= 0),
  line_promotion_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (line_promotion_discount_amount_clp >= 0),
  allocated_sale_promotion_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (allocated_sale_promotion_discount_amount_clp >= 0),
  line_manual_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (line_manual_discount_amount_clp >= 0),
  allocated_sale_manual_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (allocated_sale_manual_discount_amount_clp >= 0),
  allocated_points_discount_amount_clp bigint NOT NULL DEFAULT 0 CHECK (allocated_points_discount_amount_clp >= 0),
  final_line_total_amount_clp bigint NOT NULL CHECK (final_line_total_amount_clp >= 0),
  promotion_snapshot jsonb,
  manual_discount_snapshot jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(pos_sale_id,product_id,preorder_campaign_id)
);
CREATE INDEX pos_sale_lines_sale_idx ON pos_sale_lines(pos_sale_id);
CREATE UNIQUE INDEX pos_sale_lines_regular_product_idx ON pos_sale_lines(pos_sale_id,product_id) WHERE preorder_campaign_id IS NULL;
CREATE INDEX pos_sale_lines_product_idx ON pos_sale_lines(product_id);
CREATE INDEX pos_sale_lines_campaign_idx ON pos_sale_lines(preorder_campaign_id);

CREATE TABLE pos_sale_state_history (
  history_id uuid PRIMARY KEY,
  pos_sale_id uuid NOT NULL REFERENCES pos_sales(pos_sale_id),
  from_state text,
  to_state text NOT NULL,
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  reason text,
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX pos_sale_state_history_sale_idx ON pos_sale_state_history(pos_sale_id,occurred_at);
CREATE INDEX pos_sale_state_history_actor_idx ON pos_sale_state_history(actor_id);

CREATE TABLE pos_sale_manual_discounts (
  manual_discount_id uuid PRIMARY KEY,
  pos_sale_id uuid NOT NULL REFERENCES pos_sales(pos_sale_id),
  pos_sale_line_id uuid REFERENCES pos_sale_lines(pos_sale_line_id),
  scope text NOT NULL CHECK (scope IN ('SALE','LINE')),
  discount_type text NOT NULL CHECK (discount_type IN ('PERCENT','FIXED_AMOUNT','FIXED_PRICE')),
  value bigint NOT NULL CHECK (value >= 0),
  result_amount_clp bigint NOT NULL CHECK (result_amount_clp >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(pos_sale_id,pos_sale_line_id),
  CHECK ((scope='SALE' AND pos_sale_line_id IS NULL) OR (scope='LINE' AND pos_sale_line_id IS NOT NULL))
);
CREATE INDEX pos_sale_manual_discounts_line_idx ON pos_sale_manual_discounts(pos_sale_line_id);
CREATE INDEX pos_sale_manual_discounts_actor_idx ON pos_sale_manual_discounts(actor_id);

CREATE TABLE pos_sale_settlements (
  pos_sale_settlement_id uuid PRIMARY KEY,
  pos_sale_id uuid NOT NULL UNIQUE REFERENCES pos_sales(pos_sale_id),
  kind text NOT NULL CHECK (kind IN ('EXTERNAL_DECLARED','ZERO_TOTAL')),
  amount_clp bigint NOT NULL CHECK (amount_clp >= 0),
  external_money_method_id uuid REFERENCES external_money_methods(external_money_method_id),
  method_snapshot jsonb,
  external_reference text,
  receipt_resource_id uuid REFERENCES resource_assets(resource_id),
  evidence_note text,
  declared_by uuid NOT NULL REFERENCES user_accounts(account_id),
  declared_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) > 0),
  correlation_id uuid NOT NULL,
  CHECK ((kind='ZERO_TOTAL' AND amount_clp=0 AND external_money_method_id IS NULL AND method_snapshot IS NULL AND external_reference IS NULL AND receipt_resource_id IS NULL AND evidence_note IS NULL)
    OR (kind='EXTERNAL_DECLARED' AND amount_clp>0 AND external_money_method_id IS NOT NULL AND method_snapshot IS NOT NULL))
);
CREATE INDEX pos_sale_settlements_method_idx ON pos_sale_settlements(external_money_method_id);
CREATE INDEX pos_sale_settlements_receipt_idx ON pos_sale_settlements(receipt_resource_id);
CREATE INDEX pos_sale_settlements_declared_by_idx ON pos_sale_settlements(declared_by);

CREATE TABLE promotion_usages (
  promotion_usage_id uuid PRIMARY KEY,
  promotion_id uuid NOT NULL REFERENCES promotions(promotion_id),
  coupon_id uuid REFERENCES coupons(coupon_id),
  account_id uuid REFERENCES user_accounts(account_id),
  channel text NOT NULL CHECK (channel='POS'),
  source_type text NOT NULL CHECK (source_type='POS_SALE'),
  source_id uuid NOT NULL REFERENCES pos_sales(pos_sale_id),
  status text NOT NULL CHECK (status IN ('COMMITTED','RELEASED')),
  discount_amount_clp bigint NOT NULL CHECK (discount_amount_clp > 0),
  applied_promotion_snapshot jsonb NOT NULL,
  claimed_lines_snapshot jsonb NOT NULL,
  qualifying_units_snapshot jsonb NOT NULL,
  benefited_units_snapshot jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  released_at timestamptz,
  occurred_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  CHECK ((status='COMMITTED' AND released_at IS NULL) OR (status='RELEASED' AND released_at IS NOT NULL)),
  UNIQUE(promotion_id,source_type,source_id)
);
CREATE INDEX promotion_usages_limits_idx ON promotion_usages(promotion_id,status,account_id);
CREATE INDEX promotion_usages_coupon_idx ON promotion_usages(coupon_id,status) WHERE coupon_id IS NOT NULL;
CREATE INDEX promotion_usages_coupon_account_idx ON promotion_usages(coupon_id,status,account_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX promotion_usages_account_idx ON promotion_usages(account_id);
CREATE INDEX promotion_usages_source_idx ON promotion_usages(source_id);

CREATE TABLE loyalty_effect_progress (
  loyalty_effect_progress_id uuid PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type='POS_SALE'),
  source_id uuid NOT NULL UNIQUE REFERENCES pos_sales(pos_sale_id),
  loyalty_configuration_id uuid NOT NULL REFERENCES loyalty_configurations(loyalty_configuration_id),
  configuration_snapshot jsonb NOT NULL,
  original_points_redeemed bigint NOT NULL CHECK (original_points_redeemed >= 0),
  original_points_earned bigint NOT NULL CHECK (original_points_earned >= 0),
  original_loyalty_eligible_amount_clp bigint NOT NULL CHECK (original_loyalty_eligible_amount_clp >= 0),
  historical_earn_clp_per_point bigint NOT NULL CHECK (historical_earn_clp_per_point > 0),
  historical_redeem_clp_per_point bigint NOT NULL CHECK (historical_redeem_clp_per_point > 0),
  cumulative_refunded_loyalty_eligible_clp bigint NOT NULL DEFAULT 0 CHECK (cumulative_refunded_loyalty_eligible_clp >= 0),
  earned_points_reversed bigint NOT NULL DEFAULT 0 CHECK (earned_points_reversed >= 0),
  redeemed_points_restored bigint NOT NULL DEFAULT 0 CHECK (redeemed_points_restored >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  completed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX loyalty_effect_progress_configuration_idx ON loyalty_effect_progress(loyalty_configuration_id);

CREATE TABLE preorder_commitments (
  preorder_commitment_id uuid PRIMARY KEY,
  preorder_campaign_id uuid NOT NULL REFERENCES preorder_campaigns(preorder_campaign_id),
  pos_sale_line_id uuid NOT NULL UNIQUE REFERENCES pos_sale_lines(pos_sale_line_id),
  account_id uuid REFERENCES user_accounts(account_id),
  guest_name text,
  guest_email_normalized text,
  guest_phone_e164 text,
  channel text NOT NULL CHECK (channel='POS'),
  state text NOT NULL CHECK (state IN ('PAID_COMMITTED','PARTIALLY_ASSIGNED','ASSIGNED','DELIVERED','CANCELLED')),
  quantity bigint NOT NULL CHECK (quantity > 0),
  fulfillment_snapshot jsonb NOT NULL,
  payment_confirmed_at timestamptz NOT NULL,
  assigned_quantity bigint NOT NULL DEFAULT 0 CHECK (assigned_quantity >= 0 AND assigned_quantity <= quantity),
  delivered_quantity bigint NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0 AND delivered_quantity <= assigned_quantity),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX preorder_commitments_allocation_idx ON preorder_commitments(preorder_campaign_id,payment_confirmed_at,created_at,preorder_commitment_id) WHERE state='PAID_COMMITTED';
CREATE INDEX preorder_commitments_account_idx ON preorder_commitments(account_id);

CREATE TABLE stock_reservations (
  stock_reservation_id uuid PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type='PREORDER_COMMITMENT'),
  preorder_commitment_id uuid NOT NULL REFERENCES preorder_commitments(preorder_commitment_id),
  preorder_allocation_id uuid NOT NULL UNIQUE,
  inventory_position_id uuid NOT NULL REFERENCES inventory_positions(inventory_position_id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','RELEASED','CONSUMED')),
  provenance_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  released_at timestamptz,
  consumed_at timestamptz,
  reason text,
  idempotency_key text NOT NULL
);
CREATE UNIQUE INDEX stock_reservations_active_source_idx ON stock_reservations(source_type,preorder_commitment_id) WHERE status='ACTIVE';
CREATE INDEX stock_reservations_commitment_idx ON stock_reservations(preorder_commitment_id);
CREATE INDEX stock_reservations_position_idx ON stock_reservations(inventory_position_id);

CREATE TABLE preorder_allocations (
  preorder_allocation_id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES preorder_campaigns(preorder_campaign_id),
  preorder_commitment_id uuid NOT NULL REFERENCES preorder_commitments(preorder_commitment_id),
  source_pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  stock_reservation_id uuid NOT NULL UNIQUE REFERENCES stock_reservations(stock_reservation_id) DEFERRABLE INITIALLY DEFERRED,
  quantity bigint NOT NULL CHECK (quantity > 0),
  lot_composition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(lot_composition_snapshot)='array'),
  state text NOT NULL CHECK (state IN ('ACTIVE','CONSUMED','RELEASED')),
  allocated_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  allocation_order bigint NOT NULL CHECK (allocation_order > 0),
  allocated_by_actor_id uuid REFERENCES user_accounts(account_id),
  idempotency_key text NOT NULL UNIQUE
);
CREATE INDEX preorder_allocations_campaign_idx ON preorder_allocations(campaign_id);
CREATE INDEX preorder_allocations_commitment_idx ON preorder_allocations(preorder_commitment_id);
CREATE INDEX preorder_allocations_pool_idx ON preorder_allocations(source_pool_id);
CREATE INDEX preorder_allocations_actor_idx ON preorder_allocations(allocated_by_actor_id);
ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_allocation_fk
  FOREIGN KEY (preorder_allocation_id) REFERENCES preorder_allocations(preorder_allocation_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE preorder_stock_pool_ledger DROP CONSTRAINT preorder_stock_pool_ledger_entry_type_check;
ALTER TABLE preorder_stock_pool_ledger DROP CONSTRAINT preorder_stock_pool_ledger_check;
ALTER TABLE preorder_stock_pool_ledger ADD COLUMN preorder_allocation_id uuid REFERENCES preorder_allocations(preorder_allocation_id);
ALTER TABLE preorder_stock_pool_ledger ADD CONSTRAINT preorder_stock_pool_ledger_entry_type_check CHECK (entry_type IN (
  'RECEIPT_IN','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','ALLOCATION_OUT','ALLOCATION_RETURN'
));
ALTER TABLE preorder_stock_pool_ledger ADD CONSTRAINT preorder_stock_pool_ledger_check CHECK (
  (entry_type = 'RECEIPT_IN' AND preorder_receipt_id IS NOT NULL AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NULL AND preorder_allocation_id IS NULL)
  OR (entry_type IN ('TRANSFER_IN','TRANSFER_OUT') AND preorder_receipt_id IS NULL AND preorder_stock_transfer_id IS NOT NULL AND inventory_movement_id IS NULL AND preorder_allocation_id IS NULL)
  OR (entry_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT') AND preorder_receipt_id IS NULL AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NOT NULL AND preorder_allocation_id IS NULL)
  OR (entry_type IN ('ALLOCATION_OUT','ALLOCATION_RETURN') AND preorder_receipt_id IS NULL AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NULL AND preorder_allocation_id IS NOT NULL)
);
CREATE INDEX preorder_stock_pool_ledger_allocation_idx ON preorder_stock_pool_ledger(preorder_allocation_id) WHERE preorder_allocation_id IS NOT NULL;

CREATE FUNCTION sergod_validate_pos_completion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
    IF NEW.sale_type='PREORDER' AND EXISTS (
      SELECT 1 FROM public.pos_sale_lines l JOIN public.products p ON p.product_id=l.product_id
      WHERE l.pos_sale_id=NEW.pos_sale_id AND (p.sale_type<>'PREORDER' OR l.preorder_campaign_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.preorder_commitments c WHERE c.pos_sale_line_id=l.pos_sale_line_id AND c.state='PAID_COMMITTED'
      ))
    ) THEN RAISE EXCEPTION 'preorder POS sale commitment is missing' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_sale_completion_validated BEFORE UPDATE OF state ON pos_sales FOR EACH ROW EXECUTE FUNCTION sergod_validate_pos_completion();

CREATE TRIGGER external_money_method_history_immutable BEFORE UPDATE OR DELETE ON external_money_method_history FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
CREATE TRIGGER pos_sale_state_history_immutable BEFORE UPDATE OR DELETE ON pos_sale_state_history FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
CREATE TRIGGER pos_sale_settlements_immutable BEFORE UPDATE OR DELETE ON pos_sale_settlements FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();

CREATE FUNCTION sergod_protect_promotion_usage() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'promotion usage cannot be deleted' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'released_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'released_at')
    THEN RAISE EXCEPTION 'promotion usage commercial facts are immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status<>'COMMITTED' OR NEW.status<>'RELEASED' OR NEW.released_at IS NULL
    THEN RAISE EXCEPTION 'promotion usage transition is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER promotion_usages_protected BEFORE UPDATE OR DELETE ON promotion_usages FOR EACH ROW EXECUTE FUNCTION sergod_protect_promotion_usage();

CREATE FUNCTION sergod_protect_loyalty_effect_progress() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'loyalty effect progress cannot be deleted' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW) - 'cumulative_refunded_loyalty_eligible_clp' - 'earned_points_reversed' - 'redeemed_points_restored' - 'version' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'cumulative_refunded_loyalty_eligible_clp' - 'earned_points_reversed' - 'redeemed_points_restored' - 'version' - 'updated_at')
    THEN RAISE EXCEPTION 'loyalty effect origin is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.cumulative_refunded_loyalty_eligible_clp < OLD.cumulative_refunded_loyalty_eligible_clp
     OR NEW.earned_points_reversed < OLD.earned_points_reversed
     OR NEW.redeemed_points_restored < OLD.redeemed_points_restored
     OR NEW.version <= OLD.version
    THEN RAISE EXCEPTION 'loyalty effect progress cannot move backwards' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loyalty_effect_progress_protected BEFORE UPDATE OR DELETE ON loyalty_effect_progress FOR EACH ROW EXECUTE FUNCTION sergod_protect_loyalty_effect_progress();

CREATE FUNCTION sergod_protect_external_money_method() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.code_normalized<>OLD.code_normalized THEN RAISE EXCEPTION 'money method code is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.first_used_at IS NOT NULL AND (NEW.direction<>OLD.direction OR NEW.requires_external_reference<>OLD.requires_external_reference OR NEW.requires_receipt_resource<>OLD.requires_receipt_resource OR NEW.requires_evidence_note<>OLD.requires_evidence_note) THEN RAISE EXCEPTION 'used money method requirements are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='RETIRED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'retired money method is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='ACTIVE' AND (NEW.display_name<>OLD.display_name OR NEW.description IS DISTINCT FROM OLD.description OR NEW.public_instructions IS DISTINCT FROM OLD.public_instructions OR NEW.direction<>OLD.direction OR NEW.requires_external_reference<>OLD.requires_external_reference OR NEW.requires_receipt_resource<>OLD.requires_receipt_resource OR NEW.requires_evidence_note<>OLD.requires_evidence_note) THEN RAISE EXCEPTION 'active money method configuration is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_money_methods_protected BEFORE UPDATE ON external_money_methods FOR EACH ROW EXECUTE FUNCTION sergod_protect_external_money_method();

CREATE FUNCTION sergod_protect_completed_pos_sale() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.state IN ('COMPLETED','DISCARDED','CANCELLED','RETURNED_PARTIALLY','RETURNED_FULLY')
    THEN RAISE EXCEPTION 'final POS sale cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.state='COMPLETED'
     AND (to_jsonb(NEW) - 'state' - 'version' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'version' - 'updated_at')
    THEN RAISE EXCEPTION 'completed POS sale commercial facts are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.state IN ('DISCARDED','CANCELLED','RETURNED_PARTIALLY','RETURNED_FULLY') AND NEW IS DISTINCT FROM OLD
    THEN RAISE EXCEPTION 'final POS sale is immutable' USING ERRCODE='23514'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER completed_pos_sales_protected BEFORE UPDATE OR DELETE ON pos_sales FOR EACH ROW EXECUTE FUNCTION sergod_protect_completed_pos_sale();

CREATE FUNCTION sergod_protect_pos_sale_child() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate_sale_id uuid;
BEGIN
  candidate_sale_id := CASE WHEN TG_OP='DELETE' THEN OLD.pos_sale_id ELSE NEW.pos_sale_id END;
  IF EXISTS (SELECT 1 FROM public.pos_sales WHERE pos_sale_id=candidate_sale_id AND state IN ('COMPLETED','DISCARDED','CANCELLED','RETURNED_PARTIALLY','RETURNED_FULLY')) THEN
    RAISE EXCEPTION 'final POS sale commercial data is immutable' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER pos_sale_lines_protected BEFORE INSERT OR UPDATE OR DELETE ON pos_sale_lines FOR EACH ROW EXECUTE FUNCTION sergod_protect_pos_sale_child();
CREATE TRIGGER pos_sale_manual_discounts_protected BEFORE INSERT OR UPDATE OR DELETE ON pos_sale_manual_discounts FOR EACH ROW EXECUTE FUNCTION sergod_protect_pos_sale_child();

ALTER TABLE external_money_methods ENABLE ROW LEVEL SECURITY; ALTER TABLE external_money_method_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY; ALTER TABLE pos_sale_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE pos_sale_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_manual_discounts ENABLE ROW LEVEL SECURITY; ALTER TABLE pos_sale_settlements ENABLE ROW LEVEL SECURITY; ALTER TABLE promotion_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_effect_progress ENABLE ROW LEVEL SECURITY; ALTER TABLE preorder_commitments ENABLE ROW LEVEL SECURITY; ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY; ALTER TABLE preorder_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON external_money_methods,external_money_method_history,pos_sales,pos_sale_lines,pos_sale_state_history,pos_sale_manual_discounts,pos_sale_settlements,promotion_usages,loyalty_effect_progress,preorder_commitments,stock_reservations,preorder_allocations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON external_money_methods,external_money_method_history,pos_sales,pos_sale_lines,pos_sale_state_history,pos_sale_manual_discounts,pos_sale_settlements,promotion_usages,loyalty_effect_progress,preorder_commitments,stock_reservations,preorder_allocations FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON external_money_methods,external_money_method_history,pos_sales,pos_sale_lines,pos_sale_state_history,pos_sale_manual_discounts,pos_sale_settlements,promotion_usages,loyalty_effect_progress,preorder_commitments,stock_reservations,preorder_allocations FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON external_money_methods,external_money_method_history,pos_sales,pos_sale_lines,pos_sale_state_history,pos_sale_manual_discounts,pos_sale_settlements,promotion_usages,loyalty_effect_progress,preorder_commitments,stock_reservations,preorder_allocations TO service_role; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion(),sergod_protect_external_money_method(),sergod_protect_completed_pos_sale(),sergod_protect_pos_sale_child(),sergod_protect_promotion_usage(),sergod_protect_loyalty_effect_progress() FROM PUBLIC;

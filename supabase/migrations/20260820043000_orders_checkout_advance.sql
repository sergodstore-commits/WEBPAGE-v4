CREATE TABLE public.order_public_number_sequences (
  order_year integer PRIMARY KEY CHECK (order_year BETWEEN 2000 AND 9999),
  next_number bigint NOT NULL CHECK (next_number BETWEEN 1 AND 1000000)
);

CREATE TABLE public.orders (
  order_id uuid PRIMARY KEY,
  public_number text NOT NULL UNIQUE CHECK (public_number ~ '^SG-[0-9]{4}-[0-9]{6}$'),
  account_id uuid NOT NULL REFERENCES public.user_accounts(account_id),
  cart_group_id uuid NOT NULL UNIQUE REFERENCES public.cart_groups(cart_group_id),
  branch_id uuid NOT NULL REFERENCES public.branches(branch_id),
  order_type text NOT NULL CHECK (order_type IN ('REGULAR','PREORDER')),
  state text NOT NULL CHECK (state IN ('PENDING_PAYMENT','PAID','PREPARING','READY_FOR_PICKUP','SHIPPED','FULFILLED','CANCELLED')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('PICKUP','FREIGHT_COLLECT')),
  delivery_snapshot jsonb NOT NULL CHECK (jsonb_typeof(delivery_snapshot)='object'),
  merchandise_subtotal_clp bigint NOT NULL CHECK (merchandise_subtotal_clp >= 0),
  promotion_discount_clp bigint NOT NULL CHECK (promotion_discount_clp >= 0),
  points_discount_clp bigint NOT NULL CHECK (points_discount_clp >= 0),
  total_amount_clp bigint NOT NULL CHECK (total_amount_clp >= 0),
  shipping_included_in_order_total boolean NOT NULL DEFAULT false CHECK (shipping_included_in_order_total=false),
  currency text NOT NULL DEFAULT 'CLP' CHECK (currency='CLP'),
  checkout_version bigint NOT NULL CHECK (checkout_version > 0),
  applied_promotions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(applied_promotions_snapshot)='array'),
  coupon_snapshot jsonb,
  loyalty_snapshot jsonb NOT NULL CHECK (jsonb_typeof(loyalty_snapshot)='object'),
  requires_external_payment boolean NOT NULL,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (total_amount_clp = merchandise_subtotal_clp - promotion_discount_clp - points_discount_clp),
  CHECK ((state='PENDING_PAYMENT' AND expires_at IS NOT NULL AND cancelled_at IS NULL)
      OR (state='CANCELLED' AND cancelled_at IS NOT NULL)
      OR (state NOT IN ('PENDING_PAYMENT','CANCELLED') AND cancelled_at IS NULL)),
  CHECK ((delivery_mode='PICKUP' AND delivery_snapshot->>'mode'='PICKUP')
      OR (delivery_mode='FREIGHT_COLLECT'
          AND delivery_snapshot->>'mode'='SHIPPING'
          AND delivery_snapshot->>'shippingPaymentMode'='FREIGHT_COLLECT'
          AND delivery_snapshot->>'destinationType'='CARRIER_AGENCY'
          AND delivery_snapshot->>'shippingIncludedInOrderTotal'='false'))
);
CREATE INDEX orders_account_history_idx ON public.orders(account_id,created_at DESC,order_id DESC);
CREATE INDEX orders_state_expiration_idx ON public.orders(state,expires_at,order_id) WHERE state='PENDING_PAYMENT';

CREATE TABLE public.order_lines (
  order_line_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  product_id uuid NOT NULL REFERENCES public.products(product_id),
  preorder_campaign_id uuid REFERENCES public.preorder_campaigns(preorder_campaign_id),
  sale_type text NOT NULL CHECK (sale_type IN ('REGULAR','PREORDER')),
  sku_snapshot text NOT NULL CHECK (length(trim(sku_snapshot))>0),
  product_name_snapshot text NOT NULL CHECK (length(trim(product_name_snapshot))>0),
  language_snapshot text,
  edition_snapshot text,
  condition_snapshot text,
  unit_price_clp bigint NOT NULL CHECK (unit_price_clp >= 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  line_subtotal_clp bigint NOT NULL CHECK (line_subtotal_clp >= 0),
  created_at timestamptz NOT NULL,
  CHECK (line_subtotal_clp = unit_price_clp * quantity),
  CHECK ((sale_type='REGULAR' AND preorder_campaign_id IS NULL)
      OR (sale_type='PREORDER' AND preorder_campaign_id IS NOT NULL))
);
CREATE INDEX order_lines_order_idx ON public.order_lines(order_id,created_at,order_line_id);
CREATE INDEX order_lines_product_idx ON public.order_lines(product_id);

CREATE TABLE public.order_inventory_reservations (
  order_inventory_reservation_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  order_line_id uuid NOT NULL UNIQUE REFERENCES public.order_lines(order_line_id),
  inventory_position_id uuid NOT NULL REFERENCES public.inventory_positions(inventory_position_id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','RELEASED','CONSUMED')),
  created_at timestamptz NOT NULL,
  released_at timestamptz,
  consumed_at timestamptz,
  CHECK ((status='ACTIVE' AND released_at IS NULL AND consumed_at IS NULL)
      OR (status='RELEASED' AND released_at IS NOT NULL AND consumed_at IS NULL)
      OR (status='CONSUMED' AND released_at IS NULL AND consumed_at IS NOT NULL))
);
CREATE INDEX order_inventory_reservations_active_idx ON public.order_inventory_reservations(order_id) WHERE status='ACTIVE';

CREATE TABLE public.order_preorder_reservations (
  order_preorder_reservation_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  order_line_id uuid NOT NULL UNIQUE REFERENCES public.order_lines(order_line_id),
  preorder_campaign_id uuid NOT NULL REFERENCES public.preorder_campaigns(preorder_campaign_id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','RELEASED','COMMITTED')),
  created_at timestamptz NOT NULL,
  released_at timestamptz,
  committed_at timestamptz,
  CHECK ((status='ACTIVE' AND released_at IS NULL AND committed_at IS NULL)
      OR (status='RELEASED' AND released_at IS NOT NULL AND committed_at IS NULL)
      OR (status='COMMITTED' AND released_at IS NULL AND committed_at IS NOT NULL))
);
CREATE INDEX order_preorder_reservations_active_idx ON public.order_preorder_reservations(order_id) WHERE status='ACTIVE';

CREATE TABLE public.order_state_history (
  order_state_history_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason))>0),
  actor_id uuid REFERENCES public.user_accounts(account_id),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX order_state_history_order_idx ON public.order_state_history(order_id,occurred_at,order_state_history_id);

CREATE TABLE public.checkout_order_idempotency_results (
  checkout_order_idempotency_result_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.user_accounts(account_id),
  cart_group_id uuid NOT NULL REFERENCES public.cart_groups(cart_group_id),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key))>0),
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint)=64),
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  created_at timestamptz NOT NULL,
  UNIQUE(account_id,idempotency_key)
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_preorder_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_order_idempotency_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_public_number_sequences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.orders, public.order_lines, public.order_inventory_reservations,
  public.order_preorder_reservations, public.order_state_history,
  public.checkout_order_idempotency_results, public.order_public_number_sequences FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.orders, public.order_lines, public.order_inventory_reservations,
      public.order_preorder_reservations, public.order_state_history,
      public.checkout_order_idempotency_results, public.order_public_number_sequences FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.orders, public.order_lines, public.order_inventory_reservations,
      public.order_preorder_reservations, public.order_state_history,
      public.checkout_order_idempotency_results, public.order_public_number_sequences FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.orders, public.order_lines,
      public.order_inventory_reservations, public.order_preorder_reservations,
      public.order_state_history, public.checkout_order_idempotency_results,
      public.order_public_number_sequences TO service_role;
  END IF;
END $$;

ALTER TABLE public.promotion_usages
  DROP CONSTRAINT promotion_usages_channel_check,
  DROP CONSTRAINT promotion_usages_source_type_check,
  DROP CONSTRAINT promotion_usages_source_id_fkey;

ALTER TABLE public.promotion_usages
  ADD CONSTRAINT promotion_usages_channel_check
    CHECK (channel IN ('POS','ECOMMERCE')),
  ADD CONSTRAINT promotion_usages_source_type_check
    CHECK (source_type IN ('POS_SALE','ORDER')),
  ADD CONSTRAINT promotion_usages_channel_source_check
    CHECK ((channel='POS' AND source_type='POS_SALE')
        OR (channel='ECOMMERCE' AND source_type='ORDER'));

CREATE UNIQUE INDEX promotion_usages_idempotency_idx
  ON public.promotion_usages(idempotency_key);

CREATE UNIQUE INDEX loyalty_movements_idempotency_idx
  ON public.loyalty_movements(idempotency_key);

CREATE TABLE public.order_loyalty_reservations (
  order_loyalty_reservation_id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(order_id),
  loyalty_account_id uuid NOT NULL REFERENCES public.loyalty_accounts(loyalty_account_id),
  points bigint NOT NULL CHECK (points > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','CONSUMED','RELEASED')),
  configuration_snapshot jsonb NOT NULL CHECK (jsonb_typeof(configuration_snapshot)='object'),
  created_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  CHECK ((status='ACTIVE' AND consumed_at IS NULL AND released_at IS NULL)
      OR (status='CONSUMED' AND consumed_at IS NOT NULL AND released_at IS NULL)
      OR (status='RELEASED' AND consumed_at IS NULL AND released_at IS NOT NULL))
);
CREATE INDEX order_loyalty_reservations_active_idx
  ON public.order_loyalty_reservations(order_id) WHERE status='ACTIVE';

ALTER TABLE public.order_loyalty_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_loyalty_reservations FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.order_loyalty_reservations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.order_loyalty_reservations FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.order_loyalty_reservations TO service_role;
  END IF;
END $$;

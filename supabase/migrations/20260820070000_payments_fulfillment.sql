ALTER TABLE public.orders ADD COLUMN paid_at timestamptz;

CREATE TABLE public.payment_attempts (
  payment_attempt_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(order_id),
  account_id uuid NOT NULL REFERENCES public.user_accounts(account_id),
  provider text NOT NULL CHECK (provider IN ('FLOW','WEBPAY')),
  status text NOT NULL CHECK (status IN ('CREATED','PENDING','REQUIRES_ACTION','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
  amount_clp bigint NOT NULL CHECK (amount_clp > 0),
  currency text NOT NULL DEFAULT 'CLP' CHECK (currency='CLP'),
  provider_reference text,
  redirect_url text,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key))>0),
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint)=64),
  failure_code text,
  expires_at timestamptz,
  authorized_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  UNIQUE(account_id,idempotency_key),
  UNIQUE(provider,provider_reference),
  CHECK ((status='SUCCEEDED' AND authorized_at IS NOT NULL AND terminal_at IS NOT NULL)
      OR (status IN ('FAILED','CANCELLED','EXPIRED') AND terminal_at IS NOT NULL)
      OR (status IN ('CREATED','PENDING','REQUIRES_ACTION') AND terminal_at IS NULL))
);
CREATE UNIQUE INDEX payment_attempts_one_active_per_order_idx
  ON public.payment_attempts(order_id)
  WHERE status IN ('CREATED','PENDING','REQUIRES_ACTION');
CREATE UNIQUE INDEX payment_attempts_one_success_per_order_idx
  ON public.payment_attempts(order_id) WHERE status='SUCCEEDED';
CREATE INDEX payment_attempts_order_history_idx
  ON public.payment_attempts(order_id,created_at DESC,payment_attempt_id DESC);
CREATE INDEX payment_attempts_admin_idx
  ON public.payment_attempts(status,provider,created_at DESC,payment_attempt_id DESC);

CREATE TABLE public.payment_attempt_events (
  payment_attempt_event_id uuid PRIMARY KEY,
  payment_attempt_id uuid NOT NULL REFERENCES public.payment_attempts(payment_attempt_id),
  from_status text,
  to_status text NOT NULL,
  source text NOT NULL CHECK (source IN ('CUSTOMER','FLOW','WEBPAY','ADMIN','SYSTEM')),
  reason text NOT NULL CHECK (length(trim(reason))>0),
  actor_id uuid REFERENCES public.user_accounts(account_id),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX payment_attempt_events_history_idx
  ON public.payment_attempt_events(payment_attempt_id,occurred_at,payment_attempt_event_id);

CREATE TABLE public.order_fulfillments (
  fulfillment_id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(order_id),
  method text NOT NULL CHECK (method IN ('PICKUP','FREIGHT_COLLECT')),
  status text NOT NULL CHECK (status IN ('PENDING','PREPARING','READY_FOR_PICKUP','SHIPPED','FULFILLED')),
  recipient_name text,
  recipient_phone text,
  carrier text CHECK (carrier IN ('CHILEXPRESS','STARKEN')),
  commune text,
  agency text,
  tracking_code text,
  prepared_at timestamptz,
  ready_at timestamptz,
  shipped_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK ((method='PICKUP' AND carrier IS NULL AND tracking_code IS NULL)
      OR (method='FREIGHT_COLLECT')),
  CHECK (method='PICKUP' OR carrier IS NOT NULL OR status IN ('PENDING','PREPARING'))
);
CREATE INDEX order_fulfillments_status_idx ON public.order_fulfillments(status,updated_at,fulfillment_id);

CREATE TABLE public.fulfillment_events (
  fulfillment_event_id uuid PRIMARY KEY,
  fulfillment_id uuid NOT NULL REFERENCES public.order_fulfillments(fulfillment_id),
  from_status text,
  to_status text NOT NULL,
  actor_id uuid REFERENCES public.user_accounts(account_id),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX fulfillment_events_history_idx
  ON public.fulfillment_events(fulfillment_id,occurred_at,fulfillment_event_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_attempts, public.payment_attempt_events,
  public.order_fulfillments, public.fulfillment_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.payment_attempts, public.payment_attempt_events,
      public.order_fulfillments, public.fulfillment_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.payment_attempts, public.payment_attempt_events,
      public.order_fulfillments, public.fulfillment_events FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.payment_attempts, public.payment_attempt_events,
      public.order_fulfillments, public.fulfillment_events TO service_role;
  END IF;
END $$;

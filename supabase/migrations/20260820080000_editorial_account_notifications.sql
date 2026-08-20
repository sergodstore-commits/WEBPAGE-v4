CREATE TABLE public.editorial_entries (
  editorial_entry_id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('TOURNAMENT','NEWS','COMMUNITY','COMIC_SERIES','COMIC_CHAPTER','QUEST','HALL_OF_FAME')),
  status text NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(trim(title))>0),
  excerpt text NOT NULL CHECK (length(trim(excerpt))>0),
  body text NOT NULL CHECK (length(trim(body))>0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.user_accounts(account_id),
  updated_by uuid NOT NULL REFERENCES public.user_accounts(account_id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK ((status='PUBLISHED' AND published_at IS NOT NULL) OR status<>'PUBLISHED')
);
CREATE INDEX editorial_entries_public_idx
  ON public.editorial_entries(type,published_at DESC,editorial_entry_id DESC)
  WHERE status='PUBLISHED';

CREATE TABLE public.account_delivery_preferences (
  account_id uuid PRIMARY KEY REFERENCES public.user_accounts(account_id),
  recipient_name text,
  recipient_phone text,
  carrier text CHECK (carrier IN ('CHILEXPRESS','STARKEN')),
  destination_commune text,
  agency_destination text,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version>0)
);

CREATE TABLE public.notification_outbox (
  notification_id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN (
    'ACCOUNT_VERIFICATION','PASSWORD_RESET','ORDER_CREATED','PAYMENT_SUCCEEDED','PAYMENT_FAILED',
    'ORDER_PREPARING','ORDER_READY_FOR_PICKUP','ORDER_SHIPPED','ORDER_FULFILLED','PREORDER_UPDATE'
  )),
  recipient_account_id uuid REFERENCES public.user_accounts(account_id),
  recipient_email text NOT NULL CHECK (position('@' IN recipient_email)>1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING','SENDING','SENT','RETRY','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX notification_outbox_due_idx
  ON public.notification_outbox(next_attempt_at,notification_id)
  WHERE status IN ('PENDING','RETRY');

ALTER TABLE public.editorial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_delivery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editorial_entries, public.account_delivery_preferences,
  public.notification_outbox FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.editorial_entries, public.account_delivery_preferences,
      public.notification_outbox FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.editorial_entries, public.account_delivery_preferences,
      public.notification_outbox FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.editorial_entries,
      public.account_delivery_preferences,public.notification_outbox TO service_role;
  END IF;
END $$;


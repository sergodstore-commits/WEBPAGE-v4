CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE preorder_campaigns (
  preorder_campaign_id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(product_id),
  branch_id uuid NOT NULL REFERENCES branches(branch_id),
  fulfillment_group_key text CHECK (
    fulfillment_group_key IS NULL OR length(trim(fulfillment_group_key)) > 0
  ),
  operational_state text NOT NULL CHECK (operational_state IN (
    'DRAFT','SCHEDULED','OPEN','CLOSED','RECEIVING','FULFILLING','COMPLETED','CANCELLED'
  )),
  publication_status text NOT NULL CHECK (publication_status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
  capacity bigint NOT NULL CHECK (capacity > 0),
  temporarily_reserved bigint NOT NULL DEFAULT 0 CHECK (temporarily_reserved >= 0),
  committed bigint NOT NULL DEFAULT 0 CHECK (committed >= 0),
  received bigint NOT NULL DEFAULT 0 CHECK (received >= 0),
  transferred_in bigint NOT NULL DEFAULT 0 CHECK (transferred_in >= 0),
  transferred_out bigint NOT NULL DEFAULT 0 CHECK (transferred_out >= 0),
  adjusted_in bigint NOT NULL DEFAULT 0 CHECK (adjusted_in >= 0),
  adjusted_out bigint NOT NULL DEFAULT 0 CHECK (adjusted_out >= 0),
  assigned bigint NOT NULL DEFAULT 0 CHECK (assigned >= 0),
  delivered bigint NOT NULL DEFAULT 0 CHECK (delivered >= 0),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  estimated_arrival_text text NOT NULL CHECK (length(trim(estimated_arrival_text)) > 0),
  published_at timestamptz,
  unpublished_at timestamptz,
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (opens_at < closes_at),
  CHECK (temporarily_reserved + committed <= capacity),
  CHECK (delivered <= assigned AND assigned <= committed),
  CHECK (assigned <= received + transferred_in + adjusted_in - transferred_out - adjusted_out),
  CHECK (received + transferred_in + adjusted_in >= transferred_out + adjusted_out),
  CHECK (
    (publication_status = 'PUBLISHED' AND operational_state IN ('SCHEDULED','OPEN')
      AND published_at IS NOT NULL)
    OR (publication_status = 'DRAFT' AND published_at IS NULL AND unpublished_at IS NULL)
    OR (publication_status = 'UNPUBLISHED' AND unpublished_at IS NOT NULL)
  )
);

ALTER TABLE preorder_campaigns ADD CONSTRAINT preorder_campaigns_no_overlapping_windows
  EXCLUDE USING gist (
    product_id WITH =,
    branch_id WITH =,
    tstzrange(opens_at, closes_at, '[)') WITH &&
  ) WHERE (operational_state <> 'CANCELLED');

CREATE INDEX preorder_campaigns_admin_list_idx
  ON preorder_campaigns (created_at DESC, preorder_campaign_id DESC);
CREATE INDEX preorder_campaigns_product_idx ON preorder_campaigns (product_id);
CREATE INDEX preorder_campaigns_branch_idx ON preorder_campaigns (branch_id);
CREATE INDEX preorder_campaigns_created_by_idx ON preorder_campaigns (created_by);
CREATE INDEX preorder_campaigns_open_job_idx ON preorder_campaigns (opens_at, preorder_campaign_id)
  WHERE operational_state = 'SCHEDULED';
CREATE INDEX preorder_campaigns_close_job_idx ON preorder_campaigns (closes_at, preorder_campaign_id)
  WHERE operational_state IN ('SCHEDULED','OPEN');

CREATE TABLE preorder_campaign_state_history (
  history_id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES preorder_campaigns(preorder_campaign_id),
  dimension text NOT NULL CHECK (dimension IN ('OPERATIONAL','PUBLICATION')),
  from_value text,
  to_value text NOT NULL CHECK (length(trim(to_value)) > 0),
  actor_id uuid REFERENCES user_accounts(account_id),
  reason text CHECK (reason IS NULL OR length(trim(reason)) > 0),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX preorder_campaign_history_idx
  ON preorder_campaign_state_history (campaign_id, occurred_at, history_id);
CREATE INDEX preorder_campaign_history_actor_idx
  ON preorder_campaign_state_history (actor_id) WHERE actor_id IS NOT NULL;

CREATE TABLE preorder_stock_pools (
  preorder_stock_pool_id uuid PRIMARY KEY,
  inventory_position_id uuid NOT NULL REFERENCES inventory_positions(inventory_position_id),
  pool_type text NOT NULL CHECK (pool_type IN ('CAMPAIGN','UNASSIGNED')),
  campaign_id uuid REFERENCES preorder_campaigns(preorder_campaign_id),
  available_quantity bigint NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    (pool_type = 'CAMPAIGN' AND campaign_id IS NOT NULL)
    OR (pool_type = 'UNASSIGNED' AND campaign_id IS NULL)
  )
);
CREATE UNIQUE INDEX preorder_stock_pools_campaign_idx
  ON preorder_stock_pools (campaign_id) WHERE pool_type = 'CAMPAIGN';
CREATE UNIQUE INDEX preorder_stock_pools_unassigned_idx
  ON preorder_stock_pools (inventory_position_id) WHERE pool_type = 'UNASSIGNED';
CREATE INDEX preorder_stock_pools_position_idx ON preorder_stock_pools (inventory_position_id);

CREATE TABLE preorder_receipts (
  receipt_id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES preorder_campaigns(preorder_campaign_id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  reference text CHECK (reference IS NULL OR length(trim(reference)) > 0),
  occurred_at timestamptz NOT NULL,
  inventory_movement_id uuid NOT NULL UNIQUE
    REFERENCES inventory_movements(movement_id) DEFERRABLE INITIALLY DEFERRED,
  campaign_pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  correlation_id uuid NOT NULL,
  UNIQUE (campaign_id, idempotency_key)
);
CREATE INDEX preorder_receipts_campaign_history_idx
  ON preorder_receipts (campaign_id, occurred_at DESC, receipt_id DESC);
CREATE INDEX preorder_receipts_actor_idx ON preorder_receipts (actor_id);
CREATE INDEX preorder_receipts_pool_idx ON preorder_receipts (campaign_pool_id);

CREATE TABLE preorder_stock_lot_balances (
  preorder_stock_lot_balance_id uuid PRIMARY KEY,
  pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  origin_type text NOT NULL CHECK (origin_type IN ('PREORDER_RECEIPT','PREORDER_ADJUSTMENT')),
  origin_id uuid NOT NULL,
  upstream_provenance_snapshot jsonb,
  available_quantity bigint NOT NULL CHECK (available_quantity >= 0),
  first_entered_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  UNIQUE (pool_id, origin_type, origin_id),
  CHECK (upstream_provenance_snapshot IS NULL)
);
CREATE INDEX preorder_stock_lots_fifo_idx ON preorder_stock_lot_balances (
  pool_id, first_entered_at, origin_type, origin_id, preorder_stock_lot_balance_id
) WHERE available_quantity > 0;

CREATE TABLE preorder_stock_transfers (
  preorder_stock_transfer_id uuid PRIMARY KEY,
  source_pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  destination_pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  state text NOT NULL CHECK (state = 'COMPLETED'),
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  CHECK (source_pool_id <> destination_pool_id),
  UNIQUE (source_pool_id, idempotency_key)
);
CREATE INDEX preorder_stock_transfers_source_idx
  ON preorder_stock_transfers (source_pool_id, occurred_at DESC, preorder_stock_transfer_id DESC);
CREATE INDEX preorder_stock_transfers_destination_idx
  ON preorder_stock_transfers (destination_pool_id, occurred_at DESC, preorder_stock_transfer_id DESC);
CREATE INDEX preorder_stock_transfers_actor_idx ON preorder_stock_transfers (actor_id);

CREATE TABLE preorder_stock_pool_ledger (
  pool_ledger_id uuid PRIMARY KEY,
  pool_id uuid NOT NULL REFERENCES preorder_stock_pools(preorder_stock_pool_id),
  entry_type text NOT NULL CHECK (entry_type IN (
    'RECEIPT_IN','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT'
  )),
  quantity bigint NOT NULL CHECK (quantity > 0),
  preorder_receipt_id uuid REFERENCES preorder_receipts(receipt_id),
  preorder_stock_transfer_id uuid REFERENCES preorder_stock_transfers(preorder_stock_transfer_id),
  inventory_movement_id uuid REFERENCES inventory_movements(movement_id),
  related_source_lots_snapshot jsonb NOT NULL CHECK (jsonb_typeof(related_source_lots_snapshot) = 'array'),
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  CHECK (
    (entry_type = 'RECEIPT_IN' AND preorder_receipt_id IS NOT NULL
      AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NULL)
    OR (entry_type IN ('TRANSFER_IN','TRANSFER_OUT') AND preorder_receipt_id IS NULL
      AND preorder_stock_transfer_id IS NOT NULL AND inventory_movement_id IS NULL)
    OR (entry_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT') AND preorder_receipt_id IS NULL
      AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NOT NULL)
  )
);
CREATE INDEX preorder_stock_pool_ledger_history_idx
  ON preorder_stock_pool_ledger (pool_id, occurred_at DESC, pool_ledger_id DESC);
CREATE INDEX preorder_stock_pool_ledger_receipt_idx
  ON preorder_stock_pool_ledger (preorder_receipt_id) WHERE preorder_receipt_id IS NOT NULL;
CREATE INDEX preorder_stock_pool_ledger_transfer_idx
  ON preorder_stock_pool_ledger (preorder_stock_transfer_id)
  WHERE preorder_stock_transfer_id IS NOT NULL;
CREATE INDEX preorder_stock_pool_ledger_movement_idx
  ON preorder_stock_pool_ledger (inventory_movement_id) WHERE inventory_movement_id IS NOT NULL;

CREATE FUNCTION sergod_validate_preorder_pool()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  position_product uuid;
  position_branch uuid;
  campaign_product uuid;
  campaign_branch uuid;
  product_sale_type text;
BEGIN
  SELECT ip.product_id, ip.branch_id, p.sale_type
    INTO position_product, position_branch, product_sale_type
    FROM public.inventory_positions ip
    JOIN public.products p ON p.product_id = ip.product_id
   WHERE ip.inventory_position_id = NEW.inventory_position_id;
  IF product_sale_type IS DISTINCT FROM 'PREORDER' THEN
    RAISE EXCEPTION 'preorder pool requires PREORDER product' USING ERRCODE = '23514';
  END IF;
  IF NEW.pool_type = 'CAMPAIGN' THEN
    SELECT product_id, branch_id INTO campaign_product, campaign_branch
      FROM public.preorder_campaigns WHERE preorder_campaign_id = NEW.campaign_id;
    IF campaign_product IS DISTINCT FROM position_product OR campaign_branch IS DISTINCT FROM position_branch THEN
      RAISE EXCEPTION 'campaign pool position is incompatible' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preorder_stock_pools_validate
  BEFORE INSERT OR UPDATE ON preorder_stock_pools
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_preorder_pool();

CREATE FUNCTION sergod_validate_preorder_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target_pool uuid;
  target_campaign uuid;
  pool_quantity bigint;
  lot_quantity bigint;
  campaign_quantity bigint;
  campaign_pool_count bigint;
  campaign_publication text;
  product_publication text;
  product_sale_type text;
  branch_state text;
  target_product uuid;
BEGIN
  IF TG_TABLE_NAME = 'preorder_campaigns' THEN
    target_campaign := COALESCE(NEW.preorder_campaign_id, OLD.preorder_campaign_id);
    SELECT c.publication_status, p.publication_status, p.sale_type, b.state
      INTO campaign_publication, product_publication, product_sale_type, branch_state
      FROM public.preorder_campaigns c
      JOIN public.products p ON p.product_id = c.product_id
      JOIN public.branches b ON b.branch_id = c.branch_id
     WHERE c.preorder_campaign_id = target_campaign;
    IF FOUND AND (
      product_sale_type <> 'PREORDER' OR branch_state <> 'ACTIVE'
      OR (campaign_publication = 'PUBLISHED' AND product_publication <> 'PUBLISHED')
    ) THEN
      RAISE EXCEPTION 'campaign catalog or branch compatibility is invalid' USING ERRCODE = '23514';
    END IF;
    SELECT count(*)
      INTO campaign_pool_count
      FROM public.preorder_stock_pools
     WHERE campaign_id = target_campaign AND pool_type = 'CAMPAIGN';
    IF EXISTS (
      SELECT 1 FROM public.preorder_campaigns WHERE preorder_campaign_id = target_campaign
    ) AND campaign_pool_count <> 1 THEN
      RAISE EXCEPTION 'campaign requires exactly one CAMPAIGN pool' USING ERRCODE = '23514';
    END IF;
    SELECT preorder_stock_pool_id INTO target_pool
      FROM public.preorder_stock_pools
     WHERE campaign_id = target_campaign AND pool_type = 'CAMPAIGN';
  ELSIF TG_TABLE_NAME = 'products' THEN
    target_product := COALESCE(NEW.product_id, OLD.product_id);
    SELECT publication_status INTO product_publication
      FROM public.products WHERE product_id = target_product;
    IF FOUND AND product_publication <> 'PUBLISHED' AND EXISTS (
      SELECT 1
        FROM public.preorder_campaigns
       WHERE product_id = target_product AND publication_status = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'a non-published product cannot retain a published preorder campaign'
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'preorder_stock_pools' THEN
    target_pool := COALESCE(NEW.preorder_stock_pool_id, OLD.preorder_stock_pool_id);
    target_campaign := COALESCE(NEW.campaign_id, OLD.campaign_id);
    IF target_campaign IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.preorder_campaigns WHERE preorder_campaign_id = target_campaign
    ) AND (
      SELECT count(*) FROM public.preorder_stock_pools
       WHERE campaign_id = target_campaign AND pool_type = 'CAMPAIGN'
    ) <> 1 THEN
      RAISE EXCEPTION 'campaign requires exactly one CAMPAIGN pool' USING ERRCODE = '23514';
    END IF;
  ELSE
    target_pool := COALESCE(NEW.pool_id, OLD.pool_id);
  END IF;

  SELECT available_quantity, campaign_id INTO pool_quantity, target_campaign
    FROM public.preorder_stock_pools WHERE preorder_stock_pool_id = target_pool;
  IF FOUND THEN
    SELECT COALESCE(sum(available_quantity), 0) INTO lot_quantity
      FROM public.preorder_stock_lot_balances WHERE pool_id = target_pool;
    IF pool_quantity <> lot_quantity THEN
      RAISE EXCEPTION 'preorder pool and lot balances do not reconcile' USING ERRCODE = '23514';
    END IF;
    IF target_campaign IS NOT NULL THEN
      SELECT received + transferred_in + adjusted_in - transferred_out - adjusted_out - assigned
        INTO campaign_quantity
        FROM public.preorder_campaigns WHERE preorder_campaign_id = target_campaign;
      IF campaign_quantity IS DISTINCT FROM pool_quantity THEN
        RAISE EXCEPTION 'campaign counters and CAMPAIGN pool do not reconcile' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER preorder_campaigns_reconcile
  AFTER INSERT OR UPDATE OR DELETE ON preorder_campaigns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_preorder_reconciliation();
CREATE CONSTRAINT TRIGGER products_preorder_publication_reconcile
  AFTER INSERT OR UPDATE OR DELETE ON products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_preorder_reconciliation();
CREATE CONSTRAINT TRIGGER preorder_stock_pools_reconcile
  AFTER INSERT OR UPDATE OR DELETE ON preorder_stock_pools
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_preorder_reconciliation();
CREATE CONSTRAINT TRIGGER preorder_stock_lots_reconcile
  AFTER INSERT OR UPDATE OR DELETE ON preorder_stock_lot_balances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sergod_validate_preorder_reconciliation();

CREATE FUNCTION sergod_protect_preorder_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'preorder evidence is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER preorder_campaign_history_immutable
  BEFORE UPDATE OR DELETE ON preorder_campaign_state_history
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_preorder_evidence();
CREATE TRIGGER preorder_receipts_immutable
  BEFORE UPDATE OR DELETE ON preorder_receipts
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_preorder_evidence();
CREATE TRIGGER preorder_stock_transfers_immutable
  BEFORE UPDATE OR DELETE ON preorder_stock_transfers
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_preorder_evidence();
CREATE TRIGGER preorder_stock_pool_ledger_immutable
  BEFORE UPDATE OR DELETE ON preorder_stock_pool_ledger
  FOR EACH ROW EXECUTE FUNCTION sergod_protect_preorder_evidence();

COMMENT ON TABLE preorder_campaigns IS
  'Preorder campaign aggregate. Commercial commitments and allocations are introduced only by their owner phases.';
COMMENT ON TABLE preorder_stock_pools IS
  'Protected PREORDER stock projection; physical units remain in inventory_positions.';
COMMENT ON TABLE preorder_stock_pool_ledger IS
  'Immutable protected-stock evidence with typed lot provenance.';

ALTER TABLE preorder_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_campaign_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_stock_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_stock_lot_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_stock_pool_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_stock_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE preorder_campaigns, preorder_campaign_state_history, preorder_receipts,
  preorder_stock_pools, preorder_stock_lot_balances, preorder_stock_pool_ledger,
  preorder_stock_transfers FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_pool() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_reconciliation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sergod_protect_preorder_evidence() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE preorder_campaigns, preorder_campaign_state_history, preorder_receipts,
      preorder_stock_pools, preorder_stock_lot_balances, preorder_stock_pool_ledger,
      preorder_stock_transfers FROM anon;
    REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_pool() FROM anon;
    REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_reconciliation() FROM anon;
    REVOKE EXECUTE ON FUNCTION sergod_protect_preorder_evidence() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE preorder_campaigns, preorder_campaign_state_history, preorder_receipts,
      preorder_stock_pools, preorder_stock_lot_balances, preorder_stock_pool_ledger,
      preorder_stock_transfers FROM authenticated;
    REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_pool() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION sergod_validate_preorder_reconciliation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION sergod_protect_preorder_evidence() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE preorder_campaigns, preorder_stock_pools,
      preorder_stock_lot_balances TO service_role;
    GRANT SELECT, INSERT ON TABLE preorder_campaign_state_history, preorder_receipts,
      preorder_stock_pool_ledger, preorder_stock_transfers TO service_role;
  END IF;
END;
$$;

-- Existing campaigns keep their current total capacity and have no customer limit until edited.
ALTER TABLE public.preorder_campaigns
  ADD COLUMN max_per_customer bigint,
  ADD CONSTRAINT preorder_campaigns_max_per_customer_positive
    CHECK (max_per_customer IS NULL OR (max_per_customer > 0 AND max_per_customer <= 9007199254740991));

-- Active payment reservations and committed purchases both consume the account's campaign limit.
CREATE INDEX order_preorder_reservations_customer_limit_idx
  ON public.order_preorder_reservations(preorder_campaign_id, order_id)
  INCLUDE(quantity)
  WHERE status IN ('ACTIVE', 'COMMITTED');

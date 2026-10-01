-- Inventory holds can expire while Flow still reports a pending payment.
-- Existing terminal orders already have no active reservation; keep their history unchanged.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_released_at timestamptz;

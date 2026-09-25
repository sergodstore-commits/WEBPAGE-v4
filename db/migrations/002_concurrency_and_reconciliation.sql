ALTER TABLE products ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION bump_product_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version=OLD.version+1; RETURN NEW; END $$;
CREATE TRIGGER product_version BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION bump_product_version();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_reconciliation ON orders(payment_checked_at NULLS FIRST) WHERE source='web' AND payment_status='pending';

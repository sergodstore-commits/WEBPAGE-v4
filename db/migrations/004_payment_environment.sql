-- Preserve historic orders. Only a known Flow host proves the payment environment.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_environment text
 CHECK (payment_environment IS NULL OR (source='web' AND payment_environment IN ('sandbox','production')));
UPDATE orders SET payment_environment=CASE
 WHEN payment_url ~* '^https://sandbox[.]flow[.]cl([/?#]|$)' THEN 'sandbox'
 WHEN payment_url ~* '^https://(www[.])?flow[.]cl([/?#]|$)' THEN 'production'
 ELSE NULL END
WHERE source='web' AND payment_environment IS NULL;

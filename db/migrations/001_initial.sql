CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 name text NOT NULL, role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 email_verified boolean NOT NULL DEFAULT false, phone text NOT NULL DEFAULT '',
 konami_id text NOT NULL DEFAULT '', klu_code text NOT NULL DEFAULT '', address jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS settings (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL);
INSERT INTO settings(id,data) VALUES(1,'{"name":"SERGOD STORE","description":"Cartas coleccionables y comunidad en Copiapó, Chile.","address":"","hours":"","pickup_instructions":"","phone":"","email":"","reservation_minutes":15,"carriers":[]}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS uploads (
 id uuid PRIMARY KEY, object_key text NOT NULL UNIQUE, url text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
 sku text NOT NULL UNIQUE, price integer NOT NULL DEFAULT 0 CHECK(price >= 0),
 discount_percent integer NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 99),
 category text NOT NULL DEFAULT '', stock integer NOT NULL DEFAULT 0 CHECK(stock >= 0),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= stock),
 kind text NOT NULL DEFAULT 'store' CHECK(kind IN ('store','preorder')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
 images jsonb NOT NULL DEFAULT '[]', opens_at timestamptz, closes_at timestamptz,
 max_per_customer integer CHECK(max_per_customer > 0), delivery_terms text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 CHECK(closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS products_public ON products(status,kind) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, number bigserial UNIQUE, user_id uuid REFERENCES users(id),
 customer_email text NOT NULL DEFAULT '', customer_name text NOT NULL DEFAULT '',
 source text NOT NULL CHECK(source IN ('web','pos')),
 payment_status text NOT NULL CHECK(payment_status IN ('pending','approved','rejected','expired','review')),
 fulfillment_status text NOT NULL DEFAULT 'received' CHECK(fulfillment_status IN ('received','preparing','ready','shipped','delivered','cancelled')),
 subtotal integer NOT NULL CHECK(subtotal >= 0), shipping_price integer NOT NULL CHECK(shipping_price >= 0), total integer NOT NULL CHECK(total >= 0),
 delivery jsonb NOT NULL, items jsonb NOT NULL,
 idempotency_key text NOT NULL UNIQUE, request_hash text NOT NULL,
 payment_method text NOT NULL DEFAULT 'flow', cash_received integer, change_amount integer,
 flow_token text UNIQUE, flow_order text, payment_url text,
 carrier text NOT NULL DEFAULT '', tracking text NOT NULL DEFAULT '',
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pending ON orders(expires_at) WHERE payment_status='pending';
CREATE TABLE IF NOT EXISTS order_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id), order_id uuid REFERENCES orders(id),
 delta integer NOT NULL, reason text NOT NULL, actor_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS posts (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('news','community','tournament')),
 title text NOT NULL, body text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', event_at timestamptz,
 location text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_outbox (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, recipient text NOT NULL, subject text NOT NULL,
 body text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','local')),
 attempts integer NOT NULL DEFAULT 0, last_error text, locked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
-- App tables are server-only. Supabase anon/authenticated cannot query them.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','sessions','auth_tokens','rate_limits','settings','uploads','products','orders','order_events','inventory_movements','posts','mail_outbox'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
 END LOOP;
END $$;

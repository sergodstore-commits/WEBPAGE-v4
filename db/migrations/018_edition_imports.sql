CREATE TABLE ygo_import_state (
 id integer PRIMARY KEY CHECK(id=1), discoveries jsonb NOT NULL DEFAULT '[]',
 discovered_at timestamptz, lease_token text, lease_until timestamptz
);
INSERT INTO ygo_import_state(id) VALUES(1);
CREATE TABLE ygo_editions (
 code text PRIMARY KEY, name text NOT NULL, expected integer NOT NULL CHECK(expected BETWEEN 1 AND 500),
 release_date text NOT NULL, title text NOT NULL, summary text NOT NULL, body text NOT NULL,
 manifest jsonb NOT NULL DEFAULT '[]', checked_at timestamptz, last_error text NOT NULL DEFAULT '',
 published jsonb, published_at timestamptz
);
CREATE TABLE ygo_card_cache (
 id bigint PRIMARY KEY, data jsonb NOT NULL, bytes integer NOT NULL CHECK(bytes>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ygo_import_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ygo_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ygo_card_cache ENABLE ROW LEVEL SECURITY;

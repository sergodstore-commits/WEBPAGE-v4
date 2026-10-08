CREATE TABLE duel_academy_settings (
  id integer PRIMARY KEY CHECK (id=1),
  ra_min integer NOT NULL CHECK (ra_min BETWEEN 1 AND 1000000),
  obelisk_min integer NOT NULL CHECK (obelisk_min BETWEEN 2 AND 1000001 AND obelisk_min > ra_min)
);
INSERT INTO duel_academy_settings VALUES (1,150,251);
ALTER TABLE duel_academy_settings ENABLE ROW LEVEL SECURITY;

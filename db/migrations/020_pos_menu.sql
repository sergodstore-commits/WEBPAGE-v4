-- Internal menu: separate from products so it cannot enter the online catalog.
CREATE TABLE pos_menu_items (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('beverage','food')),
  alcoholic boolean NOT NULL DEFAULT false,
  price integer NOT NULL CHECK (price > 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pos_menu_movements (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES pos_menu_items(id),
  order_id uuid REFERENCES orders(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pos_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_menu_movements ENABLE ROW LEVEL SECURITY;
INSERT INTO pos_menu_items(id,code,name,kind,alcoholic,price) VALUES
('b1388400-8979-4000-8000-000000000001','limon-soda','Limón Soda','beverage',false,1500),
('b1388400-8979-4000-8000-000000000002','pap','Pap','beverage',false,1500),
('b1388400-8979-4000-8000-000000000003','pepsi','Pepsi','beverage',false,1500),
('b1388400-8979-4000-8000-000000000004','kem-pina','Kem Piña','beverage',false,1500),
('b1388400-8979-4000-8000-000000000005','pepsi-zero','Pepsi Zero','beverage',false,1500),
('b1388400-8979-4000-8000-000000000006','coca-cola-zero','Coca-Cola Zero','beverage',false,1500),
('b1388400-8979-4000-8000-000000000007','fanta','Fanta','beverage',false,1500),
('b1388400-8979-4000-8000-000000000008','sprite','Sprite','beverage',false,1500),
('b1388400-8979-4000-8000-000000000009','coca-cola','Coca-Cola','beverage',false,1500),
('b1388400-8979-4000-8000-000000000010','cerveza','Cerveza','beverage',true,1500),
('b1388400-8979-4000-8000-000000000011','completo','Completo','food',false,2000);

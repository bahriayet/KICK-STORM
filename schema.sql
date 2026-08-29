-- ====================================================================
-- KICKSTORM — Neon (PostgreSQL) Database Setup Script
-- Project: bold-wind-31928394 (AWS Singapore)
-- ====================================================================

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT 'New',
  price BIGINT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'mono',
  stock INT NOT NULL DEFAULT 0,
  sold INT NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  maps_url TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  total BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tracking_number TEXT,
  discount BIGINT NOT NULL DEFAULT 0,
  coupon_code TEXT,
  referral_code TEXT,
  flash_sale_id BIGINT,
  shipping BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  payment_method TEXT DEFAULT 'transfer',
  payment_proof TEXT,
  payment_note TEXT,
  paid_at TIMESTAMPTZ,
  courier_id BIGINT,
  courier_name TEXT,
  courier_lat DOUBLE PRECISION,
  courier_lng DOUBLE PRECISION,
  courier_share_url TEXT,
  courier_updated_at TIMESTAMPTZ,
  queue_no INT,
  drop_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT,
  product_name TEXT NOT NULL,
  price BIGINT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  size TEXT,
  colorway TEXT,
  image_url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_tokens (
  token_hash TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_tokens_revoked (
  token_jti TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_log (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value BIGINT NOT NULL,
  min_order BIGINT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  expires_at DATE,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS restock_waitlist (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  notified SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, email)
);

CREATE TABLE IF NOT EXISTS referrals (
  code TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flash_sales (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  discount_percent INT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drops (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  release_at TIMESTAMPTZ NOT NULL,
  queue_enabled SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couriers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tiers TEXT NOT NULL,
  cod_km INT NOT NULL DEFAULT 0,
  phone TEXT DEFAULT '',
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  birth_month INT,
  birth_day INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Seed Default Products (if empty)
INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Volt Runner — Beta 01', 'Lari / Jalan / Sehari-hari', 'Best Seller', 1850000, 'mono', 42, 5124
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);

INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Night Runner — Mono 02', 'All Black / Techwear', 'New', 1450000, 'void', 38, 2143
WHERE (SELECT COUNT(*) FROM products) = 1;

INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Reign Low — Storm 03', 'Low Cut / Premium', 'Limited', 2100000, 'volt', 24, 987
WHERE (SELECT COUNT(*) FROM products) = 2;

INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Ghost Zero — White 04', 'Monochrome / Clean', 'Restock', 1250000, 'ghost', 55, 3301
WHERE (SELECT COUNT(*) FROM products) = 3;

INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Hujan Runner — Rain 05', 'Anti-air / Trail', 'New', 1600000, 'dark', 31, 876
WHERE (SELECT COUNT(*) FROM products) = 4;

INSERT INTO products (name, tag, badge, price, variant, stock, sold)
SELECT 'Dawn Low — Cream 06', 'Casual / Soft Tone', 'Limited', 1350000, 'cream', 20, 654
WHERE (SELECT COUNT(*) FROM products) = 5;

-- 3. Seed Default Coupon
INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at)
VALUES ('STORM10', 'percent', 10, 100000, 0, NULL)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed Default Settings
INSERT INTO settings (key, value) VALUES
  ('store_name', 'KICKSTORM Jakarta'),
  ('store_lat', '-6.2087634'),
  ('store_lng', '106.845599'),
  ('shipping_tiers', '[{"max":5,"cost":15000},{"max":10,"cost":25000},{"max":25,"cost":40000},{"max":9999,"cost":60000}]'),
  ('free_shipping_min', '0'),
  ('max_shipping_km', '25'),
  ('out_of_area_cost', '50000'),
  ('wa_number', ''),
  ('payment_flow', '0')
ON CONFLICT (key) DO NOTHING;

-- 5. Seed Default Couriers
INSERT INTO couriers (name, tiers, cod_km, phone)
SELECT 'Reguler KICKSTORM', '[{"max":5,"cost":15000},{"max":10,"cost":25000},{"max":25,"cost":40000},{"max":9999,"cost":60000}]', 8, ''
WHERE NOT EXISTS (SELECT 1 FROM couriers LIMIT 1);

INSERT INTO couriers (name, tiers, cod_km, phone)
SELECT 'Express Kilat', '[{"max":5,"cost":25000},{"max":10,"cost":40000},{"max":25,"cost":60000},{"max":9999,"cost":90000}]', 3, ''
WHERE (SELECT COUNT(*) FROM couriers) = 1;

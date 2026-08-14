const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
const dataDir = isVercel ? "/tmp" : path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

const imgDir = path.join(__dirname, "public", "images");
if (!fs.existsSync(imgDir)) {
  try { fs.mkdirSync(imgDir, { recursive: true }); } catch (e) {}
}

const artifactDir = "C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\4724e8ba-701c-4734-bc5e-e0601f058ae3";
const currentUploads = "C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\47c85d70-3016-47c0-a72e-0a97cb20f9e2\\.user_uploaded";
const imgMappings = [
  { src: path.join(artifactDir, "volt_storm_hero_1786651016643.jpg"), dest: path.join(imgDir, "hero_sneaker_main.jpg") },
  { src: path.join(artifactDir, "volt_storm_side_1786651044791.jpg"), dest: path.join(imgDir, "hero_sneaker_side.jpg") },
  { src: path.join(artifactDir, "volt_storm_angle_1786651062467.jpg"), dest: path.join(imgDir, "hero_sneaker_angle.jpg") },
  { src: path.join(currentUploads, "media_1786695778631.jpg"), dest: path.join(imgDir, "koleksi_1.jpg") },
  { src: path.join(currentUploads, "media_1786695784831.jpg"), dest: path.join(imgDir, "koleksi_2.jpg") },
  { src: path.join(currentUploads, "media_1786695788550.jpg"), dest: path.join(imgDir, "koleksi_3.jpg") },
  { src: path.join(currentUploads, "media_1786695797008.jpg"), dest: path.join(imgDir, "koleksi_4.jpg") },
  { src: path.join(currentUploads, "media_1786695797108.jpg"), dest: path.join(imgDir, "koleksi_5.jpg") },
  { src: path.join(currentUploads, "media_1786696177148.jpg"), dest: path.join(imgDir, "koleksi_6.jpg") }
];
imgMappings.forEach(({ src, dest }) => {
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  } catch (e) {}
});

const dbPath = process.env.DB_PATH || (isVercel ? "/tmp/kickstorm.db" : path.join(dataDir, "kickstorm.db"));
const db = new Database(dbPath);
if (!isVercel) {
  db.pragma("journal_mode = WAL");
} else {
  db.pragma("journal_mode = MEMORY");
}
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    badge TEXT NOT NULL,
    price INTEGER NOT NULL,
    variant TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tracking_number TEXT,
    discount INTEGER NOT NULL DEFAULT 0,
    coupon_code TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_tokens (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    changed_by TEXT
  );

  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
    value INTEGER NOT NULL,
    min_order INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS restock_waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    notified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, email)
  );

  CREATE TABLE IF NOT EXISTS referrals (
    code TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flash_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    release_at TEXT NOT NULL,
    queue_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tiers TEXT NOT NULL,
    cod_km INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    birth_month INTEGER,
    birth_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
if (!orderCols.includes("tracking_number")) {
  db.exec("ALTER TABLE orders ADD COLUMN tracking_number TEXT");
}
if (!orderCols.includes("discount")) {
  db.exec("ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0");
  db.exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT");
}
if (!orderCols.includes("notes")) {
  db.exec("ALTER TABLE orders ADD COLUMN notes TEXT");
}
if (!orderCols.includes("lat")) {
  db.exec("ALTER TABLE orders ADD COLUMN lat REAL");
  db.exec("ALTER TABLE orders ADD COLUMN lng REAL");
}
if (!orderCols.includes("shipping")) {
  db.exec("ALTER TABLE orders ADD COLUMN shipping INTEGER NOT NULL DEFAULT 0");
  db.exec("ALTER TABLE orders ADD COLUMN referral_code TEXT");
  db.exec("ALTER TABLE orders ADD COLUMN flash_sale_id INTEGER");
}

const orderCols2 = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
if (!orderCols2.includes("payment_method")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT");
}
if (!orderCols2.includes("payment_proof")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_proof TEXT");
}
if (!orderCols2.includes("payment_note")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_note TEXT");
}
if (!orderCols2.includes("paid_at")) {
  db.exec("ALTER TABLE orders ADD COLUMN paid_at TEXT");
}
if (!orderCols2.includes("courier_id")) {
  db.exec("ALTER TABLE orders ADD COLUMN courier_id INTEGER");
}
if (!orderCols2.includes("courier_name")) {
  db.exec("ALTER TABLE orders ADD COLUMN courier_name TEXT");
}
if (!orderCols2.includes("courier_lat")) {
  db.exec("ALTER TABLE orders ADD COLUMN courier_lat REAL");
  db.exec("ALTER TABLE orders ADD COLUMN courier_lng REAL");
}
if (!orderCols2.includes("queue_no")) {
  db.exec("ALTER TABLE orders ADD COLUMN queue_no INTEGER");
  db.exec("ALTER TABLE orders ADD COLUMN drop_id INTEGER");
}
if (!orderCols2.includes("maps_url")) {
  db.exec("ALTER TABLE orders ADD COLUMN maps_url TEXT");
}
if (!orderCols2.includes("courier_share_url")) {
  db.exec("ALTER TABLE orders ADD COLUMN courier_share_url TEXT");
}
if (!orderCols2.includes("courier_updated_at")) {
  db.exec("ALTER TABLE orders ADD COLUMN courier_updated_at TEXT");
}

const courierCols = db.prepare("PRAGMA table_info(couriers)").all().map((c) => c.name);
if (!courierCols.includes("phone")) {
  db.exec("ALTER TABLE couriers ADD COLUMN phone TEXT");
}

const itemCols = db.prepare("PRAGMA table_info(order_items)").all().map((c) => c.name);
if (!itemCols.includes("size")) {
  db.exec("ALTER TABLE order_items ADD COLUMN size TEXT");
}
if (!itemCols.includes("colorway")) {
  db.exec("ALTER TABLE order_items ADD COLUMN colorway TEXT");
}

const itemInfo = db.prepare("PRAGMA table_info(order_items)").all();
const prodIdNotNull = itemInfo.find((c) => c.name === "product_id").notnull;
if (prodIdNotNull) {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    BEGIN;
    CREATE TABLE order_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      size TEXT,
      colorway TEXT
    );
    INSERT INTO order_items_new (id, order_id, product_id, product_name, price, qty, size, colorway)
      SELECT id, order_id, product_id, product_name, price, qty, size, colorway FROM order_items;
    DROP TABLE order_items;
    ALTER TABLE order_items_new RENAME TO order_items;
    COMMIT;
  `);
  db.pragma("foreign_keys = ON");
}

const seed = [
  ["Volt Runner — Beta 01", "Lari / Jalan / Sehari-hari", "Best Seller", 1850000, "mono", 42, 5124],
  ["Night Runner — Mono 02", "All Black / Techwear", "New", 1450000, "void", 38, 2143],
  ["Reign Low — Storm 03", "Low Cut / Premium", "Limited", 2100000, "volt", 24, 987],
  ["Ghost Zero — White 04", "Monochrome / Clean", "Restock", 1250000, "ghost", 55, 3301],
  ["Hujan Runner — Rain 05", "Anti-air / Trail", "New", 1600000, "dark", 31, 876],
  ["Dawn Low — Cream 06", "Casual / Soft Tone", "Limited", 1350000, "cream", 20, 654]
];

const insert = db.prepare(
  "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (count === 0) {
  const tx = db.transaction(() => seed.forEach((row) => insert.run(...row)));
  tx();
}

const couponCount = db.prepare("SELECT COUNT(*) AS n FROM coupons").get().n;
if (couponCount === 0) {
  db.prepare("INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES ('STORM10', 'percent', 10, 100000, 0, NULL)").run();
}

const defaultSettings = {
  store_name: "KICKSTORM Jakarta",
  store_lat: "-6.2087634",
  store_lng: "106.845599",
  shipping_tiers: JSON.stringify([
    { max: 5, cost: 15000 },
    { max: 10, cost: 25000 },
    { max: 25, cost: 40000 },
    { max: 9999, cost: 60000 }
  ]),
  free_shipping_min: "0",
  max_shipping_km: "25",
  wa_number: "",
  payment_flow: "0"
};
const hasSetting = db.prepare("SELECT key FROM settings WHERE key = ?");
const setSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(defaultSettings)) {
  if (!hasSetting.get(k)) setSetting.run(k, v);
}

const courierCount = db.prepare("SELECT COUNT(*) AS n FROM couriers").get().n;
if (courierCount === 0) {
  const insertCourier = db.prepare("INSERT INTO couriers (name, tiers, cod_km) VALUES (?, ?, ?)");
  const tx2 = db.transaction(() => {
    insertCourier.run(
      "Reguler KICKSTORM",
      JSON.stringify([
        { max: 5, cost: 15000 },
        { max: 10, cost: 25000 },
        { max: 25, cost: 40000 },
        { max: 9999, cost: 60000 }
      ]),
      8
    );
    insertCourier.run(
      "Express Kilat",
      JSON.stringify([
        { max: 5, cost: 25000 },
        { max: 10, cost: 40000 },
        { max: 25, cost: 60000 },
        { max: 9999, cost: 90000 }
      ]),
      3
    );
  });
  tx2();
}

let tursoClient = null;
if (process.env.TURSO_DATABASE_URL) {
  try {
    const { createClient } = require("@libsql/client");
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
  } catch (e) {
    console.warn("Turso client init notice:", e.message);
  }
}

function pushToTurso(sql, args = []) {
  if (!tursoClient) return;
  tursoClient.execute({ sql, args }).catch((err) => {
    console.warn("Turso sync notice:", err.message);
  });
}

db.pushToTurso = pushToTurso;
db.tursoClient = tursoClient;

module.exports = db;
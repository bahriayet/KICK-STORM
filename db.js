require("dotenv").config();
const { createClient: createLibsqlClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

let createSupabaseClient = null;
try {
  createSupabaseClient = require("@supabase/supabase-js").createClient;
} catch (e) {}

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

const imgDir = path.join(__dirname, "public", "images");
if (!fs.existsSync(imgDir)) {
  try { fs.mkdirSync(imgDir, { recursive: true }); } catch (e) {}
}

// Copy images if exist
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

// Configure Database Connection: Supabase vs SQLite/LibSQL
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

let isSupabase = false;
let supabase = null;
let libsqlClient = null;

if (supabaseUrl && supabaseKey && createSupabaseClient && !process.env.DB_PATH) {
  isSupabase = true;
  supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  console.log("⚡ Database connected to Supabase Cloud:", supabaseUrl);
} else {
  let clientUrl;
  if (process.env.DB_PATH) {
    const resolved = path.resolve(process.env.DB_PATH).replace(/\\/g, "/");
    clientUrl = `file:${resolved}`;
    console.log("📁 Database connected to DB_PATH file:", clientUrl);
  } else if (process.env.TURSO_DATABASE_URL) {
    clientUrl = process.env.TURSO_DATABASE_URL;
    console.log("⚡ Database connected to Turso Cloud:", clientUrl.replace(/\/\/.*@/, "//***@"));
  } else {
    const localDb = path.join(dataDir, "kickstorm.db").replace(/\\/g, "/");
    clientUrl = `file:${localDb}`;
    console.log("📁 Database connected to local SQLite file:", clientUrl);
  }

  libsqlClient = createLibsqlClient({
    url: clientUrl,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

function normalizeRow(row, columns) {
  if (!row) return null;
  const obj = {};
  if (columns && Array.isArray(columns)) {
    for (const col of columns) {
      obj[col] = row[col];
    }
  } else {
    for (const key of Object.keys(row)) {
      obj[key] = row[key];
    }
  }
  return obj;
}

// Low-level SQL queries (used by LibSQL/SQLite fallback)
async function all(sql, args = []) {
  if (isSupabase) {
    // If Supabase is active, fallback query or execute
  }
  if (!libsqlClient) return [];
  const res = await libsqlClient.execute({ sql, args });
  return res.rows.map((row) => normalizeRow(row, res.columns));
}

async function get(sql, args = []) {
  if (!libsqlClient) return null;
  const res = await libsqlClient.execute({ sql, args });
  if (!res.rows || res.rows.length === 0) return null;
  return normalizeRow(res.rows[0], res.columns);
}

async function run(sql, args = []) {
  if (!libsqlClient) return { changes: 0 };
  const res = await libsqlClient.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
    changes: res.rowsAffected
  };
}

async function batch(stmts) {
  if (!libsqlClient) return [];
  return await libsqlClient.batch(stmts, "write");
}

async function exec(sql) {
  if (!libsqlClient) return;
  return await libsqlClient.executeMultiple(sql);
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT 'New',
    price INTEGER NOT NULL,
    variant TEXT NOT NULL DEFAULT 'mono',
    stock INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    maps_url TEXT,
    lat REAL,
    lng REAL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tracking_number TEXT,
    discount INTEGER NOT NULL DEFAULT 0,
    coupon_code TEXT,
    referral_code TEXT,
    flash_sale_id INTEGER,
    shipping INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    payment_method TEXT DEFAULT 'transfer',
    payment_proof TEXT,
    payment_note TEXT,
    paid_at TEXT,
    courier_id INTEGER,
    courier_name TEXT,
    courier_lat REAL,
    courier_lng REAL,
    courier_share_url TEXT,
    courier_updated_at TEXT,
    queue_no INTEGER,
    drop_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    size TEXT,
    colorway TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS admin_tokens (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS admin_tokens_revoked (
    token_jti TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS order_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    changed_by TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
    value INTEGER NOT NULL,
    min_order INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS restock_waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    notified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, email)
  );`,

  `CREATE TABLE IF NOT EXISTS referrals (
    code TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS flash_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    release_at TEXT NOT NULL,
    queue_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tiers TEXT NOT NULL,
    cod_km INTEGER NOT NULL DEFAULT 0,
    phone TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    birth_month INTEGER,
    birth_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`
];

let initPromise = null;
async function ensureInit() {
  if (isSupabase) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (!libsqlClient) return;
      await libsqlClient.batch(
        schemaStatements.map((sql) => ({ sql, args: [] })),
        "write"
      );

      const prodRes = await libsqlClient.execute("SELECT COUNT(*) AS n FROM products");
      const count = Number(prodRes.rows[0]?.n || prodRes.rows[0]?.[0] || 0);
      if (count === 0) {
        const seed = [
          ["Volt Runner — Beta 01", "Lari / Jalan / Sehari-hari", "Best Seller", 1850000, "mono", 42, 5124],
          ["Night Runner — Mono 02", "All Black / Techwear", "New", 1450000, "void", 38, 2143],
          ["Reign Low — Storm 03", "Low Cut / Premium", "Limited", 2100000, "volt", 24, 987],
          ["Ghost Zero — White 04", "Monochrome / Clean", "Restock", 1250000, "ghost", 55, 3301],
          ["Hujan Runner — Rain 05", "Anti-air / Trail", "New", 1600000, "dark", 31, 876],
          ["Dawn Low — Cream 06", "Casual / Soft Tone", "Limited", 1350000, "cream", 20, 654]
        ];
        await libsqlClient.batch(
          seed.map((row) => ({
            sql: "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)",
            args: row
          })),
          "write"
        );
      }

      const couponRes = await libsqlClient.execute("SELECT COUNT(*) AS n FROM coupons");
      const couponCount = Number(couponRes.rows[0]?.n || couponRes.rows[0]?.[0] || 0);
      if (couponCount === 0) {
        await libsqlClient.execute({
          sql: "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES ('STORM10', 'percent', 10, 100000, 0, NULL)",
          args: []
        });
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
      const settingsRes = await libsqlClient.execute("SELECT key FROM settings");
      const existingKeys = new Set(settingsRes.rows.map((r) => r.key || r[0]));
      const toInsert = Object.entries(defaultSettings).filter(([k]) => !existingKeys.has(k));
      if (toInsert.length > 0) {
        await libsqlClient.batch(
          toInsert.map(([k, v]) => ({ sql: "INSERT INTO settings (key, value) VALUES (?, ?)", args: [k, v] })),
          "write"
        );
      }

      const courierRes = await libsqlClient.execute("SELECT COUNT(*) AS n FROM couriers");
      const courierCount = Number(courierRes.rows[0]?.n || courierRes.rows[0]?.[0] || 0);
      if (courierCount === 0) {
        await libsqlClient.batch(
          [
            {
              sql: "INSERT INTO couriers (name, tiers, cod_km, phone) VALUES (?, ?, ?, ?)",
              args: [
                "Reguler KICKSTORM",
                JSON.stringify([
                  { max: 5, cost: 15000 },
                  { max: 10, cost: 25000 },
                  { max: 25, cost: 40000 },
                  { max: 9999, cost: 60000 }
                ]),
                8,
                ""
              ]
            },
            {
              sql: "INSERT INTO couriers (name, tiers, cod_km, phone) VALUES (?, ?, ?, ?)",
              args: [
                "Express Kilat",
                JSON.stringify([
                  { max: 25000, cost: 25000 },
                  { max: 10, cost: 40000 },
                  { max: 25, cost: 60000 },
                  { max: 9999, cost: 90000 }
                ]),
                3,
                ""
              ]
            }
          ],
          "write"
        );
      }
    } catch (err) {
      console.error("Database schema init notice:", err.message);
    }
  })();
  return initPromise;
}

if (!isSupabase) {
  ensureInit().catch((e) => console.warn("Background init warning:", e.message));
}

async function close() {
  if (libsqlClient && typeof libsqlClient.close === "function") {
    try { await libsqlClient.close(); } catch (e) {}
  }
}

// -------------------------------------------------------------
// Unified Data Access Functions (Supabase + LibSQL/SQLite)
// -------------------------------------------------------------

// Settings
async function getSettings() {
  if (isSupabase) {
    const { data } = await supabase.from("settings").select("key, value");
    const s = {};
    if (data) for (const r of data) s[r.key] = r.value;
    return s;
  }
  const rows = await all("SELECT key, value FROM settings");
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

async function saveSettings(obj) {
  if (isSupabase) {
    const upserts = Object.entries(obj).map(([key, value]) => ({ key, value }));
    await supabase.from("settings").upsert(upserts);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    await run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, v]);
  }
}

// Products
async function getProducts() {
  if (isSupabase) {
    const { data } = await supabase.from("products").select("id, name, tag, badge, price, variant, stock, sold").order("id");
    return data || [];
  }
  return await all("SELECT id, name, tag, badge, price, variant, stock, sold FROM products ORDER BY id");
}

async function getProductById(id) {
  if (isSupabase) {
    const { data } = await supabase.from("products").select("id, name, tag, badge, price, variant, stock, sold").eq("id", id).maybeSingle();
    return data;
  }
  return await get("SELECT id, name, tag, badge, price, variant, stock, sold FROM products WHERE id = ?", [id]);
}

async function createProduct(p) {
  if (isSupabase) {
    const { data, error } = await supabase.from("products").insert(p).select("id, name, tag, badge, price, variant, stock, sold").single();
    if (error) throw error;
    return data;
  }
  const res = await run(
    "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [p.name, p.tag ?? "", p.badge ?? "New", p.price ?? 0, p.variant ?? "mono", p.stock ?? 0, p.sold ?? 0]
  );
  return await getProductById(res.lastInsertRowid);
}

async function updateProduct(id, p) {
  if (isSupabase) {
    const { data, error } = await supabase.from("products").update(p).eq("id", id).select("id, name, tag, badge, price, variant, stock, sold").maybeSingle();
    if (error) throw error;
    return data;
  }
  const keys = Object.keys(p);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const res = await run(`UPDATE products SET ${sets} WHERE id = ?`, [...keys.map((k) => p[k]), id]);
  if (res.changes === 0) return null;
  return await getProductById(id);
}

async function deleteProduct(id) {
  if (isSupabase) {
    const { error, count } = await supabase.from("products").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM products WHERE id = ?", [id]);
  return res.changes > 0;
}

// Couriers
async function getCouriers() {
  if (isSupabase) {
    const { data } = await supabase.from("couriers").select("id, name, tiers, cod_km, phone, active").order("id");
    return data || [];
  }
  return await all("SELECT id, name, tiers, cod_km, phone, active FROM couriers ORDER BY id");
}

async function getCourierById(id) {
  if (isSupabase) {
    const { data } = await supabase.from("couriers").select("id, name, tiers, cod_km, phone, active, created_at").eq("id", id).maybeSingle();
    return data;
  }
  return await get("SELECT id, name, tiers, cod_km, phone, active, created_at FROM couriers WHERE id = ?", [id]);
}

async function createCourier(c) {
  if (isSupabase) {
    const { data, error } = await supabase.from("couriers").insert({
      name: c.name,
      tiers: typeof c.tiers === "string" ? c.tiers : JSON.stringify(c.tiers),
      cod_km: c.cod_km,
      phone: c.phone || "",
      active: c.active !== undefined ? c.active : 1
    }).select().single();
    if (error) throw error;
    return data;
  }
  const res = await run(
    "INSERT INTO couriers (name, tiers, cod_km, phone, active) VALUES (?, ?, ?, ?, ?)",
    [c.name, typeof c.tiers === "string" ? c.tiers : JSON.stringify(c.tiers), c.cod_km, c.phone || "", c.active !== undefined ? c.active : 1]
  );
  return await getCourierById(res.lastInsertRowid);
}

async function updateCourier(id, c) {
  if (isSupabase) {
    const payload = { ...c };
    if (payload.tiers && typeof payload.tiers !== "string") payload.tiers = JSON.stringify(payload.tiers);
    const { data, error } = await supabase.from("couriers").update(payload).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const keys = Object.keys(c);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const vals = keys.map((k) => (k === "tiers" && typeof c[k] !== "string" ? JSON.stringify(c[k]) : c[k]));
  const res = await run(`UPDATE couriers SET ${sets} WHERE id = ?`, [...vals, id]);
  if (res.changes === 0) return null;
  return await getCourierById(id);
}

async function deleteCourier(id) {
  if (isSupabase) {
    const { error, count } = await supabase.from("couriers").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM couriers WHERE id = ?", [id]);
  return res.changes > 0;
}

// Coupons
async function getCoupon(code) {
  if (isSupabase) {
    const { data } = await supabase.from("coupons").select("code, type, value, min_order, max_uses, used_count, expires_at, active").eq("code", code).maybeSingle();
    return data;
  }
  return await get("SELECT code, type, value, min_order, max_uses, used_count, expires_at, active FROM coupons WHERE code = ?", [code]);
}

async function getCoupons() {
  if (isSupabase) {
    const { data } = await supabase.from("coupons").select("code, type, value, min_order, max_uses, used_count, expires_at, active, created_at").order("code");
    return data || [];
  }
  return await all("SELECT code, type, value, min_order, max_uses, used_count, expires_at, active, created_at FROM coupons ORDER BY code");
}

async function createCoupon(c) {
  if (isSupabase) {
    const { data, error } = await supabase.from("coupons").insert(c).select().single();
    if (error) throw error;
    return data;
  }
  await run(
    "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    [c.code, c.type, c.value, c.min_order, c.max_uses, c.expires_at]
  );
  return await getCoupon(c.code);
}

async function updateCoupon(code, c) {
  if (isSupabase) {
    const { data, error } = await supabase.from("coupons").update(c).eq("code", code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const keys = Object.keys(c);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE coupons SET ${sets} WHERE code = ?`, [...keys.map((k) => c[k]), code]);
  return await getCoupon(code);
}

async function deleteCoupon(code) {
  if (isSupabase) {
    const { error, count } = await supabase.from("coupons").delete({ count: "exact" }).eq("code", code);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM coupons WHERE code = ?", [code]);
  return res.changes > 0;
}

// Flash Sales
async function getActiveFlashSale(now) {
  if (isSupabase) {
    const { data } = await supabase.from("flash_sales").select("id, name, discount_percent").eq("active", 1).lte("starts_at", now).gt("ends_at", now).order("id", { ascending: false }).limit(1).maybeSingle();
    return data;
  }
  return await get("SELECT id, name, discount_percent FROM flash_sales WHERE active = 1 AND starts_at <= ? AND ends_at > ? ORDER BY id DESC LIMIT 1", [now, now]);
}

async function getFlashSales() {
  if (isSupabase) {
    const { data } = await supabase.from("flash_sales").select("id, name, discount_percent, starts_at, ends_at, active, created_at").order("id", { ascending: false });
    return data || [];
  }
  return await all("SELECT id, name, discount_percent, starts_at, ends_at, active, created_at FROM flash_sales ORDER BY id DESC");
}

async function createFlashSale(f) {
  if (isSupabase) {
    const { data, error } = await supabase.from("flash_sales").insert(f).select().single();
    if (error) throw error;
    return data;
  }
  const res = await run("INSERT INTO flash_sales (name, discount_percent, starts_at, ends_at) VALUES (?, ?, ?, ?)", [f.name, f.discount_percent, f.starts_at, f.ends_at]);
  return await get("SELECT id, name, discount_percent, starts_at, ends_at, active, created_at FROM flash_sales WHERE id = ?", [res.lastInsertRowid]);
}

async function updateFlashSale(id, f) {
  if (isSupabase) {
    const { data, error } = await supabase.from("flash_sales").update(f).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const keys = Object.keys(f);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE flash_sales SET ${sets} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
  return await get("SELECT id, name, discount_percent, starts_at, ends_at, active, created_at FROM flash_sales WHERE id = ?", [id]);
}

async function deleteFlashSale(id) {
  if (isSupabase) {
    const { error, count } = await supabase.from("flash_sales").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM flash_sales WHERE id = ?", [id]);
  return res.changes > 0;
}

// Drops
async function getNextDrop() {
  if (isSupabase) {
    const { data } = await supabase.from("drops").select("id, name, product_id, release_at, queue_enabled, products(name)").order("release_at", { ascending: true }).limit(1).maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      product_id: data.product_id,
      release_at: data.release_at,
      queue_enabled: data.queue_enabled,
      product_name: data.products ? data.products.name : null
    };
  }
  return await get("SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name FROM drops d LEFT JOIN products p ON p.id = d.product_id ORDER BY d.release_at ASC LIMIT 1");
}

async function getDrops() {
  if (isSupabase) {
    const { data } = await supabase.from("drops").select("id, name, product_id, release_at, queue_enabled, created_at, products(name)").order("release_at", { ascending: true });
    return (data || []).map((d) => ({
      id: d.id,
      name: d.name,
      product_id: d.product_id,
      release_at: d.release_at,
      queue_enabled: d.queue_enabled,
      created_at: d.created_at,
      product_name: d.products ? d.products.name : null
    }));
  }
  return await all("SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name, d.created_at FROM drops d LEFT JOIN products p ON p.id = d.product_id ORDER BY d.release_at ASC");
}

async function createDrop(d) {
  if (isSupabase) {
    const { data, error } = await supabase.from("drops").insert(d).select("id, name, product_id, release_at, queue_enabled, created_at, products(name)").single();
    if (error) throw error;
    return { ...data, product_name: data.products ? data.products.name : null };
  }
  const res = await run("INSERT INTO drops (name, product_id, release_at, queue_enabled) VALUES (?, ?, ?, ?)", [d.name, d.product_id, d.release_at, d.queue_enabled]);
  return await get("SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name, d.created_at FROM drops d LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?", [res.lastInsertRowid]);
}

async function updateDrop(id, d) {
  if (isSupabase) {
    const { data, error } = await supabase.from("drops").update(d).eq("id", id).select("id, name, product_id, release_at, queue_enabled, created_at, products(name)").maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, product_name: data.products ? data.products.name : null };
  }
  const keys = Object.keys(d);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE drops SET ${sets} WHERE id = ?`, [...keys.map((k) => d[k]), id]);
  return await get("SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name, d.created_at FROM drops d LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?", [id]);
}

async function deleteDrop(id) {
  if (isSupabase) {
    const { error, count } = await supabase.from("drops").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM drops WHERE id = ?", [id]);
  return res.changes > 0;
}

// Referrals
async function getReferral(code) {
  if (isSupabase) {
    const { data } = await supabase.from("referrals").select("code, owner_name, owner_email, max_uses, used_count, active").eq("code", code).maybeSingle();
    return data;
  }
  return await get("SELECT code, owner_name, owner_email, max_uses, used_count, active FROM referrals WHERE code = ?", [code]);
}

async function getReferrals() {
  if (isSupabase) {
    const { data } = await supabase.from("referrals").select("code, owner_name, owner_email, max_uses, used_count, active, created_at").order("created_at", { ascending: false });
    return data || [];
  }
  return await all("SELECT code, owner_name, owner_email, max_uses, used_count, active, created_at FROM referrals ORDER BY created_at DESC, code");
}

async function createReferral(r) {
  if (isSupabase) {
    const { data, error } = await supabase.from("referrals").insert(r).select().single();
    if (error) throw error;
    return data;
  }
  await run("INSERT INTO referrals (code, owner_name, owner_email, max_uses) VALUES (?, ?, ?, ?)", [r.code, r.owner_name, r.owner_email, r.max_uses]);
  return await getReferral(r.code);
}

async function updateReferral(code, r) {
  if (isSupabase) {
    const { data, error } = await supabase.from("referrals").update(r).eq("code", code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const keys = Object.keys(r);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE referrals SET ${sets} WHERE code = ?`, [...keys.map((k) => r[k]), code]);
  return await getReferral(code);
}

async function deleteReferral(code) {
  if (isSupabase) {
    const { error, count } = await supabase.from("referrals").delete({ count: "exact" }).eq("code", code);
    if (error) throw error;
    return (count || 0) > 0;
  }
  const res = await run("DELETE FROM referrals WHERE code = ?", [code]);
  return res.changes > 0;
}

// Members
async function getMember(email) {
  if (isSupabase) {
    const { data } = await supabase.from("members").select("email, name, points, birth_month, birth_day").eq("email", email).maybeSingle();
    return data;
  }
  return await get("SELECT email, name, points, birth_month, birth_day FROM members WHERE email = ?", [email]);
}

async function getMembers() {
  if (isSupabase) {
    const { data } = await supabase.from("members").select("email, name, points, birth_month, birth_day, created_at").order("points", { ascending: false });
    return data || [];
  }
  return await all("SELECT email, name, points, birth_month, birth_day, created_at, (SELECT COUNT(*) FROM orders o WHERE o.email = m.email AND o.status != 'cancelled') AS orders FROM members m ORDER BY m.points DESC");
}

module.exports = {
  isSupabase,
  supabase,
  client: libsqlClient,
  all,
  get,
  run,
  batch,
  exec,
  ensureInit,
  close,
  // High-level repository helpers
  getSettings,
  saveSettings,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCouriers,
  getCourierById,
  createCourier,
  updateCourier,
  deleteCourier,
  getCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getActiveFlashSale,
  getFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  getNextDrop,
  getDrops,
  createDrop,
  updateDrop,
  deleteDrop,
  getReferral,
  getReferrals,
  createReferral,
  updateReferral,
  deleteReferral,
  getMember,
  getMembers
};
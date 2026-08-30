require("dotenv").config();
const { Pool, types } = require("pg");
const { createClient: createLibsqlClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

// Parse PostgreSQL INT8 (BIGINT) and NUMERIC as JavaScript numbers
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));
types.setTypeParser(1700, (val) => (val === null ? null : Number(val)));

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

// Configure Database Connection: Neon PostgreSQL vs SQLite/LibSQL
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL;

let isNeon = false;
let pool = null;
let libsqlClient = null;

if (databaseUrl && !process.env.DB_PATH) {
  isNeon = true;
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000
  });
  console.log("⚡ Database connected to Neon PostgreSQL Cloud:", databaseUrl.replace(/\/\/.*@/, "//***@"));
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

function formatPostgresSql(sql) {
  let paramIndex = 1;
  return sql
    .replace(/datetime\('now',\s*'-(\d+)\s*days'\)/gi, "NOW() - INTERVAL '$1 days'")
    .replace(/date\('now',\s*'-(\d+)\s*days'\)/gi, "CURRENT_DATE - INTERVAL '$1 days'")
    .replace(/datetime\('now',\s*\?\)/gi, "NOW() + (?::interval)")
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/date\('now'\)/gi, "CURRENT_DATE")
    .replace(/\(julianday\('now'\)\s*-\s*julianday\(created_at\)\)\s*\*\s*24/gi, "(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)")
    .replace(/substr\(created_at,\s*1,\s*10\)/gi, "substr(created_at::text, 1, 10)")
    .replace(/points\s*=\s*points\s*\+\s*excluded\.points/gi, "points = members.points + EXCLUDED.points")
    .replace(/\bMAX\s*\(\s*([^,()]+)\s*,\s*([^()]+)\s*\)/gi, (m, a, b) => "GREATEST(" + a.trim() + ", " + b.trim() + ")")
    .replace(/\bMIN\s*\(\s*([^,()]+)\s*,\s*([^()]+)\s*\)/gi, (m, a, b) => "LEAST(" + a.trim() + ", " + b.trim() + ")")
    .replace(/\?/g, () => `$${paramIndex++}`);
}

async function all(sql, args = []) {
  if (isNeon) {
    const pgSql = formatPostgresSql(sql);
    const res = await pool.query(pgSql, args);
    return res.rows || [];
  }
  if (!libsqlClient) return [];
  const res = await libsqlClient.execute({ sql, args });
  return res.rows.map((row) => normalizeRow(row, res.columns));
}

async function get(sql, args = []) {
  if (isNeon) {
    const pgSql = formatPostgresSql(sql);
    const res = await pool.query(pgSql, args);
    return res.rows && res.rows.length > 0 ? res.rows[0] : null;
  }
  if (!libsqlClient) return null;
  const res = await libsqlClient.execute({ sql, args });
  if (!res.rows || res.rows.length === 0) return null;
  return normalizeRow(res.rows[0], res.columns);
}

const tablesWithId = new Set([
  "products",
  "orders",
  "order_items",
  "order_status_log",
  "restock_waitlist",
  "subscribers",
  "flash_sales",
  "drops",
  "couriers"
]);

async function run(sql, args = []) {
  if (isNeon) {
    let pgSql = formatPostgresSql(sql);
    const tableMatch = pgSql.match(/^\s*INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
    if (tableMatch && tablesWithId.has(tableMatch[1].toLowerCase()) && !/RETURNING/i.test(pgSql)) {
      pgSql += " RETURNING id";
    }
    const res = await pool.query(pgSql, args);
    const lastId = res.rows && res.rows[0] && res.rows[0].id !== undefined ? Number(res.rows[0].id) : undefined;
    return {
      lastInsertRowid: lastId,
      changes: res.rowCount || 0
    };
  }
  if (!libsqlClient) return { changes: 0 };
  const res = await libsqlClient.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
    changes: res.rowsAffected
  };
}

async function batch(stmts) {
  if (isNeon) {
    const client = await pool.connect();
    const results = [];
    try {
      await client.query("BEGIN");
      for (const s of stmts) {
        if (typeof s === "string") {
          const pgSql = formatPostgresSql(s);
          const res = await client.query(pgSql);
          results.push({ changes: res.rowCount || 0 });
        } else {
          let pgSql = formatPostgresSql(s.sql);
          const tableMatch = pgSql.match(/^\s*INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
          if (tableMatch && tablesWithId.has(tableMatch[1].toLowerCase()) && !/RETURNING/i.test(pgSql)) {
            pgSql += " RETURNING id";
          }
          const res = await client.query(pgSql, s.args || []);
          const lastId = res.rows && res.rows[0] && res.rows[0].id !== undefined ? Number(res.rows[0].id) : undefined;
          results.push({
            lastInsertRowid: lastId,
            changes: res.rowCount || 0
          });
        }
      }
      await client.query("COMMIT");
      return results;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  if (!libsqlClient) return [];
  return await libsqlClient.batch(stmts, "write");
}

async function exec(sql) {
  if (isNeon) {
    return await pool.query(sql);
  }
  if (!libsqlClient) return;
  return await libsqlClient.executeMultiple(sql);
}

const pgSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS products (
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
  );`,
  `CREATE TABLE IF NOT EXISTS subscribers (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
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
  );`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT,
    product_name TEXT NOT NULL,
    price BIGINT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    size TEXT,
    colorway TEXT,
    image_url TEXT DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS admin_tokens (
    token_hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS admin_tokens_revoked (
    token_jti TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS order_status_log (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
    value BIGINT NOT NULL,
    min_order BIGINT NOT NULL DEFAULT 0,
    max_uses INT NOT NULL DEFAULT 0,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATE,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS restock_waitlist (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    notified SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, email)
  );`,
  `CREATE TABLE IF NOT EXISTS referrals (
    code TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS flash_sales (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    discount_percent INT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS drops (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    release_at TIMESTAMPTZ NOT NULL,
    queue_enabled SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS couriers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tiers TEXT NOT NULL,
    cod_km INT NOT NULL DEFAULT 0,
    phone TEXT DEFAULT '',
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INT NOT NULL DEFAULT 0,
    birth_month INT,
    birth_day INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS lokasi_kurir (
    id_kurir INT PRIMARY KEY,
    nama_kurir VARCHAR(100) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    waktu_diperbarui TIMESTAMPTZ DEFAULT NOW()
  );`
];

const sqliteSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT 'New',
    price INTEGER NOT NULL,
    variant TEXT NOT NULL DEFAULT 'mono',
    stock INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
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
    colorway TEXT,
    image_url TEXT DEFAULT ''
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
  );`,
  `CREATE TABLE IF NOT EXISTS lokasi_kurir (
    id_kurir INTEGER PRIMARY KEY,
    nama_kurir TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    waktu_diperbarui TEXT DEFAULT (datetime('now'))
  );`
];

const seedProducts = [
  ["Volt Runner — Beta 01", "Lari / Jalan / Sehari-hari", "Best Seller", 1850000, "mono", 42, 5124],
  ["Night Runner — Mono 02", "All Black / Techwear", "New", 1450000, "void", 38, 2143],
  ["Reign Low — Storm 03", "Low Cut / Premium", "Limited", 2100000, "volt", 24, 987],
  ["Ghost Zero — White 04", "Monochrome / Clean", "Restock", 1250000, "ghost", 55, 3301],
  ["Hujan Runner — Rain 05", "Anti-air / Trail", "New", 1600000, "dark", 31, 876],
  ["Dawn Low — Cream 06", "Casual / Soft Tone", "Limited", 1350000, "cream", 20, 654]
];

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
  out_of_area_cost: "50000",
  wa_number: "",
  payment_flow: "0"
};

let initPromise = null;
async function ensureInit() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (isNeon) {
        for (const sql of pgSchemaStatements) {
          await pool.query(sql);
        }
        const prodRes = await pool.query("SELECT COUNT(*) AS n FROM products");
        const count = Number(prodRes.rows[0]?.n || 0);
        if (count === 0) {
          for (const row of seedProducts) {
            await pool.query(
              "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES ($1, $2, $3, $4, $5, $6, $7)",
              row
            );
          }
        }
        const coupRes = await pool.query("SELECT COUNT(*) AS n FROM coupons");
        if (Number(coupRes.rows[0]?.n || 0) === 0) {
          await pool.query(
            "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5, NULL)",
            ["STORM10", "percent", 10, 100000, 0]
          );
        }
        for (const [k, v] of Object.entries(defaultSettings)) {
          await pool.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
            [k, v]
          );
        }
        const courRes = await pool.query("SELECT COUNT(*) AS n FROM couriers");
        if (Number(courRes.rows[0]?.n || 0) === 0) {
          await pool.query(
            "INSERT INTO couriers (name, tiers, cod_km, phone) VALUES ($1, $2, $3, $4)",
            [
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
          );
          await pool.query(
            "INSERT INTO couriers (name, tiers, cod_km, phone) VALUES ($1, $2, $3, $4)",
            [
              "Express Kilat",
              JSON.stringify([
                { max: 5, cost: 25000 },
                { max: 10, cost: 40000 },
                { max: 25, cost: 60000 },
                { max: 9999, cost: 90000 }
              ]),
              3,
              ""
            ]
          );
        }
        const kurirLocRes = await pool.query("SELECT COUNT(*) AS n FROM lokasi_kurir");
        if (Number(kurirLocRes.rows[0]?.n || 0) === 0) {
          await pool.query(
            "INSERT INTO lokasi_kurir (id_kurir, nama_kurir, latitude, longitude, waktu_diperbarui) VALUES ($1, $2, $3, $4, NOW())",
            [1, "Kurir KICKSTORM (Agus)", -6.2150, 106.8500]
          );
        }
        return;
      }

      if (!libsqlClient) return;
      await libsqlClient.batch(
        sqliteSchemaStatements.map((sql) => ({ sql, args: [] })),
        "write"
      );

      const prodRes = await libsqlClient.execute("SELECT COUNT(*) AS n FROM products");
      const count = Number(prodRes.rows[0]?.n || prodRes.rows[0]?.[0] || 0);
      if (count === 0) {
        await libsqlClient.batch(
          seedProducts.map((row) => ({
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
                  { max: 5, cost: 25000 },
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

      const kurirLocRes = await libsqlClient.execute("SELECT COUNT(*) AS n FROM lokasi_kurir");
      const kurirLocCount = Number(kurirLocRes.rows[0]?.n || kurirLocRes.rows[0]?.[0] || 0);
      if (kurirLocCount === 0) {
        await libsqlClient.execute({
          sql: "INSERT INTO lokasi_kurir (id_kurir, nama_kurir, latitude, longitude, waktu_diperbarui) VALUES (1, 'Kurir KICKSTORM (Agus)', -6.2150, 106.8500, datetime('now'))",
          args: []
        });
      }
    } catch (err) {
      console.error("Database schema init notice:", err.message);
    }
  })();
  return initPromise;
}

ensureInit().catch((e) => console.warn("Background init warning:", e.message));

async function close() {
  if (pool && typeof pool.end === "function") {
    try { await pool.end(); } catch (e) {}
  }
  if (libsqlClient && typeof libsqlClient.close === "function") {
    try { await libsqlClient.close(); } catch (e) {}
  }
}

module.exports = {
  isNeon,
  isPostgres: isNeon,
  pool,
  client: isNeon ? pool : libsqlClient,
  all,
  get,
  run,
  batch,
  exec,
  ensureInit,
  close
};
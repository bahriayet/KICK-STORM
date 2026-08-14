require("dotenv").config();
const { createClient } = require("@libsql/client");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("\n❌ Error: TURSO_DATABASE_URL belum diatur di file .env");
  console.log("👉 Dapatkan URL dan Token gratis di https://turso.tech");
  console.log("Contoh format di .env:");
  console.log("TURSO_DATABASE_URL=libsql://kickstorm-username.turso.io");
  console.log("TURSO_AUTH_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6...\n");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function initTurso() {
  console.log("🚀 Menghubungkan ke Turso Cloud Database:", url);

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tag TEXT NOT NULL,
      badge TEXT NOT NULL,
      price INTEGER NOT NULL,
      variant TEXT NOT NULL,
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
      payment_method TEXT,
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
      qty INTEGER NOT NULL,
      size TEXT,
      colorway TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS admin_tokens (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
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
      phone TEXT,
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

  console.log("📦 Membuat struktur tabel di Turso Cloud...");
  for (const sql of schemaStatements) {
    await client.execute(sql);
  }
  console.log("✓ Semua tabel berhasil dibuat!");

  // Cek apakah data lokal kickstorm.db ada, jika ada kita migrasikan datanya
  const localDbPath = path.join(__dirname, "data", "kickstorm.db");
  if (fs.existsSync(localDbPath)) {
    console.log("🔄 Melakukan sinkronisasi data dari SQLite lokal ke Turso...");
    try {
      const localDb = new Database(localDbPath, { readonly: true });
      const products = localDb.prepare("SELECT * FROM products").all();
      for (const p of products) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO products (id, name, tag, badge, price, variant, stock, sold, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [p.id, p.name, p.tag, p.badge, p.price, p.variant, p.stock, p.sold, p.created_at]
        });
      }

      const couriers = localDb.prepare("SELECT * FROM couriers").all();
      for (const c of couriers) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO couriers (id, name, tiers, cod_km, phone, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [c.id, c.name, c.tiers, c.cod_km, c.phone || "", c.active, c.created_at]
        });
      }

      const coupons = localDb.prepare("SELECT * FROM coupons").all();
      for (const cp of coupons) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO coupons (code, type, value, min_order, max_uses, used_count, expires_at, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [cp.code, cp.type, cp.value, cp.min_order, cp.max_uses, cp.used_count, cp.expires_at, cp.active, cp.created_at]
        });
      }
      console.log("✓ Data produk, kurir, dan kupon lokal berhasil diunggah ke Turso!");
    } catch (err) {
      console.warn("Notice saat migrasi data lokal:", err.message);
    }
  } else {
    // Seed default products jika database kosong
    const existing = await client.execute("SELECT COUNT(*) as count FROM products");
    if (Number(existing.rows[0].count) === 0) {
      console.log("🌱 Menanam data awal produk sneaker...");
      const seeds = [
        ["Volt Runner 01", "NEW DROP", "VOLT EDITION", 2499000, "volt", 24, 0],
        ["Phantom Void", "LIMITED", "STEALTH BLACK", 2699000, "void", 18, 0],
        ["Ghost Volt", "POPULAR", "MINIMALIST", 2299000, "ghost", 30, 0],
        ["Void Obsidian", "EXCLUSIVE", "TRIPLE BLACK", 2899000, "dark", 12, 0],
        ["Neon Flash", "HOT", "CYBER PUNK", 2599000, "mono", 15, 0],
        ["Storm Classic", "RESTOCK", "TIMELESS", 1999000, "cream", 40, 0]
      ];
      for (const s of seeds) {
        await client.execute({
          sql: "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: s
        });
      }
      console.log("✓ Data produk awal berhasil ditanam!");
    }
  }

  console.log("\n🎉 Database Turso Cloud Anda sudah 100% SIAP digunakan untuk Vercel!");
}

initTurso().catch((err) => {
  console.error("❌ Gagal menginisialisasi Turso:", err);
  process.exit(1);
});

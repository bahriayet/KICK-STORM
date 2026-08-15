require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (isProd ? "" : "kickstorm-admin");
const ADMIN_TOKEN_TTL_HOURS = Math.max(1, Number(process.env.ADMIN_TOKEN_TTL_HOURS) || 72);

if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD wajib diatur (lihat .env.example) sebelum production.");
}
const ORDER_STATUSES = ["awaiting_payment", "pending", "paid", "shipped", "delivered", "cancelled"];
const VARIANTS = ["mono", "void", "volt", "ghost", "dark", "cream"];
const REFERRAL_PERCENT = 5;
const NEXT_STATUS = {
  awaiting_payment: ["paid", "cancelled"],
  pending: ["paid", "shipped", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["cancelled"]
};

function nowStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function memberLevel(points) {
  if (points >= 500) return { level: "Gold", nextAt: null };
  if (points >= 100) return { level: "Silver", nextAt: 500 };
  return { level: "Bronze", nextAt: 100 };
}

function pointsForOrder(total) {
  return Math.max(0, Math.floor(Number(total) / 10000));
}

let _settingsCache = null;
let _settingsCacheAt = 0;
const SETTINGS_CACHE_TTL = 5000; // 5 seconds

async function getSettings() {
  const now = Date.now();
  if (_settingsCache && (now - _settingsCacheAt) < SETTINGS_CACHE_TTL) return _settingsCache;
  const rows = await db.all("SELECT key, value FROM settings");
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  _settingsCache = s;
  _settingsCacheAt = now;
  return s;
}
function invalidateSettingsCache() { _settingsCache = null; }

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTiers(json) {
  try {
    const t = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(t) || t.length === 0) return null;
    const out = t.map((x) => ({ max: Number(x.max), cost: Number(x.cost) }));
    if (out.some((x) => !Number.isFinite(x.max) || !Number.isFinite(x.cost) || x.max < 0 || x.cost < 0)) return null;
    out.sort((a, b) => a.max - b.max);
    return out;
  } catch (err) {
    return null;
  }
}

function calcShipping(distKm, subtotal, tiers, s) {
  const tierList = tiers || parseTiers(s.shipping_tiers) || [{ max: 9999, cost: 15000 }];
  const freeMin = Math.max(0, Number(s.free_shipping_min) || 0);
  if (freeMin > 0 && subtotal >= freeMin) return { cost: 0, free: true };
  const tier = tierList.find((t) => distKm <= t.max) || tierList[tierList.length - 1];
  return { cost: tier ? Math.max(0, tier.cost) : 0, free: false };
}

async function getCouriers() {
  const rows = await db.all("SELECT id, name, tiers, cod_km, phone, active FROM couriers ORDER BY id");
  return rows.map((c) => ({ ...c, tiers: parseTiers(c.tiers) || [] }));
}

async function getNextDrop() {
  return await db.get(
    "SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name " +
    "FROM drops d LEFT JOIN products p ON p.id = d.product_id ORDER BY d.release_at ASC LIMIT 1"
  );
}

async function getActiveFlashSale() {
  const now = nowStr();
  return await db.get(
    "SELECT id, name, discount_percent FROM flash_sales WHERE active = 1 AND starts_at <= ? AND ends_at > ? ORDER BY id DESC LIMIT 1",
    [now, now]
  );
}

async function evaluateReferral(code, subtotal) {
  const row = await db.get(
    "SELECT code, owner_name, owner_email, max_uses, used_count, active FROM referrals WHERE code = ?",
    [String(code).trim().toUpperCase()]
  );
  if (!row) return { error: "Kode referensi tidak ditemukan." };
  if (!row.active) return { error: "Kode referensi tidak aktif." };
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return { error: "Kuota kode referensi sudah habis." };
  }
  return {
    referral: { code: row.code, owner_name: row.owner_name },
    discount: Math.min(Math.round((subtotal * REFERRAL_PERCENT) / 100), subtotal)
  };
}

async function publicConfig() {
  const s = await getSettings();
  const flash = await getActiveFlashSale();
  const drop = await getNextDrop();
  const couriers = await getCouriers();
  const active = couriers.find((c) => c.active === 1) || couriers[0];
  const defaultTiers = active && active.tiers.length ? active.tiers : parseTiers(s.shipping_tiers) || [];
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    store: {
      name: s.store_name || "",
      lat: Number(s.store_lat) || 0,
      lng: Number(s.store_lng) || 0
    },
    shipping: {
      tiers: defaultTiers,
      freeMin: Math.max(0, Number(s.free_shipping_min) || 0),
      maxKm: Math.max(0, Number(s.max_shipping_km) || 0),
      codKm: active ? active.cod_km : 0
    },
    couriers: couriers.map((c) => ({ id: c.id, name: c.name, tiers: c.tiers, codKm: c.cod_km, active: c.active === 1 })),
    paymentFlow: String(s.payment_flow || "0") === "1",
    waNumber: s.wa_number || "",
    flashSale: flash ? { name: flash.name, percent: flash.discount_percent } : null,
    nextDrop: drop ? {
      id: drop.id,
      name: drop.name,
      productName: drop.product_name,
      releaseAt: drop.release_at,
      queueEnabled: drop.queue_enabled === 1,
      started: drop.release_at <= nowStr()
    } : null
  };
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html") || filePath.endsWith("admin.js") || filePath.endsWith("admin.css") || filePath.endsWith("style.css") || filePath.endsWith("app.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else if (filePath.includes(path.sep + "vendor" + path.sep)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (/\.(css|js|svg|png|jpg|webp|woff2)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }
  }
}));

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));
app.use("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

function createAdminToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (ADMIN_TOKEN_TTL_HOURS * 3600);
  const jti = crypto.randomBytes(16).toString("hex");
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp, iat, jti })).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

async function verifyAdminToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== "string") return false;
  const h = hashToken(tokenStr);

  // 1. Check active database token
  const dbRow = await db.get("SELECT token_hash FROM admin_tokens WHERE token_hash = ? AND expires_at > datetime('now')", [h]);
  if (dbRow) return true;

  // 2. If token is in database but expired, reject immediately
  const inDb = await db.get("SELECT token_hash FROM admin_tokens WHERE token_hash = ?", [h]);
  if (inDb) return false;

  // 3. Verify HMAC token (resilient across serverless instances and cold starts)
  const parts = tokenStr.split(".");
  if (parts.length === 2) {
    const [payload, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(payload).digest("base64url");
    if (sig.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const nowSec = Math.floor(Date.now() / 1000);
        if (data.role === "admin" && data.exp > nowSec) {
          // Check if individually revoked via /api/admin/logout
          if (data.jti) {
            const revoked = await db.get("SELECT token_jti FROM admin_tokens_revoked WHERE token_jti = ?", [data.jti]);
            if (revoked) return false;
          }
          // Check if all sessions were revoked via /api/admin/logout-all
          const s = await getSettings();
          const revokedBefore = Number(s.session_epoch) || 0;
          if (data.iat && data.iat <= revokedBefore) return false;

          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  return false;
}

async function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query.token || "");
  const isValid = await verifyAdminToken(token);
  if (!token || !isValid) {
    return res.status(401).json({ error: "Sesi admin tidak valid atau kedaluwarsa." });
  }
  next();
}

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
const uploadsDir = isVercel ? path.join("/tmp", "uploads") : path.join(__dirname, "data", "uploads");
if (!require("fs").existsSync(uploadsDir)) {
  try { require("fs").mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}
app.use("/uploads", express.static(uploadsDir));

const sseClients = new Set();
function broadcastOrder(data) {
  const payload = `event: order\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

app.get("/api/admin/events", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  sseClients.add(res);
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (err) {
      clearInterval(ping);
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function evaluateCoupon(code, subtotal) {
  const coupon = await db.get(
    "SELECT code, type, value, min_order, max_uses, used_count, expires_at, active FROM coupons WHERE code = ?",
    [code]
  );
  if (!coupon) return { error: "Kode voucher tidak ditemukan." };
  if (!coupon.active) return { error: "Kode voucher tidak aktif." };
  if (coupon.expires_at && coupon.expires_at < new Date().toISOString().slice(0, 10)) {
    return { error: "Kode voucher sudah kedaluwarsa." };
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { error: "Kuota voucher sudah habis." };
  }
  if (subtotal < coupon.min_order) {
    return { error: `Minimal belanja Rp ${coupon.min_order.toLocaleString("id-ID")} untuk memakai voucher ini.` };
  }
  const discount = coupon.type === "percent"
    ? Math.min(Math.round((subtotal * coupon.value) / 100), subtotal)
    : Math.min(coupon.value, subtotal);
  return { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount };
}

function parseProduct(body) {
  const out = {};
  const num = (v) => Number.parseInt(String(v), 10);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return { error: "Nama produk tidak valid." };
    out.name = name;
  }
  if (body.tag !== undefined) {
    const tag = String(body.tag).trim();
    if (tag.length > 120) return { error: "Tag terlalu panjang." };
    out.tag = tag;
  }
  if (body.badge !== undefined) {
    const badge = String(body.badge).trim();
    if (!badge || badge.length > 40) return { error: "Badge tidak valid." };
    out.badge = badge;
  }
  if (body.price !== undefined) {
    const price = num(body.price);
    if (!Number.isInteger(price) || price < 0 || price > 100000000) return { error: "Harga tidak valid." };
    out.price = price;
  }
  if (body.variant !== undefined) {
    const variant = String(body.variant);
    if (!VARIANTS.includes(variant)) return { error: "Variant tidak dikenal." };
    out.variant = variant;
  }
  if (body.stock !== undefined) {
    const stock = num(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return { error: "Stok tidak valid." };
    out.stock = stock;
  }
  if (body.sold !== undefined) {
    const sold = num(body.sold);
    if (!Number.isInteger(sold) || sold < 0) return { error: "Jumlah terjual tidak valid." };
    out.sold = sold;
  }
  return { value: out };
}

app.get("/api/products", async (req, res) => {
  const rows = await db.all("SELECT id, name, tag, badge, price, variant, stock, sold FROM products ORDER BY id");
  const sold7 = await db.all(
    "SELECT oi.product_id, SUM(oi.qty) AS qty FROM order_items oi " +
    "JOIN orders o ON o.id = oi.order_id " +
    "WHERE o.status != 'cancelled' AND oi.product_id IS NOT NULL AND o.created_at >= datetime('now', '-7 days') " +
    "GROUP BY oi.product_id"
  );
  const rateBy = {};
  for (const r of sold7) rateBy[r.product_id] = r.qty / 7;
  const out = rows.map((p) => {
    const rate = rateBy[p.id] || 0;
    const etaHours = rate > 0.001 && p.stock > 0 ? Math.max(1, Math.round((p.stock / rate) * 24)) : null;
    return { ...p, eta_hours: etaHours };
  });
  res.json({ products: out });
});

app.get("/api/stats", async (req, res) => {
  const sold = await db.get("SELECT COALESCE(SUM(sold), 0) AS total FROM products");
  const subscribers = await db.get("SELECT COUNT(*) AS n FROM subscribers");
  const products = await db.get("SELECT COUNT(*) AS n FROM products");
  const lowStock = await db.get("SELECT COUNT(*) AS n FROM products WHERE stock <= 30");
  const orders = await db.get("SELECT COUNT(*) AS n FROM orders");
  const revenue = await db.get("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status != 'cancelled'");
  const deliveredRes = await db.get("SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered'");
  const cancelledRes = await db.get("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled'");
  const delivered = deliveredRes?.n || 0;
  const cancelled = cancelledRes?.n || 0;
  const done = delivered + cancelled;
  const rated = done > 0 ? Number(((5 * delivered + cancelled) / done).toFixed(1)) : 4.9;
  const shipRow = await db.get(
    "SELECT AVG((julianday('now') - julianday(created_at)) * 24) AS hours FROM orders WHERE status IN ('shipped', 'delivered')"
  );
  const shipHours = shipRow && shipRow.hours ? Math.max(1, Math.round(shipRow.hours)) : 24;
  res.json({
    sold: sold?.total || 0,
    subscribers: subscribers?.n || 0,
    products: products?.n || 0,
    orders: orders?.n || 0,
    revenue: revenue?.n || 0,
    rating: rated,
    shippingHours: shipHours,
    lowStock: lowStock?.n || 0
  });
});

app.post("/api/subscribers", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || !validEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid." });
  }
  try {
    const result = await db.run("INSERT INTO subscribers (email) VALUES (?)", [email]);
    res.status(201).json({ id: result.lastInsertRowid, message: "Berhasil bergabung ke Storm Club." });
  } catch (err) {
    if (err.message && (err.message.includes("UNIQUE constraint failed") || err.message.includes("SQLITE_CONSTRAINT"))) {
      return res.status(409).json({ error: "Email ini sudah terdaftar." });
    }
    throw err;
  }
});

function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== "string") return null;
  const str = url.trim();
  const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  const qMatch = str.match(/[?&](?:q|ll|destination|center|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  const rawMatch = str.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

app.post("/api/orders", async (req, res) => {
  const { name, email, address, items, notes } = req.body || {};
  if (!name || !email || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Data pesanan tidak lengkap." });
  }
  const customerName = String(name).trim();
  const customerEmail = String(email).trim().toLowerCase();
  const customerAddress = String(address).trim();
  const mapsUrl = String(req.body.maps_url || "").trim().slice(0, 1000);
  if (!customerName || customerName.length > 80) {
    return res.status(400).json({ error: "Nama tidak valid (maks 80 karakter)." });
  }
  if (!customerEmail || !validEmail(customerEmail)) {
    return res.status(400).json({ error: "Email tidak valid." });
  }
  if (!customerAddress || customerAddress.length > 300) {
    return res.status(400).json({ error: "Alamat terlalu panjang (maks 300 karakter)." });
  }

  let lat = null;
  let lng = null;
  if (req.body.lat !== undefined && req.body.lng !== undefined && req.body.lat !== null && req.body.lng !== null && req.body.lat !== "") {
    lat = Number(req.body.lat);
    lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "Koordinat lokasi tidak valid." });
    }
  } else if (mapsUrl) {
    const parsedCoords = extractCoordsFromMapsUrl(mapsUrl);
    if (parsedCoords) {
      lat = parsedCoords.lat;
      lng = parsedCoords.lng;
    }
  }

  const VALID_SIZES = new Set(["39", "40", "41", "42", "43", "44"]);
  const merged = new Map();
  for (const item of items) {
    const qty = Number.parseInt(item.qty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: "Jumlah item tidak valid." });
    }
    let size = null;
    if (item.size != null && String(item.size).trim() !== "") {
      size = String(item.size).trim();
      if (!VALID_SIZES.has(size)) {
        return res.status(400).json({ error: "Ukuran sepatu tidak valid." });
      }
    }
    if (item.custom) {
      const name = String(item.name || "").trim();
      if (!name || name.length > 80) {
        return res.status(400).json({ error: "Nama produk kustom tidak valid." });
      }
      const price = Number.parseInt(item.price, 10);
      if (!Number.isInteger(price) || price < 0 || price > 100000000) {
        return res.status(400).json({ error: "Harga produk kustom tidak valid." });
      }
      const colorway = String(item.colorway || "");
      if (colorway.length > 200) {
        return res.status(400).json({ error: "Colorway tidak valid." });
      }
      const key = `c:${name}|${price}|${size || ""}|${colorway}`;
      const totalQty = (merged.get(key) || 0) + qty;
      if (totalQty > 99) return res.status(400).json({ error: "Jumlah item tidak valid." });
      merged.set(key, totalQty);
      continue;
    }
    const id = Number.parseInt(item.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Item tidak valid." });
    }
    const key = id + "|" + (size || "");
    const totalQty = (merged.get(key) || 0) + qty;
    if (totalQty > 99) return res.status(400).json({ error: "Jumlah item tidak valid." });
    merged.set(key, totalQty);
  }

  const cart = [];
  for (const [key, qty] of merged) {
    if (key.startsWith("c:")) {
      const parts = key.slice(2).split("|");
      cart.push({
        custom: true,
        name: parts[0],
        price: Number.parseInt(parts[1], 10),
        size: parts[2] || null,
        colorway: parts[3] || "",
        qty
      });
      continue;
    }
    const id = Number.parseInt(key, 10);
    const size = key.split("|")[1] || null;
    const product = await db.get("SELECT id, name, price, stock FROM products WHERE id = ?", [id]);
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
    if (product.stock < qty) {
      return res.status(409).json({ error: `Stok "${product.name}" hanya tersisa ${product.stock} pasang.` });
    }
    cart.push({ product, qty, size });
  }

  const subtotal = cart.reduce((sum, c) => sum + (c.custom ? c.price : c.product.price) * c.qty, 0);

  const flash = await getActiveFlashSale();
  const flashDiscount = flash ? Math.min(Math.round((subtotal * flash.discount_percent) / 100), subtotal) : 0;

  const rawCoupon = String(req.body.coupon || "").trim().toUpperCase();
  let couponLine = null;
  if (rawCoupon) {
    couponLine = await evaluateCoupon(rawCoupon, subtotal);
    if (couponLine.error) return res.status(400).json({ error: couponLine.error });
  }
  const discount = couponLine ? couponLine.discount : 0;

  let referralLine = null;
  const rawReferral = String(req.body.referral || "").trim().toUpperCase();
  if (rawReferral && !couponLine) {
    referralLine = await evaluateReferral(rawReferral, subtotal);
    if (referralLine.error) return res.status(400).json({ error: referralLine.error });
  }
  const referralDiscount = referralLine ? referralLine.discount : 0;

  const s = await getSettings();
  const storeLat = Number(s.store_lat) || 0;
  const storeLng = Number(s.store_lng) || 0;
  let distKm = 0;
  if (lat !== null && lng !== null && storeLat && storeLng) {
    distKm = haversineKm(storeLat, storeLng, lat, lng);
    const maxKm = Math.max(0, Number(s.max_shipping_km) || 0);
    if (maxKm > 0 && distKm > maxKm) {
      return res.status(400).json({
        error: `Lokasi kamu ${Math.round(distKm)} km dari toko — di luar jangkauan pengiriman (maks ${maxKm} km). Pilih lokasi lain atau hubungi admin.`
      });
    }
  }

  const couriers = await getCouriers();
  let courier = null;
  const rawCourierId = Number.parseInt(req.body.courier_id, 10);
  if (Number.isInteger(rawCourierId)) {
    courier = couriers.find((c) => c.id === rawCourierId) || null;
    if (!courier || courier.active !== 1) {
      return res.status(400).json({ error: "Kurir tidak ditemukan atau tidak aktif." });
    }
  } else {
    courier = couriers.find((c) => c.active === 1) || couriers[0] || null;
  }
  const courierTiers = courier && courier.tiers.length ? courier.tiers : parseTiers(s.shipping_tiers);
  const paymentMethod = String(req.body.payment_method || "transfer") === "cod" ? "cod" : "transfer";
  if (paymentMethod === "cod") {
    const codKm = courier ? courier.cod_km : 0;
    if (codKm <= 0) {
      return res.status(400).json({ error: `Kurir ${courier ? courier.name : ""} tidak mendukung COD. Pilih metode transfer.` });
    }
    if (lat === null || lng === null) {
      return res.status(400).json({ error: "Untuk COD, pilih lokasi pengiriman di peta agar jaraknya bisa diverifikasi." });
    }
    if (distKm > codKm) {
      return res.status(400).json({
        error: `COD hanya tersedia dalam ${codKm} km dari toko. Lokasi kamu ${Math.round(distKm)} km — pilih transfer bank.`
      });
    }
  }

  const drop = await getNextDrop();
  let dropId = null;
  let queueNo = null;
  if (drop && drop.queue_enabled === 1) {
    if (drop.release_at > nowStr()) {
      return res.status(403).json({
        error: `Drop "${drop.name}" belum dibuka — pesanan dibuka saat rilis (${drop.release_at}). Pantau hitung mundurnya!`
      });
    }
    dropId = drop.id;
    const maxQ = await db.get("SELECT COALESCE(MAX(queue_no), 0) AS n FROM orders WHERE drop_id = ?", [drop.id]);
    queueNo = (maxQ?.n || 0) + 1;
  }

  const shippingInfo = calcShipping(distKm, subtotal, courierTiers, s);
  const shipping = shippingInfo.cost;

  const total = Math.max(0, subtotal - flashDiscount - discount - referralDiscount + shipping);

  const paymentFlow = String(s.payment_flow || "0") === "1";
  const orderStatus = paymentFlow && paymentMethod === "transfer" ? "awaiting_payment" : "pending";

  const orderRes = await db.run(
    "INSERT INTO orders (customer_name, email, address, lat, lng, total, discount, coupon_code, referral_code, flash_sale_id, shipping, notes, status, maps_url, payment_method, courier_id, courier_name, drop_id, queue_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      customerName,
      customerEmail,
      customerAddress,
      lat,
      lng,
      total,
      discount,
      couponLine ? couponLine.coupon.code : null,
      referralLine ? referralLine.referral.code : null,
      flash ? flash.id : null,
      shipping,
      String(notes || ""),
      orderStatus,
      mapsUrl || null,
      paymentMethod,
      courier ? courier.id : null,
      courier ? courier.name : null,
      dropId,
      queueNo
    ]
  );
  const orderId = orderRes.lastInsertRowid;

  await db.run("INSERT INTO order_status_log (order_id, from_status, to_status) VALUES (?, 'created', ?)", [orderId, orderStatus]);

  if (couponLine) {
    await db.run("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?", [couponLine.coupon.code]);
  }
  if (referralLine) {
    await db.run("UPDATE referrals SET used_count = used_count + 1 WHERE code = ?", [referralLine.referral.code]);
  }
  for (const c of cart) {
    await db.run(
      "INSERT INTO order_items (order_id, product_id, product_name, price, qty, size, colorway) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [orderId, c.custom ? null : c.product.id, c.custom ? c.name : c.product.name, c.custom ? c.price : c.product.price, c.qty, c.size, c.custom ? c.colorway : null]
    );
    if (!c.custom) {
      await db.run("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?", [c.qty, c.qty, c.product.id]);
    }
  }

  const points = pointsForOrder(total);
  if (points > 0) {
    await db.run(
      "INSERT INTO members (email, name, points) VALUES (?, ?, ?) " +
      "ON CONFLICT(email) DO UPDATE SET points = points + excluded.points, name = excluded.name",
      [customerEmail, customerName, points]
    );
  }

  broadcastOrder({ id: orderId, customer_name: customerName, total, payment_method: paymentMethod });
  res.status(201).json({
    orderId,
    subtotal,
    flash: flash ? { name: flash.name, percent: flash.discount_percent, discount: flashDiscount } : null,
    discount,
    coupon: couponLine ? couponLine.coupon.code : null,
    referral: referralLine ? referralLine.referral.code : null,
    referralDiscount,
    shipping,
    shippingFree: shippingInfo.free,
    courier: courier ? { id: courier.id, name: courier.name } : null,
    paymentMethod,
    queueNo,
    dropName: dropId && drop ? drop.name : null,
    distanceKm: lat !== null ? Math.round(distKm * 10) / 10 : null,
    total,
    status: orderStatus,
    points: pointsForOrder(total),
    message: orderStatus === "awaiting_payment"
      ? "Pesanan diterima — selesaikan pembayaran & upload bukti di halaman Lacak."
      : "Pesanan diterima!"
  });
});

app.get("/api/coupons", async (req, res) => {
  const coupons = await db.all(
    "SELECT code, type, value, min_order FROM coupons " +
    "WHERE active = 1 AND (expires_at IS NULL OR expires_at >= date('now')) " +
    "AND (max_uses = 0 OR used_count < max_uses) ORDER BY min_order ASC, code"
  );
  res.json({ coupons });
});

app.post("/api/coupons/check", async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const subtotal = Number.parseInt(req.body.subtotal, 10);
  if (!code) return res.status(400).json({ error: "Masukkan kode voucher." });
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    return res.status(400).json({ error: "Subtotal tidak valid." });
  }
  const result = await evaluateCoupon(code, subtotal);
  if (result.error) return res.status(404).json({ error: result.error });
  res.json({ valid: true, code: result.coupon.code, discount: result.discount });
});

app.get("/api/flash-sale", async (req, res) => {
  const flash = await getActiveFlashSale();
  res.json({ flashSale: flash ? { name: flash.name, percent: flash.discount_percent } : null });
});

app.post("/api/referrals/check", async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const subtotal = Number.parseInt(req.body.subtotal, 10);
  if (!code) return res.status(400).json({ error: "Masukkan kode referensi." });
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    return res.status(400).json({ error: "Subtotal tidak valid." });
  }
  const result = await evaluateReferral(code, subtotal);
  if (result.error) return res.status(404).json({ error: result.error });
  res.json({ valid: true, code: result.referral.code, discount: result.discount, owner_name: result.referral.owner_name });
});

app.post("/api/restock-notify", async (req, res) => {
  const productId = Number.parseInt(req.body.productId, 10);
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ error: "Produk tidak valid." });
  }
  if (!email || !validEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid." });
  }
  const product = await db.get("SELECT id, name FROM products WHERE id = ?", [productId]);
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  try {
    const result = await db.run("INSERT INTO restock_waitlist (product_id, email) VALUES (?, ?)", [productId, email]);
    res.status(201).json({ id: result.lastInsertRowid, message: `Kami kabari kamu saat "${product.name}" restock.` });
  } catch (err) {
    if (err.message && (err.message.includes("UNIQUE constraint failed") || err.message.includes("SQLITE_CONSTRAINT"))) {
      return res.status(409).json({ error: "Kamu sudah terdaftar untuk produk ini." });
    }
    throw err;
  }
});

app.get("/courier", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "courier.html"));
});

app.get("/api/track", async (req, res) => {
  let rawQuery = String(req.query.orderId || req.query.id || req.query.tracking_number || req.query.q || req.query.query || "").trim();
  let rawEmail = String(req.query.email || "").trim().toLowerCase();

  // Jika input pertama adalah format email dan rawEmail kosong
  if (validEmail(rawQuery) && !rawEmail) {
    rawEmail = rawQuery.toLowerCase();
    rawQuery = "";
  } else if (validEmail(rawQuery) && !validEmail(rawEmail)) {
    const temp = rawQuery;
    rawQuery = rawEmail;
    rawEmail = temp.toLowerCase();
  }

  if (!rawQuery && !rawEmail) {
    return res.status(400).json({ error: "Masukkan nomor pesanan, nomor resi, atau email pemesan." });
  }

  // Bersihkan format nomor pesanan jika pengguna mengetik #12, KS-12, atau Order #12
  let orderId = null;
  let trackingNumber = null;
  if (rawQuery) {
    const numMatch = rawQuery.match(/^(?:order|pesanan|no\.?|ks-)?\s*#?\s*(\d+)$/i);
    if (numMatch) {
      orderId = Number.parseInt(numMatch[1], 10);
    } else {
      trackingNumber = rawQuery;
    }
  }

  const ORDER_COLS = "id, customer_name, email, total, discount, coupon_code, referral_code, flash_sale_id, shipping, status, tracking_number, notes, created_at, payment_method, payment_proof, payment_note, paid_at, courier_name, courier_lat, courier_lng, courier_share_url, courier_updated_at, maps_url, address, lat, lng, queue_no";

  let order = null;

  if (rawEmail) {
    if (!validEmail(rawEmail)) {
      return res.status(400).json({ error: "Format email tidak valid. Masukkan email saat pemesanan." });
    }

    if (orderId !== null && orderId >= 1) {
      order = await db.get(
        `SELECT ${ORDER_COLS} FROM orders WHERE id = ? AND LOWER(email) = ?`,
        [orderId, rawEmail]
      );
    }

    if (!order && (trackingNumber || rawQuery)) {
      const trk = trackingNumber || rawQuery;
      order = await db.get(
        `SELECT ${ORDER_COLS} FROM orders WHERE UPPER(tracking_number) = UPPER(?) AND LOWER(email) = ?`,
        [trk, rawEmail]
      );
    }

    // Jika mencari hanya berdasarkan email
    if (!order && !rawQuery) {
      order = await db.get(
        `SELECT ${ORDER_COLS} FROM orders WHERE LOWER(email) = ? ORDER BY id DESC LIMIT 1`,
        [rawEmail]
      );
    }
  } else {
    // Jika tanpa email, izinkan pelacakan langsung via nomor pesanan atau resi
    if (orderId !== null && orderId >= 1) {
      order = await db.get(
        `SELECT ${ORDER_COLS} FROM orders WHERE id = ?`,
        [orderId]
      );
    }

    if (!order && (trackingNumber || rawQuery)) {
      const trk = trackingNumber || rawQuery;
      order = await db.get(
        `SELECT ${ORDER_COLS} FROM orders WHERE UPPER(tracking_number) = UPPER(?)`,
        [trk]
      );
    }
  }

  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan. Periksa nomor pesanan/resi dan email kamu." });
  }

  const items = await db.all("SELECT product_id, product_name, price, qty, size, colorway FROM order_items WHERE order_id = ?", [order.id]);
  const history = await db.all("SELECT from_status, to_status, changed_at FROM order_status_log WHERE order_id = ? ORDER BY id", [order.id]);
  res.json({ order: { ...order, items: items || [], history: history || [] } });
});

/* ---- Courier Portal API ---- */

app.get("/api/courier/orders", async (req, res) => {
  const statusFilter = req.query.status;
  let query = "SELECT o.id, o.customer_name, o.email, o.address, o.maps_url, o.lat, o.lng, o.total, o.shipping, o.status, o.tracking_number, o.notes, o.created_at, o.payment_method, o.paid_at, o.courier_id, o.courier_name, o.courier_lat, o.courier_lng, o.courier_share_url, o.courier_updated_at FROM orders o ";
  const params = [];
  if (statusFilter === "active") {
    query += "WHERE o.status IN ('paid', 'shipped', 'awaiting_payment', 'pending') ORDER BY CASE o.status WHEN 'shipped' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END, o.id DESC";
  } else if (statusFilter) {
    query += "WHERE o.status = ? ORDER BY o.id DESC";
    params.push(statusFilter);
  } else {
    query += "WHERE o.status != 'cancelled' ORDER BY CASE o.status WHEN 'shipped' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END, o.id DESC";
  }
  const orders = await db.all(query, params);
  const itemRows = await db.all("SELECT order_id, product_name, price, qty, size, colorway FROM order_items");
  const byOrder = {};
  for (const it of itemRows) (byOrder[it.order_id] ||= []).push(it);
  res.json({ orders: orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })) });
});

app.post("/api/courier/orders/:id/status", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const targetStatus = String(req.body.status || "").trim();
  const courierName = String(req.body.courier_name || "").trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!["shipped", "delivered"].includes(targetStatus)) {
    return res.status(400).json({ error: "Status kurir hanya boleh 'shipped' atau 'delivered'." });
  }
  const order = await db.get("SELECT id, status, courier_name, customer_name, total, payment_method FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

  if (courierName) {
    await db.run("UPDATE orders SET status = ?, courier_name = ?, courier_updated_at = datetime('now') WHERE id = ?", [targetStatus, courierName, id]);
  } else {
    await db.run("UPDATE orders SET status = ?, courier_updated_at = datetime('now') WHERE id = ?", [targetStatus, id]);
  }
  await db.run("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)", [id, order.status, targetStatus, courierName || "Kurir"]);

  broadcastOrder({ id, status: targetStatus, customer_name: order.customer_name, total: order.total, payment_method: order.payment_method });
  res.json({ ok: true, id, status: targetStatus, message: targetStatus === "delivered" ? "Pesanan berhasil diselesaikan!" : "Pengantaran dimulai!" });
});

app.post("/api/courier/orders/:id/location", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Koordinat lokasi tidak valid." });
  }
  const now = nowStr();
  await db.run("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE id = ?", [lat, lng, now, id]);
  res.json({ ok: true, id, lat, lng, updated_at: now });
});

app.post("/api/courier/orders/:id/share-link", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const shareUrl = String(req.body.share_url || "").trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!shareUrl) return res.status(400).json({ error: "Link Google Maps Location Sharing wajib diisi." });
  await db.run("UPDATE orders SET courier_share_url = ?, courier_updated_at = datetime('now') WHERE id = ?", [shareUrl, id]);
  res.json({ ok: true, id, share_url: shareUrl });
});

app.post("/api/courier/sync-location", async (req, res) => {
  const lat = req.body.lat != null ? Number(req.body.lat) : null;
  const lng = req.body.lng != null ? Number(req.body.lng) : null;
  const shareUrl = String(req.body.share_url || "").trim();
  const courierId = req.body.courier_id ? Number(req.body.courier_id) : null;
  const now = nowStr();

  if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "Koordinat lokasi tidak valid." });
    }
  }

  if (courierId) {
    if (lat !== null && lng !== null) {
      await db.run("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE courier_id = ? AND status = 'shipped'", [lat, lng, now, courierId]);
    }
    if (shareUrl) {
      await db.run("UPDATE orders SET courier_share_url = ?, courier_updated_at = ? WHERE courier_id = ? AND status = 'shipped'", [shareUrl, now, courierId]);
    }
  } else {
    if (lat !== null && lng !== null) {
      await db.run("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE status = 'shipped'", [lat, lng, now]);
    }
    if (shareUrl) {
      await db.run("UPDATE orders SET courier_share_url = ?, courier_updated_at = ? WHERE status = 'shipped'", [shareUrl, now]);
    }
  }
  res.json({ ok: true, lat, lng, share_url: shareUrl, updated_at: now });
});

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body || {};
  if (!safeEqual(password || "", ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Password salah." });
  }
  try {
    await db.run("DELETE FROM admin_tokens WHERE expires_at <= datetime('now')");
  } catch (e) {}
  const token = createAdminToken();
  try {
    await db.run("INSERT INTO admin_tokens (token_hash, created_at, expires_at) VALUES (?, datetime('now'), datetime('now', ?))", [hashToken(token), `+${ADMIN_TOKEN_TTL_HOURS} hours`]);
  } catch (e) {}
  res.json({ token, ttlHours: ADMIN_TOKEN_TTL_HOURS, expiresAt: new Date(Date.now() + ADMIN_TOKEN_TTL_HOURS * 3600000).toISOString() });
});

app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length === 2) {
    try {
      const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (data.jti) {
        await db.run("INSERT INTO admin_tokens_revoked (token_jti) VALUES (?) ON CONFLICT(token_jti) DO NOTHING", [data.jti]);
      }
    } catch (e) {}
  }
  await db.run("DELETE FROM admin_tokens WHERE token_hash = ?", [hashToken(token)]);
  res.json({ ok: true });
});

app.post("/api/admin/logout-all", requireAdmin, async (req, res) => {
  await db.run("DELETE FROM admin_tokens");
  await db.run("INSERT INTO settings (key, value) VALUES ('session_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(Math.floor(Date.now() / 1000))]);
  invalidateSettingsCache();
  res.json({ ok: true, message: "Semua sesi admin diakhiri." });
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  const orders = await db.all(
    "SELECT o.id, o.customer_name, o.email, o.address, o.maps_url, o.lat, o.lng, o.total, o.discount, o.coupon_code, o.referral_code, o.flash_sale_id, o.shipping, o.status, o.tracking_number, o.notes, o.created_at, o.payment_method, o.payment_proof, o.payment_note, o.paid_at, o.courier_id, o.courier_name, o.courier_lat, o.courier_lng, o.courier_share_url, o.courier_updated_at, o.queue_no, o.drop_id FROM orders o ORDER BY o.id DESC"
  );
  const itemRows = await db.all("SELECT order_id, product_name, price, qty, size, colorway FROM order_items");
  const byOrder = {};
  for (const it of itemRows) (byOrder[it.order_id] ||= []).push(it);
  const logRows = await db.all("SELECT order_id, from_status, to_status, changed_at FROM order_status_log ORDER BY id");
  const logByOrder = {};
  for (const l of logRows) (logByOrder[l.order_id] ||= []).push({ from_status: l.from_status, to_status: l.to_status, changed_at: l.changed_at });
  res.json({ orders: orders.map((o) => ({ ...o, items: byOrder[o.id] || [], history: logByOrder[o.id] || [] })) });
});

app.get("/api/orders/export", requireAdmin, async (req, res) => {
  const orders = await db.all(
    "SELECT o.id, o.customer_name, o.email, o.address, o.lat, o.lng, o.total, o.discount, o.coupon_code, o.referral_code, o.flash_sale_id, o.shipping, o.status, o.tracking_number, o.notes, o.payment_method, o.courier_name, o.queue_no, o.paid_at FROM orders o ORDER BY o.id"
  );
  const itemRows = await db.all("SELECT order_id, product_name, price, qty, size, colorway FROM order_items");
  const byOrder = {};
  for (const it of itemRows) (byOrder[it.order_id] ||= []).push(it);

  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ["ID,Tanggal,Nama,Email,Alamat,Latitude,Longitude,Item,Subtotal,Flash Sale,Kupon,Referral,Diskon,Ongkir,Total,Status,Resi,Catatan,Kurir,Pembayaran,Antrian,Tanggal Bayar"];
  for (const o of orders) {
    const items = (byOrder[o.id] || []).map((i) => `${i.product_name} x${i.qty}${i.size ? ` (Uk. ${i.size})` : ""}${i.colorway ? ` [${i.colorway}]` : ""}`).join(" | ");
    const subtotal = o.total - o.shipping + o.discount;
    lines.push([o.id, o.created_at, o.customer_name, o.email, o.address, o.lat ?? "", o.lng ?? "", items, subtotal, o.flash_sale_id ? "Ya" : "", o.coupon_code || "", o.referral_code || "", o.discount, o.shipping, o.total, o.status, o.tracking_number || "", o.notes || "", o.courier_name || "", o.payment_method || "", o.queue_no || "", o.paid_at || ""].map(esc).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("\uFEFF" + lines.join("\n"));
});

app.get("/api/admin/sales", requireAdmin, async (req, res) => {
  const DAYS = 14;
  const rows = await db.all(
    "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders " +
    "FROM orders WHERE status != 'cancelled' AND created_at >= date('now', '-13 days') GROUP BY day"
  );
  const byDay = new Map(rows.map((r) => [r.day, { revenue: r.revenue, orders: r.orders }]));
  const points = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDay.get(day);
    points.push({ day, revenue: hit ? hit.revenue : 0, orders: hit ? hit.orders : 0 });
  }
  res.json({ days: DAYS, points });
});

app.get("/api/admin/top-products", requireAdmin, async (req, res) => {
  const DAYS = 14;
  const rows = await db.all(
    "SELECT oi.product_id, oi.product_name, SUM(oi.price * oi.qty) AS revenue " +
    "FROM order_items oi " +
    "JOIN orders o ON o.id = oi.order_id " +
    "WHERE o.status != 'cancelled' AND oi.product_id IS NOT NULL AND o.created_at >= date('now', '-13 days') " +
    "GROUP BY oi.product_id, oi.product_name " +
    "ORDER BY revenue DESC " +
    "LIMIT 5"
  );
  res.json({ days: DAYS, topProducts: rows });
});

app.patch("/api/orders/:id/status", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "");
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "Status tidak valid." });

  const order = await db.get("SELECT id, status, total FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  const from = order.status;
  if (from === status) return res.json({ id, status, note: "Status tidak berubah." });

  if (from !== "cancelled" && status !== "cancelled") {
    const allowed = NEXT_STATUS[from] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Tidak bisa memundurkan status pesanan." });
    }
  }

  const items = await db.all("SELECT product_id, qty FROM order_items WHERE order_id = ?", [id]);
  await db.run("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
  for (const it of items) {
    if (status === "cancelled" && it.product_id) {
      await db.run("UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?", [it.qty, it.qty, it.product_id]);
    } else if (from === "cancelled" && it.product_id) {
      await db.run("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?", [it.qty, it.qty, it.product_id]);
    }
  }
  if (status === "cancelled") {
    const pts = pointsForOrder(order.total);
    if (pts > 0) {
      await db.run("UPDATE members SET points = MAX(points - ?, 0) WHERE email = (SELECT email FROM orders WHERE id = ?)", [pts, id]);
    }
  }
  await db.run("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)", [id, from, status, ""]);

  const note = status === "cancelled"
    ? "Pesanan dibatalkan — stok dikembalikan."
    : (from === "cancelled" ? "Pesanan diaktifkan kembali — stok dikurangi." : "Status diperbarui.");
  res.json({ id, status, note });
});

app.put("/api/orders/:id/tracking", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const tracking = String(req.body.tracking || "").trim().slice(0, 60);
  const order = await db.get("SELECT id, status FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "shipped" && order.status !== "delivered") {
    return res.status(400).json({ error: "Nomor resi hanya bisa diisi saat status Sedang Dikirim atau Selesai." });
  }
  await db.run("UPDATE orders SET tracking_number = ? WHERE id = ?", [tracking || null, id]);
  res.json({ id, tracking: tracking || null });
});

/* ---- Alur pembayaran: bukti transfer + verifikasi ---- */

app.post("/api/orders/:id/payment-proof", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const order = await db.get("SELECT id, status FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "awaiting_payment") {
    return res.status(400).json({ error: "Bukti pembayaran hanya bisa diunggah saat status Menunggu Pembayaran." });
  }
  const dataUrl = String(req.body.proof || "");
  const note = String(req.body.note || "").trim().slice(0, 200);
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return res.status(400).json({ error: "Unggah gambar bukti (PNG/JPG/WebP) yang valid." });
  }
  const ext = match[1].replace("jpeg", "jpg");
  const buf = Buffer.from(match[2], "base64");
  if (buf.length < 1024 || buf.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "Ukuran gambar bukti harus 1KB - 5MB." });
  }
  const filename = `pay-${id}-${Date.now()}.${ext}`;
  require("fs").writeFileSync(path.join(uploadsDir, filename), buf);
  await db.run("UPDATE orders SET payment_proof = ?, payment_note = ? WHERE id = ?", ["/uploads/" + filename, note, id]);
  res.json({ ok: true, proof: "/uploads/" + filename });
});

app.post("/api/admin/orders/:id/verify-payment", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const order = await db.get("SELECT id, status FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "awaiting_payment") {
    return res.status(400).json({ error: "Hanya pesanan Menunggu Pembayaran yang bisa diverifikasi." });
  }
  await db.run("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?", [nowStr(), id]);
  await db.run("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, 'awaiting_payment', 'paid', 'admin')", [id]);
  res.json({ id, status: "paid", note: "Pembayaran diverifikasi — pesanan diproses." });
});

app.post("/api/admin/orders/:id/reject-payment", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const order = await db.get("SELECT id, status, total FROM orders WHERE id = ?", [id]);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "awaiting_payment") {
    return res.status(400).json({ error: "Hanya pesanan Menunggu Pembayaran yang bisa ditolak." });
  }
  await db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);
  const items = await db.all("SELECT product_id, qty FROM order_items WHERE order_id = ?", [id]);
  for (const it of items) {
    if (it.product_id) {
      await db.run("UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?", [it.qty, it.qty, it.product_id]);
    }
  }
  const pts = pointsForOrder(order.total);
  if (pts > 0) {
    await db.run("UPDATE members SET points = MAX(points - ?, 0) WHERE email = (SELECT email FROM orders WHERE id = ?)", [pts, id]);
  }
  await db.run("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, 'awaiting_payment', 'cancelled', 'admin')", [id]);
  res.json({ id, status: "cancelled", note: "Pembayaran ditolak — pesanan dibatalkan, stok dikembalikan." });
});

app.put("/api/admin/orders/:id/courier-location", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Koordinat kurir tidak valid." });
  }
  const info = await db.run("UPDATE orders SET courier_lat = ?, courier_lng = ? WHERE id = ?", [lat, lng, id]);
  if (info.changes === 0) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json({ id, courierLat: lat, courierLng: lng, note: "Posisi kurir diperbarui — pelanggan bisa melihatnya di halaman Lacak." });
});

/* ---- Member: poin, level, ulang tahun ---- */

app.get("/api/member", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: "Email tidak valid." });
  const m = await db.get("SELECT email, name, points, birth_month, birth_day FROM members WHERE email = ?", [email]);
  if (!m) return res.json({ member: null });
  const lv = memberLevel(m.points);
  const today = new Date();
  let birthdayCoupon = null;
  if (m.birth_month && m.birth_day && m.birth_month === today.getMonth() + 1 && m.birth_day === today.getDate()) {
    const code = "BDAY-" + crypto.createHash("sha1").update(email).digest("hex").slice(0, 8).toUpperCase();
    const expires = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    await db.run(
      "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at, active) VALUES (?, 'percent', 15, 0, 1, ?, 1) " +
      "ON CONFLICT(code) DO UPDATE SET expires_at = excluded.expires_at, active = 1, type = 'percent', value = 15, min_order = 0",
      [code, expires]
    );
    const c = await db.get("SELECT code, used_count, max_uses FROM coupons WHERE code = ?", [code]);
    if (c && (c.max_uses === 0 || c.used_count < c.max_uses)) {
      birthdayCoupon = { code, expires };
    }
  }
  res.json({
    member: {
      email: m.email,
      name: m.name,
      points: m.points,
      level: lv.level,
      nextAt: lv.nextAt,
      birthSet: !!(m.birth_month && m.birth_day),
      birthdayCoupon
    }
  });
});

app.post("/api/member/birthday", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const birth = String(req.body.birth || "").trim();
  if (!validEmail(email)) return res.status(400).json({ error: "Email tidak valid." });
  const m = await db.get("SELECT email FROM members WHERE email = ?", [email]);
  if (!m) return res.status(404).json({ error: "Email belum terdaftar sebagai member (buat pesanan dulu)." });
  const parts = birth.split("-");
  const month = Number.parseInt(parts[0], 10);
  const day = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return res.status(400).json({ error: "Tanggal lahir tidak valid (format MM-DD)." });
  }
  await db.run("UPDATE members SET birth_month = ?, birth_day = ? WHERE email = ?", [month, day, email]);
  res.json({ ok: true, message: "Tanggal lahir tersimpan — kupon ulang tahun otomatis aktif setiap tahunnya." });
});

/* ---- Drop: countdown + antrian ---- */

app.get("/api/next-drop", async (req, res) => {
  const drop = await getNextDrop();
  if (!drop) return res.json({ drop: null });
  const started = drop.release_at <= nowStr();
  res.json({
    drop: {
      id: drop.id,
      name: drop.name,
      productName: drop.product_name,
      releaseAt: drop.release_at,
      queueEnabled: drop.queue_enabled === 1,
      started
    }
  });
});

const selectDropsAll = "SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name, d.created_at FROM drops d LEFT JOIN products p ON p.id = d.product_id ORDER BY d.release_at ASC";
const selectDrops = "SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name, d.created_at FROM drops d LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?";

app.get("/api/admin/drops", requireAdmin, async (req, res) => {
  const drops = await db.all(selectDropsAll);
  res.json({ drops });
});

const parseDrop = (body) => {
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) return { error: "Nama drop tidak valid." };
  const release_at = String(body.release_at || "").trim().replace("T", " ");
  const re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
  if (!re.test(release_at)) return { error: "Waktu rilis tidak valid (YYYY-MM-DD HH:MM)." };
  const norm = release_at.length === 16 ? release_at + ":00" : release_at;
  let product_id = null;
  if (body.product_id !== undefined && body.product_id !== null && String(body.product_id).trim() !== "") {
    product_id = Number.parseInt(body.product_id, 10);
    if (!Number.isInteger(product_id)) return { error: "Produk tidak valid." };
  }
  return { value: { name, release_at: norm, product_id, queue_enabled: body.queue_enabled ? 1 : 0 } };
};

app.post("/api/admin/drops", requireAdmin, async (req, res) => {
  const parsed = parseDrop(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  const result = await db.run(
    "INSERT INTO drops (name, product_id, release_at, queue_enabled) VALUES (?, ?, ?, ?)",
    [d.name, d.product_id, d.release_at, d.queue_enabled]
  );
  const drop = await db.get(selectDrops, [result.lastInsertRowid]);
  res.status(201).json({ drop });
});

app.patch("/api/admin/drops/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = await db.get("SELECT * FROM drops WHERE id = ?", [id]);
  if (!current) return res.status(404).json({ error: "Drop tidak ditemukan." });
  const parsed = parseDrop({ ...current, ...(req.body || {}) });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  await db.run(
    "UPDATE drops SET name = ?, product_id = ?, release_at = ?, queue_enabled = ? WHERE id = ?",
    [d.name, d.product_id, d.release_at, d.queue_enabled, id]
  );
  const drop = await db.get(selectDrops, [id]);
  res.json({ drop });
});

app.delete("/api/admin/drops/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = await db.run("DELETE FROM drops WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Drop tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Kurir: pilih kurir + COD ---- */

const selectCouriersAll = "SELECT id, name, tiers, cod_km, phone, active, created_at FROM couriers ORDER BY id";
const selectCouriers = "SELECT id, name, tiers, cod_km, phone, active, created_at FROM couriers WHERE id = ?";

app.get("/api/admin/couriers", requireAdmin, async (req, res) => {
  const couriers = await db.all(selectCouriersAll);
  res.json({ couriers: couriers.map((c) => ({ ...c, tiers: parseTiers(c.tiers) || [] })) });
});

const parseCourier = (body) => {
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) return { error: "Nama kurir tidak valid." };
  const tiers = parseTiers(JSON.stringify(body.tiers));
  if (!tiers) return { error: "Tier ongkir kurir tidak valid." };
  const cod_km = Number.parseInt(body.cod_km, 10) || 0;
  if (!Number.isInteger(cod_km) || cod_km < 0 || cod_km > 100000) return { error: "Jarak COD tidak valid." };
  return { value: { name, tiers, cod_km } };
};

app.post("/api/admin/couriers", requireAdmin, async (req, res) => {
  const parsed = parseCourier(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  const result = await db.run(
    "INSERT INTO couriers (name, tiers, cod_km, phone) VALUES (?, ?, ?, ?)",
    [c.name, JSON.stringify(c.tiers), c.cod_km, ""]
  );
  const courier = await db.get(selectCouriers, [result.lastInsertRowid]);
  res.status(201).json({ courier: { ...courier, tiers: parseTiers(courier.tiers) || [] } });
});

app.patch("/api/admin/couriers/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = await db.get("SELECT * FROM couriers WHERE id = ?", [id]);
  if (!current) return res.status(404).json({ error: "Kurir tidak ditemukan." });
  const b = req.body || {};
  const sets = [];
  const vals = [];
  if (b.active !== undefined) { sets.push("active = ?"); vals.push(b.active ? 1 : 0); }
  if (b.name !== undefined || b.tiers !== undefined || b.cod_km !== undefined) {
    const parsed = parseCourier({ ...current, ...b });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    sets.push("name = ?", "tiers = ?", "cod_km = ?");
    vals.push(parsed.value.name, JSON.stringify(parsed.value.tiers), parsed.value.cod_km);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });
  await db.run(`UPDATE couriers SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  const courier = await db.get(selectCouriers, [id]);
  res.json({ courier: { ...courier, tiers: parseTiers(courier.tiers) || [] } });
});

app.delete("/api/admin/couriers/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = await db.run("DELETE FROM couriers WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Kurir tidak ditemukan." });
  res.json({ ok: true });
});

app.post("/api/products", requireAdmin, async (req, res) => {
  const parsed = parseProduct(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const p = parsed.value;
  if (!p.name) return res.status(400).json({ error: "Nama produk wajib diisi." });
  const result = await db.run(
    "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [p.name, p.tag ?? "", p.badge ?? "New", p.price ?? 0, p.variant ?? "mono", p.stock ?? 0, p.sold ?? 0]
  );
  const row = await db.get(
    "SELECT id, name, tag, badge, price, variant, stock, sold FROM products WHERE id = ?",
    [result.lastInsertRowid]
  );
  res.status(201).json({ product: row });
});

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID produk tidak valid." });
  const parsed = parseProduct(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const p = parsed.value;
  const keys = Object.keys(p);
  if (keys.length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });

  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const info = await db.run(`UPDATE products SET ${sets} WHERE id = ?`, [...keys.map((k) => p[k]), id]);
  if (info.changes === 0) return res.status(404).json({ error: "Produk tidak ditemukan." });
  const row = await db.get(
    "SELECT id, name, tag, badge, price, variant, stock, sold FROM products WHERE id = ?",
    [id]
  );
  res.json({ product: row });
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID produk tidak valid." });
  const info = await db.run("DELETE FROM products WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Produk tidak ditemukan." });
  res.json({ ok: true });
});

const selectCoupon = "SELECT code, type, value, min_order, max_uses, used_count, expires_at, active FROM coupons WHERE code = ?";
const selectCoupons = "SELECT code, type, value, min_order, max_uses, used_count, expires_at, active, created_at FROM coupons ORDER BY code";

const parseCoupon = (body) => {
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    return { error: "Kode tidak valid (3-30 karakter: huruf, angka, minus, garis bawah)." };
  }
  const type = String(body.type);
  if (type !== "percent" && type !== "fixed") return { error: "Tipe harus percent atau fixed." };
  const value = Number.parseInt(body.value, 10);
  if (!Number.isInteger(value) || value < 1 || value > 100000000 || (type === "percent" && value > 100)) {
    return { error: "Nilai diskon tidak valid." };
  }
  const min_order = Number.parseInt(body.min_order, 10) || 0;
  const max_uses = Number.parseInt(body.max_uses, 10) || 0;
  if (min_order < 0 || min_order > 100000000) return { error: "Minimal belanja tidak valid." };
  if (max_uses < 0 || max_uses > 1000000) return { error: "Kuota pemakaian tidak valid." };
  const expires_at = body.expires_at ? String(body.expires_at).trim() : null;
  if (expires_at && !/^\d{4}-\d{2}-\d{2}$/.test(expires_at)) {
    return { error: "Tanggal kedaluwarsa tidak valid (format YYYY-MM-DD)." };
  }
  return { value: { code, type, value, min_order, max_uses, expires_at } };
};

app.get("/api/admin/coupons", requireAdmin, async (req, res) => {
  const coupons = await db.all(selectCoupons);
  res.json({ coupons });
});

app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
  const parsed = parseCoupon(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  try {
    await db.run(
      "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [c.code, c.type, c.value, c.min_order, c.max_uses, c.expires_at]
    );
  } catch (err) {
    if (err.message && (err.message.includes("UNIQUE constraint failed") || err.message.includes("PRIMARY KEY") || err.message.includes("SQLITE_CONSTRAINT"))) {
      return res.status(409).json({ error: "Kode voucher sudah ada." });
    }
    throw err;
  }
  const coupon = await db.get(selectCoupon, [c.code]);
  res.status(201).json({ coupon });
});

app.put("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const current = await db.get("SELECT code, type, value, min_order, max_uses, expires_at, active FROM coupons WHERE code = ?", [code]);
  if (!current) return res.status(404).json({ error: "Kupon tidak ditemukan." });
  const body = req.body || {};
  const fields = {};
  for (const key of ["type", "value", "min_order", "max_uses", "expires_at"]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (Object.keys(fields).length === 0) {
    if (body.active === undefined) return res.status(400).json({ error: "Tidak ada field yang diubah." });
    await db.run("UPDATE coupons SET active = ? WHERE code = ?", [body.active ? 1 : 0, code]);
    return res.json({ coupon: await db.get(selectCoupon, [code]) });
  }
  const parsed = parseCoupon({ ...current, ...fields });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  await db.run(
    "UPDATE coupons SET type = ?, value = ?, min_order = ?, max_uses = ?, expires_at = ? WHERE code = ?",
    [c.type, c.value, c.min_order, c.max_uses, c.expires_at, code]
  );
  res.json({ coupon: await db.get(selectCoupon, [code]) });
});

app.delete("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const info = await db.run("DELETE FROM coupons WHERE code = ?", [code]);
  if (info.changes === 0) return res.status(404).json({ error: "Kupon tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Pengaturan toko & ongkir ---- */

app.get("/api/admin/settings", requireAdmin, async (req, res) => {
  res.json({ settings: await getSettings() });
});

app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const s = await getSettings();
  const out = {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  if (b.store_name !== undefined) {
    const name = String(b.store_name).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Nama toko tidak valid." });
    out.store_name = name;
  }
  if (b.store_lat !== undefined) {
    const lat = num(b.store_lat, Number(s.store_lat));
    if (Math.abs(lat) > 90) return res.status(400).json({ error: "Latitude toko tidak valid." });
    out.store_lat = String(lat);
  }
  if (b.store_lng !== undefined) {
    const lng = num(b.store_lng, Number(s.store_lng));
    if (Math.abs(lng) > 180) return res.status(400).json({ error: "Longitude toko tidak valid." });
    out.store_lng = String(lng);
  }
  if (b.shipping_tiers !== undefined) {
    const tiers = parseTiers(JSON.stringify(b.shipping_tiers));
    if (!tiers) return res.status(400).json({ error: "Tier ongkir tidak valid." });
    out.shipping_tiers = JSON.stringify(tiers);
  }
  if (b.free_shipping_min !== undefined) {
    const v = num(b.free_shipping_min, 0);
    if (v < 0 || v > 1000000000) return res.status(400).json({ error: "Minimal gratis ongkir tidak valid." });
    out.free_shipping_min = String(v);
  }
  if (b.max_shipping_km !== undefined) {
    const v = num(b.max_shipping_km, 0);
    if (v < 0 || v > 100000) return res.status(400).json({ error: "Radius pengiriman tidak valid." });
    out.max_shipping_km = String(v);
  }
  if (b.wa_number !== undefined) {
    const wa = String(b.wa_number).replace(/[^\d]/g, "").slice(0, 20);
    out.wa_number = wa;
  }
  if (b.payment_flow !== undefined) {
    out.payment_flow = b.payment_flow ? "1" : "0";
  }
  if (Object.keys(out).length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });

  for (const [k, v] of Object.entries(out)) {
    await db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, v]);
  }
  invalidateSettingsCache();
  res.json({ settings: await getSettings() });
});

/* ---- Flash Sale ---- */

const selectFlashSales = "SELECT id, name, discount_percent, starts_at, ends_at, active, created_at FROM flash_sales ORDER BY id DESC";

app.get("/api/admin/flash-sales", requireAdmin, async (req, res) => {
  const flashSales = await db.all(selectFlashSales);
  res.json({ flashSales });
});

const parseFlashSale = (body, current) => {
  const out = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return { error: "Nama flash sale tidak valid." };
    out.name = name;
  }
  if (body.discount_percent !== undefined) {
    const pct = Number.parseInt(body.discount_percent, 10);
    if (!Number.isInteger(pct) || pct < 1 || pct > 90) return { error: "Diskon harus 1-90%." };
    out.discount_percent = pct;
  }
  if (body.starts_at !== undefined || body.ends_at !== undefined) {
    const starts = body.starts_at !== undefined ? String(body.starts_at).trim() : current.starts_at;
    const ends = body.ends_at !== undefined ? String(body.ends_at).trim() : current.ends_at;
    const re = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
    if (!re.test(starts) || !re.test(ends)) {
      return { error: "Format waktu salah (YYYY-MM-DD HH:MM)." };
    }
    out.starts_at = starts.replace("T", " ") + (starts.length === 16 ? ":00" : "");
    out.ends_at = ends.replace("T", " ") + (ends.length === 16 ? ":00" : "");
    if (out.ends_at <= out.starts_at) return { error: "Waktu selesai harus setelah waktu mulai." };
  }
  return { value: out };
};

app.post("/api/admin/flash-sales", requireAdmin, async (req, res) => {
  const parsed = parseFlashSale(req.body || {}, {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const f = parsed.value;
  if (!f.name || !f.discount_percent || !f.starts_at || !f.ends_at) {
    return res.status(400).json({ error: "Lengkapi nama, diskon, waktu mulai & selesai." });
  }
  await db.run(
    "INSERT INTO flash_sales (name, discount_percent, starts_at, ends_at) VALUES (?, ?, ?, ?)",
    [f.name, f.discount_percent, f.starts_at, f.ends_at]
  );
  const flashSale = await db.get(selectFlashSales + " LIMIT 1");
  res.status(201).json({ flashSale });
});

app.patch("/api/admin/flash-sales/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = await db.get("SELECT * FROM flash_sales WHERE id = ?", [id]);
  if (!current) return res.status(404).json({ error: "Flash sale tidak ditemukan." });
  const b = req.body || {};
  if (b.active !== undefined && Object.keys(b).length === 1) {
    await db.run("UPDATE flash_sales SET active = ? WHERE id = ?", [b.active ? 1 : 0, id]);
    return res.json({ flashSale: await db.get(selectFlashSales + " LIMIT 1") });
  }
  const parsed = parseFlashSale(b, current);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const f = parsed.value;
  const sets = [];
  const vals = [];
  for (const k of ["name", "discount_percent", "starts_at", "ends_at"]) {
    if (f[k] !== undefined) { sets.push(`${k} = ?`); vals.push(f[k]); }
  }
  if (sets.length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });
  await db.run(`UPDATE flash_sales SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  res.json({ flashSale: await db.get(selectFlashSales + " LIMIT 1") });
});

app.delete("/api/admin/flash-sales/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = await db.run("DELETE FROM flash_sales WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Flash sale tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Referral ---- */

const selectReferrals = "SELECT code, owner_name, owner_email, max_uses, used_count, active, created_at FROM referrals ORDER BY created_at DESC, code";

app.get("/api/admin/referrals", requireAdmin, async (req, res) => {
  const referrals = await db.all(selectReferrals);
  res.json({ referrals });
});

app.post("/api/admin/referrals", requireAdmin, async (req, res) => {
  const owner_name = String(req.body.owner_name || "").trim();
  const owner_email = String(req.body.owner_email || "").trim().toLowerCase();
  const max_uses = Number.parseInt(req.body.max_uses, 10);
  if (!owner_name || owner_name.length > 80) return res.status(400).json({ error: "Nama pemilik tidak valid." });
  if (!validEmail(owner_email)) return res.status(400).json({ error: "Email pemilik tidak valid." });
  if (!Number.isInteger(max_uses) || max_uses < 1 || max_uses > 100000) {
    return res.status(400).json({ error: "Kuota pemakaian tidak valid." });
  }
  let code = String(req.body.code || "").trim().toUpperCase();
  if (!code) {
    code = "REF-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  }
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    return res.status(400).json({ error: "Kode tidak valid (3-30 karakter: huruf, angka, minus, garis bawah)." });
  }
  try {
    await db.run(
      "INSERT INTO referrals (code, owner_name, owner_email, max_uses) VALUES (?, ?, ?, ?)",
      [code, owner_name, owner_email, max_uses]
    );
  } catch (err) {
    if (err.message && (err.message.includes("UNIQUE constraint failed") || err.message.includes("PRIMARY KEY") || err.message.includes("SQLITE_CONSTRAINT"))) {
      return res.status(409).json({ error: "Kode referensi sudah ada." });
    }
    throw err;
  }
  const referral = await db.get(selectReferrals + " LIMIT 1");
  res.status(201).json({ referral });
});

app.patch("/api/admin/referrals/:code", requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const current = await db.get("SELECT * FROM referrals WHERE code = ?", [code]);
  if (!current) return res.status(404).json({ error: "Kode referensi tidak ditemukan." });
  const b = req.body || {};
  const sets = [];
  const vals = [];
  if (b.active !== undefined) { sets.push("active = ?"); vals.push(b.active ? 1 : 0); }
  if (b.max_uses !== undefined) {
    const m = Number.parseInt(b.max_uses, 10);
    if (!Number.isInteger(m) || m < 1 || m > 100000) return res.status(400).json({ error: "Kuota tidak valid." });
    sets.push("max_uses = ?"); vals.push(m);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });
  await db.run(`UPDATE referrals SET ${sets.join(", ")} WHERE code = ?`, [...vals, code]);
  res.json({ referral: await db.get(selectReferrals + " LIMIT 1") });
});

app.delete("/api/admin/referrals/:code", requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const info = await db.run("DELETE FROM referrals WHERE code = ?", [code]);
  if (info.changes === 0) return res.status(404).json({ error: "Kode referensi tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Restock Waitlist ---- */

app.get("/api/admin/restock-waitlist", requireAdmin, async (req, res) => {
  const rows = await db.all(
    "SELECT w.id, w.product_id, w.email, w.notified, w.created_at, p.name AS product_name " +
    "FROM restock_waitlist w JOIN products p ON p.id = w.product_id ORDER BY w.notified ASC, w.id DESC"
  );
  res.json({ waitlist: rows });
});

app.post("/api/admin/restock-waitlist/:id/notify", requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = await db.run("UPDATE restock_waitlist SET notified = 1 WHERE id = ? AND notified = 0", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Entri tidak ditemukan atau sudah dinotifikasi." });
  res.json({ ok: true });
});

app.post("/api/admin/restock-waitlist/notify-all", requireAdmin, async (req, res) => {
  const pending = await db.all(
    "SELECT w.id, w.email, w.product_id, p.name AS product_name FROM restock_waitlist w JOIN products p ON p.id = w.product_id WHERE w.notified = 0"
  );
  await db.run("UPDATE restock_waitlist SET notified = 1 WHERE notified = 0");
  res.json({ ok: true, count: pending.length, emails: pending.map((x) => `${x.email} (${x.product_name})`) });
});

app.get("/api/config", async (req, res) => {
  res.json(await publicConfig());
});

app.get("/api/admin/subscribers", requireAdmin, async (req, res) => {
  const rows = await db.all("SELECT email, created_at FROM subscribers ORDER BY id");
  res.json({ count: rows.length, emails: rows.map((r) => r.email) });
});

app.get("/api/admin/members", requireAdmin, async (req, res) => {
  const rows = await db.all(
    "SELECT m.email, m.name, m.points, m.birth_month, m.birth_day, m.created_at, " +
    "(SELECT COUNT(*) FROM orders o WHERE o.email = m.email AND o.status != 'cancelled') AS orders " +
    "FROM members m ORDER BY m.points DESC"
  );
  res.json({ members: rows.map((m) => ({ ...m, level: memberLevel(m.points).level })) });
});

const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

app.get("/sitemap.xml", async (req, res) => {
  const products = await db.all("SELECT id, name FROM products ORDER BY id");
  const url = (loc, lastmod) =>
    `  <url><loc>${baseUrl}${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    url("/", today) + "\n" +
    products.map((p) => url(`/produk/${p.id}`, today)).join("\n") + "\n" +
    "</urlset>";
  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

app.get("/feed.xml", async (req, res) => {
  const products = await db.all("SELECT id, name, tag, price, created_at FROM products ORDER BY id");
  const items = products.map((p) =>
    "  <item>\n" +
    `    <title>${p.name.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>\n` +
    `    <link>${baseUrl}/produk/${p.id}</link>\n` +
    `    <guid>${baseUrl}/produk/${p.id}</guid>\n` +
    `    <description>${(p.tag || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")} — Rp ${p.price.toLocaleString("id-ID")}</description>\n` +
    `    <pubDate>${new Date(p.created_at.replace(" ", "T")).toUTCString()}</pubDate>\n` +
    "  </item>"
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n` +
    `  <title>KICKSTORM — Koleksi Terbaru</title>\n` +
    `  <link>${baseUrl}</link>\n` +
    `  <description>Sneaker premium edisi terbatas dari Jakarta.</description>\n` +
    items + "\n</channel>\n</rss>";
  res.setHeader("Content-Type", "application/rss+xml");
  res.send(xml);
});

app.get("/api/health", async (req, res) => {
  const uptime = process.uptime();
  const hrs = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const secs = Math.round(uptime % 60);
  const uptimeStr = `${hrs > 0 ? hrs + " jam " : ""}${mins > 0 ? mins + " menit " : ""}${secs} detik`;
  const dbRow = await db.get("SELECT COUNT(*) AS n FROM products");
  res.json({
    status: "ok",
    uptime: uptimeStr,
    db: "connected",
    products: dbRow?.n || 0,
    timestamp: new Date().toISOString()
  });
});

app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan." }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan server." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KICKSTORM berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
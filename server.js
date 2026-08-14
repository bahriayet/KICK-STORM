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

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

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
    const t = JSON.parse(json);
    if (!Array.isArray(t) || t.length === 0) return null;
    const out = t.map((x) => ({ max: Number(x.max), cost: Number(x.cost) }));
    if (out.some((x) => !Number.isFinite(x.max) || !Number.isFinite(x.cost) || x.max < 0 || x.cost < 0)) return null;
    out.sort((a, b) => a.max - b.max);
    return out;
  } catch (err) {
    return null;
  }
}

function calcShipping(distKm, subtotal, tiers) {
  const s = getSettings();
  const tierList = tiers || parseTiers(s.shipping_tiers) || [{ max: 9999, cost: 15000 }];
  const freeMin = Math.max(0, Number(s.free_shipping_min) || 0);
  if (freeMin > 0 && subtotal >= freeMin) return { cost: 0, free: true };
  const tier = tierList.find((t) => distKm <= t.max) || tierList[tierList.length - 1];
  return { cost: tier ? Math.max(0, tier.cost) : 0, free: false };
}

function getCouriers() {
  return db.prepare("SELECT id, name, tiers, cod_km, active FROM couriers ORDER BY id").all()
    .map((c) => ({ ...c, tiers: parseTiers(c.tiers) || [] }));
}

function getNextDrop() {
  return db.prepare(
    "SELECT d.id, d.name, d.product_id, d.release_at, d.queue_enabled, p.name AS product_name " +
    "FROM drops d LEFT JOIN products p ON p.id = d.product_id ORDER BY d.release_at ASC LIMIT 1"
  ).get() || null;
}

function getActiveFlashSale() {
  const now = nowStr();
  return db.prepare(
    "SELECT id, name, discount_percent FROM flash_sales WHERE active = 1 AND starts_at <= ? AND ends_at > ? ORDER BY id DESC LIMIT 1"
  ).get(now, now);
}

function evaluateReferral(code, subtotal) {
  const row = db.prepare(
    "SELECT code, owner_name, owner_email, max_uses, used_count, active FROM referrals WHERE code = ?"
  ).get(String(code).trim().toUpperCase());
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

function publicConfig() {
  const s = getSettings();
  const flash = getActiveFlashSale();
  const drop = getNextDrop();
  const couriers = getCouriers();
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
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (filePath.includes(path.sep + "vendor" + path.sep)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (/\.(css|js|svg|png|jpg|webp|woff2)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }
  }
}));

app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));
app.use("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const purgeExpiredTokens = db.prepare("DELETE FROM admin_tokens WHERE expires_at <= datetime('now')");
const findToken = db.prepare("SELECT token_hash FROM admin_tokens WHERE token_hash = ? AND expires_at > datetime('now')");
const insertToken = db.prepare("INSERT INTO admin_tokens (token_hash, created_at, expires_at) VALUES (?, datetime('now'), datetime('now', ?))");
const deleteToken = db.prepare("DELETE FROM admin_tokens WHERE token_hash = ?");

function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query.token || "");
  if (!token || !findToken.get(hashToken(token))) {
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

function evaluateCoupon(code, subtotal) {
  const coupon = db.prepare(
    "SELECT code, type, value, min_order, max_uses, used_count, expires_at, active FROM coupons WHERE code = ?"
  ).get(code);
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

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT id, name, tag, badge, price, variant, stock, sold FROM products ORDER BY id").all();
  const sold7 = db.prepare(
    "SELECT oi.product_id, SUM(oi.qty) AS qty FROM order_items oi " +
    "JOIN orders o ON o.id = oi.order_id " +
    "WHERE o.status != 'cancelled' AND oi.product_id IS NOT NULL AND o.created_at >= datetime('now', '-7 days') " +
    "GROUP BY oi.product_id"
  ).all();
  const rateBy = {};
  for (const r of sold7) rateBy[r.product_id] = r.qty / 7;
  const out = rows.map((p) => {
    const rate = rateBy[p.id] || 0;
    const etaHours = rate > 0.001 && p.stock > 0 ? Math.max(1, Math.round((p.stock / rate) * 24)) : null;
    return { ...p, eta_hours: etaHours };
  });
  res.json({ products: out });
});

app.get("/api/stats", (req, res) => {
  const sold = db.prepare("SELECT COALESCE(SUM(sold), 0) AS total FROM products").get();
  const subscribers = db.prepare("SELECT COUNT(*) AS n FROM subscribers").get();
  const products = db.prepare("SELECT COUNT(*) AS n FROM products").get();
  const lowStock = db.prepare("SELECT COUNT(*) AS n FROM products WHERE stock <= 30").get();
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
  const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status != 'cancelled'").get();
  const delivered = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered'").get().n;
  const cancelled = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled'").get().n;
  const done = delivered + cancelled;
  const rated = done > 0 ? Number(((5 * delivered + cancelled) / done).toFixed(1)) : 4.9;
  const shipRow = db.prepare(
    "SELECT AVG((julianday('now') - julianday(created_at)) * 24) AS hours FROM orders WHERE status IN ('shipped', 'delivered')"
  ).get();
  const shipHours = shipRow.hours ? Math.max(1, Math.round(shipRow.hours)) : 24;
  res.json({
    sold: sold.total,
    subscribers: subscribers.n,
    products: products.n,
    orders: orders.n,
    revenue: revenue.n,
    rating: rated,
    shippingHours: shipHours,
    lowStock: lowStock.n
  });
});

app.post("/api/subscribers", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || !validEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid." });
  }
  try {
    const result = db.prepare("INSERT INTO subscribers (email) VALUES (?)").run(email);
    res.status(201).json({ id: result.lastInsertRowid, message: "Berhasil bergabung ke Storm Club." });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
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

app.post("/api/orders", (req, res) => {
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

  const getProduct = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ?");
  const checkStock = db.prepare("SELECT stock FROM products WHERE id = ?");
  const decStock = db.prepare("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?");
  const insertOrder = db.prepare("INSERT INTO orders (customer_name, email, address, lat, lng, total, discount, coupon_code, referral_code, flash_sale_id, shipping, notes, status, maps_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertItem = db.prepare("INSERT INTO order_items (order_id, product_id, product_name, price, qty, size, colorway) VALUES (?, ?, ?, ?, ?, ?, ?)");

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
    const product = getProduct.get(id);
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
    const current = checkStock.get(id).stock;
    if (current < qty) {
      return res.status(409).json({ error: `Stok "${product.name}" hanya tersisa ${current} pasang.` });
    }
    cart.push({ product, qty, size });
  }

  const subtotal = cart.reduce((sum, c) => sum + (c.custom ? c.price : c.product.price) * c.qty, 0);

  const flash = getActiveFlashSale();
  const flashDiscount = flash ? Math.min(Math.round((subtotal * flash.discount_percent) / 100), subtotal) : 0;

  const rawCoupon = String(req.body.coupon || "").trim().toUpperCase();
  let couponLine = null;
  if (rawCoupon) {
    couponLine = evaluateCoupon(rawCoupon, subtotal);
    if (couponLine.error) return res.status(400).json({ error: couponLine.error });
  }
  const discount = couponLine ? couponLine.discount : 0;

  let referralLine = null;
  const rawReferral = String(req.body.referral || "").trim().toUpperCase();
  if (rawReferral && !couponLine) {
    referralLine = evaluateReferral(rawReferral, subtotal);
    if (referralLine.error) return res.status(400).json({ error: referralLine.error });
  }
  const referralDiscount = referralLine ? referralLine.discount : 0;

  const s = getSettings();
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

  const couriers = getCouriers();
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

  const drop = getNextDrop();
  let dropId = null;
  let queueNo = null;
  if (drop && drop.queue_enabled === 1) {
    if (drop.release_at > nowStr()) {
      return res.status(403).json({
        error: `Drop "${drop.name}" belum dibuka — pesanan dibuka saat rilis (${drop.release_at}). Pantau hitung mundurnya!`
      });
    }
    dropId = drop.id;
    queueNo = (db.prepare("SELECT COALESCE(MAX(queue_no), 0) AS n FROM orders WHERE drop_id = ?").get(drop.id).n || 0) + 1;
  }

  const shippingInfo = calcShipping(distKm, subtotal, courierTiers);
  const shipping = shippingInfo.cost;

  const total = Math.max(0, subtotal - flashDiscount - discount - referralDiscount + shipping);

  const paymentFlow = String(s.payment_flow || "0") === "1";
  const orderStatus = paymentFlow && paymentMethod === "transfer" ? "awaiting_payment" : "pending";

  const tx = db.transaction(() => {
    const orderId = insertOrder.run(
      customerName, customerEmail, customerAddress, lat, lng, total, discount,
      couponLine ? couponLine.coupon.code : null,
      referralLine ? referralLine.referral.code : null,
      flash ? flash.id : null,
      shipping,
      String(notes || ""),
      orderStatus,
      mapsUrl || null
    ).lastInsertRowid;
    db.prepare("UPDATE orders SET payment_method = ?, courier_id = ?, courier_name = ?, drop_id = ?, queue_no = ? WHERE id = ?")
      .run(paymentMethod, courier ? courier.id : null, courier ? courier.name : null, dropId, queueNo, orderId);
    db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status) VALUES (?, 'created', ?)").run(orderId, orderStatus);
    if (couponLine) {
      db.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?").run(couponLine.coupon.code);
    }
    if (referralLine) {
      db.prepare("UPDATE referrals SET used_count = used_count + 1 WHERE code = ?").run(referralLine.referral.code);
    }
    for (const c of cart) {
      insertItem.run(orderId, c.custom ? null : c.product.id, c.custom ? c.name : c.product.name, c.custom ? c.price : c.product.price, c.qty, c.size, c.custom ? c.colorway : null);
      if (!c.custom) decStock.run(c.qty, c.qty, c.product.id);
    }
    const points = pointsForOrder(total);
    if (points > 0) {
      db.prepare(
        "INSERT INTO members (email, name, points) VALUES (?, ?, ?) " +
        "ON CONFLICT(email) DO UPDATE SET points = points + excluded.points, name = excluded.name"
      ).run(customerEmail, customerName, points);
    }
    return orderId;
  });

  const orderId = tx();
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

app.get("/api/coupons", (req, res) => {
  const coupons = db.prepare(
    "SELECT code, type, value, min_order FROM coupons " +
    "WHERE active = 1 AND (expires_at IS NULL OR expires_at >= date('now')) " +
    "AND (max_uses = 0 OR used_count < max_uses) ORDER BY min_order ASC, code"
  ).all();
  res.json({ coupons });
});

app.post("/api/coupons/check", (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const subtotal = Number.parseInt(req.body.subtotal, 10);
  if (!code) return res.status(400).json({ error: "Masukkan kode voucher." });
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    return res.status(400).json({ error: "Subtotal tidak valid." });
  }
  const result = evaluateCoupon(code, subtotal);
  if (result.error) return res.status(404).json({ error: result.error });
  res.json({ valid: true, code: result.coupon.code, discount: result.discount });
});

app.get("/api/flash-sale", (req, res) => {
  const flash = getActiveFlashSale();
  res.json({ flashSale: flash ? { name: flash.name, percent: flash.discount_percent } : null });
});

app.post("/api/referrals/check", (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const subtotal = Number.parseInt(req.body.subtotal, 10);
  if (!code) return res.status(400).json({ error: "Masukkan kode referensi." });
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    return res.status(400).json({ error: "Subtotal tidak valid." });
  }
  const result = evaluateReferral(code, subtotal);
  if (result.error) return res.status(404).json({ error: result.error });
  res.json({ valid: true, code: result.referral.code, discount: result.discount, owner_name: result.referral.owner_name });
});

app.post("/api/restock-notify", (req, res) => {
  const productId = Number.parseInt(req.body.productId, 10);
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ error: "Produk tidak valid." });
  }
  if (!email || !validEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid." });
  }
  const product = db.prepare("SELECT id, name FROM products WHERE id = ?").get(productId);
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  try {
    const result = db.prepare("INSERT INTO restock_waitlist (product_id, email) VALUES (?, ?)").run(productId, email);
    res.status(201).json({ id: result.lastInsertRowid, message: `Kami kabari kamu saat "${product.name}" restock.` });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Kamu sudah terdaftar untuk produk ini." });
    }
    throw err;
  }
});

app.get("/courier", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "courier.html"));
});

app.get("/api/track", (req, res) => {
  const orderId = Number.parseInt(req.query.orderId, 10);
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!Number.isInteger(orderId) || orderId < 1 || !validEmail(email)) {
    return res.status(400).json({ error: "Lengkapi nomor pesanan dan email yang valid." });
  }
  const order = db.prepare("SELECT id, customer_name, total, discount, coupon_code, referral_code, flash_sale_id, shipping, status, tracking_number, notes, created_at, payment_method, payment_proof, payment_note, paid_at, courier_name, courier_lat, courier_lng, courier_share_url, courier_updated_at, maps_url, address, lat, lng, queue_no FROM orders WHERE id = ? AND email = ?")
    .get(orderId, email);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  const items = db.prepare("SELECT product_id, product_name, price, qty, size, colorway FROM order_items WHERE order_id = ?").all(orderId);
  const history = db.prepare("SELECT from_status, to_status, changed_at FROM order_status_log WHERE order_id = ? ORDER BY id").all(orderId);
  res.json({ order: { ...order, items, history } });
});

/* ---- Courier Portal API (Gratis Google Maps + Live GPS) ---- */

app.get("/api/courier/orders", (req, res) => {
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
  const orders = db.prepare(query).all(...params);
  const itemRows = db.prepare("SELECT order_id, product_name, price, qty, size, colorway FROM order_items").all();
  const byOrder = {};
  for (const it of itemRows) (byOrder[it.order_id] ||= []).push(it);
  res.json({ orders: orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })) });
});

app.post("/api/courier/orders/:id/status", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const targetStatus = String(req.body.status || "").trim();
  const courierName = String(req.body.courier_name || "").trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!["shipped", "delivered"].includes(targetStatus)) {
    return res.status(400).json({ error: "Status kurir hanya boleh 'shipped' atau 'delivered'." });
  }
  const order = db.prepare("SELECT id, status, courier_name, customer_name, total, payment_method FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

  const tx = db.transaction(() => {
    if (courierName) {
      db.prepare("UPDATE orders SET status = ?, courier_name = ? WHERE id = ?").run(targetStatus, courierName, id);
    } else {
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(targetStatus, id);
    }
    db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)").run(id, order.status, targetStatus, courierName || "Kurir");
  });
  tx();
  broadcastOrder({ id, status: targetStatus, customer_name: order.customer_name, total: order.total, payment_method: order.payment_method });
  res.json({ ok: true, id, status: targetStatus, message: targetStatus === "delivered" ? "Pesanan berhasil diselesaikan!" : "Pengantaran dimulai!" });
});

app.post("/api/courier/orders/:id/location", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Koordinat lokasi tidak valid." });
  }
  const now = nowStr();
  db.prepare("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE id = ?").run(lat, lng, now, id);
  res.json({ ok: true, id, lat, lng, updated_at: now });
});

app.post("/api/courier/orders/:id/share-link", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const shareUrl = String(req.body.share_url || "").trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!shareUrl) return res.status(400).json({ error: "Link Google Maps Location Sharing wajib diisi." });
  db.prepare("UPDATE orders SET courier_share_url = ?, courier_updated_at = datetime('now') WHERE id = ?").run(shareUrl, id);
  res.json({ ok: true, id, share_url: shareUrl });
});

app.post("/api/courier/sync-location", (req, res) => {
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
      db.prepare("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE courier_id = ? AND status = 'shipped'").run(lat, lng, now, courierId);
    }
    if (shareUrl) {
      db.prepare("UPDATE orders SET courier_share_url = ?, courier_updated_at = ? WHERE courier_id = ? AND status = 'shipped'").run(shareUrl, now, courierId);
    }
  } else {
    if (lat !== null && lng !== null) {
      db.prepare("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = ? WHERE status = 'shipped'").run(lat, lng, now);
    }
    if (shareUrl) {
      db.prepare("UPDATE orders SET courier_share_url = ?, courier_updated_at = ? WHERE status = 'shipped'").run(shareUrl, now);
    }
  }
  res.json({ ok: true, lat, lng, share_url: shareUrl, updated_at: now });
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!safeEqual(password || "", ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Password salah." });
  }
  purgeExpiredTokens.run();
  const token = crypto.randomBytes(32).toString("hex");
  insertToken.run(hashToken(token), `+${ADMIN_TOKEN_TTL_HOURS} hours`);
  res.json({ token, ttlHours: ADMIN_TOKEN_TTL_HOURS, expiresAt: new Date(Date.now() + ADMIN_TOKEN_TTL_HOURS * 3600000).toISOString() });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  deleteToken.run(hashToken(token));
  res.json({ ok: true });
});

app.post("/api/admin/logout-all", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM admin_tokens").run();
  res.json({ ok: true, message: "Semua sesi admin diakhiri." });
});

app.get("/api/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(
    "SELECT o.id, o.customer_name, o.email, o.address, o.maps_url, o.lat, o.lng, o.total, o.discount, o.coupon_code, o.referral_code, o.flash_sale_id, o.shipping, o.status, o.tracking_number, o.notes, o.created_at, o.payment_method, o.payment_proof, o.payment_note, o.paid_at, o.courier_id, o.courier_name, o.courier_lat, o.courier_lng, o.courier_share_url, o.courier_updated_at, o.queue_no, o.drop_id FROM orders o ORDER BY o.id DESC"
  ).all();
  const itemRows = db.prepare("SELECT order_id, product_name, price, qty, size, colorway FROM order_items").all();
  const byOrder = {};
  for (const it of itemRows) (byOrder[it.order_id] ||= []).push(it);
  const logRows = db.prepare("SELECT order_id, from_status, to_status, changed_at FROM order_status_log ORDER BY id").all();
  const logByOrder = {};
  for (const l of logRows) (logByOrder[l.order_id] ||= []).push({ from_status: l.from_status, to_status: l.to_status, changed_at: l.changed_at });
  res.json({ orders: orders.map((o) => ({ ...o, items: byOrder[o.id] || [], history: logByOrder[o.id] || [] })) });
});

app.get("/api/orders/export", requireAdmin, (req, res) => {
  const orders = db.prepare(
    "SELECT o.id, o.customer_name, o.email, o.address, o.lat, o.lng, o.total, o.discount, o.coupon_code, o.referral_code, o.flash_sale_id, o.shipping, o.status, o.tracking_number, o.notes, o.payment_method, o.courier_name, o.queue_no, o.paid_at FROM orders o ORDER BY o.id"
  ).all();
  const itemRows = db.prepare("SELECT order_id, product_name, price, qty, size, colorway FROM order_items").all();
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

app.get("/api/admin/sales", requireAdmin, (req, res) => {
  const DAYS = 14;
  const rows = db.prepare(
    "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders " +
    "FROM orders WHERE status != 'cancelled' AND created_at >= date('now', '-13 days') GROUP BY day"
  ).all();
  const byDay = new Map(rows.map((r) => [r.day, { revenue: r.revenue, orders: r.orders }]));
  const points = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDay.get(day);
    points.push({ day, revenue: hit ? hit.revenue : 0, orders: hit ? hit.orders : 0 });
  }
  res.json({ days: DAYS, points });
});

app.get("/api/admin/top-products", requireAdmin, (req, res) => {
  const DAYS = 14;
  const rows = db.prepare(
    "SELECT oi.product_id, oi.product_name, SUM(oi.price * oi.qty) AS revenue " +
    "FROM order_items oi " +
    "JOIN orders o ON o.id = oi.order_id " +
    "WHERE o.status != 'cancelled' AND oi.product_id IS NOT NULL AND o.created_at >= date('now', '-13 days') " +
    "GROUP BY oi.product_id, oi.product_name " +
    "ORDER BY revenue DESC " +
    "LIMIT 5"
  ).all();
  res.json({ days: DAYS, topProducts: rows });
});

app.patch("/api/orders/:id/status", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "");
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "Status tidak valid." });

  const order = db.prepare("SELECT id, status, total FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  const from = order.status;
  if (from === status) return res.json({ id, status, note: "Status tidak berubah." });

  if (from !== "cancelled" && status !== "cancelled") {
    const allowed = NEXT_STATUS[from] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Tidak bisa memundurkan status pesanan." });
    }
  }

  const getItems = db.prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?");
  const adjustStock = db.prepare("UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?");
  const adjustStockBack = db.prepare("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?");

  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    for (const it of getItems.all(id)) {
      if (status === "cancelled") {
        adjustStock.run(it.qty, it.qty, it.product_id);
      } else if (from === "cancelled") {
        adjustStockBack.run(it.qty, it.qty, it.product_id);
      }
    }
    if (status === "cancelled") {
      const pts = pointsForOrder(order.total);
      if (pts > 0) {
        db.prepare("UPDATE members SET points = MAX(points - ?, 0) WHERE email = (SELECT email FROM orders WHERE id = ?)").run(pts, id);
      }
    }
    db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)")
      .run(id, from, status, "");
  });
  tx();

  const note = status === "cancelled"
    ? "Pesanan dibatalkan — stok dikembalikan."
    : (from === "cancelled" ? "Pesanan diaktifkan kembali — stok dikurangi." : "Status diperbarui.");
  res.json({ id, status, note });
});

app.put("/api/orders/:id/tracking", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const tracking = String(req.body.tracking || "").trim().slice(0, 60);
  const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "shipped" && order.status !== "delivered") {
    return res.status(400).json({ error: "Nomor resi hanya bisa diisi saat status Sedang Dikirim atau Selesai." });
  }
  db.prepare("UPDATE orders SET tracking_number = ? WHERE id = ?").run(tracking || null, id);
  res.json({ id, tracking: tracking || null });
});

/* ---- Alur pembayaran: bukti transfer + verifikasi ---- */

app.post("/api/orders/:id/payment-proof", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(id);
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
  db.prepare("UPDATE orders SET payment_proof = ?, payment_note = ? WHERE id = ?").run("/uploads/" + filename, note, id);
  res.json({ ok: true, proof: "/uploads/" + filename });
});

app.post("/api/admin/orders/:id/verify-payment", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "awaiting_payment") {
    return res.status(400).json({ error: "Hanya pesanan Menunggu Pembayaran yang bisa diverifikasi." });
  }
  db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(nowStr(), id);
  db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, 'awaiting_payment', 'paid', 'admin')")
    .run(id);
  res.json({ id, status: "paid", note: "Pembayaran diverifikasi — pesanan diproses." });
});

app.post("/api/admin/orders/:id/reject-payment", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const order = db.prepare("SELECT id, status, total FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.status !== "awaiting_payment") {
    return res.status(400).json({ error: "Hanya pesanan Menunggu Pembayaran yang bisa ditolak." });
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(id);
    const items = db.prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?").all(id);
    for (const it of items) {
      if (it.product_id) {
        db.prepare("UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?").run(it.qty, it.qty, it.product_id);
      }
    }
    const pts = pointsForOrder(order.total);
    if (pts > 0) {
      db.prepare("UPDATE members SET points = MAX(points - ?, 0) WHERE email = (SELECT email FROM orders WHERE id = ?)").run(pts, id);
    }
    db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, 'awaiting_payment', 'cancelled', 'admin')").run(id);
  });
  tx();
  res.json({ id, status: "cancelled", note: "Pembayaran ditolak — pesanan dibatalkan, stok dikembalikan." });
});

app.put("/api/admin/orders/:id/courier-location", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pesanan tidak valid." });
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Koordinat kurir tidak valid." });
  }
  const info = db.prepare("UPDATE orders SET courier_lat = ?, courier_lng = ? WHERE id = ?").run(lat, lng, id);
  if (info.changes === 0) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json({ id, courierLat: lat, courierLng: lng, note: "Posisi kurir diperbarui — pelanggan bisa melihatnya di halaman Lacak." });
});

/* ---- Member: poin, level, ulang tahun ---- */

app.get("/api/member", (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: "Email tidak valid." });
  const m = db.prepare("SELECT email, name, points, birth_month, birth_day FROM members WHERE email = ?").get(email);
  if (!m) return res.json({ member: null });
  const lv = memberLevel(m.points);
  const today = new Date();
  let birthdayCoupon = null;
  if (m.birth_month && m.birth_day && m.birth_month === today.getMonth() + 1 && m.birth_day === today.getDate()) {
    const code = "BDAY-" + crypto.createHash("sha1").update(email).digest("hex").slice(0, 8).toUpperCase();
    const expires = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    db.prepare(
      "INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at, active) VALUES (?, 'percent', 15, 0, 1, ?, 1) " +
      "ON CONFLICT(code) DO UPDATE SET expires_at = excluded.expires_at, active = 1, type = 'percent', value = 15, min_order = 0"
    ).run(code, expires);
    const c = db.prepare("SELECT code, used_count, max_uses FROM coupons WHERE code = ?").get(code);
    if (c.max_uses === 0 || c.used_count < c.max_uses) {
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

app.post("/api/member/birthday", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const birth = String(req.body.birth || "").trim();
  if (!validEmail(email)) return res.status(400).json({ error: "Email tidak valid." });
  const m = db.prepare("SELECT email FROM members WHERE email = ?").get(email);
  if (!m) return res.status(404).json({ error: "Email belum terdaftar sebagai member (buat pesanan dulu)." });
  const parts = birth.split("-");
  const month = Number.parseInt(parts[0], 10);
  const day = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return res.status(400).json({ error: "Tanggal lahir tidak valid (format MM-DD)." });
  }
  db.prepare("UPDATE members SET birth_month = ?, birth_day = ? WHERE email = ?").run(month, day, email);
  res.json({ ok: true, message: "Tanggal lahir tersimpan — kupon ulang tahun otomatis aktif setiap tahunnya." });
});

/* ---- Drop: countdown + antrian ---- */

app.get("/api/next-drop", (req, res) => {
  const drop = getNextDrop();
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

app.get("/api/admin/drops", requireAdmin, (req, res) => {
  res.json({ drops: db.prepare(selectDropsAll).all() });
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

app.post("/api/admin/drops", requireAdmin, (req, res) => {
  const parsed = parseDrop(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  const result = db.prepare("INSERT INTO drops (name, product_id, release_at, queue_enabled) VALUES (?, ?, ?, ?)")
    .run(d.name, d.product_id, d.release_at, d.queue_enabled);
  res.status(201).json({ drop: db.prepare(selectDrops).get(result.lastInsertRowid) });
});

app.patch("/api/admin/drops/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = db.prepare("SELECT * FROM drops WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Drop tidak ditemukan." });
  const parsed = parseDrop({ ...current, ...(req.body || {}) });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  db.prepare("UPDATE drops SET name = ?, product_id = ?, release_at = ?, queue_enabled = ? WHERE id = ?")
    .run(d.name, d.product_id, d.release_at, d.queue_enabled, id);
  res.json({ drop: db.prepare(selectDrops).get(id) });
});

app.delete("/api/admin/drops/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = db.prepare("DELETE FROM drops WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Drop tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Kurir: pilih kurir + COD ---- */

const selectCouriersAll = "SELECT id, name, tiers, cod_km, active, created_at FROM couriers ORDER BY id";
const selectCouriers = "SELECT id, name, tiers, cod_km, active, created_at FROM couriers WHERE id = ?";

app.get("/api/admin/couriers", requireAdmin, (req, res) => {
  res.json({ couriers: db.prepare(selectCouriersAll).all().map((c) => ({ ...c, tiers: parseTiers(c.tiers) || [] })) });
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

app.post("/api/admin/couriers", requireAdmin, (req, res) => {
  const parsed = parseCourier(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  const result = db.prepare("INSERT INTO couriers (name, tiers, cod_km) VALUES (?, ?, ?)")
    .run(c.name, JSON.stringify(c.tiers), c.cod_km);
  res.status(201).json({ courier: db.prepare(selectCouriers).get(result.lastInsertRowid) });
});

app.patch("/api/admin/couriers/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = db.prepare("SELECT * FROM couriers WHERE id = ?").get(id);
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
  db.prepare(`UPDATE couriers SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  res.json({ courier: db.prepare(selectCouriers).get(id) });
});

app.delete("/api/admin/couriers/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = db.prepare("DELETE FROM couriers WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Kurir tidak ditemukan." });
  res.json({ ok: true });
});

app.post("/api/products", requireAdmin, (req, res) => {
  const parsed = parseProduct(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const p = parsed.value;
  if (!p.name) return res.status(400).json({ error: "Nama produk wajib diisi." });
  const result = db.prepare(
    "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(p.name, p.tag ?? "", p.badge ?? "New", p.price ?? 0, p.variant ?? "mono", p.stock ?? 0, p.sold ?? 0);
  const row = db.prepare(
    "SELECT id, name, tag, badge, price, variant, stock, sold FROM products WHERE id = ?"
  ).get(result.lastInsertRowid);
  res.status(201).json({ product: row });
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID produk tidak valid." });
  const parsed = parseProduct(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const p = parsed.value;
  const keys = Object.keys(p);
  if (keys.length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah." });

  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const info = db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(...keys.map((k) => p[k]), id);
  if (info.changes === 0) return res.status(404).json({ error: "Produk tidak ditemukan." });
  const row = db.prepare(
    "SELECT id, name, tag, badge, price, variant, stock, sold FROM products WHERE id = ?"
  ).get(id);
  res.json({ product: row });
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID produk tidak valid." });
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(id);
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

app.get("/api/admin/coupons", requireAdmin, (req, res) => {
  res.json({ coupons: db.prepare(selectCoupons).all() });
});

app.post("/api/admin/coupons", requireAdmin, (req, res) => {
  const parsed = parseCoupon(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  try {
    db.prepare("INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(c.code, c.type, c.value, c.min_order, c.max_uses, c.expires_at);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return res.status(409).json({ error: "Kode voucher sudah ada." });
    }
    throw err;
  }
  res.status(201).json({ coupon: db.prepare(selectCoupon).get(c.code) });
});

app.put("/api/admin/coupons/:code", requireAdmin, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const current = db.prepare("SELECT code, type, value, min_order, max_uses, expires_at, active FROM coupons WHERE code = ?").get(code);
  if (!current) return res.status(404).json({ error: "Kupon tidak ditemukan." });
  const body = req.body || {};
  const fields = {};
  for (const key of ["type", "value", "min_order", "max_uses", "expires_at"]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (Object.keys(fields).length === 0) {
    if (body.active === undefined) return res.status(400).json({ error: "Tidak ada field yang diubah." });
    db.prepare("UPDATE coupons SET active = ? WHERE code = ?").run(body.active ? 1 : 0, code);
    return res.json({ coupon: db.prepare(selectCoupon).get(code) });
  }
  const parsed = parseCoupon({ ...current, ...fields });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  db.prepare("UPDATE coupons SET type = ?, value = ?, min_order = ?, max_uses = ?, expires_at = ? WHERE code = ?")
    .run(c.type, c.value, c.min_order, c.max_uses, c.expires_at, code);
  res.json({ coupon: db.prepare(selectCoupon).get(code) });
});

app.delete("/api/admin/coupons/:code", requireAdmin, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const info = db.prepare("DELETE FROM coupons WHERE code = ?").run(code);
  if (info.changes === 0) return res.status(404).json({ error: "Kupon tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Pengaturan toko & ongkir ---- */

app.get("/api/admin/settings", requireAdmin, (req, res) => {
  res.json({ settings: getSettings() });
});

app.patch("/api/admin/settings", requireAdmin, (req, res) => {
  const b = req.body || {};
  const s = getSettings();
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
  const update = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(out)) update.run(k, v);
  });
  tx();
  res.json({ settings: getSettings() });
});

/* ---- Flash Sale ---- */

const selectFlashSales = "SELECT id, name, discount_percent, starts_at, ends_at, active, created_at FROM flash_sales ORDER BY id DESC";

app.get("/api/admin/flash-sales", requireAdmin, (req, res) => {
  res.json({ flashSales: db.prepare(selectFlashSales).all() });
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

app.post("/api/admin/flash-sales", requireAdmin, (req, res) => {
  const parsed = parseFlashSale(req.body || {}, {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const f = parsed.value;
  if (!f.name || !f.discount_percent || !f.starts_at || !f.ends_at) {
    return res.status(400).json({ error: "Lengkapi nama, diskon, waktu mulai & selesai." });
  }
  const result = db.prepare(
    "INSERT INTO flash_sales (name, discount_percent, starts_at, ends_at) VALUES (?, ?, ?, ?)"
  ).run(f.name, f.discount_percent, f.starts_at, f.ends_at);
  res.status(201).json({ flashSale: db.prepare(selectFlashSales + " LIMIT 1").get() });
});

app.patch("/api/admin/flash-sales/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const current = db.prepare("SELECT * FROM flash_sales WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Flash sale tidak ditemukan." });
  const b = req.body || {};
  if (b.active !== undefined && Object.keys(b).length === 1) {
    db.prepare("UPDATE flash_sales SET active = ? WHERE id = ?").run(b.active ? 1 : 0, id);
    return res.json({ flashSale: db.prepare(selectFlashSales + " LIMIT 1").get() });
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
  db.prepare(`UPDATE flash_sales SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  res.json({ flashSale: db.prepare(selectFlashSales + " LIMIT 1").get() });
});

app.delete("/api/admin/flash-sales/:id", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = db.prepare("DELETE FROM flash_sales WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Flash sale tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Referral ---- */

const selectReferrals = "SELECT code, owner_name, owner_email, max_uses, used_count, active, created_at FROM referrals ORDER BY created_at DESC, code";

app.get("/api/admin/referrals", requireAdmin, (req, res) => {
  res.json({ referrals: db.prepare(selectReferrals).all() });
});

app.post("/api/admin/referrals", requireAdmin, (req, res) => {
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
    db.prepare("INSERT INTO referrals (code, owner_name, owner_email, max_uses) VALUES (?, ?, ?, ?)")
      .run(code, owner_name, owner_email, max_uses);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return res.status(409).json({ error: "Kode referensi sudah ada." });
    }
    throw err;
  }
  res.status(201).json({ referral: db.prepare(selectReferrals + " LIMIT 1").get() });
});

app.patch("/api/admin/referrals/:code", requireAdmin, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const current = db.prepare("SELECT * FROM referrals WHERE code = ?").get(code);
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
  db.prepare(`UPDATE referrals SET ${sets.join(", ")} WHERE code = ?`).run(...vals, code);
  res.json({ referral: db.prepare(selectReferrals + " LIMIT 1").get() });
});

app.delete("/api/admin/referrals/:code", requireAdmin, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const info = db.prepare("DELETE FROM referrals WHERE code = ?").run(code);
  if (info.changes === 0) return res.status(404).json({ error: "Kode referensi tidak ditemukan." });
  res.json({ ok: true });
});

/* ---- Restock Waitlist ---- */

app.get("/api/admin/restock-waitlist", requireAdmin, (req, res) => {
  const rows = db.prepare(
    "SELECT w.id, w.product_id, w.email, w.notified, w.created_at, p.name AS product_name " +
    "FROM restock_waitlist w JOIN products p ON p.id = w.product_id ORDER BY w.notified ASC, w.id DESC"
  ).all();
  res.json({ waitlist: rows });
});

app.post("/api/admin/restock-waitlist/:id/notify", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const info = db.prepare("UPDATE restock_waitlist SET notified = 1 WHERE id = ? AND notified = 0").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Entri tidak ditemukan atau sudah dinotifikasi." });
  res.json({ ok: true });
});

app.post("/api/admin/restock-waitlist/notify-all", requireAdmin, (req, res) => {
  const pending = db.prepare(
    "SELECT w.id, w.email, w.product_id, p.name AS product_name FROM restock_waitlist w JOIN products p ON p.id = w.product_id WHERE w.notified = 0"
  ).all();
  db.prepare("UPDATE restock_waitlist SET notified = 1 WHERE notified = 0").run();
  res.json({ ok: true, count: pending.length, emails: pending.map((x) => `${x.email} (${x.product_name})`) });
});

app.get("/api/config", (req, res) => {
  res.json(publicConfig());
});

app.get("/api/admin/subscribers", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT email, created_at FROM subscribers ORDER BY id").all();
  res.json({ count: rows.length, emails: rows.map((r) => r.email) });
});

app.get("/api/admin/members", requireAdmin, (req, res) => {
  const rows = db.prepare(
    "SELECT m.email, m.name, m.points, m.birth_month, m.birth_day, m.created_at, " +
    "(SELECT COUNT(*) FROM orders o WHERE o.email = m.email AND o.status != 'cancelled') AS orders " +
    "FROM members m ORDER BY m.points DESC"
  ).all();
  res.json({ members: rows.map((m) => ({ ...m, level: memberLevel(m.points).level })) });
});

const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

app.get("/sitemap.xml", (req, res) => {
  const products = db.prepare("SELECT id, name FROM products ORDER BY id").all();
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

app.get("/feed.xml", (req, res) => {
  const products = db.prepare("SELECT id, name, tag, price, created_at FROM products ORDER BY id").all();
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

app.get("/api/health", (req, res) => {
  const uptime = process.uptime();
  const hrs = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const secs = Math.round(uptime % 60);
  const uptimeStr = `${hrs > 0 ? hrs + " jam " : ""}${mins > 0 ? mins + " menit " : ""}${secs} detik`;
  const dbRow = db.prepare("SELECT COUNT(*) AS n FROM products").get();
  res.json({
    status: "ok",
    uptime: uptimeStr,
    db: "connected",
    products: dbRow.n,
    timestamp: new Date().toISOString()
  });
});

/* ---- Courier Portal & Live Navigation Endpoints ---- */

app.get("/courier", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "courier.html"));
});

app.get("/api/courier/orders", (req, res) => {
  const statusFilter = req.query.status;
  let sql = "SELECT id, customer_name, email, address, maps_url, lat, lng, total, status, notes, payment_method, courier_id, courier_name, courier_lat, courier_lng, courier_share_url, courier_updated_at, created_at FROM orders WHERE status != 'cancelled' ORDER BY id DESC LIMIT 50";
  if (statusFilter === "active") {
    sql = "SELECT id, customer_name, email, address, maps_url, lat, lng, total, status, notes, payment_method, courier_id, courier_name, courier_lat, courier_lng, courier_share_url, courier_updated_at, created_at FROM orders WHERE status IN ('paid', 'pending', 'awaiting_payment', 'shipped') ORDER BY id DESC LIMIT 50";
  }
  const orders = db.prepare(sql).all();
  const getItems = db.prepare("SELECT product_id, product_name, price, qty, size, colorway FROM order_items WHERE order_id = ?");
  const result = orders.map((o) => ({
    ...o,
    items: getItems.all(o.id)
  }));
  res.json({ orders: result });
});

app.post("/api/courier/orders/:id/status", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { status, courier_name } = req.body || {};
  if (!["shipped", "delivered"].includes(status)) {
    return res.status(400).json({ error: "Status kurir harus shipped (sedang diantar) atau delivered (selesai)." });
  }
  const order = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

  db.prepare("UPDATE orders SET status = ?, courier_name = COALESCE(?, courier_name), courier_updated_at = datetime('now') WHERE id = ?")
    .run(status, courier_name || null, id);
  db.prepare("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)")
    .run(id, order.status, status, courier_name || "Kurir");

  if (db.pushToTurso) {
    db.pushToTurso("UPDATE orders SET status = ?, courier_name = COALESCE(?, courier_name), courier_updated_at = datetime('now') WHERE id = ?", [status, courier_name || null, id]);
    db.pushToTurso("INSERT INTO order_status_log (order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)", [id, order.status, status, courier_name || "Kurir"]);
  }

  res.json({ ok: true, id, status, message: `Status pesanan #${id} berhasil diubah menjadi ${status === "shipped" ? "Sedang Diantar" : "Selesai"}.` });
});

app.post("/api/courier/sync-location", (req, res) => {
  const { lat, lng, share_url } = req.body || {};
  if (share_url !== undefined) {
    db.prepare("UPDATE orders SET courier_share_url = ?, courier_updated_at = datetime('now') WHERE status = 'shipped'")
      .run(String(share_url || "").trim());
    if (db.pushToTurso) {
      db.pushToTurso("UPDATE orders SET courier_share_url = ?, courier_updated_at = datetime('now') WHERE status = 'shipped'", [String(share_url || "").trim()]);
    }
  }
  if (lat !== undefined && lng !== undefined && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    db.prepare("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = datetime('now') WHERE status = 'shipped'")
      .run(Number(lat), Number(lng));
    if (db.pushToTurso) {
      db.pushToTurso("UPDATE orders SET courier_lat = ?, courier_lng = ?, courier_updated_at = datetime('now') WHERE status = 'shipped'", [Number(lat), Number(lng)]);
    }
  }
  res.json({ ok: true });
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
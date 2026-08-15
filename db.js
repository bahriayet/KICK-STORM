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

// -------------------------------------------------------------
// Supabase SQL Query Engine
// -------------------------------------------------------------

async function supabaseQuery(sql, args = [], isSingle = false) {
  const cleanSql = sql.trim().replace(/\s+/g, " ");

  // 1. SELECT COUNT(*) AS n FROM ...
  if (/^SELECT COUNT\(\*\)\s+AS\s+n\s+FROM/i.test(cleanSql)) {
    const m = cleanSql.match(/^SELECT COUNT\(\*\)\s+AS\s+n\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (m) {
      const table = m[1];
      const where = m[2];
      let q = supabase.from(table).select("*", { count: "exact", head: true });
      if (where) {
        if (/stock\s*<=\s*30/i.test(where)) q = q.lte("stock", 30);
        else if (/status\s*=\s*'delivered'/i.test(where)) q = q.eq("status", "delivered");
        else if (/status\s*=\s*'cancelled'/i.test(where)) q = q.eq("status", "cancelled");
        else if (/active\s*=\s*1/i.test(where)) q = q.eq("active", 1);
        else if (where.includes("?")) {
          const colMatch = where.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
          if (colMatch) q = q.eq(colMatch[1], args[0]);
        }
      }
      const { count } = await q;
      const res = { n: count || 0 };
      return isSingle ? res : [res];
    }
  }

  // 2. SELECT COALESCE(SUM(sold), 0) AS total FROM products
  if (/^SELECT COALESCE\(SUM\(sold\),\s*0\)\s+AS\s+total\s+FROM\s+products/i.test(cleanSql)) {
    const { data } = await supabase.from("products").select("sold");
    const total = (data || []).reduce((acc, row) => acc + (Number(row.sold) || 0), 0);
    const res = { total };
    return isSingle ? res : [res];
  }

  // 3. SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status != 'cancelled'
  if (/^SELECT COALESCE\(SUM\(total\),\s*0\)\s+AS\s+n\s+FROM\s+orders/i.test(cleanSql)) {
    const { data } = await supabase.from("orders").select("total").neq("status", "cancelled");
    const n = (data || []).reduce((acc, row) => acc + (Number(row.total) || 0), 0);
    const res = { n };
    return isSingle ? res : [res];
  }

  // 4. SELECT COALESCE(MAX(queue_no), 0) AS n FROM orders WHERE drop_id = ?
  if (/SELECT COALESCE\(MAX\(queue_no\),\s*0\)\s+AS\s+n\s+FROM\s+orders/i.test(cleanSql)) {
    const { data } = await supabase.from("orders").select("queue_no").eq("drop_id", args[0]).order("queue_no", { ascending: false }).limit(1);
    const maxQ = data && data.length > 0 ? Number(data[0].queue_no) || 0 : 0;
    const res = { n: maxQ };
    return isSingle ? res : [res];
  }

  // 5. SELECT AVG(...) FROM orders
  if (/^SELECT AVG\(/i.test(cleanSql)) {
    const { data } = await supabase.from("orders").select("created_at").in("status", ["shipped", "delivered"]);
    let hours = 24;
    if (data && data.length > 0) {
      const now = Date.now();
      const diffs = data.map((r) => Math.max(1, (now - new Date(r.created_at).getTime()) / 3600000));
      hours = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
    const res = { hours };
    return isSingle ? res : [res];
  }

  // 6. Products sold last 7 days: SELECT oi.product_id, SUM(oi.qty) AS qty FROM order_items ...
  if (/SELECT oi\.product_id,\s*SUM\(oi\.qty\)\s+AS\s+qty/i.test(cleanSql)) {
    const { data } = await supabase.from("order_items").select("product_id, qty, orders!inner(status, created_at)").neq("orders.status", "cancelled");
    const map = {};
    if (data) {
      for (const item of data) {
        if (item.product_id) {
          map[item.product_id] = (map[item.product_id] || 0) + (Number(item.qty) || 0);
        }
      }
    }
    const res = Object.entries(map).map(([product_id, qty]) => ({ product_id: Number(product_id), qty }));
    return isSingle ? res[0] || null : res;
  }

  // 7. Drops: SELECT d.id, d.name, d.product_id, ... FROM drops ...
  if (/^SELECT .*FROM drops/i.test(cleanSql)) {
    let q = supabase.from("drops").select("id, name, product_id, release_at, queue_enabled, created_at, products(name)").order("release_at", { ascending: true });
    if (/LIMIT 1/i.test(cleanSql)) q = q.limit(1);
    if (cleanSql.includes("WHERE d.id = ?")) q = q.eq("id", args[0]);
    const { data } = await q;
    const mapped = (data || []).map((d) => ({
      id: d.id,
      name: d.name,
      product_id: d.product_id,
      release_at: d.release_at,
      queue_enabled: d.queue_enabled,
      created_at: d.created_at,
      product_name: d.products ? d.products.name : null
    }));
    return isSingle ? (mapped[0] || null) : mapped;
  }

  // 7b. Members list with order count: SELECT ... FROM members m ...
  if (/FROM\s+members(?:\s+m)?/i.test(cleanSql)) {
    const { data: memberRows, error: mErr } = await supabase.from("members").select("*").order("points", { ascending: false });
    if (mErr) throw mErr;
    const { data: orderRows } = await supabase.from("orders").select("email, status").neq("status", "cancelled");
    const orderCountMap = {};
    if (orderRows) {
      for (const o of orderRows) {
        if (o.email) {
          const em = o.email.toLowerCase();
          orderCountMap[em] = (orderCountMap[em] || 0) + 1;
        }
      }
    }
    const result = (memberRows || []).map((m) => ({
      email: m.email,
      name: m.name || m.email.split("@")[0],
      points: Number(m.points) || 0,
      birth_month: m.birth_month,
      birth_day: m.birth_day,
      created_at: m.created_at,
      orders: orderCountMap[(m.email || "").toLowerCase()] || 0
    }));
    return isSingle ? (result[0] || null) : result;
  }

  // 8. General SELECT statements: SELECT ... FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT ...]
  if (/^SELECT\s+/i.test(cleanSql)) {
    const tableMatch = cleanSql.match(/FROM\s+([a-zA-Z0-9_]+)(?:\s+o\b|\s+p\b|\s+d\b|\s+c\b|\s+m\b)?/i);
    if (tableMatch) {
      const table = tableMatch[1];
      let q = supabase.from(table).select("*");

      // Filter WHERE
      if (/WHERE\s+/i.test(cleanSql)) {
        const wherePart = cleanSql.split(/WHERE\s+/i)[1].split(/ORDER\s+BY|GROUP\s+BY|LIMIT/i)[0];
        const conditions = wherePart.split(/\s+AND\s+/i);
        let argIdx = 0;
        for (const cond of conditions) {
          const colEq = cond.match(/(?:LOWER|UPPER)?\(?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\)?\s*=\s*(\?|'[^']*'|[0-9]+)/i);
          const colLte = cond.match(/(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*<=\s*(\?|'[^']*'|[0-9]+)/i);
          const colGt = cond.match(/(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*>\s*(\?|'[^']*'|[0-9]+)/i);
          const colNeq = cond.match(/(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*!=\s*(\?|'[^']*'|[0-9]+)/i);

          if (colEq) {
            const col = colEq[1];
            const val = colEq[2] === "?" ? args[argIdx++] : colEq[2].replace(/^'|'$/g, "");
            if ((col.toLowerCase() === "email" || col.toLowerCase() === "tracking_number") && typeof val === "string") {
              q = q.ilike(col, val.trim());
            } else {
              q = q.eq(col, val);
            }
          } else if (colLte) {
            const col = colLte[1];
            const val = colLte[2] === "?" ? args[argIdx++] : colLte[2].replace(/^'|'$/g, "");
            q = q.lte(col, val);
          } else if (colGt) {
            const col = colGt[1];
            const val = colGt[2] === "?" ? args[argIdx++] : colGt[2].replace(/^'|'$/g, "");
            q = q.gt(col, val);
          } else if (colNeq) {
            const col = colNeq[1];
            const val = colNeq[2] === "?" ? args[argIdx++] : colNeq[2].replace(/^'|'$/g, "");
            q = q.neq(col, val);
          }
        }
      }

      // ORDER BY
      if (/ORDER BY\s+/i.test(cleanSql)) {
        const orderPart = cleanSql.split(/ORDER BY\s+/i)[1].split(/LIMIT/i)[0].trim();
        const colMatch = orderPart.match(/(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?/i);
        if (colMatch) {
          const col = colMatch[1];
          const isAsc = !colMatch[2] || colMatch[2].toUpperCase() === "ASC";
          q = q.order(col, { ascending: isAsc });
        }
      }

      // LIMIT
      if (/LIMIT\s+([0-9]+|\?)/i.test(cleanSql)) {
        const lim = cleanSql.match(/LIMIT\s+([0-9]+)/i);
        if (lim) q = q.limit(Number(lim[1]));
        else q = q.limit(1);
      }

      const { data, error } = await q;
      if (error) throw error;
      if (isSingle) {
        return (data && data.length > 0) ? data[0] : null;
      }
      return data || [];
    }
  }

  // 9. INSERT INTO <table> (<cols>) VALUES (<vals>)
  if (/^INSERT INTO\s+/i.test(cleanSql)) {
    const tableMatch = cleanSql.match(/^INSERT INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (tableMatch) {
      const table = tableMatch[1];
      const cols = tableMatch[2].split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
      const valTokens = tableMatch[3].split(",").map((v) => v.trim());
      const row = {};
      let argIdx = 0;
      cols.forEach((col, i) => {
        const token = valTokens[i];
        if (token === "?") {
          row[col] = args[argIdx++];
        } else if (token && token.startsWith("'") && token.endsWith("'")) {
          row[col] = token.slice(1, -1);
        } else if (token && !isNaN(Number(token))) {
          row[col] = Number(token);
        } else {
          row[col] = args[argIdx++];
        }
      });

      // Special handling for members ON CONFLICT(email) DO UPDATE / DO NOTHING
      if (table === "members" && /ON CONFLICT/i.test(cleanSql)) {
        const { data: existing } = await supabase.from("members").select("points, name").eq("email", row.email).maybeSingle();
        if (existing) {
          if (/DO NOTHING/i.test(cleanSql)) {
            return { changes: 0 };
          }
          const newPoints = (Number(existing.points) || 0) + (Number(row.points) || 0);
          await supabase.from("members").update({ points: newPoints, name: row.name || existing.name }).eq("email", row.email);
          return { changes: 1 };
        } else {
          await supabase.from("members").insert(row);
          return { changes: 1 };
        }
      }

      // Special handling for settings ON CONFLICT(key)
      if (table === "settings" && /ON CONFLICT/i.test(cleanSql)) {
        const { error } = await supabase.from("settings").upsert(row);
        if (error) throw error;
        return { changes: 1 };
      }

      const { data, error } = await supabase.from(table).insert(row).select();
      if (error) throw error;
      const lastId = data && data[0] ? Number(data[0].id) : undefined;
      return { lastInsertRowid: lastId, changes: 1 };
    }
  }

  // 10. UPDATE <table> SET ... WHERE ...
  if (/^UPDATE\s+/i.test(cleanSql)) {
    const tableMatch = cleanSql.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+)\s+WHERE\s+(.+)$/i);
    if (tableMatch) {
      const table = tableMatch[1];
      const setPart = tableMatch[2];
      const wherePart = tableMatch[3];

      // Special handling for stock/sold adjustments: stock = stock - ?, sold = sold + ?
      if (/stock\s*=\s*stock\s*[-+]/i.test(setPart)) {
        const idMatch = wherePart.match(/id\s*=\s*(\?|[0-9]+)/i);
        let id = null;
        if (idMatch) {
          if (idMatch[1] === "?") {
            id = args[2] !== undefined ? args[2] : args[0];
          } else {
            id = Number(idMatch[1]);
          }
        }
        if (id) {
          const { data: p } = await supabase.from("products").select("stock, sold").eq("id", id).maybeSingle();
          if (p) {
            let newStock = Number(p.stock) || 0;
            let newSold = Number(p.sold) || 0;
            if (/stock\s*=\s*stock\s*-\s*\?/i.test(setPart)) {
              const reqQty = Number(args[0]);
              if (/stock\s*>=\s*\?/i.test(wherePart) && newStock < reqQty) {
                return { changes: 0 };
              }
              newStock = Math.max(0, newStock - reqQty);
              newSold += Number(args[1] || reqQty);
            } else if (/stock\s*=\s*stock\s*\+\s*\?/i.test(setPart)) {
              newStock += Number(args[0]);
              newSold = Math.max(0, newSold - Number(args[1] || args[0]));
            }
            await supabase.from("products").update({ stock: newStock, sold: newSold }).eq("id", id);
            return { changes: 1 };
          }
        }
        return { changes: 0 };
      }

      // Special handling for coupon used_count = used_count + 1
      if (table === "coupons" && /used_count\s*=\s*used_count\s*\+\s*1/i.test(setPart)) {
        const code = args[0];
        const { data: c } = await supabase.from("coupons").select("used_count, max_uses").eq("code", code).maybeSingle();
        if (c) {
          if (c.max_uses > 0 && (c.used_count || 0) >= c.max_uses) {
            return { changes: 0 };
          }
          await supabase.from("coupons").update({ used_count: (c.used_count || 0) + 1 }).eq("code", code);
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Special handling for referral used_count = used_count + 1
      if (table === "referrals" && /used_count\s*=\s*used_count\s*\+\s*1/i.test(setPart)) {
        const code = args[0];
        const { data: r } = await supabase.from("referrals").select("used_count, max_uses").eq("code", code).maybeSingle();
        if (r) {
          if (r.max_uses > 0 && (r.used_count || 0) >= r.max_uses) {
            return { changes: 0 };
          }
          await supabase.from("referrals").update({ used_count: (r.used_count || 0) + 1 }).eq("code", code);
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Special handling for referral used_count = used_count + 1
      if (table === "referrals" && /used_count\s*=\s*used_count\s*\+\s*1/i.test(setPart)) {
        const code = args[0];
        const { data: r } = await supabase.from("referrals").select("used_count").eq("code", code).maybeSingle();
        if (r) {
          await supabase.from("referrals").update({ used_count: (r.used_count || 0) + 1 }).eq("code", code);
          return { changes: 1 };
        }
      }

      // Standard UPDATE
      const setAssignments = setPart.split(",").map((s) => s.trim());
      const updates = {};
      let argIdx = 0;
      for (const assign of setAssignments) {
        const colMatch = assign.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
        if (colMatch) {
          updates[colMatch[1]] = args[argIdx++];
        }
      }

      let q = supabase.from(table).update(updates);
      const whereColMatch = wherePart.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
      if (whereColMatch) {
        q = q.eq(whereColMatch[1], args[argIdx++]);
      }
      const { error } = await q;
      if (error) throw error;
      return { changes: 1 };
    }
  }

  // 11. DELETE FROM <table> [WHERE ...]
  if (/^DELETE FROM\s+/i.test(cleanSql)) {
    const tableMatch = cleanSql.match(/^DELETE FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (tableMatch) {
      const table = tableMatch[1];
      const wherePart = tableMatch[2];
      let q = supabase.from(table).delete();
      if (wherePart) {
        const colEq = wherePart.match(/([a-zA-Z0-9_]+)\s*=\s*(\?|'[^']*'|[0-9]+)/i);
        const colLte = wherePart.match(/([a-zA-Z0-9_]+)\s*<=\s*(\?|'[^']*'|[0-9]+)/i);
        if (colEq) {
          const col = colEq[1];
          const val = colEq[2] === "?" ? args[0] : colEq[2].replace(/^'|'$/g, "");
          q = q.eq(col, val);
        } else if (colLte) {
          const col = colLte[1];
          const val = colLte[2] === "?" ? args[0] : colLte[2].replace(/^'|'$/g, "");
          q = q.lte(col, val);
        }
      } else {
        q = q.neq("id", -999999);
      }
      const { error } = await q;
      if (error) throw error;
      return { changes: 1 };
    }
  }

  console.warn("Unmatched query on Supabase fallback:", cleanSql);
  return isSingle ? null : [];
}

// Low-level SQL queries (used by LibSQL/SQLite fallback or mapped to Supabase)
async function all(sql, args = []) {
  if (isSupabase) {
    return await supabaseQuery(sql, args, false);
  }
  if (!libsqlClient) return [];
  const res = await libsqlClient.execute({ sql, args });
  return res.rows.map((row) => normalizeRow(row, res.columns));
}

async function get(sql, args = []) {
  if (isSupabase) {
    return await supabaseQuery(sql, args, true);
  }
  if (!libsqlClient) return null;
  const res = await libsqlClient.execute({ sql, args });
  if (!res.rows || res.rows.length === 0) return null;
  return normalizeRow(res.rows[0], res.columns);
}

async function run(sql, args = []) {
  if (isSupabase) {
    return await supabaseQuery(sql, args, true);
  }
  if (!libsqlClient) return { changes: 0 };
  const res = await libsqlClient.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
    changes: res.rowsAffected
  };
}

async function batch(stmts) {
  if (isSupabase) {
    const results = [];
    for (const s of stmts) {
      if (typeof s === "string") results.push(await run(s));
      else results.push(await run(s.sql, s.args || []));
    }
    return results;
  }
  if (!libsqlClient) return [];
  return await libsqlClient.batch(stmts, "write");
}

async function exec(sql) {
  if (isSupabase) return;
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
  close
};
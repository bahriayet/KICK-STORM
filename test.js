process.env.DB_PATH = require("path").join(require("os").tmpdir(), `kickstorm-test-${Date.now()}.db`);
process.env.ADMIN_PASSWORD = "kickstorm-admin";

const assert = require("assert");
const request = require("supertest");
const db = require("./db");
const app = require("./server");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  console.log("KICKSTORM API tests");

  await test("GET /api/products -> 6 seed products", async () => {
    const res = await request(app).get("/api/products").expect(200);
    assert.strictEqual(res.body.products.length, 6);
  });

  await test("GET /api/stats -> sold + participants", async () => {
    const res = await request(app).get("/api/stats").expect(200);
    assert.ok(res.body.sold > 10000);
    assert.ok(Number.isFinite(res.body.rating) && res.body.rating >= 0 && res.body.rating <= 5);
    assert.ok(Number.isInteger(res.body.revenue) && res.body.revenue >= 0);
    assert.ok(Number.isInteger(res.body.shippingHours) && res.body.shippingHours >= 1);
    assert.ok(Number.isInteger(res.body.orders) && res.body.orders >= 0);
  });

  await test("POST /api/subscribers valid -> 201", async () => {
    const res = await request(app).post("/api/subscribers").send({ email: "tes@kickstorm.id" }).expect(201);
    assert.ok(res.body.id > 0);
  });

  await test("POST /api/subscribers duplicate -> 409", async () => {
    await request(app).post("/api/subscribers").send({ email: "tes@kickstorm.id" }).expect(409);
  });

  await test("POST /api/subscribers invalid -> 400", async () => {
    await request(app).post("/api/subscribers").send({ email: "bukan-email" }).expect(400);
  });

  let orderId;
  await test("POST /api/orders valid -> 201 + stock decrement", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const p1 = before.body.products[0];
    const p2 = before.body.products[1];
    const res = await request(app).post("/api/orders").send({
      name: "Budi Santoso",
      email: "budi@kickstorm.id",
      address: "Jl. Badai No. 1, Jakarta",
      items: [{ id: p1.id, qty: 2 }, { id: p2.id, qty: 1 }]
    }).expect(201);
    orderId = res.body.orderId;
    assert.ok(res.body.total > 0);
    await request(app).get("/api/products").expect(200).then((r) => {
      const a = r.body.products.find((x) => x.id === p1.id);
      const b = r.body.products.find((x) => x.id === p2.id);
      assert.strictEqual(a.stock, p1.stock - 2);
      assert.strictEqual(a.sold, p1.sold + 2);
      assert.strictEqual(b.stock, p2.stock - 1);
    });
  });

  await test("POST /api/orders overstock -> 409", async () => {
    const before = await request(app).get("/api/products").expect(200);
    await request(app).post("/api/orders").send({
      name: "X", email: "x@x.id", address: "Jkt",
      items: [{ id: before.body.products[0].id, qty: 99 }]
    }).expect(409);
  });

  await test("POST /api/orders incomplete -> 400", async () => {
    await request(app).post("/api/orders").send({ name: "X" }).expect(400);
  });

  await test("GET /api/track ok -> 200 with items and email property", async () => {
    const res = await request(app)
      .get(`/api/track?orderId=${orderId}&email=budi@kickstorm.id`)
      .expect(200);
    assert.strictEqual(res.body.order.id, orderId);
    assert.strictEqual(res.body.order.email, "budi@kickstorm.id");
    assert.strictEqual(res.body.order.items.length, 2);
  });

  await test("GET /api/track dengan format # dan prefix -> 200", async () => {
    const resHash = await request(app)
      .get(`/api/track?orderId=%23${orderId}&email=budi@kickstorm.id`)
      .expect(200);
    assert.strictEqual(resHash.body.order.id, orderId);

    const resKs = await request(app)
      .get(`/api/track?orderId=KS-${orderId}&email=budi@kickstorm.id`)
      .expect(200);
    assert.strictEqual(resKs.body.order.id, orderId);
  });

  await test("GET /api/track email case-insensitive -> 200", async () => {
    const res = await request(app)
      .get(`/api/track?orderId=${orderId}&email=Budi@Kickstorm.ID`)
      .expect(200);
    assert.strictEqual(res.body.order.id, orderId);
  });

  await test("GET /api/track input email dan ID tertukar -> 200 auto-detect", async () => {
    const res = await request(app)
      .get(`/api/track?orderId=budi@kickstorm.id&email=${orderId}`)
      .expect(200);
    assert.strictEqual(res.body.order.id, orderId);
  });

  await test("GET /api/track wrong email -> 404", async () => {
    await request(app).get(`/api/track?orderId=${orderId}&email=salah@x.id`).expect(404);
  });

  await test("admin login wrong password -> 401", async () => {
    await request(app).post("/api/admin/login").send({ password: "salah" }).expect(401);
  });

  let token;
  await test("admin login correct -> 200 + token", async () => {
    const res = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    assert.ok(res.body.token);
    token = res.body.token;
  });

  await test("GET /api/orders without token -> 401", async () => {
    await request(app).get("/api/orders").expect(401);
  });

  await test("GET /api/orders with token -> 200", async () => {
    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${token}`).expect(200);
    assert.strictEqual(res.body.orders.length, 1);
    assert.strictEqual(res.body.orders[0].items.length, 2);
  });

  await test("Storm Forge: custom colorway -> 201 + colorway tersimpan", async () => {
    const res = await request(app).post("/api/orders").send({
      name: "Rani Kustom",
      email: "rani@kickstorm.id",
      address: "Jl. Forge No. 7, Bandung",
      items: [
        { custom: true, name: "Storm Forge — Void / Cyber Pink / White / Black", price: 1950000, qty: 1, size: "42", colorway: JSON.stringify({ n: "Void / Cyber Pink / White / Black", u: "#111113", a: "#FF4FD8", s: "#E8E8E4", l: "#111113" }) }
      ]
    }).expect(201);
    assert.strictEqual(res.body.total, 1950000 + res.body.shipping);
    assert.strictEqual(res.body.shipping, 15000, "ongkir tier dasar untuk alamat teks");
    const track = await request(app)
      .get(`/api/track?orderId=${res.body.orderId}&email=rani@kickstorm.id`)
      .expect(200);
    const item = track.body.order.items[0];
    assert.strictEqual(item.product_id, null);
    assert.strictEqual(item.product_name.includes("Storm Forge"), true);
    assert.ok(item.colorway && JSON.parse(item.colorway).n.includes("Cyber Pink"));
    const adminOrders = await request(app)
      .get("/api/orders").set("Authorization", `Bearer ${token}`).expect(200);
    const found = adminOrders.body.orders.find((o) => o.id === res.body.orderId);
    assert.ok(found.items[0].colorway, "colorway tampil di admin");
  });

  await test("Storm Forge: custom item tanpa harga/ukuran custom -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "X", email: "x@x.id", address: "Jkt",
      items: [{ custom: true, name: "Storm Forge — X", price: -5, qty: 1, size: "42", colorway: "{}" }]
    }).expect(400);
  });

  await test("PATCH /api/orders/:id/status -> 200", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "shipped" })
      .expect(200);
    assert.strictEqual(res.body.status, "shipped");
  });

  await test("PATCH backward status (shipped -> pending) -> 400", async () => {
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "pending" })
      .expect(400);
  });

  await test("PATCH cancel -> restock + un-sold", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[1];
    const res = await request(app).post("/api/orders").send({
      name: "Rina", email: "rina@kickstorm.id", address: "Jkt",
      items: [{ id: p.id, qty: 3 }]
    }).expect(201);
    const newOrderId = res.body.orderId;
    await request(app)
      .patch(`/api/orders/${newOrderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "cancelled" })
      .expect(200);
    const after = await request(app).get("/api/products").expect(200);
    const q = after.body.products.find((x) => x.id === p.id);
    assert.strictEqual(q.stock, p.stock);
    assert.strictEqual(q.sold, p.sold);
  });

  await test("rating data-driven setelah ada pesanan dibatalkan", async () => {
    const res = await request(app).get("/api/stats").expect(200);
    assert.strictEqual(res.body.rating, 1);
    assert.ok(res.body.revenue > 0);
  });

  await test("orders with duplicate product ids merged -> single line", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[2];
    const res = await request(app).post("/api/orders").send({
      name: "Dedi", email: "dedi@kickstorm.id", address: "Jkt",
      items: [{ id: p.id, qty: 1 }, { id: p.id, qty: 2 }]
    }).expect(201);
    const after = await request(app).get("/api/products").expect(200);
    const q = after.body.products.find((x) => x.id === p.id);
    assert.strictEqual(q.stock, p.stock - 3);
    const check = await request(app)
      .get(`/api/track?orderId=${res.body.orderId}&email=dedi@kickstorm.id`)
      .expect(200);
    assert.strictEqual(check.body.order.items.length, 1);
    assert.strictEqual(check.body.order.items[0].qty, 3);
  });

  await test("PATCH invalid status -> 400", async () => {
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "nuklir" })
      .expect(400);
  });

  await test("POST /api/products create -> 201", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Tesla Pro — Red 07", tag: "Limited", badge: "New", price: 1550000, variant: "volt", stock: 10 })
      .expect(201);
    assert.strictEqual(res.body.product.name, "Tesla Pro — Red 07");
  });

  await test("POST /api/products without token -> 401", async () => {
    await request(app).post("/api/products").send({ name: "X" }).expect(401);
  });

  await test("POST /api/products invalid variant -> 400", async () => {
    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X", variant: "neon" })
      .expect(400);
  });

  let createdId;
  await test("PUT /api/products/:id partial update -> 200", async () => {
    const list = await request(app).get("/api/products").expect(200);
    createdId = list.body.products.find((p) => p.name === "Tesla Pro — Red 07").id;
    const res = await request(app)
      .put(`/api/products/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ price: 1650000, stock: 5 })
      .expect(200);
    assert.strictEqual(res.body.product.price, 1650000);
    assert.strictEqual(res.body.product.stock, 5);
  });

  await test("DELETE /api/products/:id -> 200", async () => {
    await request(app)
      .delete(`/api/products/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const res = await request(app).get("/api/products").expect(200);
    assert.strictEqual(res.body.products.length, 6);
  });

  await test("GET /api/orders/export -> CSV", async () => {
    const res = await request(app)
      .get("/api/orders/export")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    assert.ok(res.text.startsWith("\uFEFFID,"));
    assert.ok(res.text.includes("Budi Santoso"));
  });

  await test("GET /api/admin/sales tanpa token -> 401", async () => {
    await request(app).get("/api/admin/sales").expect(401);
  });

  await test("GET /api/admin/sales dengan token -> 14 poin", async () => {
    const res = await request(app)
      .get("/api/admin/sales")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(res.body.points.length, 14);
    assert.ok(res.body.points.every((p) => Number.isInteger(p.revenue)));
    assert.ok(res.body.points.every((p) => Number.isInteger(p.orders)));
  });

  await test("POST /api/orders alamat terlalu panjang -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "X", email: "x@x.id", address: "A".repeat(400),
      items: [{ id: 1, qty: 1 }]
    }).expect(400);
  });

  await test("kupon: CRUD admin", async () => {
    await request(app).get("/api/admin/coupons").expect(401);
    const list0 = await request(app)
      .get("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    assert.ok(list0.body.coupons.some((c) => c.code === "STORM10"), "seed STORM10 ada");
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "HEBAT10", type: "percent", value: 10, min_order: 100000, max_uses: 5, expires_at: "2027-01-01" })
      .expect(201);
    const dup = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "HEBAT10", type: "percent", value: 10 })
      .expect(409);
    assert.ok(dup.body.error);
    const bad = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "X", type: "percent", value: 200 })
      .expect(400);
    assert.ok(bad.body.error);
    const list = await request(app)
      .get("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(list.body.coupons.length, 2);
  });

  await test("kupon: check publik", async () => {
    const ok = await request(app)
      .post("/api/coupons/check")
      .send({ code: "storm10", subtotal: 200000 })
      .expect(200);
    assert.strictEqual(ok.body.discount, 20000);
    const below = await request(app)
      .post("/api/coupons/check")
      .send({ code: "STORM10", subtotal: 50000 })
      .expect(404);
    assert.ok(below.body.error.includes("Minimal belanja"));
    await request(app).post("/api/coupons/check").send({ code: "TIDAK-ADA", subtotal: 200000 }).expect(404);
  });

  let couponOrderId;
  await test("checkout dengan kupon -> 201 + diskon + kuota", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[0];
    const res = await request(app).post("/api/orders").send({
      name: "Udin", email: "udin@kickstorm.id", address: "Surabaya",
      items: [{ id: p.id, qty: 1 }],
      coupon: "STORM10"
    }).expect(201);
    couponOrderId = res.body.orderId;
    assert.strictEqual(res.body.discount, Math.round((p.price * 10) / 100));
    assert.strictEqual(res.body.coupon, "STORM10");
    assert.strictEqual(res.body.total, p.price - res.body.discount + res.body.shipping);
    const list = await request(app)
      .get("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const c = list.body.coupons.find((x) => x.code === "STORM10");
    assert.strictEqual(c.used_count, 1);
    const track = await request(app)
      .get(`/api/track?orderId=${couponOrderId}&email=udin@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track.body.order.coupon_code, "STORM10");
    assert.ok(track.body.order.discount > 0);
  });

  await test("checkout kupon tidak valid -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "X", email: "x@x.id", address: "Jkt",
      items: [{ id: 1, qty: 1 }],
      coupon: "HACKER"
    }).expect(400);
  });

  await test("kupon kuota habis -> 404", async () => {
    await request(app)
      .put("/api/admin/coupons/STORM10")
      .set("Authorization", `Bearer ${token}`)
      .send({ max_uses: 1 })
      .expect(200);
    await request(app)
      .post("/api/coupons/check")
      .send({ code: "STORM10", subtotal: 300000 })
      .expect(404);
  });

  await test("kupon nonaktif -> 404 setelah toggle off", async () => {
    await request(app)
      .put("/api/admin/coupons/STORM10")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: 0 })
      .expect(200);
    await request(app)
      .post("/api/coupons/check")
      .send({ code: "STORM10", subtotal: 300000 })
      .expect(404);
  });

  await test("kupon delete -> 200 + tidak bisa dipakai", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "SEMENTARA", type: "fixed", value: 25000, max_uses: 0 })
      .expect(201);
    assert.strictEqual(res.body.coupon.type, "fixed");
    await request(app)
      .delete("/api/admin/coupons/SEMENTARA")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app)
      .post("/api/coupons/check")
      .send({ code: "SEMENTARA", subtotal: 300000 })
      .expect(404);
  });

  await test("kupon kadaluwarsa -> 404", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "LARIS09", type: "percent", value: 5, expires_at: "2020-01-01" })
      .expect(201);
    await request(app)
      .post("/api/coupons/check")
      .send({ code: "LARIS09", subtotal: 300000 })
      .expect(404);
  });

  let shippedId;
  await test("PUT tracking resi saat pending -> 400", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const res = await request(app).post("/api/orders").send({
      name: "Sari", email: "sari@kickstorm.id", address: "Bandung",
      items: [{ id: before.body.products[0].id, qty: 1 }]
    }).expect(201);
    shippedId = res.body.orderId;
    await request(app)
      .put(`/api/orders/${shippedId}/tracking`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tracking: "JNE-123" })
      .expect(400);
  });

  await test("resi tersimpan + tampil di pelacakan publik", async () => {
    await request(app)
      .patch(`/api/orders/${shippedId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "shipped" })
      .expect(200);
    const res = await request(app)
      .put(`/api/orders/${shippedId}/tracking`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tracking: "JNE123456789" })
      .expect(200);
    assert.strictEqual(res.body.tracking, "JNE123456789");
    const track = await request(app)
      .get(`/api/track?orderId=${shippedId}&email=sari@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track.body.order.tracking_number, "JNE123456789");

    // Pelacakan via Nomor Resi + Email
    const trackByResiWithEmail = await request(app)
      .get(`/api/track?orderId=JNE123456789&email=sari@kickstorm.id`)
      .expect(200);
    assert.strictEqual(trackByResiWithEmail.body.order.id, shippedId);

    // Pelacakan via Nomor Resi tanpa Email
    const trackByResiNoEmail = await request(app)
      .get(`/api/track?orderId=JNE123456789`)
      .expect(200);
    assert.strictEqual(trackByResiNoEmail.body.order.id, shippedId);

    const list = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const found = list.body.orders.find((o) => o.id === shippedId);
    assert.strictEqual(found.tracking_number, "JNE123456789");
  });

  await test("PUT tracking kosong -> resi dibersihkan", async () => {
    const res = await request(app)
      .put(`/api/orders/${shippedId}/tracking`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tracking: "" })
      .expect(200);
    assert.strictEqual(res.body.tracking, null);
    const track = await request(app)
      .get(`/api/track?orderId=${shippedId}&email=sari@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track.body.order.tracking_number, null);
  });

  await test("logout-all -> semua token mati", async () => {
    const loginA = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const loginB = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    await request(app)
      .post("/api/admin/logout-all")
      .set("Authorization", `Bearer ${loginA.body.token}`)
      .expect(200);
    await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${loginA.body.token}`)
      .expect(401);
    await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${loginB.body.token}`)
      .expect(401);
  });

  await test("logout -> token tidak valid lagi -> 401", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    await request(app)
      .post("/api/admin/logout")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(401);
  });

  await test("token kedaluwarsa -> 401", async () => {
    const crypto = require("crypto");
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    assert.ok(login.body.expiresAt);
    const hash = crypto.createHash("sha256").update(login.body.token).digest("hex");
    await db.run("UPDATE admin_tokens SET expires_at = datetime('now','-1 minute') WHERE token_hash = ?", [hash]);
    await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(401);
  });

  await test("login tanpa token tersimpan -> 401", async () => {
    await request(app)
      .get("/api/orders")
      .set("Authorization", "Bearer token-acak-tidak-ada")
      .expect(401);
  });

  await test("GET /api/health -> 200 + status DB + uptime", async () => {
    const res = await request(app).get("/api/health").expect(200);
    assert.strictEqual(res.body.status, "ok");
    assert.strictEqual(res.body.db, "connected");
    assert.ok(typeof res.body.uptime === "string" && res.body.uptime.length > 0);
    assert.ok(Number.isInteger(res.body.products) && res.body.products > 0);
    assert.ok(res.body.timestamp);
  });

  await test("POST /api/orders dengan catatan -> tersimpan + tampil di CSV", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const res = await request(app).post("/api/orders").send({
      name: "Catatan Test",
      email: "catatan@kickstorm.id",
      address: "Jkt",
      notes: "Ukuran 42, warna hitam",
      items: [{ id: before.body.products[3].id, qty: 1 }]
    }).expect(201);
    assert.ok(res.body.orderId > 0);
    const track = await request(app)
      .get(`/api/track?orderId=${res.body.orderId}&email=catatan@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track.body.order.notes, "Ukuran 42, warna hitam");
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const t2 = login.body.token;
    const csv = await request(app)
      .get("/api/orders/export")
      .set("Authorization", `Bearer ${t2}`)
      .expect(200);
    assert.ok(csv.text.includes("Ukuran 42, warna hitam"));
    assert.ok(csv.text.includes("Catatan"));
    const list = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${t2}`)
      .expect(200);
    const found = list.body.orders.find((o) => o.id === res.body.orderId);
    assert.strictEqual(found.notes, "Ukuran 42, warna hitam");
  });

  await test("riwayat status: timeline created->pending + log saat ganti status", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const res = await request(app).post("/api/orders").send({
      name: "Sejarah", email: "sejarah@kickstorm.id", address: "Jkt",
      items: [{ id: before.body.products[0].id, qty: 1 }]
    }).expect(201);
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const t2 = login.body.token;
    const track = await request(app)
      .get(`/api/track?orderId=${res.body.orderId}&email=sejarah@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track.body.order.history.length, 1);
    assert.strictEqual(track.body.order.history[0].to_status, "pending");
    assert.strictEqual(track.body.order.history[0].from_status, "created");
    await request(app)
      .patch(`/api/orders/${res.body.orderId}/status`)
      .set("Authorization", `Bearer ${t2}`)
      .send({ status: "paid" })
      .expect(200);
    const track2 = await request(app)
      .get(`/api/track?orderId=${res.body.orderId}&email=sejarah@kickstorm.id`)
      .expect(200);
    assert.strictEqual(track2.body.order.history.length, 2);
    assert.strictEqual(track2.body.order.history[1].from_status, "pending");
    assert.strictEqual(track2.body.order.history[1].to_status, "paid");
    const list = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${t2}`)
      .expect(200);
    const found = list.body.orders.find((o) => o.id === res.body.orderId);
    assert.strictEqual(found.history.length, 2);
  });

  await test("GET /api/admin/top-products -> 200 + revenue 14 hari", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const res = await request(app)
      .get("/api/admin/top-products")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    assert.strictEqual(res.body.days, 14);
    assert.ok(Array.isArray(res.body.topProducts));
    for (const p of res.body.topProducts) {
      assert.ok(p.product_name);
      assert.ok(p.revenue > 0);
    }
  });

  await test("GET /api/config -> store + shipping + flashSale", async () => {
    const res = await request(app).get("/api/config").expect(200);
    assert.ok(Number.isFinite(res.body.store.lat) && res.body.store.lat !== 0);
    assert.ok(Array.isArray(res.body.shipping.tiers) && res.body.shipping.tiers.length > 0);
    assert.strictEqual(res.body.shipping.maxKm, 25);
    assert.strictEqual(res.body.flashSale, null);
  });

  await test("ongkir: koordinat dekat toko -> tier 1 + tersimpan", async () => {
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[0];
    const res = await request(app).post("/api/orders").send({
      name: "Deket", email: "deket@kickstorm.id", address: "Jl. Sudirman, Jakarta",
      lat: -6.222, lng: 106.82,
      items: [{ id: p.id, qty: 1 }]
    }).expect(201);
    assert.strictEqual(res.body.shipping, 15000);
    assert.ok(res.body.distanceKm > 0 && res.body.distanceKm < 10);
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const list = await request(app).get("/api/orders").set("Authorization", `Bearer ${login.body.token}`).expect(200);
    const o = list.body.orders.find((x) => x.id === res.body.orderId);
    assert.strictEqual(o.lat, -6.222);
    assert.strictEqual(o.lng, 106.82);
  });

  await test("ongkir: di luar radius kirim -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "Jauh", email: "jauh@kickstorm.id", address: "Bandung",
      lat: -6.9175, lng: 107.6191,
      items: [{ id: 1, qty: 1 }]
    }).expect(400);
  });

  await test("ongkir: gratis mulai 1.5jt -> 0", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    await request(app)
      .patch("/api/admin/settings").set("Authorization", auth)
      .send({ free_shipping_min: 1500000 }).expect(200);
    const res = await request(app).post("/api/orders").send({
      name: "Besar", email: "besar@kickstorm.id", address: "Jaksel",
      lat: -6.26, lng: 106.81,
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    assert.strictEqual(res.body.shipping, 0);
    assert.strictEqual(res.body.shippingFree, true);
    await request(app)
      .patch("/api/admin/settings").set("Authorization", auth)
      .send({ free_shipping_min: 0 }).expect(200);
  });

  let flashId;
  await test("flash sale aktif -> diskon otomatis", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const res = await request(app)
      .post("/api/admin/flash-sales").set("Authorization", auth)
      .send({
        name: "Tes Flash",
        discount_percent: 10,
        starts_at: fmt(new Date(now.getTime() - 3600000)),
        ends_at: fmt(new Date(now.getTime() + 3600000))
      }).expect(201);
    flashId = res.body.flashSale.id;
    const cfg = await request(app).get("/api/config").expect(200);
    assert.strictEqual(cfg.body.flashSale.percent, 10);
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[0];
    const order = await request(app).post("/api/orders").send({
      name: "Flash", email: "flash@kickstorm.id", address: "Jakarta",
      items: [{ id: p.id, qty: 1 }]
    }).expect(201);
    assert.strictEqual(order.body.flash.discount, Math.round((p.price * 10) / 100));
    assert.strictEqual(order.body.total, p.price - order.body.flash.discount + order.body.shipping);
    await request(app)
      .delete(`/api/admin/flash-sales/${flashId}`).set("Authorization", auth)
      .expect(200);
    const after = await request(app).get("/api/flash-sale").expect(200);
    assert.strictEqual(after.body.flashSale, null);
  });

  await test("referral: buat + check + diskon 5% di checkout", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const res = await request(app)
      .post("/api/admin/referrals").set("Authorization", auth)
      .send({ owner_name: "Rina", owner_email: "rina@kickstorm.id", code: "RINA-REF", max_uses: 1 })
      .expect(201);
    assert.strictEqual(res.body.referral.code, "RINA-REF");
    const check = await request(app)
      .post("/api/referrals/check").send({ code: "rina-ref", subtotal: 200000 })
      .expect(200);
    assert.strictEqual(check.body.discount, 10000);
    const before = await request(app).get("/api/products").expect(200);
    const p = before.body.products[0];
    const order = await request(app).post("/api/orders").send({
      name: "Pakai", email: "pakai@kickstorm.id", address: "Jakarta",
      items: [{ id: p.id, qty: 1 }],
      referral: "RINA-REF"
    }).expect(201);
    assert.strictEqual(order.body.referral, "RINA-REF");
    assert.strictEqual(order.body.referralDiscount, Math.round((p.price * 5) / 100));
    assert.strictEqual(order.body.total, p.price - order.body.referralDiscount + order.body.shipping);
    await request(app).post("/api/referrals/check").send({ code: "RINA-REF", subtotal: 200000 }).expect(404);
    await request(app)
      .delete("/api/admin/referrals/RINA-REF").set("Authorization", auth)
      .expect(200);
  });

  await test("restock waitlist: daftar + duplikat 409 + admin notify", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const res = await request(app)
      .post("/api/restock-notify").send({ productId: 3, email: "nunggu@kickstorm.id" })
      .expect(201);
    await request(app)
      .post("/api/restock-notify").send({ productId: 3, email: "nunggu@kickstorm.id" })
      .expect(409);
    await request(app).post("/api/restock-notify").send({ productId: 3, email: "bukan-email" }).expect(400);
    const list = await request(app)
      .get("/api/admin/restock-waitlist").set("Authorization", auth)
      .expect(200);
    const w = list.body.waitlist.find((x) => x.id === res.body.id);
    assert.ok(w && w.email === "nunggu@kickstorm.id" && w.product_name);
    const all = await request(app)
      .post("/api/admin/restock-waitlist/notify-all").set("Authorization", auth)
      .expect(200);
    assert.ok(all.body.count >= 1);
    assert.ok(Array.isArray(all.body.emails));
    const list2 = await request(app)
      .get("/api/admin/restock-waitlist").set("Authorization", auth)
      .expect(200);
    assert.ok(list2.body.waitlist.every((x) => x.notified === 1));
  });

  await test("settings: PATCH nama toko + radius 0 (tanpa batas) + WA", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    await request(app)
      .patch("/api/admin/settings").set("Authorization", auth)
      .send({ store_name: "KICKSTORM HQ", wa_number: "6281234567890", max_shipping_km: 0 })
      .expect(200);
    const cfg = await request(app).get("/api/config").expect(200);
    assert.strictEqual(cfg.body.store.name, "KICKSTORM HQ");
    assert.strictEqual(cfg.body.waNumber, "6281234567890");
    assert.strictEqual(cfg.body.shipping.maxKm, 0);
    const far = await request(app).post("/api/orders").send({
      name: "Jauh2", email: "jauh2@kickstorm.id", address: "Bandung",
      lat: -6.9175, lng: 107.6191,
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    assert.ok(far.body.distanceKm > 100, "tanpa batas radius, pesanan jauh diterima");
    await request(app)
      .patch("/api/admin/settings").set("Authorization", auth)
      .send({ store_name: "KICKSTORM Jakarta", max_shipping_km: 25, wa_number: "" })
      .expect(200);
  });

  await test("config: couriers seeded + paymentFlow + codKm", async () => {
    const cfg = await request(app).get("/api/config").expect(200);
    assert.strictEqual(cfg.body.couriers.length, 2);
    assert.strictEqual(cfg.body.paymentFlow, false);
    assert.strictEqual(cfg.body.shipping.codKm, 8);
    assert.ok(cfg.body.couriers[0].name && cfg.body.couriers[0].tiers.length > 0);
    assert.strictEqual(cfg.body.nextDrop, null);
  });

  await test("courier: pilih Express Kilat -> nama kurir + ongkir tier-nya (40rb @ 7.6km)", async () => {
    const res = await request(app).post("/api/orders").send({
      name: "Kurir Test", email: "kurir@kickstorm.id", address: "Jakarta Utara",
      lat: -6.14, lng: 106.8456,
      courier_id: 2,
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    assert.strictEqual(res.body.courier.name, "Express Kilat");
    assert.strictEqual(res.body.shipping, 40000);
    const reg = await request(app).post("/api/orders").send({
      name: "Kurir Reg", email: "kurir2@kickstorm.id", address: "Jakarta Utara",
      lat: -6.14, lng: 106.8456,
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    assert.strictEqual(reg.body.shipping, 25000, "kurir default pakai tier reguler");
  });

  await test("COD tanpa koordinat -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "COD Tanpa Lokasi", email: "cod0@kickstorm.id", address: "Jakarta",
      payment_method: "cod",
      items: [{ id: 1, qty: 1 }]
    }).expect(400);
  });

  await test("COD jarak jauh (Bandung, > 8 km) -> 400", async () => {
    await request(app).post("/api/orders").send({
      name: "COD Jauh", email: "codfar@kickstorm.id", address: "Bandung",
      lat: -6.9175, lng: 107.6191,
      payment_method: "cod",
      items: [{ id: 1, qty: 1 }]
    }).expect(400);
  });

  let codOrderId;
  await test("COD jarak dekat -> 201 + status pending", async () => {
    const res = await request(app).post("/api/orders").send({
      name: "COD Dekat", email: "codnear@kickstorm.id", address: "Gambir, Jakarta",
      lat: -6.2, lng: 106.846,
      payment_method: "cod",
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    codOrderId = res.body.orderId;
    assert.strictEqual(res.body.paymentMethod, "cod");
    assert.strictEqual(res.body.status, "pending");
  });

  await test("drop antrian belum rilis -> 403 blokir checkout", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const future = new Date(Date.now() + 3600000);
    const pad = (n) => String(n).padStart(2, "0");
    const release = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())} ${pad(future.getHours())}:${pad(future.getMinutes())}`;
    const created = await request(app).post("/api/admin/drops").set("Authorization", auth)
      .send({ name: "Drop 02 — Volt II", release_at: release, queue_enabled: 1 })
      .expect(201);
    await request(app).post("/api/orders").send({
      name: "Pengantre", email: "antri0@kickstorm.id", address: "Jakarta",
      items: [{ id: 1, qty: 1 }]
    }).expect(403);
    await request(app).delete(`/api/admin/drops/${created.body.drop.id}`).set("Authorization", auth).expect(200);
    const next = await request(app).get("/api/next-drop").expect(200);
    assert.strictEqual(next.body.drop, null);
  });

  await test("drop antrian live -> queueNo 1 lalu 2, dropName di respons", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const past = new Date(Date.now() - 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const release = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())} ${pad(past.getHours())}:${pad(past.getMinutes())}`;
    const created = await request(app).post("/api/admin/drops").set("Authorization", auth)
      .send({ name: "Drop 03 — Live", release_at: release, queue_enabled: 1 })
      .expect(201);
    const a = await request(app).post("/api/orders").send({
      name: "Antri Satu", email: "antri1@kickstorm.id", address: "Jakarta",
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    const b = await request(app).post("/api/orders").send({
      name: "Antri Dua", email: "antri2@kickstorm.id", address: "Jakarta",
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    assert.strictEqual(a.body.queueNo, 1);
    assert.strictEqual(b.body.queueNo, 2);
    assert.strictEqual(b.body.dropName, "Drop 03 — Live");
    await request(app).delete(`/api/admin/drops/${created.body.drop.id}`).set("Authorization", auth).expect(200);
  });

  let payOrderId;
  await test("payment flow: awaiting_payment -> upload bukti -> verifikasi jadi paid", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    await request(app).patch("/api/admin/settings").set("Authorization", auth).send({ payment_flow: 1 }).expect(200);
    const res = await request(app).post("/api/orders").send({
      name: "Bayar Tf", email: "pay1@kickstorm.id", address: "Jakarta",
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    payOrderId = res.body.orderId;
    assert.strictEqual(res.body.status, "awaiting_payment");
    const dataUrl = "data:image/png;base64," + Buffer.alloc(1024, 7).toString("base64");
    const up = await request(app).post(`/api/orders/${payOrderId}/payment-proof`).send({ proof: dataUrl, note: "BCA 10:02" }).expect(200);
    assert.ok(up.body.proof.startsWith("/uploads/"));
    await request(app).post(`/api/orders/${payOrderId}/payment-proof`).send({ proof: "bukan-gambar" }).expect(400);
    await request(app).post(`/api/orders/${payOrderId}/payment-proof`).send({ proof: "data:image/png;base64,AA==" }).expect(400);
    const verify = await request(app).post(`/api/admin/orders/${payOrderId}/verify-payment`).set("Authorization", auth).expect(200);
    assert.strictEqual(verify.body.status, "paid");
    await request(app).post(`/api/admin/orders/${payOrderId}/verify-payment`).set("Authorization", auth).expect(400);
  });

  await test("payment flow: tolak bukti -> cancelled + stok & poin dikembalikan", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const before = await request(app).get("/api/products").expect(200);
    const p1 = before.body.products[0];
    const res = await request(app).post("/api/orders").send({
      name: "Bayar Tolak", email: "pay2@kickstorm.id", address: "Jakarta",
      items: [{ id: p1.id, qty: 2 }]
    }).expect(201);
    assert.strictEqual(res.body.status, "awaiting_payment");
    assert.ok(res.body.points >= 15);
    const dataUrl = "data:image/webp;base64," + Buffer.alloc(1024, 3).toString("base64");
    await request(app).post(`/api/orders/${res.body.orderId}/payment-proof`).send({ proof: dataUrl }).expect(200);
    await request(app).post(`/api/admin/orders/${res.body.orderId}/reject-payment`).set("Authorization", auth).expect(200);
    const after = await request(app).get("/api/products").expect(200);
    const p1a = after.body.products.find((x) => x.id === p1.id);
    assert.strictEqual(p1a.stock, p1.stock);
    const member = await request(app).get("/api/member?email=pay2@kickstorm.id").expect(200);
    assert.strictEqual(member.body.member.points, 0, "poin dikembalikan saat pembayaran ditolak");
    const track = await request(app).get(`/api/track?orderId=${res.body.orderId}&email=pay2@kickstorm.id`).expect(200);
    assert.strictEqual(track.body.order.status, "cancelled");
    await request(app).patch("/api/admin/settings").set("Authorization", auth).send({ payment_flow: 0 }).expect(200);
  });

  await test("member: poin + level Bronze + ulang tahun -> kupon BDAY valid", async () => {
    const res = await request(app).post("/api/orders").send({
      name: "Anggota Club", email: "member@kickstorm.id", address: "Jakarta",
      items: [{ id: 2, qty: 1 }, { id: 1, qty: 1 }]
    }).expect(201);
    assert.ok(res.body.points > 0);
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const birth = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const set = await request(app).post("/api/member/birthday").send({ email: "member@kickstorm.id", birth }).expect(200);
    assert.strictEqual(set.body.ok, true);
    await request(app).post("/api/member/birthday").send({ email: "member@kickstorm.id", birth: "13-99" }).expect(400);
    const m = await request(app).get("/api/member?email=member@kickstorm.id").expect(200);
    assert.ok(m.body.member.points > 0);
    assert.ok(["Bronze", "Silver", "Gold"].includes(m.body.member.level));
    assert.strictEqual(m.body.member.birthSet, true);
    assert.ok(m.body.member.birthdayCoupon && m.body.member.birthdayCoupon.code.startsWith("BDAY-"), "kupon ulang tahun dibuat hari ini");
    const check = await request(app).post("/api/coupons/check").send({ code: m.body.member.birthdayCoupon.code, subtotal: 200000 }).expect(200);
    assert.strictEqual(check.body.discount, 30000);
    const none = await request(app).get("/api/member?email=belum@ada.id").expect(200);
    assert.strictEqual(none.body.member, null);
  });

  await test("admin: daftar member + subscribers", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const members = await request(app).get("/api/admin/members").set("Authorization", auth).expect(200);
    const m = members.body.members.find((x) => x.email === "member@kickstorm.id");
    assert.ok(m && m.orders >= 1 && m.points > 0);
    const subs = await request(app).get("/api/admin/subscribers").set("Authorization", auth).expect(200);
    assert.ok(subs.body.emails.includes("tes@kickstorm.id"));
  });

  await test("admin kurir: tambah + nonaktif + order pakai kurir nonaktif -> 400", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    const created = await request(app).post("/api/admin/couriers").set("Authorization", auth)
      .send({ name: "JNE Reguler", tiers: [{ max: 9999, cost: 20000 }], cod_km: 0 })
      .expect(201);
    const id = created.body.courier.id;
    await request(app).patch(`/api/admin/couriers/${id}`).set("Authorization", auth).send({ active: 0 }).expect(200);
    await request(app).post("/api/orders").send({
      name: "Kurir Mati", email: "kmat@kickstorm.id", address: "Jakarta",
      courier_id: id,
      items: [{ id: 1, qty: 1 }]
    }).expect(400);
    await request(app).delete(`/api/admin/couriers/${id}`).set("Authorization", auth).expect(200);
  });

  await test("posisi kurir: PUT courier-location -> tampil di /api/track", async () => {
    const login = await request(app).post("/api/admin/login").send({ password: "kickstorm-admin" }).expect(200);
    const auth = `Bearer ${login.body.token}`;
    await request(app).put(`/api/admin/orders/${codOrderId}/courier-location`).set("Authorization", auth)
      .send({ lat: -6.205, lng: 106.85 }).expect(200);
    const track = await request(app).get(`/api/track?orderId=${codOrderId}&email=codnear@kickstorm.id`).expect(200);
    assert.strictEqual(track.body.order.courier_lat, -6.205);
    assert.strictEqual(track.body.order.courier_lng, 106.85);
    await request(app).put(`/api/admin/orders/${codOrderId}/courier-location`).set("Authorization", auth)
      .send({ lat: 99, lng: 106.85 }).expect(400);
  });

  await test("SSE events tanpa token -> 401", async () => {
    await request(app).get("/api/admin/events").expect(401);
  });

  await test("sitemap.xml & feed.xml -> 200 XML", async () => {
    const sm = await request(app).get("/sitemap.xml").expect(200);
    assert.ok(sm.text.includes("urlset"));
    const feed = await request(app).get("/feed.xml").expect(200);
    assert.ok(feed.text.includes("rss") || feed.text.includes("feed"));
  });

  await test("produk: eta_hours tersedia (estimasi habis)", async () => {
    const res = await request(app).get("/api/products").expect(200);
    assert.ok("eta_hours" in res.body.products[0]);
    assert.ok(res.body.products.every((p) => p.eta_hours === null || p.eta_hours >= 1));
  });

  await test("maps_url: checkout dengan link Google Maps -> koordinat & link tersimpan", async () => {
    const res = await request(app).post("/api/orders").send({
      name: "Pelanggan Maps",
      email: "mapsuser@kickstorm.id",
      address: "Jl. Sudirman No. 10",
      maps_url: "https://www.google.com/maps/@-6.2087634,106.845599,16z",
      items: [{ id: 1, qty: 1 }]
    }).expect(201);
    const orderId = res.body.orderId;
    assert.strictEqual(res.body.status, "pending");

    const track = await request(app).get(`/api/track?orderId=${orderId}&email=mapsuser@kickstorm.id`).expect(200);
    assert.strictEqual(track.body.order.maps_url, "https://www.google.com/maps/@-6.2087634,106.845599,16z");
    assert.ok(track.body.order.lat !== null && track.body.order.lng !== null);
  });

  await test("courier portal: GET /courier dan API pesanan & sync lokasi", async () => {
    await request(app).get("/courier").expect(200);
    const ordersRes = await request(app).get("/api/courier/orders").expect(200);
    assert.ok(Array.isArray(ordersRes.body.orders));

    const orderId = ordersRes.body.orders[0].id;
    await request(app).post(`/api/courier/orders/${orderId}/status`).send({
      status: "shipped",
      courier_name: "Budi Kilat"
    }).expect(200);

    await request(app).post("/api/courier/sync-location").send({
      lat: -6.209,
      lng: 106.846,
      share_url: "https://maps.app.goo.gl/couriershare123"
    }).expect(200);

    const track = await request(app).get(`/api/track?orderId=${orderId}&email=${ordersRes.body.orders[0].email}`).expect(200);
    assert.strictEqual(track.body.order.status, "shipped");
    assert.strictEqual(track.body.order.courier_name, "Budi Kilat");
    assert.strictEqual(track.body.order.courier_share_url, "https://maps.app.goo.gl/couriershare123");

    await request(app).post(`/api/courier/orders/${orderId}/status`).send({
      status: "delivered"
    }).expect(200);
  });

  await test("unknown endpoint -> 404", async () => {
    await request(app).get("/api/hal-hal").expect(404);
  });

  console.log(`\n${passed} tests passed.`);
  await db.close();
  process.exit(process.exitCode || 0);
})();
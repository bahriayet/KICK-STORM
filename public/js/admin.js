
(function () {
  var TOKEN_KEY = "ks_admin_token";
  var token = localStorage.getItem(TOKEN_KEY) || "";
  var STATUS_LABELS = {
    awaiting_payment: "Menunggu Bukti",
    pending: "Menunggu Pembayaran",
    paid: "Pembayaran Diterima",
    shipped: "Sedang Dikirim",
    delivered: "Selesai",
    cancelled: "Dibatalkan"
  };
  var $ = function (id) { return document.getElementById(id); };
  var allOrders = [];
  var storeCfg = null;
  var storeCfgReady = false;

  function rupiah(n) { return "Rp " + Number(n).toLocaleString("id-ID"); }

  function showLogin() {
    $("login-view").style.display = "flex";
    $("app-view").style.display = "none";
  }
  function showApp() {
    $("login-view").style.display = "none";
    $("app-view").style.display = "block";
  }

  function logout(errMsg) {
    if (window.__ksSse) { window.__ksSse.close(); window.__ksSse = null; }
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    $("login-password").value = "";
    if (errMsg) {
      var msg = $("login-msg");
      if (msg) { msg.textContent = errMsg; msg.className = "login-msg err"; }
    }
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) opts.headers.Authorization = "Bearer " + token;
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }

  function toast(msg, isErr) {
    var t = $("toast");
    t.textContent = msg;
    t.className = isErr ? "err show" : "show";
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ""; }, 3200);
  }

  function avatar(name) {
    var words = String(name || "?").trim().split(/\s+/);
    var initials = ((words[0] || "")[0] || "") + ((words[1] || "")[0] || "");
    return '<span class="avatar">' + initials.toUpperCase() + "</span>";
  }

  function statCard(label, num, sub) {
    return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-num">' + num + '</div><div class="stat-sub">' + sub + "</div></div>";
  }

  function renderStats() {
    api("/api/stats").then(function (res) {
      if (!res.ok) return;
      var s = res.data;
      $("stats-row").innerHTML =
        statCard("Pendapatan", rupiah(s.revenue).replace("Rp ", "Rp <em>") + "</em>", "excl. pesanan dibatalkan") +
        statCard("Produk", s.products, "di katalog") +
        statCard("Total Terjual", rupiah(s.sold).replace("Rp ", "Rp <em>") + "</em>", "pasang sepanjang masa") +
        statCard("Pesanan", s.orders, "diterima") +
        statCard("Subscriber", s.subscribers, "Storm Club") +
        statCard("Stok Menipis", '<em style="color:var(--red)">' + s.lowStock + "</em>", "produk \u2264 30 pasang");
    // Show/hide low stock badge on orders tab
    var badge = $("low-stock-badge");
    if (s.lowStock > 0) {
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    });
  }

  function renderTopProducts() {
    api("/api/admin/top-products").then(function (res) {
      if (!res.ok) return;
      var products = res.data.topProducts;
      var body = $("top-products-body");
      if (!products || !products.length) {
        body.innerHTML = '<tr><td colspan="3"><div class="empty-state">Belum ada data produk yang laku.</div></td></tr>';
        $("top-products-card").hidden = true;
        return;
      }
      $("top-products-card").hidden = false;
      body.innerHTML = products.map(function (p) {
        return "<tr>" +
          '<td>' + escapeHtml(p.product_name) + "</td>" +
          '<td class="price">' + rupiah(p.revenue) + "</td>" +
          '<td class="muted">' + (p.revenue > 0 ? Math.round(p.revenue / 1500000) + "+" : "0") + "</td>" +
          "</tr>";
      }).join("");
    });
  }

  function shortNum(n) {
    if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(".", ",") + " M";
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + " jt";
    if (n >= 1000) return String(Math.round(n / 1000)) + " rb";
    return String(n);
  }

  function colorwayName(cw) {
    try {
      var o = JSON.parse(cw);
      return o.n || "";
    } catch (e) { return ""; }
  }

  function itemLabel(i) {
    var thumb = (i.image_url && i.image_url.trim()) ? '<img src="' + escapeHtml(i.image_url.trim()) + '" style="width:32px;height:32px;border-radius:4px;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:6px;background:#18181c;">' : "";
    return '<div style="display:flex;align-items:center;gap:6px;">' + thumb + '<div>' + escapeHtml(i.product_name + " \u00d7" + i.qty + (i.size ? " (Uk. " + i.size + ")" : "")) +
      (i.colorway ? '<span class="muted" style="font-size:.7rem;display:block">Colorway: ' + escapeHtml(colorwayName(i.colorway)) + "</span>" : "") + '</div></div>';
  }

  function renderCustomerProfile(email) {
    api("/api/orders").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat pesanan.", true);
      var allOrders = res.data.orders;
      var customerOrders = allOrders.filter(function (o) { return o.email === email; });
      var totalBelanja = customerOrders.reduce(function (sum, o) { return sum + o.total; }, 0);
      var html = "";
      if (customerOrders.length === 0) {
        html = '<p class="muted">Belum ada pesanan dari pelanggan ini.</p>';
      } else {
        html = customerOrders.map(function (o) {
          var tgl = new Date(o.created_at.replace(" ", "T")).toLocaleDateString("id-ID", {
            day: "2-digit", month: "short", year: "numeric"
          });
          var items = (o.items || []).map(function (i) { return i.product_name + " \u00d7" + i.qty + (i.size ? " (Uk. " + i.size + ")" : ""); }).join(", ");
          return '<div class="order-item">' +
            '<div class="order-details">' +
            '<p><strong>#' + o.id + '</strong> \u2022 ' + (STATUS_LABELS[o.status] || o.status) + '</p>' +
            '<p class="muted items" style="font-size:.8rem">' + items + (o.items.some(function (i) { return i.colorway; }) ? " <span class='muted'>(custom)</span>" : "") + '</p>' +
            "<p class='muted' style='font-size:.72rem'>" + tgl + "</p>" +
            "</div>" +
            '<div class="order-total">' + rupiah(o.total) + "</div>" +
            "</div>";
        }).join("");
      }
      $("customer-email").textContent = email;
      $("customer-count").textContent = customerOrders.length + " pesanan";
      $("customer-total").textContent = rupiah(totalBelanja);
      $("customer-orders").innerHTML = html;
      $("customer-overlay").classList.add("open");
    });
  }

  function renderSalesChart(points) {
    var canvas = $("sales-chart");
    if (!points || !points.length || !canvas) return;
    var total14 = points.reduce(function (s, p) { return s + p.revenue; }, 0);
    $("chart-total").textContent = rupiah(total14);
    $("chart-card").hidden = false;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(canvas.clientWidth, 300);
    var h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    var max = Math.max.apply(null, points.map(function (p) { return p.revenue; }));
    if (!max) max = 1;
    var padX = 8;
    var slot = (w - padX * 2) / points.length;
    var barH = h - 46;
    ctx.textAlign = "center";
    points.forEach(function (p, i) {
      var bh = p.revenue > 0 ? Math.max(4, (p.revenue / max) * barH) : 2;
      var x = padX + slot * i + slot / 2;
      var y = h - 30 - bh;
      ctx.fillStyle = p.revenue > 0 ? "rgba(214,255,63,.92)" : "#26262A";
      ctx.fillRect(x - slot * 0.3, y, slot * 0.6, bh);
      if (p.revenue > 0) {
        ctx.fillStyle = "#F5F5F2";
        ctx.font = "600 9px 'Space Grotesk',sans-serif";
        ctx.fillText(shortNum(p.revenue), x, y - 5);
      }
      ctx.fillStyle = "#9C9C9C";
      ctx.font = "9px 'Space Grotesk',sans-serif";
      ctx.fillText(p.day.slice(8, 10) + "/" + p.day.slice(5, 7), x, h - 14);
    });
  }

  function orderStatusSelect(id, status) {
    var opts = Object.keys(STATUS_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === status ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>";
    }).join("");
    return '<select class="order-status" data-status-id="' + id + '" aria-label="Ubah status pesanan #' + id + '">' + opts + "</select>";
  }

  function renderOrders() {
    api("/api/orders").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat pesanan.", true);
      var orders = res.data.orders;
      allOrders = orders;
      $("tab-orders-count").textContent = orders.length;
      var body = $("orders-body");
      if (orders.length === 0) {
        body.innerHTML = '<tr><td colspan="5"><div class="empty-state">Belum ada pesanan masuk.</div></td></tr>';
        return;
      }
      body.innerHTML = orders.map(function (o) {
        var tgl = new Date(o.created_at.replace(" ", "T")).toLocaleString("id-ID", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });
        var items = (o.items || []).map(function (i) { return itemLabel(i); }).join("<br>");
        var couponChip = o.coupon_code ? '<div class="coupon-chip">Kupon: ' + escapeHtml(o.coupon_code) + "</div>" : "";
        var shipped = o.status === "shipped" || o.status === "delivered";
        var statusBadge = '<span class="badge-status">' + (STATUS_LABELS[o.status] || o.status) + "</span>";
        var resiBadge = (shipped && o.tracking_number) ? '<span class="chip mono" style="font-size:.72rem">Resi: ' + escapeHtml(o.tracking_number) + "</span>" : "";
        var payProofHighlight = (o.status === "awaiting_payment" && o.payment_proof)
          ? '<button class="btn btn-primary btn-sm pay-btn" type="button" data-pay-id="' + o.id + '">💳 Cek Bukti</button>'
          : "";

        var extraChips = (o.shipping > 0 ? '<span class="chip">Ongkir ' + rupiah(o.shipping) + "</span>" : "") +
          (o.referral_code ? '<span class="chip chip-referral">Referral ' + escapeHtml(o.referral_code) + "</span>" : "") +
          (o.flash_sale_id ? '<span class="chip chip-flash">Flash Sale</span>' : "") +
          (o.payment_method === "cod" ? '<span class="chip chip-cod">COD</span>' : "") +
          (o.queue_no ? '<span class="chip chip-queue">Antrean #' + o.queue_no + "</span>" : "");

        var totalCell = '<div class="price">' + rupiah(o.total) + "</div>" +
          (extraChips ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + extraChips + "</div>" : "");

        var statusCellHtml = '<div class="desktop-order-actions">' +
          statusBadge +
          resiBadge +
          payProofHighlight +
          '<button class="btn btn-ghost btn-sm od-open-btn" type="button" data-od-id="' + o.id + '">⚙️ Kelola &amp; Detail &rarr;</button>' +
          "</div>";

        return '<tr class="desktop-order-row" data-od-id="' + o.id + '">' +
          '<td class="mono" style="white-space:nowrap"><strong>#' + o.id + '</strong><br><span class="muted" style="font-size:.74rem">' + tgl + "</span></td>" +
          '<td><div class="customer-cell">' + avatar(o.customer_name) +
          '<div><div class="c-name">' + escapeHtml(o.customer_name) + '</div><span class="muted email-click" style="font-size:.74rem;cursor:pointer" data-email="' + escapeHtml(o.email) + '" title="Lihat profil pelanggan">' + escapeHtml(o.email) + "</span></div></div></td>" +
          '<td><div class="items-cell" style="max-width:240px">' + items + "</div>" + couponChip + "</td>" +
          '<td>' + totalCell + "</td>" +
          '<td class="muted" style="font-size:.72rem;max-width:180px;white-space:pre-wrap">' + (o.notes || "-") + "</td>" +
          '<td>' + statusCellHtml + "</td>" +
          "</tr>";
      }).join("");

      /* Render Compact Mobile Order Cards (takes 70% less space on mobile!) */
      var mWrap = $("orders-mobile-wrap");
      if (mWrap) {
        if (orders.length === 0) {
          mWrap.innerHTML = '<div class="empty-state">Belum ada pesanan masuk.</div>';
        } else {
          mWrap.innerHTML = orders.map(function (o) {
            var tgl = new Date(o.created_at.replace(" ", "T")).toLocaleString("id-ID", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
            });
            var itemSummary = (o.items && o.items.length > 0)
              ? (o.items[0].product_name + (o.items.length > 1 ? " (+" + (o.items.length - 1) + ")" : ""))
              : "1 item";
            return '<div class="order-card" data-od-id="' + o.id + '">' +
              '<div class="oc-top">' +
                '<div class="oc-id-date">' +
                  '<strong class="oc-id">#' + o.id + '</strong>' +
                  '<span class="oc-date">' + tgl + '</span>' +
                '</div>' +
                '<span class="badge-status">' + (STATUS_LABELS[o.status] || o.status) + '</span>' +
              '</div>' +
              '<div class="oc-mid">' +
                '<div class="oc-customer">' +
                  '<span class="oc-name">' + escapeHtml(o.customer_name) + '</span>' +
                  '<span class="oc-items-count">' + escapeHtml(itemSummary) + ' • <strong class="oc-price">' + rupiah(o.total) + '</strong></span>' +
                '</div>' +
                '<span class="oc-action-pill">Kelola &rarr;</span>' +
              '</div>' +
            '</div>';
          }).join("");
        }
      }

      refreshMap();
    });
  }

  function renderProducts() {
    api("/api/products").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat produk.", true);
      var products = res.data.products;
      $("tab-products-count").textContent = products.length;
      var body = $("products-body");
      var pmWrap = $("products-mobile-wrap");
      if (products.length === 0) {
        body.innerHTML = '<tr><td colspan="8"><div class="empty-state">Katalog kosong \u2014 tambah produk pertama.</div></td></tr>';
        if (pmWrap) pmWrap.innerHTML = '<div class="empty-state">Katalog kosong \u2014 tambah produk pertama.</div>';
        return;
      }
      body.innerHTML = products.map(function (p) {
        var stockClass = p.stock <= 30 ? "stock-low" : "stock-ok";
        var imgUrl = (p.image_url && p.image_url.trim()) ? p.image_url.trim() : ("/images/koleksi_" + (((p.id - 1) % 6) + 1) + ".jpg");
        return "<tr>" +
          '<td class="mono muted">#' + p.id + "</td>" +
          '<td><img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(p.name) + '" style="width:44px;height:44px;border-radius:8px;object-fit:cover;background:#18181c;display:block;border:1px solid var(--stroke-2);"></td>' +
          '<td><div class="name-cell">' + escapeHtml(p.name) + '<br><span class="muted" style="font-size:.74rem">' + escapeHtml(p.tag) + "</span></div></td>" +
          '<td><span class="badge-pill">' + escapeHtml(p.badge) + "</span></td>" +
          '<td class="price">' + rupiah(p.price) + "</td>" +
          '<td class="muted" style="text-transform:capitalize">' + escapeHtml(p.variant) + "</td>" +
          '<td data-raw="' + p.stock + '"><strong class="' + stockClass + '">' + p.stock + "</strong></td>" +
          '<td class="mono muted">' + p.sold.toLocaleString("id-ID") + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-edit="' + p.id + '">Edit</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-del="' + p.id + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (pmWrap) {
        pmWrap.innerHTML = products.map(function (p) {
          var stockClass = p.stock <= 30 ? "stock-low" : "stock-ok";
          var imgUrl = (p.image_url && p.image_url.trim()) ? p.image_url.trim() : ("/images/koleksi_" + (((p.id - 1) % 6) + 1) + ".jpg");
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top" style="align-items:center;gap:12px;">' +
              '<img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(p.name) + '" style="width:48px;height:48px;border-radius:8px;object-fit:cover;background:#18181c;flex-shrink:0;border:1px solid var(--stroke-2);">' +
              '<div style="flex:1;"><strong class="admin-m-title">' + escapeHtml(p.name) + '</strong><div class="admin-m-sub">#' + p.id + ' \u2022 ' + escapeHtml(p.tag) + "</div></div>" +
              '<span class="badge-pill">' + escapeHtml(p.badge) + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span>Stok: <strong class="' + stockClass + '">' + p.stock + '</strong> \u2022 Terjual: ' + p.sold + "</span>" +
              '<strong class="price">' + rupiah(p.price) + "</strong>" +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-edit="' + p.id + '">Edit</button>' +
              '<button class="btn btn-danger btn-sm" type="button" data-del="' + p.id + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCoupons() {
    api("/api/admin/coupons").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat kupon.", true);
      var coupons = res.data.coupons;
      $("tab-coupons-count").textContent = coupons.length;
      var body = $("coupons-body");
      var cmWrap = $("coupons-mobile-wrap");
      if (coupons.length === 0) {
        body.innerHTML = '<tr><td colspan="7"><div class="empty-state">Belum ada kupon. Tambahkan di sini — pelanggan bisa memakainya di keranjang.</div></td></tr>';
        if (cmWrap) cmWrap.innerHTML = '<div class="empty-state">Belum ada kupon.</div>';
        return;
      }
      var today = new Date().toISOString().slice(0, 10);
      body.innerHTML = coupons.map(function (c) {
        var expired = c.expires_at && c.expires_at < today;
        var nilai = c.type === "percent" ? c.value + "%" : rupiah(c.value);
        var kuota = c.max_uses > 0 ? c.used_count + " / " + c.max_uses : c.used_count + " / \u221e";
        return "<tr>" +
          '<td><span class="badge-pill mono" style="font-size:.78rem">' + escapeHtml(c.code) + "</span></td>" +
          '<td class="muted" style="text-transform:capitalize">' + c.type + " \u2022 <strong class='price'>" + nilai + "</strong></td>" +
          '<td class="muted">' + (c.min_order > 0 ? rupiah(c.min_order) : "0") + "</td>" +
          '<td class="mono muted">' + kuota + "</td>" +
          '<td class="' + (expired ? 'stock-low' : "muted") + '">' + (c.expires_at || "\u2014") + "</td>" +
          '<td><button class="btn btn-ghost btn-sm" type="button" data-active="' + escapeHtml(c.code) + '">' +
          (c.active ? '<span style="color:var(--volt)">\u2713 Aktif</span>' : '<span style="color:var(--muted)">Nonaktif</span>') + "</button></td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-cedit="' + escapeHtml(c.code) + '">Edit</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-cdel="' + escapeHtml(c.code) + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (cmWrap) {
        cmWrap.innerHTML = coupons.map(function (c) {
          var expired = c.expires_at && c.expires_at < today;
          var nilai = c.type === "percent" ? c.value + "%" : rupiah(c.value);
          var kuota = c.max_uses > 0 ? c.used_count + " / " + c.max_uses : c.used_count + " / \u221e";
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<span class="badge-pill mono" style="font-size:.82rem">' + escapeHtml(c.code) + "</span>" +
              '<strong class="price">' + nilai + "</strong>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="muted">Min: ' + (c.min_order > 0 ? rupiah(c.min_order) : "0") + " \u2022 Kuota: " + kuota + "</span>" +
              '<span class="badge-pill ' + (c.active ? "" : "badge-off") + '">' + (c.active ? "Aktif" : "Nonaktif") + "</span>" +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-active="' + escapeHtml(c.code) + '">' + (c.active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
              '<button class="btn btn-ghost btn-sm" type="button" data-cedit="' + escapeHtml(c.code) + '">Edit</button>"' +
              '<button class="btn btn-danger btn-sm" type="button" data-cdel="' + escapeHtml(c.code) + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  function refresh() {
    renderStats();
    api("/api/admin/sales").then(function (res) {
      if (!res.ok) return;
      renderSalesChart(res.data.points);
    });
    renderOrders();
    renderProducts();
    renderCoupons();
    renderTopProducts();
    renderReferrals();
    renderFlashSales();
    renderDrops();
    renderCouriers();
    renderMembers();
    renderSettings();
    renderWaitlist();
    refreshMap();
  }

  /* login */
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("login-msg");
    var btn = $("login-btn");
    var pwd = $("login-password").value.trim();
    if (!pwd) return;
    msg.textContent = "Memverifikasi...";
    msg.className = "login-msg";
    btn.disabled = true;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok && res.data && res.data.token) {
          token = res.data.token;
          localStorage.setItem(TOKEN_KEY, token);
          msg.textContent = "";
          $("login-password").value = "";
          showApp();
          refresh();
          connectEvents();
        } else {
          msg.textContent = (res.data && res.data.error) || "Password salah.";
          msg.className = "login-msg err";
        }
      })
      .catch(function () {
        msg.textContent = "Gagal terhubung ke server.";
        msg.className = "login-msg err";
      })
      .finally(function () { btn.disabled = false; });
  });

  function doLogout() {
    api("/api/admin/logout", { method: "POST" }).then(logout).catch(logout);
  }

  function doLogoutAll() {
    if (!confirm("Akhiri semua sesi admin di semua perangkat? Kamu harus login ulang.")) return;
    api("/api/admin/logout-all", { method: "POST" })
      .then(function () { toast("Semua sesi admin diakhiri."); logout(); })
      .catch(function () { toast("Gagal mengakhiri sesi.", true); });
  }

  if ($("logout-btn")) $("logout-btn").addEventListener("click", doLogout);
  if ($("sb-logout-btn")) $("sb-logout-btn").addEventListener("click", doLogout);
  if ($("logout-all-btn")) $("logout-all-btn").addEventListener("click", doLogoutAll);
  if ($("sb-logout-all-btn")) $("sb-logout-all-btn").addEventListener("click", doLogoutAll);

  /* Shopify Mobile Drawer Controls */
  var sidebar = $("admin-sidebar");
  var backdrop = $("sidebar-backdrop");
  var menuToggle = $("admin-menu-toggle");
  var closeBtn = $("sidebar-close-btn");

  function openMobileDrawer() {
    if (sidebar) sidebar.classList.add("open");
    if (backdrop) backdrop.classList.add("show");
    if (menuToggle) {
      menuToggle.classList.add("active");
      menuToggle.setAttribute("aria-expanded", "true");
    }
  }

  function closeMobileDrawer() {
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("show");
    if (menuToggle) {
      menuToggle.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (sidebar && sidebar.classList.contains("open")) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeMobileDrawer);
  if (backdrop) backdrop.addEventListener("click", closeMobileDrawer);

  /* Analytics section collapse toggle on mobile */
  var analyticsSection = $("analytics-section");
  var analyticsToggleBtn = $("analytics-toggle-btn");
  if (analyticsToggleBtn && analyticsSection) {
    analyticsToggleBtn.addEventListener("click", function () {
      var isOpen = analyticsSection.classList.toggle("open");
      analyticsToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  /* Unified Tab Switching Function */
  function selectTab(tabKey) {
    if (!tabKey) return;
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === tabKey);
    });
    document.querySelectorAll(".sidebar-btn").forEach(function (sb) {
      sb.classList.toggle("active", sb.dataset.tab === tabKey);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.remove("active");
    });
    var targetPanel = $("panel-" + tabKey);
    if (targetPanel) targetPanel.classList.add("active");

    if (tabKey === "map") ensureMapAll();
    if (tabKey === "settings") ensureStoreMap();

    // Close drawer if on mobile
    closeMobileDrawer();

    // Scroll active tab into view smoothly on mobile pill slider
    var activeTab = document.querySelector(".tab.active");
    if (activeTab && activeTab.scrollIntoView) {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  /* Listen to all tab clicks across desktop tabs & mobile drawer */
  document.querySelectorAll(".tab, .sidebar-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset && btn.dataset.tab) {
        selectTab(btn.dataset.tab);
      }
    });
  });

  /* orders desktop: klik baris / kelola → buka modal detail pesanan */
  document.getElementById("orders-body").addEventListener("click", function (e) {
    var email = e.target.closest("[data-email]");
    if (email) {
      e.stopPropagation();
      return renderCustomerProfile(email.dataset.email);
    }
    var pay = e.target.closest("[data-pay-id]");
    if (pay) {
      e.stopPropagation();
      return openPayProof(Number(pay.dataset.payId));
    }
    var row = e.target.closest("[data-od-id]");
    if (row) {
      openOrderDetailModal(Number(row.dataset.odId));
    }
  });

  /* ---- Order Detail Modal (for Mobile & Quick Action) ---- */
  var odOverlay = $("order-detail-overlay");
  var activeOdOrder = null;

  function openOrderDetailModal(id) {
    var o = allOrders.find(function (x) { return x.id === Number(id); });
    if (!o) return;
    activeOdOrder = o;

    $("od-title").textContent = "Pesanan #" + o.id;
    $("od-status-badge").textContent = STATUS_LABELS[o.status] || o.status;
    $("od-name").textContent = o.customer_name;
    $("od-email").textContent = o.email;
    $("od-addr").textContent = o.address || "-";

    var notesWrap = $("od-notes-wrap");
    if (o.notes && o.notes.trim()) {
      notesWrap.hidden = false;
      $("od-notes").textContent = o.notes;
    } else {
      notesWrap.hidden = true;
    }

    var itemsHtml = (o.items || []).map(function (i) { return itemLabel(i); }).join("<br>");
    $("od-items").innerHTML = itemsHtml;
    $("od-total").textContent = rupiah(o.total);

    var extraChips = (o.shipping > 0 ? '<span class="chip">Ongkir ' + rupiah(o.shipping) + "</span>" : "") +
      (o.referral_code ? '<span class="chip chip-referral">Referral ' + escapeHtml(o.referral_code) + "</span>" : "") +
      (o.flash_sale_id ? '<span class="chip chip-flash">Flash Sale</span>' : "") +
      (o.payment_method === "cod" ? '<span class="chip chip-cod">COD</span>' : "") +
      (o.queue_no ? '<span class="chip chip-queue">Antrean #' + o.queue_no + "</span>" : "");
    $("od-chips").innerHTML = extraChips;

    // Status select
    var statusSelect = $("od-status-select");
    statusSelect.innerHTML = Object.keys(STATUS_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>";
    }).join("");

    // Resi
    $("od-resi-input").value = o.tracking_number || "";

    // Maps & Routes URLs
    var navUrl = o.maps_url && o.maps_url.trim() ? o.maps_url.trim() : (o.lat && o.lng ? ("https://www.google.com/maps?q=" + o.lat + "," + o.lng) : ("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.address || "Jakarta")));
    $("od-loc-link").href = navUrl;

    var origin = (storeCfg && storeCfg.lat) ? (storeCfg.lat + "," + storeCfg.lng) : "-6.2087634,106.845599";
    var dest = (o.lat && o.lng) ? (o.lat + "," + o.lng) : (o.maps_url || encodeURIComponent(o.address || "Jakarta"));
    var routeUrl = "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest + "&travelmode=driving";
    $("od-route-link").href = routeUrl;

    // WA Kurir
    var waCourierText = "Halo Kurir KICKSTORM, tugas antar pesanan #" + o.id + ":\n" +
      "👤 Pelanggan: " + o.customer_name + "\n" +
      "📍 Alamat: " + o.address + "\n" +
      "💰 Total: " + rupiah(o.total) + (o.payment_method === "cod" ? " (BAYAR COD)" : " (LUNAS)") + "\n" +
      "🚀 Navigasi Rute: " + (o.maps_url || routeUrl);
    $("od-wa-link").href = "https://wa.me/?text=" + encodeURIComponent(waCourierText);

    // Radar / Posisi Kurir
    var radarLink = $("od-radar-link");
    if (o.courier_share_url) {
      radarLink.hidden = false;
      radarLink.href = o.courier_share_url;
    } else if (o.courier_lat && o.courier_lng) {
      radarLink.hidden = false;
      radarLink.href = "https://www.google.com/maps?q=" + o.courier_lat + "," + o.courier_lng;
    } else {
      radarLink.hidden = true;
    }

    // Set Lokasi Kurir
    $("od-cloc-btn").textContent = o.courier_lat ? "🛵 Ubah Posisi Kurir" : "🛵 Set Posisi Kurir";

    // Bukti Bayar
    var payBtn = $("od-pay-btn");
    if (o.payment_proof) {
      payBtn.hidden = false;
    } else {
      payBtn.hidden = true;
    }

    // Timeline
    var timelineWrap = $("od-timeline-wrap");
    if (o.history && o.history.length > 0) {
      timelineWrap.hidden = false;
      $("od-timeline-list").innerHTML = o.history.map(function (h, i) {
        var when = new Date(h.changed_at.replace(" ", "T")).toLocaleString("id-ID", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });
        return '<div class="tl-step' + (i === o.history.length - 1 ? " current" : "") + '">' +
          '<span class="tl-dot"></span>' +
          '<div><strong>' + (STATUS_LABELS[h.to_status] || h.to_status) + "</strong>" +
          '<span class="muted" style="font-size:.74rem;display:block">' + when + "</span></div></div>";
      }).join('<span class="tl-arrow">\u2192</span>');
    } else {
      timelineWrap.hidden = true;
    }

    if (odOverlay) odOverlay.classList.add("open");
  }

  function closeOrderDetailModal() {
    if (odOverlay) odOverlay.classList.remove("open");
  }

  if (odOverlay) {
    $("od-close").addEventListener("click", closeOrderDetailModal);
    $("od-cancel-btn").addEventListener("click", closeOrderDetailModal);
    odOverlay.addEventListener("click", function (e) {
      if (e.target === odOverlay) closeOrderDetailModal();
    });

    $("od-status-select").addEventListener("change", function () {
      if (!activeOdOrder) return;
      var newStatus = this.value;
      var sel = this;
      sel.disabled = true;
      api("/api/orders/" + activeOdOrder.id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) {
          toast("Status pesanan #" + activeOdOrder.id + " diubah jadi " + (STATUS_LABELS[newStatus] || newStatus));
          refresh();
          closeOrderDetailModal();
        } else {
          toast(res.data.error || "Gagal mengubah status.", true);
          sel.value = activeOdOrder.status;
        }
      }).finally(function () {
        sel.disabled = false;
      });
    });

    $("od-resi-save-btn").addEventListener("click", function () {
      if (!activeOdOrder) return;
      var resiVal = $("od-resi-input").value.trim();
      var btn = this;
      btn.disabled = true;
      api("/api/orders/" + activeOdOrder.id + "/tracking", {
        method: "PUT",
        body: JSON.stringify({ tracking: resiVal })
      }).then(function (r) {
        if (r.status === 401) return logout();
        if (r.ok) {
          toast("Nomor resi #" + activeOdOrder.id + " berhasil disimpan.");
          refresh();
        } else {
          toast(r.data.error || "Gagal simpan resi.", true);
        }
      }).finally(function () {
        btn.disabled = false;
      });
    });

    $("od-cloc-btn").addEventListener("click", function () {
      if (activeOdOrder) {
        var id = activeOdOrder.id;
        closeOrderDetailModal();
        openCourierLoc(id);
      }
    });

    $("od-print-btn").addEventListener("click", function () {
      if (activeOdOrder) {
        printLabel(activeOdOrder.id);
      }
    });

    $("od-pay-btn").addEventListener("click", function () {
      if (activeOdOrder) {
        var id = activeOdOrder.id;
        closeOrderDetailModal();
        openPayProof(id);
      }
    });
  }

  // Klik card pesanan di mobile list
  var mWrapEl = $("orders-mobile-wrap");
  if (mWrapEl) {
    mWrapEl.addEventListener("click", function (e) {
      var card = e.target.closest("[data-od-id]");
      if (card) {
        openOrderDetailModal(Number(card.dataset.odId));
      }
    });
  }

  /* lokasi pesanan: peta Google Maps */
  var locMap = null;
  var locMarker = null;
  var locOverlay = $("location-overlay");
  var mapsLoaded = false;
  var mapsLoading = false;

  function showLocationMap(o) {
    if (!locOverlay) return;
    $("location-address").textContent = o.address || "-";
    $("location-coords").textContent = (o.lat && o.lng) ? "Koordinat: " + o.lat.toFixed(6) + ", " + o.lng.toFixed(6) : "";
    var routeBtn = $("location-route");
    if (storeCfg && o.lat && o.lng) {
      routeBtn.href = "https://www.google.com/maps/dir/?api=1&origin=" + storeCfg.lat + "," + storeCfg.lng + "&destination=" + o.lat + "," + o.lng + "&travelmode=driving";
      routeBtn.hidden = false;
    } else {
      routeBtn.hidden = true;
    }
    locOverlay.classList.add("open");
    if (!window.google || !google.maps) return;
    var lat = Number(o.lat), lng = Number(o.lng);
    if (!locMap) {
      locMap = new google.maps.Map($("location-map"), {
        center: { lat: lat, lng: lng }, zoom: 16,
        mapTypeControl: false, fullscreenControl: false, streetViewControl: false
      });
      locMarker = new google.maps.Marker({ map: locMap });
    }
    var pos = { lat: lat, lng: lng };
    locMarker.setPosition(pos);
    locMap.setCenter(pos);
    locMap.setZoom(16);
  }

  function openLocation(id) {
    var o = allOrders.filter(function (x) { return x.id === id; })[0];
    if (!o || !o.lat || !o.lng) return;
    if (window.google && google.maps) return showLocationMap(o);
    if (mapsLoaded) return showLocationMap(o);
    if (mapsLoading) return;
    mapsLoading = true;
    fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
      if (!cfg.googleMapsApiKey) {
        mapsLoading = false;
        toast("GOOGLE_MAPS_API_KEY belum diatur di .env", true);
        return;
      }
      window.__kickstormAdminMapsReady = function () {
        delete window.__kickstormAdminMapsReady;
        mapsLoaded = true;
        mapsLoading = false;
        showLocationMap(o);
      };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(cfg.googleMapsApiKey) + "&callback=__kickstormAdminMapsReady";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }).catch(function () {
      mapsLoading = false;
      toast("Gagal memuat peta.", true);
    });
  }

  if (locOverlay) {
    $("location-close").addEventListener("click", function () { locOverlay.classList.remove("open"); });
    $("location-cancel").addEventListener("click", function () { locOverlay.classList.remove("open"); });
    locOverlay.addEventListener("click", function (e) { if (e.target === locOverlay) locOverlay.classList.remove("open"); });
  }

  /* ---- Bukti pembayaran ---- */
  var payOverlay = $("pay-overlay");
  function openPayProof(id) {
    var o = allOrders.filter(function (x) { return x.id === id; })[0];
    if (!o || !o.payment_proof) return;
    $("pay-order-tag").textContent = "#" + o.id;
    $("pay-note-view").textContent = o.payment_note || "\u2014";
    $("pay-img").src = o.payment_proof;
    payOverlay.classList.add("open");
    payOverlay._order = o;
  }
  function closePayProof() {
    payOverlay.classList.remove("open");
    $("pay-img").src = "";
  }
  if (payOverlay) {
    $("pay-close").addEventListener("click", closePayProof);
    $("pay-reject").addEventListener("click", function () {
      var o = payOverlay._order;
      if (!o) return;
      if (!confirm("Tolak bukti pesanan #" + o.id + "? Pesanan dibatalkan dan stok dikembalikan.")) return;
      api("/api/admin/orders/" + o.id + "/reject-payment", { method: "POST" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) {
          toast("Pesanan #" + o.id + " dibatalkan.");
          closePayProof();
          refresh();
        } else toast(res.data.error || "Gagal menolak.", true);
      });
    });
    $("pay-verify").addEventListener("click", function () {
      var o = payOverlay._order;
      if (!o) return;
      var btn = $("pay-verify");
      btn.disabled = true;
      api("/api/admin/orders/" + o.id + "/verify-payment", { method: "POST" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) {
          toast("Pembayaran #" + o.id + " diverifikasi.");
          closePayProof();
          refresh();
        } else toast(res.data.error || "Gagal verifikasi.", true);
      }).finally(function () { btn.disabled = false; });
    });
    payOverlay.addEventListener("click", function (e) { if (e.target === payOverlay) closePayProof(); });
  }

  /* ---- Posisi kurir (drag pin) ---- */
  var clMap = null;
  var clMarker = null;
  var clOverlay = $("courier-loc-overlay");
  var clOrderId = null;
  var clDragging = false;

  function openCourierLoc(id) {
    var o = allOrders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    clOrderId = id;
    $("cl-order-tag").textContent = "#" + id + " \u2022 " + escapeHtml(o.customer_name);
    var start = { lat: o.courier_lat ? Number(o.courier_lat) : Number(o.lat), lng: o.courier_lng ? Number(o.courier_lng) : Number(o.lng) };
    if (!start.lat || !start.lng) return toast("Pesanan ini belum punya koordinat tujuan.", true);
    clOverlay.classList.add("open");
    $("cl-coords").textContent = start.lat.toFixed(6) + ", " + start.lng.toFixed(6);
    if (window.google && google.maps) return renderCourierLocMap(start);
    fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
      if (!cfg.googleMapsApiKey) {
        toast("GOOGLE_MAPS_API_KEY belum diatur di .env", true);
        clOverlay.classList.remove("open");
        return;
      }
      window.__kickstormClocReady = function () {
        delete window.__kickstormClocReady;
        renderCourierLocMap(start);
      };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(cfg.googleMapsApiKey) + "&callback=__kickstormClocReady";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }).catch(function () { clOverlay.classList.remove("open"); });
  }

  function renderCourierLocMap(start) {
    var el = $("courier-loc-map");
    if (!clMap) {
      clMap = new google.maps.Map(el, {
        center: start, zoom: 14,
        mapTypeControl: false, fullscreenControl: false, streetViewControl: false
      });
      clMarker = new google.maps.Marker({
        map: clMap, position: start, draggable: true,
        title: "Geser ke posisi kurir",
        label: { text: "\uD83D\uDCE6", fontSize: "18px" }
      });
      clMarker.addListener("dragend", function () {
        clDragging = true;
        $("cl-coords").textContent = clMarker.getPosition().lat().toFixed(6) + ", " + clMarker.getPosition().lng().toFixed(6);
      });
    } else {
      clMarker.setPosition(start);
      clMap.setCenter(start);
    }
  }

  if (clOverlay) {
    $("cl-close").addEventListener("click", function () { clOverlay.classList.remove("open"); });
    $("cl-cancel").addEventListener("click", function () { clOverlay.classList.remove("open"); });
    $("cl-save").addEventListener("click", function () {
      if (!clMarker || !clOrderId) return;
      var pos = clMarker.getPosition();
      var btn = $("cl-save");
      btn.disabled = true;
      api("/api/admin/orders/" + clOrderId + "/courier-location", {
        method: "PUT",
        body: JSON.stringify({ lat: pos.lat(), lng: pos.lng() })
      }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) {
          toast("Posisi kurir #" + clOrderId + " diperbarui \u2014 pelanggan bisa melacak.");
          clOverlay.classList.remove("open");
          renderOrders();
        } else toast(res.data.error || "Gagal simpan posisi.", true);
      }).finally(function () { btn.disabled = false; });
    });
    clOverlay.addEventListener("click", function (e) { if (e.target === clOverlay) clOverlay.classList.remove("open"); });
  }

  /* ---- Cetak label pengiriman ---- */
  function printLabel(id) {
    var o = allOrders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var items = (o.items || []).map(function (i) {
      return i.product_name + " \u00d7" + i.qty + (i.size ? " (Uk. " + i.size + ")" : "");
    }).join(", ");
    var label = $("print-label");
    label.innerHTML =
      '<div class="label-wrap">' +
      '<div class="label-brand">KICKSTORM<small>STORE</small></div>' +
      '<div class="label-kiri">' +
      "<h3>RESI PENGIRIMAN</h3>" +
      '<p><strong>#' + o.id + "</strong> \u2022 " + (STATUS_LABELS[o.status] || o.status) + "</p>" +
      '<p class="label-to">Kepada: <strong>' + escapeHtml(o.customer_name) + "</strong></p>" +
      '<p class="label-addr">' + escapeHtml(o.address) + "</p>" +
      "</div>" +
      '<div class="label-kanan">' +
      '<p class="label-nama"><strong>' + escapeHtml(o.customer_name) + "</strong></p>" +
      '<p class="label-alamat">' + escapeHtml(o.address) + "</p>" +
      "</div>" +
      '<div class="label-kiri">' +
      "<h3>DETAIL PAKET</h3>" +
      '<p class="label-items">' + escapeHtml(items) + "</p>" +
      '<p>Total: <strong>' + rupiah(o.total) + "</strong> \u2022 Kurir: " + escapeHtml(o.courier_name || "-") + "</p>" +
      "</div>" +
      "</div>";
    window.print();
  }

  /* customer modal */
  var cOverlay2 = $("customer-overlay");
  if (cOverlay2) {
    $("customer-close").addEventListener("click", function () { cOverlay2.classList.remove("open"); });
    $("customer-cancel").addEventListener("click", function () { cOverlay2.classList.remove("open"); });
    cOverlay2.addEventListener("click", function (e) { if (e.target === cOverlay2) cOverlay2.classList.remove("open"); });
  }

  /* orders: status change */
  document.getElementById("orders-body").addEventListener("change", function (e) {
    var sel = e.target.closest("[data-status-id]");
    var resi = e.target.closest("[data-resi-id]");
    if (!sel && !resi) return;
    if (resi) {
      var idResi = Number(resi.dataset.resiId);
      api("/api/orders/" + idResi + "/tracking", {
        method: "PUT",
        body: JSON.stringify({ tracking: resi.value })
      }).then(function (r) {
        if (r.status === 401) return logout();
        if (r.ok) toast("Resi pesanan #" + idResi + " disimpan.");
        else { toast(r.data.error || "Gagal simpan resi.", true); resi.value = resi.dataset.old || ""; }
      }).catch(function () {
        resi.value = resi.dataset.old || "";
        toast("Gagal terhubung.", true);
      });
      return;
    }
    var id = sel.dataset.statusId;
    var prev = sel.value;
    sel.disabled = true;
    api("/api/orders/" + id + "/status", {
      method: "PATCH",
      body: JSON.stringify({ status: sel.value })
    }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) toast("Pesanan #" + id + " \u2192 " + STATUS_LABELS[res.data.status]);
      else toast(res.data.error || "Gagal ubah status.", true);
      if (!res.ok) sel.value = prev;
    }).catch(function () {
      sel.value = prev;
      toast("Gagal terhubung.", true);
    }).finally(function () { sel.disabled = false; });
  });

  /* export */
  document.getElementById("export-btn").addEventListener("click", function () {
    if (!token) return;
    fetch("/api/orders/export", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) {
        if (!r.ok) throw new Error("Gagal");
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "orders-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        toast("CSV pesanan diunduh.");
      })
      .catch(function () { toast("Gagal mengekspor.", true); });
  });

  /* product modal */
  var overlay = $("product-overlay");

  function setProductImagePreview(url) {
    var pWrap = $("p-image-preview-wrap");
    var pImg = $("p-image-preview");
    var pClear = $("p-image-clear");
    if (url && url.trim()) {
      pImg.src = url.trim();
      pWrap.style.display = "block";
      if (pClear) pClear.style.display = "inline-block";
    } else {
      pImg.src = "";
      pWrap.style.display = "none";
      if (pClear) pClear.style.display = "none";
    }
  }

  function openModal(product) {
    $("product-modal-title").textContent = product ? "Edit Produk" : "Tambah Produk";
    $("p-id").value = product ? product.id : "";
    $("p-name").value = product ? product.name : "";
    $("p-tag").value = product ? product.tag : "";
    $("p-badge").value = product ? product.badge : "";
    $("p-variant").value = product ? product.variant : "mono";
    $("p-price").value = product ? product.price : "";
    $("p-stock").value = product ? product.stock : "";
    $("p-sold").value = product ? product.sold : 0;
    var imgVal = product && product.image_url ? product.image_url : "";
    $("p-image-url").value = imgVal;
    $("p-image-file").value = "";
    setProductImagePreview(imgVal);
    overlay.classList.add("open");
    setTimeout(function () { $("p-name").focus(); }, 80);
  }
  function closeModal() { overlay.classList.remove("open"); }

  $("p-image-url").addEventListener("input", function () {
    setProductImagePreview(this.value);
  });

  $("p-image-file").addEventListener("change", function () {
    var file = this.files && this.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("Ukuran file maksimal 8MB.", true);
      this.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var base64 = e.target.result;
      $("p-image-url").value = base64;
      setProductImagePreview(base64);
      toast("Foto berhasil dipilih \u2014 klik Simpan untuk mengunggah ke Neon.");
    };
    reader.readAsDataURL(file);
  });

  $("p-image-clear").addEventListener("click", function () {
    $("p-image-file").value = "";
    $("p-image-url").value = "";
    setProductImagePreview("");
  });

  $("add-product-btn").addEventListener("click", function () { openModal(null); });
  $("product-modal-close").addEventListener("click", closeModal);
  $("product-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  $("product-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = $("p-id").value;
    var payload = {
      name: $("p-name").value.trim(),
      tag: $("p-tag").value.trim(),
      badge: $("p-badge").value.trim() || "New",
      variant: $("p-variant").value,
      price: Number($("p-price").value),
      stock: Number($("p-stock").value),
      sold: Number($("p-sold").value) || 0,
      image_url: $("p-image-url").value.trim()
    };
    var btn = $("product-save");
    btn.disabled = true;
    api(id ? "/api/products/" + id : "/api/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast(id ? "Produk & foto diperbarui di Neon." : "Produk & foto disimpan ke Neon.");
        closeModal();
        refresh();
      } else {
        toast(res.data.error || "Gagal menyimpan.", true);
      }
    }).catch(function () { toast("Gagal terhubung.", true); })
      .finally(function () { btn.disabled = false; });
  });

  /* product actions (desktop table & mobile cards) */
  $("panel-products").addEventListener("click", function (e) {
    var edit = e.target.closest("[data-edit]");
    var del = e.target.closest("[data-del]");
    if (edit) {
      api("/api/products").then(function (res) {
        var p = (res.data.products || []).find(function (x) { return x.id === Number(edit.dataset.edit); });
        if (p) openModal(p);
      });
      return;
    }
    if (del) {
      var idNum = Number(del.dataset.del);
      if (!confirm("Hapus produk #" + idNum + "? Tindakan ini permanen.")) return;
      api("/api/products/" + idNum, { method: "DELETE" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) {
          toast("Produk dihapus.");
          refresh();
        } else toast(res.data.error || "Gagal menghapus.", true);
      });
    }
  });

  $("refresh-btn").addEventListener("click", function () {
    toast("Menyegarkan...");
    refresh();
  });

  /* coupon modal */
  var cOverlay = $("coupon-overlay");
  function openCouponModal(couponRow) {
    $("coupon-modal-title").textContent = couponRow ? "Edit Kupon" : "Tambah Kupon";
    $("c-code").value = couponRow ? couponRow.code : "";
    $("c-code-input").value = couponRow ? couponRow.code : "";
    $("c-code-input").disabled = !!couponRow;
    $("c-type").value = couponRow ? couponRow.type : "percent";
    $("c-value").value = couponRow ? couponRow.value : "";
    $("c-min").value = couponRow ? couponRow.min_order : "0";
    $("c-max").value = couponRow ? couponRow.max_uses : "0";
    $("c-expires").value = couponRow && couponRow.expires_at ? couponRow.expires_at : "";
    shiftCouponValueLabel();
    cOverlay.classList.add("open");
    setTimeout(function () { $("c-code-input").focus(); }, 80);
  }
  function closeCouponModal() { cOverlay.classList.remove("open"); }
  function shiftCouponValueLabel() {
    $("c-value").placeholder = $("c-type").value === "percent" ? "contoh: 10 (= 10%)" : "contoh: 50000";
  }

  $("add-coupon-btn").addEventListener("click", function () { openCouponModal(null); });
  $("coupon-modal-close").addEventListener("click", closeCouponModal);
  $("coupon-cancel").addEventListener("click", closeCouponModal);
  cOverlay.addEventListener("click", function (e) { if (e.target === cOverlay) closeCouponModal(); });
  $("c-type").addEventListener("change", shiftCouponValueLabel);

  $("coupon-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("c-code-input").value.trim().toUpperCase();
    var payload = {
      code: code,
      type: $("c-type").value,
      value: Number($("c-value").value),
      min_order: Number($("c-min").value) || 0,
      max_uses: Number($("c-max").value) || 0,
      expires_at: $("c-expires").value || null
    };
    var isEdit = !!$("c-code").value;
    var btn = $("coupon-save");
    btn.disabled = true;
    api(isEdit ? "/api/admin/coupons/" + encodeURIComponent($("c-code").value) : "/api/admin/coupons", {
      method: isEdit ? "PUT" : "POST",
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast(isEdit ? "Kupon diperbarui." : "Kupon " + code + " dibuat.");
        closeCouponModal();
        refresh();
      } else {
        toast(res.data.error || "Gagal menyimpan kupon.", true);
      }
    }).catch(function () { toast("Gagal terhubung.", true); })
      .finally(function () { btn.disabled = false; });
  });

  /* coupon actions (desktop table & mobile cards) */
  $("panel-coupons").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-active]");
    var edit = e.target.closest("[data-cedit]");
    var del = e.target.closest("[data-cdel]");
    if (toggle) {
      api("/api/admin/coupons").then(function (res) {
        var c = (res.data.coupons || []).find(function (x) { return x.code === toggle.dataset.active; });
        if (!c) return;
        api("/api/admin/coupons/" + encodeURIComponent(c.code), {
          method: "PUT",
          body: JSON.stringify({ active: c.active ? 0 : 1 })
        }).then(function (r) {
          if (r.status === 401) return logout();
          if (r.ok) {
            toast("Kupon " + c.code + (c.active ? " dinonaktifkan." : " diaktifkan."));
            refresh();
          } else toast(r.data.error || "Gagal ubah status.", true);
        });
      });
      return;
    }
    if (edit) {
      api("/api/admin/coupons").then(function (res) {
        var c = (res.data.coupons || []).find(function (x) { return x.code === edit.dataset.cedit; });
        if (c) openCouponModal(c);
      });
      return;
    }
    if (del) {
      var code = del.dataset.cdel;
      if (!confirm("Hapus kupon " + code + "? Tindakan ini permanen.")) return;
      api("/api/admin/coupons/" + encodeURIComponent(code), { method: "DELETE" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Kupon dihapus."); refresh(); }
        else toast(res.data.error || "Gagal menghapus.", true);
      });
    }
  });

  /* ---- Referral ---- */
  var referralFormVisible = false;
  function showReferralForm(show) {
    referralFormVisible = show;
    $("referral-form").hidden = !show;
  }

  function renderReferrals() {
    api("/api/admin/referrals").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat referral.", true);
      var refs = res.data.referrals;
      $("tab-referrals-count").textContent = refs.length;
      var body = $("referrals-body");
      var rmWrap = $("referrals-mobile-wrap");
      if (refs.length === 0) {
        body.innerHTML = '<tr><td colspan="6"><div class="empty-state">Belum ada kode referensi.</div></td></tr>';
        if (rmWrap) rmWrap.innerHTML = '<div class="empty-state">Belum ada kode referensi.</div>';
        return;
      }
      body.innerHTML = refs.map(function (r) {
        return "<tr>" +
          '<td class="mono"><strong>' + escapeHtml(r.code) + "</strong></td>" +
          '<td><div class="c-name">' + escapeHtml(r.owner_name) + '</div><span class="muted" style="font-size:.74rem">' + escapeHtml(r.owner_email) + "</span></td>" +
          '<td class="muted">' + (r.max_uses > 0 ? r.max_uses : "\u221e") + "</td>" +
          '<td class="muted">' + r.used_count + "</td>" +
          '<td><span class="badge-pill ' + (r.active ? "" : "badge-off") + '">' + (r.active ? "Aktif" : "Nonaktif") + "</span></td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-r-active="' + escapeHtml(r.code) + '">' + (r.active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
          '<button class="btn btn-danger btn-sm" type="button" data-r-del="' + escapeHtml(r.code) + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (rmWrap) {
        rmWrap.innerHTML = refs.map(function (r) {
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="mono" style="color:var(--volt);font-size:.92rem">' + escapeHtml(r.code) + "</strong>" +
              '<span class="badge-pill ' + (r.active ? "" : "badge-off") + '">' + (r.active ? "Aktif" : "Nonaktif") + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<div><strong class="admin-m-title">' + escapeHtml(r.owner_name) + '</strong><div class="admin-m-sub">' + escapeHtml(r.owner_email) + "</div></div>" +
              '<span class="muted">Terpakai: ' + r.used_count + " / " + (r.max_uses > 0 ? r.max_uses : "\u221e") + "</span>" +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-r-active="' + escapeHtml(r.code) + '">' + (r.active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
              '<button class="btn btn-danger btn-sm" type="button" data-r-del="' + escapeHtml(r.code) + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  $("add-referral-btn").addEventListener("click", function () {
    showReferralForm(!referralFormVisible);
    if (referralFormVisible) $("r-name").focus();
  });
  $("r-cancel").addEventListener("click", function () {
    showReferralForm(false);
    $("r-msg").textContent = "";
  });
  $("r-save").addEventListener("click", function () {
    var msg = $("r-msg");
    var payload = {
      owner_name: $("r-name").value.trim(),
      owner_email: $("r-email").value.trim(),
      code: $("r-code").value.trim(),
      max_uses: Number($("r-max").value) || 1
    };
    if (!payload.owner_name) {
      msg.textContent = "Nama pemilik / referer wajib diisi.";
      return;
    }
    api("/api/admin/referrals", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast("Kode " + res.data.referral.code + " dibuat.");
        $("r-name").value = ""; $("r-email").value = ""; $("r-code").value = "";
        $("r-msg").textContent = "";
        showReferralForm(false);
        renderReferrals();
      } else {
        msg.textContent = res.data.error || "Gagal membuat kode.";
        toast(res.data.error || "Gagal membuat kode.", true);
      }
    }).catch(function () { toast("Gagal terhubung.", true); });
  });

  $("panel-referrals").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-r-active]");
    var del = e.target.closest("[data-r-del]");
    if (toggle) {
      api("/api/admin/referrals").then(function (res) {
        var r = (res.data.referrals || []).find(function (x) { return x.code === toggle.dataset.rActive; });
        if (!r) return;
        api("/api/admin/referrals/" + encodeURIComponent(r.code), {
          method: "PATCH", body: JSON.stringify({ active: r.active ? 0 : 1 })
        }).then(function (rr) {
          if (rr.status === 401) return logout();
          if (rr.ok) { toast("Kode " + r.code + (r.active ? " dinonaktifkan." : " diaktifkan.")); renderReferrals(); }
          else toast(rr.data.error || "Gagal ubah status.", true);
        });
      });
      return;
    }
    if (del) {
      var code = del.dataset.rDel;
      if (!confirm("Hapus kode referensi " + code + "?")) return;
      api("/api/admin/referrals/" + encodeURIComponent(code), { method: "DELETE" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Kode dihapus."); renderReferrals(); }
        else toast(res.data.error || "Gagal menghapus.", true);
      });
    }
  });

  /* ---- Flash Sale ---- */
  var flashFormVisible = false;
  function showFlashForm(show) {
    flashFormVisible = show;
    $("flash-form").hidden = !show;
  }
  function fmtLocal(dt) {
    if (!dt) return "";
    return String(dt).replace(" ", "T").slice(0, 16);
  }

  function renderFlashSales() {
    api("/api/admin/flash-sales").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat flash sale.", true);
      var sales = res.data.flashSales;
      var body = $("flash-body");
      var fmWrap = $("flash-mobile-wrap");
      var now = new Date().toISOString().slice(0, 19).replace("T", " ");
      if (sales.length === 0) {
        body.innerHTML = '<tr><td colspan="6"><div class="empty-state">Belum ada flash sale.</div></td></tr>';
        if (fmWrap) fmWrap.innerHTML = '<div class="empty-state">Belum ada flash sale.</div>';
        return;
      }
      body.innerHTML = sales.map(function (f) {
        var running = f.active === 1 && f.starts_at <= now && f.ends_at > now;
        var statusTxt = running ? "Berjalan" : (f.active === 0 ? "Nonaktif" : "Terjadwal");
        return "<tr>" +
          '<td><div class="c-name">' + escapeHtml(f.name) + "</div></td>" +
          '<td class="price">' + f.discount_percent + "%</td>" +
          '<td class="muted mono">' + escapeHtml(fmtLocal(f.starts_at)) + "</td>" +
          '<td class="muted mono">' + escapeHtml(fmtLocal(f.ends_at)) + "</td>" +
          '<td><span class="badge-pill ' + (running ? "badge-live" : (f.active === 0 ? "badge-off" : "")) + '">' + statusTxt + "</span></td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-f-active="' + f.id + '">' + (f.active === 1 ? "Nonaktifkan" : "Aktifkan") + "</button>" +
          '<button class="btn btn-danger btn-sm" type="button" data-f-del="' + f.id + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (fmWrap) {
        fmWrap.innerHTML = sales.map(function (f) {
          var running = f.active === 1 && f.starts_at <= now && f.ends_at > now;
          var statusTxt = running ? "Berjalan" : (f.active === 0 ? "Nonaktif" : "Terjadwal");
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="admin-m-title">' + escapeHtml(f.name) + "</strong>" +
              '<span class="chip chip-flash">' + f.discount_percent + "% OFF</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="admin-m-sub">' + escapeHtml(fmtLocal(f.starts_at)) + " &rarr; " + escapeHtml(fmtLocal(f.ends_at)) + "</span>" +
              '<span class="badge-pill ' + (running ? "badge-live" : (f.active === 0 ? "badge-off" : "")) + '">' + statusTxt + "</span>" +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-f-active="' + f.id + '">' + (f.active === 1 ? "Nonaktifkan" : "Aktifkan") + "</button>" +
              '<button class="btn btn-danger btn-sm" type="button" data-f-del="' + f.id + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  $("add-flash-btn").addEventListener("click", function () {
    showFlashForm(!flashFormVisible);
    if (flashFormVisible) {
      var now = new Date();
      var start = new Date(now.getTime() + 60000);
      var end = new Date(now.getTime() + 3600000);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      $("f-start").value = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(start.getDate()) + "T" + pad(start.getHours()) + ":" + pad(start.getMinutes());
      $("f-end").value = end.getFullYear() + "-" + pad(end.getMonth() + 1) + "-" + pad(end.getDate()) + "T" + pad(end.getHours()) + ":" + pad(end.getMinutes());
      $("f-name").focus();
    }
  });
  $("f-cancel").addEventListener("click", function () {
    showFlashForm(false);
    $("f-msg").textContent = "";
  });
  $("f-save").addEventListener("click", function () {
    var msg = $("f-msg");
    var payload = {
      name: $("f-name").value.trim(),
      discount_percent: Number($("f-pct").value),
      starts_at: $("f-start").value,
      ends_at: $("f-end").value
    };
    if (!payload.name || !payload.discount_percent || !payload.starts_at || !payload.ends_at) {
      msg.textContent = "Lengkapi nama, diskon, dan waktu.";
      return;
    }
    api("/api/admin/flash-sales", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast("Flash sale " + res.data.flashSale.name + " dibuat.");
        showFlashForm(false);
        renderFlashSales();
      } else toast(res.data.error || "Gagal membuat flash sale.", true);
    }).catch(function () { toast("Gagal terhubung.", true); });
  });

  $("panel-flash").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-f-active]");
    var del = e.target.closest("[data-f-del]");
    if (toggle) {
      api("/api/admin/flash-sales/" + toggle.dataset.fActive, {
        method: "PATCH",
        body: JSON.stringify({ active: e.target.textContent.indexOf("Nonaktifkan") === 0 ? 0 : 1 })
      }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Status flash sale diubah."); renderFlashSales(); }
        else toast(res.data.error || "Gagal ubah status.", true);
      });
      return;
    }
    if (del) {
      if (!confirm("Hapus flash sale ini?")) return;
      api("/api/admin/flash-sales/" + del.dataset.fDel, { method: "DELETE" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Flash sale dihapus."); renderFlashSales(); }
        else toast(res.data.error || "Gagal menghapus.", true);
      });
    }
  });

  /* ---- Drop ---- */
  var dropFormVisible = false;
  function showDropForm(show) {
    dropFormVisible = show;
    $("drop-form").hidden = !show;
  }

  function renderDrops() {
    api("/api/admin/drops").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return;
      var drops = res.data.drops || [];
      var now = new Date().toISOString().slice(0, 19).replace("T", " ");
      var body = $("drops-body");
      var dmWrap = $("drops-mobile-wrap");
      if (drops.length === 0) {
        body.innerHTML = '<tr><td colspan="5"><div class="empty-state">Belum ada drop terjadwal.</div></td></tr>';
        if (dmWrap) dmWrap.innerHTML = '<div class="empty-state">Belum ada drop terjadwal.</div>';
        return;
      }
      body.innerHTML = drops.map(function (d) {
        var upcoming = d.release_at > now;
        var live = d.release_at <= now;
        var statusTxt = upcoming ? (d.queue_enabled ? "Antrian \u2022 Akan rilis" : "Terjadwal") : (d.queue_enabled ? "Berlangsung \u2022 Antrian" : "Berlangsung");
        var badgeCls = live ? "badge-live" : "";
        return "<tr>" +
          '<td><div class="c-name">' + escapeHtml(d.name) + "</div></td>" +
          '<td class="muted">' + (d.product_name ? escapeHtml(d.product_name) : "\u2014") + "</td>" +
          '<td class="muted mono">' + escapeHtml(fmtLocal(d.release_at)) + "</td>" +
          '<td><span class="badge-pill ' + badgeCls + '">' + statusTxt + "</span></td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-danger btn-sm" type="button" data-d-del="' + d.id + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (dmWrap) {
        dmWrap.innerHTML = drops.map(function (d) {
          var upcoming = d.release_at > now;
          var live = d.release_at <= now;
          var statusTxt = upcoming ? (d.queue_enabled ? "Antrian \u2022 Akan rilis" : "Terjadwal") : (d.queue_enabled ? "Berlangsung \u2022 Antrian" : "Berlangsung");
          var badgeCls = live ? "badge-live" : "";
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="admin-m-title">' + escapeHtml(d.name) + "</strong>" +
              '<span class="badge-pill ' + badgeCls + '">' + statusTxt + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="admin-m-sub">' + (d.product_name ? escapeHtml(d.product_name) : "Semua produk") + " \u2022 " + escapeHtml(fmtLocal(d.release_at)) + "</span>" +
              (d.queue_enabled ? '<span class="chip chip-queue">Mode Antrian</span>' : "") +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-danger btn-sm" type="button" data-d-del="' + d.id + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  $("add-drop-btn").addEventListener("click", function () {
    showDropForm(!dropFormVisible);
    if (dropFormVisible) {
      var now = new Date();
      var start = new Date(now.getTime() + 60000);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      $("d-release").value = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(start.getDate()) + "T" + pad(start.getHours()) + ":" + pad(start.getMinutes());
      api("/api/products").then(function (r) {
        var body = $("d-product");
        if (!r.ok) return;
        body.innerHTML = '<option value="">Tanpa produk</option>' + (r.data.products || []).map(function (p) {
          return '<option value="' + p.id + '">' + escapeHtml(p.name) + "</option>";
        }).join("");
      });
      $("d-name").focus();
    }
  });
  $("d-cancel").addEventListener("click", function () {
    showDropForm(false);
    $("d-msg").textContent = "";
  });
  $("d-save").addEventListener("click", function () {
    var msg = $("d-msg");
    var payload = {
      name: $("d-name").value.trim(),
      product_id: $("d-product").value ? Number($("d-product").value) : null,
      release_at: $("d-release").value,
      queue_enabled: $("d-queue").checked ? 1 : 0
    };
    if (!payload.name || !payload.release_at) {
      msg.textContent = "Nama dan waktu rilis wajib diisi.";
      return;
    }
    api("/api/admin/drops", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast("Drop \u201c" + res.data.drop.name + "\u201d dijadwalkan.");
        showDropForm(false);
        renderDrops();
      } else {
        msg.textContent = res.data.error || "Gagal membuat drop.";
        msg.className = "form-msg err";
      }
    }).catch(function () { toast("Gagal terhubung.", true); });
  });

  $("panel-drops").addEventListener("click", function (e) {
    var del = e.target.closest("[data-d-del]");
    if (!del) return;
    if (!confirm("Hapus drop ini? Pesanan yang sudah masuk tidak terpengaruh.")) return;
    api("/api/admin/drops/" + del.dataset.dDel, { method: "DELETE" }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) { toast("Drop dihapus."); renderDrops(); }
      else toast(res.data.error || "Gagal menghapus.", true);
    });
  });

  /* ---- Kurir ---- */
  var courierFormVisible = false;
  function showCourierForm(show) {
    courierFormVisible = show;
    $("courier-form").hidden = !show;
  }

  function renderCouriers() {
    api("/api/admin/couriers").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return;
      var list = res.data.couriers || [];
      var body = $("couriers-body");
      var kmWrap = $("couriers-mobile-wrap");
      if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="5"><div class="empty-state">Belum ada kurir.</div></td></tr>';
        if (kmWrap) kmWrap.innerHTML = '<div class="empty-state">Belum ada kurir.</div>';
        return;
      }
      body.innerHTML = list.map(function (c) {
        var tiers = (c.tiers || []).map(function (t) { return "s.d. " + t.max + " km: " + rupiah(t.cost); }).join("<br>");
        return "<tr>" +
          '<td><div class="c-name">' + escapeHtml(c.name) + "</div></td>" +
          '<td class="muted" style="font-size:.74rem">' + tiers + "</td>" +
          '<td>' + (c.cod_km > 0 ? '<span class="chip chip-cod">COD ' + c.cod_km + " km</span>" : '<span class="chip">Non-COD</span>') + "</td>" +
          '<td><span class="badge-pill ' + (c.active ? "" : "badge-off") + '">' + (c.active ? "Aktif" : "Nonaktif") + "</span></td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-k-active="' + c.id + '">' + (c.active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
          '<button class="btn btn-danger btn-sm" type="button" data-k-del="' + c.id + '">Hapus</button>' +
          "</div></td></tr>";
      }).join("");

      if (kmWrap) {
        kmWrap.innerHTML = list.map(function (c) {
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="admin-m-title">🛵 ' + escapeHtml(c.name) + "</strong>" +
              '<span class="badge-pill ' + (c.active ? "" : "badge-off") + '">' + (c.active ? "Aktif" : "Nonaktif") + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="admin-m-sub">' + (c.cod_km > 0 ? "COD s.d. " + c.cod_km + " km" : "Non-COD") + "</span>" +
            "</div>" +
            '<div class="admin-m-actions">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-k-active="' + c.id + '">' + (c.active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
              '<button class="btn btn-danger btn-sm" type="button" data-k-del="' + c.id + '">Hapus</button>' +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  $("add-courier-btn").addEventListener("click", function () {
    showCourierForm(!courierFormVisible);
    if (courierFormVisible) $("k-name").focus();
  });
  $("k-cancel").addEventListener("click", function () {
    showCourierForm(false);
    $("k-msg").textContent = "";
  });
  $("k-save").addEventListener("click", function () {
    var msg = $("k-msg");
    var tiersRaw;
    try {
      tiersRaw = JSON.parse($("k-tiers").value.trim());
    } catch (e) {
      msg.textContent = "Tier ongkir harus JSON valid.";
      msg.className = "form-msg err";
      return;
    }
    var payload = {
      name: $("k-name").value.trim(),
      tiers: tiersRaw,
      cod_km: Number($("k-cod").value) || 0
    };
    if (!payload.name) {
      msg.textContent = "Nama kurir wajib diisi.";
      return;
    }
    api("/api/admin/couriers", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        toast("Kurir " + res.data.courier.name + " ditambahkan.");
        $("k-name").value = ""; $("k-cod").value = ""; $("k-tiers").value = "";
        showCourierForm(false);
        renderCouriers();
      } else {
        msg.textContent = res.data.error || "Gagal menambah kurir.";
        msg.className = "form-msg err";
      }
    }).catch(function () { toast("Gagal terhubung.", true); });
  });

  $("panel-couriers").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-k-active]");
    var del = e.target.closest("[data-k-del]");
    if (toggle) {
      api("/api/admin/couriers/" + toggle.dataset.kActive, {
        method: "PATCH",
        body: JSON.stringify({ active: e.target.textContent.indexOf("Nonaktifkan") === 0 ? 0 : 1 })
      }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Status kurir diubah."); renderCouriers(); }
        else toast(res.data.error || "Gagal ubah status.", true);
      });
      return;
    }
    if (del) {
      if (!confirm("Hapus kurir ini? Pesanan lama tetap memakai nama kurir yang tersimpan.")) return;
      api("/api/admin/couriers/" + del.dataset.kDel, { method: "DELETE" }).then(function (res) {
        if (res.status === 401) return logout();
        if (res.ok) { toast("Kurir dihapus."); renderCouriers(); }
        else toast(res.data.error || "Gagal menghapus.", true);
      });
    }
  });

  /* ---- Member ---- */
  function renderMembers() {
    api("/api/admin/members").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return;
      var members = res.data.members || [];
      var body = $("members-body");
      var mmWrap = $("members-mobile-wrap");
      if (members.length === 0) {
        body.innerHTML = '<tr><td colspan="6"><div class="empty-state">Belum ada member \u2014 poin diberikan otomatis saat checkout.</div></td></tr>';
        if (mmWrap) mmWrap.innerHTML = '<div class="empty-state">Belum ada member.</div>';
        return;
      }
      body.innerHTML = members.map(function (m) {
        return "<tr>" +
          '<td><div class="c-name">' + escapeHtml(m.name) + "</div></td>" +
          '<td class="muted">' + escapeHtml(m.email) + "</td>" +
          '<td class="price">' + Number(m.points).toLocaleString("id-ID") + "</td>" +
          '<td><span class="badge-pill">' + escapeHtml(m.level) + "</span></td>" +
          '<td class="muted">' + m.orders + "</td>" +
          '<td class="muted">' + (m.birth_month ? String(m.birth_month).padStart(2, "0") + "-" + String(m.birth_day).padStart(2, "0") : "\u2014") + "</td>" +
          "</tr>";
      }).join("");

      if (mmWrap) {
        mmWrap.innerHTML = members.map(function (m) {
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="admin-m-title">👤 ' + escapeHtml(m.name) + "</strong>" +
              '<span class="badge-pill">' + escapeHtml(m.level || "Bronze") + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="admin-m-sub">' + escapeHtml(m.email) + "</span>" +
              '<strong class="price">' + Number(m.points || 0).toLocaleString("id-ID") + " Poin</strong>" +
            "</div>" +
            '<div class="admin-m-mid" style="font-size:.76rem;color:var(--muted)">' +
              "<span>Total Order: " + (m.orders || 0) + "</span>" +
              "<span>Ultah: " + (m.birth_month ? String(m.birth_month).padStart(2, "0") + "-" + String(m.birth_day).padStart(2, "0") : "-") + "</span>" +
            "</div>" +
          "</div>";
        }).join("");
      }
    });
  }

  $("copy-subscribers-btn").addEventListener("click", function () {
    api("/api/admin/subscribers").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat subscriber.", true);
      var emails = (res.data.emails || []);
      if (emails.length === 0) return toast("Belum ada subscriber.");
      var text = emails.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { toast(emails.length + " email disalin \u2014 tempel di email/WhatsApp."); })
          .catch(function () { fallbackCopyAdmin(text); });
      } else fallbackCopyAdmin(text);
    });
  });

  function fallbackCopyAdmin(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Email disalin."); } catch (e) { toast("Salin manual: " + text.slice(0, 80), true); }
    ta.remove();
  }

  /* ---- Pengaturan ---- */
  function buildTierRows(tiers) {
    var rows = tiers || [{ max: 5, cost: 15000 }, { max: 10, cost: 25000 }, { max: 25, cost: 40000 }, { max: 9999, cost: 60000 }];
    $("tier-rows").innerHTML = rows.map(function (t, i) {
      return '<div class="tier-row" data-i="' + i + '">' +
        '<input class="field tier-max" type="number" min="0" value="' + t.max + '" aria-label="Maksimum km">' +
        '<span>km maks &rarr;</span>' +
        '<input class="field tier-cost" type="number" min="0" value="' + t.cost + '" aria-label="Biaya ongkir">' +
        '<span>Rp</span>' +
        '<button class="btn btn-danger btn-sm tier-del" type="button" aria-label="Hapus tier">\u00d7</button>' +
        "</div>";
    }).join("");
  }

  function renderSettings() {
    api("/api/admin/settings").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal memuat pengaturan.", true);
      var s = res.data.settings;
      storeCfg = { name: s.store_name, lat: Number(s.store_lat), lng: Number(s.store_lng) };
      if (!storeCfgReady) {
        storeCfgReady = true;
        renderOrders();
      }
      $("s-name").value = s.store_name || "";
      $("s-lat").value = s.store_lat || "";
      $("s-lng").value = s.store_lng || "";
      $("s-free").value = s.free_shipping_min || "0";
      $("s-max").value = s.max_shipping_km || "0";
      $("s-wa").value = s.wa_number || "";
      $("s-payflow").checked = s.payment_flow === "1";
      var tiers = [];
      try { tiers = JSON.parse(s.shipping_tiers || "[]"); } catch (e) { tiers = []; }
      buildTierRows(Array.isArray(tiers) ? tiers : []);
    });
  }

  $("tier-add").addEventListener("click", function () {
    var rows = $("tier-rows");
    var n = rows.children.length;
    rows.insertAdjacentHTML("beforeend",
      '<div class="tier-row" data-i="' + n + '">' +
      '<input class="field tier-max" type="number" min="0" value="9999" aria-label="Maksimum km">' +
      '<span>km maks &rarr;</span>' +
      '<input class="field tier-cost" type="number" min="0" value="15000" aria-label="Biaya ongkir">' +
      '<span>Rp</span>' +
      '<button class="btn btn-danger btn-sm tier-del" type="button" aria-label="Hapus tier">\u00d7</button></div>');
  });

  $("tier-rows").addEventListener("click", function (e) {
    var del = e.target.closest(".tier-del");
    if (del) del.parentElement.remove();
  });

  $("settings-save").addEventListener("click", function () {
    var msg = $("settings-msg");
    var tiers = Array.prototype.map.call($("tier-rows").children, function (row) {
      return {
        max: Number(row.querySelector(".tier-max").value),
        cost: Number(row.querySelector(".tier-cost").value)
      };
    });
    var payload = {
      store_name: $("s-name").value.trim(),
      store_lat: Number($("s-lat").value),
      store_lng: Number($("s-lng").value),
      free_shipping_min: Number($("s-free").value) || 0,
      max_shipping_km: Number($("s-max").value) || 0,
      wa_number: $("s-wa").value,
      shipping_tiers: tiers,
      payment_flow: $("s-payflow").checked ? 1 : 0
    };
    api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) {
        msg.textContent = "\u2713 Pengaturan tersimpan.";
        msg.className = "form-msg ok";
        toast("Pengaturan tersimpan.");
        renderSettings();
        renderOrders();
      } else {
        msg.textContent = res.data.error || "Gagal simpan.";
        msg.className = "form-msg err";
      }
    }).catch(function () {
      msg.textContent = "Gagal terhubung.";
      msg.className = "form-msg err";
    });
  });

  /* ---- Restock Waitlist ---- */
  function renderWaitlist() {
    api("/api/admin/restock-waitlist").then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return;
      var rows = res.data.waitlist || [];
      $("waitlist-card").hidden = rows.length === 0;
      var body = $("waitlist-body");
      var wmWrap = $("waitlist-mobile-wrap");
      if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="5"><div class="empty-state">Belum ada yang minta notifikasi restock.</div></td></tr>';
        if (wmWrap) wmWrap.innerHTML = '<div class="empty-state">Belum ada yang minta notifikasi restock.</div>';
        return;
      }
      body.innerHTML = rows.map(function (w) {
        return "<tr>" +
          '<td><div class="c-name">' + escapeHtml(w.product_name) + "</div></td>" +
          '<td class="muted">' + escapeHtml(w.email) + "</td>" +
          '<td><span class="badge-pill ' + (w.notified ? "badge-off" : "") + '">' + (w.notified ? "Dinotifikasi" : "Menunggu") + "</span></td>" +
          '<td class="muted mono" style="font-size:.74rem">' + new Date(w.created_at.replace(" ", "T")).toLocaleString("id-ID", { day: "2-digit", month: "short" }) + "</td>" +
          '<td>' + (w.notified ? "" : '<button class="btn btn-ghost btn-sm" type="button" data-w-notify="' + w.id + '">Tandai</button>') + "</td></tr>";
      }).join("");

      if (wmWrap) {
        wmWrap.innerHTML = rows.map(function (w) {
          return '<div class="admin-m-card">' +
            '<div class="admin-m-top">' +
              '<strong class="admin-m-title">' + escapeHtml(w.product_name) + "</strong>" +
              '<span class="badge-pill ' + (w.notified ? "badge-off" : "") + '">' + (w.notified ? "Dinotifikasi" : "Menunggu") + "</span>" +
            "</div>" +
            '<div class="admin-m-mid">' +
              '<span class="admin-m-sub">' + escapeHtml(w.email) + "</span>" +
              '<span class="muted mono" style="font-size:.74rem">' + new Date(w.created_at.replace(" ", "T")).toLocaleString("id-ID", { day: "2-digit", month: "short" }) + "</span>" +
            "</div>" +
            (w.notified ? "" : '<div class="admin-m-actions"><button class="btn btn-ghost btn-sm" type="button" data-w-notify="' + w.id + '">Tandai</button></div>') +
          "</div>";
        }).join("");
      }
    });
  }

  $("waitlist-card").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-w-notify]");
    if (!btn) return;
    api("/api/admin/restock-waitlist/" + btn.dataset.wNotify + "/notify", { method: "POST" }).then(function (res) {
      if (res.status === 401) return logout();
      if (res.ok) { toast("Ditandai sudah dinotifikasi."); renderWaitlist(); }
      else toast(res.data.error || "Gagal.", true);
    });
  });

  $("waitlist-email-all").addEventListener("click", function () {
    api("/api/admin/restock-waitlist/notify-all", { method: "POST" }).then(function (res) {
      if (res.status === 401) return logout();
      if (!res.ok) return toast(res.data.error || "Gagal.", true);
      if (res.data.count === 0) return toast("Tidak ada yang menunggu notifikasi.");
      var emails = res.data.emails.join("\n");
      var dest = prompt(res.data.count + " email siap dikirim. Salin daftar ini lalu kirim via email/WhatsApp:", emails);
      if (dest !== null && navigator.clipboard) navigator.clipboard.writeText(emails).catch(function () { });
      toast(res.data.count + " entri ditandai terkirim.");
      renderWaitlist();
    });
  });

  $("waitlist-refresh").addEventListener("click", renderWaitlist);

  /* ---- Google Maps Platform (GMP MCP Standards) ---- */
  var gmpApiKey = "";
  var mapAll = null;
  var mapAllMarkers = [];
  var mapAllStoreMarker = null;
  var mapAllInfo = null;
  var mapAllStarted = false;

  var storeMap = null;
  var storeMapMarker = null;
  var storeMapStarted = false;
  var storeGeocoder = null;

  function loadGMP(key) {
    if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve();
    return new Promise(function (resolve) {
      (function (g) {
        var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
        b[c] = b[c] || {};
        var d = b[c].maps = b[c].maps || {}, r = new Set(), e = new URLSearchParams(), u = function () {
          return h || (h = new Promise(function (f, n) {
            a = m.createElement("script");
            e.set("libraries", Array.from(r) + "");
            for (k in g) e.set(k.replace(/[A-Z]/g, function (t) { return "_" + t[0].toLowerCase(); }), g[k]);
            e.set("callback", c + ".maps." + q);
            a.src = "https://maps." + c + "apis.com/maps/api/js?" + e;
            d[q] = f;
            a.onerror = function () { h = n(Error(p + " could not load.")); };
            a.nonce = (m.querySelector("script[nonce]") && m.querySelector("script[nonce]").nonce) || "";
            m.head.append(a);
          }));
        };
        d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = function (f) {
          var n = Array.prototype.slice.call(arguments, 1);
          return r.add(f) && u().then(function () { return d[l].apply(d, [f].concat(n)); });
        };
      })({
        key: key,
        v: "weekly",
        internalUsageAttributionIds: "gmp_mcp_codeassist_v0.1_github"
      });
      resolve();
    });
  }

  function refreshMap() {
    var panel = $("panel-map");
    if (!panel || !panel.classList.contains("active") || !mapAll) return;
    var withLoc = allOrders.filter(function (o) { return o.lat && o.lng; });
    if (withLoc.length === 0 && (!storeCfg || !storeCfg.lat || !storeCfg.lng)) {
      $("map-all-hint").textContent = "Belum ada pesanan dengan lokasi peta.";
      return;
    }

    mapAllMarkers.forEach(function (m) {
      if (m.setMap) m.setMap(null);
      else if (m.map !== undefined) m.map = null;
    });
    mapAllMarkers = [];
    if (mapAllStoreMarker) {
      if (mapAllStoreMarker.setMap) mapAllStoreMarker.setMap(null);
      else if (mapAllStoreMarker.map !== undefined) mapAllStoreMarker.map = null;
      mapAllStoreMarker = null;
    }

    var bounds = new google.maps.LatLngBounds();
    var colors = {
      awaiting_payment: "#f5f5f2",
      pending: "#ffaa00",
      paid: "#f5c542",
      shipped: "#5aa9ff",
      delivered: "#54d98c",
      cancelled: "#ff5a4e"
    };

    if (!mapAllInfo) {
      mapAllInfo = new google.maps.InfoWindow();
    }

    // Add Store Marker
    if (storeCfg && storeCfg.lat && storeCfg.lng) {
      var storePos = { lat: Number(storeCfg.lat), lng: Number(storeCfg.lng) };
      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        var storeEl = document.createElement("div");
        storeEl.innerHTML = '<div style="background:#D6FF3F;color:#0A0A0C;font-weight:700;font-size:11px;padding:5px 9px;border-radius:20px;border:2px solid #0A0A0C;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:4px">🏬 ' + escapeHtml(storeCfg.name || "Toko KICKSTORM") + '</div>';
        mapAllStoreMarker = new google.maps.marker.AdvancedMarkerElement({
          position: storePos,
          map: mapAll,
          title: "Toko KICKSTORM",
          content: storeEl
        });
      } else {
        mapAllStoreMarker = new google.maps.Marker({
          position: storePos,
          map: mapAll,
          title: "Toko KICKSTORM",
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#D6FF3F",
            fillOpacity: 1,
            strokeColor: "#0A0A0C",
            strokeWeight: 2
          }
        });
      }
      bounds.extend(storePos);
    }

    // Add Order Markers
    withLoc.forEach(function (o) {
      var pos = { lat: Number(o.lat), lng: Number(o.lng) };
      var marker = null;
      var statusColor = colors[o.status] || "#9c9c9c";
      var statusLabel = STATUS_LABELS[o.status] || o.status;

      var infoContent = '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:12px;color:#141416;min-width:200px;line-height:1.4">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:3px">#' + o.id + " \u2014 " + escapeHtml(o.customer_name) + '</div>' +
        '<div style="color:#444;margin-bottom:6px;font-size:11px">' + escapeHtml(o.address) + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<span style="background:' + statusColor + ';color:#141416;font-weight:600;font-size:10px;padding:2px 6px;border-radius:4px">' + statusLabel + '</span>' +
        '<strong style="font-size:12px">' + rupiah(o.total) + '</strong>' +
        '</div>' +
        '<a href="https://www.google.com/maps/dir/?api=1&destination=' + o.lat + ',' + o.lng + '&travelmode=driving" target="_blank" rel="noopener" style="display:block;text-align:center;background:#141416;color:#D6FF3F;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11px">📍 Buka Rute Google Maps ↗</a>' +
        '</div>';

      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        var pin = document.createElement("div");
        pin.style.width = "14px";
        pin.style.height = "14px";
        pin.style.borderRadius = "50%";
        pin.style.backgroundColor = statusColor;
        pin.style.border = "2px solid #141416";
        pin.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";
        marker = new google.maps.marker.AdvancedMarkerElement({
          position: pos,
          map: mapAll,
          title: "#" + o.id + " " + o.customer_name,
          content: pin
        });
        marker.addListener("click", function () {
          mapAllInfo.setContent(infoContent);
          mapAllInfo.open({ map: mapAll, anchor: marker });
        });
      } else {
        marker = new google.maps.Marker({
          position: pos,
          map: mapAll,
          title: "#" + o.id + " " + o.customer_name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: statusColor,
            fillOpacity: 0.95,
            strokeColor: "#141416",
            strokeWeight: 2
          }
        });
        marker.addListener("click", function () {
          mapAllInfo.setContent(infoContent);
          mapAllInfo.open(mapAll, marker);
        });
      }

      mapAllMarkers.push(marker);
      bounds.extend(pos);
    });

    if (withLoc.length > 0 || (storeCfg && storeCfg.lat)) {
      mapAll.fitBounds(bounds);
      google.maps.event.addListenerOnce(mapAll, "idle", function () {
        if (mapAll.getZoom() > 14) mapAll.setZoom(14);
      });
    }

    $("map-all-hint").textContent = withLoc.length + " pesanan aktif terpasang di peta radar.";
    $("map-legend").hidden = false;
  }

  async function ensureMapAll() {
    var el = $("map-all");
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    if (mapAllStarted) {
      refreshMap();
      return;
    }
    mapAllStarted = true;

    try {
      var cfgRes = await fetch("/api/config").then(function (r) { return r.json(); });
      gmpApiKey = cfgRes.googleMapsApiKey || "";
      if (!gmpApiKey) {
        $("map-all-hint").textContent = "Atur GOOGLE_MAPS_API_KEY di file .env untuk mengaktifkan peta interaktif.";
        return;
      }

      await loadGMP(gmpApiKey);
      var mapsLib = await google.maps.importLibrary("maps");
      await google.maps.importLibrary("marker").catch(function () { return null; });

      var centerPos = storeCfg && storeCfg.lat ? { lat: Number(storeCfg.lat), lng: Number(storeCfg.lng) } : { lat: -6.2, lng: 106.816666 };

      mapAll = new mapsLib.Map(el, {
        center: centerPos,
        zoom: 11,
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false
      });

      refreshMap();
    } catch (err) {
      console.warn("Error loading admin map:", err);
      mapAllStarted = false;
    }
  }

  /* ---- Store Map Picker di Pengaturan Toko ---- */
  async function ensureStoreMap() {
    var el = $("store-map");
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    if (storeMapStarted) {
      updateStoreMapMarker();
      return;
    }
    storeMapStarted = true;

    try {
      var cfgRes = await fetch("/api/config").then(function (r) { return r.json(); });
      gmpApiKey = cfgRes.googleMapsApiKey || "";
      if (!gmpApiKey) {
        $("store-map-hint").textContent = "Atur GOOGLE_MAPS_API_KEY di file .env untuk memilih lokasi toko langsung dari peta.";
        return;
      }

      await loadGMP(gmpApiKey);
      var mapsLib = await google.maps.importLibrary("maps");
      await google.maps.importLibrary("marker").catch(function () { return null; });
      var geocodingLib = await google.maps.importLibrary("geocoding").catch(function () { return null; });

      if (geocodingLib && geocodingLib.Geocoder) {
        storeGeocoder = new geocodingLib.Geocoder();
      } else if (google.maps.Geocoder) {
        storeGeocoder = new google.maps.Geocoder();
      }

      var curLat = Number($("s-lat").value) || -6.2087634;
      var curLng = Number($("s-lng").value) || 106.845599;
      var centerPos = { lat: curLat, lng: curLng };

      storeMap = new mapsLib.Map(el, {
        center: centerPos,
        zoom: 14,
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        gestureHandling: "greedy"
      });

      function onStorePosChanged(lat, lng) {
        $("s-lat").value = Number(lat).toFixed(6);
        $("s-lng").value = Number(lng).toFixed(6);
        if (storeGeocoder) {
          storeGeocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, function (results, status) {
            if (status === "OK" && results && results[0]) {
              $("store-map-hint").textContent = "\u2713 Lokasi Toko: " + results[0].formatted_address;
            } else {
              $("store-map-hint").textContent = "\u2713 Koordinat: " + Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5);
            }
          });
        } else {
          $("store-map-hint").textContent = "\u2713 Koordinat: " + Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5);
        }
      }

      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        storeMapMarker = new google.maps.marker.AdvancedMarkerElement({
          position: centerPos,
          map: storeMap,
          gmpDraggable: true,
          title: "Geser pin untuk menentukan titik lokasi toko"
        });
        storeMapMarker.addListener("dragend", function () {
          var p = storeMapMarker.position;
          var rlat = typeof p.lat === "function" ? p.lat() : p.lat;
          var rlng = typeof p.lng === "function" ? p.lng() : p.lng;
          onStorePosChanged(rlat, rlng);
        });
      } else {
        storeMapMarker = new google.maps.Marker({
          position: centerPos,
          map: storeMap,
          draggable: true,
          title: "Geser pin untuk menentukan titik lokasi toko"
        });
        storeMapMarker.addListener("dragend", function () {
          var p = storeMapMarker.getPosition();
          onStorePosChanged(p.lat(), p.lng());
        });
      }

      storeMap.addListener("click", function (e) {
        if (e.latLng) {
          var lat = e.latLng.lat();
          var lng = e.latLng.lng();
          var newPos = { lat: lat, lng: lng };
          if (storeMapMarker.position !== undefined) {
            storeMapMarker.position = newPos;
          } else if (storeMapMarker.setPosition) {
            storeMapMarker.setPosition(newPos);
          }
          storeMap.panTo(newPos);
          onStorePosChanged(lat, lng);
        }
      });

      onStorePosChanged(curLat, curLng);

      // Listen to manual typing on s-lat / s-lng
      $("s-lat").addEventListener("input", syncStoreInputToMap);
      $("s-lng").addEventListener("input", syncStoreInputToMap);
    } catch (err) {
      console.warn("Error loading store map picker:", err);
      storeMapStarted = false;
    }
  }

  function syncStoreInputToMap() {
    var lat = Number($("s-lat").value);
    var lng = Number($("s-lng").value);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      var pos = { lat: lat, lng: lng };
      if (storeMap && storeMapMarker) {
        if (storeMapMarker.position !== undefined) storeMapMarker.position = pos;
        else if (storeMapMarker.setPosition) storeMapMarker.setPosition(pos);
        storeMap.panTo(pos);
      }
    }
  }

  function updateStoreMapMarker() {
    syncStoreInputToMap();
  }

  var chartTimer;
  window.addEventListener("resize", function () {
    clearTimeout(chartTimer);
    chartTimer = setTimeout(function () {
      if (token && !$("chart-card").hidden) {
        api("/api/admin/sales").then(function (res) {
          if (res.ok) renderSalesChart(res.data.points);
        });
      }
    }, 200);
  });

  /* ---- Live order via SSE ---- */
  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch (e) { }
  }

  function connectEvents() {
    if (window.__ksSse) return;
    try {
      var es = new EventSource("/api/admin/events?token=" + encodeURIComponent(token));
      window.__ksSse = es;
      es.onmessage = function (ev) {
        var d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (!d || d.type !== "order") return;
        var txt = "Pesanan baru #" + d.id + " \u2014 " + (d.customer || "?") + " (" + rupiah(d.total || 0) + ")";
        toast(txt);
        beep();
        if (typeof window !== "undefined" && window.Notification && window.Notification.permission === "granted") {
          try {
            new window.Notification("KICKSTORM \u2014 Pesanan baru", { body: "#" + d.id + " " + (d.customer || "") + " \u2022 " + rupiah(d.total || 0) });
          } catch (e) {}
        }
        if (document.visibilityState === "hidden") refresh();
      };
      es.onerror = function () { };
    } catch (e) { }
  }

  if (token && typeof window !== "undefined" && window.Notification && window.Notification.permission === "default") {
    try {
      window.Notification.requestPermission().catch(function () { });
    } catch (e) {}
  }

  if (token) {
    api("/api/orders").then(function (res) {
      if (res.ok) {
        showApp();
        refresh();
        connectEvents();
      } else if (res.status === 401) {
        logout("Sesi telah berakhir, silakan masukkan password kembali.");
      } else {
        showApp();
        refresh();
      }
    }).catch(function () {
      showApp();
      refresh();
    });
  } else {
    showLogin();
  }
})();

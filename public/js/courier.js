(function () {
  var orders = [];
  var currentFilter = "active";
  var watchId = null;
  var courierName = localStorage.getItem("ks_courier_name") || "Kurir KICKSTORM";
  var savedShareUrl = localStorage.getItem("ks_courier_share_url") || "";

  function rupiah(n) { return "Rp " + Number(n || 0).toLocaleString("id-ID"); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, isErr) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.borderColor = isErr ? "var(--red)" : "var(--volt)";
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  function getNavigationUrl(o) {
    if (o.maps_url && o.maps_url.trim()) {
      return o.maps_url.trim();
    }
    if (o.lat && o.lng) {
      return "https://www.google.com/maps/dir/?api=1&destination=" + o.lat + "," + o.lng + "&travelmode=driving";
    }
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(o.address || "Jakarta") + "&travelmode=driving";
  }

  function getWhatsAppUrl(o) {
    var msg = "Halo Kak " + (o.customer_name || "") + ", saya kurir dari KICKSTORM sedang mengantar pesanan #" + o.id + " ke alamat Anda. Mohon stand by ya.";
    return "https://wa.me/?text=" + encodeURIComponent(msg);
  }

  function fetchOrders() {
    var listEl = document.getElementById("orders-list");
    fetch("/api/courier/orders")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        orders = data.orders || [];
        updateCounts();
        renderOrders();
      })
      .catch(function () {
        if (listEl) listEl.innerHTML = '<div class="empty-state">Gagal terhubung ke server. Periksa koneksi internetmu.</div>';
      });
  }

  function updateCounts() {
    var activeCount = orders.filter(function (o) { return o.status === "shipped" || o.status === "paid" || o.status === "pending" || o.status === "awaiting_payment"; }).length;
    var shippedCount = orders.filter(function (o) { return o.status === "shipped"; }).length;
    var readyCount = orders.filter(function (o) { return o.status === "paid" || o.status === "pending"; }).length;
    var deliveredCount = orders.filter(function (o) { return o.status === "delivered"; }).length;

    document.getElementById("count-active").textContent = activeCount;
    document.getElementById("count-shipped").textContent = shippedCount;
    document.getElementById("count-ready").textContent = readyCount;
    document.getElementById("count-delivered").textContent = deliveredCount;
  }

  function renderOrders() {
    var listEl = document.getElementById("orders-list");
    if (!listEl) return;

    var filtered = orders;
    if (currentFilter === "active") {
      filtered = orders.filter(function (o) { return o.status === "shipped" || o.status === "paid" || o.status === "pending" || o.status === "awaiting_payment"; });
    } else if (currentFilter === "shipped") {
      filtered = orders.filter(function (o) { return o.status === "shipped"; });
    } else if (currentFilter === "ready") {
      filtered = orders.filter(function (o) { return o.status === "paid" || o.status === "pending"; });
    } else if (currentFilter === "delivered") {
      filtered = orders.filter(function (o) { return o.status === "delivered"; });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Tidak ada tugas pengantaran di tab ini.</div>';
      return;
    }

    listEl.innerHTML = filtered.map(function (o) {
      var navUrl = getNavigationUrl(o);
      var waUrl = getWhatsAppUrl(o);
      var itemsText = (o.items || []).map(function (i) {
        return i.product_name + " \u00d7" + i.qty + (i.size ? " (Uk. " + i.size + ")" : "");
      }).join(", ") || "1x Sneaker KICKSTORM";

      var statusBadge = "";
      if (o.status === "shipped") {
        statusBadge = '<span class="oc-badge status-shipped">Sedang Diantar</span>';
      } else if (o.status === "paid") {
        statusBadge = '<span class="oc-badge status-paid">Siap Antar</span>';
      } else if (o.status === "delivered") {
        statusBadge = '<span class="oc-badge status-delivered">Selesai</span>';
      } else {
        statusBadge = '<span class="oc-badge status-paid">' + o.status + '</span>';
      }

      var paymentBadge = o.payment_method === "cod"
        ? '<span class="oc-badge cod">💵 COD (Tagih Uang)</span>'
        : '<span class="oc-badge transfer">💳 Sudah Transfer</span>';

      var actionButtons = "";
      if (o.status === "shipped") {
        actionButtons = '<div class="oc-btn-row">' +
          '<a class="btn-action btn-wa" href="' + waUrl + '" target="_blank" rel="noopener">💬 Chat WA</a>' +
          '<button class="btn-action btn-done" type="button" data-done-id="' + o.id + '">✅ Selesai</button>' +
          '</div>';
      } else if (o.status !== "delivered") {
        actionButtons = '<div class="oc-btn-row">' +
          '<a class="btn-action btn-wa" href="' + waUrl + '" target="_blank" rel="noopener">💬 Chat WA</a>' +
          '<button class="btn-action btn-ship" type="button" data-ship-id="' + o.id + '">🛵 Mulai Antar</button>' +
          '</div>';
      }

      var noteBox = o.notes ? '<div class="oc-notes">📌 <b>Catatan:</b> ' + escapeHtml(o.notes) + '</div>' : '';

      return '<div class="order-card ' + (o.status === "shipped" ? "shipped" : "") + '">' +
        '<div class="oc-head">' +
          '<div>' +
            '<span class="oc-id">#' + o.id + '</span>' +
            '<span class="oc-time">' + (o.created_at || "").slice(0, 16) + '</span>' +
          '</div>' +
          '<div class="oc-badges">' + paymentBadge + statusBadge + '</div>' +
        '</div>' +
        '<div class="oc-customer">' +
          '<div class="oc-name">👤 ' + escapeHtml(o.customer_name) + '</div>' +
          '<div class="oc-items">📦 ' + escapeHtml(itemsText) + '</div>' +
        '</div>' +
        '<div class="oc-address-box">' +
          '<div class="oc-address-label">📍 Alamat Tujuan</div>' +
          '<div class="oc-address-text">' + escapeHtml(o.address) + '</div>' +
          noteBox +
        '</div>' +
        '<div class="oc-total-row">' +
          '<span class="oc-total-label">Total Tagihan</span>' +
          '<span class="oc-total-num">' + rupiah(o.total) + '</span>' +
        '</div>' +
        '<a class="nav-btn-main" href="' + navUrl + '" target="_blank" rel="noopener">' +
          '🚀 Buka Navigasi Google Maps' +
        '</a>' +
        actionButtons +
      '</div>';
    }).join("");
  }

  /* ---- Event Listeners ---- */

  // Tab Filtering
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderOrders();
    });
  });

  // Refresh Button
  var refBtn = document.getElementById("btn-refresh");
  if (refBtn) {
    refBtn.addEventListener("click", function () {
      toast("Memuat ulang data...");
      fetchOrders();
    });
  }

  // Order Actions (Mulai Antar / Selesai)
  document.getElementById("orders-list").addEventListener("click", function (e) {
    var shipBtn = e.target.closest("[data-ship-id]");
    if (shipBtn) {
      var shipId = Number(shipBtn.dataset.shipId);
      updateOrderStatus(shipId, "shipped");
      return;
    }

    var doneBtn = e.target.closest("[data-done-id]");
    if (doneBtn) {
      var doneId = Number(doneBtn.dataset.doneId);
      if (confirm("Konfirmasi pesanan #" + doneId + " sudah diterima pelanggan?")) {
        updateOrderStatus(doneId, "delivered");
      }
    }
  });

  function updateOrderStatus(id, status) {
    fetch("/api/courier/orders/" + id + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status, courier_name: courierName })
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.ok) {
        toast(res.message || "Status berhasil diperbarui!");
        fetchOrders();
      } else {
        toast(res.error || "Gagal memperbarui status.", true);
      }
    })
    .catch(function () {
      toast("Gagal terhubung ke server.", true);
    });
  }

  /* ---- GPS Live Tracking & Simulator ---- */
  var gpsToggle = document.getElementById("gps-toggle");
  var gpsCard = document.getElementById("gps-card");
  var gpsStatusText = document.getElementById("gps-status-text");
  var simBtn = document.getElementById("btn-sim-toggle");
  var simInterval = null;
  var simStep = 0;

  function sendLocation(lat, lng) {
    fetch("/api/update-lokasi-kurir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_kurir: 1,
        nama_kurir: courierName,
        latitude: lat,
        longitude: lng,
        share_url: savedShareUrl
      })
    }).catch(function () { });
  }

  if (gpsToggle) {
    gpsToggle.addEventListener("change", function () {
      if (gpsToggle.checked) {
        if (simInterval) {
          clearInterval(simInterval);
          simInterval = null;
          if (simBtn) simBtn.textContent = "🧪 Simulasi GPS";
        }

        if (!navigator.geolocation) {
          toast("Browser tidak mendukung GPS.", true);
          gpsToggle.checked = false;
          return;
        }

        gpsCard.classList.add("active");
        gpsStatusText.innerHTML = '<span style="color:var(--volt)">🔴 GPS HP Aktif:</span> Mencari sinyal satelit...';

        watchId = navigator.geolocation.watchPosition(
          function (pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            var acc = Math.round(pos.coords.accuracy || 0);
            gpsStatusText.innerHTML = '<span style="color:var(--volt)">🔴 Live GPS Aktif (Neon DB):</span> Posisi ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (Akurasi \u00b1' + acc + 'm)';
            sendLocation(lat, lng);
          },
          function (err) {
            gpsStatusText.innerHTML = '<span style="color:var(--red)">Gagal GPS:</span> ' + (err.message || "Izinkan akses GPS HP.");
            toast("Gagal mendapatkan sinyal GPS.", true);
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      } else {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        gpsCard.classList.remove("active");
        gpsStatusText.textContent = "GPS Nonaktif. Nyalakan toggle di atas saat kamu mulai berangkat mengantar.";
        toast("Live GPS dihentikan.");
      }
    });
  }

  // Simulator Toggle
  if (simBtn) {
    simBtn.addEventListener("click", function () {
      if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
        simBtn.textContent = "🧪 Simulasi GPS";
        simBtn.style.background = "rgba(214,255,63,0.12)";
        if (gpsCard) gpsCard.classList.remove("active");
        if (gpsStatusText) gpsStatusText.textContent = "Simulasi GPS dihentikan.";
        toast("Simulasi GPS selesai.");
        return;
      }

      if (gpsToggle && gpsToggle.checked) {
        gpsToggle.checked = false;
        if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      }

      var startLat = -6.2200;
      var startLng = 106.8400;
      var targetLat = -6.2088;
      var targetLng = 106.8456;

      // Find first shipped order destination if available
      var activeOrder = orders.find(function (o) { return o.status === "shipped" && o.lat && o.lng; }) ||
                        orders.find(function (o) { return o.lat && o.lng; });
      if (activeOrder) {
        targetLat = Number(activeOrder.lat);
        targetLng = Number(activeOrder.lng);
        startLat = targetLat - 0.015;
        startLng = targetLng - 0.015;
      }

      var totalSteps = 20;
      simStep = 0;
      simBtn.textContent = "⏹️ Stop Simulasi";
      simBtn.style.background = "var(--volt)";
      simBtn.style.color = "#0A0A0C";
      if (gpsCard) gpsCard.classList.add("active");
      toast("🚀 Simulasi perjalanan kurir dimulai! Cek halaman Lacak.");

      simInterval = setInterval(function () {
        simStep++;
        var progress = Math.min(1, simStep / totalSteps);
        var currentLat = startLat + (targetLat - startLat) * progress;
        var currentLng = startLng + (targetLng - startLng) * progress;

        // Add slight realistic jitter
        var jitterLat = (Math.random() - 0.5) * 0.0003;
        var jitterLng = (Math.random() - 0.5) * 0.0003;
        var curLat = currentLat + (progress < 1 ? jitterLat : 0);
        var curLng = currentLng + (progress < 1 ? jitterLng : 0);

        if (gpsStatusText) {
          gpsStatusText.innerHTML = '<span style="color:var(--volt)">🧪 SIMULASI BERJALAN:</span> Mengirim koordinat ke Neon.tech: ' + curLat.toFixed(5) + ', ' + curLng.toFixed(5) + ' (Progres ' + Math.round(progress * 100) + '%)';
        }

        sendLocation(curLat, curLng);

        if (progress >= 1) {
          clearInterval(simInterval);
          simInterval = null;
          simBtn.textContent = "🧪 Simulasi GPS";
          simBtn.style.background = "rgba(214,255,63,0.12)";
          simBtn.style.color = "var(--volt)";
          if (gpsStatusText) {
            gpsStatusText.innerHTML = '<span style="color:var(--volt)">✅ SIMULASI SELESAI:</span> Kurir telah tiba di titik tujuan pelanggan!';
          }
          toast("✓ Kurir tiba di titik tujuan!");
        }
      }, 3000);
    });
  }

  /* ---- Save Google Maps Share URL ---- */
  var shareInput = document.getElementById("courier-share-url-input");
  var saveShareBtn = document.getElementById("btn-save-share-url");

  if (shareInput) {
    shareInput.value = savedShareUrl;
    if (saveShareBtn) {
      saveShareBtn.addEventListener("click", function () {
        var val = shareInput.value.trim();
        savedShareUrl = val;
        localStorage.setItem("ks_courier_share_url", val);
        fetch("/api/update-lokasi-kurir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ share_url: val })
        })
        .then(function () {
          toast("✓ Link Google Maps tersimpan di database Neon!");
        })
        .catch(function () {
          toast("✓ Link tersimpan di perangkat lokal.");
        });
      });
    }
  }

  // Initial load & Polling every 15s
  fetchOrders();
  setInterval(fetchOrders, 15000);
})();

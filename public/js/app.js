function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

gsap.registerPlugin(ScrollTrigger);

if (window.ScrollTrigger) {
  ScrollTrigger.config({ ignoreMobileResize: true });
}

var mm = gsap.matchMedia();

mm.add("(prefers-reduced-motion: reduce)", function () {
  gsap.set("[data-anim], .card", { clearProps: "all" });
  gsap.set(".pin-slide.pin-b, .pin-slide.pin-c", { autoAlpha: 0 });
  gsap.set(".pin-slide.pin-a, .pin-shoe, .pin-bg-word", { autoAlpha: 1 });
});

mm.add("(prefers-reduced-motion: no-preference)", function () {
  gsap.to(".progress-bar", {
    scaleX: 1, ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.3 }
  });

  ScrollTrigger.create({
    start: "top -100",
    endTrigger: "body",
    end: "top 160",
    toggleClass: { targets: "#nav", className: "nav-scrolled" }
  });

  var marqueeTl = gsap.to(".marquee-track", {
    xPercent: -50, ease: "none", duration: 26, repeat: -1
  });

  document.querySelectorAll(".marquee").forEach(function (m) {
    m.addEventListener("pointerenter", function () { marqueeTl.timeScale(0.25); });
    m.addEventListener("pointerleave", function () { marqueeTl.timeScale(1); });
  });

  var heroIntro = gsap.timeline({ defaults: { ease: "power4.out" } });
  heroIntro
    .to(".hero .line-inner", { yPercent: 0, duration: 1, stagger: 0.12 }, 0.15)
    .to(".hero [data-anim]", { y: 0, x: 0, autoAlpha: 1, duration: 1.1, stagger: 0.09, ease: "power3.out" }, 0.45)
    .fromTo(".hero-shoe-wrap", { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 1.2, ease: "back.out(1.5)" }, 0.5);
  heroIntro.eventCallback("onStart", function () {
    gsap.to("[data-hero-chip]", { yPercent: -14, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 0.35 });
  });

  gsap.to(".hero-visual", {
    yPercent: -10, ease: "none",
    scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.6 }
  });
  gsap.to(".hero-bg-word", {
    yPercent: 30, ease: "none",
    scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.6 }
  });
  gsap.to(".hero-title, .hero-sub, .hero-stats", {
    yPercent: 12, opacity: 0.25, stagger: 0.06, ease: "none",
    scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom 30%", scrub: 0.6 }
  });

  gsap.utils.toArray("[data-anim]").forEach(function (el) {
    if (el.closest("#hero")) return;
    var vars = { autoAlpha: 1, duration: 0.9, ease: "power3.out" };
    if (el.dataset.anim === "left" || el.dataset.anim === "right") vars.x = 0;
    else vars.y = 0;
    gsap.to(el, Object.assign(vars, {
      scrollTrigger: { trigger: el, start: "top 86%", once: true }
    }));
  });

  document.querySelectorAll(".split-lines").forEach(function (el) {
    if (el.closest("#hero")) return;
    gsap.to(el.querySelectorAll(".line-inner"), {
      yPercent: 0, duration: 1, stagger: 0.12, ease: "power4.out",
      scrollTrigger: { trigger: el, start: "top 85%", once: true }
    });
  });

  gsap.set(".pin-a", { autoAlpha: 1, yPercent: 0 });
  gsap.set(".pin-b, .pin-c", { autoAlpha: 0, yPercent: 12 });

  var heroShowcase = null;
  var ceritaShowcase = null;

  if (window.KickstormShowcase) {
    heroShowcase = KickstormShowcase.initHeroShowcase("hero-showcase-container");
    ceritaShowcase = KickstormShowcase.initStoryShowcase("cerita-showcase-container");
  }

  var pinTl = gsap.timeline({
    scrollTrigger: {
      trigger: ".pin-section",
      start: "top top",
      end: "+=220%",
      scrub: 0.5,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true
    }
  });

  // Seamless, overlapping crossfade between story scenes (eliminates blank gaps)
  pinTl
    // Scene 01 -> 02 crossfade
    .to(".pin-a", { autoAlpha: 0, yPercent: -12, duration: 0.6, ease: "power2.inOut" }, 0.8)
    .fromTo(".pin-b", { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: "power2.inOut" }, 0.9)
    .to(".shoe-3d-pin, .pin-shoe", { rotation: -3, scale: 1.04, duration: 1.0, ease: "sine.inOut" }, 0.8)

    // Scene 02 -> 03 crossfade
    .to(".pin-b", { autoAlpha: 0, yPercent: -12, duration: 0.6, ease: "power2.inOut" }, 1.8)
    .fromTo(".pin-c", { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: "power2.inOut" }, 1.9)
    .to(".shoe-3d-pin, .pin-shoe", { rotation: 2, scale: 1.06, duration: 1.0, ease: "sine.inOut" }, 1.8);

  pinTl.eventCallback("onUpdate", function () {
    if (ceritaShowcase) {
      ceritaShowcase.setProgress(pinTl.progress());
    }
  });

  gsap.to(".pin-bg-word", {
    opacity: 0.55, duration: 2.2, repeat: -1, yoyo: true, ease: "sine.inOut"
  });

  // Ensure ScrollTrigger recalculated when all assets load
  window.addEventListener("load", function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
});

function bouncePress(btn) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.timeline()
    .to(btn, { scaleX: 0.9, scaleY: 0.94, duration: 0.09, ease: "power2.out" })
    .to(btn, { scaleX: 1.07, scaleY: 0.97, duration: 0.26, ease: "elastic.out(1, 0.45)" })
    .to(btn, { scaleX: 1, scaleY: 1, duration: 0.34, ease: "elastic.out(1.1, 0.4)" });
}

function spawnRipple(btn, x, y) {
  var rect = btn.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height) * 2.2;
  var span = document.createElement("span");
  span.className = "btn-ripple";
  span.style.width = span.style.height = size + "px";
  span.style.left = (x - rect.left - size / 2) + "px";
  span.style.top = (y - rect.top - size / 2) + "px";
  btn.appendChild(span);
  gsap.fromTo(span, { scale: 0, opacity: 0.5 }, {
    scale: 1, opacity: 0, duration: 0.65, ease: "power2.out",
    onComplete: function () { span.remove(); }
  });
}

function wireBtns() {
  document.querySelectorAll(".btn").forEach(function (btn) {
    if (btn.wired) return;
    btn.wired = true;
    btn.addEventListener("pointerdown", function (e) {
      bouncePress(btn);
      spawnRipple(btn, e.clientX, e.clientY);
    });

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    btn.addEventListener("pointerenter", function () {
      gsap.to(btn, { scale: 1.05, duration: 0.35, ease: "back.out(2.2)" });
    });
    btn.addEventListener("pointerleave", function () {
      gsap.to(btn, { scale: 1, x: 0, duration: 0.45, ease: "elastic.out(1, 0.4)" });
    });
    btn.addEventListener("pointermove", function (e) {
      var rect = btn.getBoundingClientRect();
      var mx = (e.clientX - rect.left - rect.width / 2) / rect.width;
      var my = (e.clientY - rect.top - rect.height / 2) / rect.height;
      gsap.to(btn, { x: mx * 7, y: my * 5, duration: 0.3, ease: "power2.out", overwrite: "auto" });
    });
  });
}

var PRODUCTS = [];
var cart = [];
try { cart = JSON.parse(localStorage.getItem("ks_cart") || "[]"); } catch (e) { cart = []; }
cart.forEach(function (i) { if (!i.size) i.size = "41"; });

var SIZES = ["39", "40", "41", "42", "43", "44"];
var DEFAULT_SIZE = "41";

var coupon = null;
try { coupon = JSON.parse(localStorage.getItem("ks_coupon") || "null"); } catch (e) { coupon = null; }

var storeCfg = null;
var shipCfg = null;
var waNumber = "";
var flashSale = null;
var referral = null;
var couriers = [];
var selectedCourierId = null;
var paymentFlow = false;
var codSelected = false;

function selectedCourier() {
  if (!couriers.length) return null;
  if (selectedCourierId) {
    var c = couriers.find(function (x) { return x.id === selectedCourierId; });
    if (c) return c;
  }
  return couriers[0];
}

function haversineKm(aLat, aLng, bLat, bLng) {
  var R = 6371, toRad = function (d) { return (d * Math.PI) / 180; };
  var dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  var h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pickedCoords() {
  var lat = document.getElementById("order-lat").value.trim();
  var lng = document.getElementById("order-lng").value.trim();
  if (!lat || !lng) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function estShipping() {
  if (!shipCfg) return 0;
  var subtotal = cartSubtotal();
  if (shipCfg.freeMin > 0 && subtotal >= shipCfg.freeMin) return 0;
  var dist = 0;
  var c = pickedCoords();
  if (c && storeCfg && storeCfg.lat) dist = haversineKm(storeCfg.lat, storeCfg.lng, c.lat, c.lng);

  // If distance exceeds local delivery radius (e.g. 1055 km > 25 km), apply out-of-area national rate
  if (dist > 0 && shipCfg.maxKm > 0 && dist > shipCfg.maxKm) {
    return shipCfg.outOfAreaCost || 50000;
  }

  var courier = selectedCourier();
  var tiers = (courier && courier.tiers && courier.tiers.length) ? courier.tiers : (shipCfg.tiers || []);
  var tier = tiers.find(function (t) { return dist <= t.max; }) || tiers[tiers.length - 1];
  return tier ? Math.max(0, tier.cost) : 0;
}

function codAllowed() {
  var c = selectedCourier();
  if (!c || !c.codKm || c.codKm <= 0) return false;
  var d = distFromStore();
  return d !== null && d <= c.codKm;
}

function distFromStore() {
  var c = pickedCoords();
  if (!c || !storeCfg || !storeCfg.lat) return null;
  return haversineKm(storeCfg.lat, storeCfg.lng, c.lat, c.lng);
}

function flashDiscount() {
  var subtotal = cartSubtotal();
  return flashSale ? Math.min(Math.round((subtotal * flashSale.percent) / 100), subtotal) : 0;
}

function referralDiscount() {
  if (!referral || coupon) return 0;
  return Math.min(referral.discount, cartSubtotal());
}

function applyFlashBanner() {
  // Flash banner telah dihapus dari antarmuka
}

function applyWaChat() {
  var el = document.getElementById("wa-chat");
  if (!el) return;
  if (!waNumber) { el.hidden = true; return; }
  el.hidden = false;
  el.href = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent("Halo KICKSTORM, saya butuh bantuan soal pesanan.");
}

function loadConfig() {
  fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
    storeCfg = cfg.store || null;
    shipCfg = cfg.shipping || null;
    waNumber = cfg.waNumber || "";
    flashSale = cfg.flashSale || null;
    couriers = cfg.couriers || [];
    paymentFlow = !!cfg.paymentFlow;
    var saved = Number(localStorage.getItem("ks_courier") || 0);
    if (saved && couriers.some(function (c) { return c.id === saved; })) selectedCourierId = saved;
    applyFlashBanner();
    applyWaChat();
    renderCourierBox();
    renderCart();
  }).catch(function () { });
}

function renderCourierBox() {
  var box = document.getElementById("courier-box");
  if (!box) return;
  if (!couriers.length) { box.hidden = true; return; }
  box.hidden = false;
  var list = document.getElementById("courier-list");
  list.innerHTML = couriers.map(function (c) {
    var checked = selectedCourier() && selectedCourier().id === c.id;
    return '<label class="courier-item' + (checked ? " active" : "") + '">' +
      '<input type="radio" name="courier" value="' + c.id + '"' + (checked ? " checked" : "") + ">" +
      '<span class="ci-name">' + c.name + "</span>" +
      '<span class="ci-note">' + (c.codKm > 0 ? "COD s.d. " + c.codKm + " km" : "Non-COD") + "</span>" +
      "</label>";
  }).join("");
  updateCodUI();
}

function updateCodUI() {
  var wrap = document.getElementById("cod-wrap");
  if (!wrap) return;
  var msg = document.getElementById("cod-msg");
  if (codAllowed()) {
    wrap.hidden = false;
    msg.textContent = "";
    msg.className = "form-msg";
  } else {
    wrap.hidden = true;
    codSelected = false;
    document.getElementById("cod-toggle").checked = false;
    if (selectedCourier() && selectedCourier().codKm > 0 && !pickedCoords()) {
      msg.textContent = "Pilih lokasi di peta untuk melihat ketersediaan COD.";
      msg.className = "form-msg";
    } else {
      msg.textContent = "";
    }
  }
  renderCart();
}

document.addEventListener("change", function (e) {
  if (e.target && e.target.name === "courier") {
    selectedCourierId = Number(e.target.value);
    localStorage.setItem("ks_courier", String(selectedCourierId));
    renderCourierBox();
  }
  if (e.target && e.target.id === "cod-toggle") {
    codSelected = e.target.checked;
    renderCart();
  }
});

function saveReferral() {
  if (referral) localStorage.setItem("ks_referral", JSON.stringify(referral));
  else localStorage.removeItem("ks_referral");
}
try { referral = JSON.parse(localStorage.getItem("ks_referral") || "null"); } catch (e) { referral = null; }
loadConfig();

var variantFilter = "";
var sortBy = "";

function rupiah(n) { return "Rp " + Number(n).toLocaleString("id-ID"); }

function etaLabel(hours) {
  if (hours >= 48) return Math.round(hours / 24) + " hari";
  if (hours >= 1) return hours + " jam";
  return "1 jam";
}

function keyOf(i) {
  if (i.custom) return "c:" + i.name + "|" + i.price + "|" + (i.size || "") + "|" + (i.colorway || "");
  return i.id + "|" + (i.size || "");
}

function colorwayName(cw) {
  if (!cw) return "";
  try {
    var o = JSON.parse(cw);
    return o.n || o.name || cw;
  } catch (e) {
    return String(cw);
  }
}

function cartSubtotal() {
  return cart.reduce(function (s, i) {
    if (i.custom) return s + i.price * i.qty;
    var p = PRODUCTS.find(function (x) { return x.id === i.id; });
    return s + (p ? p.price * i.qty : 0);
  }, 0);
}

function saveCoupon() {
  if (coupon) localStorage.setItem("ks_coupon", JSON.stringify(coupon));
  else localStorage.removeItem("ks_coupon");
}

function setCouponMsg(text, isErr) {
  var msg = document.getElementById("coupon-msg");
  msg.textContent = text || "";
  msg.className = "form-msg" + (isErr ? " err" : text ? " ok" : "");
}

function applyCoupon(code) {
  var btn = document.getElementById("coupon-apply");
  fetch("/api/coupons/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code, subtotal: cartSubtotal() })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok) {
        coupon = { code: res.d.code, discount: res.d.discount };
        saveCoupon();
        setCouponMsg("Voucher \u2713 " + res.d.code + ": diskon " + rupiah(res.d.discount), false);
      } else {
        coupon = null;
        saveCoupon();
        setCouponMsg(res.d.error || "Kode voucher tidak valid.", true);
      }
      renderCart();
    })
    .catch(function () { setCouponMsg("Gagal memeriksa voucher.", true); })
    .finally(function () { btn.disabled = false; });
}

function refreshCoupon() {
  if (!coupon) return;
  fetch("/api/coupons/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: coupon.code, subtotal: cartSubtotal() })
  }).then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.valid) {
        coupon.discount = d.discount;
        saveCoupon();
        setCouponMsg("Voucher \u2713 " + d.code + ": diskon " + rupiah(d.discount), false);
      } else {
        coupon = null;
        saveCoupon();
        setCouponMsg(d.error || "Voucher tidak lagi berlaku.", true);
      }
      renderCart();
    })
    .catch(function () {});
}

function saveCart() {
  localStorage.setItem("ks_cart", JSON.stringify(cart));
  renderCart();
  if (coupon) refreshCoupon();
}

function addToCart(id, size) {
  size = String(size || DEFAULT_SIZE);
  var item = cart.find(function (i) { return i.id === id && i.size === size; });
  if (item) item.qty += 1;
  else cart.push({ id: id, qty: 1, size: size });
  saveCart();
}

function cartCount() {
  return cart.reduce(function (s, i) { return s + i.qty; }, 0);
}

function productImg(p) {
  if (p && p.image_url && p.image_url.trim()) return p.image_url.trim();
  if (p && p.image && p.image.trim()) return p.image.trim();
  var idNum = (p && p.id != null) ? Number(p.id) : 1;
  var idx = (!isNaN(idNum) && idNum > 0) ? (((idNum - 1) % 6) + 1) : 1;
  return "/images/koleksi_" + idx + ".jpg";
}

function svgFor(variant) {
  var p = {
    mono: { upper: "#F5F5F2", toe: "#E0E0DA", heel: "#CFCFC8" },
    void: { upper: "#111113", toe: "#232327", heel: "#1E1E22" },
    volt: { upper: "#F5F5F2", toe: "#E0E0DA", heel: "#CFCFC8", strap: true },
    ghost: { upper: "#F3EFE6", toe: "#E5DFD0", heel: "#D8D1BE" },
    dark: { upper: "#232326", toe: "#2E2E32", heel: "#29292C" },
    cream: { upper: "#EFE7D8", toe: "#E2D7C2", heel: "#D6C9B0" }
  }[variant] || { upper: "#F5F5F2", toe: "#E0E0DA", heel: "#CFCFC8" };
  return '<svg viewBox="0 0 420 230" aria-hidden="true">' +
    '<ellipse cx="215" cy="213" rx="185" ry="13" fill="#000" opacity=".55"/>' +
    '<path d="M46 152 C 68 170, 130 180, 205 180 C 280 180, 336 166, 362 144 L 372 152 C 348 184, 280 198, 205 198 C 110 198, 44 180, 34 162 Z" fill="#151517"/>' +
    '<path d="M44 150 C 66 166, 128 176, 202 176 C 278 176, 334 162, 360 140 L 366 147 C 342 172, 278 186, 205 186 C 112 186, 48 170, 36 156 Z" fill="#D6FF3F"/>' +
    '<path d="M348 138 C 336 88, 306 58, 252 46 C 212 36, 156 38, 118 52 C 78 64, 50 96, 46 138 C 108 150, 270 150, 348 138 Z" fill="' + p.upper + '"/>' +
    '<path d="M262 40 C 282 40, 302 48, 316 60 C 292 56, 272 52, 252 52 Z" fill="' + p.heel + '"/>' +
    '<path d="M52 132 C 46 112, 50 96, 66 86 C 82 92, 94 108, 96 130 C 80 134, 64 136, 52 132 Z" fill="' + p.toe + '"/>' +
    (p.strap ? '<path d="M384 172 L 336 120" stroke="#0A0A0A" stroke-width="9" stroke-linecap="round"/>' : "") +
    '<path d="M118 118 C 168 96, 232 96, 282 110" fill="none" stroke="#0A0A0A" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M122 126 C 170 103, 230 103, 278 117" fill="none" stroke="#D6FF3F" stroke-width="4" stroke-linecap="round"/>' +
    "</svg>";
}

function svgCustom(cw) {
  var o;
  try { o = JSON.parse(cw); } catch (e) { return svgFor("mono"); }
  var lumC = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return (n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114;
  };
  var shade = function (hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.max(0, (n >> 16 & 255) + amt));
    var g = Math.min(255, Math.max(0, (n >> 8 & 255) + amt));
    var b = Math.min(255, Math.max(0, (n & 255) + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  var isLightUpper = lumC(o.u) > 130;
  var uDark = shade(o.u, isLightUpper ? -24 : -16);
  var uLight = shade(o.u, isLightUpper ? 14 : 26);
  var isLightAccent = lumC(o.a) > 130;
  var aDark = shade(o.a, isLightAccent ? -28 : -16);
  var aLight = shade(o.a, isLightAccent ? 18 : 30);
  var isLightSole = lumC(o.s) > 130;
  var sDark = shade(o.s, isLightSole ? -25 : -14);
  var sLight = shade(o.s, isLightSole ? 15 : 25);
  var isLightLace = lumC(o.l) > 130;
  var lDark = shade(o.l, isLightLace ? -28 : -14);
  var lLight = shade(o.l, isLightLace ? 16 : 28);
  var uid = "p_" + Math.random().toString(36).substring(2, 7);

  return '<svg viewBox="0 0 540 280" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="overflow:visible;">' +
    '<defs>' +
      '<radialGradient id="pDropShadow_' + uid + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#000000" stop-opacity="0.85"/><stop offset="45%" stop-color="#000000" stop-opacity="0.4"/><stop offset="100%" stop-color="#000000" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="pSoleGrad_' + uid + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="' + sLight + '"/><stop offset="45%" stop-color="' + o.s + '"/><stop offset="100%" stop-color="' + sDark + '"/></linearGradient>' +
      '<linearGradient id="pMidsoleGrad_' + uid + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="65%" stop-color="#F2F2F4"/><stop offset="100%" stop-color="#D4D4D8"/></linearGradient>' +
      '<linearGradient id="pUpperGrad_' + uid + '" x1="10%" y1="0%" x2="90%" y2="100%"><stop offset="0%" stop-color="' + uLight + '"/><stop offset="45%" stop-color="' + o.u + '"/><stop offset="100%" stop-color="' + uDark + '"/></linearGradient>' +
      '<linearGradient id="pAccentGrad_' + uid + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + aLight + '"/><stop offset="45%" stop-color="' + o.a + '"/><stop offset="100%" stop-color="' + aDark + '"/></linearGradient>' +
      '<linearGradient id="pLaceGrad_' + uid + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + lLight + '"/><stop offset="50%" stop-color="' + o.l + '"/><stop offset="100%" stop-color="' + lDark + '"/></linearGradient>' +
      '<filter id="pShadow_' + uid + '" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="-1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/></filter>' +
      '<filter id="pEmblem_' + uid + '" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.5"/></filter>' +
    '</defs>' +
    '<ellipse cx="270" cy="254" rx="215" ry="16" fill="url(#pDropShadow_' + uid + ')"/>' +
    '<path d="M 68 222 C 74 234, 100 242, 150 244 C 230 246, 325 246, 400 244 C 440 242, 465 236, 470 226 C 472 220, 468 214, 456 213 C 390 211, 310 211, 235 212 C 150 213, 90 216, 66 220 C 63 221, 64 221, 68 222 Z" fill="url(#pSoleGrad_' + uid + ')"/>' +
    '<path d="M 64 218 C 58 210, 60 198, 68 188 C 74 182, 82 180, 86 181 C 78 192, 72 206, 64 218 Z" fill="' + sDark + '" opacity="0.95"/>' +
    '<path d="M 65 216 C 90 212, 160 210, 240 210 C 325 210, 400 211, 456 212 C 466 209, 468 198, 460 188 C 450 181, 430 179, 390 180 C 310 181, 225 183, 150 184 C 105 185, 72 192, 60 204 C 56 208, 58 214, 65 216 Z" fill="url(#pMidsoleGrad_' + uid + ')" stroke="#C0C0C0" stroke-width="1.2"/>' +
    '<path d="M 70 212 C 140 207, 280 206, 454 208" fill="none" stroke="#A0A0A0" stroke-width="1.3" stroke-dasharray="3.5,2.5"/>' +
    '<path d="M 270 194 C 325 194, 385 194, 430 196 C 435 196, 438 200, 436 204 C 434 208, 429 209, 423 209 C 375 208, 315 208, 270 208 C 265 208, 262 204, 264 200 C 265 196, 267 194, 270 194 Z" fill="' + o.a + '" opacity="0.85"/>' +
    '<path d="M 345 104 C 365 90, 405 94, 424 112 C 432 124, 436 142, 430 156 C 412 152, 382 142, 355 128 C 342 120, 332 110, 335 104 Z" fill="#16161A"/>' +
    '<path d="M 220 160 C 240 135, 275 95, 305 72 C 316 64, 332 68, 338 78 C 342 86, 338 98, 328 112 C 305 138, 265 168, 228 178 Z" fill="' + uDark + '" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>' +
    '<path d="M 308 68 L 328 75 L 323 88 L 303 81 Z" fill="#111113" stroke="' + o.a + '" stroke-width="1.2"/>' +
    '<text x="309" y="80" font-family="\'Anton\', sans-serif" font-size="7" fill="#D6FF3F" letter-spacing="1" transform="rotate(18 309 80)">STORM</text>' +
    '<path d="M 74 188 C 84 170, 110 156, 146 150 C 178 146, 220 144, 260 140 C 305 136, 345 120, 355 98 C 375 88, 408 98, 424 118 C 438 140, 442 164, 436 180 C 390 181, 320 182, 245 184 C 165 185, 110 186, 74 188 Z" fill="url(#pUpperGrad_' + uid + ')" filter="url(#pShadow_' + uid + ')"/>' +
    '<path d="M 78 186 C 86 168, 108 156, 142 150 C 168 146, 194 152, 200 163 C 202 172, 190 178, 160 180 C 122 181, 90 182, 78 186 Z" fill="' + uLight + '" opacity="0.95"/>' +
    '<path d="M 64 214 C 58 202, 60 190, 70 180 C 86 168, 120 168, 155 174 C 178 180, 185 192, 180 204 C 150 208, 105 212, 74 214 Z" fill="url(#pAccentGrad_' + uid + ')" filter="url(#pShadow_' + uid + ')"/>' +
    '<path d="M 330 142 C 355 152, 385 158, 428 162 C 440 170, 442 178, 436 186 C 385 186, 335 186, 296 186 C 292 178, 296 168, 306 158 C 316 148, 324 144, 330 142 Z" fill="url(#pAccentGrad_' + uid + ')" filter="url(#pShadow_' + uid + ')"/>' +
    '<path d="M 355 98 C 375 88, 405 98, 422 118 C 432 132, 432 150, 426 162 C 395 158, 365 150, 342 138 C 336 124, 342 108, 355 98 Z" fill="url(#pAccentGrad_' + uid + ')" filter="url(#pShadow_' + uid + ')"/>' +
    '<path d="M 172 178 C 178 184, 180 194, 172 200 C 194 196, 226 186, 254 176 C 278 168, 308 142, 326 114 C 330 106, 326 100, 316 100 C 304 102, 290 118, 272 134 C 242 150, 206 164, 172 178 Z" fill="url(#pAccentGrad_' + uid + ')" filter="url(#pShadow_' + uid + ')"/>' +
    '<g filter="url(#pShadow_' + uid + ')">' +
      '<path d="M 196 172 C 210 162, 226 166, 238 167" fill="none" stroke="url(#pLaceGrad_' + uid + ')" stroke-width="6.5" stroke-linecap="round"/>' +
      '<path d="M 224 160 C 240 148, 256 152, 268 153" fill="none" stroke="url(#pLaceGrad_' + uid + ')" stroke-width="6.5" stroke-linecap="round"/>' +
      '<path d="M 250 146 C 266 134, 282 138, 294 139" fill="none" stroke="url(#pLaceGrad_' + uid + ')" stroke-width="6.5" stroke-linecap="round"/>' +
      '<path d="M 276 130 C 292 118, 308 122, 320 123" fill="none" stroke="url(#pLaceGrad_' + uid + ')" stroke-width="6.5" stroke-linecap="round"/>' +
      '<path d="M 304 112 C 316 102, 328 106, 336 112" fill="none" stroke="url(#pLaceGrad_' + uid + ')" stroke-width="7" stroke-linecap="round"/>' +
    '</g>' +
    '<g filter="url(#pEmblem_' + uid + ')">' +
      '<path d="M 160 170 L 248 138 L 222 152 L 332 120 L 398 136 L 308 148 L 334 136 L 234 166 L 260 154 L 160 170 Z" fill="' + o.a + '" stroke="' + aLight + '" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M 172 168 L 238 142 L 222 152 L 324 124 L 388 136" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>' +
    '</g>' +
    '</svg>';
}

function renderProducts(products, variantFilter, sortBy) {
  var grid = document.getElementById("product-grid");
  var items = products;

  if (variantFilter && variantFilter !== "all") {
    items = items.filter(function (p) { return p.variant === variantFilter; });
  }

  if (sortBy === "price-low") {
    items = items.sort(function (a, b) { return a.price - b.price; });
  } else if (sortBy === "price-high") {
    items = items.sort(function (a, b) { return b.price - a.price; });
  }

  // Load wishlist from localStorage
  var wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem("ks_wishlist") || "[]"); } catch (e) { wishlist = []; }

  // Kill old product grid ScrollTriggers BEFORE replacing innerHTML
  if (window.ScrollTrigger) {
    ScrollTrigger.getAll().forEach(function (st) {
      var t = st.trigger;
      if (t && t.closest && t.closest("#product-grid")) st.kill();
    });
  }

  grid.innerHTML = items.map(function (p) {
    var low = p.stock <= 30;
    var inWishlist = wishlist.includes(p.id);
    var total = (p.stock || 0) + (p.sold || 0);
    var pct = total > 0 ? Math.round((p.stock / total) * 100) : 100;
    var heartSvg = inWishlist
      ? '<svg width="18" height="18" viewBox="0 0 24 24" aria-label="Already in wishlist"><path fill="var(--volt)" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" aria-label="Tambah ke wishlist"><path fill="#9C9C9C" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

    return '<article class="card">' +
      '<div class="card-media" style="position:relative;overflow:hidden;background:#18181C;"><span class="card-badge">' + p.badge + '</span><img src="' + productImg(p) + '" alt="' + p.name + '" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:12px 12px 0 0;display:block;" /></div>' +
      '<div class="card-body">' +
      '<h3 class="card-name">' + p.name + "</h3>" +
      '<p class="card-tag">' + p.tag + "</p>" +
      '<p class="card-stock' + (low ? " low" : "") + '">' + (p.stock === 0 ? "Habis \u2014 kabari saat restock" : (low ? "Hampir habis \u2014 sisa " : "Sisa ") + p.stock + " pasang</p>") +
      (p.stock > 0 && p.eta_hours ? '<p class="card-eta">\u26a1 Estimasi habis \u00b1' + etaLabel(p.eta_hours) + "</p>" : "") +
      '<div class="stock-bar"><i class="' + (low ? "low" : "") + '" style="--sp:' + (pct / 100) + '" aria-hidden="true"></i></div>' +
      '<div class="card-sizes" role="group" aria-label="Pilih ukuran">' +
      SIZES.map(function (s) {
        return '<button class="size-chip' + (s === DEFAULT_SIZE ? " active" : "") + '" type="button" data-size="' + s + '" aria-pressed="' + (s === DEFAULT_SIZE ? "true" : "false") + '">' + s + "</button>";
      }).join("") +
      "</div>" +
      '<div class="card-foot">' +
      '<span class="card-price">' + rupiah(p.price).replace("Rp ", "Rp <em>") + "</em></span>" +
      (p.stock === 0
        ? '<div class="restock-box"><input class="restock-input" type="email" data-restock-email="' + p.id + '" placeholder="Email kamu" aria-label="Email untuk notifikasi restock"><button class="btn btn-card" type="button" data-restock-go="' + p.id + '">Kabari Saya</button></div>'
        : '<button class="btn btn-card" type="button" data-add="' + p.id + '">+ Keranjang</button>') +
      '<button class="btn btn-wishlist ' + (inWishlist ? "active" : "") + '" type="button" data-wishlist="' + p.id + '" aria-label="' + (inWishlist ? "Hapus dari wishlist" : "Tambah ke wishlist") + '">' + heartSvg + "</button>" +
      "</div></article>";
  }).join("");
  wireBtns();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var cards = grid.querySelectorAll(".card");
  var rect = grid.getBoundingClientRect();
  var inView = rect.top <= window.innerHeight * 0.95 && rect.bottom >= 0;

  if (inView) {
    gsap.fromTo(cards, { autoAlpha: 0, y: 15 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power2.out", clearProps: "transform,opacity,visibility", overwrite: "auto" });
  } else {
    ScrollTrigger.batch(cards, {
      start: "top 92%",
      once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1, ease: "power3.out", clearProps: "transform,opacity,visibility", overwrite: "auto" });
      }
    });
  }

  requestAnimationFrame(function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

  setTimeout(function () {
    grid.querySelectorAll(".stock-bar i").forEach(function (el) { el.classList.add("fill"); });
  }, 150);
}

/* ---- Size Guide ---- */
var SIZE_GUIDE = [
  [22.1, 36], [22.8, 37], [23.4, 38], [24.1, 39], [24.7, 40],
  [25.4, 41], [26.1, 42], [26.8, 43], [27.5, 44], [28.2, 45]
];

(function () {
  var drawer = document.getElementById("sizeguide-drawer");
  var overlay = document.getElementById("sizeguide-overlay");
  if (!drawer) return;
  var tbody = document.getElementById("sg-table-body");
  tbody.innerHTML = SIZE_GUIDE.map(function (row, i) {
    var lo = row[0];
    var hi = i + 1 < SIZE_GUIDE.length ? SIZE_GUIDE[i + 1][0] - 0.1 : 29.0;
    return "<tr><td>" + lo.toFixed(1) + "\u2013" + hi.toFixed(1) + " cm</td><td><strong>EU " + row[1] + "</strong></td></tr>";
  }).join("");

  function open() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.getElementById("size-guide-open").addEventListener("click", open);
  document.getElementById("sizeguide-close").addEventListener("click", close);
  overlay.addEventListener("click", close);

  function check() {
    var cm = Number(document.getElementById("sg-cm").value);
    var out = document.getElementById("sg-result");
    if (!Number.isFinite(cm) || cm < 20 || cm > 33) {
      out.textContent = "Masukkan panjang kaki antara 20-33 cm.";
      out.className = "form-msg err";
      return;
    }
    var size = null;
    for (var i = 0; i < SIZE_GUIDE.length; i++) {
      if (cm >= SIZE_GUIDE[i][0]) size = SIZE_GUIDE[i][1];
      else break;
    }
    if (size === null) {
      out.textContent = "Panjang kaki di bawah 22,1 cm \u2014 cek ukuran anak-anak.";
    } else {
      out.textContent = "\u2713 Rekomendasi: EU " + size + " (lebar normal).";
      out.className = "form-msg ok";
    }
  }
  document.getElementById("sg-check").addEventListener("click", check);
  document.getElementById("sg-cm").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); check(); }
  });
})();

/* ---- Theme toggle (dark / light) ---- */
(function () {
  var theme = "dark";
  try { theme = localStorage.getItem("ks_theme") || "dark"; } catch (e) { theme = "dark"; }
  var btn = document.getElementById("theme-toggle");
  function paint() {
    document.documentElement.dataset.theme = theme;
    if (btn) {
      btn.innerHTML = theme === "dark"
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      btn.setAttribute("aria-label", theme === "dark" ? "Aktifkan tema terang" : "Aktifkan tema gelap");
    }
  }
  paint();
  if (btn) {
    btn.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("ks_theme", theme); } catch (e) { }
      paint();
    });
  }
})();

function animNum(el, end) {
  var o = { v: 0 };
  gsap.to(o, {
    v: end, duration: 1.8, ease: "power2.out",
    onUpdate: function () { el.textContent = Math.round(o.v).toLocaleString("id-ID"); }
  });
}

function renderCart() {
  var wrap = document.getElementById("cart-items");
  var badge = document.getElementById("cart-badge");
  var mbbBadge = document.getElementById("mbb-cart-badge");
  var n = cartCount();
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? "99+" : n;
  if (mbbBadge) {
    mbbBadge.hidden = n === 0;
    mbbBadge.textContent = n > 99 ? "99+" : n;
  }

  if (cart.length === 0) {
    wrap.innerHTML = '<p class="cart-empty">Keranjang masih kosong.<br>Jangan biarkan badai lewat.</p>';
  } else {
    wrap.innerHTML = cart.map(function (item, idx) {
      var isCustom = !!item.custom;
      var p = isCustom ? null : PRODUCTS.find(function (x) { return x.id === item.id; });
      var customImg = isCustom ? (item.image || (function () { try { return JSON.parse(item.colorway).img; } catch (e) { return null; } })()) : null;
      var svg = isCustom ? (customImg ? '<img src="' + customImg + '" alt="' + name + '" class="cart-item-img" />' : svgCustom(item.colorway)) : '<img src="' + productImg(p) + '" alt="' + name + '" class="cart-item-img" />';
      var name = isCustom ? item.name : p.name;
      var price = isCustom ? item.price : p.price;
      return '<div class="cart-item">' + svg +
        '<div class="cart-item-info">' +
        '<p class="cart-item-name">' + name + (isCustom ? ' <span class="cart-custom-badge">Custom</span>' : "") + "</p>" +
        '<p class="cart-item-size">Ukuran <strong>' + item.size + "</strong>" + (isCustom ? " &bull; " + colorwayName(item.colorway) : "") + "</p>" +
        '<p class="cart-item-price">' + rupiah(price) + "</p>" +
        '<div class="cart-item-qty">' +
        '<button class="qty-btn" type="button" data-dec="' + idx + '" aria-label="Kurangi">\u2212</button>' +
        "<span>" + item.qty + "</span>" +
        '<button class="qty-btn" type="button" data-inc="' + idx + '" aria-label="Tambah">+</button>' +
        "</div></div>" +
        '<button class="cart-remove" type="button" data-rem="' + idx + '">Hapus</button>' +
        "</div>";
    }).join("");
  }
  var subtotal = cartSubtotal();
  var flashD = flashDiscount();
  var discount = coupon && coupon.discount > 0 ? Math.min(coupon.discount, subtotal) : 0;
  var refD = referralDiscount();
  var shipping = estShipping();
  var totals = '<div class="cart-line"><span>Subtotal</span><span>' + rupiah(subtotal) + "</span></div>";
  if (flashD > 0) {
    totals += '<div class="cart-line discount"><span class="coupon-off"><span>Flash Sale (' + flashSale.percent + "%)</span></span>" +
      "<span>\u2212" + rupiah(flashD) + "</span></div>";
  }
  if (coupon) {
    totals += '<div class="cart-line discount"><span class="coupon-off"><span>Diskon (' + coupon.code + ")</span>" +
      '<button type="button" data-remove-coupon aria-label="Hapus voucher">hapus</button></span>' +
      "<span>\u2212" + rupiah(discount) + "</span></div>";
  }
  if (referral && !coupon) {
    totals += '<div class="cart-line discount"><span class="coupon-off"><span>Referral (' + referral.code + ")</span>" +
      '<button type="button" data-remove-referral aria-label="Hapus kode referensi">hapus</button></span>' +
      "<span>\u2212" + rupiah(refD) + "</span></div>";
  }
  if (cart.length > 0 && shipCfg) {
    var d = distFromStore();
    var isFar = d !== null && shipCfg.maxKm > 0 && d > shipCfg.maxKm;
    var shipLabel = "Ongkir" + (pickedCoords() ? (isFar ? " (Ekspedisi Luar Jangkauan)" : "") : " (estimasi)");
    totals += '<div class="cart-line"><span>' + shipLabel + "</span>" +
      "<span>" + (shipping === 0 && shipCfg.freeMin > 0 ? "GRATIS" : rupiah(shipping)) + "</span></div>";
  }
  if (cart.length > 0 && selectedCourier()) {
    totals += '<div class="cart-line muted-line"><span>' + selectedCourier().name + (codSelected ? " \u2022 COD" : "") + "</span>" +
      "<span>" + (codSelected ? "bayar di tempat" : "transfer bank") + "</span></div>";
  }
  document.getElementById("cart-totals").innerHTML = totals;
  document.getElementById("cart-total").innerHTML = 'Rp <em>' + Number(subtotal - flashD - discount - refD + shipping).toLocaleString("id-ID") + "</em>";
}

function openCart() {
  var drawer = document.getElementById("cart-drawer");
  var overlay = document.getElementById("cart-overlay");
  renderCart();
  drawer.classList.add("open");
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  var drawer = document.getElementById("cart-drawer");
  var overlay = document.getElementById("cart-overlay");
  drawer.classList.remove("open");
  overlay.classList.remove("open");
  document.body.style.overflow = "";
}

document.getElementById("coupon-apply").addEventListener("click", function () {
  var code = document.getElementById("coupon-code").value.trim();
  if (!code) { setCouponMsg("Masukkan kode voucher dulu.", true); return; }
  if (coupon && coupon.code === code.toUpperCase()) return;
  document.getElementById("coupon-apply").disabled = true;
  applyCoupon(code);
});

document.getElementById("coupon-code").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("coupon-apply").click(); }
});

document.getElementById("cart-totals").addEventListener("click", function (e) {
  if (e.target.closest("[data-remove-coupon]")) {
    coupon = null;
    document.getElementById("coupon-code").value = "";
    setCouponMsg("");
    saveCoupon();
    renderCart();
  }
  if (e.target.closest("[data-remove-referral]")) {
    referral = null;
    document.getElementById("order-referral").value = "";
    setReferralMsg("");
    saveReferral();
    renderCart();
  }
});

function setReferralMsg(text, isErr) {
  var msg = document.getElementById("referral-msg");
  if (!msg) return;
  msg.textContent = text || "";
  msg.className = "form-msg" + (isErr ? " err" : text ? " ok" : "");
}

function checkReferral(code) {
  var msg = document.getElementById("referral-msg");
  var subtotal = cartSubtotal();
  if (!code) {
    referral = null;
    setReferralMsg("");
    saveReferral();
    renderCart();
    return;
  }
  msg.textContent = "Memeriksa kode...";
  fetch("/api/referrals/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code, subtotal: subtotal })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok) {
        referral = { code: res.d.code, discount: res.d.discount };
        setReferralMsg("\u2713 Kode " + res.d.code + " berlaku \u2014 diskon " + rupiah(res.d.discount));
        saveReferral();
        renderCart();
      } else {
        referral = null;
        setReferralMsg(res.d.error || "Kode tidak valid.", true);
        saveReferral();
        renderCart();
      }
    })
    .catch(function () { setReferralMsg("Gagal memeriksa kode.", true); });
}

document.getElementById("order-referral").addEventListener("change", function () {
  checkReferral(this.value.trim().toUpperCase());
});
document.getElementById("order-referral").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); checkReferral(this.value.trim().toUpperCase()); }
});

document.getElementById("cart-open").addEventListener("click", openCart);
var mbbCart = document.getElementById("mbb-cart-btn");
if (mbbCart) mbbCart.addEventListener("click", openCart);
document.getElementById("cart-open-hero").addEventListener("click", openCart);
document.getElementById("cart-open-pin").addEventListener("click", openCart);
document.getElementById("cart-close").addEventListener("click", closeCart);
document.getElementById("cart-overlay").addEventListener("click", closeCart);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });

document.getElementById("product-grid").addEventListener("click", function (e) {
  var chip = e.target.closest("[data-size]");
  if (chip) {
    chip.parentElement.querySelectorAll(".size-chip").forEach(function (c) {
      c.classList.remove("active");
      c.setAttribute("aria-pressed", "false");
    });
    chip.classList.add("active");
    chip.setAttribute("aria-pressed", "true");
    return;
  }
  var add = e.target.closest("[data-add]");
  if (!add) return;
  var card = add.closest(".card");
  var chipSel = card ? card.querySelector(".size-chip.active") : null;
  addToCart(Number(add.dataset.add), chipSel ? chipSel.dataset.size : DEFAULT_SIZE);
  openCart();
});

document.getElementById("product-grid").addEventListener("click", function (e) {
  var go = e.target.closest("[data-restock-go]");
  if (!go) return;
  var card = go.closest(".card");
  var input = card ? card.querySelector("[data-restock-email]") : null;
  var email = input ? input.value.trim() : "";
  if (!email) { if (input) input.focus(); return; }
  var btn = go;
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = "Mendaftar...";
  fetch("/api/restock-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: Number(go.dataset.restockGo), email: email })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok) {
        btn.textContent = "\u2713 Terdaftar";
        btn.disabled = true;
        if (input) input.disabled = true;
      } else {
        btn.textContent = old;
        btn.disabled = false;
        alert(res.d.error || "Gagal mendaftar.");
      }
    })
    .catch(function () {
      btn.textContent = old;
      btn.disabled = false;
      alert("Gagal terhubung.");
    });
});

document.getElementById("cart-items").addEventListener("click", function (e) {
  var inc = e.target.closest("[data-inc]");
  var dec = e.target.closest("[data-dec]");
  var rem = e.target.closest("[data-rem]");
  if (!inc && !dec && !rem) return;
  var idx = Number(inc ? inc.dataset.inc : dec ? dec.dataset.dec : rem.dataset.rem);
  if (inc) {
    if (cart[idx]) cart[idx].qty++;
    saveCart();
  } else if (dec) {
    if (cart[idx]) { cart[idx].qty--; if (cart[idx].qty < 1) cart.splice(idx, 1); }
    saveCart();
  } else if (rem) {
    cart.splice(idx, 1);
    saveCart();
  }
  renderCart();
});

// Wishlist handlers
document.getElementById("product-grid").addEventListener("click", function (e) {
  var wish = e.target.closest("[data-wishlist]");
  if (!wish) return;
  var id = Number(wish.dataset.wishlist);
  var wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem("ks_wishlist") || "[]"); } catch (err) { wishlist = []; }
  var idx = wishlist.indexOf(id);
  if (idx === -1) {
    wishlist.push(id);
    wish.classList.add("active");
    wish.setAttribute("aria-label", "Hapus dari wishlist");
    wish.innerHTML = '<svg width="18" height="18" aria-label="Already in wishlist"><path fill="var(--volt)" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 8.05.77l3.02-2.14c3.15.7 4.82 2.56 4.82 5.4 0 2.83-1.79 3.91-4.85 4.27L12 21.35z"/></svg>';
  } else {
    wishlist = wishlist.filter(function (i) { return i !== id; });
    wish.classList.remove("active");
    wish.setAttribute("aria-label", "Tambah ke wishlist");
    wish.innerHTML = '<svg width="18" height="18" aria-label="Tambah ke wishlist"><path fill="#9C9C9C" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 8.05.77l3.02-2.14c3.15.7 4.82 2.56 4.82 5.4 0 2.83-1.79 3.91-4.85 4.27L12 21.35z"/></svg>';
  }
  localStorage.setItem("ks_wishlist", JSON.stringify(wishlist));
});

// Wishlist drawer toggle
function openWishlist() {
  var drawer = document.getElementById("wishlist-drawer");
  var overlay = document.getElementById("wishlist-overlay");
  renderWishlist();
  drawer.classList.add("open");
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  wishlistOpen = true;
}

var wishlistOpen = false;
document.getElementById("wishlist-open").addEventListener("click", openWishlist);
var mbbWishlist = document.getElementById("mbb-wishlist-btn");
if (mbbWishlist) mbbWishlist.addEventListener("click", openWishlist);

function renderWishlist() {
  var wishlist = JSON.parse(localStorage.getItem("ks_wishlist") || "[]") || [];
  var grid = document.getElementById("wishlist-items");
  var count = document.getElementById("wishlist-count");
  var mbbBadge = document.getElementById("mbb-wishlist-badge");
  if (count) count.textContent = wishlist.length;
  if (mbbBadge) {
    mbbBadge.hidden = wishlist.length === 0;
    mbbBadge.textContent = wishlist.length > 99 ? "99+" : wishlist.length;
  }
  if (wishlist.length === 0) {
    grid.innerHTML = '<p class="cart-empty">Wishlist kosong.<br>Ketuk \u2661 di kartu produk untuk menyimpan incaranmu.</p>';
    return;
  }
  grid.innerHTML = wishlist.map(function (id) {
    var p = PRODUCTS.find(function (x) { return x.id === id; });
    if (!p) return "";
    return '<div class="cart-item wishlist-item">' +
      '<img src="' + productImg(p) + '" alt="' + p.name + '" class="cart-item-img" />' +
      '<div class="cart-item-info">' +
      '<p class="cart-item-name">' + p.name + "</p>" +
      '<p class="cart-item-price">' + rupiah(p.price) + "</p>" +
      '<button class="btn btn-primary btn-sm btn-wishlist-add" type="button" data-add="' + p.id + '" style="margin-top:6px;padding:7px 14px;font-size:.8rem">+ Keranjang</button>' +
      "</div>" +
      '<button class="cart-remove" type="button" data-rem-wishlist="' + p.id + '">Hapus</button>' +
      "</div>";
  }).join("") ||
    '<p class="cart-empty">Wishlist kosong.<br>Ketuk \u2661 di kartu produk untuk menyimpan incaranmu.</p>';
}

document.getElementById("wishlist-items").addEventListener("click", function (e) {
  var rem = e.target.closest("[data-rem-wishlist]");
  var add = e.target.closest("[data-add]");
  if (rem) {
    var wishlist = JSON.parse(localStorage.getItem("ks_wishlist") || "[]");
    localStorage.setItem("ks_wishlist", JSON.stringify(wishlist.filter(function (i) { return i !== Number(rem.dataset.remWishlist); })));
    renderWishlist();
    renderProducts(PRODUCTS, variantFilter, sortBy);
  } else if (add) {
    addToCart(Number(add.dataset.add));
    closeWishlist();
    openCart();
  }
});

document.getElementById("checkout-wishlist").addEventListener("click", function () {
  var wishlist = JSON.parse(localStorage.getItem("ks_wishlist") || "[]");
  wishlist.forEach(function (id) { addToCart(id); });
  closeWishlist();
  openCart();
});

document.getElementById("wishlist-close").addEventListener("click", closeWishlist);
document.getElementById("wishlist-overlay").addEventListener("click", closeWishlist);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeWishlist(); });

function closeWishlist() {
  var drawer = document.getElementById("wishlist-drawer");
  var overlay = document.getElementById("wishlist-overlay");
  drawer.classList.remove("open");
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  wishlistOpen = false;
}

function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  var W = canvas.width = window.innerWidth;
  var H = canvas.height = window.innerHeight;
  var colors = ["#D6FF3F", "#F5F5F2", "#54D98C", "#5AA9FF", "#FF5A4E", "#F5C542"];
  var parts = [];
  for (var i = 0; i < 140; i++) {
    parts.push({
      x: W / 2 + (Math.random() - 0.5) * 300,
      y: H / 2 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 3,
      g: 0.32,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1
    });
  }
  var t0 = performance.now();
  (function tick(now) {
    ctx.clearRect(0, 0, W, H);
    var alive = false;
    for (var p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = 1 - (now - t0) / 2600;
      if (p.life <= 0 || p.y > H + 30) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  })(t0);
}

/* ---- Countdown drop berikutnya ---- */
(function () {
  var label = document.getElementById("drop-label");
  var el = document.getElementById("drop-countdown");
  if (!el) return;
  var drop = null;
  var timer = null;

  function pad(n) { return String(n).padStart(2, "0"); }
  function paint() {
    if (!drop) { el.textContent = "-- --:--:--"; return; }
    var target = new Date(drop.releaseAt.replace(" ", "T")).getTime();
    var diff = target - Date.now();
    if (diff <= 0) {
      el.textContent = "LIVE SEKARANG";
      label.textContent = drop.started ? "Drop \u201c" + drop.name + "\u201d sedang berlangsung" : "Drop \u201c" + drop.name + "\u201d";
      clearInterval(timer);
      return;
    }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    el.textContent = (d > 0 ? pad(d) + " " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
    label.textContent = drop.queueEnabled
      ? "Drop \u201c" + drop.name + "\u201d buka dalam (antrian aktif)"
      : "Drop \u201c" + drop.name + "\u201d buka dalam";
  }

  fetch("/api/next-drop").then(function (r) { return r.json(); }).then(function (res) {
    if (!res.drop) return;
    drop = res.drop;
    paint();
    timer = setInterval(paint, 1000);
  }).catch(function () { });
})();

/* ---- Leaflet + OpenStreetMap: Pilih Lokasi Pengantaran (Pinpoint Peta) ---- */
(function () {
  var map = null;
  var marker = null;
  var storeMarker = null;
  var defaultCenter = [-6.2087634, 106.845599]; // Default Jakarta KICKSTORM Hub

  function getStorePos() {
    if (shipCfg && shipCfg.store && shipCfg.store.lat && shipCfg.store.lng) {
      return [Number(shipCfg.store.lat), Number(shipCfg.store.lng)];
    }
    return defaultCenter;
  }

  function showHint(txt, isErr) {
    var h = document.getElementById("gps-msg");
    if (!h) return;
    h.textContent = txt || "";
    h.className = isErr ? "form-msg err" : (txt ? "form-msg ok" : "form-msg");
  }

  function setLocation(lat, lng, address, byUser) {
    var latNum = Number(lat);
    var lngNum = Number(lng);
    document.getElementById("order-lat").value = latNum.toFixed(6);
    document.getElementById("order-lng").value = lngNum.toFixed(6);

    var mapsInput = document.getElementById("order-maps-url");
    if (mapsInput) {
      mapsInput.value = "https://www.google.com/maps?q=" + latNum.toFixed(6) + "," + lngNum.toFixed(6);
    }

    if (address && document.getElementById("order-address")) {
      var addrInput = document.getElementById("order-address");
      if (!addrInput.value.trim() || byUser) {
        addrInput.value = address;
      }
    }

    // Update coordinate badge
    var coordText = document.getElementById("map-coord-text");
    if (coordText) {
      coordText.textContent = "📍 " + latNum.toFixed(4) + ", " + lngNum.toFixed(4);
    }

    // Distance Calculation
    var d = distFromStore();
    var distText = document.getElementById("map-dist-text");
    if (distText) {
      if (d !== null) {
        distText.textContent = Math.round(d * 10) / 10 + " km dari toko";
      } else {
        distText.textContent = "";
      }
    }

    if (d !== null && shipCfg && shipCfg.maxKm > 0 && d > shipCfg.maxKm) {
      var outCost = shipCfg.outOfAreaCost || 50000;
      showHint("📦 Lokasi di luar jangkauan kurir lokal (" + Math.round(d) + " km > " + shipCfg.maxKm + " km) — Dialihkan ke Ekspedisi Luar Kota (" + rupiah(outCost) + ")", false);
    } else {
      showHint("✓ Titik lokasi tersimpan (" + latNum.toFixed(4) + ", " + lngNum.toFixed(4) + ")", false);
    }

    updateCodUI();
    renderCart();
  }

  function reverseGeocode(lat, lng) {
    var url = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1";
    fetch(url, { headers: { "Accept-Language": "id,en" } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.display_name) {
          setLocation(lat, lng, data.display_name, false);
        } else {
          setLocation(lat, lng, "", false);
        }
      })
      .catch(function () {
        setLocation(lat, lng, "", false);
      });
  }

  function placeMarker(lat, lng, zoomTo, doGeocode) {
    var latNum = Number(lat);
    var lngNum = Number(lng);

    if (!window.L || !map) return;

    var customIcon = L.divIcon({
      className: "custom-leaflet-pin",
      html: '<div class="pin-marker-wrap"><span class="pin-pulse"></span><div class="pin-icon" title="Geser pin untuk tepatkan titik rumah">📍</div></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (!marker) {
      marker = L.marker([latNum, lngNum], {
        icon: customIcon,
        draggable: true,
        title: "Titik Pengantaran (Geser pin untuk tepatkan)"
      }).addTo(map);

      marker.bindPopup("<b style='color:var(--volt)'>Titik Pengantaran</b><br>Geser pin untuk tepatkan titik rumah.").openPopup();

      marker.on("dragend", function () {
        var pos = marker.getLatLng();
        reverseGeocode(pos.lat, pos.lng);
      });
    } else {
      marker.setLatLng([latNum, lngNum]);
    }

    if (map) {
      if (zoomTo) {
        map.setView([latNum, lngNum], 16);
      } else {
        map.panTo([latNum, lngNum]);
      }
    }

    if (doGeocode) {
      reverseGeocode(latNum, lngNum);
    } else {
      setLocation(latNum, lngNum, "", false);
    }
  }

  window.__updateStoreCheckoutMap = function (lat, lng) {
    if (map) {
      placeMarker(lat, lng, true, false);
    }
  };

  function initLeafletMap() {
    if (!window.L) return;
    var el = document.getElementById("order-map");
    if (!el || map) return;

    var storePos = getStorePos();
    var defaultLat = storePos[0];
    var defaultLng = storePos[1];

    map = L.map("order-map", {
      zoomControl: true,
      attributionControl: false
    }).setView([defaultLat, defaultLng], 13);

    // OpenStreetMap Tile Layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    // Add Store Marker
    var storeIcon = L.divIcon({
      className: "custom-leaflet-pin",
      html: '<div class="pin-marker-wrap"><div class="pin-store" title="Toko KICKSTORM Hub">🏬</div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    storeMarker = L.marker([defaultLat, defaultLng], {
      icon: storeIcon,
      interactive: true
    }).addTo(map).bindPopup("<b>🏬 KICKSTORM Hub Jakarta</b><br>Pusat Pengiriman");

    // Click to place marker
    map.on("click", function (e) {
      placeMarker(e.latlng.lat, e.latlng.lng, false, true);
    });

    // Check if initial coordinates already exist in form
    var initLat = document.getElementById("order-lat").value.trim();
    var initLng = document.getElementById("order-lng").value.trim();
    if (initLat && initLng) {
      placeMarker(Number(initLat), Number(initLng), true, false);
    } else {
      placeMarker(defaultLat - 0.008, defaultLng + 0.008, false, false);
    }

    setTimeout(function () {
      if (map) map.invalidateSize();
    }, 400);
  }

  function ensureMap() {
    if (!map) {
      initLeafletMap();
    } else {
      setTimeout(function () {
        if (map) map.invalidateSize();
      }, 200);
    }
  }

  /* ---- Search Address Button & Enter key ---- */
  function searchLocation() {
    var searchInput = document.getElementById("order-address-search");
    if (!searchInput) return;
    var query = searchInput.value.trim();
    if (!query) return;

    showHint("Mencari lokasi...", false);
    var url = "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(query) + "&countrycodes=id&limit=1";
    fetch(url, { headers: { "Accept-Language": "id,en" } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (results && results.length > 0) {
          var res = results[0];
          var lat = parseFloat(res.lat);
          var lon = parseFloat(res.lon);
          ensureMap();
          placeMarker(lat, lon, true, false);
          setLocation(lat, lon, res.display_name, true);
          showHint("✓ Lokasi ditemukan: " + res.display_name.slice(0, 50) + "...", false);
        } else {
          showHint("Lokasi tidak ditemukan. Geser pin merah langsung di peta.", true);
        }
      })
      .catch(function () {
        showHint("Gagal mencari alamat. Geser pin langsung di peta.", true);
      });
  }

  var searchBtn = document.getElementById("btn-search-loc");
  if (searchBtn) {
    searchBtn.addEventListener("click", searchLocation);
  }
  var searchInput = document.getElementById("order-address-search");
  if (searchInput) {
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        searchLocation();
      }
    });
  }

  /* ---- Tombol GPS Saya (HTML5 Geolocation) ---- */
  var gpsBtn = document.getElementById("btn-get-gps");
  if (gpsBtn) {
    gpsBtn.addEventListener("click", function () {
      if (!navigator.geolocation) {
        showHint("Browser tidak mendukung GPS.", true);
        return;
      }
      gpsBtn.disabled = true;
      showHint("🛰️ Mendeteksi posisi GPS HP kamu...", false);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          gpsBtn.disabled = false;
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          ensureMap();
          placeMarker(lat, lng, true, true);
          showHint("✓ Titik GPS terkunci (" + lat.toFixed(4) + ", " + lng.toFixed(4) + ")", false);
        },
        function (err) {
          gpsBtn.disabled = false;
          var errText = "Gagal mengambil lokasi GPS. Izinkan izin lokasi di browsermu atau geser pin peta manual.";
          if (err.code === 1) errText = "Izin lokasi GPS ditolak. Silakan geser pin langsung di peta.";
          showHint(errText, true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  /* ---- Modal Panduan Google Maps ---- */
  (function () {
    var drawer = document.getElementById("mapsguide-drawer");
    var overlay = document.getElementById("mapsguide-overlay");
    var openBtn = document.getElementById("maps-guide-open");
    var closeBtn = document.getElementById("mapsguide-close");
    var gotitBtn = document.getElementById("mapsguide-gotit");
    if (!drawer || !openBtn) return;
    function open() {
      drawer.classList.add("open");
      if (overlay) overlay.classList.add("open");
    }
    function close() {
      drawer.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
    }
    openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (gotitBtn) gotitBtn.addEventListener("click", close);
    if (overlay) overlay.addEventListener("click", close);
  })();

  /* ---- Parse Maps URL Manual Input ---- */
  var mapsInput = document.getElementById("order-maps-url");
  if (mapsInput) {
    mapsInput.addEventListener("input", function () {
      var val = mapsInput.value.trim();
      if (!val) return;
      var coords = extractCoordsFromMapsUrl(val);
      if (coords) {
        ensureMap();
        placeMarker(coords.lat, coords.lng, true, true);
      }
    });
  }

  function extractCoordsFromMapsUrl(url) {
    if (!url || typeof url !== "string") return null;
    var str = url.trim();
    var atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      var lat = parseFloat(atMatch[1]), lng = parseFloat(atMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat: lat, lng: lng };
    }
    var qMatch = str.match(/[?&](?:q|ll|destination|center|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      var qlat = parseFloat(qMatch[1]), qlng = parseFloat(qMatch[2]);
      if (Number.isFinite(qlat) && Number.isFinite(qlng) && Math.abs(qlat) <= 90 && Math.abs(qlng) <= 180) return { lat: qlat, lng: qlng };
    }
    var rawMatch = str.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (rawMatch) {
      var rlat = parseFloat(rawMatch[1]), rlng = parseFloat(rawMatch[2]);
      if (Number.isFinite(rlat) && Number.isFinite(rlng) && Math.abs(rlat) <= 90 && Math.abs(rlng) <= 180) return { lat: rlat, lng: rlng };
    }
    return null;
  }

  var openCartOrig = window.openCart;
  window.openCart = function () {
    openCartOrig();
    setTimeout(ensureMap, 250);
  };
})();

document.getElementById("checkout-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var msg = document.getElementById("order-msg");
  var btn = document.getElementById("checkout-btn");
  var mapActive = !document.getElementById("map-picker").hidden;
  if (cart.length === 0) {
    msg.className = "form-msg";
    msg.textContent = "Keranjang kamu masih kosong.";
    return;
  }
  var lat = document.getElementById("order-lat").value.trim();
  var lng = document.getElementById("order-lng").value.trim();
  var mapsUrl = document.getElementById("order-maps-url") ? document.getElementById("order-maps-url").value.trim() : "";
  if (mapActive && (!lat || !lng)) {
    msg.className = "form-msg";
    msg.textContent = "Pilih lokasi pengiriman di peta (klik peta, geser pin, atau cari alamat).";
    return;
  }
  var payload = {
    name: document.getElementById("order-name").value.trim(),
    email: document.getElementById("order-email").value.trim(),
    address: document.getElementById("order-address").value.trim(),
    maps_url: mapsUrl || undefined,
    notes: document.getElementById("order-notes").value.trim(),
    items: cart,
    coupon: coupon ? coupon.code : undefined,
    referral: referral ? referral.code : undefined
  };
  if (selectedCourier()) payload.courier_id = selectedCourier().id;
  if (codSelected) payload.payment_method = "cod";
  if (lat && lng) {
    payload.lat = Number(lat);
    payload.lng = Number(lng);
  }
  var idempotencyKey = "ks_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  payload.idempotency_key = idempotencyKey;
  msg.className = "form-msg";
  msg.textContent = "Memproses pesanan...";
  btn.disabled = true;
  fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok) {
        var extra = "";
        if (res.d.queueNo) extra += '<p class="queue-line">\u26a1 Kamu antrean <strong>#' + res.d.queueNo + "</strong> untuk drop " + (res.d.dropName || "") + "</p>";
        if (res.d.status === "awaiting_payment") {
          extra += '<p class="pay-line">\u26a1 Selesaikan pembayaran lalu upload bukti transfer di bagian <a href="#lacak" onclick="trackOrder(\'' + res.d.orderId + '\', \'' + escapeHtml(payload.email) + '\', true); return false;" style="color:var(--volt)">Lacak Pesanan #' + res.d.orderId + '</a>.</p>';
        }
        var waLink = waNumber
          ? ' <a href="https://wa.me/' + waNumber + '?text=' + encodeURIComponent("Halo KICKSTORM, saya baru saja checkout pesanan #" + res.d.orderId + " (" + rupiah(res.d.total) + "). Mohon konfirmasi ya.") + '" target="_blank" rel="noopener" style="color:var(--volt);text-decoration:underline">Konfirmasi via WhatsApp</a>'
          : "";
        msg.className = "form-msg ok";
        msg.innerHTML = "\u2713 Pesanan #" + res.d.orderId + " diterima \u2014 " + rupiah(res.d.total) + (res.d.shipping > 0 ? " (termasuk ongkir " + rupiah(res.d.shipping) + ")" : "") + waLink + extra;
        confetti();
        try {
          localStorage.setItem("ks_last_order", JSON.stringify({ id: res.d.orderId, email: payload.email }));
          renderTrackHistoryPill();
        } catch (e) {}
        cart = [];
        saveCart();
        coupon = null;
        document.getElementById("coupon-code").value = "";
        setCouponMsg("");
        saveCoupon();
        referral = null;
        document.getElementById("order-referral").value = "";
        setReferralMsg("");
        saveReferral();
        renderCart();
        document.getElementById("checkout-form").reset();
      } else {
        msg.className = "form-msg err";
        msg.textContent = res.d.error || "Terjadi kesalahan.";
      }
    })
    .catch(function () {
      msg.className = "form-msg err";
      msg.textContent = "Gagal terhubung ke server.";
    })
    .finally(function () { btn.disabled = false; });
});

document.getElementById("news-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var msg = document.getElementById("news-msg");
  var btn = document.getElementById("news-submit");
  msg.textContent = "Mengirim...";
  msg.className = "cta-note";
  btn.disabled = true;
  fetch("/api/subscribers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: document.getElementById("news-email").value.trim() })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok) {
        msg.textContent = "\u2713 " + res.d.message;
        msg.style.color = "var(--volt)";
        document.getElementById("news-email").value = "";
      } else {
        msg.textContent = res.d.error || "Terjadi kesalahan.";
        msg.style.color = "#FF5A4E";
      }
    })
    .catch(function () {
      msg.textContent = "Gagal terhubung ke server.";
      msg.style.color = "#FF5A4E";
    })
    .finally(function () { btn.disabled = false; });
});

function safeFormatDate(str) {
  if (!str) return "-";
  try {
    var s = String(str).replace(" ", "T");
    var d = new Date(s);
    if (isNaN(d.getTime())) d = new Date(str);
    if (isNaN(d.getTime())) return String(str);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return String(str || "-");
  }
}

function safeFormatDateTime(str) {
  if (!str) return "-";
  try {
    var s = String(str).replace(" ", "T");
    var d = new Date(s);
    if (isNaN(d.getTime())) d = new Date(str);
    if (isNaN(d.getTime())) return String(str);
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return String(str || "-");
  }
}

function renderTrackHistoryPill() {
  var el = document.getElementById("track-history-pill");
  if (!el) return;
  try {
    var raw = localStorage.getItem("ks_last_order");
    if (!raw) { el.hidden = true; el.innerHTML = ""; return; }
    var last = JSON.parse(raw);
    if (!last || !last.id) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = '<span class="muted" style="font-size:.78rem">Pesanan terakhirmu:</span> ' +
      '<button class="track-pill-btn" type="button" onclick="trackOrder(\'' + escapeHtml(String(last.id)) + '\', \'' + escapeHtml(String(last.email || '')) + '\', false)">' +
      '<span class="dot"></span> Lacak Pesanan #' + escapeHtml(String(last.id)) + (last.email ? ' (' + escapeHtml(String(last.email)) + ')' : '') + ' ↗</button>';
  } catch (e) {
    el.hidden = true;
    el.innerHTML = "";
  }
}

window.trackOrder = function (orderId, email, scroll) {
  var idInput = document.getElementById("track-id");
  var emailInput = document.getElementById("track-email");
  if (orderId !== undefined && orderId !== null && idInput) idInput.value = orderId;
  if (email !== undefined && email !== null && emailInput) emailInput.value = email;
  if (scroll) {
    var sec = document.getElementById("lacak");
    if (sec) sec.scrollIntoView({ behavior: "smooth" });
  }
  executeTrack(idInput ? idInput.value.trim() : orderId, emailInput ? emailInput.value.trim() : email);
};

function executeTrack(rawOrderId, rawEmail) {
  var out = document.getElementById("track-result");
  var btn = document.getElementById("track-btn");
  var idInput = document.getElementById("track-id");
  var emailInput = document.getElementById("track-email");

  var orderId = (rawOrderId !== undefined && rawOrderId !== null ? String(rawOrderId) : (idInput ? idInput.value : "")).trim();
  var email = (rawEmail !== undefined && rawEmail !== null ? String(rawEmail) : (emailInput ? emailInput.value : "")).trim();

  if (!orderId && !email) {
    out.innerHTML = '<div class="track-err-box"><p class="track-err">⚠️ Masukkan nomor pesanan (mis. 12 atau #12), nomor resi, atau email pemesan.</p></div>';
    return;
  }

  var searchLabel = orderId ? (orderId.startsWith("#") ? orderId : "#" + orderId) : email;
  out.innerHTML = '<p class="form-msg">🔍 Mencari pesanan ' + escapeHtml(searchLabel) + '...</p>';
  if (btn) btn.disabled = true;

  var url = "/api/track?orderId=" + encodeURIComponent(orderId) + "&email=" + encodeURIComponent(email);
  fetch(url)
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (!res.ok) {
        var errMsg = res.d && res.d.error ? res.d.error : "Pesanan tidak ditemukan.";
        out.innerHTML = '<div class="track-err-box">' +
          '<p class="track-err">⚠️ ' + escapeHtml(errMsg) + '</p>' +
          '<p class="muted" style="font-size:.8rem;margin-top:6px">Tips: Masukkan nomor pesanan yang benar (mis. <strong>12</strong> atau <strong>#12</strong>), atau cari menggunakan <strong>email pemesan</strong> saat checkout.</p>' +
          '</div>';
        return;
      }
      var o = res.d.order;
      if (!o) {
        out.innerHTML = '<div class="track-err-box"><p class="track-err">⚠️ Data pesanan tidak ditemukan.</p></div>';
        return;
      }

      // Save valid order to localStorage for quick access
      try {
        localStorage.setItem("ks_last_order", JSON.stringify({ id: o.id, email: o.email || email }));
        renderTrackHistoryPill();
      } catch (e) {}

      var labels = {
        awaiting_payment: "Menunggu Pembayaran",
        created: "Pesanan Dibuat",
        pending: "Menunggu Pembayaran",
        paid: "Pembayaran Diterima",
        shipped: "Sedang Dikirim",
        delivered: "Selesai",
        cancelled: "Dibatalkan"
      };

      var tgl = safeFormatDate(o.created_at);
      var itemsList = o.items || [];
      var items = itemsList.map(function (i) {
        return escapeHtml(i.product_name || "Produk") + " \u00d7" + (i.qty || 1) + (i.size ? " (Uk. " + escapeHtml(i.size) + ")" : "") + (i.colorway ? " \u00b7 " + escapeHtml(colorwayName(i.colorway)) : "");
      }).join(", ") || "Item pesanan";

      var historyList = o.history || [];
      var history = historyList.map(function (h) {
        var when = safeFormatDateTime(h.changed_at);
        return '<div class="tl-item"><span class="tl-dot"></span>' +
          '<span class="tl-label">' + (labels[h.to_status] || escapeHtml(h.to_status)) + "</span>" +
          '<span class="tl-time">' + when + "</span></div>";
      }).join("");

      var payBox = "";
      if (o.payment_proof) {
        payBox = '<div class="pay-upload pay-uploaded-box">' +
          '<p class="pay-title" style="color:var(--volt)">✅ Bukti Transfer Sudah Diunggah</p>' +
          '<a href="' + escapeHtml(o.payment_proof) + '" target="_blank" rel="noopener">' +
            '<img class="pay-preview" src="' + escapeHtml(o.payment_proof) + '" alt="Bukti Transfer" style="display:block;max-width:220px;border-radius:var(--radius-sm);margin:8px 0;border:1px solid var(--stroke-2)">' +
          '</a>' +
          (o.payment_note ? '<p class="muted" style="font-size:.8rem;margin-bottom:4px">Catatan: ' + escapeHtml(o.payment_note) + '</p>' : '') +
          '<p class="muted" style="font-size:.78rem">Admin sedang memverifikasi pembayaran pesananmu.</p>' +
        '</div>';
      } else if (o.status === "awaiting_payment" || (o.status === "pending" && o.payment_method !== "cod")) {
        payBox = '<div class="pay-upload">' +
          '<p class="pay-title">\u26a1 Upload Bukti Transfer Bank</p>' +
          '<p class="muted" style="font-size:.78rem;margin-bottom:8px">Silakan transfer total pesanan <strong>' + rupiah(o.total) + '</strong> lalu unggah struk / foto bukti transfer di bawah:</p>' +
          '<div class="pay-file-wrap" style="margin-bottom:8px">' +
            '<input class="field" type="file" id="pay-file" accept="image/*" aria-label="Pilih gambar bukti transfer">' +
          '</div>' +
          '<img class="pay-preview" id="pay-preview" alt="Pratinjau bukti transfer" hidden style="max-width:220px;border-radius:8px;margin-bottom:8px;border:1px solid var(--stroke-2);display:none">' +
          '<textarea class="field" id="pay-note" rows="2" placeholder="Catatan transfer (opsional): Bank pengirim, nama pemilik rekening, jam transfer..." maxlength="200"></textarea>' +
          '<button class="btn btn-primary btn-sm" type="button" id="pay-send" style="margin-top:8px;width:100%">🚀 Kirim Bukti Transfer</button>' +
          '<p class="form-msg" id="pay-msg" aria-live="polite" style="margin-top:6px"></p>' +
        '</div>';
      }

      var destinationLink = "";
      if (o.maps_url) {
        destinationLink = '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(o.maps_url) + '" target="_blank" rel="noopener" style="margin-top:8px;display:inline-block">📍 Buka Titik Rumah di Google Maps ↗</a>';
      } else if (o.lat && o.lng) {
        destinationLink = '<a class="btn btn-ghost btn-sm" href="https://www.google.com/maps?q=' + o.lat + ',' + o.lng + '" target="_blank" rel="noopener" style="margin-top:8px;display:inline-block">📍 Buka Titik Rumah di Google Maps ↗</a>';
      }

      var liveCourierBox = "";
      if (o.status === "shipped") {
        if (o.courier_share_url) {
          liveCourierBox = '<div class="track-courier-box">' +
            '<div class="tc-head">' +
              '<span class="tc-badge">Kurir Menuju Lokasi</span>' +
              '<span class="tc-live"><span class="dot"></span> Radar Live (Neon.tech)</span>' +
            '</div>' +
            '<p style="font-size:.82rem;margin-bottom:8px">Kurir <strong>' + escapeHtml(o.courier_name || "KICKSTORM Express") + '</strong> sedang di perjalanan membawa paketmu.</p>' +
            '<a class="btn btn-primary btn-sm" href="' + escapeHtml(o.courier_share_url) + '" target="_blank" rel="noopener">📡 Pantau Posisi Kurir di Google Maps ↗</a>' +
          '</div>';
        }
      }

      // --- Leaflet Live Interactive Map Container ---
      var mapContainerId = "live-tracking-map-" + o.id;
      var liveMapHtml = "";
      if (o.lat && o.lng) {
        var isShipped = o.status === "shipped";
        var mapTitle = isShipped ? "🛵 Live Tracking Pengantaran Kurir (Neon.tech)" : "📍 Titik Tujuan Pengantaran Sepatu";
        var pulseColor = isShipped ? "var(--volt)" : "#38BDF8";

        liveMapHtml = '<div class="live-track-leaflet-wrap">' +
          '<div class="lt-header">' +
            '<div class="lt-title">' +
              '<span class="live-pulse" style="background:' + pulseColor + '"></span>' +
              '<strong>' + mapTitle + '</strong>' +
            '</div>' +
            '<div class="lt-metrics" id="lt-metrics-' + o.id + '">' +
              (isShipped ? '<span class="lt-metric-pill">⚡ Terhubung ke Satelit GPS</span>' : '<span class="lt-metric-pill" style="border-color:rgba(56,189,248,0.4);color:#38BDF8">🏠 Alamat Pembeli</span>') +
            '</div>' +
          '</div>' +
          '<div id="' + mapContainerId + '" class="live-map-canvas"></div>' +
          '<div class="lt-footer">' +
            '<a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=' + o.lat + ',' + o.lng + '" target="_blank" rel="noopener">' +
              '🚀 Navigasi Google Maps ↗' +
            '</a>' +
            '<span class="muted" id="lt-status-note-' + o.id + '" style="font-size:0.75rem">' +
              (isShipped ? 'Kurir aktif • Memperbarui posisi otomatis' : 'Titik terdaftar di database') +
            '</span>' +
          '</div>' +
        '</div>';
      }

      var resiHtml = "";
      if (o.tracking_number) {
        resiHtml = '<p class="track-resi">Nomor resi: <strong>' + escapeHtml(o.tracking_number) + '</strong>' +
          '<button class="track-copy-resi" type="button" onclick="copyTextToClipboard(\'' + escapeHtml(o.tracking_number) + '\', this)">Salin</button>' +
          '</p>';
      }

      var refreshBtn = '<button class="track-btn-refresh" type="button" onclick="trackOrder(\'' + o.id + '\', \'' + escapeHtml(o.email || email) + '\', false)" title="Segarkan status pesanan">' +
        '🔄 Segarkan' +
        '</button>';

      var cancelBtnHtml = "";
      if (o.status === "pending" || o.status === "awaiting_payment") {
        cancelBtnHtml = '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--stroke-2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<span class="muted" style="font-size:0.78rem">Pesanan belum diproses kurir</span>' +
          '<button class="btn btn-danger btn-sm" type="button" onclick="cancelTrackedOrder(' + o.id + ', \'' + escapeHtml(o.email || email) + '\')">❌ Batalkan Pesanan</button>' +
        '</div>';
      }

      out.innerHTML = '<div class="track-card">' +
        '<div class="track-header-row">' +
          '<div>' +
            '<p class="card-tag">Pesanan #' + o.id + " \u2022 " + tgl + "</p>" +
            '<p class="track-items muted" style="margin:2px 0 6px">' + items + "</p>" +
            '<span class="card-price">' + rupiah(o.total) + "</span>" +
            (o.discount > 0 ? '<p class="muted" style="font-size:.78rem;margin-top:2px">Termasuk diskon ' + escapeHtml(o.coupon_code || "kupon") + " \u2212" + rupiah(o.discount) + "</p>" : "") +
            (o.queue_no ? '<p class="queue-chip">\u26a1 Antrean drop <strong>#' + o.queue_no + "</strong></p>" : "") +
            (o.courier_name ? '<p class="muted" style="font-size:.78rem;margin-top:2px">Kurir: <strong>' + escapeHtml(o.courier_name) + "</strong>" + (o.payment_method === "cod" ? " \u2022 Bayar di tempat (COD)" : " \u2022 Transfer bank") + "</p>" : "") +
          '</div>' +
          '<div style="text-align:right">' +
            '<span class="track-status"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:var(--volt);box-shadow:0 0 12px var(--volt-glow)"></span>' +
            (labels[o.status] || escapeHtml(o.status)) + '</span>' +
            '<div class="track-actions">' + refreshBtn + '</div>' +
          '</div>' +
        '</div>' +
        resiHtml +
        liveMapHtml +
        destinationLink +
        liveCourierBox +
        (history ? '<div class="track-timeline">' + history + "</div>" : "") +
        cancelBtnHtml +
        "</div>" +
        payBox +
        '<div id="member-box"></div>';

      // Initialize Leaflet Live Tracking Map
      if (o.lat && o.lng && window.L) {
        setTimeout(function () {
          initLiveTrackingMap(mapContainerId, o);
        }, 150);
      }

      wirePayUpload(o.id, o.email || email);
      if (o.email || email) {
        loadMemberCard(o.email || email);
      }
    })
    .catch(function (err) {
      console.error("Track error:", err);
      out.innerHTML = '<div class="track-err-box">' +
        '<p class="track-err">⚠️ Gagal terhubung ke server.</p>' +
        '<button class="btn btn-ghost btn-sm" type="button" style="margin-top:8px" onclick="trackOrder(\'' + escapeHtml(orderId) + '\', \'' + escapeHtml(email) + '\', false)">Coba Lagi 🔄</button>' +
        '</div>';
    })
    .finally(function () {
      if (btn) btn.disabled = false;
    });
}

/* ---- Leaflet Live Tracking Map Controller ---- */
var _activeTrackInterval = null;
function initLiveTrackingMap(containerId, order) {
  var el = document.getElementById(containerId);
  if (!el || !window.L) return;

  if (_activeTrackInterval) {
    clearInterval(_activeTrackInterval);
    _activeTrackInterval = null;
  }

  var buyerLat = Number(order.lat);
  var buyerLng = Number(order.lng);

  var trackMap = L.map(containerId, {
    zoomControl: true,
    attributionControl: false
  }).setView([buyerLat, buyerLng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(trackMap);

  // 1. Buyer / Destination Marker
  var buyerIcon = L.divIcon({
    className: "custom-leaflet-pin",
    html: '<div class="pin-marker-wrap"><span class="buyer-pulse"></span><div class="pin-buyer" title="Rumah Pembeli (Tujuan)">🏠</div></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  var markerBuyer = L.marker([buyerLat, buyerLng], {
    icon: buyerIcon,
    title: "Rumah Pembeli (Tujuan)"
  }).addTo(trackMap);

  markerBuyer.bindPopup("<b style='color:#38BDF8'>🏠 Rumah Pembeli (Tujuan)</b><br>" + escapeHtml(order.address || "Alamat Pembeli")).openPopup();

  // 2. Store Marker
  var storeLat = (shipCfg && shipCfg.store && shipCfg.store.lat) ? Number(shipCfg.store.lat) : -6.2087634;
  var storeLng = (shipCfg && shipCfg.store && shipCfg.store.lng) ? Number(shipCfg.store.lng) : 106.845599;

  var storeIcon = L.divIcon({
    className: "custom-leaflet-pin",
    html: '<div class="pin-marker-wrap"><div class="pin-store" title="KICKSTORM Jakarta Hub">🏬</div></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  var markerStore = L.marker([storeLat, storeLng], {
    icon: storeIcon,
    title: "KICKSTORM Hub"
  }).addTo(trackMap).bindPopup("<b>🏬 KICKSTORM Hub</b><br>Titik Awal Pengiriman");

  // 3. Courier Marker & Polyline
  var courierIcon = L.divIcon({
    className: "custom-leaflet-pin",
    html: '<div class="pin-marker-wrap"><span class="courier-pulse"></span><div class="pin-courier" title="Kurir KICKSTORM">🛵</div></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  var markerKurir = null;
  var polylineRoute = null;

  function updateCourierDisplay(kLat, kLng, courierName) {
    var cLat = Number(kLat);
    var cLng = Number(kLng);

    if (!markerKurir) {
      markerKurir = L.marker([cLat, cLng], {
        icon: courierIcon,
        title: "Posisi Kurir Saat Ini"
      }).addTo(trackMap);
      markerKurir.bindPopup("<b style='color:var(--volt)'>🛵 " + escapeHtml(courierName || "Kurir KICKSTORM") + "</b><br>Sedang membawa paketmu!").openPopup();
    } else {
      markerKurir.setLatLng([cLat, cLng]);
    }

    // Draw route line from Courier to Buyer
    var routePoints = [
      [cLat, cLng],
      [buyerLat, buyerLng]
    ];

    if (!polylineRoute) {
      polylineRoute = L.polyline(routePoints, {
        color: "#D6FF3F",
        weight: 4,
        opacity: 0.85,
        dashArray: "8, 8",
        lineCap: "round"
      }).addTo(trackMap);
    } else {
      polylineRoute.setLatLngs(routePoints);
    }

    // Fit map bounds to show both Courier and Buyer comfortably
    var bounds = L.latLngBounds([
      [cLat, cLng],
      [buyerLat, buyerLng]
    ]);
    trackMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });

    // Update Distance & ETA metrics in Header
    var distKm = Math.round(haversineDistance(cLat, cLng, buyerLat, buyerLng) * 10) / 10;
    var etaMins = Math.max(2, Math.round((distKm / 25) * 60) + 3);

    var metricsEl = document.getElementById("lt-metrics-" + order.id);
    if (metricsEl) {
      metricsEl.innerHTML = '<span class="lt-metric-pill">🛵 Jarak: ' + distKm + ' km</span>' +
        '<span class="lt-metric-pill" style="border-color:rgba(214,255,63,0.5);background:var(--volt);color:#0A0A0C">⏱️ Tiba dlm ~' + etaMins + ' menit</span>';
    }

    var noteEl = document.getElementById("lt-status-note-" + order.id);
    if (noteEl) {
      noteEl.innerHTML = '<span style="color:var(--volt)">● Live</span> Kurir <b>' + escapeHtml(courierName || "KICKSTORM") + '</b> sedang di jalan (Satelit terhubung)';
    }
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * (Math.PI / 180);
    var dLon = (lon2 - lon1) * (Math.PI / 180);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Initial Courier position check
  if (order.status === "shipped") {
    var initKurirLat = order.courier_lat || storeLat;
    var initKurirLng = order.courier_lng || storeLng;
    updateCourierDisplay(initKurirLat, initKurirLng, order.courier_name);

    // Auto-polling from Neon.tech every 5 seconds
    _activeTrackInterval = setInterval(function () {
      fetch("/api/lacak-pesanan/" + order.id)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.kurir && data.kurir.latitude != null && data.kurir.longitude != null) {
            updateCourierDisplay(data.kurir.latitude, data.kurir.longitude, data.kurir.nama_kurir);
          }
        })
        .catch(function () { });
    }, 5000);
  } else {
    // Fits bounds to Buyer & Store
    var staticBounds = L.latLngBounds([
      [storeLat, storeLng],
      [buyerLat, buyerLng]
    ]);
    trackMap.fitBounds(staticBounds, { padding: [40, 40], maxZoom: 15 });
  }

  setTimeout(function () {
    if (trackMap) trackMap.invalidateSize();
  }, 350);
}

window.copyTextToClipboard = function (text, btnEl) {
  if (!text) return;
  function done() {
    if (btnEl) {
      var prev = btnEl.textContent;
      btnEl.textContent = "Disalin \u2713";
      setTimeout(function () { btnEl.textContent = prev; }, 1500);
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
  } else {
    fallbackCopy(text);
    done();
  }
};

var trackForm = document.getElementById("track-form");
if (trackForm) {
  trackForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var idInput = document.getElementById("track-id");
    var emailInput = document.getElementById("track-email");
    var orderId = idInput ? idInput.value.trim() : "";
    var email = emailInput ? emailInput.value.trim() : "";
    executeTrack(orderId, email);
  });
}

var trackBtn = document.getElementById("track-btn");
if (trackBtn) {
  trackBtn.addEventListener("click", function (e) {
    var idInput = document.getElementById("track-id");
    var emailInput = document.getElementById("track-email");
    var orderId = idInput ? idInput.value.trim() : "";
    var email = emailInput ? emailInput.value.trim() : "";
    if (orderId || email) {
      e.preventDefault();
      executeTrack(orderId, email);
    }
  });
}

// Inisialisasi pill riwayat pesanan dan cek URL jika ada parameter
renderTrackHistoryPill();
(function initTrackFromStorageOrUrl() {
  try {
    var params = new URLSearchParams(window.location.search);
    var hash = window.location.hash || "";
    var qId = params.get("orderId") || params.get("id") || params.get("track");
    var qEmail = params.get("email");
    if (!qId && hash.includes("orderId=")) {
      var hashParams = new URLSearchParams(hash.split("?")[1] || "");
      qId = hashParams.get("orderId") || hashParams.get("id");
      qEmail = hashParams.get("email");
    }
    if (qId) {
      trackOrder(qId, qEmail || "", true);
    } else {
      var raw = localStorage.getItem("ks_last_order");
      if (raw) {
        var last = JSON.parse(raw);
        var idInput = document.getElementById("track-id");
        var emailInput = document.getElementById("track-email");
        if (idInput && !idInput.value && last && last.id) idInput.value = last.id;
        if (emailInput && !emailInput.value && last && last.email) emailInput.value = last.email;
      }
    }
  } catch (e) {}
})();

function wirePayUpload(orderId, email) {
  var file = document.getElementById("pay-file");
  var sendBtn = document.getElementById("pay-send");
  if (!file || !sendBtn) return;

  var selectedDataUrl = null;

  file.addEventListener("change", function () {
    var preview = document.getElementById("pay-preview");
    var msg = document.getElementById("pay-msg");
    if (file.files && file.files[0]) {
      var f = file.files[0];
      if (f.size > 10 * 1024 * 1024) {
        if (msg) {
          msg.textContent = "Ukuran gambar maksimal 10MB.";
          msg.className = "form-msg err";
        }
        file.value = "";
        selectedDataUrl = null;
        if (preview) { preview.hidden = true; preview.style.display = "none"; }
        return;
      }
      var reader = new FileReader();
      reader.onload = function (ev) {
        selectedDataUrl = ev.target.result;
        if (preview) {
          preview.src = selectedDataUrl;
          preview.hidden = false;
          preview.style.display = "block";
        }
        if (msg) {
          msg.textContent = "✓ Foto dipilih: " + f.name + " (" + Math.round(f.size / 1024) + " KB)";
          msg.className = "form-msg ok";
        }
      };
      reader.readAsDataURL(f);
    }
  });

  sendBtn.addEventListener("click", function () {
    var msg = document.getElementById("pay-msg");
    if (!selectedDataUrl) {
      if (msg) {
        msg.textContent = "⚠️ Pilih file foto/screenshot bukti transfer terlebih dahulu!";
        msg.className = "form-msg err";
      }
      file.click();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = "⏳ Mengunggah bukti...";
    if (msg) {
      msg.textContent = "Mengunggah bukti pembayaran...";
      msg.className = "form-msg";
    }

    var noteVal = document.getElementById("pay-note") ? document.getElementById("pay-note").value.trim() : "";

    fetch("/api/orders/" + orderId + "/payment-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: selectedDataUrl, note: noteVal })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) {
          if (msg) {
            msg.textContent = "✓ Bukti transfer berhasil dikirim! Admin akan segera memverifikasi.";
            msg.className = "form-msg ok";
          }
          sendBtn.textContent = "✅ Berhasil Terkirim";
          sendBtn.style.background = "var(--volt)";
          sendBtn.style.color = "#0A0A0C";
          setTimeout(function () {
            trackOrder(orderId, email || "", false);
          }, 1200);
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = "🚀 Kirim Bukti Transfer";
          if (msg) {
            msg.textContent = res.d.error || "Gagal mengunggah bukti transfer.";
            msg.className = "form-msg err";
          }
        }
      })
      .catch(function () {
        sendBtn.disabled = false;
        sendBtn.textContent = "🚀 Kirim Bukti Transfer";
        if (msg) {
          msg.textContent = "Gagal terhubung ke server.";
          msg.className = "form-msg err";
        }
      });
  });
}

function loadMemberCard(email) {
  var box = document.getElementById("member-box");
  if (!box) return;
  box.innerHTML = "";
  fetch("/api/member?email=" + encodeURIComponent(email)).then(function (r) { return r.json(); })
    .then(function (res) {
      var m = res.member;
      if (!m) return;
      var card = '<div class="member-card">' +
        '<p class="mc-title">Storm Club \u2022 Level <strong class="mc-level">' + m.level + "</strong></p>" +
        '<p class="mc-points"><strong>' + Number(m.points).toLocaleString("id-ID") + "</strong> poin" +
        (m.nextAt ? ' <span class="muted">(naik level di ' + Number(m.nextAt).toLocaleString("id-ID") + ' poin)</span>' : " \u2014 level maksimal") + "</p>";
      if (m.birthdayCoupon) {
        card += '<p class="mc-bday">\ud83c\udf82 Selamat ulang tahun! Kode kuponmu: <button class="mc-copy" type="button" data-copy="' + m.birthdayCoupon.code + '"><strong>' + m.birthdayCoupon.code + "</strong> \u2014 Salin</button> (15%, berlaku s.d. " + m.birthdayCoupon.expires + "). Pakai di keranjang.</p>";
      } else if (m.birthSet) {
        card += '<p class="mc-bday muted" style="font-size:.78rem">\ud83c\udf82 Kupon 15% akan aktif otomatis di hari ulang tahunmu (' + String(m.birth_month || "").padStart(2, "0") + "-" + String(m.birth_day || "").padStart(2, "0") + ").</p>";
      } else {
        card += '<div class="mc-birth-form">' +
          '<label class="muted" style="font-size:.78rem" for="mc-birth">Tanggal lahir (kupon 15% tiap ulang tahun):</label>' +
          '<input class="field" type="date" id="mc-birth" max="' + new Date().getFullYear() + '-12-31">' +
          '<button class="btn btn-ghost btn-sm" type="button" id="mc-birth-save">Simpan</button>' +
          '<p class="form-msg" id="mc-birth-msg" aria-live="polite"></p>' +
          "</div>";
      }
      box.innerHTML = card + "</div>";
      var copyBtn = box.querySelector("[data-copy]");
      if (copyBtn) copyBtn.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyBtn.dataset.copy).catch(function () { fallbackCopy(copyBtn.dataset.copy); });
        } else fallbackCopy(copyBtn.dataset.copy);
        copyBtn.textContent = copyBtn.textContent.replace("Salin", "Disalin \u2713");
      });
      var saveBtn = box.querySelector("#mc-birth-save");
      if (saveBtn) saveBtn.addEventListener("click", function () {
        var val = document.getElementById("mc-birth").value;
        var msgEl = document.getElementById("mc-birth-msg");
        if (!val) { msgEl.textContent = "Pilih tanggal lahir."; msgEl.className = "form-msg err"; return; }
        var parts = val.split("-");
        fetch("/api/member/birthday", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, birth: parts[1] + "-" + parts[2] })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { msgEl.textContent = "\u2713 " + d.message; msgEl.className = "form-msg ok"; loadMemberCard(email); }
          else { msgEl.textContent = d.error || "Gagal."; msgEl.className = "form-msg err"; }
        }).catch(function () { msgEl.textContent = "Gagal terhubung."; msgEl.className = "form-msg err"; });
      });
    })
    .catch(function () { });
}

fetch("/api/coupons")
  .then(function (r) { return r.json(); })
  .then(function (d) {
    var strip = document.getElementById("promo-strip");
    var list = document.getElementById("promo-list");
    if (!d.coupons || !d.coupons.length || !strip || !list) return;
    list.innerHTML = d.coupons.map(function (c) {
      var desc = c.type === "percent" ? "Diskon " + c.value + "%" : "Diskon " + rupiah(c.value);
      if (c.min_order > 0) desc += " \u2022 min " + rupiah(c.min_order);
      return '<button class="promo-chip" type="button" data-code="' + c.code + '" title="Salin kode">' +
        '<span class="pc-code">' + c.code + "</span>" +
        '<span class="pc-desc">' + desc + "</span>" +
        '<span class="pc-copy">Salin</span></button>';
    }).join("");
    strip.hidden = false;
  })
  .catch(function () {});

document.getElementById("promo-list").addEventListener("click", function (e) {
  var chip = e.target.closest("[data-code]");
  if (!chip) return;
  var code = chip.dataset.code;
  var copyEl = chip.querySelector(".pc-copy");
  function done() {
    copyEl.textContent = "Disalin \u2713";
    copyEl.classList.add("copied");
    setTimeout(function () {
      copyEl.textContent = "Salin";
      copyEl.classList.remove("copied");
    }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
  } else {
    fallbackCopy(code);
    done();
  }
  var input = document.getElementById("coupon-code");
  if (input) input.value = code;
});

function fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (err) {}
  document.body.removeChild(ta);
}

var variantFilter = "all";
var sortBy = "";

fetch("/api/products")
  .then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then(function (data) {
    PRODUCTS = data.products || [];
    renderProducts(PRODUCTS, variantFilter, sortBy);
    if (window.ScrollTrigger) setTimeout(function () { ScrollTrigger.refresh(); }, 250);
  })
  .catch(function (err) {
    console.error("Gagal memuat produk dari API:", err);
  });

  // Filter chip handlers
  document.querySelectorAll(".filter-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      variantFilter = this.dataset.filter === "all" ? "" : this.dataset.filter;
      renderProducts(PRODUCTS, variantFilter, sortBy);
      // Update active state
      document.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
    });
  });
  // Set "Semua" as active on page load
  document.querySelector('.filter-chip[data-filter="all"]').classList.add("active");

  // Sort chip handlers
  document.querySelectorAll(".sort-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      sortBy = this.dataset.sort;
      renderProducts(PRODUCTS, variantFilter, sortBy);
      // Update active state
      document.querySelectorAll(".sort-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
    });
  });

fetch("/api/stats")
  .then(function (r) { return r.json(); })
  .then(function (s) {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animNum(document.getElementById("stat-sold"), s.sold);
    } else {
      document.getElementById("stat-sold").textContent = Number(s.sold).toLocaleString("id-ID");
    }
    document.getElementById("stat-rating").textContent = s.rating;
    document.getElementById("stat-hours").textContent = s.shippingHours;
  });

window.cancelTrackedOrder = function (id, email) {
  if (!confirm("Apakah Anda yakin ingin membatalkan pesanan #" + id + "?")) return;
  fetch("/api/orders/" + id + "/cancel", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.ok) {
        alert("✓ Pesanan #" + id + " berhasil dibatalkan.");
        trackOrder(id, email || "", false);
      } else {
        alert(res.error || "Gagal membatalkan pesanan.");
      }
    })
    .catch(function () {
      alert("Gagal terhubung ke server.");
    });
};

wireBtns();

(function () {
  "use strict";

  var PRESETS = [
    {
      id: "volt_violet",
      code: "CUSTOM 01",
      name: "Volt Runner — Neon Violet Glow",
      shortName: "Volt & Violet (01)",
      title: "PURE WHITE / NEON VIOLET / AIR BUBBLE",
      desc: "Upper knit putih bersih dengan aksen neon ungu & sol air bubble menyala",
      image: "/images/koleksi_1.jpg",
      price: 1950000,
      specs: {
        upper: "Pure White Knit",
        accent: "Neon Violet Glow",
        sole: "Full Air Bubble",
        lace: "Lock-in Violet"
      }
    },
    {
      id: "mint_lilac",
      code: "CUSTOM 02",
      name: "Night Runner — Mint & Lilac Edition",
      shortName: "Mint & Lilac (02)",
      title: "PASTEL LILAC / MINT GREEN / NEON GLOW",
      desc: "Upper lilac lembut dipadu sol mint green bercahaya reflektif",
      image: "/images/koleksi_2.jpg",
      price: 1950000,
      specs: {
        upper: "Pastel Lilac Mesh",
        accent: "Glowing Swoosh",
        sole: "Mint Translucent Air",
        lace: "Lilac Flat"
      }
    },
    {
      id: "navy_rose",
      code: "CUSTOM 03",
      name: "Reign High — Navy & Rose Gold",
      shortName: "Navy & Rose (03)",
      title: "NAVY BLUE SUEDE / ROSE GOLD / HIGH TOP",
      desc: "Siluet high-top navy suede premium & kerah quilted eksklusif",
      image: "/images/koleksi_3.jpg",
      price: 2150000,
      specs: {
        upper: "Navy Blue Suede",
        accent: "Rose Gold Emblem",
        sole: "Soft Pink Air Sole",
        lace: "Navy Round Laces"
      }
    },
    {
      id: "solar_orange",
      code: "CUSTOM 04",
      name: "Ghost Zero — Solar Amber Orange",
      shortName: "Solar Orange (04)",
      title: "PITCH BLACK / SOLAR ORANGE / GLOW SWOOSH",
      desc: "Bodi all-black techwear dengan aksen amber orange api menyala",
      image: "/images/koleksi_4.jpg",
      price: 1950000,
      specs: {
        upper: "Matte Black & Leather",
        accent: "Solar Amber Swoosh",
        sole: "Amber Glow Sole",
        lace: "Black Rope Laces"
      }
    },
    {
      id: "desert_sand",
      code: "CUSTOM 05",
      name: "Hujan Runner — Desert Sand & Icy Blue",
      shortName: "Desert Sand (05)",
      title: "DESERT TAN / ICY BLUE SOLE / GOLD GLOW",
      desc: "Nuansa pasir gurun dipadukan dengan sol biru es transparan",
      image: "/images/koleksi_5.jpg",
      price: 1950000,
      specs: {
        upper: "Desert Sand Nubuck",
        accent: "Gold Luminous Swoosh",
        sole: "Icy Blue Air Sole",
        lace: "Tan Flat Laces"
      }
    },
    {
      id: "sand_glow",
      code: "CUSTOM 06",
      name: "Dawn Low — Sand Glow Special",
      shortName: "Sand Glow (06)",
      title: "WARM SAND / GOLDEN LIGHT / AIR MAX",
      desc: "Edisi reflektif emas hangat dengan bantalan udara penuh",
      image: "/images/koleksi_6.jpg",
      price: 1950000,
      specs: {
        upper: "Warm Sand Suede",
        accent: "Bright Gold Accent",
        sole: "Crystal Air Max",
        lace: "Sand Two-tone Laces"
      }
    }
  ];

  var SIZES = ["39", "40", "41", "42", "43", "44"];
  var DEFAULT_SIZE = "41";

  var state = {
    currentIndex: 0,
    size: DEFAULT_SIZE
  };

  function rupiah(n) {
    return "Rp " + Number(n).toLocaleString("id-ID");
  }

  function renderCarousel() {
    var carousel = document.getElementById("forge-carousel");
    var dots = document.getElementById("forge-dots");
    if (!carousel) return;

    carousel.innerHTML = PRESETS.map(function (p, i) {
      var activeClass = i === state.currentIndex ? " active" : "";
      return '<div class="forge-slide' + activeClass + '" data-index="' + i + '">' +
        '<img src="' + p.image + '" alt="' + p.name + '" class="forge-img" loading="eager" />' +
        '</div>';
    }).join("");

    if (dots) {
      dots.innerHTML = PRESETS.map(function (p, i) {
        var activeClass = i === state.currentIndex ? " active" : "";
        return '<button class="forge-dot' + activeClass + '" type="button" data-dot="' + i + '" aria-label="Edisi ' + (i + 1) + '" aria-pressed="' + (i === state.currentIndex ? "true" : "false") + '"></button>';
      }).join("");
    }
  }

  function renderSizes() {
    var wrap = document.getElementById("forge-sizes");
    if (!wrap) return;
    wrap.innerHTML = SIZES.map(function (s) {
      return '<button class="size-chip' + (s === state.size ? " active" : "") + '" type="button" data-size="' + s + '" aria-pressed="' + (s === state.size ? "true" : "false") + '">' + s + "</button>";
    }).join("");
  }

  function updateView() {
    var p = PRESETS[state.currentIndex];
    if (!p) return;

    // Update slides & dots
    var slides = document.querySelectorAll(".forge-slide");
    slides.forEach(function (slide, i) {
      if (i === state.currentIndex) slide.classList.add("active");
      else slide.classList.remove("active");
    });

    var dots = document.querySelectorAll(".forge-dot");
    dots.forEach(function (dot, i) {
      if (i === state.currentIndex) {
        dot.classList.add("active");
        dot.setAttribute("aria-pressed", "true");
      } else {
        dot.classList.remove("active");
        dot.setAttribute("aria-pressed", "false");
      }
    });

    // Update chip badge
    var chip = document.getElementById("forge-chip");
    if (chip) chip.textContent = p.code;

    // Update name & desc
    var nameEl = document.getElementById("forge-name");
    if (nameEl) nameEl.textContent = p.title;

    var descEl = document.getElementById("forge-desc-sub");
    if (descEl) descEl.textContent = p.desc;

    // Update specs box
    var sUpper = document.getElementById("forge-spec-upper");
    var sAccent = document.getElementById("forge-spec-accent");
    var sSole = document.getElementById("forge-spec-sole");
    var sLace = document.getElementById("forge-spec-lace");
    if (sUpper) sUpper.textContent = p.specs.upper;
    if (sAccent) sAccent.textContent = p.specs.accent;
    if (sSole) sSole.textContent = p.specs.sole;
    if (sLace) sLace.textContent = p.specs.lace;

    // Update price
    var priceEl = document.getElementById("forge-price");
    if (priceEl) priceEl.innerHTML = rupiah(p.price).replace("Rp ", "Rp <em>") + "</em>";

    // Update Preset filter chips
    var presetBtns = document.querySelectorAll("#forge-presets button");
    presetBtns.forEach(function (btn) {
      var idx = Number(btn.dataset.preset);
      if (idx === state.currentIndex) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }

  function setIndex(idx) {
    if (idx < 0) idx = PRESETS.length - 1;
    if (idx >= PRESETS.length) idx = 0;
    state.currentIndex = idx;
    updateView();
  }

  function addToCart() {
    var p = PRESETS[state.currentIndex];
    var name = "Storm Forge — " + p.name;
    var payload = JSON.stringify({
      n: p.title,
      img: p.image,
      preset: p.id,
      u: "#FFFFFF",
      a: "#D6FF3F",
      s: "#111113",
      l: "#111113"
    });
    var cart = window.cart || [];
    var key = "c:" + name + "|" + p.price + "|" + state.size + "|" + payload;
    var hit = cart.filter(function (i) { return i.custom && itemKey(i) === key; })[0];
    if (hit) hit.qty += 1;
    else cart.push({ custom: true, name: name, price: p.price, qty: 1, size: state.size, colorway: payload, image: p.image });
    window.cart = cart;
    if (window.saveCart) window.saveCart();
    var msg = document.getElementById("forge-msg");
    if (msg) {
      msg.className = "form-msg ok";
      msg.textContent = "\u2713 " + p.code + " (" + p.name + ") ditambahkan ke keranjang — Uk. " + state.size;
    }
    if (window.openCart) window.openCart();
  }

  function itemKey(i) {
    return "c:" + i.name + "|" + i.price + "|" + (i.size || "") + "|" + (i.colorway || "");
  }

  function initForge() {
    renderCarousel();
    renderSizes();
    updateView();

    // Navigation buttons
    var prevBtn = document.getElementById("forge-prev");
    var nextBtn = document.getElementById("forge-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        setIndex(state.currentIndex - 1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        setIndex(state.currentIndex + 1);
      });
    }

    // Dots click
    var dots = document.getElementById("forge-dots");
    if (dots) {
      dots.addEventListener("click", function (e) {
        var dot = e.target.closest(".forge-dot");
        if (dot && dot.dataset.dot !== undefined) {
          setIndex(Number(dot.dataset.dot));
        }
      });
    }

    // Preset buttons
    var presets = document.getElementById("forge-presets");
    if (presets) {
      presets.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-preset]");
        if (btn && btn.dataset.preset !== undefined) {
          setIndex(Number(btn.dataset.preset));
        }
      });
    }

    // Size buttons
    var sizeWrap = document.getElementById("forge-sizes");
    if (sizeWrap) {
      sizeWrap.addEventListener("click", function (e) {
        var btn = e.target.closest(".size-chip");
        if (btn && btn.dataset.size) {
          state.size = btn.dataset.size;
          renderSizes();
        }
      });
    }

    // Swipe gestures on stage for mobile
    var stage = document.getElementById("forge-stage");
    if (stage) {
      var touchStartX = 0;
      var touchEndX = 0;
      stage.addEventListener("touchstart", function (e) {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      stage.addEventListener("touchend", function (e) {
        touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) setIndex(state.currentIndex + 1);
          else setIndex(state.currentIndex - 1);
        }
      }, { passive: true });
    }

    // Add to cart
    var addBtn = document.getElementById("forge-add");
    if (addBtn) addBtn.addEventListener("click", addToCart);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initForge);
  } else {
    initForge();
  }
})();

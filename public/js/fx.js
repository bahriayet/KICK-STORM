(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = !!window.gsap;

  function $id(id) { return document.getElementById(id); }

  /* ============ 1. HUJAN + KILAT DI HERO ============ */
  function storm() {
    var host = $id("rain-canvas");
    var flash = $id("hero-flash");
    if (!host || !flash || reduce) return;

    var canvas = host;
    var ctx = canvas.getContext("2d");
    var DPR = Math.min(window.devicePixelRatio || 1, 2);

    var drops = [];
    var MAX_DROPS = 90;
    var running = true;
    var last = 0;
    var nextFlash = 4000 + Math.random() * 5000;

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.round(r.width * DPR);
      canvas.height = Math.round(r.height * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      spawn(Math.max(40, Math.round((r.width * r.height) / 14000)));
    }

    function spawn(n) {
      var w = canvas.width / DPR;
      var h = canvas.height / DPR;
      for (var i = 0; i < n; i++) {
        drops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          len: 12 + Math.random() * 18,
          speed: 260 + Math.random() * 380,
          w: Math.random() * 1.4 + 0.6
        });
      }
      if (drops.length > MAX_DROPS) drops.splice(0, drops.length - MAX_DROPS);
    }

    function strike(now) {
      if (now < nextFlash) return;
      nextFlash = now + 6000 + Math.random() * 9000;
      flash.classList.remove("strike");
      void flash.offsetWidth;
      flash.classList.add("strike");
    }

    function frame(now) {
      if (!running) return;
      var w = canvas.width / DPR;
      var h = canvas.height / DPR;
      var dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(214,255,63,.16)";
      ctx.lineCap = "round";
      strike(now);
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        d.y += d.speed * dt;
        if (d.y - d.len > h) {
          d.y = -d.len;
          d.x = Math.random() * w;
        }
        ctx.lineWidth = d.w;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 6 * dt * 14, d.y + d.len);
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        running = e.isIntersecting;
        if (running) { last = performance.now(); requestAnimationFrame(frame); }
      });
    }, { threshold: 0 });
    io.observe(host.closest(".hero"));

    window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(frame);
  }

  /* ============ 2. TILT 3D + GLARE KARTU ============ */
  function cardTilt() {
    if (reduce) return;
    var pending = null;
    var raf = null;

    function apply() {
      raf = null;
      var t = pending;
      pending = null;
      if (!t) return;
      t.card.style.transform = "perspective(900px) rotateX(" + t.rx + "deg) rotateY(" + t.ry + "deg)";
      t.card.style.setProperty("--gx", t.gx + "%");
      t.card.style.setProperty("--gy", t.gy + "%");
    }

    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest ? e.target.closest(".card") : null;
      if (!card) return;
      var rect = card.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      pending = {
        card: card,
        rx: (0.5 - py) * 10,
        ry: (px - 0.5) * 12,
        gx: (px * 100).toFixed(1),
        gy: (py * 100).toFixed(1)
      };
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    document.addEventListener("pointerleave", function () {
      var card = document.querySelector(".card:hover");
      if (card) return;
      document.querySelectorAll(".card").forEach(function (c) {
        c.style.transform = "";
      });
    }, { passive: true });
  }

  /* ============ 3. COUNTDOWN DROP (hero + navbar) ============ */
  function countdown() {
    var mainEl = $id("drop-countdown");
    var miniEl = $id("nav-mini-nums");
    var miniBar = $id("nav-mini");
    if (!mainEl && !miniEl) return;
    var KEY = "ks_drop_end";
    var end;
    try {
      end = Number(localStorage.getItem(KEY));
      if (!end || end < Date.now()) {
        end = Date.now() + (7 * 24 * 3600 + 11 * 3600 + 43 * 60) * 1000;
        localStorage.setItem(KEY, end);
      }
    } catch (e) {
      end = Date.now() + 7 * 24 * 3600 * 1000;
    }

    function pad(n) { return (n < 10 ? "0" : "") + n; }

    function render() {
      var diff = Math.max(0, end - Date.now());
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      if (mainEl) {
        mainEl.innerHTML =
          '<span class="dt-num">' + d + '</span><span class="dt-unit">Hari</span>' +
          '<span class="dt-sep">:</span>' +
          '<span class="dt-num">' + pad(h) + '</span><span class="dt-unit">Jam</span>' +
          '<span class="dt-sep">:</span>' +
          '<span class="dt-num">' + pad(m) + '</span><span class="dt-unit">Mnt</span>' +
          '<span class="dt-sep">:</span>' +
          '<span class="dt-num">' + pad(sec) + '</span><span class="dt-unit">Det</span>';
      }
      if (miniEl) miniEl.textContent = pad(d) + "H " + pad(h) + "J " + pad(m) + "M " + pad(sec) + "D";
    }
    render();
    setInterval(render, 1000);

    if (miniBar) {
      var onScroll = function () {
        miniBar.classList.toggle("show", (window.scrollY || document.documentElement.scrollTop) > window.innerHeight * 0.9);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  /* ============ 4. BACK TO TOP ============ */
  function backTop() {
    var btn = $id("back-top");
    if (!btn) return;
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    var onScroll = function () {
      btn.classList.toggle("show", (window.scrollY || document.documentElement.scrollTop) > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  }

  /* ============ 5. PRELOADER SINEMATIK ============ */
  function preloader() {
    var el = $id("preloader");
    if (!el) return;
    var finish = function () {
      if (!el || el.classList.contains("gone")) return;
      el.classList.add("gone");
      document.body.style.overflow = "";
    };
    if (reduce || !hasGsap) { setTimeout(finish, 350); return; }
    document.body.style.overflow = "hidden";
    gsap.timeline()
      .fromTo(".pre-bolt-path", { strokeDashoffset: 60 }, { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, 0.1)
      .fromTo(".pre-word", { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, 0.45)
      .fromTo(".pre-line i", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, 0.55)
      .to(el, { yPercent: -100, duration: 0.8, ease: "power4.inOut" }, 1.4)
      .add(finish, "+=0.2");
    setTimeout(finish, 3200);
  }


  /* ============ 7. SCRAMBLE TEXT JUDUL ============ */
  function scrambleTitles() {
    if (reduce || !hasGsap) return;
    var CHARS = "!<>-_\\/[]{}—=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    document.querySelectorAll(".section-title").forEach(function (el) {
      if (el.scrambled) return;
      var textNodes = [];
      el.childNodes.forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) textNodes.push(n);
      });
      if (!textNodes.length) return;
      el.scrambled = true;
      textNodes.forEach(function (t) { t.original = t.textContent; });
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: function () {
          var maxLen = 0;
          textNodes.forEach(function (t) { if (t.textContent.length > maxLen) maxLen = t.textContent.length; });
          var frames = Math.max(6, Math.round(maxLen / 2));
          var i = 0;
          var iv = setInterval(function () {
            i++;
            textNodes.forEach(function (t) {
              var s = t.original;
              var done = Math.floor((i / frames) * s.length);
              var out = "";
              for (var k = 0; k < s.length; k++) {
                out += k < done ? s[k] : CHARS[Math.floor(Math.random() * CHARS.length)];
              }
              t.textContent = out;
            });
            if (i >= frames) {
              clearInterval(iv);
              textNodes.forEach(function (t) { t.textContent = t.original; });
            }
          }, 36);
        }
      });
    });
  }

  /* ============ 8. PARALLAX SEPATU DI HERO ============ */
  function parallaxShoe() {
    if (reduce || !hasGsap || !window.matchMedia("(pointer: fine)").matches) return;
    var wrap = document.querySelector(".hero-shoe-wrap");
    var host = document.querySelector(".hero-visual");
    if (!wrap || !host) return;
    var rx = gsap.quickTo(wrap, "rotationX", { duration: 0.9, ease: "power3.out" });
    var ry = gsap.quickTo(wrap, "rotationY", { duration: 0.9, ease: "power3.out" });
    host.addEventListener("pointermove", function (e) {
      var r = host.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      rx(py * -10);
      ry(px * 14);
    });
    host.addEventListener("pointerleave", function () { rx(0); ry(0); });
  }

  /* ============ 9. FOOTER REVEAL ============ */
  function footerReveal() {
    if (reduce) return;
    var footer = document.querySelector(".footer");
    if (!footer) return;
    var html = document.documentElement;
    var trailing = null;

    function paint() {
      var h = footer.offsetHeight;
      html.style.setProperty("--footer-h", h + "px");
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      var start = maxScroll - h;
      var p = (window.scrollY - start) / (maxScroll - start);
      p = Math.min(1, Math.max(0, p));
      var y = Math.round((1 - p) * h);
      if (y !== paint.lastY) {
        paint.lastY = y;
        footer.style.transform = "translateY(" + y + "px)";
      }
    }
    paint.lastY = null;

    function onScroll() {
      paint();
      clearTimeout(trailing);
      trailing = setTimeout(paint, 250);
    }

    html.classList.add("footer-reveal");
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { paint(); });
    if (window.ScrollTrigger && typeof ScrollTrigger.addEventListener === "function") {
      ScrollTrigger.addEventListener("refresh", paint);
    }
    setInterval(paint, 500);
  }

  /* ============ 10. EASTER EGG KONAMI ============ */
  function konamiStorm() {
    if (reduce) return;
    var SEQ = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    var idx = 0;
    var active = false;

    document.addEventListener("keydown", function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") { idx = 0; return; }
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === SEQ[idx]) {
        idx++;
        if (idx === SEQ.length) { idx = 0; toggle(); }
      } else {
        idx = k === SEQ[0] ? 1 : 0;
      }
    });

    function toggle() {
      active = !active;
      var body = document.body;
      var badge = body.querySelector(".storm-badge");
      if (active) {
        var canvas = document.createElement("canvas");
        canvas.className = "storm-canvas";
        var flash = document.createElement("div");
        flash.className = "storm-flash";
        badge = document.createElement("div");
        badge.className = "storm-badge";
        badge.innerHTML = '<span class="live-pulse"></span>STORM MODE \u2014 tekan Konami lagi untuk berhenti';
        body.appendChild(canvas);
        body.appendChild(flash);
        body.appendChild(badge);
        requestAnimationFrame(function () { badge.classList.add("show"); });
        runStorm(canvas, flash);
      } else if (badge) {
        badge.classList.remove("show");
        var c = body.querySelector(".storm-canvas");
        var f = body.querySelector(".storm-flash");
        if (c) c.remove();
        if (f) f.remove();
        setTimeout(function () { badge.remove(); }, 500);
      }
    }

    function runStorm(canvas, flash) {
      var ctx = canvas.getContext("2d");
      var DPR = Math.min(window.devicePixelRatio || 1, 2);
      var drops = [];
      var last = 0;
      var nextFlash = 3000 + Math.random() * 3000;

      function resize() {
        canvas.width = Math.round(window.innerWidth * DPR);
        canvas.height = Math.round(window.innerHeight * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
      resize();
      window.addEventListener("resize", resize);

      var w, h;
      function frame(now) {
        if (!document.body.contains(canvas)) return;
        w = window.innerWidth;
        h = window.innerHeight;
        var dt = Math.min((now - last) / 1000 || 0.016, 0.05);
        last = now;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(214,255,63,.22)";
        ctx.lineCap = "round";
        if (now >= nextFlash) {
          nextFlash = now + 4000 + Math.random() * 5000;
          flash.classList.remove("strike");
          void flash.offsetWidth;
          flash.classList.add("strike");
        }
        for (var i = 0; i < drops.length; i++) {
          var d = drops[i];
          d.y += d.speed * dt;
          if (d.y - d.len > h) { d.y = -d.len; d.x = Math.random() * w; }
          ctx.lineWidth = d.w;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 6 * dt * 14, d.y + d.len);
          ctx.stroke();
        }
        while (drops.length < 140) {
          drops.push({
            x: Math.random() * w, y: Math.random() * h,
            len: 12 + Math.random() * 20, speed: 260 + Math.random() * 400, w: Math.random() * 1.4 + 0.6
          });
        }
        requestAnimationFrame(frame);
      }
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  /* ============ 11. BLOB GLOW DI LATAR ============ */
  function bgOrbs() {
    if (reduce || !hasGsap) return;
    var COLS = [
      ["214,255,63", 0.3],
      ["63,169,255", 0.22],
      ["255,79,216", 0.18]
    ];
    var hosts = document.querySelectorAll(".section, .cta");
    var wide = window.innerWidth >= 1024;
    hosts.forEach(function (sec) {
      var r = sec.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      var n = wide ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var orb = document.createElement("div");
        orb.className = "bg-orb";
        var c = COLS[Math.floor(Math.random() * COLS.length)];
        var size = 120 + Math.random() * 120;
        orb.style.cssText =
          "width:" + size + "px;height:" + size + "px;" +
          "left:" + (Math.random() * 50).toFixed(1) + "%;" +
          "top:" + (8 + Math.random() * 72).toFixed(1) + "%;" +
          "background:radial-gradient(circle,rgba(" + c[0] + ",.5),transparent 70%);" +
          "opacity:" + c[1];
        sec.appendChild(orb);
        gsap.to(orb, {
          x: 20 + Math.random() * 40,
          y: -20 - Math.random() * 40,
          duration: 10 + Math.random() * 8,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut"
        });
      }
    });
  }

  storm();
  cardTilt();
  countdown();
  backTop();
  preloader();
  scrambleTitles();
  parallaxShoe();
  footerReveal();
  konamiStorm();
  bgOrbs();
})();

/**
 * KICKSTORM Video Showcase & Dynamic Visual Reel Engine
 * Photorealistic multi-angle interactive sneaker showcase with 3D tilt,
 * cinematic scene loop, audio feedback, and scroll synchronization.
 */
(function () {
  "use strict";

  var SCENES = [
    {
      id: "angle-1",
      src: "/images/hero_angle1.jpg",
      tag: "SCENE 01 / PROFILE",
      title: "Volt 3/4 Dynamic",
      desc: "Siluet badai perkotaan dengan aksen Volt Lime menyala di tengah gelap.",
      hotspots: [
        { x: 49, y: 44, title: "Volt Aura™", desc: "Aksen neon menyala reflektif di malam hari." },
        { x: 67, y: 38, title: "StormKnit™", desc: "Upper rajut 210 gram tahan air & bernapas." }
      ]
    },
    {
      id: "angle-2",
      src: "/images/hero_angle2.jpg",
      tag: "SCENE 02 / CUSHIONING",
      title: "BounceFoam™ Core",
      desc: "Bantalan sol responsif generasi terbaru dengan energi kembali 72%.",
      hotspots: [
        { x: 64, y: 73, title: "Air Cushion Pods", desc: "Peredam benturan langkah ekstrem." },
        { x: 53, y: 42, title: "Lightning Emblem", desc: "Logo badai berlapis neon luminesens." }
      ]
    },
    {
      id: "angle-3",
      src: "/images/hero_angle3.jpg",
      tag: "SCENE 03 / IMPACT",
      title: "Storm Strike Action",
      desc: "Diuji melewati 10.000 langkah di jalanan basah tanpa penurunan performa.",
      hotspots: [
        { x: 47, y: 41, title: "Volt Lock Laces", desc: "Sistem tali presisi anti-kendur." },
        { x: 74, y: 36, title: "Heel Counter", desc: "Stabilisator tumit saat manuver cepat." }
      ]
    },
    {
      id: "angle-4",
      src: "/images/hero_angle4.jpg",
      tag: "SCENE 04 / TRACTION",
      title: "Hydro-Grip Outsole",
      desc: "Pola sol karet vulkanisir dengan cengkeraman maksimal di medan basah.",
      hotspots: [
        { x: 42, y: 22, title: "Waffle Tread", desc: "Pola tapak pembuang air kilat." },
        { x: 58, y: 54, title: "Volt Pod Sole", desc: "Karet elastis tahan aus hingga 12 bulan." }
      ]
    }
  ];

  // Simple Web Audio SFX for cinematic feel
  var audioCtx = null;
  var soundEnabled = false;

  function playWhoosh() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();

      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      var filter = audioCtx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(140, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, audioCtx.currentTime + 0.12);
      osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.35);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2400, audioCtx.currentTime + 0.15);
      filter.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.36);
    } catch (e) {}
  }

  function initHeroShowcase(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var currentIndex = 0;
    var isPlaying = !reduceMotion;
    var autoPlayTimer = null;
    var sceneDuration = 4800; // ms per scene
    var progressInterval = null;
    var progressStartTime = 0;

    // Build DOM
    container.innerHTML = 
      '<div class="showcase-card" id="showcase-card">' +
        '<div class="showcase-viewport">' +
          '<div class="showcase-layers" id="showcase-layers">' +
            SCENES.map(function (s, i) {
              var imgAttr = i === 0
                ? 'src="' + s.src + '"'
                : 'src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'/%3E" data-src="' + s.src + '"';
              return '<div class="showcase-slide ' + (i === 0 ? "active" : "") + '" data-index="' + i + '">' +
                '<img ' + imgAttr + ' alt="' + s.title + '" class="showcase-img" draggable="false" />' +
                '<div class="showcase-shimmer"></div>' +
                '<div class="showcase-scanline"></div>' +
                '<div class="showcase-hotspots">' +
                  s.hotspots.map(function (h) {
                    return '<div class="hotspot-point" style="left:' + h.x + '%;top:' + h.y + '%" tabindex="0">' +
                      '<span class="hotspot-pulse"></span>' +
                      '<span class="hotspot-dot"></span>' +
                      '<div class="hotspot-tooltip"><strong>' + h.title + '</strong><p>' + h.desc + '</p></div>' +
                    '</div>';
                  }).join("") +
                '</div>' +
              '</div>';
            }).join("") +

          '</div>' +
          '<div class="showcase-flare"></div>' +
          '<div class="showcase-lightning" id="showcase-lightning"></div>' +
        '</div>' +

        // Top Status Header
        '<div class="showcase-overlay-top">' +
          '<div class="showcase-live-badge"><span class="live-dot"></span> 4K REEL LIVE</div>' +
          '<div class="showcase-scene-tag" id="showcase-scene-tag">' + SCENES[0].tag + '</div>' +
          '<button class="showcase-sound-btn" id="showcase-sound-btn" type="button" aria-label="Toggle Sound Effect" title="Efek Suara Video">' +
            '<svg class="icon-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>' +
            '<svg class="icon-sound" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' +
          '</button>' +
        '</div>' +

        // Bottom Controls Bar
        '<div class="showcase-controls">' +
          '<div class="showcase-info">' +
            '<h3 class="showcase-title" id="showcase-title">' + SCENES[0].title + '</h3>' +
            '<p class="showcase-desc" id="showcase-desc">' + SCENES[0].desc + '</p>' +
          '</div>' +

          '<div class="showcase-progress-bar">' +
            SCENES.map(function (_, i) {
              return '<div class="progress-segment ' + (i === 0 ? "active" : "") + '" data-idx="' + i + '"><i class="progress-fill"></i></div>';
            }).join("") +
          '</div>' +

          '<div class="showcase-nav-row">' +
            '<div class="showcase-angle-chips">' +
              SCENES.map(function (s, i) {
                return '<button class="angle-chip ' + (i === 0 ? "active" : "") + '" type="button" data-idx="' + i + '">' +
                  '0' + (i + 1) +
                '</button>';
              }).join("") +
            '</div>' +

            '<div class="showcase-playback">' +
              '<button class="btn-play-pause" id="showcase-play-pause" type="button" aria-label="Play / Pause Reel">' +
                '<svg class="icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
                '<svg class="icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
              '</button>' +
              '<span class="showcase-time" id="showcase-time">01 / 04</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var card = container.querySelector("#showcase-card");
    var slides = container.querySelectorAll(".showcase-slide");
    var progressSegments = container.querySelectorAll(".progress-segment");
    var angleChips = container.querySelectorAll(".angle-chip");
    var tagEl = container.querySelector("#showcase-scene-tag");
    var titleEl = container.querySelector("#showcase-title");
    var descEl = container.querySelector("#showcase-desc");
    var timeEl = container.querySelector("#showcase-time");
    var playPauseBtn = container.querySelector("#showcase-play-pause");
    var soundBtn = container.querySelector("#showcase-sound-btn");
    var lightningOverlay = container.querySelector("#showcase-lightning");

    function goToScene(idx, manual) {
      if (idx < 0) idx = SCENES.length - 1;
      if (idx >= SCENES.length) idx = 0;
      currentIndex = idx;
      var cur = SCENES[idx];

      slides.forEach(function (sl, i) {
        sl.classList.toggle("active", i === idx);
        // Lazy-load image on first visit
        if (i === idx) {
          var img = sl.querySelector(".showcase-img");
          if (img && img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
        }
      });

      angleChips.forEach(function (ch, i) {
        ch.classList.toggle("active", i === idx);
      });

      progressSegments.forEach(function (ps, i) {
        ps.classList.remove("active", "completed");
        var fill = ps.querySelector(".progress-fill");
        if (i < idx) {
          ps.classList.add("completed");
          if (fill) fill.style.transform = "scaleX(1)";
        } else if (i === idx) {
          ps.classList.add("active");
          if (fill) fill.style.transform = "scaleX(0)";
        } else {
          if (fill) fill.style.transform = "scaleX(0)";
        }
      });

      if (tagEl) tagEl.textContent = cur.tag;
      if (titleEl) {
        titleEl.textContent = cur.title;
        if (window.gsap) {
          gsap.fromTo(titleEl, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
        }
      }
      if (descEl) {
        descEl.textContent = cur.desc;
        if (window.gsap) {
          gsap.fromTo(descEl, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, delay: 0.05, ease: "power2.out" });
        }
      }
      if (timeEl) timeEl.textContent = "0" + (idx + 1) + " / 0" + SCENES.length;

      // Trigger dynamic lightning flash
      triggerLightning();
      playWhoosh();

      progressStartTime = performance.now();
    }

    function triggerLightning() {
      if (reduceMotion || !lightningOverlay) return;
      lightningOverlay.classList.remove("flash-active");
      void lightningOverlay.offsetWidth; // reflow
      lightningOverlay.classList.add("flash-active");
    }

    function nextScene() {
      goToScene(currentIndex + 1, false);
    }

    var isVisible = true;

    function startProgressLoop() {
      if (progressInterval) cancelAnimationFrame(progressInterval);
      progressStartTime = performance.now();

      function tick(now) {
        if (isPlaying && isVisible) {
          var elapsed = now - progressStartTime;
          var pct = Math.min(elapsed / sceneDuration, 1);
          var activeFill = progressSegments[currentIndex] ? progressSegments[currentIndex].querySelector(".progress-fill") : null;
          if (activeFill) {
            activeFill.style.transform = "scaleX(" + pct + ")";
          }
          if (elapsed >= sceneDuration) {
            nextScene();
          }
        }
        if (isVisible) {
          progressInterval = requestAnimationFrame(tick);
        }
      }
      if (isVisible) {
        progressInterval = requestAnimationFrame(tick);
      }
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      var iconPause = playPauseBtn.querySelector(".icon-pause");
      var iconPlay = playPauseBtn.querySelector(".icon-play");
      if (iconPause) iconPause.style.display = isPlaying ? "block" : "none";
      if (iconPlay) iconPlay.style.display = isPlaying ? "none" : "block";
      if (isPlaying) {
        progressStartTime = performance.now();
        if (isVisible && !progressInterval) startProgressLoop();
      }
    }

    // 3D Parallax & Gyro Tilt (Hanya aktif untuk desktop mouse pointer agar HP tidak lag)
    var isFinePointer = window.matchMedia("(pointer: fine)").matches;
    var cardBounds = null;
    var targetTiltX = 0;
    var targetTiltY = 0;
    var currentTiltX = 0;
    var currentTiltY = 0;
    var tiltRaf = null;
    var tiltActive = false;

    function updateTilt() {
      if (!isFinePointer || reduceMotion || !isVisible) {
        tiltRaf = null;
        return;
      }
      currentTiltX += (targetTiltX - currentTiltX) * 0.1;
      currentTiltY += (targetTiltY - currentTiltY) * 0.1;

      if (card) {
        card.style.transform = 
          "perspective(1000px) rotateX(" + currentTiltX.toFixed(2) + "deg) rotateY(" + currentTiltY.toFixed(2) + "deg) translateZ(0)";
      }

      // Stop RAF loop jika sudah diam mendekati 0 untuk menghemat baterai & CPU
      if (Math.abs(targetTiltX - currentTiltX) < 0.01 && Math.abs(targetTiltY - currentTiltY) < 0.01 && !tiltActive) {
        tiltRaf = null;
        return;
      }
      tiltRaf = requestAnimationFrame(updateTilt);
    }

    if (isFinePointer && !reduceMotion) {
      container.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        tiltActive = true;
        if (!cardBounds) cardBounds = container.getBoundingClientRect();
        var x = (e.clientX - cardBounds.left) / cardBounds.width - 0.5;
        var y = (e.clientY - cardBounds.top) / cardBounds.height - 0.5;
        targetTiltY = x * 14;  // rotateY
        targetTiltX = -y * 12; // rotateX

        var flare = container.querySelector(".showcase-flare");
        if (flare) {
          flare.style.transform = "translate(" + (x * 40) + "px, " + (y * 40) + "px)";
          flare.style.opacity = "0.7";
        }
        if (!tiltRaf) tiltRaf = requestAnimationFrame(updateTilt);
      }, { passive: true });

      container.addEventListener("pointerleave", function () {
        tiltActive = false;
        targetTiltX = 0;
        targetTiltY = 0;
        cardBounds = null;
        var flare = container.querySelector(".showcase-flare");
        if (flare) flare.style.opacity = "0.4";
        if (!tiltRaf) tiltRaf = requestAnimationFrame(updateTilt);
      }, { passive: true });
    }

    // IntersectionObserver: Jeda total saat user scroll ke bawah (sangat menghemat daya HP & RAM)
    var showcaseIO = null;
    if ("IntersectionObserver" in window) {
      showcaseIO = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        var wasVisible = isVisible;
        isVisible = entry && entry.isIntersecting;
        if (isVisible && !wasVisible) {
          progressStartTime = performance.now();
          startProgressLoop();
          if (isFinePointer && !reduceMotion && !tiltRaf) {
            tiltRaf = requestAnimationFrame(updateTilt);
          }
        } else if (!isVisible && wasVisible) {
          if (progressInterval) {
            cancelAnimationFrame(progressInterval);
            progressInterval = null;
          }
          if (tiltRaf) {
            cancelAnimationFrame(tiltRaf);
            tiltRaf = null;
          }
        }
      }, { threshold: 0.05 });
      showcaseIO.observe(container);
    }

    // Angle Chips Click
    angleChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var idx = parseInt(chip.getAttribute("data-idx"), 10);
        goToScene(idx, true);
      });
    });

    // Progress Bar Segment Click
    progressSegments.forEach(function (seg) {
      seg.addEventListener("click", function () {
        var idx = parseInt(seg.getAttribute("data-idx"), 10);
        goToScene(idx, true);
      });
    });

    // Play/Pause Button Click
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", togglePlay);
    }

    // Sound Toggle Click
    if (soundBtn) {
      soundBtn.addEventListener("click", function () {
        soundEnabled = !soundEnabled;
        var iconMuted = soundBtn.querySelector(".icon-muted");
        var iconSound = soundBtn.querySelector(".icon-sound");
        if (iconMuted) iconMuted.style.display = soundEnabled ? "none" : "block";
        if (iconSound) iconSound.style.display = soundEnabled ? "block" : "none";
        soundBtn.classList.toggle("active", soundEnabled);
        if (soundEnabled) playWhoosh();
      });
    }

    // Hotspot interaction
    container.querySelectorAll(".hotspot-point").forEach(function (hp) {
      hp.addEventListener("click", function (e) {
        e.stopPropagation();
        hp.classList.toggle("opened");
      });
    });

    // Start playback
    goToScene(0);
    startProgressLoop();

    return {
      goToScene: goToScene,
      togglePlay: togglePlay,
      destroy: function () {
        if (progressInterval) cancelAnimationFrame(progressInterval);
        if (tiltRaf) cancelAnimationFrame(tiltRaf);
        if (showcaseIO) showcaseIO.disconnect();
      }
    };
  }

  // Pin / Story Section Cinematic Showcase Sync
  function initStoryShowcase(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = 
      '<div class="story-showcase-wrap">' +
        SCENES.map(function (s, i) {
          return '<div class="story-slide ' + (i === 0 ? "active" : "") + '" data-story-idx="' + i + '">' +
            '<img src="' + s.src + '" alt="' + s.title + '" class="story-img" />' +
            '<div class="story-overlay-badge">' +
              '<span class="dot"></span> ' + s.title +
            '</div>' +
          '</div>';
        }).join("") +
        '<div class="story-shimmer"></div>' +
      '</div>';

    var slides = container.querySelectorAll(".story-slide");

    return {
      setProgress: function (progress) {
        // Progress 0.0 to 1.0 maps to slides 0, 1, 2
        var index = Math.min(Math.floor(progress * 3), 2);
        slides.forEach(function (sl, i) {
          sl.classList.toggle("active", i === index);
        });
      }
    };
  }

  window.KickstormShowcase = {
    initHeroShowcase: initHeroShowcase,
    initStoryShowcase: initStoryShowcase,
    SCENES: SCENES
  };
})();

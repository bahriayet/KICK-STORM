import * as THREE from "/vendor/three.module.js";

(function () {
  var wrap = document.querySelector(".hero-shoe-wrap");
  var host = document.getElementById("shoe3d");
  if (!wrap || !host) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var gl;
  try {
    var probe = document.createElement("canvas");
    gl = probe.getContext("webgl2") || probe.getContext("webgl");
  } catch (err) { gl = null; }
  if (!gl) return; // fallback: SVG tetap tampil

  try {
    init();
  } catch (err) {
    console.warn("3D gagal dimuat, memakai fallback SVG:", err);
  }

  function init() {
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(1.15, 0.7, 5.2);
    camera.lookAt(0, 0.52, 0);

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3, 4.5, 3);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xd6ff3f, 0.85);
    rim.position.set(-3.5, 1.2, -3);
    scene.add(rim);
    var voltFill = new THREE.PointLight(0xd6ff3f, 0.9, 8);
    voltFill.position.set(0.4, 1.4, 2.4);
    scene.add(voltFill);

    // ---- shadow blob ----
    var shCanvas = document.createElement("canvas");
    shCanvas.width = shCanvas.height = 256;
    var shCtx = shCanvas.getContext("2d");
    var grad = shCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    shCtx.fillStyle = grad;
    shCtx.fillRect(0, 0, 256, 256);
    var shTex = new THREE.CanvasTexture(shCanvas);
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 48),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.scale.set(2.05, 1.15, 1);
    scene.add(shadow);

    // ---- materials ----
    var matKnit = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.85, metalness: 0.05 });
    var matToe = new THREE.MeshStandardMaterial({ color: 0xe7e7e0, roughness: 0.9, metalness: 0 });
    var matDark = new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 0.7, metalness: 0.05 });
    var matRubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55, metalness: 0.05 });
    var matVolt = new THREE.MeshStandardMaterial({ color: 0xd6ff3f, roughness: 0.35, metalness: 0, emissive: 0xd6ff3f, emissiveIntensity: 0.22 });

    // ---- parts collector (lampu & bayangan tetap di scene root) ----
    var parts = [];
    function part(geo, mat) {
      var m = new THREE.Mesh(geo, mat);
      parts.push(m);
      scene.add(m);
      return m;
    }
    // ---- upper: side profile extrude ----
    var shape = new THREE.Shape();
    shape.moveTo(-1.18, 0.32);
    shape.quadraticCurveTo(-1.06, 0.88, -0.6, 1.06);
    shape.quadraticCurveTo(-0.28, 1.2, 0.14, 1.05);
    shape.quadraticCurveTo(0.62, 0.94, 1.0, 0.7);
    shape.quadraticCurveTo(1.3, 0.52, 1.32, 0.38);
    shape.lineTo(1.28, 0.34);
    shape.lineTo(-1.18, 0.32);

    var upperGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.92,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 2
    });
    upperGeo.translate(0, 0, -0.46);
    var upper = part(upperGeo, matKnit);

    // toe cap panel
    var toeCap = part(new THREE.BoxGeometry(0.44, 0.3, 0.94), matToe);
    toeCap.position.set(1.06, 0.46, 0);
    toeCap.rotation.z = -0.1;

    // heel counter
    var heel = part(new THREE.BoxGeometry(0.15, 0.52, 0.96), matDark);
    heel.position.set(-1.0, 0.62, 0);

    // collar
    var collar = part(new THREE.BoxGeometry(0.3, 0.17, 0.98), matDark);
    collar.position.set(-0.55, 1.14, 0);
    collar.rotation.z = 0.2;

    // lace panel + laces (volt)
    var lacePanel = part(new THREE.BoxGeometry(0.56, 0.05, 0.86), matDark);
    lacePanel.position.set(0.06, 1.1, 0);
    for (var i = 0; i < 4; i++) {
      var lace = part(new THREE.BoxGeometry(0.19, 0.06, 0.74), matVolt);
      lace.position.set(-0.2 + i * 0.2, 1.16, 0);
      lace.rotation.z = -0.08;
    }

    // signature volt strap across the side
    var strap = part(new THREE.BoxGeometry(0.1, 0.7, 0.06), matVolt);
    strap.position.set(0.16, 0.58, 0.49);
    strap.rotation.z = 0.62;

    // volt lightning line on upper side
    var voltLine = part(new THREE.BoxGeometry(0.72, 0.04, 0.02), matVolt);
    voltLine.position.set(-0.22, 0.52, 0.485);
    voltLine.rotation.z = -0.06;

    // midsole (volt) + outsole (dark)
    var midsole = part(new THREE.BoxGeometry(2.64, 0.11, 0.98), matVolt);
    midsole.position.y = 0.215;
    var outsole = part(new THREE.BoxGeometry(2.74, 0.16, 1.08), matRubber);
    outsole.position.y = 0.08;
    var toeLip = part(new THREE.BoxGeometry(0.42, 0.12, 1.0), matRubber);
    toeLip.position.set(1.36, 0.12, 0);
    toeLip.rotation.z = -0.04;

    // heel pull tab
    var pullTab = part(new THREE.BoxGeometry(0.06, 0.2, 0.5), matVolt);
    pullTab.position.set(-1.08, 1.06, 0);

    // ---- group for rotation (hanya mesh; lampu & bayangan tetap di scene) ----
    var shoe = new THREE.Group();
    parts.forEach(function (m) { shoe.add(m); });
    shoe.rotation.y = 0.45;
    scene.add(shoe);

    wrap.classList.add("shoe-3d-live");
    host.classList.remove("dragging");

    // ---- interaction ----
    var vel = 0;
    var dragging = false;
    var lastX = 0;
    var running = true;

    function clampRot() {
      shoe.rotation.y = Math.max(-2.2, Math.min(2.6, shoe.rotation.y));
    }

    host.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      dragging = true;
      vel = 0;
      lastX = e.clientX;
      host.setPointerCapture(e.pointerId);
      host.classList.add("dragging");
    });
    host.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      lastX = e.clientX;
      shoe.rotation.y += dx * 0.008;
      vel = dx * 0.008;
      clampRot();
    });
    function endDrag() {
      dragging = false;
      host.classList.remove("dragging");
      if (reduce) vel = 0;
    }
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointercancel", endDrag);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        running = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(wrap);
    }

    // ---- resize ----
    function resize() {
      var w = host.clientWidth || 1;
      var h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var need = 1.55 / (0.268 * Math.max(camera.aspect, 0.01));
      camera.position.z = Math.max(need, 4.6);
      camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(host);
    } else {
      window.addEventListener("resize", resize);
    }

    // ---- loop ----
    function tick() {
      requestAnimationFrame(tick);
      if (!running) return;
      if (!dragging && !reduce) {
        if (Math.abs(vel) > 0.0004) {
          shoe.rotation.y += vel;
          vel *= 0.955;
        } else {
          shoe.rotation.y += 0.0035;
        }
      }
      clampRot();
      renderer.render(scene, camera);
    }
    tick();
  }
})();

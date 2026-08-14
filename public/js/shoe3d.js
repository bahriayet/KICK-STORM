(function () {
  "use strict";

  if (typeof THREE === "undefined") return;

  var VARIANT_COLORS = {
    volt:  { upper: 0xFFFFFF, sole: 0x111113, accent: 0x111113, laces: 0x111113, heel: 0x111113, liner: 0x1A1A1E }, // Black & White Panda Dunk
    panda: { upper: 0xFFFFFF, sole: 0x111113, accent: 0x111113, laces: 0x111113, heel: 0x111113, liner: 0x18181C },
    mono:  { upper: 0xF5F5F2, sole: 0x222225, accent: 0xCCCCCC, laces: 0xE0E0DA, heel: 0xCFCFC8, liner: 0x333338 },
    void:  { upper: 0x111113, sole: 0x08080A, accent: 0xD6FF3F, laces: 0x232327, heel: 0x1E1E22, liner: 0x050507 },
    ghost: { upper: 0xF3EFE6, sole: 0x2A2723, accent: 0xD6FF3F, laces: 0xE5DFD0, heel: 0xD8D1BE, liner: 0x201E1A },
    dark:  { upper: 0x232326, sole: 0x121214, accent: 0xD6FF3F, laces: 0x29292C, heel: 0x333338, liner: 0x18181B },
    cream: { upper: 0xEFE7D8, sole: 0x2C2822, accent: 0xD6FF3F, laces: 0xE2D7C2, heel: 0xD6C9B0, liner: 0x24201B }
  };

  function createSneakerMesh(variantName) {
    var palette = VARIANT_COLORS[variantName || "volt"] || VARIANT_COLORS.volt;
    var group = new THREE.Group();

    // Materials
    var soleMat = new THREE.MeshStandardMaterial({
      color: palette.sole,
      roughness: 0.6,
      metalness: 0.05
    });

    var upperMat = new THREE.MeshStandardMaterial({
      color: palette.upper,
      roughness: 0.35,
      metalness: 0.08
    });

    var accentMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      roughness: 0.15,
      metalness: 0.3,
      emissive: palette.accent,
      emissiveIntensity: 0.3
    });

    var heelMat = new THREE.MeshStandardMaterial({
      color: palette.heel,
      roughness: 0.3,
      metalness: 0.15
    });

    var laceMat = new THREE.MeshStandardMaterial({
      color: palette.laces,
      roughness: 0.75
    });

    var linerMat = new THREE.MeshStandardMaterial({
      color: palette.liner,
      roughness: 0.85
    });

    // --- 1. Outsole (Sol Bawah Karet) ---
    var solePath = new THREE.Path();
    solePath.moveTo(-1.65, 0.45);
    solePath.bezierCurveTo(-1.85, 0.45, -1.85, -0.45, -1.65, -0.45);
    solePath.lineTo(0.2, -0.48);
    solePath.bezierCurveTo(0.9, -0.52, 1.45, -0.45, 1.65, -0.15);
    solePath.bezierCurveTo(1.8, 0.1, 1.7, 0.35, 1.45, 0.48);
    solePath.bezierCurveTo(0.9, 0.52, 0.2, 0.48, -1.65, 0.45);

    var soleShape = new THREE.Shape(solePath.getPoints());
    var soleExtrude = { depth: 0.25, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.06, bevelThickness: 0.06 };
    var soleGeo = new THREE.ExtrudeGeometry(soleShape, soleExtrude);
    soleGeo.rotateX(Math.PI / 2);
    soleGeo.center();

    var soleMesh = new THREE.Mesh(soleGeo, soleMat);
    soleMesh.position.set(0, -0.42, 0);
    group.add(soleMesh);

    // Tread Grooves (Tekstur Sol Bawah)
    for (var g = -1.3; g <= 1.2; g += 0.28) {
      var grooveGeo = new THREE.BoxGeometry(0.08, 0.06, 1.05);
      var grooveMesh = new THREE.Mesh(grooveGeo, soleMat);
      grooveMesh.position.set(g, -0.58, 0);
      group.add(grooveMesh);
    }

    // --- 2. Midsole Cushion (Bantalan Sol Tengah / BounceFoam™) ---
    var midShape = new THREE.Shape(solePath.getPoints());
    var midExtrude = { depth: 0.22, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 };
    var midGeo = new THREE.ExtrudeGeometry(midShape, midExtrude);
    midGeo.rotateX(Math.PI / 2);
    midGeo.center();

    var midMesh = new THREE.Mesh(midGeo, upperMat);
    midMesh.position.set(0, -0.22, 0);
    group.add(midMesh);

    // Volt Accent Stripe on Midsole
    var midStripeGeo = new THREE.BoxGeometry(3.2, 0.05, 1.08);
    var midStripeMesh = new THREE.Mesh(midStripeGeo, accentMat);
    midStripeMesh.position.set(0, -0.16, 0);
    group.add(midStripeMesh);

    // --- 3. Upper Body (Bodi Utama Sepatu) ---
    var upperPoints = [];
    upperPoints.push(new THREE.Vector2(-1.55, -0.05));
    upperPoints.push(new THREE.Vector2(-1.6, 0.45));
    upperPoints.push(new THREE.Vector2(-1.3, 0.85));
    upperPoints.push(new THREE.Vector2(-0.7, 0.95));
    upperPoints.push(new THREE.Vector2(-0.2, 0.75));
    upperPoints.push(new THREE.Vector2(0.3, 0.65));
    upperPoints.push(new THREE.Vector2(1.1, 0.38));
    upperPoints.push(new THREE.Vector2(1.55, 0.15));
    upperPoints.push(new THREE.Vector2(1.4, -0.05));

    var upperShapeCurve = new THREE.Shape();
    upperShapeCurve.moveTo(upperPoints[0].x, upperPoints[0].y);
    for (var k = 1; k < upperPoints.length; k++) {
      upperShapeCurve.lineTo(upperPoints[k].x, upperPoints[k].y);
    }
    upperShapeCurve.closePath();

    var upperExtrudeSettings = { depth: 0.95, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 };
    var upperGeo = new THREE.ExtrudeGeometry(upperShapeCurve, upperExtrudeSettings);
    upperGeo.rotateX(Math.PI / 2);
    upperGeo.center();

    var upperMesh = new THREE.Mesh(upperGeo, upperMat);
    upperMesh.position.set(-0.02, 0.22, 0);
    group.add(upperMesh);

    // --- 4. Toe Cap Overlay (Ujung Depan Sepatu) ---
    var toeCapGeo = new THREE.SphereGeometry(0.58, 24, 16, 0, Math.PI, 0, Math.PI * 0.55);
    toeCapGeo.rotateY(-Math.PI / 2);
    toeCapGeo.scale(1.2, 0.52, 0.88);
    var toeCapMesh = new THREE.Mesh(toeCapGeo, heelMat);
    toeCapMesh.position.set(1.05, 0.08, 0);
    group.add(toeCapMesh);

    // --- 5. Heel Counter (Tumit Belakang) ---
    var heelCapGeo = new THREE.CylinderGeometry(0.52, 0.58, 0.75, 24, 1, false, 0, Math.PI);
    heelCapGeo.rotateY(-Math.PI / 2);
    var heelCapMesh = new THREE.Mesh(heelCapGeo, heelMat);
    heelCapMesh.position.set(-1.12, 0.38, 0);
    group.add(heelCapMesh);

    // Heel Pull Tab (Tali Gantungan Tumit)
    var pullTabGeo = new THREE.BoxGeometry(0.12, 0.35, 0.18);
    pullTabGeo.rotateZ(-Math.PI / 6);
    var pullTabMesh = new THREE.Mesh(pullTabGeo, accentMat);
    pullTabMesh.position.set(-1.58, 0.75, 0);
    group.add(pullTabMesh);

    // --- 6. Collar & Interior (Lubang Masuk Kaki) ---
    var collarGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.45, 24, 1, true);
    var collarMesh = new THREE.Mesh(collarGeo, linerMat);
    collarMesh.position.set(-0.55, 0.65, 0);
    collarMesh.rotation.z = -Math.PI / 12;
    group.add(collarMesh);

    // Collar Rim Padding
    var collarRimGeo = new THREE.TorusGeometry(0.38, 0.06, 12, 24);
    collarRimGeo.rotateX(Math.PI / 2);
    var collarRimMesh = new THREE.Mesh(collarRimGeo, linerMat);
    collarRimMesh.position.set(-0.55, 0.85, 0);
    group.add(collarRimMesh);

    // --- 7. Tongue (Lidah Sepatu) ---
    var tongueGeo = new THREE.BoxGeometry(0.85, 0.8, 0.42);
    tongueGeo.rotateZ(-Math.PI / 6);
    var tongueMesh = new THREE.Mesh(tongueGeo, upperMat);
    tongueMesh.position.set(-0.05, 0.68, 0);
    group.add(tongueMesh);

    // Volt Badge on Tongue Tag
    var tongueTagGeo = new THREE.BoxGeometry(0.22, 0.22, 0.44);
    var tongueTagMesh = new THREE.Mesh(tongueTagGeo, accentMat);
    tongueTagMesh.position.set(0.12, 0.96, 0);
    group.add(tongueTagMesh);

    // --- 8. Eyestays & Criss-Cross Laces (Tali Sepatu Realistic) ---
    for (var l = 0; l < 5; l++) {
      var lProgress = l / 4;
      var lx = 0.5 - lProgress * 0.7;
      var ly = 0.42 + lProgress * 0.22;

      // Cross Lace 1
      var laceCross1 = new THREE.CylinderGeometry(0.035, 0.035, 0.58, 12);
      laceCross1.rotateX(Math.PI / 2);
      laceCross1.rotateZ(0.15);
      var laceMesh1 = new THREE.Mesh(laceCross1, laceMat);
      laceMesh1.position.set(lx, ly, 0);
      group.add(laceMesh1);

      // Eyelet Stud (Lubang Tali Metalik)
      var eyeletGeo = new THREE.TorusGeometry(0.045, 0.02, 8, 12);
      eyeletGeo.rotateY(Math.PI / 2);
      var eyeletLeft = new THREE.Mesh(eyeletGeo, accentMat);
      eyeletLeft.position.set(lx, ly, 0.28);
      group.add(eyeletLeft);

      var eyeletRight = new THREE.Mesh(eyeletGeo, accentMat);
      eyeletRight.position.set(lx, ly, -0.28);
      group.add(eyeletRight);
    }

    // --- 9. Storm Lightning Emblem (Logo Badai 3D Samping - Kiri & Kanan) ---
    var emblemShape = new THREE.Shape();
    emblemShape.moveTo(-0.65, 0.15);
    emblemShape.lineTo(0.25, 0.38);
    emblemShape.lineTo(0.02, 0.18);
    emblemShape.lineTo(0.75, -0.05);
    emblemShape.lineTo(-0.08, -0.02);
    emblemShape.lineTo(-0.65, 0.15);

    var emblemExtrude = { depth: 0.05, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.01, bevelThickness: 0.01 };
    var emblemGeo = new THREE.ExtrudeGeometry(emblemShape, emblemExtrude);

    var emblemLeft = new THREE.Mesh(emblemGeo, accentMat);
    emblemLeft.position.set(0.02, 0.22, 0.48);
    emblemLeft.rotation.y = 0.06;
    group.add(emblemLeft);

    var emblemRight = new THREE.Mesh(emblemGeo, accentMat);
    emblemRight.position.set(0.02, 0.22, -0.53);
    emblemRight.rotation.y = -0.06;
    group.add(emblemRight);

    // --- 10. Contact Shadow Disc (Bayangan Bawah Realistic) ---
    var shadowGeo = new THREE.PlaneGeometry(3.6, 1.4);
    var shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    var ctx = shadowCanvas.getContext("2d");
    var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.65)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    var shadowTex = new THREE.CanvasTexture(shadowCanvas);
    var shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false
    });

    var shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, -0.61, 0);
    group.add(shadowMesh);

    group.scale.set(1.15, 1.15, 1.15);
    return group;
  }

  // Init 3D Scene in container
  function init3DShoeScene(containerId, options) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    var opts = options || {};
    var width = container.clientWidth || 400;
    var height = container.clientHeight || 400;

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.7, 5.0);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Lighting Studio Rig
    var ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    var mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(4, 7, 5);
    scene.add(mainLight);

    var voltGlow = new THREE.PointLight(0xD6FF3F, 2.2, 14);
    voltGlow.position.set(-3, 0.5, 2.5);
    scene.add(voltGlow);

    var fillLight = new THREE.DirectionalLight(0x8090FF, 0.7);
    fillLight.position.set(-5, 3, -4);
    scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0xD6FF3F, 0.8);
    rimLight.position.set(0, -4, -3);
    scene.add(rimLight);

    // Current Shoe Mesh
    var currentVariant = opts.variant || "volt";
    var shoeMesh = createSneakerMesh(currentVariant);
    scene.add(shoeMesh);

    // Target rotations for lerping
    var targetRotX = opts.initialRotX || 0.2;
    var targetRotY = opts.initialRotY || -0.6;
    var targetRotZ = opts.initialRotZ || 0;

    var isHero = opts.isHero || false;
    var mouseX = 0, mouseY = 0;

    if (isHero) {
      window.addEventListener("pointermove", function (e) {
        var rect = container.getBoundingClientRect();
        if (rect.top <= window.innerHeight && rect.bottom >= 0) {
          mouseX = (e.clientX - rect.left - rect.width / 2) / rect.width;
          mouseY = (e.clientY - rect.top - rect.height / 2) / rect.height;
        }
      });
    }

    var clock = new THREE.Clock();
    var animFrameId;

    function animate() {
      animFrameId = requestAnimationFrame(animate);
      var elapsedTime = clock.getElapsedTime();

      if (isHero) {
        // Idle floating + mouse tilt lerping
        shoeMesh.position.y = Math.sin(elapsedTime * 1.8) * 0.10;
        var goalY = targetRotY + mouseX * 0.8 + elapsedTime * 0.25;
        var goalX = targetRotX + mouseY * 0.35;
        shoeMesh.rotation.y += (goalY - shoeMesh.rotation.y) * 0.08;
        shoeMesh.rotation.x += (goalX - shoeMesh.rotation.x) * 0.08;
      } else {
        // Lerp to targetRot set by scroll
        shoeMesh.rotation.y += (targetRotY - shoeMesh.rotation.y) * 0.1;
        shoeMesh.rotation.x += (targetRotX - shoeMesh.rotation.x) * 0.1;
        shoeMesh.rotation.z += (targetRotZ - shoeMesh.rotation.z) * 0.1;
        shoeMesh.position.y = Math.sin(elapsedTime * 1.4) * 0.05;
      }

      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      if (!container) return;
      var w = container.clientWidth || 400;
      var h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return {
      setVariant: function (v) {
        if (v === currentVariant) return;
        currentVariant = v;
        scene.remove(shoeMesh);
        shoeMesh = createSneakerMesh(currentVariant);
        scene.add(shoeMesh);
      },
      setTargetRotation: function (rx, ry, rz) {
        targetRotX = rx;
        targetRotY = ry;
        targetRotZ = rz;
      },
      destroy: function () {
        cancelAnimationFrame(animFrameId);
        window.removeEventListener("resize", onResize);
        if (renderer && renderer.domElement) renderer.domElement.remove();
      }
    };
  }

  window.Kickstorm3D = {
    createSneakerMesh: createSneakerMesh,
    init3DShoeScene: init3DShoeScene
  };
})();

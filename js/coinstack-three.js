// ===== COIN STACK THREE.JS - 3D Rendering & Visual Physics =====

(function() {
  'use strict';

  // ===== CONSTANTS =====
  const COIN_R = 0.44;
  const COIN_H = 0.07;
  const TABLE_R = 2.5;
  const TABLE_H = 0.25;
  const GRAVITY = 18;
  const BOUNCE = 0.25;
  const FRICTION = 0.92;
  const DROP_HEIGHT = 6;
  const GHOST_Y_OFFSET = 1.8;
  const SETTLE_THRESHOLD = 0.005;
  const PARTICLE_COUNT = 20;
  const MAX_PARTICLES = 60;

  // ===== STATE =====
  let scene, camera, renderer, rafId, clock;
  let isInitialized = false;
  let containerEl = null;
  let coinMeshes = [];        // Array of THREE.Mesh
  let coinBodies = [];         // Physics bodies for visual animation
  let ghostMesh = null;
  let tableMesh = null;
  let particles = [];
  let floatingEmojis = [];
  let shakeIntensity = 0;
  let shakeDecay = 0.9;
  let cameraBaseY = 1.8;
  let cameraTargetY = 1.8;
  let introPlaying = false;
  let introCallback = null;
  let collapseCallback = null;
  let dropCallback = null;
  let dropAnimating = false;
  let dropBody = null;
  let collapseAnimating = false;
  let touchCallback = null;
  let ghostX = 0;
  let ghostVisible = false;
  let coinTexture = null;
  let coinMaterial = null;
  let ghostMaterial = null;
  let envMap = null;
  let spotLight = null;
  let ambientLight = null;
  let dirLight = null;
  let lastWidth = 0;
  let lastHeight = 0;
  let wobbleIntensity = 0;
  let wobbleTarget = 0;
  let wobbleTime = 0;
  let dropGuideLine = null;

  // ===== COIN FACE TEXTURE =====
  function createCoinTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    // Gold gradient background
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.5);
    grad.addColorStop(0, '#ffe680');
    grad.addColorStop(0.6, '#ffd700');
    grad.addColorStop(1, '#b8960c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
    ctx.fill();

    // Inner circle
    ctx.strokeStyle = 'rgba(180, 140, 20, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.35, 0, Math.PI*2);
    ctx.stroke();

    // Star symbol
    ctx.fillStyle = 'rgba(160, 120, 0, 0.6)';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', size/2, size/2);

    // Edge dots
    ctx.fillStyle = 'rgba(180, 140, 20, 0.3)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = size * 0.44;
      ctx.beginPath();
      ctx.arc(size/2 + Math.cos(a)*r, size/2 + Math.sin(a)*r, 3, 0, Math.PI*2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(c);
  }

  // ===== COIN EDGE TEXTURE =====
  function createEdgeTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 32;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, '#e6c200');
    grad.addColorStop(0.3, '#ffd700');
    grad.addColorStop(0.5, '#fff3a0');
    grad.addColorStop(0.7, '#ffd700');
    grad.addColorStop(1, '#b8960c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 32);
    // Ridges
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 80; i++) {
      ctx.fillRect(i * 6.4, 0, 1.5, 32);
    }
    return new THREE.CanvasTexture(c);
  }

  // ===== SIMPLE ENV MAP =====
  function createEnvMap() {
    const size = 64;
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      if (i === 2) { // top
        grad.addColorStop(0, '#4a4a6a');
        grad.addColorStop(1, '#2a2a3e');
      } else if (i === 3) { // bottom
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(1, '#0a0a15');
      } else {
        grad.addColorStop(0, '#3a3a5a');
        grad.addColorStop(1, '#1a1a2e');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      faces.push(c);
    }
    const tex = new THREE.CubeTexture(faces);
    tex.needsUpdate = true;
    return tex;
  }

  // ===== CREATE COIN MESH =====
  function createCoinMesh(isGhost) {
    const topTex = coinTexture.clone();
    topTex.needsUpdate = true;
    const edgeTex = createEdgeTexture();
    edgeTex.wrapS = THREE.RepeatWrapping;
    edgeTex.repeat.set(1, 1);

    const materials = [
      new THREE.MeshStandardMaterial({
        map: edgeTex,
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.25,
        envMap: envMap,
        transparent: isGhost,
        opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex,
        color: 0xffd700,
        metalness: 0.8,
        roughness: 0.3,
        envMap: envMap,
        transparent: isGhost,
        opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex,
        color: 0xffd700,
        metalness: 0.8,
        roughness: 0.3,
        envMap: envMap,
        transparent: isGhost,
        opacity: isGhost ? 0.45 : 1,
      }),
    ];

    const geo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 32, 1, false);
    // Assign material groups: side=0, top=1, bottom=2
    geo.clearGroups();
    // CylinderGeometry groups: 0=side, 1=top cap, 2=bottom cap
    const posAttr = geo.getAttribute('position');
    const indexAttr = geo.getIndex();
    const sideCount = 32 * 2; // 32 segments * 2 triangles
    const capCount = 32; // each cap has 32 triangles
    geo.addGroup(0, sideCount * 3, 0);
    geo.addGroup(sideCount * 3, capCount * 3, 1);
    geo.addGroup((sideCount + capCount) * 3, capCount * 3, 2);

    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = !isGhost;
    mesh.receiveShadow = !isGhost;
    return mesh;
  }

  // ===== INIT =====
  window.initCoinStackThree = function(containerId) {
    if (isInitialized) return;
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    const w = containerEl.clientWidth || 360;
    const h = containerEl.clientHeight || 640;
    lastWidth = w;
    lastHeight = h;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12121f);
    scene.fog = new THREE.Fog(0x12121f, 12, 25);

    camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    camera.position.set(0, 1.8, 4.5);
    camera.lookAt(0, 0.4, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    containerEl.appendChild(renderer.domElement);

    // Environment
    envMap = createEnvMap();
    scene.environment = envMap;

    // Lights
    ambientLight = new THREE.AmbientLight(0x8888cc, 0.35);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xfff0dd, 0.7);
    dirLight.position.set(3, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 20;
    dirLight.shadow.camera.left = -4;
    dirLight.shadow.camera.right = 4;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -2;
    dirLight.shadow.bias = -0.002;
    scene.add(dirLight);

    spotLight = new THREE.SpotLight(0xffd700, 0.6, 15, Math.PI / 5, 0.5, 1);
    spotLight.position.set(0, 8, 0);
    spotLight.castShadow = false;
    scene.add(spotLight);

    // Back rim light
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    rimLight.position.set(-2, 3, -4);
    scene.add(rimLight);

    // Table
    const tableGeo = new THREE.CylinderGeometry(TABLE_R, TABLE_R + 0.1, TABLE_H, 64);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x1a120a,
      roughness: 0.85,
      metalness: 0.05,
    });
    tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -TABLE_H / 2;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // Table top ring (felt edge)
    const ringGeo = new THREE.TorusGeometry(TABLE_R, 0.06, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9, metalness: 0 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    // Table surface (green felt)
    const feltGeo = new THREE.CircleGeometry(TABLE_R - 0.05, 64);
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x1e4a1e, roughness: 0.95, metalness: 0 });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.005;
    felt.receiveShadow = true;
    scene.add(felt);

    // Ground plane for shadow
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    // Textures & materials
    coinTexture = createCoinTexture();
    coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.85,
      roughness: 0.25,
      envMap: envMap,
    });

    // Drop guide line
    var guideGeo = new THREE.BufferGeometry();
    var guidePositions = new Float32Array([0, 0, 0, 0, 10, 0]);
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
    var guideMat = new THREE.LineDashedMaterial({
      color: 0xffd700,
      dashSize: 0.08,
      gapSize: 0.06,
      transparent: true,
      opacity: 0.35,
    });
    dropGuideLine = new THREE.Line(guideGeo, guideMat);
    dropGuideLine.computeLineDistances();
    dropGuideLine.visible = false;
    scene.add(dropGuideLine);

    clock = new THREE.Clock();
    isInitialized = true;

    // Handle resize
    window.addEventListener('resize', _onResize);

    // Touch/mouse controls
    _setupControls();

    // Start render loop
    _animate();
  };

  function _onResize() {
    if (!containerEl || !renderer || !camera) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ===== CLEANUP =====
  window.destroyCoinStackThree = function() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', _onResize);
    if (renderer && containerEl) {
      renderer.domElement.removeEventListener('pointerdown', _onPointerDown);
      renderer.domElement.removeEventListener('pointermove', _onPointerMove);
      renderer.domElement.removeEventListener('pointerup', _onPointerUp);
      containerEl.removeChild(renderer.domElement);
      renderer.dispose();
    }
    if (scene) {
      scene.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function(m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
    }
    scene = null; camera = null; renderer = null;
    coinMeshes = []; coinBodies = []; particles = []; floatingEmojis = [];
    ghostMesh = null; tableMesh = null; spotLight = null; dropGuideLine = null;
    wobbleIntensity = 0; wobbleTarget = 0; wobbleTime = 0;
    isInitialized = false; introPlaying = false;
    dropAnimating = false; collapseAnimating = false;
    containerEl = null;
  };

  // ===== CONTROLS =====
  let _pointerDown = false;
  let _pointerStartX = 0;

  function _setupControls() {
    if (!renderer) return;
    renderer.domElement.addEventListener('pointerdown', _onPointerDown, { passive: false });
    renderer.domElement.addEventListener('pointermove', _onPointerMove, { passive: false });
    renderer.domElement.addEventListener('pointerup', _onPointerUp, { passive: false });
  }

  function _onPointerDown(e) {
    if (!ghostVisible || dropAnimating || introPlaying || collapseAnimating) return;
    e.preventDefault();
    _pointerDown = true;
    _pointerStartX = e.clientX;
    _updateGhostFromPointer(e);
  }

  function _onPointerMove(e) {
    if (!_pointerDown || !ghostVisible || dropAnimating) return;
    e.preventDefault();
    _updateGhostFromPointer(e);
  }

  function _onPointerUp(e) {
    _pointerDown = false;
  }

  function _updateGhostFromPointer(e) {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width; // 0..1
    // Map to world X: -1.5 to 1.5
    const worldX = (nx - 0.5) * 3.0;
    ghostX = Math.max(-1.3, Math.min(1.3, worldX));
    if (touchCallback) touchCallback(ghostX);
    _updateGhostPosition();
  }

  function _updateGhostPosition() {
    if (!ghostMesh) return;
    const stackH = coinMeshes.length * COIN_H;
    ghostMesh.position.x = ghostX;
    ghostMesh.position.y = stackH + COIN_H / 2 + GHOST_Y_OFFSET;
    ghostMesh.position.z = 0;
  }

  // ===== GHOST COIN =====
  window.csThreeShowGhost = function(show) {
    ghostVisible = show;
    if (show && !ghostMesh && isInitialized) {
      ghostMesh = createCoinMesh(true);
      scene.add(ghostMesh);
    }
    if (ghostMesh) {
      ghostMesh.visible = show;
      if (show) _updateGhostPosition();
    }
  };

  window.csThreeSetGhostX = function(x) {
    ghostX = x;
    _updateGhostPosition();
  };

  window.csThreeSetTouchCallback = function(fn) {
    touchCallback = fn;
  };

  // ===== ADD COIN (with drop animation) =====
  window.csThreeDropCoin = function(x, targetY, callback) {
    if (!isInitialized || dropAnimating) return;
    dropAnimating = true;
    dropCallback = callback;

    const mesh = createCoinMesh(false);
    const startY = targetY + DROP_HEIGHT;
    mesh.position.set(x, startY, 0);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);

    dropBody = {
      mesh: mesh,
      x: x,
      y: startY,
      vy: 0,
      targetY: targetY,
      settled: false,
      bounceCount: 0,
    };
  };

  // ===== SETTLE COIN (after drop anim) =====
  function _settleDroppedCoin() {
    if (!dropBody) return;
    const mesh = dropBody.mesh;
    mesh.position.y = dropBody.targetY;
    coinMeshes.push(mesh);
    dropBody = null;
    dropAnimating = false;

    // Impact effects
    _spawnImpactParticles(mesh.position.x, mesh.position.y, mesh.position.z);
    shakeIntensity = 0.04;

    // Update camera target
    cameraTargetY = Math.max(1.8, coinMeshes.length * COIN_H * 0.7 + 1.5);

    if (dropCallback) {
      var cb = dropCallback;
      dropCallback = null;
      setTimeout(function() { cb(); }, 100);
    }
  }

  // ===== PHYSICS STEP (for drop animation) =====
  function _physicsStep(dt) {
    if (!dropBody || dropBody.settled) return;

    dropBody.vy += GRAVITY * dt;
    dropBody.y -= dropBody.vy * dt;

    if (dropBody.y <= dropBody.targetY) {
      dropBody.y = dropBody.targetY;
      if (dropBody.vy > 0.5 && dropBody.bounceCount < 3) {
        dropBody.vy = -dropBody.vy * BOUNCE;
        dropBody.bounceCount++;
        // Small shake per bounce
        shakeIntensity = Math.max(shakeIntensity, 0.02);
        _spawnImpactParticles(dropBody.x, dropBody.y, 0);
      } else {
        dropBody.settled = true;
        _settleDroppedCoin();
      }
    }

    if (dropBody && dropBody.mesh) {
      dropBody.mesh.position.y = dropBody.y;
    }
  }

  // ===== COLLAPSE ANIMATION =====
  window.csThreeCollapse = function(collapseLevel, dirX, callback) {
    if (collapseAnimating) return;
    collapseAnimating = true;
    collapseCallback = callback;

    // Convert coins above collapseLevel to physics bodies
    coinBodies = [];
    const level = Math.max(0, collapseLevel);

    for (var i = level; i < coinMeshes.length; i++) {
      var mesh = coinMeshes[i];
      var pushX = (dirX || 0) * (2 + Math.random() * 3);
      var pushZ = (Math.random() - 0.5) * 4;
      coinBodies.push({
        mesh: mesh,
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
        vx: pushX + (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 4,
        vz: pushZ,
        rvx: (Math.random() - 0.5) * 10,
        rvy: (Math.random() - 0.5) * 10,
        rvz: (Math.random() - 0.5) * 10,
        settled: false,
      });
    }

    // Keep coins below collapse level
    coinMeshes = coinMeshes.slice(0, level);

    // Big shake
    shakeIntensity = 0.15;

    // Spawn lots of particles
    for (var j = 0; j < 30; j++) {
      _spawnImpactParticles(
        (Math.random() - 0.5) * 2,
        level * COIN_H,
        (Math.random() - 0.5) * 1
      );
    }
  };

  function _collapsePhysicsStep(dt) {
    if (!collapseAnimating || coinBodies.length === 0) return;

    var allSettled = true;
    for (var i = 0; i < coinBodies.length; i++) {
      var b = coinBodies[i];
      if (b.settled) continue;

      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.mesh.rotation.x += b.rvx * dt;
      b.mesh.rotation.y += b.rvy * dt;
      b.mesh.rotation.z += b.rvz * dt;

      // Ground collision
      if (b.y < COIN_H / 2) {
        b.y = COIN_H / 2;
        b.vy = Math.abs(b.vy) * BOUNCE;
        b.vx *= FRICTION;
        b.vz *= FRICTION;
        b.rvx *= 0.8;
        b.rvy *= 0.8;
        b.rvz *= 0.8;
        if (Math.abs(b.vy) < 0.1 && Math.abs(b.vx) < 0.05 && Math.abs(b.vz) < 0.05) {
          b.settled = true;
        }
      }

      // Table edge
      var dist = Math.sqrt(b.x * b.x + b.z * b.z);
      if (dist > TABLE_R + 1) {
        b.settled = true; // off table
      }

      b.mesh.position.set(b.x, b.y, b.z);
      if (!b.settled) allSettled = false;
    }

    if (allSettled) {
      collapseAnimating = false;
      // Fade out collapsed coins
      _fadeOutCollapsedCoins(function() {
        if (collapseCallback) {
          var cb = collapseCallback;
          collapseCallback = null;
          cb();
        }
      });
    }
  }

  function _fadeOutCollapsedCoins(callback) {
    var fadeStart = performance.now();
    var fadeDuration = 800;
    var bodies = coinBodies.slice();

    function fadeStep() {
      var t = Math.min(1, (performance.now() - fadeStart) / fadeDuration);
      for (var i = 0; i < bodies.length; i++) {
        var mats = bodies[i].mesh.material;
        if (Array.isArray(mats)) {
          mats.forEach(function(m) { m.transparent = true; m.opacity = 1 - t; });
        }
      }
      if (t < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        // Remove from scene
        for (var j = 0; j < bodies.length; j++) {
          scene.remove(bodies[j].mesh);
          var geo = bodies[j].mesh.geometry;
          if (geo) geo.dispose();
        }
        coinBodies = [];
        if (callback) callback();
      }
    }
    fadeStep();
  }

  // ===== INTRO ANIMATION =====
  window.csThreePlayIntro = function(seed, callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    introPlaying = true;
    introCallback = callback;

    // Seeded random
    var s = seed || 12345;
    function srand() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    }

    // Build intro tower (18 coins with slight random offsets)
    var introCoinCount = 18;
    var introCoins = [];
    for (var i = 0; i < introCoinCount; i++) {
      var mesh = createCoinMesh(false);
      var ox = (srand() - 0.5) * 0.15;
      var oz = (srand() - 0.5) * 0.15;
      mesh.position.set(ox, COIN_H / 2 + i * COIN_H, oz);
      mesh.rotation.y = srand() * Math.PI * 2;
      scene.add(mesh);
      introCoins.push({
        mesh: mesh,
        x: ox, y: COIN_H / 2 + i * COIN_H, z: oz,
        vx: 0, vy: 0, vz: 0,
        rvx: 0, rvy: 0, rvz: 0,
        settled: false,
        onTable: true,
      });
    }

    // Camera animation phases
    var phase = 0;
    var phaseTime = 0;
    var totalTime = 0;
    var camAngle = 0;
    var camRadius = 5;
    var introDone = false;

    function introStep() {
      if (introDone || !isInitialized) return;
      var dt = 1 / 60;
      totalTime += dt;
      phaseTime += dt;

      if (phase === 0) {
        // Phase 0: Camera orbits around tower (0-2s)
        camAngle += dt * 1.2;
        camRadius = 5 - totalTime * 0.3;
        var camH = 1.0 + totalTime * 0.4;
        camera.position.set(
          Math.sin(camAngle) * camRadius,
          camH,
          Math.cos(camAngle) * camRadius
        );
        camera.lookAt(0, intraCoinCount * COIN_H * 0.4, 0);

        if (phaseTime > 2.0) {
          phase = 1;
          phaseTime = 0;
          // Start the collapse by pushing top coins
          for (var i = introCoinCount - 1; i >= introCoinCount - 5; i--) {
            var c = introCoins[i];
            c.vx = (srand() - 0.5) * 3;
            c.vz = (srand() - 0.5) * 3;
            c.vy = srand() * 2;
          }
          shakeIntensity = 0.1;
        }
      } else if (phase === 1) {
        // Phase 1: Tower collapses (2-4.5s)
        // Push cascading coins
        if (phaseTime < 0.5) {
          for (var j = 0; j < introCoins.length; j++) {
            var c = introCoins[j];
            if (c.settled || Math.abs(c.vx) > 0.1 || Math.abs(c.vz) > 0.1) continue;
            // Check if any coin above is moving
            for (var k = j + 1; k < introCoins.length; k++) {
              var above = introCoins[k];
              if (!above.settled && (Math.abs(above.vx) > 0.5 || Math.abs(above.vz) > 0.5)) {
                c.vx += (srand() - 0.5) * 2;
                c.vz += (srand() - 0.5) * 2;
                c.vy += srand() * 1.5;
                break;
              }
            }
          }
        }

        // Physics for all intro coins
        var allSettled = true;
        for (var i = 0; i < introCoins.length; i++) {
          var c = introCoins[i];
          if (c.settled) continue;

          c.vy -= GRAVITY * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.mesh.rotation.x += c.rvx * dt;
          c.mesh.rotation.z += c.rvz * dt;

          c.rvx += (c.vx) * dt * 3;
          c.rvz += (-c.vz) * dt * 3;

          // Ground
          if (c.y < COIN_H / 2) {
            c.y = COIN_H / 2;
            c.vy = Math.abs(c.vy) * BOUNCE * 0.6;
            c.vx *= FRICTION;
            c.vz *= FRICTION;
            c.rvx *= 0.7;
            c.rvz *= 0.7;
            if (Math.abs(c.vy) < 0.08 && Math.abs(c.vx) < 0.03 && Math.abs(c.vz) < 0.03) {
              c.settled = true;
            }
          }

          c.mesh.position.set(c.x, c.y, c.z);
          if (!c.settled) allSettled = false;
        }

        // Camera pulls back
        camAngle += dt * 0.5;
        camera.position.set(
          Math.sin(camAngle) * 5.5,
          2.5,
          Math.cos(camAngle) * 5.5
        );
        camera.lookAt(0, 0.3, 0);

        // Spawn particles during collapse
        if (phaseTime < 1.5 && Math.random() < 0.3) {
          _spawnImpactParticles(
            (srand() - 0.5) * 2,
            srand() * 0.5,
            (srand() - 0.5) * 2
          );
        }

        if (allSettled || phaseTime > 3.0) {
          phase = 2;
          phaseTime = 0;
        }
      } else if (phase === 2) {
        // Phase 2: Fade out coins, move camera to game position (4.5-6s)
        var fadeT = Math.min(1, phaseTime / 1.2);
        for (var i = 0; i < introCoins.length; i++) {
          var mats = introCoins[i].mesh.material;
          if (Array.isArray(mats)) {
            mats.forEach(function(m) { m.transparent = true; m.opacity = 1 - fadeT; });
          }
        }

        // Smooth camera to game position
        camera.position.x += (0 - camera.position.x) * dt * 3;
        camera.position.y += (1.8 - camera.position.y) * dt * 3;
        camera.position.z += (4.5 - camera.position.z) * dt * 3;
        camera.lookAt(0, 0.4, 0);

        if (phaseTime > 1.5) {
          // Remove intro coins
          for (var j = 0; j < introCoins.length; j++) {
            scene.remove(introCoins[j].mesh);
            introCoins[j].mesh.geometry.dispose();
          }
          introCoins = [];

          // Reset camera
          camera.position.set(0, 1.8, 4.5);
          camera.lookAt(0, 0.4, 0);

          introDone = true;
          introPlaying = false;
          if (introCallback) {
            var cb = introCallback;
            introCallback = null;
            cb();
          }
        }
      }

      if (!introDone) {
        requestAnimationFrame(introStep);
      }
    }

    // Fix reference
    var intraCoinCount = introCoinCount;
    introStep();
  };

  // ===== CLEAR ALL COINS =====
  window.csThreeClear = function() {
    for (var i = 0; i < coinMeshes.length; i++) {
      scene.remove(coinMeshes[i]);
      coinMeshes[i].geometry.dispose();
    }
    coinMeshes = [];
    for (var j = 0; j < coinBodies.length; j++) {
      scene.remove(coinBodies[j].mesh);
    }
    coinBodies = [];
    cameraTargetY = 1.8;
  };

  // ===== SET COINS (for client sync) =====
  window.csThreeSetCoins = function(positions) {
    // Remove existing
    for (var i = 0; i < coinMeshes.length; i++) {
      scene.remove(coinMeshes[i]);
      coinMeshes[i].geometry.dispose();
    }
    coinMeshes = [];

    // Add new
    for (var j = 0; j < positions.length; j++) {
      var p = positions[j];
      var mesh = createCoinMesh(false);
      mesh.position.set(p.x, p.y, p.z || 0);
      mesh.rotation.y = p.ry || 0;
      scene.add(mesh);
      coinMeshes.push(mesh);
    }

    cameraTargetY = Math.max(1.8, positions.length * COIN_H * 0.7 + 1.5);
  };

  // ===== GET COIN POSITIONS =====
  window.csThreeGetCoins = function() {
    return coinMeshes.map(function(m) {
      return { x: m.position.x, y: m.position.y, z: m.position.z, ry: m.rotation.y };
    });
  };

  window.csThreeGetCoinCount = function() {
    return coinMeshes.length;
  };

  // ===== PARTICLES =====
  function _spawnImpactParticles(x, y, z) {
    if (particles.length > MAX_PARTICLES) return;
    var count = Math.min(PARTICLE_COUNT, MAX_PARTICLES - particles.length);
    for (var i = 0; i < count; i++) {
      var geo = new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 4);
      var mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.12 + Math.random() * 0.05, 0.9, 0.5 + Math.random() * 0.3),
        transparent: true,
        opacity: 1,
      });
      var p = new THREE.Mesh(geo, mat);
      p.position.set(x, y, z);
      scene.add(p);
      particles.push({
        mesh: p,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 4 + 1,
        vz: (Math.random() - 0.5) * 3,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
  }

  function _updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy -= GRAVITY * dt * 0.5;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.life -= p.decay;
      p.mesh.material.opacity = Math.max(0, p.life);
      p.mesh.scale.setScalar(Math.max(0.1, p.life));

      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  // ===== FLOATING EMOJI =====
  window.csThreeShowEmoji = function(emoji, screenX, screenY) {
    // Create DOM element for emoji
    if (!containerEl) return;
    var el = document.createElement('div');
    el.className = 'cs-floating-emoji';
    el.textContent = emoji;
    el.style.left = (screenX || 50) + '%';
    el.style.bottom = (screenY || 30) + '%';
    containerEl.appendChild(el);

    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1500);
  };

  // ===== WOBBLE =====
  window.csThreeSetWobble = function(intensity) {
    wobbleTarget = Math.max(0, Math.min(1, intensity || 0));
  };

  function _updateWobble(dt) {
    wobbleIntensity += (wobbleTarget - wobbleIntensity) * dt * 3;
    if (wobbleIntensity < 0.01) return;
    wobbleTime += dt;

    // Apply wobble to coin stack
    for (var i = 0; i < coinMeshes.length; i++) {
      var heightFactor = (i + 1) / Math.max(1, coinMeshes.length);
      var wobAmp = wobbleIntensity * heightFactor * 0.015;
      var wobFreq = 4 + wobbleIntensity * 3;
      coinMeshes[i].rotation.z = Math.sin(wobbleTime * wobFreq + i * 0.3) * wobAmp;
      coinMeshes[i].rotation.x = Math.cos(wobbleTime * wobFreq * 0.7 + i * 0.5) * wobAmp * 0.5;
    }
  }

  // ===== SCREEN SHAKE =====
  window.csThreeShake = function(intensity) {
    shakeIntensity = intensity || 0.08;
  };

  // ===== CAMERA =====
  function _updateCamera(dt) {
    // Smooth follow stack height
    cameraBaseY += (cameraTargetY - cameraBaseY) * dt * 2;
    camera.position.y = cameraBaseY;

    // Screen shake
    if (shakeIntensity > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.5;
      shakeIntensity *= shakeDecay;
    }

    // Look at stack center
    var lookY = Math.max(0.4, (cameraBaseY - 1.8) * 0.5 + 0.4);
    camera.lookAt(0, lookY, 0);

    // Spotlight follows stack
    if (spotLight) {
      spotLight.position.y = cameraBaseY + 6;
      spotLight.target.position.set(0, lookY, 0);
    }
  }

  window.csThreeSetCameraHeight = function(h) {
    cameraTargetY = Math.max(1.8, h);
  };

  // ===== GHOST COIN ANIMATION =====
  let _ghostTime = 0;
  function _animateGhost(dt) {
    if (!ghostMesh || !ghostVisible) {
      if (dropGuideLine) dropGuideLine.visible = false;
      return;
    }
    _ghostTime += dt;
    // Gentle bob
    var stackH = coinMeshes.length * COIN_H;
    var ghostY = stackH + COIN_H / 2 + GHOST_Y_OFFSET + Math.sin(_ghostTime * 3) * 0.05;
    ghostMesh.position.y = ghostY;
    ghostMesh.rotation.y += dt * 0.5;

    // Pulsing opacity
    var mats = ghostMesh.material;
    if (Array.isArray(mats)) {
      var opacity = 0.35 + Math.sin(_ghostTime * 4) * 0.1;
      mats.forEach(function(m) { m.opacity = opacity; });
    }

    // Drop guide line
    if (dropGuideLine) {
      dropGuideLine.visible = true;
      var positions = dropGuideLine.geometry.attributes.position.array;
      positions[0] = ghostMesh.position.x;
      positions[1] = stackH + COIN_H / 2;
      positions[2] = 0;
      positions[3] = ghostMesh.position.x;
      positions[4] = ghostY - COIN_H;
      positions[5] = 0;
      dropGuideLine.geometry.attributes.position.needsUpdate = true;
      dropGuideLine.computeLineDistances();
      dropGuideLine.material.opacity = 0.2 + Math.sin(_ghostTime * 4) * 0.1;
    }
  }

  // ===== MAIN RENDER LOOP =====
  function _animate() {
    rafId = requestAnimationFrame(_animate);
    if (!isInitialized || !renderer || !scene || !camera) return;

    var dt = Math.min(clock.getDelta(), 0.05);

    // Physics
    if (dropAnimating && dropBody) {
      _physicsStep(dt);
    }

    if (collapseAnimating) {
      _collapsePhysicsStep(dt);
    }

    // Ghost coin
    _animateGhost(dt);

    // Wobble
    _updateWobble(dt);

    // Particles
    _updateParticles(dt);

    // Camera
    if (!introPlaying) {
      _updateCamera(dt);
    }

    renderer.render(scene, camera);
  }

  // ===== RESULT TEXT (3D overlay not needed, use DOM) =====
  window.csThreeShowResult = function(text) {
    // Handled by DOM overlay in coinstack.js
  };

})();

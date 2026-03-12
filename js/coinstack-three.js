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
  const PARTICLE_COUNT = 20;
  const MAX_PARTICLES = 60;
  const INTRO_SCATTER_R = 1.8; // coins scatter OUTSIDE this radius from center

  // ===== STATE =====
  let scene, camera, renderer, rafId, clock;
  let isInitialized = false;
  let containerEl = null;
  let coinMeshes = [];
  let coinBodies = [];
  let ghostMesh = null;
  let tableMesh = null;
  let particles = [];
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
  let introScatteredCoins = []; // coins that stay at bottom after intro

  // ===== PROCEDURAL TEXTURES =====

  function createWoodTexture(size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    // Dark wood base
    var grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#3a2210');
    grad.addColorStop(0.3, '#4a3018');
    grad.addColorStop(0.5, '#3d2512');
    grad.addColorStop(0.7, '#4e3520');
    grad.addColorStop(1, '#352010');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Wood grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 40; i++) {
      ctx.beginPath();
      var y = Math.random() * size;
      ctx.moveTo(0, y);
      for (var x = 0; x < size; x += 10) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (Math.random() - 0.5) * 2);
      }
      ctx.stroke();
    }
    // Highlight grain
    ctx.strokeStyle = 'rgba(180,140,80,0.06)';
    ctx.lineWidth = 2;
    for (var j = 0; j < 15; j++) {
      ctx.beginPath();
      var yy = Math.random() * size;
      ctx.moveTo(0, yy);
      for (var xx = 0; xx < size; xx += 8) {
        ctx.lineTo(xx, yy + Math.sin(xx * 0.015 + j * 2) * 5);
      }
      ctx.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createFeltTexture(size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    // Green felt base
    var grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.7);
    grad.addColorStop(0, '#2a6e2a');
    grad.addColorStop(0.7, '#1f5a1f');
    grad.addColorStop(1, '#164516');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Felt noise
    var imgData = ctx.getImageData(0, 0, size, size);
    for (var i = 0; i < imgData.data.length; i += 4) {
      var noise = (Math.random() - 0.5) * 12;
      imgData.data[i] += noise;
      imgData.data[i+1] += noise;
      imgData.data[i+2] += noise;
    }
    ctx.putImageData(imgData, 0, 0);
    // Center marker circle (subtle)
    ctx.strokeStyle = 'rgba(255,215,0,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  // ===== COIN FACE TEXTURE =====
  function createCoinTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.5);
    grad.addColorStop(0, '#ffe680');
    grad.addColorStop(0.6, '#ffd700');
    grad.addColorStop(1, '#b8960c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 140, 20, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.35, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160, 120, 0, 0.6)';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', size/2, size/2);
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
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 80; i++) {
      ctx.fillRect(i * 6.4, 0, 1.5, 32);
    }
    return new THREE.CanvasTexture(c);
  }

  // ===== BRIGHT ENV MAP =====
  function createEnvMap() {
    const size = 64;
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      if (i === 2) { // top - warm ceiling light
        grad.addColorStop(0, '#8a7a5a');
        grad.addColorStop(1, '#6a5a3e');
      } else if (i === 3) { // bottom
        grad.addColorStop(0, '#3a3a2e');
        grad.addColorStop(1, '#2a2a1e');
      } else { // sides - warm bar ambiance
        grad.addColorStop(0, '#6a5a4a');
        grad.addColorStop(1, '#3a2a1e');
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

    const materials = [
      new THREE.MeshStandardMaterial({
        map: edgeTex, color: 0xffd700, metalness: 0.85, roughness: 0.25,
        envMap: envMap, transparent: isGhost, opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex, color: 0xffd700, metalness: 0.8, roughness: 0.3,
        envMap: envMap, transparent: isGhost, opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex, color: 0xffd700, metalness: 0.8, roughness: 0.3,
        envMap: envMap, transparent: isGhost, opacity: isGhost ? 0.45 : 1,
      }),
    ];

    const geo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 32, 1, false);
    geo.clearGroups();
    const sideCount = 32 * 2;
    const capCount = 32;
    geo.addGroup(0, sideCount * 3, 0);
    geo.addGroup(sideCount * 3, capCount * 3, 1);
    geo.addGroup((sideCount + capCount) * 3, capCount * 3, 2);

    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = !isGhost;
    mesh.receiveShadow = !isGhost;
    return mesh;
  }

  // ===== BUILD SCENE ENVIRONMENT =====
  function _buildEnvironment() {
    // === TABLE with wood texture ===
    var woodTex = createWoodTexture(512);
    woodTex.repeat.set(2, 2);
    var tableGeo = new THREE.CylinderGeometry(TABLE_R, TABLE_R + 0.1, TABLE_H, 64);
    var tableMat = new THREE.MeshStandardMaterial({
      map: woodTex, color: 0xffffff, roughness: 0.75, metalness: 0.05,
    });
    tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -TABLE_H / 2;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // Table edge rim (brass)
    var rimGeo = new THREE.TorusGeometry(TABLE_R, 0.05, 8, 64);
    var rimMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.3, metalness: 0.8, envMap: envMap });
    var rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.01;
    scene.add(rim);

    // Felt surface
    var feltTex = createFeltTexture(512);
    var feltGeo = new THREE.CircleGeometry(TABLE_R - 0.05, 64);
    var feltMat = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, metalness: 0 });
    var felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.006;
    felt.receiveShadow = true;
    scene.add(felt);

    // === FLOOR under table ===
    var floorTex = createWoodTexture(256);
    floorTex.repeat.set(6, 6);
    var floorGeo = new THREE.PlaneGeometry(30, 30);
    var floorMat = new THREE.MeshStandardMaterial({
      map: floorTex, color: 0x886644, roughness: 0.9, metalness: 0,
    });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TABLE_H;
    floor.receiveShadow = true;
    scene.add(floor);

    // Shadow catcher on felt
    var shadowGeo = new THREE.PlaneGeometry(20, 20);
    var shadowMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    var shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.007;
    shadow.receiveShadow = true;
    scene.add(shadow);

    // === BACKGROUND WALLS (bar atmosphere) ===
    // Back wall
    var wallGeo = new THREE.PlaneGeometry(20, 12);
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9, metalness: 0 });
    var backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4, -8);
    scene.add(backWall);

    // Side walls
    var sideWallL = new THREE.Mesh(wallGeo, wallMat);
    sideWallL.position.set(-10, 4, 0);
    sideWallL.rotation.y = Math.PI / 2;
    scene.add(sideWallL);

    var sideWallR = new THREE.Mesh(wallGeo, wallMat);
    sideWallR.position.set(10, 4, 0);
    sideWallR.rotation.y = -Math.PI / 2;
    scene.add(sideWallR);

    // === DECORATIVE ELEMENTS ===
    // Warm wall sconces (point lights as decoration)
    var sconce1 = new THREE.PointLight(0xffaa44, 0.4, 10, 2);
    sconce1.position.set(-4, 4, -7.5);
    scene.add(sconce1);
    var sconce2 = new THREE.PointLight(0xffaa44, 0.4, 10, 2);
    sconce2.position.set(4, 4, -7.5);
    scene.add(sconce2);

    // Glowing sconce indicators (small spheres)
    var sconceGeo = new THREE.SphereGeometry(0.1, 8, 8);
    var sconceMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
    var s1 = new THREE.Mesh(sconceGeo, sconceMat);
    s1.position.copy(sconce1.position);
    scene.add(s1);
    var s2 = new THREE.Mesh(sconceGeo, sconceMat);
    s2.position.copy(sconce2.position);
    scene.add(s2);

    // Scattered gold coins on the floor around table (decoration)
    for (var i = 0; i < 8; i++) {
      var angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      var dist = TABLE_R + 0.5 + Math.random() * 1.5;
      var decoCoin = createCoinMesh(false);
      decoCoin.position.set(Math.cos(angle) * dist, -TABLE_H + COIN_H/2, Math.sin(angle) * dist);
      decoCoin.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      decoCoin.rotation.z = Math.random() * Math.PI * 2;
      decoCoin.scale.setScalar(0.6 + Math.random() * 0.3);
      scene.add(decoCoin);
    }
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
    scene.background = new THREE.Color(0x1a120a);
    scene.fog = new THREE.Fog(0x1a120a, 10, 22);

    camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    camera.position.set(0, 1.8, 4.5);
    camera.lookAt(0, 0.4, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    containerEl.appendChild(renderer.domElement);

    // Environment
    envMap = createEnvMap();
    scene.environment = envMap;

    // ===== BRIGHT LIGHTING =====
    ambientLight = new THREE.AmbientLight(0xffeedd, 0.7);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
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

    // Overhead spotlight (warm, casino-like)
    spotLight = new THREE.SpotLight(0xffd700, 1.2, 18, Math.PI / 4, 0.4, 1);
    spotLight.position.set(0, 8, 0);
    spotLight.castShadow = false;
    scene.add(spotLight);
    scene.add(spotLight.target);

    // Fill light from front
    var fillLight = new THREE.DirectionalLight(0xffeebb, 0.5);
    fillLight.position.set(0, 2, 6);
    scene.add(fillLight);

    // Back rim light (cool blue accent)
    var rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
    rimLight.position.set(-2, 3, -4);
    scene.add(rimLight);

    // Textures
    coinTexture = createCoinTexture();

    // Build environment (table, floor, walls, decorations)
    _buildEnvironment();

    // Drop guide line
    var guideGeo = new THREE.BufferGeometry();
    var guidePositions = new Float32Array([0, 0, 0, 0, 10, 0]);
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
    var guideMat = new THREE.LineDashedMaterial({
      color: 0xffd700, dashSize: 0.08, gapSize: 0.06,
      transparent: true, opacity: 0.35,
    });
    dropGuideLine = new THREE.Line(guideGeo, guideMat);
    dropGuideLine.computeLineDistances();
    dropGuideLine.visible = false;
    scene.add(dropGuideLine);

    clock = new THREE.Clock();
    isInitialized = true;

    window.addEventListener('resize', _onResize);
    _setupControls();
    _animate();
  };

  function _onResize() {
    if (!containerEl || !renderer || !camera) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w; lastHeight = h;
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
    coinMeshes = []; coinBodies = []; particles = [];
    ghostMesh = null; tableMesh = null; spotLight = null; dropGuideLine = null;
    introScatteredCoins = [];
    wobbleIntensity = 0; wobbleTarget = 0; wobbleTime = 0;
    isInitialized = false; introPlaying = false;
    dropAnimating = false; collapseAnimating = false;
    containerEl = null;
  };

  // ===== CONTROLS =====
  let _pointerDown = false;

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
    const nx = (e.clientX - rect.left) / rect.width;
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

  // ===== DROP COIN =====
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
      mesh: mesh, x: x, y: startY, vy: 0,
      targetY: targetY, settled: false, bounceCount: 0,
    };
  };

  function _settleDroppedCoin() {
    if (!dropBody) return;
    const mesh = dropBody.mesh;
    mesh.position.y = dropBody.targetY;
    coinMeshes.push(mesh);
    dropBody = null;
    dropAnimating = false;

    _spawnImpactParticles(mesh.position.x, mesh.position.y, mesh.position.z);
    shakeIntensity = 0.04;
    cameraTargetY = Math.max(1.8, coinMeshes.length * COIN_H * 0.7 + 1.5);

    if (dropCallback) {
      var cb = dropCallback;
      dropCallback = null;
      setTimeout(function() { cb(); }, 100);
    }
  }

  function _physicsStep(dt) {
    if (!dropBody || dropBody.settled) return;

    dropBody.vy += GRAVITY * dt;
    dropBody.y -= dropBody.vy * dt;

    if (dropBody.y <= dropBody.targetY) {
      dropBody.y = dropBody.targetY;
      if (dropBody.vy > 0.5 && dropBody.bounceCount < 3) {
        dropBody.vy = -dropBody.vy * BOUNCE;
        dropBody.bounceCount++;
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

  // ===== COLLAPSE =====
  window.csThreeCollapse = function(collapseLevel, dirX, callback) {
    if (collapseAnimating) return;
    collapseAnimating = true;
    collapseCallback = callback;

    coinBodies = [];
    const level = Math.max(0, collapseLevel);

    for (var i = level; i < coinMeshes.length; i++) {
      var mesh = coinMeshes[i];
      var pushX = (dirX || 0) * (2 + Math.random() * 3);
      var pushZ = (Math.random() - 0.5) * 4;
      coinBodies.push({
        mesh: mesh,
        x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
        vx: pushX + (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 4,
        vz: pushZ,
        rvx: (Math.random() - 0.5) * 10,
        rvy: (Math.random() - 0.5) * 10,
        rvz: (Math.random() - 0.5) * 10,
        settled: false,
      });
    }

    coinMeshes = coinMeshes.slice(0, level);
    shakeIntensity = 0.15;

    for (var j = 0; j < 30; j++) {
      _spawnImpactParticles(
        (Math.random() - 0.5) * 2, level * COIN_H, (Math.random() - 0.5) * 1
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

      if (b.y < COIN_H / 2) {
        b.y = COIN_H / 2;
        b.vy = Math.abs(b.vy) * BOUNCE;
        b.vx *= FRICTION;
        b.vz *= FRICTION;
        b.rvx *= 0.8; b.rvy *= 0.8; b.rvz *= 0.8;
        if (Math.abs(b.vy) < 0.1 && Math.abs(b.vx) < 0.05 && Math.abs(b.vz) < 0.05) {
          b.settled = true;
        }
      }

      // Cull off-screen (too far)
      var dist = Math.sqrt(b.x * b.x + b.z * b.z);
      if (dist > TABLE_R + 2) {
        b.settled = true;
        scene.remove(b.mesh);
        if (b.mesh.geometry) b.mesh.geometry.dispose();
      }

      if (!b.settled) {
        b.mesh.position.set(b.x, b.y, b.z);
        allSettled = false;
      }
    }

    if (allSettled) {
      collapseAnimating = false;
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
        if (!bodies[i].mesh.parent) continue; // already culled
        var mats = bodies[i].mesh.material;
        if (Array.isArray(mats)) {
          mats.forEach(function(m) { m.transparent = true; m.opacity = 1 - t; });
        }
      }
      if (t < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        for (var j = 0; j < bodies.length; j++) {
          if (bodies[j].mesh.parent) scene.remove(bodies[j].mesh);
          if (bodies[j].mesh.geometry) bodies[j].mesh.geometry.dispose();
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

    // Remove any leftover scattered coins from previous intro
    for (var sc = 0; sc < introScatteredCoins.length; sc++) {
      scene.remove(introScatteredCoins[sc]);
      if (introScatteredCoins[sc].geometry) introScatteredCoins[sc].geometry.dispose();
    }
    introScatteredCoins = [];

    var s = seed || 12345;
    function srand() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    }

    // Build intro tower (22 coins, taller for drama)
    var introCoinCount = 22;
    var introCoins = [];
    for (var i = 0; i < introCoinCount; i++) {
      var mesh = createCoinMesh(false);
      var ox = (srand() - 0.5) * 0.12;
      var oz = (srand() - 0.5) * 0.12;
      mesh.position.set(ox, COIN_H / 2 + i * COIN_H, oz);
      mesh.rotation.y = srand() * Math.PI * 2;
      scene.add(mesh);
      introCoins.push({
        mesh: mesh,
        x: ox, y: COIN_H / 2 + i * COIN_H, z: oz,
        vx: 0, vy: 0, vz: 0,
        rvx: 0, rvy: 0, rvz: 0,
        settled: false, culled: false,
      });
    }

    var phase = 0;
    var phaseTime = 0;
    var totalTime = 0;
    var camAngle = 0;
    var introDone = false;

    function introStep() {
      if (introDone || !isInitialized) return;
      var dt = 1 / 60;
      totalTime += dt;
      phaseTime += dt;

      if (phase === 0) {
        // Phase 0: Camera orbits around tower (0-2s)
        camAngle += dt * 1.5;
        var camRadius = 4.5 - totalTime * 0.2;
        var camH = 0.8 + totalTime * 0.5;
        camera.position.set(
          Math.sin(camAngle) * camRadius,
          camH,
          Math.cos(camAngle) * camRadius
        );
        camera.lookAt(0, introCoinCount * COIN_H * 0.4, 0);

        if (phaseTime > 1.8) {
          phase = 1;
          phaseTime = 0;
          // Push ALL coins outward radially from center (scatter wide!)
          for (var i = 0; i < introCoins.length; i++) {
            var c = introCoins[i];
            // Radial direction away from center
            var angle = srand() * Math.PI * 2;
            var speed = 3 + srand() * 5; // fast outward
            c.vx = Math.cos(angle) * speed;
            c.vz = Math.sin(angle) * speed;
            c.vy = 1 + srand() * 4; // pop up
            c.rvx = (srand() - 0.5) * 12;
            c.rvz = (srand() - 0.5) * 12;
          }
          shakeIntensity = 0.15;
        }
      } else if (phase === 1) {
        // Phase 1: Coins scatter outward and settle at edges (1.8-4.5s)
        var allSettled = true;
        for (var i = 0; i < introCoins.length; i++) {
          var c = introCoins[i];
          if (c.settled || c.culled) continue;

          c.vy -= GRAVITY * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.mesh.rotation.x += c.rvx * dt;
          c.mesh.rotation.z += c.rvz * dt;
          c.rvx *= 0.99;
          c.rvz *= 0.99;

          // Ground collision
          if (c.y < COIN_H / 2) {
            c.y = COIN_H / 2;
            c.vy = Math.abs(c.vy) * BOUNCE * 0.5;
            c.vx *= FRICTION;
            c.vz *= FRICTION;
            c.rvx *= 0.7;
            c.rvz *= 0.7;
            if (Math.abs(c.vy) < 0.08 && Math.abs(c.vx) < 0.03 && Math.abs(c.vz) < 0.03) {
              c.settled = true;
            }
          }

          // Cull coins that go too far off-screen
          var dist = Math.sqrt(c.x * c.x + c.z * c.z);
          if (dist > TABLE_R + 3) {
            c.culled = true;
            scene.remove(c.mesh);
            if (c.mesh.geometry) c.mesh.geometry.dispose();
            continue;
          }

          c.mesh.position.set(c.x, c.y, c.z);
          if (!c.settled) allSettled = false;
        }

        // Camera swoops down
        camAngle += dt * 0.8;
        var pullBackT = Math.min(1, phaseTime / 2.0);
        camera.position.set(
          Math.sin(camAngle) * (4 + pullBackT * 1.5),
          1.5 + pullBackT * 1.0,
          Math.cos(camAngle) * (4 + pullBackT * 1.5)
        );
        camera.lookAt(0, 0.3, 0);

        // Particles during scatter
        if (phaseTime < 1.0 && Math.random() < 0.4) {
          _spawnImpactParticles(
            (srand() - 0.5) * 3, srand() * 0.3, (srand() - 0.5) * 3
          );
        }

        if (allSettled || phaseTime > 3.0) {
          phase = 2;
          phaseTime = 0;
        }
      } else if (phase === 2) {
        // Phase 2: Keep settled coins at edges, fade coins in center zone, camera to game pos
        var fadeT = Math.min(1, phaseTime / 1.0);

        for (var i = 0; i < introCoins.length; i++) {
          var c = introCoins[i];
          if (c.culled) continue;

          var distFromCenter = Math.sqrt(c.x * c.x + c.z * c.z);

          if (distFromCenter < INTRO_SCATTER_R) {
            // Coins too close to center: fade out and remove
            var mats = c.mesh.material;
            if (Array.isArray(mats)) {
              mats.forEach(function(m) { m.transparent = true; m.opacity = 1 - fadeT; });
            }
          }
          // Coins outside center: keep visible (decoration)
        }

        // Smooth camera to game position
        camera.position.x += (0 - camera.position.x) * dt * 3;
        camera.position.y += (1.8 - camera.position.y) * dt * 3;
        camera.position.z += (4.5 - camera.position.z) * dt * 3;
        camera.lookAt(0, 0.4, 0);

        if (phaseTime > 1.5) {
          // Remove center coins, keep edge coins as decoration
          for (var j = 0; j < introCoins.length; j++) {
            var ic = introCoins[j];
            if (ic.culled) continue;
            var d = Math.sqrt(ic.x * ic.x + ic.z * ic.z);
            if (d < INTRO_SCATTER_R) {
              scene.remove(ic.mesh);
              if (ic.mesh.geometry) ic.mesh.geometry.dispose();
            } else {
              // Keep as scattered decoration
              introScatteredCoins.push(ic.mesh);
            }
          }
          introCoins = [];

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
      if (coinBodies[j].mesh.parent) scene.remove(coinBodies[j].mesh);
    }
    coinBodies = [];
    cameraTargetY = 1.8;
  };

  // ===== SET COINS (sync) =====
  window.csThreeSetCoins = function(positions) {
    for (var i = 0; i < coinMeshes.length; i++) {
      scene.remove(coinMeshes[i]);
      coinMeshes[i].geometry.dispose();
    }
    coinMeshes = [];
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
        transparent: true, opacity: 1,
      });
      var p = new THREE.Mesh(geo, mat);
      p.position.set(x, y, z);
      scene.add(p);
      particles.push({
        mesh: p,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 4 + 1,
        vz: (Math.random() - 0.5) * 3,
        life: 1, decay: 0.02 + Math.random() * 0.03,
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
    cameraBaseY += (cameraTargetY - cameraBaseY) * dt * 2;
    camera.position.y = cameraBaseY;

    if (shakeIntensity > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.5;
      shakeIntensity *= shakeDecay;
    }

    var lookY = Math.max(0.4, (cameraBaseY - 1.8) * 0.5 + 0.4);
    camera.lookAt(0, lookY, 0);

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
    var stackH = coinMeshes.length * COIN_H;
    var ghostY = stackH + COIN_H / 2 + GHOST_Y_OFFSET + Math.sin(_ghostTime * 3) * 0.05;
    ghostMesh.position.y = ghostY;
    ghostMesh.rotation.y += dt * 0.5;

    var mats = ghostMesh.material;
    if (Array.isArray(mats)) {
      var opacity = 0.35 + Math.sin(_ghostTime * 4) * 0.1;
      mats.forEach(function(m) { m.opacity = opacity; });
    }

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

    if (dropAnimating && dropBody) _physicsStep(dt);
    if (collapseAnimating) _collapsePhysicsStep(dt);
    _animateGhost(dt);
    _updateWobble(dt);
    _updateParticles(dt);
    if (!introPlaying) _updateCamera(dt);

    renderer.render(scene, camera);
  }

  window.csThreeShowResult = function(text) {
    // Handled by DOM overlay in coinstack.js
  };

})();

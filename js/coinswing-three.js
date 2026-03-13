// ===== COIN SWING THREE.JS - 3D Rendering (Timing Game) =====

(function() {
  'use strict';

  const COIN_R = 0.44;
  const COIN_H = 0.07;
  const TABLE_R = 2.5;
  const TABLE_H = 0.25;
  const GRAVITY = 18;
  const BOUNCE = 0.25;
  const FRICTION = 0.92;
  const DROP_HEIGHT = 4;
  const GHOST_Y_OFFSET = 0.35;
  const PARTICLE_COUNT = 20;
  const MAX_PARTICLES = 60;
  const INTRO_SCATTER_R = 1.8;

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
  let introScatteredCoins = [];

  // Danger system
  let dangerActive = false;

  // Team mode
  let teamModeActive = false;
  let myTeamSide = 'A';
  let coinMeshesA = [];
  let coinMeshesB = [];
  let cameraBaseX = 0;
  let cameraTargetX = 0;
  let peekingOpponent = false;
  let _activeDropTeam = null;
  let _ghostTeam = 'A';
  const TEAM_OFFSET = 4.5;
  let teamCenters = { A: -TEAM_OFFSET, B: TEAM_OFFSET };
  let teamTableObjects = [];

  // ===== PROCEDURAL TEXTURES =====
  function createWoodTexture(size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#3a2210');
    grad.addColorStop(0.3, '#4a3018');
    grad.addColorStop(0.5, '#3d2512');
    grad.addColorStop(0.7, '#4e3520');
    grad.addColorStop(1, '#352010');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
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
    var grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.7);
    grad.addColorStop(0, '#1a2e6e');
    grad.addColorStop(0.7, '#152450');
    grad.addColorStop(1, '#101a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    var imgData = ctx.getImageData(0, 0, size, size);
    for (var i = 0; i < imgData.data.length; i += 4) {
      var noise = (Math.random() - 0.5) * 12;
      imgData.data[i] += noise;
      imgData.data[i+1] += noise;
      imgData.data[i+2] += noise;
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.strokeStyle = 'rgba(100,180,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  function createCoinTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    // Silver-blue tone for swing variant
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.5);
    grad.addColorStop(0, '#e8e8ff');
    grad.addColorStop(0.6, '#c0c0e0');
    grad.addColorStop(1, '#8888b0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 100, 180, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.35, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(80, 80, 140, 0.6)';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◆', size/2, size/2);
    ctx.fillStyle = 'rgba(100, 100, 180, 0.3)';
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
    grad.addColorStop(0, '#a0a0c0');
    grad.addColorStop(0.3, '#c0c0e0');
    grad.addColorStop(0.5, '#e0e0ff');
    grad.addColorStop(0.7, '#c0c0e0');
    grad.addColorStop(1, '#8080a0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 80; i++) {
      ctx.fillRect(i * 6.4, 0, 1.5, 32);
    }
    return new THREE.CanvasTexture(c);
  }

  function createEnvMap() {
    const size = 64;
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      if (i === 2) {
        grad.addColorStop(0, '#5a5a8a');
        grad.addColorStop(1, '#3a3a6e');
      } else if (i === 3) {
        grad.addColorStop(0, '#2e2e4a');
        grad.addColorStop(1, '#1e1e3a');
      } else {
        grad.addColorStop(0, '#4a4a6a');
        grad.addColorStop(1, '#1e1e3a');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      faces.push(c);
    }
    const tex = new THREE.CubeTexture(faces);
    tex.needsUpdate = true;
    return tex;
  }

  function createCoinMesh(isGhost) {
    const topTex = coinTexture.clone();
    topTex.needsUpdate = true;
    const edgeTex = createEdgeTexture();
    edgeTex.wrapS = THREE.RepeatWrapping;

    const coinColor = 0xc0c0e0;
    const materials = [
      new THREE.MeshStandardMaterial({
        map: edgeTex, color: coinColor, metalness: 0.9, roughness: 0.2,
        envMap: envMap, transparent: isGhost, opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex, color: coinColor, metalness: 0.85, roughness: 0.25,
        envMap: envMap, transparent: isGhost, opacity: isGhost ? 0.45 : 1,
      }),
      new THREE.MeshStandardMaterial({
        map: topTex, color: coinColor, metalness: 0.85, roughness: 0.25,
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

  function _buildEnvironment() {
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

    var rimGeo = new THREE.TorusGeometry(TABLE_R, 0.05, 8, 64);
    var rimMat = new THREE.MeshStandardMaterial({ color: 0x6688aa, roughness: 0.3, metalness: 0.8, envMap: envMap });
    var rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.01;
    scene.add(rim);

    var feltTex = createFeltTexture(512);
    var feltGeo = new THREE.CircleGeometry(TABLE_R - 0.05, 64);
    var feltMat = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, metalness: 0 });
    var felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.006;
    felt.receiveShadow = true;
    scene.add(felt);

    var floorTex = createWoodTexture(256);
    floorTex.repeat.set(6, 6);
    var floorGeo = new THREE.PlaneGeometry(30, 30);
    var floorMat = new THREE.MeshStandardMaterial({
      map: floorTex, color: 0x556677, roughness: 0.9, metalness: 0,
    });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TABLE_H;
    floor.receiveShadow = true;
    scene.add(floor);

    var shadowGeo = new THREE.PlaneGeometry(20, 20);
    var shadowMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    var shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.007;
    shadow.receiveShadow = true;
    scene.add(shadow);

    var wallGeo = new THREE.PlaneGeometry(20, 12);
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x0e1a2e, roughness: 0.9, metalness: 0 });
    var backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4, -8);
    scene.add(backWall);

    var sideWallL = new THREE.Mesh(wallGeo, wallMat);
    sideWallL.position.set(-10, 4, 0);
    sideWallL.rotation.y = Math.PI / 2;
    scene.add(sideWallL);

    var sideWallR = new THREE.Mesh(wallGeo, wallMat);
    sideWallR.position.set(10, 4, 0);
    sideWallR.rotation.y = -Math.PI / 2;
    scene.add(sideWallR);

    var sconce1 = new THREE.PointLight(0x4488ff, 0.4, 10, 2);
    sconce1.position.set(-4, 4, -7.5);
    scene.add(sconce1);
    var sconce2 = new THREE.PointLight(0x4488ff, 0.4, 10, 2);
    sconce2.position.set(4, 4, -7.5);
    scene.add(sconce2);

    var sconceGeo = new THREE.SphereGeometry(0.1, 8, 8);
    var sconceMat = new THREE.MeshBasicMaterial({ color: 0x6699ff });
    var s1 = new THREE.Mesh(sconceGeo, sconceMat);
    s1.position.copy(sconce1.position);
    scene.add(s1);
    var s2 = new THREE.Mesh(sconceGeo, sconceMat);
    s2.position.copy(sconce2.position);
    scene.add(s2);

    // Scattered decoration coins
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

  // ===== BUILD TABLE AT OFFSET =====
  function _buildTableAt(offsetX) {
    var objs = [];
    var woodTex = createWoodTexture(512);
    woodTex.repeat.set(2, 2);
    var tableGeo = new THREE.CylinderGeometry(TABLE_R, TABLE_R + 0.1, TABLE_H, 64);
    var tableMat = new THREE.MeshStandardMaterial({
      map: woodTex, color: 0xffffff, roughness: 0.75, metalness: 0.05,
    });
    var t = new THREE.Mesh(tableGeo, tableMat);
    t.position.set(offsetX, -TABLE_H / 2, 0);
    t.receiveShadow = true;
    scene.add(t);
    objs.push(t);

    var rimGeo = new THREE.TorusGeometry(TABLE_R, 0.05, 8, 64);
    var rimMat = new THREE.MeshStandardMaterial({ color: 0x6688aa, roughness: 0.3, metalness: 0.8, envMap: envMap });
    var rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(offsetX, 0.01, 0);
    scene.add(rim);
    objs.push(rim);

    var feltTex = createFeltTexture(512);
    var feltGeo = new THREE.CircleGeometry(TABLE_R - 0.05, 64);
    var feltMat = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, metalness: 0 });
    var felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(offsetX, 0.006, 0);
    felt.receiveShadow = true;
    scene.add(felt);
    objs.push(felt);

    // Scattered decoration coins
    for (var i = 0; i < 5; i++) {
      var angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      var dist = TABLE_R + 0.4 + Math.random() * 1.0;
      var decoCoin = createCoinMesh(false);
      decoCoin.position.set(offsetX + Math.cos(angle) * dist, -TABLE_H + COIN_H/2, Math.sin(angle) * dist);
      decoCoin.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      decoCoin.rotation.z = Math.random() * Math.PI * 2;
      decoCoin.scale.setScalar(0.5 + Math.random() * 0.3);
      scene.add(decoCoin);
      objs.push(decoCoin);
    }

    return objs;
  }

  // ===== TEAM MODE SETUP =====
  window.swThreeSetupTeamMode = function(myTeam) {
    teamModeActive = true;
    myTeamSide = myTeam;
    coinMeshesA = [];
    coinMeshesB = [];

    // Hide original center table
    if (tableMesh) { tableMesh.visible = false; }
    // Hide center felt/rim (children of scene near y=0)
    scene.children.forEach(function(obj) {
      if (obj === tableMesh) return;
      if (obj.position && Math.abs(obj.position.x) < 0.1 && Math.abs(obj.position.z) < 0.1) {
        if (obj.geometry && (obj.geometry.type === 'TorusGeometry' || obj.geometry.type === 'CircleGeometry')) {
          obj.visible = false;
        }
      }
    });

    // Build two tables
    var objsA = _buildTableAt(teamCenters.A);
    var objsB = _buildTableAt(teamCenters.B);
    teamTableObjects = objsA.concat(objsB);

    // Add team labels above tables
    _addTeamLabel('A팀', teamCenters.A, 0x4488ff);
    _addTeamLabel('B팀', teamCenters.B, 0xff4488);

    // Set camera to my team
    var myCenterX = teamCenters[myTeam];
    cameraTargetX = myCenterX;
    cameraBaseX = myCenterX;
    camera.position.x = myCenterX;
    camera.position.set(myCenterX, 1.8, 4.5);
    camera.lookAt(myCenterX, 0.4, 0);
  };

  function _addTeamLabel(text, centerX, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    var tex = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8 });
    var sprite = new THREE.Sprite(mat);
    sprite.position.set(centerX, 0.6, 2.5);
    sprite.scale.set(1.6, 0.4, 1);
    scene.add(sprite);
    teamTableObjects.push(sprite);
  }

  // ===== TEAM HELPERS =====
  function _getTeamCoins(team) {
    if (!teamModeActive) return coinMeshes;
    return team === 'A' ? coinMeshesA : coinMeshesB;
  }

  function _getMyTeamCoins() {
    return _getTeamCoins(myTeamSide);
  }

  function _getActiveCoins() {
    if (!teamModeActive) return coinMeshes;
    return _activeDropTeam ? _getTeamCoins(_activeDropTeam) : _getMyTeamCoins();
  }

  // ===== INIT =====
  window.initCoinSwingThree = function(containerId) {
    if (isInitialized) return;
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    const w = containerEl.clientWidth || 360;
    const h = containerEl.clientHeight || 640;
    lastWidth = w;
    lastHeight = h;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1e);
    scene.fog = new THREE.Fog(0x0a0a1e, 10, 22);

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

    envMap = createEnvMap();
    scene.environment = envMap;

    ambientLight = new THREE.AmbientLight(0xddeeff, 0.7);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xe0f0ff, 1.2);
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

    spotLight = new THREE.SpotLight(0x88aaff, 1.2, 18, Math.PI / 4, 0.4, 1);
    spotLight.position.set(0, 8, 0);
    spotLight.castShadow = false;
    scene.add(spotLight);
    scene.add(spotLight.target);

    var fillLight = new THREE.DirectionalLight(0xbbccff, 0.5);
    fillLight.position.set(0, 2, 6);
    scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
    rimLight.position.set(-2, 3, -4);
    scene.add(rimLight);

    coinTexture = createCoinTexture();
    _buildEnvironment();

    clock = new THREE.Clock();
    isInitialized = true;

    window.addEventListener('resize', _onResize);
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
  window.destroyCoinSwingThree = function() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', _onResize);
    if (renderer && containerEl) {
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
    coinMeshesA = []; coinMeshesB = [];
    ghostMesh = null; tableMesh = null; spotLight = null;
    introScatteredCoins = []; teamTableObjects = [];
    wobbleIntensity = 0; wobbleTarget = 0; wobbleTime = 0;
    dangerActive = false; teamModeActive = false;
    cameraBaseX = 0; cameraTargetX = 0; peekingOpponent = false;
    _activeDropTeam = null; _ghostTeam = 'A'; myTeamSide = 'A';
    isInitialized = false; introPlaying = false;
    dropAnimating = false; collapseAnimating = false;
    containerEl = null;
  };

  // ===== GHOST COIN =====
  window.swThreeShowGhost = function(show) {
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

  window.swThreeSetGhostX = function(x) {
    ghostX = x;
    _updateGhostPosition();
  };

  window.swThreeSetGhostTeam = function(team) {
    _ghostTeam = team;
    _updateGhostPosition();
  };

  function _updateGhostPosition() {
    if (!ghostMesh) return;
    var coins = teamModeActive ? _getTeamCoins(_ghostTeam) : coinMeshes;
    var stackH = coins.length * COIN_H;
    var centerX = teamModeActive ? teamCenters[_ghostTeam] : 0;
    ghostMesh.position.x = centerX + ghostX;
    ghostMesh.position.y = stackH + COIN_H / 2 + GHOST_Y_OFFSET;
    ghostMesh.position.z = 0;
  }

  // ===== DANGER SYSTEM =====
  window.swThreeSetDanger = function(active) {
    dangerActive = active;
  };

  function _updateDangerGlow(dt) {
    if (!dangerActive || coinMeshes.length < 3) return;
    var time = performance.now() * 0.003;
    var glowAmount = (Math.sin(time * 3) * 0.5 + 0.5) * 0.15;
    for (var i = Math.max(0, coinMeshes.length - 5); i < coinMeshes.length; i++) {
      var mesh = coinMeshes[i];
      var mats = mesh.material;
      if (Array.isArray(mats)) {
        var factor = (i - Math.max(0, coinMeshes.length - 5)) / 5;
        mats.forEach(function(m) {
          m.emissive = m.emissive || new THREE.Color();
          m.emissive.setRGB(glowAmount * factor, 0, glowAmount * factor * 0.3);
        });
      }
    }
  }

  function _clearDangerGlow() {
    for (var i = 0; i < coinMeshes.length; i++) {
      var mats = coinMeshes[i].material;
      if (Array.isArray(mats)) {
        mats.forEach(function(m) {
          if (m.emissive) m.emissive.setRGB(0, 0, 0);
        });
      }
    }
  }

  // ===== SCORE POPUP =====
  window.swThreeShowScorePopup = function(score, placement, multiplier) {
    if (!containerEl) return;
    var el = document.createElement('div');
    el.className = 'sw-score-popup';
    var text = '+' + score;
    if (placement === 'perfect') {
      el.classList.add('sw-score-perfect');
      text = 'PERFECT! +' + score;
    } else if (placement === 'risky') {
      el.classList.add('sw-score-risky');
      text = 'RISKY! +' + score;
    }
    if (multiplier > 1) {
      el.classList.add('sw-score-multi');
      text += ' ×' + multiplier.toFixed(1);
    }
    el.textContent = text;
    containerEl.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
  };

  // ===== DROP COIN =====
  window.swThreeDropCoin = function(x, targetY, callback) {
    if (!isInitialized || dropAnimating) return;
    dropAnimating = true;
    dropCallback = callback;
    _activeDropTeam = null;

    // Hide ghost during drop
    if (ghostMesh) ghostMesh.visible = false;

    const mesh = createCoinMesh(false);
    // Drop from ghost position (just above the stack) instead of high above
    const stackH = coinMeshes.length * COIN_H;
    const startY = stackH + COIN_H / 2 + GHOST_Y_OFFSET;
    mesh.position.set(x, startY, 0);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);

    dropBody = {
      mesh: mesh, x: x, y: startY, vy: 0,
      targetY: targetY, settled: false, bounceCount: 0,
    };
  };

  // Team mode drop
  window.swThreeDropCoinTeam = function(team, x, targetY, callback) {
    if (!isInitialized || dropAnimating) return;
    dropAnimating = true;
    dropCallback = callback;
    _activeDropTeam = team;

    if (ghostMesh) ghostMesh.visible = false;

    var coins = _getTeamCoins(team);
    var centerX = teamCenters[team];
    var mesh = createCoinMesh(false);
    var stackH = coins.length * COIN_H;
    var startY = stackH + COIN_H / 2 + GHOST_Y_OFFSET;
    mesh.position.set(centerX + x, startY, 0);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);

    dropBody = {
      mesh: mesh, x: centerX + x, y: startY, vy: 0,
      targetY: targetY, settled: false, bounceCount: 0,
    };
  };

  function _settleDroppedCoin() {
    if (!dropBody) return;
    const mesh = dropBody.mesh;
    mesh.position.y = dropBody.targetY;

    // Push to correct coin array
    if (teamModeActive && _activeDropTeam) {
      var teamCoins = _getTeamCoins(_activeDropTeam);
      teamCoins.push(mesh);
      var stackH = teamCoins.length * COIN_H;
      shakeIntensity = 0.03 + teamCoins.length * 0.002;
      // Only update camera height if this is my team's stack
      if (_activeDropTeam === myTeamSide && !peekingOpponent) {
        cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
      }
    } else {
      coinMeshes.push(mesh);
      shakeIntensity = 0.03 + coinMeshes.length * 0.002;
      var stackH = coinMeshes.length * COIN_H;
      cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
    }

    dropBody = null;
    dropAnimating = false;
    _activeDropTeam = null;

    _spawnImpactParticles(mesh.position.x, mesh.position.y, mesh.position.z);

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
  window.swThreeCollapse = function(collapseLevel, dirX, callback) {
    if (collapseAnimating) return;
    collapseAnimating = true;
    collapseCallback = callback;
    _clearDangerGlow();

    if (ghostMesh) ghostMesh.visible = false;

    coinBodies = [];
    const level = Math.max(0, collapseLevel);

    for (var i = level; i < coinMeshes.length; i++) {
      var mesh = coinMeshes[i];
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(function(m) { if (m.emissive) m.emissive.setRGB(0, 0, 0); });
      }
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

  // Team mode collapse
  window.swThreeCollapseTeam = function(team, collapseLevel, dirX, callback) {
    if (collapseAnimating) return;
    collapseAnimating = true;
    collapseCallback = callback;

    if (ghostMesh) ghostMesh.visible = false;

    var teamCoins = _getTeamCoins(team);
    var centerX = teamCenters[team];
    coinBodies = [];
    var level = Math.max(0, collapseLevel);

    for (var i = level; i < teamCoins.length; i++) {
      var mesh = teamCoins[i];
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(function(m) { if (m.emissive) m.emissive.setRGB(0, 0, 0); });
      }
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

    if (team === 'A') coinMeshesA = coinMeshesA.slice(0, level);
    else coinMeshesB = coinMeshesB.slice(0, level);
    shakeIntensity = 0.15;

    // Move camera to see the collapse
    cameraTargetX = centerX;
    for (var j = 0; j < 30; j++) {
      _spawnImpactParticles(
        centerX + (Math.random() - 0.5) * 2, level * COIN_H, (Math.random() - 0.5) * 1
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
        if (!bodies[i].mesh.parent) continue;
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

  // ===== INTRO =====
  window.swThreePlayIntro = function(seed, callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    introPlaying = true;
    introCallback = callback;

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

    // Swing intro: coin swings in from side
    var introCoinCount = 22;
    var introCoins = [];
    for (var i = 0; i < introCoinCount; i++) {
      var mesh = createCoinMesh(false);
      var ox = (srand() - 0.5) * 0.12;
      mesh.position.set(ox, COIN_H / 2 + i * COIN_H, 0);
      mesh.rotation.y = srand() * Math.PI * 2;
      scene.add(mesh);
      introCoins.push({
        mesh: mesh,
        x: ox, y: COIN_H / 2 + i * COIN_H, z: 0,
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
        camAngle += dt * 1.5;
        var camRadius = 4.5 - totalTime * 0.2;
        var camH = 0.8 + totalTime * 0.5;
        camera.position.set(
          Math.sin(camAngle) * camRadius, camH,
          Math.cos(camAngle) * camRadius
        );
        camera.lookAt(0, introCoinCount * COIN_H * 0.4, 0);

        if (phaseTime > 1.8) {
          phase = 1;
          phaseTime = 0;
          for (var i = 0; i < introCoins.length; i++) {
            var c = introCoins[i];
            var angle = srand() * Math.PI * 2;
            var speed = 3 + srand() * 5;
            c.vx = Math.cos(angle) * speed;
            c.vz = Math.sin(angle) * speed;
            c.vy = 1 + srand() * 4;
            c.rvx = (srand() - 0.5) * 12;
            c.rvz = (srand() - 0.5) * 12;
          }
          shakeIntensity = 0.15;
        }
      } else if (phase === 1) {
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

        camAngle += dt * 0.8;
        var pullBackT = Math.min(1, phaseTime / 2.0);
        camera.position.set(
          Math.sin(camAngle) * (4 + pullBackT * 1.5),
          1.5 + pullBackT * 1.0,
          Math.cos(camAngle) * (4 + pullBackT * 1.5)
        );
        camera.lookAt(0, 0.3, 0);

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
        var fadeT = Math.min(1, phaseTime / 1.0);

        for (var i = 0; i < introCoins.length; i++) {
          var c = introCoins[i];
          if (c.culled) continue;
          var distFromCenter = Math.sqrt(c.x * c.x + c.z * c.z);
          if (distFromCenter < INTRO_SCATTER_R) {
            var mats = c.mesh.material;
            if (Array.isArray(mats)) {
              mats.forEach(function(m) { m.transparent = true; m.opacity = 1 - fadeT; });
            }
          }
        }

        camera.position.x += (0 - camera.position.x) * dt * 3;
        camera.position.y += (1.8 - camera.position.y) * dt * 3;
        camera.position.z += (4.5 - camera.position.z) * dt * 3;
        camera.lookAt(0, 0.4, 0);

        if (phaseTime > 1.5) {
          for (var j = 0; j < introCoins.length; j++) {
            var ic = introCoins[j];
            if (ic.culled) continue;
            var d = Math.sqrt(ic.x * ic.x + ic.z * ic.z);
            if (d < INTRO_SCATTER_R) {
              scene.remove(ic.mesh);
              if (ic.mesh.geometry) ic.mesh.geometry.dispose();
            } else {
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

      if (!introDone) requestAnimationFrame(introStep);
    }

    introStep();
  };

  window.swThreeClear = function() {
    _clearDangerGlow();
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

  window.swThreeSetCoins = function(positions) {
    _clearDangerGlow();
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
    var stackH = positions.length * COIN_H;
    cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
  };

  // Team mode set coins
  window.swThreeSetCoinsTeam = function(team, positions) {
    var teamCoins = _getTeamCoins(team);
    var centerX = teamCenters[team];
    // Clear existing
    for (var i = 0; i < teamCoins.length; i++) {
      scene.remove(teamCoins[i]);
      teamCoins[i].geometry.dispose();
    }
    var newCoins = [];
    for (var j = 0; j < positions.length; j++) {
      var p = positions[j];
      var mesh = createCoinMesh(false);
      mesh.position.set(centerX + p.x, p.y, p.z || 0);
      mesh.rotation.y = p.ry || 0;
      scene.add(mesh);
      newCoins.push(mesh);
    }
    if (team === 'A') coinMeshesA = newCoins;
    else coinMeshesB = newCoins;

    // Update camera height based on my team's stack
    if (team === myTeamSide && !peekingOpponent) {
      var stackH = positions.length * COIN_H;
      cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
    }
  };

  // Team mode clear
  window.swThreeClearTeam = function() {
    [coinMeshesA, coinMeshesB].forEach(function(arr) {
      for (var i = 0; i < arr.length; i++) {
        scene.remove(arr[i]);
        arr[i].geometry.dispose();
      }
    });
    coinMeshesA = [];
    coinMeshesB = [];
    coinBodies = [];
    cameraTargetY = 1.8;
  };

  // ===== PEEK OPPONENT =====
  window.swThreePeekTeam = function(team, duration) {
    if (!teamModeActive) return;
    peekingOpponent = true;
    var targetX = teamCenters[team];
    cameraTargetX = targetX;
    var teamCoins = _getTeamCoins(team);
    var stackH = teamCoins.length * COIN_H;
    cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
  };

  window.swThreeReturnToMyTeam = function() {
    if (!teamModeActive) return;
    peekingOpponent = false;
    cameraTargetX = teamCenters[myTeamSide];
    var myCoins = _getMyTeamCoins();
    var stackH = myCoins.length * COIN_H;
    cameraTargetY = Math.max(1.8, stackH * 0.5 + GHOST_Y_OFFSET * 0.4 + 1.5);
  };

  window.swThreeGetTeamCoinCount = function(team) {
    return _getTeamCoins(team).length;
  };

  // ===== PARTICLES =====
  function _spawnImpactParticles(x, y, z) {
    if (particles.length > MAX_PARTICLES) return;
    var count = Math.min(PARTICLE_COUNT, MAX_PARTICLES - particles.length);
    for (var i = 0; i < count; i++) {
      var geo = new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 4);
      var mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.7, 0.5 + Math.random() * 0.3),
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
  window.swThreeShowEmoji = function(emoji, screenX, screenY) {
    if (!containerEl) return;
    var el = document.createElement('div');
    el.className = 'sw-floating-emoji';
    el.textContent = emoji;
    el.style.left = (screenX || 50) + '%';
    el.style.bottom = (screenY || 30) + '%';
    containerEl.appendChild(el);
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1500);
  };

  // ===== WOBBLE =====
  window.swThreeSetWobble = function(intensity) {
    wobbleTarget = Math.max(0, Math.min(1, intensity || 0));
  };

  function _updateWobble(dt) {
    wobbleIntensity += (wobbleTarget - wobbleIntensity) * dt * 3;
    if (wobbleIntensity < 0.01) return;
    wobbleTime += dt;
    for (var i = 0; i < coinMeshes.length; i++) {
      var heightFactor = (i + 1) / Math.max(1, coinMeshes.length);
      var wobAmp = wobbleIntensity * heightFactor * 0.018;
      var wobFreq = 4 + wobbleIntensity * 4;
      coinMeshes[i].rotation.z = Math.sin(wobbleTime * wobFreq + i * 0.3) * wobAmp;
      coinMeshes[i].rotation.x = Math.cos(wobbleTime * wobFreq * 0.7 + i * 0.5) * wobAmp * 0.5;
    }
  }

  // ===== SCREEN SHAKE =====
  window.swThreeShake = function(intensity) {
    shakeIntensity = intensity || 0.08;
  };

  // ===== CAMERA =====
  function _updateCamera(dt) {
    cameraBaseY += (cameraTargetY - cameraBaseY) * dt * 3;
    camera.position.y = cameraBaseY;

    // X axis for team mode
    if (teamModeActive) {
      cameraBaseX += (cameraTargetX - cameraBaseX) * dt * 2.5;
      camera.position.x = cameraBaseX;
    }

    if (shakeIntensity > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.5;
      shakeIntensity *= shakeDecay;
    }

    // Look at the middle of the stack so both base and ghost are visible
    var lookX = teamModeActive ? cameraBaseX : 0;
    var activeCoins = teamModeActive ? (peekingOpponent ? _getTeamCoins(myTeamSide === 'A' ? 'B' : 'A') : _getMyTeamCoins()) : coinMeshes;
    var stackH = activeCoins.length * COIN_H;
    var lookY = Math.max(0.4, stackH * 0.5);
    camera.lookAt(lookX, lookY, 0);

    if (spotLight) {
      spotLight.position.x = lookX;
      spotLight.position.y = cameraBaseY + 6;
      spotLight.target.position.set(lookX, lookY, 0);
    }
  }

  window.swThreeSetCameraHeight = function(h) {
    cameraTargetY = Math.max(1.8, h);
  };

  // ===== GHOST ANIMATION =====
  let _ghostTime = 0;
  function _animateGhost(dt) {
    if (!ghostMesh || !ghostVisible) return;
    _ghostTime += dt;
    var coins = teamModeActive ? _getTeamCoins(_ghostTeam) : coinMeshes;
    var stackH = coins.length * COIN_H;
    var centerX = teamModeActive ? teamCenters[_ghostTeam] : 0;
    var ghostY = stackH + COIN_H / 2 + GHOST_Y_OFFSET + Math.sin(_ghostTime * 3) * 0.03;
    ghostMesh.position.x = centerX + ghostX;
    ghostMesh.position.y = ghostY;
    ghostMesh.rotation.y += dt * 0.8;

    var mats = ghostMesh.material;
    if (Array.isArray(mats)) {
      var opacity = 0.35 + Math.sin(_ghostTime * 4) * 0.1;
      mats.forEach(function(m) { m.opacity = opacity; });
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
    if (dangerActive) _updateDangerGlow(dt);
    if (!introPlaying) _updateCamera(dt);

    renderer.render(scene, camera);
  }

})();

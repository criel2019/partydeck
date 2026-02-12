// ===== YAHTZEE THREE.JS DICE SYSTEM =====

(function() {
  'use strict';

  let scene, camera, renderer, rafId;
  let diceMeshes = [];
  let trayGroup;
  let isInitialized = false;
  let clock;

  // Dice state
  let currentValues = [1, 1, 1, 1, 1];
  let currentHeld = [false, false, false, false, false];
  let animatingDice = [false, false, false, false, false];
  let diceTargets = []; // target positions/rotations for each die

  // Settled row positions (x positions for 5 dice lined up)
  const ROW_X = [-1.6, -0.8, 0, 0.8, 1.6];
  const ROW_Y = 0.35;
  const ROW_Z = 0.8;

  // Dice scale: small in cup/tray, large when on tray for selection
  const DICE_SCALE_SMALL = 0.55;  // inside cup
  const DICE_SCALE_NORMAL = 1.0;  // on tray after roll

  // Animation state
  let rollAnimations = [];
  let settleAnimations = [];
  let idleTime = 0;

  // Raycaster for click detection
  let raycaster, pointer;

  // Face rotation map: quaternions that show each face up
  const FACE_ROTATIONS = {};

  // ===== CUP STATE =====
  let cupGroup = null;
  let cupState = 'hidden'; // 'hidden' | 'ready' | 'shaking' | 'dumping'
  let cupShakeIntensity = 0;
  let cupShakeTimer = null;
  let cupDumpStartTime = 0;
  let cupDumpCallback = null;
  let cupDumpCallbackFired = false;
  let cupReadyHeld = [false, false, false, false, false];
  const CUP_DUMP_DURATION = 0.8;
  const CUP_SHAKE_TIMEOUT = 1500;
  const CUP_DICE_Y = 0.42;
  const CUP_PHYSICS_R = 0.45; // physics boundary smaller than visual cup
  // Per-die velocity/offset inside cup during shaking
  let cupDiceVX = [0, 0, 0, 0, 0];
  let cupDiceVZ = [0, 0, 0, 0, 0];
  let cupDiceOX = [0, 0, 0, 0, 0];
  let cupDiceOZ = [0, 0, 0, 0, 0];
  // Per-die angular velocity (persistent spin)
  let cupDiceRVX = [0, 0, 0, 0, 0];
  let cupDiceRVY = [0, 0, 0, 0, 0];
  let cupDiceRVZ = [0, 0, 0, 0, 0];
  const CUP_SCATTER = [
    { x: 0, z: 0 },
    { x: -0.28, z: -0.22 },
    { x: 0.28, z: -0.22 },
    { x: -0.22, z: 0.26 },
    { x: 0.22, z: 0.26 },
  ];
  const CUP_POS = { x: 0, z: 0 };

  // All valid rotations per face value (4 Y-axis variants each)
  const FACE_ROTATIONS_ALL = {};

  function computeFaceRotations() {
    // Camera is at (0, 8, 7) looking at (0, 0, 0.3) — views primarily from above.
    // The dominant visible face is +Y (top). We rotate so the desired value's
    // textured face points UP (+Y direction).
    //
    // Texture map (faceValues): +X=4, -X=3, +Y=5, -Y=6, +Z=1, -Z=2
    // Standard die opposite faces sum to 7: 1↔6, 2↔5, 3↔4

    // Value 1: texture on +Z face → tilt +Z up to +Y → rotate X by -90°
    FACE_ROTATIONS[1] = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    // Value 2: texture on -Z face → tilt -Z up to +Y → rotate X by +90°
    FACE_ROTATIONS[2] = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    // Value 3: texture on -X face → tilt -X up to +Y → rotate Z by -90°
    FACE_ROTATIONS[3] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
    // Value 4: texture on +X face → tilt +X up to +Y → rotate Z by +90°
    FACE_ROTATIONS[4] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    // Value 5: texture on +Y face → already on top → identity
    FACE_ROTATIONS[5] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    // Value 6: texture on -Y face → flip upside down → rotate X by 180°
    FACE_ROTATIONS[6] = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));

    // Generate 4 Y-axis variants for each face value (0°, 90°, 180°, 270°)
    // All show the same top face but rotated around Y — pick nearest for natural settle
    const yRots = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (let v = 1; v <= 6; v++) {
      FACE_ROTATIONS_ALL[v] = yRots.map(function(yAngle) {
        const yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yAngle);
        return new THREE.Quaternion().copy(FACE_ROTATIONS[v]).premultiply(yQuat);
      });
    }
  }

  // Find the nearest valid quaternion for a target value from the current rotation
  function findNearestFaceQuat(currentQuat, targetValue) {
    const variants = FACE_ROTATIONS_ALL[targetValue];
    if (!variants) return FACE_ROTATIONS[targetValue];

    let best = variants[0];
    let bestDot = -1;
    for (let i = 0; i < variants.length; i++) {
      // dot product of quaternions: closer to 1 = smaller rotation needed
      let d = currentQuat.dot(variants[i]);
      d = Math.abs(d); // handle double-cover (q and -q are same rotation)
      if (d > bestDot) {
        bestDot = d;
        best = variants[i];
      }
    }
    return best;
  }

  // ===== TEXTURE GENERATION =====
  function createDieTexture(value) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Ivory background with subtle gradient
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#fffff5');
    grad.addColorStop(1, '#f0ead6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 20);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(180, 150, 100, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 20);
    ctx.stroke();

    // Draw pips
    const pipR = 18;
    const pipColor = '#2c2c2c';
    const positions = getPipPositions(value, size);

    positions.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fillStyle = pipColor;
      ctx.fill();

      // Pip inner shadow
      const pipGrad = ctx.createRadialGradient(px - 3, py - 3, 0, px, py, pipR);
      pipGrad.addColorStop(0, 'rgba(80,80,80,0.3)');
      pipGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fillStyle = pipGrad;
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function getPipPositions(value, size) {
    const s = size;
    const q1 = s * 0.27, q2 = s * 0.5, q3 = s * 0.73;

    switch (value) {
      case 1: return [[q2, q2]];
      case 2: return [[q1, q3], [q3, q1]];
      case 3: return [[q1, q3], [q2, q2], [q3, q1]];
      case 4: return [[q1, q1], [q1, q3], [q3, q1], [q3, q3]];
      case 5: return [[q1, q1], [q1, q3], [q2, q2], [q3, q1], [q3, q3]];
      case 6: return [[q1, q1], [q1, q2], [q1, q3], [q3, q1], [q3, q2], [q3, q3]];
      default: return [];
    }
  }

  // ===== DICE MESH CREATION =====
  function createDieMesh(index) {
    const size = 0.5;
    const geometry = new THREE.BoxGeometry(size, size, size);

    // Three.js box face order: +X, -X, +Y, -Y, +Z, -Z
    // We map: +Z=front=1, -Z=back=2, -X=left=3, +X=right=4, +Y=top=5, -Y=bottom=6
    const faceValues = [4, 3, 5, 6, 1, 2]; // +X, -X, +Y, -Y, +Z, -Z
    const materials = faceValues.map(val => {
      return new THREE.MeshStandardMaterial({
        map: createDieTexture(val),
        roughness: 0.35,
        metalness: 0.05,
        bumpScale: 0.02,
      });
    });

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { dieIndex: index, value: 1 };

    return mesh;
  }

  // ===== TRAY CREATION =====
  function createTray() {
    const group = new THREE.Group();

    // Floor - dark red velvet
    const floorGeo = new THREE.PlaneGeometry(5.5, 4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8b1a1a,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    group.add(floor);

    // Metal frame walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.3,
      metalness: 0.7,
    });
    const wallHeight = 0.6;
    const wallThickness = 0.15;

    // Back wall
    const backGeo = new THREE.BoxGeometry(5.8, wallHeight, wallThickness);
    const backWall = new THREE.Mesh(backGeo, wallMat);
    backWall.position.set(0, wallHeight / 2, -2.07);
    backWall.castShadow = true;
    group.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(backGeo, wallMat);
    frontWall.position.set(0, wallHeight / 2, 2.07);
    frontWall.castShadow = true;
    group.add(frontWall);

    // Left wall
    const sideGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 4.3);
    const leftWall = new THREE.Mesh(sideGeo, wallMat);
    leftWall.position.set(-2.9, wallHeight / 2, 0);
    leftWall.castShadow = true;
    group.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(sideGeo, wallMat);
    rightWall.position.set(2.9, wallHeight / 2, 0);
    rightWall.castShadow = true;
    group.add(rightWall);

    return group;
  }

  // ===== CUP MESH CREATION (Premium Yahtzee Dice Cup) =====
  function createCupMesh() {
    const group = new THREE.Group();

    const cupH = 1.1;    // short — dice visible from above
    const rTop = 1.5;    // wide mouth
    const rBot = 1.05;   // narrower base
    const halfH = cupH / 2;

    // === Outer leather wall ===
    const wallGeo = new THREE.CylinderGeometry(rTop, rBot, cupH, 48, 1, true);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4A1A08,       // deep oxblood leather
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.FrontSide,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = halfH;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // === Inner green felt lining ===
    const innerGeo = new THREE.CylinderGeometry(rTop - 0.04, rBot - 0.04, cupH - 0.04, 48, 1, true);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x1B5E20,       // casino green felt
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.BackSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.y = halfH;
    group.add(inner);

    // === Bottom felt disc ===
    const bottomGeo = new THREE.CircleGeometry(rBot - 0.04, 48);
    const bottomMat = new THREE.MeshStandardMaterial({
      color: 0x145218,       // slightly darker green felt
      roughness: 0.95,
      metalness: 0.0,
    });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.02;
    bottom.receiveShadow = true;
    group.add(bottom);

    // === Outer bottom disc (leather underside) ===
    const outerBottomGeo = new THREE.CircleGeometry(rBot, 48);
    const outerBottomMat = new THREE.MeshStandardMaterial({
      color: 0x3A1205,
      roughness: 0.9,
      metalness: 0.02,
    });
    const outerBottom = new THREE.Mesh(outerBottomGeo, outerBottomMat);
    outerBottom.rotation.x = Math.PI / 2; // face down
    outerBottom.position.y = 0.005;
    group.add(outerBottom);

    // === Polished brass rim (top edge) ===
    const rimGeo = new THREE.TorusGeometry(rTop, 0.06, 12, 48);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xD4A017,       // polished brass
      roughness: 0.2,
      metalness: 0.7,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = cupH;
    rim.castShadow = true;
    group.add(rim);

    // === Brass base ring ===
    const baseRimGeo = new THREE.TorusGeometry(rBot + 0.02, 0.04, 10, 48);
    const baseRimMat = new THREE.MeshStandardMaterial({
      color: 0xB8860B,       // darker brass
      roughness: 0.25,
      metalness: 0.65,
    });
    const baseRim = new THREE.Mesh(baseRimGeo, baseRimMat);
    baseRim.rotation.x = Math.PI / 2;
    baseRim.position.y = 0.04;
    group.add(baseRim);

    // === Decorative brass band (middle) ===
    const bandY = cupH * 0.55;
    const bandR = rBot + (rTop - rBot) * (bandY / cupH); // interpolate radius at band height
    const bandGeo = new THREE.TorusGeometry(bandR, 0.025, 8, 48);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xC5960C,
      roughness: 0.25,
      metalness: 0.6,
    });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = bandY;
    group.add(band);

    // === Leather stitching line near rim ===
    const stitchY = cupH * 0.85;
    const stitchR = rBot + (rTop - rBot) * (stitchY / cupH);
    const stitchGeo = new THREE.TorusGeometry(stitchR + 0.005, 0.012, 6, 48);
    const stitchMat = new THREE.MeshStandardMaterial({
      color: 0x8B7355,       // tan stitching
      roughness: 0.95,
      metalness: 0.0,
    });
    const stitch = new THREE.Mesh(stitchGeo, stitchMat);
    stitch.rotation.x = Math.PI / 2;
    stitch.position.y = stitchY;
    group.add(stitch);

    group.position.set(CUP_POS.x, 0, CUP_POS.z);
    group.visible = false;
    return group;
  }

  // ===== EASING =====
  function easeOutBounce(t) {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      t -= 1.5 / 2.75;
      return 7.5625 * t * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      t -= 2.25 / 2.75;
      return 7.5625 * t * t + 0.9375;
    } else {
      t -= 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ===== INITIALIZATION =====
  window.initYahtzeeThree = function(canvas) {
    if (isInitialized) return;
    if (!canvas || typeof THREE === 'undefined') return;

    computeFaceRotations();

    const container = canvas.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0a0a);

    // Camera
    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 8, 7);
    camera.lookAt(0, 0, 0.3);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 0.9);
    dirLight.position.set(3, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.002;
    scene.add(dirLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xc4d4ff, 0.3);
    fillLight.position.set(-3, 6, -2);
    scene.add(fillLight);

    // Rim point light
    const rimLight = new THREE.PointLight(0xffd700, 0.4, 20);
    rimLight.position.set(0, 3, -3);
    scene.add(rimLight);

    // Tray
    trayGroup = createTray();
    scene.add(trayGroup);

    // Create 5 dice
    diceMeshes = [];
    for (let i = 0; i < 5; i++) {
      const die = createDieMesh(i);
      die.position.set(ROW_X[i], ROW_Y, ROW_Z);
      scene.add(die);
      diceMeshes.push(die);
    }

    // Cup
    cupGroup = createCupMesh();
    scene.add(cupGroup);

    // Raycaster
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // Click/tap handler
    canvas.addEventListener('pointerdown', onCanvasPointer, false);

    // Resize handler
    window.addEventListener('resize', handleYahtzeeResize);

    clock = new THREE.Clock();
    isInitialized = true;
    idleTime = 0;

    // Start render loop
    animate();

    // Notify games.js that Three.js is ready (cup may need to be shown)
    setTimeout(function() {
      if (typeof window.onYahtzeeThreeReady === 'function') {
        window.onYahtzeeThreeReady();
      }
    }, 50);
  };

  // ===== DESTROY =====
  window.destroyYahtzeeThree = function() {
    if (!isInitialized) return;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    // Remove event listeners
    if (renderer && renderer.domElement) {
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointer);
    }
    window.removeEventListener('resize', handleYahtzeeResize);

    // Dispose dice meshes
    diceMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    diceMeshes = [];

    // Dispose tray
    if (trayGroup) {
      trayGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }

    // Dispose cup
    if (cupGroup) {
      cupGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      cupGroup = null;
    }
    if (cupShakeTimer) { clearTimeout(cupShakeTimer); cupShakeTimer = null; }
    cupState = 'hidden';
    cupShakeIntensity = 0;

    if (renderer) {
      renderer.dispose();
      renderer = null;
    }

    scene = null;
    camera = null;
    trayGroup = null;
    isInitialized = false;
    rollAnimations = [];
    settleAnimations = [];
  };

  // ===== RESIZE =====
  function handleYahtzeeResize() {
    if (!isInitialized || !renderer || !camera) return;
    const container = renderer.domElement.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.handleYahtzeeResize = handleYahtzeeResize;

  // ===== CLICK DETECTION =====
  function onCanvasPointer(event) {
    if (!isInitialized || !renderer) return;
    // Don't allow hold toggle during cup animation
    if (cupState !== 'hidden') return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // Only intersect with visible (non-held) dice
    const activeDice = diceMeshes.filter((m, i) => !currentHeld[i] && m.visible);
    const intersects = raycaster.intersectObjects(activeDice);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const idx = hit.userData.dieIndex;
      if (typeof yahToggleHold === 'function') {
        yahToggleHold(idx);
      }
    }
  }

  // ===== MAIN API: updateYahtzeeDice =====
  window.updateYahtzeeDice = function(values, held, shouldAnimate) {
    if (!isInitialized) return;

    currentValues = [...values];
    currentHeld = [...held];

    // During cup dump, start dice roll from cup position
    if (cupState === 'dumping' && shouldAnimate) {
      startRollAnimationFromCup(values, held);
      return;
    }

    // During cup ready/shaking, don't update dice positions (cup animation handles it)
    if (cupState === 'ready' || cupState === 'shaking') {
      return;
    }

    if (shouldAnimate) {
      startRollAnimation(values, held);
    } else {
      // Instant update - place dice at final positions (normal scale on tray)
      for (let i = 0; i < 5; i++) {
        if (held[i]) {
          // Held dice are invisible in 3D (shown in HTML hold bar)
          diceMeshes[i].visible = false;
        } else {
          diceMeshes[i].visible = true;
          diceMeshes[i].position.set(ROW_X[i], ROW_Y, ROW_Z);
          diceMeshes[i].scale.setScalar(DICE_SCALE_NORMAL);
          setDieRotation(i, values[i]);
        }
      }
    }
  };

  // ===== SET DIE TO SHOW VALUE =====
  function setDieRotation(dieIdx, value) {
    const mesh = diceMeshes[dieIdx];
    if (!mesh) return;
    mesh.userData.value = value;
    if (FACE_ROTATIONS[value]) {
      mesh.quaternion.copy(FACE_ROTATIONS[value]);
    }
  }

  // ===== ROLL ANIMATION =====
  function startRollAnimation(values, held) {
    rollAnimations = [];
    settleAnimations = [];

    for (let i = 0; i < 5; i++) {
      if (held[i]) {
        // Held dice stay hidden (in HTML hold bar)
        diceMeshes[i].visible = false;
        animatingDice[i] = false;
        continue;
      }

      animatingDice[i] = true;
      diceMeshes[i].visible = true;

      // Random start position above tray
      const startX = (Math.random() - 0.5) * 3;
      const startY = 3 + Math.random() * 2;
      const startZ = (Math.random() - 0.5) * 2;

      // Random landing position on tray
      const landX = ROW_X[i] + (Math.random() - 0.5) * 0.5;
      const landY = 0.4;
      const landZ = (Math.random() - 0.5) * 1.2;

      // Random rotation velocity
      const rotVelX = (Math.random() - 0.5) * 15;
      const rotVelY = (Math.random() - 0.5) * 15;
      const rotVelZ = (Math.random() - 0.5) * 15;

      diceMeshes[i].position.set(startX, startY, startZ);
      diceMeshes[i].rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      const delay = i * 50; // stagger
      const rollDuration = 800;
      const settleDuration = 350;

      rollAnimations.push({
        dieIdx: i,
        startPos: new THREE.Vector3(startX, startY, startZ),
        landPos: new THREE.Vector3(landX, landY, landZ),
        rotVel: new THREE.Vector3(rotVelX, rotVelY, rotVelZ),
        startTime: clock.getElapsedTime() + delay / 1000,
        duration: rollDuration / 1000,
        targetValue: values[i],
        phase: 'rolling', // 'rolling' → 'settling' → 'done'
        settleDuration: settleDuration / 1000,
        settleStartTime: 0,
      });
    }
  }

  // ===== ROLL ANIMATION FROM CUP (dice spill from cup position) =====
  function startRollAnimationFromCup(values, held) {
    rollAnimations = [];
    settleAnimations = [];

    for (let i = 0; i < 5; i++) {
      if (held[i]) {
        diceMeshes[i].visible = false;
        animatingDice[i] = false;
        continue;
      }

      animatingDice[i] = true;
      diceMeshes[i].visible = true;

      // Start from near cup area
      const startX = CUP_POS.x + cupDiceOX[i] + (Math.random() - 0.5) * 0.5;
      const startY = 2.0 + Math.random() * 1.5;
      const startZ = CUP_POS.z + cupDiceOZ[i] + 0.5 + Math.random() * 0.5;

      const landX = ROW_X[i] + (Math.random() - 0.5) * 0.5;
      const landY = 0.4;
      const landZ = (Math.random() - 0.5) * 1.2 + 0.3;

      const rotVelX = (Math.random() - 0.5) * 18;
      const rotVelY = (Math.random() - 0.5) * 18;
      const rotVelZ = (Math.random() - 0.5) * 18;

      diceMeshes[i].position.set(startX, startY, startZ);
      diceMeshes[i].rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      const delay = i * 40;
      const rollDuration = 700;
      const settleDuration = 350;

      rollAnimations.push({
        dieIdx: i,
        startPos: new THREE.Vector3(startX, startY, startZ),
        landPos: new THREE.Vector3(landX, landY, landZ),
        rotVel: new THREE.Vector3(rotVelX, rotVelY, rotVelZ),
        startTime: clock.getElapsedTime() + delay / 1000,
        duration: rollDuration / 1000,
        targetValue: values[i],
        phase: 'rolling',
        settleDuration: settleDuration / 1000,
        settleStartTime: 0,
      });
    }
  }

  // ===== CUP ANIMATION =====
  function animateCup(elapsed) {
    if (!cupGroup || cupState === 'hidden') return;

    if (cupState === 'ready') {
      // Gentle idle breathing — never below y=0
      cupGroup.position.y = Math.abs(Math.sin(elapsed * 2)) * 0.02;
      cupGroup.rotation.x = 0;
      cupGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.01;

      // Position dice inside cup with slight idle wobble
      for (let i = 0; i < 5; i++) {
        if (cupReadyHeld[i]) {
          diceMeshes[i].visible = false;
          continue;
        }
        diceMeshes[i].visible = true;
        const scatter = CUP_SCATTER[i];
        diceMeshes[i].position.set(
          CUP_POS.x + scatter.x + Math.sin(elapsed * 1.2 + i) * 0.02,
          CUP_DICE_Y + Math.sin(elapsed * 1.8 + i * 0.7) * 0.01,
          CUP_POS.z + scatter.z + Math.cos(elapsed * 1.4 + i) * 0.02
        );
        // Gentle random-looking rotation
        diceMeshes[i].rotation.set(
          Math.sin(elapsed * 0.5 + i) * 0.1,
          elapsed * 0.2 + i,
          Math.cos(elapsed * 0.4 + i) * 0.1
        );
      }
    }

    else if (cupState === 'shaking') {
      const intensity = cupShakeIntensity;
      // Cup oscillation — vigorous shake
      const shakeX = Math.sin(elapsed * 30) * 0.15 * intensity;
      const shakeZ = Math.cos(elapsed * 35) * 0.12 * intensity;
      const shakeY = Math.abs(Math.sin(elapsed * 20)) * 0.25 * intensity;

      cupGroup.position.x = CUP_POS.x + shakeX;
      cupGroup.position.y = 0.3 + shakeY; // base lift to prevent floor clipping
      cupGroup.position.z = CUP_POS.z + shakeZ;
      cupGroup.rotation.x = Math.sin(elapsed * 25) * 0.1 * intensity;
      cupGroup.rotation.z = Math.cos(elapsed * 28) * 0.08 * intensity;

      // Dice physics inside cup — strong forces, low damping
      const dt = 0.016;
      const boundaryR = CUP_PHYSICS_R;
      for (let i = 0; i < 5; i++) {
        if (cupReadyHeld[i]) {
          diceMeshes[i].visible = false;
          continue;
        }
        diceMeshes[i].visible = true;

        // Strong random impulses + cup shake transfer force
        const shakeForceX = Math.sin(elapsed * 30) * 40 * intensity * dt;
        const shakeForceZ = Math.cos(elapsed * 35) * 40 * intensity * dt;
        cupDiceVX[i] += (Math.random() - 0.5) * 60 * intensity * dt + shakeForceX * (Math.random() - 0.5);
        cupDiceVZ[i] += (Math.random() - 0.5) * 60 * intensity * dt + shakeForceZ * (Math.random() - 0.5);
        // Lower damping = dice slide further
        cupDiceVX[i] *= 0.85;
        cupDiceVZ[i] *= 0.85;
        cupDiceOX[i] += cupDiceVX[i] * dt;
        cupDiceOZ[i] += cupDiceVZ[i] * dt;

        // Circular boundary — bounce off walls with energy
        const dist = Math.sqrt(cupDiceOX[i] * cupDiceOX[i] + cupDiceOZ[i] * cupDiceOZ[i]);
        if (dist > boundaryR) {
          const nx = cupDiceOX[i] / dist;
          const nz = cupDiceOZ[i] / dist;
          cupDiceOX[i] = nx * boundaryR * 0.95;
          cupDiceOZ[i] = nz * boundaryR * 0.95;
          // Reflect velocity + add random kick on bounce
          const dotP = cupDiceVX[i] * nx + cupDiceVZ[i] * nz;
          cupDiceVX[i] -= 2.2 * dotP * nx;
          cupDiceVZ[i] -= 2.2 * dotP * nz;
          cupDiceVX[i] += (Math.random() - 0.5) * 3 * intensity;
          cupDiceVZ[i] += (Math.random() - 0.5) * 3 * intensity;
        }

        // Y-axis: dice bounce up and down vigorously inside cup
        const bouncePhase = elapsed * 18 + i * 2.3;
        const bounceH = Math.abs(Math.sin(bouncePhase)) * 0.4 * intensity;
        // Extra random hop on strong shakes
        const hop = intensity > 0.6 ? Math.abs(Math.sin(elapsed * 40 + i * 3.7)) * 0.2 * intensity : 0;

        diceMeshes[i].position.set(
          CUP_POS.x + shakeX + cupDiceOX[i],
          0.3 + CUP_DICE_Y + bounceH + hop,
          CUP_POS.z + shakeZ + cupDiceOZ[i]
        );
        // Guaranteed base spin per die (each die spins a unique direction)
        const spinDir = (i % 2 === 0) ? 1 : -1;
        const spinSpeed = (6 + i * 1.5) * intensity;
        diceMeshes[i].rotation.x += spinDir * spinSpeed * dt;
        diceMeshes[i].rotation.z += -spinDir * (5 + i * 1.2) * intensity * dt;
        // Random tumble on top for chaotic feel
        diceMeshes[i].rotation.x += (Math.random() - 0.5) * 0.4 * intensity;
        diceMeshes[i].rotation.y += (Math.random() - 0.5) * 0.3 * intensity;
        diceMeshes[i].rotation.z += (Math.random() - 0.5) * 0.4 * intensity;
      }
    }

    else if (cupState === 'dumping') {
      const t = (elapsed - cupDumpStartTime) / CUP_DUMP_DURATION;

      if (t >= 1) {
        cupGroup.visible = false;
        cupState = 'hidden';
        cupGroup.rotation.set(0, 0, 0);
        cupGroup.position.set(CUP_POS.x, 0, CUP_POS.z);
        return;
      }

      // Fire callback at 30%
      if (t >= 0.3 && !cupDumpCallbackFired) {
        cupDumpCallbackFired = true;
        if (cupDumpCallback) cupDumpCallback();
      }

      // Cup lifts UP then tips to pour dice downward — never goes below y=0
      const et = easeOutCubic(t);

      // Phase 1 (0~0.3): lift straight up
      // Phase 2 (0.3~0.7): tilt forward to pour
      // Phase 3 (0.7~1.0): move away and fade out
      if (t < 0.3) {
        // Lift up
        const liftT = t / 0.3;
        const liftEt = easeOutCubic(liftT);
        cupGroup.position.y = liftEt * 3.0;
        cupGroup.position.z = CUP_POS.z;
        cupGroup.rotation.x = 0;
      } else if (t < 0.7) {
        // Tip forward (pour dice out)
        const pourT = (t - 0.3) / 0.4;
        const pourEt = easeOutCubic(pourT);
        cupGroup.position.y = 3.0 - pourEt * 0.5; // slight dip
        cupGroup.position.z = CUP_POS.z - pourEt * 0.8;
        cupGroup.rotation.x = pourEt * Math.PI * 0.55; // tilt ~100°
      } else {
        // Move away upward
        const exitT = (t - 0.7) / 0.3;
        const exitEt = easeOutCubic(exitT);
        cupGroup.position.y = 2.5 + exitEt * 2.0;
        cupGroup.position.z = CUP_POS.z - 0.8 - exitEt * 0.5;
        cupGroup.rotation.x = Math.PI * 0.55;
      }

      // Before callback fires, dice lift with cup then fall
      if (t < 0.3) {
        const liftT = t / 0.3;
        const liftEt = easeOutCubic(liftT);
        for (let i = 0; i < 5; i++) {
          if (cupReadyHeld[i]) continue;
          diceMeshes[i].position.set(
            CUP_POS.x + cupDiceOX[i],
            CUP_DICE_Y + liftEt * 3.0,
            CUP_POS.z + cupDiceOZ[i]
          );
        }
      }
      // After callback (t>=0.3), roll animation takes over dice positions
    }
  }

  // ===== ANIMATE =====
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isInitialized || !renderer || !scene || !camera) return;

    const elapsed = clock.getElapsedTime();
    idleTime = elapsed;

    // Cup animation (may fire dump callback which adds rollAnimations)
    animateCup(elapsed);

    // Process roll animations
    for (let i = rollAnimations.length - 1; i >= 0; i--) {
      const anim = rollAnimations[i];
      const mesh = diceMeshes[anim.dieIdx];

      if (anim.phase === 'rolling') {
        const t = (elapsed - anim.startTime) / anim.duration;

        if (t < 0) continue; // waiting for stagger delay

        if (t >= 1) {
          // Rolling done — pick nearest valid rotation for natural settle
          anim.phase = 'settling';
          anim.settleStartTime = elapsed;
          anim.settleQuat = findNearestFaceQuat(mesh.quaternion, anim.targetValue);
          mesh.position.copy(anim.landPos);
          continue;
        }

        // Scale up from small (cup) to normal during roll
        const scaleT = Math.min(t * 2, 1); // scale up in first half
        mesh.scale.setScalar(DICE_SCALE_SMALL + (DICE_SCALE_NORMAL - DICE_SCALE_SMALL) * scaleT);

        // Position: lerp with bounce
        const et = easeOutBounce(Math.min(t, 1));
        mesh.position.lerpVectors(anim.startPos, anim.landPos, et);

        // Rotation: spin with deceleration
        const rotSpeed = 1 - t * 0.7;
        mesh.rotation.x += anim.rotVel.x * 0.016 * rotSpeed;
        mesh.rotation.y += anim.rotVel.y * 0.016 * rotSpeed;
        mesh.rotation.z += anim.rotVel.z * 0.016 * rotSpeed;

        // Last 30% of roll: gently guide toward nearest target rotation
        if (t > 0.7) {
          const guideT = (t - 0.7) / 0.3; // 0→1
          const guideQuat = findNearestFaceQuat(mesh.quaternion, anim.targetValue);
          mesh.quaternion.slerp(guideQuat, guideT * 0.15); // very subtle pull
        }

      } else if (anim.phase === 'settling') {
        const st = (elapsed - anim.settleStartTime) / anim.settleDuration;

        if (st >= 1) {
          // Done settling - set final position and rotation at normal scale
          mesh.position.set(ROW_X[anim.dieIdx], ROW_Y, ROW_Z);
          mesh.scale.setScalar(DICE_SCALE_NORMAL);
          mesh.quaternion.copy(anim.settleQuat || FACE_ROTATIONS[anim.targetValue]);
          mesh.userData.value = anim.targetValue;
          animatingDice[anim.dieIdx] = false;
          rollAnimations.splice(i, 1);
          continue;
        }

        // Ensure normal scale during settle
        mesh.scale.setScalar(DICE_SCALE_NORMAL);

        // Smooth transition to row position
        const et = easeOutCubic(st);
        const target = new THREE.Vector3(ROW_X[anim.dieIdx], ROW_Y, ROW_Z);
        mesh.position.lerp(target, et);

        // Slerp to nearest valid rotation (minimal rotation path)
        if (anim.settleQuat) {
          mesh.quaternion.slerp(anim.settleQuat, et);
        }
      }
    }

    // Idle animation for non-animating, visible dice (only when cup is hidden)
    if (cupState === 'hidden') {
      for (let i = 0; i < 5; i++) {
        if (!animatingDice[i] && diceMeshes[i] && diceMeshes[i].visible) {
          // Subtle float
          diceMeshes[i].position.y = ROW_Y + Math.sin(idleTime * 1.5 + i * 1.2) * 0.015;
        }
      }
    }

    // Subtle camera sway
    if (camera) {
      camera.position.x = Math.sin(idleTime * 0.3) * 0.08;
    }

    renderer.render(scene, camera);
  }

  // ===== CUP API (exported) =====
  window.showCupReady = function(held) {
    if (!isInitialized || !cupGroup) return;

    cupReadyHeld = held ? [...held] : [false, false, false, false, false];
    cupState = 'ready';
    cupShakeIntensity = 0;
    cupDumpCallbackFired = false;
    cupDumpCallback = null;
    cupGroup.visible = true;
    cupGroup.rotation.set(0, 0, 0);
    cupGroup.position.set(CUP_POS.x, 0, CUP_POS.z);

    // Reset dice offsets to scattered positions + small scale inside cup
    for (let i = 0; i < 5; i++) {
      cupDiceOX[i] = CUP_SCATTER[i].x;
      cupDiceOZ[i] = CUP_SCATTER[i].z;
      cupDiceVX[i] = 0;
      cupDiceVZ[i] = 0;
      cupDiceRVX[i] = 0;
      cupDiceRVY[i] = 0;
      cupDiceRVZ[i] = 0;
      diceMeshes[i].scale.setScalar(DICE_SCALE_SMALL);
    }

    // Cancel any pending roll animations
    rollAnimations = [];
    for (let i = 0; i < 5; i++) animatingDice[i] = false;
  };

  window.startCupShake = function(callback) {
    if (!isInitialized || !cupGroup) return;
    if (cupState === 'hidden' || cupState === 'dumping') return;

    if (cupState === 'ready') {
      cupState = 'shaking';
      cupShakeIntensity = 0.6;
      cupDumpCallback = callback;
    } else if (cupState === 'shaking') {
      cupShakeIntensity = Math.min(cupShakeIntensity + 0.25, 1.0);
    }

    // Reset auto-dump timer
    if (cupShakeTimer) clearTimeout(cupShakeTimer);
    cupShakeTimer = setTimeout(function() {
      if (cupState === 'shaking') {
        beginCupDump();
      }
    }, CUP_SHAKE_TIMEOUT);
  };

  function beginCupDump() {
    cupState = 'dumping';
    cupDumpStartTime = clock ? clock.getElapsedTime() : 0;
    cupDumpCallbackFired = false;
    if (cupShakeTimer) { clearTimeout(cupShakeTimer); cupShakeTimer = null; }
  }

  window.hideCup = function() {
    if (!isInitialized) return;
    if (cupShakeTimer) { clearTimeout(cupShakeTimer); cupShakeTimer = null; }
    cupState = 'hidden';
    if (cupGroup) {
      cupGroup.visible = false;
      cupGroup.rotation.set(0, 0, 0);
      cupGroup.position.set(CUP_POS.x, 0, CUP_POS.z);
    }
  };

  window.getCupState = function() {
    return cupState;
  };

})();

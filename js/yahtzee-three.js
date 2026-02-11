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
  const ROW_Y = 0.5;
  const ROW_Z = 0.8;

  // Animation state
  let rollAnimations = [];
  let settleAnimations = [];
  let idleTime = 0;

  // Raycaster for click detection
  let raycaster, pointer;

  // Face rotation map: quaternions that show each face up
  const FACE_ROTATIONS = {};

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
    const size = 0.78;
    const geometry = new THREE.BoxGeometry(size, size, size);

    // Round edges slightly with bevel (we'll use standard box + materials)
    // Create 6 face materials (one per face)
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

    // Dispose meshes
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

    if (shouldAnimate) {
      startRollAnimation(values, held);
    } else {
      // Instant update - place dice at final positions
      for (let i = 0; i < 5; i++) {
        if (held[i]) {
          // Held dice are invisible in 3D (shown in HTML hold bar)
          diceMeshes[i].visible = false;
        } else {
          diceMeshes[i].visible = true;
          diceMeshes[i].position.set(ROW_X[i], ROW_Y, ROW_Z);
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

  // ===== ANIMATE =====
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isInitialized || !renderer || !scene || !camera) return;

    const elapsed = clock.getElapsedTime();
    idleTime = elapsed;

    // Process roll animations
    for (let i = rollAnimations.length - 1; i >= 0; i--) {
      const anim = rollAnimations[i];
      const mesh = diceMeshes[anim.dieIdx];

      if (anim.phase === 'rolling') {
        const t = (elapsed - anim.startTime) / anim.duration;

        if (t < 0) continue; // waiting for stagger delay

        if (t >= 1) {
          // Rolling done, transition to settling (line up)
          anim.phase = 'settling';
          anim.settleStartTime = elapsed;
          mesh.position.copy(anim.landPos);
          continue;
        }

        // Position: lerp with bounce
        const et = easeOutBounce(Math.min(t, 1));
        mesh.position.lerpVectors(anim.startPos, anim.landPos, et);

        // Rotation: spin with deceleration
        const rotSpeed = 1 - t * 0.7;
        mesh.rotation.x += anim.rotVel.x * 0.016 * rotSpeed;
        mesh.rotation.y += anim.rotVel.y * 0.016 * rotSpeed;
        mesh.rotation.z += anim.rotVel.z * 0.016 * rotSpeed;

      } else if (anim.phase === 'settling') {
        const st = (elapsed - anim.settleStartTime) / anim.settleDuration;

        if (st >= 1) {
          // Done settling - set final position and rotation
          mesh.position.set(ROW_X[anim.dieIdx], ROW_Y, ROW_Z);
          setDieRotation(anim.dieIdx, anim.targetValue);
          animatingDice[anim.dieIdx] = false;
          rollAnimations.splice(i, 1);
          continue;
        }

        // Smooth transition to row position
        const et = easeOutCubic(st);
        const target = new THREE.Vector3(ROW_X[anim.dieIdx], ROW_Y, ROW_Z);
        mesh.position.lerp(target, et);

        // Slerp rotation toward face-showing rotation
        if (FACE_ROTATIONS[anim.targetValue]) {
          mesh.quaternion.slerp(FACE_ROTATIONS[anim.targetValue], et);
        }
      }
    }

    // Idle animation for non-animating, visible dice
    for (let i = 0; i < 5; i++) {
      if (!animatingDice[i] && diceMeshes[i] && diceMeshes[i].visible) {
        // Subtle float
        diceMeshes[i].position.y = ROW_Y + Math.sin(idleTime * 1.5 + i * 1.2) * 0.015;
      }
    }

    // Subtle camera sway
    if (camera) {
      camera.position.x = Math.sin(idleTime * 0.3) * 0.08;
    }

    renderer.render(scene, camera);
  }

})();

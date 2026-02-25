// ===== 팟플 아이돌 — 2-DICE THREE.JS SYSTEM =====
// Based on yahtzee-three.js, simplified for 2-dice rolling animation

(function () {
  'use strict';

  let scene, camera, renderer, rafId;
  let diceMeshes = [];
  let trayGroup;
  let isInitialized = false;
  let clock;

  // 2-dice positions (side by side, centred)
  const DICE_X = [-0.65, 0.65];
  const DICE_Y = 0.35;
  const DICE_Z = 0.3;
  const DICE_SCALE = 1.5;

  let rollAnimations = [];
  let rollInProgress = false;
  let rollCallback = null;
  let callbackFired = false;

  // Face rotation quaternions & Y-axis variants (same mapping as yahtzee-three.js)
  const FACE_ROTATIONS = {};
  const FACE_ROTATIONS_ALL = {};

  function computeFaceRotations() {
    FACE_ROTATIONS[1] = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    FACE_ROTATIONS[2] = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    FACE_ROTATIONS[3] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
    FACE_ROTATIONS[4] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    FACE_ROTATIONS[5] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    FACE_ROTATIONS[6] = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    const yRots = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (let v = 1; v <= 6; v++) {
      FACE_ROTATIONS_ALL[v] = yRots.map(function (yAngle) {
        const yQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yAngle);
        return new THREE.Quaternion().copy(FACE_ROTATIONS[v]).premultiply(yQ);
      });
    }
  }

  function findNearestFaceQuat(curQ, value) {
    const variants = FACE_ROTATIONS_ALL[value];
    if (!variants) return FACE_ROTATIONS[value];
    let best = variants[0], bestDot = -1;
    for (let i = 0; i < variants.length; i++) {
      const d = Math.abs(curQ.dot(variants[i]));
      if (d > bestDot) { bestDot = d; best = variants[i]; }
    }
    return best;
  }

  // ── Texture ──────────────────────────────────────────────────────────────
  function getPipPositions(value, size) {
    const q1 = size * 0.27, q2 = size * 0.5, q3 = size * 0.73;
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

  function createDieTexture(value) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#fffff5');
    grad.addColorStop(1, '#f0ead6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,150,100,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 20);
    ctx.stroke();
    getPipPositions(value, size).forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#2c2c2c';
      ctx.fill();
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  // ── Mesh ─────────────────────────────────────────────────────────────────
  function createDieMesh(index) {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const faceValues = [4, 3, 5, 6, 1, 2]; // +X,-X,+Y,-Y,+Z,-Z
    const mats = faceValues.map(v => new THREE.MeshStandardMaterial({
      map: createDieTexture(v),
      roughness: 0.35,
      metalness: 0.05,
    }));
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.dieIndex = index;
    return mesh;
  }

  function createTray() {
    const g = new THREE.Group();
    // Floor — dark red velvet
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 3),
      new THREE.MeshStandardMaterial({ color: 0x6b1414, roughness: 0.85, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    g.add(floor);
    // Brass rim walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.3, metalness: 0.7 });
    const wh = 0.5, wt = 0.12;
    const walls = [
      { geo: new THREE.BoxGeometry(4.3, wh, wt), pos: [0, wh / 2, -1.55] },
      { geo: new THREE.BoxGeometry(4.3, wh, wt), pos: [0, wh / 2, 1.55] },
      { geo: new THREE.BoxGeometry(wt, wh, 3.2), pos: [-2.15, wh / 2, 0] },
      { geo: new THREE.BoxGeometry(wt, wh, 3.2), pos: [2.15, wh / 2, 0] },
    ];
    walls.forEach(({ geo, pos }) => {
      const w = new THREE.Mesh(geo, wallMat);
      w.position.set(...pos);
      w.castShadow = true;
      g.add(w);
    });
    return g;
  }

  // ── Easing ────────────────────────────────────────────────────────────────
  function easeOutBounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    else if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    else if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    else { t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; }
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ── Init / Destroy ────────────────────────────────────────────────────────
  window.initIdolDiceThree = function (canvas) {
    if (isInitialized) return;
    if (!canvas || typeof THREE === 'undefined') return;

    computeFaceRotations();

    const cont = canvas.parentElement;
    const w = cont ? cont.clientWidth || 320 : 320;
    const h = cont ? cont.clientHeight || 200 : 200;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d1a);

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0.2);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff8e7, 1.0);
    dir.position.set(2, 8, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.width = dir.shadow.mapSize.height = 512;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 20;
    dir.shadow.camera.left = dir.shadow.camera.bottom = -4;
    dir.shadow.camera.right = dir.shadow.camera.top = 4;
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xc4d4ff, 0.35);
    fill.position.set(-2, 5, -2);
    scene.add(fill);
    const rim = new THREE.PointLight(0xffd700, 0.4, 20);
    rim.position.set(0, 3, -2);
    scene.add(rim);

    trayGroup = createTray();
    scene.add(trayGroup);

    diceMeshes = [];
    for (let i = 0; i < 2; i++) {
      const d = createDieMesh(i);
      d.position.set(DICE_X[i], DICE_Y, DICE_Z);
      d.scale.setScalar(DICE_SCALE);
      scene.add(d);
      diceMeshes.push(d);
    }

    clock = new THREE.Clock();
    isInitialized = true;
    rollInProgress = false;
    callbackFired = true; // prevent accidental fire before first roll
    animate();
  };

  window.destroyIdolDiceThree = function () {
    if (!isInitialized) return;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    diceMeshes.forEach(m => {
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); });
    });
    if (trayGroup) trayGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    diceMeshes = [];
    scene = camera = trayGroup = null;
    isInitialized = false;
    rollAnimations = [];
    rollCallback = null;
    rollInProgress = false;
  };

  window.handleIdolDiceResize = function () {
    if (!isInitialized || !renderer || !camera) return;
    const cont = renderer.domElement.parentElement;
    if (!cont) return;
    const w = cont.clientWidth, h = cont.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  // ── Roll API ──────────────────────────────────────────────────────────────
  window.idolDiceThreeRoll = function (d1, d2, callback) {
    if (!isInitialized) { if (callback) setTimeout(callback, 50); return; }

    rollCallback = callback;
    callbackFired = false;
    rollInProgress = true;
    rollAnimations = [];

    const values = [d1, d2];
    const elapsed = clock.getElapsedTime();
    for (let i = 0; i < 2; i++) {
      const sx = (Math.random() - 0.5) * 2.5;
      const sy = 3.5 + Math.random() * 1.5;
      const sz = (Math.random() - 0.5) * 1.5;
      diceMeshes[i].visible = true;
      diceMeshes[i].position.set(sx, sy, sz);
      diceMeshes[i].scale.setScalar(DICE_SCALE);
      diceMeshes[i].rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      rollAnimations.push({
        dieIdx: i,
        startPos: new THREE.Vector3(sx, sy, sz),
        landPos: new THREE.Vector3(DICE_X[i], DICE_Y, DICE_Z),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18
        ),
        startTime: elapsed + i * 0.08, // stagger
        duration: 0.95,
        targetValue: values[i],
        phase: 'rolling',
        settleDuration: 0.38,
        settleStartTime: 0,
        settleQuat: null,
      });
    }
  };

  // ── Animate ────────────────────────────────────────────────────────────────
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isInitialized || !renderer || !scene || !camera) return;

    const elapsed = clock.getElapsedTime();

    for (let i = rollAnimations.length - 1; i >= 0; i--) {
      const anim = rollAnimations[i];
      const mesh = diceMeshes[anim.dieIdx];

      if (anim.phase === 'rolling') {
        const t = (elapsed - anim.startTime) / anim.duration;
        if (t < 0) continue;

        if (t >= 1) {
          anim.phase = 'settling';
          anim.settleStartTime = elapsed;
          anim.settleQuat = findNearestFaceQuat(mesh.quaternion, anim.targetValue);
          mesh.position.copy(anim.landPos);
          continue;
        }

        const et = easeOutBounce(Math.min(t, 1));
        mesh.position.lerpVectors(anim.startPos, anim.landPos, et);
        const rotSpeed = 1 - t * 0.7;
        mesh.rotation.x += anim.rotVel.x * 0.016 * rotSpeed;
        mesh.rotation.y += anim.rotVel.y * 0.016 * rotSpeed;
        mesh.rotation.z += anim.rotVel.z * 0.016 * rotSpeed;
        if (t > 0.7) {
          const guideT = (t - 0.7) / 0.3;
          mesh.quaternion.slerp(findNearestFaceQuat(mesh.quaternion, anim.targetValue), guideT * 0.15);
        }

      } else if (anim.phase === 'settling') {
        const st = (elapsed - anim.settleStartTime) / anim.settleDuration;
        if (st >= 1) {
          mesh.position.set(DICE_X[anim.dieIdx], DICE_Y, DICE_Z);
          mesh.scale.setScalar(DICE_SCALE);
          mesh.quaternion.copy(anim.settleQuat || FACE_ROTATIONS[anim.targetValue]);
          mesh.userData.value = anim.targetValue;
          rollAnimations.splice(i, 1);
          continue;
        }
        const et = easeOutCubic(st);
        mesh.position.lerp(new THREE.Vector3(DICE_X[anim.dieIdx], DICE_Y, DICE_Z), et);
        if (anim.settleQuat) mesh.quaternion.slerp(anim.settleQuat, et);
      }
    }

    // All animations done → fire callback
    if (rollInProgress && rollAnimations.length === 0 && !callbackFired) {
      callbackFired = true;
      rollInProgress = false;
      const cb = rollCallback;
      rollCallback = null;
      if (cb) setTimeout(cb, 450); // brief pause after settle
    }

    // Idle float when no roll
    if (!rollInProgress) {
      for (let i = 0; i < 2; i++) {
        if (diceMeshes[i] && diceMeshes[i].visible) {
          diceMeshes[i].position.y = DICE_Y + Math.sin(elapsed * 1.5 + i * 1.3) * 0.015;
        }
      }
    }

    // Subtle camera sway
    if (camera) camera.position.x = Math.sin(elapsed * 0.3) * 0.04;

    renderer.render(scene, camera);
  }

})();

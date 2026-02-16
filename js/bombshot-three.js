// =============================================
// BOMB SHOT BLUFF — Three.js 3D Scene v4
// Premium 3D Roulette, Ball Physics, Dynamic Mixing
// =============================================
(function() {
  'use strict';

  var scene, camera, renderer, clock, rafId;
  var isInitialized = false;

  // Scene objects
  var glassGroup, liquidMesh, foamMesh;
  var bartenderGroup, headGroup, bodyMesh, bowTieGroup;
  var eyeL, eyeR, pupilL, pupilR, browL, browR;
  var handL, handR;
  var armUpperL, armUpperR, armLowerL, armLowerR;
  var shoulderLPos, shoulderRPos;
  var handLPos, handRPos;
  var handLRest, handRRest;

  // Particles
  var bubbles = [];
  var bubbleGeo, bubbleMat;
  var flyingCards = [];
  var bokehParticles = [];

  // Roulette
  var rouletteGroup = null;
  var rouletteWheel = null;
  var rouletteBall = null;
  var roulettePointer = null;
  var rouletteSpotlight = null;
  var rouletteState = 'hidden'; // hidden, entering, visible, spinning, exiting
  var rouletteEnterTime = 0;
  var rouletteExitTime = 0;
  var rouletteSpinTime = 0;
  var rouletteSpinDuration = 5.5;
  var rouletteTargetSlot = 0;
  var rouletteSlots = null; // array of {type, label} objects
  var rouletteDiscGroup = null;
  var rouletteDividers = [];
  var rouletteBallSparks = [];
  var rouletteBaseAngle = 0;

  // Camera
  var camState = 'bar'; // bar, to-roulette, roulette, to-bar
  var camTransTime = 0;
  var camTransDuration = 1.1;
  var barCamPos, barCamLook, rouletteCamPos, rouletteCamLook;
  var camStartPos, camStartLook, camEndPos, camEndLook;

  // Lights
  var warmLight = null;

  // State
  var liquidLevel = 0, targetLiquidLevel = 0;
  var drinkColor, animState = 'idle', animTime = 0;
  var idleVariant = 0, idleSwitchTimer = 0;
  var mixCallback = null, armTimer = null;

  // Bartender reaction
  var btReaction = 'none'; // none, safe, hit
  var btReactionTime = 0;

  // Constants — glass shrunk
  var GLASS_R = 0.25, GLASS_H = 0.85, BAR_Y = 0.55, GLASS_Y, LIQUID_MAX;
  var BT_Z = -0.6, BODY_Y, HEAD_Y;
  var ARM_UPPER_LEN = 0.35, ARM_LOWER_LEN = 0.38;
  var ROULETTE_Y;

  var DRINK_COLORS = { beer: 0xf5a623, soju: 0xd4f5e9, liquor: 0xc0792a };

  // Shared materials
  var matWhite, matVest, matSkin, matShirt;

  function initConstants() {
    GLASS_Y = BAR_Y + 0.08;
    LIQUID_MAX = GLASS_H * 0.82;
    BODY_Y = BAR_Y + 0.55;
    HEAD_Y = BODY_Y + 0.72;
    ROULETTE_Y = BAR_Y + 0.08;
    shoulderLPos = new THREE.Vector3(-0.52, BODY_Y + 0.28, BT_Z + 0.05);
    shoulderRPos = new THREE.Vector3(0.52, BODY_Y + 0.28, BT_Z + 0.05);
    handLRest = new THREE.Vector3(-0.55, BAR_Y + 0.18, 0.1);
    handRRest = new THREE.Vector3(0.55, BAR_Y + 0.18, 0.1);
    handLPos = handLRest.clone();
    handRPos = handRRest.clone();

    barCamPos = new THREE.Vector3(0, 2.5, 3.2);
    barCamLook = new THREE.Vector3(0, 1.1, -0.2);
    rouletteCamPos = new THREE.Vector3(0.3, 2.8, 1.8);
    rouletteCamLook = new THREE.Vector3(0, BAR_Y + 0.18, 0.15);
  }

  function initMaterials() {
    matWhite = new THREE.MeshPhongMaterial({ color: 0xfefefe, shininess: 50 });
    matVest = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 35, specular: 0x222244 });
    matSkin = new THREE.MeshPhongMaterial({ color: 0xffdcb0, shininess: 15 });
    matShirt = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 25 });
    drinkColor = new THREE.Color(0xf5a623);
  }

  // ===== SMOOTHSTEP =====
  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  // ===== BAR =====
  function createBar() {
    var g = new THREE.Group();
    var topGeo = new THREE.BoxGeometry(5.5, 0.12, 3.2);
    var topMat = new THREE.MeshPhongMaterial({ color: 0x3a2215, shininess: 45, specular: 0x332211 });
    var top = new THREE.Mesh(topGeo, topMat);
    top.position.y = BAR_Y;
    top.receiveShadow = true;
    g.add(top);
    var edgeMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100, specular: 0xffd700 });
    var edge = new THREE.Mesh(new THREE.BoxGeometry(5.55, 0.035, 0.06), edgeMat);
    edge.position.set(0, BAR_Y + 0.065, 1.6);
    g.add(edge);
    scene.add(g);
  }

  // ===== GLASS (smaller) =====
  function createGlass() {
    glassGroup = new THREE.Group();
    var gMat = new THREE.MeshPhongMaterial({
      color: 0xddeeff, transparent: true, opacity: 0.18,
      shininess: 150, specular: 0xaaddff, side: THREE.DoubleSide, depthWrite: false
    });
    var gMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R, GLASS_R * 0.82, GLASS_H, 32, 1, true), gMat);
    gMesh.position.y = GLASS_H / 2;
    glassGroup.add(gMesh);
    var bMat = new THREE.MeshPhongMaterial({ color: 0xbbccdd, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    var bMesh = new THREE.Mesh(new THREE.CircleGeometry(GLASS_R * 0.82, 32), bMat);
    bMesh.rotation.x = -Math.PI / 2; bMesh.position.y = 0.01;
    glassGroup.add(bMesh);
    var rMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, shininess: 200, specular: 0xffffff
    });
    var rim = new THREE.Mesh(new THREE.TorusGeometry(GLASS_R, 0.02, 12, 32), rMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = GLASS_H;
    glassGroup.add(rim);
    var sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    var streak = new THREE.Mesh(new THREE.PlaneGeometry(0.04, GLASS_H * 0.6), sMat);
    streak.position.set(GLASS_R * 0.65, GLASS_H * 0.5, GLASS_R * 0.3); streak.rotation.y = 0.3;
    glassGroup.add(streak);

    glassGroup.position.set(0.6, GLASS_Y, 0.3);
    scene.add(glassGroup);
  }

  // ===== LIQUID + FOAM (children of glassGroup for sync) =====
  function createLiquid() {
    var mat = new THREE.MeshPhongMaterial({
      color: drinkColor, transparent: true, opacity: 0.85,
      shininess: 70, emissive: drinkColor, emissiveIntensity: 0.15
    });
    liquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R * 0.76, GLASS_R * 0.72, 0.01, 24, 1, false), mat);
    liquidMesh.position.set(0, 0, 0);
    liquidMesh.visible = false;
    glassGroup.add(liquidMesh);

    var fMat = new THREE.MeshPhongMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.6, shininess: 10 });
    foamMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R * 0.74, GLASS_R * 0.76, 0.04, 24), fMat);
    foamMesh.visible = false;
    glassGroup.add(foamMesh);
  }

  function updateLiquid(dt) {
    liquidLevel += (targetLiquidLevel - liquidLevel) * Math.min(dt * 3, 1);
    if (liquidLevel < 0.005) { liquidMesh.visible = false; foamMesh.visible = false; return; }
    liquidMesh.visible = true;
    var h = Math.max(0.04, liquidLevel * LIQUID_MAX);
    liquidMesh.scale.set(1, h / 0.01, 1);
    liquidMesh.position.y = h / 2;
    foamMesh.visible = liquidLevel > 0.04;
    foamMesh.position.set(0, h + 0.015, 0);
    var fw = 0.96 + Math.sin(animTime * 1.8) * 0.04;
    foamMesh.scale.set(fw, 1, fw);
    foamMesh.rotation.y += dt * 0.2;
  }

  // ===== BUBBLES =====
  function initBubbles() {
    bubbleGeo = new THREE.SphereGeometry(1, 6, 4);
    bubbleMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, shininess: 100 });
  }

  function updateBubbles(dt) {
    var gx = glassGroup ? glassGroup.position.x : 0.6;
    var gy = glassGroup ? glassGroup.position.y : GLASS_Y;
    var gz = glassGroup ? glassGroup.position.z : 0.3;
    if (liquidLevel > 0.04 && Math.random() < dt * 5 && bubbles.length < 15) {
      var m = new THREE.Mesh(bubbleGeo, bubbleMat);
      var s = 0.008 + Math.random() * 0.012;
      m.scale.set(s, s, s);
      var a = Math.random() * Math.PI * 2, r = Math.random() * GLASS_R * 0.5;
      m.position.set(gx + Math.cos(a) * r, gy + 0.04, gz + Math.sin(a) * r);
      scene.add(m);
      bubbles.push({ mesh: m, spd: 0.1 + Math.random() * 0.18, wF: 2 + Math.random() * 3, wA: 0.005, t: Math.random() * 6 });
    }
    var maxY;
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i]; b.t += dt;
      b.mesh.position.y += b.spd * dt;
      b.mesh.position.x += Math.sin(b.t * b.wF) * b.wA * dt;
      maxY = gy + Math.max(liquidLevel, 0.04) * LIQUID_MAX;
      if (b.mesh.position.y >= maxY) { scene.remove(b.mesh); bubbles.splice(i, 1); }
    }
  }

  // ===== BOKEH PARTICLES =====
  function createBokehParticles() {
    var bokehGeo = new THREE.SphereGeometry(0.06, 6, 4);
    for (var i = 0; i < 20; i++) {
      var mat = new THREE.MeshBasicMaterial({
        color: 0xffcc66, transparent: true, opacity: 0.08 + Math.random() * 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var m = new THREE.Mesh(bokehGeo, mat);
      var x = (Math.random() - 0.5) * 4;
      var y = 1.5 + Math.random() * 3;
      var z = BT_Z - 0.5 - Math.random() * 2;
      m.position.set(x, y, z);
      var sc = 0.5 + Math.random() * 1.5;
      m.scale.set(sc, sc, sc);
      scene.add(m);
      bokehParticles.push({
        mesh: m,
        baseY: y,
        baseX: x,
        phaseY: Math.random() * Math.PI * 2,
        phaseX: Math.random() * Math.PI * 2,
        speedY: 0.2 + Math.random() * 0.3,
        speedX: 0.1 + Math.random() * 0.15,
        ampY: 0.15 + Math.random() * 0.25,
        ampX: 0.1 + Math.random() * 0.2
      });
    }
  }

  function updateBokeh(dt) {
    for (var i = 0; i < bokehParticles.length; i++) {
      var p = bokehParticles[i];
      p.mesh.position.y = p.baseY + Math.sin(animTime * p.speedY + p.phaseY) * p.ampY;
      p.mesh.position.x = p.baseX + Math.sin(animTime * p.speedX + p.phaseX) * p.ampX;
    }
  }

  // ===== BARTENDER BODY =====
  function createBartender() {
    bartenderGroup = new THREE.Group();
    bartenderGroup.position.set(0, 0, BT_Z);

    // Torso (vest)
    bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.82, 12), matVest);
    bodyMesh.position.y = BODY_Y;
    bartenderGroup.add(bodyMesh);

    // Gold buttons (3)
    var btnMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100, specular: 0xffd700 });
    for (var bi = 0; bi < 3; bi++) {
      var btn = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), btnMat);
      btn.position.set(0, BODY_Y + 0.12 - bi * 0.18, 0.36);
      bartenderGroup.add(btn);
    }

    // Pocket square (red)
    var psMat = new THREE.MeshPhongMaterial({ color: 0xcc2244, side: THREE.DoubleSide });
    var ps = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.045), psMat);
    ps.position.set(-0.22, BODY_Y + 0.2, 0.34);
    ps.rotation.y = -0.3;
    bartenderGroup.add(ps);

    // Shirt collar
    var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.1, 10), matShirt);
    collar.position.y = BODY_Y + 0.43;
    bartenderGroup.add(collar);

    // Shoulder pads
    var padGeo = new THREE.SphereGeometry(0.12, 8, 6);
    var padL = new THREE.Mesh(padGeo, matVest);
    padL.position.set(-0.42, BODY_Y + 0.3, 0.05); padL.scale.set(1, 0.8, 1.1);
    bartenderGroup.add(padL);
    var padR = new THREE.Mesh(padGeo, matVest);
    padR.position.set(0.42, BODY_Y + 0.3, 0.05); padR.scale.set(1, 0.8, 1.1);
    bartenderGroup.add(padR);

    // Bow tie
    createBowTie();
    // Neck
    bartenderGroup.add(createMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8), matSkin, 0, BODY_Y + 0.5, 0));
    // Head
    createHead();

    scene.add(bartenderGroup);
  }

  function createMesh(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  function createBowTie() {
    bowTieGroup = new THREE.Group();
    bowTieGroup.position.set(0, BODY_Y + 0.43, 0.22);
    var btMat = new THREE.MeshPhongMaterial({ color: 0xcc0022, shininess: 40 });
    bowTieGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), btMat));
    var wGeo = new THREE.BoxGeometry(0.07, 0.045, 0.025);
    var wL = new THREE.Mesh(wGeo, btMat); wL.position.x = -0.05; wL.rotation.z = 0.25;
    bowTieGroup.add(wL);
    var wR = new THREE.Mesh(wGeo, btMat); wR.position.x = 0.05; wR.rotation.z = -0.25;
    bowTieGroup.add(wR);
    bartenderGroup.add(bowTieGroup);
  }

  function createHead() {
    headGroup = new THREE.Group();
    headGroup.position.y = HEAD_Y;
    headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), matSkin));
    var hairMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05, shininess: 30 });
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.02;
    headGroup.add(hair);
    var sideGeo = new THREE.SphereGeometry(0.08, 8, 6);
    var sL = new THREE.Mesh(sideGeo, hairMat); sL.position.set(-0.24, 0.02, 0); sL.scale.set(0.6, 1.2, 1);
    headGroup.add(sL);
    var sR = new THREE.Mesh(sideGeo, hairMat); sR.position.set(0.24, 0.02, 0); sR.scale.set(0.6, 1.2, 1);
    headGroup.add(sR);

    var eMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
    eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eMat);
    eyeL.position.set(-0.09, 0.05, 0.21);
    headGroup.add(eyeL);
    eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eMat);
    eyeR.position.set(0.09, 0.05, 0.21);
    headGroup.add(eyeR);
    var pMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pMat);
    pupilL.position.z = 0.032; eyeL.add(pupilL);
    pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pMat);
    pupilR.position.z = 0.032; eyeR.add(pupilR);
    var shMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var shGeo = new THREE.SphereGeometry(0.01, 6, 4);
    var shL = new THREE.Mesh(shGeo, shMat); shL.position.set(0.01, 0.01, 0.02); pupilL.add(shL);
    var shR = new THREE.Mesh(shGeo, shMat); shR.position.set(0.01, 0.01, 0.02); pupilR.add(shR);

    var brMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
    browL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), brMat);
    browL.position.set(-0.09, 0.11, 0.21); browL.rotation.z = 0.12;
    headGroup.add(browL);
    browR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), brMat);
    browR.position.set(0.09, 0.11, 0.21); browR.rotation.z = -0.12;
    headGroup.add(browR);

    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), matSkin);
    nose.position.set(0, -0.01, 0.24); nose.scale.set(0.85, 0.7, 0.6);
    headGroup.add(nose);

    var muMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
    headGroup.add(createMesh(new THREE.BoxGeometry(0.1, 0.032, 0.025), muMat, 0, -0.06, 0.22));
    var curlGeo = new THREE.TorusGeometry(0.03, 0.012, 6, 8, Math.PI);
    var cL = new THREE.Mesh(curlGeo, muMat); cL.position.set(-0.08, -0.06, 0.22); cL.rotation.z = Math.PI * 0.5;
    headGroup.add(cL);
    var cR = new THREE.Mesh(curlGeo, muMat); cR.position.set(0.08, -0.06, 0.22); cR.rotation.z = -Math.PI * 0.5;
    headGroup.add(cR);

    var smMat = new THREE.MeshPhongMaterial({ color: 0xcc8877 });
    var smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 4, 8, Math.PI), smMat);
    smile.position.set(0, -0.1, 0.21); smile.rotation.x = Math.PI;
    headGroup.add(smile);

    bartenderGroup.add(headGroup);
  }

  // ===== ARMS =====
  function createArms() {
    var upperGeo = new THREE.CylinderGeometry(0.065, 0.06, 1, 8);
    var lowerGeo = new THREE.CylinderGeometry(0.055, 0.05, 1, 8);

    armUpperL = new THREE.Mesh(upperGeo, matVest); armUpperL.userData.baseH = 1; scene.add(armUpperL);
    armUpperR = new THREE.Mesh(upperGeo.clone(), matVest); armUpperR.userData.baseH = 1; scene.add(armUpperR);
    armLowerL = new THREE.Mesh(lowerGeo, matShirt); armLowerL.userData.baseH = 1; scene.add(armLowerL);
    armLowerR = new THREE.Mesh(lowerGeo.clone(), matShirt); armLowerR.userData.baseH = 1; scene.add(armLowerR);
  }

  function createHands() {
    handL = createHand(-1); scene.add(handL);
    handR = createHand(1); scene.add(handR);
  }

  function createHand(sign) {
    var g = new THREE.Group();
    var palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), matWhite);
    palm.scale.set(1.1, 0.7, 1.3); g.add(palm);
    var fGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.065, 5);
    for (var i = 0; i < 4; i++) {
      var f = new THREE.Mesh(fGeo, matWhite);
      f.position.set((i - 1.5) * 0.03, -0.015, 0.06); f.rotation.x = -0.3;
      g.add(f);
    }
    var thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.015, 0.055, 5), matWhite);
    thumb.position.set(sign * 0.05, -0.005, 0.025); thumb.rotation.set(-0.2, 0, sign * 0.5);
    g.add(thumb);
    // Cuff
    var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.035, 8),
      new THREE.MeshPhongMaterial({ color: 0xdddddd }));
    cuff.position.y = 0.08; g.add(cuff);
    // Cufflink button
    var clMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100, specular: 0xffd700 });
    var cl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), clMat);
    cl.position.set(sign * 0.05, 0.08, 0.02); g.add(cl);
    return g;
  }

  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function posCylBetween(mesh, a, b) {
    _v1.addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(_v1);
    _v2.subVectors(b, a);
    var len = _v2.length();
    mesh.scale.y = len;
    _v2.normalize();
    var quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v2);
    mesh.quaternion.copy(quat);
  }

  function getElbow(shoulder, hand, sign) {
    var mid = _v1.addVectors(shoulder, hand).multiplyScalar(0.5);
    return new THREE.Vector3(
      mid.x + sign * 0.12,
      mid.y + 0.1,
      mid.z - 0.08
    );
  }

  function updateArms() {
    if (!armUpperL) return;
    var elbowL = getElbow(shoulderLPos, handLPos, -1);
    posCylBetween(armUpperL, shoulderLPos, elbowL);
    posCylBetween(armLowerL, elbowL, handLPos);
    handL.position.copy(handLPos);
    handL.lookAt(handLPos.x, handLPos.y - 0.3, handLPos.z + 0.5);

    var elbowR = getElbow(shoulderRPos, handRPos, 1);
    posCylBetween(armUpperR, shoulderRPos, elbowR);
    posCylBetween(armLowerR, elbowR, handRPos);
    handR.position.copy(handRPos);
    handR.lookAt(handRPos.x, handRPos.y - 0.3, handRPos.z + 0.5);
  }

  // ===== IDLE ANIMATIONS (v4 — natural breathing & polish) =====
  function animateIdle(dt) {
    idleSwitchTimer += dt;
    if (idleSwitchTimer > 5.0) {
      idleSwitchTimer = 0;
      idleVariant = (idleVariant + 1) % 4;
    }

    // ── Breathing: chest expands, slight shoulder rise ──
    if (bodyMesh) {
      var breathCycle = Math.sin(animTime * 1.0); // slow, natural breathing
      var breathIn = breathCycle * 0.5 + 0.5; // 0→1
      bodyMesh.scale.x = 1 + breathIn * 0.018;
      bodyMesh.scale.z = 1 + breathIn * 0.012;
      bodyMesh.scale.y = 1 + breathIn * 0.005;
      // Subtle weight shifting
      bodyMesh.rotation.z = Math.sin(animTime * 0.25) * 0.008;
      bodyMesh.position.x = Math.sin(animTime * 0.2) * 0.003;
    }

    // ── Blinking: variable timing, double-blinks ──
    var blinkCycle = animTime % 4.2;
    var blinkOpen = 1;
    if (blinkCycle > 3.9 && blinkCycle < 3.98) {
      blinkOpen = 0.08; // first blink
    } else if (blinkCycle > 4.02 && blinkCycle < 4.08) {
      blinkOpen = 0.15; // quick double blink (partial)
    }
    if (eyeL) eyeL.scale.y = blinkOpen;
    if (eyeR) eyeR.scale.y = blinkOpen;

    // ── Eye tracking: smooth pursuit with micro-saccades ──
    var baseGazeX = Math.sin(animTime * 0.5) * 0.012;
    var baseGazeY = Math.sin(animTime * 0.38) * 0.006;
    // Micro-saccade every ~2 seconds
    var saccade = (animTime % 2.1) < 0.05 ? Math.sin(animTime * 60) * 0.005 : 0;
    var gazeX = baseGazeX + saccade;
    var gazeY = baseGazeY;
    if (pupilL) { pupilL.position.x = gazeX; pupilL.position.y = gazeY; }
    if (pupilR) { pupilR.position.x = gazeX; pupilR.position.y = gazeY; }

    switch (idleVariant) {
      case 0: idleRest(dt); break;
      case 1: idleDrum(dt); break;
      case 2: idleCurious(dt); break;
      case 3: idleBowTie(dt); break;
    }
    updateArms();
  }

  function lerpV3(target, dest, speed, dt) {
    target.x += (dest.x - target.x) * Math.min(speed * dt, 1);
    target.y += (dest.y - target.y) * Math.min(speed * dt, 1);
    target.z += (dest.z - target.z) * Math.min(speed * dt, 1);
  }

  function idleRest(dt) {
    var bL = Math.sin(animTime * 1.3) * 0.04;
    var bR = Math.sin(animTime * 1.3 + 0.7) * 0.04;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    lerpV3(handRPos, { x: handRRest.x, y: handRRest.y + bR, z: handRRest.z }, 5, dt);
    if (headGroup) { headGroup.rotation.z = Math.sin(animTime * 0.5) * 0.025; headGroup.rotation.y = 0; headGroup.rotation.x = 0; }
    if (browL) browL.position.y = 0.11; if (browR) browR.position.y = 0.11;
  }

  function idleDrum(dt) {
    var bL = Math.sin(animTime * 1.3) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    var tap = Math.abs(Math.sin(animTime * 6)) * 0.06;
    lerpV3(handRPos, { x: handRRest.x * 0.7, y: handRRest.y + tap, z: handRRest.z + 0.1 }, 8, dt);
    if (headGroup) { headGroup.rotation.z = Math.sin(animTime * 3) * 0.02; headGroup.rotation.y = 0; headGroup.rotation.x = 0; }
  }

  function idleCurious(dt) {
    var bL = Math.sin(animTime * 1.1) * 0.03;
    var bR = Math.sin(animTime * 1.1 + 0.5) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    lerpV3(handRPos, { x: handRRest.x, y: handRRest.y + bR, z: handRRest.z }, 5, dt);
    if (headGroup) {
      headGroup.rotation.z = Math.sin(animTime * 0.4) * 0.1;
      headGroup.rotation.y = Math.sin(animTime * 0.3) * 0.08;
      headGroup.rotation.x = Math.sin(animTime * 0.25) * 0.03;
    }
    if (browL) browL.position.y = 0.11 + Math.sin(animTime * 0.4) * 0.015;
    if (browR) browR.position.y = 0.11 + Math.sin(animTime * 0.4) * 0.015;
    if (pupilL) { pupilL.position.x = 0; pupilL.position.z = 0.038; }
    if (pupilR) { pupilR.position.x = 0; pupilR.position.z = 0.038; }
  }

  function idleBowTie(dt) {
    var phase = (animTime * 0.7) % (Math.PI * 2);
    var reach = Math.max(0, Math.sin(phase));
    var btY = BODY_Y + 0.43;
    var targetR = {
      x: 0.1,
      y: handRRest.y + reach * (btY - handRRest.y + 0.4),
      z: handRRest.z - reach * 0.3
    };
    lerpV3(handRPos, targetR, 6, dt);
    var bL = Math.sin(animTime * 1.1) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    if (headGroup) { headGroup.rotation.x = reach * 0.08; headGroup.rotation.z = 0; headGroup.rotation.y = 0; }
  }

  // ===== MIXING ANIMATION (v4 — vigorous multi-axis shaking) =====
  var mixElapsed = 0;
  var MIX_TOTAL = 1.4; // total mixing duration

  function animateMixing(dt) {
    mixElapsed += dt;
    var mp = Math.min(mixElapsed / MIX_TOTAL, 1); // 0→1 progress
    var topY = GLASS_Y + GLASS_H + 0.06;
    var gx = 0.6, gz = 0.3;

    // Intensity envelope: ramp up → peak → taper
    var intensity;
    if (mp < 0.15) {
      intensity = mp / 0.15; // ramp up
    } else if (mp < 0.75) {
      intensity = 1.0; // full intensity
    } else {
      intensity = 1.0 - (mp - 0.75) / 0.25; // taper off
    }
    var I = intensity;

    // ── Phase-based hand motion ──
    // Multi-frequency vibration for organic feel
    var shakeX = (Math.sin(animTime * 14) * 0.06 + Math.sin(animTime * 9.3) * 0.03) * I;
    var shakeZ = (Math.cos(animTime * 11) * 0.04 + Math.cos(animTime * 7.7) * 0.02) * I;
    var shakeY = Math.abs(Math.sin(animTime * 16)) * 0.04 * I;
    var tiltAngle = Math.sin(animTime * 6) * 0.12 * I;

    // Hands grip glass top, shaking together
    var hBaseX = gx + shakeX;
    var hBaseZ = gz + shakeZ;
    handLPos.set(hBaseX - 0.08, topY + shakeY, hBaseZ - 0.04);
    handRPos.set(hBaseX + 0.08, topY + shakeY, hBaseZ + 0.04);
    updateArms();

    // ── Glass motion (dramatic tilt + rock + vibration) ──
    if (glassGroup) {
      glassGroup.position.x = gx + shakeX * 0.7;
      glassGroup.position.z = gz + shakeZ * 0.5;
      glassGroup.rotation.z = tiltAngle;
      glassGroup.rotation.x = Math.sin(animTime * 8.5) * 0.06 * I;
      glassGroup.rotation.y = Math.sin(animTime * 5) * 0.08 * I;
      // Slight lift during vigorous shaking
      glassGroup.position.y = GLASS_Y + Math.abs(Math.sin(animTime * 12)) * 0.015 * I;
    }

    // ── Body sway (bartender leans into the shake) ──
    if (bodyMesh) {
      bodyMesh.rotation.z = Math.sin(animTime * 5) * 0.03 * I;
      bodyMesh.rotation.x = -0.04 * I; // lean forward
    }

    // ── Head tracks the glass with focused expression ──
    if (headGroup) {
      headGroup.rotation.z = Math.sin(animTime * 4.5) * 0.07 * I;
      headGroup.rotation.y = Math.sin(animTime * 3) * 0.05 * I;
      headGroup.rotation.x = -0.06 * I; // looking down at glass
    }

    // ── Focused eyebrows (raised, concentrated) ──
    if (browL) browL.position.y = 0.11 + 0.025 * I;
    if (browR) browR.position.y = 0.11 + 0.025 * I;

    // ── Pupils track glass position ──
    if (pupilL) { pupilL.position.x = shakeX * 0.3; pupilL.position.y = -0.01 * I; }
    if (pupilR) { pupilR.position.x = shakeX * 0.3; pupilR.position.y = -0.01 * I; }
  }

  function endMixing() {
    animState = 'idle';
    idleSwitchTimer = 0;
    mixElapsed = 0;
    if (glassGroup) {
      glassGroup.rotation.set(0, 0, 0);
      glassGroup.position.set(0.6, GLASS_Y, 0.3);
    }
    if (bodyMesh) { bodyMesh.rotation.set(0, 0, 0); }
    if (browL) browL.position.y = 0.11; if (browR) browR.position.y = 0.11;
    if (headGroup) headGroup.rotation.set(0, 0, 0);
    if (pupilL) { pupilL.position.x = 0; pupilL.position.y = 0; }
    if (pupilR) { pupilR.position.x = 0; pupilR.position.y = 0; }
    handLPos.copy(handLRest); handRPos.copy(handRRest);
    updateArms();
    if (mixCallback) { var cb = mixCallback; mixCallback = null; cb(); }
  }

  // ===== BARTENDER REACTIONS (v4 — full body, dramatic) =====
  function animateBtReaction(dt) {
    if (btReaction === 'none') return;
    btReactionTime += dt;
    var t = btReactionTime;

    if (btReaction === 'safe') {
      // ── Relief: exhale, shoulders drop, lean forward, satisfied nod ──
      var relief = Math.min(t / 0.4, 1); // quick onset
      var decay = Math.max(0, 1 - (t - 0.5) / 1.5); // gradual recovery

      if (headGroup) {
        // Nod down then slowly back up
        headGroup.rotation.x = -0.08 * relief * decay + Math.sin(t * 1.5) * 0.015 * decay;
        headGroup.rotation.z = Math.sin(t * 1.8) * 0.04 * decay;
        headGroup.rotation.y = Math.sin(t * 0.8) * 0.03 * decay;
      }
      if (bodyMesh) {
        // Lean forward slightly (exhale)
        bodyMesh.rotation.x = -0.025 * relief * decay;
        bodyMesh.scale.x = 1 - 0.01 * relief * decay; // chest contracts (exhale)
      }
      // Relaxed brows
      if (browL) browL.position.y = 0.11 - 0.015 * decay;
      if (browR) browR.position.y = 0.11 - 0.015 * decay;
      // Slight squint (smile)
      if (eyeL) eyeL.scale.y = 1 - 0.15 * relief * decay;
      if (eyeR) eyeR.scale.y = 1 - 0.15 * relief * decay;
      // Hands gesture relief (one hand up briefly)
      var gestureUp = Math.max(0, Math.sin(t * 2)) * decay * 0.15;
      lerpV3(handRPos, { x: handRRest.x, y: handRRest.y + gestureUp, z: handRRest.z - gestureUp * 0.5 }, 6, dt);

      if (t > 2.2) {
        btReaction = 'none'; btReactionTime = 0;
        if (bodyMesh) bodyMesh.rotation.x = 0;
        if (eyeL) eyeL.scale.set(1, 1, 1);
        if (eyeR) eyeR.scale.set(1, 1, 1);
      }

    } else if (btReaction === 'hit') {
      // ── Shock: recoil, wide eyes, trembling, hands up ──
      var shock = Math.min(t / 0.15, 1); // instant onset
      var decay = Math.max(0, 1 - (t - 0.5) / 2.0);

      if (headGroup) {
        // Initial jolt back, then trembling
        var joltBack = shock * 0.14 * decay;
        var tremble = Math.sin(t * 25) * Math.max(0, 0.08 - t * 0.025) * decay;
        headGroup.rotation.x = -joltBack;
        headGroup.rotation.z = tremble;
        headGroup.rotation.y = Math.sin(t * 18) * 0.03 * decay;
      }
      if (bodyMesh) {
        // Lean back in shock
        bodyMesh.rotation.x = 0.03 * shock * decay;
        // Body trembles
        bodyMesh.rotation.z = Math.sin(t * 15) * 0.01 * decay;
      }
      // Eyes wide open (gradually)
      var eyeWide = 1 + 0.35 * shock * decay;
      if (eyeL) eyeL.scale.set(1 + 0.2 * shock * decay, eyeWide, 1);
      if (eyeR) eyeR.scale.set(1 + 0.2 * shock * decay, eyeWide, 1);
      // Brows shoot up
      if (browL) browL.position.y = 0.11 + 0.04 * shock * decay;
      if (browR) browR.position.y = 0.11 + 0.04 * shock * decay;
      // Pupils shrink (fear) — move pupils forward to look more alarmed
      if (pupilL) pupilL.position.z = 0.032 + 0.008 * shock * decay;
      if (pupilR) pupilR.position.z = 0.032 + 0.008 * shock * decay;
      // Hands up in shock
      var handsUp = shock * decay * 0.3;
      lerpV3(handLPos, { x: handLRest.x + 0.1, y: handLRest.y + handsUp, z: handLRest.z - 0.15 }, 8, dt);
      lerpV3(handRPos, { x: handRRest.x - 0.1, y: handRRest.y + handsUp, z: handRRest.z - 0.15 }, 8, dt);

      if (t > 2.8) {
        btReaction = 'none'; btReactionTime = 0;
        if (eyeL) eyeL.scale.set(1, 1, 1);
        if (eyeR) eyeR.scale.set(1, 1, 1);
        if (bodyMesh) bodyMesh.rotation.set(0, 0, 0);
        if (pupilL) pupilL.position.z = 0.032;
        if (pupilR) pupilR.position.z = 0.032;
      }
    }
  }

  // ===== ROULETTE WHEEL (v4 — Premium 3D) =====
  function createRouletteWheel(slots) {
    if (rouletteGroup) removeRouletteWheel();

    rouletteGroup = new THREE.Group();
    rouletteGroup.position.set(0, ROULETTE_Y - 0.5, 0.15);

    var WR = 0.5, WH = 0.12;
    var goldMat = new THREE.MeshPhongMaterial({ color: 0xd4a843, shininess: 130, specular: 0xffd700 });
    var darkWoodMat = new THREE.MeshPhongMaterial({ color: 0x1a0e06, shininess: 55, specular: 0x221108 });
    var chromeMat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 120, specular: 0xffffff });

    // ── Outer frame (dark mahogany bowl) ──
    var outerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(WR + 0.06, WR + 0.09, WH + 0.05, 48), darkWoodMat
    );
    outerWall.castShadow = true;
    rouletteGroup.add(outerWall);

    // Inner slope (concave dish feel)
    var slopeMat = new THREE.MeshPhongMaterial({ color: 0x0d0806, shininess: 30 });
    var slope = new THREE.Mesh(
      new THREE.CylinderGeometry(WR + 0.02, WR - 0.04, WH * 0.5, 48, 1, true), slopeMat
    );
    slope.position.y = WH * 0.15;
    rouletteGroup.add(slope);

    // Gold outer rim — top
    var rimOuter = new THREE.Mesh(new THREE.TorusGeometry(WR + 0.065, 0.024, 12, 48), goldMat);
    rimOuter.rotation.x = Math.PI / 2; rimOuter.position.y = WH / 2 + 0.02;
    rouletteGroup.add(rimOuter);

    // Gold outer rim — bottom accent
    var rimBottom = new THREE.Mesh(new THREE.TorusGeometry(WR + 0.075, 0.016, 10, 48), goldMat);
    rimBottom.rotation.x = Math.PI / 2; rimBottom.position.y = -WH / 2 - 0.02;
    rouletteGroup.add(rimBottom);

    // Chrome ball track ring
    var trackRing = new THREE.Mesh(new THREE.TorusGeometry(WR + 0.015, 0.014, 10, 48), chromeMat);
    trackRing.rotation.x = Math.PI / 2; trackRing.position.y = WH / 2 + 0.008;
    rouletteGroup.add(trackRing);

    // Ball deflectors (8 diamond shapes around outer track)
    for (var d = 0; d < 8; d++) {
      var da = (d / 8) * Math.PI * 2;
      var dr = WR + 0.015;
      var defl = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), goldMat);
      defl.position.set(Math.sin(da) * dr, WH / 2 + 0.02, Math.cos(da) * dr);
      defl.scale.set(0.5, 1.0, 0.5);
      defl.rotation.y = da;
      rouletteGroup.add(defl);
    }

    // Decorative studs around outer rim (16)
    var studGeo = new THREE.SphereGeometry(0.008, 6, 4);
    for (var s = 0; s < 16; s++) {
      var sa = (s / 16) * Math.PI * 2;
      var sr = WR + 0.07;
      var stud = new THREE.Mesh(studGeo, goldMat);
      stud.position.set(Math.sin(sa) * sr, WH / 2 + 0.022, Math.cos(sa) * sr);
      rouletteGroup.add(stud);
    }

    // ── Inner spinning disc ──
    rouletteDiscGroup = new THREE.Group();

    // ── Colored segment meshes (ShapeGeometry — no texture UV issues) ──
    var segR = WR - 0.03;
    var segColorMap = { bombshot: 0xcc1133, penalty: 0xcc7711, safe: 0x1a8844 };
    var segArcSegs = 24; // smoothness of arc

    for (var i = 0; i < 6; i++) {
      var sA = (i / 6) * Math.PI * 2 - Math.PI / 2;
      var eA = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
      var slot = slots && slots[i] ? slots[i] : { type: 'safe', label: 'SAFE' };

      var shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (var a = 0; a <= segArcSegs; a++) {
        var angle = sA + (eA - sA) * (a / segArcSegs);
        shape.lineTo(Math.cos(angle) * segR, Math.sin(angle) * segR);
      }
      shape.lineTo(0, 0);

      var segMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshPhongMaterial({
          color: segColorMap[slot.type] || segColorMap.safe,
          shininess: 50,
          side: THREE.DoubleSide
        })
      );
      segMesh.rotation.x = -Math.PI / 2;
      segMesh.position.y = WH / 2 + 0.005;
      rouletteDiscGroup.add(segMesh);
      if (i === 0) rouletteWheel = segMesh;
    }

    // ── Label sprites floating above each segment (always face camera) ──
    for (var li = 0; li < 6; li++) {
      var lSlot = slots && slots[li] ? slots[li] : { type: 'safe', label: 'SAFE' };
      var lmA = ((li + 0.5) / 6) * Math.PI * 2 - Math.PI / 2;
      var labelDist = segR * 0.58;

      // Small canvas per label
      var lc = document.createElement('canvas');
      lc.width = 256; lc.height = 128;
      var lctx = lc.getContext('2d');
      lctx.clearRect(0, 0, 256, 128);

      // Background pill
      var bgColor = lSlot.type === 'bombshot' ? '#ff2244' :
                     lSlot.type === 'penalty' ? '#ffaa33' : '#22cc55';
      lctx.fillStyle = bgColor;
      lctx.beginPath();
      if (lctx.roundRect) {
        lctx.roundRect(16, 16, 224, 96, 20);
      } else {
        lctx.rect(16, 16, 224, 96);
      }
      lctx.fill();
      lctx.strokeStyle = '#fff';
      lctx.lineWidth = 4;
      lctx.stroke();

      // Text
      var labelText = lSlot.type === 'bombshot' ? 'BOMB' :
                       lSlot.type === 'penalty' ? (lSlot.label || 'PENALTY') : 'SAFE';
      lctx.font = 'bold 44px sans-serif';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillStyle = '#fff';
      lctx.strokeStyle = 'rgba(0,0,0,0.7)';
      lctx.lineWidth = 5;
      lctx.strokeText(labelText, 128, 68);
      lctx.fillText(labelText, 128, 68);

      var spriteTex = new THREE.CanvasTexture(lc);
      var spriteMat = new THREE.SpriteMaterial({ map: spriteTex, transparent: true, depthTest: false });
      var sprite = new THREE.Sprite(spriteMat);

      var sx = Math.cos(lmA) * labelDist;
      var sz = -Math.sin(lmA) * labelDist;
      sprite.position.set(sx, WH / 2 + 0.08, sz);
      sprite.scale.set(0.22, 0.11, 1);
      rouletteDiscGroup.add(sprite);
    }

    // 3D divider walls between segments
    rouletteDividers = [];
    var divLen = WR - 0.14;
    var divGeo = new THREE.BoxGeometry(0.007, 0.045, divLen);
    for (var di = 0; di < 6; di++) {
      var divAngle = (di / 6) * Math.PI * 2;
      var divPivot = new THREE.Group();
      divPivot.rotation.y = divAngle;
      var divMesh = new THREE.Mesh(divGeo, goldMat);
      divMesh.position.set(0, WH / 2 + 0.01, divLen / 2 + 0.07);
      divMesh.castShadow = true;
      divPivot.add(divMesh);
      // Small finial at outer end of each divider
      var finial = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), goldMat);
      finial.position.set(0, WH / 2 + 0.015, divLen + 0.07);
      divPivot.add(finial);
      rouletteDiscGroup.add(divPivot);
      rouletteDividers.push(divPivot);
    }

    // Gold inner rim (where pockets are)
    var innerRim = new THREE.Mesh(new THREE.TorusGeometry(WR - 0.03, 0.013, 10, 48), goldMat);
    innerRim.rotation.x = Math.PI / 2; innerRim.position.y = WH / 2 + 0.008;
    rouletteDiscGroup.add(innerRim);

    // Center hub — layered ornate
    var hubDark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.075, 0.06, 24),
      new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 60, specular: 0x333333 })
    );
    hubDark.position.y = WH / 2 + 0.02;
    rouletteDiscGroup.add(hubDark);

    var hubGold = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.04, 16), goldMat);
    hubGold.position.y = WH / 2 + 0.055;
    rouletteDiscGroup.add(hubGold);

    // Spindle top
    var spindleMat = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 150, specular: 0xffffff });
    var spindle = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 8), spindleMat);
    spindle.position.y = WH / 2 + 0.095;
    rouletteDiscGroup.add(spindle);

    // Red gem on top
    var gemMat = new THREE.MeshPhongMaterial({
      color: 0xff2244, shininess: 160, specular: 0xffffff,
      emissive: 0x550011, emissiveIntensity: 0.4
    });
    var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), gemMat);
    gem.position.y = WH / 2 + 0.12; gem.rotation.y = Math.PI / 4;
    rouletteDiscGroup.add(gem);

    rouletteGroup.add(rouletteDiscGroup);

    // ── Pointer (enhanced diamond-arrow) ──
    var ptrGroup = new THREE.Group();
    var ptrBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 4),
      new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 140, specular: 0xffffff })
    );
    ptrBody.rotation.x = Math.PI / 2;
    ptrGroup.add(ptrBody);
    var ptrBase = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), goldMat);
    ptrBase.position.z = -0.06;
    ptrGroup.add(ptrBase);
    // Glow accent ring
    var ptrGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.005, 6, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.5 })
    );
    ptrGlow.rotation.x = Math.PI / 2; ptrGlow.position.z = -0.06;
    ptrGroup.add(ptrGlow);
    ptrGroup.position.set(0, WH / 2 + 0.04, WR + 0.07);
    rouletteGroup.add(ptrGroup);
    roulettePointer = ptrGroup;

    // ── Ball (higher quality) ──
    rouletteBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 20, 14),
      new THREE.MeshPhongMaterial({
        color: 0xffffff, shininess: 160, specular: 0xffffff,
        emissive: 0x333333, emissiveIntensity: 0.08
      })
    );
    rouletteBall.castShadow = true;
    rouletteBall.position.set(0, WH / 2 + 0.06, WR * 0.85);
    rouletteBall.visible = false;
    rouletteGroup.add(rouletteBall);

    scene.add(rouletteGroup);
    rouletteSlots = slots;
    rouletteBaseAngle = 0;
    rouletteBallSparks = [];
  }

  function removeRouletteWheel() {
    // Clean up spark particles
    for (var si = rouletteBallSparks.length - 1; si >= 0; si--) {
      if (rouletteBallSparks[si].mesh) scene.remove(rouletteBallSparks[si].mesh);
    }
    rouletteBallSparks = [];
    if (rouletteGroup) {
      rouletteGroup.traverse(function(c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
      scene.remove(rouletteGroup);
      rouletteGroup = null;
      rouletteWheel = null;
      rouletteBall = null;
      roulettePointer = null;
      rouletteDiscGroup = null;
      rouletteDividers = [];
    }
  }

  // ===== ROULETTE ENTER/EXIT ANIMATION (v4 — dramatic) =====
  function updateRouletteEnter(dt) {
    if (rouletteState !== 'entering' || !rouletteGroup) return;
    rouletteEnterTime += dt;
    var dur = 1.1;
    var t = Math.min(rouletteEnterTime / dur, 1);

    // Overshoot bounce: rise past target, then settle
    var ease;
    if (t < 0.6) {
      // Rise quickly (overshoot target by ~0.06)
      var p = t / 0.6;
      ease = (1 - Math.pow(1 - p, 3)) * 1.12;
    } else if (t < 0.8) {
      // Settle back down
      var p = (t - 0.6) / 0.2;
      ease = 1.12 - smoothstep(p) * 0.15;
    } else {
      // Micro-bounce
      var p = (t - 0.8) / 0.2;
      ease = 0.97 + smoothstep(p) * 0.03;
    }

    rouletteGroup.position.y = (ROULETTE_Y - 0.5) + ease * 0.5;

    // Slow rotation while rising
    rouletteGroup.rotation.y = (1 - t) * Math.PI * 0.5;

    // Spotlight intensifies as wheel appears
    if (rouletteSpotlight) {
      rouletteSpotlight.intensity = t * 1.3;
    }

    if (t >= 1) {
      rouletteState = 'visible';
      rouletteGroup.position.y = ROULETTE_Y;
      rouletteGroup.rotation.y = 0;
    }
  }

  function updateRouletteExit(dt) {
    if (rouletteState !== 'exiting' || !rouletteGroup) return;
    rouletteExitTime += dt;
    var t = Math.min(rouletteExitTime / 0.8, 1);
    var ease = t * t * t; // ease-in cubic (accelerating descent)
    rouletteGroup.position.y = ROULETTE_Y - ease * 0.65;
    // Spin as it descends
    rouletteGroup.rotation.y = ease * Math.PI * 0.4;
    // Fade spotlight
    if (rouletteSpotlight) rouletteSpotlight.intensity = (1 - t) * 1.3;
    if (t >= 1) {
      rouletteState = 'hidden';
      removeRouletteWheel();
    }
  }

  // ===== ROULETTE SPIN ANIMATION (v4 — multi-phase physics) =====
  function spawnBallSpark(px, py, pz) {
    if (!scene) return;
    var sparkGeo = new THREE.SphereGeometry(0.008, 4, 3);
    var sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    for (var si = 0; si < 3; si++) {
      var spark = new THREE.Mesh(sparkGeo, sparkMat.clone());
      spark.position.set(px, py, pz);
      scene.add(spark);
      rouletteBallSparks.push({
        mesh: spark, time: 0, life: 0.3 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.3 + Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.6
      });
    }
  }

  function updateBallSparks(dt) {
    for (var si = rouletteBallSparks.length - 1; si >= 0; si--) {
      var sp = rouletteBallSparks[si];
      sp.time += dt;
      var lt = sp.time / sp.life;
      if (lt >= 1) {
        scene.remove(sp.mesh);
        sp.mesh.material.dispose();
        rouletteBallSparks.splice(si, 1);
        continue;
      }
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y += sp.vy * dt;
      sp.mesh.position.z += sp.vz * dt;
      sp.vy -= 1.5 * dt; // gravity
      sp.mesh.material.opacity = (1 - lt) * 0.9;
      var sc = 1 - lt * 0.5;
      sp.mesh.scale.set(sc, sc, sc);
    }
  }

  function updateRouletteSpin(dt) {
    if (rouletteState !== 'spinning' || !rouletteWheel || !rouletteBall) return;
    rouletteSpinTime += dt;
    var t = Math.min(rouletteSpinTime / rouletteSpinDuration, 1);

    rouletteBall.visible = true;

    var WR = 0.5, WH = 0.12;
    var outerTrackR = WR + 0.01;   // ball sits on outer chrome track
    var slotR = WR * 0.55;          // where the slots/pockets are
    var targetAngle = (rouletteTargetSlot / 6) * Math.PI * 2;
    var totalRot = Math.PI * 2 * 7 + targetAngle; // 7 full revolutions

    // ── Ball angle (main rotation with multi-phase easing) ──
    var angEase;
    if (t < 0.1) {
      // Ramp up
      var p = t / 0.1;
      angEase = p * p * 0.08;
    } else if (t < 0.4) {
      // Full speed outer track
      var p = (t - 0.1) / 0.3;
      angEase = 0.08 + p * 0.32;
    } else if (t < 0.6) {
      // Decelerating, dropping inward
      var p = (t - 0.4) / 0.2;
      angEase = 0.4 + p * 0.28;
    } else if (t < 0.85) {
      // Slow bounce zone
      var p = (t - 0.6) / 0.25;
      angEase = 0.68 + p * 0.22;
    } else {
      // Final settle
      var p = (t - 0.85) / 0.15;
      angEase = 0.9 + smoothstep(p) * 0.1;
    }

    var ballAngle = totalRot * angEase;

    // ── Ball radial position (distance from center) ──
    var ballR;
    if (t < 0.38) {
      // On outer track
      ballR = outerTrackR;
    } else if (t < 0.58) {
      // Dropping inward (spiral descent)
      var dp = (t - 0.38) / 0.2;
      var dropEase = dp * dp; // accelerating drop
      ballR = outerTrackR + (slotR - outerTrackR) * dropEase;
    } else {
      // In the slot zone, with small radial wobble
      var wp = (t - 0.58) / 0.42;
      var wobble = Math.sin(wp * Math.PI * 4) * 0.02 * (1 - wp);
      ballR = slotR + wobble;
    }

    // ── Ball height (bounce physics) ──
    var ballY = WH / 2 + 0.04;
    if (t >= 0.38 && t < 0.55) {
      // Initial drop — ball falls from track height to disc level
      var dp = (t - 0.38) / 0.17;
      var dropH = 0.04 * (1 - dp); // elevated during drop
      var dropBounce = Math.abs(Math.sin(dp * Math.PI * 1.5)) * 0.035 * (1 - dp);
      ballY += dropH + dropBounce;
    } else if (t >= 0.55 && t < 0.85) {
      // Divider bounces — ball hops when crossing divider walls
      var bp = (t - 0.55) / 0.3;
      // Compute angular velocity for bounce frequency
      var angSpeed = totalRot * 0.22 / 0.3; // rough angular speed in this phase
      var crossings = angSpeed / (Math.PI * 2 / 6); // divider crossings
      var bounceFreq = Math.max(3, Math.min(crossings, 6));
      var bounceAmp = 0.06 * Math.pow(1 - bp, 1.5); // decaying bounces
      var bounceH = Math.abs(Math.sin(bp * Math.PI * bounceFreq)) * bounceAmp;
      ballY += bounceH;

      // Spawn sparks at bounce peaks
      if (bounceH > 0.02 && Math.sin(bp * Math.PI * bounceFreq) > 0.9) {
        var prevSpark = rouletteBallSparks.length;
        if (prevSpark < 20) {
          var spx = Math.sin(ballAngle) * ballR;
          var spz = Math.cos(ballAngle) * ballR;
          spawnBallSpark(
            rouletteGroup.position.x + spx,
            rouletteGroup.position.y + ballY,
            rouletteGroup.position.z + spz
          );
        }
      }
    } else if (t >= 0.85) {
      // Settling — tiny damped oscillation
      var sp = (t - 0.85) / 0.15;
      ballY += Math.sin(sp * Math.PI * 3) * 0.012 * (1 - sp);
    }

    rouletteBall.position.set(
      Math.sin(ballAngle) * ballR,
      ballY,
      Math.cos(ballAngle) * ballR
    );

    // Ball self-rotation (rolling feel)
    rouletteBall.rotation.x += dt * 15 * (1 - t);
    rouletteBall.rotation.z += dt * 8 * (1 - t);

    // ── Wheel disc counter-rotation (opposite to ball, slower) ──
    if (rouletteDiscGroup) {
      rouletteBaseAngle = -ballAngle * 0.25;
      rouletteDiscGroup.rotation.y = rouletteBaseAngle;
    }

    // ── Center gem pulsing during spin ──
    if (rouletteDiscGroup && rouletteDiscGroup.children) {
      var gemIdx = rouletteDiscGroup.children.length - 1;
      var gemMesh = rouletteDiscGroup.children[gemIdx];
      if (gemMesh && gemMesh.geometry && gemMesh.geometry.type === 'OctahedronGeometry') {
        gemMesh.rotation.y += dt * 3;
      }
    }

    // ── Pointer wobble when ball passes ──
    if (roulettePointer && t > 0.5) {
      var pointerWobble = Math.sin(animTime * 20) * 0.05 * Math.max(0, 1 - (t - 0.5) * 3);
      roulettePointer.rotation.z = pointerWobble;
    }

    if (t >= 1) {
      rouletteState = 'visible';
      if (roulettePointer) roulettePointer.rotation.z = 0;
    }
  }

  // ===== CAMERA TRANSITIONS =====
  function startCameraTransition(targetState) {
    camStartPos = camera.position.clone();
    // Compute current lookAt from camera direction
    var dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    camStartLook = camera.position.clone().add(dir.multiplyScalar(5));

    if (targetState === 'roulette') {
      camEndPos = rouletteCamPos.clone();
      camEndLook = rouletteCamLook.clone();
      camState = 'to-roulette';
    } else {
      camEndPos = barCamPos.clone();
      camEndLook = barCamLook.clone();
      camState = 'to-bar';
    }
    camTransTime = 0;
  }

  function updateCameraTransition(dt) {
    if (camState !== 'to-roulette' && camState !== 'to-bar') return;
    camTransTime += dt;
    var t = Math.min(camTransTime / camTransDuration, 1);
    var ease = smoothstep(t);

    camera.position.lerpVectors(camStartPos, camEndPos, ease);
    var lookTarget = new THREE.Vector3().lerpVectors(camStartLook, camEndLook, ease);
    camera.lookAt(lookTarget);

    if (t >= 1) {
      camState = (camState === 'to-roulette') ? 'roulette' : 'bar';
    }
  }

  // ===== ROULETTE SPOTLIGHT =====
  function createRouletteSpotlight() {
    if (rouletteSpotlight) return;
    rouletteSpotlight = new THREE.SpotLight(0xffeedd, 0, 5, Math.PI / 5, 0.5, 1);
    rouletteSpotlight.position.set(0, 4, 0.15);
    rouletteSpotlight.target.position.set(0, ROULETTE_Y, 0.15);
    scene.add(rouletteSpotlight);
    scene.add(rouletteSpotlight.target);
  }

  function updateRouletteSpotlight(dt) {
    if (!rouletteSpotlight) return;
    var targetIntensity = 0;
    if (rouletteState === 'entering' || rouletteState === 'visible' || rouletteState === 'spinning') {
      targetIntensity = 1.2;
    }
    rouletteSpotlight.intensity += (targetIntensity - rouletteSpotlight.intensity) * Math.min(dt * 4, 1);
  }

  // ===== LIGHT PULSE =====
  function updateWarmLightPulse() {
    if (!warmLight) return;
    warmLight.intensity = 0.55 + Math.sin(animTime * 0.8 * Math.PI * 2) * 0.1;
  }

  // ===== CARD ANIMATIONS =====
  function createCardPlane(type) {
    var cardGeo = new THREE.PlaneGeometry(0.28, 0.4);
    var colors = { beer: '#f5a623', soju: '#4ecdc4', liquor: '#c0792a', water: '#5dade2' };
    var emojis = { beer: '🍺', soju: '🍶', liquor: '🥃', water: '💧' };
    var c1 = document.createElement('canvas'); c1.width = 72; c1.height = 104;
    var x1 = c1.getContext('2d');
    x1.fillStyle = '#8b1a2b'; x1.fillRect(0, 0, 72, 104);
    x1.strokeStyle = '#c9a84c'; x1.lineWidth = 2; x1.strokeRect(3, 3, 66, 98);
    x1.strokeStyle = 'rgba(201,168,76,0.2)'; x1.lineWidth = 1;
    for (var i = 0; i < 12; i++) {
      x1.beginPath(); x1.moveTo(0, i * 12); x1.lineTo(72, i * 12 + 36); x1.stroke();
      x1.beginPath(); x1.moveTo(72, i * 12); x1.lineTo(0, i * 12 + 36); x1.stroke();
    }
    var backTex = new THREE.CanvasTexture(c1);
    var c2 = document.createElement('canvas'); c2.width = 72; c2.height = 104;
    var x2 = c2.getContext('2d');
    x2.fillStyle = colors[type] || '#888'; x2.fillRect(0, 0, 72, 104);
    x2.fillStyle = 'rgba(255,255,255,0.2)'; x2.fillRect(0, 0, 72, 52);
    x2.font = '32px serif'; x2.textAlign = 'center'; x2.fillText(emojis[type] || '?', 36, 62);
    var frontTex = new THREE.CanvasTexture(c2);

    var g = new THREE.Group();
    g.add(new THREE.Mesh(cardGeo, new THREE.MeshPhongMaterial({ map: frontTex, side: THREE.FrontSide })));
    g.add(new THREE.Mesh(cardGeo.clone(), new THREE.MeshPhongMaterial({ map: backTex, side: THREE.BackSide })));
    return g;
  }

  function spawnFlyingCard(type, delay) {
    setTimeout(function() {
      if (!isInitialized || !scene) return;
      var card = createCardPlane(type || 'beer');
      // Start from slightly randomized position below camera
      var sx = (Math.random() - 0.5) * 0.4;
      card.position.set(sx, -0.2, 2.8);
      card.rotation.set(0, Math.PI, 0);
      card.scale.set(0.8, 0.8, 0.8);
      scene.add(card);
      flyingCards.push({
        mesh: card, time: 0, duration: 0.75,
        startPos: card.position.clone(),
        endPos: new THREE.Vector3(
          0.6 + (Math.random() - 0.5) * 0.12,
          GLASS_Y + GLASS_H * 0.65 + Math.random() * 0.08,
          0.3 + (Math.random() - 0.5) * 0.08
        ),
        // Control point for bezier curve (arc height)
        arcHeight: 0.6 + Math.random() * 0.4,
        spinSpeed: 2.0 + Math.random() * 1.5,
        wobble: (Math.random() - 0.5) * 2
      });
    }, delay);
  }

  function updateFlyingCards(dt) {
    for (var i = flyingCards.length - 1; i >= 0; i--) {
      var fc = flyingCards[i]; fc.time += dt;
      var t = Math.min(fc.time / fc.duration, 1);

      // Ease with overshoot for snappy feel
      var ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Quadratic bezier curve: start → high arc → glass
      var oneMinusT = 1 - ease;
      var midY = Math.max(fc.startPos.y, fc.endPos.y) + fc.arcHeight;
      fc.mesh.position.x = oneMinusT * oneMinusT * fc.startPos.x + 2 * oneMinusT * ease * (fc.startPos.x * 0.3 + fc.endPos.x * 0.7) + ease * ease * fc.endPos.x;
      fc.mesh.position.y = oneMinusT * oneMinusT * fc.startPos.y + 2 * oneMinusT * ease * midY + ease * ease * fc.endPos.y;
      fc.mesh.position.z = oneMinusT * oneMinusT * fc.startPos.z + 2 * oneMinusT * ease * ((fc.startPos.z + fc.endPos.z) * 0.5) + ease * ease * fc.endPos.z;

      // Dynamic rotation: tumbling in flight
      fc.mesh.rotation.x = t * Math.PI * fc.spinSpeed;
      fc.mesh.rotation.z = t * Math.PI * 0.5 * fc.wobble;
      fc.mesh.rotation.y = Math.PI + Math.sin(t * Math.PI) * 0.3;

      // Scale: grow slightly then shrink into glass
      var sc;
      if (t < 0.3) {
        sc = 0.8 + t / 0.3 * 0.15; // grow to 0.95
      } else if (t < 0.7) {
        sc = 0.95; // maintain
      } else {
        sc = 0.95 * (1 - (t - 0.7) / 0.3 * 0.85); // shrink into glass
      }
      fc.mesh.scale.set(sc, sc, sc);

      if (t >= 1) {
        scene.remove(fc.mesh);
        fc.mesh.traverse(function(c) {
          if (c.geometry) c.geometry.dispose();
          if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
        });
        flyingCards.splice(i, 1);
      }
    }
  }

  // ===== MAIN LOOP =====
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!clock) return;
    var dt = clock.getDelta();
    if (dt > 0.1) dt = 0.1;

    // animTime at top level — shared across all systems
    animTime += dt;

    updateLiquid(dt);
    updateBubbles(dt);
    updateFlyingCards(dt);
    updateBokeh(dt);
    updateWarmLightPulse();

    // Roulette systems
    updateRouletteEnter(dt);
    updateRouletteExit(dt);
    updateRouletteSpin(dt);
    updateBallSparks(dt);
    updateRouletteSpotlight(dt);
    updateCameraTransition(dt);

    // Bartender
    if (animState === 'idle') animateIdle(dt);
    else if (animState === 'mixing') animateMixing(dt);
    animateBtReaction(dt);

    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // ===== RESIZE =====
  function handleResize() {
    if (!renderer || !camera) return;
    var p = renderer.domElement.parentElement;
    if (!p) return;
    var w = p.clientWidth, h = p.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ===== PUBLIC API =====
  window.initBombShotThree = function(canvas) {
    if (isInitialized) return;
    if (!canvas || typeof THREE === 'undefined') return;
    var p = canvas.parentElement;
    var w = p ? p.clientWidth : 400;
    var h = p ? p.clientHeight : 280;
    if (w === 0) w = 400; if (h === 0) h = 280;

    initMaterials();
    initConstants();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0a08);
    scene.fog = new THREE.FogExp2(0x0e0a08, 0.06);

    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
    camera.position.copy(barCamPos);
    camera.lookAt(barCamLook);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    scene.add(new THREE.AmbientLight(0x443322, 0.5));
    var dir = new THREE.DirectionalLight(0xffeedd, 0.7);
    dir.position.set(2, 5, 3); dir.castShadow = true;
    dir.shadow.mapSize.width = 512; dir.shadow.mapSize.height = 512;
    scene.add(dir);
    warmLight = new THREE.PointLight(0xffaa44, 0.55, 8);
    warmLight.position.set(0, 4.2, 0.5); scene.add(warmLight);
    var rim = new THREE.PointLight(0x88aaff, 0.2, 6);
    rim.position.set(-2.5, 2, -1); scene.add(rim);
    var back = new THREE.PointLight(0xff6633, 0.15, 5);
    back.position.set(0, 2, -3); scene.add(back);

    createRouletteSpotlight();

    initBubbles();
    createBar();
    createGlass();
    createLiquid();
    createBartender();
    createArms();
    createHands();
    updateArms();
    createBokehParticles();

    window.addEventListener('resize', handleResize);
    clock = new THREE.Clock();
    isInitialized = true;
    animate();
  };

  window.destroyBombShotThree = function() {
    if (!isInitialized) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', handleResize);
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    removeRouletteWheel();
    flyingCards.forEach(function(fc) {
      if (fc.mesh) { scene.remove(fc.mesh);
        fc.mesh.traverse(function(c) {
          if (c.geometry) c.geometry.dispose();
          if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
        });
      }
    });
    flyingCards = [];
    bubbles.forEach(function(b) { scene.remove(b.mesh); });
    bubbles = [];
    bokehParticles.forEach(function(p) { scene.remove(p.mesh); });
    bokehParticles = [];
    if (rouletteSpotlight) {
      scene.remove(rouletteSpotlight);
      if (rouletteSpotlight.target) scene.remove(rouletteSpotlight.target);
      rouletteSpotlight = null;
    }
    if (scene) {
      scene.traverse(function(c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
      });
    }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null; clock = null;
    glassGroup = null; liquidMesh = null; foamMesh = null;
    bartenderGroup = null; headGroup = null; bodyMesh = null; bowTieGroup = null;
    eyeL = null; eyeR = null; pupilL = null; pupilR = null; browL = null; browR = null;
    handL = null; handR = null;
    armUpperL = null; armUpperR = null; armLowerL = null; armLowerR = null;
    warmLight = null;
    isInitialized = false; animState = 'idle';
    liquidLevel = 0; targetLiquidLevel = 0;
    animTime = 0; idleVariant = 0; idleSwitchTimer = 0;
    mixCallback = null;
    rouletteState = 'hidden'; camState = 'bar';
    rouletteDiscGroup = null; rouletteDividers = [];
    rouletteBallSparks = []; rouletteBaseAngle = 0;
    btReaction = 'none'; btReactionTime = 0;
    mixElapsed = 0;
    if (bubbleGeo) { bubbleGeo.dispose(); bubbleGeo = null; }
    if (bubbleMat) { bubbleMat.dispose(); bubbleMat = null; }
  };

  window.bsUpdateGlass = function(cardCount, maxCards, drink) {
    targetLiquidLevel = Math.min(cardCount / Math.max(maxCards, 1), 1);
    if (drink && DRINK_COLORS[drink] !== undefined) {
      drinkColor.setHex(DRINK_COLORS[drink]);
      if (liquidMesh) {
        liquidMesh.material.color.copy(drinkColor);
        liquidMesh.material.emissive.copy(drinkColor);
      }
    }
  };

  window.bsAnimateSubmit = function(count, cardTypes, callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    for (var i = 0; i < count; i++) {
      spawnFlyingCard(cardTypes ? cardTypes[i] : null, i * 150);
    }
    var delay = count * 150 + 600;
    setTimeout(function() {
      if (!isInitialized) { if (callback) callback(); return; }
      animState = 'mixing';
      mixCallback = callback || null;
      armTimer = setTimeout(function() { endMixing(); armTimer = null; }, 1400);
    }, delay);
  };

  window.bsAnimateLiarReveal = function(callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    animState = 'mixing';
    if (browL) browL.position.y = 0.14;
    if (browR) browR.position.y = 0.14;
    if (eyeL) eyeL.scale.set(1.15, 1.15, 1);
    if (eyeR) eyeR.scale.set(1.15, 1.15, 1);
    armTimer = setTimeout(function() {
      if (!isInitialized) { if (callback) callback(); return; }
      if (eyeL) eyeL.scale.set(1, 1, 1);
      if (eyeR) eyeR.scale.set(1, 1, 1);
      endMixing();
      if (callback) callback();
      armTimer = null;
    }, 700);
  };

  // ===== ROULETTE ANIMATION PUBLIC API =====
  window.bsAnimateRouletteSetup = function(slots, targetName) {
    if (!isInitialized) return;
    // Create wheel and start entering
    createRouletteWheel(slots);
    rouletteState = 'entering';
    rouletteEnterTime = 0;
    // Camera transition to roulette view
    startCameraTransition('roulette');
  };

  window.bsAnimateRouletteSpin = function(slotIndex, slots) {
    if (!isInitialized) return;
    rouletteTargetSlot = slotIndex;
    rouletteState = 'spinning';
    rouletteSpinTime = 0;
    rouletteSlots = slots;
  };

  window.bsAnimateRouletteResult = function(result, targetName) {
    if (!isInitialized) return;
    // Trigger bartender reaction: bombshot or penalty = hit reaction, safe = safe
    btReaction = (result === 'bombshot' || result === 'penalty') ? 'hit' : 'safe';
    btReactionTime = 0;
  };

  window.bsAnimateCameraReturn = function() {
    if (!isInitialized) return;
    // Start wheel exit
    if (rouletteGroup) {
      rouletteState = 'exiting';
      rouletteExitTime = 0;
    }
    // Camera back to bar
    startCameraTransition('bar');
  };

  window.bsSetDrinkType = function(drink) {
    if (DRINK_COLORS[drink] !== undefined) {
      drinkColor.setHex(DRINK_COLORS[drink]);
      if (liquidMesh) {
        liquidMesh.material.color.copy(drinkColor);
        liquidMesh.material.emissive.copy(drinkColor);
      }
    }
  };

  window.bsResetGlass = function() {
    targetLiquidLevel = 0; liquidLevel = 0;
    if (liquidMesh) liquidMesh.visible = false;
    if (foamMesh) foamMesh.visible = false;
  };

  window.bsIsInitialized = function() { return isInitialized; };

})();

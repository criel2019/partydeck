// =============================================
// BOMB SHOT BLUFF — Three.js 3D Scene v2
// Charismatic Bartender with personality
// =============================================
(function() {
  'use strict';

  var scene, camera, renderer, clock, rafId;
  var isInitialized = false;

  // Scene objects
  var glassGroup, liquidMesh, foamMesh;
  var bartenderGroup, headGroup, bodyMesh, bowTieGroup;
  var eyeL, eyeR, pupilL, pupilR, browL, browR;
  // Hands positioned freely, arm cylinders stretch to connect
  var handL, handR;
  var armUpperL, armUpperR, armLowerL, armLowerR;
  var shoulderLPos, shoulderRPos;
  // Hand targets (animated each frame)
  var handLPos, handRPos;
  var handLRest, handRRest;

  // Particles
  var bubbles = [];
  var bubbleGeo, bubbleMat;
  var flyingCards = [];

  // State
  var liquidLevel = 0, targetLiquidLevel = 0;
  var drinkColor, animState = 'idle', animTime = 0;
  var idleVariant = 0, idleSwitchTimer = 0;
  var mixCallback = null, armTimer = null;

  // Constants
  var GLASS_R = 0.45, GLASS_H = 1.4, BAR_Y = 0.55, GLASS_Y, LIQUID_MAX;
  var BT_Z = -0.6, BODY_Y, HEAD_Y;
  var ARM_UPPER_LEN = 0.35, ARM_LOWER_LEN = 0.38;

  var DRINK_COLORS = { beer: 0xf5a623, soju: 0xd4f5e9, liquor: 0xc0792a };

  // Shared materials
  var matWhite, matVest, matSkin, matShirt;

  function initConstants() {
    GLASS_Y = BAR_Y + 0.08;
    LIQUID_MAX = GLASS_H * 0.82;
    BODY_Y = BAR_Y + 0.55;
    HEAD_Y = BODY_Y + 0.72;
    shoulderLPos = new THREE.Vector3(-0.52, BODY_Y + 0.28, BT_Z + 0.05);
    shoulderRPos = new THREE.Vector3(0.52, BODY_Y + 0.28, BT_Z + 0.05);
    handLRest = new THREE.Vector3(-0.55, BAR_Y + 0.18, 0.1);
    handRRest = new THREE.Vector3(0.55, BAR_Y + 0.18, 0.1);
    handLPos = handLRest.clone();
    handRPos = handRRest.clone();
  }

  function initMaterials() {
    matWhite = new THREE.MeshPhongMaterial({ color: 0xfefefe, shininess: 50 });
    matVest = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 35, specular: 0x222244 });
    matSkin = new THREE.MeshPhongMaterial({ color: 0xffdcb0, shininess: 15 });
    matShirt = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 25 });
    drinkColor = new THREE.Color(0xf5a623);
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
    // Brass edge
    var edgeMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100, specular: 0xffd700 });
    var edge = new THREE.Mesh(new THREE.BoxGeometry(5.55, 0.035, 0.06), edgeMat);
    edge.position.set(0, BAR_Y + 0.065, 1.6);
    g.add(edge);
    scene.add(g);
  }

  // ===== GLASS =====
  function createGlass() {
    glassGroup = new THREE.Group();
    // Body
    var gMat = new THREE.MeshPhongMaterial({
      color: 0xddeeff, transparent: true, opacity: 0.18,
      shininess: 150, specular: 0xaaddff, side: THREE.DoubleSide, depthWrite: false
    });
    var gMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R, GLASS_R * 0.82, GLASS_H, 32, 1, true), gMat);
    gMesh.position.y = GLASS_H / 2;
    glassGroup.add(gMesh);
    // Bottom
    var bMat = new THREE.MeshPhongMaterial({ color: 0xbbccdd, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    var bMesh = new THREE.Mesh(new THREE.CircleGeometry(GLASS_R * 0.82, 32), bMat);
    bMesh.rotation.x = -Math.PI / 2; bMesh.position.y = 0.01;
    glassGroup.add(bMesh);
    // Rim
    var rMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, shininess: 200, specular: 0xffffff
    });
    var rim = new THREE.Mesh(new THREE.TorusGeometry(GLASS_R, 0.03, 12, 32), rMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = GLASS_H;
    glassGroup.add(rim);
    // Specular streak
    var sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    var streak = new THREE.Mesh(new THREE.PlaneGeometry(0.05, GLASS_H * 0.6), sMat);
    streak.position.set(GLASS_R * 0.65, GLASS_H * 0.5, GLASS_R * 0.3); streak.rotation.y = 0.3;
    glassGroup.add(streak);

    glassGroup.position.set(0, GLASS_Y, 0.15);
    scene.add(glassGroup);
  }

  // ===== LIQUID + FOAM =====
  function createLiquid() {
    var mat = new THREE.MeshPhongMaterial({
      color: drinkColor, transparent: true, opacity: 0.85,
      shininess: 70, emissive: drinkColor, emissiveIntensity: 0.15
    });
    liquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R * 0.76, GLASS_R * 0.72, 0.01, 24, 1, false), mat);
    liquidMesh.position.set(0, GLASS_Y, 0.15);
    liquidMesh.visible = false;
    scene.add(liquidMesh);

    var fMat = new THREE.MeshPhongMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.6, shininess: 10 });
    foamMesh = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R * 0.74, GLASS_R * 0.76, 0.06, 24), fMat);
    foamMesh.visible = false;
    scene.add(foamMesh);
  }

  function updateLiquid(dt) {
    liquidLevel += (targetLiquidLevel - liquidLevel) * Math.min(dt * 3, 1);
    if (liquidLevel < 0.005) { liquidMesh.visible = false; foamMesh.visible = false; return; }
    liquidMesh.visible = true;
    var h = Math.max(0.04, liquidLevel * LIQUID_MAX);
    liquidMesh.scale.set(1, h / 0.01, 1);
    liquidMesh.position.y = GLASS_Y + h / 2;
    foamMesh.visible = liquidLevel > 0.04;
    foamMesh.position.set(0, GLASS_Y + h + 0.025, 0.15);
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
    if (liquidLevel > 0.04 && Math.random() < dt * 5 && bubbles.length < 15) {
      var m = new THREE.Mesh(bubbleGeo, bubbleMat);
      var s = 0.012 + Math.random() * 0.016;
      m.scale.set(s, s, s);
      var a = Math.random() * Math.PI * 2, r = Math.random() * GLASS_R * 0.5;
      m.position.set(Math.cos(a) * r, GLASS_Y + 0.04, 0.15 + Math.sin(a) * r);
      scene.add(m);
      bubbles.push({ mesh: m, spd: 0.1 + Math.random() * 0.18, wF: 2 + Math.random() * 3, wA: 0.008, t: Math.random() * 6 });
    }
    var maxY;
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i]; b.t += dt;
      b.mesh.position.y += b.spd * dt;
      b.mesh.position.x += Math.sin(b.t * b.wF) * b.wA * dt;
      maxY = GLASS_Y + Math.max(liquidLevel, 0.04) * LIQUID_MAX;
      if (b.mesh.position.y >= maxY) { scene.remove(b.mesh); bubbles.splice(i, 1); }
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

    // Shirt collar
    var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.1, 10), matShirt);
    collar.position.y = BODY_Y + 0.43;
    bartenderGroup.add(collar);

    // Shoulder pads (vest shoulders)
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
    // Head sphere
    headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), matSkin));
    // Hair (top cap)
    var hairMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05, shininess: 30 });
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.02;
    headGroup.add(hair);
    // Side hair
    var sideGeo = new THREE.SphereGeometry(0.08, 8, 6);
    var sL = new THREE.Mesh(sideGeo, hairMat); sL.position.set(-0.24, 0.02, 0); sL.scale.set(0.6, 1.2, 1);
    headGroup.add(sL);
    var sR = new THREE.Mesh(sideGeo, hairMat); sR.position.set(0.24, 0.02, 0); sR.scale.set(0.6, 1.2, 1);
    headGroup.add(sR);

    // Eyes
    var eMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
    eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eMat);
    eyeL.position.set(-0.09, 0.05, 0.21);
    headGroup.add(eyeL);
    eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eMat);
    eyeR.position.set(0.09, 0.05, 0.21);
    headGroup.add(eyeR);
    // Pupils
    var pMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pMat);
    pupilL.position.z = 0.032; eyeL.add(pupilL);
    pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pMat);
    pupilR.position.z = 0.032; eyeR.add(pupilR);
    // Eye shine
    var shMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var shGeo = new THREE.SphereGeometry(0.01, 6, 4);
    var shL = new THREE.Mesh(shGeo, shMat); shL.position.set(0.01, 0.01, 0.02); pupilL.add(shL);
    var shR = new THREE.Mesh(shGeo, shMat); shR.position.set(0.01, 0.01, 0.02); pupilR.add(shR);

    // Eyebrows
    var brMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
    browL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), brMat);
    browL.position.set(-0.09, 0.11, 0.21); browL.rotation.z = 0.12;
    headGroup.add(browL);
    browR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), brMat);
    browR.position.set(0.09, 0.11, 0.21); browR.rotation.z = -0.12;
    headGroup.add(browR);

    // Nose
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), matSkin);
    nose.position.set(0, -0.01, 0.24); nose.scale.set(0.85, 0.7, 0.6);
    headGroup.add(nose);

    // Mustache — handlebar
    var muMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
    headGroup.add(createMesh(new THREE.BoxGeometry(0.1, 0.032, 0.025), muMat, 0, -0.06, 0.22));
    var curlGeo = new THREE.TorusGeometry(0.03, 0.012, 6, 8, Math.PI);
    var cL = new THREE.Mesh(curlGeo, muMat); cL.position.set(-0.08, -0.06, 0.22); cL.rotation.z = Math.PI * 0.5;
    headGroup.add(cL);
    var cR = new THREE.Mesh(curlGeo, muMat); cR.position.set(0.08, -0.06, 0.22); cR.rotation.z = -Math.PI * 0.5;
    headGroup.add(cR);

    // Smile
    var smMat = new THREE.MeshPhongMaterial({ color: 0xcc8877 });
    var smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 4, 8, Math.PI), smMat);
    smile.position.set(0, -0.1, 0.21); smile.rotation.x = Math.PI;
    headGroup.add(smile);

    bartenderGroup.add(headGroup);
  }

  // ===== ARMS (stretch cylinders between shoulder and hand) =====
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
    // Palm
    var palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), matWhite);
    palm.scale.set(1.1, 0.7, 1.3); g.add(palm);
    // 4 Fingers
    var fGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.065, 5);
    for (var i = 0; i < 4; i++) {
      var f = new THREE.Mesh(fGeo, matWhite);
      f.position.set((i - 1.5) * 0.03, -0.015, 0.06); f.rotation.x = -0.3;
      g.add(f);
    }
    // Thumb
    var thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.015, 0.055, 5), matWhite);
    thumb.position.set(sign * 0.05, -0.005, 0.025); thumb.rotation.set(-0.2, 0, sign * 0.5);
    g.add(thumb);
    // Cuff
    var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.035, 8),
      new THREE.MeshPhongMaterial({ color: 0xdddddd }));
    cuff.position.y = 0.08; g.add(cuff);
    return g;
  }

  // Position a cylinder mesh between two points
  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 0, 1);
  function posCylBetween(mesh, a, b) {
    _v1.addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(_v1);
    _v2.subVectors(b, a);
    var len = _v2.length();
    mesh.scale.y = len;
    // Orient: default cylinder is Y-axis aligned, we want it from a to b
    _v2.normalize();
    var quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v2);
    mesh.quaternion.copy(quat);
  }

  // Simple 2-bone IK: returns elbow position given shoulder, hand
  function getElbow(shoulder, hand, sign) {
    var mid = _v1.addVectors(shoulder, hand).multiplyScalar(0.5);
    // Push elbow outward and slightly back
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

  // ===== IDLE ANIMATIONS =====
  // 0: Resting bob  1: Finger drum  2: Curious head tilt  3: Bow tie adjust
  function animateIdle(dt) {
    animTime += dt;
    idleSwitchTimer += dt;
    if (idleSwitchTimer > 4.0) {
      idleSwitchTimer = 0;
      idleVariant = (idleVariant + 1) % 4;
    }
    // Breathing
    if (bodyMesh) {
      bodyMesh.scale.x = 1 + Math.sin(animTime * 1.2) * 0.012;
      bodyMesh.scale.z = 1 + Math.sin(animTime * 1.2) * 0.008;
    }
    // Eye blink
    var blink = animTime % 3.8;
    var eyeY = (blink > 3.6 && blink < 3.72) ? 0.1 : 1;
    if (eyeL) eyeL.scale.y = eyeY;
    if (eyeR) eyeR.scale.y = eyeY;
    // Pupil wander
    var lkX = Math.sin(animTime * 0.6) * 0.012;
    var lkY = Math.sin(animTime * 0.45) * 0.006;
    if (pupilL) { pupilL.position.x = lkX; pupilL.position.y = lkY; }
    if (pupilR) { pupilR.position.x = lkX; pupilR.position.y = lkY; }

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
    // Left hand rests, right hand drums
    var bL = Math.sin(animTime * 1.3) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    // Right hand: tapping motion
    var tap = Math.abs(Math.sin(animTime * 6)) * 0.06;
    lerpV3(handRPos, { x: handRRest.x * 0.7, y: handRRest.y + tap, z: handRRest.z + 0.1 }, 8, dt);
    // Head bobs to rhythm
    if (headGroup) { headGroup.rotation.z = Math.sin(animTime * 3) * 0.02; headGroup.rotation.y = 0; headGroup.rotation.x = 0; }
  }

  function idleCurious(dt) {
    var bL = Math.sin(animTime * 1.1) * 0.03;
    var bR = Math.sin(animTime * 1.1 + 0.5) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    lerpV3(handRPos, { x: handRRest.x, y: handRRest.y + bR, z: handRRest.z }, 5, dt);
    // Head tilts and looks around
    if (headGroup) {
      headGroup.rotation.z = Math.sin(animTime * 0.4) * 0.1;
      headGroup.rotation.y = Math.sin(animTime * 0.3) * 0.08;
      headGroup.rotation.x = Math.sin(animTime * 0.25) * 0.03;
    }
    // Eyebrows raised (curious)
    if (browL) browL.position.y = 0.11 + Math.sin(animTime * 0.4) * 0.015;
    if (browR) browR.position.y = 0.11 + Math.sin(animTime * 0.4) * 0.015;
    // Pupils look at camera
    if (pupilL) { pupilL.position.x = 0; pupilL.position.z = 0.038; }
    if (pupilR) { pupilR.position.x = 0; pupilR.position.z = 0.038; }
  }

  function idleBowTie(dt) {
    // Right hand reaches up to bow tie
    var phase = (animTime * 0.7) % (Math.PI * 2);
    var reach = Math.max(0, Math.sin(phase));
    var btY = BODY_Y + 0.43 + BT_Z * 0; // bow tie world Y
    var targetR = {
      x: 0.1,
      y: handRRest.y + reach * (btY - handRRest.y + 0.4),
      z: handRRest.z - reach * 0.3
    };
    lerpV3(handRPos, targetR, 6, dt);
    // Left hand on bar
    var bL = Math.sin(animTime * 1.1) * 0.03;
    lerpV3(handLPos, { x: handLRest.x, y: handLRest.y + bL, z: handLRest.z }, 5, dt);
    // Head looks down during adjust
    if (headGroup) { headGroup.rotation.x = reach * 0.08; headGroup.rotation.z = 0; headGroup.rotation.y = 0; }
  }

  // ===== MIXING ANIMATION =====
  function animateMixing(dt) {
    animTime += dt;
    // Both hands circle the glass top
    var angle = animTime * 4.5;
    var mixR = 0.3;
    var topY = GLASS_Y + GLASS_H + 0.12;
    handLPos.set(Math.cos(angle) * mixR + 0.15, topY + Math.sin(animTime * 8) * 0.04, 0.15 + Math.sin(angle) * mixR);
    handRPos.set(Math.cos(angle + Math.PI) * mixR + 0.15, topY + Math.sin(animTime * 8 + Math.PI) * 0.04, 0.15 + Math.sin(angle + Math.PI) * mixR);
    updateArms();

    // Glass wobble
    if (glassGroup) {
      glassGroup.rotation.y = Math.sin(animTime * 6) * 0.035;
      glassGroup.position.x = Math.sin(animTime * 8) * 0.012;
    }
    // Head excited bobbing
    if (headGroup) {
      headGroup.rotation.z = Math.sin(animTime * 3) * 0.05;
      headGroup.rotation.y = Math.sin(animTime * 2) * 0.04;
    }
    // Raised eyebrows
    if (browL) browL.position.y = 0.13;
    if (browR) browR.position.y = 0.13;
  }

  function endMixing() {
    animState = 'idle';
    idleSwitchTimer = 0;
    if (glassGroup) { glassGroup.rotation.y = 0; glassGroup.position.x = 0; }
    if (browL) browL.position.y = 0.11; if (browR) browR.position.y = 0.11;
    if (headGroup) headGroup.rotation.set(0, 0, 0);
    handLPos.copy(handLRest); handRPos.copy(handRRest);
    updateArms();
    if (mixCallback) { var cb = mixCallback; mixCallback = null; cb(); }
  }

  // ===== CARD ANIMATIONS =====
  function createCardPlane(type) {
    var cardGeo = new THREE.PlaneGeometry(0.36, 0.52);
    var colors = { beer: '#f5a623', soju: '#4ecdc4', liquor: '#c0792a', water: '#5dade2' };
    var emojis = { beer: '🍺', soju: '🍶', liquor: '🥃', water: '💧' };
    // Back
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
    // Front
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
      card.position.set(0, 0.1, 2.5); card.rotation.set(0, Math.PI, 0); card.scale.set(0.7, 0.7, 0.7);
      scene.add(card);
      flyingCards.push({
        mesh: card, time: 0, duration: 0.65,
        startPos: card.position.clone(),
        endPos: new THREE.Vector3((Math.random() - 0.5) * 0.25, GLASS_Y + GLASS_H * 0.7 + Math.random() * 0.15, 0.15 + (Math.random() - 0.5) * 0.15)
      });
    }, delay);
  }

  function updateFlyingCards(dt) {
    for (var i = flyingCards.length - 1; i >= 0; i--) {
      var fc = flyingCards[i]; fc.time += dt;
      var t = Math.min(fc.time / fc.duration, 1);
      var ease = 1 - Math.pow(1 - t, 3);
      fc.mesh.position.lerpVectors(fc.startPos, fc.endPos, ease);
      fc.mesh.rotation.x = t * Math.PI * 2.5; fc.mesh.rotation.z = t * Math.PI * 0.4;
      fc.mesh.position.y += Math.sin(t * Math.PI) * 0.7;
      if (t > 0.65) { var s = 0.7 * (1 - (t - 0.65) / 0.35 * 0.8); fc.mesh.scale.set(s, s, s); }
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

    updateLiquid(dt);
    updateBubbles(dt);
    updateFlyingCards(dt);

    if (animState === 'idle') animateIdle(dt);
    else if (animState === 'mixing') animateMixing(dt);

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
    camera.position.set(0, 2.8, 3.8);
    camera.lookAt(0, 1.2, -0.1);

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
    var warm = new THREE.PointLight(0xffaa44, 0.65, 8);
    warm.position.set(0, 4.2, 0.5); scene.add(warm);
    var rim = new THREE.PointLight(0x88aaff, 0.2, 6);
    rim.position.set(-2.5, 2, -1); scene.add(rim);
    var back = new THREE.PointLight(0xff6633, 0.15, 5);
    back.position.set(0, 2, -3); scene.add(back);

    initBubbles();
    createBar();
    createGlass();
    createLiquid();
    createBartender();
    createArms();
    createHands();
    updateArms();

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
    isInitialized = false; animState = 'idle';
    liquidLevel = 0; targetLiquidLevel = 0;
    animTime = 0; idleVariant = 0; idleSwitchTimer = 0;
    mixCallback = null;
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
      animState = 'mixing'; animTime = 0;
      mixCallback = callback || null;
      armTimer = setTimeout(function() { endMixing(); armTimer = null; }, 1400);
    }, delay);
  };

  window.bsAnimateLiarReveal = function(callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    animState = 'mixing'; animTime = 0;
    // Surprise expression
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

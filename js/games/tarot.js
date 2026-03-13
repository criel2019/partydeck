// ═══════════════════════════════════════════════
//  별빛 타로 (Starlight Tarot) — PartyDeck Game
//  1인 전용 · 3D + 대화형 타로 리딩
// ═══════════════════════════════════════════════
(function(){
'use strict';

/* ═══════ GLOBALS ═══════ */
var _tarot = {}; // namespace to avoid polluting global scope
var scene, camera, renderer, clock, rafId;
var isSceneReady = false;

// Bartender meshes
var btGroup, btHeadGroup, btBody, btBowTie;
var btEyeL, btEyeR, btPupilL, btPupilR, btBrowL, btBrowR;
var btArmUpperL, btArmUpperR, btArmLowerL, btArmLowerR;
var btHandL, btHandR;
var btHandLPos, btHandRPos, btHandLRest, btHandRRest;
var btShoulderL, btShoulderR;

// Rabbit
var rabbitModel = null, rabbitBaseY = 0, rabbitScale = 1;
var rabbitMixer = null;

// Character selection
var selectedChar = null;

// Scene objects
var crystalBall, candleFlames = [], bokehParticles = [];

// Animation state
var animTime = 0;
var btAnimState = 'idle';
var rbAnimState = 'idle';
var idleVariant = 0, idleTimer = 0;

// Constants
var TABLE_Y = 0.4;
var BT_X = -0.7, BT_Z = -0.7;
var RB_X = 0.6, RB_Z = -0.3;
var HEAD_Y, BODY_Y;
var matSkin, matVest, matShirt, matWhite;

var CARD_SYMBOLS = [
  '🃏','⚡','🌙','🌟','👑','🏛','❤️','⚔️','⚖️','🔦',
  '🎡','💪','🔄','💀','🌿','😈','🏰','⭐','🌕','☀️','🔔','🌍'
];

// Tarot state
var cardData = [];
var selectedTopic = '', selectedSpread = 1;
var drawnCards = [], flippedCount = 0;
var storedReadings = null;
var candidateCards = [], selectedCardIndices = [];
var isReadingInProgress = false;

/* ═══════ KOREAN PARTICLE HELPER ═══════ */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function j(word, pair) {
  var c = (word || '').slice(-1).charCodeAt(0);
  var jong = (c >= 0xAC00 && c <= 0xD7A3) ? (c - 0xAC00) % 28 : 0;
  switch(pair) {
    case '이/가': return jong ? '이' : '가';
    case '은/는': return jong ? '은' : '는';
    case '을/를': return jong ? '을' : '를';
    case '와/과': case '과/와': return jong ? '과' : '와';
    case '으로/로': return (jong === 0 || jong === 8) ? '로' : '으로';
    case '이나/나': return jong ? '이나' : '나';
  }
  return '';
}

// Dialogue state
var dlgQueue = [], dlgTyping = false, dlgTypeTimer = null;
var dlgCallback = null, dlgFullText = '', dlgCharIdx = 0;
var TYPE_SPEED = 35;

// DOM refs (scoped to #tarotGame)
var $root, $dlg, $dlgText, $dlgName, $dlgIcon, $dlgNext, $dlgBox;
var $options, $topicSel, $spreadSel, $cardArea;

// Track if Three.js was loaded by us
var threeLoadedByTarot = false;

/* ═══════ DOM HELPER ═══════ */
function $t(id) { return document.getElementById(id); }

/* ═══════ THREE.JS BOOTSTRAP ═══════ */
// Tarot needs r155+ for proper GLB skeletal animation support.
// Other games use r128, so we save/restore the old THREE on cleanup.
var TAROT_THREE_VER = '0.155.0';
var _tarotOldTHREE = null;

function initThree(onReady) {
  var rev = (typeof THREE !== 'undefined' && THREE.REVISION) ? parseInt(THREE.REVISION) : 0;

  // If THREE r150+ with GLTFLoader already loaded, reuse it
  if (rev >= 150 && typeof THREE.GLTFLoader === 'function') { onReady(); return; }

  // Save old THREE (r128 from another game) to restore in cleanup
  if (typeof THREE !== 'undefined') {
    _tarotOldTHREE = THREE;
    window.THREE = undefined;
  }

  var s1 = document.createElement('script');
  s1.src = 'https://cdn.jsdelivr.net/npm/three@' + TAROT_THREE_VER + '/build/three.min.js';
  s1.onload = function() {
    threeLoadedByTarot = true;
    var s2 = document.createElement('script');
    s2.src = 'https://cdn.jsdelivr.net/npm/three@' + TAROT_THREE_VER + '/examples/js/loaders/GLTFLoader.js';
    s2.onload = function() { onReady(); };
    s2.onerror = function() { console.error('[Tarot] GLTFLoader 로드 실패'); onReady(); };
    document.head.appendChild(s2);
  };
  s1.onerror = function() {
    console.error('[Tarot] Three.js 로드 실패');
    // Fallback: restore old THREE if available
    if (_tarotOldTHREE) { window.THREE = _tarotOldTHREE; _tarotOldTHREE = null; }
    onReady();
  };
  document.head.appendChild(s1);
}

function setupScene() {
  var canvas = $t('tarotC3d');
  if (!canvas) return;
  var container = $t('tarotGame');
  var w = container.clientWidth || window.innerWidth;
  var h = container.clientHeight || window.innerHeight;

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06030f);
  scene.fog = new THREE.FogExp2(0x06030f, 0.12);

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
  camera.position.set(0, 2.2, 3.0);
  camera.lookAt(0, 0.9, -0.2);
  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0x1a1030, 0.4));
  var dir = new THREE.DirectionalLight(0x8888cc, 0.3);
  dir.position.set(2, 5, 3); scene.add(dir);

  var cL = new THREE.PointLight(0xff9944, 0.8, 4);
  cL.position.set(-1.0, TABLE_Y + 0.7, 0.1); scene.add(cL);
  var cR = new THREE.PointLight(0xff9944, 0.8, 4);
  cR.position.set(1.0, TABLE_Y + 0.7, 0.1); scene.add(cR);

  var crystalLight = new THREE.PointLight(0x7b6ef0, 0.5, 3);
  crystalLight.position.set(0, TABLE_Y + 0.5, 0.15); scene.add(crystalLight);

  var spot = new THREE.SpotLight(0xc9a84c, 0.4, 8, Math.PI / 6, 0.5);
  spot.position.set(0, 4, 1); spot.target.position.set(0, TABLE_Y, 0);
  scene.add(spot); scene.add(spot.target);

  matSkin  = new THREE.MeshPhongMaterial({ color: 0xffdcb0, shininess: 15 });
  matVest  = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 35, specular: 0x222244 });
  matShirt = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 25 });
  matWhite = new THREE.MeshPhongMaterial({ color: 0xfefefe, shininess: 50 });

  BODY_Y = TABLE_Y + 0.55;
  HEAD_Y = BODY_Y + 0.72;
  btShoulderL = new THREE.Vector3(BT_X - 0.42, BODY_Y + 0.28, BT_Z + 0.05);
  btShoulderR = new THREE.Vector3(BT_X + 0.42, BODY_Y + 0.28, BT_Z + 0.05);
  btHandLRest = new THREE.Vector3(BT_X - 0.45, TABLE_Y + 0.18, BT_Z + 0.55);
  btHandRRest = new THREE.Vector3(BT_X + 0.45, TABLE_Y + 0.18, BT_Z + 0.55);
  btHandLPos  = btHandLRest.clone();
  btHandRPos  = btHandRRest.clone();

  createTable();
  createCandles();
  createCrystalBall();
  createBartender();
  createArms();
  createHands();
  createBokeh();
  loadRabbit();

  isSceneReady = true;
  animate();
}

function onTarotResize() {
  if (!camera || !renderer) return;
  var container = $t('tarotGame');
  if (!container) return;
  var w = container.clientWidth || window.innerWidth;
  var h = container.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/* ═══════ TABLE & SCENE OBJECTS ═══════ */
function createTable() {
  var clothMat = new THREE.MeshPhongMaterial({ color: 0x1a0830, shininess: 10 });
  var table = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.4, 0.08, 32), clothMat);
  table.position.y = TABLE_Y; table.receiveShadow = true; scene.add(table);

  var rimMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100 });
  var rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.025, 8, 48), rimMat);
  rim.position.y = TABLE_Y + 0.04; rim.rotation.x = Math.PI / 2; scene.add(rim);

  var legMat = new THREE.MeshPhongMaterial({ color: 0x2a1510, shininess: 20 });
  var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, TABLE_Y, 8), legMat);
  leg.position.y = TABLE_Y / 2; scene.add(leg);

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
    new THREE.MeshPhongMaterial({ color: 0x08040e, shininess: 5 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  var wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5),
    new THREE.MeshPhongMaterial({ color: 0x0a0618, side: THREE.DoubleSide }));
  wall.position.set(0, 2.5, -2.5); scene.add(wall);

  var cMat = new THREE.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
  [0.5, 0.8].forEach(function(r) {
    var c = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.02, 32), cMat);
    c.rotation.x = -Math.PI / 2; c.position.y = TABLE_Y + 0.045; scene.add(c);
  });
}

function createCandles() {
  var pos = [[-1.05, 0.3], [1.05, 0.3], [-0.4, -0.9], [0.4, -0.9]];
  var cMat = new THREE.MeshPhongMaterial({ color: 0xf0e8d0 });
  var hMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 80 });
  var fMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
  pos.forEach(function(p) {
    var candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.25, 8), cMat);
    candle.position.set(p[0], TABLE_Y + 0.17, p[1]); scene.add(candle);
    var holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.06, 8), hMat);
    holder.position.set(p[0], TABLE_Y + 0.06, p[1]); scene.add(holder);
    var flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), fMat);
    flame.position.set(p[0], TABLE_Y + 0.32, p[1]); flame.scale.set(0.8, 1.5, 0.8);
    scene.add(flame);
    candleFlames.push({ mesh: flame, baseY: TABLE_Y + 0.32, ph: Math.random() * 6.28 });
  });
}

function createCrystalBall() {
  var bMat = new THREE.MeshPhongMaterial({
    color: 0x6655cc, transparent: true, opacity: 0.3, shininess: 200, specular: 0xaaaaff });
  crystalBall = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), bMat);
  crystalBall.position.set(0, TABLE_Y + 0.24, 0.15); scene.add(crystalBall);
  var core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x7b6ef0, transparent: true, opacity: 0.4 }));
  crystalBall.add(core);
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.06, 12),
    new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 80 }));
  base.position.set(0, TABLE_Y + 0.07, 0.15); scene.add(base);
}

/* ═══════ BARTENDER (Procedural) ═══════ */
function createBartender() {
  btGroup = new THREE.Group();
  btGroup.position.set(BT_X, 0, BT_Z);

  btBody = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.72, 12), matVest);
  btBody.position.y = BODY_Y; btGroup.add(btBody);

  var btnMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 100 });
  for (var i = 0; i < 3; i++) {
    var btn = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), btnMat);
    btn.position.set(0, BODY_Y + 0.1 - i * 0.15, 0.3); btGroup.add(btn);
  }

  var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 10), matShirt);
  collar.position.y = BODY_Y + 0.38; btGroup.add(collar);

  var pGeo = new THREE.SphereGeometry(0.1, 8, 6);
  [-1, 1].forEach(function(s) {
    var pad = new THREE.Mesh(pGeo, matVest);
    pad.position.set(s * 0.36, BODY_Y + 0.25, 0.05); pad.scale.set(1, 0.8, 1.1);
    btGroup.add(pad);
  });

  btBowTie = new THREE.Group();
  btBowTie.position.set(0, BODY_Y + 0.38, 0.18);
  var bMat = new THREE.MeshPhongMaterial({ color: 0xcc0022, shininess: 40 });
  btBowTie.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), bMat));
  var wGeo = new THREE.BoxGeometry(0.06, 0.04, 0.02);
  [-1, 1].forEach(function(s) {
    var w = new THREE.Mesh(wGeo, bMat); w.position.x = s * 0.04; w.rotation.z = s * -0.25;
    btBowTie.add(w);
  });
  btGroup.add(btBowTie);

  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), matSkin);
  neck.position.y = BODY_Y + 0.44; btGroup.add(neck);

  btHeadGroup = new THREE.Group();
  btHeadGroup.position.y = HEAD_Y;
  btHeadGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), matSkin));

  var hairMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05, shininess: 30 });
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 0.02; btHeadGroup.add(hair);
  var sGeo = new THREE.SphereGeometry(0.07, 8, 6);
  [-1, 1].forEach(function(s) {
    var side = new THREE.Mesh(sGeo, hairMat);
    side.position.set(s * 0.21, 0.02, 0); side.scale.set(0.6, 1.2, 1);
    btHeadGroup.add(side);
  });

  var eMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
  var pMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
  var shMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var shGeo = new THREE.SphereGeometry(0.008, 6, 4);

  btEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eMat);
  btEyeL.position.set(-0.08, 0.04, 0.19); btHeadGroup.add(btEyeL);
  btEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eMat);
  btEyeR.position.set(0.08, 0.04, 0.19); btHeadGroup.add(btEyeR);

  btPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), pMat);
  btPupilL.position.z = 0.028; btEyeL.add(btPupilL);
  btPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), pMat);
  btPupilR.position.z = 0.028; btEyeR.add(btPupilR);
  btPupilL.add(new THREE.Mesh(shGeo, shMat)).position.set(0.008, 0.008, 0.015);
  btPupilR.add(new THREE.Mesh(shGeo, shMat)).position.set(0.008, 0.008, 0.015);

  var brMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
  btBrowL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.018), brMat);
  btBrowL.position.set(-0.08, 0.09, 0.19); btBrowL.rotation.z = 0.1; btHeadGroup.add(btBrowL);
  btBrowR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.018), brMat);
  btBrowR.position.set(0.08, 0.09, 0.19); btBrowR.rotation.z = -0.1; btHeadGroup.add(btBrowR);

  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), matSkin);
  nose.position.set(0, -0.01, 0.21); nose.scale.set(0.85, 0.7, 0.6); btHeadGroup.add(nose);

  var muMat = new THREE.MeshPhongMaterial({ color: 0x1a0e05 });
  var muBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.028, 0.02), muMat);
  muBar.position.set(0, -0.05, 0.19); btHeadGroup.add(muBar);
  var curlGeo = new THREE.TorusGeometry(0.025, 0.01, 6, 8, Math.PI);
  [-1, 1].forEach(function(s) {
    var curl = new THREE.Mesh(curlGeo, muMat);
    curl.position.set(s * 0.07, -0.05, 0.19); curl.rotation.z = s * Math.PI * 0.5;
    btHeadGroup.add(curl);
  });

  var smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 4, 8, Math.PI),
    new THREE.MeshPhongMaterial({ color: 0xcc8877 }));
  smile.position.set(0, -0.085, 0.18); smile.rotation.x = Math.PI; btHeadGroup.add(smile);

  btGroup.add(btHeadGroup);
  scene.add(btGroup);
}

/* ═══════ ARMS & HANDS ═══════ */
function createArms() {
  var uGeo = new THREE.CylinderGeometry(0.055, 0.05, 1, 8);
  var lGeo = new THREE.CylinderGeometry(0.045, 0.04, 1, 8);
  btArmUpperL = new THREE.Mesh(uGeo, matVest); scene.add(btArmUpperL);
  btArmUpperR = new THREE.Mesh(uGeo.clone(), matVest); scene.add(btArmUpperR);
  btArmLowerL = new THREE.Mesh(lGeo, matShirt); scene.add(btArmLowerL);
  btArmLowerR = new THREE.Mesh(lGeo.clone(), matShirt); scene.add(btArmLowerR);
}
function createHands() {
  btHandL = mkHand(); scene.add(btHandL);
  btHandR = mkHand(); scene.add(btHandR);
}
function mkHand() {
  var g = new THREE.Group();
  var palm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), matWhite);
  palm.scale.set(1.1, 0.7, 1.3); g.add(palm);
  var fGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.055, 5);
  for (var i = 0; i < 4; i++) {
    var f = new THREE.Mesh(fGeo, matWhite);
    f.position.set((i - 1.5) * 0.025, -0.012, 0.05); f.rotation.x = -0.3; g.add(f);
  }
  return g;
}

var _v1, _v2;
function posCyl(mesh, a, b) {
  if(!_v1){ _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); }
  _v1.addVectors(a, b).multiplyScalar(0.5); mesh.position.copy(_v1);
  _v2.subVectors(b, a); mesh.scale.y = _v2.length(); _v2.normalize();
  var q = new THREE.Quaternion(); q.setFromUnitVectors(new THREE.Vector3(0,1,0), _v2);
  mesh.quaternion.copy(q);
}
function getElbow(sh, hd, sign) {
  return new THREE.Vector3((sh.x+hd.x)*0.5 + sign*0.1, (sh.y+hd.y)*0.5+0.08, (sh.z+hd.z)*0.5-0.06);
}
function updateArms() {
  if (!btArmUpperL) return;
  var eL = getElbow(btShoulderL, btHandLPos, -1);
  posCyl(btArmUpperL, btShoulderL, eL); posCyl(btArmLowerL, eL, btHandLPos);
  btHandL.position.copy(btHandLPos);
  var eR = getElbow(btShoulderR, btHandRPos, 1);
  posCyl(btArmUpperR, btShoulderR, eR); posCyl(btArmLowerR, eR, btHandRPos);
  btHandR.position.copy(btHandRPos);
}

/* ═══════ RABBIT LOADER ═══════ */
function loadRabbit() {
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return;
  new THREE.GLTFLoader().load('Models/rabbit.glb', function(gltf) {
    if (!isSceneReady) return;
    rabbitModel = gltf.scene;
    // r155+: skinning is automatic, keep original materials intact
    rabbitModel.traverse(function(c) {
      if (c.isMesh) c.castShadow = true;
    });
    var box = new THREE.Box3().setFromObject(rabbitModel);
    var sz = new THREE.Vector3(); box.getSize(sz);
    var maxDim = Math.max(sz.x, sz.y, sz.z);
    rabbitScale = 0.9 / maxDim;
    rabbitModel.scale.set(rabbitScale, rabbitScale, rabbitScale);
    box.setFromObject(rabbitModel);
    var center = new THREE.Vector3(); box.getCenter(center);
    rabbitModel.position.x = RB_X - center.x;
    rabbitModel.position.y = TABLE_Y + 0.04 - box.min.y;
    rabbitModel.position.z = RB_Z - center.z;
    rabbitBaseY = rabbitModel.position.y;
    rabbitModel.rotation.y = -0.3;
    scene.add(rabbitModel);

    // Play Idle animation if available
    console.log('[Tarot] 토끼 모델 로드 성공. 애니메이션 수:', gltf.animations ? gltf.animations.length : 0);
    if (gltf.animations && gltf.animations.length > 0) {
      console.log('[Tarot] 애니메이션 목록:', gltf.animations.map(function(a){ return a.name; }));
      rabbitMixer = new THREE.AnimationMixer(rabbitModel);
      var idleClip = null;
      for (var i = 0; i < gltf.animations.length; i++) {
        var clip = gltf.animations[i];
        if (/idle/i.test(clip.name)) { idleClip = clip; break; }
      }
      if (!idleClip) idleClip = gltf.animations[0];
      var action = rabbitMixer.clipAction(idleClip);
      action.timeScale = 0.6;
      action.play();
      console.log('[Tarot] 토끼 Idle 애니메이션 재생:', idleClip.name, 'duration:', idleClip.duration);
      // Debug: count skinned meshes
      var skinnedCount = 0;
      rabbitModel.traverse(function(c) { if (c.isSkinnedMesh) skinnedCount++; });
      console.log('[Tarot] SkinnedMesh 수:', skinnedCount);
    } else {
      console.warn('[Tarot] 토끼 모델에 애니메이션 없음');
    }
  }, undefined, function(err) {
    console.warn('[Tarot] 토끼 모델 로드 실패:', err && err.message ? err.message : err);
  });
}

/* ═══════ BOKEH ═══════ */
function createBokeh() {
  var geo = new THREE.SphereGeometry(0.04, 6, 4);
  for (var i = 0; i < 25; i++) {
    var col = [0xffcc66, 0x8877ff, 0xff8855][i % 3];
    var mat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.06 + Math.random() * 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var m = new THREE.Mesh(geo, mat);
    var x = (Math.random()-0.5)*5, y = 0.8+Math.random()*3.5, z = -3+Math.random()*4;
    m.position.set(x, y, z);
    var sc = 0.3+Math.random()*1.2; m.scale.set(sc,sc,sc);
    scene.add(m);
    bokehParticles.push({
      mesh:m, baseY:y, baseX:x,
      phY:Math.random()*6.28, phX:Math.random()*6.28,
      spY:0.15+Math.random()*0.25, spX:0.08+Math.random()*0.12,
      ampY:0.1+Math.random()*0.2, ampX:0.08+Math.random()*0.15
    });
  }
}

/* ═══════ ANIMATION ═══════ */
function lv(t, d, sp, dt) {
  t.x += (d.x-t.x)*Math.min(sp*dt,1);
  t.y += (d.y-t.y)*Math.min(sp*dt,1);
  t.z += (d.z-t.z)*Math.min(sp*dt,1);
}

function animBartender(dt) {
  if (btBody) {
    var br = Math.sin(animTime)*0.5+0.5;
    btBody.scale.x = 1+br*0.015; btBody.scale.z = 1+br*0.01;
    btBody.rotation.z = Math.sin(animTime*0.25)*0.006;
  }
  var bc = animTime % 4.2, bo = 1;
  if (bc>3.9&&bc<3.98) bo=0.08; else if(bc>4.02&&bc<4.08) bo=0.15;
  if (btEyeL) btEyeL.scale.y = bo;
  if (btEyeR) btEyeR.scale.y = bo;
  var gx = Math.sin(animTime*0.5)*0.01, gy = Math.sin(animTime*0.38)*0.005;
  if (btPupilL){btPupilL.position.x=gx;btPupilL.position.y=gy;}
  if (btPupilR){btPupilR.position.x=gx;btPupilR.position.y=gy;}

  if (btAnimState==='talking') btAnim_talking(dt);
  else if (btAnimState==='thinking') btAnim_thinking(dt);
  else if (btAnimState==='surprised') btAnim_surprised(dt);
  else btAnim_idle(dt);
  updateArms();
}

function btAnim_idle(dt) {
  idleTimer+=dt; if(idleTimer>5){idleTimer=0;idleVariant=(idleVariant+1)%3;}
  var bL=Math.sin(animTime*1.3)*0.03, bR=Math.sin(animTime*1.3+0.7)*0.03;
  lv(btHandLPos,{x:btHandLRest.x,y:btHandLRest.y+bL,z:btHandLRest.z},5,dt);
  lv(btHandRPos,{x:btHandRRest.x,y:btHandRRest.y+bR,z:btHandRRest.z},5,dt);
  if(btHeadGroup){
    btHeadGroup.rotation.z=Math.sin(animTime*0.5)*0.02*(idleVariant===1?4:1);
    btHeadGroup.rotation.y=Math.sin(animTime*0.3)*(idleVariant===1?0.06:0.01);
    btHeadGroup.rotation.x=0;
  }
  if(btBrowL) btBrowL.position.y=0.09;
  if(btBrowR) btBrowR.position.y=0.09;
}

function btAnim_talking(dt) {
  if(btHeadGroup){
    btHeadGroup.rotation.x=Math.sin(animTime*2.5)*0.04;
    btHeadGroup.rotation.z=Math.sin(animTime*1.8)*0.05;
    btHeadGroup.rotation.y=Math.sin(animTime*1.2)*0.04;
  }
  var g=Math.sin(animTime*2)*0.08;
  lv(btHandRPos,{x:btHandRRest.x-0.1,y:btHandRRest.y+0.15+g,z:btHandRRest.z-0.1},4,dt);
  lv(btHandLPos,{x:btHandLRest.x,y:btHandLRest.y+Math.sin(animTime*1.3)*0.02,z:btHandLRest.z},5,dt);
  if(btBrowL) btBrowL.position.y=0.1;
  if(btBrowR) btBrowR.position.y=0.1;
}

function btAnim_thinking(dt) {
  if(btHeadGroup){
    btHeadGroup.rotation.x=-0.06+Math.sin(animTime*0.8)*0.02;
    btHeadGroup.rotation.z=0.08;
    btHeadGroup.rotation.y=Math.sin(animTime*0.5)*0.03;
  }
  lv(btHandRPos,{x:BT_X+0.1,y:HEAD_Y-0.12,z:BT_Z+0.35},3,dt);
  lv(btHandLPos,{x:btHandLRest.x,y:btHandLRest.y+Math.sin(animTime)*0.02,z:btHandLRest.z},5,dt);
  if(btEyeL) btEyeL.scale.y=Math.min(btEyeL.scale.y,0.85);
  if(btEyeR) btEyeR.scale.y=Math.min(btEyeR.scale.y,0.85);
  if(btBrowL){btBrowL.position.y=0.082;btBrowL.rotation.z=0.15;}
  if(btBrowR){btBrowR.position.y=0.105;btBrowR.rotation.z=-0.05;}
}

function btAnim_surprised(dt) {
  if(btHeadGroup){btHeadGroup.rotation.x=-0.08;btHeadGroup.rotation.z=Math.sin(animTime*4)*0.03;}
  if(btEyeL) btEyeL.scale.set(1.15,1.15,1);
  if(btEyeR) btEyeR.scale.set(1.15,1.15,1);
  if(btBrowL) btBrowL.position.y=0.115;
  if(btBrowR) btBrowR.position.y=0.115;
  lv(btHandRPos,{x:btHandRRest.x-0.1,y:btHandRRest.y+0.2,z:btHandRRest.z-0.05},6,dt);
  lv(btHandLPos,{x:btHandLRest.x+0.1,y:btHandLRest.y+0.15,z:btHandLRest.z-0.05},6,dt);
}

function animRabbit(dt) {
  if (!rabbitModel) return;
  var s = rabbitScale;
  // When mixer handles skeletal Idle, only apply gentle root motion
  if (rabbitMixer) {
    if (rbAnimState==='talking') {
      rabbitModel.rotation.y = -0.3+Math.sin(animTime*5)*0.08;
      rabbitModel.rotation.z = Math.sin(animTime*6.5)*0.06;
      rabbitModel.position.y = rabbitBaseY+Math.abs(Math.sin(animTime*7))*0.02;
    } else if (rbAnimState==='excited') {
      var bounce = Math.abs(Math.sin(animTime*6))*0.06;
      rabbitModel.position.y = rabbitBaseY+bounce;
      rabbitModel.rotation.y = -0.3+Math.sin(animTime*4)*0.15;
    } else {
      // idle: let mixer handle it, only subtle root sway
      rabbitModel.position.y = rabbitBaseY+Math.sin(animTime*1.5)*0.005;
      rabbitModel.rotation.y = -0.3+Math.sin(animTime*0.4)*0.03;
    }
    return;
  }
  // Fallback: no mixer (manual animation)
  if (rbAnimState==='talking') {
    var sq = 1+Math.sin(animTime*8)*0.06;
    var st = 1+Math.sin(animTime*8+Math.PI)*0.04;
    rabbitModel.scale.set(s*st, s*sq, s*st);
    rabbitModel.rotation.y = -0.3+Math.sin(animTime*5)*0.08;
    rabbitModel.rotation.z = Math.sin(animTime*6.5)*0.06;
    rabbitModel.position.y = rabbitBaseY+Math.abs(Math.sin(animTime*7))*0.02;
  } else if (rbAnimState==='excited') {
    var bounce = Math.abs(Math.sin(animTime*6))*0.06;
    rabbitModel.position.y = rabbitBaseY+bounce;
    rabbitModel.rotation.y = -0.3+Math.sin(animTime*4)*0.15;
    rabbitModel.rotation.z = Math.sin(animTime*5)*0.1;
    rabbitModel.scale.set(s,s,s);
  } else {
    var bob = Math.sin(animTime*1.5)*0.008;
    rabbitModel.position.y = rabbitBaseY+bob;
    rabbitModel.rotation.y = -0.3+Math.sin(animTime*0.4)*0.03;
    rabbitModel.rotation.z = Math.sin(animTime*0.6)*0.015;
    var bsc = s*(1+Math.sin(animTime*1.5)*0.01);
    rabbitModel.scale.set(s, bsc, s);
  }
}

function animScene(dt) {
  candleFlames.forEach(function(f) {
    f.mesh.position.y = f.baseY+Math.sin(animTime*8+f.ph)*0.008;
    var fs = 0.8+Math.sin(animTime*12+f.ph)*0.2;
    f.mesh.scale.x=fs; f.mesh.scale.z=fs;
    f.mesh.scale.y = 1.5+Math.sin(animTime*10+f.ph)*0.3;
  });
  if (crystalBall) {
    crystalBall.material.opacity = 0.3+Math.sin(animTime*1.5)*0.1;
    crystalBall.rotation.y += dt*0.2;
    if(crystalBall.children[0]){
      crystalBall.children[0].material.opacity = 0.3+Math.sin(animTime*2)*0.15;
      crystalBall.children[0].scale.setScalar(1+Math.sin(animTime*1.8)*0.15);
    }
  }
  bokehParticles.forEach(function(p) {
    p.mesh.position.y = p.baseY+Math.sin(animTime*p.spY+p.phY)*p.ampY;
    p.mesh.position.x = p.baseX+Math.sin(animTime*p.spX+p.phX)*p.ampX;
  });
}

function animate() {
  rafId = requestAnimationFrame(animate);
  if (!isSceneReady) return;
  var dt = Math.min(clock.getDelta(), 0.05);
  animTime += dt;
  if (rabbitMixer) rabbitMixer.update(dt);
  animBartender(dt);
  animRabbit(dt);
  animScene(dt);
  renderer.render(scene, camera);
}

/* ═══════ DIALOGUE ENGINE ═══════ */
function initDlgRefs() {
  $root     = $t('tarotGame');
  $dlg      = $t('tarotDialogue');
  $dlgText  = $t('tarotDlgText');
  $dlgName  = $t('tarotDlgName');
  $dlgIcon  = $t('tarotDlgIcon');
  $dlgNext  = $t('tarotDlgNext');
  $dlgBox   = $t('tarotDlgBox');
  $options  = $t('tarotOptions');
  $topicSel = $t('tarotTopicSelect');
  $spreadSel= $t('tarotSpreadSelect');
  $cardArea = $t('tarotCardArea');
}

function say(ch, text, opts) {
  if (selectedChar && ch !== selectedChar) return;
  opts = opts || {};
  dlgQueue.push({ ch:ch, text:text, pause:opts.pause||0, onDone:opts.onDone||null, anim:opts.anim||null });
  if (!dlgTyping && dlgQueue.length===1) processMsg();
}

function processMsg() {
  if (!dlgQueue.length) {
    dlgTyping = false;
    if (dlgCallback) { var cb=dlgCallback; dlgCallback=null; cb(); }
    return;
  }
  var msg = dlgQueue[0];
  dlgTyping = true;

  if (msg.ch==='bt') {
    $dlgIcon.className='tarot-dlg-icon bt'; $dlgIcon.textContent='🤵';
    $dlgName.className='tarot-dlg-name'; $dlgName.textContent='바텐더';
    btAnimState = msg.anim || 'talking'; rbAnimState = 'idle';
  } else {
    $dlgIcon.className='tarot-dlg-icon rb'; $dlgIcon.textContent='🐰';
    $dlgName.className='tarot-dlg-name rb-name'; $dlgName.textContent='루나';
    rbAnimState = msg.anim || 'talking'; btAnimState = 'idle';
  }

  $dlg.classList.add('show');
  $dlgNext.classList.add('hidden');
  $dlgText.textContent = '';
  dlgFullText = msg.text; dlgCharIdx = 0;
  setTimeout(typeNext, msg.pause || 0);
}

function typeNext() {
  if (dlgCharIdx < dlgFullText.length) {
    dlgCharIdx++;
    $dlgText.textContent = dlgFullText.substring(0, dlgCharIdx);
    dlgTypeTimer = setTimeout(typeNext, TYPE_SPEED);
  } else {
    $dlgNext.classList.remove('hidden');
    var nextSameCh = dlgQueue.length > 1 && dlgQueue[1].ch === dlgQueue[0].ch;
    if (!nextSameCh) { btAnimState='idle'; rbAnimState='idle'; }
  }
}

function advDlg() {
  if (dlgTyping && dlgCharIdx<dlgFullText.length) {
    clearTimeout(dlgTypeTimer);
    dlgCharIdx=dlgFullText.length;
    $dlgText.textContent=dlgFullText;
    $dlgNext.classList.remove('hidden');
    var nextSameCh = dlgQueue.length > 1 && dlgQueue[1].ch === dlgQueue[0].ch;
    if (!nextSameCh) { btAnimState='idle'; rbAnimState='idle'; }
    return;
  }
  dlgQueue.shift();
  if (dlgQueue.length) processMsg();
  else { dlgTyping=false; btAnimState='idle'; rbAnimState='idle'; if(dlgCallback){var cb=dlgCallback;dlgCallback=null;cb();} }
}

function hideDlg() {
  $dlg.classList.remove('show'); dlgQueue=[]; dlgTyping=false; clearTimeout(dlgTypeTimer);
}

function showOpts(opts) {
  hideDlg();
  $options.innerHTML='';
  opts.forEach(function(o) {
    var btn = document.createElement('button'); btn.className='tarot-opt-btn';
    btn.textContent=o.text;
    btn.onclick=function(){ $options.classList.remove('show'); o.action(); };
    $options.appendChild(btn);
  });
  setTimeout(function(){$options.classList.add('show');},300);
}

/* ═══════ TAROT DATA ═══════ */
function loadCards(cb) {
  fetch('data/cards/major_arcana.json')
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){ cardData=d; cb(); })
    .catch(function(e){ console.error('[Tarot] 카드 데이터 로드 실패:', e.message||e); cardData=[]; cb(); });
}

function drawCandidates() {
  candidateCards=[]; selectedCardIndices=[]; var pool=cardData.slice();
  for(var i=0;i<5;i++){
    var idx=Math.floor(Math.random()*pool.length);
    var c=JSON.parse(JSON.stringify(pool[idx]));
    c.isReversed=Math.random()<0.35;
    pool.splice(idx,1);
    candidateCards.push(c);
  }
}

function toRoman(n){
  if(!n) return '0';
  var v=[10,9,5,4,1],s=['X','IX','V','IV','I'],r='';
  for(var i=0;i<v.length;i++) while(n>=v[i]){r+=s[i];n-=v[i];}
  return r;
}

function topicKey() {
  var direct = {love:'love', career:'career', finance:'finance'};
  if (direct[selectedTopic]) return direct[selectedTopic];
  var fallbacks = ['love', 'career', 'finance'];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/* ═══════ CANDIDATE CARD SELECTION ═══════ */
function showCandidateCards() {
  $cardArea.innerHTML='';
  $cardArea.classList.add('candidate-grid');
  candidateCards.forEach(function(card, idx) {
    var slot=document.createElement('div');
    slot.className='tarot-card-slot entering';
    slot.style.animationDelay=(idx*0.12)+'s';

    var inner=document.createElement('div'); inner.className='tarot-card-inner';
    var back=document.createElement('div'); back.className='tarot-card-back';
    var pat=document.createElement('div'); pat.className='tarot-card-pattern';
    back.appendChild(pat); inner.appendChild(back);

    var front=document.createElement('div');
    front.className='tarot-card-front'+(card.isReversed?' reversed-front':'');
    front.innerHTML=
      '<div class="tarot-card-numeral">'+toRoman(card.number)+'</div>'+
      '<div class="tarot-card-name-en">'+card.name_en+'</div>'+
      '<div class="tarot-card-symbol">'+(CARD_SYMBOLS[card.number]||'✦')+'</div>'+
      '<div class="tarot-card-name-kr">'+card.name_kr+'</div>'+
      '<div class="tarot-card-direction '+(card.isReversed?'reversed':'upright')+'">'+(card.isReversed?'역위치 ↺':'정위치 ↑')+'</div>'+
      '<div class="tarot-card-keywords">'+(card.isReversed?card.keywords.reversed:card.keywords.upright).slice(0,3).join(' · ')+'</div>';
    inner.appendChild(front);
    slot.appendChild(inner);

    (function(i){ slot.onclick=function(){ onCandidateClicked(i); }; })(idx);
    $cardArea.appendChild(slot);
  });
  setTimeout(function(){$cardArea.classList.add('show');},200);
}

function onCandidateClicked(idx) {
  if(isReadingInProgress) return;
  var slots=$cardArea.querySelectorAll('.tarot-card-slot');
  var slot=slots[idx];
  if(!slot) return;

  var pos=selectedCardIndices.indexOf(idx);
  if(pos!==-1) {
    selectedCardIndices.splice(pos,1);
    slot.classList.remove('candidate-selected');
    var badge=slot.querySelector('.tarot-candidate-order');
    if(badge) badge.remove();
    selectedCardIndices.forEach(function(ci,i){
      var b=slots[ci].querySelector('.tarot-candidate-order');
      if(b) b.textContent=i+1;
    });
    return;
  }

  if(selectedCardIndices.length>=selectedSpread) return;
  selectedCardIndices.push(idx);
  slot.classList.add('candidate-selected');

  if(selectedSpread===3){
    var num=document.createElement('div');
    num.className='tarot-candidate-order';
    num.textContent=selectedCardIndices.length;
    slot.appendChild(num);
  }

  if(selectedCardIndices.length===selectedSpread){
    finalizeCandidateSelection();
  }
}

function finalizeCandidateSelection() {
  isReadingInProgress=true;
  var slots=$cardArea.querySelectorAll('.tarot-card-slot');
  slots.forEach(function(slot,idx){
    if(selectedCardIndices.indexOf(idx)===-1){
      slot.classList.add('candidate-rejected');
    }
  });
  drawnCards=[];
  selectedCardIndices.forEach(function(ci){ drawnCards.push(candidateCards[ci]); });

  setTimeout(function(){
    isReadingInProgress=false;
    flippedCount=0;
    storedReadings=generateAllReadings();
    showCards();
  },800);
}

/* ═══════ REACTION PATTERNS ═══════ */
var RX_BT_UP = [
  [{c:'bt',t:'음...',pause:400},{c:'bt',t:'...흥미로운 카드가 나왔군요.'}],
  [{c:'bt',t:'오...'},{c:'bt',t:'후후... 이 카드가 당신을 골랐습니다.'}],
  [{c:'bt',t:'......'},{c:'bt',t:'...좋은 기운이 느껴집니다. 천천히 이야기해 드리지요.'}],
  [{c:'bt',t:'허...'},{c:'bt',t:'의미 깊은 카드입니다. 잠시 들여다보겠습니다.',pause:500}],
  [{c:'bt',t:'...'},{c:'bt',t:'이 카드가 나올 줄 알았다고 하면... 믿으시겠습니까?'}],
  [{c:'bt',t:'이런...',pause:300},{c:'bt',t:'별빛이 이 카드 위에서 잠시 멈췄습니다. 의미심장하군요.'}],
  [{c:'bt',t:'......',pause:400},{c:'bt',t:'카드에서 무언가 느껴집니다. 좋은 이야기를 들려줄 것 같군요.'}],
];
var RX_BT_REV = [
  [{c:'bt',t:'...역위치군요.',pause:400},{c:'bt',t:'걱정하실 필요 없습니다. 역위치도 중요한 메시지를 담고 있으니까요.'}],
  [{c:'bt',t:'흠......'},{c:'bt',t:'좀 더 깊이 들여다봐야 할 것 같습니다. 다만, 나쁜 카드란 없다는 점을 기억해 주세요.'}],
  [{c:'bt',t:'역위치...',pause:300},{c:'bt',t:'방향이 다를 뿐입니다. 주의 깊게 읽어보겠습니다.'}],
  [{c:'bt',t:'......',pause:400},{c:'bt',t:'거꾸로 놓여 있군요. 다른 시선으로 들여다보겠습니다.'}],
  [{c:'bt',t:'음...',pause:300},{c:'bt',t:'역위치입니다만... 때로는 이쪽이 더 솔직한 메시지를 전하기도 합니다.'}],
  [{c:'bt',t:'이런...'},{c:'bt',t:'뒤집혀 나왔습니다. 하지만 걱정 마세요, 이 카드만의 이야기가 있습니다.'}],
  [{c:'bt',t:'흥미롭군요...',pause:400},{c:'bt',t:'카드가 일부러 이 방향을 택한 듯합니다. 그 이유를 함께 살펴보지요.'}],
];
var RX_RB_UP = [
  [{c:'rb',t:'...귀가 쫑긋.',pause:400},{c:'rb',t:'이 카드에서 따뜻한 기운이 흘러나오고 있어. 천천히 읽어볼게.'}],
  [{c:'rb',t:'앗...!'},{c:'rb',t:'이 카드, 코끝이 간질간질해. 너한테 할 말이 잔뜩 있나 봐.'}],
  [{c:'rb',t:'......'},{c:'rb',t:'별빛이 이 카드 위에서 잠깐 멈췄어. 뭔가 중요한 이야기를 품고 있는 것 같아.'}],
  [{c:'rb',t:'오...',pause:300},{c:'rb',t:'이 카드에서 달빛 같은 에너지가 느껴져. 잠깐, 잘 들여다볼게.'}],
  [{c:'rb',t:'어머.',pause:400},{c:'rb',t:'이 카드가 널 골랐어. 당근을 걸어도 좋아, 이건 인연이야.'}],
  [{c:'rb',t:'음...'},{c:'rb',t:'코를 실룩실룩... 이 카드, 좋은 향기가 나. 기대해도 돼.'}],
  [{c:'rb',t:'...',pause:300},{c:'rb',t:'별빛이 반짝이고 있어. 이 카드가 네게 건네고 싶은 이야기가 있나 봐.'}],
];
var RX_RB_REV = [
  [{c:'rb',t:'어라, 거꾸로...',pause:400},{c:'rb',t:'괜찮아. 역위치는 달빛 아래서 보라는 뜻이야. 다른 각도로 읽어줄게.'}],
  [{c:'rb',t:'음...'},{c:'rb',t:'거꾸로 왔네. 이 카드의 에너지가 풀숲에 숨은 오솔길처럼 다른 방향을 가리키고 있어.'}],
  [{c:'rb',t:'......',pause:300},{c:'rb',t:'귀가 쫑긋... 역위치 카드는 "여기 좀 봐줘"라는 신호야. 겁먹을 필요 없어.'}],
  [{c:'rb',t:'앗.',pause:400},{c:'rb',t:'뒤집혀 있구나. 근데 있잖아, 이럴 때 오히려 카드가 더 솔직한 말을 하거든.'}],
  [{c:'rb',t:'흐음...',pause:300},{c:'rb',t:'역위치네... 별빛이 살짝 흐려진 느낌이야. 천천히 읽으면 진짜 메시지가 보일 거야.'}],
  [{c:'rb',t:'오잉?'},{c:'rb',t:'거꾸로 나왔어. 근데 이런 카드일수록 깊은 이야기를 품고 있거든.'}],
  [{c:'rb',t:'음~...',pause:400},{c:'rb',t:'방향이 좀 다르게 왔네. 코끝이 간질간질... 숨겨진 메시지가 있는 것 같아.'}],
];

var PROMPT_NEXT_BT = [
  '...자, 다음 카드를 뒤집어 주세요.',
  '...이어서, 다음 카드를 선택해 주세요.',
  '...그럼, 다음 카드를 눌러주세요.',
  '...준비가 되셨다면, 다음 카드로 넘어가시죠.',
  '...다음 카드가 기다리고 있습니다. 천천히 뒤집어 주세요.',
  '...이야기가 이어지려면 다음 카드가 필요합니다.'
];
var PROMPT_NEXT_RB = [
  '자, 다음 카드가 기다리고 있어. 눌러봐.',
  '다음 카드에서도 별빛이 반짝이고 있어.',
  '이야기가 이어지려면 다음 카드가 필요해. 귀가 쫑긋~',
  '자, 다음 카드를 뒤집어봐. 뭐라고 할지 궁금하지 않아?',
  '다음 카드도 할 이야기가 많을 것 같아. 눌러봐.',
  '자, 이야기의 다음 장을 열어보자.'
];

/* ═══════ CARD UI ═══════ */
function showCards() {
  $cardArea.innerHTML='';
  $cardArea.classList.remove('candidate-grid');
  var labels = selectedSpread===3 ? ['과거','현재','미래'] : [''];

  drawnCards.forEach(function(card, idx) {
    var slot = document.createElement('div');
    slot.className='tarot-card-slot entering';
    slot.style.animationDelay=(idx*0.2)+'s';
    if (idx > 0) slot.classList.add('card-locked');

    if(labels[idx]){
      var pl=document.createElement('div'); pl.className='tarot-card-pos-label'; pl.textContent=labels[idx];
      slot.appendChild(pl);
    }

    var inner = document.createElement('div'); inner.className='tarot-card-inner';
    var back = document.createElement('div'); back.className='tarot-card-back';
    var pat = document.createElement('div'); pat.className='tarot-card-pattern'; back.appendChild(pat);
    inner.appendChild(back);

    var front = document.createElement('div');
    front.className = 'tarot-card-front' + (card.isReversed ? ' reversed-front' : '');
    front.innerHTML =
      '<div class="tarot-card-numeral">'+toRoman(card.number)+'</div>'+
      '<div class="tarot-card-name-en">'+card.name_en+'</div>'+
      '<div class="tarot-card-symbol">'+(CARD_SYMBOLS[card.number]||'✦')+'</div>'+
      '<div class="tarot-card-name-kr">'+card.name_kr+'</div>'+
      '<div class="tarot-card-direction '+(card.isReversed?'reversed':'upright')+'">'+(card.isReversed?'역위치 ↺':'정위치 ↑')+'</div>'+
      '<div class="tarot-card-keywords">'+(card.isReversed?card.keywords.reversed:card.keywords.upright).slice(0,3).join(' · ')+'</div>';
    inner.appendChild(front);
    slot.appendChild(inner);

    slot.onclick = function() {
      if(slot.classList.contains('flipped') || slot.classList.contains('card-locked')) return;
      if(isReadingInProgress) return;
      slot.classList.add('flipped');
      flippedCount++;
      isReadingInProgress = true;
      hideDlg();
      setTimeout(function(){ playReactionAndRead(card, idx); }, 900);
    };
    $cardArea.appendChild(slot);
  });
  setTimeout(function(){$cardArea.classList.add('show');},200);
}

function showCardSpotlight(card) {
  var spot = $t('tarotCardSpotlight');
  if (!spot) return;
  var isR = card.isReversed;
  spot.innerHTML =
    '<div class="tarot-spotlight-card'+(isR?' reversed':'')+'">' +
    '<div class="tarot-card-numeral">'+toRoman(card.number)+'</div>'+
    '<div class="tarot-card-name-en">'+card.name_en+'</div>'+
    '<div class="tarot-card-symbol">'+(CARD_SYMBOLS[card.number]||'✦')+'</div>'+
    '<div class="tarot-card-name-kr">'+card.name_kr+'</div>'+
    '<div class="tarot-card-direction '+(isR?'reversed':'upright')+'">'+(isR?'역위치 ↺':'정위치 ↑')+'</div>'+
    '<div class="tarot-card-keywords">'+(isR?card.keywords.reversed:card.keywords.upright).slice(0,3).join(' · ')+'</div>'+
    '</div>';
  spot.classList.add('show');
}

function hideCardSpotlight() {
  var spot = $t('tarotCardSpotlight');
  if (spot) spot.classList.remove('show');
}

/* ═══════ PER-CARD REACTION + READING ═══════ */
function playReactionAndRead(card, idx) {
  var pool;
  if (selectedChar === 'bt') { pool = card.isReversed ? RX_BT_REV : RX_BT_UP; }
  else { pool = card.isReversed ? RX_RB_REV : RX_RB_UP; }
  var rx = pool[Math.floor(Math.random()*pool.length)];
  rx.forEach(function(r){ say(r.c, r.t, {pause:r.pause||0}); });
  dlgCallback = function() { deliverSpotlightReading(card, idx); };
}

function deliverSpotlightReading(card, idx) {
  var cardReading = storedReadings && storedReadings.cards[idx];
  if (!cardReading) { isReadingInProgress = false; return; }
  $cardArea.classList.remove('show');
  showCardSpotlight(card);
  var ch = selectedChar;
  cardReading.lines.forEach(function(line) { say(ch, line); });
  dlgCallback = function() { afterSpotlightReading(idx, ch); };
}

function afterSpotlightReading(idx, ch) {
  hideCardSpotlight();
  if (flippedCount < drawnCards.length) {
    $cardArea.classList.add('show');
    var slots = $cardArea.querySelectorAll('.tarot-card-slot');
    if (slots[flippedCount]) slots[flippedCount].classList.remove('card-locked');
    isReadingInProgress = false;
    say(ch, pick(ch === 'bt' ? PROMPT_NEXT_BT : PROMPT_NEXT_RB));
    dlgCallback = function() { hideDlg(); };
  } else {
    isReadingInProgress = false;
    if (storedReadings.synopsis) { deliverSynopsis(); }
    else { deliverFinalMessage(); }
  }
}

function deliverSynopsis() {
  var ch = selectedChar;
  if (ch === 'bt') {
    say('bt', pick([
      '...그리고, 세 카드를 함께 놓고 보면 하나의 흐름이 보입니다.',
      '...이제 세 카드를 하나의 이야기로 이어보겠습니다.',
      '...각각의 카드도 의미가 있지만, 셋을 함께 보면 더 큰 그림이 보이지요.',
    ]), {anim:'thinking', pause:500});
  } else {
    say('rb', pick([
      '...있잖아, 세 카드를 나란히 놓으면 하나의 이야기가 보여. 귀가 쫑긋해지거든.',
      '...자, 이제 세 카드를 연결해볼게. 별빛으로 이어보면 흐름이 보여.',
      '...각각도 의미 있지만, 셋을 같이 보면 숲 전체가 보이는 것처럼 네 이야기가 선명해져.',
    ]), {pause:400});
  }
  storedReadings.synopsis.forEach(function(line) { say(ch, line); });
  dlgCallback = deliverFinalMessage;
}

function deliverFinalMessage() {
  var ch = selectedChar;
  storedReadings.final.forEach(function(line) { say(ch, line); });
  dlgCallback = showReplayOptions;
}

function showReplayOptions() {
  var opts = [];
  storedReadings.cards.forEach(function(card, i) {
    var label = storedReadings.cards.length === 1
      ? '🃏 카드 해석 다시 듣기'
      : '🃏 ' + card.cardName + ' 해석 다시 듣기';
    opts.push({
      text: label,
      action: (function(idx) { return function() { replayCard(idx); }; })(i)
    });
  });
  if (storedReadings.synopsis) {
    opts.push({ text: '🔮 종합 흐름 다시 듣기', action: replaySynopsis });
  }
  opts.push({ text: '✨ 충분히 들었어요', action: endReading });

  if (selectedChar === 'bt') {
    say('bt', pick([
      '...혹시 다시 듣고 싶은 부분이 있으시다면, 말씀해 주세요.',
      '...다시 듣고 싶은 카드가 있으시면 선택해 주세요.',
    ]));
  } else {
    say('rb', pick([
      '다시 듣고 싶은 부분 있으면 골라봐. 별빛은 몇 번이고 비춰줄 수 있으니까.',
      '혹시 한 번 더 듣고 싶은 이야기가 있어? 골라봐.',
    ]));
  }
  dlgCallback = function() { showOpts(opts); };
}

function replayCard(idx) {
  var card = drawnCards[idx];
  var cardReading = storedReadings.cards[idx];
  var ch = selectedChar;
  showCardSpotlight(card);
  cardReading.lines.forEach(function(line) { say(ch, line); });
  dlgCallback = function() { hideCardSpotlight(); showReplayOptions(); };
}

function replaySynopsis() {
  var ch = selectedChar;
  storedReadings.synopsis.forEach(function(line) { say(ch, line); });
  dlgCallback = showReplayOptions;
}

function endReading() {
  var ch = selectedChar;
  if (ch === 'bt') {
    say('bt', pick([
      '오늘 밤의 별빛이 당신에게 좋은 길을 비춰주기를... 언제든 다시 찾아오세요.',
      '카드의 메시지를 마음에 담아가세요. 밤의 안내인은 언제든 이곳에 있겠습니다.',
    ]));
  } else {
    say('rb', pick([
      '오늘 밤의 별빛이 네 마음에 오래 남기를... 또 보고 싶으면 언제든 찾아와.',
      '별빛은 항상 여기서 빛나고 있으니까, 궁금한 게 생기면 또 와. 기다리고 있을게.',
    ]));
  }
  dlgCallback = function() {
    hideDlg();
    $t('tarotRestartBtn').classList.add('show');
  };
}

/* ═══════ READING CONTENT GENERATION ═══════ */
function generateAllReadings() {
  var result = { cards: [], synopsis: null, final: [] };
  var ch = selectedChar;
  var topicNames = {love:'연애운',career:'직업운',finance:'재물운',today:'오늘의 운세',general:'종합운'};
  var tl = topicNames[selectedTopic] || '운세';
  var tk = topicKey();

  drawnCards.forEach(function(card, idx) {
    var lines = [];
    var isR = card.isReversed;
    var kws = isR ? card.keywords.reversed : card.keywords.upright;
    var core = isR ? card.core_meaning.reversed : card.core_meaning.upright;
    var snip = (card.situation_snippets && card.situation_snippets[tk]) || '';

    // LINE 1: Position intro
    var n = card.name_kr, nj = j(card.name_kr,'이/가');
    if (selectedSpread === 1) {
      if (ch === 'bt') {
        lines.push(isR
          ? pick([n + ' 카드가 역위치로 나왔습니다. 이 에너지가 지금 어딘가에서 막히거나, 본래의 방향과 다르게 흐르고 있다는 신호입니다.',
                  n + '... 역위치군요. 이 카드의 에너지가 지금 제 방향을 찾지 못하고 있는 듯합니다.'])
          : pick([n + ' 카드입니다. 이 카드가 오늘 당신 앞에 놓인 건... 우연이 아닐 겁니다.',
                  n + '... 이 카드가 나왔군요. 당신에게 하고 싶은 이야기가 있는 모양입니다.']));
      } else {
        lines.push(isR
          ? pick([n + ' 카드인데, 거꾸로 왔어. 이 에너지가 풀숲에 숨어서 다른 방향으로 흐르고 있다는 뜻이야.',
                  n + ' 카드야, 근데 역위치네. 달빛 아래서 보면 다른 모습이 보이는 것처럼, 이 에너지도 좀 다르게 읽어야 해.'])
          : pick([n + ' 카드야. 코끝이 간질간질... 이 카드가 너한테 하고 싶은 말이 있나 봐.',
                  n + '... 이 카드가 나왔구나. 별빛이 이 카드 위에서 은은하게 빛나고 있어.']));
      }
    } else {
      var posLabels = ['과거', '현재', '미래'];
      var pos = posLabels[idx] || '';
      if (ch === 'bt') {
        if (idx === 0) {
          lines.push(isR
            ? pick([pos + '의 자리에 ' + n + nj + ' 역위치로 놓여 있습니다. 지나온 시간 속에서 이 에너지가 제대로 표현되지 못하고, 어딘가 눌려 있었던 것 같군요.',
                    n + nj + ' ' + pos + '의 자리에서 역위치로 나타났습니다. 과거에 이 에너지가 온전히 발휘되지 못했던 시간이 있었나 봅니다.'])
            : pick([pos + '의 자리에 ' + n + nj + ' 있습니다. 지나온 시간 속에서 이 에너지가 당신에게 깊이 자리해 왔다는 뜻입니다.',
                    n + nj + ' ' + pos + '의 자리에 놓여 있습니다. 지나온 시간 속에서 이 에너지와 함께해 온 경험이 있으실 겁니다.']));
        } else if (idx === 1) {
          lines.push(isR
            ? pick(['현재의 자리에 ' + n + nj + ' 역위치로 놓여 있습니다. 이 에너지가 지금 막혀 있거나, 제대로 흐르지 못하고 있다는 신호입니다.',
                    n + nj + ' 지금 이 순간의 자리에서 역위치로 나왔습니다. 현재 이 에너지가 어딘가 걸려 있군요.'])
            : pick(['현재의 자리에 ' + n + nj + ' 있습니다. 이 순간, 이 에너지가 당신 곁에서 강하게 흐르고 있습니다.',
                    '지금 이 순간을 비추는 자리에 ' + n + '. 이 에너지가 당신의 현재를 정확하게 비추고 있을 겁니다.']));
        } else {
          lines.push(isR
            ? pick(['앞으로의 자리에 ' + n + nj + ' 역위치로 놓였습니다. 이 에너지가 막힌 형태로 다가올 수 있으니, 지금부터 미리 인식해 두시는 것이 좋겠습니다.',
                    n + nj + ' 앞으로의 자리에서 역위치로 기다리고 있군요. 이 에너지가 온전한 형태가 아닌 채로 다가올 수 있습니다.'])
            : pick(['앞으로의 자리에 ' + n + nj + ' 놓여 있습니다. 이 에너지가 당신의 앞길에서 기다리고 있군요.',
                    n + '의 에너지가 미래의 자리에서 당신을 향하고 있습니다.']));
        }
      } else {
        if (idx === 0) {
          lines.push(isR
            ? pick([pos + ' 자리에 ' + n + nj + ' 거꾸로 왔어. 예전에 이 에너지가 제대로 피어나지 못했나 봐.',
                    n + nj + ' ' + pos + ' 자리에서 거꾸로... 이 에너지가 옛날에 어딘가에서 막혔었나 봐.'])
            : pick([pos + ' 자리에 ' + n + nj + ' 있어. 네가 여기까지 걸어오는 동안 이 에너지가 발자국처럼 따라왔다는 뜻이야.',
                    n + nj + ' ' + pos + '를 비추고 있어. 네가 걸어온 풀숲 속에 이 에너지가 깊이 스며있었구나.']));
        } else if (idx === 1) {
          lines.push(isR
            ? pick(['지금 자리에 ' + n + nj + ' 거꾸로 놓여 있어. 이 에너지가 좀 막혀있는 것 같아.',
                    n + nj + ' 현재 자리에서 거꾸로... 풀숲 사이의 길이 좀 엉켜있는 느낌이야.'])
            : pick(['지금 자리에 ' + n + '. 이 에너지가 바로 네 곁에서 흐르고 있어.',
                    n + nj + ' 바로 이 순간을 비추고 있어. 별빛이 지금 너한테 집중하고 있거든.']));
        } else {
          lines.push(isR
            ? pick(['앞으로의 자리에 ' + n + nj + ' 거꾸로 나왔어. 이 에너지가 좀 비틀어진 형태로 올 수 있어.',
                    n + nj + ' 앞날의 자리에서 거꾸로... 달빛이 구름에 살짝 가려진 느낌이야.'])
            : pick(['앞으로의 자리에 ' + n + '. 이 에너지가 별빛처럼 네 앞길에서 반짝이고 있어.',
                    n + nj + ' 미래의 자리에 있어. 이 에너지가 너를 기다리고 있다는 뜻이야.']));
        }
      }
    }

    // LINE 2: Core meaning
    lines.push(core);

    // LINE 3: Topic interpretation
    if (snip) {
      if (ch === 'bt') {
        lines.push(pick([tl + ' 쪽에서 이 카드를 보자면... ' + snip, tl + '의 관점에서 해석하자면, ' + snip]));
      } else {
        lines.push(pick([tl + '에 관해서 이 카드가 하는 말은, ' + snip, tl + ' 쪽으로 읽어보면 말이야, ' + snip]));
      }
    }

    // LINE 4: Keyword analysis
    if (kws.length >= 3) {
      var k0=kws[0], k1=kws[1], k2=kws[2];
      if (ch === 'bt') {
        lines.push(isR
          ? '이 카드의 키워드는 \'' + k0 + '\', \'' + k1 + '\', \'' + k2 + '\'입니다. 역위치이므로 이 에너지들이 왜곡되거나 과도하게 나타나고 있을 수 있습니다.'
          : '이 카드의 키워드는 \'' + k0 + '\', \'' + k1 + '\', \'' + k2 + '\'입니다. 이 중에서 지금 당신에게 가장 가까이 느껴지는 것이 카드가 직접 건네는 메시지일 겁니다.');
      } else {
        lines.push(isR
          ? '\'' + k0 + '\', \'' + k1 + '\', \'' + k2 + '\'... 이 키워드들이 지금 풀숲에 엉켜있는 상태야. \'' + k0 + '\' 쪽에서 걸리는 느낌이 있으면, 그게 카드의 핵심 메시지야.'
          : '\'' + k0 + '\', \'' + k1 + '\', \'' + k2 + '\'... 이 세 가지가 이 카드의 에너지야. 귀를 기울여봐. 마음에 가장 와닿는 게 카드가 너한테 하는 말이야.');
      }
    }

    // LINE 5: Practical advice
    if (ch === 'bt') {
      lines.push(pick(isR
        ? ['막혀 있는 에너지를 억지로 풀려 하면 오히려 더 단단해집니다. 자신에게 좀 너그러운 시간을 허락해 보세요.',
           '역위치의 에너지는 나쁜 신호가 아닙니다. 방향을 다시 잡을 수 있는 기회가 온 것이지요.']
        : ['이 에너지가 지금 주변에서 흐르고 있다는 걸 아셨으니, 오늘 딱 한 가지만 해보세요. 작은 것 하나가 큰 변화를 만들 수 있습니다.',
           '이 카드의 에너지를 마음에 담아두세요. 일상 속에서 이 에너지가 어디서 살아 움직이는지 느껴보시면... 카드의 메시지가 한결 선명해질 겁니다.']));
    } else {
      lines.push(pick(isR
        ? ['거꾸로 나왔다고 겁먹지 마. 풀숲이 엉켜있을 뿐이야. 살살 풀어주면 되거든.',
           '있잖아, 역위치는 "이쪽은 좀 살펴봐"라는 친절한 속삭임이야.']
        : ['이 에너지가 지금 네 곁에 있으니까, 오늘 하루 살짝 의식해봐. "앗, 이거구나" 하는 순간이 올 거야.',
           '카드가 보여주는 건 풀숲 너머의 풍경이야. 네가 어떻게 걸어가느냐에 따라 그 풍경이 진짜가 되는 거지.']));
    }

    result.cards.push({ cardName: card.name_kr, lines: lines });
  });

  // Synopsis for 3-card spread
  if (selectedSpread === 3 && drawnCards.length === 3) {
    result.synopsis = generateSynopsis(ch, tl);
  }

  // Final message
  if (ch === 'bt') {
    result.final = [pick([
      '카드는 길을 비출 뿐, 걸어가는 것은 당신의 몫입니다. 오늘의 메시지가 마음에 작은 등불이 되기를.',
      '타로는 거울과 같습니다. 카드가 보여준 것은 당신 마음속에 이미 있던 답일지도 모릅니다.'
    ])];
  } else {
    result.final = [pick([
      '카드가 할 이야기는 다 했어. 나머지는 네가 걸어가는 거야. 풀숲 너머에 뭐가 있는지, 넌 이미 느끼고 있잖아.',
      '별빛 아래서 읽은 카드는 특별해. 오늘 밤의 이야기, 마음 한구석에 별처럼 담아둬.'
    ])];
  }

  return result;
}

function generateSynopsis(ch, tl) {
  var lines = [];
  var c0 = drawnCards[0], c1 = drawnCards[1], c2 = drawnCards[2];
  var r0 = c0.isReversed, r1 = c1.isReversed, r2 = c2.isReversed;
  var kw0 = (r0 ? c0.keywords.reversed : c0.keywords.upright)[0];
  var kw1 = (r1 ? c1.keywords.reversed : c1.keywords.upright)[0];
  var kw2 = (r2 ? c2.keywords.reversed : c2.keywords.upright)[0];

  if (ch === 'bt') {
    lines.push(tl + '에 관해 세 장이 그리는 이야기가 있습니다. \'' + kw0 + '\'에서 \'' + kw1 + '\'' + j(kw1,'을/를') + ' 거쳐 \'' + kw2 + '\'' + j(kw2,'으로/로') + '... 지금 당신의 흐름이 이 방향을 가리키고 있습니다.');
    lines.push('과거의 ' + c0.name_kr + j(c0.name_kr,'이/가') + ' 남긴 에너지가 현재의 ' + c1.name_kr + j(c1.name_kr,'을/를') + ' 만들었고, 그것이 다시 미래의 ' + c2.name_kr + j(c2.name_kr,'으로/로') + ' 이어지고 있습니다.');
    lines.push('각 카드의 메시지를 떠올리면서, 이 연결이 지금 당신에게 어떻게 닿는지 느껴보시기 바랍니다.');
  } else {
    lines.push(tl + '에 관해 세 카드가 하나의 이야기를 하고 있어. \'' + kw0 + '\'에서 \'' + kw1 + '\'' + j(kw1,'을/를') + ' 지나 \'' + kw2 + '\'' + j(kw2,'으로/로') + '... 별빛이 비추는 네 흐름이 이 방향이야.');
    lines.push(c0.name_kr + j(c0.name_kr,'이/가') + ' 심어놓은 씨앗이 ' + c1.name_kr + j(c1.name_kr,'을/를') + ' 거쳐서 ' + c2.name_kr + j(c2.name_kr,'으로/로') + ' 피어나려 하고 있어.');
    lines.push('세 카드를 같이 보면 네 이야기가 하나의 별자리처럼 이어져. 각각의 메시지를 떠올리면서, 지금 네 마음에 어떻게 닿는지 느껴봐.');
  }
  return lines;
}

/* ═══════ GAME FLOW ═══════ */
function tarotStartGame() {
  initDlgRefs();
  $dlgBox.addEventListener('click', function(e){ if(!e.target.closest('.tarot-opt-btn')) advDlg(); });
  $t('tarotReadingClose').addEventListener('click',function(){ $t('tarotReadingPanel').classList.remove('show'); });
  $t('tarotRestartBtn').addEventListener('click', resetTarotGame);

  // Create stars
  var starsEl = $t('tarotStars');
  if (starsEl) {
    starsEl.innerHTML = '';
    for(var i=0;i<40;i++){
      var s=document.createElement('div'); s.className='tarot-star';
      s.style.left=Math.random()*100+'%'; s.style.top=Math.random()*100+'%';
      s.style.setProperty('--dur',(3+Math.random()*4)+'s');
      s.style.setProperty('--delay',(Math.random()*5)+'s');
      s.style.setProperty('--bright',(0.3+Math.random()*0.5)+'');
      var sz=1+Math.random()*3; s.style.width=sz+'px'; s.style.height=sz+'px';
      starsEl.appendChild(s);
    }
  }

  playIntro();
}

function playIntro() {
  var loader = $t('tarotLoader');
  if (loader) loader.classList.add('hidden');

  setTimeout(function(){ var ic = $t('tarotIntroCenter'); if(ic) ic.classList.add('hidden'); }, 2200);
  setTimeout(function(){
    var cl = $t('tarotCurtainL'), cr = $t('tarotCurtainR');
    if(cl) cl.classList.add('open');
    if(cr) cr.classList.add('open');
  }, 2600);
  setTimeout(function(){
    var intro = $t('tarotIntro');
    if(intro) intro.style.display='none';
    var hud = $t('tarotHud');
    if(hud) hud.classList.add('show');
    var cs = $t('tarotCharSelect');
    if(cs) cs.classList.add('show');
  }, 5000);
}

function tarotSelectChar(ch) {
  selectedChar = ch;
  $t('tarotCharSelect').classList.remove('show');

  if (ch === 'bt') {
    if (rabbitModel) rabbitModel.visible = false;
    if (btGroup) btGroup.visible = true;
    [btArmUpperL, btArmLowerL, btArmUpperR, btArmLowerR, btHandL, btHandR].forEach(function(m){ if(m) m.visible=true; });
  } else {
    if (btGroup) btGroup.visible = false;
    [btArmUpperL, btArmLowerL, btArmUpperR, btArmLowerR, btHandL, btHandR].forEach(function(m){ if(m) m.visible=false; });
    if (rabbitModel) rabbitModel.visible = true;
  }

  if (camera) {
    var cx = (ch === 'bt') ? BT_X : RB_X;
    var cz = (ch === 'bt') ? BT_Z : RB_Z;
    camera.position.set(cx, 2.2, cz + 3.5);
    camera.lookAt(cx, 0.9, cz);
  }

  setTimeout(phaseGreeting, 400);
}
// Expose for onclick
window.tarotSelectChar = tarotSelectChar;

function phaseGreeting() {
  if (selectedChar === 'bt') {
    say('bt', pick(['...어서 오세요.','...찾아오셨군요.','...밤이 깊었는데... 어서 오세요.']), {pause:500});
    say('bt', pick(['이 밤, 별빛의 인도를 받아 이곳까지 오셨군요.','깊은 밤, 별빛을 따라 이곳까지 오시다니... 대단하십니다.']));
    say('bt', pick(['저는 이곳의 안내인... 밤의 바텐더라고 불러주시면 됩니다.','이곳의 주인장... 바텐더라고 불러주세요.']));
    say('bt', pick(['자... 오늘 이 늦은 밤에 찾아오신 건, 분명 이유가 있으시겠지요?','그래서... 오늘 밤, 어떤 이야기를 안고 오셨습니까?']));
  } else {
    say('rb', pick(['앗, 손님이다! 어서 와, 기다리고 있었어.','어머, 왔구나! 반가워. 귀가 쫑긋해졌어.']), {anim:'excited', pause:500});
    say('rb', pick(['나는 루나. 이 별빛 찻집에서 카드를 읽는 토끼야.','루나라고 해. 별빛으로 카드를 읽는 게 내 특기야.']));
    say('rb', pick(['이 깊은 밤에 여기까지 왔다면... 분명 마음에 품고 온 이야기가 있는 거지?','별빛을 따라 여기까지 온 거면, 마음속에 뭔가 있는 거 아냐?']));
  }
  dlgCallback = function(){
    showOpts([
      {text:'💭 네, 요즘 고민이 좀 있어서요...', action:respA},
      {text:'😄 재미삼아 한번 해보려고요!', action:respB},
      {text:'🤔 타로가 정말 맞는 건가요...?', action:respC}
    ]);
  };
}

function respA(){
  if (selectedChar==='bt') say('bt', pick(['고민이라... 이곳을 찾아오신 것만으로도 이미 첫 걸음을 떼신 겁니다.','마음이 무거우실 때 이곳을 찾으시다니... 카드가 좋은 실마리를 줄 겁니다.']));
  else say('rb', pick(['고민이 있구나... 괜찮아, 카드가 풀숲 너머의 길을 비춰줄 거야.','마음이 무거울 때 별빛이 가장 선명하게 빛나거든. 같이 읽어보자.']), {anim:'talking'});
  dlgCallback=phaseTopic;
}
function respB(){
  if (selectedChar==='bt') say('bt', pick(['후후, 재미라 하셨지만... 카드는 종종 진심을 읽어내곤 하죠.','재미로 시작하셔도 좋습니다. 카드는 가벼운 마음에도 진지하게 답하니까요.']));
  else say('rb', pick(['재미로 시작해도 괜찮아! 근데 있잖아, 카드가 깜짝 놀랄 이야기를 할 수도 있거든.','재미라... 후후, 근데 카드 앞에 앉으면 마음속에 뭔가 떠오르게 되어 있어.']), {anim:'talking'});
  dlgCallback=phaseTopic;
}
function respC(){
  if (selectedChar==='bt') {
    say('bt', pick(['흥미로운 질문이시군요.','좋은 질문입니다.']), {anim:'thinking'});
    say('bt', pick(['타로는 미래를 \'예언\'하지 않습니다. 다만... 마음 속 이미 알고 있는 답을 비추어 보여줄 뿐이지요.','카드는 정답을 알려주지 않습니다. 당신이 이미 알고 있지만 외면하던 것을 비추어 보여줄 뿐입니다.']));
  } else {
    say('rb', pick(['좋은 질문이야. 타로는 미래를 정해주는 게 아니라, 네 안에 이미 있는 답을 별빛으로 비춰주는 거야.','나도 처음엔 반신반의했어. 근데 카드를 읽다 보면 코끝이 간질간질해지면서 마음에 와닿는 게 있거든.']));
  }
  dlgCallback=phaseTopic;
}

function phaseTopic() {
  if (selectedChar==='bt') say('bt', pick(['그렇다면... 오늘은 어떤 이야기를 나눠볼까요?','자... 어떤 주제로 카드를 펼쳐볼까요?']));
  else say('rb', pick(['자, 어떤 이야기가 듣고 싶어? 마음이 이끄는 쪽을 골라봐.','어떤 주제가 궁금해? 코끝이 가는 대로 골라봐.']));
  dlgCallback = function(){
    hideDlg();
    $topicSel.innerHTML='';
    var topics=[
      {id:'love',icon:'💕',label:'연애운',desc:'사랑과 관계'},
      {id:'career',icon:'💼',label:'직업운',desc:'일과 성장'},
      {id:'finance',icon:'💰',label:'재물운',desc:'금전과 풍요'},
      {id:'today',icon:'✨',label:'오늘의 운세',desc:'오늘 하루의 흐름'},
      {id:'general',icon:'🔮',label:'종합운',desc:'전체적인 기운'}
    ];
    topics.forEach(function(t){
      var btn=document.createElement('button'); btn.className='tarot-sel-btn';
      btn.innerHTML='<span class="sel-icon">'+t.icon+'</span><div class="sel-label">'+t.label+'</div><div class="sel-desc">'+t.desc+'</div>';
      btn.onclick=function(){ selectedTopic=t.id; $topicSel.classList.remove('show'); onTopicPicked(t); };
      $topicSel.appendChild(btn);
    });
    setTimeout(function(){$topicSel.classList.add('show');},300);
  };
}

function onTopicPicked(t) {
  if (selectedChar==='bt') {
    say('bt', pick(['...'+t.label+'이시군요. 좋습니다.', t.label+'... 좋습니다. 별빛에 비춰보겠습니다.']));
  } else {
    say('rb', pick(['읽어볼게.', t.label+'이구나. 귀가 쫑긋해졌어.']), {anim:'talking'});
  }
  dlgCallback=phaseSpread;
}

function phaseSpread() {
  if (selectedChar==='bt') say('bt', pick(['카드를 몇 장 뽑으시겠습니까?','원카드로 핵심만 보시겠습니까, 아니면 세 장으로 흐름을 읽어보시겠습니까?']));
  else say('rb', pick(['카드를 몇 장 뽑을까? 한 장이면 핵심 메시지, 세 장이면 과거에서 미래까지 이야기가 이어져.','몇 장 뽑을 거야? 한 장은 별빛 하나에 집중, 세 장은 별자리처럼 이야기가 펼쳐져.']));
  dlgCallback=function(){
    hideDlg();
    $spreadSel.innerHTML='';
    var spreads=[
      {count:1,icon:'🃏',label:'원카드 리딩',desc:'핵심 메시지 하나'},
      {count:3,icon:'🃏🃏🃏',label:'쓰리카드 리딩',desc:'과거 · 현재 · 미래'}
    ];
    spreads.forEach(function(s){
      var btn=document.createElement('button'); btn.className='tarot-sel-btn';
      btn.innerHTML='<span class="sel-icon">'+s.icon+'</span><div class="sel-label">'+s.label+'</div><div class="sel-desc">'+s.desc+'</div>';
      btn.onclick=function(){ selectedSpread=s.count; $spreadSel.classList.remove('show'); onSpreadPicked(); };
      $spreadSel.appendChild(btn);
    });
    setTimeout(function(){$spreadSel.classList.add('show');},300);
  };
}

function onSpreadPicked() {
  var pickN = selectedSpread === 1 ? '한 장' : '세 장';
  if (selectedChar==='bt') {
    say('bt', pick(['좋습니다. 마음을 가라앉히시고...','선택하셨군요. 잠시 마음을 모아주세요...']), {anim:'thinking', pause:300});
    say('bt', pick(['다섯 장의 카드를 놓겠습니다. 그 중 끌리는 ' + pickN + '을 골라주세요.','자... 다섯 장 중에서 직감이 이끄는 ' + pickN + '을 선택해 주세요.']));
  } else {
    say('rb', pick(['자, 마음을 살짝 가라앉히고... 다섯 장 중에서 끌리는 ' + pickN + '을 골라봐.','심호흡 한번 하고, 다섯 장 중에서 마음이 가는 ' + pickN + '을 눌러봐.']), {anim:'talking'});
  }
  dlgCallback=function(){
    hideDlg();
    flippedCount=0;
    drawCandidates();
    showCandidateCards();
  };
}

function resetTarotGame() {
  $t('tarotReadingPanel').classList.remove('show');
  $t('tarotRestartBtn').classList.remove('show');
  $cardArea.classList.remove('show','candidate-grid');
  $cardArea.innerHTML='';
  hideCardSpotlight();
  hideDlg();
  drawnCards=[]; flippedCount=0; selectedTopic=''; selectedSpread=1;
  candidateCards=[]; selectedCardIndices=[];
  btAnimState='idle'; rbAnimState='idle'; storedReadings=null; isReadingInProgress=false;
  selectedChar=null;
  $t('tarotCharSelect').classList.add('show');
}

/* ═══════ CLEANUP (called by core.js on returnToLobby) ═══════ */
function tarotCleanup() {
  // Stop animation loop
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  isSceneReady = false;

  // Clear dialogue timers
  clearTimeout(dlgTypeTimer);
  dlgQueue = []; dlgTyping = false; dlgCallback = null;

  // Dispose Three.js
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  if (scene) {
    scene.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function(m){ m.dispose(); });
        else obj.material.dispose();
      }
    });
    scene = null;
  }
  camera = null; clock = null;

  // Reset all refs
  btGroup = btHeadGroup = btBody = btBowTie = null;
  btEyeL = btEyeR = btPupilL = btPupilR = btBrowL = btBrowR = null;
  btArmUpperL = btArmUpperR = btArmLowerL = btArmLowerR = null;
  btHandL = btHandR = null;
  btHandLPos = btHandRPos = btHandLRest = btHandRRest = null;
  btShoulderL = btShoulderR = null;
  if (rabbitMixer) { rabbitMixer.stopAllAction(); rabbitMixer = null; }
  rabbitModel = null; crystalBall = null;
  candleFlames = []; bokehParticles = [];
  animTime = 0; idleVariant = 0; idleTimer = 0;
  _v1 = _v2 = null;

  // Reset game state
  selectedChar = null; cardData = [];
  selectedTopic = ''; selectedSpread = 1;
  drawnCards = []; flippedCount = 0;
  storedReadings = null;
  candidateCards = []; selectedCardIndices = [];
  isReadingInProgress = false;

  // Remove resize listener
  window.removeEventListener('resize', onTarotResize);

  // Reset DOM state for next play
  var el;
  el = $t('tarotLoader'); if(el) el.classList.remove('hidden');
  el = $t('tarotIntro'); if(el) el.style.display = '';
  el = $t('tarotIntroCenter'); if(el) el.classList.remove('hidden');
  el = $t('tarotCurtainL'); if(el) el.classList.remove('open');
  el = $t('tarotCurtainR'); if(el) el.classList.remove('open');
  el = $t('tarotHud'); if(el) el.classList.remove('show');
  el = $t('tarotCharSelect'); if(el) el.classList.remove('show');
  el = $t('tarotDialogue'); if(el) el.classList.remove('show');
  el = $t('tarotOptions'); if(el) el.classList.remove('show');
  el = $t('tarotCardArea'); if(el) { el.classList.remove('show','candidate-grid'); el.innerHTML=''; }
  el = $t('tarotCardSpotlight'); if(el) el.classList.remove('show');
  el = $t('tarotReadingPanel'); if(el) el.classList.remove('show');
  el = $t('tarotRestartBtn'); if(el) el.classList.remove('show');

  // Restore old THREE (r128) for other games
  if (_tarotOldTHREE) {
    window.THREE = _tarotOldTHREE;
    _tarotOldTHREE = null;
  }
}
window.tarotCleanup = tarotCleanup;

/* ═══════ ENTRY POINT (called by core.js) ═══════ */
window.startTarot = function() {
  if(typeof showScreen === 'function') showScreen('tarotGame');

  // Load card data then Three.js then start
  loadCards(function(){
    initThree(function(){
      if(typeof THREE !== 'undefined') {
        setupScene();
      }
      window.addEventListener('resize', onTarotResize);
      tarotStartGame();
    });
  });
};

})();

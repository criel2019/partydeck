// =============================================
// ===== FORTRESS (요새) — Turn-based Artillery
// =============================================

// ===== CONSTANTS =====
const FORT_GRAVITY = 0.15;
const FORT_TANK_W = 30, FORT_TANK_H = 20;
const FORT_BARREL_LEN = 25;
const FORT_MAX_HP = 100;
const FORT_HIT_RADIUS = 30;
const FORT_SPLASH_RADIUS = 60;
const FORT_DIRECT_DMG = [30, 50];
const FORT_SPLASH_DMG = [10, 25];
const FORT_CANVAS_W = 1200;
const FORT_CANVAS_H = 560;
const FORT_CRATER_RADIUS = 35;
const FORT_MOVE_SPEED = 3;
const FORT_MOVE_LIMIT = 60; // pixels per turn
const FORT_MOVE_FUEL = 60;

const FORT_TANK_COLORS = [
  '#ff6b35', '#00b8d4', '#ff2d78', '#ffd700',
  '#76ff03', '#e040fb', '#ff6e40', '#18ffff',
  '#ffab40', '#69f0ae', '#ea80fc', '#ff80ab',
  '#b388ff', '#84ffff'
];

// ===== MAP THEMES & BIOMES (ported from fortress-map-design.html blueprint) =====
const FORT_BIOME_LIST = ['temperate','desert','arctic','volcanic'];
const FORT_BIOMES = {
  temperate:{mtn4:['#0d1624','#080f18'],mtn3:['#18304a','#0e1e30'],mtn2:['#1c3a22','#101e14'],mtn1:['#264830','#162a1c'],treeColor:['#1a3418','#102010','#243e1e'],treeTrunk:'#3c2410',grassCap:'#3da83a',grassEdge:'#4fc44a',grassBlade:'#5ad454',topsoil:['#4a2a12','#341a08'],clay:['#6a4020','#4a2c12'],stone:['#484040','#2c2828'],bedrock:['#201e1e','#141212'],strata:'rgba(255,255,255,0.055)',waterColor:['#1a4a6a','#0e2a3c'],snowCap:null,surfaceColor:'rgba(40,120,30,0.12)'},
  desert:{mtn4:['#1a0c04','#0e0602'],mtn3:['#3a1c08','#221004'],mtn2:['#7a3e10','#502808'],mtn1:['#c06820','#8a4a10'],treeColor:['#2a4010','#1c2c08','#384c14'],treeTrunk:'#6a3c10',grassCap:'#c8903a',grassEdge:'#dca048',grassBlade:'#e8b050',topsoil:['#b06028','#7a4018'],clay:['#c87a3a','#8a5220'],stone:['#7a5838','#504030'],bedrock:['#302820','#1c1810'],strata:'rgba(255,180,80,0.06)',waterColor:['#1a3a5a','#0e2040'],snowCap:null,surfaceColor:'rgba(200,130,40,0.1)'},
  arctic:{mtn4:['#1a2030','#101620'],mtn3:['#3a5070','#28384e'],mtn2:['#a0b8cc','#788898'],mtn1:['#cce0f0','#a8c0d4'],treeColor:['#0e1c0e','#081408','#142012'],treeTrunk:'#3a2c20',grassCap:'#daeef8',grassEdge:'#eaf6ff',grassBlade:'#f4fcff',topsoil:['#707880','#505860'],clay:['#888890','#606068'],stone:['#4a4c52','#343438'],bedrock:['#282830','#181820'],strata:'rgba(200,220,255,0.08)',waterColor:['#0a2840','#081828'],snowCap:'#eef6ff',surfaceColor:'rgba(200,230,255,0.15)'},
  volcanic:{mtn4:['#0e0400','#080200'],mtn3:['#1c0800','#100400'],mtn2:['#2e0e00','#1a0800'],mtn1:['#3c1200','#220a00'],treeColor:['#140800','#0c0400','#1c0c00'],treeTrunk:'#2a1000',grassCap:'#3a1a08',grassEdge:'#4a2210',grassBlade:'#5a2c14',topsoil:['#281008','#180804'],clay:['#1e0c04','#120800'],stone:['#2a1e1c','#1a1210'],bedrock:['#140e0c','#0c0806'],strata:'rgba(255,60,0,0.07)',waterColor:['#4a1000','#2a0800'],snowCap:null,surfaceColor:'rgba(255,60,0,0.08)'},
};
const FORT_THEMES = {
  day:{skyBands:[[0,'#07111f'],[0.18,'#0d2244'],[0.42,'#1a5c9e'],[0.68,'#4a9ed4'],[0.85,'#8ec8e8'],[1.0,'#c2e4f4']],hazeColor:'rgba(200,230,255,0.28)',godRayAlpha:0.022,sunX:0.72,sunY:0.13,sunColor:'#fffbe8',sunGlow1:'rgba(255,240,150,0.22)',sunGlow2:'rgba(255,200,80,0.08)',moonVisible:false,starOpacity:0.15,cloudShadow:'rgba(140,180,220,0.45)',cloudBase:'rgba(255,255,255,0.93)',cloudHighlight:'rgba(255,255,255,1)',cloudDark:'rgba(180,200,230,0.6)'},
  dusk:{skyBands:[[0,'#050810'],[0.2,'#1a0a1e'],[0.4,'#6a1a2a'],[0.58,'#c84a1a'],[0.72,'#f08030'],[0.85,'#f8c060'],[1.0,'#fce090']],hazeColor:'rgba(255,140,60,0.32)',godRayAlpha:0.028,sunX:0.12,sunY:0.75,sunColor:'#ffdd70',sunGlow1:'rgba(255,160,40,0.35)',sunGlow2:'rgba(255,80,0,0.15)',moonVisible:false,starOpacity:0.4,cloudShadow:'rgba(180,80,40,0.5)',cloudBase:'rgba(255,200,140,0.88)',cloudHighlight:'rgba(255,230,180,1)',cloudDark:'rgba(160,60,20,0.7)'},
  night:{skyBands:[[0,'#010204'],[0.25,'#020408'],[0.5,'#04080e'],[0.75,'#060a12'],[1.0,'#080e18']],hazeColor:'rgba(30,50,100,0.25)',godRayAlpha:0.004,sunX:0.78,sunY:0.12,sunColor:'#d8e4ff',sunGlow1:'rgba(180,200,255,0.18)',sunGlow2:'rgba(100,130,220,0.08)',moonVisible:true,starOpacity:0.9,cloudShadow:'rgba(20,30,60,0.7)',cloudBase:'rgba(50,70,110,0.75)',cloudHighlight:'rgba(90,110,160,0.9)',cloudDark:'rgba(15,20,40,0.85)'},
};
let _fortCurrentBiome = 'temperate';
let _fortCurrentTheme = 'day';

// ===== TAMAGOTCHI CHARACTER INTEGRATION =====
const FORT_TAMA_RADIUS = 12; // circular character icon radius
const _fortTamaImgCache = {}; // key: imagePath, value: Image object
let _fortTamaPet = null; // local player's tama pet data

function fortLoadTamaPet() {
  try {
    const raw = localStorage.getItem('pd_tama_pet');
    if (!raw) { _fortTamaPet = null; return; }
    _fortTamaPet = JSON.parse(raw);
  } catch(e) { _fortTamaPet = null; }
}

function fortTamaImageSrc(pet) {
  if (!pet || !pet.tribe) return null;
  const stageIdx = fortTamaStageIdx(pet);
  const FLOW = (typeof TAMA_STAGE_VISUAL_FLOW !== 'undefined') ? TAMA_STAGE_VISUAL_FLOW : ['low','low_fx','mid','mid_fx','high'];
  const flow = FLOW[Math.min(stageIdx, FLOW.length - 1)] || 'low';
  const base = flow.startsWith('high') ? 'high' : flow.startsWith('mid') ? 'mid' : 'low';
  const MAP = (typeof TAMA_STAGE_IMAGE_MAP !== 'undefined') ? TAMA_STAGE_IMAGE_MAP : null;
  if (!MAP || !MAP[pet.tribe]) return null;
  return MAP[pet.tribe][base] || null;
}

function fortGetTamaImage(pet) {
  const src = fortTamaImageSrc(pet);
  if (!src) return null;
  if (_fortTamaImgCache[src]) return _fortTamaImgCache[src].complete ? _fortTamaImgCache[src] : null;
  const img = new Image();
  img.onload = () => { _fortTamaImgCache[src] = img; }; // triggers on next rAF frame
  img.onerror = () => { delete _fortTamaImgCache[src]; };
  _fortTamaImgCache[src] = img; // store immediately so we don't double-create
  img.src = src;
  return null;
}

function fortTamaStageIdx(pet) {
  if (!pet) return 0;
  const stages = (typeof TAMA_STAGES !== 'undefined') ? TAMA_STAGES : [
    { minLv:1 }, { minLv:5 }, { minLv:10 }, { minLv:15 }, { minLv:20 }
  ];
  for (let i = stages.length - 1; i >= 0; i--) {
    if (pet.level >= stages[i].minLv) return i;
  }
  return 0;
}

function fortTamaEmoji(pet) {
  if (!pet || !pet.tribe) return '\u{1F95A}'; // egg
  const map = (typeof TAMA_SPRITE_MAP !== 'undefined') ? TAMA_SPRITE_MAP : null;
  if (!map || !map[pet.tribe]) return '\u{1F95A}';
  return map[pet.tribe][fortTamaStageIdx(pet)] || '\u{1F95A}';
}

function fortTamaGlowColor(pet) {
  if (!pet || !pet.tribe) return 'rgba(255,255,255,0.5)';
  const tribes = (typeof TAMA_TRIBES !== 'undefined') ? TAMA_TRIBES : null;
  if (!tribes || !tribes[pet.tribe]) return 'rgba(255,255,255,0.5)';
  return tribes[pet.tribe].color || 'rgba(255,255,255,0.5)';
}

// ===== RENDER CACHES =====
let _fortSkyCache = null;       // OffscreenCanvas: sky + clouds (static, built once)
let _fortTerrainGrad = null;    // cached terrain gradient (rebuilt on canvas init)
let _fortPlayerInfoCache = {};  // per-player id → { tamaData, glowColor, emoji }
let _fortCharAnim = {};          // per-player id → { phase, squash: null|{startMs,type} }
// Pre-resolved references to tamagotchi globals (avoid typeof checks per frame)
function _fortResolveTamaGlobals() {
  _fortPlayerInfoCache = {}; // clear on game start
  _fortCharAnim = {};
}

// ===== CHARACTER ANIMATION HELPERS =====
function _fortCharAnimGet(id) {
  if (!_fortCharAnim[id]) {
    _fortCharAnim[id] = { phase: Math.random() * Math.PI * 2, squash: null };
  }
  return _fortCharAnim[id];
}

function fortTriggerSquash(playerId, type, chargeRatio) {
  // chargeRatio 0→1: scales squash intensity for 'fire' type
  const cr = (chargeRatio !== undefined) ? Math.max(0, Math.min(1, chargeRatio)) : 1;
  _fortCharAnimGet(playerId).squash = { startMs: Date.now(), type, cr };
}

// Returns { sx, sy } squash/stretch scale. Clears anim.squash when done.
function _fortGetSquashScale(anim, now) {
  if (!anim || !anim.squash) return { sx: 1, sy: 1 };
  const elapsed = now - anim.squash.startMs;
  const type = anim.squash.type;
  // cr: charge ratio 0-1, scales squash magnitude (min 0.4 so even low power has some feel)
  const cr = 0.4 + (anim.squash.cr !== undefined ? anim.squash.cr : 1) * 0.6;
  let sx, sy;
  if (type === 'fire') {
    // Recoil: burst wide → stretch tall → settle; magnitude scales with charge
    if (elapsed < 80) {
      const t = elapsed / 80;
      sx = 1 + 0.45 * cr * t; sy = 1 - 0.45 * cr * t;
    } else if (elapsed < 200) {
      const t = (elapsed - 80) / 120;
      sx = (1 + 0.45 * cr) - (0.67 * cr) * t; sy = (1 - 0.45 * cr) + (0.75 * cr) * t;
    } else if (elapsed < 340) {
      const t = (elapsed - 200) / 140;
      sx = (1 - 0.22 * cr) + 0.22 * cr * t; sy = (1 + 0.30 * cr) - 0.30 * cr * t;
    } else {
      anim.squash = null; return { sx: 1, sy: 1 };
    }
  } else if (type === 'hit') {
    // Impact: slam flat → overshooting bounce → settle
    if (elapsed < 65) {
      const t = elapsed / 65;
      sx = 1 + 0.45 * t; sy = 1 - 0.45 * t;
    } else if (elapsed < 230) {
      const t = (elapsed - 65) / 165;
      sx = 1.45 - 0.60 * t; sy = 0.55 + 0.65 * t;
    } else if (elapsed < 400) {
      const t = (elapsed - 230) / 170;
      sx = 0.85 + 0.15 * t; sy = 1.20 - 0.20 * t;
    } else {
      anim.squash = null; return { sx: 1, sy: 1 };
    }
  } else {
    return { sx: 1, sy: 1 };
  }
  return { sx, sy };
}

// ===== GLOBAL STATE =====
let fortState = null;
let fortCanvas = null, fortCtx = null;
let fortAnimId = null;
let fortLocalAngle = 45;
let fortLocalPower = 50;
let fortParticles = [];
let fortDebris = [];
let fortSmoke = [];
let fortWindParticles = [];
let fortMoveDir = 0; // -1 left, 0 none, 1 right
let fortMoveInterval = null;
let fortMovedThisTurn = 0;
let _fortKeyDown = null;
let _fortKeyUp = null;
let _fortVisibilityHandler = null;
let _fortAngleInterval = null;

// ── 스킬 상태 ─────────────────────────────────────────────────
let _fortEquippedSkills = [];  // 이번 게임에 장착된 스킬 ID 목록
let _fortSkillUsage = {};      // { skillId: 사용횟수 } 게임 내 누적
let _fortActiveSkill = null;   // 이번 턴에 선택한 스킬 (null = 기본 포탄)

// ===== BIRDS =====
let fortBirds = [];
let _fortFallingFeathers = [];
let _fortBirdHitCount = 0;

// ===== SKY PLATFORMS =====
let fortSkyPlatforms = [];

// ===== CLOUD ASSETS =====
let _fortCloudImgs = null;
function _fortPreloadCloudImages() {
  if (_fortCloudImgs) return; // already loading/loaded
  _fortCloudImgs = [];
  for (let i = 1; i <= 5; i++) {
    const img = new Image();
    img.src = 'img/games/fortress/cloud' + i + '.png';
    img.onload = () => { _fortSkyCache = null; }; // rebuild sky when any cloud loads
    _fortCloudImgs.push(img);
  }
}
function _ftDrawCloudSprite(c, img, cx, cy, w, h, opacity, tint) {
  if (!img || !img.complete || !img.naturalWidth) return;
  // Draw into a temp surface so we can tint without affecting other canvas pixels
  const tc = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(Math.ceil(w), Math.ceil(h))
    : (() => { const el = document.createElement('canvas'); el.width = Math.ceil(w); el.height = Math.ceil(h); return el; })();
  const tc2 = tc.getContext('2d');
  tc2.drawImage(img, 0, 0, w, h);
  if (tint) {
    // source-atop: overlay color only where cloud has pixels
    tc2.globalCompositeOperation = 'source-atop';
    tc2.globalAlpha = tint.a;
    tc2.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
    tc2.fillRect(0, 0, w, h);
  }
  c.save();
  c.globalAlpha = opacity;
  c.drawImage(tc, cx - w / 2, cy - h / 2);
  c.restore();
}

// ===== WEB AUDIO =====
let _fortAudioCtx = null;
function _fortGetAudioCtx() {
  if (!_fortAudioCtx) _fortAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _fortAudioCtx;
}
function fortPlaySound(type, tribe) {
  try {
    const ctx = _fortGetAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (type === 'fire') _fortSoundFire(ctx, tribe || 'fire');
    else if (type === 'explosion') _fortSoundExplosion(ctx);
    else if (type === 'bird') _fortSoundBird(ctx);
    else if (type === 'hit') _fortSoundHit(ctx);
    else if (type === 'move') _fortSoundMove(ctx);
  } catch(e) {}
}
function _fortSoundFire(ctx, tribe) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  if (tribe === 'rock') {
    osc.type = 'square'; osc.frequency.setValueAtTime(90, now); osc.frequency.exponentialRampToValueAtTime(35, now+0.5);
    gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  } else if (tribe === 'wind') {
    // noise-like whoosh
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(150, now+0.3);
    gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.4);
  } else if (tribe === 'thunder') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(80, now+0.25);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.35);
  } else if (tribe === 'spirit') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(400, now+0.3);
    gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.45);
  } else { // fire default
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.exponentialRampToValueAtTime(60, now+0.35);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.45);
  }
  osc.start(now); osc.stop(now+0.7);
}
function _fortSoundExplosion(ctx) {
  try {
    const sr = ctx.sampleRate, dur = 0.6, buf = ctx.createBuffer(1, sr*dur, sr), d = buf.getChannelData(0);
    for (let i = 0; i < sr*dur; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/(sr*0.15));
    const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), gain = ctx.createGain();
    filt.type = 'lowpass'; filt.frequency.value = 350;
    src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.7, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.6);
    src.start(now);
  } catch(e) {}
}
function _fortSoundBird(ctx) {
  const now = ctx.currentTime;
  [0, 0.08, 0.16].forEach((t, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(1200+i*200, now+t); o.frequency.linearRampToValueAtTime(900+i*150, now+t+0.06);
    g.gain.setValueAtTime(0.12, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.1);
    o.start(now+t); o.stop(now+t+0.12);
  });
}
function _fortSoundHit(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(60, now+0.2);
  gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.3);
  osc.start(now); osc.stop(now+0.35);
}
function _fortSoundMove(ctx) {
  try {
    const now = ctx.currentTime, sr = ctx.sampleRate, dur=0.12;
    const buf = ctx.createBuffer(1, sr*dur, sr), d=buf.getChannelData(0);
    for(let i=0;i<sr*dur;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(sr*0.04));
    const src=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    f.type='bandpass'; f.frequency.value=200; src.buffer=buf;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.08, now);
    src.start(now);
  } catch(e) {}
}

// ===== CAMERA STATE =====
const FORT_CAM_ZOOM_MIN = 0.8;
const FORT_CAM_ZOOM_MAX = 2.5;

let fortCam = {
  x: 400, y: 250,
  targetX: 400, targetY: 250,
  zoom: 1.0,
  lerp: 0.08
};
let _fortCamLoopId = null;
let _fortDrag = null;

function clampCamera() {
  const vw = FORT_CANVAS_W / fortCam.zoom / 2;
  const vh = FORT_CANVAS_H / fortCam.zoom / 2;
  const cx = FORT_CANVAS_W / 2, cy = FORT_CANVAS_H / 2;
  // When zoomed out enough to see the whole axis, force center
  if (vw >= cx) { fortCam.x = cx; fortCam.targetX = cx; }
  else { fortCam.x = Math.max(vw, Math.min(FORT_CANVAS_W - vw, fortCam.x)); fortCam.targetX = Math.max(vw, Math.min(FORT_CANVAS_W - vw, fortCam.targetX)); }
  if (vh >= cy) { fortCam.y = cy; fortCam.targetY = cy; }
  else { fortCam.y = Math.max(vh, Math.min(FORT_CANVAS_H - vh, fortCam.y)); fortCam.targetY = Math.max(vh, Math.min(FORT_CANVAS_H - vh, fortCam.targetY)); }
}

function applyCameraTransform(ctx) {
  const vw = FORT_CANVAS_W / fortCam.zoom;
  const vh = FORT_CANVAS_H / fortCam.zoom;
  ctx.scale(fortCam.zoom, fortCam.zoom);
  ctx.translate(-fortCam.x + vw / 2, -fortCam.y + vh / 2);
}

let _fortCamLastTs = 0;
function fortCameraLoop(ts) {
  const view = window._fortView;
  if (view && view.phase === 'aiming') {
    // Frame-rate independent lerp (normalized to 60fps)
    const dt = Math.min(ts - _fortCamLastTs, 50); // cap at 50ms to handle tab switch
    _fortCamLastTs = ts;
    const alpha = dt > 0 ? 1 - Math.pow(1 - fortCam.lerp, dt / (1000 / 60)) : fortCam.lerp;
    const dx = fortCam.targetX - fortCam.x;
    const dy = fortCam.targetY - fortCam.y;
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
      fortCam.x += dx * alpha;
      fortCam.y += dy * alpha;
      clampCamera();
    }
    // Always render so wind particles animate even when camera is stationary
    renderFortressScene(view);
  }
  _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
}

function fortZoomIn() {
  if (fortAnimId) return; // don't zoom during animation
  fortCam.zoom = Math.min(FORT_CAM_ZOOM_MAX, fortCam.zoom + 0.2);
  clampCamera();
  const view = window._fortView;
  if (view) renderFortressScene(view);
}

function fortZoomOut() {
  if (fortAnimId) return; // don't zoom during animation
  fortCam.zoom = Math.max(FORT_CAM_ZOOM_MIN, fortCam.zoom - 0.2);
  clampCamera();
  const view = window._fortView;
  if (view) renderFortressScene(view);
}

function fortCameraTarget(px, py) {
  fortCam.targetX = px;
  fortCam.targetY = py;
  clampCamera();
}

function fortCameraSnap(px, py) {
  fortCam.targetX = px;
  fortCam.targetY = py;
  fortCam.x = px;
  fortCam.y = py;
  clampCamera();
}

// ===== TERRAIN GENERATION =====
function generateFortressTerrain(width, height, playerCount) {
  const terrain = new Array(width);
  const baseHeight = height * 0.62;
  const minHeight = height * 0.38;
  const maxHeight = height * 0.74;

  // Use layered sine waves (Fourier-style) for natural rolling hills
  const waves = [];
  const numWaves = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numWaves; i++) {
    waves.push({
      freq: (0.003 + Math.random() * 0.015) * (i + 1),
      amp: (30 + Math.random() * 40) / (i * 0.6 + 1),
      phase: Math.random() * Math.PI * 2,
    });
  }

  for (let x = 0; x < width; x++) {
    let h = baseHeight;
    for (const w of waves) {
      h += Math.sin(x * w.freq + w.phase) * w.amp;
    }
    terrain[x] = Math.max(minHeight, Math.min(maxHeight, h));
  }

  // Add 1-3 plateaus/flat areas
  const numPlateaus = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numPlateaus; i++) {
    const cx = Math.floor(width * 0.15 + Math.random() * width * 0.7);
    const pw = 30 + Math.floor(Math.random() * 50);
    const plateauH = terrain[cx];
    for (let x = cx - pw; x <= cx + pw; x++) {
      if (x < 0 || x >= width) continue;
      const dist = Math.abs(x - cx) / pw;
      const blend = Math.max(0, 1 - dist * dist);
      terrain[x] = terrain[x] * (1 - blend) + plateauH * blend;
    }
  }

  // Add 1-2 big hills (obstacles/mountains)
  const numHills = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numHills; i++) {
    const cx = Math.floor(width * 0.2 + Math.random() * width * 0.6);
    const hillW = 40 + Math.floor(Math.random() * 60);
    const hillH = 40 + Math.random() * 60;
    for (let x = cx - hillW; x <= cx + hillW; x++) {
      if (x < 0 || x >= width) continue;
      const dist = (x - cx) / hillW;
      const bump = hillH * Math.cos(dist * Math.PI / 2) * Math.cos(dist * Math.PI / 2);
      terrain[x] = Math.max(minHeight, terrain[x] - bump);
    }
  }

  // Add a valley or two
  const numValleys = Math.floor(Math.random() * 2);
  for (let i = 0; i < numValleys; i++) {
    const cx = Math.floor(width * 0.2 + Math.random() * width * 0.6);
    const vw = 50 + Math.floor(Math.random() * 60);
    const vd = 20 + Math.random() * 40;
    for (let x = cx - vw; x <= cx + vw; x++) {
      if (x < 0 || x >= width) continue;
      const dist = (x - cx) / vw;
      const dip = vd * Math.cos(dist * Math.PI / 2) * Math.cos(dist * Math.PI / 2);
      terrain[x] = Math.min(maxHeight, terrain[x] + dip);
    }
  }

  // Smooth terrain (3-pass)
  for (let pass = 0; pass < 3; pass++) {
    const smoothed = [...terrain];
    for (let x = 2; x < width - 2; x++) {
      smoothed[x] = (terrain[x - 2] + terrain[x - 1] + terrain[x] + terrain[x + 1] + terrain[x + 2]) / 5;
    }
    for (let x = 2; x < width - 2; x++) terrain[x] = smoothed[x];
  }

  // Flatten areas where players will spawn
  const spacing = width / (playerCount + 1);
  for (let pi = 0; pi < playerCount; pi++) {
    const cx = Math.floor((pi + 1) * spacing);
    const flatW = 20;
    const flatH = terrain[cx];
    for (let x = cx - flatW; x <= cx + flatW; x++) {
      if (x < 0 || x >= width) continue;
      const dist = Math.abs(x - cx) / flatW;
      const blend = Math.max(0, 1 - dist);
      terrain[x] = terrain[x] * (1 - blend) + flatH * blend;
    }
  }

  return terrain;
}

// ===== TERRAIN DESTRUCTION =====
function destroyTerrain(terrain, impactX, impactY, radius) {
  const cx = Math.floor(impactX);
  const r = Math.floor(radius);
  for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || x >= terrain.length) continue;
    const dx = x - cx;
    const maxDepth = Math.sqrt(Math.max(0, r * r - dx * dx));
    const terrainTop = terrain[x];
    // Only destroy if impact is near or below the terrain surface
    if (impactY >= terrainTop - radius) {
      const craterBottom = impactY + maxDepth * 0.6;
      if (craterBottom > terrainTop) {
        terrain[x] = Math.min(FORT_CANVAS_H - 5, craterBottom);
      }
    }
  }
  // Smooth crater edges
  for (let x = Math.max(1, cx - r - 3); x <= Math.min(terrain.length - 2, cx + r + 3); x++) {
    terrain[x] = (terrain[x - 1] + terrain[x] + terrain[x + 1]) / 3;
  }
}

// ===== PARTICLE SYSTEM =====
function spawnExplosionParticles(x, y, count, isBig) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (isBig ? 2 : 1) + Math.random() * (isBig ? 5 : 3);
    fortParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (isBig ? 3 : 1),
      life: 1.0,
      decay: 0.015 + Math.random() * 0.025,
      size: (isBig ? 3 : 1.5) + Math.random() * (isBig ? 4 : 2),
      color: Math.random() > 0.3
        ? `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`
        : `hsl(0, 0%, ${60 + Math.random() * 30}%)`,
    });
  }
}

function spawnDebris(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 1 + Math.random() * 4;
    fortDebris.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1.0,
      decay: 0.01 + Math.random() * 0.015,
      size: 2 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      color: `hsl(30, ${30 + Math.random() * 20 | 0}%, ${25 + Math.random() * 15 | 0}%)`,
    });
  }
}

function spawnSmoke(x, y, count) {
  for (let i = 0; i < count; i++) {
    fortSmoke.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.3 - Math.random() * 0.8,
      life: 1.0,
      decay: 0.008 + Math.random() * 0.012,
      size: 8 + Math.random() * 15,
    });
  }
}

function updateParticles() {
  // In-place compact (avoids new array allocation every frame)
  let j = 0;
  for (let i = 0; i < fortParticles.length; i++) {
    const p = fortParticles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= p.decay;
    if (p.life > 0) fortParticles[j++] = p;
  }
  fortParticles.length = j;

  j = 0;
  for (let i = 0; i < fortDebris.length; i++) {
    const p = fortDebris[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rotation += p.rotSpeed; p.life -= p.decay;
    if (p.life > 0) fortDebris[j++] = p;
  }
  fortDebris.length = j;

  j = 0;
  for (let i = 0; i < fortSmoke.length; i++) {
    const p = fortSmoke[i];
    p.x += p.vx; p.y += p.vy; p.size += 0.3; p.life -= p.decay;
    if (p.life > 0) fortSmoke[j++] = p;
  }
  fortSmoke.length = j;
}

function drawParticles(ctx) {
  // Fire particles — batch by color where possible, minimize state changes
  let lastColor = null;
  for (let i = 0; i < fortParticles.length; i++) {
    const p = fortParticles[i];
    if (p.color !== lastColor) {
      if (lastColor !== null) ctx.fill(); // flush previous batch
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      lastColor = p.color;
    } else {
      ctx.globalAlpha = p.life;
    }
    ctx.moveTo(p.x + p.size * p.life, p.y);
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
  }
  if (lastColor !== null) ctx.fill();

  // Debris — color cached at spawn, reduce save/restore overhead
  for (let i = 0; i < fortDebris.length; i++) {
    const p = fortDebris[i];
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // Smoke — each particle needs its own alpha so draw individually
  if (fortSmoke.length > 0) {
    ctx.fillStyle = 'rgba(100,100,100,1)';
    for (let i = 0; i < fortSmoke.length; i++) {
      const p = fortSmoke[i];
      ctx.globalAlpha = p.life * 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}

// ===== WIND PARTICLE SYSTEM =====
function updateWindParticles(wind) {
  // Update existing particles — in-place compact (no allocation)
  let j = 0;
  for (let i = 0; i < fortWindParticles.length; i++) {
    const p = fortWindParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    // Wrap horizontally so particle re-enters from opposite edge
    if (p.x < -20) p.x = FORT_CANVAS_W + 20;
    if (p.x > FORT_CANVAS_W + 20) p.x = -20;
    if (p.life > 0) fortWindParticles[j++] = p;
  }
  fortWindParticles.length = j;

  // Don't spawn if no wind
  if (wind === 0) return;

  const absWind = Math.abs(wind);
  const dir = wind > 0 ? 1 : -1;
  // Keep pool small so individual particles are visibly moving (max 40)
  const maxPool = 40;
  if (fortWindParticles.length >= maxPool) return;

  const spawnCount = absWind > 3 ? 2 : 1;
  for (let i = 0; i < spawnCount && fortWindParticles.length < maxPool; i++) {
    // Spawn off the upwind edge so we see them fly across
    const spawnX = dir > 0 ? -10 - Math.random() * 30 : FORT_CANVAS_W + 10 + Math.random() * 30;
    const spawnY = Math.random() * FORT_CANVAS_H * 0.65;

    // Faster speed so movement is clearly visible
    const baseSpeed = 2.5 + absWind * 1.2;
    const speed = baseSpeed + Math.random() * baseSpeed * 0.3;

    let length, alpha;
    if (absWind <= 2) {
      length = 6 + Math.random() * 6;
      alpha = 0.35 + Math.random() * 0.15;
    } else if (absWind <= 4) {
      length = 12 + Math.random() * 10;
      alpha = 0.45 + Math.random() * 0.2;
    } else {
      length = 20 + Math.random() * 14;
      alpha = 0.55 + Math.random() * 0.2;
    }

    fortWindParticles.push({
      x: spawnX,
      y: spawnY,
      vx: speed * dir,
      vy: (Math.random() - 0.3) * 0.5,
      life: 1.0,
      decay: 0.006 + Math.random() * 0.008,
      length,
      alpha,
    });
  }
}

function drawWindParticles(ctx, wind) {
  if (wind === 0 || fortWindParticles.length === 0) return;
  const dir = wind > 0 ? 1 : -1;
  // Keep line width constant in screen pixels regardless of zoom
  const lw = 1 / (fortCam.zoom || 1);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  fortWindParticles.forEach(p => {
    const a = p.alpha * p.life;
    ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.length * dir, p.y);
    ctx.stroke();
  });
  ctx.restore();
}

// ===== HOST: GAME INIT =====
function startFortress() {
  fortLoadTamaPet(); // load local player's tama for character rendering
  _fortPreloadCloudImages(); // async: sprites load in bg, sky rebuilds when ready
  _fortCurrentBiome = FORT_BIOME_LIST[Math.floor(Math.random() * FORT_BIOME_LIST.length)];
  const _themeRoll = Math.random();
  _fortCurrentTheme = _themeRoll < 0.6 ? 'day' : _themeRoll < 0.85 ? 'dusk' : 'night';
  _fortSkyCache = null; // force sky rebuild with new theme/biome
  const n = state.players.length;
  const canvasW = FORT_CANVAS_W;

  // Generate interesting terrain
  const terrain = generateFortressTerrain(canvasW, FORT_CANVAS_H, n);

  // Assign positions spread across canvas
  const players = state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: FORT_TANK_COLORS[i % FORT_TANK_COLORS.length],
    tama: p.tama || null,
    x: Math.floor((i + 1) * canvasW / (n + 1)),
    hp: FORT_MAX_HP,
    alive: true,
    angle: 45,
    power: 50,
    moveFuel: FORT_MOVE_FUEL,
    poison: 0,
    frozen: 0,
  }));

  fortState = {
    players,
    terrain,
    wind: Math.floor(Math.random() * 11) - 5,
    turnIdx: 0,
    round: 1,
    phase: 'aiming',
    canvasW: canvasW,
    canvasH: FORT_CANVAS_H,
    deathOrder: [],
  };

  // Reset local controls
  fortLocalAngle = 45;
  fortLocalPower = 50;
  fortMovedThisTurn = 0;

  // 스킬 초기화
  _fortEquippedSkills = (typeof skillsGetEquipped === 'function') ? skillsGetEquipped('fortress') : [];
  _fortSkillUsage = {};
  _fortActiveSkill = null;
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  fortWindParticles = [];
  _fortFallingFeathers = [];
  _fortBirdHitCount = 0;
  initFortBirds();
  initFortSkyPlatforms();

  // Camera: fit-zoom to show all players
  {
    const xs = players.map(p => p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const spanX = Math.max(maxX - minX, 200);
    const fitZoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(1.2, FORT_CANVAS_W / (spanX + 240)));
    fortCam.zoom = fitZoom;
    const cx = (minX + maxX) / 2;
    const cty = Math.floor(Math.max(0, Math.min(cx, FORT_CANVAS_W - 1)));
    const cy = (terrain[cty] || FORT_CANVAS_H * 0.7) - 40;
    fortCameraSnap(cx, cy);
  }

  const view = createFortressView();
  broadcast({ type: 'game-start', game: 'fortress', state: view });
  showScreen('fortressGame');
  initFortCanvas();
  renderFortressView(view);
  setupFortressKeyboard();

  // Start camera loop
  if (_fortCamLoopId) cancelAnimationFrame(_fortCamLoopId);
  _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
}

// ===== KEYBOARD CONTROLS =====
function setupFortressKeyboard() {
  cleanupFortressKeyboard();

  _fortKeyDown = function(e) {
    const view = window._fortView;
    if (!view || view.phase !== 'aiming') return;
    const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
    if (!isMyTurn) return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      fortStartMove(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      fortStartMove(1);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      fortAngleStep(1);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      fortAngleStep(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      fortFire();
    }
  };

  _fortKeyUp = function(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ||
        e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      fortStopMove();
    }
  };

  _fortVisibilityHandler = () => { if (document.hidden) _fortDrag = null; };

  document.addEventListener('keydown', _fortKeyDown);
  document.addEventListener('keyup', _fortKeyUp);
  document.addEventListener('visibilitychange', _fortVisibilityHandler);

  // Prevent context menu (long-press on Android / right-click) from interrupting button holds
  const controls = document.getElementById('fortControls');
  if (controls) controls.addEventListener('contextmenu', e => e.preventDefault());
}

function cleanupFortressKeyboard() {
  if (_fortKeyDown) document.removeEventListener('keydown', _fortKeyDown);
  if (_fortKeyUp) document.removeEventListener('keyup', _fortKeyUp);
  if (_fortVisibilityHandler) document.removeEventListener('visibilitychange', _fortVisibilityHandler);
  _fortVisibilityHandler = null;
  _fortKeyDown = null;
  _fortKeyUp = null;
  fortStopMove();
}

// ===== TANK MOVEMENT =====
function fortStartMove(dir) {
  if (fortMoveDir === dir) return;
  if (fortMoveInterval) {
    clearInterval(fortMoveInterval);
    fortMoveInterval = null;
  }
  fortMoveDir = dir;
  fortDoMove();
  fortMoveInterval = setInterval(fortDoMove, 50);
}

function fortStopMove() {
  fortMoveDir = 0;
  if (fortMoveInterval) {
    clearInterval(fortMoveInterval);
    fortMoveInterval = null;
  }
}

function fortDoMove() {
  if (fortMoveDir === 0) return;

  const view = window._fortView;
  if (!view || view.phase !== 'aiming') { fortStopMove(); return; }
  const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
  if (!isMyTurn) { fortStopMove(); return; }

  // Check fuel
  if (fortMovedThisTurn >= FORT_MOVE_FUEL) { fortStopMove(); return; }

  if (state.isHost) {
    handleFortMove(state.myId, { type: 'fort-move', dir: fortMoveDir });
  } else {
    sendToHost({ type: 'fort-move', dir: fortMoveDir });
  }
}

function fortMoveBtn(dir) {
  // For mobile touch button: single step
  const view = window._fortView;
  if (!view || view.phase !== 'aiming') return;
  const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
  if (!isMyTurn) return;

  fortPlaySound('move');
  if (state.isHost) {
    handleFortMove(state.myId, { type: 'fort-move', dir });
  } else {
    sendToHost({ type: 'fort-move', dir });
  }
}

// HOST: handle movement
function handleFortMove(peerId, msg) {
  if (!fortState || fortState.phase !== 'aiming') return;
  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.alive) return;
  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const dir = msg.dir === -1 ? -1 : 1;
  const fuel = current.moveFuel || 0;
  if (fuel <= 0) return;

  const newX = current.x + dir * FORT_MOVE_SPEED;
  // Boundary check
  if (newX < 20 || newX >= fortState.canvasW - 20) return;

  current.x = newX;
  current.moveFuel = Math.max(0, fuel - FORT_MOVE_SPEED);
  fortMovedThisTurn = FORT_MOVE_FUEL - current.moveFuel;

  broadcastFortressState();
}

// ===== STATE VIEWS =====
function createFortressView() {
  if (!fortState) return null;
  return {
    players: fortState.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      tama: p.tama || null,
      x: p.x,
      hp: p.hp,
      alive: p.alive,
      moveFuel: p.moveFuel || 0,
      poison: p.poison || 0,
      frozen: p.frozen || 0,
    })),
    terrain: fortState.terrain,
    wind: fortState.wind,
    turnIdx: fortState.turnIdx,
    round: fortState.round,
    phase: fortState.phase,
    canvasW: fortState.canvasW,
    canvasH: fortState.canvasH,
    skyPlatforms: fortSkyPlatforms.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, destroyed: p.destroyed || false })),
  };
}

function broadcastFortressState() {
  const view = createFortressView();
  broadcast({ type: 'fort-state', state: view });
  renderFortressView(view);
}

let _fortResizeObserver = null;

function fortFitCanvas() {
  if (!fortCanvas) return;
  const container = fortCanvas.parentElement;
  if (!container) return;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const aspect = FORT_CANVAS_W / FORT_CANVAS_H;
  let w, h;
  // Cover mode: fill the entire container (no letterbox bars)
  if (cw / ch > aspect) {
    w = cw; h = w / aspect;
  } else {
    h = ch; w = h * aspect;
  }
  fortCanvas.style.width = Math.round(w) + 'px';
  fortCanvas.style.height = Math.round(h) + 'px';
}

// ===== CANVAS INIT =====
function initFortCanvas() {
  fortCanvas = document.getElementById('fortressCanvas');
  if (!fortCanvas) return;
  fortCtx = fortCanvas.getContext('2d');

  // Load tama pet and preload image
  fortLoadTamaPet();
  if (_fortTamaPet) fortGetTamaImage(_fortTamaPet);

  const dpr = window.devicePixelRatio || 1;
  fortCanvas.width = FORT_CANVAS_W * dpr;
  fortCanvas.height = FORT_CANVAS_H * dpr;
  fortCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Fit canvas to container maintaining 8:5 aspect ratio
  fortFitCanvas();
  if (_fortResizeObserver) _fortResizeObserver.disconnect();
  _fortResizeObserver = new ResizeObserver(() => {
    fortFitCanvas();
  });
  _fortResizeObserver.observe(fortCanvas.parentElement);

  // Touch pan + pinch zoom (always active, not locked to aiming phase)
  fortCanvas.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _fortDrag = {
        pinch: true,
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: fortCam.zoom,
        cx: fortCam.targetX, cy: fortCam.targetY,
        sx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        sy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      _fortDrag = {
        pinch: false,
        sx: e.touches[0].clientX, sy: e.touches[0].clientY,
        cx: fortCam.targetX, cy: fortCam.targetY
      };
    }
  };

  fortCanvas.ontouchmove = (e) => {
    if (!_fortDrag) return;
    e.preventDefault();
    if (_fortDrag.pinch && e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / _fortDrag.startDist;
      fortCam.zoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(FORT_CAM_ZOOM_MAX, _fortDrag.startZoom * scale));
      // Pan with midpoint — use separate X/Y scales for correct aspect ratio
      const rect = fortCanvas.getBoundingClientRect();
      const scaleX = FORT_CANVAS_W / rect.width;
      const scaleY = FORT_CANVAS_H / rect.height;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const pdx = (mx - _fortDrag.sx) * scaleX / fortCam.zoom;
      const pdy = (my - _fortDrag.sy) * scaleY / fortCam.zoom;
      fortCam.targetX = _fortDrag.cx - pdx;
      fortCam.targetY = _fortDrag.cy - pdy;
      clampCamera();
    } else if (!_fortDrag.pinch && e.touches.length === 1) {
      const rect = fortCanvas.getBoundingClientRect();
      const scaleX = FORT_CANVAS_W / rect.width;
      const scaleY = FORT_CANVAS_H / rect.height;
      const dx = (e.touches[0].clientX - _fortDrag.sx) * scaleX / fortCam.zoom;
      const dy = (e.touches[0].clientY - _fortDrag.sy) * scaleY / fortCam.zoom;
      fortCam.targetX = _fortDrag.cx - dx;
      fortCam.targetY = _fortDrag.cy - dy;
      clampCamera();
    }
  };

  fortCanvas.ontouchend = (e) => {
    if (e.touches.length === 0) {
      _fortDrag = null;
    } else if (e.touches.length === 1 && _fortDrag && _fortDrag.pinch) {
      // Transition from pinch to single-finger pan
      _fortDrag = {
        pinch: false,
        sx: e.touches[0].clientX, sy: e.touches[0].clientY,
        cx: fortCam.targetX, cy: fortCam.targetY
      };
    }
  };

  // Mouse pan (always active)
  fortCanvas.onmousedown = (e) => {
    _fortDrag = {
      sx: e.clientX, sy: e.clientY,
      cx: fortCam.targetX, cy: fortCam.targetY
    };
  };

  fortCanvas.onmousemove = (e) => {
    if (!_fortDrag) return;
    const rect = fortCanvas.getBoundingClientRect();
    const scaleX = FORT_CANVAS_W / rect.width;
    const scaleY = FORT_CANVAS_H / rect.height;
    const dx = (e.clientX - _fortDrag.sx) * scaleX / fortCam.zoom;
    const dy = (e.clientY - _fortDrag.sy) * scaleY / fortCam.zoom;
    fortCam.targetX = _fortDrag.cx - dx;
    fortCam.targetY = _fortDrag.cy - dy;
    clampCamera();
  };

  fortCanvas.onmouseup = () => { _fortDrag = null; };
  fortCanvas.onmouseleave = () => { _fortDrag = null; };

  // Wheel zoom — use addEventListener for explicit passive:false
  fortCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomSpeed = 0.15;
    const dir = e.deltaY < 0 ? 1 : -1;
    fortCam.zoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(FORT_CAM_ZOOM_MAX, fortCam.zoom + dir * zoomSpeed));
    clampCamera();
    const view = window._fortView;
    if (view && !fortAnimId) renderFortressScene(view);
  }, { passive: false });
}

// ===== LOCAL CONTROLS =====
function fortSetAngle(val) {
  fortLocalAngle = parseInt(val);
  const el = document.getElementById('fortAngleValue');
  if (el) el.textContent = fortLocalAngle;
  if (fortState || window._fortView) {
    renderFortressScene(window._fortView || createFortressView());
  }
}

function fortSetPower(val) {
  fortLocalPower = parseInt(val);
  const el = document.getElementById('fortPowerValue');
  if (el) el.textContent = fortLocalPower;
}

// ===== BUTTON-BASED ANGLE/POWER CONTROLS =====
function fortAngleStep(dir) {
  fortSetAngle(Math.max(0, Math.min(180, fortLocalAngle + dir)));
}

function fortAngleStart(dir) {
  fortAngleStep(dir);
  if (_fortAngleInterval) clearInterval(_fortAngleInterval);
  _fortAngleInterval = setInterval(() => fortAngleStep(dir * 2), 60);
}

function fortAngleStop() {
  if (_fortAngleInterval) { clearInterval(_fortAngleInterval); _fortAngleInterval = null; }
}

// ===== CHARGE SHOT =====
var _fortCharging = false;
var _fortChargeInterval = null;
var _fortChargeValue = 0;
var _fortChargeTouched = false; // prevent touch+mouse double-trigger

function fortFireChargeStart(evt) {
  // Prevent touch+mouse double-trigger
  if (evt && evt.type && evt.type.startsWith('touch')) _fortChargeTouched = true;
  if (evt && evt.type && evt.type.startsWith('mouse') && _fortChargeTouched) return;

  if (!fortState && !window._fortView) return;
  const view = window._fortView;
  if (!view || view.phase !== 'aiming') return;
  _fortCharging = true;
  _fortChargeValue = 10;
  fortSetPower(_fortChargeValue);
  updateFortChargeGauge();
  if (_fortChargeInterval) clearInterval(_fortChargeInterval);
  _fortChargeInterval = setInterval(function() {
    if (!_fortCharging) return;
    _fortChargeValue = Math.min(100, _fortChargeValue + 2);
    fortSetPower(_fortChargeValue);
    updateFortChargeGauge();
    if (_fortChargeValue >= 100) {
      clearInterval(_fortChargeInterval);
      _fortChargeInterval = null;
    }
  }, 40);
}

function fortFireChargeEnd(evt) {
  if (!_fortCharging) return;
  if (evt && evt.type && evt.type.startsWith('mouse') && _fortChargeTouched) return;
  // Reset touch flag on touch end
  if (evt && evt.type && evt.type.startsWith('touch')) {
    setTimeout(function() { _fortChargeTouched = false; }, 300);
  }
  _fortCharging = false;
  if (_fortChargeInterval) { clearInterval(_fortChargeInterval); _fortChargeInterval = null; }
  hideChargeGauge();
  fortFire();
}

function updateFortChargeGauge() {
  var gauge = document.getElementById('fortChargeGauge');
  if (!gauge) return;
  gauge.style.display = 'block';
  var pct = ((_fortChargeValue - 10) / 90) * 100;
  var bar = gauge.querySelector('.fort-charge-fill');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct < 40 ? '#4caf50' : pct < 70 ? '#ff9800' : '#f44336';
  }
  var label = gauge.querySelector('.fort-charge-label');
  if (label) label.textContent = _fortChargeValue;
}

function hideChargeGauge() {
  var gauge = document.getElementById('fortChargeGauge');
  if (gauge) gauge.style.display = 'none';
}

// ===== FIRE =====
function fortFire() {
  if (!fortState && !window._fortView) return;
  const view = window._fortView;
  if (!view || view.phase !== 'aiming') return;

  const currentPlayer = view.players[view.turnIdx];
  if (!currentPlayer) return;

  const usedSkill = _fortActiveSkill;

  // 스킬 사용횟수 증가
  if (usedSkill) {
    _fortSkillUsage[usedSkill] = (_fortSkillUsage[usedSkill] || 0) + 1;
  }
  // 발사 후 스킬 선택 해제
  _fortActiveSkill = null;
  fortUpdateSkillBar();

  if (state.isHost) {
    handleFortFire(state.myId, {
      type: 'fort-fire',
      angle: fortLocalAngle,
      power: fortLocalPower,
      skill: usedSkill,
    });
  } else {
    if (currentPlayer.id !== state.myId) return;
    sendToHost({
      type: 'fort-fire',
      angle: fortLocalAngle,
      power: fortLocalPower,
      skill: usedSkill,
    });
  }
}

// ===== HOST: HANDLE FIRE (스킬 지원) =====
function handleFortFire(peerId, msg) {
  if (!fortState || fortState.phase !== 'aiming') return;

  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.alive) return;
  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const angle = Math.max(0, Math.min(180, parseInt(msg.angle) || 45));
  const power = Math.max(10, Math.min(100, parseInt(msg.power) || 50));
  const skill  = (typeof msg.skill === 'string') ? msg.skill : null;

  fortState.phase = 'animating';

  const startX = current.x;
  const stx = Math.floor(Math.max(0, Math.min(startX, FORT_CANVAS_W - 1)));
  const startY = fortState.terrain[stx] - FORT_TAMA_RADIUS * 1.5 - 2;

  // 유도탄 대상 목록
  const homingTargets = fortState.players
    .filter(p => p.alive && p.id !== current.id)
    .map(p => {
      const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
      return { x: p.x, y: fortState.terrain[px] - FORT_TANK_H / 2 };
    });

  const skillOpts = skill ? { skill, homingTargets } : {};

  // ── 메인 경로 계산 ─────────────────────────────────────
  let pathResult = computeProjectilePath(startX, startY, angle, power, fortState.wind, skillOpts);

  // 분열탄: 메인 경로를 40% 지점에서 잘라냄
  let splitIdx = 0;
  if (skill === 'split') {
    splitIdx = Math.max(1, Math.floor(pathResult.path.length * 0.40));
    pathResult.path.length = splitIdx + 1;
    pathResult.impactX = pathResult.path.xs[splitIdx];
    pathResult.impactY = pathResult.path.ys[splitIdx];
    pathResult.hitTerrain = false;
  }

  // ── 추가 포탄 계산 ──────────────────────────────────────
  const extraShots = [];

  if (skill === 'double_shot') {
    [-7, 7].forEach((dA, i) => {
      const a2 = Math.max(0, Math.min(180, angle + dA));
      const pr2 = computeProjectilePath(startX, startY, a2, power, fortState.wind, {});
      extraShots.push({ startX, startY, angle: a2, power, pathResult: pr2, delay: i * 120 });
    });
  } else if (skill === 'split') {
    // 분열 지점에서 속도 벡터 방향 계산
    const sxi = Math.min(splitIdx, pathResult.path.length - 1);
    const sxi1 = Math.max(0, sxi - 1);
    const vdx = pathResult.path.xs[sxi] - pathResult.path.xs[sxi1];
    const vdy = pathResult.path.ys[sxi] - pathResult.path.ys[sxi1];
    const baseAngle = Math.atan2(-vdy, vdx) * 180 / Math.PI;
    const sx = pathResult.path.xs[sxi], sy = pathResult.path.ys[sxi];
    [-22, 0, 22].forEach((dA, i) => {
      const sa = Math.max(0, Math.min(180, baseAngle + dA));
      const pr = computeProjectilePath(sx, sy, sa, power * 0.75, fortState.wind, {});
      extraShots.push({ startX: sx, startY: sy, angle: sa, power: power * 0.75, pathResult: pr, delay: 0 });
    });
  }

  // ── 히트 판정 ──────────────────────────────────────────
  const mainHit = checkHit(pathResult.impactX, pathResult.impactY, current.id);
  const extraHits = extraShots.map(s => checkHit(s.pathResult.impactX, s.pathResult.impactY, current.id));

  // ── 스킬 상태이상 처리 ─────────────────────────────────
  const skillEffects = { poison: [], frozen: [], knockback: [] };
  const hitIdSet = new Set();
  mainHit.targets.forEach(t => { if (t.direct) hitIdSet.add(t.id); });
  extraHits.forEach(hr => hr.targets.forEach(t => { if (t.direct) hitIdSet.add(t.id); }));

  hitIdSet.forEach(hitId => {
    const p = fortState.players.find(pp => pp.id === hitId);
    if (!p || !p.alive) return;
    if (skill === 'poison')    { p.poison  = Math.max(p.poison  || 0, 3); skillEffects.poison.push(hitId); }
    if (skill === 'ice')       { p.frozen  = Math.max(p.frozen  || 0, 1); skillEffects.frozen.push(hitId); }
    if (skill === 'knockback') {
      const dir = (p.x - pathResult.impactX) >= 0 ? 1 : -1;
      const newX = Math.max(20, Math.min(FORT_CANVAS_W - 20, p.x + dir * 90));
      p.x = newX;
      skillEffects.knockback.push({ id: hitId, newX });
    }
  });

  // ── 데미지 적용 ────────────────────────────────────────
  applyDamage(mainHit);
  extraHits.forEach(hr => applyDamage(hr));

  // ── 지형 파괴 ──────────────────────────────────────────
  const terrainBefore = fortState.terrain.slice();
  const craterR = (skill === 'earthquake') ? FORT_CRATER_RADIUS * 3 : FORT_CRATER_RADIUS;
  if (pathResult.hitTerrain) {
    destroyTerrain(fortState.terrain, pathResult.impactX, pathResult.impactY, craterR);
  }
  extraShots.forEach(s => {
    if (s.pathResult.hitTerrain) {
      destroyTerrain(fortState.terrain, s.pathResult.impactX, s.pathResult.impactY, FORT_CRATER_RADIUS);
    }
  });

  // ── 클러스터탄: 소형 폭탄 산포 ─────────────────────────
  const clusterImpacts = [];
  if (skill === 'cluster') {
    for (let c = 0; c < 5; c++) {
      const cA = angle + (Math.random() - 0.5) * 80;
      const cPow = power * 0.35;
      const cp = computeProjectilePath(
        pathResult.impactX, pathResult.impactY - 8,
        Math.max(0, Math.min(180, cA)), cPow, fortState.wind, {}
      );
      const chr = checkHit(cp.impactX, cp.impactY, current.id);
      applyDamage(chr);
      if (cp.hitTerrain) destroyTerrain(fortState.terrain, cp.impactX, cp.impactY, FORT_CRATER_RADIUS * 0.5);
      clusterImpacts.push({ impactX: cp.impactX, impactY: cp.impactY, hitResult: chr });
    }
  }

  const shooterTribe = (current.tama && current.tama.tribe) ? current.tama.tribe : 'fire';
  const animMsg = {
    type: 'fort-anim',
    startX, startY, angle, power,
    wind: fortState.wind,
    hitResult: mainHit,
    shooterId: current.id,
    shooterTribe,
    impactX: pathResult.impactX,
    impactY: pathResult.impactY,
    terrainBefore,
    terrainAfter: fortState.terrain.slice(),
    // 스킬 필드
    skill,
    extraShots: extraShots.map((s, i) => ({
      startX: s.startX, startY: s.startY, angle: s.angle, power: s.power,
      hitResult: extraHits[i],
      impactX: s.pathResult.impactX, impactY: s.pathResult.impactY,
      hitTerrain: s.pathResult.hitTerrain,
      delay: s.delay || 0,
    })),
    skillEffects,
    clusterImpacts,
  };
  broadcast(animMsg);

  startFortAnimation(animMsg, () => {
    if (!fortState) return;
    const alive = fortState.players.filter(p => p.alive);
    if (alive.length <= 1) {
      fortState.phase = 'gameover';
      const winner = alive[0] || null;
      const resultMsg = {
        type: 'fort-result',
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : null,
        players: fortState.players.map(p => ({
          id: p.id, name: p.name, avatar: p.avatar,
          hp: p.hp, alive: p.alive,
        })),
        deathOrder: fortState.deathOrder,
      };
      broadcast(resultMsg);
      showFortressGameOver(resultMsg);
    } else {
      advanceFortTurn();
    }
  });
}

// ===== PHYSICS (clean rewrite) =====
// Simple projectile motion: parabolic arc, no drag, gentle wind
// speed = 1.5 + power * 0.1  →  P50 ≈ 280px range, P100 ≈ 880px range at 45°
// ===== TRAJECTORY PREVIEW =====
// Simple straight dotted line showing only the firing angle direction
function drawTrajectoryPreview(ctx, startX, startY, angleDeg, wind) {
  const rad = angleDeg * Math.PI / 180;
  const lineLen = 72;
  const endX = startX + Math.cos(rad) * lineLen;
  const endY = startY - Math.sin(rad) * lineLen;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

// skillOpts: { skill, homingTargets }
function computeProjectilePath(startX, startY, angleDeg, power, wind, skillOpts) {
  const skill = (skillOpts && skillOpts.skill) || null;
  const rad = angleDeg * Math.PI / 180;

  // 저격탄: 3배 속도
  const speedMult = (skill === 'sniper') ? 3 : 1;
  const speed = (1.5 + power * 0.1) * speedMult;

  let vx = speed * Math.cos(rad);
  let vy = -speed * Math.sin(rad);
  let x = startX;
  let y = startY;

  const MAX_STEPS = (skill === 'sniper') ? 8000 : 4000;
  const xs = new Float32Array(MAX_STEPS + 1);
  const ys = new Float32Array(MAX_STEPS + 1);
  xs[0] = x; ys[0] = y;
  let len = 1;

  const terrain = fortState ? fortState.terrain :
    (window._fortView ? window._fortView.terrain : new Array(FORT_CANVAS_W).fill(380));
  const width = fortState ? fortState.canvasW : FORT_CANVAS_W;
  const platforms = (typeof fortSkyPlatforms !== 'undefined') ? fortSkyPlatforms : [];

  // 유도 대상 (homing)
  const homingTargets = (skillOpts && skillOpts.homingTargets) || [];

  // 관통·바운스·구멍뚫기 상태
  let pierceCount = 0;
  const maxPierce = (skill === 'triple_pierce') ? 3 : (skill === 'double_pierce') ? 2 : 0;
  let bounceCount = 0;
  const maxBounce = (skill === 'bounce') ? 3 : 0;

  let exitReason = 'maxsteps';
  for (let i = 0; i < MAX_STEPS; i++) {
    // 바람 (저격탄은 바람 무시)
    if (skill !== 'sniper') vx += wind * 0.003;
    // 중력 (관통탄은 중력 무시 — 직선 관통)
    if (skill !== 'penetrate') vy += FORT_GRAVITY;

    // 유도탄: 가장 가까운 적으로 약하게 끌림
    if (skill === 'homing' && homingTargets.length > 0) {
      let nearest = homingTargets[0], minD = Infinity;
      homingTargets.forEach(t => {
        const d = (t.x - x) ** 2 + (t.y - y) ** 2;
        if (d < minD) { minD = d; nearest = t; }
      });
      const dx = nearest.x - x, dy = nearest.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        vx += (dx / dist) * 0.12;
        vy += (dy / dist) * 0.12;
        // 속도 제한 (급격히 빨라지지 않도록)
        const spd = Math.sqrt(vx * vx + vy * vy);
        if (spd > speed * 1.3) { vx = (vx / spd) * speed * 1.3; vy = (vy / spd) * speed * 1.3; }
      }
    }

    x += vx; y += vy;
    xs[len] = x; ys[len] = y; len++;

    const tx = Math.floor(x);

    // 좌우 벽 처리
    if (tx < 0 || tx >= width) {
      if (skill === 'bounce' && bounceCount < maxBounce) {
        vx = -vx;
        x = tx < 0 ? 1 : width - 1;
        bounceCount++;
        continue;
      }
      exitReason = 'offscreen'; break;
    }

    // 지형 충돌
    if (y >= terrain[tx]) {
      if (skill === 'penetrate') { continue; }  // 관통탄은 지형 통과
      if (skill === 'bounce' && bounceCount < maxBounce) {
        vy = -Math.abs(vy) * 0.72;
        y = terrain[tx] - 1;
        bounceCount++;
        continue;
      }
      if (pierceCount < maxPierce) { pierceCount++; continue; }
      exitReason = 'terrain'; break;
    }
    if (y > FORT_CANVAS_H + 100) { exitReason = 'offscreen'; break; }

    let hitPlatform = false;
    for (const plat of platforms) {
      if (plat.destroyed) continue;
      if (x >= plat.x - plat.w / 2 && x <= plat.x + plat.w / 2 &&
          y >= plat.y && y <= plat.y + plat.h) { hitPlatform = true; break; }
    }
    if (hitPlatform) { exitReason = 'platform'; break; }
  }

  const path = { xs, ys, length: len };
  return { path, impactX: x, impactY: y, hitTerrain: exitReason === 'terrain' || exitReason === 'platform' };
}

function checkHit(impactX, impactY, shooterId) {
  if (!fortState) return { hit: false, targets: [] };

  const targets = [];
  fortState.players.forEach(p => {
    if (!p.alive) return;
    const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
    const tankY = fortState.terrain[px] - FORT_TANK_H / 2;
    const dx = impactX - p.x;
    const dy = impactY - tankY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= FORT_HIT_RADIUS) {
      const ratio = 1 - (dist / FORT_HIT_RADIUS);
      const dmg = Math.floor(FORT_DIRECT_DMG[0] + ratio * (FORT_DIRECT_DMG[1] - FORT_DIRECT_DMG[0]));
      targets.push({ id: p.id, damage: dmg, direct: true });
    } else if (dist <= FORT_SPLASH_RADIUS) {
      const ratio = 1 - ((dist - FORT_HIT_RADIUS) / (FORT_SPLASH_RADIUS - FORT_HIT_RADIUS));
      const dmg = Math.floor(FORT_SPLASH_DMG[0] + ratio * (FORT_SPLASH_DMG[1] - FORT_SPLASH_DMG[0]));
      targets.push({ id: p.id, damage: dmg, direct: false });
    }
  });

  return { hit: targets.length > 0, targets };
}

function applyDamage(hitResult) {
  if (!fortState || !hitResult.targets) return;
  hitResult.targets.forEach(t => {
    const p = fortState.players.find(pp => pp.id === t.id);
    if (!p || !p.alive) return;
    p.hp = Math.max(0, p.hp - t.damage);
    if (p.hp <= 0) {
      p.alive = false;
      fortState.deathOrder.push(p.id);
    }
  });
}

// ===== TURN MANAGEMENT =====
function advanceFortTurn() {
  if (!fortState) return;

  const n = fortState.players.length;
  let nextIdx = (fortState.turnIdx + 1) % n;
  let tries = 0;
  // 살아있는 다음 플레이어 탐색
  while (!fortState.players[nextIdx].alive && tries < n) {
    nextIdx = (nextIdx + 1) % n;
    tries++;
  }

  if (nextIdx <= fortState.turnIdx) fortState.round++;

  // ── 빙결 처리: 빙결된 플레이어는 턴 스킵 ──────────────
  const frozenPlayer = fortState.players[nextIdx];
  if (frozenPlayer && frozenPlayer.frozen > 0 && frozenPlayer.alive) {
    frozenPlayer.frozen--;
    fortState.turnIdx = nextIdx;
    fortState.wind = Math.floor(Math.random() * 11) - 5;
    broadcastFortressState();
    // 1초 후 자동으로 다음 턴 진행
    setTimeout(() => {
      if (fortState && fortState.phase !== 'gameover') advanceFortTurn();
    }, 1200);
    return;
  }

  // ── 독 데미지 적용 ─────────────────────────────────────
  const nextPlayer = fortState.players[nextIdx];
  if (nextPlayer && nextPlayer.poison > 0 && nextPlayer.alive) {
    nextPlayer.hp = Math.max(0, nextPlayer.hp - 8);
    nextPlayer.poison--;
    if (nextPlayer.hp <= 0) {
      nextPlayer.alive = false;
      fortState.deathOrder.push(nextPlayer.id);
      const alive = fortState.players.filter(p => p.alive);
      if (alive.length <= 1) {
        fortState.phase = 'gameover';
        const winner = alive[0] || null;
        const resultMsg = {
          type: 'fort-result',
          winnerId: winner ? winner.id : null,
          winnerName: winner ? winner.name : null,
          players: fortState.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, hp: p.hp, alive: p.alive })),
          deathOrder: fortState.deathOrder,
        };
        broadcast(resultMsg);
        showFortressGameOver(resultMsg);
        return;
      }
      // 독으로 사망 → 다시 턴 진행
      fortState.turnIdx = nextIdx;
      advanceFortTurn();
      return;
    }
  }

  fortState.turnIdx = nextIdx;
  fortState.wind = Math.floor(Math.random() * 11) - 5;
  fortState.phase = 'aiming';

  if (nextPlayer) nextPlayer.moveFuel = FORT_MOVE_FUEL;
  fortMovedThisTurn = 0;

  if (nextPlayer) {
    const npx = nextPlayer.x;
    const npy = fortState.terrain[Math.floor(Math.max(0, Math.min(npx, FORT_CANVAS_W - 1)))] - FORT_TANK_H;
    fortCameraTarget(npx, npy);
  }

  broadcastFortressState();
}

// 추가 포탄 단순 애니메이션 (extra shots용)
function _fortAnimateExtraShot(shot, terrainAfter, onDone) {
  const skillOpts = {};
  const pathResult = computeProjectilePath(shot.startX, shot.startY, shot.angle, shot.power, 0, skillOpts);
  const path = pathResult.path;
  const view = window._fortView;
  if (!view) { if (onDone) onDone(); return; }

  let frameIdx = 0;
  const speed = 3;

  function loop() {
    if (!view) { if (onDone) onDone(); return; }
    updateParticles();
    renderFortressScene(view);
    if (fortCtx && frameIdx < path.length) {
      const ctx = fortCtx;
      ctx.save(); applyCameraTransform(ctx);
      const ti = Math.min(frameIdx, path.length - 1);
      const ptx = path.xs[ti], pty = path.ys[ti];
      ctx.fillStyle = '#ffcc00';
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ptx, pty, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    frameIdx += speed;
    if (frameIdx >= path.length) {
      const ix = shot.impactX != null ? shot.impactX : path.xs[path.length - 1];
      const iy = shot.impactY != null ? shot.impactY : path.ys[path.length - 1];
      animateExplosion(ix, iy, shot.hitResult, view, onDone, terrainAfter);
      return;
    }
    fortAnimId = requestAnimationFrame(loop);
  }
  fortAnimId = requestAnimationFrame(loop);
}

// ===== ANIMATION =====
function startFortAnimation(msg, callback) {
  // Play fire sound for all clients (shooter and observers alike)
  fortPlaySound('fire', msg.shooterTribe || 'fire');

  const view = window._fortView;

  // ── terrainBefore를 경로 계산 전에 적용 ──────────────────────
  // HOST와 CLIENT 모두 동일한 terrainBefore 기준으로 경로를 계산해야
  // 시각 경로와 폭발 위치가 일치한다. 순서가 중요!
  const savedFortTerrain = fortState ? fortState.terrain : null;
  if (msg.terrainBefore) {
    if (view) view.terrain = msg.terrainBefore;
    if (fortState) fortState.terrain = msg.terrainBefore; // host도 일시 교체
  }

  // 스킬 효과에 따른 skillOpts (클라이언트 경로 재계산용)
  const animSkillOpts = (msg.skill === 'sniper' || msg.skill === 'penetrate' || msg.skill === 'bounce' ||
                         msg.skill === 'double_pierce' || msg.skill === 'triple_pierce')
    ? { skill: msg.skill }
    : {};
  const pathResult = computeProjectilePath(msg.startX, msg.startY, msg.angle, msg.power, msg.wind, animSkillOpts);
  const path = pathResult.path;

  // host terrain 복구 (state 로직은 terrainAfter 기준으로 돌아감)
  if (savedFortTerrain && fortState) fortState.terrain = savedFortTerrain;

  // 분열탄: 클라이언트도 경로를 40% 지점에서 잘라냄
  if (msg.skill === 'split' && path.length > 1) {
    path.length = Math.max(1, Math.floor(path.length * 0.40) + 1);
  }
  const hitResult = msg.hitResult;

  // Clear old particles
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];

  // Trigger fire squash on shooter — magnitude scales with power (chargeRatio)
  if (view && view.players && view.turnIdx !== undefined) {
    const shooter = view.players[view.turnIdx];
    if (shooter) {
      const cr = Math.max(0, Math.min(1, (msg.power - 10) / 90));
      fortTriggerSquash(shooter.id, 'fire', cr);
    }
  }

  let frameIdx = 0;
  const speed = 2; // slower projectile (was 4)
  let muzzleFlashFrame = 0;

  if (fortAnimId) cancelAnimationFrame(fortAnimId);

  // Muzzle flash particles at barrel tip
  const muzzleRad = msg.angle * Math.PI / 180;
  const muzzleX = msg.startX + FORT_BARREL_LEN * Math.cos(muzzleRad);
  const muzzleY = msg.startY - FORT_BARREL_LEN * Math.sin(muzzleRad);
  spawnExplosionParticles(muzzleX, muzzleY, 8, false);

  function animLoop() {
    if (!view) { if (callback) callback(); return; }

    // Camera lerp: track projectile
    if (frameIdx < path.length) {
      const ti = Math.min(frameIdx, path.length - 1);
      fortCam.targetX = path.xs[ti];
      fortCam.targetY = path.ys[ti];
    }
    fortCam.x += (fortCam.targetX - fortCam.x) * fortCam.lerp;
    fortCam.y += (fortCam.targetY - fortCam.y) * fortCam.lerp;
    clampCamera();

    updateParticles();
    renderFortressScene(view);

    if (fortCtx) {
      const ctx = fortCtx;

      // Apply camera transform for projectile/trail rendering
      ctx.save();
      applyCameraTransform(ctx);

      // Draw fading trajectory line (dotted)
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.25)';
      ctx.lineWidth = 1 / fortCam.zoom; // keep line thin at zoom
      ctx.beginPath();
      const trailStart = 0;
      const trailEnd = Math.min(frameIdx, path.length - 1);
      for (let i = trailStart; i <= trailEnd; i++) {
        if (i === trailStart) ctx.moveTo(path.xs[i], path.ys[i]);
        else ctx.lineTo(path.xs[i], path.ys[i]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Check bird hits
      if (frameIdx < path.length) {
        const bx = path.xs[frameIdx], by = path.ys[frameIdx];
        for (const bird of fortBirds) {
          if (!bird.alive || bird.falling) continue;
          if (Math.abs(bx - bird.x) < 18 && Math.abs(by - bird.y) < 12) {
            bird.falling = true; bird.fallVy = -1; bird.fallRot = 0; bird.alive = false;
            _fortBirdHitCount++;
            fortPlaySound('bird');
            // Feather burst
            for (let fi = 0; fi < 6; fi++) _fortFallingFeathers.push({ x:bird.x, y:bird.y, vx:(Math.random()-0.5)*3, vy:-1-Math.random()*2, rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.3, life:1.0, decay:0.018 });
            if (_fortBirdHitCount === 1) setTimeout(() => showToast('🐦 새 명중! [새 저격] 업적 달성!'), 300);
            else if (_fortBirdHitCount >= 5) setTimeout(() => showToast('🦅 새 5마리 격추! [조류 전멸] 업적!'), 300);
            else setTimeout(() => showToast('🐦 새 명중! (' + _fortBirdHitCount + '마리)'), 300);
          }
        }
      }

      // Draw tribe-specific projectile trail + ball
      const tribe = msg.shooterTribe || 'fire';
      const trailLen = 15;
      const tStart = Math.max(0, frameIdx - trailLen);
      const tEnd = Math.min(frameIdx, path.length - 1);

      // Trail colors per tribe
      const trailColors = {
        fire:    (t) => `rgba(255,${100+Math.floor(t*100)},20,${t*0.75})`,
        rock:    (t) => `rgba(${120+Math.floor(t*60)},${80+Math.floor(t*40)},40,${t*0.6})`,
        wind:    (t) => `rgba(100,${200+Math.floor(t*55)},${200+Math.floor(t*55)},${t*0.55})`,
        thunder: (t) => `rgba(255,${220+Math.floor(t*35)},0,${t*0.8})`,
        spirit:  (t) => `rgba(${160+Math.floor(t*60)},100,255,${t*0.7})`,
      };
      const getTrailColor = trailColors[tribe] || trailColors.fire;

      for (let i = tStart; i <= tEnd; i++) {
        const t = (i - tStart) / trailLen;
        const size = tribe === 'wind' ? 1 + t * 2 : 1 + t * 3;
        ctx.fillStyle = getTrailColor(t);
        ctx.beginPath();
        ctx.arc(path.xs[i], path.ys[i], size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw projectile head
      if (frameIdx < path.length) {
        const ptx = path.xs[frameIdx];
        const pty = path.ys[frameIdx];

        ctx.save();
        if (tribe === 'fire') {
          ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath(); ctx.arc(ptx, pty, 5, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ff3300';
          ctx.beginPath(); ctx.arc(ptx, pty, 3, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 2 === 0) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2, life:0.6, decay:0.05+Math.random()*0.03, size:2+Math.random()*2, color:`hsl(${20+Math.random()*30},100%,${55+Math.random()*25}%)` });

        } else if (tribe === 'rock') {
          ctx.fillStyle = '#8b7355';
          // Draw as jagged polygon
          const pts = 7, r1=6, r2=4;
          ctx.beginPath();
          for (let k=0; k<pts; k++) {
            const a = (k/pts)*Math.PI*2, r = k%2===0?r1:r2;
            k===0 ? ctx.moveTo(ptx+Math.cos(a)*r, pty+Math.sin(a)*r) : ctx.lineTo(ptx+Math.cos(a)*r, pty+Math.sin(a)*r);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(200,180,140,0.5)';
          ctx.beginPath(); ctx.arc(ptx-2, pty-2, 2, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 4 === 0) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*1.5, vy:(Math.random()-0.5)*1.5, life:0.4, decay:0.03, size:1.5+Math.random()*2, color:`hsl(30,40%,40%)` });

        } else if (tribe === 'wind') {
          ctx.strokeStyle = 'rgba(150,240,255,0.9)'; ctx.lineWidth = 2;
          ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10;
          const vd = Math.atan2(path.ys[Math.min(frameIdx+1,path.length-1)]-pty, path.xs[Math.min(frameIdx+1,path.length-1)]-ptx);
          ctx.save(); ctx.translate(ptx,pty); ctx.rotate(vd);
          ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.moveTo(4,-4); ctx.lineTo(8,0); ctx.lineTo(4,4);
          ctx.stroke(); ctx.restore();
          if (frameIdx % 2 === 0) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*2, vy:-0.5-Math.random(), life:0.5, decay:0.06, size:1+Math.random()*2, color:`rgba(100,230,255,0.7)` });

        } else if (tribe === 'thunder') {
          ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ffe000'; ctx.lineWidth = 3;
          const zi = Math.min(frameIdx+3, path.length-1);
          ctx.beginPath(); ctx.moveTo(ptx-6, pty+6); ctx.lineTo(ptx, pty-2); ctx.lineTo(ptx+3, pty); ctx.lineTo(ptx+8, pty-7);
          ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ptx-6, pty+6); ctx.lineTo(ptx, pty-2); ctx.lineTo(ptx+3, pty); ctx.lineTo(ptx+8, pty-7);
          ctx.stroke();
          if (frameIdx % 2 === 0) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*3, vy:(Math.random()-0.5)*3, life:0.4, decay:0.08, size:1+Math.random()*2, color:`hsl(55,100%,70%)` });

        } else { // spirit
          ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 18;
          const gr = ctx.createRadialGradient(ptx,pty,0,ptx,pty,7);
          gr.addColorStop(0,'rgba(255,255,255,0.9)'); gr.addColorStop(0.5,'rgba(180,120,255,0.7)'); gr.addColorStop(1,'rgba(100,60,200,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(ptx, pty, 7, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 3 === 0) {
            const sa = Math.random()*Math.PI*2, sd = 4+Math.random()*4;
            fortParticles.push({ x:ptx+Math.cos(sa)*sd, y:pty+Math.sin(sa)*sd, vx:Math.cos(sa)*0.5, vy:Math.sin(sa)*0.5, life:0.7, decay:0.04, size:1.5, color:`hsl(${260+Math.random()*40},80%,70%)` });
          }
        }
        ctx.restore();
      }

      // Draw particles on top
      drawParticles(ctx);

      ctx.restore(); // end camera transform
    }

    frameIdx += speed;

    if (frameIdx >= path.length) {
      const impactIdx = path.length - 1;
      const exX = (msg.impactX != null) ? msg.impactX : path.xs[impactIdx];
      const exY = (msg.impactY != null) ? msg.impactY : path.ys[impactIdx];

      // 스킬 플래시 표시
      if (msg.skill && msg.skill !== null) {
        const def = (typeof skillsGetDef === 'function') ? skillsGetDef(msg.skill) : null;
        if (def) _fortShowSkillFlash(def.emoji + ' ' + def.name);
      }

      // 메인 폭발 후 → 추가 포탄 / 클러스터 애니메이션 체인
      function runExtras(extIdx, finalCb) {
        const extras = msg.extraShots || [];
        if (extIdx >= extras.length) {
          // 클러스터 폭발 처리
          const clusters = msg.clusterImpacts || [];
          if (clusters.length > 0) {
            let ci = 0;
            function nextCluster() {
              if (ci >= clusters.length) { finalCb && finalCb(); return; }
              const cl = clusters[ci++];
              setTimeout(() => {
                animateExplosion(cl.impactX, cl.impactY, cl.hitResult, view, nextCluster, null);
              }, 80);
            }
            nextCluster(); return;
          }
          finalCb && finalCb(); return;
        }
        const shot = extras[extIdx];
        setTimeout(() => {
          fortPlaySound('fire', msg.shooterTribe || 'fire');
          _fortAnimateExtraShot(shot, msg.terrainAfter, () => runExtras(extIdx + 1, finalCb));
        }, shot.delay || 0);
      }

      // 넉백 시각 반영 (뷰의 플레이어 위치 이동)
      if (msg.skillEffects && msg.skillEffects.knockback && view) {
        msg.skillEffects.knockback.forEach(({ id, newX }) => {
          const p = view.players.find(pp => pp.id === id);
          if (p) p.x = newX;
        });
      }

      animateExplosion(exX, exY, hitResult, view, () => {
        runExtras(0, callback);
      }, msg.terrainAfter);
      return;
    }

    fortAnimId = requestAnimationFrame(animLoop);
  }

  fortAnimId = requestAnimationFrame(animLoop);
}

function animateExplosion(x, y, hitResult, view, callback, terrainAfter) {
  let frame = 0;
  const totalFrames = 35;
  const maxRadius = 50;
  let terrainApplied = false;

  // Spawn lots of particles at impact
  spawnExplosionParticles(x, y, 40, true);
  spawnDebris(x, y, 20);
  spawnSmoke(x, y, 12);
  fortPlaySound('explosion');

  // Apply damage to view NOW (at impact moment, not before animation)
  if (view && hitResult && hitResult.targets) {
    hitResult.targets.forEach(t => {
      const p = view.players.find(pp => pp.id === t.id);
      if (p) { p.hp = Math.max(0, p.hp - t.damage); if (p.hp <= 0) p.alive = false; }
    });
  }

  // Trigger hit squash on all damaged players
  if (hitResult && hitResult.targets) {
    hitResult.targets.forEach(t => { if (t.damage > 0) fortTriggerSquash(t.id, 'hit'); });
  }

  // Camera: target impact point
  fortCam.targetX = x;
  fortCam.targetY = y;

  // Screen shake state
  let shakeIntensity = 8;

  function explodeLoop() {
    // Apply terrain destruction after flash fades (frame 5)
    if (!terrainApplied && frame >= 5 && terrainAfter && view) {
      view.terrain = terrainAfter;
      terrainApplied = true;
    }
    // Camera lerp
    fortCam.x += (fortCam.targetX - fortCam.x) * fortCam.lerp;
    fortCam.y += (fortCam.targetY - fortCam.y) * fortCam.lerp;
    clampCamera();

    updateParticles();

    // Screen shake
    const dprShake = window.devicePixelRatio || 1;
    const shakeX = (Math.random() - 0.5) * shakeIntensity / dprShake;
    const shakeY = (Math.random() - 0.5) * shakeIntensity / dprShake;
    shakeIntensity *= 0.9;

    if (fortCtx) {
      fortCtx.save();
      if (frame < 15) fortCtx.translate(shakeX, shakeY);
    }

    renderFortressScene(view);

    if (fortCtx) {
      const ctx = fortCtx;
      const progress = frame / totalFrames;

      // Explosion flash (very bright at start, no camera transform needed)
      if (frame < 5) {
        const flashAlpha = (1 - frame / 5) * 0.6;
        ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.fillRect(0, 0, FORT_CANVAS_W, FORT_CANVAS_H);
      }

      // Apply camera transform for explosion effects in world space
      ctx.save();
      applyCameraTransform(ctx);

      // Multi-layer explosion
      const radius = maxRadius * Math.min(1, progress * 2);
      const alpha = Math.max(0, 1 - progress);

      // Outer ring
      const grad1 = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.3);
      grad1.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.3})`);
      grad1.addColorStop(0.5, `rgba(255, 120, 0, ${alpha * 0.5})`);
      grad1.addColorStop(1, `rgba(200, 50, 0, 0)`);
      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Inner core
      const coreR = radius * 0.6;
      const grad2 = ctx.createRadialGradient(x, y, 0, x, y, coreR);
      grad2.addColorStop(0, `rgba(255, 255, 220, ${alpha})`);
      grad2.addColorStop(0.6, `rgba(255, 180, 50, ${alpha * 0.8})`);
      grad2.addColorStop(1, `rgba(255, 80, 0, 0)`);
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(x, y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Add more smoke over time
      if (frame % 4 === 0 && frame < 20) {
        spawnSmoke(x, y, 2);
      }

      // Draw particles
      drawParticles(ctx);

      // Draw damage numbers
      if (hitResult && hitResult.targets && frame > 5) {
        hitResult.targets.forEach(t => {
          const p = view.players.find(pp => pp.id === t.id);
          if (!p) return;
          const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
          const dmgY = (view.terrain || fortState?.terrain || [])[px] || 380;
          const floatY = dmgY - FORT_TANK_H - 30 - (frame - 5) * 1.2;
          const dmgAlpha = Math.max(0, 1 - (frame - 5) / 25);
          const scale = 1 + Math.sin((frame - 5) * 0.3) * 0.1;

          ctx.save();
          ctx.translate(p.x, floatY);
          ctx.scale(scale, scale);
          ctx.font = 'bold 18px Oswald, sans-serif';
          ctx.textAlign = 'center';
          // Outline
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText('-' + t.damage, 0, 0);
          // Fill
          ctx.fillStyle = t.direct
            ? `rgba(255, 60, 60, ${dmgAlpha})`
            : `rgba(255, 200, 60, ${dmgAlpha})`;
          ctx.fillText('-' + t.damage, 0, 0);
          ctx.restore();
        });
      }

      ctx.restore(); // end camera transform

      ctx.restore(); // undo screen shake
    }

    frame++;
    if (frame >= totalFrames) {
      fortAnimId = null;
      fortParticles = [];
      fortDebris = [];
      fortSmoke = [];
      if (callback) callback();
      return;
    }

    fortAnimId = requestAnimationFrame(explodeLoop);
  }

  fortAnimId = requestAnimationFrame(explodeLoop);
}

// ===== CANVAS RENDERING =====
function renderFortressScene(view) {
  if (!fortCtx || !view) return;
  const ctx = fortCtx;
  const w = FORT_CANVAS_W;
  const h = FORT_CANVAS_H;
  const terrain = view.terrain || (fortState ? fortState.terrain : new Array(w).fill(380));

  // Reset to DPR base transform before clearRect to avoid ghost strips from any caller-applied translate
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Update wind particles each frame
  updateWindParticles(view.wind || 0);

  // All world-space drawing under camera transform
  ctx.save();
  applyCameraTransform(ctx);
  drawSky(ctx, w, h);  // world-space: sky/mountains scroll & zoom with camera
  drawSkyPlatforms(ctx);
  updateFortBirds();
  drawFortBirds(ctx);
  updateFallingFeathers();
  drawFallingFeathers(ctx);
  drawTerrain(ctx, terrain, w, h);
  drawWindParticles(ctx, view.wind || 0);  // world-space: moves with camera
  drawTanks(ctx, view.players, view.turnIdx, terrain);
  drawHPBars(ctx, view.players, terrain);
  drawNames(ctx, view.players, terrain);
  ctx.restore();
}

// ===== BLUEPRINT SKY/TERRAIN HELPERS =====
function _ftMakeMtnPath(W, H, baseY, freq, amp1, amp2, amp3, seed) {
  const pts = [];
  for (let x = 0; x <= W; x++) {
    let y = baseY;
    y += Math.sin(x * freq + seed) * amp1;
    y += Math.sin(x * freq * 2.3 + seed + 1.1) * amp2;
    y += Math.sin(x * freq * 5.7 + seed + 2.3) * amp3;
    pts.push(y);
  }
  return pts;
}
function _ftFillMtnLayer(c, pts, colorTop, colorBot, opacity, H) {
  const minY = Math.min(...pts);
  const grd = c.createLinearGradient(0, minY, 0, H * 0.78);
  grd.addColorStop(0, colorTop); grd.addColorStop(1, colorBot);
  c.save(); c.globalAlpha = opacity;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, pts[0]);
  for (let x = 1; x <= pts.length - 1; x++) c.lineTo(x, pts[x]);
  c.lineTo(pts.length - 1, H); c.closePath();
  c.fillStyle = grd; c.fill(); c.globalAlpha = 1; c.restore();
}
function _ftPineTreeSil(c, x, groundY, h, col) {
  const layers = 3;
  c.fillStyle = col;
  for (let i = 0; i < layers; i++) {
    const ly = groundY - h * 0.18 * i;
    const lw = (layers - i) * (h * 0.28) + h * 0.12;
    c.beginPath(); c.moveTo(x, ly - h * 0.32); c.lineTo(x - lw, ly); c.lineTo(x + lw, ly); c.closePath(); c.fill();
  }
}
function _ftTreeLineSil(c, W, H, ridgePts, B, opacity) {
  c.save(); c.globalAlpha = opacity;
  c.fillStyle = B.treeColor[0];
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x++) {
    const th = 8 + Math.sin(x * 0.18 + 1.3) * 4 + Math.sin(x * 0.41 + 0.7) * 3;
    c.lineTo(x, ridgePts[x] - th);
  }
  c.lineTo(W, H); c.closePath(); c.fill();
  c.fillStyle = B.treeColor[1];
  for (let x = 15; x < W - 15; x += 18 + Math.floor(Math.sin(x * 0.3) * 6)) {
    _ftPineTreeSil(c, x, ridgePts[x], 12 + Math.sin(x * 0.25) * 6, B.treeColor[1]);
  }
  c.globalAlpha = 1; c.restore();
}
function _ftDrawCloud(c, cx, cy, cloudW, cloudH, puffs, opacity, T) {
  c.save();

  // Build main puff circles
  const circles = [];
  for (let i = 0; i < puffs; i++) {
    const t = puffs > 1 ? i / (puffs - 1) : 0.5;
    const xOff = (t - 0.5) * cloudW * 1.05;
    const edgeFade = 1 - Math.abs(t - 0.5) * 1.15;
    const r = cloudH * (0.5 + edgeFade * 0.6);
    circles.push({ x: cx + xOff, y: cy, r: Math.max(cloudH * 0.18, r) });
  }
  // Extra top-bump sub-circles between main ones
  for (let i = 0; i < puffs - 1; i++) {
    const c1 = circles[i], c2 = circles[i + 1];
    const r = (c1.r + c2.r) * 0.42;
    circles.push({ x: (c1.x + c2.x) * 0.5, y: cy - r * 0.65, r });
  }

  // Drop shadow below the cloud
  c.globalAlpha = opacity * 0.5;
  const shadowGrd = c.createLinearGradient(cx, cy + cloudH * 0.15, cx, cy + cloudH * 1.1);
  shadowGrd.addColorStop(0, T.cloudShadow);
  shadowGrd.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = shadowGrd;
  c.beginPath();
  c.ellipse(cx, cy + cloudH * 0.55, cloudW * 0.62, cloudH * 0.45, 0, 0, Math.PI * 2);
  c.fill();

  // Main puff bodies using radial gradients (soft, overlapping)
  c.globalAlpha = opacity * 0.92;
  for (const circle of circles) {
    const g = c.createRadialGradient(
      circle.x - circle.r * 0.18, circle.y - circle.r * 0.28, 0,
      circle.x, circle.y, circle.r
    );
    g.addColorStop(0, T.cloudHighlight);
    g.addColorStop(0.5, T.cloudBase);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    c.fill();
  }

  // Dark underside for depth
  c.globalAlpha = opacity * 0.38;
  c.fillStyle = T.cloudDark;
  c.beginPath();
  c.ellipse(cx, cy + cloudH * 0.22, cloudW * 0.5, cloudH * 0.24, 0, 0, Math.PI * 2);
  c.fill();

  c.globalAlpha = 1;
  c.restore();
}
function _ftDrawMountains(c, W, H, T, B) {
  const m4 = _ftMakeMtnPath(W, H, H*0.42, 0.005, 55, 22, 8, 0.8);
  _ftFillMtnLayer(c, m4, B.mtn4[0], B.mtn4[1], 0.80, H);
  // Fog between layer 4 and 3
  const fog1 = c.createLinearGradient(0, H*0.38, 0, H*0.56);
  fog1.addColorStop(0,'rgba(0,0,0,0)'); fog1.addColorStop(0.5, T.hazeColor); fog1.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle = fog1; c.fillRect(0, 0, W, H);
  const m3 = _ftMakeMtnPath(W, H, H*0.49, 0.008, 70, 28, 10, 2.1);
  _ftFillMtnLayer(c, m3, B.mtn3[0], B.mtn3[1], 0.88, H);
  if (B.snowCap) {
    c.save(); c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x++) c.lineTo(x, m3[x]);
    c.lineTo(W, H); c.closePath(); c.clip();
    c.fillStyle = B.snowCap; c.globalAlpha = 0.7; c.fillRect(0, 0, W, H * 0.44); c.globalAlpha = 1; c.restore();
  }
  const m2 = _ftMakeMtnPath(W, H, H*0.55, 0.011, 50, 20, 8, 3.5);
  _ftFillMtnLayer(c, m2, B.mtn2[0], B.mtn2[1], 0.92, H);
  _ftTreeLineSil(c, W, H, m2, B, 0.42);
  const m1 = _ftMakeMtnPath(W, H, H*0.60, 0.017, 38, 14, 6, 5.2);
  _ftFillMtnLayer(c, m1, B.mtn1[0], B.mtn1[1], 0.96, H);
  _ftTreeLineSil(c, W, H, m1, B, 0.68);
}

function _buildSkyCache(w, h) {
  // Build at DPR resolution so drawImage doesn't upscale on Retina displays
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  const oc = new OffscreenCanvas(pw, ph);
  const sCtx = oc.getContext('2d');
  sCtx.scale(dpr, dpr);
  const c = sCtx;
  const T = FORT_THEMES[_fortCurrentTheme] || FORT_THEMES.day;
  const B = FORT_BIOMES[_fortCurrentBiome] || FORT_BIOMES.temperate;

  // ── Sky gradient ──
  const grd = c.createLinearGradient(0, 0, 0, h);
  for (const [stop, col] of T.skyBands) grd.addColorStop(stop, col);
  c.fillStyle = grd; c.fillRect(0, 0, w, h);

  // ── Stars ──
  if (T.starOpacity > 0) {
    for (let i = 0; i < 180; i++) {
      const sr = i < 126 ? 0.6 : i < 165 ? 1.0 : 1.5;
      const sa = (0.3 + ((i * 137 + 31) % 71) / 100) * T.starOpacity;
      c.globalAlpha = sa; c.fillStyle = '#fff';
      c.beginPath(); c.arc((i * 137 + 50) % w, (i * 97 + 10) % (h * 0.5), sr, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  // ── Sun / Moon + God Rays ──
  const sx = T.sunX * w, sy = T.sunY * h;
  // God rays (screen blend)
  if (!T.moonVisible) {
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 16; i++) {
      const baseAngle = Math.atan2(h - sy, w / 2 - sx);
      const spread = Math.PI * 0.9;
      const angle = baseAngle - spread / 2 + (i / 16) * spread;
      const rayW = 15 + ((i * 41 + 7) % 60);
      const rayLen = Math.max(w, h) * 1.8;
      const rayAlpha = T.godRayAlpha * (0.5 + ((i * 31) % 50) / 100);
      const rg = c.createLinearGradient(sx, sy, sx + Math.cos(angle) * rayLen, sy + Math.sin(angle) * rayLen);
      rg.addColorStop(0, `rgba(255,240,200,${rayAlpha})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.save(); c.translate(sx, sy); c.rotate(angle);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(rayLen, -rayW/2); c.lineTo(rayLen, rayW/2); c.closePath(); c.fill(); c.restore();
    }
    c.globalCompositeOperation = 'source-over'; c.restore();
  }
  // Outer glow
  const r1 = c.createRadialGradient(sx,sy,0,sx,sy,T.moonVisible?120:200);
  r1.addColorStop(0,T.sunGlow1); r1.addColorStop(0.4,T.sunGlow2); r1.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=r1; c.beginPath(); c.arc(sx,sy,T.moonVisible?120:200,0,Math.PI*2); c.fill();
  if (!T.moonVisible) {
    const corona = c.createRadialGradient(sx,sy,16,sx,sy,50);
    corona.addColorStop(0,T.sunGlow1); corona.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=corona; c.beginPath(); c.arc(sx,sy,50,0,Math.PI*2); c.fill();
  }
  const diskR = T.moonVisible ? 13 : 20;
  c.fillStyle = T.sunColor; c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.fill();
  if (!T.moonVisible) {
    const core = c.createRadialGradient(sx-diskR*0.2,sy-diskR*0.2,0,sx,sy,diskR);
    core.addColorStop(0,'rgba(255,255,255,0.9)'); core.addColorStop(0.5,'rgba(255,255,255,0.2)'); core.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=core; c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.fill();
  } else {
    c.save(); c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.clip();
    c.fillStyle='rgba(0,0,0,0.35)'; c.beginPath(); c.arc(sx+diskR*0.35,sy,diskR*1.1,0,Math.PI*2); c.fill();
    for (const [ox,oy,cr] of [[-4,-2,2.5],[3,3,1.8],[-1,5,1.5],[5,-3,1.2]]) {
      c.globalAlpha=0.22; c.fillStyle='#000'; c.beginPath(); c.arc(sx+ox,sy+oy,cr,0,Math.PI*2); c.fill();
    }
    c.globalAlpha=1; c.restore();
  }

  // ── Atmospheric haze ──
  const hazeGrd = c.createLinearGradient(0, h*0.58, 0, h*0.72);
  hazeGrd.addColorStop(0,'rgba(0,0,0,0)'); hazeGrd.addColorStop(0.45,T.hazeColor); hazeGrd.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=hazeGrd; c.fillRect(0,0,w,h);

  // ── Layered background mountains (4 layers) ──
  _ftDrawMountains(c, w, h, T, B);

  // ── Clouds: sprite assets (with procedural fallback) ──
  // [imgIdx, cx_frac, cy_frac, w, h, opacity]
  const cloudSpriteDefs = [
    // Far layer – small, high up
    [0, 0.07, 0.08, 120, 68,  0.52],
    [2, 0.39, 0.06, 110, 62,  0.48],
    [4, 0.68, 0.09, 115, 65,  0.50],
    [3, 0.91, 0.07, 105, 60,  0.45],
    // Mid layer
    [1, 0.22, 0.19, 220, 124, 0.78],
    [3, 0.58, 0.17, 250, 142, 0.82],
    [0, 0.86, 0.22, 200, 113, 0.75],
    // Near layer – large
    [2, 0.12, 0.30, 290, 164, 0.90],
    [4, 0.70, 0.28, 310, 175, 0.92],
  ];
  const tintMap = {
    day:  null,
    dusk: { r:210, g:110, b:40,  a:0.42 },
    night:{ r:15,  g:22,  b:60,  a:0.60 },
  };
  const cloudTint = tintMap[_fortCurrentTheme] || null;
  const imgsReady = _fortCloudImgs && _fortCloudImgs.every(img => img.complete && img.naturalWidth);
  if (imgsReady) {
    for (const [idx, cxf, cyf, cw, ch, op] of cloudSpriteDefs) {
      _ftDrawCloudSprite(c, _fortCloudImgs[idx], cxf * w, cyf * h, cw, ch, op, cloudTint);
    }
  } else {
    // Fallback procedural clouds until images load
    const cloudDefs = [
      {cx:w*0.22, cy:h*0.19, cw:200, ch:55, puffs:5, op:0.68},
      {cx:w*0.57, cy:h*0.16, cw:220, ch:60, puffs:5, op:0.72},
      {cx:w*0.84, cy:h*0.20, cw:175, ch:50, puffs:4, op:0.65},
    ];
    for (const cd of cloudDefs) _ftDrawCloud(c, cd.cx, cd.cy, cd.cw, cd.ch, cd.puffs, cd.op, T);
  }

  return oc;
}

function drawSky(ctx, w, h) {
  if (!_fortSkyCache) _fortSkyCache = _buildSkyCache(w, h);
  // Draw at logical size — ctx already has DPR base transform applied
  ctx.drawImage(_fortSkyCache, 0, 0, w, h);
}

function drawClouds() { /* merged into drawSky cache */ }

function drawTerrain(ctx, terrain, w, h) {
  const B = FORT_BIOMES[_fortCurrentBiome] || FORT_BIOMES.temperate;
  const T = FORT_THEMES[_fortCurrentTheme] || FORT_THEMES.day;

  function terrainPath(offset) {
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, terrain[x] + offset);
    ctx.lineTo(w, h); ctx.closePath();
  }

  // ── Bedrock ──
  const bedGrd = ctx.createLinearGradient(0, h*0.78, 0, h);
  bedGrd.addColorStop(0, B.bedrock[0]); bedGrd.addColorStop(1, B.bedrock[1]);
  terrainPath(52); ctx.fillStyle = bedGrd; ctx.fill();

  // ── Stone + strata ──
  const stoneGrd = ctx.createLinearGradient(0, h*0.62, 0, h*0.9);
  stoneGrd.addColorStop(0, B.stone[0]); stoneGrd.addColorStop(1, B.stone[1]);
  terrainPath(30); ctx.fillStyle = stoneGrd; ctx.fill();
  // Strata lines clipped inside stone layer
  ctx.save(); terrainPath(30); ctx.clip();
  ctx.strokeStyle = B.strata; ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const ly = h * 0.72 + i * 16 + Math.sin(i * 1.5) * 4;
    ctx.beginPath();
    for (let x = 0; x < w; x += 2) {
      const wy = ly + Math.sin(x * 0.04 + i * 1.3) * 3;
      x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // ── Clay / subsoil ──
  const clayGrd = ctx.createLinearGradient(0, h*0.52, 0, h*0.82);
  clayGrd.addColorStop(0, B.clay[0]); clayGrd.addColorStop(1, B.clay[1]);
  terrainPath(18); ctx.fillStyle = clayGrd; ctx.fill();

  // ── Topsoil ──
  const topGrd = ctx.createLinearGradient(0, h*0.45, 0, h*0.72);
  topGrd.addColorStop(0, B.topsoil[0]); topGrd.addColorStop(1, B.topsoil[1]);
  terrainPath(9); ctx.fillStyle = topGrd; ctx.fill();

  // Embedded pebbles in topsoil
  for (let i = 0; i < 35; i++) {
    const rx = (i * 191 + 44) % w, ry = terrain[rx] + 11 + (i * 41) % 16;
    if (ry > h - 4) continue;
    ctx.globalAlpha = 0.45; ctx.fillStyle = B.stone[0];
    ctx.beginPath(); ctx.ellipse(rx, ry, 3+(i*7)%8, 2+(i*5)%4, (i*0.5)%Math.PI, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Grass cap ──
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  for (let x = w-1; x >= 0; x--) ctx.lineTo(x, terrain[x] + 8);
  ctx.closePath(); ctx.fillStyle = B.grassCap; ctx.fill();

  // ── Grass edge highlight ──
  ctx.shadowColor = B.grassEdge; ctx.shadowBlur = 4;
  ctx.strokeStyle = B.grassEdge; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.stroke(); ctx.shadowBlur = 0;

  // ── Grass blades ──
  ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = B.grassBlade;
  ctx.lineWidth = 1; ctx.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const gx = (i * 173 + 17) % w, gy = terrain[gx];
    const bh2 = 5 + (i * 11) % 7;
    const lean = Math.sin(gx * 0.08 + i * 0.4) * 3.5;
    ctx.beginPath(); ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + lean * 0.5, gy - bh2 * 0.55, gx + lean, gy - bh2);
    ctx.stroke();
  }
  ctx.restore();

  // ── Cliff face detail ──
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  for (let x = 2; x < w - 2; x++) {
    const slope = Math.abs(terrain[x+1] - terrain[x-1]) / 2;
    if (slope < 1.8) continue;
    ctx.globalAlpha = Math.min(0.6, (slope - 1.8) * 0.2);
    ctx.beginPath(); ctx.moveTo(x, terrain[x] + 6); ctx.lineTo(x, Math.min(terrain[x] + 40, h - 4)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5;
  for (let x = 2; x < w - 2; x++) {
    const slope = terrain[x+1] - terrain[x-1];
    if (slope > -3.0) continue;
    ctx.globalAlpha = Math.min(0.5, (-slope - 3.0) * 0.15);
    ctx.beginPath(); ctx.moveTo(x, terrain[x]); ctx.lineTo(x, terrain[x] + 20); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();

  // ── Boulders ──
  for (let i = 0; i < 18; i++) {
    const bx = (i * 241 + 70) % w, by = terrain[bx];
    const bw2 = 8 + (i * 13) % 18, bh3 = bw2 * (0.55 + ((i * 37) % 40) / 100);
    const ang = (i * 0.6) % (Math.PI * 0.6);
    if (by < 20 || by > h - 10) continue;
    ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(bx+3, by+2, bw2*0.8, bh3*0.3, 0, 0, Math.PI*2); ctx.fill();
    const bg2 = ctx.createRadialGradient(bx-bw2*0.25, by-bh3*0.3, 0, bx, by, bw2);
    bg2.addColorStop(0,'rgba(200,195,190,0.9)'); bg2.addColorStop(0.4,B.stone[0]); bg2.addColorStop(1,B.bedrock[0]);
    ctx.globalAlpha = 0.92; ctx.fillStyle = bg2;
    ctx.save(); ctx.translate(bx, by - bh3*0.5); ctx.rotate(ang * 0.3);
    ctx.beginPath();
    for (let j = 0; j < 7; j++) {
      const a2 = (j/7)*Math.PI*2, jitter = 0.75 + Math.sin(j*2.3+ang)*0.22;
      const rx2 = Math.cos(a2)*bw2*jitter, ry2 = Math.sin(a2)*bh3*jitter;
      j===0 ? ctx.moveTo(rx2, ry2) : ctx.lineTo(rx2, ry2);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-bw2*0.2,-bh3*0.2,bw2*0.3,bh3*0.18,-0.4,0,Math.PI*2); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── Foreground pine trees ──
  for (let i = 0; i < 12; i++) {
    const gx = (i * 277 + 100) % w, gy = terrain[gx];
    if (gy < h * 0.25 || gy > h * 0.85) continue;
    const th2 = 30 + Math.sin(gx * 0.15) * 14;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath(); ctx.ellipse(gx + th2*0.4, gy, th2*0.35, th2*0.07, 0, 0, Math.PI*2); ctx.fill();
    const trunkGrd = ctx.createLinearGradient(gx-3, gy-th2*0.3, gx+3, gy);
    trunkGrd.addColorStop(0, B.treeTrunk); trunkGrd.addColorStop(1, 'rgba(20,10,0,0.9)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = trunkGrd;
    ctx.beginPath(); ctx.roundRect(gx-2.5, gy-th2*0.28, 5, th2*0.28, 1); ctx.fill();
    for (let ti = 0; ti < 3; ti++) {
      const ty2 = gy - th2*(0.22 + ti/3*0.55), tw2 = th2*(0.38-ti*0.1)*(1-ti*0.08);
      // Dark shadow side (right)
      ctx.globalAlpha = 0.65; ctx.fillStyle = B.treeColor[0];
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx, ty2); ctx.lineTo(gx+tw2, ty2); ctx.closePath(); ctx.fill();
      // Light side (left)
      ctx.globalAlpha = 0.82; ctx.fillStyle = B.treeColor[2] || B.treeColor[1];
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx-tw2, ty2); ctx.lineTo(gx, ty2); ctx.closePath(); ctx.fill();
      // Rim highlight
      ctx.globalAlpha = 0.14; ctx.fillStyle = 'rgba(200,255,150,1)';
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx-tw2*0.95, ty2); ctx.lineTo(gx-tw2*0.65, ty2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  // ── AO under terrain top edge ──
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.clip();
  const aoGrd = ctx.createLinearGradient(0, 0, 0, 22);
  aoGrd.addColorStop(0, 'rgba(0,0,0,0.35)'); aoGrd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  for (let x = w-1; x >= 0; x--) ctx.lineTo(x, terrain[x]+22);
  ctx.closePath(); ctx.fillStyle = aoGrd; ctx.fill(); ctx.restore();

  // ── Subtle valley ground fog (low-lying mist, not a sea) ──
  ctx.save();
  ctx.globalAlpha = 0.18;
  const fogBand = h * 0.68;
  for (let x = 60; x < w - 60; x += 60) {
    const ty = terrain[x];
    if (ty < fogBand) continue; // only in deep valleys
    const fogR = 55 + (ty - fogBand) * 0.5;
    const fg = ctx.createRadialGradient(x, ty, 0, x, ty, fogR);
    fg.addColorStop(0, T.hazeColor);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(x, ty, fogR, fogR * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
}

function drawTanks(ctx, players, turnIdx, terrain) {
  // Draw dead tanks first (behind alive ones)
  players.forEach(p => {
    if (p.alive) return;
    drawDeadTank(ctx, p, terrain);
  });
  // Draw alive tanks on top
  players.forEach((p, i) => {
    if (!p.alive) return;
    drawTank(ctx, p, i === turnIdx, terrain);
  });
}

function drawDeadTank(ctx, player, terrain) {
  const x = player.x;
  const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
  const terrainY = terrain[tx] || 380;

  const txL = Math.max(0, tx - 8);
  const txR = Math.min(terrain.length - 1, tx + 8);
  const slope = Math.atan2(terrain[txR] - terrain[txL], txR - txL);

  // No pet = show egg (level 1, any tribe gives 🥚 at stage 0)
  const tamaData = (player.tama && player.tama.tribe) ? player.tama : { tribe: 'fire', level: 1 };

  // Use cached tama display info (same cache as drawTank)
  let pInfo = _fortPlayerInfoCache[player.id];
  if (!pInfo) {
    pInfo = { glowColor: fortTamaGlowColor(tamaData), emoji: fortTamaEmoji(tamaData) };
    _fortPlayerInfoCache[player.id] = pInfo;
  }

  // ===== DEAD TAMAGOTCHI CHARACTER =====
  const R = FORT_TAMA_RADIUS;
    const centerX = x;
    const centerY = terrainY - R - 2;
    const tamaImg = fortGetTamaImage(tamaData);

    ctx.save();
    ctx.globalAlpha = 0.45;

    // Darkened border ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, R + 3, 0, Math.PI * 2);
    ctx.fillStyle = darkenColor(player.color, 0.35);
    ctx.fill();

    // Clip and draw desaturated/darkened image
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
    ctx.clip();

    // Always draw base (darkened tribe color)
    ctx.fillStyle = darkenColor(pInfo.glowColor, 0.4);
    ctx.fillRect(centerX - R, centerY - R, R * 2, R * 2);

    if (tamaImg) {
      const natW = tamaImg.naturalWidth || 1;
      const natH = tamaImg.naturalHeight || 1;
      const coverScale = Math.max(2 * R / natW, 2 * R / natH) * 1.22;
      const dw = natW * coverScale;
      const dh = natH * coverScale;
      ctx.filter = 'grayscale(0.8) brightness(0.5)';
      ctx.drawImage(tamaImg, centerX - dw * 0.5, centerY - dh * 0.58, dw, dh);
      ctx.filter = 'none';
    } else {
      ctx.font = `bold ${Math.floor(R * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pInfo.emoji, centerX, centerY + 1);
    }

    // Soot/burn overlay
    ctx.fillStyle = 'rgba(30, 20, 10, 0.5)';
    ctx.fillRect(centerX - R, centerY - R, R * 2, R * 2);
    ctx.restore(); // end clip

    // X mark over dead character
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - R * 0.5, centerY - R * 0.5);
    ctx.lineTo(centerX + R * 0.5, centerY + R * 0.5);
    ctx.moveTo(centerX + R * 0.5, centerY - R * 0.5);
    ctx.lineTo(centerX - R * 0.5, centerY + R * 0.5);
    ctx.stroke();

    ctx.restore();

    // Smoke wisps
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#888';
    const t = Date.now() * 0.001;
    for (let i = 0; i < 3; i++) {
      const sy = centerY - R - 5 - Math.sin(t * 0.8 + i * 2) * 8 - i * 6;
      const sx = x - 3 + Math.sin(t * 0.5 + i * 3) * 5;
      const sr = 3 + Math.sin(t + i) * 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
}

function darkenColor(hex, factor) {
  // Convert hex to darker version
  let r, g, b;
  if (hex.startsWith('#')) {
    const c = hex.slice(1);
    r = parseInt(c.substring(0, 2), 16);
    g = parseInt(c.substring(2, 4), 16);
    b = parseInt(c.substring(4, 6), 16);
  } else {
    return '#333';
  }
  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);
  return `rgb(${r},${g},${b})`;
}

function _drawFortChargeAura(ctx, cx, cy, R, ratio, tribe, now) {
  ctx.save();
  const outerR = R + 10 + ratio * 20;

  if (tribe === 'fire') {
    // Inner glow ring
    const ringGrad = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, outerR);
    ringGrad.addColorStop(0, 'rgba(255,80,0,0)');
    ringGrad.addColorStop(0.5, `rgba(255,140,0,${0.18 + ratio * 0.32})`);
    ringGrad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad; ctx.fill();
    // Orbiting fire particles
    for (let i = 0; i < 8; i++) {
      const a = (now * 0.008 + i * Math.PI * 2 / 8) % (Math.PI * 2);
      const orbitR = outerR * (0.82 + 0.18 * Math.sin(now * 0.015 + i));
      const px = cx + Math.cos(a) * orbitR;
      const py = cy + Math.sin(a) * orbitR * 0.65;
      const sz = (3 + ratio * 5) * (0.7 + 0.3 * Math.sin(now * 0.022 + i));
      const g = ctx.createRadialGradient(px, py, 0, px, py, sz);
      g.addColorStop(0, 'rgba(255,240,100,0.95)');
      g.addColorStop(0.4, 'rgba(255,100,0,0.7)');
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }

  } else if (tribe === 'rock') {
    // Dust cloud particles orbiting slowly
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2 / 7) + now * 0.0015;
      const dustR = outerR * (0.65 + 0.35 * ((now * 0.003 + i * 0.9) % 1));
      const px = cx + Math.cos(a) * dustR;
      const py = cy + Math.sin(a) * dustR * 0.6 + R * 0.25;
      const sz = 5 + ratio * 8;
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,150,95,${0.35 + ratio * 0.35})`; ctx.fill();
    }
    // Stone rumble ring
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(130,100,55,${0.3 + ratio * 0.45})`;
    ctx.lineWidth = 2.5 + ratio * 3.5;
    ctx.setLineDash([5, 6]); ctx.stroke(); ctx.setLineDash([]);

  } else if (tribe === 'wind') {
    // Swirling arc lines
    for (let i = 0; i < 5; i++) {
      const baseA = (now * 0.006 + i * Math.PI * 2 / 5);
      ctx.beginPath();
      for (let j = 0; j < 22; j++) {
        const t = j / 21;
        const r = (R + 5) + t * (outerR - R - 5);
        const a = baseA + t * 1.6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.65;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(120,220,255,${0.45 + ratio * 0.45})`;
      ctx.lineWidth = 1.5 + ratio * 1.5; ctx.stroke();
    }

  } else if (tribe === 'thunder') {
    // Electric bolt sparks
    for (let i = 0; i < 7; i++) {
      const a = (now * 0.013 * (i % 2 ? 1 : -1) + i * Math.PI * 2 / 7);
      ctx.beginPath();
      let r = R + 3;
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.65);
      for (let s = 1; s <= 4; s++) {
        r = R + 3 + (s / 4) * (outerR - R - 3);
        const jitter = Math.sin(now * 0.06 + i * 7.3 + s) * 0.28;
        const sa = a + jitter;
        ctx.lineTo(cx + Math.cos(sa) * r, cy + Math.sin(sa) * r * 0.65);
      }
      ctx.strokeStyle = `rgba(200,240,255,${0.75 + ratio * 0.25})`;
      ctx.lineWidth = 1 + ratio * 1.5;
      ctx.shadowColor = 'rgba(120,200,255,0.95)'; ctx.shadowBlur = 7;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    // Yellow arc ring
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,240,0,${0.12 + ratio * 0.28})`;
    ctx.lineWidth = 4 + ratio * 5; ctx.stroke();

  } else { // spirit
    // Mystical glow ring
    const ringGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, outerR);
    ringGrad.addColorStop(0, 'rgba(170,100,255,0)');
    ringGrad.addColorStop(0.5, `rgba(190,120,255,${0.15 + ratio * 0.28})`);
    ringGrad.addColorStop(1, 'rgba(100,0,220,0)');
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad; ctx.fill();
    // Orbiting orbs
    for (let i = 0; i < 5; i++) {
      const a = (now * 0.005 * (1 + i * 0.18) + i * Math.PI * 2 / 5);
      const orbitR = outerR * (0.88 + 0.12 * Math.sin(now * 0.011 + i * 2));
      const px = cx + Math.cos(a) * orbitR;
      const py = cy + Math.sin(a) * orbitR * 0.65;
      const sz = 3 + ratio * 4;
      const g = ctx.createRadialGradient(px, py, 0, px, py, sz * 2);
      g.addColorStop(0, 'rgba(220,170,255,0.95)');
      g.addColorStop(0.5, 'rgba(140,80,240,0.5)');
      g.addColorStop(1, 'rgba(80,0,200,0)');
      ctx.beginPath(); ctx.arc(px, py, sz * 2, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
  }

  ctx.restore();
}

function drawTank(ctx, player, isCurrentTurn, terrain) {
  const x = player.x;
  const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
  const terrainY = terrain[tx] || 380;

  const txL = Math.max(0, tx - 8);
  const txR = Math.min(terrain.length - 1, tx + 8);
  const slope = Math.atan2(terrain[txR] - terrain[txL], txR - txL);

  // Use player.tama from the broadcasted state (works for all players)
  // No pet = show egg (level 1, any tribe gives 🥚 at stage 0)
  const tamaData = (player.tama && player.tama.tribe) ? player.tama : { tribe: 'fire', level: 1 };

  // Cache per-player resolved tama display info (avoid repeated typeof/map lookups per frame)
  let pInfo = _fortPlayerInfoCache[player.id];
  if (!pInfo) {
    pInfo = { glowColor: fortTamaGlowColor(tamaData), emoji: fortTamaEmoji(tamaData) };
    _fortPlayerInfoCache[player.id] = pInfo;
  }

  // ===== TAMAGOTCHI CHARACTER RENDERING =====
  const R = FORT_TAMA_RADIUS;
    const centerX = x;
    const baseY = terrainY - R - 2;   // ground-level base position
    const tamaImg = fortGetTamaImage(tamaData);

    // --- Float animation ---
    const now = Date.now();
    const anim = _fortCharAnimGet(player.id);
    const isMoving = fortMoveDir !== 0 && player.id === (state && state.myId);
    const floatAmp  = isMoving ? 3.5 : 2.5;
    const floatSpeed = isMoving ? 0.005 : 0.0025;
    // Always float 2–(2+floatAmp*2) px above ground (use half-wave so never dips below base)
    const floatOff = -2 - (1 - Math.cos(now * floatSpeed + anim.phase)) * floatAmp;
    const visY = baseY + floatOff;

    // --- Squash/stretch scale ---
    let { sx, sy } = _fortGetSquashScale(anim, now);

    // --- Charge compression (local player only) ---
    const isLocalPlayerChar = player.id === (state && state.myId);
    if (isLocalPlayerChar && _fortCharging && !anim.squash) {
      // chargeRatio: 0 (power=10) → 1 (power=100)
      const chargeRatio = Math.max(0, (_fortChargeValue - 10) / 90);
      // Uniform shrink: condenses to 0.78× at full charge
      const compress = 1 - chargeRatio * 0.22;
      // Trembling that intensifies with charge (squeeze X vs Y alternating)
      const vibPhase = now * 0.028;
      const vib = 1 + Math.sin(vibPhase) * chargeRatio * 0.06;
      sx *= compress * vib;
      sy *= compress / vib;

      // Per-tribe charge aura (drawn before character so it appears behind)
      const auraTribe = tamaData ? tamaData.tribe : 'fire';
      _drawFortChargeAura(ctx, centerX, visY, R, chargeRatio, auraTribe, now);
    }

    // --- Ground shadow (cast on terrain surface) ---
    const floatH = -floatOff; // how high above base (positive)
    const shadowOp = Math.max(0, 0.22 - floatH * 0.018);
    const shadowW  = R * Math.max(0.6, 1.05 - floatH * 0.025);
    ctx.save();
    ctx.globalAlpha = shadowOp;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(centerX, terrainY - 1, shadowW, R * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Character circle (with squash+float pivot transform) ---
    ctx.save();
    ctx.translate(centerX, visY);
    ctx.scale(sx, sy);
    ctx.translate(-centerX, -visY);

    // Current turn glow
    if (isCurrentTurn) {
      ctx.shadowColor = pInfo.glowColor;
      ctx.shadowBlur = 22;
    }

    // Circular border (player color ring)
    ctx.beginPath();
    ctx.arc(centerX, visY, R + 3, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Clip to circle and draw character image
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, visY, R, 0, Math.PI * 2);
    ctx.clip();

    // Always draw a solid base background (tribe color)
    ctx.fillStyle = pInfo.glowColor;
    ctx.fillRect(centerX - R, visY - R, R * 2, R * 2);

    if (tamaImg) {
      // Mirror tamagotchi CSS: object-fit:cover + object-position:center 58% + scale(1.22)
      const natW = tamaImg.naturalWidth || 1;
      const natH = tamaImg.naturalHeight || 1;
      const coverScale = Math.max(2 * R / natW, 2 * R / natH) * 1.22;
      const dw = natW * coverScale;
      const dh = natH * coverScale;
      ctx.drawImage(tamaImg, centerX - dw * 0.5, visY - dh * 0.58, dw, dh);
    } else {
      // Fallback: emoji centered in circle (tribe color bg already drawn above)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(centerX - R, visY - R, R * 2, R * 2);
      ctx.font = `bold ${Math.floor(R * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pInfo.emoji, centerX, visY + 1);
    }
    ctx.restore(); // end clip

    // Inner highlight ring
    ctx.beginPath();
    ctx.arc(centerX, visY, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer ring outline
    ctx.beginPath();
    ctx.arc(centerX, visY, R + 3, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrentTurn ? '#ffd700' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = isCurrentTurn ? 2.5 : 1.5;
    ctx.stroke();

    // Pulsing glow for current turn
    if (isCurrentTurn) {
      const pulse = 0.3 + 0.2 * Math.sin(now * 0.004);
      ctx.beginPath();
      ctx.arc(centerX, visY, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore(); // end squash transform

    // === Dotted trajectory preview (local player's turn only) ===
    const isLocalPlayer = player.id === state.myId;
    if (isLocalPlayer && isCurrentTurn) {
      const view = window._fortView;
      const wind = view ? view.wind : 0;
      // Start from top-center of the character circle (accounting for float offset)
      const launchX = centerX;
      const launchY = visY - R - 1;
      drawTrajectoryPreview(ctx, launchX, launchY, fortLocalAngle, wind);
    }

  // Move fuel indicator for current turn player
  if (isCurrentTurn && player.id === state.myId) {
    const fuel = player.moveFuel !== undefined ? player.moveFuel : FORT_MOVE_FUEL;
    const fuelPct = fuel / FORT_MOVE_FUEL;
    if (fuelPct < 1) {
      const fuelBarW = 30;
      const fuelBarH = 3;
      const fuelX = x - fuelBarW / 2;
      const fuelY = terrainY + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(fuelX, fuelY, fuelBarW, fuelBarH);
      ctx.fillStyle = fuelPct > 0.3 ? '#4fc3f7' : '#ff7043';
      ctx.fillRect(fuelX, fuelY, fuelBarW * fuelPct, fuelBarH);
    }
  }
}

function drawHPBars(ctx, players, terrain) {
  players.forEach(p => {
    if (!p.alive) return;
    const x = p.x;
    const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
    const terrainY = terrain[tx] || 380;
    const barW = 40;
    const barH = 5;
    const barX = x - barW / 2;
    // Tama characters are taller - adjust HP bar position
    const barY = terrainY - (FORT_TAMA_RADIUS * 2 + 5) - 20; // all players use tama height

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);
    ctx.fill();

    // Fill
    const ratio = p.hp / FORT_MAX_HP;
    let color;
    if (ratio > 0.6) color = '#4caf50';
    else if (ratio > 0.3) color = '#ff9800';
    else color = '#f44336';

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, 2);
    ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barW * ratio, barH / 2);
  });
}

function drawNames(ctx, players, terrain) {
  ctx.save();
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  players.forEach(p => {
    if (!p.alive) return;
    const x = p.x;
    const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
    const terrainY = terrain[tx] || 380;
    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText(p.name, x, terrainY + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(p.name, x, terrainY + 14);
  });
  ctx.restore();
}

// ===== UI RENDERING =====
function renderFortressView(view) {
  if (!view) return;
  window._fortView = view;

  // non-host 첫 렌더 시 스킬 로드
  if (!state.isHost && _fortEquippedSkills.length === 0 && typeof skillsGetEquipped === 'function') {
    _fortEquippedSkills = skillsGetEquipped('fortress');
    _fortSkillUsage = {};
    _fortActiveSkill = null;
  }

  // Sync platform data from host so client path computation matches host
  if (view.skyPlatforms) fortSkyPlatforms = view.skyPlatforms;

  if (!fortCtx) initFortCanvas();

  // Start camera loop if not running (for non-host clients)
  if (!_fortCamLoopId) {
    // Snap camera to current turn player on first render
    const cp = view.players[view.turnIdx];
    if (cp) {
      const cpx = cp.x;
      const cpy = (view.terrain || [])[Math.floor(Math.max(0, Math.min(cpx, FORT_CANVAS_W - 1)))] || 250;
      fortCameraSnap(cpx, cpy - FORT_TANK_H);
    }
    _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
  }

  // Update camera target to current turn player on state updates
  if (view.phase === 'aiming') {
    const tp = view.players[view.turnIdx];
    if (tp) {
      const tpx = tp.x;
      const tpy = (view.terrain || [])[Math.floor(Math.max(0, Math.min(tpx, FORT_CANVAS_W - 1)))] || 250;
      fortCameraTarget(tpx, tpy - FORT_TANK_H);
    }
  }

  const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
  const canAct = isMyTurn && view.phase === 'aiming';

  // Sync client-side fuel tracking from server state
  if (isMyTurn) {
    const cp = view.players[view.turnIdx];
    if (cp) {
      const fuel = cp.moveFuel !== undefined ? cp.moveFuel : FORT_MOVE_FUEL;
      fortMovedThisTurn = FORT_MOVE_FUEL - fuel;
    }
  }

  // Round badge
  const roundBadge = document.getElementById('fortRoundBadge');
  if (roundBadge) roundBadge.textContent = 'ROUND ' + view.round;

  // Turn name
  const turnName = document.getElementById('fortTurnName');
  const currentPlayer = view.players[view.turnIdx];
  if (turnName && currentPlayer) {
    turnName.textContent = currentPlayer.name + '의 차례';
  }

  // Wind
  const windArrow = document.getElementById('fortWindArrow');
  const windValue = document.getElementById('fortWindValue');
  if (windArrow) {
    if (view.wind > 0) windArrow.textContent = '→';
    else if (view.wind < 0) windArrow.textContent = '←';
    else windArrow.textContent = '·';
  }
  if (windValue) windValue.textContent = Math.abs(view.wind);

  // Players bar
  const bar = document.getElementById('fortPlayersBar');
  if (bar) {
    bar.innerHTML = view.players.map((p, i) => {
      const hpPct = Math.max(0, (p.hp / FORT_MAX_HP) * 100);
      let hpClass = '';
      if (hpPct <= 30) hpClass = 'low';
      else if (hpPct <= 60) hpClass = 'mid';
      const itemClass = 'fort-player-hp-item' +
        (i === view.turnIdx ? ' active-turn' : '') +
        (!p.alive ? ' dead' : '');
      const statusIcons = (p.poison > 0 ? `<span class="fort-status-icon" title="독 (${p.poison}턴)">☠️</span>` : '') +
                          (p.frozen > 0 ? `<span class="fort-status-icon" title="빙결 (${p.frozen}턴)">❄️</span>` : '');
      return `<div class="${itemClass}">
        <div class="fort-player-avatar">${p.avatar}</div>
        <div class="fort-player-info">
          <div class="fort-player-name">${escapeHTML(p.name)}${statusIcons}</div>
          <div class="fort-hp-bar"><div class="fort-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
          <div class="fort-hp-text">${p.hp}/${FORT_MAX_HP}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Controls — toggle disabled state via CSS class
  const controls = document.getElementById('fortControls');
  const fireBtn = document.getElementById('fortFireBtn');
  if (controls) controls.classList.toggle('fort-disabled', !canAct);
  if (fireBtn) fireBtn.disabled = !canAct;

  const angleVal = document.getElementById('fortAngleValue');
  const powerVal = document.getElementById('fortPowerValue');
  if (angleVal) angleVal.textContent = fortLocalAngle;
  if (powerVal) powerVal.textContent = fortLocalPower;

  // Update fuel display
  const fuelFill = document.getElementById('fortFuelFill');
  const fuelText = document.getElementById('fortFuelText');
  if (fuelFill && isMyTurn) {
    const cp = view.players[view.turnIdx];
    const fuel = cp ? (cp.moveFuel !== undefined ? cp.moveFuel : FORT_MOVE_FUEL) : 0;
    const pct = (fuel / FORT_MOVE_FUEL) * 100;
    fuelFill.style.width = pct + '%';
    if (fuelText) fuelText.textContent = Math.round(pct) + '%';
  }

  // 스킬바 업데이트 (내 턴일 때만 보임)
  if (typeof fortUpdateSkillBar === 'function') fortUpdateSkillBar();

  renderFortressScene(view);
}

// ===== GAME OVER =====
function showFortressGameOver(msg) {
  if (!msg) return;

  const overlay = document.getElementById('fortGameOver');
  const title = document.getElementById('fortGameOverTitle');
  const rankings = document.getElementById('fortRankings');
  if (!overlay || !rankings) return;

  const allPlayers = msg.players || [];
  const deathOrder = msg.deathOrder || [];
  const ranked = [];

  const winner = allPlayers.find(p => p.alive);
  if (winner) ranked.push(winner);

  for (let i = deathOrder.length - 1; i >= 0; i--) {
    const p = allPlayers.find(pp => pp.id === deathOrder[i]);
    if (p && !p.alive) ranked.push(p);
  }

  allPlayers.forEach(p => {
    if (!ranked.find(r => r.id === p.id)) ranked.push(p);
  });

  const medals = ['🥇', '🥈', '🥉'];
  const goldRewards = [60, 30, 10];

  title.textContent = winner ? winner.name + ' 승리!' : '무승부!';

  rankings.innerHTML = ranked.map((p, i) => {
    const medal = medals[i] || `${i + 1}위`;
    const gold = goldRewards[i] || 0;
    const rankClass = i < 3 ? ` rank-${i + 1}` : '';
    return `<div class="fort-rank-item${rankClass}">
      <div class="fort-rank-medal">${medal}</div>
      <div class="fort-rank-name">${p.avatar} ${escapeHTML(p.name)}</div>
      ${gold ? `<div class="fort-rank-gold">+${gold} 🪙</div>` : ''}
    </div>`;
  }).join('');

  overlay.style.display = '';

  const myRank = ranked.findIndex(p => p.id === state.myId);
  const won = myRank === 0;
  const goldReward = goldRewards[myRank] || 0;
  recordGame(won, goldReward);

  // 스킬 업적 기록
  if (typeof skillsRecordPlay === 'function' && !(typeof practiceMode !== 'undefined' && practiceMode)) {
    skillsRecordPlay('fortress');
    if (won) skillsRecordWin('fortress');
  }

  // 스킬바 숨기기
  const skillBar = document.getElementById('fortSkillBar');
  if (skillBar) skillBar.classList.remove('visible');
}

function closeFortressCleanup() {
  const overlay = document.getElementById('fortGameOver');
  if (overlay) overlay.style.display = 'none';
  if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
  if (_fortCamLoopId) { cancelAnimationFrame(_fortCamLoopId); _fortCamLoopId = null; }
  if (_fortResizeObserver) { _fortResizeObserver.disconnect(); _fortResizeObserver = null; }
  cleanupFortressKeyboard();
  fortStopMove();
  fortAngleStop();
  // 스킬 상태 초기화
  _fortActiveSkill = null;
  const skillBar = document.getElementById('fortSkillBar');
  if (skillBar) { skillBar.classList.remove('visible'); skillBar.innerHTML = ''; }
  if (fortCanvas) {
    fortCanvas.ontouchstart = null;
    fortCanvas.ontouchmove = null;
    fortCanvas.ontouchend = null;
    fortCanvas.onmousedown = null;
    fortCanvas.onmousemove = null;
    fortCanvas.onmouseup = null;
    fortCanvas.onmouseleave = null;
    fortCanvas.onwheel = null;
  }
  _fortDrag = null;
  fortState = null;
  window._fortView = null;
  fortCtx = null;
  fortCanvas = null;
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  fortWindParticles = [];
  fortCam.x = 400; fortCam.y = 250;
  fortCam.targetX = 400; fortCam.targetY = 250;
  fortCam.zoom = 2.0;
  _fortSkyCache = null;
  _fortTerrainGrad = null;
  _fortPlayerInfoCache = {};
  _fortCharAnim = {};
  fortBirds = [];
  fortSkyPlatforms = [];
  _fortFallingFeathers = [];
}

function closeFortressGame() {
  closeFortressCleanup();
  returnToLobby();
}

// ===== SKILL BAR UI =====
let _fortSkillBarState = '';  // 이전 상태 해시 (불필요한 innerHTML 교체 방지)

function fortUpdateSkillBar() {
  const bar = document.getElementById('fortSkillBar');
  if (!bar) return;

  const view = window._fortView;
  const isMyTurn = view && view.phase === 'aiming' &&
                   view.players[view.turnIdx]?.id === state.myId;

  if (!isMyTurn || _fortEquippedSkills.length === 0) {
    if (bar.classList.contains('visible')) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      _fortSkillBarState = '';
    }
    return;
  }

  bar.classList.add('visible');

  // 기본 포탄 버튼 + 장착 스킬 버튼
  const items = [{ id: null, emoji: '💫', name: '기본 포탄' }];
  _fortEquippedSkills.forEach(id => {
    if (typeof skillsGetDef === 'function') {
      const def = skillsGetDef(id);
      if (def) items.push({ id, emoji: def.emoji, name: def.name });
    }
  });

  // 상태 해시: active 스킬 + 사용횟수가 바뀔 때만 DOM 교체
  const stateKey = (_fortActiveSkill || '') + '|' + items.map(i => i.id + ':' + (_fortSkillUsage[i.id] || 0)).join(',');
  if (stateKey === _fortSkillBarState) return;
  _fortSkillBarState = stateKey;

  bar.innerHTML = items.map(item => {
    const uses = item.id ? (_fortSkillUsage[item.id] || 0) : 0;
    const remaining = item.id ? (SKILL_MAX_USES - uses) : null;
    const depleted = item.id && remaining <= 0;
    const isActive = _fortActiveSkill === item.id;
    const usesHtml = item.id
      ? `<span class="fort-skill-uses${remaining === SKILL_MAX_USES ? ' full' : ''}">${remaining}/${SKILL_MAX_USES}</span>`
      : '';
    const btnClass = [
      item.id ? 'fort-skill-btn' : 'fort-skill-btn fort-skill-btn-default',
      isActive ? 'active' : '',
      depleted ? 'depleted' : '',
    ].filter(Boolean).join(' ');
    return `<button class="${btnClass}" data-skill="${item.id || ''}">
      <span class="fort-skill-emoji">${item.emoji}</span>
      <span class="fort-skill-name">${item.name}</span>
      ${usesHtml}
    </button>`;
  }).join('');

  // 이벤트 위임: 버튼 클릭/터치 처리
  bar.querySelectorAll('button[data-skill]').forEach(btn => {
    const sid = btn.dataset.skill || null;
    btn.addEventListener('touchstart', (e) => { e.stopPropagation(); btn._tapped = true; }, { passive: true });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (btn._tapped) { btn._tapped = false; fortSelectSkill(sid); }
    });
    btn.addEventListener('click', (e) => { e.stopPropagation(); fortSelectSkill(sid); });
  });
}

function fortSelectSkill(skillId) {
  // 토글: 같은 스킬 다시 누르면 기본으로
  if (_fortActiveSkill === skillId) {
    _fortActiveSkill = null;
  } else {
    const uses = skillId ? (_fortSkillUsage[skillId] || 0) : 0;
    if (skillId && uses >= SKILL_MAX_USES) return; // 사용 횟수 초과
    _fortActiveSkill = skillId;
  }
  fortUpdateSkillBar();
}

function _fortShowSkillFlash(text) {
  const gameEl = document.getElementById('fortressGame');
  if (!gameEl) return;
  const el = document.createElement('div');
  el.className = 'fort-skill-flash';
  el.textContent = text;
  gameEl.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
}

// ===== BIRDS SYSTEM =====
function initFortBirds() {
  fortBirds = [];
  const count = 4 + Math.floor(Math.random() * 4); // 4-7 birds
  for (let i = 0; i < count; i++) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    fortBirds.push({
      x: dir > 0 ? -40 - Math.random() * 200 : FORT_CANVAS_W + 40 + Math.random() * 200,
      y: 40 + Math.random() * 200,
      vx: dir * (0.6 + Math.random() * 1.0),
      dir,
      phase: Math.random() * Math.PI * 2,
      alive: true,
      falling: false,
      fallVy: 0,
      fallRot: 0,
      fallRotV: (Math.random() - 0.5) * 0.15,
      size: 0.7 + Math.random() * 0.6, // scale
    });
  }
}

function updateFortBirds() {
  const now = Date.now() * 0.003;
  for (const bird of fortBirds) {
    if (bird.falling) {
      bird.fallVy += 0.06;
      bird.y += bird.fallVy;
      bird.fallRot += bird.fallRotV;
      bird.x += bird.vx * 0.3;
      continue;
    }
    bird.x += bird.vx;
    bird.y += Math.sin(now + bird.phase) * 0.4;
    // Wrap around edges
    if (bird.dir > 0 && bird.x > FORT_CANVAS_W + 60) {
      bird.x = -40;
      bird.y = 40 + Math.random() * 200;
    } else if (bird.dir < 0 && bird.x < -60) {
      bird.x = FORT_CANVAS_W + 40;
      bird.y = 40 + Math.random() * 200;
    }
  }
}

function drawFortBirds(ctx) {
  const now = Date.now() * 0.005;
  for (const bird of fortBirds) {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    if (bird.falling) ctx.rotate(bird.fallRot);
    if (bird.dir < 0) ctx.scale(-1, 1);
    ctx.scale(bird.size, bird.size);

    // Wing flap
    const flapPhase = bird.falling ? 0 : Math.sin(now * 3.5 + bird.phase) * 0.5;
    const wingUp = bird.falling ? -0.8 : Math.sin(now * 5 + bird.phase) * 6 - 2;

    ctx.strokeStyle = bird.falling ? 'rgba(80,50,30,0.7)' : 'rgba(40,30,20,0.85)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Body (small oval)
    ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = bird.falling ? 'rgba(100,70,40,0.6)' : '#4a3728';
    ctx.fill();
    ctx.stroke();
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.quadraticCurveTo(-7, wingUp - 2, -13, wingUp);
    ctx.stroke();
    // Right wing
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(7, wingUp - 2, 13, wingUp);
    ctx.stroke();
    // Head
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(5, -1, 2.5, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#cc8800';
    ctx.beginPath(); ctx.moveTo(7, -1); ctx.lineTo(10, -0.5); ctx.lineTo(7, 0.5); ctx.closePath(); ctx.fill();

    ctx.restore();
  }
}

// ===== FALLING FEATHERS =====
function updateFallingFeathers() {
  let j = 0;
  for (let i = 0; i < _fortFallingFeathers.length; i++) {
    const f = _fortFallingFeathers[i];
    f.x += f.vx; f.y += f.vy; f.vy += 0.04; f.vx *= 0.98;
    f.rot += f.rotV; f.life -= f.decay;
    if (f.life > 0) _fortFallingFeathers[j++] = f;
  }
  _fortFallingFeathers.length = j;
}

function drawFallingFeathers(ctx) {
  for (const f of _fortFallingFeathers) {
    ctx.save();
    ctx.globalAlpha = f.life;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.fillStyle = '#d4b896';
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ===== SKY PLATFORMS =====
function initFortSkyPlatforms() {
  fortSkyPlatforms = [];
  const count = 3 + Math.floor(Math.random() * 3); // 3-5 platforms
  for (let i = 0; i < count; i++) {
    const pw = 60 + Math.random() * 80;
    const ph = 14 + Math.random() * 10;
    const px = FORT_CANVAS_W * 0.1 + Math.random() * FORT_CANVAS_W * 0.8;
    const py = FORT_CANVAS_H * 0.15 + Math.random() * FORT_CANVAS_H * 0.35;
    fortSkyPlatforms.push({ x: px, y: py, w: pw, h: ph, destroyed: false,
      type: Math.floor(Math.random() * 3) }); // 0=rock, 1=dark rock, 2=stone
  }
}

function drawSkyPlatforms(ctx) {
  for (const p of fortSkyPlatforms) {
    if (p.destroyed) continue;
    const { x, y, w, h } = p;
    ctx.save();

    // Main rock body
    const rockColors = ['#7a6b58', '#5a5048', '#8a7c6a'];
    ctx.fillStyle = rockColors[p.type] || '#7a6b58';
    ctx.beginPath();
    ctx.moveTo(x - w/2 + 8, y);
    ctx.lineTo(x - w/2, y + h - 4);
    ctx.lineTo(x - w/2 + 5, y + h);
    ctx.lineTo(x + w/2 - 5, y + h);
    ctx.lineTo(x + w/2, y + h - 4);
    ctx.lineTo(x + w/2 - 6, y);
    ctx.closePath();
    ctx.fill();

    // Top surface highlight (mossy look)
    const topGrad = ctx.createLinearGradient(x - w/2, y, x + w/2, y);
    topGrad.addColorStop(0, 'rgba(100,140,80,0.6)');
    topGrad.addColorStop(0.5, 'rgba(120,160,90,0.7)');
    topGrad.addColorStop(1, 'rgba(90,120,70,0.5)');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(x - w/2 + 8, y);
    ctx.lineTo(x + w/2 - 6, y);
    ctx.lineTo(x + w/2 - 8, y + 5);
    ctx.lineTo(x - w/2 + 10, y + 5);
    ctx.closePath();
    ctx.fill();

    // Rock texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let li = 0; li < 3; li++) {
      const lx = x - w/2 + (w / 4) * (li + 1);
      ctx.beginPath(); ctx.moveTo(lx, y + 2); ctx.lineTo(lx - 3, y + h - 2); ctx.stroke();
    }

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'transparent';
    ctx.beginPath(); ctx.rect(x - w/2, y, w, h); ctx.fill(); // just trigger shadow
    ctx.restore();
  }
}

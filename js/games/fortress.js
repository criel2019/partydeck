// =============================================
// ===== PET BATTLE (펫 대전) — Turn-based Artillery
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
const FORT_TURN_TIME = 30; // 30초 턴 제한

// ===== DELAY SYSTEM =====
const FORT_DELAY_BASE = 100;       // 기본 공격 딜레이
const FORT_DELAY_SKILL = 150;      // 스킬 공격 딜레이
const FORT_DELAY_INSTANT = 120;    // 즉발 스킬 (힐/쉴드) 딜레이
const FORT_DELAY_MOVE_PER = 2;     // 이동 1연료당 딜레이
let _fortTurnTimer = null;         // 턴 타이머 interval
let _fortTurnTimeLeft = 0;         // 남은 시간

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
let _fortTerrainCache = null;   // OffscreenCanvas: full terrain (rebuilt on destruction)
let _fortTerrainCacheRef = null; // terrain array reference used for cache
let _fortTerrainDirtyVer = 0;   // incremented when terrain mutated in-place
let _fortTerrainCacheVer = -1;  // version when cache was last built
let _fortPlayerInfoCache = {};  // per-player id → { tamaData, glowColor, emoji }
let _fortCharAnim = {};          // per-player id → { phase, squash: null|{startMs,type} }
// Pre-resolved references to tamagotchi globals (avoid typeof checks per frame)
function _fortResolveTamaGlobals() {
  _fortPlayerInfoCache = {}; // clear on game start
  _fortCharAnim = {};
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
let _fortWheelHandler = null;

// ── 스킬 상태 ─────────────────────────────────────────────────
let _fortEquippedSkills = [];  // 이번 게임에 장착된 스킬 ID 목록
let _fortSkillUsage = {};      // { skillId: 사용횟수 } 게임 내 누적
let _fortActiveSkill = null;   // 이번 턴에 선택한 스킬 (null = 기본 포탄)

// ===== TRIBE TRAIL COLORS (hoisted to avoid per-frame allocation) =====
const FORT_TRAIL_COLORS = {
  fire:    (t) => `rgba(255,${100+Math.floor(t*100)},20,${t*0.75})`,
  rock:    (t) => `rgba(${120+Math.floor(t*60)},${80+Math.floor(t*40)},40,${t*0.6})`,
  wind:    (t) => `rgba(100,${200+Math.floor(t*55)},${200+Math.floor(t*55)},${t*0.55})`,
  thunder: (t) => `rgba(255,${220+Math.floor(t*35)},0,${t*0.8})`,
  spirit:  (t) => `rgba(${160+Math.floor(t*60)},100,255,${t*0.7})`,
};

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
    FortPerf.frameStart();
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
    FortPerf.frameEnd();
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
  FortPerf.begin('terrainGen');
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

  FortPerf.end('terrainGen');
  return terrain;
}

// ===== TERRAIN DESTRUCTION =====
function destroyTerrain(terrain, impactX, impactY, radius) {
  _fortTerrainDirtyVer++;
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

// ===== FALL DEATH CHECK =====
// 지형 파괴 후 탱크 아래 땅이 캔버스 바닥에 도달하면 낙사
function fortCheckFallDeath() {
  if (!fortState) return;
  const FALL_THRESHOLD = FORT_CANVAS_H - 15; // 이 높이 이상이면 "바닥"으로 판단
  fortState.players.forEach(p => {
    if (!p.alive) return;
    const tx = Math.floor(Math.max(0, Math.min(p.x, fortState.canvasW - 1)));
    const terrainY = fortState.terrain[tx];
    if (terrainY >= FALL_THRESHOLD) {
      p.alive = false;
      p.hp = 0;
      fortState.deathOrder.push(p.id);
    }
  });
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
    shield: 0,
    delay: 0,
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

  // 첫 턴 타이머 시작
  fortStartTurnTimer();
}

// ===== KEYBOARD CONTROLS =====
function setupFortressKeyboard() {
  cleanupFortressKeyboard();

  _fortKeyDown = function(e) {
    const view = window._fortView;
    if (!view) return;

    // 각도 조정은 다른 플레이어 턴에서도 가능 (내 탱크 각도 미리 조정)
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      fortAngleStep(1);
      return;
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      fortAngleStep(-1);
      return;
    }

    // 나머지 행동은 내 턴 + aiming 상태에서만 가능
    if (view.phase !== 'aiming') return;
    const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
    if (!isMyTurn) return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      fortStartMove(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      fortStartMove(1);
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
      shield: p.shield || 0,
      delay: p.delay || 0,
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

  // Cap DPR at 2 to prevent massive canvas on high-DPR mobile (e.g. 2.8× → 3375px)
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  if (_fortWheelHandler && fortCanvas) fortCanvas.removeEventListener('wheel', _fortWheelHandler);
  _fortWheelHandler = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.15;
    const dir = e.deltaY < 0 ? 1 : -1;
    fortCam.zoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(FORT_CAM_ZOOM_MAX, fortCam.zoom + dir * zoomSpeed));
    clampCamera();
    const view = window._fortView;
    if (view && !fortAnimId) renderFortressScene(view);
  };
  fortCanvas.addEventListener('wheel', _fortWheelHandler, { passive: false });
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
  fortSetAngle(Math.max(-90, Math.min(180, fortLocalAngle + dir)));
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
let _fortCharging = false;
let _fortChargeInterval = null;
let _fortChargeValue = 0;
let _fortChargeTouched = false; // prevent touch+mouse double-trigger

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
  const gauge = document.getElementById('fortChargeGauge');
  if (!gauge) return;
  gauge.style.display = 'block';
  const pct = ((_fortChargeValue - 10) / 90) * 100;
  const bar = gauge.querySelector('.fort-charge-fill');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct < 40 ? '#4caf50' : pct < 70 ? '#ff9800' : '#f44336';
  }
  const label = gauge.querySelector('.fort-charge-label');
  if (label) label.textContent = _fortChargeValue;
}

function hideChargeGauge() {
  const gauge = document.getElementById('fortChargeGauge');
  if (gauge) gauge.style.display = 'none';
}

// ===== FIRE =====
function fortFire() {
  if (!fortState && !window._fortView) return;
  const view = window._fortView;
  if (!view || view.phase !== 'aiming') return;

  const currentPlayer = view.players[view.turnIdx];
  if (!currentPlayer) return;

  // non-host 클라이언트: 본인 턴이 아니면 무시
  if (!state.isHost && currentPlayer.id !== state.myId) return;

  const usedSkill = _fortActiveSkill;

  // instant 스킬 확인 (힐, 쉴드 등)
  const skillDef = usedSkill && (typeof skillsGetDef === 'function') ? skillsGetDef(usedSkill) : null;
  const isInstant = skillDef && skillDef.type === 'instant';

  // 스킬 사용횟수 증가
  if (usedSkill) {
    _fortSkillUsage[usedSkill] = (_fortSkillUsage[usedSkill] || 0) + 1;
  }
  // 발사 후 스킬 선택 해제
  _fortActiveSkill = null;
  fortUpdateSkillBar();

  const msg = isInstant
    ? { type: 'fort-instant-skill', skill: usedSkill }
    : { type: 'fort-fire', angle: fortLocalAngle, power: fortLocalPower, skill: usedSkill };

  if (state.isHost) {
    if (isInstant) handleFortInstantSkill(state.myId, msg);
    else handleFortFire(state.myId, msg);
  } else {
    sendToHost(msg);
  }
}

// 힐 스킬 비율 매핑 (모듈 레벨 상수)
const FORT_HEAL_MAP = { heal_10: 0.10, heal_30: 0.30, heal_50: 0.50, heal_100: 1.00 };
const FORT_INSTANT_SKILLS = new Set([...Object.keys(FORT_HEAL_MAP), 'shield']);

// ===== HOST: HANDLE INSTANT SKILL (힐/쉴드) =====
function handleFortInstantSkill(peerId, msg) {
  if (!fortState || fortState.phase !== 'aiming') return;
  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.alive) return;
  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const skill = msg.skill;
  // instant 스킬이 아닌 경우 무시 (잘못된 요청 방지)
  if (!FORT_INSTANT_SKILLS.has(skill)) return;

  let flashText = '';
  if (FORT_HEAL_MAP[skill] !== undefined) {
    // 힐 스킬: 딜레이 적용 + 턴 종료
    const moveDelay = (FORT_MOVE_FUEL - (current.moveFuel || 0)) * FORT_DELAY_MOVE_PER;
    current.delay = (current.delay || 0) + moveDelay + FORT_DELAY_INSTANT;
    fortClearTurnTimer();

    const pct = FORT_HEAL_MAP[skill];
    const heal = Math.floor(FORT_MAX_HP * pct);
    const before = current.hp;
    current.hp = Math.min(FORT_MAX_HP, current.hp + heal);
    const actual = current.hp - before;
    flashText = `💚 ${current.name} HP +${actual} (${Math.round(pct * 100)}%)`;

    // 결과 브로드캐스트
    broadcast({
      type: 'fort-instant-effect',
      skill,
      playerId: current.id,
      playerName: current.name,
      flashText,
      hp: current.hp,
      shield: current.shield || 0,
    });
    _fortShowSkillFlash(flashText);

    // 턴 진행 (발사 없이 턴 종료)
    fortState.phase = 'animating';
    setTimeout(() => {
      if (!fortState) return;
      advanceFortTurn();
    }, 1200);

  } else if (skill === 'shield') {
    if (current.shield > 0) return; // 이미 쉴드 활성 → 중복 사용 차단
    fortClearTurnTimer();
    current.shield = 1;
    current.delay = (current.delay || 0) + 50;
    flashText = `🛡️ ${current.name} 방어막 활성화! 공격하세요!`;

    // 결과 브로드캐스트
    broadcast({
      type: 'fort-instant-effect',
      skill,
      playerId: current.id,
      playerName: current.name,
      flashText,
      hp: current.hp,
      shield: current.shield,
    });
    _fortShowSkillFlash(flashText);

    // 쉴드 후 aiming 상태로 복귀 (턴 유지, 일반 공격 가능)
    fortState.phase = 'animating'; // 잠시 animating으로 전환 (플래시 표시 대기)
    setTimeout(() => {
      if (!fortState) return;
      fortState.phase = 'aiming';
      broadcastFortressState();
      fortStartTurnTimer();
    }, 1200);
  }
}

// ===== HOST: HANDLE FIRE (스킬 지원) =====
function handleFortFire(peerId, msg) {
  FortPerf.begin('handleFire');
  if (!fortState || fortState.phase !== 'aiming') { FortPerf.end('handleFire'); return; }

  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.alive) return;
  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const rawAngle = parseInt(msg.angle);
  const angle = Math.max(-90, Math.min(180, Number.isFinite(rawAngle) ? rawAngle : 45));
  const rawPower = parseInt(msg.power);
  const power = Math.max(10, Math.min(100, Number.isFinite(rawPower) ? rawPower : 50));
  const skill  = (typeof msg.skill === 'string' && !(current.shield > 0)) ? msg.skill : null;

  // 딜레이 적용: 이동량 + 공격/스킬 딜레이
  const moveDelay = (FORT_MOVE_FUEL - (current.moveFuel || 0)) * FORT_DELAY_MOVE_PER;
  const actionDelay = skill ? FORT_DELAY_SKILL : FORT_DELAY_BASE;
  current.delay = (current.delay || 0) + moveDelay + actionDelay;

  // 턴 타이머 정리
  fortClearTurnTimer();

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

  // 관통탄: 첫 히트 지점을 impact로 설정 (폭발 위치)
  if (skill === 'penetrate' && pathResult.penetrateHitX.length > 0) {
    pathResult.impactX = pathResult.penetrateHitX[0];
    pathResult.impactY = pathResult.penetrateHitY[0];
    pathResult.hitTerrain = true; // 폭발 이펙트를 위해
  }

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
    const a2 = Math.max(-90, Math.min(180, angle + 7));
    const pr2 = computeProjectilePath(startX, startY, a2, power, fortState.wind, {});
    extraShots.push({ startX, startY, angle: a2, power, pathResult: pr2, delay: 120 });
  } else if (skill === 'split') {
    // 분열 지점에서 속도 벡터 방향 계산
    const sxi = Math.min(splitIdx, pathResult.path.length - 1);
    const sxi1 = Math.max(0, sxi - 1);
    const vdx = pathResult.path.xs[sxi] - pathResult.path.xs[sxi1];
    const vdy = pathResult.path.ys[sxi] - pathResult.path.ys[sxi1];
    const baseAngle = Math.atan2(-vdy, vdx) * 180 / Math.PI;
    const sx = pathResult.path.xs[sxi], sy = pathResult.path.ys[sxi];
    [-22, 0, 22].forEach((dA, i) => {
      const sa = Math.max(-90, Math.min(180, baseAngle + dA));
      const pr = computeProjectilePath(sx, sy, sa, power * 0.75, fortState.wind, {});
      extraShots.push({ startX: sx, startY: sy, angle: sa, power: power * 0.75, pathResult: pr, delay: 0 });
    });
  }

  // ── 히트 판정 ──────────────────────────────────────────
  let mainHit;
  if (skill === 'penetrate' && pathResult.penetrateHitX.length > 0) {
    // 관통탄: 경로 상의 각 히트 지점에서 판정하여 병합
    const allTargets = [];
    const hitIdDedup = new Set();
    for (let hi = 0; hi < pathResult.penetrateHitX.length; hi++) {
      const hr = checkHit(pathResult.penetrateHitX[hi], pathResult.penetrateHitY[hi], current.id);
      hr.targets.forEach(t => {
        if (!hitIdDedup.has(t.id)) { hitIdDedup.add(t.id); allTargets.push(t); }
      });
    }
    mainHit = { hit: allTargets.length > 0, targets: allTargets };
  } else {
    mainHit = checkHit(pathResult.impactX, pathResult.impactY, current.id);
  }
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

  // ── 일반 넉백: 피격된 모든 탱크를 폭발 반대 방향으로 밀어냄 ──
  const FORT_KNOCKBACK_DIST = 15; // 기본 넉백 거리 (px)
  if (skill !== 'knockback') { // knockback 스킬은 이미 별도 처리됨
    hitIdSet.forEach(hitId => {
      const p = fortState.players.find(pp => pp.id === hitId);
      if (!p || !p.alive) return;
      const dir = (p.x - pathResult.impactX) >= 0 ? 1 : -1;
      p.x = Math.max(20, Math.min(FORT_CANVAS_W - 20, p.x + dir * FORT_KNOCKBACK_DIST));
    });
  }

  // ── 땅뚫기 중간 관통 지점 데미지 & 지형 파괴 ─────────
  const pierceHits = [];
  if ((skill === 'double_pierce' || skill === 'triple_pierce') && pathResult.pierceImpacts) {
    pathResult.pierceImpacts.forEach(pi => {
      const hr = checkHit(pi.x, pi.y, current.id);
      applyDamage(hr);
      pierceHits.push({ impactX: pi.x, impactY: pi.y, hitResult: hr });
    });
  }

  // ── 지형 파괴 ──────────────────────────────────────────
  const terrainBefore = fortState.terrain.slice();
  const craterR = (skill === 'earthquake') ? FORT_CRATER_RADIUS * 3 : FORT_CRATER_RADIUS;
  if (pathResult.hitTerrain) {
    destroyTerrain(fortState.terrain, pathResult.impactX, pathResult.impactY, craterR);
  }
  // 땅뚫기 중간 관통 지점 지형 파괴
  pierceHits.forEach(ph => {
    destroyTerrain(fortState.terrain, ph.impactX, ph.impactY, FORT_CRATER_RADIUS);
  });
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
        Math.max(-90, Math.min(180, cA)), cPow, fortState.wind, {}
      );
      const chr = checkHit(cp.impactX, cp.impactY, current.id);
      applyDamage(chr);
      if (cp.hitTerrain) destroyTerrain(fortState.terrain, cp.impactX, cp.impactY, FORT_CRATER_RADIUS * 0.5);
      clusterImpacts.push({ impactX: cp.impactX, impactY: cp.impactY, hitResult: chr });
    }
  }

  // ── 낙사 체크: 지형 파괴로 땅이 사라진 위치의 탱크 즉시 사망 ──
  fortCheckFallDeath();

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
    pierceHits,
    clusterImpacts,
  };
  FortPerf.end('handleFire');
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

// ===== TURN MANAGEMENT =====
function advanceFortTurn() {
  if (!fortState) return;

  const n = fortState.players.length;

  // 딜레이 기반 턴 순서: 살아있는 플레이어 중 delay가 가장 낮은 플레이어 선택
  let nextIdx = -1;
  let minDelay = Infinity;
  for (let i = 0; i < n; i++) {
    const p = fortState.players[i];
    if (p.alive && (p.delay || 0) < minDelay) {
      minDelay = p.delay || 0;
      nextIdx = i;
    }
  }
  if (nextIdx === -1) return; // 모두 사망

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

  // ── 쉴드 만료 (자기 턴 시작 시 소멸) ─────────────────
  if (nextPlayer && nextPlayer.shield > 0) {
    nextPlayer.shield = 0;
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

  // 30초 턴 타이머 시작
  fortStartTurnTimer();
}

// ===== TURN TIMER =====
function fortStartTurnTimer() {
  fortClearTurnTimer();
  if (!state.isHost) return;
  _fortTurnTimeLeft = FORT_TURN_TIME;
  // 타이머 UI 갱신 브로드캐스트
  broadcast({ type: 'fort-timer', time: _fortTurnTimeLeft });
  fortUpdateTimerUI(_fortTurnTimeLeft);

  _fortTurnTimer = setInterval(() => {
    _fortTurnTimeLeft--;
    broadcast({ type: 'fort-timer', time: _fortTurnTimeLeft });
    fortUpdateTimerUI(_fortTurnTimeLeft);
    if (_fortTurnTimeLeft <= 0) {
      fortClearTurnTimer();
      // 시간 초과: 아무 행동 없이 턴 종료 (기본 딜레이만 적용)
      if (fortState && fortState.phase === 'aiming') {
        const current = fortState.players[fortState.turnIdx];
        if (current && current.alive) {
          const moveDelay = (FORT_MOVE_FUEL - (current.moveFuel || 0)) * FORT_DELAY_MOVE_PER;
          current.delay = (current.delay || 0) + moveDelay + FORT_DELAY_BASE;
        }
        fortState.phase = 'animating';
        broadcast({ type: 'fort-timeout', playerId: current ? current.id : null });
        _fortShowSkillFlash(`⏰ ${current ? current.name : ''} 시간 초과!`);
        setTimeout(() => {
          if (fortState) advanceFortTurn();
        }, 1200);
      }
    }
  }, 1000);
}

function fortClearTurnTimer() {
  if (_fortTurnTimer) {
    clearInterval(_fortTurnTimer);
    _fortTurnTimer = null;
  }
}

function fortUpdateTimerUI(sec) {
  const el = document.getElementById('fortTurnTimer');
  if (!el) return;
  el.textContent = sec + 's';
  el.classList.toggle('fort-timer-warn', sec <= 10);
  el.classList.toggle('fort-timer-danger', sec <= 5);
}



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
const FORT_CANVAS_W = 800;
const FORT_CANVAS_H = 500;
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
// Pre-resolved references to tamagotchi globals (avoid typeof checks per frame)
function _fortResolveTamaGlobals() {
  _fortPlayerInfoCache = {}; // clear on game start
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
let _fortAngleInterval = null;
let _fortPowerInterval = null;

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
  fortCam.x = Math.max(vw, Math.min(FORT_CANVAS_W - vw, fortCam.x));
  fortCam.y = Math.max(vh, Math.min(FORT_CANVAS_H - vh, fortCam.y));
  fortCam.targetX = Math.max(vw, Math.min(FORT_CANVAS_W - vw, fortCam.targetX));
  fortCam.targetY = Math.max(vh, Math.min(FORT_CANVAS_H - vh, fortCam.targetY));
}

function applyCameraTransform(ctx) {
  const vw = FORT_CANVAS_W / fortCam.zoom;
  const vh = FORT_CANVAS_H / fortCam.zoom;
  ctx.scale(fortCam.zoom, fortCam.zoom);
  ctx.translate(-fortCam.x + vw / 2, -fortCam.y + vh / 2);
}

function fortCameraLoop() {
  const view = window._fortView;
  if (view && view.phase === 'aiming') {
    // Lerp camera toward target and re-render
    const dx = fortCam.targetX - fortCam.x;
    const dy = fortCam.targetY - fortCam.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      fortCam.x += dx * fortCam.lerp;
      fortCam.y += dy * fortCam.lerp;
      clampCamera();
      renderFortressScene(view);
    }
  }
  _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
}

function fortZoomIn() {
  fortCam.zoom = Math.min(FORT_CAM_ZOOM_MAX, fortCam.zoom + 0.2);
  clampCamera();
  const view = window._fortView;
  if (view) renderFortressScene(view);
}

function fortZoomOut() {
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
  const baseHeight = height * 0.7;
  const minHeight = height * 0.4;
  const maxHeight = height * 0.85;

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

  // Smoke — batch all smoke into one path (same color)
  if (fortSmoke.length > 0) {
    ctx.fillStyle = 'rgba(100,100,100,1)';
    ctx.beginPath();
    for (let i = 0; i < fortSmoke.length; i++) {
      const p = fortSmoke[i];
      ctx.globalAlpha = p.life * 0.4;
      // Can't batch with varying alpha — still one arc per particle, but no fillStyle reset
      ctx.moveTo(p.x + p.size, p.y);
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ===== WIND PARTICLE SYSTEM =====
function updateWindParticles(wind) {
  // Update existing particles
  fortWindParticles = fortWindParticles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    return p.life > 0;
  });

  // Don't spawn if no wind
  if (wind === 0) return;

  const absWind = Math.abs(wind);
  // Spawn rate scales with wind strength: 1-2 per frame for light, up to 3-4 for strong
  const spawnCount = Math.floor(Math.random() * (absWind > 3 ? 3 : 2)) + (absWind > 1 ? 1 : (Math.random() < 0.5 ? 1 : 0));

  for (let i = 0; i < spawnCount; i++) {
    // Spawn across the full canvas width, in the sky area (upper 60%)
    const spawnX = Math.random() * FORT_CANVAS_W;
    const spawnY = Math.random() * FORT_CANVAS_H * 0.6;

    // Speed scales with wind strength
    const baseSpeed = 0.5 + absWind * 0.8;
    const speed = baseSpeed + Math.random() * baseSpeed * 0.5;
    const dir = wind > 0 ? 1 : -1;

    // Length/size scales with wind
    let length, alpha;
    if (absWind <= 2) {
      // Light wind: small dots
      length = 2 + Math.random() * 3;
      alpha = 0.15 + Math.random() * 0.1;
    } else if (absWind <= 4) {
      // Medium wind: short streaks
      length = 4 + Math.random() * 6;
      alpha = 0.2 + Math.random() * 0.15;
    } else {
      // Strong wind: long streaks
      length = 8 + Math.random() * 10;
      alpha = 0.25 + Math.random() * 0.15;
    }

    fortWindParticles.push({
      x: spawnX,
      y: spawnY,
      vx: speed * dir,
      vy: 0.1 + Math.random() * 0.3, // slight downward drift
      life: 1.0,
      decay: 0.01 + Math.random() * 0.015,
      length: length,
      alpha: alpha,
    });
  }

  // Cap particle count
  if (fortWindParticles.length > 150) {
    fortWindParticles = fortWindParticles.slice(-150);
  }
}

function drawWindParticles(ctx, wind) {
  if (wind === 0 || fortWindParticles.length === 0) return;
  const dir = wind > 0 ? 1 : -1;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 1;
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
    tama: p.tama || null, // tamagotchi pet info { tribe, level }
    x: Math.floor((i + 1) * canvasW / (n + 1)),
    hp: FORT_MAX_HP,
    alive: true,
    angle: 45,
    power: 50,
    moveFuel: FORT_MOVE_FUEL,
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
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  fortWindParticles = [];

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
    } else if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      fortPowerStep(-1);
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      fortPowerStep(1);
    } else if (e.key === ' ' || e.key === 'Enter') {
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

  document.addEventListener('keydown', _fortKeyDown);
  document.addEventListener('keyup', _fortKeyUp);
}

function cleanupFortressKeyboard() {
  if (_fortKeyDown) document.removeEventListener('keydown', _fortKeyDown);
  if (_fortKeyUp) document.removeEventListener('keyup', _fortKeyUp);
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
    })),
    terrain: fortState.terrain,
    wind: fortState.wind,
    turnIdx: fortState.turnIdx,
    round: fortState.round,
    phase: fortState.phase,
    canvasW: fortState.canvasW,
    canvasH: fortState.canvasH,
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
  const aspect = FORT_CANVAS_W / FORT_CANVAS_H; // 8:5 = 1.6
  let w, h;
  if (cw / ch > aspect) {
    h = ch; w = h * aspect;
  } else {
    w = cw; h = w / aspect;
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
      // Also pan with midpoint
      const rect = fortCanvas.getBoundingClientRect();
      const scaleX = FORT_CANVAS_W / rect.width;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const pdx = (mx - _fortDrag.sx) * scaleX / fortCam.zoom;
      const pdy = (my - _fortDrag.sy) * scaleX / fortCam.zoom;
      fortCam.targetX = _fortDrag.cx - pdx;
      fortCam.targetY = _fortDrag.cy - pdy;
      clampCamera();
    } else if (!_fortDrag.pinch && e.touches.length === 1) {
      const rect = fortCanvas.getBoundingClientRect();
      const scaleX = FORT_CANVAS_W / rect.width;
      const dx = (e.touches[0].clientX - _fortDrag.sx) * scaleX / fortCam.zoom;
      const dy = (e.touches[0].clientY - _fortDrag.sy) * scaleX / fortCam.zoom;
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
    const dx = (e.clientX - _fortDrag.sx) * scaleX / fortCam.zoom;
    const dy = (e.clientY - _fortDrag.sy) * scaleX / fortCam.zoom;
    fortCam.targetX = _fortDrag.cx - dx;
    fortCam.targetY = _fortDrag.cy - dy;
    clampCamera();
  };

  fortCanvas.onmouseup = () => { _fortDrag = null; };
  fortCanvas.onmouseleave = () => { _fortDrag = null; };

  // Wheel zoom
  fortCanvas.onwheel = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.15;
    const dir = e.deltaY < 0 ? 1 : -1;
    fortCam.zoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(FORT_CAM_ZOOM_MAX, fortCam.zoom + dir * zoomSpeed));
    clampCamera();
  };
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

function fortPowerStep(dir) {
  fortSetPower(Math.max(10, Math.min(100, fortLocalPower + dir)));
}

function fortPowerStart(dir) {
  fortPowerStep(dir);
  if (_fortPowerInterval) clearInterval(_fortPowerInterval);
  _fortPowerInterval = setInterval(() => fortPowerStep(dir * 2), 60);
}

function fortPowerStop() {
  if (_fortPowerInterval) { clearInterval(_fortPowerInterval); _fortPowerInterval = null; }
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

  if (state.isHost) {
    handleFortFire(state.myId, {
      type: 'fort-fire',
      angle: fortLocalAngle,
      power: fortLocalPower,
    });
  } else {
    if (currentPlayer.id !== state.myId) return;
    sendToHost({
      type: 'fort-fire',
      angle: fortLocalAngle,
      power: fortLocalPower,
    });
  }
}

// ===== HOST: HANDLE FIRE =====
function handleFortFire(peerId, msg) {
  if (!fortState || fortState.phase !== 'aiming') return;

  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.alive) return;

  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const angle = Math.max(0, Math.min(180, parseInt(msg.angle) || 45));
  const power = Math.max(10, Math.min(100, parseInt(msg.power) || 50));

  fortState.phase = 'animating';

  const startX = current.x;
  const stx = Math.floor(Math.max(0, Math.min(startX, FORT_CANVAS_W - 1)));
  // Adjust turret center: tama characters are taller than tanks
  const startY = fortState.terrain[stx] - FORT_TAMA_RADIUS * 1.5 - 2; // tama barrel origin (all players)
  const pathResult = computeProjectilePath(startX, startY, angle, power, fortState.wind);

  const hitResult = checkHit(pathResult.impactX, pathResult.impactY, current.id);

  applyDamage(hitResult);

  // Save terrain BEFORE destruction for animation
  const terrainBefore = fortState.terrain.slice();

  // Destroy terrain at impact
  destroyTerrain(fortState.terrain, pathResult.impactX, pathResult.impactY, FORT_CRATER_RADIUS);

  const animMsg = {
    type: 'fort-anim',
    startX, startY, angle, power,
    wind: fortState.wind,
    hitResult,
    shooterId: current.id,
    impactX: pathResult.impactX,
    impactY: pathResult.impactY,
    terrainBefore: terrainBefore,
    terrainAfter: fortState.terrain.slice(),
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
function drawTrajectoryPreview(ctx, startX, startY, angleDeg, power, wind, terrain) {
  const rad = angleDeg * Math.PI / 180;
  const speed = 1.5 + power * 0.1;
  let vx = speed * Math.cos(rad);
  let vy = -speed * Math.sin(rad);
  let x = startX, y = startY;

  const MAX = 120;
  const DOT_STEP = 3; // draw dot every N simulation steps
  let dotCount = 0;
  const maxDots = 18;

  ctx.save();
  for (let i = 0; i < MAX && dotCount < maxDots; i++) {
    vx += wind * 0.003;
    vy += FORT_GRAVITY;
    x += vx; y += vy;

    const tx = Math.floor(x);
    if (tx < 0 || tx >= FORT_CANVAS_W) break;
    if (terrain && y >= terrain[tx]) break;
    if (y > FORT_CANVAS_H + 40) break;

    if (i % DOT_STEP === 0) {
      const progress = dotCount / maxDots;
      const alpha = 0.85 - progress * 0.7;
      const r = Math.max(0.8, 2.5 - progress * 1.8);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.fill();
      dotCount++;
    }
  }
  ctx.restore();
}

function computeProjectilePath(startX, startY, angleDeg, power, wind) {
  const rad = angleDeg * Math.PI / 180;
  const speed = 1.5 + power * 0.1;
  let vx = speed * Math.cos(rad);
  let vy = -speed * Math.sin(rad);
  let x = startX;
  let y = startY;

  // Float32Array: 2x less memory, faster iteration than object array
  const MAX_STEPS = 3000;
  const xs = new Float32Array(MAX_STEPS + 1);
  const ys = new Float32Array(MAX_STEPS + 1);
  xs[0] = x; ys[0] = y;
  let len = 1;

  const terrain = fortState ? fortState.terrain :
    (window._fortView ? window._fortView.terrain : new Array(FORT_CANVAS_W).fill(380));
  const width = fortState ? fortState.canvasW : FORT_CANVAS_W;

  for (let i = 0; i < MAX_STEPS; i++) {
    vx += wind * 0.003;
    vy += FORT_GRAVITY;
    x += vx;
    y += vy;
    xs[len] = x; ys[len] = y; len++;

    const tx = Math.floor(x);
    if (tx < 0 || tx >= width) break;
    if (y >= terrain[tx]) break;
    if (y > FORT_CANVAS_H + 100) break;
  }

  // Wrap in a path-like object compatible with animation code
  // path[i].x / path[i].y → use typed views; also expose length
  const path = { xs, ys, length: len };
  return { path, impactX: x, impactY: y };
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
  while (!fortState.players[nextIdx].alive && tries < n) {
    nextIdx = (nextIdx + 1) % n;
    tries++;
  }

  if (nextIdx <= fortState.turnIdx) {
    fortState.round++;
  }

  fortState.turnIdx = nextIdx;
  fortState.wind = Math.floor(Math.random() * 11) - 5;
  fortState.phase = 'aiming';

  // Reset movement fuel for next player
  const nextPlayer = fortState.players[nextIdx];
  if (nextPlayer) nextPlayer.moveFuel = FORT_MOVE_FUEL;
  fortMovedThisTurn = 0;

  // Camera: target next player
  if (nextPlayer) {
    const npx = nextPlayer.x;
    const npy = fortState.terrain[Math.floor(Math.max(0, Math.min(npx, FORT_CANVAS_W - 1)))] - FORT_TANK_H;
    fortCameraTarget(npx, npy);
  }

  broadcastFortressState();
}

// ===== ANIMATION =====
function startFortAnimation(msg, callback) {
  const pathResult = computeProjectilePath(msg.startX, msg.startY, msg.angle, msg.power, msg.wind);
  const path = pathResult.path;
  const hitResult = msg.hitResult;
  const view = window._fortView;

  // Use pre-destruction terrain during projectile flight
  if (view && msg.terrainBefore) {
    view.terrain = msg.terrainBefore;
  }

  // Apply damage to local view for post-animation render
  if (view && hitResult && hitResult.targets) {
    hitResult.targets.forEach(t => {
      const p = view.players.find(pp => pp.id === t.id);
      if (p) {
        p.hp = Math.max(0, p.hp - t.damage);
        if (p.hp <= 0) p.alive = false;
      }
    });
  }

  // Clear old particles
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];

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

      // Draw glowing projectile trail (last N points)
      const trailLen = 15;
      const tStart = Math.max(0, frameIdx - trailLen);
      const tEnd = Math.min(frameIdx, path.length - 1);
      for (let i = tStart; i <= tEnd; i++) {
        const t = (i - tStart) / trailLen;
        const alpha = t * 0.7;
        const size = 1 + t * 3;
        ctx.fillStyle = `rgba(255, ${150 + Math.floor(t * 80)}, 50, ${alpha})`;
        ctx.beginPath();
        ctx.arc(path.xs[i], path.ys[i], size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw projectile with glow
      if (frameIdx < path.length) {
        const ptx = path.xs[frameIdx];
        const pty = path.ys[frameIdx];

        // Glow
        ctx.save();
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(ptx, pty, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Core
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.arc(ptx, pty, 3, 0, Math.PI * 2);
        ctx.fill();

        // Tiny sparks every few frames
        if (frameIdx % 3 === 0) {
          fortParticles.push({
            x: ptx, y: pty,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            life: 0.5 + Math.random() * 0.3,
            decay: 0.04 + Math.random() * 0.03,
            size: 1 + Math.random() * 1.5,
            color: `hsl(${30 + Math.random() * 20}, 100%, ${60 + Math.random() * 30}%)`,
          });
        }
      }

      // Draw particles on top
      drawParticles(ctx);

      ctx.restore(); // end camera transform
    }

    frameIdx += speed;

    if (frameIdx >= path.length) {
      const impactIdx = path.length - 1;
      animateExplosion(path.xs[impactIdx], path.ys[impactIdx], hitResult, view, callback, msg.terrainAfter);
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
    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;
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

  ctx.clearRect(0, 0, w, h);

  // Sky: no camera transform (always full screen)
  drawSky(ctx, w, h);

  // Update wind particles each frame
  updateWindParticles(view.wind || 0);

  // Everything else: camera transform
  ctx.save();
  applyCameraTransform(ctx);
  drawClouds(ctx, w);
  drawTerrain(ctx, terrain, w, h);
  drawTanks(ctx, view.players, view.turnIdx, terrain);
  drawHPBars(ctx, view.players, terrain);
  drawNames(ctx, view.players, terrain);
  drawWindParticles(ctx, view.wind || 0);
  ctx.restore();
}

function _buildSkyCache(w, h) {
  const oc = new OffscreenCanvas(w, h);
  const sCtx = oc.getContext('2d');

  // Sky gradient
  const grad = sCtx.createLinearGradient(0, 0, 0, h * 0.8);
  grad.addColorStop(0, '#0d1b3e');
  grad.addColorStop(0.3, '#1a3a6e');
  grad.addColorStop(0.7, '#4a90c4');
  grad.addColorStop(1, '#87CEEB');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, w, h);

  // Stars
  sCtx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 20; i++) {
    const sx = (i * 137 + 50) % w;
    const sy = (i * 97 + 10) % (h * 0.3);
    sCtx.beginPath();
    sCtx.arc(sx, sy, 0.8, 0, Math.PI * 2);
    sCtx.fill();
  }

  // Clouds (static, drawn once)
  sCtx.fillStyle = 'rgba(255,255,255,0.08)';
  const clouds = [
    { x: 100, y: 40, rx: 50, ry: 15 },
    { x: 350, y: 60, rx: 70, ry: 18 },
    { x: 600, y: 35, rx: 45, ry: 12 },
    { x: 750, y: 70, rx: 55, ry: 14 },
  ];
  for (const c of clouds) {
    sCtx.beginPath();
    sCtx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.beginPath();
    sCtx.ellipse(c.x - c.rx * 0.5, c.y + 5, c.rx * 0.6, c.ry * 0.8, 0, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.beginPath();
    sCtx.ellipse(c.x + c.rx * 0.4, c.y + 3, c.rx * 0.5, c.ry * 0.7, 0, 0, Math.PI * 2);
    sCtx.fill();
  }
  return oc;
}

function drawSky(ctx, w, h) {
  if (!_fortSkyCache) _fortSkyCache = _buildSkyCache(w, h);
  ctx.drawImage(_fortSkyCache, 0, 0);
}

function drawClouds() { /* merged into drawSky cache */ }

function drawTerrain(ctx, terrain, w, h) {
  // Cache terrain gradient (fixed colors, only depends on h)
  if (!_fortTerrainGrad) {
    _fortTerrainGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
    _fortTerrainGrad.addColorStop(0, '#5a9c4f');
    _fortTerrainGrad.addColorStop(0.3, '#4a8c3f');
    _fortTerrainGrad.addColorStop(0.7, '#3a6c2f');
    _fortTerrainGrad.addColorStop(1, '#2a4c1f');
  }

  // Build terrain path once per call (terrain changes only on crater)
  // Use a single path for main fill to avoid redundant traversals
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(w, h);
  ctx.closePath();

  ctx.fillStyle = _fortTerrainGrad;
  ctx.fill();

  // Underground layer (offset terrain up by 15px, same shape)
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) ctx.lineTo(x, terrain[x] + 15);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = '#3a5c2f';
  ctx.fill();

  // Grass edge — single stroke over terrain profile
  ctx.strokeStyle = '#6aac5f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.stroke();

  // Texture dots (static positions, no randomness needed)
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  for (let i = 0; i < 80; i++) {
    const tx = (i * 97 + 30) % w;
    const ty = terrain[tx] + 10 + ((i * 53) % 60);
    if (ty < h) ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
  }
  ctx.fill();
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
      const imgSize = R * 2 * 2.4;
      const imgX = centerX - imgSize / 2;
      const imgY = centerY - imgSize * 0.62;
      ctx.filter = 'grayscale(0.8) brightness(0.5)';
      ctx.drawImage(tamaImg, imgX, imgY, imgSize, imgSize);
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
    const centerY = terrainY - R - 2;
    const tamaImg = fortGetTamaImage(tamaData);

    ctx.save();

    // Current turn glow
    if (isCurrentTurn) {
      ctx.shadowColor = pInfo.glowColor;
      ctx.shadowBlur = 22;
    }

    // Circular border (player color ring)
    ctx.beginPath();
    ctx.arc(centerX, centerY, R + 3, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Clip to circle and draw character image
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
    ctx.clip();

    // Always draw a solid base background (tribe color)
    ctx.fillStyle = pInfo.glowColor;
    ctx.fillRect(centerX - R, centerY - R, R * 2, R * 2);

    if (tamaImg) {
      // Zoom in so character content fills the circle (sprites often have padding around the character)
      const imgSize = R * 2 * 2.4;
      const imgX = centerX - imgSize / 2;
      // Shift up a bit: character body tends to be in lower-center of sprite
      const imgY = centerY - imgSize * 0.62;
      ctx.drawImage(tamaImg, imgX, imgY, imgSize, imgSize);
    } else {
      // Fallback: emoji centered in circle (tribe color bg already drawn above)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(centerX - R, centerY - R, R * 2, R * 2);
      ctx.font = `bold ${Math.floor(R * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pInfo.emoji, centerX, centerY + 1);
    }
    ctx.restore(); // end clip

    // Inner highlight ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer ring outline
    ctx.beginPath();
    ctx.arc(centerX, centerY, R + 3, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrentTurn ? '#ffd700' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = isCurrentTurn ? 2.5 : 1.5;
    ctx.stroke();

    // Pulsing glow for current turn
    if (isCurrentTurn) {
      const pulse = 0.3 + 0.2 * Math.sin(Date.now() * 0.004);
      ctx.beginPath();
      ctx.arc(centerX, centerY, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    // === Dotted trajectory preview (local player's turn only) ===
    const isLocalPlayer = player.id === state.myId;
    if (isLocalPlayer && isCurrentTurn) {
      const view = window._fortView;
      const wind = view ? view.wind : 0;
      const terrain = view ? view.terrain : null;
      // Start from top-center of the character circle
      const launchX = centerX;
      const launchY = centerY - R - 1;
      drawTrajectoryPreview(ctx, launchX, launchY, fortLocalAngle, fortLocalPower, wind, terrain);
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
      return `<div class="${itemClass}">
        <div class="fort-player-avatar">${p.avatar}</div>
        <div class="fort-player-info">
          <div class="fort-player-name">${escapeHTML(p.name)}</div>
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
  fortPowerStop();
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
}

function closeFortressGame() {
  closeFortressCleanup();
  returnToLobby();
}

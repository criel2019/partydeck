// =============================================
// ===== FORTRESS (요새) — Turn-based Artillery
// =============================================

// ===== CONSTANTS =====
const FORT_GRAVITY = 0.15;
const FORT_POWER_MULT = 0.13;
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

// ===== GLOBAL STATE =====
let fortState = null;
let fortCanvas = null, fortCtx = null;
let fortAnimId = null;
let fortLocalAngle = 45;
let fortLocalPower = 50;
let fortParticles = [];
let fortDebris = [];
let fortSmoke = [];
let fortMoveDir = 0; // -1 left, 0 none, 1 right
let fortMoveInterval = null;
let fortMovedThisTurn = 0;
let _fortKeyDown = null;
let _fortKeyUp = null;

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
  // Fire particles
  fortParticles = fortParticles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life -= p.decay;
    return p.life > 0;
  });
  // Debris
  fortDebris = fortDebris.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.rotation += p.rotSpeed;
    p.life -= p.decay;
    return p.life > 0;
  });
  // Smoke
  fortSmoke = fortSmoke.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.size += 0.3;
    p.life -= p.decay;
    return p.life > 0;
  });
}

function drawParticles(ctx) {
  // Fire particles
  fortParticles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  // Debris (dirt chunks)
  fortDebris.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = `hsl(30, ${30 + Math.random() * 20}%, ${25 + Math.random() * 15}%)`;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });
  // Smoke
  fortSmoke.forEach(p => {
    ctx.globalAlpha = p.life * 0.4;
    ctx.fillStyle = `rgba(100, 100, 100, 1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ===== HOST: GAME INIT =====
function startFortress() {
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

  const view = createFortressView();
  broadcast({ type: 'game-start', game: 'fortress', state: view });
  showScreen('fortressGame');
  initFortCanvas();
  renderFortressView(view);
  setupFortressKeyboard();
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

// ===== CANVAS INIT =====
function initFortCanvas() {
  fortCanvas = document.getElementById('fortressCanvas');
  if (!fortCanvas) return;
  fortCtx = fortCanvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  fortCanvas.width = FORT_CANVAS_W * dpr;
  fortCanvas.height = FORT_CANVAS_H * dpr;
  fortCanvas.style.width = '100%';
  fortCanvas.style.height = '100%';
  fortCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  const startY = fortState.terrain[stx] - FORT_TANK_H + 2; // turret center
  const pathResult = computeProjectilePath(startX, startY, angle, power, fortState.wind);

  const hitResult = checkHit(pathResult.impactX, pathResult.impactY, current.id);

  applyDamage(hitResult);

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
    terrainAfter: fortState.terrain.slice(), // send updated terrain
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

// ===== PHYSICS =====
function computeProjectilePath(startX, startY, angleDeg, power, wind) {
  const rad = angleDeg * Math.PI / 180;
  const speed = power * FORT_POWER_MULT;
  let vx = speed * Math.cos(rad);
  let vy = -speed * Math.sin(rad);

  // Start from barrel tip (not tank body)
  let x = startX + FORT_BARREL_LEN * Math.cos(rad);
  let y = startY - FORT_BARREL_LEN * Math.sin(rad);
  const path = [{ x, y, vx, vy }];
  const terrain = fortState ? fortState.terrain :
    (window._fortView ? window._fortView.terrain : new Array(FORT_CANVAS_W).fill(380));
  const width = fortState ? fortState.canvasW : FORT_CANVAS_W;

  for (let i = 0; i < 3000; i++) {
    // Wind — gentle horizontal force
    vx += wind * 0.004;

    // Gravity only — clean parabolic arc (no air drag)
    vy += FORT_GRAVITY;

    x += vx;
    y += vy;
    path.push({ x, y, vx, vy });

    // Check terrain collision
    const tx = Math.floor(x);
    if (tx < 0 || tx >= width) break;
    if (y >= terrain[tx]) break;
    if (y > FORT_CANVAS_H + 100) break;
  }

  return {
    path,
    impactX: x,
    impactY: y,
  };
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

  broadcastFortressState();
}

// ===== ANIMATION =====
function startFortAnimation(msg, callback) {
  const pathResult = computeProjectilePath(msg.startX, msg.startY, msg.angle, msg.power, msg.wind);
  const path = pathResult.path;
  const hitResult = msg.hitResult;
  const view = window._fortView;

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
  const speed = 4;
  let muzzleFlashFrame = 0;

  if (fortAnimId) cancelAnimationFrame(fortAnimId);

  // Muzzle flash particles at barrel tip
  const muzzleRad = msg.angle * Math.PI / 180;
  const muzzleX = msg.startX + FORT_BARREL_LEN * Math.cos(muzzleRad);
  const muzzleY = msg.startY - FORT_BARREL_LEN * Math.sin(muzzleRad);
  spawnExplosionParticles(muzzleX, muzzleY, 8, false);

  function animLoop() {
    if (!view) { if (callback) callback(); return; }

    updateParticles();
    renderFortressScene(view);

    if (fortCtx) {
      const ctx = fortCtx;

      // Draw fading trajectory line (dotted)
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const trailStart = 0;
      const trailEnd = Math.min(frameIdx, path.length - 1);
      for (let i = trailStart; i <= trailEnd; i++) {
        if (i === trailStart) ctx.moveTo(path[i].x, path[i].y);
        else ctx.lineTo(path[i].x, path[i].y);
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
        ctx.arc(path[i].x, path[i].y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw projectile with glow
      if (frameIdx < path.length) {
        const pt = path[frameIdx];

        // Glow
        ctx.save();
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Core
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Tiny sparks every few frames
        if (frameIdx % 3 === 0) {
          fortParticles.push({
            x: pt.x, y: pt.y,
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
    }

    frameIdx += speed;

    if (frameIdx >= path.length) {
      const impactPt = path[path.length - 1];
      // Update terrain in view for subsequent renders
      if (msg.terrainAfter && view) {
        view.terrain = msg.terrainAfter;
      }
      animateExplosion(impactPt.x, impactPt.y, hitResult, view, callback);
      return;
    }

    fortAnimId = requestAnimationFrame(animLoop);
  }

  fortAnimId = requestAnimationFrame(animLoop);
}

function animateExplosion(x, y, hitResult, view, callback) {
  let frame = 0;
  const totalFrames = 35;
  const maxRadius = 50;

  // Spawn lots of particles at impact
  spawnExplosionParticles(x, y, 40, true);
  spawnDebris(x, y, 20);
  spawnSmoke(x, y, 12);

  // Screen shake state
  let shakeIntensity = 8;

  function explodeLoop() {
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

      // Explosion flash (very bright at start)
      if (frame < 5) {
        const flashAlpha = (1 - frame / 5) * 0.6;
        ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.fillRect(0, 0, FORT_CANVAS_W, FORT_CANVAS_H);
      }

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

  drawSky(ctx, w, h);
  drawClouds(ctx, w);
  drawTerrain(ctx, terrain, w, h);
  drawTanks(ctx, view.players, view.turnIdx, terrain);
  drawHPBars(ctx, view.players, terrain);
  drawNames(ctx, view.players, terrain);
}

function drawSky(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  grad.addColorStop(0, '#0d1b3e');
  grad.addColorStop(0.3, '#1a3a6e');
  grad.addColorStop(0.7, '#4a90c4');
  grad.addColorStop(1, '#87CEEB');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stars (very subtle in upper sky)
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 20; i++) {
    const sx = (i * 137 + 50) % w;
    const sy = (i * 97 + 10) % (h * 0.3);
    ctx.beginPath();
    ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(ctx, w) {
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  // Simple static cloud shapes
  const clouds = [
    { x: 100, y: 40, rx: 50, ry: 15 },
    { x: 350, y: 60, rx: 70, ry: 18 },
    { x: 600, y: 35, rx: 45, ry: 12 },
    { x: 750, y: 70, rx: 55, ry: 14 },
  ];
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.rx * 0.5, c.y + 5, c.rx * 0.6, c.ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.rx * 0.4, c.y + 3, c.rx * 0.5, c.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTerrain(ctx, terrain, w, h) {
  // Main terrain fill with gradient
  const terrainGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
  terrainGrad.addColorStop(0, '#5a9c4f');
  terrainGrad.addColorStop(0.3, '#4a8c3f');
  terrainGrad.addColorStop(0.7, '#3a6c2f');
  terrainGrad.addColorStop(1, '#2a4c1f');

  ctx.fillStyle = terrainGrad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) {
    ctx.lineTo(x, terrain[x]);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Grass detail on top edge
  ctx.strokeStyle = '#6aac5f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    if (x === 0) ctx.moveTo(x, terrain[x]);
    else ctx.lineTo(x, terrain[x]);
  }
  ctx.stroke();

  // Darker underground layer
  ctx.fillStyle = '#3a5c2f';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) {
    ctx.lineTo(x, terrain[x] + 15);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Subtle texture dots
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 80; i++) {
    const tx = (i * 97 + 30) % w;
    const ty = terrain[tx] + 10 + ((i * 53) % 60);
    if (ty < h) {
      ctx.beginPath();
      ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTanks(ctx, players, turnIdx, terrain) {
  players.forEach((p, i) => {
    if (!p.alive) return;
    drawTank(ctx, p, i === turnIdx, terrain);
  });
}

function drawTank(ctx, player, isCurrentTurn, terrain) {
  const x = player.x;
  const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
  const terrainY = terrain[tx] || 380;

  // Calculate terrain slope for tank tilting
  const txL = Math.max(0, tx - 8);
  const txR = Math.min(terrain.length - 1, tx + 8);
  const slope = Math.atan2(terrain[txR] - terrain[txL], txR - txL);

  const bodyX = x - FORT_TANK_W / 2;
  const bodyY = terrainY - FORT_TANK_H;

  ctx.save();
  ctx.translate(x, terrainY);
  ctx.rotate(slope);
  ctx.translate(-x, -terrainY);

  // Glow for current turn
  if (isCurrentTurn) {
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
  }

  // Tank treads
  ctx.fillStyle = '#222';
  const treadH = 6;
  ctx.beginPath();
  ctx.roundRect(bodyX - 2, terrainY - treadH, FORT_TANK_W + 4, treadH, 3);
  ctx.fill();

  // Tank body (rounded)
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, FORT_TANK_W, FORT_TANK_H, 4);
  ctx.fill();

  // Body highlight
  const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + FORT_TANK_H);
  bodyGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
  bodyGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
  bodyGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, FORT_TANK_W, FORT_TANK_H, 4);
  ctx.fill();

  // Outline
  ctx.strokeStyle = isCurrentTurn ? '#ffd700' : 'rgba(0,0,0,0.4)';
  ctx.lineWidth = isCurrentTurn ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, FORT_TANK_W, FORT_TANK_H, 4);
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Turret dome
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(x, bodyY + 2, 9, Math.PI, 0);
  ctx.fill();
  // Turret highlight
  const turretGrad = ctx.createRadialGradient(x - 2, bodyY - 2, 1, x, bodyY, 9);
  turretGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
  turretGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = turretGrad;
  ctx.beginPath();
  ctx.arc(x, bodyY + 2, 9, Math.PI, 0);
  ctx.fill();

  // Barrel — compensate for terrain slope so visual matches absolute physics angle
  let angle = 45;
  if (isCurrentTurn && player.id === state.myId) {
    angle = fortLocalAngle;
  }

  const absRad = angle * Math.PI / 180;
  const localRad = absRad + slope;
  const barrelEndX = x + FORT_BARREL_LEN * Math.cos(localRad);
  const barrelEndY = (bodyY + 2) - FORT_BARREL_LEN * Math.sin(localRad);

  // Barrel shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, bodyY + 3);
  ctx.lineTo(barrelEndX, barrelEndY + 1);
  ctx.stroke();

  // Barrel main
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, bodyY + 2);
  ctx.lineTo(barrelEndX, barrelEndY);
  ctx.stroke();

  // Barrel highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, bodyY + 1);
  ctx.lineTo(barrelEndX, barrelEndY - 1);
  ctx.stroke();

  // Wheels
  ctx.fillStyle = '#333';
  const wheelY = terrainY - 1;
  for (let wx = bodyX + 4; wx < bodyX + FORT_TANK_W; wx += 8) {
    ctx.beginPath();
    ctx.arc(wx, wheelY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Wheel hub
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(wx, wheelY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
  }

  ctx.restore();

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
    const barY = terrainY - FORT_TANK_H - 20;

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

  // Controls
  const fireBtn = document.getElementById('fortFireBtn');
  const angleSlider = document.getElementById('fortAngleSlider');
  const powerSlider = document.getElementById('fortPowerSlider');
  const moveBtnL = document.getElementById('fortMoveLeft');
  const moveBtnR = document.getElementById('fortMoveRight');

  if (fireBtn) fireBtn.disabled = !canAct;
  if (angleSlider) {
    angleSlider.disabled = !canAct;
    angleSlider.value = fortLocalAngle;
    angleSlider.oninput = function() { fortSetAngle(this.value); };
  }
  if (powerSlider) {
    powerSlider.disabled = !canAct;
    powerSlider.value = fortLocalPower;
    powerSlider.oninput = function() { fortSetPower(this.value); };
  }
  if (moveBtnL) moveBtnL.disabled = !canAct;
  if (moveBtnR) moveBtnR.disabled = !canAct;

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

function closeFortressGame() {
  const overlay = document.getElementById('fortGameOver');
  if (overlay) overlay.style.display = 'none';
  if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
  cleanupFortressKeyboard();
  fortStopMove();
  fortState = null;
  window._fortView = null;
  fortCtx = null;
  fortCanvas = null;
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  returnToLobby();
}

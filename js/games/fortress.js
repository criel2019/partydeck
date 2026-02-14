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

// ===== HOST: GAME INIT =====
function startFortress() {
  const n = state.players.length;
  const canvasW = FORT_CANVAS_W;

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
  }));

  fortState = {
    players,
    terrain: new Array(canvasW).fill(380),
    wind: Math.floor(Math.random() * 11) - 5,
    turnIdx: 0,
    round: 1,
    phase: 'aiming', // aiming | animating | gameover
    canvasW: canvasW,
    canvasH: FORT_CANVAS_H,
    deathOrder: [], // track death order for ranking
  };

  // Reset local controls
  fortLocalAngle = 45;
  fortLocalPower = 50;

  const view = createFortressView();
  broadcast({ type: 'game-start', game: 'fortress', state: view });
  showScreen('fortressGame');
  initFortCanvas();
  renderFortressView(view);
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

  // Set internal resolution
  const container = fortCanvas.parentElement;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Use fixed logical size for consistency, scale to fit
  fortCanvas.width = FORT_CANVAS_W * dpr;
  fortCanvas.height = FORT_CANVAS_H * dpr;
  fortCanvas.style.width = '100%';
  fortCanvas.style.height = '100%';
  fortCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== LOCAL CONTROLS =====
function fortSetAngle(val) {
  fortLocalAngle = parseInt(val);
  document.getElementById('fortAngleValue').textContent = fortLocalAngle;
  // Re-render canvas with updated barrel angle
  if (fortState || window._fortView) {
    renderFortressScene(window._fortView || createFortressView());
  }
}

function fortSetPower(val) {
  fortLocalPower = parseInt(val);
  document.getElementById('fortPowerValue').textContent = fortLocalPower;
}

// ===== FIRE =====
function fortFire() {
  if (!fortState && !window._fortView) return;
  const view = window._fortView;
  if (!view || view.phase !== 'aiming') return;

  // Check if it's my turn
  const currentPlayer = view.players[view.turnIdx];
  if (!currentPlayer) return;

  if (state.isHost) {
    // Host: process directly
    handleFortFire(state.myId, {
      type: 'fort-fire',
      angle: fortLocalAngle,
      power: fortLocalPower,
    });
  } else {
    // Client: send to host
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

  // Validate turn: allow host to fire for AI, or check peerId matches
  if (peerId !== current.id && !(current.id.startsWith('ai-') && peerId === state.myId)) return;

  const angle = Math.max(0, Math.min(180, parseInt(msg.angle) || 45));
  const power = Math.max(10, Math.min(100, parseInt(msg.power) || 50));

  fortState.phase = 'animating';

  // Compute projectile path
  const startX = current.x;
  const startY = fortState.terrain[Math.floor(current.x)] - FORT_TANK_H;
  const pathResult = computeProjectilePath(startX, startY, angle, power, fortState.wind);

  // Check hit
  const hitResult = checkHit(pathResult.impactX, pathResult.impactY, current.id);

  // Apply damage
  applyDamage(hitResult);

  // Broadcast animation data
  const animMsg = {
    type: 'fort-anim',
    startX, startY, angle, power,
    wind: fortState.wind,
    hitResult,
    shooterId: current.id,
  };
  broadcast(animMsg);

  // Play animation locally (host)
  startFortAnimation(animMsg, () => {
    if (!fortState) return;
    // Check game over
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
  let vx = power * Math.cos(rad) * 0.15;
  let vy = -power * Math.sin(rad) * 0.15;
  let x = startX, y = startY;
  const path = [{ x, y }];
  const terrain = fortState ? fortState.terrain : new Array(FORT_CANVAS_W).fill(380);
  const width = fortState ? fortState.canvasW : FORT_CANVAS_W;

  for (let i = 0; i < 2000; i++) {
    x += vx + wind * 0.02;
    y += vy;
    vy += FORT_GRAVITY;
    path.push({ x, y });

    // Check terrain collision
    const tx = Math.floor(x);
    if (tx < 0 || tx >= width) break;
    if (y >= terrain[tx]) break;
    if (y > FORT_CANVAS_H + 50) break; // way off screen
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
    const tankY = fortState.terrain[Math.floor(p.x)] - FORT_TANK_H / 2;
    const dx = impactX - p.x;
    const dy = impactY - tankY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= FORT_HIT_RADIUS) {
      // Direct hit: damage scales inversely with distance
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

  // Check if we completed a round
  if (nextIdx <= fortState.turnIdx) {
    fortState.round++;
  }

  fortState.turnIdx = nextIdx;
  fortState.wind = Math.floor(Math.random() * 11) - 5;
  fortState.phase = 'aiming';

  broadcastFortressState();

  // If AI player, schedule AI action
  const current = fortState.players[fortState.turnIdx];
  if (current && current.id.startsWith('ai-')) {
    // AI will be handled by ai.js scheduleAIAction via broadcast
  }
}

// ===== ANIMATION =====
function startFortAnimation(msg, callback) {
  // Compute path locally for animation
  const path = computeProjectilePath(msg.startX, msg.startY, msg.angle, msg.power, msg.wind).path;
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

  let frameIdx = 0;
  const speed = 3; // points per frame

  if (fortAnimId) cancelAnimationFrame(fortAnimId);

  function animLoop() {
    if (!view) { if (callback) callback(); return; }

    renderFortressScene(view);

    // Draw projectile trail
    if (fortCtx) {
      fortCtx.strokeStyle = 'rgba(255,200,100,0.5)';
      fortCtx.lineWidth = 1;
      fortCtx.beginPath();
      const trailStart = Math.max(0, frameIdx - 30);
      for (let i = trailStart; i <= Math.min(frameIdx, path.length - 1); i++) {
        if (i === trailStart) fortCtx.moveTo(path[i].x, path[i].y);
        else fortCtx.lineTo(path[i].x, path[i].y);
      }
      fortCtx.stroke();

      // Draw projectile
      if (frameIdx < path.length) {
        const pt = path[frameIdx];
        fortCtx.fillStyle = '#333';
        fortCtx.beginPath();
        fortCtx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        fortCtx.fill();
        fortCtx.fillStyle = '#ff6600';
        fortCtx.beginPath();
        fortCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        fortCtx.fill();
      }
    }

    frameIdx += speed;

    if (frameIdx >= path.length) {
      // Impact reached — animate explosion
      const impactPt = path[path.length - 1];
      animateExplosion(impactPt.x, impactPt.y, hitResult, view, callback);
      return;
    }

    fortAnimId = requestAnimationFrame(animLoop);
  }

  fortAnimId = requestAnimationFrame(animLoop);
}

function animateExplosion(x, y, hitResult, view, callback) {
  let frame = 0;
  const totalFrames = 20;
  const maxRadius = 40;

  function explodeLoop() {
    renderFortressScene(view);

    if (fortCtx) {
      const progress = frame / totalFrames;
      const radius = maxRadius * progress;
      const alpha = 1 - progress;

      // Outer glow
      const gradient = fortCtx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255, 200, 50, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(255, 100, 0, ${alpha * 0.8})`);
      gradient.addColorStop(1, `rgba(255, 0, 0, 0)`);
      fortCtx.fillStyle = gradient;
      fortCtx.beginPath();
      fortCtx.arc(x, y, radius, 0, Math.PI * 2);
      fortCtx.fill();

      // Draw damage numbers
      if (hitResult && hitResult.targets && frame > 5) {
        hitResult.targets.forEach((t, i) => {
          const p = view.players.find(pp => pp.id === t.id);
          if (!p) return;
          const dmgY = (view.terrain || fortState?.terrain || [])[Math.floor(p.x)] || 380;
          const offsetY = dmgY - FORT_TANK_H - 25 - (frame - 5) * 0.8;
          const dmgAlpha = Math.max(0, 1 - (frame - 5) / 15);
          fortCtx.fillStyle = t.direct ? `rgba(255, 50, 50, ${dmgAlpha})` : `rgba(255, 180, 50, ${dmgAlpha})`;
          fortCtx.font = 'bold 16px Oswald, sans-serif';
          fortCtx.textAlign = 'center';
          fortCtx.fillText('-' + t.damage, p.x, offsetY);
        });
      }
    }

    frame++;
    if (frame >= totalFrames) {
      fortAnimId = null;
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

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Sky gradient
  drawSky(ctx, w, h);

  // Terrain
  drawTerrain(ctx, terrain, w, h);

  // Wind indicator
  drawWind(ctx, view.wind, w);

  // Tanks
  drawTanks(ctx, view.players, view.turnIdx, terrain);

  // HP bars above tanks
  drawHPBars(ctx, view.players, terrain);

  // Names below tanks
  drawNames(ctx, view.players, terrain);
}

function drawSky(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  grad.addColorStop(0, '#1a3a6e');
  grad.addColorStop(1, '#87CEEB');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawTerrain(ctx, terrain, w, h) {
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) {
    ctx.lineTo(x, terrain[x]);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Darker edge
  ctx.strokeStyle = '#3a7c2f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    if (x === 0) ctx.moveTo(x, terrain[x]);
    else ctx.lineTo(x, terrain[x]);
  }
  ctx.stroke();
}

function drawWind(ctx, wind, w) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 13px Oswald, sans-serif';
  ctx.textAlign = 'center';
  const windText = wind > 0 ? `Wind ${wind} →` : wind < 0 ? `← ${Math.abs(wind)} Wind` : 'Wind 0';
  ctx.fillText(windText, w / 2, 20);
  ctx.restore();
}

function drawTanks(ctx, players, turnIdx, terrain) {
  players.forEach((p, i) => {
    if (!p.alive) return;
    drawTank(ctx, p, i === turnIdx, terrain);
  });
}

function drawTank(ctx, player, isCurrentTurn, terrain) {
  const x = player.x;
  const terrainY = terrain[Math.floor(x)] || 380;
  const bodyX = x - FORT_TANK_W / 2;
  const bodyY = terrainY - FORT_TANK_H;

  ctx.save();

  // Glow for current turn
  if (isCurrentTurn) {
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
  }

  // Tank body
  ctx.fillStyle = player.color;
  ctx.fillRect(bodyX, bodyY, FORT_TANK_W, FORT_TANK_H);

  // Outline
  ctx.strokeStyle = isCurrentTurn ? '#ffd700' : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = isCurrentTurn ? 2 : 1;
  ctx.strokeRect(bodyX, bodyY, FORT_TANK_W, FORT_TANK_H);

  ctx.shadowBlur = 0;

  // Turret (small circle on top)
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(x, bodyY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Barrel
  // Determine angle: use local angle for the "me" player, otherwise default
  let angle = 45;
  if (isCurrentTurn && player.id === state.myId) {
    angle = fortLocalAngle;
  } else if (isCurrentTurn && player.id.startsWith('ai-')) {
    // AI uses default angle (will be set when firing)
    angle = 45;
  }

  const rad = angle * Math.PI / 180;
  const barrelEndX = x + FORT_BARREL_LEN * Math.cos(rad);
  const barrelEndY = bodyY - FORT_BARREL_LEN * Math.sin(rad);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, bodyY);
  ctx.lineTo(barrelEndX, barrelEndY);
  ctx.stroke();

  // Wheels (decorative)
  ctx.fillStyle = '#333';
  for (let wx = bodyX + 5; wx < bodyX + FORT_TANK_W; wx += 10) {
    ctx.beginPath();
    ctx.arc(wx, terrainY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHPBars(ctx, players, terrain) {
  players.forEach(p => {
    if (!p.alive) return;
    const x = p.x;
    const terrainY = terrain[Math.floor(x)] || 380;
    const barW = 40;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = terrainY - FORT_TANK_H - 18;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);

    // Fill
    const ratio = p.hp / FORT_MAX_HP;
    let color = '#00e676';
    if (ratio <= 0.3) color = '#ff1744';
    else if (ratio <= 0.6) color = '#ffab00';
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW * ratio, barH);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barW, barH);
  });
}

function drawNames(ctx, players, terrain) {
  ctx.save();
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  players.forEach(p => {
    if (!p.alive) return;
    const x = p.x;
    const terrainY = terrain[Math.floor(x)] || 380;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(p.name, x, terrainY + 14);
  });
  ctx.restore();
}

// ===== UI RENDERING =====
function renderFortressView(view) {
  if (!view) return;
  window._fortView = view;

  // Init canvas if needed
  if (!fortCtx) initFortCanvas();

  const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
  const canAct = isMyTurn && view.phase === 'aiming';

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
  const controls = document.getElementById('fortControls');
  const fireBtn = document.getElementById('fortFireBtn');
  const angleSlider = document.getElementById('fortAngleSlider');
  const powerSlider = document.getElementById('fortPowerSlider');

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

  document.getElementById('fortAngleValue').textContent = fortLocalAngle;
  document.getElementById('fortPowerValue').textContent = fortLocalPower;

  // Render the scene
  renderFortressScene(view);

  // Game over check
  if (view.phase === 'gameover') {
    // Will be handled by fort-result message
  }
}

// ===== GAME OVER =====
function showFortressGameOver(msg) {
  if (!msg) return;

  const overlay = document.getElementById('fortGameOver');
  const title = document.getElementById('fortGameOverTitle');
  const rankings = document.getElementById('fortRankings');
  if (!overlay || !rankings) return;

  // Build ranking: winner first, then reverse death order
  const allPlayers = msg.players || [];
  const deathOrder = msg.deathOrder || [];
  const ranked = [];

  // Winner (alive player)
  const winner = allPlayers.find(p => p.alive);
  if (winner) ranked.push(winner);

  // Dead players in reverse death order (last to die = 2nd place)
  for (let i = deathOrder.length - 1; i >= 0; i--) {
    const p = allPlayers.find(pp => pp.id === deathOrder[i]);
    if (p && !p.alive) ranked.push(p);
  }

  // Any remaining unranked
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

  // Record game
  const myRank = ranked.findIndex(p => p.id === state.myId);
  const won = myRank === 0;
  const goldReward = goldRewards[myRank] || 0;
  recordGame(won, goldReward);
}

function closeFortressGame() {
  const overlay = document.getElementById('fortGameOver');
  if (overlay) overlay.style.display = 'none';
  if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
  fortState = null;
  window._fortView = null;
  fortCtx = null;
  fortCanvas = null;
  returnToLobby();
}

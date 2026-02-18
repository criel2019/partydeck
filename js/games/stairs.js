// ============================
// 무한의 계단 (Infinite Stairs)
// ============================

// ===== Constants =====
const ST_STAIR_W = 50;
const ST_STAIR_H = 14;
const ST_OFFSET_X = 48;
const ST_OFFSET_Y = 32;
const ST_VISIBLE_ABOVE = 12;
const ST_VISIBLE_BELOW = 4;
const ST_BASE_DRAIN = 3.0;
const ST_BASE_RECOVERY = 8;
const ST_MAX_STAIRS = 2000;
const ST_INPUT_COOLDOWN = 50; // ms

// ===== State =====
let stLocal = null;   // local game state (per-player)
let stMulti = null;   // multiplayer tracking (host)
let stAnimId = null;
let stLastTime = 0;
let stCanvas = null;
let stCtx = null;
let stCamX = 0;
let stCamY = 0;
let stInputLocked = false;
let _stKeyBound = false;
let stParticles = [];
let stStepFlash = 0;
let stMilestoneText = null;

// ===== Seeded RNG =====
function stRng(seed) {
  let s = seed;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ===== Generate stair directions =====
// dirs[i] = direction from stair i to stair i+1 (1=right, -1=left)
function stGenDirs(seed, count) {
  const rng = stRng(seed);
  const dirs = [];
  let dir = 1;
  let run = 0;

  for (let i = 0; i < count; i++) {
    dirs.push(dir);
    run++;

    // First 3 stairs always same direction
    if (i < 3) continue;

    let maxRun, minRun;
    if (i < 100) { maxRun = 6; minRun = 3; }
    else if (i < 300) { maxRun = 5; minRun = 2; }
    else if (i < 500) { maxRun = 4; minRun = 1; }
    else { maxRun = 3; minRun = 1; }

    if (run >= maxRun || (run >= minRun && rng() < 0.4)) {
      dir = -dir;
      run = 0;
    }
  }
  return dirs;
}

// ===== Compute stair positions =====
function stComputePositions(dirs) {
  const pos = [{ x: 0, y: 0 }];
  for (let i = 0; i < dirs.length; i++) {
    pos.push({
      x: pos[i].x + dirs[i] * ST_OFFSET_X,
      y: pos[i].y - ST_OFFSET_Y
    });
  }
  return pos;
}

// ===== Start game (host) =====
function startStairs() {
  if (!state.isHost) return;

  const seed = Math.floor(Math.random() * 2147483646) + 1;

  stMulti = {
    phase: 'playing',
    seed: seed,
    players: state.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      score: 0, step: 0, finished: false
    })),
  };

  broadcast({ type: 'game-start', game: 'stairs', state: stMulti });
  showScreen('stairsGame');
  stInitLocal(seed);
}

// ===== Init local game =====
function stInitLocal(seed) {
  const dirs = stGenDirs(seed, ST_MAX_STAIRS);
  const positions = stComputePositions(dirs);

  stLocal = {
    dirs: dirs,
    positions: positions,
    step: 0,
    facing: dirs[0],
    stamina: 100,
    score: 0,
    combo: 0,
    comboMul: 1,
    maxCombo: 0,
    lastInput: 0,
    alive: true,
    phase: 'countdown',  // countdown → playing → dead
    countdownStart: 0,
    deathReason: null,
    shakeAmount: 0,
    fallOffset: 0,
    deathTime: 0,
  };

  stParticles = [];
  stStepFlash = 0;
  stMilestoneText = null;

  stSetupCanvas();
  stSetupKeyboard();
  stStartCountdown();
  stUpdatePlayersBar();
}

// ===== Canvas setup =====
function stSetupCanvas() {
  stCanvas = document.getElementById('stCanvas');
  if (!stCanvas) return;

  const wrap = stCanvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  stCanvas.width = rect.width * dpr;
  stCanvas.height = rect.height * dpr;
  stCanvas.style.width = rect.width + 'px';
  stCanvas.style.height = rect.height + 'px';
  stCtx = stCanvas.getContext('2d');
  stCtx.scale(dpr, dpr);
  stCanvas._w = rect.width;
  stCanvas._h = rect.height;
}

// ===== Countdown =====
function stStartCountdown() {
  stLocal.phase = 'countdown';
  stLocal.countdownStart = performance.now();
  stLastTime = performance.now();
  stCamX = 0;
  stCamY = 0;

  // Hide controls during countdown
  document.getElementById('stControls').style.display = 'none';
  document.getElementById('stCountdownOverlay').style.display = 'flex';
  document.getElementById('stDeathOverlay').style.display = 'none';
  document.getElementById('stResultsOverlay').style.display = 'none';

  if (stAnimId) cancelAnimationFrame(stAnimId);
  stAnimId = requestAnimationFrame(stLoop);
}

// ===== Main game loop =====
function stLoop(ts) {
  if (!stLocal) return;

  const dt = Math.min((ts - stLastTime) / 1000, 0.1);
  stLastTime = ts;

  // ---- Countdown phase ----
  if (stLocal.phase === 'countdown') {
    const elapsed = (ts - stLocal.countdownStart) / 1000;
    const count = Math.ceil(3 - elapsed);

    if (elapsed >= 3.5) {
      // GO phase done, start playing
      stLocal.phase = 'playing';
      stLocal.lastInput = ts / 1000;
      document.getElementById('stCountdownOverlay').style.display = 'none';
      document.getElementById('stControls').style.display = 'flex';
    } else if (elapsed >= 3) {
      document.getElementById('stCountdownNum').textContent = 'GO!';
      document.getElementById('stCountdownNum').className = 'st-countdown-num go';
    } else {
      document.getElementById('stCountdownNum').textContent = count;
      document.getElementById('stCountdownNum').className = 'st-countdown-num';
    }
  }

  // ---- Playing phase ----
  if (stLocal.phase === 'playing') {
    const drainRate = ST_BASE_DRAIN + stLocal.step * 0.003;
    stLocal.stamina -= drainRate * dt;

    if (stLocal.stamina <= 0) {
      stLocal.stamina = 0;
      stLocal.alive = false;
      stLocal.phase = 'dead';
      stLocal.deathReason = 'timeout';
      stLocal.deathTime = ts;
      stOnDeath();
    }

    stUpdateHUD();

    // Trail particles for high combo
    if (stLocal.combo >= 5 && Math.random() < 0.4) {
      const cp = stLocal.positions[stLocal.step];
      if (cp) {
        const trailColor = stLocal.comboMul >= 3 ? '#fd7272' : stLocal.comboMul >= 2 ? '#ffeaa7' : '#a29bfe';
        stParticles.push({
          x: cp.x + (Math.random() - 0.5) * 16,
          y: cp.y - 30 + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 20,
          vy: -10 - Math.random() * 20,
          life: 0.3 + Math.random() * 0.2,
          maxLife: 0.3 + Math.random() * 0.2,
          size: 1.5 + Math.random() * 1.5,
          color: trailColor
        });
      }
    }
  }

  // ---- Dead phase (brief animation) ----
  if (stLocal.phase === 'dead') {
    const deadElapsed = (ts - stLocal.deathTime) / 1000;
    if (stLocal.deathReason === 'fall') {
      stLocal.fallOffset = deadElapsed * deadElapsed * 600;
    }
    // Shake decay
    if (stLocal.shakeAmount > 0) {
      stLocal.shakeAmount *= Math.pow(0.05, dt);
      if (stLocal.shakeAmount < 0.5) stLocal.shakeAmount = 0;
    }
  }

  // ---- Update particles ----
  stUpdateParticles(dt);
  if (stStepFlash > 0) { stStepFlash -= dt * 1000; if (stStepFlash < 0) stStepFlash = 0; }

  // ---- Camera lerp ----
  if (stLocal.step < stLocal.positions.length) {
    const target = stLocal.positions[stLocal.step];
    stCamX += (target.x - stCamX) * 8 * dt;
    stCamY += (target.y - stCamY) * 8 * dt;
  }

  // Render
  stRender();

  // Continue loop (even during dead for brief animation)
  if (stLocal.phase !== 'dead' || (ts - stLocal.deathTime) < 1000) {
    stAnimId = requestAnimationFrame(stLoop);
  }
}

// ===== Input =====
function stTapLeft() { stDoInput(-1); }
function stTapRight() { stDoInput(1); }

function stDoInput(dir) {
  if (!stLocal || stLocal.phase !== 'playing' || !stLocal.alive) return;
  if (stInputLocked) return;
  stInputLocked = true;
  setTimeout(() => { stInputLocked = false; }, ST_INPUT_COOLDOWN);

  stLocal.facing = dir;

  const nextDir = stLocal.dirs[stLocal.step];

  if (stLocal.facing === nextDir) {
    // SUCCESS
    stLocal.step++;

    // Combo
    const now = performance.now() / 1000;
    const interval = now - stLocal.lastInput;
    stLocal.lastInput = now;

    if (interval <= 0.5) {
      stLocal.combo++;
      if (stLocal.combo >= 20 && interval <= 0.3) stLocal.comboMul = 3;
      else if (stLocal.combo >= 10 && interval <= 0.4) stLocal.comboMul = 2;
      else if (stLocal.combo >= 3) stLocal.comboMul = 1.5;
      else stLocal.comboMul = 1;
    } else {
      stLocal.combo = 0;
      stLocal.comboMul = 1;
    }
    if (stLocal.combo > stLocal.maxCombo) stLocal.maxCombo = stLocal.combo;

    // Apply combo multiplier to score
    stLocal.score += Math.floor(stLocal.comboMul);

    // Stamina recovery
    const recovery = Math.max(1, ST_BASE_RECOVERY - stLocal.step * 0.008);
    stLocal.stamina = Math.min(100, stLocal.stamina + recovery);

    // Particles: step landing sparks
    const stepPos = stLocal.positions[stLocal.step];
    if (stepPos) {
      stSpawnStepParticles(stepPos.x, stepPos.y, stLocal.combo);
      stStepFlash = 80; // ms
    }

    // Milestone bonus
    if (stLocal.step > 0 && stLocal.step % 100 === 0) {
      stLocal.score += 50;
      if (stepPos) stSpawnMilestoneBurst(stepPos.x, stepPos.y);
      stShowMilestoneText(stLocal.step + '층 돌파!');
    } else if (stLocal.step > 0 && stLocal.step % 50 === 0) {
      if (stepPos) stSpawnMilestoneBurst(stepPos.x, stepPos.y);
      stShowMilestoneText(stLocal.step + '층!');
    }

    // Coin bonus every 10 steps
    if (stLocal.step > 0 && stLocal.step % 10 === 0) {
      stLocal.score += 10;
      if (stepPos) stSpawnCoinParticles(stepPos.x, stepPos.y);
    }

  } else {
    // FALL
    stLocal.alive = false;
    stLocal.phase = 'dead';
    stLocal.deathReason = 'fall';
    stLocal.deathTime = performance.now();
    stLocal.shakeAmount = 15;
    if (navigator.vibrate) navigator.vibrate(100);
    stOnDeath();
  }
}

// ===== Death handler =====
function stOnDeath() {
  document.getElementById('stControls').style.display = 'none';

  // Save best score
  stSaveBest(stLocal.score, stLocal.step);

  // Show death overlay after brief delay
  const delay = stLocal.deathReason === 'fall' ? 900 : 600;
  setTimeout(() => {
    if (!stLocal) return;
    const overlay = document.getElementById('stDeathOverlay');
    overlay.style.display = 'flex';

    document.getElementById('stDeathScore').textContent = stLocal.score;
    document.getElementById('stDeathStep').textContent = stLocal.step + '층';
    document.getElementById('stDeathCombo').textContent = 'x' + stLocal.maxCombo;
    document.getElementById('stDeathReason').textContent =
      stLocal.deathReason === 'fall' ? '추락!' : '스태미나 소진!';

    const best = stGetBest();
    document.getElementById('stDeathBest').textContent = best.score;

    // If in multiplayer, show waiting message; in solo show close button
    const waitEl = document.getElementById('stDeathWaiting');
    if (stMulti && stMulti.players.length > 1 && !stMulti.players.every(p => p.finished)) {
      waitEl.style.display = 'block';
      waitEl.textContent = '다른 플레이어를 기다리는 중...';
    } else if (!stMulti || stMulti.players.length <= 1) {
      waitEl.style.display = 'block';
      waitEl.innerHTML = '<button class="btn btn-primary st-results-btn" onclick="closeStairsGame()" style="margin-top:12px;">대기실로</button>';
    } else {
      waitEl.style.display = 'none';
    }
  }, delay);

  // Report to host
  const msg = {
    type: 'stairs-dead',
    playerId: state.myId,
    score: stLocal.score,
    step: stLocal.step,
  };

  if (state.isHost) {
    processStairsDead(msg);
  } else {
    sendToHost(msg);
  }
}

// ===== Host: process death report =====
function processStairsDead(msg) {
  if (!stMulti) return;

  const p = stMulti.players.find(pl => pl.id === msg.playerId);
  if (!p || p.finished) return;

  p.score = msg.score;
  p.step = msg.step;
  p.finished = true;

  // Update players bar for all
  broadcast({ type: 'stairs-update', players: stMulti.players });
  stUpdatePlayersBar();

  // Check if all done
  if (stMulti.players.every(pl => pl.finished)) {
    setTimeout(() => stShowRankings(), 1500);
  }
}

// ===== Rankings =====
function stShowRankings() {
  if (!stMulti) return;
  stMulti.phase = 'results';

  const rankings = [...stMulti.players].sort((a, b) => b.score - a.score);

  // Record game result
  const myRank = rankings.findIndex(p => p.id === state.myId);
  const won = myRank === 0;
  recordGame(won, won ? 30 : 10);

  broadcast({ type: 'stairs-rankings', rankings });
  stRenderRankings(rankings);
}

function stRenderRankings(rankings) {
  document.getElementById('stDeathOverlay').style.display = 'none';
  const overlay = document.getElementById('stResultsOverlay');
  overlay.style.display = 'flex';

  const list = document.getElementById('stResultsList');
  list.innerHTML = rankings.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
    const isMe = p.id === state.myId;
    const playerIdx = state.players.findIndex(pl => pl.id === p.id);
    return `<div class="st-rank-item ${isMe ? 'st-rank-me' : ''}">
      <span class="st-rank-pos">${medal}</span>
      <span class="st-rank-avatar">${escapeHTML(p.avatar)}</span>
      <span class="st-rank-name">${escapeHTML(p.name)}</span>
      <span class="st-rank-score">${p.score}점 (${p.step}층)</span>
    </div>`;
  }).join('');
}

// ===== Close game =====
function closeStairsGame() {
  stCleanup();
  if (typeof practiceMode !== 'undefined' && practiceMode) {
    showScreen('practiceSelect');
  } else {
    returnToLobby();
  }
}

function stCleanup() {
  if (stAnimId) { cancelAnimationFrame(stAnimId); stAnimId = null; }
  stRemoveKeyboard();
  stLocal = null;
  stMulti = null;
  stCanvas = null;
  stCtx = null;
  stInputLocked = false;
  stParticles = [];
  stStepFlash = 0;
  stMilestoneText = null;
}

// ===== HUD Update =====
function stUpdateHUD() {
  if (!stLocal) return;

  document.getElementById('stScore').textContent = stLocal.score;
  document.getElementById('stStep').textContent = stLocal.step + '층';

  const stamina = Math.max(0, stLocal.stamina);
  const fill = document.getElementById('stStaminaFill');
  fill.style.width = stamina + '%';

  fill.className = 'st-stamina-fill';
  if (stamina <= 30) fill.classList.add('danger');
  else if (stamina <= 70) fill.classList.add('warn');

  document.getElementById('stStaminaText').textContent = Math.ceil(stamina) + '%';

  // Combo display
  const comboEl = document.getElementById('stCombo');
  if (stLocal.combo >= 3) {
    comboEl.style.display = 'block';
    let fires = '🔥';
    if (stLocal.comboMul >= 3) fires = '🔥🔥🔥';
    else if (stLocal.comboMul >= 2) fires = '🔥🔥';
    comboEl.textContent = fires + ' x' + stLocal.comboMul.toFixed(1);
  } else {
    comboEl.style.display = 'none';
  }

  // Vignette
  const vignette = document.getElementById('stVignette');
  if (stamina <= 30) {
    vignette.style.opacity = (1 - stamina / 30) * 0.6;
  } else {
    vignette.style.opacity = 0;
  }
}

// ===== Players bar =====
function stUpdatePlayersBar() {
  const bar = document.getElementById('stPlayersBar');
  if (!bar || !stMulti) { if (bar) bar.innerHTML = ''; return; }

  bar.innerHTML = stMulti.players.map(p => {
    const isMe = p.id === state.myId;
    const alive = !p.finished;
    return `<div class="st-player-pip ${alive ? 'alive' : 'dead'} ${isMe ? 'me' : ''}">${escapeHTML(p.avatar)}</div>`;
  }).join('');
}

// ===== Canvas Render =====
function stRender() {
  if (!stCtx || !stCanvas || !stLocal) return;

  const W = stCanvas._w;
  const H = stCanvas._h;
  const ctx = stCtx;

  ctx.clearRect(0, 0, W, H);

  // Background gradient based on step
  const step = stLocal.step;
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);

  if (step < 100) {
    bgGrad.addColorStop(0, '#1a0a2e');
    bgGrad.addColorStop(1, '#0d1b2a');
  } else if (step < 200) {
    bgGrad.addColorStop(0, '#2d1b00');
    bgGrad.addColorStop(1, '#1a0a05');
  } else if (step < 300) {
    bgGrad.addColorStop(0, '#0a1628');
    bgGrad.addColorStop(1, '#1a2a3e');
  } else if (step < 500) {
    bgGrad.addColorStop(0, '#0a0a2e');
    bgGrad.addColorStop(1, '#1a002e');
  } else if (step < 700) {
    bgGrad.addColorStop(0, '#2a0a0a');
    bgGrad.addColorStop(1, '#1a0000');
  } else {
    bgGrad.addColorStop(0, '#2a2000');
    bgGrad.addColorStop(1, '#1a1500');
  }

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Stars for early levels
  if (step < 300) {
    const starAlpha = step < 100 ? 0.4 : (0.4 * (1 - (step - 100) / 200));
    ctx.fillStyle = `rgba(255,255,255,${starAlpha})`;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137.5 + stCamY * 0.03) % W + W) % W;
      const sy = ((i * 89.3 + stCamY * 0.015 + i * 31.7) % H + H) % H;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Camera offset with shake
  let shakeX = 0, shakeY = 0;
  if (stLocal.shakeAmount > 0) {
    shakeX = (Math.random() - 0.5) * stLocal.shakeAmount * 2;
    shakeY = (Math.random() - 0.5) * stLocal.shakeAmount * 2;
  }

  const camOffX = W / 2 - stCamX + shakeX;
  const camOffY = H * 0.55 - stCamY + shakeY;

  // Draw visible stairs
  const startIdx = Math.max(0, stLocal.step - ST_VISIBLE_BELOW);
  const endIdx = Math.min(stLocal.positions.length - 1, stLocal.step + ST_VISIBLE_ABOVE);

  for (let i = startIdx; i <= endIdx; i++) {
    const pos = stLocal.positions[i];
    const sx = pos.x + camOffX;
    const sy = pos.y + camOffY;

    const isCurrent = (i === stLocal.step);
    const isPast = (i < stLocal.step);
    const hw = ST_STAIR_W / 2;
    const hh = ST_STAIR_H / 2;

    // Stair body
    if (isCurrent) {
      ctx.shadowColor = 'rgba(108,92,231,0.6)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#6c5ce7';
    } else if (isPast) {
      ctx.fillStyle = '#252040';
    } else {
      ctx.fillStyle = '#3d3475';
    }

    ctx.fillRect(sx - hw, sy - hh, ST_STAIR_W, ST_STAIR_H);
    ctx.shadowBlur = 0;

    // Stair top highlight
    ctx.fillStyle = isCurrent ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(sx - hw, sy - hh, ST_STAIR_W, 3);

    // Stair border
    ctx.strokeStyle = isCurrent ? 'rgba(162,155,254,0.5)' : 'rgba(108,92,231,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - hw, sy - hh, ST_STAIR_W, ST_STAIR_H);

    // Coin indicator every 10 steps (ahead only)
    if (i > stLocal.step && i > 0 && i % 10 === 0) {
      ctx.beginPath();
      ctx.arc(sx, sy - 20, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffeaa7';
      ctx.fill();
      ctx.strokeStyle = '#d4a520';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#8a7020';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', sx, sy - 20);
    }
  }

  // Draw character
  if (stLocal.step < stLocal.positions.length) {
    const cp = stLocal.positions[stLocal.step];
    let cx = cp.x + camOffX;
    let cy = cp.y + camOffY;

    // Apply fall offset if dead from fall
    if (stLocal.phase === 'dead' && stLocal.deathReason === 'fall') {
      cy += stLocal.fallOffset;
    }

    const faceRight = stLocal.facing === 1;
    const fDir = faceRight ? 1 : -1;

    // Shadow under character
    if (stLocal.phase !== 'dead' || stLocal.deathReason !== 'fall' || stLocal.fallOffset < 50) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, cp.y + camOffY - 2, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legs
    ctx.fillStyle = '#2d2d44';
    ctx.fillRect(cx - 5, cy - 22, 4, 8);
    ctx.fillRect(cx + 1, cy - 22, 4, 8);

    // Body
    ctx.fillStyle = '#6c5ce7';
    ctx.fillRect(cx - 7, cy - 34, 14, 14);

    // Head
    ctx.fillStyle = '#ffe0c2';
    ctx.beginPath();
    ctx.arc(cx, cy - 42, 7, 0, Math.PI * 2);
    ctx.fill();

    // Hair/Hat
    ctx.fillStyle = '#2d2d44';
    ctx.beginPath();
    ctx.ellipse(cx + fDir * 1, cy - 47, 9, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 8, cy - 48, 16, 3);

    // Eye (direction indicator)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx + fDir * 3, cy - 43, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect when combo active
    if (stLocal.combo >= 3 && stLocal.phase === 'playing') {
      const glowAlpha = 0.2 + Math.sin(performance.now() / 200) * 0.1;
      ctx.shadowColor = stLocal.comboMul >= 3 ? 'rgba(253,114,114,0.8)' :
                         stLocal.comboMul >= 2 ? 'rgba(255,234,167,0.8)' :
                         'rgba(108,92,231,0.8)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = `rgba(255,255,255,${glowAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // Draw particles (world-space)
  stDrawParticles(ctx, camOffX, camOffY);

  // Step flash
  stDrawStepFlash(ctx, W, H);

  // Milestone text
  stDrawMilestoneText(ctx, W, H);

  // Direction arrows on upcoming stairs (helpful hint)
  if (stLocal.phase === 'playing' || stLocal.phase === 'countdown') {
    const nextIdx = stLocal.step;
    if (nextIdx < stLocal.dirs.length && nextIdx < stLocal.positions.length) {
      const nextPos = stLocal.positions[nextIdx + 1];
      if (nextPos) {
        const nx = nextPos.x + camOffX;
        const ny = nextPos.y + camOffY;
        const dir = stLocal.dirs[nextIdx];

        // Small arrow showing direction
        ctx.fillStyle = 'rgba(162,155,254,0.4)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dir === 1 ? '>' : '<', nx, ny - 18);
      }
    }
  }
}

// ===== Keyboard support =====
function stSetupKeyboard() {
  if (_stKeyBound) return;
  _stKeyBound = true;
  document.addEventListener('keydown', stKeyHandler);
}

function stKeyHandler(e) {
  if (!stLocal || stLocal.phase !== 'playing') return;

  if (e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    stTapLeft();  // 왼쪽 방향
  } else if (e.key === 'ArrowRight' || e.key === 'z' || e.key === 'Z') {
    e.preventDefault();
    stTapRight(); // 오른쪽 방향
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    // 위쪽 키: 현재 방향 유지하고 올라가기
    stDoInput(stLocal ? stLocal.facing : 1);
  }
}

function stRemoveKeyboard() {
  if (_stKeyBound) {
    document.removeEventListener('keydown', stKeyHandler);
    _stKeyBound = false;
  }
}

// ===== Best score persistence =====
function stGetBest() {
  try {
    const raw = localStorage.getItem('pd_stairs_best');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { score: 0, step: 0 };
}

function stSaveBest(score, step) {
  const best = stGetBest();
  if (score > best.score) {
    localStorage.setItem('pd_stairs_best', JSON.stringify({ score, step }));
  }
}

// ===== Render initial view for non-host receiving game start =====
function renderStairsView(st) {
  if (!st) return;
  stMulti = st;
  stInitLocal(st.seed);
}

// ===== Particle System =====
function stSpawnStepParticles(worldX, worldY, combo) {
  const count = Math.min(20, 6 + combo * 2);
  const colors = ['#a29bfe', '#6c5ce7', '#dfe6e9', '#ffeaa7'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 60;
    stParticles.push({
      x: worldX + (Math.random() - 0.5) * 30,
      y: worldY - 5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.3 + Math.random() * 0.3,
      size: 1.5 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function stSpawnCoinParticles(worldX, worldY) {
  const colors = ['#ffeaa7', '#fdcb6e', '#f9ca24', '#fff'];
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 50;
    stParticles.push({
      x: worldX,
      y: worldY - 15,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function stSpawnMilestoneBurst(worldX, worldY) {
  const colors = ['#fd79a8', '#e17055', '#00cec9', '#fdcb6e', '#6c5ce7', '#fff'];
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 / 30) * i + Math.random() * 0.3;
    const speed = 50 + Math.random() * 100;
    stParticles.push({
      x: worldX,
      y: worldY - 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  if (stParticles.length > 150) stParticles.splice(0, stParticles.length - 150);
}

function stShowMilestoneText(text) {
  stMilestoneText = { text: text, time: 0, duration: 1.5 };
}

function stUpdateParticles(dt) {
  for (let i = stParticles.length - 1; i >= 0; i--) {
    const p = stParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 100 * dt; // gravity
    p.vx *= 0.97;
    p.life -= dt;
    if (p.life <= 0) {
      stParticles.splice(i, 1);
    }
  }
  // Milestone text timer
  if (stMilestoneText) {
    stMilestoneText.time += dt;
    if (stMilestoneText.time >= stMilestoneText.duration) {
      stMilestoneText = null;
    }
  }
}

function stDrawParticles(ctx, camOffX, camOffY) {
  for (const p of stParticles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + camOffX, p.y + camOffY, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function stDrawStepFlash(ctx, W, H) {
  if (stStepFlash <= 0) return;
  const alpha = (stStepFlash / 80) * 0.15;
  ctx.fillStyle = `rgba(108,92,231,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function stDrawMilestoneText(ctx, W, H) {
  if (!stMilestoneText) return;
  const t = stMilestoneText.time;
  const dur = stMilestoneText.duration;
  const progress = t / dur;

  let scale, alpha;
  if (progress < 0.15) {
    // Zoom in
    scale = 0.3 + (progress / 0.15) * 0.9;
    alpha = progress / 0.15;
  } else if (progress < 0.7) {
    scale = 1.2 - (progress - 0.15) * 0.36;
    alpha = 1;
  } else {
    // Fade out + zoom out
    const fadeP = (progress - 0.7) / 0.3;
    scale = 0.84 - fadeP * 0.2;
    alpha = 1 - fadeP;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.floor(28 * scale)}px 'Black Han Sans', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd93d';
  ctx.shadowColor = 'rgba(255,217,61,0.5)';
  ctx.shadowBlur = 15;
  ctx.fillText(stMilestoneText.text, W / 2, H * 0.3);
  ctx.shadowBlur = 0;
  ctx.restore();
}

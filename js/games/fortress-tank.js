// ===== FORTRESS — Tank & Character Rendering =====
// Separated from fortress.js for modularity

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

// ===== SCENE RENDERING =====
function renderFortressScene(view) {
  if (!fortCtx || !view) return;
  FortPerf.begin('renderScene');
  const ctx = fortCtx;
  const w = FORT_CANVAS_W;
  const h = FORT_CANVAS_H;
  const terrain = view.terrain || (fortState ? fortState.terrain : new Array(w).fill(380));

  // Reset to DPR base transform before clearRect to avoid ghost strips from any caller-applied translate
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Update wind particles each frame
  FortPerf.begin('windUpdate');
  updateWindParticles(view.wind || 0);
  FortPerf.end('windUpdate');

  // All world-space drawing under camera transform
  ctx.save();
  applyCameraTransform(ctx);

  FortPerf.begin('drawSky');
  drawSky(ctx, w, h);
  FortPerf.end('drawSky');

  FortPerf.begin('drawPlatforms');
  drawSkyPlatforms(ctx);
  FortPerf.end('drawPlatforms');

  FortPerf.begin('birds');
  updateFortBirds();
  drawFortBirds(ctx);
  FortPerf.end('birds');

  FortPerf.begin('feathers');
  updateFallingFeathers();
  drawFallingFeathers(ctx);
  FortPerf.end('feathers');

  FortPerf.begin('drawTerrain');
  drawTerrain(ctx, terrain, w, h);
  FortPerf.end('drawTerrain');

  FortPerf.begin('windDraw');
  drawWindParticles(ctx, view.wind || 0);
  FortPerf.end('windDraw');

  FortPerf.begin('drawTanks');
  drawTanks(ctx, view.players, view.turnIdx, terrain);
  FortPerf.end('drawTanks');

  FortPerf.begin('drawHPBars');
  drawHPBars(ctx, view.players, terrain);
  FortPerf.end('drawHPBars');

  FortPerf.begin('drawNames');
  drawNames(ctx, view.players, terrain);
  FortPerf.end('drawNames');

  ctx.restore();
  FortPerf.end('renderScene');
}

// ===== TANK DRAWING =====
// Frame-level timestamp: set once per drawTanks, used by all drawTank/drawDeadTank calls
let _fortFrameNow = 0;

function drawTanks(ctx, players, turnIdx, terrain) {
  _fortFrameNow = Date.now(); // single Date.now() per frame
  // Dead tanks first (behind), then alive tanks on top — single pass each
  for (let i = 0; i < players.length; i++) {
    if (!players[i].alive) drawDeadTank(ctx, players[i], terrain);
  }
  for (let i = 0; i < players.length; i++) {
    if (players[i].alive) drawTank(ctx, players[i], i === turnIdx, terrain);
  }
}

function drawDeadTank(ctx, player, terrain) {
  const x = player.x;
  const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
  const terrainY = terrain[tx] || 380;

  const txL = Math.max(0, tx - 8);
  const txR = Math.min(terrain.length - 1, tx + 8);

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
    // Avoid ctx.filter (forces GPU recomposite). Darken via overlay rect instead.
    ctx.drawImage(tamaImg, centerX - dw * 0.5, centerY - dh * 0.58, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(centerX - R, centerY - R, R * 2, R * 2);
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
  const t = _fortFrameNow * 0.001;
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

function _drawFortChargeAura(ctx, cx, cy, R, ratio, tribe, now) {
  ctx.save();
  const outerR = R + 10 + ratio * 20;

  if (tribe === 'fire') {
    // Inner glow ring — single gradient (cheap)
    const ringGrad = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, outerR);
    ringGrad.addColorStop(0, 'rgba(255,80,0,0)');
    ringGrad.addColorStop(0.5, `rgba(255,140,0,${0.18 + ratio * 0.32})`);
    ringGrad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad; ctx.fill();
    // Orbiting fire particles — solid fills (no per-particle gradient)
    for (let i = 0; i < 6; i++) {
      const a = (now * 0.008 + i * Math.PI * 2 / 6) % (Math.PI * 2);
      const orbitR = outerR * (0.82 + 0.18 * Math.sin(now * 0.015 + i));
      const px = cx + Math.cos(a) * orbitR;
      const py = cy + Math.sin(a) * orbitR * 0.65;
      const sz = (3 + ratio * 5) * (0.7 + 0.3 * Math.sin(now * 0.022 + i));
      // Outer soft halo
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(255,100,0,1)';
      ctx.beginPath(); ctx.arc(px, py, sz * 1.4, 0, Math.PI * 2); ctx.fill();
      // Inner bright core
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255,240,100,1)';
      ctx.beginPath(); ctx.arc(px, py, sz * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
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
      ctx.stroke();
      // Second thicker pass for glow effect (replaces expensive shadowBlur)
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 3 + ratio * 3;
      ctx.strokeStyle = 'rgba(120,200,255,0.5)';
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    // Orbiting orbs — solid fills (no per-particle gradient)
    for (let i = 0; i < 4; i++) {
      const a = (now * 0.005 * (1 + i * 0.18) + i * Math.PI * 2 / 4);
      const orbitR = outerR * (0.88 + 0.12 * Math.sin(now * 0.011 + i * 2));
      const px = cx + Math.cos(a) * orbitR;
      const py = cy + Math.sin(a) * orbitR * 0.65;
      const sz = 3 + ratio * 4;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgba(140,80,240,1)';
      ctx.beginPath(); ctx.arc(px, py, sz * 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(220,170,255,1)';
      ctx.beginPath(); ctx.arc(px, py, sz * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
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
  const now = _fortFrameNow;
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

  // Current turn glow — manual radial gradient instead of expensive shadowBlur
  if (isCurrentTurn) {
    const glowR = R + 18;
    const glowGrad = ctx.createRadialGradient(centerX, visY, R + 2, centerX, visY, glowR);
    glowGrad.addColorStop(0, pInfo.glowColor);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(centerX, visY, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad; ctx.fill();
  }

  // Circular border (player color ring)
  ctx.beginPath();
  ctx.arc(centerX, visY, R + 3, 0, Math.PI * 2);
  ctx.fillStyle = player.color;
  ctx.fill();

  // Draw character image via roundRect clip (cheaper than arc clip on mobile)
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
  const isLocalPlayer = player.id === (state && state.myId);
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
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive) continue;
    const x = p.x;
    const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
    const terrainY = terrain[tx] || 380;
    const barW = 40;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = terrainY - (FORT_TAMA_RADIUS * 2 + 5) - 20;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);
    ctx.fill();

    const ratio = p.hp / FORT_MAX_HP;
    ctx.fillStyle = ratio > 0.6 ? '#4caf50' : ratio > 0.3 ? '#ff9800' : '#f44336';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barW * ratio, barH / 2);
  }
}

// Per-player name bitmap cache  { canvas, w, h }
const _fortNameBitmapCache = {};

function _buildNameBitmap(name) {
  const font = 'bold 10px sans-serif';
  // Measure on a scratch canvas
  const scratch = document.createElement('canvas');
  const sc = scratch.getContext('2d');
  sc.font = font;
  const tw = sc.measureText(name).width;
  const PAD = 3;
  const W = Math.ceil(tw + PAD * 2 + 4);  // +4 for stroke overhang
  const H = 16;
  scratch.width = W; scratch.height = H;
  sc.font = font;
  sc.textAlign = 'center';
  sc.textBaseline = 'top';
  sc.strokeStyle = 'rgba(0,0,0,0.6)';
  sc.lineWidth = 2;
  sc.strokeText(name, W / 2, 2);
  sc.fillStyle = 'rgba(255,255,255,0.9)';
  sc.fillText(name, W / 2, 2);
  return { canvas: scratch, w: W, h: H };
}

function drawNames(ctx, players, terrain) {
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive) continue;
    if (!_fortNameBitmapCache[p.id] || _fortNameBitmapCache[p.id].name !== p.name) {
      _fortNameBitmapCache[p.id] = { ..._buildNameBitmap(p.name), name: p.name };
    }
    const bmp = _fortNameBitmapCache[p.id];
    const x = p.x;
    const tx = Math.floor(Math.max(0, Math.min(x, FORT_CANVAS_W - 1)));
    const terrainY = terrain[tx] || 380;
    ctx.drawImage(bmp.canvas, Math.round(x - bmp.w / 2), Math.round(terrainY + 6));
  }
}

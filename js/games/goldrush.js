// =============================================
// GOLD RUSH (골드러시) - Timing Coin Drop Game
// Oscillating pendulum, timing-based stacking
// Solo / 1v1 / 2v2 modes
// =============================================

// ===== CONSTANTS =====
var GR_COIN_R = 0.44;
var GR_COIN_H = 0.07;
var GR_BASE_STABILITY = 0.85;
var GR_MIN_STABILITY_THRESHOLD = 0.08;
var GR_MAX_X = 1.2;
var GR_TURN_TIME_BASE = 15000;
var GR_TURN_TIME_MIN = 4000;
var GR_TURN_TIME_DECAY = 300;

var GR_WIND_BASE = 0.04;
var GR_WIND_PER_COIN = 0.014;
var GR_WIND_DRIFT = 0.3;
var GR_JITTER_BASE = 0.01;
var GR_JITTER_PER_COIN = 0.006;

var GR_SCORE_BASE = 10;
var GR_SCORE_CENTER_BONUS = 20;
var GR_SCORE_EDGE_BONUS = 10;
var GR_CENTER_THRESHOLD = 0.15;
var GR_EDGE_THRESHOLD = 0.6;

var GR_OSC_BASE_SPEED = 2.2;
var GR_OSC_SPEED_INC = 0.18;
var GR_OSC_MAX_SPEED = 10.0;
var GR_EVENT_INTERVAL = 5;

var GR_EMOJIS = ['😂','🤣','😱','💀','🔥','👏','😈','🤡','💩','🙏','😭','🫣'];

// ===== STATE =====
var grState = null;
var _grCanvas = null;
var _grCtx = null;
var _grRafId = null;
var _grTimers = [];
var _grTurnTimer = null;
var _grMyTurn = false;
var _grDropping = false;
var _grIntroPlayed = false;
var _grEmojiCooldown = false;
var _grEventActive = null;
var _grOscTime = 0;
var _grLastTime = 0;
var _grDropAnim = null;
var _grCollapseCoins = null;
var _grParticles = [];
var _grScorePopups = [];
var _grShake = 0;
var _grCameraY = 0;
var _grCameraTargetY = 0;
var _grIntroPhase = 0;
var _grIntroTime = 0;

// ===== SEEDED PRNG =====
var _grSeed = 0;
function grRand() {
  _grSeed = (_grSeed * 1103515245 + 12345) & 0x7fffffff;
  return _grSeed / 0x7fffffff;
}

// ===== STABILITY CHECK =====
function _grGetMaxOffset(level) {
  var penalty = Math.pow(level, 1.5) * 0.004;
  return GR_COIN_R * Math.max(GR_MIN_STABILITY_THRESHOLD, GR_BASE_STABILITY - penalty);
}

function grCheckStability(coins) {
  if (coins.length <= 1) return { stable: true, stability: 1.0, collapseLevel: -1, direction: 0 };
  var worstRatio = 0;
  var collapseLevel = -1;
  var collapseDir = 0;
  for (var i = 0; i < coins.length; i++) {
    var cmX = 0;
    var count = coins.length - i;
    for (var j = i; j < coins.length; j++) cmX += coins[j].x;
    cmX /= count;
    var supportX = (i === 0) ? 0 : coins[i - 1].x;
    var offset = Math.abs(cmX - supportX);
    var maxOffset = _grGetMaxOffset(i);
    var ratio = offset / maxOffset;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      if (ratio >= 1.0) {
        collapseLevel = i;
        collapseDir = cmX > supportX ? 1 : -1;
      }
    }
  }
  if (collapseLevel >= 0) return { stable: false, stability: 0, collapseLevel: collapseLevel, direction: collapseDir };
  return { stable: true, stability: 1 - worstRatio, collapseLevel: -1, direction: 0 };
}

// ===== WIND =====
function _grUpdateWind() {
  grState.wind += (grRand() - 0.5) * GR_WIND_DRIFT;
  if (grRand() < 0.15) grState.wind *= -1;
  grState.wind = Math.max(-1, Math.min(1, grState.wind));
  grState.windForce = grState.wind * (GR_WIND_BASE + grState.coins.length * GR_WIND_PER_COIN);
}

// ===== EVENTS =====
var GR_EVENTS = [
  { id: 'speed', name: '가속!', emoji: '⚡', desc: '진자가 빨라집니다!' },
  { id: 'reverse', name: '역회전!', emoji: '🔄', desc: '진자가 방향을 바꿉니다!' },
  { id: 'golden', name: '황금코인!', emoji: '✨', desc: '3배 점수!' },
  { id: 'narrow', name: '좁은 영역!', emoji: '📏', desc: '진자 범위가 줄어듭니다!' },
  { id: 'gust', name: '돌풍!', emoji: '🌪️', desc: '바람이 거세집니다!' },
];

function _grRollEvent() {
  return GR_EVENTS[Math.floor(grRand() * GR_EVENTS.length)];
}

function _grGetScoreMultiplier() {
  var mult = 1;
  if (grState.streak >= 8) mult = 3.0;
  else if (grState.streak >= 5) mult = 2.0;
  else if (grState.streak >= 3) mult = 1.5;
  if (_grEventActive && _grEventActive.id === 'golden') mult *= 3;
  return mult;
}

function _grGetStreakLabel() {
  if (grState.streak >= 8) return 'MASTER!';
  if (grState.streak >= 5) return 'ON FIRE!';
  if (grState.streak >= 3) return 'STREAK!';
  return '';
}

// ===== OSCILLATION =====
function _grGetOscSpeed() {
  var coinCount = grState ? grState.coins.length : 0;
  var speed = Math.min(GR_OSC_MAX_SPEED, GR_OSC_BASE_SPEED + coinCount * GR_OSC_SPEED_INC);
  if (_grEventActive && _grEventActive.id === 'speed') speed *= 1.8;
  return speed;
}

function _grGetOscX() {
  var speed = _grGetOscSpeed();
  var amplitude = GR_MAX_X;
  if (_grEventActive && _grEventActive.id === 'narrow') amplitude *= 0.5;
  return Math.sin(_grOscTime * speed) * amplitude;
}

// ===== CANVAS SETUP =====
function _grInitCanvas() {
  _grCanvas = document.getElementById('grCanvas');
  if (!_grCanvas) return;
  _grResizeCanvas();
  window.addEventListener('resize', _grResizeCanvas);
}

function _grResizeCanvas() {
  if (!_grCanvas) return;
  var container = _grCanvas.parentElement;
  var w = container.clientWidth || 360;
  var h = container.clientHeight || 640;
  var dpr = Math.min(window.devicePixelRatio, 2);
  _grCanvas.width = w * dpr;
  _grCanvas.height = h * dpr;
  _grCanvas.style.width = w + 'px';
  _grCanvas.style.height = h + 'px';
  _grCtx = _grCanvas.getContext('2d');
  _grCtx.scale(dpr, dpr);
  _grCanvas._logW = w;
  _grCanvas._logH = h;
}

// ===== COORDINATE MAPPING =====
function _grScale() {
  return _grCanvas ? _grCanvas._logW / 3.4 : 100;
}

function _grWorldToPixel(wx, wy) {
  var w = _grCanvas._logW;
  var h = _grCanvas._logH;
  var tableY = h * 0.82;
  var s = _grScale();
  return {
    x: w / 2 + wx * s,
    y: tableY - wy * s - _grCameraY
  };
}

function _grCoinPixelR() {
  return GR_COIN_R * _grScale();
}

// ===== CANVAS RENDERING =====
function _grRender() {
  if (!_grCtx || !_grCanvas) return;
  var ctx = _grCtx;
  var w = _grCanvas._logW;
  var h = _grCanvas._logH;

  // Apply shake
  ctx.save();
  if (_grShake > 0.5) {
    ctx.translate((Math.random() - 0.5) * _grShake, (Math.random() - 0.5) * _grShake * 0.5);
  }

  // Background
  var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#08081a');
  bgGrad.addColorStop(0.4, '#0e0c1e');
  bgGrad.addColorStop(1, '#161222');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Ambient lights
  ctx.fillStyle = 'rgba(255,180,60,0.03)';
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.15, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.2, 100, 0, Math.PI * 2);
  ctx.fill();

  // Table
  _grDrawTable(ctx, w, h);

  // Center guide line
  var tablePixelY = h * 0.82 - _grCameraY;
  ctx.strokeStyle = 'rgba(255,215,0,0.07)';
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, tablePixelY);
  ctx.lineTo(w / 2, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stacked coins
  _grDrawCoins(ctx);

  // Drop animation
  if (_grDropAnim) _grDrawDropCoin(ctx);

  // Collapse animation
  if (_grCollapseCoins) _grDrawCollapseCoins(ctx);

  // Oscillating coin
  if (!_grDropping && _grMyTurn && grState && grState.phase === 'playing' && !_grCollapseCoins) {
    _grDrawOscillator(ctx, w, h);
  }

  // Particles
  _grDrawParticles(ctx);

  // Score popups
  _grDrawScorePopups(ctx);

  // Danger vignette
  if (grState && grState.danger) {
    var pulse = Math.sin(performance.now() * 0.003) * 0.5 + 0.5;
    var vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.7);
    vigGrad.addColorStop(0, 'rgba(255,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(255,0,0,' + (0.08 + pulse * 0.12) + ')');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

function _grDrawTable(ctx, w, h) {
  var tableY = h * 0.82 - _grCameraY;
  if (tableY > h + 10) return;

  // Table body
  var tGrad = ctx.createLinearGradient(0, tableY, 0, h);
  tGrad.addColorStop(0, '#234518');
  tGrad.addColorStop(0.05, '#1a3a10');
  tGrad.addColorStop(1, '#0a2008');
  ctx.fillStyle = tGrad;
  ctx.fillRect(0, tableY, w, h - tableY + 10);

  // Gold rim
  var rimGrad = ctx.createLinearGradient(0, tableY - 3, 0, tableY + 3);
  rimGrad.addColorStop(0, '#e6c200');
  rimGrad.addColorStop(0.5, '#fff3a0');
  rimGrad.addColorStop(1, '#b8960c');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, tableY - 2, w, 4);
}

function _grDrawCoin(ctx, px, py, r, alpha, isGolden) {
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;

  // Shadow
  if (alpha > 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px + 1.5, py + 3, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Coin edge
  var edgeH = r * 0.2;
  var edgeGrad = ctx.createLinearGradient(px - r, py, px + r, py + edgeH);
  edgeGrad.addColorStop(0, isGolden ? '#cc8800' : '#b8960c');
  edgeGrad.addColorStop(0.5, isGolden ? '#ffe080' : '#ffd700');
  edgeGrad.addColorStop(1, isGolden ? '#cc8800' : '#b8960c');
  ctx.fillStyle = edgeGrad;
  ctx.beginPath();
  ctx.ellipse(px, py + edgeH, r, r * 0.3, 0, 0, Math.PI);
  ctx.ellipse(px, py, r, r * 0.3, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Coin face
  var coinGrad = ctx.createRadialGradient(px - r * 0.15, py - r * 0.05, 0, px, py, r);
  coinGrad.addColorStop(0, isGolden ? '#fff5cc' : '#ffe680');
  coinGrad.addColorStop(0.5, isGolden ? '#ffc800' : '#ffd700');
  coinGrad.addColorStop(1, isGolden ? '#cc8800' : '#b8960c');
  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.ellipse(px, py, r, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.strokeStyle = 'rgba(180,140,20,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(px, py, r * 0.7, r * 0.7 * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Star
  ctx.fillStyle = 'rgba(160,120,0,0.45)';
  ctx.font = 'bold ' + Math.round(r * 0.35) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', px, py);

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(px - r * 0.2, py - r * 0.06, r * 0.35, r * 0.08, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function _grDrawCoins(ctx) {
  if (!grState || !grState.coins.length) return;
  var r = _grCoinPixelR();
  var s = _grScale();
  for (var i = 0; i < grState.coins.length; i++) {
    var coin = grState.coins[i];
    var worldY = GR_COIN_H / 2 + i * GR_COIN_H;
    var pos = _grWorldToPixel(coin.x, worldY);
    if (pos.y < -r * 2 || pos.y > _grCanvas._logH + r * 2) continue;
    _grDrawCoin(ctx, pos.x, pos.y, r, 1.0, false);
  }
}

function _grDrawOscillator(ctx, w, h) {
  var oscX = _grGetOscX();
  var coinCount = grState.coins.length;
  var dropWorldY = coinCount * GR_COIN_H + 0.8;
  var pos = _grWorldToPixel(oscX, dropWorldY);
  var r = _grCoinPixelR();

  // Pendulum arm
  var pivotX = w / 2;
  var pivotY = Math.max(20, pos.y - 80);
  ctx.strokeStyle = 'rgba(255,215,0,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();

  // Pivot point
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
  ctx.fill();

  // Drop guide line
  var stackTopPos = _grWorldToPixel(oscX, coinCount * GR_COIN_H + GR_COIN_H / 2);
  ctx.strokeStyle = 'rgba(255,215,0,0.15)';
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y + r * 0.3);
  ctx.lineTo(pos.x, stackTopPos.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Landing preview (faded circle on stack)
  var windPreview = grState.windForce * (_grEventActive && _grEventActive.id === 'gust' ? 2.5 : 1);
  var landX = oscX + windPreview;
  var landPos = _grWorldToPixel(landX, coinCount * GR_COIN_H + GR_COIN_H / 2);
  ctx.strokeStyle = 'rgba(255,215,0,0.12)';
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(landPos.x, landPos.y, r, r * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Trail effect
  var speed = _grGetOscSpeed();
  var amplitude = GR_MAX_X;
  if (_grEventActive && _grEventActive.id === 'narrow') amplitude *= 0.5;
  for (var t = 1; t <= 4; t++) {
    var trailOsc = Math.sin((_grOscTime - t * 0.04) * speed) * amplitude;
    var trailPos = _grWorldToPixel(trailOsc, dropWorldY);
    _grDrawCoin(ctx, trailPos.x, trailPos.y, r * (1 - t * 0.05), 0.04 * (5 - t), false);
  }

  // Main oscillating coin
  var isGolden = _grEventActive && _grEventActive.id === 'golden';
  _grDrawCoin(ctx, pos.x, pos.y, r, 0.65, isGolden);

  // Glow
  ctx.fillStyle = 'rgba(255,215,0,0.08)';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r * 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function _grDrawDropCoin(ctx) {
  if (!_grDropAnim) return;
  var r = _grCoinPixelR();
  var pos = _grWorldToPixel(_grDropAnim.x, _grDropAnim.y);
  _grDrawCoin(ctx, pos.x, pos.y, r, 1.0, _grDropAnim.golden);
}

function _grDrawCollapseCoins(ctx) {
  if (!_grCollapseCoins) return;
  var r = _grCoinPixelR();
  for (var i = 0; i < _grCollapseCoins.length; i++) {
    var c = _grCollapseCoins[i];
    if (c.alpha <= 0) continue;
    var pos = _grWorldToPixel(c.x, c.y);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(c.r);
    _grDrawCoin(ctx, 0, 0, r * c.scale, c.alpha, false);
    ctx.restore();
  }
}

function _grDrawParticles(ctx) {
  for (var i = 0; i < _grParticles.length; i++) {
    var p = _grParticles[i];
    ctx.fillStyle = 'rgba(' + p.color + ',' + (p.life * 0.8) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
}

function _grDrawScorePopups(ctx) {
  for (var i = 0; i < _grScorePopups.length; i++) {
    var sp = _grScorePopups[i];
    ctx.save();
    ctx.globalAlpha = sp.life;
    ctx.font = 'bold ' + Math.round(sp.size * (1 + (1 - sp.life) * 0.3)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = sp.color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(sp.text, sp.x, sp.y);
    ctx.restore();
  }
}

// ===== PARTICLES =====
function _grSpawnParticles(wx, wy, count) {
  var pos = _grWorldToPixel(wx, wy);
  for (var i = 0; i < count; i++) {
    _grParticles.push({
      x: pos.x, y: pos.y,
      vx: (Math.random() - 0.5) * 200,
      vy: -Math.random() * 250 - 50,
      size: 2 + Math.random() * 3,
      life: 1, decay: 0.02 + Math.random() * 0.02,
      color: Math.random() > 0.5 ? '255,215,0' : '255,180,40',
    });
  }
}

function _grSpawnScorePopup(score, placement, multiplier) {
  if (!_grCanvas) return;
  var w = _grCanvas._logW;
  var text = '+' + score;
  var color = '#ffd700';
  if (placement === 'center') { text = 'PERFECT! +' + score; color = '#44ff88'; }
  else if (placement === 'edge') { text = 'RISKY! +' + score; color = '#ff6644'; }
  if (multiplier > 1) text += ' ×' + multiplier.toFixed(1);
  _grScorePopups.push({
    x: w / 2, y: _grCanvas._logH * 0.4,
    vy: -40, text: text, color: color,
    size: placement === 'center' ? 24 : 20,
    life: 1, decay: 0.012,
  });
}

// ===== ANIMATION LOOP =====
function _grAnimLoop(timestamp) {
  _grRafId = requestAnimationFrame(_grAnimLoop);
  if (!_grCanvas || !grState) return;

  var dt = _grLastTime ? Math.min((timestamp - _grLastTime) / 1000, 0.05) : 0.016;
  _grLastTime = timestamp;

  // Intro
  if (grState.phase === 'intro') {
    _grUpdateIntro(dt);
    _grRender();
    return;
  }

  // Oscillation
  if (_grMyTurn && !_grDropping && grState.phase === 'playing' && !_grCollapseCoins) {
    _grOscTime += dt;
  }

  // Drop animation
  if (_grDropAnim && !_grDropAnim.settled) {
    _grDropAnim.vy += 18 * dt;
    _grDropAnim.y -= _grDropAnim.vy * dt;
    if (_grDropAnim.y <= _grDropAnim.targetY) {
      _grDropAnim.y = _grDropAnim.targetY;
      if (_grDropAnim.vy > 0.5 && _grDropAnim.bounceCount < 2) {
        _grDropAnim.vy = -_grDropAnim.vy * 0.25;
        _grDropAnim.bounceCount++;
        _grShake = Math.max(_grShake, 4);
        _grSpawnParticles(_grDropAnim.x, _grDropAnim.targetY, 6);
      } else {
        _grDropAnim.settled = true;
        _grShake = 4 + grState.coins.length * 0.3;
        _grSpawnParticles(_grDropAnim.x, _grDropAnim.targetY, 12);
        if (navigator.vibrate) navigator.vibrate(20);
        if (_grDropAnim.onSettle) _grDropAnim.onSettle();
      }
    }
  }

  // Collapse animation
  if (_grCollapseCoins) {
    var allDone = true;
    for (var i = 0; i < _grCollapseCoins.length; i++) {
      var c = _grCollapseCoins[i];
      if (c.alpha <= 0) continue;
      c.vy -= 12 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.r += c.vr * dt;
      c.vx *= 0.99;
      c.vr *= 0.98;
      if (c.y < -0.5) {
        c.alpha -= dt * 3;
      } else {
        allDone = false;
      }
    }
    if (allDone || _grCollapseCoins[0]._elapsed > 3) {
      var cb = _grCollapseCoins._onDone;
      _grCollapseCoins = null;
      if (cb) cb();
    } else {
      _grCollapseCoins[0]._elapsed = (_grCollapseCoins[0]._elapsed || 0) + dt;
    }
  }

  // Particles
  for (var i = _grParticles.length - 1; i >= 0; i--) {
    var p = _grParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 400 * dt;
    p.life -= p.decay;
    if (p.life <= 0) _grParticles.splice(i, 1);
  }

  // Score popups
  for (var i = _grScorePopups.length - 1; i >= 0; i--) {
    var sp = _grScorePopups[i];
    sp.y += sp.vy * dt;
    sp.life -= sp.decay;
    if (sp.life <= 0) _grScorePopups.splice(i, 1);
  }

  // Camera
  _grCameraY += (_grCameraTargetY - _grCameraY) * dt * 3;

  // Shake decay
  if (_grShake > 0) _grShake *= 0.9;

  _grRender();
}

function _grUpdateIntro(dt) {
  _grIntroTime += dt;
  if (_grIntroPhase === 0) {
    // Show title for 1.5s
    if (_grIntroTime > 1.5) {
      _grIntroPhase = 1;
      _grIntroTime = 0;
    }
  } else if (_grIntroPhase === 1) {
    // Fade out and start
    if (_grIntroTime > 0.5) {
      _grIntroPlayed = true;
      if (state.isHost) {
        grState.phase = 'playing';
        _grUpdateWind();
        grBroadcastState();
        grBeginTurn();
      } else {
        grState.phase = 'playing';
        grBeginTurn();
      }
    }
  }
  // Draw intro overlay
  if (_grCtx && _grCanvas) {
    var ctx = _grCtx;
    var w = _grCanvas._logW;
    var h = _grCanvas._logH;
    _grRender();
    var alpha = _grIntroPhase === 1 ? Math.max(0, 1 - _grIntroTime * 2) : 1;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.7 * alpha) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255,215,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText('💰 골드러시', w / 2, h * 0.4);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 0;
    ctx.fillText('타이밍에 맞춰 동전을 떨어뜨리세요!', w / 2, h * 0.5);
    ctx.globalAlpha = 1;
  }
}

// ===== START GAME =====
function startGoldRush() {
  console.log('[GoldRush] startGoldRush called. isHost:', state.isHost);

  var playerCount = state.players.length;
  var mode = 'solo';
  if (playerCount === 2) mode = 'vs';
  else if (playerCount === 3) mode = 'vs';
  else if (playerCount >= 4) mode = 'team';

  var seed = Math.floor(Math.random() * 999999) + 1;
  _grSeed = seed;

  var turnOrder = [];
  if (mode === 'team') {
    var teamA = [state.players[0].id, state.players[1].id];
    var teamB = [state.players[2].id, state.players[3].id];
    turnOrder = [teamA[0], teamB[0], teamA[1], teamB[1]];
  } else if (mode === 'solo') {
    turnOrder = [state.myId];
  } else {
    turnOrder = state.players.map(function(p) { return p.id; });
  }

  grState = {
    mode: mode,
    seed: seed,
    coins: [],
    turnOrder: turnOrder,
    turnIndex: 0,
    currentPlayer: turnOrder[0],
    phase: 'intro',
    round: 1,
    loser: null,
    loserTeam: null,
    teams: mode === 'team' ? {
      A: [state.players[0].id, state.players[1].id],
      B: [state.players[2].id, state.players[3].id]
    } : null,
    lastStability: 1.0,
    scores: {},
    totalScore: {},
    turnTimeMs: GR_TURN_TIME_BASE,
    wind: 0,
    windForce: 0,
    streak: 0,
    bestStreak: 0,
    nextEventAt: GR_EVENT_INTERVAL,
    pendingEvent: null,
    danger: false,
  };

  state.players.forEach(function(p) {
    grState.scores[p.id] = 0;
    grState.totalScore[p.id] = 0;
  });

  showScreen('goldrushGame');
  _grInitCanvas();
  _ensureFullscreenForGame();

  _grIntroPhase = 0;
  _grIntroTime = 0;
  _grOscTime = 0;
  _grLastTime = 0;
  _grCameraY = 0;
  _grCameraTargetY = 0;
  _grParticles = [];
  _grScorePopups = [];
  _grDropAnim = null;
  _grCollapseCoins = null;
  _grShake = 0;
  _grEventActive = null;

  broadcast({
    type: 'game-start',
    game: 'goldrush',
    state: grState
  });

  if (_grRafId) cancelAnimationFrame(_grRafId);
  _grRafId = requestAnimationFrame(_grAnimLoop);
}

// ===== BROADCAST STATE =====
function grBroadcastState() {
  broadcast({
    type: 'gr-state',
    state: {
      coins: grState.coins,
      turnIndex: grState.turnIndex,
      currentPlayer: grState.currentPlayer,
      phase: grState.phase,
      round: grState.round,
      loser: grState.loser,
      loserTeam: grState.loserTeam,
      lastStability: grState.lastStability,
      scores: grState.scores,
      totalScore: grState.totalScore,
      turnTimeMs: grState.turnTimeMs,
      wind: grState.wind,
      windForce: grState.windForce,
      streak: grState.streak,
      bestStreak: grState.bestStreak,
      pendingEvent: grState.pendingEvent,
      danger: grState.danger,
    }
  });
}

// ===== HANDLE STATE (client) =====
function grHandleState(msg) {
  if (!grState) return;
  var s = msg.state;
  grState.coins = s.coins;
  grState.turnIndex = s.turnIndex;
  grState.currentPlayer = s.currentPlayer;
  grState.phase = s.phase;
  grState.round = s.round;
  grState.loser = s.loser;
  grState.loserTeam = s.loserTeam;
  grState.lastStability = s.lastStability;
  grState.scores = s.scores;
  grState.totalScore = s.totalScore || s.scores;
  grState.turnTimeMs = s.turnTimeMs;
  grState.wind = s.wind || 0;
  grState.windForce = s.windForce || 0;
  grState.streak = s.streak || 0;
  grState.bestStreak = s.bestStreak || 0;
  grState.pendingEvent = s.pendingEvent || null;
  grState.danger = s.danger || false;

  if (s.phase === 'gameover') grShowResult();
  else if (s.phase === 'playing') grBeginTurn();
  grRenderHUD();
}

// ===== BEGIN TURN =====
function grBeginTurn() {
  if (grState.phase !== 'playing') return;
  _grDropping = false;
  _grMyTurn = (grState.currentPlayer === state.myId);
  _grOscTime = Math.random() * Math.PI * 2; // Random start phase

  _grEventActive = grState.pendingEvent;
  grState.pendingEvent = null;

  if (_grEventActive) {
    _grShowEventBanner(_grEventActive);
    if (_grEventActive.id === 'reverse') {
      // Reverse = phase shift
      _grOscTime += Math.PI;
    }
    if (navigator.vibrate && _grEventActive.id === 'gust') navigator.vibrate([50, 30, 50]);
  }

  grState.danger = grState.lastStability < 0.3;

  // Camera
  var coinCount = grState.coins.length;
  if (coinCount > 5) {
    _grCameraTargetY = (coinCount - 5) * GR_COIN_H * _grScale() * 0.6;
  } else {
    _grCameraTargetY = 0;
  }

  grRenderHUD();
  _grUpdateDropBtn();

  _grClearTurnTimer();
  if (_grMyTurn && grState.mode !== 'solo') {
    _grStartTurnTimer();
  }
}

// ===== TURN TIMER =====
function _grStartTurnTimer() {
  var timeMs = grState.turnTimeMs;
  var startTime = Date.now();
  var timerBar = document.getElementById('grTurnTimerBar');
  var timerWrap = document.getElementById('grTurnTimerWrap');
  if (timerWrap) timerWrap.style.display = 'block';

  _grTurnTimer = setInterval(function() {
    var elapsed = Date.now() - startTime;
    var remaining = Math.max(0, timeMs - elapsed);
    var pct = remaining / timeMs;
    if (timerBar) {
      timerBar.style.width = (pct * 100) + '%';
      if (pct < 0.2) timerBar.style.background = '#ff2222';
      else if (pct < 0.5) timerBar.style.background = '#ffaa00';
      else timerBar.style.background = '#44ff88';
    }
    if (remaining < 3000 && remaining > 2900 && navigator.vibrate) navigator.vibrate(100);
    if (remaining <= 0) {
      _grClearTurnTimer();
      if (_grMyTurn && !_grDropping) grDropCoin();
    }
  }, 50);
}

function _grClearTurnTimer() {
  if (_grTurnTimer) { clearInterval(_grTurnTimer); _grTurnTimer = null; }
  var timerWrap = document.getElementById('grTurnTimerWrap');
  if (timerWrap) timerWrap.style.display = 'none';
}

// ===== DROP COIN =====
function grDropCoin() {
  if (!_grMyTurn || _grDropping || grState.phase !== 'playing') return;
  _grDropping = true;
  _grClearTurnTimer();

  var x = _grGetOscX();

  if (state.isHost) {
    grProcessDrop(state.myId, x);
  } else {
    sendToHost({ type: 'gr-drop', x: x });
  }
}

// ===== PROCESS DROP (host only) =====
function grProcessDrop(playerId, x) {
  if (!state.isHost) return;
  if (playerId !== grState.currentPlayer) return;

  var gustMult = (_grEventActive && _grEventActive.id === 'gust') ? 2.5 : 1;
  var effectiveMaxX = GR_MAX_X;
  if (_grEventActive && _grEventActive.id === 'narrow') effectiveMaxX = GR_MAX_X * 0.5;
  x = Math.max(-effectiveMaxX, Math.min(effectiveMaxX, x));

  // Wind
  x += grState.windForce * gustMult;

  // Jitter
  var coinCount = grState.coins.length;
  x += (grRand() - 0.5) * (GR_JITTER_BASE + coinCount * GR_JITTER_PER_COIN);

  x = Math.max(-GR_MAX_X * 1.1, Math.min(GR_MAX_X * 1.1, x));

  var newCoin = { x: x };
  var testCoins = grState.coins.slice();
  testCoins.push(newCoin);
  var result = grCheckStability(testCoins);

  if (result.stable) {
    grState.coins.push(newCoin);
    grState.lastStability = result.stability;
    grState.streak++;
    if (grState.streak > grState.bestStreak) grState.bestStreak = grState.streak;

    var absX = Math.abs(x);
    var baseScore = GR_SCORE_BASE + coinCount;
    var placement = 'normal';
    if (absX > GR_EDGE_THRESHOLD) { baseScore += GR_SCORE_EDGE_BONUS; placement = 'edge'; }
    else if (absX < GR_CENTER_THRESHOLD) { baseScore += GR_SCORE_CENTER_BONUS; placement = 'center'; }
    var multiplier = _grGetScoreMultiplier();
    var finalScore = Math.round(baseScore * multiplier);

    grState.scores[playerId] = (grState.scores[playerId] || 0) + 1;
    grState.totalScore[playerId] = (grState.totalScore[playerId] || 0) + finalScore;
    grState.turnTimeMs = Math.max(GR_TURN_TIME_MIN, GR_TURN_TIME_BASE - grState.coins.length * GR_TURN_TIME_DECAY);
    _grUpdateWind();

    var nextEvent = null;
    if (grState.coins.length >= grState.nextEventAt) {
      nextEvent = _grRollEvent();
      grState.nextEventAt += GR_EVENT_INTERVAL;
      if (grState.coins.length > 15) grState.nextEventAt = grState.coins.length + 3;
    }
    grState.pendingEvent = nextEvent;
    grState.danger = result.stability < 0.3;

    grState.turnIndex = (grState.turnIndex + 1) % grState.turnOrder.length;
    grState.currentPlayer = grState.turnOrder[grState.turnIndex];
    if (grState.turnIndex === 0) grState.round++;

    broadcast({
      type: 'gr-drop-result',
      x: x, stable: true, stability: result.stability,
      nextPlayer: grState.currentPlayer, turnIndex: grState.turnIndex,
      round: grState.round, scores: grState.scores, totalScore: grState.totalScore,
      turnTimeMs: grState.turnTimeMs, wind: grState.wind, windForce: grState.windForce,
      streak: grState.streak, bestStreak: grState.bestStreak,
      pendingEvent: nextEvent, danger: grState.danger,
      scoreGained: finalScore, placement: placement, multiplier: multiplier,
    });

    _grAnimateDrop(x, true, result.stability, null, {
      score: finalScore, placement: placement, multiplier: multiplier,
    });
  } else {
    grState.loser = playerId;
    grState.phase = 'gameover';
    grState.streak = 0;
    if (grState.mode === 'team' && grState.teams) {
      grState.loserTeam = grState.teams.A.indexOf(playerId) !== -1 ? 'A' : 'B';
    }
    grState.coins.push(newCoin);

    broadcast({
      type: 'gr-drop-result',
      x: x, stable: false,
      collapseLevel: result.collapseLevel, direction: result.direction,
      loser: grState.loser, loserTeam: grState.loserTeam,
      scores: grState.scores, totalScore: grState.totalScore,
      bestStreak: grState.bestStreak,
    });

    _grAnimateDrop(x, false, 0, {
      collapseLevel: result.collapseLevel, direction: result.direction,
    }, null);
  }
}

// ===== HANDLE DROP RESULT (client) =====
function grHandleDropResult(msg) {
  if (!grState) return;
  if (msg.stable) {
    grState.coins.push({ x: msg.x });
    grState.lastStability = msg.stability;
    grState.currentPlayer = msg.nextPlayer;
    grState.turnIndex = msg.turnIndex;
    grState.round = msg.round;
    grState.scores = msg.scores;
    grState.totalScore = msg.totalScore || msg.scores;
    grState.turnTimeMs = msg.turnTimeMs;
    grState.wind = msg.wind || 0;
    grState.windForce = msg.windForce || 0;
    grState.streak = msg.streak || 0;
    grState.bestStreak = msg.bestStreak || 0;
    grState.pendingEvent = msg.pendingEvent || null;
    grState.danger = msg.danger || false;
    _grAnimateDrop(msg.x, true, msg.stability, null, {
      score: msg.scoreGained, placement: msg.placement, multiplier: msg.multiplier,
    });
  } else {
    grState.coins.push({ x: msg.x });
    grState.loser = msg.loser;
    grState.loserTeam = msg.loserTeam;
    grState.phase = 'gameover';
    grState.scores = msg.scores;
    grState.totalScore = msg.totalScore || msg.scores;
    grState.bestStreak = msg.bestStreak || 0;
    _grAnimateDrop(msg.x, false, 0, {
      collapseLevel: msg.collapseLevel, direction: msg.direction,
    }, null);
  }
}

// ===== ANIMATE DROP =====
function _grAnimateDrop(x, isStable, stability, collapseInfo, scoreInfo) {
  var coinIndex = grState.coins.length - 1;
  var targetY = GR_COIN_H / 2 + coinIndex * GR_COIN_H;
  var startY = targetY + 1.0;

  _grDropAnim = {
    x: x, y: startY, vy: 0,
    targetY: targetY, settled: false, bounceCount: 0,
    golden: _grEventActive && _grEventActive.id === 'golden',
    onSettle: function() {
      _grDropAnim = null;
      if (isStable) {
        if (scoreInfo) _grSpawnScorePopup(scoreInfo.score, scoreInfo.placement, scoreInfo.multiplier);
        if (stability < 0.3 && navigator.vibrate) navigator.vibrate([50, 20, 80]);

        setTimeout(function() {
          grBeginTurn();
          grRenderHUD();
        }, 300);
      } else {
        if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
        _grStartCollapse(collapseInfo);
      }
    }
  };
}

function _grStartCollapse(info) {
  if (!info) { setTimeout(grShowResult, 500); return; }
  var level = Math.max(0, info.collapseLevel);
  var coins = [];
  for (var i = level; i < grState.coins.length; i++) {
    var c = grState.coins[i];
    var worldY = GR_COIN_H / 2 + i * GR_COIN_H;
    coins.push({
      x: c.x, y: worldY,
      vx: (info.direction || 0) * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 3,
      r: 0, vr: (Math.random() - 0.5) * 8,
      alpha: 1, scale: 1, _elapsed: 0,
    });
  }
  grState.coins = grState.coins.slice(0, level);
  _grShake = 15;
  _grSpawnParticles(0, level * GR_COIN_H, 25);
  _grCollapseCoins = coins;
  _grCollapseCoins._onDone = function() {
    setTimeout(grShowResult, 300);
  };
}

// ===== EVENT BANNER =====
function _grShowEventBanner(evt) {
  var banner = document.getElementById('grEventBanner');
  if (!banner) return;
  banner.innerHTML = '<span class="gr-event-emoji">' + evt.emoji + '</span>' +
    '<span class="gr-event-name">' + escapeHTML(evt.name) + '</span>' +
    '<span class="gr-event-desc">' + escapeHTML(evt.desc) + '</span>';
  banner.classList.add('gr-event-show');
  setTimeout(function() { banner.classList.remove('gr-event-show'); }, 2500);
}

// ===== SHOW RESULT =====
function grShowResult() {
  _grClearTurnTimer();
  var overlay = document.getElementById('grResultOverlay');
  if (!overlay) return;

  var isSolo = grState.mode === 'solo';
  var coinCount = grState.coins.length - 1;
  var bestStreak = grState.bestStreak || 0;

  if (isSolo) {
    var myScore = grState.totalScore[state.myId] || 0;
    var grade = '🥉'; var gradeText = 'Good';
    if (coinCount >= 25) { grade = '👑'; gradeText = 'LEGENDARY!'; }
    else if (coinCount >= 20) { grade = '💎'; gradeText = 'AMAZING!'; }
    else if (coinCount >= 15) { grade = '🥇'; gradeText = 'GREAT!'; }
    else if (coinCount >= 10) { grade = '🥈'; gradeText = 'NICE!'; }

    overlay.innerHTML =
      '<div class="gr-result-card">' +
        '<div class="gr-result-emoji">' + grade + '</div>' +
        '<div class="gr-result-title">' + gradeText + '</div>' +
        '<div class="gr-result-score">' + coinCount + '개 쌓기 성공!</div>' +
        '<div class="gr-result-stats">' +
          '<div class="gr-stat"><span class="gr-stat-label">총 점수</span><span class="gr-stat-val">' + myScore.toLocaleString() + '</span></div>' +
          '<div class="gr-stat"><span class="gr-stat-label">최고 연속</span><span class="gr-stat-val">' + bestStreak + '개</span></div>' +
        '</div>' +
        '<div class="gr-result-buttons">' +
          (state.isHost ? '<button class="gr-btn gr-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="gr-btn gr-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else if (grState.mode === 'team') {
    var loserTeamLabel = grState.loserTeam === 'A' ? 'A팀' : 'B팀';
    var winnerTeamLabel = grState.loserTeam === 'A' ? 'B팀' : 'A팀';
    var winnerTeam = grState.loserTeam === 'A' ? grState.teams.B : grState.teams.A;
    var winnerNames = winnerTeam.map(function(id) {
      var p = state.players.find(function(pp) { return pp.id === id; });
      return p ? p.name : '???';
    });
    var loserPlayer = state.players.find(function(p) { return p.id === grState.loser; });
    var loserName = loserPlayer ? loserPlayer.name : '???';

    overlay.innerHTML =
      '<div class="gr-result-card">' +
        '<div class="gr-result-emoji">🏆</div>' +
        '<div class="gr-result-title">' + escapeHTML(winnerTeamLabel) + ' 승리!</div>' +
        '<div class="gr-result-score">' + escapeHTML(winnerNames.join(' & ')) + '</div>' +
        '<div class="gr-result-subtitle">' + escapeHTML(loserName) + '(' + escapeHTML(loserTeamLabel) + ')이 무너뜨림! (' + coinCount + '개)</div>' +
        _grRenderScoreboard() +
        '<div class="gr-result-buttons">' +
          (state.isHost ? '<button class="gr-btn gr-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="gr-btn gr-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else {
    var loserPlayer2 = state.players.find(function(p) { return p.id === grState.loser; });
    var loserName2 = loserPlayer2 ? loserPlayer2.name : '???';
    overlay.innerHTML =
      '<div class="gr-result-card">' +
        '<div class="gr-result-emoji">' + (grState.loser === state.myId ? '💀' : '🏆') + '</div>' +
        '<div class="gr-result-title">' + (grState.loser === state.myId ? '패배...' : '승리!') + '</div>' +
        '<div class="gr-result-score">' + escapeHTML(loserName2) + ' 탈락!</div>' +
        '<div class="gr-result-subtitle">' + coinCount + '개에서 무너짐</div>' +
        _grRenderScoreboard() +
        '<div class="gr-result-buttons">' +
          (state.isHost ? '<button class="gr-btn gr-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="gr-btn gr-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  }

  overlay.style.display = 'flex';
  overlay.classList.add('gr-result-show');
}

function _grRenderScoreboard() {
  if (!grState || !grState.totalScore) return '';
  var html = '<div class="gr-scoreboard">';
  var sorted = state.players.slice().sort(function(a, b) {
    return (grState.totalScore[b.id] || 0) - (grState.totalScore[a.id] || 0);
  });
  sorted.forEach(function(p, rank) {
    var isLoser = p.id === grState.loser;
    var rankEmoji = rank === 0 ? '🥇' : (rank === 1 ? '🥈' : '🥉');
    html += '<div class="gr-score-row' + (isLoser ? ' loser' : '') + '">' +
      '<span class="gr-score-rank">' + rankEmoji + '</span>' +
      '<span class="gr-score-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="gr-score-name">' + escapeHTML(p.name) + '</span>' +
      '<span class="gr-score-detail">' + (grState.scores[p.id] || 0) + '개</span>' +
      '<span class="gr-score-val">' + (grState.totalScore[p.id] || 0).toLocaleString() + 'pt</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// ===== RENDER HUD =====
function grRenderHUD() {
  if (!grState) return;

  var turnEl = document.getElementById('grTurnIndicator');
  if (turnEl) {
    if (grState.phase === 'intro') {
      turnEl.innerHTML = '<div class="gr-turn-text">준비 중...</div>';
    } else if (grState.phase === 'gameover') {
      turnEl.innerHTML = '';
    } else {
      var cp = state.players.find(function(p) { return p.id === grState.currentPlayer; });
      var isMe = grState.currentPlayer === state.myId;
      var nameStr = isMe ? 'MY TURN!' : (cp ? cp.name : '???');
      var avatarStr = cp ? cp.avatar : '💰';
      var streakLabel = _grGetStreakLabel();
      turnEl.innerHTML =
        '<div class="gr-turn-avatar">' + escapeHTML(avatarStr) + '</div>' +
        '<div class="gr-turn-text' + (isMe ? ' my-turn' : '') + '">' + escapeHTML(nameStr) + '</div>' +
        (streakLabel ? '<div class="gr-streak-badge">' + streakLabel + '</div>' : '');
    }
  }

  var countEl = document.getElementById('grCoinCount');
  if (countEl) countEl.textContent = grState.coins.length + '개';

  var roundEl = document.getElementById('grRoundNum');
  if (roundEl && grState.mode !== 'solo') roundEl.textContent = grState.round + 'R';

  var meterEl = document.getElementById('grStabilityBar');
  if (meterEl) {
    var pct = grState.lastStability * 100;
    meterEl.style.width = pct + '%';
    if (pct < 20) meterEl.style.background = '#ff2222';
    else if (pct < 40) meterEl.style.background = '#ff6600';
    else if (pct < 60) meterEl.style.background = '#ffaa00';
    else meterEl.style.background = '#44ff88';
  }

  var windEl = document.getElementById('grWindIndicator');
  if (windEl) {
    var wf = grState.windForce || 0;
    var absWind = Math.abs(wf);
    var windDir = wf > 0 ? '→' : (wf < 0 ? '←' : '·');
    var windStrength = absWind > 0.25 ? '강풍' : (absWind > 0.12 ? '바람' : (absWind > 0.04 ? '미풍' : '고요'));
    var windBars = Math.min(5, Math.floor(absWind * 15));
    var barStr = '';
    for (var i = 0; i < 5; i++) {
      barStr += '<span class="gr-wind-bar' + (i < windBars ? ' active' : '') + '"></span>';
    }
    windEl.innerHTML = '<span class="gr-wind-dir">' + windDir + '</span>' +
      '<span class="gr-wind-bars">' + barStr + '</span>' +
      '<span class="gr-wind-label">' + windStrength + '</span>';
    windEl.style.display = 'flex';
  }

  var scoreEl = document.getElementById('grMyScore');
  if (scoreEl) {
    var myScore = grState.totalScore[state.myId] || 0;
    scoreEl.textContent = myScore.toLocaleString() + 'pt';
  }

  // Speed indicator
  var speedEl = document.getElementById('grSpeedIndicator');
  if (speedEl) {
    var speed = _grGetOscSpeed();
    var speedPct = Math.min(100, (speed / GR_OSC_MAX_SPEED) * 100);
    speedEl.innerHTML = '<span class="gr-speed-label">속도</span>' +
      '<div class="gr-speed-bar-wrap"><div class="gr-speed-bar" style="width:' + speedPct + '%"></div></div>';
  }

  _grRenderPlayerBar();
}

function _grRenderPlayerBar() {
  var bar = document.getElementById('grPlayersBar');
  if (!bar || !grState) return;
  if (grState.mode === 'solo') { bar.innerHTML = ''; return; }
  var html = '';
  var order = grState.turnOrder;
  for (var i = 0; i < order.length; i++) {
    var pid = order[i];
    var p = state.players.find(function(pp) { return pp.id === pid; });
    if (!p) continue;
    var isCurrent = pid === grState.currentPlayer;
    var teamClass = '';
    if (grState.mode === 'team' && grState.teams) {
      teamClass = grState.teams.A.indexOf(pid) !== -1 ? ' team-a' : ' team-b';
    }
    html += '<div class="gr-player-chip' + (isCurrent ? ' active' : '') + teamClass + '">' +
      '<span class="gr-chip-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="gr-chip-score">' + (grState.totalScore[pid] || 0) + 'pt</span>' +
    '</div>';
  }
  bar.innerHTML = html;
}

// ===== DROP BUTTON =====
function _grUpdateDropBtn() {
  var btn = document.getElementById('grDropBtn');
  if (!btn) return;
  if (_grMyTurn && !_grDropping && grState.phase === 'playing') {
    btn.style.display = 'flex';
    btn.classList.add('gr-drop-ready');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('gr-drop-ready');
  }
}

// ===== EMOJI SYSTEM =====
function grSendEmoji(emoji) {
  if (_grEmojiCooldown) return;
  _grEmojiCooldown = true;
  setTimeout(function() { _grEmojiCooldown = false; }, 1500);
  _grShowFloatingEmoji(emoji);
  broadcast({ type: 'gr-emoji', emoji: emoji, from: state.myId });
}

function grHandleEmoji(msg) {
  _grShowFloatingEmoji(msg.emoji);
  if (navigator.vibrate) navigator.vibrate(50);
}

function _grShowFloatingEmoji(emoji) {
  var container = document.getElementById('goldrushGame');
  if (!container) return;
  var el = document.createElement('div');
  el.className = 'gr-floating-emoji';
  el.textContent = emoji;
  el.style.left = (30 + Math.random() * 40) + '%';
  el.style.bottom = '30%';
  container.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
}

function grToggleEmojiPanel() {
  var panel = document.getElementById('grEmojiPanel');
  if (!panel) return;
  panel.classList.toggle('gr-emoji-open');
}

// ===== RENDER VIEW (from handleGameStart) =====
function renderGoldRushView(s) {
  if (!grState) {
    grState = {
      mode: s.mode,
      seed: s.seed,
      coins: s.coins || [],
      turnOrder: s.turnOrder,
      turnIndex: s.turnIndex || 0,
      currentPlayer: s.currentPlayer || s.turnOrder[0],
      phase: s.phase || 'intro',
      round: s.round || 1,
      loser: s.loser || null,
      loserTeam: s.loserTeam || null,
      teams: s.teams || null,
      lastStability: s.lastStability || 1.0,
      scores: s.scores || {},
      totalScore: s.totalScore || s.scores || {},
      turnTimeMs: s.turnTimeMs || GR_TURN_TIME_BASE,
      wind: s.wind || 0,
      windForce: s.windForce || 0,
      streak: s.streak || 0,
      bestStreak: s.bestStreak || 0,
      pendingEvent: s.pendingEvent || null,
      nextEventAt: s.nextEventAt || GR_EVENT_INTERVAL,
      danger: s.danger || false,
    };
  }
  _grSeed = grState.seed;
  _grInitCanvas();
  _grIntroPhase = 0;
  _grIntroTime = 0;
  _grOscTime = 0;
  _grLastTime = 0;
  _grCameraY = 0;
  _grCameraTargetY = 0;
  _grParticles = [];
  _grScorePopups = [];
  _grDropAnim = null;
  _grCollapseCoins = null;
  _grShake = 0;
  _grEventActive = null;
  if (_grRafId) cancelAnimationFrame(_grRafId);
  _grRafId = requestAnimationFrame(_grAnimLoop);
}

// ===== CLEANUP =====
function closeGoldRushCleanup() {
  _grClearTurnTimer();
  _grTimers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
  _grTimers = [];
  _grDropping = false;
  _grMyTurn = false;
  _grIntroPlayed = false;
  _grEventActive = null;
  _grDropAnim = null;
  _grCollapseCoins = null;
  _grParticles = [];
  _grScorePopups = [];

  if (_grRafId) { cancelAnimationFrame(_grRafId); _grRafId = null; }
  window.removeEventListener('resize', _grResizeCanvas);

  var overlay = document.getElementById('grResultOverlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('gr-result-show'); }

  grState = null;
  _grCanvas = null;
  _grCtx = null;
}

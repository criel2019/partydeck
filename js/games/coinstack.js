// =============================================
// COIN DROP (코인 드롭) - 3D Coin Stacking Game
// Deterministic physics, P2P multiplayer
// Solo / 1v1 / 2v2 modes
// =============================================

// ===== THREE.JS LOADER =====
var _csThreeLoaded = false;
function loadCoinStackThree() {
  if (_csThreeLoaded) return;
  _csThreeLoaded = true;

  function onScriptsReady() {
    var container = document.getElementById('csThreeContainer');
    if (container && typeof initCoinStackThree === 'function') {
      initCoinStackThree('csThreeContainer');
    }
  }

  function loadCoinStackScene() {
    var s = document.createElement('script');
    s.src = 'js/coinstack-three.js?v=20260312b';
    s.onload = onScriptsReady;
    s.onerror = function() { _csThreeLoaded = false; };
    document.head.appendChild(s);
  }

  if (window.THREE) {
    loadCoinStackScene();
    return;
  }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = loadCoinStackScene;
  s1.onerror = function() { _csThreeLoaded = false; };
  document.head.appendChild(s1);
}

// ===== CONSTANTS =====
var CS_COIN_R = 0.44;
var CS_COIN_H = 0.07;
var CS_BASE_STABILITY = 0.85;
var CS_MIN_STABILITY_THRESHOLD = 0.08;
var CS_TURN_TIME_BASE = 15000;
var CS_TURN_TIME_MIN = 4000;
var CS_TURN_TIME_DECAY = 350;
var CS_MAX_X = 1.2;

// Wind
var CS_WIND_BASE = 0.05;
var CS_WIND_PER_COIN = 0.016;
var CS_WIND_DRIFT = 0.35;

// Jitter (landing inaccuracy)
var CS_JITTER_BASE = 0.01;
var CS_JITTER_PER_COIN = 0.007;

// Scoring
var CS_SCORE_BASE = 10;
var CS_SCORE_EDGE_BONUS = 15;
var CS_SCORE_CENTER_BONUS = 5;
var CS_EDGE_THRESHOLD = 0.6;
var CS_CENTER_THRESHOLD = 0.15;

// Events
var CS_EVENT_INTERVAL = 5;

var CS_EMOJIS = ['😂','🤣','😱','💀','🔥','👏','😈','🤡','💩','🙏','😭','🫣'];

// ===== STATE =====
var csState = null;
var _csView = null;
var _csTimers = [];
var _csTurnTimer = null;
var _csGhostX = 0;
var _csMyTurn = false;
var _csDropping = false;
var _csIntroPlayed = false;
var _csEmojiCooldown = false;
var _csEventActive = null; // current active event for this turn

// ===== SEEDED PRNG (for deterministic results) =====
var _csSeed = 0;
function csRand() {
  _csSeed = (_csSeed * 1103515245 + 12345) & 0x7fffffff;
  return _csSeed / 0x7fffffff;
}

// ===== DIFFICULTY: Non-linear stability penalty =====
function _csGetMaxOffset(level) {
  // Accelerating penalty: easy early, brutal late
  var penalty = Math.pow(level, 1.5) * 0.004;
  var stability = Math.max(CS_MIN_STABILITY_THRESHOLD, CS_BASE_STABILITY - penalty);
  return CS_COIN_R * stability;
}

// ===== STABILITY CHECK (deterministic, with non-linear curve) =====
function csCheckStability(coins) {
  if (coins.length <= 1) return { stable: true, stability: 1.0, collapseLevel: -1, direction: 0 };

  var worstRatio = 0;
  var collapseLevel = -1;
  var collapseDir = 0;

  for (var i = 0; i < coins.length; i++) {
    // Center of mass from level i to top
    var cmX = 0;
    var count = coins.length - i;
    for (var j = i; j < coins.length; j++) {
      cmX += coins[j].x;
    }
    cmX /= count;

    // Support point
    var supportX = (i === 0) ? 0 : coins[i - 1].x;
    var offset = Math.abs(cmX - supportX);

    // Non-linear max offset (gets much smaller at height)
    var maxOffset = _csGetMaxOffset(i);

    var ratio = offset / maxOffset;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      if (ratio >= 1.0) {
        collapseLevel = i;
        collapseDir = cmX > supportX ? 1 : -1;
      }
    }
  }

  if (collapseLevel >= 0) {
    return { stable: false, stability: 0, collapseLevel: collapseLevel, direction: collapseDir };
  }
  return { stable: true, stability: 1 - worstRatio, collapseLevel: -1, direction: 0 };
}

// ===== WIND UPDATE (deterministic, seeded) =====
function _csUpdateWind() {
  // Wind drifts randomly, magnitude increases with height
  csState.wind += (csRand() - 0.5) * CS_WIND_DRIFT;
  // Occasional direction flip
  if (csRand() < 0.15) csState.wind *= -1;
  // Clamp
  csState.wind = Math.max(-1, Math.min(1, csState.wind));
  // Calculate actual force
  var coinCount = csState.coins.length;
  csState.windForce = csState.wind * (CS_WIND_BASE + coinCount * CS_WIND_PER_COIN);
}

// ===== EVENT SYSTEM =====
var CS_EVENTS = [
  { id: 'gust', name: '돌풍!', emoji: '🌪️', desc: '바람이 거세집니다!' },
  { id: 'quake', name: '지진!', emoji: '💥', desc: '테이블이 흔들립니다!' },
  { id: 'golden', name: '황금코인!', emoji: '✨', desc: '3배 점수!' },
  { id: 'narrow', name: '좁은 영역!', emoji: '📏', desc: '배치 범위가 줄어듭니다!' },
  { id: 'heavy', name: '무거운 코인!', emoji: '🏋️', desc: '이번 코인은 무겁습니다!' },
];

function _csRollEvent() {
  var idx = Math.floor(csRand() * CS_EVENTS.length);
  return CS_EVENTS[idx];
}

function _csGetScoreMultiplier() {
  var mult = 1;
  if (csState.streak >= 8) mult = 3.0;
  else if (csState.streak >= 5) mult = 2.0;
  else if (csState.streak >= 3) mult = 1.5;
  if (_csEventActive && _csEventActive.id === 'golden') mult *= 3;
  return mult;
}

function _csGetStreakLabel() {
  if (csState.streak >= 8) return 'MASTER!';
  if (csState.streak >= 5) return 'ON FIRE!';
  if (csState.streak >= 3) return 'STREAK!';
  return '';
}

// ===== START GAME =====
function startCoinStack() {
  console.log('[CoinStack] startCoinStack called. isHost:', state.isHost);

  var playerCount = state.players.length;
  var mode = 'solo';
  if (playerCount === 2) mode = 'vs';
  else if (playerCount === 3) mode = 'vs';
  else if (playerCount >= 4) mode = 'team';

  var seed = Math.floor(Math.random() * 999999) + 1;
  _csSeed = seed;

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

  csState = {
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
    turnTimeMs: CS_TURN_TIME_BASE,
    // Wind
    wind: 0,
    windForce: 0,
    // Streak & scoring
    streak: 0,
    bestStreak: 0,
    // Events
    nextEventAt: CS_EVENT_INTERVAL,
    pendingEvent: null,
    // Danger state
    danger: false,
  };

  state.players.forEach(function(p) {
    csState.scores[p.id] = 0;
    csState.totalScore[p.id] = 0;
  });

  showScreen('coinstackGame');
  loadCoinStackThree();
  _ensureFullscreenForGame();

  broadcast({
    type: 'game-start',
    game: 'coinstack',
    state: csState
  });

  _csWaitForThreeAndStart();
}

function _csWaitForThreeAndStart() {
  if (typeof initCoinStackThree === 'function' && document.getElementById('csThreeContainer')) {
    if (!document.getElementById('csThreeContainer').querySelector('canvas')) {
      initCoinStackThree('csThreeContainer');
    }
    _csPlayIntro();
  } else {
    setTimeout(_csWaitForThreeAndStart, 100);
  }
}

function _csPlayIntro() {
  _csIntroPlayed = false;
  _csEventActive = null;
  csRenderHUD();

  if (typeof csThreePlayIntro === 'function') {
    csThreePlayIntro(csState.seed, function() {
      _csIntroPlayed = true;
      if (state.isHost) {
        csState.phase = 'playing';
        _csUpdateWind(); // Initial wind
        csBroadcastState();
        csBeginTurn();
      } else {
        csState.phase = 'playing';
        csBeginTurn();
      }
    });
  } else {
    _csIntroPlayed = true;
    csState.phase = 'playing';
    if (state.isHost) {
      _csUpdateWind();
      csBroadcastState();
      csBeginTurn();
    } else {
      csBeginTurn();
    }
  }
}

// ===== BROADCAST STATE =====
function csBroadcastState() {
  broadcast({
    type: 'cs-state',
    state: {
      coins: csState.coins,
      turnIndex: csState.turnIndex,
      currentPlayer: csState.currentPlayer,
      phase: csState.phase,
      round: csState.round,
      loser: csState.loser,
      loserTeam: csState.loserTeam,
      lastStability: csState.lastStability,
      scores: csState.scores,
      totalScore: csState.totalScore,
      turnTimeMs: csState.turnTimeMs,
      wind: csState.wind,
      windForce: csState.windForce,
      streak: csState.streak,
      bestStreak: csState.bestStreak,
      pendingEvent: csState.pendingEvent,
      danger: csState.danger,
    }
  });
}

// ===== HANDLE STATE (client) =====
function csHandleState(msg) {
  if (!csState) return;
  var s = msg.state;
  csState.coins = s.coins;
  csState.turnIndex = s.turnIndex;
  csState.currentPlayer = s.currentPlayer;
  csState.phase = s.phase;
  csState.round = s.round;
  csState.loser = s.loser;
  csState.loserTeam = s.loserTeam;
  csState.lastStability = s.lastStability;
  csState.scores = s.scores;
  csState.totalScore = s.totalScore || s.scores;
  csState.turnTimeMs = s.turnTimeMs;
  csState.wind = s.wind || 0;
  csState.windForce = s.windForce || 0;
  csState.streak = s.streak || 0;
  csState.bestStreak = s.bestStreak || 0;
  csState.pendingEvent = s.pendingEvent || null;
  csState.danger = s.danger || false;

  if (typeof csThreeSetCoins === 'function') {
    var positions = csState.coins.map(function(c, i) {
      return { x: c.x, y: CS_COIN_H / 2 + i * CS_COIN_H, z: 0, ry: c.ry || 0 };
    });
    csThreeSetCoins(positions);
  }

  if (s.phase === 'gameover') {
    csShowResult();
  } else if (s.phase === 'playing') {
    csBeginTurn();
  }

  csRenderHUD();
}

// ===== BEGIN TURN =====
function csBeginTurn() {
  if (csState.phase !== 'playing') return;
  _csDropping = false;
  _csGhostX = 0;
  _csMyTurn = (csState.currentPlayer === state.myId);

  // Check for pending event
  _csEventActive = csState.pendingEvent;
  csState.pendingEvent = null;

  // Show event banner
  if (_csEventActive) {
    _csShowEventBanner(_csEventActive);
    // Apply event effects
    if (_csEventActive.id === 'quake' && typeof csThreeShake === 'function') {
      csThreeShake(0.2);
      if (typeof csThreeSetWobble === 'function') csThreeSetWobble(0.8);
      if (navigator.vibrate) navigator.vibrate([50, 30, 100, 30, 50]);
    }
  }

  // Determine effective max X (narrowed by event)
  var effectiveMaxX = CS_MAX_X;
  if (_csEventActive && _csEventActive.id === 'narrow') {
    effectiveMaxX = CS_MAX_X * 0.5;
  }

  // Update wind visual
  if (typeof csThreeSetWind === 'function') {
    var gustMult = (_csEventActive && _csEventActive.id === 'gust') ? 2.5 : 1;
    csThreeSetWind(csState.windForce * gustMult);
  }

  // Ghost coin
  if (typeof csThreeShowGhost === 'function') {
    csThreeShowGhost(_csMyTurn);
    if (_csMyTurn) csThreeSetGhostX(0);
  }

  // Wobble based on stability
  if (typeof csThreeSetWobble === 'function' && !(_csEventActive && _csEventActive.id === 'quake')) {
    csThreeSetWobble(1 - csState.lastStability);
  }

  // Danger state visual
  csState.danger = csState.lastStability < 0.3;
  if (typeof csThreeSetDanger === 'function') {
    csThreeSetDanger(csState.danger);
  }

  csRenderHUD();
  _csUpdateDropBtn();

  // Touch callback with effective limits
  if (typeof csThreeSetTouchCallback === 'function') {
    csThreeSetTouchCallback(function(x) {
      if (!_csMyTurn || _csDropping) return;
      _csGhostX = Math.max(-effectiveMaxX, Math.min(effectiveMaxX, x));
    });
  }

  // Turn timer
  _csClearTurnTimer();
  if (_csMyTurn && csState.mode !== 'solo') {
    _csStartTurnTimer();
  }
}

// ===== TURN TIMER =====
function _csStartTurnTimer() {
  var timeMs = csState.turnTimeMs;
  var startTime = Date.now();
  var timerBar = document.getElementById('csTurnTimerBar');
  var timerWrap = document.getElementById('csTurnTimerWrap');
  if (timerWrap) timerWrap.style.display = 'block';

  _csTurnTimer = setInterval(function() {
    var elapsed = Date.now() - startTime;
    var remaining = Math.max(0, timeMs - elapsed);
    var pct = remaining / timeMs;

    if (timerBar) {
      timerBar.style.width = (pct * 100) + '%';
      if (pct < 0.2) timerBar.style.background = '#ff2222';
      else if (pct < 0.5) timerBar.style.background = '#ffaa00';
      else timerBar.style.background = '#44ff88';
    }

    // Warning vibrate at 3 seconds
    if (remaining < 3000 && remaining > 2900 && navigator.vibrate) {
      navigator.vibrate(100);
    }

    if (remaining <= 0) {
      _csClearTurnTimer();
      if (_csMyTurn && !_csDropping) {
        csDropCoin();
      }
    }
  }, 50);
}

function _csClearTurnTimer() {
  if (_csTurnTimer) {
    clearInterval(_csTurnTimer);
    _csTurnTimer = null;
  }
  var timerWrap = document.getElementById('csTurnTimerWrap');
  if (timerWrap) timerWrap.style.display = 'none';
}

// ===== DROP COIN =====
function csDropCoin() {
  if (!_csMyTurn || _csDropping || csState.phase !== 'playing') return;
  _csDropping = true;
  _csClearTurnTimer();

  var x = _csGhostX;
  if (typeof csThreeShowGhost === 'function') csThreeShowGhost(false);

  if (state.isHost) {
    csProcessDrop(state.myId, x);
  } else {
    sendToHost({ type: 'cs-drop', x: x });
  }
}

// ===== PROCESS DROP (host only) =====
function csProcessDrop(playerId, x) {
  if (!state.isHost) return;
  if (playerId !== csState.currentPlayer) return;

  // --- Apply event modifiers ---
  var gustMult = (_csEventActive && _csEventActive.id === 'gust') ? 2.5 : 1;
  var effectiveMaxX = CS_MAX_X;
  if (_csEventActive && _csEventActive.id === 'narrow') effectiveMaxX = CS_MAX_X * 0.5;

  // Clamp x to effective range
  x = Math.max(-effectiveMaxX, Math.min(effectiveMaxX, x));

  // --- Apply wind displacement ---
  var windDisp = csState.windForce * gustMult;
  x += windDisp;

  // --- Apply landing jitter (increases with height) ---
  var coinCount = csState.coins.length;
  var jitter = (csRand() - 0.5) * (CS_JITTER_BASE + coinCount * CS_JITTER_PER_COIN);
  x += jitter;

  // Heavy coin event = wider jitter
  if (_csEventActive && _csEventActive.id === 'heavy') {
    x += (csRand() - 0.5) * 0.08;
  }

  // Final clamp
  x = Math.max(-CS_MAX_X * 1.1, Math.min(CS_MAX_X * 1.1, x));

  // Add coin
  var newCoin = { x: x, ry: csRand() * Math.PI * 2 };
  var testCoins = csState.coins.slice();
  testCoins.push(newCoin);

  // Check stability
  var result = csCheckStability(testCoins);

  if (result.stable) {
    // === SUCCESS ===
    csState.coins.push(newCoin);
    csState.lastStability = result.stability;
    csState.streak++;
    if (csState.streak > csState.bestStreak) csState.bestStreak = csState.streak;

    // Score calculation
    var absX = Math.abs(x);
    var baseScore = CS_SCORE_BASE + coinCount; // height bonus built-in
    var placement = 'normal';
    if (absX > CS_EDGE_THRESHOLD) {
      baseScore += CS_SCORE_EDGE_BONUS;
      placement = 'edge';
    } else if (absX < CS_CENTER_THRESHOLD) {
      baseScore += CS_SCORE_CENTER_BONUS;
      placement = 'center';
    }
    var multiplier = _csGetScoreMultiplier();
    var finalScore = Math.round(baseScore * multiplier);

    csState.scores[playerId] = (csState.scores[playerId] || 0) + 1;
    csState.totalScore[playerId] = (csState.totalScore[playerId] || 0) + finalScore;

    // Reduce turn time
    csState.turnTimeMs = Math.max(CS_TURN_TIME_MIN,
      CS_TURN_TIME_BASE - csState.coins.length * CS_TURN_TIME_DECAY);

    // Update wind for next turn
    _csUpdateWind();

    // Check for event on next turn
    var nextEvent = null;
    if (csState.coins.length >= csState.nextEventAt) {
      nextEvent = _csRollEvent();
      csState.nextEventAt += CS_EVENT_INTERVAL;
      // After 15 coins, events come faster
      if (csState.coins.length > 15) {
        csState.nextEventAt = csState.coins.length + 3;
      }
    }
    csState.pendingEvent = nextEvent;

    // Danger check
    csState.danger = result.stability < 0.3;

    // Advance turn
    csState.turnIndex = (csState.turnIndex + 1) % csState.turnOrder.length;
    csState.currentPlayer = csState.turnOrder[csState.turnIndex];
    if (csState.turnIndex === 0) csState.round++;

    broadcast({
      type: 'cs-drop-result',
      x: x,
      ry: newCoin.ry,
      stable: true,
      stability: result.stability,
      nextPlayer: csState.currentPlayer,
      turnIndex: csState.turnIndex,
      round: csState.round,
      scores: csState.scores,
      totalScore: csState.totalScore,
      turnTimeMs: csState.turnTimeMs,
      wind: csState.wind,
      windForce: csState.windForce,
      streak: csState.streak,
      bestStreak: csState.bestStreak,
      pendingEvent: nextEvent,
      danger: csState.danger,
      // Score display info
      scoreGained: finalScore,
      placement: placement,
      multiplier: multiplier,
    });

    _csAnimateDrop(x, newCoin.ry, true, result.stability, null, {
      score: finalScore, placement: placement, multiplier: multiplier,
    });
  } else {
    // === COLLAPSE! ===
    csState.loser = playerId;
    csState.phase = 'gameover';
    csState.streak = 0;

    if (csState.mode === 'team' && csState.teams) {
      if (csState.teams.A.indexOf(playerId) !== -1) {
        csState.loserTeam = 'A';
      } else {
        csState.loserTeam = 'B';
      }
    }

    csState.coins.push(newCoin);

    broadcast({
      type: 'cs-drop-result',
      x: x,
      ry: newCoin.ry,
      stable: false,
      collapseLevel: result.collapseLevel,
      direction: result.direction,
      loser: csState.loser,
      loserTeam: csState.loserTeam,
      scores: csState.scores,
      totalScore: csState.totalScore,
      bestStreak: csState.bestStreak,
    });

    _csAnimateDrop(x, newCoin.ry, false, 0, {
      collapseLevel: result.collapseLevel,
      direction: result.direction,
    }, null);
  }
}

// ===== HANDLE DROP RESULT (client) =====
function csHandleDropResult(msg) {
  if (!csState) return;

  if (msg.stable) {
    csState.coins.push({ x: msg.x, ry: msg.ry });
    csState.lastStability = msg.stability;
    csState.currentPlayer = msg.nextPlayer;
    csState.turnIndex = msg.turnIndex;
    csState.round = msg.round;
    csState.scores = msg.scores;
    csState.totalScore = msg.totalScore || msg.scores;
    csState.turnTimeMs = msg.turnTimeMs;
    csState.wind = msg.wind || 0;
    csState.windForce = msg.windForce || 0;
    csState.streak = msg.streak || 0;
    csState.bestStreak = msg.bestStreak || 0;
    csState.pendingEvent = msg.pendingEvent || null;
    csState.danger = msg.danger || false;

    _csAnimateDrop(msg.x, msg.ry, true, msg.stability, null, {
      score: msg.scoreGained, placement: msg.placement, multiplier: msg.multiplier,
    });
  } else {
    csState.coins.push({ x: msg.x, ry: msg.ry });
    csState.loser = msg.loser;
    csState.loserTeam = msg.loserTeam;
    csState.phase = 'gameover';
    csState.scores = msg.scores;
    csState.totalScore = msg.totalScore || msg.scores;
    csState.bestStreak = msg.bestStreak || 0;

    _csAnimateDrop(msg.x, msg.ry, false, 0, {
      collapseLevel: msg.collapseLevel,
      direction: msg.direction,
    }, null);
  }
}

// ===== ANIMATE DROP =====
function _csAnimateDrop(x, ry, isStable, stability, collapseInfo, scoreInfo) {
  var coinIndex = csState.coins.length - 1;
  var targetY = CS_COIN_H / 2 + coinIndex * CS_COIN_H;

  if (typeof csThreeDropCoin === 'function') {
    csThreeDropCoin(x, targetY, function() {
      if (isStable) {
        if (typeof csThreeSetWobble === 'function') {
          csThreeSetWobble(1 - stability);
        }

        // Show score popup
        if (scoreInfo && typeof csThreeShowScorePopup === 'function') {
          csThreeShowScorePopup(scoreInfo.score, scoreInfo.placement, scoreInfo.multiplier);
        }

        // Vibrate based on stability
        if (navigator.vibrate) {
          if (stability < 0.3) navigator.vibrate([50, 20, 80]);
          else if (stability < 0.5) navigator.vibrate(50);
          else navigator.vibrate(20);
        }

        // Camera follow
        if (typeof csThreeSetCameraHeight === 'function') {
          csThreeSetCameraHeight(Math.max(1.8, coinIndex * CS_COIN_H * 0.7 + 1.5));
        }

        setTimeout(function() {
          csBeginTurn();
          csRenderHUD();
        }, 350);
      } else {
        // Collapse!
        if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);

        if (typeof csThreeCollapse === 'function' && collapseInfo) {
          csThreeCollapse(collapseInfo.collapseLevel, collapseInfo.direction, function() {
            csShowResult();
          });
        } else {
          setTimeout(csShowResult, 500);
        }
      }
    });
  } else {
    if (!isStable) {
      setTimeout(csShowResult, 500);
    } else {
      if (scoreInfo) _csShowScoreDOM(scoreInfo.score, scoreInfo.placement, scoreInfo.multiplier);
      setTimeout(function() { csBeginTurn(); csRenderHUD(); }, 350);
    }
  }
}

// ===== SHOW EVENT BANNER =====
function _csShowEventBanner(evt) {
  var banner = document.getElementById('csEventBanner');
  if (!banner) return;
  banner.innerHTML = '<span class="cs-event-emoji">' + evt.emoji + '</span>' +
    '<span class="cs-event-name">' + escapeHTML(evt.name) + '</span>' +
    '<span class="cs-event-desc">' + escapeHTML(evt.desc) + '</span>';
  banner.classList.add('cs-event-show');
  setTimeout(function() {
    banner.classList.remove('cs-event-show');
  }, 2500);
}

// ===== SCORE POPUP (DOM fallback) =====
function _csShowScoreDOM(score, placement, multiplier) {
  var container = document.getElementById('csThreeContainer');
  if (!container) return;
  var el = document.createElement('div');
  el.className = 'cs-score-popup';
  var text = '+' + score;
  if (placement === 'center') text += ' PERFECT!';
  else if (placement === 'edge') text += ' RISKY!';
  if (multiplier > 1) text += ' x' + multiplier.toFixed(1);
  el.textContent = text;
  container.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
}

// ===== SHOW RESULT =====
function csShowResult() {
  _csClearTurnTimer();
  var overlay = document.getElementById('csResultOverlay');
  if (!overlay) return;

  var loserName = '';
  var winnerNames = [];
  var isSolo = csState.mode === 'solo';
  var coinCount = csState.coins.length - 1;
  var bestStreak = csState.bestStreak || 0;

  if (isSolo) {
    var myScore = csState.totalScore[state.myId] || 0;
    // Grade based on coins stacked
    var grade = '🥉';
    var gradeText = 'Good';
    if (coinCount >= 25) { grade = '👑'; gradeText = 'LEGENDARY!'; }
    else if (coinCount >= 20) { grade = '💎'; gradeText = 'AMAZING!'; }
    else if (coinCount >= 15) { grade = '🥇'; gradeText = 'GREAT!'; }
    else if (coinCount >= 10) { grade = '🥈'; gradeText = 'NICE!'; }

    overlay.innerHTML =
      '<div class="cs-result-card">' +
        '<div class="cs-result-emoji">' + grade + '</div>' +
        '<div class="cs-result-title">' + gradeText + '</div>' +
        '<div class="cs-result-score">' + coinCount + '개 쌓기 성공!</div>' +
        '<div class="cs-result-stats">' +
          '<div class="cs-stat"><span class="cs-stat-label">총 점수</span><span class="cs-stat-val">' + myScore.toLocaleString() + '</span></div>' +
          '<div class="cs-stat"><span class="cs-stat-label">최고 연속</span><span class="cs-stat-val">' + bestStreak + '개</span></div>' +
        '</div>' +
        '<div class="cs-result-buttons">' +
          (state.isHost ? '<button class="cs-btn cs-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="cs-btn cs-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else if (csState.mode === 'team') {
    var loserTeamLabel = csState.loserTeam === 'A' ? 'A팀' : 'B팀';
    var winnerTeamLabel = csState.loserTeam === 'A' ? 'B팀' : 'A팀';
    var winnerTeam = csState.loserTeam === 'A' ? csState.teams.B : csState.teams.A;
    winnerNames = winnerTeam.map(function(id) {
      var p = state.players.find(function(pp) { return pp.id === id; });
      return p ? p.name : '???';
    });
    var loserPlayer = state.players.find(function(p) { return p.id === csState.loser; });
    loserName = loserPlayer ? loserPlayer.name : '???';

    overlay.innerHTML =
      '<div class="cs-result-card">' +
        '<div class="cs-result-emoji">🏆</div>' +
        '<div class="cs-result-title">' + escapeHTML(winnerTeamLabel) + ' 승리!</div>' +
        '<div class="cs-result-score">' + escapeHTML(winnerNames.join(' & ')) + '</div>' +
        '<div class="cs-result-subtitle">' + escapeHTML(loserName) + '(' + escapeHTML(loserTeamLabel) + ')이 무너뜨림! (' + coinCount + '개)</div>' +
        _csRenderScoreboard() +
        '<div class="cs-result-buttons">' +
          (state.isHost ? '<button class="cs-btn cs-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="cs-btn cs-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else {
    var loserPlayer2 = state.players.find(function(p) { return p.id === csState.loser; });
    loserName = loserPlayer2 ? loserPlayer2.name : '???';

    overlay.innerHTML =
      '<div class="cs-result-card">' +
        '<div class="cs-result-emoji">' + (csState.loser === state.myId ? '💀' : '🏆') + '</div>' +
        '<div class="cs-result-title">' +
          (csState.loser === state.myId ? '패배...' : '승리!') +
        '</div>' +
        '<div class="cs-result-score">' + escapeHTML(loserName) + ' 탈락!</div>' +
        '<div class="cs-result-subtitle">' + coinCount + '개에서 무너짐</div>' +
        _csRenderScoreboard() +
        '<div class="cs-result-buttons">' +
          (state.isHost ? '<button class="cs-btn cs-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="cs-btn cs-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  }

  overlay.style.display = 'flex';
  overlay.classList.add('cs-result-show');
}

function _csRenderScoreboard() {
  if (!csState || !csState.totalScore) return '';
  var html = '<div class="cs-scoreboard">';
  var sorted = state.players.slice().sort(function(a, b) {
    return (csState.totalScore[b.id] || 0) - (csState.totalScore[a.id] || 0);
  });
  sorted.forEach(function(p, rank) {
    var isLoser = p.id === csState.loser;
    var rankEmoji = rank === 0 ? '🥇' : (rank === 1 ? '🥈' : '🥉');
    html += '<div class="cs-score-row' + (isLoser ? ' loser' : '') + '">' +
      '<span class="cs-score-rank">' + rankEmoji + '</span>' +
      '<span class="cs-score-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="cs-score-name">' + escapeHTML(p.name) + '</span>' +
      '<span class="cs-score-detail">' + (csState.scores[p.id] || 0) + '개</span>' +
      '<span class="cs-score-val">' + (csState.totalScore[p.id] || 0).toLocaleString() + 'pt</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// ===== RENDER HUD =====
function csRenderHUD() {
  if (!csState) return;

  // Turn indicator
  var turnEl = document.getElementById('csTurnIndicator');
  if (turnEl) {
    if (csState.phase === 'intro') {
      turnEl.innerHTML = '<div class="cs-turn-text">준비 중...</div>';
    } else if (csState.phase === 'gameover') {
      turnEl.innerHTML = '';
    } else {
      var cp = state.players.find(function(p) { return p.id === csState.currentPlayer; });
      var isMe = csState.currentPlayer === state.myId;
      var nameStr = isMe ? 'MY TURN!' : (cp ? cp.name : '???');
      var avatarStr = cp ? cp.avatar : '🪙';
      var streakLabel = _csGetStreakLabel();

      turnEl.innerHTML =
        '<div class="cs-turn-avatar">' + escapeHTML(avatarStr) + '</div>' +
        '<div class="cs-turn-text' + (isMe ? ' my-turn' : '') + '">' + escapeHTML(nameStr) + '</div>' +
        (streakLabel ? '<div class="cs-streak-badge">' + streakLabel + '</div>' : '');
    }
  }

  // Coin count
  var countEl = document.getElementById('csCoinCount');
  if (countEl) countEl.textContent = csState.coins.length + '개';

  // Round
  var roundEl = document.getElementById('csRoundNum');
  if (roundEl && csState.mode !== 'solo') {
    roundEl.textContent = csState.round + 'R';
  }

  // Stability meter
  var meterEl = document.getElementById('csStabilityBar');
  if (meterEl) {
    var pct = csState.lastStability * 100;
    meterEl.style.width = pct + '%';
    if (pct < 20) meterEl.style.background = '#ff2222';
    else if (pct < 40) meterEl.style.background = '#ff6600';
    else if (pct < 60) meterEl.style.background = '#ffaa00';
    else meterEl.style.background = '#44ff88';
  }

  // Wind indicator
  var windEl = document.getElementById('csWindIndicator');
  if (windEl) {
    var wf = csState.windForce || 0;
    var absWind = Math.abs(wf);
    var windDir = wf > 0 ? '→' : (wf < 0 ? '←' : '·');
    var windStrength = '';
    if (absWind > 0.25) windStrength = '강풍';
    else if (absWind > 0.12) windStrength = '바람';
    else if (absWind > 0.04) windStrength = '미풍';
    else windStrength = '고요';

    var windBars = Math.min(5, Math.floor(absWind * 15));
    var barStr = '';
    for (var i = 0; i < 5; i++) {
      barStr += '<span class="cs-wind-bar' + (i < windBars ? ' active' : '') + '"></span>';
    }

    windEl.innerHTML = '<span class="cs-wind-dir">' + windDir + '</span>' +
      '<span class="cs-wind-bars">' + barStr + '</span>' +
      '<span class="cs-wind-label">' + windStrength + '</span>';
    windEl.style.display = 'flex';
  }

  // Score display
  var scoreEl = document.getElementById('csMyScore');
  if (scoreEl) {
    var myScore = csState.totalScore[state.myId] || 0;
    scoreEl.textContent = myScore.toLocaleString() + 'pt';
  }

  // Danger overlay
  var gameEl = document.getElementById('coinstackGame');
  if (gameEl) {
    if (csState.danger) {
      gameEl.classList.add('cs-danger-active');
    } else {
      gameEl.classList.remove('cs-danger-active');
    }
  }

  // Player bar
  _csRenderPlayerBar();
}

function _csRenderPlayerBar() {
  var bar = document.getElementById('csPlayersBar');
  if (!bar || !csState) return;
  if (csState.mode === 'solo') { bar.innerHTML = ''; return; }

  var html = '';
  var order = csState.turnOrder;
  for (var i = 0; i < order.length; i++) {
    var pid = order[i];
    var p = state.players.find(function(pp) { return pp.id === pid; });
    if (!p) continue;
    var isCurrent = pid === csState.currentPlayer;
    var teamClass = '';
    if (csState.mode === 'team' && csState.teams) {
      teamClass = csState.teams.A.indexOf(pid) !== -1 ? ' team-a' : ' team-b';
    }
    html += '<div class="cs-player-chip' + (isCurrent ? ' active' : '') + teamClass + '">' +
      '<span class="cs-chip-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="cs-chip-score">' + (csState.totalScore[pid] || 0) + 'pt</span>' +
    '</div>';
  }
  bar.innerHTML = html;
}

// ===== DROP BUTTON =====
function _csUpdateDropBtn() {
  var btn = document.getElementById('csDropBtn');
  if (!btn) return;
  if (_csMyTurn && !_csDropping && csState.phase === 'playing') {
    btn.style.display = 'block';
    btn.classList.add('cs-drop-ready');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('cs-drop-ready');
  }
}

// ===== EMOJI SYSTEM =====
function csSendEmoji(emoji) {
  if (_csEmojiCooldown) return;
  _csEmojiCooldown = true;
  setTimeout(function() { _csEmojiCooldown = false; }, 1500);
  if (typeof csThreeShowEmoji === 'function') csThreeShowEmoji(emoji);
  broadcast({ type: 'cs-emoji', emoji: emoji, from: state.myId });
}

function csHandleEmoji(msg) {
  if (typeof csThreeShowEmoji === 'function') csThreeShowEmoji(msg.emoji);
  if (navigator.vibrate) navigator.vibrate(50);
}

function csToggleEmojiPanel() {
  var panel = document.getElementById('csEmojiPanel');
  if (!panel) return;
  panel.classList.toggle('cs-emoji-open');
}

// ===== RENDER COINSTACK VIEW (from handleGameStart) =====
function renderCoinStackView(s) {
  if (!csState) {
    csState = {
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
      turnTimeMs: s.turnTimeMs || CS_TURN_TIME_BASE,
      wind: s.wind || 0,
      windForce: s.windForce || 0,
      streak: s.streak || 0,
      bestStreak: s.bestStreak || 0,
      pendingEvent: s.pendingEvent || null,
      nextEventAt: s.nextEventAt || CS_EVENT_INTERVAL,
      danger: s.danger || false,
    };
  }
  _csSeed = csState.seed;
  loadCoinStackThree();
  _csWaitForThreeAndStart();
}

// ===== CLEANUP =====
function closeCoinStackCleanup() {
  _csClearTurnTimer();
  _csTimers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
  _csTimers = [];
  _csDropping = false;
  _csMyTurn = false;
  _csIntroPlayed = false;
  _csEventActive = null;

  if (typeof destroyCoinStackThree === 'function') destroyCoinStackThree();

  var overlay = document.getElementById('csResultOverlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('cs-result-show'); }

  var gameEl = document.getElementById('coinstackGame');
  if (gameEl) gameEl.classList.remove('cs-danger-active');

  csState = null;
  _csView = null;
}

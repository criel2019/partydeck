// =============================================
// COIN SWING (코인 스윙) - 3D Timing-Based Coin Stacking
// Coin swings left-right, drop at the right timing!
// Deterministic physics, P2P multiplayer
// Solo / 1v1 / 2v2 modes
// =============================================

// ===== THREE.JS LOADER =====
var _swThreeLoaded = false;
function loadCoinSwingThree() {
  if (_swThreeLoaded) return;
  _swThreeLoaded = true;

  function onScriptsReady() {
    var container = document.getElementById('swThreeContainer');
    if (container && typeof initCoinSwingThree === 'function') {
      initCoinSwingThree('swThreeContainer');
    }
  }

  function loadCoinSwingScene() {
    var s = document.createElement('script');
    s.src = 'js/coinswing-three.js?v=20260312e';
    s.onload = onScriptsReady;
    s.onerror = function() { _swThreeLoaded = false; };
    document.head.appendChild(s);
  }

  if (window.THREE) {
    loadCoinSwingScene();
    return;
  }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = loadCoinSwingScene;
  s1.onerror = function() { _swThreeLoaded = false; };
  document.head.appendChild(s1);
}

// ===== CONSTANTS =====
var SW_COIN_R = 0.44;
var SW_COIN_H = 0.07;
var SW_BASE_STABILITY = 0.85;
var SW_MIN_STABILITY_THRESHOLD = 0.08;
var SW_MAX_X = 1.2;

// Swing mechanics
var SW_SWING_SPEED_BASE = 1.8;      // base oscillation speed (radians/sec)
var SW_SWING_SPEED_MAX = 6.0;       // max oscillation speed
var SW_SWING_SPEED_INCR = 0.12;     // speed increase per coin
var SW_SWING_WIDTH_BASE = 1.0;      // base swing amplitude
var SW_SWING_WIDTH_MIN = 0.6;       // min swing width (gets narrower)
var SW_SWING_WIDTH_DECAY = 0.012;   // width decrease per coin
var SW_SWING_PATTERN_CHANGE = 8;    // coins before pattern change

// Scoring
var SW_SCORE_BASE = 10;
var SW_SCORE_CENTER_BONUS = 20;
var SW_SCORE_EDGE_PENALTY = -5;
var SW_CENTER_THRESHOLD = 0.15;
var SW_EDGE_THRESHOLD = 0.7;

// Jitter
var SW_JITTER_BASE = 0.005;
var SW_JITTER_PER_COIN = 0.005;

var SW_EMOJIS = ['😂','🤣','😱','💀','🔥','👏','😈','🤡','💩','🙏','😭','🫣'];

// ===== STATE =====
var swState = null;
var _swTimers = [];
var _swMyTurn = false;
var _swDropping = false;
var _swIntroPlayed = false;
var _swEmojiCooldown = false;

// Swing animation state
var _swSwingAngle = 0;
var _swSwingSpeed = SW_SWING_SPEED_BASE;
var _swSwingWidth = SW_SWING_WIDTH_BASE;
var _swSwingPattern = 0; // 0=simple sine, 1=irregular, 2=reverse, 3=pause-and-rush
var _swSwingPaused = false;
var _swSwingPauseTimer = 0;
var _swSwingRafId = null;
var _swLastSwingTime = 0;
var _swCurrentSwingX = 0;

// CPU/AI state
var _swCpuTimer = null;
var _swCpuSwingRafId = null;

// ===== SEEDED PRNG =====
var _swSeed = 0;
function swRand() {
  _swSeed = (_swSeed * 1103515245 + 12345) & 0x7fffffff;
  return _swSeed / 0x7fffffff;
}

// ===== DIFFICULTY =====
function _swGetMaxOffset(level) {
  var penalty = Math.pow(level, 1.5) * 0.004;
  var stability = Math.max(SW_MIN_STABILITY_THRESHOLD, SW_BASE_STABILITY - penalty);
  return SW_COIN_R * stability;
}

// ===== STABILITY CHECK =====
function swCheckStability(coins) {
  if (coins.length <= 1) return { stable: true, stability: 1.0, collapseLevel: -1, direction: 0 };

  var worstRatio = 0;
  var collapseLevel = -1;
  var collapseDir = 0;

  for (var i = 0; i < coins.length; i++) {
    var cmX = 0;
    var count = coins.length - i;
    for (var j = i; j < coins.length; j++) {
      cmX += coins[j].x;
    }
    cmX /= count;

    var supportX = (i === 0) ? 0 : coins[i - 1].x;
    var offset = Math.abs(cmX - supportX);
    var maxOffset = _swGetMaxOffset(i);

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

// ===== TEAM HELPERS =====
function _swGetPlayerTeam(playerId) {
  if (!swState || !swState.teams) return null;
  if (swState.teams.A.indexOf(playerId) !== -1) return 'A';
  if (swState.teams.B.indexOf(playerId) !== -1) return 'B';
  return null;
}

function _swGetMyTeam() {
  return _swGetPlayerTeam(state.myId);
}

function _swGetTeamCoins(team) {
  return team === 'A' ? swState.coinsA : swState.coinsB;
}

function _swGetTeamStability(team) {
  return team === 'A' ? swState.stabilityA : swState.stabilityB;
}

// Team peek state
var _swPeeking = false;
var _swPeekTimer = null;

function swPeekOpponent() {
  if (!swState || swState.mode !== 'team' || _swPeeking) return;
  _swPeeking = true;
  var myTeam = _swGetMyTeam();
  var oppTeam = myTeam === 'A' ? 'B' : 'A';
  if (typeof swThreePeekTeam === 'function') swThreePeekTeam(oppTeam);

  // Update peek button
  var btn = document.getElementById('swPeekBtn');
  if (btn) { btn.textContent = '돌아가기'; btn.onclick = swReturnFromPeek; }

  // Auto-return after 3 seconds
  if (_swPeekTimer) clearTimeout(_swPeekTimer);
  _swPeekTimer = setTimeout(swReturnFromPeek, 3000);
}

function swReturnFromPeek() {
  if (!_swPeeking) return;
  _swPeeking = false;
  if (_swPeekTimer) { clearTimeout(_swPeekTimer); _swPeekTimer = null; }
  if (typeof swThreeReturnToMyTeam === 'function') swThreeReturnToMyTeam();

  var btn = document.getElementById('swPeekBtn');
  if (btn) { btn.textContent = '상대팀 보기'; btn.onclick = swPeekOpponent; }
}

// ===== SWING MECHANICS =====
function _swUpdateSwingParams() {
  var coinCount;
  if (swState.mode === 'team') {
    // Use the larger stack's count for difficulty
    coinCount = Math.max(swState.coinsA.length, swState.coinsB.length);
  } else {
    coinCount = swState.coins.length;
  }

  // Speed increases with coins
  _swSwingSpeed = Math.min(SW_SWING_SPEED_MAX,
    SW_SWING_SPEED_BASE + coinCount * SW_SWING_SPEED_INCR);

  // Width decreases slightly
  _swSwingWidth = Math.max(SW_SWING_WIDTH_MIN,
    SW_SWING_WIDTH_BASE - coinCount * SW_SWING_WIDTH_DECAY);

  // Pattern changes periodically
  if (coinCount > 0 && coinCount % SW_SWING_PATTERN_CHANGE === 0) {
    _swSwingPattern = (_swSwingPattern + 1) % 4;
  }
}

function _swGetSwingX(time) {
  var speed = _swSwingSpeed;
  var width = _swSwingWidth;

  switch (_swSwingPattern) {
    case 0: // Simple sine
      return Math.sin(time * speed) * width;
    case 1: // Irregular (two frequencies combined)
      return (Math.sin(time * speed) * 0.6 + Math.sin(time * speed * 1.7 + 1.0) * 0.4) * width;
    case 2: // Reverse direction periodically
      var phase = Math.floor(time * speed / (Math.PI * 2));
      var dir = phase % 2 === 0 ? 1 : -1;
      return Math.sin(time * speed) * width * dir;
    case 3: // Pause-and-rush
      var cycle = (time * speed) % (Math.PI * 2);
      if (cycle < Math.PI * 0.3) {
        // Pause phase - move slowly
        return Math.sin(time * speed * 0.3) * width * 0.4;
      } else {
        // Rush phase - move fast
        return Math.sin(time * speed * 1.8) * width;
      }
    default:
      return Math.sin(time * speed) * width;
  }
}

function _swStartSwingLoop() {
  _swStopSwingLoop();
  _swLastSwingTime = performance.now() / 1000;
  _swSwingAngle = 0;

  function swingStep() {
    if (!swState || swState.phase !== 'playing') return;

    var now = performance.now() / 1000;
    var dt = now - _swLastSwingTime;
    _swLastSwingTime = now;
    _swSwingAngle += dt;

    if (_swMyTurn && !_swDropping) {
      _swCurrentSwingX = _swGetSwingX(_swSwingAngle);

      // Update ghost position via Three.js
      if (typeof swThreeSetGhostX === 'function') {
        swThreeSetGhostX(_swCurrentSwingX);
      }
    }

    _swSwingRafId = requestAnimationFrame(swingStep);
  }

  _swSwingRafId = requestAnimationFrame(swingStep);
}

function _swStopSwingLoop() {
  if (_swSwingRafId) {
    cancelAnimationFrame(_swSwingRafId);
    _swSwingRafId = null;
  }
}

// ===== SCORING =====
function _swGetScoreMultiplier() {
  var mult = 1;
  if (swState.streak >= 8) mult = 3.0;
  else if (swState.streak >= 5) mult = 2.0;
  else if (swState.streak >= 3) mult = 1.5;
  return mult;
}

function _swGetStreakLabel() {
  if (swState.streak >= 8) return 'MASTER!';
  if (swState.streak >= 5) return 'ON FIRE!';
  if (swState.streak >= 3) return 'STREAK!';
  return '';
}

// ===== START GAME =====
function startCoinSwing() {
  console.log('[CoinSwing] startCoinSwing called. isHost:', state.isHost);

  var playerCount = state.players.length;
  var mode = 'solo';
  if (playerCount === 2) mode = 'vs';
  else if (playerCount === 3) mode = 'vs';
  else if (playerCount >= 4) mode = 'team';

  var seed = Math.floor(Math.random() * 999999) + 1;
  _swSeed = seed;

  var turnOrder = [];
  var teamData = null;
  if (mode === 'team') {
    // Distribute players evenly into two teams
    var half = Math.ceil(playerCount / 2);
    var teamA = [];
    var teamB = [];
    for (var ti = 0; ti < playerCount; ti++) {
      if (ti < half) teamA.push(state.players[ti].id);
      else teamB.push(state.players[ti].id);
    }
    // Interleave turn order: A0, B0, A1, B1, ...
    var maxLen = Math.max(teamA.length, teamB.length);
    for (var tj = 0; tj < maxLen; tj++) {
      if (tj < teamA.length) turnOrder.push(teamA[tj]);
      if (tj < teamB.length) turnOrder.push(teamB[tj]);
    }
    teamData = { A: teamA, B: teamB };
  } else if (mode === 'solo') {
    turnOrder = [state.myId];
  } else {
    turnOrder = state.players.map(function(p) { return p.id; });
  }

  swState = {
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
    teams: teamData,
    lastStability: 1.0,
    scores: {},
    totalScore: {},
    streak: 0,
    bestStreak: 0,
    danger: false,
    swingSpeed: SW_SWING_SPEED_BASE,
    swingPattern: 0,
    // Team battle mode
    coinsA: [],
    coinsB: [],
    stabilityA: 1.0,
    stabilityB: 1.0,
    dangerA: false,
    dangerB: false,
    streakA: 0,
    streakB: 0,
  };

  state.players.forEach(function(p) {
    swState.scores[p.id] = 0;
    swState.totalScore[p.id] = 0;
  });

  showScreen('coinswingGame');
  loadCoinSwingThree();
  _ensureFullscreenForGame();

  broadcast({
    type: 'game-start',
    game: 'coinswing',
    state: swState
  });

  _swWaitForThreeAndStart();
}

function _swWaitForThreeAndStart() {
  if (typeof initCoinSwingThree === 'function' && document.getElementById('swThreeContainer')) {
    if (!document.getElementById('swThreeContainer').querySelector('canvas')) {
      initCoinSwingThree('swThreeContainer');
    }
    // Set up team mode in Three.js if needed
    if (swState.mode === 'team' && typeof swThreeSetupTeamMode === 'function') {
      var myTeam = _swGetMyTeam();
      swThreeSetupTeamMode(myTeam || 'A');
      // Show peek button
      var peekBtn = document.getElementById('swPeekBtn');
      if (peekBtn) peekBtn.style.display = 'block';
    }
    _swPlayIntro();
  } else {
    setTimeout(_swWaitForThreeAndStart, 100);
  }
}

function _swPlayIntro() {
  _swIntroPlayed = false;
  swRenderHUD();

  if (typeof swThreePlayIntro === 'function') {
    swThreePlayIntro(swState.seed, function() {
      _swIntroPlayed = true;
      if (state.isHost) {
        swState.phase = 'playing';
        swBroadcastState();
        swBeginTurn();
      } else {
        swState.phase = 'playing';
        swBeginTurn();
      }
    });
  } else {
    _swIntroPlayed = true;
    swState.phase = 'playing';
    if (state.isHost) {
      swBroadcastState();
      swBeginTurn();
    } else {
      swBeginTurn();
    }
  }
}

// ===== BROADCAST STATE =====
function swBroadcastState() {
  broadcast({
    type: 'sw-state',
    state: {
      coins: swState.coins,
      coinsA: swState.coinsA,
      coinsB: swState.coinsB,
      turnIndex: swState.turnIndex,
      currentPlayer: swState.currentPlayer,
      phase: swState.phase,
      round: swState.round,
      loser: swState.loser,
      loserTeam: swState.loserTeam,
      lastStability: swState.lastStability,
      stabilityA: swState.stabilityA,
      stabilityB: swState.stabilityB,
      dangerA: swState.dangerA,
      dangerB: swState.dangerB,
      streakA: swState.streakA,
      streakB: swState.streakB,
      scores: swState.scores,
      totalScore: swState.totalScore,
      streak: swState.streak,
      bestStreak: swState.bestStreak,
      danger: swState.danger,
      swingSpeed: _swSwingSpeed,
      swingPattern: _swSwingPattern,
    }
  });
}

// ===== HANDLE STATE (client) =====
function swHandleState(msg) {
  if (!swState) return;
  var s = msg.state;
  swState.coins = s.coins;
  swState.coinsA = s.coinsA || [];
  swState.coinsB = s.coinsB || [];
  swState.turnIndex = s.turnIndex;
  swState.currentPlayer = s.currentPlayer;
  swState.phase = s.phase;
  swState.round = s.round;
  swState.loser = s.loser;
  swState.loserTeam = s.loserTeam;
  swState.lastStability = s.lastStability;
  swState.stabilityA = s.stabilityA || 1.0;
  swState.stabilityB = s.stabilityB || 1.0;
  swState.dangerA = s.dangerA || false;
  swState.dangerB = s.dangerB || false;
  swState.streakA = s.streakA || 0;
  swState.streakB = s.streakB || 0;
  swState.scores = s.scores;
  swState.totalScore = s.totalScore || s.scores;
  swState.streak = s.streak || 0;
  swState.bestStreak = s.bestStreak || 0;
  swState.danger = s.danger || false;
  _swSwingSpeed = s.swingSpeed || SW_SWING_SPEED_BASE;
  _swSwingPattern = s.swingPattern || 0;

  // Set coins in Three.js
  if (swState.mode === 'team' && typeof swThreeSetCoinsTeam === 'function') {
    ['A', 'B'].forEach(function(t) {
      var coins = t === 'A' ? swState.coinsA : swState.coinsB;
      var positions = coins.map(function(c, i) {
        return { x: c.x, y: SW_COIN_H / 2 + i * SW_COIN_H, z: 0, ry: c.ry || 0 };
      });
      swThreeSetCoinsTeam(t, positions);
    });
  } else if (typeof swThreeSetCoins === 'function') {
    var positions = swState.coins.map(function(c, i) {
      return { x: c.x, y: SW_COIN_H / 2 + i * SW_COIN_H, z: 0, ry: c.ry || 0 };
    });
    swThreeSetCoins(positions);
  }

  if (s.phase === 'gameover') {
    swShowResult();
  } else if (s.phase === 'playing') {
    swBeginTurn();
  }

  swRenderHUD();
}

// ===== BEGIN TURN =====
function swBeginTurn() {
  if (swState.phase !== 'playing') return;
  _swDropping = false;
  _swStopCpuTurn();
  _swMyTurn = (swState.currentPlayer === state.myId);

  _swUpdateSwingParams();

  // Team mode: set ghost to current player's team
  if (swState.mode === 'team') {
    var currentTeam = _swGetPlayerTeam(swState.currentPlayer);
    if (typeof swThreeSetGhostTeam === 'function' && currentTeam) {
      swThreeSetGhostTeam(currentTeam);
    }
    // Return from peek if we were peeking
    if (_swPeeking) swReturnFromPeek();
  }

  // Ghost coin
  if (typeof swThreeShowGhost === 'function') {
    swThreeShowGhost(_swMyTurn);
    if (_swMyTurn) swThreeSetGhostX(0);
  }

  // Wobble based on stability
  var stability = swState.mode === 'team'
    ? _swGetTeamStability(_swGetPlayerTeam(swState.currentPlayer) || 'A')
    : swState.lastStability;
  if (typeof swThreeSetWobble === 'function') {
    swThreeSetWobble(1 - stability);
  }

  // Danger state
  if (swState.mode === 'team') {
    var myTeam = _swGetMyTeam();
    swState.danger = myTeam ? (_swGetTeamStability(myTeam) < 0.3) : false;
  } else {
    swState.danger = swState.lastStability < 0.3;
  }
  if (typeof swThreeSetDanger === 'function') {
    swThreeSetDanger(swState.danger);
  }

  swRenderHUD();
  _swUpdateDropBtn();

  // Start swinging
  if (_swMyTurn) {
    _swStartSwingLoop();
  }

  // CPU/AI turn: host auto-drops after a delay
  var isCpuTurn = swState.currentPlayer && swState.currentPlayer.toString().indexOf('ai-') === 0;
  if (isCpuTurn && state.isHost) {
    _swStartCpuTurn();
  }
}

// ===== CPU/AI TURN =====
function _swStartCpuTurn() {
  _swStopCpuTurn();
  if (!swState || swState.phase !== 'playing') return;
  if (!state.isHost) return;

  var cpuId = swState.currentPlayer;
  if (!cpuId || cpuId.toString().indexOf('ai-') !== 0) return;

  // CPU swing simulation: swing the ghost visually, then drop after a delay
  var cpuSwingAngle = 0;
  var cpuSwingStart = performance.now() / 1000;

  // Determine CPU skill: how close to center they aim (0 = perfect, 1 = random)
  var team = swState.mode === 'team' ? _swGetPlayerTeam(cpuId) : null;
  var teamCoins = team ? _swGetTeamCoins(team) : swState.coins;
  var coinCount = teamCoins.length;
  // CPU gets worse as stack gets taller (more random)
  var skill = Math.max(0.15, 0.7 - coinCount * 0.02);

  // Pick a target X: aim somewhat near center with some randomness
  var targetX = (Math.random() - 0.5) * _swSwingWidth * (1 - skill);

  // Decide how long to wait before dropping (0.8 to 2.5 seconds)
  var dropDelay = 800 + Math.random() * 1700;

  // Show ghost swinging for CPU
  if (typeof swThreeShowGhost === 'function') {
    swThreeShowGhost(true);
    if (typeof swThreeSetGhostX === 'function') swThreeSetGhostX(0);
  }

  // Animate swing visually for CPU
  function cpuSwingStep() {
    if (!swState || swState.phase !== 'playing') return;
    if (swState.currentPlayer !== cpuId) return;
    var now = performance.now() / 1000;
    cpuSwingAngle = now - cpuSwingStart;
    var x = _swGetSwingX(cpuSwingAngle);
    if (typeof swThreeSetGhostX === 'function') swThreeSetGhostX(x);
    _swCpuSwingRafId = requestAnimationFrame(cpuSwingStep);
  }
  _swCpuSwingRafId = requestAnimationFrame(cpuSwingStep);

  // After delay, find X closest to target and drop
  _swCpuTimer = setTimeout(function() {
    if (!swState || swState.phase !== 'playing') return;
    if (swState.currentPlayer !== cpuId) return;

    // Stop CPU swing animation
    if (_swCpuSwingRafId) { cancelAnimationFrame(_swCpuSwingRafId); _swCpuSwingRafId = null; }

    // Use current swing position (approximate target)
    var now = performance.now() / 1000;
    var finalAngle = now - cpuSwingStart;
    var dropX = _swGetSwingX(finalAngle);

    // Nudge toward target for skill factor
    dropX = dropX * (1 - skill * 0.5) + targetX * skill * 0.5;

    if (typeof swThreeShowGhost === 'function') swThreeShowGhost(false);
    swProcessDrop(cpuId, dropX);
  }, dropDelay);
}

function _swStopCpuTurn() {
  if (_swCpuTimer) { clearTimeout(_swCpuTimer); _swCpuTimer = null; }
  if (_swCpuSwingRafId) { cancelAnimationFrame(_swCpuSwingRafId); _swCpuSwingRafId = null; }
}

// ===== DROP COIN =====
function swDropCoin() {
  if (!_swMyTurn || _swDropping || swState.phase !== 'playing') return;
  _swDropping = true;
  _swStopSwingLoop();
  _swStopCpuTurn();

  var x = _swCurrentSwingX;
  if (typeof swThreeShowGhost === 'function') swThreeShowGhost(false);

  if (state.isHost) {
    swProcessDrop(state.myId, x);
  } else {
    sendToHost({ type: 'sw-drop', x: x });
  }
}

// ===== PROCESS DROP (host only) =====
function swProcessDrop(playerId, x) {
  if (!state.isHost) return;
  if (playerId !== swState.currentPlayer) return;

  // Determine team
  var team = swState.mode === 'team' ? _swGetPlayerTeam(playerId) : null;
  var teamCoins = team ? _swGetTeamCoins(team) : swState.coins;

  // Clamp x
  x = Math.max(-SW_MAX_X, Math.min(SW_MAX_X, x));

  // Landing jitter
  var coinCount = teamCoins.length;
  var jitter = (swRand() - 0.5) * (SW_JITTER_BASE + coinCount * SW_JITTER_PER_COIN);
  x += jitter;

  // Final clamp
  x = Math.max(-SW_MAX_X * 1.1, Math.min(SW_MAX_X * 1.1, x));

  // Add coin
  var newCoin = { x: x, ry: swRand() * Math.PI * 2 };
  var testCoins = teamCoins.slice();
  testCoins.push(newCoin);

  // Check stability
  var result = swCheckStability(testCoins);

  if (result.stable) {
    // === SUCCESS ===
    teamCoins.push(newCoin);

    // Update stability
    if (team) {
      if (team === 'A') { swState.stabilityA = result.stability; }
      else { swState.stabilityB = result.stability; }
      // Team streak
      if (team === 'A') { swState.streakA++; }
      else { swState.streakB++; }
    } else {
      swState.lastStability = result.stability;
      swState.streak++;
      if (swState.streak > swState.bestStreak) swState.bestStreak = swState.streak;
    }

    // Score calculation - reward center placement
    var absX = Math.abs(x);
    var baseScore = SW_SCORE_BASE + coinCount;
    var placement = 'normal';
    if (absX < SW_CENTER_THRESHOLD) {
      baseScore += SW_SCORE_CENTER_BONUS;
      placement = 'perfect';
    } else if (absX > SW_EDGE_THRESHOLD) {
      placement = 'risky';
    }

    var multiplier = _swGetScoreMultiplier();
    var finalScore = Math.round(baseScore * multiplier);

    swState.scores[playerId] = (swState.scores[playerId] || 0) + 1;
    swState.totalScore[playerId] = (swState.totalScore[playerId] || 0) + finalScore;

    // Update swing params for next turn
    _swUpdateSwingParams();

    // Danger check
    if (team) {
      if (team === 'A') swState.dangerA = result.stability < 0.3;
      else swState.dangerB = result.stability < 0.3;
    } else {
      swState.danger = result.stability < 0.3;
    }

    // Advance turn
    swState.turnIndex = (swState.turnIndex + 1) % swState.turnOrder.length;
    swState.currentPlayer = swState.turnOrder[swState.turnIndex];
    if (swState.turnIndex === 0) swState.round++;

    broadcast({
      type: 'sw-drop-result',
      x: x,
      ry: newCoin.ry,
      team: team,
      stable: true,
      stability: result.stability,
      nextPlayer: swState.currentPlayer,
      turnIndex: swState.turnIndex,
      round: swState.round,
      scores: swState.scores,
      totalScore: swState.totalScore,
      streak: swState.streak,
      bestStreak: swState.bestStreak,
      danger: swState.danger,
      swingSpeed: _swSwingSpeed,
      swingPattern: _swSwingPattern,
      scoreGained: finalScore,
      placement: placement,
      multiplier: multiplier,
      // Team data
      coinsA: swState.coinsA,
      coinsB: swState.coinsB,
      stabilityA: swState.stabilityA,
      stabilityB: swState.stabilityB,
      dangerA: swState.dangerA,
      dangerB: swState.dangerB,
      streakA: swState.streakA,
      streakB: swState.streakB,
    });

    _swAnimateDrop(x, newCoin.ry, true, result.stability, null, {
      score: finalScore, placement: placement, multiplier: multiplier, team: team,
    });
  } else {
    // === COLLAPSE! ===
    swState.loser = playerId;
    swState.phase = 'gameover';
    swState.streak = 0;

    if (team) {
      swState.loserTeam = team;
      if (team === 'A') swState.streakA = 0;
      else swState.streakB = 0;
    } else if (swState.mode === 'team' && swState.teams) {
      swState.loserTeam = swState.teams.A.indexOf(playerId) !== -1 ? 'A' : 'B';
    }

    teamCoins.push(newCoin);

    broadcast({
      type: 'sw-drop-result',
      x: x,
      ry: newCoin.ry,
      team: team,
      stable: false,
      collapseLevel: result.collapseLevel,
      direction: result.direction,
      loser: swState.loser,
      loserTeam: swState.loserTeam,
      scores: swState.scores,
      totalScore: swState.totalScore,
      bestStreak: swState.bestStreak,
      coinsA: swState.coinsA,
      coinsB: swState.coinsB,
    });

    _swAnimateDrop(x, newCoin.ry, false, 0, {
      collapseLevel: result.collapseLevel,
      direction: result.direction,
      team: team,
    }, null);
  }
}

// ===== HANDLE DROP RESULT (client) =====
function swHandleDropResult(msg) {
  if (!swState) return;

  if (msg.stable) {
    // Add coin to correct array
    if (msg.team && swState.mode === 'team') {
      _swGetTeamCoins(msg.team).push({ x: msg.x, ry: msg.ry });
      if (msg.stabilityA !== undefined) swState.stabilityA = msg.stabilityA;
      if (msg.stabilityB !== undefined) swState.stabilityB = msg.stabilityB;
      if (msg.dangerA !== undefined) swState.dangerA = msg.dangerA;
      if (msg.dangerB !== undefined) swState.dangerB = msg.dangerB;
      if (msg.streakA !== undefined) swState.streakA = msg.streakA;
      if (msg.streakB !== undefined) swState.streakB = msg.streakB;
    } else {
      swState.coins.push({ x: msg.x, ry: msg.ry });
    }
    swState.lastStability = msg.stability;
    swState.currentPlayer = msg.nextPlayer;
    swState.turnIndex = msg.turnIndex;
    swState.round = msg.round;
    swState.scores = msg.scores;
    swState.totalScore = msg.totalScore || msg.scores;
    swState.streak = msg.streak || 0;
    swState.bestStreak = msg.bestStreak || 0;
    swState.danger = msg.danger || false;
    _swSwingSpeed = msg.swingSpeed || SW_SWING_SPEED_BASE;
    _swSwingPattern = msg.swingPattern || 0;

    _swAnimateDrop(msg.x, msg.ry, true, msg.stability, null, {
      score: msg.scoreGained, placement: msg.placement, multiplier: msg.multiplier,
      team: msg.team,
    });
  } else {
    if (msg.team && swState.mode === 'team') {
      _swGetTeamCoins(msg.team).push({ x: msg.x, ry: msg.ry });
    } else {
      swState.coins.push({ x: msg.x, ry: msg.ry });
    }
    swState.loser = msg.loser;
    swState.loserTeam = msg.loserTeam;
    swState.phase = 'gameover';
    swState.scores = msg.scores;
    swState.totalScore = msg.totalScore || msg.scores;
    swState.bestStreak = msg.bestStreak || 0;

    _swAnimateDrop(msg.x, msg.ry, false, 0, {
      collapseLevel: msg.collapseLevel,
      direction: msg.direction,
      team: msg.team,
    }, null);
  }
}

// ===== ANIMATE DROP =====
function _swAnimateDrop(x, ry, isStable, stability, collapseInfo, scoreInfo) {
  var team = (scoreInfo && scoreInfo.team) || (collapseInfo && collapseInfo.team) || null;
  var teamCoins = team ? _swGetTeamCoins(team) : swState.coins;
  var coinIndex = teamCoins.length - 1;
  var targetY = SW_COIN_H / 2 + coinIndex * SW_COIN_H;

  // Choose the right drop function
  var doDrop;
  if (team && typeof swThreeDropCoinTeam === 'function') {
    doDrop = function(cb) { swThreeDropCoinTeam(team, x, targetY, cb); };
  } else if (typeof swThreeDropCoin === 'function') {
    doDrop = function(cb) { swThreeDropCoin(x, targetY, cb); };
  } else {
    doDrop = null;
  }

  if (doDrop) {
    doDrop(function() {
      if (isStable) {
        if (typeof swThreeSetWobble === 'function') {
          swThreeSetWobble(1 - stability);
        }

        if (scoreInfo && typeof swThreeShowScorePopup === 'function') {
          swThreeShowScorePopup(scoreInfo.score, scoreInfo.placement, scoreInfo.multiplier);
        }

        if (navigator.vibrate) {
          if (stability < 0.3) navigator.vibrate([50, 20, 80]);
          else if (stability < 0.5) navigator.vibrate(50);
          else navigator.vibrate(20);
        }

        setTimeout(function() {
          swBeginTurn();
          swRenderHUD();
        }, 350);
      } else {
        if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);

        // Choose right collapse function
        if (team && typeof swThreeCollapseTeam === 'function' && collapseInfo) {
          swThreeCollapseTeam(team, collapseInfo.collapseLevel, collapseInfo.direction, function() {
            swShowResult();
          });
        } else if (typeof swThreeCollapse === 'function' && collapseInfo) {
          swThreeCollapse(collapseInfo.collapseLevel, collapseInfo.direction, function() {
            swShowResult();
          });
        } else {
          setTimeout(swShowResult, 500);
        }
      }
    });
  } else {
    if (!isStable) {
      setTimeout(swShowResult, 500);
    } else {
      if (scoreInfo) _swShowScoreDOM(scoreInfo.score, scoreInfo.placement, scoreInfo.multiplier);
      setTimeout(function() { swBeginTurn(); swRenderHUD(); }, 350);
    }
  }
}

// ===== SCORE POPUP (DOM fallback) =====
function _swShowScoreDOM(score, placement, multiplier) {
  var container = document.getElementById('swThreeContainer');
  if (!container) return;
  var el = document.createElement('div');
  el.className = 'sw-score-popup';
  var text = '+' + score;
  if (placement === 'perfect') text += ' PERFECT!';
  else if (placement === 'risky') text += ' RISKY!';
  if (multiplier > 1) text += ' x' + multiplier.toFixed(1);
  el.textContent = text;
  container.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
}

// ===== SHOW RESULT =====
function swShowResult() {
  _swStopSwingLoop();
  _swStopCpuTurn();
  var overlay = document.getElementById('swResultOverlay');
  if (!overlay) return;

  var isSolo = swState.mode === 'solo';
  var coinCount;
  if (swState.mode === 'team') {
    coinCount = Math.max(swState.coinsA.length, swState.coinsB.length) - 1;
  } else {
    coinCount = swState.coins.length - 1;
  }
  coinCount = Math.max(0, coinCount);
  var bestStreak = swState.bestStreak || 0;

  if (isSolo) {
    var myScore = swState.totalScore[state.myId] || 0;
    var grade = '🥉';
    var gradeText = 'Good';
    if (coinCount >= 25) { grade = '👑'; gradeText = 'LEGENDARY!'; }
    else if (coinCount >= 20) { grade = '💎'; gradeText = 'AMAZING!'; }
    else if (coinCount >= 15) { grade = '🥇'; gradeText = 'GREAT!'; }
    else if (coinCount >= 10) { grade = '🥈'; gradeText = 'NICE!'; }

    overlay.innerHTML =
      '<div class="sw-result-card">' +
        '<div class="sw-result-emoji">' + grade + '</div>' +
        '<div class="sw-result-title">' + gradeText + '</div>' +
        '<div class="sw-result-score">' + coinCount + '개 쌓기 성공!</div>' +
        '<div class="sw-result-stats">' +
          '<div class="sw-stat"><span class="sw-stat-label">총 점수</span><span class="sw-stat-val">' + myScore.toLocaleString() + '</span></div>' +
          '<div class="sw-stat"><span class="sw-stat-label">최고 연속</span><span class="sw-stat-val">' + bestStreak + '개</span></div>' +
        '</div>' +
        '<div class="sw-result-buttons">' +
          (state.isHost ? '<button class="sw-btn sw-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="sw-btn sw-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else if (swState.mode === 'team') {
    var loserTeamLabel = swState.loserTeam === 'A' ? 'A팀' : 'B팀';
    var winnerTeamLabel = swState.loserTeam === 'A' ? 'B팀' : 'A팀';
    var winnerTeam = swState.loserTeam === 'A' ? swState.teams.B : swState.teams.A;
    var winnerNames = winnerTeam.map(function(id) {
      var p = state.players.find(function(pp) { return pp.id === id; });
      return p ? p.name : '???';
    });
    var loserPlayer = state.players.find(function(p) { return p.id === swState.loser; });
    var loserName = loserPlayer ? loserPlayer.name : '???';

    overlay.innerHTML =
      '<div class="sw-result-card">' +
        '<div class="sw-result-emoji">🏆</div>' +
        '<div class="sw-result-title">' + escapeHTML(winnerTeamLabel) + ' 승리!</div>' +
        '<div class="sw-result-score">' + escapeHTML(winnerNames.join(' & ')) + '</div>' +
        '<div class="sw-result-subtitle">' + escapeHTML(loserName) + '(' + escapeHTML(loserTeamLabel) + ')이 무너뜨림! (A팀 ' + swState.coinsA.length + '개 / B팀 ' + swState.coinsB.length + '개)</div>' +
        _swRenderScoreboard() +
        '<div class="sw-result-buttons">' +
          (state.isHost ? '<button class="sw-btn sw-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="sw-btn sw-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else {
    var loserPlayer2 = state.players.find(function(p) { return p.id === swState.loser; });
    var loserName2 = loserPlayer2 ? loserPlayer2.name : '???';

    overlay.innerHTML =
      '<div class="sw-result-card">' +
        '<div class="sw-result-emoji">' + (swState.loser === state.myId ? '💀' : '🏆') + '</div>' +
        '<div class="sw-result-title">' +
          (swState.loser === state.myId ? '패배...' : '승리!') +
        '</div>' +
        '<div class="sw-result-score">' + escapeHTML(loserName2) + ' 탈락!</div>' +
        '<div class="sw-result-subtitle">' + coinCount + '개에서 무너짐</div>' +
        _swRenderScoreboard() +
        '<div class="sw-result-buttons">' +
          (state.isHost ? '<button class="sw-btn sw-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="sw-btn sw-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  }

  overlay.style.display = 'flex';
  overlay.classList.add('sw-result-show');
}

function _swRenderScoreboard() {
  if (!swState || !swState.totalScore) return '';
  var html = '<div class="sw-scoreboard">';
  var sorted = state.players.slice().sort(function(a, b) {
    return (swState.totalScore[b.id] || 0) - (swState.totalScore[a.id] || 0);
  });
  sorted.forEach(function(p, rank) {
    var isLoser = p.id === swState.loser;
    var rankEmoji = rank === 0 ? '🥇' : (rank === 1 ? '🥈' : '🥉');
    html += '<div class="sw-score-row' + (isLoser ? ' loser' : '') + '">' +
      '<span class="sw-score-rank">' + rankEmoji + '</span>' +
      '<span class="sw-score-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="sw-score-name">' + escapeHTML(p.name) + '</span>' +
      '<span class="sw-score-detail">' + (swState.scores[p.id] || 0) + '개</span>' +
      '<span class="sw-score-val">' + (swState.totalScore[p.id] || 0).toLocaleString() + 'pt</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// ===== RENDER HUD =====
function swRenderHUD() {
  if (!swState) return;

  var turnEl = document.getElementById('swTurnIndicator');
  if (turnEl) {
    if (swState.phase === 'intro') {
      turnEl.innerHTML = '<div class="sw-turn-text">준비 중...</div>';
    } else if (swState.phase === 'gameover') {
      turnEl.innerHTML = '';
    } else {
      var cp = state.players.find(function(p) { return p.id === swState.currentPlayer; });
      var isMe = swState.currentPlayer === state.myId;
      var nameStr = isMe ? 'MY TURN!' : (cp ? cp.name : '???');
      var avatarStr = cp ? cp.avatar : '🎯';
      var streakLabel = _swGetStreakLabel();

      turnEl.innerHTML =
        '<div class="sw-turn-avatar">' + escapeHTML(avatarStr) + '</div>' +
        '<div class="sw-turn-text' + (isMe ? ' my-turn' : '') + '">' + escapeHTML(nameStr) + '</div>' +
        (streakLabel ? '<div class="sw-streak-badge">' + streakLabel + '</div>' : '');
    }
  }

  var countEl = document.getElementById('swCoinCount');
  if (countEl) {
    if (swState.mode === 'team') {
      var myTeam = _swGetMyTeam();
      var myCoins = myTeam ? _swGetTeamCoins(myTeam).length : 0;
      var oppTeam = myTeam === 'A' ? 'B' : 'A';
      var oppCoins = _swGetTeamCoins(oppTeam).length;
      countEl.textContent = myCoins + ' vs ' + oppCoins;
    } else {
      countEl.textContent = swState.coins.length + '개';
    }
  }

  var roundEl = document.getElementById('swRoundNum');
  if (roundEl && swState.mode !== 'solo') {
    roundEl.textContent = swState.round + 'R';
  }

  var meterEl = document.getElementById('swStabilityBar');
  if (meterEl) {
    var stab = swState.lastStability;
    if (swState.mode === 'team') {
      var myT = _swGetMyTeam();
      stab = myT ? _swGetTeamStability(myT) : 1.0;
    }
    var pct = stab * 100;
    meterEl.style.width = pct + '%';
    if (pct < 20) meterEl.style.background = '#ff2222';
    else if (pct < 40) meterEl.style.background = '#ff6600';
    else if (pct < 60) meterEl.style.background = '#ffaa00';
    else meterEl.style.background = '#44ff88';
  }

  // Speed indicator
  var speedEl = document.getElementById('swSpeedIndicator');
  if (speedEl) {
    var speedPct = (_swSwingSpeed - SW_SWING_SPEED_BASE) / (SW_SWING_SPEED_MAX - SW_SWING_SPEED_BASE);
    var speedBars = Math.min(5, Math.ceil(speedPct * 5));
    var barStr = '';
    for (var i = 0; i < 5; i++) {
      barStr += '<span class="sw-speed-bar' + (i < speedBars ? ' active' : '') + '"></span>';
    }
    var speedLabel = speedPct < 0.3 ? '느림' : (speedPct < 0.6 ? '보통' : (speedPct < 0.85 ? '빠름' : '극한'));
    speedEl.innerHTML = '<span class="sw-speed-icon">⚡</span>' +
      '<span class="sw-speed-bars">' + barStr + '</span>' +
      '<span class="sw-speed-label">' + speedLabel + '</span>';
    speedEl.style.display = 'flex';
  }

  var scoreEl = document.getElementById('swMyScore');
  if (scoreEl) {
    var myScore = swState.totalScore[state.myId] || 0;
    scoreEl.textContent = myScore.toLocaleString() + 'pt';
  }

  var gameEl = document.getElementById('coinswingGame');
  if (gameEl) {
    if (swState.danger) {
      gameEl.classList.add('sw-danger-active');
    } else {
      gameEl.classList.remove('sw-danger-active');
    }
  }

  _swRenderPlayerBar();
}

function _swRenderPlayerBar() {
  var bar = document.getElementById('swPlayersBar');
  if (!bar || !swState) return;
  if (swState.mode === 'solo') { bar.innerHTML = ''; return; }

  var html = '';
  var order = swState.turnOrder;
  for (var i = 0; i < order.length; i++) {
    var pid = order[i];
    var p = state.players.find(function(pp) { return pp.id === pid; });
    if (!p) continue;
    var isCurrent = pid === swState.currentPlayer;
    var teamClass = '';
    if (swState.mode === 'team' && swState.teams) {
      teamClass = swState.teams.A.indexOf(pid) !== -1 ? ' team-a' : ' team-b';
    }
    html += '<div class="sw-player-chip' + (isCurrent ? ' active' : '') + teamClass + '">' +
      '<span class="sw-chip-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="sw-chip-score">' + (swState.totalScore[pid] || 0) + 'pt</span>' +
    '</div>';
  }
  bar.innerHTML = html;
}

// ===== DROP BUTTON =====
function _swUpdateDropBtn() {
  var btn = document.getElementById('swDropBtn');
  if (!btn) return;
  if (_swMyTurn && !_swDropping && swState.phase === 'playing') {
    btn.style.display = 'flex';
    btn.classList.add('sw-drop-ready');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('sw-drop-ready');
  }
}

// ===== EMOJI SYSTEM =====
function swSendEmoji(emoji) {
  if (_swEmojiCooldown) return;
  _swEmojiCooldown = true;
  setTimeout(function() { _swEmojiCooldown = false; }, 1500);
  if (typeof swThreeShowEmoji === 'function') swThreeShowEmoji(emoji);
  broadcast({ type: 'sw-emoji', emoji: emoji, from: state.myId });
}

function swHandleEmoji(msg) {
  if (typeof swThreeShowEmoji === 'function') swThreeShowEmoji(msg.emoji);
  if (navigator.vibrate) navigator.vibrate(50);
}

function swToggleEmojiPanel() {
  var panel = document.getElementById('swEmojiPanel');
  if (!panel) return;
  panel.classList.toggle('sw-emoji-open');
}

// ===== RENDER VIEW (from handleGameStart) =====
function renderCoinSwingView(s) {
  if (!swState) {
    swState = {
      mode: s.mode,
      seed: s.seed,
      coins: s.coins || [],
      coinsA: s.coinsA || [],
      coinsB: s.coinsB || [],
      turnOrder: s.turnOrder,
      turnIndex: s.turnIndex || 0,
      currentPlayer: s.currentPlayer || s.turnOrder[0],
      phase: s.phase || 'intro',
      round: s.round || 1,
      loser: s.loser || null,
      loserTeam: s.loserTeam || null,
      teams: s.teams || null,
      lastStability: s.lastStability || 1.0,
      stabilityA: s.stabilityA || 1.0,
      stabilityB: s.stabilityB || 1.0,
      dangerA: s.dangerA || false,
      dangerB: s.dangerB || false,
      streakA: s.streakA || 0,
      streakB: s.streakB || 0,
      scores: s.scores || {},
      totalScore: s.totalScore || s.scores || {},
      streak: s.streak || 0,
      bestStreak: s.bestStreak || 0,
      danger: s.danger || false,
    };
  }
  _swSeed = swState.seed;
  loadCoinSwingThree();
  _swWaitForThreeAndStart();
}

// ===== CLEANUP =====
function closeCoinSwingCleanup() {
  _swStopSwingLoop();
  _swStopCpuTurn();
  _swTimers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
  _swTimers = [];
  _swDropping = false;
  _swMyTurn = false;
  _swIntroPlayed = false;
  _swSwingPattern = 0;
  _swSwingSpeed = SW_SWING_SPEED_BASE;
  _swSwingWidth = SW_SWING_WIDTH_BASE;
  _swCurrentSwingX = 0;
  _swPeeking = false;
  if (_swPeekTimer) { clearTimeout(_swPeekTimer); _swPeekTimer = null; }

  if (typeof destroyCoinSwingThree === 'function') destroyCoinSwingThree();

  var overlay = document.getElementById('swResultOverlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('sw-result-show'); }

  var gameEl = document.getElementById('coinswingGame');
  if (gameEl) gameEl.classList.remove('sw-danger-active');

  swState = null;
}

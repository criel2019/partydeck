// =============================================
// COIN STACK (동전쌓기) - 3D Coin Stacking Game
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
    s.src = 'js/coinstack-three.js?v=20260312';
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
var CS_BASE_STABILITY = 0.82;
var CS_HEIGHT_PENALTY = 0.018;
var CS_MIN_STABILITY_THRESHOLD = 0.12;
var CS_TURN_TIME_BASE = 12000;
var CS_TURN_TIME_MIN = 5000;
var CS_TURN_TIME_DECAY = 300;
var CS_MAX_X = 1.3;

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

// ===== SEEDED PRNG (for deterministic results) =====
var _csSeed = 0;
function csRand() {
  _csSeed = (_csSeed * 1103515245 + 12345) & 0x7fffffff;
  return _csSeed / 0x7fffffff;
}

// ===== STABILITY CHECK (deterministic) =====
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

    // Support point: for level 0, it's the ground center (0)
    // For level i>0, it's the coin below
    var supportX = (i === 0) ? 0 : coins[i - 1].x;
    var offset = Math.abs(cmX - supportX);

    // Max allowed offset decreases with height
    var maxOffset = CS_COIN_R * Math.max(CS_MIN_STABILITY_THRESHOLD,
      CS_BASE_STABILITY - i * CS_HEIGHT_PENALTY);

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

// ===== START GAME =====
function startCoinStack() {
  console.log('[CoinStack] startCoinStack called. isHost:', state.isHost);

  // Determine mode based on player count
  var playerCount = state.players.length;
  var mode = 'solo';
  if (playerCount === 2) mode = 'vs';
  else if (playerCount === 3) mode = 'vs'; // 3P free-for-all
  else if (playerCount >= 4) mode = 'team'; // 2v2 (first 4 players)

  var seed = Math.floor(Math.random() * 999999) + 1;
  _csSeed = seed;

  // Build turn order
  var turnOrder = [];
  if (mode === 'team') {
    // Team A: players 0,1  Team B: players 2,3
    // Turn order: A0, B0, A1, B1, A0, B0...
    var teamA = [state.players[0].id, state.players[1].id];
    var teamB = [state.players[2].id, state.players[3].id];
    turnOrder = [teamA[0], teamB[0], teamA[1], teamB[1]];
  } else if (mode === 'solo') {
    turnOrder = [state.myId];
  } else {
    // vs mode: all players take turns
    turnOrder = state.players.map(function(p) { return p.id; });
  }

  csState = {
    mode: mode,
    seed: seed,
    coins: [],
    turnOrder: turnOrder,
    turnIndex: 0,
    currentPlayer: turnOrder[0],
    phase: 'intro', // intro | playing | gameover
    round: 1,
    loser: null,
    loserTeam: null,
    teams: mode === 'team' ? {
      A: [state.players[0].id, state.players[1].id],
      B: [state.players[2].id, state.players[3].id]
    } : null,
    lastStability: 1.0,
    scores: {},
    turnTimeMs: CS_TURN_TIME_BASE,
  };

  // Init scores
  state.players.forEach(function(p) { csState.scores[p.id] = 0; });

  showScreen('coinstackGame');
  loadCoinStackThree();
  _ensureFullscreenForGame();

  // Broadcast to clients
  broadcast({
    type: 'game-start',
    game: 'coinstack',
    state: csState
  });

  // Wait for Three.js then play intro
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
  csRenderHUD();

  if (typeof csThreePlayIntro === 'function') {
    csThreePlayIntro(csState.seed, function() {
      _csIntroPlayed = true;
      if (state.isHost) {
        csState.phase = 'playing';
        csBroadcastState();
        csBeginTurn();
      } else {
        // Client waits for host state
        csState.phase = 'playing';
        csBeginTurn();
      }
    });
  } else {
    _csIntroPlayed = true;
    csState.phase = 'playing';
    if (state.isHost) {
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
      turnTimeMs: csState.turnTimeMs,
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
  csState.turnTimeMs = s.turnTimeMs;

  // Sync 3D coins
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

  // Show/hide ghost coin
  if (typeof csThreeShowGhost === 'function') {
    csThreeShowGhost(_csMyTurn);
    if (_csMyTurn) {
      csThreeSetGhostX(0);
    }
  }

  // Set wobble based on stability
  if (typeof csThreeSetWobble === 'function') {
    csThreeSetWobble(1 - csState.lastStability);
  }

  // Update HUD
  csRenderHUD();
  _csUpdateDropBtn();

  // Touch callback
  if (typeof csThreeSetTouchCallback === 'function') {
    csThreeSetTouchCallback(function(x) {
      if (!_csMyTurn || _csDropping) return;
      _csGhostX = x;
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
      if (pct < 0.3) timerBar.style.background = '#ff4444';
      else if (pct < 0.6) timerBar.style.background = '#ffaa00';
      else timerBar.style.background = '#44ff88';
    }

    if (remaining <= 0) {
      _csClearTurnTimer();
      // Auto-drop at current position
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

  // Hide ghost
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

  // Clamp x
  x = Math.max(-CS_MAX_X, Math.min(CS_MAX_X, x));

  // Add coin
  var newCoin = { x: x, ry: csRand() * Math.PI * 2 };
  var testCoins = csState.coins.slice();
  testCoins.push(newCoin);

  // Check stability
  var result = csCheckStability(testCoins);

  if (result.stable) {
    // Coin placed successfully
    csState.coins.push(newCoin);
    csState.lastStability = result.stability;

    // Score
    csState.scores[playerId] = (csState.scores[playerId] || 0) + 1;

    // Reduce turn time
    csState.turnTimeMs = Math.max(CS_TURN_TIME_MIN,
      CS_TURN_TIME_BASE - csState.coins.length * CS_TURN_TIME_DECAY);

    // Advance turn
    csState.turnIndex = (csState.turnIndex + 1) % csState.turnOrder.length;
    csState.currentPlayer = csState.turnOrder[csState.turnIndex];
    if (csState.turnIndex === 0) csState.round++;

    // Broadcast drop + stable
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
      turnTimeMs: csState.turnTimeMs,
    });

    // Host also processes visually
    _csAnimateDrop(x, newCoin.ry, true, result.stability, null);
  } else {
    // COLLAPSE!
    csState.loser = playerId;
    csState.phase = 'gameover';

    if (csState.mode === 'team' && csState.teams) {
      if (csState.teams.A.indexOf(playerId) !== -1) {
        csState.loserTeam = 'A';
      } else {
        csState.loserTeam = 'B';
      }
    }

    // Add the coin that caused collapse for visual
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
    });

    _csAnimateDrop(x, newCoin.ry, false, 0, {
      collapseLevel: result.collapseLevel,
      direction: result.direction,
    });
  }
}

// ===== HANDLE DROP RESULT (client) =====
function csHandleDropResult(msg) {
  if (!csState) return;

  if (msg.stable) {
    // Update state
    csState.coins.push({ x: msg.x, ry: msg.ry });
    csState.lastStability = msg.stability;
    csState.currentPlayer = msg.nextPlayer;
    csState.turnIndex = msg.turnIndex;
    csState.round = msg.round;
    csState.scores = msg.scores;
    csState.turnTimeMs = msg.turnTimeMs;

    _csAnimateDrop(msg.x, msg.ry, true, msg.stability, null);
  } else {
    // Collapse
    csState.coins.push({ x: msg.x, ry: msg.ry });
    csState.loser = msg.loser;
    csState.loserTeam = msg.loserTeam;
    csState.phase = 'gameover';
    csState.scores = msg.scores;

    _csAnimateDrop(msg.x, msg.ry, false, 0, {
      collapseLevel: msg.collapseLevel,
      direction: msg.direction,
    });
  }
}

// ===== ANIMATE DROP =====
function _csAnimateDrop(x, ry, isStable, stability, collapseInfo) {
  var coinIndex = csState.coins.length - 1;
  var targetY = CS_COIN_H / 2 + coinIndex * CS_COIN_H;

  if (typeof csThreeDropCoin === 'function') {
    csThreeDropCoin(x, targetY, function() {
      if (isStable) {
        // Wobble effect based on stability
        if (typeof csThreeSetWobble === 'function') {
          csThreeSetWobble(1 - stability);
        }

        // Vibrate on mobile
        if (navigator.vibrate) navigator.vibrate(30);

        // Update camera
        if (typeof csThreeSetCameraHeight === 'function') {
          csThreeSetCameraHeight(Math.max(1.8, coinIndex * CS_COIN_H * 0.7 + 1.5));
        }

        // Begin next turn
        setTimeout(function() {
          csBeginTurn();
          csRenderHUD();
        }, 300);
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
    // No Three.js fallback
    if (!isStable) {
      setTimeout(csShowResult, 500);
    } else {
      setTimeout(function() { csBeginTurn(); csRenderHUD(); }, 300);
    }
  }
}

// ===== SHOW RESULT =====
function csShowResult() {
  _csClearTurnTimer();
  var overlay = document.getElementById('csResultOverlay');
  if (!overlay) return;

  var loserName = '';
  var winnerNames = [];
  var isSolo = csState.mode === 'solo';

  if (isSolo) {
    // Solo: show score
    overlay.innerHTML =
      '<div class="cs-result-card">' +
        '<div class="cs-result-emoji">🪙</div>' +
        '<div class="cs-result-title">게임 오버!</div>' +
        '<div class="cs-result-score">' + (csState.coins.length - 1) + '개 쌓기 성공!</div>' +
        '<div class="cs-result-subtitle">동전 ' + (csState.coins.length - 1) + '개를 쌓았습니다</div>' +
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
        '<div class="cs-result-subtitle">' + escapeHTML(loserName) + '(' + escapeHTML(loserTeamLabel) + ')이 무너뜨림! (동전 ' + (csState.coins.length - 1) + '개)</div>' +
        _csRenderScoreboard() +
        '<div class="cs-result-buttons">' +
          (state.isHost ? '<button class="cs-btn cs-btn-primary" onclick="restartCurrentGame()">다시하기</button>' : '') +
          '<button class="cs-btn cs-btn-secondary" onclick="leaveGame()">나가기</button>' +
        '</div>' +
      '</div>';
  } else {
    // VS mode
    var loserPlayer = state.players.find(function(p) { return p.id === csState.loser; });
    loserName = loserPlayer ? loserPlayer.name : '???';

    winnerNames = state.players
      .filter(function(p) { return p.id !== csState.loser; })
      .map(function(p) { return p.name; });

    overlay.innerHTML =
      '<div class="cs-result-card">' +
        '<div class="cs-result-emoji">' + (csState.loser === state.myId ? '💀' : '🏆') + '</div>' +
        '<div class="cs-result-title">' +
          (csState.loser === state.myId ? '패배...' : '승리!') +
        '</div>' +
        '<div class="cs-result-score">' +
          escapeHTML(loserName) + ' 탈락!' +
        '</div>' +
        '<div class="cs-result-subtitle">동전 ' + (csState.coins.length - 1) + '개에서 무너짐</div>' +
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
  if (!csState || !csState.scores) return '';
  var html = '<div class="cs-scoreboard">';
  var sorted = state.players.slice().sort(function(a, b) {
    return (csState.scores[b.id] || 0) - (csState.scores[a.id] || 0);
  });
  sorted.forEach(function(p) {
    var isLoser = p.id === csState.loser;
    html += '<div class="cs-score-row' + (isLoser ? ' loser' : '') + '">' +
      '<span class="cs-score-avatar">' + escapeHTML(p.avatar) + '</span>' +
      '<span class="cs-score-name">' + escapeHTML(p.name) + '</span>' +
      '<span class="cs-score-val">' + (csState.scores[p.id] || 0) + '개</span>' +
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

      turnEl.innerHTML =
        '<div class="cs-turn-avatar">' + escapeHTML(avatarStr) + '</div>' +
        '<div class="cs-turn-text' + (isMe ? ' my-turn' : '') + '">' + escapeHTML(nameStr) + '</div>';
    }
  }

  // Coin count
  var countEl = document.getElementById('csCoinCount');
  if (countEl) {
    countEl.textContent = csState.coins.length + '개';
  }

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
    if (pct < 30) meterEl.style.background = '#ff4444';
    else if (pct < 60) meterEl.style.background = '#ffaa00';
    else meterEl.style.background = '#44ff88';
  }

  // Player list (for multiplayer)
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
      '<span class="cs-chip-score">' + (csState.scores[pid] || 0) + '</span>' +
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

  // Show locally
  if (typeof csThreeShowEmoji === 'function') {
    csThreeShowEmoji(emoji);
  }

  // Broadcast
  broadcast({ type: 'cs-emoji', emoji: emoji, from: state.myId });
}

function csHandleEmoji(msg) {
  if (typeof csThreeShowEmoji === 'function') {
    csThreeShowEmoji(msg.emoji);
  }
  // Vibrate on receiving emoji
  if (navigator.vibrate) navigator.vibrate(50);
}

// ===== EMOJI PANEL TOGGLE =====
function csToggleEmojiPanel() {
  var panel = document.getElementById('csEmojiPanel');
  if (!panel) return;
  panel.classList.toggle('cs-emoji-open');
}

// ===== RENDER COINSTACK VIEW (called from handleGameStart) =====
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
      turnTimeMs: s.turnTimeMs || CS_TURN_TIME_BASE,
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

  if (typeof destroyCoinStackThree === 'function') {
    destroyCoinStackThree();
  }

  var overlay = document.getElementById('csResultOverlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('cs-result-show'); }

  csState = null;
  _csView = null;
}

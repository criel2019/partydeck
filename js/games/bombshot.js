// =============================================
// BOMB SHOT BLUFF (폭탄주 블러프)
// Liar's Bar variant — P2P card game
// Russian Roulette penalty system
// =============================================

// ===== THREE.JS LOADER =====
var _bsThreeLoaded = false;
function loadBombShotThree() {
  if (_bsThreeLoaded) return;
  _bsThreeLoaded = true;

  function onScriptsReady() {
    var canvas = document.getElementById('bsCanvas');
    if (canvas && typeof initBombShotThree === 'function') {
      initBombShotThree(canvas);
    }
  }

  // Reuse Three.js if already loaded (e.g. from yahtzee)
  if (window.THREE) {
    var s = document.createElement('script');
    s.src = 'js/bombshot-three.js';
    s.onload = onScriptsReady;
    s.onerror = function() { _bsThreeLoaded = false; };
    document.head.appendChild(s);
    return;
  }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = 'js/bombshot-three.js';
    s2.onload = onScriptsReady;
    s2.onerror = function() { _bsThreeLoaded = false; };
    document.head.appendChild(s2);
  };
  s1.onerror = function() { _bsThreeLoaded = false; };
  document.head.appendChild(s1);
}

// ===== STATE =====
var bsState = null;  // host-side full state
var _bsView = null;  // client-side view
var _bsSelected = []; // local selected card indices
var _bsTimers = [];

var BS_CARDS = {
  beer:   { emoji: '🍺', name: '맥주',   cssClass: 'bs-card-beer' },
  soju:   { emoji: '🍶', name: '소주',   cssClass: 'bs-card-soju' },
  liquor: { emoji: '🥃', name: '양주',   cssClass: 'bs-card-liquor' },
  water:  { emoji: '💧', name: '탄산수', cssClass: 'bs-card-water' }
};

var BS_DRINKS = ['beer', 'soju', 'liquor'];

// ===== DECK & SHUFFLE =====
function bsCreateDeck() {
  var deck = [];
  var types = ['beer', 'soju', 'liquor', 'water'];
  for (var t = 0; t < types.length; t++) {
    for (var i = 0; i < 6; i++) {
      deck.push(types[t]);
    }
  }
  // Fisher-Yates shuffle
  for (var j = deck.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = deck[j]; deck[j] = deck[k]; deck[k] = tmp;
  }
  return deck;
}

// ===== ROULETTE SLOTS =====
function generateRouletteSlots(hitCount) {
  // 6 chambers: hitCount of them are 'hit', rest are 'safe'
  var slots = [];
  var i;
  for (i = 0; i < 6; i++) slots.push('safe');
  // Randomly distribute hitCount 'hit' slots
  var indices = [];
  for (i = 0; i < 6; i++) indices.push(i);
  // Fisher-Yates partial shuffle to pick hitCount positions
  for (i = 0; i < hitCount && i < 6; i++) {
    var j = i + Math.floor(Math.random() * (6 - i));
    var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    slots[indices[i]] = 'hit';
  }
  return slots;
}

// ===== HOST: START GAME =====
function startBombShot() {
  if (!state.isHost) return;
  if (state.players.length < 2 || state.players.length > 4) {
    showToast('폭탄주는 2~4명만 플레이 가능합니다');
    return;
  }

  loadBombShotThree();

  var deck = bsCreateDeck();
  var pCount = state.players.length;
  var cardsPerPlayer = Math.floor(24 / pCount);

  var players = state.players.map(function(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: deck.splice(0, cardsPerPlayer),
      eliminated: false,
      eliminatedOrder: -1,
      roulette: { chambers: 6, hitCount: 1 }
    };
  });

  var drink = BS_DRINKS[Math.floor(Math.random() * 3)];

  bsState = {
    players: players,
    designatedDrink: drink,
    turnIdx: 0,
    glassPile: [],
    lastSubmission: null,  // { playerId, playerName, cards[], count }
    phase: 'playing',
    eliminatedCount: 0,
    penaltyPlayer: null,
    revealedCards: null,
    liarCallerId: null,
    liarCallerName: null,
    revealResult: null,     // 'caught' | 'wrong'
    // Roulette state
    rouletteTarget: null,   // { id, name }
    rouletteSlots: null,    // ['safe','hit',...] x6
    rouletteSlotIndex: -1,  // where ball lands
    rouletteResult: null    // 'safe' | 'hit'
  };

  // Broadcast game-start
  broadcast({ type: 'game-start', game: 'bombshot' });
  showScreen('bombshotGame');
  initBSCanvas();
  broadcastBSState();
}

// ===== HOST: BUILD VIEW =====
function buildBSView(forPlayerId) {
  var bs = bsState;
  var currentTurnPlayer = bs.players[bs.turnIdx];

  return {
    type: 'bs-state',
    players: bs.players.map(function(p) {
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        cards: p.id === forPlayerId ? p.cards : null,
        cardCount: p.cards.length,
        eliminated: p.eliminated,
        eliminatedOrder: p.eliminatedOrder,
        rouletteHitCount: p.roulette.hitCount
      };
    }),
    designatedDrink: bs.designatedDrink,
    turnPlayerId: currentTurnPlayer ? currentTurnPlayer.id : null,
    glassPileCount: bs.glassPile.length,
    lastSubmission: bs.lastSubmission ? {
      playerId: bs.lastSubmission.playerId,
      playerName: bs.lastSubmission.playerName,
      count: bs.lastSubmission.count,
      cards: bs.phase === 'liar-reveal' ? bs.lastSubmission.cards : null
    } : null,
    phase: bs.phase,
    eliminatedCount: bs.eliminatedCount,
    penaltyPlayer: bs.penaltyPlayer,
    revealedCards: bs.phase === 'liar-reveal' ? bs.revealedCards : null,
    liarCallerId: bs.liarCallerId,
    liarCallerName: bs.liarCallerName,
    revealResult: bs.revealResult,
    // Roulette data
    rouletteTarget: bs.rouletteTarget,
    rouletteSlots: bs.rouletteSlots,
    rouletteSlotIndex: bs.rouletteSlotIndex,
    rouletteResult: bs.rouletteResult
  };
}

// ===== HOST: BROADCAST =====
function broadcastBSState() {
  if (!state.isHost || !bsState) return;
  bsState.players.forEach(function(p) {
    var view = buildBSView(p.id);
    if (p.id === state.myId) {
      renderBSView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

// ===== HOST: PROCESS CARD SUBMISSION =====
function processBSSubmit(peerId, cardIndices) {
  if (!state.isHost || !bsState) return;
  if (bsState.phase !== 'playing') return;

  var bs = bsState;
  var player = bs.players[bs.turnIdx];
  if (!player || player.id !== peerId) return;
  if (player.eliminated) return;

  // Validate indices
  if (!Array.isArray(cardIndices) || cardIndices.length < 1 || cardIndices.length > 3) return;
  var uniqueIdx = [];
  for (var i = 0; i < cardIndices.length; i++) {
    var idx = cardIndices[i];
    if (typeof idx !== 'number' || idx < 0 || idx >= player.cards.length) return;
    if (uniqueIdx.indexOf(idx) !== -1) return;
    uniqueIdx.push(idx);
  }

  // Extract cards (sort indices descending to remove safely)
  uniqueIdx.sort(function(a, b) { return b - a; });
  var submittedCards = [];
  for (var j = 0; j < uniqueIdx.length; j++) {
    submittedCards.unshift(player.cards[uniqueIdx[j]]);
    player.cards.splice(uniqueIdx[j], 1);
  }

  // Add to glass pile (permanent accumulation — no return)
  for (var k = 0; k < submittedCards.length; k++) {
    bs.glassPile.push(submittedCards[k]);
  }

  bs.lastSubmission = {
    playerId: player.id,
    playerName: player.name,
    cards: submittedCards,
    count: submittedCards.length
  };

  // Broadcast animation trigger
  broadcast({ type: 'bs-anim', anim: 'submit', count: submittedCards.length, drink: bs.designatedDrink });
  handleBSAnim({ anim: 'submit', count: submittedCards.length, drink: bs.designatedDrink });

  // Broadcast state (shows submission info, allows liar calls)
  broadcastBSState();

  // Delay turn advance to give liar call window (3.5s)
  var t = setTimeout(function() {
    if (!bsState || bsState.phase !== 'playing') return;
    // Check for redeal before advancing
    bsCheckRedeal();
    if (bsCheckGameEnd()) return;
    bsAdvanceTurn();
    broadcastBSState();
  }, 3500);
  _bsTimers.push(t);
}

// ===== HOST: PROCESS LIAR CALL =====
function processBSLiar(callerId) {
  if (!state.isHost || !bsState) return;
  if (bsState.phase !== 'playing') return;
  if (!bsState.lastSubmission) return;

  // Can't call liar on yourself
  if (callerId === bsState.lastSubmission.playerId) return;

  var bs = bsState;
  var caller = bs.players.find(function(p) { return p.id === callerId; });
  if (!caller || caller.eliminated) return;

  bs.phase = 'liar-reveal';
  bs.liarCallerId = callerId;
  bs.liarCallerName = caller.name;

  // Check submitted cards
  var submitted = bs.lastSubmission.cards;
  var designated = bs.designatedDrink;
  var isLiar = false;

  for (var i = 0; i < submitted.length; i++) {
    if (submitted[i] !== designated && submitted[i] !== 'water') {
      isLiar = true;
      break;
    }
  }

  bs.revealedCards = submitted;
  bs.revealResult = isLiar ? 'caught' : 'wrong';

  // Determine penalty target
  var penalizedId = isLiar ? bs.lastSubmission.playerId : callerId;
  var penalizedPlayer = bs.players.find(function(p) { return p.id === penalizedId; });
  bs.penaltyPlayer = { id: penalizedId, name: penalizedPlayer ? penalizedPlayer.name : '' };

  // No card return — glass pile stays (permanent accumulation)
  bs.lastSubmission = null;

  // Broadcast reveal animation
  broadcast({ type: 'bs-anim', anim: 'reveal' });
  handleBSAnim({ anim: 'reveal' });
  broadcastBSState();

  // === ROULETTE TIMING CHAIN ===
  // Phase 1: liar-reveal (4s) — show cards
  var t1 = setTimeout(function() {
    if (!bsState) return;

    // Setup roulette for penalty target
    var target = bsState.players.find(function(p) { return p.id === penalizedId; });
    if (!target || target.eliminated) {
      bsResumeAfterRoulette();
      return;
    }

    var slots = generateRouletteSlots(target.roulette.hitCount);
    // Determine ball landing
    var slotIndex = Math.floor(Math.random() * 6);
    var result = slots[slotIndex]; // 'safe' or 'hit'

    bsState.rouletteTarget = { id: target.id, name: target.name };
    bsState.rouletteSlots = slots;
    bsState.rouletteSlotIndex = slotIndex;
    bsState.rouletteResult = result;
    bsState.phase = 'roulette-setup';

    // Broadcast roulette-setup anim
    broadcast({ type: 'bs-anim', anim: 'roulette-setup', hitSlots: slots, targetName: target.name });
    handleBSAnim({ anim: 'roulette-setup', hitSlots: slots, targetName: target.name });
    broadcastBSState();

    // Phase 2: roulette-setup (1.5s) — camera moves, wheel appears
    var t2 = setTimeout(function() {
      if (!bsState) return;
      bsState.phase = 'roulette-spin';

      // Broadcast spin anim
      broadcast({ type: 'bs-anim', anim: 'roulette-spin', slotIndex: slotIndex, hitSlots: slots });
      handleBSAnim({ anim: 'roulette-spin', slotIndex: slotIndex, hitSlots: slots });
      broadcastBSState();

      // Phase 3: roulette-spin (5s) — ball rolls
      var t3 = setTimeout(function() {
        if (!bsState) return;
        bsState.phase = 'roulette-result';

        broadcast({ type: 'bs-anim', anim: 'roulette-result', result: result, targetName: target.name });
        handleBSAnim({ anim: 'roulette-result', result: result, targetName: target.name });
        broadcastBSState();

        // Phase 4: roulette-result (3s) — show result
        var t4 = setTimeout(function() {
          if (!bsState) return;

          // Apply roulette result
          if (result === 'hit') {
            // Player eliminated!
            target.eliminated = true;
            bsState.eliminatedCount++;
            target.eliminatedOrder = bsState.eliminatedCount;
          } else {
            // Safe — increase hit count for next time
            target.roulette.hitCount = Math.min(target.roulette.hitCount + 1, 5);
          }

          bsState.phase = 'camera-return';
          broadcast({ type: 'bs-anim', anim: 'camera-return' });
          handleBSAnim({ anim: 'camera-return' });
          broadcastBSState();

          // Phase 5: camera-return (1s)
          var t5 = setTimeout(function() {
            bsResumeAfterRoulette();
          }, 1000);
          _bsTimers.push(t5);
        }, 3000);
        _bsTimers.push(t4);
      }, 5000);
      _bsTimers.push(t3);
    }, 1500);
    _bsTimers.push(t2);
  }, 4000);
  _bsTimers.push(t1);
}

// ===== HOST: RESUME AFTER ROULETTE =====
function bsResumeAfterRoulette() {
  if (!bsState) return;
  var bs = bsState;
  bs.phase = 'playing';
  bs.revealedCards = null;
  bs.revealResult = null;
  bs.liarCallerId = null;
  bs.liarCallerName = null;
  bs.penaltyPlayer = null;
  bs.rouletteTarget = null;
  bs.rouletteSlots = null;
  bs.rouletteSlotIndex = -1;
  bs.rouletteResult = null;

  if (bsCheckGameEnd()) return;

  // Check redeal
  bsCheckRedeal();

  // Continue from next player
  bsAdvanceTurn();
  broadcastBSState();
}

// ===== HOST: ADVANCE TURN =====
function bsAdvanceTurn() {
  if (!bsState) return;
  var bs = bsState;
  var pCount = bs.players.length;

  for (var i = 0; i < pCount; i++) {
    bs.turnIdx = (bs.turnIdx + 1) % pCount;
    var p = bs.players[bs.turnIdx];
    // Skip eliminated players and players with 0 cards
    if (!p.eliminated && p.cards.length > 0) return;
  }
  // If everyone is out of cards or eliminated, check redeal
  bsCheckRedeal();
}

// ===== HOST: CHECK GAME END =====
function bsCheckGameEnd() {
  if (!bsState) return false;
  var bs = bsState;
  var activePlayers = bs.players.filter(function(p) { return !p.eliminated; });

  if (activePlayers.length <= 1) {
    bs.phase = 'gameover';

    // Build result — eliminated players ranked by elimination order (first eliminated = last place)
    var rankings = bs.players.slice().sort(function(a, b) {
      // Non-eliminated first (winner)
      if (!a.eliminated && b.eliminated) return -1;
      if (a.eliminated && !b.eliminated) return 1;
      // Among eliminated: later elimination = better rank
      if (a.eliminated && b.eliminated) return b.eliminatedOrder - a.eliminatedOrder;
      return 0;
    });

    var result = {
      type: 'bs-result',
      rankings: rankings.map(function(p, idx) {
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          eliminatedOrder: p.eliminatedOrder,
          isLoser: p.eliminatedOrder === 1, // first eliminated = biggest loser
          isWinner: !p.eliminated,
          glassPileCount: bsState.glassPile.length
        };
      })
    };

    broadcast(result);
    handleBSResult(result);
    return true;
  }
  return false;
}

// ===== HOST: CHECK REDEAL =====
function bsCheckRedeal() {
  if (!bsState) return;
  var bs = bsState;
  var activePlayers = bs.players.filter(function(p) { return !p.eliminated; });

  // Check if all active players have 0 cards
  var allEmpty = activePlayers.every(function(p) { return p.cards.length === 0; });
  if (!allEmpty) return;
  if (activePlayers.length < 2) return;

  // Redeal: new deck, distribute to active players
  var deck = bsCreateDeck();
  var cardsPerPlayer = Math.floor(24 / activePlayers.length);

  activePlayers.forEach(function(p) {
    p.cards = deck.splice(0, cardsPerPlayer);
  });

  // Change designated drink
  var oldDrink = bs.designatedDrink;
  var newDrink;
  do {
    newDrink = BS_DRINKS[Math.floor(Math.random() * 3)];
  } while (newDrink === oldDrink && BS_DRINKS.length > 1);
  bs.designatedDrink = newDrink;

  // Update 3D drink color
  if (typeof bsSetDrinkType === 'function') {
    bsSetDrinkType(newDrink);
  }
}

// ===== CANVAS INIT =====
function initBSCanvas() {
  var t = setTimeout(function() {
    var canvas = document.getElementById('bsCanvas');
    if (canvas && typeof initBombShotThree === 'function') {
      initBombShotThree(canvas);
    }
  }, 100);
  _bsTimers.push(t);
}

// ===== RENDER VIEW =====
function renderBSView(view) {
  if (!view) return;
  _bsView = view;
  showScreen('bombshotGame');

  // Ensure 3D is initialized if scripts are ready
  if (typeof initBombShotThree === 'function' && typeof bsIsInitialized === 'function' && !bsIsInitialized()) {
    var canvas = document.getElementById('bsCanvas');
    if (canvas) initBombShotThree(canvas);
  }

  var myPlayer = view.players.find(function(p) { return p.id === state.myId; });
  var isMyTurn = view.turnPlayerId === state.myId;

  // Clear stale selection
  if (!isMyTurn || view.phase !== 'playing' || (myPlayer && myPlayer.cards && _bsSelected.length > 0)) {
    if (myPlayer && myPlayer.cards) {
      _bsSelected = _bsSelected.filter(function(idx) { return idx < myPlayer.cards.length; });
    }
    if (!isMyTurn || view.phase !== 'playing') {
      _bsSelected = [];
    }
  }

  // -- Top bar: designated drink --
  var badge = document.getElementById('bsDrinkBadge');
  if (badge) {
    badge.className = 'bs-drink-badge ' + view.designatedDrink;
    var info = BS_CARDS[view.designatedDrink];
    document.getElementById('bsDrinkIcon').textContent = info ? info.emoji : '';
    document.getElementById('bsDrinkName').textContent = '지정: ' + (info ? info.name : '');
  }

  // Glass count — show cumulative
  var gc = document.getElementById('bsGlassCount');
  if (gc) gc.textContent = '누적: ' + view.glassPileCount + '장';

  // -- Opponents --
  var oppContainer = document.getElementById('bsOpponents');
  if (oppContainer) {
    var oppHtml = '';
    view.players.forEach(function(p) {
      if (p.id === state.myId) return;
      var isTurn = p.id === view.turnPlayerId;
      var cls = 'bs-opp' + (isTurn ? ' active-turn' : '') + (p.eliminated ? ' eliminated' : '');
      var cardsHtml = '';
      for (var c = 0; c < p.cardCount; c++) {
        cardsHtml += '<div class="bs-opp-card-back"></div>';
      }
      // Roulette danger dots
      var dotsHtml = '<div class="bs-opp-roulette">';
      for (var d = 0; d < 6; d++) {
        var dotCls = d < p.rouletteHitCount ? 'hit' : 'safe';
        dotsHtml += '<span class="bs-roulette-dot ' + dotCls + '"></span>';
      }
      dotsHtml += '</div>';

      oppHtml += '<div class="' + cls + '">' +
        '<div class="bs-opp-turn-marker"></div>' +
        '<div class="bs-opp-avatar">' + p.avatar + '</div>' +
        '<div class="bs-opp-name">' + escapeHtml(p.name) + '</div>' +
        dotsHtml +
        '<div class="bs-opp-cards">' + cardsHtml + '</div>' +
        '<div class="bs-opp-count">' + (p.eliminated ? '💀 탈락' : p.cardCount + '장') + '</div>' +
        '</div>';
    });
    oppContainer.innerHTML = oppHtml;
  }

  // -- My turn banner --
  var banner = document.getElementById('bsMyTurnBanner');
  if (banner) {
    if (isMyTurn && view.phase === 'playing' && myPlayer && !myPlayer.eliminated) {
      banner.classList.add('active');
      banner.textContent = '당신의 차례! 카드를 1~3장 선택하세요';
    } else {
      banner.classList.remove('active');
    }
  }

  // -- Last submission info --
  var lastEl = document.getElementById('bsLastSubmit');
  if (lastEl) {
    if (view.lastSubmission && view.phase === 'playing') {
      lastEl.style.display = 'flex';
      lastEl.innerHTML =
        '<span class="bs-last-submit-name">' + escapeHtml(view.lastSubmission.playerName) + '</span>이(가) ' +
        '<span class="bs-last-submit-count">' + view.lastSubmission.count + '장</span> 제출';
    } else {
      lastEl.style.display = 'none';
    }
  }

  // -- Roulette status --
  var rouletteStatusEl = document.getElementById('bsRouletteStatus');
  if (rouletteStatusEl) {
    var rPhase = view.phase;
    if (rPhase === 'roulette-setup' || rPhase === 'roulette-spin' || rPhase === 'roulette-result' || rPhase === 'camera-return') {
      rouletteStatusEl.style.display = 'block';
      var targetName = view.rouletteTarget ? view.rouletteTarget.name : '???';
      if (rPhase === 'roulette-setup') {
        rouletteStatusEl.innerHTML = '<span class="bs-roulette-status">🎰 ' + escapeHtml(targetName) + '의 룰렛 스핀!</span>';
      } else if (rPhase === 'roulette-spin') {
        rouletteStatusEl.innerHTML = '<span class="bs-roulette-status">🎰 공이 굴러가는 중...</span>';
      } else if (rPhase === 'roulette-result') {
        if (view.rouletteResult === 'hit') {
          rouletteStatusEl.innerHTML = '<span class="bs-roulette-result-hit">💥 ' + escapeHtml(targetName) + ' 당첨! 탈락!</span>';
        } else {
          rouletteStatusEl.innerHTML = '<span class="bs-roulette-result-safe">😮‍💨 ' + escapeHtml(targetName) + ' 세이프!</span>';
        }
      } else {
        rouletteStatusEl.innerHTML = '';
      }
    } else {
      rouletteStatusEl.style.display = 'none';
    }
  }

  // -- My cards --
  var handEl = document.getElementById('bsMyHand');
  if (handEl && myPlayer) {
    if (myPlayer.eliminated) {
      handEl.innerHTML = '<div style="color:var(--bs-neon-pink);font-size:13px;padding:12px;">💀 탈락했습니다!</div>';
    } else if (myPlayer.cards && myPlayer.cards.length > 0) {
      var canSelect = isMyTurn && view.phase === 'playing' && !myPlayer.eliminated;
      var handHtml = '';
      myPlayer.cards.forEach(function(card, idx) {
        var cInfo = BS_CARDS[card] || BS_CARDS.beer;
        var sel = _bsSelected.indexOf(idx) !== -1;
        var cls = 'bs-card ' + cInfo.cssClass + (sel ? ' selected' : '') + (!canSelect ? ' disabled' : '');
        handHtml += '<div class="' + cls + '" onclick="bsToggleCard(' + idx + ')">' +
          '<div class="bs-card-emoji">' + cInfo.emoji + '</div>' +
          '<div class="bs-card-name">' + cInfo.name + '</div>' +
          '</div>';
      });
      handEl.innerHTML = handHtml;
    } else {
      handEl.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;">카드를 모두 냈습니다! 리딜 대기 중...</div>';
    }
  }

  // -- My roulette danger indicator --
  if (myPlayer && !myPlayer.eliminated) {
    var myDotsHtml = '<div class="bs-my-roulette">';
    for (var md = 0; md < 6; md++) {
      var mdCls = md < myPlayer.rouletteHitCount ? 'hit' : 'safe';
      myDotsHtml += '<span class="bs-roulette-dot ' + mdCls + '"></span>';
    }
    myDotsHtml += '<span class="bs-my-roulette-label">내 위험도</span></div>';
    var myRouletteEl = document.getElementById('bsMyRoulette');
    if (myRouletteEl) myRouletteEl.innerHTML = myDotsHtml;
  } else {
    var myRouletteEl = document.getElementById('bsMyRoulette');
    if (myRouletteEl) myRouletteEl.innerHTML = '';
  }

  // -- Action buttons --
  var submitBtn = document.getElementById('bsSubmitBtn');
  var liarBtn = document.getElementById('bsLiarBtn');
  var selCount = document.getElementById('bsSelectedCount');

  if (submitBtn) {
    var canSubmit = isMyTurn && view.phase === 'playing' && _bsSelected.length > 0 && _bsSelected.length <= 3 && myPlayer && !myPlayer.eliminated;
    submitBtn.disabled = !canSubmit;
  }
  if (selCount) selCount.textContent = _bsSelected.length;

  if (liarBtn) {
    var canLiar = view.phase === 'playing' &&
                  view.lastSubmission &&
                  view.lastSubmission.playerId !== state.myId &&
                  myPlayer && !myPlayer.eliminated;
    liarBtn.disabled = !canLiar;
  }

  // -- Status text --
  var statusEl = document.getElementById('bsStatus');
  if (statusEl) {
    if (view.phase === 'playing') {
      var turnPlayer = view.players.find(function(p) { return p.id === view.turnPlayerId; });
      if (isMyTurn) {
        statusEl.innerHTML = '<span class="bs-status-highlight">당신의 차례</span>';
      } else if (turnPlayer) {
        statusEl.innerHTML = '<span class="bs-status-highlight">' + escapeHtml(turnPlayer.name) + '</span>의 차례';
      }
    } else if (view.phase === 'liar-reveal') {
      statusEl.innerHTML = '카드 공개 중...';
    } else if (view.phase === 'roulette-setup' || view.phase === 'roulette-spin') {
      statusEl.innerHTML = '<span class="bs-status-highlight">🎰 룰렛 진행 중</span>';
    } else if (view.phase === 'roulette-result') {
      statusEl.innerHTML = '<span class="bs-status-highlight">룰렛 결과!</span>';
    } else if (view.phase === 'gameover') {
      statusEl.innerHTML = '게임 종료!';
    }
  }

  // -- Liar reveal overlay --
  var revealEl = document.getElementById('bsReveal');
  if (revealEl) {
    if (view.phase === 'liar-reveal' && view.revealedCards) {
      revealEl.style.display = 'flex';
      var titleEl = document.getElementById('bsRevealTitle');
      var cardsEl = document.getElementById('bsRevealCards');
      var resultEl = document.getElementById('bsRevealResult');

      if (titleEl) {
        titleEl.textContent = (view.liarCallerName || '???') + '이(가) 라이어 선언!';
      }

      if (cardsEl) {
        var rCards = '';
        view.revealedCards.forEach(function(card) {
          var cInfo = BS_CARDS[card] || BS_CARDS.beer;
          var isValid = (card === view.designatedDrink || card === 'water');
          rCards += '<div class="bs-reveal-card ' + cInfo.cssClass + (isValid ? ' valid' : ' invalid') + '">' +
            '<div class="bs-card-emoji">' + cInfo.emoji + '</div>' +
            '<div class="bs-card-name">' + cInfo.name + '</div>' +
            '</div>';
        });
        cardsEl.innerHTML = rCards;
      }

      if (resultEl) {
        if (view.revealResult === 'caught') {
          resultEl.className = 'bs-reveal-result liar-caught';
          resultEl.textContent = '거짓말 적발! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + ' → 룰렛 스핀!';
        } else {
          resultEl.className = 'bs-reveal-result liar-wrong';
          resultEl.textContent = '정직했음! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + ' → 룰렛 스핀!';
        }
      }
    } else {
      revealEl.style.display = 'none';
    }
  }

  // -- Game over overlay --
  var goEl = document.getElementById('bsGameOver');
  if (goEl) {
    goEl.style.display = view.phase === 'gameover' ? 'flex' : 'none';
  }

  // -- Update 3D glass --
  if (typeof bsUpdateGlass === 'function') {
    bsUpdateGlass(view.glassPileCount, 24, view.designatedDrink);
  }
}

// ===== CLIENT: CARD SELECTION =====
function bsToggleCard(idx) {
  if (!_bsView) return;
  var myPlayer = _bsView.players.find(function(p) { return p.id === state.myId; });
  if (!myPlayer || myPlayer.eliminated) return;
  if (_bsView.phase !== 'playing') return;
  if (_bsView.turnPlayerId !== state.myId) return;

  var pos = _bsSelected.indexOf(idx);
  if (pos !== -1) {
    _bsSelected.splice(pos, 1);
  } else {
    if (_bsSelected.length >= 3) return;
    _bsSelected.push(idx);
  }

  renderBSView(_bsView);
}

// ===== CLIENT: SUBMIT CARDS =====
function bsSubmitCards() {
  if (!_bsView) return;
  if (_bsSelected.length < 1 || _bsSelected.length > 3) return;
  if (_bsView.phase !== 'playing') return;
  if (_bsView.turnPlayerId !== state.myId) return;

  var indices = _bsSelected.slice();
  _bsSelected = [];

  if (state.isHost) {
    processBSSubmit(state.myId, indices);
  } else {
    sendToHost({ type: 'bs-submit', cardIndices: indices });
  }
}

// ===== CLIENT: CALL LIAR =====
function bsCallLiar() {
  if (!_bsView) return;
  if (_bsView.phase !== 'playing') return;
  if (!_bsView.lastSubmission) return;
  if (_bsView.lastSubmission.playerId === state.myId) return;

  if (state.isHost) {
    processBSLiar(state.myId);
  } else {
    sendToHost({ type: 'bs-liar' });
  }
}

// ===== HANDLE ANIMATION =====
function handleBSAnim(msg) {
  if (!msg) return;
  if (msg.anim === 'submit') {
    if (typeof bsAnimateSubmit === 'function') {
      bsAnimateSubmit(msg.count, null, null);
    }
  } else if (msg.anim === 'reveal') {
    if (typeof bsAnimateLiarReveal === 'function') {
      bsAnimateLiarReveal(null);
    }
  } else if (msg.anim === 'roulette-setup') {
    if (typeof bsAnimateRouletteSetup === 'function') {
      bsAnimateRouletteSetup(msg.hitSlots, msg.targetName);
    }
  } else if (msg.anim === 'roulette-spin') {
    if (typeof bsAnimateRouletteSpin === 'function') {
      bsAnimateRouletteSpin(msg.slotIndex, msg.hitSlots);
    }
  } else if (msg.anim === 'roulette-result') {
    if (typeof bsAnimateRouletteResult === 'function') {
      bsAnimateRouletteResult(msg.result, msg.targetName);
    }
  } else if (msg.anim === 'camera-return') {
    if (typeof bsAnimateCameraReturn === 'function') {
      bsAnimateCameraReturn();
    }
  }
}

// ===== HANDLE RESULT =====
function handleBSResult(msg) {
  if (!msg || !msg.rankings) return;

  var goEl = document.getElementById('bsGameOver');
  if (goEl) goEl.style.display = 'flex';

  var titleEl = document.getElementById('bsGameOverTitle');
  if (titleEl) titleEl.textContent = '게임 종료! 🍺';

  var rankEl = document.getElementById('bsRankings');
  if (rankEl) {
    var html = '';
    var medals = ['🥇', '🥈', '🥉', '4️⃣'];
    msg.rankings.forEach(function(p, i) {
      var isMe = p.id === state.myId;
      var label, labelClass;
      if (p.isWinner) {
        label = '🏆 생존!';
        labelClass = 'safe';
      } else if (p.isLoser) {
        label = '🍺 벌칙! (' + (p.glassPileCount || 0) + '장)';
        labelClass = 'penalty';
      } else {
        label = '💀 탈락';
        labelClass = 'penalty';
      }
      html += '<div class="bs-rank-row' + (p.isLoser ? ' loser' : '') + (p.isWinner ? ' winner' : '') + '">' +
        '<div class="bs-rank-pos">' + (medals[i] || (i + 1)) + '</div>' +
        '<div class="bs-rank-name">' + p.avatar + ' ' + escapeHtml(p.name) + (isMe ? ' (나)' : '') + '</div>' +
        '<div class="bs-rank-label ' + labelClass + '">' + label + '</div></div>';
    });
    rankEl.innerHTML = html;
  }

  // Record game stats
  var myResult = msg.rankings.find(function(p) { return p.id === state.myId; });
  if (myResult) {
    var won = myResult.isWinner;
    if (typeof recordGame === 'function') recordGame(won, won ? 30 : 5);
  }
}

// ===== CLOSE GAME =====
function closeBombShotGame() {
  _bsTimers.forEach(function(t) { clearTimeout(t); });
  _bsTimers = [];
  _bsSelected = [];
  _bsView = null;
  bsState = null;

  if (typeof destroyBombShotThree === 'function') {
    destroyBombShotThree();
  }

  var goEl = document.getElementById('bsGameOver');
  if (goEl) goEl.style.display = 'none';
  var revEl = document.getElementById('bsReveal');
  if (revEl) revEl.style.display = 'none';

  returnToLobby();
}

// ===== HTML ESCAPE =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

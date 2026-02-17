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

  function loadGLTFLoaderThen(cb) {
    if (window.THREE && window.THREE.GLTFLoader) { cb(); return; }
    var sg = document.createElement('script');
    sg.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    sg.onload = cb;
    sg.onerror = cb; // proceed even if loader fails
    document.head.appendChild(sg);
  }

  function onScriptsReady() {
    var canvas = document.getElementById('bsCanvas');
    if (canvas && typeof initBombShotThree === 'function') {
      initBombShotThree(canvas);
    }
  }

  function loadBombShotScene() {
    var s = document.createElement('script');
    s.src = 'js/bombshot-three.js';
    s.onload = function() { loadGLTFLoaderThen(onScriptsReady); };
    s.onerror = function() { _bsThreeLoaded = false; };
    document.head.appendChild(s);
  }

  // Reuse Three.js if already loaded (e.g. from yahtzee)
  if (window.THREE) {
    loadBombShotScene();
    return;
  }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = function() { loadBombShotScene(); };
  s1.onerror = function() { _bsThreeLoaded = false; };
  document.head.appendChild(s1);
}

// ===== STATE =====
var bsState = null;  // host-side full state
var _bsView = null;  // client-side view
var _bsSelected = []; // local selected card indices
var _bsTimers = [];
var _bsSetupDone = false;
var _bsPenalties = ['원샷']; // configured penalty labels (1-3)
var _bsBartenderType = 'default'; // 'default' or 'rabbit'

var BS_CARDS = {
  beer:   { emoji: '🍺', name: '맥주',   cssClass: 'bs-card-beer' },
  soju:   { emoji: '🍶', name: '소주',   cssClass: 'bs-card-soju' },
  liquor: { emoji: '🥃', name: '양주',   cssClass: 'bs-card-liquor' },
  water:  { emoji: '💧', name: '탄산수', cssClass: 'bs-card-water' }
};

var BS_DRINKS = ['beer', 'soju', 'liquor'];

// ===== LOBBY SETUP =====
function bsOpenSetup() {
  var overlay = document.getElementById('bsSetupOverlay');
  if (overlay) overlay.style.display = 'flex';
}
function bsCloseSetup() {
  var overlay = document.getElementById('bsSetupOverlay');
  if (overlay) overlay.style.display = 'none';
}
function bsSelectBartender(type) {
  _bsBartenderType = type || 'default';
  var container = document.getElementById('bsBartenderSelect');
  if (!container) return;
  var options = container.querySelectorAll('.bs-bartender-option');
  for (var i = 0; i < options.length; i++) {
    if (options[i].getAttribute('data-type') === type) {
      options[i].classList.add('selected');
    } else {
      options[i].classList.remove('selected');
    }
  }
}
function bsConfirmSetup() {
  var penalties = [];
  for (var i = 1; i <= 3; i++) {
    var input = document.getElementById('bsPenalty' + i);
    if (input && input.value.trim()) {
      penalties.push(input.value.trim());
    }
  }
  if (penalties.length === 0) {
    showToast('벌칙을 최소 1개 입력해주세요');
    return;
  }
  _bsPenalties = penalties;
  _bsSetupDone = true;
  bsCloseSetup();
  broadcast({ type: 'bs-config', penalties: _bsPenalties, bartenderType: _bsBartenderType });
  bsShowConfigInLobby();
  showToast('벌칙 설정 완료!');
}
function bsHandleConfig(msg) {
  if (msg.penalties) {
    _bsPenalties = msg.penalties;
    _bsSetupDone = true;
    bsShowConfigInLobby();
  }
  if (msg.bartenderType) {
    _bsBartenderType = msg.bartenderType;
  }
}
function bsShowConfigInLobby() {
  var el = document.getElementById('bsConfigDisplay');
  if (!el) return;
  el.style.display = 'block';
  var html = '<div style="font-size:12px;color:var(--text-dim);padding:6px 10px;">';
  html += '<strong>🎰 룰렛 구성:</strong> 폭탄주 2칸 / 세이프 2칸 / 벌칙 2칸<br>';
  html += '<strong>벌칙:</strong> ' + _bsPenalties.map(function(p) { return '🔸' + p; }).join(' ');
  html += '</div>';
  el.innerHTML = html;
}

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

// ===== ROULETTE SLOTS (v2: 1/3 bombshot, 1/3 penalty, 1/3 safe) =====
function generateRouletteSlots(penalties) {
  // 6 chambers: 2 bombshot, 2 penalty, 2 safe — shuffled randomly
  var pens = penalties || _bsPenalties || ['원샷'];
  var slots = [
    { type: 'bombshot', label: '폭탄주' },
    { type: 'bombshot', label: '폭탄주' },
    { type: 'safe', label: '세이프' },
    { type: 'safe', label: '세이프' },
    { type: 'penalty', label: pens[Math.floor(Math.random() * pens.length)] },
    { type: 'penalty', label: pens[Math.floor(Math.random() * pens.length)] }
  ];
  // Fisher-Yates shuffle
  for (var i = slots.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
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
  if (!_bsSetupDone) {
    showToast('먼저 벌칙 설정을 해주세요!');
    return;
  }

  window._bsBartenderType = _bsBartenderType;
  loadBombShotThree();

  var deck = bsCreateDeck();
  var pCount = state.players.length;
  var cardsPerPlayer = Math.floor(24 / pCount);

  var players = state.players.map(function(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: deck.splice(0, cardsPerPlayer)
    };
  });

  var drink = BS_DRINKS[Math.floor(Math.random() * 3)];

  bsState = {
    players: players,
    designatedDrink: drink,
    turnIdx: 0,
    glassPile: [],
    lastSubmission: null,
    phase: 'playing',
    penalties: _bsPenalties.slice(), // configured penalty labels
    penaltyPlayer: null,
    revealedCards: null,
    liarCallerId: null,
    liarCallerName: null,
    revealResult: null,
    savedTurnIdx: -1,  // saved turn position before liar call
    // Roulette state
    rouletteTarget: null,
    rouletteSlots: null,
    rouletteSlotIndex: -1,
    rouletteResult: null,     // 'safe' | 'bombshot' | 'penalty'
    rouletteResultLabel: null  // penalty text for display
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
        cardCount: p.cards.length
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
    penaltyPlayer: bs.penaltyPlayer,
    revealedCards: bs.phase === 'liar-reveal' ? bs.revealedCards : null,
    liarCallerId: bs.liarCallerId,
    liarCallerName: bs.liarCallerName,
    revealResult: bs.revealResult,
    // Roulette data
    rouletteTarget: bs.rouletteTarget,
    rouletteSlots: bs.rouletteSlots,
    rouletteSlotIndex: bs.rouletteSlotIndex,
    rouletteResult: bs.rouletteResult,
    rouletteResultLabel: bs.rouletteResultLabel
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
    bsCheckRedeal();
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
  if (!caller) return;

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

  // Save current turn position for resuming after roulette
  bs.savedTurnIdx = bs.turnIdx;
  bs.lastSubmission = null;

  // Broadcast reveal animation
  broadcast({ type: 'bs-anim', anim: 'reveal' });
  handleBSAnim({ anim: 'reveal' });
  broadcastBSState();

  // === ROULETTE TIMING CHAIN ===
  // Phase 1: liar-reveal (4s) — show cards, then enter roulette-setup and WAIT for player spin
  var t1 = setTimeout(function() {
    if (!bsState) return;

    var target = bsState.players.find(function(p) { return p.id === penalizedId; });
    if (!target) {
      bsResumeAfterRoulette();
      return;
    }

    var slots = generateRouletteSlots(bsState.penalties);
    var slotIndex = Math.floor(Math.random() * 6);
    var landedSlot = slots[slotIndex]; // { type, label }

    bsState.rouletteTarget = { id: target.id, name: target.name };
    bsState.rouletteSlots = slots;
    bsState.rouletteSlotIndex = slotIndex;
    bsState.rouletteResult = landedSlot.type;      // 'bombshot' | 'penalty' | 'safe'
    bsState.rouletteResultLabel = landedSlot.label; // display text
    bsState.phase = 'roulette-setup';

    // Broadcast roulette-setup anim (send full slot data for 3D rendering)
    broadcast({ type: 'bs-anim', anim: 'roulette-setup', slots: slots, targetName: target.name });
    handleBSAnim({ anim: 'roulette-setup', slots: slots, targetName: target.name });
    broadcastBSState();
    // Now WAIT — player must press spin button (or AI auto-spins)
  }, 4000);
  _bsTimers.push(t1);
}

// ===== HOST: PROCESS SPIN (player pressed spin button) =====
function processBSSpin(peerId) {
  if (!state.isHost || !bsState) return;
  if (bsState.phase !== 'roulette-setup') return;
  if (!bsState.rouletteTarget || bsState.rouletteTarget.id !== peerId) return;

  var bs = bsState;
  var slotIndex = bs.rouletteSlotIndex;
  var slots = bs.rouletteSlots;
  var landedSlot = slots[slotIndex];
  var target = bs.rouletteTarget;

  bs.phase = 'roulette-spin';

  broadcast({ type: 'bs-anim', anim: 'roulette-spin', slotIndex: slotIndex, slots: slots });
  handleBSAnim({ anim: 'roulette-spin', slotIndex: slotIndex, slots: slots });
  broadcastBSState();

  // Phase 3: roulette-spin (5.5s) — ball rolls
  var t3 = setTimeout(function() {
    if (!bsState) return;
    bsState.phase = 'roulette-result';

    broadcast({ type: 'bs-anim', anim: 'roulette-result', result: landedSlot.type, resultLabel: landedSlot.label, targetName: target.name });
    handleBSAnim({ anim: 'roulette-result', result: landedSlot.type, resultLabel: landedSlot.label, targetName: target.name });
    broadcastBSState();

    // Phase 4: roulette-result (3s) — show result
    var t4 = setTimeout(function() {
      if (!bsState) return;

      bsState.phase = 'camera-return';
      broadcast({ type: 'bs-anim', anim: 'camera-return' });
      handleBSAnim({ anim: 'camera-return' });
      broadcastBSState();

      // Phase 5: camera-return (1s), then apply result
      var t5 = setTimeout(function() {
        if (!bsState) return;

        if (landedSlot.type === 'bombshot') {
          // BOMB SHOT → game over immediately!
          bsState.phase = 'gameover';
          var result = {
            type: 'bs-result',
            bombshotPlayer: { id: target.id, name: target.name },
            reason: 'bombshot',
            rankings: bsState.players.map(function(p) {
              return {
                id: p.id, name: p.name, avatar: p.avatar,
                isBombshot: p.id === target.id,
                isWinner: p.id !== target.id
              };
            })
          };
          broadcast(result);
          handleBSResult(result);
        } else {
          // penalty or safe → continue game
          bsResumeAfterRoulette();
        }
      }, 1000);
      _bsTimers.push(t5);
    }, 3000);
    _bsTimers.push(t4);
  }, 5800);
  _bsTimers.push(t3);
}

// ===== CLIENT: SPIN ROULETTE =====
function bsSpin() {
  if (!_bsView || _bsView.phase !== 'roulette-setup') return;
  if (!_bsView.rouletteTarget || _bsView.rouletteTarget.id !== state.myId) return;

  if (state.isHost) {
    processBSSpin(state.myId);
  } else {
    sendToHost({ type: 'bs-spin' });
  }
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
  bs.rouletteResultLabel = null;

  // Restore turn to saved position (original order, not affected by liar call)
  if (bs.savedTurnIdx >= 0) {
    bs.turnIdx = bs.savedTurnIdx;
    bs.savedTurnIdx = -1;
  }

  // Check redeal
  bsCheckRedeal();

  // Advance to next player from the saved position
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
    // Skip players with 0 cards (no elimination in new rules)
    if (p.cards.length > 0) return;
  }
  // If everyone is out of cards, redeal
  bsCheckRedeal();
}

// ===== HOST: CHECK REDEAL =====
function bsCheckRedeal() {
  if (!bsState) return;
  var bs = bsState;
  var activePlayers = bs.players;

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
  window._bsBartenderType = _bsBartenderType;
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
      var cls = 'bs-opp' + (isTurn ? ' active-turn' : '');
      var cardsHtml = '';
      for (var c = 0; c < p.cardCount; c++) {
        cardsHtml += '<div class="bs-opp-card-back"></div>';
      }
      oppHtml += '<div class="' + cls + '">' +
        '<div class="bs-opp-turn-marker"></div>' +
        '<div class="bs-opp-avatar">' + p.avatar + '</div>' +
        '<div class="bs-opp-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="bs-opp-cards">' + cardsHtml + '</div>' +
        '<div class="bs-opp-count">' + p.cardCount + '장</div>' +
        '</div>';
    });
    oppContainer.innerHTML = oppHtml;
  }

  // -- My turn banner --
  var banner = document.getElementById('bsMyTurnBanner');
  if (banner) {
    if (isMyTurn && view.phase === 'playing' && myPlayer) {
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

  // -- Roulette status with 2D slot strip --
  var rouletteStatusEl = document.getElementById('bsRouletteStatus');
  if (rouletteStatusEl) {
    var rPhase = view.phase;
    if (rPhase === 'roulette-setup' || rPhase === 'roulette-spin' || rPhase === 'roulette-result' || rPhase === 'camera-return') {
      rouletteStatusEl.style.display = 'block';
      var targetName = view.rouletteTarget ? view.rouletteTarget.name : '???';
      var isMyRoulette = view.rouletteTarget && view.rouletteTarget.id === state.myId;

      // Build 2D slot strip
      var slotStrip = '';
      if (view.rouletteSlots) {
        slotStrip = '<div style="display:flex;gap:4px;justify-content:center;margin:8px 0;flex-wrap:wrap;">';
        for (var si = 0; si < view.rouletteSlots.length; si++) {
          var slot = view.rouletteSlots[si];
          var slotBg, slotIcon, slotLabel;
          if (slot.type === 'bombshot') {
            slotBg = 'background:linear-gradient(135deg,#ff1744,#d50000);';
            slotIcon = '💣';
            slotLabel = '폭탄주';
          } else if (slot.type === 'penalty') {
            slotBg = 'background:linear-gradient(135deg,#ff9100,#e65100);';
            slotIcon = '🔸';
            slotLabel = slot.label || '벌칙';
          } else {
            slotBg = 'background:linear-gradient(135deg,#00c853,#009624);';
            slotIcon = '✓';
            slotLabel = '세이프';
          }
          var isWinner = rPhase === 'roulette-result' && si === view.rouletteSlotIndex;
          var slotHighlight = isWinner ? 'box-shadow:0 0 0 3px #fff,0 0 12px rgba(255,255,255,0.6);transform:scale(1.1);animation:bs-slot-blink 0.5s ease-in-out infinite alternate;' : 'opacity:' + (rPhase === 'roulette-result' ? '0.4' : '1') + ';';
          slotStrip += '<div style="' + slotBg + slotHighlight +
            'border-radius:8px;padding:6px 8px;min-width:52px;text-align:center;transition:all 0.3s;">' +
            '<div style="font-size:18px;line-height:1;">' + slotIcon + '</div>' +
            '<div style="font-size:10px;font-weight:600;margin-top:2px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);">' + escapeHtml(slotLabel) + '</div>' +
            '</div>';
        }
        slotStrip += '</div>';
      }

      // Phase-specific content
      var statusContent = '';
      if (rPhase === 'roulette-setup') {
        statusContent = '<span class="bs-roulette-status">🍺💣 ' + escapeHtml(targetName) + '의 폭탄주 룰렛!</span>' + slotStrip;
        if (isMyRoulette) {
          statusContent += '<button onclick="bsSpin()" style="' +
            'display:block;margin:8px auto 0;padding:12px 32px;font-size:16px;font-weight:700;' +
            'background:linear-gradient(135deg,#ff6b35,#ff3d00);color:#fff;border:none;border-radius:12px;' +
            'cursor:pointer;animation:bs-spin-pulse 1s ease-in-out infinite alternate;' +
            'box-shadow:0 4px 15px rgba(255,61,0,0.4);' +
            '">🎰 스핀!</button>';
        } else {
          statusContent += '<div style="text-align:center;font-size:13px;color:var(--text-dim);margin-top:6px;">' +
            escapeHtml(targetName) + '이(가) 스핀 버튼을 누르길 대기 중...</div>';
        }
      } else if (rPhase === 'roulette-spin') {
        statusContent = '<span class="bs-roulette-status">🎰 폭탄주 룰렛 회전 중...</span>' + slotStrip;
      } else if (rPhase === 'roulette-result') {
        if (view.rouletteResult === 'bombshot') {
          statusContent = '<span class="bs-roulette-result-hit">🍺💥 ' + escapeHtml(targetName) + ' 폭탄주 당첨! 게임오버!</span>' + slotStrip;
        } else if (view.rouletteResult === 'penalty') {
          var penLabel = view.rouletteResultLabel || '벌칙';
          statusContent = '<span class="bs-roulette-result-hit" style="color:#ffaa33;">🔸 ' + escapeHtml(targetName) + ' 벌칙: <strong>' + escapeHtml(penLabel) + '</strong>!</span>' + slotStrip;
        } else {
          statusContent = '<span class="bs-roulette-result-safe">😮‍💨 ' + escapeHtml(targetName) + ' 세이프! 살았다!</span>' + slotStrip;
        }
      } else {
        statusContent = '';
      }
      rouletteStatusEl.innerHTML = statusContent;
    } else {
      rouletteStatusEl.style.display = 'none';
    }
  }

  // -- My cards --
  var handEl = document.getElementById('bsMyHand');
  if (handEl && myPlayer) {
    if (myPlayer.cards && myPlayer.cards.length > 0) {
      var canSelect = isMyTurn && view.phase === 'playing';
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

  // -- Roulette info (static composition) --
  var myRouletteEl = document.getElementById('bsMyRoulette');
  if (myRouletteEl) {
    myRouletteEl.innerHTML = '<div style="font-size:11px;color:var(--text-dim);opacity:0.7;">🎰 룰렛: 폭탄주 2 / 벌칙 2 / 세이프 2</div>';
  }

  // -- Action buttons --
  var submitBtn = document.getElementById('bsSubmitBtn');
  var liarBtn = document.getElementById('bsLiarBtn');
  var selCount = document.getElementById('bsSelectedCount');

  if (submitBtn) {
    var canSubmit = isMyTurn && view.phase === 'playing' && _bsSelected.length > 0 && _bsSelected.length <= 3 && myPlayer;
    submitBtn.disabled = !canSubmit;
  }
  if (selCount) selCount.textContent = _bsSelected.length;

  if (liarBtn) {
    var canLiar = view.phase === 'playing' &&
                  view.lastSubmission &&
                  view.lastSubmission.playerId !== state.myId &&
                  myPlayer;
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
      statusEl.innerHTML = '<span class="bs-status-highlight">🍺💣 폭탄주 룰렛 진행 중</span>';
    } else if (view.phase === 'roulette-result') {
      statusEl.innerHTML = '<span class="bs-status-highlight">폭탄주 룰렛 결과!</span>';
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
          resultEl.textContent = '거짓말 적발! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + ' → 폭탄주 룰렛!';
        } else {
          resultEl.className = 'bs-reveal-result liar-wrong';
          resultEl.textContent = '정직했음! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + ' → 폭탄주 룰렛!';
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
  if (!myPlayer) return;
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
  // Ensure Three.js is loaded for 3D animations
  if (typeof loadBombShotThree === 'function') loadBombShotThree();

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
      bsAnimateRouletteSetup(msg.slots, msg.targetName);
    }
  } else if (msg.anim === 'roulette-spin') {
    if (typeof bsAnimateRouletteSpin === 'function') {
      bsAnimateRouletteSpin(msg.slotIndex, msg.slots);
    }
  } else if (msg.anim === 'roulette-result') {
    if (typeof bsAnimateRouletteResult === 'function') {
      bsAnimateRouletteResult(msg.result, msg.targetName);
    }
    // Show toast for penalty results
    if (msg.result === 'penalty' && msg.resultLabel) {
      showToast('🔸 ' + (msg.targetName || '') + ' 벌칙: ' + msg.resultLabel + '!');
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
  if (titleEl) {
    if (msg.reason === 'bombshot' && msg.bombshotPlayer) {
      titleEl.textContent = '🍺💥 ' + msg.bombshotPlayer.name + ' 폭탄주 당첨!';
    } else {
      titleEl.textContent = '🍺💣 폭탄주 게임 종료!';
    }
  }

  var rankEl = document.getElementById('bsRankings');
  if (rankEl) {
    var html = '';
    msg.rankings.forEach(function(p) {
      var isMe = p.id === state.myId;
      var label, labelClass;
      if (p.isBombshot) {
        label = '🍺💣 폭탄주!';
        labelClass = 'penalty';
      } else {
        label = '😮‍💨 세이프';
        labelClass = 'safe';
      }
      html += '<div class="bs-rank-row' + (p.isBombshot ? ' loser' : ' winner') + '">' +
        '<div class="bs-rank-pos">' + (p.isBombshot ? '🍺' : '😮‍💨') + '</div>' +
        '<div class="bs-rank-name">' + p.avatar + ' ' + escapeHtml(p.name) + (isMe ? ' (나)' : '') + '</div>' +
        '<div class="bs-rank-label ' + labelClass + '">' + label + '</div></div>';
    });
    rankEl.innerHTML = html;
  }

  // Record game stats
  var myResult = msg.rankings.find(function(p) { return p.id === state.myId; });
  if (myResult) {
    var won = !myResult.isBombshot;
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
  _bsSetupDone = false;
  _bsBartenderType = 'default';

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

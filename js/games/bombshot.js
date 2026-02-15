// =============================================
// BOMB SHOT BLUFF (폭탄주 블러프)
// Liar's Bar variant — P2P card game
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

  var players = state.players.map(function(p, idx) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: deck.splice(0, cardsPerPlayer),
      finished: false,
      finishOrder: -1
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
    finishedCount: 0,
    penaltyPlayer: null,
    revealedCards: null,
    liarCallerId: null,
    liarCallerName: null,
    revealResult: null     // 'caught' | 'wrong'
  };

  // Broadcast game-start (without state — personalized state follows via broadcastBSState)
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
        finished: p.finished,
        finishOrder: p.finishOrder
      };
    }),
    designatedDrink: bs.designatedDrink,
    turnPlayerId: currentTurnPlayer ? currentTurnPlayer.id : null,
    glassPileCount: bs.glassPile.length,
    lastSubmission: bs.lastSubmission ? {
      playerId: bs.lastSubmission.playerId,
      playerName: bs.lastSubmission.playerName,
      count: bs.lastSubmission.count,
      // Only reveal cards during liar-reveal phase
      cards: bs.phase === 'liar-reveal' ? bs.lastSubmission.cards : null
    } : null,
    phase: bs.phase,
    finishedCount: bs.finishedCount,
    penaltyPlayer: bs.penaltyPlayer,
    revealedCards: bs.phase === 'liar-reveal' ? bs.revealedCards : null,
    liarCallerId: bs.liarCallerId,
    liarCallerName: bs.liarCallerName,
    revealResult: bs.revealResult
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
  if (!player || player.id !== peerId) return; // not their turn
  if (player.finished) return;

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

  // Add to glass pile
  for (var k = 0; k < submittedCards.length; k++) {
    bs.glassPile.push(submittedCards[k]);
  }

  bs.lastSubmission = {
    playerId: player.id,
    playerName: player.name,
    cards: submittedCards,
    count: submittedCards.length
  };

  // Check if player finished
  if (player.cards.length === 0) {
    player.finished = true;
    bs.finishedCount++;
    player.finishOrder = bs.finishedCount;
  }

  // Broadcast animation trigger
  broadcast({ type: 'bs-anim', anim: 'submit', count: submittedCards.length, drink: bs.designatedDrink });
  handleBSAnim({ anim: 'submit', count: submittedCards.length, drink: bs.designatedDrink });

  // Broadcast state immediately (shows submission info, allows liar calls)
  broadcastBSState();

  // Delay game end check + turn advance to give liar call window
  var t = setTimeout(function() {
    if (!bsState || bsState.phase !== 'playing') return;
    // Check game end after liar window
    if (bsCheckGameEnd()) return;
    bsAdvanceTurn();
    broadcastBSState();
  }, 2500);
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
  if (!caller || caller.finished) return;

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

  // Determine penalty
  var penalizedId = isLiar ? bs.lastSubmission.playerId : callerId;
  var penalizedPlayer = bs.players.find(function(p) { return p.id === penalizedId; });
  bs.penaltyPlayer = { id: penalizedId, name: penalizedPlayer ? penalizedPlayer.name : '' };

  // Penalized player takes glass pile
  if (penalizedPlayer) {
    for (var j = 0; j < bs.glassPile.length; j++) {
      penalizedPlayer.cards.push(bs.glassPile[j]);
    }
    // If they were finished, un-finish them
    if (penalizedPlayer.finished) {
      penalizedPlayer.finished = false;
      bs.finishedCount--;
      penalizedPlayer.finishOrder = -1;
    }
  }

  // Clear glass
  bs.glassPile = [];
  bs.lastSubmission = null;

  // Broadcast reveal animation
  broadcast({ type: 'bs-anim', anim: 'reveal' });
  handleBSAnim({ anim: 'reveal' });

  broadcastBSState();

  // After 3 seconds, resume play
  var t = setTimeout(function() {
    if (!bsState) return;
    bs.phase = 'playing';
    bs.revealedCards = null;
    bs.revealResult = null;
    bs.liarCallerId = null;
    bs.liarCallerName = null;
    bs.penaltyPlayer = null;

    if (bsCheckGameEnd()) return;

    // Continue from next player after the submitter
    bsAdvanceTurn();
    broadcastBSState();
  }, 3500);
  _bsTimers.push(t);
}

// ===== HOST: ADVANCE TURN =====
function bsAdvanceTurn() {
  if (!bsState) return;
  var bs = bsState;
  var pCount = bs.players.length;
  var startIdx = bs.turnIdx;

  for (var i = 0; i < pCount; i++) {
    bs.turnIdx = (bs.turnIdx + 1) % pCount;
    if (!bs.players[bs.turnIdx].finished) return;
  }
  // All finished — shouldn't happen if we check game end properly
}

// ===== HOST: CHECK GAME END =====
function bsCheckGameEnd() {
  if (!bsState) return false;
  var bs = bsState;
  var activePlayers = bs.players.filter(function(p) { return !p.finished; });

  if (activePlayers.length <= 1) {
    bs.phase = 'gameover';

    // The remaining player is the loser
    if (activePlayers.length === 1) {
      var loser = activePlayers[0];
      loser.finishOrder = bs.players.length; // last place
    }

    // Build result — sort by finishOrder, treating -1 (un-finished then re-finished) as last
    var rankings = bs.players.slice().sort(function(a, b) {
      var aOrd = a.finishOrder > 0 ? a.finishOrder : 999;
      var bOrd = b.finishOrder > 0 ? b.finishOrder : 999;
      return aOrd - bOrd;
    });

    var result = {
      type: 'bs-result',
      rankings: rankings.map(function(p) {
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          finishOrder: p.finishOrder,
          isLoser: p.finishOrder === bs.players.length
        };
      })
    };

    broadcast(result);
    handleBSResult(result);
    return true;
  }
  return false;
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

  // Clear stale selection when it's not my turn, phase changed, or card count changed
  if (!isMyTurn || view.phase !== 'playing' || (myPlayer && myPlayer.cards && _bsSelected.length > 0)) {
    // Validate selected indices are still in bounds
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

  // Glass count
  var gc = document.getElementById('bsGlassCount');
  if (gc) gc.textContent = view.glassPileCount;

  // -- Opponents --
  var oppContainer = document.getElementById('bsOpponents');
  if (oppContainer) {
    var oppHtml = '';
    view.players.forEach(function(p) {
      if (p.id === state.myId) return;
      var isTurn = p.id === view.turnPlayerId;
      var cls = 'bs-opp' + (isTurn ? ' active-turn' : '') + (p.finished ? ' finished' : '');
      var cardsHtml = '';
      for (var c = 0; c < p.cardCount; c++) {
        cardsHtml += '<div class="bs-opp-card-back"></div>';
      }
      oppHtml += '<div class="' + cls + '">' +
        '<div class="bs-opp-turn-marker"></div>' +
        '<div class="bs-opp-avatar">' + p.avatar + '</div>' +
        '<div class="bs-opp-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="bs-opp-cards">' + cardsHtml + '</div>' +
        '<div class="bs-opp-count">' + (p.finished ? '완료!' : p.cardCount + '장') + '</div>' +
        '</div>';
    });
    oppContainer.innerHTML = oppHtml;
  }

  // -- My turn banner --
  var banner = document.getElementById('bsMyTurnBanner');
  if (banner) {
    if (isMyTurn && view.phase === 'playing' && myPlayer && !myPlayer.finished) {
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

  // -- My cards --
  var handEl = document.getElementById('bsMyHand');
  if (handEl && myPlayer) {
    if (myPlayer.cards && myPlayer.cards.length > 0) {
      var canSelect = isMyTurn && view.phase === 'playing' && !myPlayer.finished;
      var handHtml = '';
      myPlayer.cards.forEach(function(card, idx) {
        var info = BS_CARDS[card] || BS_CARDS.beer;
        var sel = _bsSelected.indexOf(idx) !== -1;
        var cls = 'bs-card ' + info.cssClass + (sel ? ' selected' : '') + (!canSelect ? ' disabled' : '');
        handHtml += '<div class="' + cls + '" onclick="bsToggleCard(' + idx + ')">' +
          '<div class="bs-card-emoji">' + info.emoji + '</div>' +
          '<div class="bs-card-name">' + info.name + '</div>' +
          '</div>';
      });
      handEl.innerHTML = handHtml;
    } else {
      handEl.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;">카드를 모두 냈습니다! 🎉</div>';
    }
  }

  // -- Action buttons --
  var submitBtn = document.getElementById('bsSubmitBtn');
  var liarBtn = document.getElementById('bsLiarBtn');
  var selCount = document.getElementById('bsSelectedCount');

  if (submitBtn) {
    var canSubmit = isMyTurn && view.phase === 'playing' && _bsSelected.length > 0 && _bsSelected.length <= 3 && myPlayer && !myPlayer.finished;
    submitBtn.disabled = !canSubmit;
  }
  if (selCount) selCount.textContent = _bsSelected.length;

  if (liarBtn) {
    // Liar button enabled for everyone (except submitter) when there's a lastSubmission and phase is playing
    var canLiar = view.phase === 'playing' &&
                  view.lastSubmission &&
                  view.lastSubmission.playerId !== state.myId &&
                  myPlayer && !myPlayer.finished;
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
          var info = BS_CARDS[card] || BS_CARDS.beer;
          var isValid = (card === view.designatedDrink || card === 'water');
          rCards += '<div class="bs-reveal-card ' + info.cssClass + (isValid ? ' valid' : ' invalid') + '">' +
            '<div class="bs-card-emoji">' + info.emoji + '</div>' +
            '<div class="bs-card-name">' + info.name + '</div>' +
            '</div>';
        });
        cardsEl.innerHTML = rCards;
      }

      if (resultEl) {
        if (view.revealResult === 'caught') {
          resultEl.className = 'bs-reveal-result liar-caught';
          resultEl.textContent = '거짓말 적발! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + '에게 글라스 카드 전달!';
        } else {
          resultEl.className = 'bs-reveal-result liar-wrong';
          resultEl.textContent = '정직했음! ' + (view.penaltyPlayer ? view.penaltyPlayer.name : '') + '이(가) 글라스 카드 수거!';
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
  if (!myPlayer || myPlayer.finished) return;
  if (_bsView.phase !== 'playing') return;
  if (_bsView.turnPlayerId !== state.myId) return;

  var pos = _bsSelected.indexOf(idx);
  if (pos !== -1) {
    _bsSelected.splice(pos, 1);
  } else {
    if (_bsSelected.length >= 3) return; // max 3
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
      var isLoser = p.isLoser;
      var isMe = p.id === state.myId;
      html += '<div class="bs-rank-row' + (isLoser ? ' loser' : '') + '">' +
        '<div class="bs-rank-pos">' + (medals[i] || (i + 1)) + '</div>' +
        '<div class="bs-rank-name">' + p.avatar + ' ' + escapeHtml(p.name) + (isMe ? ' (나)' : '') + '</div>' +
        '<div class="bs-rank-label ' + (isLoser ? 'penalty' : 'safe') + '">' +
        (isLoser ? '🍺 벌칙!' : '통과') +
        '</div></div>';
    });
    rankEl.innerHTML = html;
  }

  // Record game stats
  var myResult = msg.rankings.find(function(p) { return p.id === state.myId; });
  if (myResult) {
    var won = !myResult.isLoser;
    if (typeof recordGame === 'function') recordGame(won, won ? 30 : 5);
  }
}

// ===== CLOSE GAME =====
function closeBombShotGame() {
  // Cleanup timers
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

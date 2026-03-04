// =============================================
// DRINK-DODGE POKER (술피하기 포커)
// Cockroach Poker variant — bluffing party game
// 48 cards: 4 drink types × 12 each
// =============================================

// ===== CONSTANTS =====
const DP_TYPES = ['soju', 'whiskey', 'beer', 'makgeolli'];
const DP_EMOJI = { soju: '🍶', whiskey: '🥃', beer: '🍺', makgeolli: '🍵' };
const DP_NAMES = { soju: '소주', whiskey: '양주', beer: '맥주', makgeolli: '막걸리' };
const DP_LOSE_SAME = 5;   // 같은 종류 5장 → 패배
const DP_LOSE_EACH = 2;   // 모든 종류 2장씩(8장) → 패배

// ===== STATE =====
var dpState = null;   // host-only full game state
var _dpView = null;   // client-side current view
var _dpTimers = [];    // cleanup timers

// ===== DECK =====
function dpCreateDeck() {
  var deck = [];
  for (var t = 0; t < DP_TYPES.length; t++) {
    for (var i = 0; i < 12; i++) {
      deck.push(DP_TYPES[t]);
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
function startDrinkPoker() {
  if (!state.isHost) return;
  closeDPCleanup();
  if (state.players.length < 2 || state.players.length > 6) {
    showToast('술피하기 포커는 2~6명만 플레이 가능합니다');
    return;
  }

  var deck = dpCreateDeck();
  var pCount = state.players.length;
  var cardsPerPlayer = Math.floor(48 / pCount);

  var hands = {};
  var faceUp = {};
  var playerList = [];

  state.players.forEach(function(p) {
    hands[p.id] = deck.splice(0, cardsPerPlayer);
    faceUp[p.id] = { soju: 0, whiskey: 0, beer: 0, makgeolli: 0 };
    playerList.push({ id: p.id, name: p.name, avatar: p.avatar });
  });

  dpState = {
    hands: hands,
    faceUp: faceUp,
    currentCard: null,
    currentDraw: null,
    phase: 'send',
    turnPlayerId: state.players[0].id,
    loserId: null,
    players: playerList
  };

  broadcast({ type: 'game-start', game: 'drinkpoker', state: buildDPView(state.players[0].id) });
  showScreen('drinkpokerGame');
  broadcastDPState();
}

// ===== HOST: BUILD VIEW FOR A PLAYER =====
function buildDPView(forPlayerId) {
  var dp = dpState;
  var playersView = dp.players.map(function(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      handCount: dp.hands[p.id] ? dp.hands[p.id].length : 0,
      faceUp: dp.faceUp[p.id] || { soju: 0, whiskey: 0, beer: 0, makgeolli: 0 }
    };
  });

  var cardView = null;
  if (dp.currentCard) {
    cardView = {
      claim: dp.currentCard.claim,
      senderId: dp.currentCard.senderId,
      fromId: dp.currentCard.fromId,
      targetId: dp.currentCard.targetId,
      peekHistory: dp.currentCard.peekHistory.slice()
    };
    // Only reveal actual card in reveal phase
    if (dp.phase === 'reveal') {
      cardView.actualCard = dp.currentCard.card;
    }
    // If this player is the current target and phase is peek-pass, show actual card (they peeked)
    if (dp.phase === 'peek-pass' && dp.currentCard.fromId === forPlayerId) {
      cardView.actualCard = dp.currentCard.card;
    }
  }

  var drawView = null;
  if (dp.currentDraw) {
    drawView = {
      ownerId: dp.currentDraw.ownerId
    };
    if (dp.currentDraw.ownerId === forPlayerId) {
      drawView.card = dp.currentDraw.card;
    }
  }

  return {
    type: 'dp-state',
    phase: dp.phase,
    turnPlayerId: dp.turnPlayerId,
    players: playersView,
    myHand: dp.hands[forPlayerId] ? dp.hands[forPlayerId].map(function() { return 'hidden'; }) : [],
    myHandCount: dp.hands[forPlayerId] ? dp.hands[forPlayerId].length : 0,
    currentDraw: drawView,
    currentCard: cardView,
    loserId: dp.loserId
  };
}

// ===== HOST: BROADCAST STATE TO ALL =====
function broadcastDPState() {
  if (!state.isHost || !dpState) return;
  dpState.players.forEach(function(p) {
    var view = buildDPView(p.id);
    if (p.id === state.myId) {
      renderDPView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

// ===== HOST: PROCESS SEND =====
function processDPDraw(playerId) {
  if (!state.isHost || !dpState) return;
  if (dpState.phase !== 'send') return;
  if (dpState.turnPlayerId !== playerId) return;

  var hand = dpState.hands[playerId];
  if (!hand || hand.length === 0) return;

  var randomIdx = Math.floor(Math.random() * hand.length);
  var card = hand.splice(randomIdx, 1)[0];

  dpState.currentDraw = {
    ownerId: playerId,
    card: card
  };
  dpState.phase = 'draw-preview';
  broadcastDPState();
}

function processDPSend(fromId, cardIdx, targetId, claim) {
  if (!state.isHost || !dpState) return;
  if (dpState.turnPlayerId !== fromId) return;

  // Validate target exists and is not sender
  var targetExists = dpState.players.some(function(p) { return p.id === targetId; });
  if (!targetExists || targetId === fromId) return;

  // Validate claim is a valid type
  if (DP_TYPES.indexOf(claim) === -1) return;

  var card = null;
  if (dpState.phase === 'draw-preview') {
    if (!dpState.currentDraw || dpState.currentDraw.ownerId !== fromId) return;
    card = dpState.currentDraw.card;
    dpState.currentDraw = null;
  } else if (dpState.phase === 'send') {
    // Legacy path (kept for compatibility)
    var hand = dpState.hands[fromId];
    if (!hand || cardIdx < 0 || cardIdx >= hand.length) return;
    card = hand.splice(cardIdx, 1)[0];
  } else {
    return;
  }

  dpState.currentCard = {
    card: card,
    claim: claim,
    senderId: fromId,
    fromId: fromId,
    peekHistory: [],
    targetId: targetId
  };

  dpState.phase = 'respond';
  broadcastDPState();
}

// ===== HOST: PROCESS RESPOND =====
function processDPRespond(fromId, choice) {
  if (!state.isHost || !dpState) return;
  if (dpState.phase !== 'respond') return;

  var cc = dpState.currentCard;
  if (!cc || cc.targetId !== fromId) return;

  if (choice === 'peek') {
    // Check if peek is allowed — must have at least one eligible pass target remaining
    var eligible = dpGetEligibleTargets(cc);
    if (eligible.length === 0) {
      // No one to pass to: force a call, peek not allowed
      // Only show toast if this is the local player (not a remote client's action)
      if (fromId === state.myId) showToast('넘길 사람이 없어서 반드시 판정해야 합니다!');
      return;
    }

    // Add to peek history
    cc.peekHistory.push(fromId);
    cc.fromId = fromId;
    dpState.phase = 'peek-pass';
    broadcastDPState();
  } else if (choice === 'true' || choice === 'false') {
    var calledTrue = (choice === 'true');
    resolveDPCall(fromId, calledTrue);
  }
}

// ===== HOST: GET ELIGIBLE PASS TARGETS =====
function dpGetEligibleTargets(cc) {
  if (!dpState || !cc) return [];
  return dpState.players.filter(function(p) {
    // Can't pass to original sender
    if (p.id === cc.senderId) return false;
    // Can't pass to current holder (self)
    if (p.id === cc.fromId) return false;
    // Can't pass to current target (the person deciding)
    if (p.id === cc.targetId) return false;
    // Can't pass to someone who already peeked
    if (cc.peekHistory.indexOf(p.id) !== -1) return false;
    return true;
  });
}

// ===== HOST: PROCESS PEEK-PASS =====
function processDPPeekPass(fromId, targetId, newClaim) {
  if (!state.isHost || !dpState) return;
  if (dpState.phase !== 'peek-pass') return;

  var cc = dpState.currentCard;
  if (!cc || cc.fromId !== fromId) return;

  // Validate target
  if (targetId === cc.senderId) return;
  if (cc.peekHistory.indexOf(targetId) !== -1) return;
  var targetExists = dpState.players.some(function(p) { return p.id === targetId; });
  if (!targetExists || targetId === fromId) return;

  // Validate claim
  if (DP_TYPES.indexOf(newClaim) === -1) return;

  cc.claim = newClaim;
  cc.fromId = fromId;
  cc.targetId = targetId;

  dpState.phase = 'respond';
  broadcastDPState();
}

// ===== HOST: RESOLVE CALL =====
function resolveDPCall(callerId, calledTrue) {
  if (!dpState || !dpState.currentCard) return;
  var cc = dpState.currentCard;
  var actualCard = cc.card;
  var claim = cc.claim;

  // Does the claim match the actual card?
  var claimIsTrue = (actualCard === claim);

  // Caller said "true" (claim matches actual) or "false" (claim is a lie)
  var callerCorrect = (calledTrue === claimIsTrue);

  var loserId;
  if (callerCorrect) {
    // Caller was right → sender (original person who initiated this card chain) gets card face-up
    loserId = cc.senderId;
  } else {
    // Caller was wrong → caller gets card face-up
    loserId = callerId;
  }

  // Give card face-up to loser
  dpState.faceUp[loserId][actualCard]++;

  // Show reveal briefly
  dpState.phase = 'reveal';
  broadcastDPState();

  // After reveal delay, check lose or continue
  var t = setTimeout(function() {
    if (!dpState) return;

    // Check lose condition
    if (checkDPLoseCondition(loserId)) {
      dpState.loserId = loserId;
      dpState.phase = 'gameover';
      dpState.currentCard = null;
      dpState.currentDraw = null;
      broadcastDPState();

      // Send result after short delay
      var t2 = setTimeout(function() {
        if (!dpState) return;
        dpSendResult();
      }, 1000);
      _dpTimers.push(t2);
      return;
    }

    // Next turn: loser of the call becomes next sender
    dpState.turnPlayerId = loserId;
    dpState.currentCard = null;
    dpState.currentDraw = null;

    // Check if next sender has empty hand → they lose
    if (!dpState.hands[loserId] || dpState.hands[loserId].length === 0) {
      dpState.loserId = loserId;
      dpState.phase = 'gameover';
      dpState.currentDraw = null;
      broadcastDPState();
      var t3 = setTimeout(function() {
        if (!dpState) return;
        dpSendResult();
      }, 1000);
      _dpTimers.push(t3);
      return;
    }

    dpState.phase = 'send';
    broadcastDPState();
  }, 2500);
  _dpTimers.push(t);
}

// ===== HOST: CHECK LOSE CONDITION =====
function checkDPLoseCondition(playerId) {
  if (!dpState) return false;
  var fu = dpState.faceUp[playerId];
  if (!fu) return false;

  // 5 of same type
  for (var i = 0; i < DP_TYPES.length; i++) {
    if (fu[DP_TYPES[i]] >= DP_LOSE_SAME) return true;
  }

  // 2 of each type (all 4 types)
  var allHaveTwo = true;
  for (var j = 0; j < DP_TYPES.length; j++) {
    if (fu[DP_TYPES[j]] < DP_LOSE_EACH) {
      allHaveTwo = false;
      break;
    }
  }
  if (allHaveTwo) return true;

  return false;
}

// ===== HOST: SEND RESULT =====
function dpSendResult() {
  if (!dpState) return;

  var rankings = dpState.players.map(function(p) {
    var totalFaceUp = 0;
    var fu = dpState.faceUp[p.id];
    for (var i = 0; i < DP_TYPES.length; i++) {
      totalFaceUp += fu[DP_TYPES[i]];
    }
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      faceUp: fu,
      totalFaceUp: totalFaceUp,
      isLoser: p.id === dpState.loserId
    };
  });

  var result = {
    type: 'dp-result',
    loserId: dpState.loserId,
    rankings: rankings
  };

  broadcast(result);
  handleDPResult(result);
}

// ===== CLIENT: RENDER VIEW =====
function renderDPView(view) {
  if (!view) return;
  _dpView = view;
  showScreen('drinkpokerGame');

  var isMyTurn = (view.turnPlayerId === state.myId);
  var myPlayerView = null;
  for (var pi = 0; pi < view.players.length; pi++) {
    if (view.players[pi].id === state.myId) { myPlayerView = view.players[pi]; break; }
  }

  var turnEl = document.getElementById('dpTurnIndicator');
  if (turnEl) {
    if (view.phase === 'gameover') {
      turnEl.textContent = 'Game Over';
      turnEl.className = 'dp-turn-indicator';
    } else if (view.phase === 'reveal') {
      turnEl.textContent = 'Revealing card...';
      turnEl.className = 'dp-turn-indicator';
    } else if (view.phase === 'send') {
      var turnP = dpFindPlayer(view, view.turnPlayerId);
      if (isMyTurn) {
        turnEl.textContent = 'Your turn: draw 1 random card from deck';
        turnEl.className = 'dp-turn-indicator my-turn';
      } else {
        turnEl.textContent = escapeHTML((turnP ? turnP.name : 'Opponent')) + ' turn';
        turnEl.className = 'dp-turn-indicator';
      }
    } else if (view.phase === 'draw-preview') {
      var drawOwner = dpFindPlayer(view, view.currentDraw ? view.currentDraw.ownerId : null);
      var isDrawer = view.currentDraw && view.currentDraw.ownerId === state.myId;
      if (isDrawer) {
        turnEl.textContent = 'You checked the drawn card. Bluff and send it.';
        turnEl.className = 'dp-turn-indicator my-turn';
      } else {
        turnEl.textContent = escapeHTML((drawOwner ? drawOwner.name : 'Opponent')) + ' is checking a card...';
        turnEl.className = 'dp-turn-indicator';
      }
    } else if (view.phase === 'respond') {
      var isTarget = view.currentCard && view.currentCard.targetId === state.myId;
      if (isTarget) {
        turnEl.textContent = 'Card received. Choose your response.';
        turnEl.className = 'dp-turn-indicator my-turn';
      } else {
        var target = dpFindPlayer(view, view.currentCard ? view.currentCard.targetId : null);
        turnEl.textContent = escapeHTML((target ? target.name : 'Opponent')) + ' is responding...';
        turnEl.className = 'dp-turn-indicator';
      }
    } else if (view.phase === 'peek-pass') {
      var isPeeker = view.currentCard && view.currentCard.fromId === state.myId;
      if (isPeeker) {
        turnEl.textContent = 'Card checked. Pick next target to pass.';
        turnEl.className = 'dp-turn-indicator my-turn';
      } else {
        var peeker = dpFindPlayer(view, view.currentCard ? view.currentCard.fromId : null);
        turnEl.textContent = escapeHTML((peeker ? peeker.name : 'Opponent')) + ' is passing the card...';
        turnEl.className = 'dp-turn-indicator';
      }
    }
  }

  var oppEl = document.getElementById('dpOpponents');
  if (oppEl) {
    var oppHtml = '';
    view.players.forEach(function(p) {
      if (p.id === state.myId) return;
      var isActive = (view.phase === 'send' && p.id === view.turnPlayerId) ||
        (view.phase === 'draw-preview' && view.currentDraw && p.id === view.currentDraw.ownerId) ||
        (view.phase === 'respond' && view.currentCard && p.id === view.currentCard.targetId) ||
        (view.phase === 'peek-pass' && view.currentCard && p.id === view.currentCard.fromId);
      var cls = 'dp-opp' + (isActive ? ' dp-opp-active' : '');
      var fuHtml = dpRenderFaceUpBadges(p.faceUp);
      oppHtml += '<div class="' + cls + '">' +
        '<div class="dp-opp-avatar">' + p.avatar + '</div>' +
        '<div class="dp-opp-name">' + escapeHTML(p.name) + '</div>' +
        '<div class="dp-opp-hand-count">?? ' + p.handCount + '</div>' +
        '<div class="dp-opp-faceup">' + fuHtml + '</div>' +
        '</div>';
    });
    oppEl.innerHTML = oppHtml;
  }

  var centerEl = document.getElementById('dpCenter');
  if (centerEl) {
    if (view.phase === 'draw-preview' && view.currentDraw) {
      var drawOwnerView = dpFindPlayer(view, view.currentDraw.ownerId);
      var isOwner = view.currentDraw.ownerId === state.myId;
      var drawCardHtml = '';
      if (isOwner && view.currentDraw.card) {
        drawCardHtml = '<div class="dp-card dp-card-front dp-card-' + view.currentDraw.card + ' dp-card-drawn">' +
          '<div class="dp-card-emoji">' + DP_EMOJI[view.currentDraw.card] + '</div>' +
          '<div class="dp-card-name">' + DP_NAMES[view.currentDraw.card] + '</div>' +
          '</div>';
      } else {
        drawCardHtml = '<div class="dp-card dp-card-back dp-card-drawn"><div class="dp-card-emoji">CARD</div></div>';
      }
      centerEl.innerHTML =
        '<div class="dp-center-card">' + drawCardHtml + '</div>' +
        '<div class="dp-center-claim">' + (isOwner ? 'Card checked. Pick target and claim.' : escapeHTML((drawOwnerView ? drawOwnerView.name : 'Opponent')) + ' is checking a hidden card') + '</div>' +
        '<div class="dp-center-from">' + (isOwner ? 'Now bluff by showing your phone.' : 'Card detail is hidden') + '</div>';
      centerEl.style.display = 'block';
    } else if (view.currentCard && (view.phase === 'respond' || view.phase === 'peek-pass' || view.phase === 'reveal')) {
      var cc = view.currentCard;
      var fromPlayer = dpFindPlayer(view, cc.fromId);
      var targetPlayer = dpFindPlayer(view, cc.targetId);

      var cardFaceHtml;
      if (view.phase === 'reveal' && cc.actualCard) {
        cardFaceHtml = '<div class="dp-card dp-card-front dp-card-' + cc.actualCard + ' dp-card-drawn">' +
          '<div class="dp-card-emoji">' + DP_EMOJI[cc.actualCard] + '</div>' +
          '<div class="dp-card-name">' + DP_NAMES[cc.actualCard] + '</div>' +
          '</div>';
      } else if (view.phase === 'peek-pass' && cc.fromId === state.myId && cc.actualCard) {
        cardFaceHtml = '<div class="dp-card dp-card-front dp-card-' + cc.actualCard + ' dp-card-peeked dp-card-drawn">' +
          '<div class="dp-card-emoji">' + DP_EMOJI[cc.actualCard] + '</div>' +
          '<div class="dp-card-name">' + DP_NAMES[cc.actualCard] + '</div>' +
          '<div class="dp-card-peek-label">Peeked</div>' +
          '</div>';
      } else {
        cardFaceHtml = '<div class="dp-card dp-card-back dp-card-drawn"><div class="dp-card-emoji">CARD</div></div>';
      }

      var claimHtml = 'Claim: <strong>' + DP_EMOJI[cc.claim] + ' ' + DP_NAMES[cc.claim] + '</strong>';
      var fromHtml = escapeHTML(fromPlayer ? fromPlayer.name : 'Opponent') + ' ? ' + escapeHTML(targetPlayer ? targetPlayer.name : 'Opponent');

      var peekTrail = '';
      if (cc.peekHistory && cc.peekHistory.length > 0) {
        peekTrail = '<div class="dp-peek-trail">Peeked by: ';
        peekTrail += cc.peekHistory.map(function(pid) {
          var pp = dpFindPlayer(view, pid);
          return escapeHTML(pp ? pp.name : 'Opponent');
        }).join(', ');
        peekTrail += '</div>';
      }

      var revealResultHtml = '';
      if (view.phase === 'reveal' && cc.actualCard) {
        var matched = (cc.actualCard === cc.claim);
        revealResultHtml = '<div class="dp-reveal-result ' + (matched ? 'dp-reveal-true' : 'dp-reveal-false') + '">' +
          (matched ? 'Claim was TRUE' : 'Claim was FALSE') +
          '</div>';
      }

      centerEl.innerHTML =
        '<div class="dp-center-card">' + cardFaceHtml + '</div>' +
        '<div class="dp-center-claim">' + claimHtml + '</div>' +
        '<div class="dp-center-from">' + fromHtml + '</div>' +
        peekTrail + revealResultHtml;
      centerEl.style.display = 'block';
    } else {
      centerEl.style.display = 'none';
    }
  }

  var myFuEl = document.getElementById('dpMyFaceUp');
  if (myFuEl && myPlayerView) {
    var myFuHtml = '<div class="dp-my-faceup-label">My Face-up Cards</div>';
    myFuHtml += '<div class="dp-my-faceup-cards">' + dpRenderFaceUpBadges(myPlayerView.faceUp) + '</div>';
    myFuEl.innerHTML = myFuHtml;
  }

  var handEl = document.getElementById('dpMyHand');
  if (handEl) {
    var handCount = (typeof view.myHandCount === 'number') ? view.myHandCount : ((view.myHand || []).length);
    if (handCount > 0) {
      var handHtml = '';
      for (var hi = 0; hi < handCount; hi++) {
        handHtml += '<div class="dp-card dp-card-back dp-card-hand-back"><div class="dp-card-emoji">CARD</div></div>';
      }
      handEl.innerHTML = handHtml;
    } else {
      handEl.innerHTML = '<div class="dp-hand-empty">No cards left</div>';
    }
  }

  var actionEl = document.getElementById('dpActions');
  if (actionEl) {
    var actionHtml = '';

    if (view.phase === 'send' && isMyTurn) {
      actionHtml = '<div class="dp-action-hint">Your hand stays hidden. Draw one random card.</div>' +
        '<button class="dp-btn dp-btn-confirm" onclick="dpDrawFromDeck()">Draw Card</button>';
    } else if (view.phase === 'draw-preview' && view.currentDraw && view.currentDraw.ownerId === state.myId) {
      actionHtml = '<div class="dp-action-hint">Card checked. Choose target and claim to send.</div>' +
        '<button class="dp-btn dp-btn-pass" onclick="dpSend()">Send Card</button>';
    } else if (view.phase === 'respond' && view.currentCard && view.currentCard.targetId === state.myId) {
      var canPeek = true;
      if (view.currentCard) {
        var eligibleCount = 0;
        view.players.forEach(function(p) {
          if (p.id === view.currentCard.senderId) return;
          if (p.id === view.currentCard.fromId) return;
          if (p.id === state.myId) return;
          if (view.currentCard.peekHistory && view.currentCard.peekHistory.indexOf(p.id) !== -1) return;
          eligibleCount++;
        });
        if (eligibleCount === 0) canPeek = false;
      }

      actionHtml =
        '<div class="dp-respond-label">How do you respond?</div>' +
        '<div class="dp-respond-buttons">' +
        '<button class="dp-btn dp-btn-true" onclick="dpRespond(\'true\')">⭕ True</button>' +
        '<button class="dp-btn dp-btn-false" onclick="dpRespond(\'false\')">❌ False</button>' +
        (canPeek ? '<button class="dp-btn dp-btn-peek" onclick="dpRespond(\'peek\')">👀 Peek</button>' : '') +
        '</div>';
    } else if (view.phase === 'peek-pass' && view.currentCard && view.currentCard.fromId === state.myId) {
      actionHtml = '<div class="dp-action-hint">You peeked the card. Pick next target.</div>' +
        '<button class="dp-btn dp-btn-pass" onclick="dpPeekPass()">?? Pass</button>';
    } else if (view.phase === 'gameover') {
      actionHtml = '';
    } else {
      actionHtml = '<div class="dp-action-hint dp-waiting">Waiting...</div>';
    }
    actionEl.innerHTML = actionHtml;
  }

  var goEl = document.getElementById('dpGameOver');
  if (goEl) {
    goEl.style.display = view.phase === 'gameover' ? 'flex' : 'none';
  }

  var trackerEl = document.getElementById('dpTrackerOverlay');
  if (trackerEl && trackerEl.style.display === 'flex') {
    dpUpdateTrackerContent(view);
  }
}

// ===== HELPER: FIND PLAYER IN VIEW =====
function dpFindPlayer(view, pid) {
  if (!view || !pid) return null;
  for (var i = 0; i < view.players.length; i++) {
    if (view.players[i].id === pid) return view.players[i];
  }
  return null;
}

// ===== HELPER: RENDER FACE-UP BADGES =====
function dpRenderFaceUpBadges(faceUp) {
  if (!faceUp) return '';
  var html = '';
  for (var i = 0; i < DP_TYPES.length; i++) {
    var t = DP_TYPES[i];
    var count = faceUp[t] || 0;
    if (count > 0) {
      var danger = (count >= DP_LOSE_SAME - 1) ? ' dp-badge-danger' : (count >= DP_LOSE_SAME - 2 ? ' dp-badge-warn' : '');
      html += '<span class="dp-faceup-badge dp-badge-' + t + danger + '">' +
        DP_EMOJI[t] + count +
        '</span>';
    }
  }
  if (!html) html = '<span class="dp-faceup-none">없음</span>';
  return html;
}

// ===== CLIENT: SEND (open modal) =====
function dpDrawFromDeck() {
  if (!_dpView) return;
  if (_dpView.phase !== 'send') return;
  if (_dpView.turnPlayerId !== state.myId) return;

  if (state.isHost) {
    processDPDraw(state.myId);
  } else {
    sendToHost({ type: 'dp-draw' });
  }
}

// ===== CLIENT: SEND (open modal) =====
function dpSend() {
  if (!_dpView) return;
  if (_dpView.phase !== 'draw-preview') return;
  if (!_dpView.currentDraw || _dpView.currentDraw.ownerId !== state.myId) return;
  if (!_dpView.currentDraw.card) return;

  var card = _dpView.currentDraw.card;

  var overlay = document.getElementById('dpSendModal');
  if (!overlay) return;

  var targets = _dpView.players.filter(function(p) { return p.id !== state.myId; });

  var html = '<div class="dp-modal-content">' +
    '<div class="dp-modal-title">Send Card</div>' +
    '<div class="dp-modal-card">' +
      '<div class="dp-card dp-card-front dp-card-' + card + '">' +
        '<div class="dp-card-emoji">' + DP_EMOJI[card] + '</div>' +
        '<div class="dp-card-name">' + DP_NAMES[card] + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="dp-modal-section">' +
      '<div class="dp-modal-label">Target player</div>' +
      '<div class="dp-modal-targets" id="dpSendTargets">';

  targets.forEach(function(p) {
    html += '<button class="dp-target-btn" data-target="' + p.id + '" onclick="dpSelectSendTarget(this)">' +
      p.avatar + ' ' + escapeHTML(p.name) +
      '</button>';
  });

  html += '</div></div>' +
    '<div class="dp-modal-section">' +
      '<div class="dp-modal-label">Claim type</div>' +
      '<div class="dp-modal-claims" id="dpSendClaims">';

  DP_TYPES.forEach(function(t) {
    html += '<button class="dp-claim-btn" data-claim="' + t + '" onclick="dpSelectSendClaim(this)">' +
      DP_EMOJI[t] + ' ' + DP_NAMES[t] +
      '</button>';
  });

  html += '</div></div>' +
    '<div class="dp-modal-actions">' +
      '<button class="dp-btn dp-btn-cancel" onclick="dpCloseSendModal()">Cancel</button>' +
      '<button class="dp-btn dp-btn-confirm" id="dpSendConfirmBtn" onclick="dpConfirmSend()" disabled>Send</button>' +
    '</div>' +
    '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.dataset.targetId = '';
  overlay.dataset.claim = '';
}

function dpSelectSendTarget(btn) {
  var overlay = document.getElementById('dpSendModal');
  if (!overlay) return;
  // Deselect all targets
  var btns = overlay.querySelectorAll('.dp-target-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
  overlay.dataset.targetId = btn.dataset.target;
  dpUpdateSendConfirm();
}

function dpSelectSendClaim(btn) {
  var overlay = document.getElementById('dpSendModal');
  if (!overlay) return;
  var btns = overlay.querySelectorAll('.dp-claim-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
  overlay.dataset.claim = btn.dataset.claim;
  dpUpdateSendConfirm();
}

function dpUpdateSendConfirm() {
  var overlay = document.getElementById('dpSendModal');
  if (!overlay) return;
  var confirmBtn = document.getElementById('dpSendConfirmBtn');
  if (!confirmBtn) return;
  confirmBtn.disabled = !(overlay.dataset.targetId && overlay.dataset.claim);
}

function dpConfirmSend() {
  var overlay = document.getElementById('dpSendModal');
  if (!overlay) return;

  var targetId = overlay.dataset.targetId;
  var claim = overlay.dataset.claim;

  if (!targetId || !claim) return;

  dpCloseSendModal();

  if (state.isHost) {
    processDPSend(state.myId, -1, targetId, claim);
  } else {
    sendToHost({ type: 'dp-send', targetId: targetId, claim: claim });
  }
}

function dpCloseSendModal() {
  var overlay = document.getElementById('dpSendModal');
  if (overlay) overlay.style.display = 'none';
}

// ===== CLIENT: RESPOND =====
function dpRespond(choice) {
  if (!_dpView) return;
  if (_dpView.phase !== 'respond') return;
  if (!_dpView.currentCard || _dpView.currentCard.targetId !== state.myId) return;

  if (state.isHost) {
    processDPRespond(state.myId, choice);
  } else {
    sendToHost({ type: 'dp-respond', choice: choice });
  }
}

// ===== CLIENT: PEEK-PASS (open modal) =====
function dpPeekPass() {
  if (!_dpView) return;
  if (_dpView.phase !== 'peek-pass') return;
  if (!_dpView.currentCard || _dpView.currentCard.fromId !== state.myId) return;

  var cc = _dpView.currentCard;

  // Build eligible targets
  var eligible = _dpView.players.filter(function(p) {
    if (p.id === cc.senderId) return false;
    if (p.id === state.myId) return false;
    if (cc.peekHistory && cc.peekHistory.indexOf(p.id) !== -1) return false;
    return true;
  });

  if (eligible.length === 0) {
    showToast('넘길 사람이 없습니다!');
    return;
  }

  var overlay = document.getElementById('dpPeekPassModal');
  if (!overlay) return;

  var actualCard = cc.actualCard;
  var html = '<div class="dp-modal-content">' +
    '<div class="dp-modal-title">카드 넘기기</div>';

  if (actualCard) {
    html += '<div class="dp-modal-peek-info">' +
      '<div class="dp-modal-label">실제 카드:</div>' +
      '<div class="dp-card dp-card-front dp-card-' + actualCard + '">' +
        '<div class="dp-card-emoji">' + DP_EMOJI[actualCard] + '</div>' +
        '<div class="dp-card-name">' + DP_NAMES[actualCard] + '</div>' +
      '</div>' +
    '</div>';
  }

  html += '<div class="dp-modal-section">' +
    '<div class="dp-modal-label">누구에게 넘길까?</div>' +
    '<div class="dp-modal-targets" id="dpPeekTargets">';

  eligible.forEach(function(p) {
    html += '<button class="dp-target-btn" data-target="' + p.id + '" onclick="dpSelectPeekTarget(this)">' +
      p.avatar + ' ' + escapeHTML(p.name) +
      '</button>';
  });

  html += '</div></div>' +
    '<div class="dp-modal-section">' +
      '<div class="dp-modal-label">뭐라고 주장할까?</div>' +
      '<div class="dp-modal-claims" id="dpPeekClaims">';

  DP_TYPES.forEach(function(t) {
    html += '<button class="dp-claim-btn" data-claim="' + t + '" onclick="dpSelectPeekClaim(this)">' +
      DP_EMOJI[t] + ' ' + DP_NAMES[t] +
      '</button>';
  });

  html += '</div></div>' +
    '<div class="dp-modal-actions">' +
      '<button class="dp-btn dp-btn-cancel" onclick="dpClosePeekPassModal()">취소</button>' +
      '<button class="dp-btn dp-btn-confirm" id="dpPeekConfirmBtn" onclick="dpConfirmPeekPass()" disabled>넘기기!</button>' +
    '</div>' +
    '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.dataset.targetId = '';
  overlay.dataset.claim = '';
}

function dpSelectPeekTarget(btn) {
  var overlay = document.getElementById('dpPeekPassModal');
  if (!overlay) return;
  var btns = overlay.querySelectorAll('.dp-target-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
  overlay.dataset.targetId = btn.dataset.target;
  dpUpdatePeekConfirm();
}

function dpSelectPeekClaim(btn) {
  var overlay = document.getElementById('dpPeekPassModal');
  if (!overlay) return;
  var btns = overlay.querySelectorAll('.dp-claim-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  btn.classList.add('selected');
  overlay.dataset.claim = btn.dataset.claim;
  dpUpdatePeekConfirm();
}

function dpUpdatePeekConfirm() {
  var overlay = document.getElementById('dpPeekPassModal');
  if (!overlay) return;
  var confirmBtn = document.getElementById('dpPeekConfirmBtn');
  if (!confirmBtn) return;
  confirmBtn.disabled = !(overlay.dataset.targetId && overlay.dataset.claim);
}

function dpConfirmPeekPass() {
  var overlay = document.getElementById('dpPeekPassModal');
  if (!overlay) return;

  var targetId = overlay.dataset.targetId;
  var claim = overlay.dataset.claim;

  if (!targetId || !claim) return;

  dpClosePeekPassModal();

  if (state.isHost) {
    processDPPeekPass(state.myId, targetId, claim);
  } else {
    sendToHost({ type: 'dp-peek-pass', targetId: targetId, claim: claim });
  }
}

function dpClosePeekPassModal() {
  var overlay = document.getElementById('dpPeekPassModal');
  if (overlay) overlay.style.display = 'none';
}

// ===== CLIENT: TRACKER OVERLAY =====
function dpShowTracker() {
  var overlay = document.getElementById('dpTrackerOverlay');
  if (!overlay) return;
  if (_dpView) dpUpdateTrackerContent(_dpView);
  overlay.style.display = 'flex';
}

function dpUpdateTrackerContent(view) {
  var el = document.getElementById('dpTrackerContent');
  if (!el) return;

  var html = '<div class="dp-tracker-title">공개 카드 현황</div>' +
    '<table class="dp-tracker-table">' +
    '<thead><tr><th>플레이어</th>';
  DP_TYPES.forEach(function(t) {
    html += '<th>' + DP_EMOJI[t] + '<br>' + DP_NAMES[t] + '</th>';
  });
  html += '<th>합계</th></tr></thead><tbody>';

  view.players.forEach(function(p) {
    var fu = p.faceUp;
    var total = 0;
    var isMe = (p.id === state.myId);
    html += '<tr class="' + (isMe ? 'dp-tracker-me' : '') + '">';
    html += '<td>' + p.avatar + ' ' + escapeHTML(p.name) + (isMe ? ' (나)' : '') + '</td>';
    DP_TYPES.forEach(function(t) {
      var c = fu[t] || 0;
      total += c;
      var cls = '';
      if (c >= DP_LOSE_SAME - 1) cls = 'dp-tracker-danger';
      else if (c >= DP_LOSE_SAME - 2) cls = 'dp-tracker-warn';
      html += '<td class="' + cls + '">' + c + '</td>';
    });
    html += '<td>' + total + '</td></tr>';
  });

  html += '</tbody></table>' +
    '<div class="dp-tracker-legend">' +
    '패배 조건: 같은 종류 ' + DP_LOSE_SAME + '장 또는 모든 종류 ' + DP_LOSE_EACH + '장씩' +
    '</div>';

  el.innerHTML = html;
}

function dpCloseTracker() {
  var overlay = document.getElementById('dpTrackerOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ===== CLIENT: HANDLE RESULT =====
function handleDPResult(msg) {
  if (!msg || !msg.rankings) return;

  var goEl = document.getElementById('dpGameOver');
  if (goEl) goEl.style.display = 'flex';

  var titleEl = document.getElementById('dpGameOverTitle');
  if (titleEl) {
    var loser = null;
    for (var i = 0; i < msg.rankings.length; i++) {
      if (msg.rankings[i].isLoser) { loser = msg.rankings[i]; break; }
    }

    if (msg.loserId === state.myId) {
      titleEl.textContent = '패배... 술을 피하지 못했습니다!';
      titleEl.className = 'dp-gameover-title dp-gameover-lose';
    } else {
      titleEl.textContent = escapeHTML(loser ? loser.name : '???') + '이(가) 졌습니다!';
      titleEl.className = 'dp-gameover-title dp-gameover-win';
    }
  }

  var rankEl = document.getElementById('dpRankings');
  if (rankEl) {
    var html = '';
    msg.rankings.forEach(function(p) {
      var isMe = p.id === state.myId;
      var fuHtml = '';
      DP_TYPES.forEach(function(t) {
        var c = p.faceUp[t] || 0;
        if (c > 0) {
          fuHtml += '<span class="dp-result-badge dp-badge-' + t + '">' + DP_EMOJI[t] + c + '</span>';
        }
      });
      html += '<div class="dp-rank-row ' + (p.isLoser ? 'dp-rank-loser' : 'dp-rank-winner') + '">' +
        '<div class="dp-rank-icon">' + (p.isLoser ? '💀' : '🎉') + '</div>' +
        '<div class="dp-rank-name">' + p.avatar + ' ' + escapeHTML(p.name) + (isMe ? ' (나)' : '') + '</div>' +
        '<div class="dp-rank-faceup">' + fuHtml + '</div>' +
        '<div class="dp-rank-label">' + (p.isLoser ? '패배' : '승리') + '</div>' +
        '</div>';
    });
    rankEl.innerHTML = html;
  }

  // Record game stats
  if (typeof recordGame === 'function') {
    var won = msg.loserId !== state.myId;
    recordGame(won, won ? 30 : 5);
  }
}

// ===== CLOSE / CLEANUP =====
function closeDPGame() {
  closeDPCleanup();
  returnToLobby();
}

function closeDPCleanup() {
  _dpTimers.forEach(function(t) { clearTimeout(t); });
  _dpTimers = [];
  _dpView = null;
  dpState = null;

  var goEl = document.getElementById('dpGameOver');
  if (goEl) goEl.style.display = 'none';

  dpCloseSendModal();
  dpClosePeekPassModal();
  dpCloseTracker();
}

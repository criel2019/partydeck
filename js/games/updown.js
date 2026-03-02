// ===== UP DOWN ENGINE =====
// Classic Up/Down card guessing game
// See current card → guess UP or DOWN → reveal → penalty if wrong

let udState = {
  deck: [],
  deckIdx: 0,
  currentCard: null,
  previousCard: null,
  revealCard: null,   // the newly drawn card during reveal
  turnIdx: 0,
  players: [],
  phase: 'guessing', // guessing | reveal | result | special_jq | special_k | penalty
  penalties: [],
  currentBet: null,
  specialData: null,
  guess: null,        // 'up' or 'down'
};

function startUpDown() {
  if(!state.isHost) return;

  const deck = [];
  const suits = ['\u2660','\u2665','\u2666','\u2663'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  for(const suit of suits) {
    for(const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  for(let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  udState = {
    deck,
    deckIdx: 1,
    currentCard: deck[0],
    previousCard: null,
    revealCard: null,
    turnIdx: 0,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
    })),
    phase: 'guessing',
    penalties: ['\uc18c\uc8fc 1\uc794', '\ub9c9\uac78\ub9ac 1\uc794', '\ud3ed\ud0c4\uc8fc 1\uc794'],
    currentBet: null,
    specialData: null,
    guess: null,
  };

  broadcast({ type: 'game-start', game: 'updown', state: getUpDownView() });
  showScreen('updownGame');
  renderUpDownView(getUpDownView());
}

function getUpDownView() {
  return {
    currentCard: udState.currentCard,
    previousCard: udState.previousCard,
    revealCard: udState.revealCard,
    deckRemaining: udState.deck.length - udState.deckIdx,
    turnIdx: udState.turnIdx,
    players: udState.players,
    phase: udState.phase,
    penalties: udState.penalties,
    currentBet: udState.currentBet,
    specialData: udState.specialData,
    guess: udState.guess,
  };
}

function broadcastUpDownState() {
  if(!state.isHost) return;
  const view = getUpDownView();
  broadcast({ type: 'ud-state', state: view });
  renderUpDownView(view);
}

var _lastUdView = null;

function renderUpDownView(view) {
  if(!view) return;
  _lastUdView = view;

  var currentPlayer = view.players[view.turnIdx];
  var isMyTurn = currentPlayer && currentPlayer.id === state.myId;

  // Top bar
  document.getElementById('updownTurnName').textContent =
    isMyTurn ? '\ub0b4 \ucc28\ub840!' : (currentPlayer ? currentPlayer.name + '\uc758 \ucc28\ub840' : '');
  document.getElementById('updownDeckCount').textContent = '\ub0a8\uc740 \uce74\ub4dc: ' + view.deckRemaining;

  // Previous card slot (small, left)
  var prevSlot = document.getElementById('updownPrevCard');
  if(view.previousCard) {
    prevSlot.innerHTML = '<div class="ud-card-label">\uc774\uc804</div>' + updownCardHTML(view.previousCard, false);
  } else {
    prevSlot.innerHTML = '<div class="ud-card-label">\uc774\uc804</div><div class="ud-prev-placeholder"></div>';
  }

  // Hero card (center) — shows currentCard or revealCard
  var currSlot = document.getElementById('updownCurrentCard');
  if(view.phase === 'guessing') {
    // Show current card as the reference
    currSlot.innerHTML = '<div class="ud-card-label">\ud604\uc7ac \uce74\ub4dc</div>' + updownCardHTML(view.currentCard, true);
  } else if(view.phase === 'reveal' || view.phase === 'result') {
    // Show the newly drawn card
    currSlot.innerHTML = '<div class="ud-card-label">\uacf5\uac1c!</div>' + updownCardHTML(view.revealCard || view.currentCard, true);
    if(view.phase === 'reveal') {
      setTimeout(function() {
        var card = currSlot.querySelector('.ud-hero-card');
        if(card) card.classList.add('ud-flipping');
      }, 50);
    }
  } else {
    currSlot.innerHTML = '<div class="ud-card-label">\ud604\uc7ac \uce74\ub4dc</div>' + updownCardHTML(view.currentCard, true);
  }

  // Action area (dynamic buttons)
  var actionArea = document.getElementById('updownChoiceButtons');

  if(view.phase === 'guessing') {
    if(isMyTurn) {
      actionArea.innerHTML =
        '<div class="ud-guess-buttons">' +
          '<button class="ud-btn ud-btn-up" onclick="udGuess(\'up\')">' +
            '<span class="ud-btn-arrow">\u2b06\ufe0f</span>' +
            '<span class="ud-btn-label">UP</span>' +
          '</button>' +
          '<button class="ud-btn ud-btn-down" onclick="udGuess(\'down\')">' +
            '<span class="ud-btn-arrow">\u2b07\ufe0f</span>' +
            '<span class="ud-btn-label">DOWN</span>' +
          '</button>' +
        '</div>';
    } else {
      actionArea.innerHTML = '<div class="ud-waiting-text">' +
        escapeHTML(currentPlayer ? currentPlayer.name : '') + '\uc774(\uac00) \uc608\uce21 \uc911...</div>';
    }
  } else if(view.phase === 'reveal' || view.phase === 'result') {
    var guessLabel = view.guess === 'up' ? '\u2b06 UP' : '\u2b07 DOWN';
    var resultText = view.specialData ? view.specialData.result : '';
    var isCorrect = view.specialData ? view.specialData.correct : false;
    actionArea.innerHTML =
      '<div class="ud-result-display">' +
        '<span class="ud-guess-badge ' + (view.guess === 'up' ? 'up' : 'down') + '">' + guessLabel + '</span>' +
        '<span class="ud-result-text ' + (isCorrect ? 'correct' : 'wrong') + '">' + escapeHTML(resultText) + '</span>' +
      '</div>';
  } else {
    actionArea.innerHTML = '';
  }

  // Penalty list
  var penaltyItems = document.getElementById('updownPenaltyItems');
  penaltyItems.innerHTML = view.penalties.slice(-5).map(function(p) {
    return '<div class="ud-penalty-item">\ud83c\udf7a ' + escapeHTML(p) + '</div>';
  }).join('');

  // Special areas
  document.getElementById('updownSpecialJQ').style.display = 'none';
  document.getElementById('updownSpecialK').style.display = 'none';
  if(isMyTurn && view.phase === 'special_jq') {
    showUpDownJQArea(view);
  } else if(isMyTurn && view.phase === 'special_k') {
    showUpDownKArea(view);
  }

  // Result text (legacy element)
  var resultDiv = document.getElementById('updownResult');
  resultDiv.textContent = '';
}

function updownCardHTML(card, isCurrent) {
  if(!card) {
    return isCurrent
      ? '<div class="ud-hero-card ud-card-back"><div class="ud-hero-inner"><div class="ud-hero-back-pattern"></div></div></div>'
      : '<div class="ud-prev-placeholder"></div>';
  }

  var isRed = card.suit === '\u2665' || card.suit === '\u2666';
  var colorClass = isRed ? 'ud-red' : 'ud-black';

  if(isCurrent) {
    return '<div class="ud-hero-card ' + colorClass + '">' +
      '<div class="ud-hero-inner">' +
        '<div class="ud-hero-corner">' +
          '<span class="ud-hero-rank">' + card.rank + '</span>' +
          '<span class="ud-hero-suit-sm">' + card.suit + '</span>' +
        '</div>' +
        '<div class="ud-hero-center">' + card.suit + '</div>' +
        '<div class="ud-hero-corner ud-corner-bottom">' +
          '<span class="ud-hero-rank">' + card.rank + '</span>' +
          '<span class="ud-hero-suit-sm">' + card.suit + '</span>' +
        '</div>' +
      '</div></div>';
  } else {
    return '<div class="ud-prev-card ' + colorClass + '">' +
      '<div class="ud-prev-inner">' +
        '<div class="ud-prev-corner">' +
          '<span class="ud-prev-rank">' + card.rank + '</span>' +
          '<span class="ud-prev-suit-sm">' + card.suit + '</span>' +
        '</div>' +
        '<div class="ud-prev-center">' + card.suit + '</div>' +
      '</div></div>';
  }
}

// ===== GUESS (UP or DOWN) =====
function udGuess(guess) {
  if(state.isHost) {
    processUpDownGuess(state.myId, guess);
  } else {
    sendToHost({ type: 'ud-guess', guess: guess });
  }
}

function processUpDownGuess(playerId, guess) {
  if(!state.isHost || udState.phase !== 'guessing') return;

  var playerIdx = udState.players.findIndex(function(p) { return p.id === playerId; });
  if(playerIdx !== udState.turnIdx) return;

  if(guess !== 'up' && guess !== 'down') return;

  if(udState.deckIdx >= udState.deck.length) {
    showToast('\uce74\ub4dc\uac00 \ubaa8\ub450 \uc18c\uc9c4\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
    return;
  }

  // Draw next card
  var drawnCard = udState.deck[udState.deckIdx];
  udState.deckIdx++;
  udState.guess = guess;

  var drawnValue = getCardValue(drawnCard);
  var currentValue = getCardValue(udState.currentCard);

  // Determine correctness
  var correct;
  if(drawnValue === currentValue) {
    // Same value = always wrong
    correct = false;
  } else if(guess === 'up') {
    correct = drawnValue > currentValue;
  } else {
    correct = drawnValue < currentValue;
  }

  // Shift cards
  udState.previousCard = udState.currentCard;
  udState.revealCard = drawnCard;

  if(correct) {
    udState.specialData = { result: '\uc815\ub2f5! \uc548\uc804!', correct: true };
    udState.phase = 'reveal';
    broadcastUpDownState();

    setTimeout(function() {
      if(!state.isHost || !udState) return;
      // Move revealed card to current
      udState.currentCard = udState.revealCard;
      udState.revealCard = null;
      udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
      udState.phase = 'guessing';
      udState.specialData = null;
      udState.guess = null;
      broadcastUpDownState();
    }, 2000);
  } else {
    udState.currentCard = drawnCard;
    udState.specialData = { result: '\ud2c0\ub838\ub2e4! \ubc8c\uce59!', correct: false };

    var rank = drawnCard.rank;
    if(rank === 'J' || rank === 'Q') {
      udState.phase = 'special_jq';
      udState.specialData.type = 'jq';
      udState.specialData.requesterId = playerId;
      broadcastUpDownState();
    } else if(rank === 'K') {
      udState.phase = 'special_k';
      udState.specialData.type = 'k';
      udState.specialData.kingId = playerId;
      broadcastUpDownState();
    } else {
      // Normal penalty: show reveal first, then penalty
      udState.phase = 'reveal';
      broadcastUpDownState();

      setTimeout(function() {
        if(!state.isHost || !udState) return;
        udState.phase = 'penalty';
        var penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
        showUpDownPenalty(playerId, penaltyText);
      }, 1800);
    }
  }
}

// Legacy: keep processUpDownDraw/processUpDownSubmit as no-ops for safety
function processUpDownDraw() {}
function processUpDownSubmit() {}

function getCardValue(card) {
  var values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  return values[card.rank] || 0;
}

// ===== BET =====
function udAddBet() {
  var input = document.getElementById('updownBetInput');
  var text = input.value.trim();
  if(!text) {
    showToast('\ubc8c\uce59 \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694');
    return;
  }

  if(state.isHost) {
    udState.penalties.push(text);
    udState.currentBet = text;
    input.value = '';
    showToast('\ubc8c\uce59\uc774 \ucd94\uac00\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
    broadcastUpDownState();
  } else {
    sendToHost({ type: 'ud-addbet', text: text });
    input.value = '';
    showToast('\ubc8c\uce59 \ucd94\uac00 \uc694\uccad!');
  }
}

// ===== SPECIAL: J/Q BLACK KNIGHT =====
function showUpDownJQArea(view) {
  var area = document.getElementById('updownSpecialJQ');
  area.style.display = 'flex';

  var select = document.getElementById('updownJQPlayerSelect');
  select.innerHTML = view.players
    .filter(function(p) { return p.id !== state.myId; })
    .map(function(p, i) {
      return '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'jq\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + escapeHTML(p.name) + '</div>' +
      '</div>';
    }).join('');
}

function showUpDownKArea(view) {
  var area = document.getElementById('updownSpecialK');
  area.style.display = 'flex';

  var select = document.getElementById('updownKPlayerSelect');
  select.innerHTML = view.players
    .filter(function(p) { return p.id !== state.myId; })
    .map(function(p, i) {
      return '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'k\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + escapeHTML(p.name) + '</div>' +
      '</div>';
    }).join('');
}

let selectedUpDownPlayers = [];

function selectUpDownPlayer(pid, type) {
  if(type === 'jq') {
    selectedUpDownPlayers = [pid];
    document.querySelectorAll('#updownJQPlayerSelect .ud-player-option').forEach(function(el) {
      el.classList.toggle('selected', el.dataset.pid === pid);
    });
  } else if(type === 'k') {
    if(selectedUpDownPlayers.includes(pid)) {
      selectedUpDownPlayers = selectedUpDownPlayers.filter(function(id) { return id !== pid; });
    } else {
      if(selectedUpDownPlayers.length < 3) {
        selectedUpDownPlayers.push(pid);
      } else {
        showToast('\ucd5c\ub300 3\uba85\uae4c\uc9c0 \uc120\ud0dd \uac00\ub2a5');
        return;
      }
    }

    document.querySelectorAll('#updownKPlayerSelect .ud-player-option').forEach(function(el) {
      el.classList.toggle('selected', selectedUpDownPlayers.includes(el.dataset.pid));
    });
  }
}

function udBlackKnight() {
  if(selectedUpDownPlayers.length === 0) {
    showToast('\ub300\uc0c1\uc744 \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  var targetId = selectedUpDownPlayers[0];

  if(state.isHost) {
    processBlackKnight(state.myId, targetId);
  } else {
    sendToHost({ type: 'ud-special', action: 'blackknight', targetId: targetId });
  }

  selectedUpDownPlayers = [];
}

function processBlackKnight(requesterId, targetId) {
  if(!state.isHost) return;

  var penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
  var requester = udState.players.find(function(p) { return p.id === requesterId; });

  udState.specialData = {
    type: 'bk_request',
    requesterId: requesterId,
    targetId: targetId,
    penaltyText: penaltyText,
    requesterName: requester.name,
  };

  var msg = {
    type: 'ud-bk-request',
    requesterId: requesterId,
    requesterName: requester.name,
    penaltyText: penaltyText,
  };

  if(targetId === state.myId) {
    showUpDownBKModal(msg);
  } else {
    sendTo(targetId, msg);
  }

  showToast('\ud751\uae30\uc0ac \uc694\uccad \uc804\uc1a1!');
}

function showUpDownBKModal(data) {
  var modal = document.getElementById('updownBKModal');
  document.getElementById('updownBKText').textContent = data.penaltyText;
  document.getElementById('updownBKWho').textContent = data.requesterName + '\ub2d8\uc758 \uc694\uccad';
  modal.classList.add('active');

  modal.dataset.requesterId = data.requesterId;
  modal.dataset.penaltyText = data.penaltyText;
}

function udAcceptBK() {
  var modal = document.getElementById('updownBKModal');
  var requesterId = modal.dataset.requesterId;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKAccept(requesterId, state.myId, modal.dataset.penaltyText);
  } else {
    sendToHost({
      type: 'ud-bk-response',
      accepted: true,
      requesterId: requesterId
    });
  }
}

function udRejectBK() {
  var modal = document.getElementById('updownBKModal');
  var requesterId = modal.dataset.requesterId;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKReject(requesterId, state.myId, modal.dataset.penaltyText);
  } else {
    sendToHost({
      type: 'ud-bk-response',
      accepted: false,
      requesterId: requesterId
    });
  }
}

function resolveBKAccept(requesterId, acceptorId, penaltyText) {
  showUpDownPenalty(acceptorId, penaltyText);
  showToast('\ud751\uae30\uc0ac\uac00 \ubc8c\uce59\uc744 \ubc1b\uc558\uc2b5\ub2c8\ub2e4!');
}

function resolveBKReject(requesterId, rejectId, penaltyText) {
  var targets = udState.players
    .filter(function(p) { return p.id !== requesterId && p.id !== rejectId; })
    .map(function(p) { return p.id; });

  targets.forEach(function(tid) {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uac70\uc808! \ub098\uba38\uc9c0 \ubaa8\ub450 \ubc8c\uce59!');
}

// ===== SPECIAL: K KING =====
function udKingPenalty() {
  if(selectedUpDownPlayers.length === 0) {
    showToast('\ucd5c\uc18c 1\uba85\uc744 \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  if(state.isHost) {
    processKingPenalty(state.myId, selectedUpDownPlayers);
  } else {
    sendToHost({
      type: 'ud-special',
      action: 'king',
      targets: selectedUpDownPlayers
    });
  }

  selectedUpDownPlayers = [];
}

function processKingPenalty(kingId, targets) {
  if(!state.isHost) return;

  var penaltyText = udState.currentBet || '\uc655\uc758 \uba85\ub839: ' + udState.penalties[Math.floor(Math.random() * udState.penalties.length)];

  targets.forEach(function(tid) {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uc655\uc758 \ubc8c\uce59\uc774 \ub0b4\ub824\uc84c\uc2b5\ub2c8\ub2e4!');

  setTimeout(function() {
    if(!state.isHost || !udState) return;
    udState.revealCard = null;
    udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
    udState.phase = 'guessing';
    udState.specialData = null;
    udState.currentBet = null;
    udState.guess = null;
    broadcastUpDownState();
  }, 2000);
}

// ===== PENALTY =====
function showUpDownPenalty(playerId, penaltyText) {
  var msg = {
    type: 'ud-penalty',
    playerId: playerId,
    penaltyText: penaltyText,
  };

  broadcast(msg);
  handleUpDownPenalty(msg);
}

function handleUpDownPenalty(data) {
  if(data.playerId === state.myId) {
    var modal = document.getElementById('updownPenaltyModal');
    document.getElementById('updownPenaltyText').textContent = data.penaltyText;
    document.getElementById('updownPenaltyWho').textContent = '\ub2f9\uc2e0\uc758 \ubc8c\uce59\uc785\ub2c8\ub2e4!';
    modal.classList.add('active');
    modal.dataset.penaltyText = data.penaltyText;
  } else {
    var players = udState ? udState.players : (_lastUdView ? _lastUdView.players : []);
    var player = players.find(function(p) { return p.id === data.playerId; });
    showToast('\ud83c\udf7a ' + (player ? player.name : '???') + ' \ubc8c\uce59: ' + data.penaltyText);
  }
}

function udAcceptPenalty() {
  var modal = document.getElementById('updownPenaltyModal');
  modal.classList.remove('active');

  showToast('\ubc8c\uce59 \uc218\ud589!');

  if(state.isHost) {
    continueUpDown();
  } else {
    sendToHost({ type: 'ud-penalty-done' });
  }
}

function udRejectPenalty() {
  var modal = document.getElementById('updownPenaltyModal');
  modal.classList.remove('active');

  showToast('\uc220 \ub9c8\uc2dc\uae30\ub85c \ub300\uccb4!');

  if(state.isHost) {
    continueUpDown();
  } else {
    sendToHost({ type: 'ud-penalty-done' });
  }
}

function continueUpDown() {
  if(!state.isHost) return;
  if(udState.phase === 'guessing') return;

  udState.revealCard = null;
  udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
  udState.phase = 'guessing';
  udState.specialData = null;
  udState.currentBet = null;
  udState.guess = null;
  broadcastUpDownState();
}

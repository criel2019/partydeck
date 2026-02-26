// ===== UP DOWN ENGINE =====

let udState = {
  deck: [],
  deckIdx: 0,
  currentCard: null,
  previousCard: null,
  turnIdx: 0,
  players: [],
  phase: 'playing',
  penalties: [],
  currentBet: null,
  specialData: null,
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
    deckIdx: 0,
    currentCard: deck[0],
    previousCard: null,
    turnIdx: 0,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
    })),
    phase: 'playing',
    penalties: ['\uc18c\uc8fc 1\uc794', '\ub9c9\uac78\ub9ac 1\uc794', '\ud3ed\ud0c4\uc8fc 1\uc794'],
    currentBet: null,
    specialData: null,
  };

  udState.deckIdx = 1;

  broadcast({ type: 'game-start', game: 'updown', state: getUpDownView() });
  showScreen('updownGame');
  renderUpDownView(getUpDownView());
}

function getUpDownView() {
  return {
    currentCard: udState.currentCard,
    previousCard: udState.previousCard,
    deckRemaining: udState.deck.length - udState.deckIdx,
    turnIdx: udState.turnIdx,
    players: udState.players,
    phase: udState.phase,
    penalties: udState.penalties,
    currentBet: udState.currentBet,
    specialData: udState.specialData,
  };
}

function broadcastUpDownState() {
  const view = getUpDownView();
  broadcast({ type: 'ud-state', state: view });
  renderUpDownView(view);
}

var _lastUdView = null;

function renderUpDownView(view) {
  if(!view) return;
  _lastUdView = view;

  const currentPlayer = view.players[view.turnIdx];
  document.getElementById('updownTurnName').textContent =
    currentPlayer.id === state.myId ? '\ub0b4 \ucc28\ub840!' : currentPlayer.name + '\uc758 \ucc28\ub840';

  document.getElementById('updownDeckCount').textContent = '\ub0a8\uc740 \uce74\ub4dc: ' + view.deckRemaining;

  const prevSlot = document.getElementById('updownPrevCard');
  if(view.previousCard) {
    prevSlot.innerHTML =
      '<div class="ud-card-label">\uc774\uc804</div>' +
      updownCardHTML(view.previousCard, false);
  } else {
    prevSlot.innerHTML =
      '<div class="ud-card-label">\uc774\uc804</div>' +
      '<div class="ud-prev-placeholder"></div>';
  }

  const currSlot = document.getElementById('updownCurrentCard');
  currSlot.innerHTML =
    '<div class="ud-card-label">\ud604\uc7ac \uce74\ub4dc</div>' +
    updownCardHTML(view.currentCard, true);

  setTimeout(() => {
    const card = currSlot.querySelector('.ud-hero-card');
    if(card) card.classList.add('ud-flipping');
  }, 100);

  const penaltyItems = document.getElementById('updownPenaltyItems');
  penaltyItems.innerHTML = view.penalties.slice(-5).map(p =>
    '<div class="ud-penalty-item">\ud83c\udf7a ' + escapeHTML(p) + '</div>'
  ).join('');

  const isMyTurn = currentPlayer.id === state.myId;
  const choiceButtons = document.getElementById('updownChoiceButtons').querySelectorAll('.ud-btn');
  choiceButtons.forEach(btn => btn.disabled = !isMyTurn || view.phase !== 'playing');

  document.getElementById('updownSpecialJQ').style.display = 'none';
  document.getElementById('updownSpecialK').style.display = 'none';

  if(isMyTurn && view.phase === 'special_jq') {
    showUpDownJQArea(view);
  } else if(isMyTurn && view.phase === 'special_k') {
    showUpDownKArea(view);
  }

  const resultDiv = document.getElementById('updownResult');
  if(view.phase === 'result' && view.specialData?.result) {
    resultDiv.textContent = view.specialData.result;
    resultDiv.style.color = view.specialData.correct ? 'var(--success)' : 'var(--danger)';
  } else {
    resultDiv.textContent = '';
  }
}

function updownCardHTML(card, isCurrent) {
  if(!card) {
    return isCurrent
      ? '<div class="ud-hero-card ud-card-back"><div class="ud-hero-inner"><div class="ud-hero-back-pattern"></div></div></div>'
      : '<div class="ud-prev-placeholder"></div>';
  }

  const isRed = card.suit === '\u2665' || card.suit === '\u2666';
  const colorClass = isRed ? 'ud-red' : 'ud-black';

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

function udChoice(choice) {
  if(state.isHost) {
    processUpDownChoice(state.myId, choice);
  } else {
    sendToHost({ type: 'ud-choice', choice });
  }
}

function processUpDownChoice(playerId, choice) {
  if(!state.isHost || udState.phase !== 'playing') return;
  if(choice !== 'up' && choice !== 'down') return;

  const playerIdx = udState.players.findIndex(p => p.id === playerId);
  if(playerIdx !== udState.turnIdx) return;

  if(udState.deckIdx >= udState.deck.length) {
    showToast('\uce74\ub4dc\uac00 \ubaa8\ub450 \uc18c\uc9c4\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
    return;
  }

  const nextCard = udState.deck[udState.deckIdx];
  const currentValue = getCardValue(udState.currentCard);
  const nextValue = getCardValue(nextCard);

  let correct = false;
  if(choice === 'up') {
    correct = nextValue > currentValue;
  } else if(choice === 'down') {
    correct = nextValue < currentValue;
  }

  if(nextValue === currentValue) correct = false;

  udState.previousCard = udState.currentCard;
  udState.currentCard = nextCard;
  udState.deckIdx++;

  if(correct) {
    udState.specialData = { result: '\uc815\ub2f5!', correct: true };
    udState.phase = 'result';
    broadcastUpDownState();

    setTimeout(() => {
      if(!state.isHost || !udState) return;
      udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
      udState.phase = 'playing';
      udState.specialData = null;
      broadcastUpDownState();
    }, 1500);

  } else {
    udState.specialData = { result: '\ud2c0\ub838\ub2e4!', correct: false };

    const rank = nextCard.rank;
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
      // 일반 틀림: 먼저 "틀렸다!" 결과를 전체에 보여준 뒤 벌칙으로 전환
      udState.phase = 'result';
      broadcastUpDownState();

      setTimeout(() => {
        if(!state.isHost || !udState) return;
        udState.phase = 'penalty';
        const penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
        showUpDownPenalty(playerId, penaltyText);
      }, 1500);
    }
  }
}

function getCardValue(card) {
  const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  return values[card.rank] || 0;
}

function udAddBet() {
  const input = document.getElementById('updownBetInput');
  const text = input.value.trim();
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
    sendToHost({ type: 'ud-addbet', text });
    input.value = '';
    showToast('\ubc8c\uce59 \ucd94\uac00 \uc694\uccad!');
  }
}

function showUpDownJQArea(view) {
  const area = document.getElementById('updownSpecialJQ');
  area.style.display = 'flex';

  const select = document.getElementById('updownJQPlayerSelect');
  select.innerHTML = view.players
    .filter(p => p.id !== state.myId)
    .map((p, i) =>
      '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'jq\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + escapeHTML(p.name) + '</div>' +
      '</div>'
    ).join('');
}

function showUpDownKArea(view) {
  const area = document.getElementById('updownSpecialK');
  area.style.display = 'flex';

  const select = document.getElementById('updownKPlayerSelect');
  select.innerHTML = view.players
    .filter(p => p.id !== state.myId)
    .map((p, i) =>
      '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'k\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + escapeHTML(p.name) + '</div>' +
      '</div>'
    ).join('');
}

let selectedUpDownPlayers = [];

function selectUpDownPlayer(pid, type) {
  if(type === 'jq') {
    selectedUpDownPlayers = [pid];
    document.querySelectorAll('#updownJQPlayerSelect .ud-player-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.pid === pid);
    });
  } else if(type === 'k') {
    if(selectedUpDownPlayers.includes(pid)) {
      selectedUpDownPlayers = selectedUpDownPlayers.filter(id => id !== pid);
    } else {
      if(selectedUpDownPlayers.length < 3) {
        selectedUpDownPlayers.push(pid);
      } else {
        showToast('\ucd5c\ub300 3\uba85\uae4c\uc9c0 \uc120\ud0dd \uac00\ub2a5');
        return;
      }
    }

    document.querySelectorAll('#updownKPlayerSelect .ud-player-option').forEach(el => {
      el.classList.toggle('selected', selectedUpDownPlayers.includes(el.dataset.pid));
    });
  }
}

function udBlackKnight() {
  if(selectedUpDownPlayers.length === 0) {
    showToast('\ub300\uc0c1\uc744 \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  const targetId = selectedUpDownPlayers[0];

  if(state.isHost) {
    processBlackKnight(state.myId, targetId);
  } else {
    sendToHost({ type: 'ud-special', action: 'blackknight', targetId });
  }

  selectedUpDownPlayers = [];
}

function processBlackKnight(requesterId, targetId) {
  if(!state.isHost) return;

  const penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
  const requester = udState.players.find(p => p.id === requesterId);

  udState.specialData = {
    type: 'bk_request',
    requesterId,
    targetId,
    penaltyText,
    requesterName: requester.name,
  };

  const msg = {
    type: 'ud-bk-request',
    requesterId,
    requesterName: requester.name,
    penaltyText,
  };

  if(targetId === state.myId) {
    showUpDownBKModal(msg);
  } else {
    sendTo(targetId, msg);
  }

  showToast('\ud751\uae30\uc0ac \uc694\uccad \uc804\uc1a1!');
}

function showUpDownBKModal(data) {
  const modal = document.getElementById('updownBKModal');
  document.getElementById('updownBKText').textContent = data.penaltyText;
  document.getElementById('updownBKWho').textContent = data.requesterName + '\ub2d8\uc758 \uc694\uccad';
  modal.classList.add('active');

  modal.dataset.requesterId = data.requesterId;
  modal.dataset.penaltyText = data.penaltyText;
}

function udAcceptBK() {
  const modal = document.getElementById('updownBKModal');
  const requesterId = modal.dataset.requesterId;
  const penaltyText = modal.dataset.penaltyText;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKAccept(requesterId, state.myId, penaltyText);
  } else {
    sendToHost({
      type: 'ud-bk-response',
      accepted: true,
      requesterId
    });
  }
}

function udRejectBK() {
  const modal = document.getElementById('updownBKModal');
  const requesterId = modal.dataset.requesterId;
  const penaltyText = modal.dataset.penaltyText;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKReject(requesterId, state.myId, penaltyText);
  } else {
    sendToHost({
      type: 'ud-bk-response',
      accepted: false,
      requesterId
    });
  }
}

function resolveBKAccept(requesterId, acceptorId, penaltyText) {
  showUpDownPenalty(acceptorId, penaltyText);
  showToast('\ud751\uae30\uc0ac\uac00 \ubc8c\uce59\uc744 \ubc1b\uc558\uc2b5\ub2c8\ub2e4!');
}

function resolveBKReject(requesterId, rejectId, penaltyText) {
  const targets = udState.players
    .filter(p => p.id !== requesterId && p.id !== rejectId)
    .map(p => p.id);

  targets.forEach(tid => {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uac70\uc808! \ub098\uba38\uc9c0 \ubaa8\ub450 \ubc8c\uce59!');
}

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

  const penaltyText = udState.currentBet || '\uc655\uc758 \uba85\ub839: ' + udState.penalties[Math.floor(Math.random() * udState.penalties.length)];

  targets.forEach(tid => {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uc655\uc758 \ubc8c\uce59\uc774 \ub0b4\ub824\uc84c\uc2b5\ub2c8\ub2e4!');

  setTimeout(() => {
    if(!state.isHost || !udState) return;
    udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
    udState.phase = 'playing';
    udState.specialData = null;
    udState.currentBet = null;
    broadcastUpDownState();
  }, 2000);
}

function showUpDownPenalty(playerId, penaltyText) {
  const msg = {
    type: 'ud-penalty',
    playerId,
    penaltyText,
  };

  broadcast(msg);
  handleUpDownPenalty(msg);
}

function handleUpDownPenalty(data) {
  if(data.playerId === state.myId) {
    // 본인: 기존 벌칙 모달 표시
    const modal = document.getElementById('updownPenaltyModal');
    document.getElementById('updownPenaltyText').textContent = data.penaltyText;
    document.getElementById('updownPenaltyWho').textContent = '당신의 벌칙입니다!';
    modal.classList.add('active');
    modal.dataset.penaltyText = data.penaltyText;
  } else {
    // 다른 유저: 누가 벌칙을 받는지 토스트로 표시
    const players = udState?.players || _lastUdView?.players || [];
    const playerName = players.find(function(p) { return p.id === data.playerId; })?.name || '???';
    showToast('🍺 ' + playerName + ' 벌칙: ' + data.penaltyText);
  }
}

function udAcceptPenalty() {
  const modal = document.getElementById('updownPenaltyModal');
  modal.classList.remove('active');

  showToast('\ubc8c\uce59 \uc218\ud589!');

  if(state.isHost) {
    continueUpDown();
  } else {
    sendToHost({ type: 'ud-penalty-done' });
  }
}

function udRejectPenalty() {
  const modal = document.getElementById('updownPenaltyModal');
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
  // Guard: prevent double advance (e.g. BK reject → both AI and human accept penalty)
  if(udState.phase === 'playing') return;

  udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
  udState.phase = 'playing';
  udState.specialData = null;
  udState.currentBet = null;
  broadcastUpDownState();
}


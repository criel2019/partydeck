// ===== E CARD ENGINE =====
let ecState = {
  player1: { id: '', name: '', avatar: '', role: 'emperor', cards: [], played: null },
  player2: { id: '', name: '', avatar: '', role: 'slave', cards: [], played: null },
  round: 1,
  maxRounds: 5,
  score: { emperor: 0, slave: 0 },
  bet: 100,
  betProposed: null,
  betAccepted: false,
  phase: 'role-assign',
  selectedCard: null,
};

function startECard() {
  if (state.players.length !== 2) {
    showToast('E\uce74\ub4dc\ub294 \uc815\ud655\ud788 2\uba85\ub9cc \ud50c\ub808\uc774 \uac00\ub2a5\ud569\ub2c8\ub2e4');
    return;
  }

  const roles = ['emperor', 'slave'];
  const shuffled = roles.sort(() => Math.random() - 0.5);

  ecState = {
    player1: {
      id: state.players[0].id,
      name: state.players[0].name,
      avatar: state.players[0].avatar,
      role: shuffled[0],
      cards: shuffled[0] === 'emperor'
        ? ['emperor', 'citizen', 'citizen', 'citizen', 'citizen']
        : ['slave', 'dummy', 'citizen', 'citizen', 'citizen'],
      played: null,
    },
    player2: {
      id: state.players[1].id,
      name: state.players[1].name,
      avatar: state.players[1].avatar,
      role: shuffled[1],
      cards: shuffled[1] === 'emperor'
        ? ['emperor', 'citizen', 'citizen', 'citizen', 'citizen']
        : ['slave', 'dummy', 'citizen', 'citizen', 'citizen'],
      played: null,
    },
    round: 1,
    maxRounds: 5,
    score: { emperor: 0, slave: 0 },
    bet: 100,
    betProposed: null,
    betAccepted: false,
    phase: 'betting',
    selectedCard: null,
  };

  state.ecard = ecState;
  broadcastECardState();
  showScreen('ecardGame');
}

function broadcastECardState() {
  const ec = state.ecard;

  [ec.player1, ec.player2].forEach(p => {
    const opponent = p === ec.player1 ? ec.player2 : ec.player1;
    const view = {
      type: 'ec-state',
      myId: p.id,
      myRole: p.role,
      myCards: p.cards,
      myPlayed: p.played,
      myName: p.name,
      myAvatar: p.avatar,
      oppId: opponent.id,
      oppName: opponent.name,
      oppAvatar: opponent.avatar,
      oppRole: opponent.role,
      oppCardsCount: opponent.cards.length,
      oppPlayed: opponent.played,
      round: ec.round,
      maxRounds: ec.maxRounds,
      score: ec.score,
      bet: ec.bet,
      betProposed: ec.betProposed,
      betAccepted: ec.betAccepted,
      phase: ec.phase,
    };

    if (p.id === state.myId) {
      renderECardView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

function renderECardView(view) {
  state._ecardView = view;

  document.getElementById('ecardRound').textContent = view.round;
  document.getElementById('ecardScoreEmperor').textContent = view.score.emperor;
  document.getElementById('ecardScoreSlave').textContent = view.score.slave;

  const roleIcon = view.myRole === 'emperor' ? '\ud83d\udc51' : '\u26d3\ufe0f';
  const roleName = view.myRole === 'emperor' ? '\ud669\uc81c' : '\ub178\uc608';
  const roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';

  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  const oppIndex = state.players.findIndex(p => p.id === view.oppId);
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[oppIndex % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = view.oppCardsCount;

  const oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if (view.phase === 'emperor-play' && view.myRole === 'emperor' && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(null, true, 'ecard-card-opp-small');
  } else if (view.phase === 'reveal' && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else {
    oppPlayedEl.innerHTML = '';
  }

  document.getElementById('ecardMyCardsCount').textContent = view.myCards.length;
  const myCardsEl = document.getElementById('ecardMyCards');
  myCardsEl.innerHTML = view.myCards.map((card, i) =>
    '<div class="ecard-card ecard-card-' + card + ' ' + (ecState.selectedCard === i ? 'selected' : '') + '"' +
          ' onclick="ecardSelectCard(' + i + ')" data-card-idx="' + i + '">' +
      '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
      '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
    '</div>'
  ).join('');

  const battleArea = document.getElementById('ecardBattleArea');
  if (view.phase === 'reveal' && view.myPlayed && view.oppPlayed) {
    battleArea.style.display = 'flex';
    document.getElementById('ecardBattleOpp').innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-battle');
    document.getElementById('ecardBattleMy').innerHTML = ecardCardHTML(view.myPlayed, false, 'ecard-card-battle');
  } else {
    battleArea.style.display = 'none';
  }

  const resultTextEl = document.getElementById('ecardResultText');
  if (view.phase === 'result') {
    const result = state.ecard._lastResult;
    if (result) {
      resultTextEl.textContent = result.message;
      resultTextEl.style.color = result.winner === view.myRole ? 'var(--gold)' : 'var(--text-dim)';
    }
  } else {
    resultTextEl.textContent = '';
  }

  const betArea = document.getElementById('ecardBetArea');
  const betResponse = document.getElementById('ecardBetResponse');
  const actionButtons = document.getElementById('ecardActionButtons');
  const waiting = document.getElementById('ecardWaiting');

  betArea.style.display = 'none';
  betResponse.style.display = 'none';
  actionButtons.style.display = 'none';
  waiting.style.display = 'none';

  if (view.phase === 'betting') {
    if (view.myRole === 'slave' && !view.betProposed) {
      betArea.style.display = 'block';
    } else if (view.myRole === 'emperor' && view.betProposed && !view.betAccepted) {
      betResponse.style.display = 'block';
      document.getElementById('ecardBetProposed').textContent = view.betProposed;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ubc30\ud305 \ub300\uae30 \uc911...';
    }
  } else if (view.phase === 'slave-play') {
    if (view.myRole === 'slave') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ub178\uc608\uac00 \uce74\ub4dc\ub97c \uc120\ud0dd \uc911...';
    }
  } else if (view.phase === 'emperor-play') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ud669\uc81c\uac00 \uce74\ub4dc\ub97c \uc120\ud0dd \uc911...';
    }
  }
}

function ecardCardIcon(card) {
  const icons = {
    emperor: '\ud83d\udc51',
    citizen: '\ud83e\udd35',
    slave: '\u26d3\ufe0f',
    dummy: '\u2753',
  };
  return icons[card] || '?';
}

function ecardCardName(card) {
  const names = {
    emperor: '\ud669\uc81c',
    citizen: '\uc2dc\ubbfc',
    slave: '\ub178\uc608',
    dummy: '\ub354\ubbf8',
  };
  return names[card] || '?';
}

function ecardCardHTML(card, isBack, sizeClass) {
  var cls = sizeClass ? ' ' + sizeClass : '';
  if (isBack) {
    return '<div class="ecard-card ecard-card-back' + cls + '"></div>';
  }
  return '<div class="ecard-card ecard-card-' + card + cls + '">' +
    '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
    '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
  '</div>';
}

function ecardSelectCard(idx) {
  const view = state._ecardView;
  if (!view) return;

  const canPlay = (view.phase === 'slave-play' && view.myRole === 'slave') ||
                  (view.phase === 'emperor-play' && view.myRole === 'emperor');

  if (!canPlay) return;

  ecState.selectedCard = idx;
  renderECardView(view);
}

document.getElementById('ecardBetSlider').addEventListener('input', function(e) {
  document.getElementById('ecardBetAmount').textContent = e.target.value;
});

function ecardSubmitBet() {
  const bet = parseInt(document.getElementById('ecardBetSlider').value);
  if (state.isHost) {
    processECardBet(state.myId, bet);
  } else {
    sendToHost({ type: 'ec-bet', bet });
  }
}

function ecardAcceptBet() {
  if (state.isHost) {
    processECardBetResponse(state.myId, true);
  } else {
    sendToHost({ type: 'ec-bet-response', accept: true });
  }
}

function ecardRejectBet() {
  if (state.isHost) {
    processECardBetResponse(state.myId, false);
  } else {
    sendToHost({ type: 'ec-bet-response', accept: false });
  }
}

function ecardSubmitCard() {
  if (ecState.selectedCard === null) {
    showToast('\uce74\ub4dc\ub97c \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  const view = state._ecardView;
  const cardType = view.myCards[ecState.selectedCard];

  if (state.isHost) {
    processECardPlay(state.myId, cardType, ecState.selectedCard);
  } else {
    sendToHost({ type: 'ec-play', cardType, cardIdx: ecState.selectedCard });
  }

  ecState.selectedCard = null;
}

function processECardBet(playerId, bet) {
  if (!state.isHost) return;
  const ec = state.ecard;
  if (ec.phase !== 'betting') return;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;
  if (player.role !== 'slave') return;

  ec.betProposed = bet;
  broadcastECardState();
}

function processECardBetResponse(playerId, accept) {
  if (!state.isHost) return;
  const ec = state.ecard;
  if (ec.phase !== 'betting') return;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;
  if (player.role !== 'emperor') return;

  if (accept) {
    ec.bet = ec.betProposed;
    ec.betAccepted = true;
    ec.phase = 'slave-play';
    broadcastECardState();
  } else {
    ec.betProposed = null;
    broadcastECardState();
    showToast('\ud669\uc81c\uac00 \ubc30\ud305\uc744 \uac70\uc808\ud588\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \uc81c\uc548\ud558\uc138\uc694.');
  }
}

function processECardPlay(playerId, cardType, cardIdx) {
  if (!state.isHost) return;
  const ec = state.ecard;
  const validCards = ['emperor', 'citizen', 'slave'];
  if(!validCards.includes(cardType)) return;
  if(typeof cardIdx !== 'number' || cardIdx < 0) return;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;
  if(cardIdx >= player.cards.length) return;

  if (ec.phase === 'slave-play' && player.role === 'slave') {
    player.played = cardType;
    player.cards.splice(cardIdx, 1);
    ec.phase = 'emperor-play';
    broadcastECardState();
  } else if (ec.phase === 'emperor-play' && player.role === 'emperor') {
    player.played = cardType;
    player.cards.splice(cardIdx, 1);
    ec.phase = 'reveal';
    broadcastECardState();
    setTimeout(() => ecardReveal(), 1500);
  }
}

function ecardReveal() {
  if (!state.isHost) return;
  const ec = state.ecard;

  const card1 = ec.player1.played;
  const card2 = ec.player2.played;

  const result = ecardJudge(card1, card2);

  let winner = null;
  let message = '';

  if (result === 0) {
    message = '\ubb34\uc2b9\ubd80! (\ub354\ubbf8 \ub610\ub294 \uc2dc\ubbfc vs \uc2dc\ubbfc)';
  } else if (result === 1) {
    winner = ec.player1.role;
    message = ec.player1.name + ' \uc2b9\ub9ac!';
    if (ec.player1.role === 'emperor') ec.score.emperor++;
    else ec.score.slave++;
  } else {
    winner = ec.player2.role;
    message = ec.player2.name + ' \uc2b9\ub9ac!';
    if (ec.player2.role === 'emperor') ec.score.emperor++;
    else ec.score.slave++;
  }

  ec._lastResult = { winner, message };
  ec.phase = 'result';
  broadcastECardState();

  setTimeout(() => {
    if (ec.round >= ec.maxRounds) {
      ecardGameOver();
    } else {
      ecardNextRound();
    }
  }, 3000);
}

function ecardJudge(card1, card2) {
  if (card1 === 'dummy' || card2 === 'dummy') return 0;
  if (card1 === 'citizen' && card2 === 'citizen') return 0;
  if (card1 === 'emperor' && card2 === 'citizen') return 1;
  if (card1 === 'citizen' && card2 === 'emperor') return -1;
  if (card1 === 'citizen' && card2 === 'slave') return 1;
  if (card1 === 'slave' && card2 === 'citizen') return -1;
  if (card1 === 'slave' && card2 === 'emperor') return 1;
  if (card1 === 'emperor' && card2 === 'slave') return -1;
  return 0;
}

function ecardNextRound() {
  if (!state.isHost) return;
  const ec = state.ecard;

  ec.round++;
  ec.player1.played = null;
  ec.player2.played = null;
  ec.betProposed = null;
  ec.betAccepted = false;
  ec.phase = 'betting';
  ec._lastResult = null;

  broadcastECardState();
}

function ecardGameOver() {
  if (!state.isHost) return;
  const ec = state.ecard;

  const emperorScore = ec.score.emperor;
  const slaveScore = ec.score.slave;

  let winnerRole = null;
  let message = '';

  if (emperorScore > slaveScore) {
    winnerRole = 'emperor';
    message = '\ud669\uc81c \uc2b9\ub9ac!';
  } else if (slaveScore > emperorScore) {
    winnerRole = 'slave';
    message = '\ub178\uc608 \uc2b9\ub9ac! \ub300\uc5ed\uc804!';
  } else {
    message = '\ubb34\uc2b9\ubd80!';
  }

  const winner = ec.player1.role === winnerRole ? ec.player1 : (ec.player2.role === winnerRole ? ec.player2 : null);

  const result = {
    type: 'ec-result',
    winnerId: winner?.id,
    winnerName: winner?.name || '\ubb34\uc2b9\ubd80',
    winnerRole,
    message,
    score: ec.score,
  };

  broadcast(result);
  handleECardResult(result);
}

function handleECardResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won, won ? 40 : 5);

  document.getElementById('resultTitle').textContent = won ? '\uc2b9\ub9ac!' : (msg.winnerId ? '\ud328\ubc30...' : '\ubb34\uc2b9\ubd80');
  document.getElementById('resultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('winnerName').textContent = msg.message;
  document.getElementById('resultHand').textContent = '\ucd5c\uc885 \uc810\uc218: \ud669\uc81c ' + msg.score.emperor + ' - ' + msg.score.slave + ' \ub178\uc608';
  document.getElementById('resultPot').textContent = '';
  document.getElementById('resultCards').innerHTML = '';
  document.getElementById('resultOverlay').classList.add('active');
}


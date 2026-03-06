// ===== CATCH THE EMPEROR ENGINE =====
// 4-game duel structure:
//   Game 1: A=emperor  A sets bet
//   Game 2: B=emperor (A=slave)  A sets bet
//   Game 3: B=emperor  B sets bet
//   Game 4: A=emperor (B=slave)  B sets bet
// Per exchange: Emperor places face-down → Slave reveals face-up → Emperor flips
// Final card (both-play): Both reveal simultaneously

var EC_TOTAL_GAMES = 4;
var EC_MAX_EXCHANGES = 2;
var EC_DEFAULT_BET = 100;
var EC_BET_MIN = 10;
var EC_BET_MAX = 500;

// [emperor(0=p1,1=p2), slave, betSetter]
var EC_ROLE_MAP = [
  [0, 1, 0], // Game 1: p1=emperor, p2=slave, p1 bets  (A황제)
  [1, 0, 0], // Game 2: p2=emperor, p1=slave, p1 bets  (A노예)
  [1, 0, 1], // Game 3: p2=emperor, p1=slave, p2 bets  (B황제)
  [0, 1, 1], // Game 4: p1=emperor, p2=slave, p2 bets  (B노예)
];

var ecState = {
  player1: { id: '', name: '', avatar: '' },
  player2: { id: '', name: '', avatar: '' },
  gameNum: 1,
  maxGames: EC_TOTAL_GAMES,
  exchange: 1,
  maxExchanges: EC_MAX_EXCHANGES,
  emperorPlayerId: '',
  slavePlayerId: '',
  betSetterId: '',
  currentBet: EC_DEFAULT_BET,
  emperorCards: [],
  slaveCards: [],
  emperorPlayed: null,
  slavePlayed: null,
  firstSubmittedRole: null,
  // phases: betting | emperor-play | slave-play | emperor-flip | reveal
  //         result | both-play | both-reveal | game-result | gameover
  phase: 'betting',
  score: { p1: 0, p2: 0 },
  selectedCard: null,
  bothSelected: { emperor: false, slave: false },
  _lastResult: null
};

function ecCreateRoleCards(role) {
  // 3 cards per player: 2 exchanges + 1 final simultaneous = 5 total plays
  if (role === 'emperor') return ['emperor', 'citizen', 'citizen'];
  return ['slave', 'citizen', 'citizen'];
}

function ecClampBet(value) {
  var n = Number(value);
  if (!Number.isFinite(n)) n = EC_DEFAULT_BET;
  n = Math.round(n);
  if (n < EC_BET_MIN) n = EC_BET_MIN;
  if (n > EC_BET_MAX) n = EC_BET_MAX;
  return n;
}

function ecGetPlayerById(id) {
  if (ecState.player1.id === id) return ecState.player1;
  if (ecState.player2.id === id) return ecState.player2;
  return null;
}

function ecGetScoreKeyById(id) {
  return id === ecState.player1.id ? 'p1' : 'p2';
}

function ecGetRoleForPlayer(playerId) {
  if (playerId === ecState.emperorPlayerId) return 'emperor';
  if (playerId === ecState.slavePlayerId) return 'slave';
  return null;
}

function ecPrepareGame(gameNum) {
  ecState.gameNum = gameNum;
  ecState.exchange = 1;
  ecState.maxExchanges = EC_MAX_EXCHANGES;
  ecState.emperorPlayed = null;
  ecState.slavePlayed = null;
  ecState.firstSubmittedRole = null;
  ecState.selectedCard = null;
  ecState._lastResult = null;
  ecState.bothSelected = { emperor: false, slave: false };

  var m = EC_ROLE_MAP[(gameNum - 1) % 4];
  ecState.emperorPlayerId = m[0] === 0 ? ecState.player1.id : ecState.player2.id;
  ecState.slavePlayerId   = m[1] === 0 ? ecState.player1.id : ecState.player2.id;
  ecState.betSetterId     = m[2] === 0 ? ecState.player1.id : ecState.player2.id;

  ecState.emperorCards = ecCreateRoleCards('emperor');
  ecState.slaveCards   = ecCreateRoleCards('slave');
  ecState.phase = 'betting';
}

function startECard() {
  if (state.players.length !== 2) {
    showToast('황제를 잡아라는 정확히 2명만 플레이 가능합니다');
    return;
  }

  ecState = {
    player1: { id: state.players[0].id, name: state.players[0].name, avatar: state.players[0].avatar },
    player2: { id: state.players[1].id, name: state.players[1].name, avatar: state.players[1].avatar },
    gameNum: 1,
    maxGames: EC_TOTAL_GAMES,
    exchange: 1,
    maxExchanges: EC_MAX_EXCHANGES,
    emperorPlayerId: '',
    slavePlayerId: '',
    betSetterId: '',
    currentBet: EC_DEFAULT_BET,
    emperorCards: [],
    slaveCards: [],
    emperorPlayed: null,
    slavePlayed: null,
    firstSubmittedRole: null,
    phase: 'betting',
    score: { p1: 0, p2: 0 },
    selectedCard: null,
    bothSelected: { emperor: false, slave: false },
    _lastResult: null
  };

  ecPrepareGame(1);
  state.ecard = ecState;
  broadcastECardState();
  showScreen('ecardGame');
}

function ecardGetMyRole(view) {
  return view && view.myRole;
}

function broadcastECardState() {
  var ec = state.ecard;
  if (!ec) return;
  var p1 = ec.player1;
  var p2 = ec.player2;

  [p1, p2].forEach(function(player) {
    var myRole = ecGetRoleForPlayer(player.id);
    var opp = player.id === p1.id ? p2 : p1;
    var myCards = myRole === 'emperor' ? ec.emperorCards : ec.slaveCards;
    var oppCards = myRole === 'emperor' ? ec.slaveCards : ec.emperorCards;

    // Phase-aware card visibility
    var myPlayed, oppPlayed;
    if (myRole === 'emperor') {
      // Emperor always knows their own played card
      myPlayed = ec.emperorPlayed;
      // Slave's card becomes visible at emperor-flip (slave just revealed), or later phases
      var slaveVisiblePhases = ['emperor-flip', 'reveal', 'result', 'game-result', 'both-reveal'];
      oppPlayed = slaveVisiblePhases.indexOf(ec.phase) !== -1 ? ec.slavePlayed : null;
    } else {
      // Slave always knows their own played card
      myPlayed = ec.slavePlayed;
      // Emperor's card only visible at reveal and after
      var emperorVisiblePhases = ['reveal', 'result', 'game-result', 'both-reveal'];
      oppPlayed = emperorVisiblePhases.indexOf(ec.phase) !== -1 ? ec.emperorPlayed : null;
    }

    var view = {
      type: 'ec-state',
      myId: player.id,
      myRole: myRole,
      myCards: myCards.slice(),
      myPlayed: myPlayed,
      myName: player.name,
      myAvatar: player.avatar,
      oppId: opp.id,
      oppName: opp.name,
      oppAvatar: opp.avatar,
      oppRole: myRole === 'emperor' ? 'slave' : 'emperor',
      oppCardsCount: oppCards.length,
      oppPlayed: oppPlayed,
      gameNum: ec.gameNum,
      maxGames: ec.maxGames,
      exchange: ec.exchange,
      maxExchanges: ec.maxExchanges,
      phase: ec.phase,
      score: ec.score,
      currentBet: ec.currentBet,
      betSetterId: ec.betSetterId,
      emperorPlayerId: ec.emperorPlayerId,
      slavePlayerId: ec.slavePlayerId,
      firstSubmittedRole: ec.firstSubmittedRole,
      bothSelected: { emperor: ec.bothSelected.emperor, slave: ec.bothSelected.slave },
      _lastResult: ec._lastResult
    };

    if (player.id === state.myId) {
      renderECardView(view);
    } else {
      sendTo(player.id, view);
    }
  });
}

function ecardCardIcon(card) {
  var icons = { emperor: '👑', citizen: '🧑', slave: '⛓️' };
  return icons[card] || '❓';
}

function ecardCardName(card) {
  var names = { emperor: '황제', citizen: '시민', slave: '노예' };
  return names[card] || '알수없음';
}

function ecardCardHTML(card, isBack, sizeClass) {
  var cls = sizeClass ? ' ' + sizeClass : '';
  if (isBack || !card) {
    return '<div class="ecard-card ecard-card-back' + cls + '"></div>';
  }
  return '<div class="ecard-card ecard-card-' + card + cls + '">' +
    '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
    '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
  '</div>';
}

function ecardCanPlay(view) {
  if (!view) return false;
  if (view.phase === 'emperor-play' && view.myRole === 'emperor') return true;
  if (view.phase === 'slave-play' && view.myRole === 'slave') return true;
  if (view.phase === 'both-play') {
    var iSubmitted = view.bothSelected && view.bothSelected[view.myRole];
    return !iSubmitted;
  }
  return false;
}

function ecardRenderBattle(view) {
  var battleArea = document.getElementById('ecardBattleArea');
  if (!battleArea) return;

  var battleOpp = document.getElementById('ecardBattleOpp');
  var battleMy = document.getElementById('ecardBattleMy');
  if (!battleOpp || !battleMy) return;

  // emperor-flip: slave's card revealed face-up, emperor's card still face-down
  if (view.phase === 'emperor-flip') {
    battleArea.style.display = 'flex';
    if (view.myRole === 'emperor') {
      // Slave's card on left, my face-down card on right with flip hint
      battleOpp.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-battle');
      battleMy.innerHTML =
        '<div class="ecard-card ecard-card-back ecard-card-battle ecard-card-flip-pending" onclick="ecardSubmitCard()">' +
          '<div class="ecard-flip-hint">탭하여<br>뒤집기</div>' +
        '</div>';
    } else {
      // I'm slave: see my face-up card and emperor's face-down
      battleOpp.innerHTML = '<div class="ecard-card ecard-card-back ecard-card-battle"></div>';
      battleMy.innerHTML = ecardCardHTML(view.myPlayed, false, 'ecard-card-battle');
    }
    return;
  }

  // slave-play phase: emperor already placed face-down
  if (view.phase === 'slave-play' && view.firstSubmittedRole === 'emperor') {
    battleArea.style.display = 'flex';
    battleOpp.innerHTML = ecardCardHTML(null, true, 'ecard-card-battle');
    battleMy.innerHTML = ecardCardHTML(null, true, 'ecard-card-battle');
    return;
  }

  // reveal / both-reveal: both shown with animation
  if ((view.phase === 'reveal' || view.phase === 'both-reveal') && view.myPlayed && view.oppPlayed) {
    battleArea.style.display = 'flex';
    battleOpp.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-battle ecard-card-reveal-anim');
    battleMy.innerHTML  = ecardCardHTML(view.myPlayed,  false, 'ecard-card-battle ecard-card-reveal-anim');
    return;
  }

  battleArea.style.display = 'none';
}

function renderECardView(view) {
  if (!view) return;
  state._ecardView = view;

  // Update round info
  var roundEl = document.getElementById('ecardRound');
  if (roundEl && roundEl.parentNode) {
    roundEl.parentNode.innerHTML =
      'G<span id="ecardRound">' + view.gameNum + '</span>/' + view.maxGames +
      ' E' + view.exchange + '/' + view.maxExchanges +
      ' · ' + view.currentBet + 'P';
  }

  document.getElementById('ecardScoreEmperor').textContent = String(view.score.p1 || 0);
  document.getElementById('ecardScoreSlave').textContent   = String(view.score.p2 || 0);

  var roleIcon  = view.myRole === 'emperor' ? '👑' : '⛓️';
  var roleName  = view.myRole === 'emperor' ? '황제' : '노예';
  var roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';
  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  var oppIndex = state.players.findIndex(function(p) { return p.id === view.oppId; });
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[(oppIndex >= 0 ? oppIndex : 0) % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = String(view.oppCardsCount);

  var oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if (view.phase === 'slave-play' && view.myRole === 'slave' && view.oppPlayed !== null) {
    oppPlayedEl.innerHTML = ecardCardHTML(null, true, 'ecard-card-opp-small');
  } else if ((view.phase === 'reveal' || view.phase === 'both-reveal') && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else {
    oppPlayedEl.innerHTML = '';
  }

  // My cards area — hidden during battle/reveal phases
  var hideCards = ['emperor-flip', 'reveal', 'result', 'game-result', 'both-reveal'];
  var myCardsEl = document.getElementById('ecardMyCards');
  document.getElementById('ecardMyCardsCount').textContent = String((view.myCards || []).length);

  if (hideCards.indexOf(view.phase) !== -1) {
    myCardsEl.innerHTML = '';
  } else {
    var canPlay = ecardCanPlay(view);
    // In both-play: auto-select the only remaining card for UX convenience
    if (view.phase === 'both-play' && view.myCards && view.myCards.length === 1 && ecState.selectedCard === null) {
      ecState.selectedCard = 0;
    }
    myCardsEl.innerHTML = (view.myCards || []).map(function(card, i) {
      return '<div class="ecard-card ecard-card-' + card + ' ' + (ecState.selectedCard === i ? 'selected' : '') + '"' +
        (canPlay ? ' onclick="ecardSelectCard(' + i + ')"' : '') +
        ' data-card-idx="' + i + '">' +
        '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
        '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
        '</div>';
    }).join('');
  }

  ecardRenderBattle(view);

  // Result / status text
  var resultTextEl = document.getElementById('ecardResultText');
  if (view.phase === 'betting') {
    var setter = view.betSetterId === state.myId ? '내가' : view.oppName;
    // Show game structure hint
    var gameRoleHint = '';
    if (view.gameNum === 1) gameRoleHint = '1판: A황제 · 2판: A노예 · 3판: B황제 · 4판: B노예';
    resultTextEl.textContent = gameRoleHint || (setter + ' 배팅 금액 설정 중');
    resultTextEl.style.color = 'var(--text-dim)';
  } else if (view.phase === 'emperor-flip') {
    resultTextEl.textContent = view.myRole === 'emperor' ? '카드를 뒤집어 공개하세요!' : '황제가 카드를 뒤집는 중...';
    resultTextEl.style.color = view.myRole === 'emperor' ? 'var(--gold)' : 'var(--text-dim)';
  } else if (view.phase === 'both-play') {
    var iHaveSubmitted = view.bothSelected && view.bothSelected[view.myRole];
    resultTextEl.textContent = iHaveSubmitted ? '상대방을 기다리는 중...' : '🎴 마지막 카드! 동시 공개!';
    resultTextEl.style.color = 'var(--gold)';
  } else if ((view.phase === 'result' || view.phase === 'game-result') && view._lastResult && view._lastResult.message) {
    resultTextEl.textContent = view._lastResult.message;
    resultTextEl.style.color = view._lastResult.myWin ? 'var(--gold)' : 'var(--text-dim)';
  } else {
    resultTextEl.textContent = '';
    resultTextEl.style.color = 'var(--gold)';
  }

  // UI panels
  var actionButtons = document.getElementById('ecardActionButtons');
  var waiting       = document.getElementById('ecardWaiting');
  var betArea       = document.getElementById('ecardBetArea');
  var betResponse   = document.getElementById('ecardBetResponse');
  var submitBtn     = document.getElementById('ecardSubmitBtn');
  var waitingText   = document.getElementById('ecardWaitingText');

  betArea.style.display     = 'none';
  betResponse.style.display = 'none';
  actionButtons.style.display = 'none';
  waiting.style.display     = 'none';

  // --- BETTING ---
  if (view.phase === 'betting') {
    if (view.betSetterId === state.myId) {
      betArea.style.display = 'block';
      var slider = document.getElementById('ecardBetSlider');
      var betAmount = document.getElementById('ecardBetAmount');
      if (slider) slider.value = String(ecClampBet(view.currentBet));
      if (betAmount) betAmount.textContent = String(ecClampBet(view.currentBet));
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '상대가 배팅 금액을 설정 중...';
    }
    return;
  }

  // --- EMPEROR PLAY (places card face-down) ---
  if (view.phase === 'emperor-play') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '카드 뒷면으로 내려놓기';
      submitBtn.disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '황제가 카드를 뒷면으로 내려놓는 중...';
    }
    return;
  }

  // --- SLAVE PLAY (reveals card face-up) ---
  if (view.phase === 'slave-play') {
    if (view.myRole === 'slave') {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '카드 앞면으로 공개 제출';
      submitBtn.disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '노예가 카드를 공개하는 중...';
    }
    return;
  }

  // --- EMPEROR FLIP (emperor taps to reveal their face-down card) ---
  if (view.phase === 'emperor-flip') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '카드 뒤집기';
      submitBtn.disabled = false;
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '황제가 카드를 뒤집는 중...';
    }
    return;
  }

  // --- BOTH PLAY (final simultaneous reveal) ---
  if (view.phase === 'both-play') {
    var submitted = view.bothSelected && view.bothSelected[view.myRole];
    if (!submitted) {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '마지막 카드 동시 공개!';
      submitBtn.disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '상대방 카드 공개 대기 중...';
    }
    return;
  }

  // --- Other phases: show spinner ---
  if (['reveal', 'both-reveal', 'result', 'game-result'].indexOf(view.phase) !== -1) {
    waiting.style.display = 'flex';
    waitingText.textContent = '결과 연출 중...';
  }
}

function ecardSelectCard(idx) {
  var view = state._ecardView;
  if (!view) return;
  if (!ecardCanPlay(view)) return;
  ecState.selectedCard = idx;
  renderECardView(view);
}

var _ecBetSliderBound = false;
function ecBindBetSlider() {
  if (_ecBetSliderBound) return;
  var betSlider = document.getElementById('ecardBetSlider');
  if (!betSlider) return;
  _ecBetSliderBound = true;
  betSlider.addEventListener('input', function(e) {
    var amount = document.getElementById('ecardBetAmount');
    if (amount) amount.textContent = String(ecClampBet(e.target.value));
  });
}
ecBindBetSlider();

function ecardSubmitBet() {
  var slider = document.getElementById('ecardBetSlider');
  if (!slider) return;
  var bet = ecClampBet(slider.value);
  if (state.isHost) {
    processECardBet(state.myId, bet);
  } else {
    sendToHost({ type: 'ec-bet', bet: bet });
  }
}

function ecardAcceptBet() {}
function ecardRejectBet() {}
function processECardBetResponse() {}

// Main submit button handler — dispatches by phase
function ecardSubmitCard() {
  var view = state._ecardView;
  if (!view) return;

  // Emperor-flip: no card selection needed, just tap to flip
  if (view.phase === 'emperor-flip' && view.myRole === 'emperor') {
    if (state.isHost) {
      processECardFlip(state.myId);
    } else {
      sendToHost({ type: 'ec-flip' });
    }
    return;
  }

  // Both-play: submit the final card
  if (view.phase === 'both-play') {
    if (ecState.selectedCard === null) {
      showToast('카드를 선택해 주세요');
      return;
    }
    var bothIdx  = ecState.selectedCard;
    var bothType = view.myCards[bothIdx];
    if (!bothType) return;
    ecState.selectedCard = null;
    if (state.isHost) {
      processECardBothPlay(state.myId, bothType, bothIdx);
    } else {
      sendToHost({ type: 'ec-both-play', cardType: bothType, cardIdx: bothIdx });
    }
    return;
  }

  // Normal play (emperor-play / slave-play)
  if (ecState.selectedCard === null) {
    showToast('카드를 선택해 주세요');
    return;
  }
  if (!ecardCanPlay(view)) return;
  if (ecState.selectedCard < 0 || ecState.selectedCard >= view.myCards.length) return;

  var cardType = view.myCards[ecState.selectedCard];
  var cardIdx  = ecState.selectedCard;
  ecState.selectedCard = null;

  if (state.isHost) {
    processECardPlay(state.myId, cardType, cardIdx);
  } else {
    sendToHost({ type: 'ec-play', cardType: cardType, cardIdx: cardIdx });
  }
}

// ===== HOST PROCESSORS =====

function processECardBet(playerId, bet) {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;
  if (ec.phase !== 'betting') return;
  if (playerId !== ec.betSetterId) return;
  ec.currentBet = ecClampBet(bet);
  ec.phase = 'emperor-play';
  ec._lastResult = null;
  broadcastECardState();
}

function processECardPlay(playerId, cardType, cardIdx) {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;
  if (typeof cardIdx !== 'number' || cardIdx < 0) return;

  if (ec.phase === 'emperor-play') {
    if (playerId !== ec.emperorPlayerId) return;
    if (cardIdx >= ec.emperorCards.length) return;
    if (ec.emperorCards[cardIdx] !== cardType) return;

    ec.emperorPlayed = cardType;
    ec.emperorCards.splice(cardIdx, 1);
    ec.firstSubmittedRole = 'emperor';
    ec.phase = 'slave-play';
    broadcastECardState();
    return;
  }

  if (ec.phase === 'slave-play') {
    if (playerId !== ec.slavePlayerId) return;
    if (cardIdx >= ec.slaveCards.length) return;
    if (ec.slaveCards[cardIdx] !== cardType) return;

    ec.slavePlayed = cardType;
    ec.slaveCards.splice(cardIdx, 1);
    // Slave revealed → wait for emperor to flip
    ec.phase = 'emperor-flip';
    broadcastECardState();
  }
}

// Emperor taps to flip their face-down card
function processECardFlip(playerId) {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;
  if (ec.phase !== 'emperor-flip') return;
  if (playerId !== ec.emperorPlayerId) return;

  ec.phase = 'reveal';
  broadcastECardState();

  setTimeout(function() {
    ecResolveExchange();
  }, 1200);
}

// Both players submit their final card simultaneously
function processECardBothPlay(playerId, cardType, cardIdx) {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;
  if (ec.phase !== 'both-play') return;

  if (playerId === ec.emperorPlayerId) {
    if (ec.bothSelected.emperor) return;
    if (cardIdx >= ec.emperorCards.length) return;
    if (ec.emperorCards[cardIdx] !== cardType) return;
    ec.emperorPlayed = cardType;
    ec.emperorCards.splice(cardIdx, 1);
    ec.bothSelected.emperor = true;
  } else if (playerId === ec.slavePlayerId) {
    if (ec.bothSelected.slave) return;
    if (cardIdx >= ec.slaveCards.length) return;
    if (ec.slaveCards[cardIdx] !== cardType) return;
    ec.slavePlayed = cardType;
    ec.slaveCards.splice(cardIdx, 1);
    ec.bothSelected.slave = true;
  } else {
    return;
  }

  broadcastECardState();

  // When both submitted → reveal simultaneously
  if (ec.bothSelected.emperor && ec.bothSelected.slave) {
    ec.phase = 'both-reveal';
    broadcastECardState();
    setTimeout(function() {
      ecResolveBothPlay();
    }, 1200);
  }
}

// Resolve the final simultaneous reveal
function ecResolveBothPlay() {
  var ec = state.ecard;
  if (!ec) return;

  var empCard = ec.emperorPlayed;
  var slvCard = ec.slavePlayed;

  if (empCard === 'emperor' && slvCard === 'slave') {
    ecApplyGameWin('slave', '노예가 황제를 잡음');
  } else if (empCard === 'emperor') {
    ecApplyGameWin('emperor', '황제 생존');
  } else {
    ecApplyGameWin('emperor', '황제 은신 성공');
  }
}

function ecApplyGameWin(winnerRole, reasonText) {
  var ec = state.ecard;
  if (!ec) return;

  var winnerId = winnerRole === 'emperor' ? ec.emperorPlayerId : ec.slavePlayerId;
  var winner   = ecGetPlayerById(winnerId);
  var scoreKey = ecGetScoreKeyById(winnerId);
  var gain     = ecClampBet(ec.currentBet);
  ec.score[scoreKey] += gain;

  var myWin = winnerId === state.myId;
  ec._lastResult = {
    message: (winner ? winner.name : '플레이어') + ' 승리! +' + gain + 'P (' + reasonText + ')',
    myWin: myWin
  };
  ec.phase = 'game-result';
  broadcastECardState();

  setTimeout(function() {
    ecardNextGame();
  }, 1800);
}

function ecResolveExchange() {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;

  var empCard = ec.emperorPlayed;
  var slvCard = ec.slavePlayed;

  // Slave catches emperor → slave wins immediately
  if (empCard === 'emperor' && slvCard === 'slave') {
    ecApplyGameWin('slave', '노예가 황제를 잡음');
    return;
  }

  // Emperor avoids → emperor wins immediately
  if (empCard === 'emperor' && slvCard !== 'slave') {
    ecApplyGameWin('emperor', '황제가 노예를 회피');
    return;
  }

  // Reached max exchanges → go to final simultaneous reveal (both-play)
  if (ec.exchange >= ec.maxExchanges) {
    ec._lastResult = { message: '마지막 카드! 동시 공개!', myWin: false };
    ec.emperorPlayed = null;
    ec.slavePlayed   = null;
    ec.firstSubmittedRole = null;
    ec.bothSelected = { emperor: false, slave: false };
    ec.phase = 'both-play';
    broadcastECardState();
    return;
  }

  // Continue to next exchange
  ec._lastResult = {
    message: ec.exchange + '차 제출 완료 · 다음 제출 진행',
    myWin: false
  };
  ec.phase = 'result';
  broadcastECardState();

  setTimeout(function() {
    ec.exchange += 1;
    ec.emperorPlayed = null;
    ec.slavePlayed   = null;
    ec.firstSubmittedRole = null;
    ec._lastResult = null;
    ec.phase = 'emperor-play';
    broadcastECardState();
  }, 1000);
}

function ecardNextGame() {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;

  if (ec.gameNum >= ec.maxGames) {
    ecardGameOver();
    return;
  }

  ecPrepareGame(ec.gameNum + 1);
  broadcastECardState();
}

function ecardGameOver() {
  if (!state.isHost || !state.ecard) return;
  var ec = state.ecard;

  var p1Score = ec.score.p1;
  var p2Score = ec.score.p2;
  var winnerId   = null;
  var winnerName = '무승부';
  var message    = '';

  if (p1Score > p2Score) {
    winnerId   = ec.player1.id;
    winnerName = ec.player1.name;
    message    = ec.player1.name + ' 승리! (' + p1Score + ':' + p2Score + ')';
  } else if (p2Score > p1Score) {
    winnerId   = ec.player2.id;
    winnerName = ec.player2.name;
    message    = ec.player2.name + ' 승리! (' + p1Score + ':' + p2Score + ')';
  } else {
    message = '무승부! (' + p1Score + ':' + p2Score + ')';
  }

  var result = {
    type: 'ec-result',
    winnerId:   winnerId,
    winnerName: winnerName,
    message:    message,
    score: { emperor: p1Score, slave: p2Score }
  };

  broadcast(result);
  handleECardResult(result);
}

function handleECardResult(msg) {
  if (!msg) return;
  var won = msg.winnerId === state.myId;
  recordGame(won, won ? 40 : 5);

  document.getElementById('resultTitle').textContent = won ? '승리!' : (msg.winnerId ? '패배...' : '무승부');
  document.getElementById('resultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('winnerName').textContent = msg.message;
  document.getElementById('resultHand').textContent = '최종 점수: ' + msg.score.emperor + ' : ' + msg.score.slave;
  document.getElementById('resultPot').textContent  = '';
  document.getElementById('resultCards').innerHTML  = '';
  document.getElementById('resultOverlay').classList.add('active');
}

// ===== 황제를 잡아라 ENGINE =====
// 12-game duel rules
// - Games 1~6: player A sets bet (A role alternates Emperor/Slave 3 times each)
// - Games 7~12: player B sets bet (B role alternates Emperor/Slave 3 times each)
// - Per game order: Emperor > Slave > Emperor > Slave > remaining-card result
// - If Emperor avoids Slave or gets caught by Slave, that game ends immediately

var EC_TOTAL_GAMES = 12;
var EC_HALF_GAMES = 6;
var EC_MAX_EXCHANGES = 4; // Emperor > Slave x4, 마지막 1장 남기고 결과확인
var EC_DEFAULT_BET = 100;
var EC_BET_MIN = 10;
var EC_BET_MAX = 500;

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
  phase: 'betting', // betting | emperor-play | slave-play | reveal | result | game-result | gameover
  score: { p1: 0, p2: 0 },
  selectedCard: null,
  _lastResult: null
};

function ecCreateRoleCards(role) {
  if (role === 'emperor') return ['emperor', 'citizen', 'citizen', 'citizen', 'citizen'];
  return ['slave', 'citizen', 'citizen', 'citizen', 'citizen'];
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

  var odd = (gameNum % 2 === 1);
  ecState.emperorPlayerId = odd ? ecState.player1.id : ecState.player2.id;
  ecState.slavePlayerId = odd ? ecState.player2.id : ecState.player1.id;
  ecState.betSetterId = gameNum <= EC_HALF_GAMES ? ecState.player1.id : ecState.player2.id;

  ecState.emperorCards = ecCreateRoleCards('emperor');
  ecState.slaveCards = ecCreateRoleCards('slave');
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
    var myPlayed = myRole === 'emperor' ? ec.emperorPlayed : ec.slavePlayed;
    // 공개 페이즈에만 상대 카드 공개 (양쪽 모두 항상 뒷면 제출)
    var revealPhases = ['reveal', 'result', 'game-result'];
    var oppPlayed = revealPhases.indexOf(ec.phase) !== -1
      ? (myRole === 'emperor' ? ec.slavePlayed : ec.emperorPlayed)
      : null;

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
  return false;
}

// ===== Reveal Animation =====
var _ecRevealActive = false;

function ecardExchangeResult(view) {
  var empCard = view.myRole === 'emperor' ? view.myPlayed : view.oppPlayed;
  var slvCard = view.myRole === 'slave' ? view.myPlayed : view.oppPlayed;
  if (empCard === 'emperor' && slvCard === 'slave') {
    return view.myRole === 'slave' ? 'win' : 'lose';
  }
  return 'draw';
}

function ecardFillFlipFront(el, cardType) {
  if (!el) return;
  el.className = 'ec-flip-front ec-front-' + (cardType || 'citizen');
  el.innerHTML = '<div style="font-size:26px">' + ecardCardIcon(cardType) + '</div>' +
    '<div style="font-size:11px;font-weight:700">' + ecardCardName(cardType) + '</div>';
}

function ecardShowReveal(view) {
  var overlay = document.getElementById('ecardRevealOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  var oppInner = document.getElementById('ecardRevealOppInner');
  var myInner  = document.getElementById('ecardRevealMyInner');
  var oppFront = document.getElementById('ecardRevealOppFront');
  var myFront  = document.getElementById('ecardRevealMyFront');
  var resultEl = document.getElementById('ecardRevealResult');
  var oppSlot  = document.getElementById('ecardRevealOppSlot');
  var mySlot   = document.getElementById('ecardRevealMySlot');

  // Reset animation classes
  oppInner.classList.remove('flipped');
  myInner.classList.remove('flipped');
  oppSlot.classList.remove('ec-exit-up');
  mySlot.classList.remove('ec-exit-down');
  resultEl.className = 'ecard-reveal-result';
  resultEl.textContent = '';

  ecardFillFlipFront(oppFront, view.oppPlayed);
  ecardFillFlipFront(myFront, view.myPlayed);

  var result = ecardExchangeResult(view);

  // 700ms 후 양쪽 동시 뒤집기
  setTimeout(function() {
    if (!_ecRevealActive) return;
    oppInner.classList.add('flipped');
    myInner.classList.add('flipped');

    // 뒤집기 완료(600ms) 후 결과 뱃지
    setTimeout(function() {
      if (!_ecRevealActive) return;
      var labels = { win: 'WIN', lose: 'LOSE', draw: 'DRAW' };
      resultEl.textContent = labels[result] || result;
      resultEl.className = 'ecard-reveal-result ec-result-' + result;
      void resultEl.offsetHeight;
      resultEl.classList.add('ec-result-visible');

      if (result === 'draw') {
        // 1000ms DRAW 표시 후 카드 퇴장
        setTimeout(function() {
          if (!_ecRevealActive) return;
          oppSlot.classList.add('ec-exit-up');
          mySlot.classList.add('ec-exit-down');
          setTimeout(function() {
            if (_ecRevealActive) {
              _ecRevealActive = false;
              overlay.style.display = 'none';
              ecState.selectedCard = null;
            }
          }, 380);
        }, 1000);
      }
      // win/lose: host가 game-result 전환하면 renderECardView에서 오버레이 정리
    }, 600);
  }, 700);
}

function renderECardView(view) {
  if (!view) return;
  state._ecardView = view;

  var roundEl = document.getElementById('ecardRound');
  if (roundEl && roundEl.parentNode) {
    roundEl.parentNode.innerHTML =
      'G<span id="ecardRound">' + view.gameNum + '</span>/' + view.maxGames +
      ' E' + view.exchange + '/' + view.maxExchanges +
      ' · ' + view.currentBet + 'P';
  }

  document.getElementById('ecardScoreEmperor').textContent = String(view.score.p1 || 0);
  document.getElementById('ecardScoreSlave').textContent = String(view.score.p2 || 0);

  var roleIcon = view.myRole === 'emperor' ? '👑' : '⛓️';
  var roleName = view.myRole === 'emperor' ? '황제' : '노예';
  var roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';
  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  var oppIndex = state.players.findIndex(function(p) { return p.id === view.oppId; });
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[(oppIndex >= 0 ? oppIndex : 0) % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = String(view.oppCardsCount);

  // ===== 공개 오버레이 관리 =====
  var keepRevealPhases = ['reveal', 'result', 'game-result'];
  if (view.phase === 'reveal' && view.myPlayed && view.oppPlayed) {
    if (!_ecRevealActive) {
      _ecRevealActive = true;
      ecardShowReveal(view);
    }
  } else if (_ecRevealActive && keepRevealPhases.indexOf(view.phase) === -1) {
    _ecRevealActive = false;
    var _ov = document.getElementById('ecardRevealOverlay');
    if (_ov) _ov.style.display = 'none';
  }

  // ===== 플레이 상태 분석 =====
  var isPlayPhase = (view.phase === 'emperor-play' || view.phase === 'slave-play');
  var canPlay = ecardCanPlay(view);
  // 내가 선공으로 제출 완료, 상대 대기 중
  var isWaitingFirst = isPlayPhase && !canPlay && !!view.myPlayed;
  // 상대가 선공 제출 완료, 내 차례
  var isOppSubmittedFirst = isPlayPhase && canPlay && view.firstSubmittedRole !== null;

  // ===== 영역 표시 전환 =====
  var myCardsAreaEl = document.getElementById('ecardMyCardsArea');
  var oppSubmittedAreaEl = document.getElementById('ecardOppSubmittedArea');
  var submittedDisplayEl = document.getElementById('ecardSubmittedDisplay');
  if (myCardsAreaEl)      myCardsAreaEl.style.display      = isWaitingFirst ? 'none' : '';
  if (oppSubmittedAreaEl) oppSubmittedAreaEl.style.display  = isOppSubmittedFirst ? 'flex' : 'none';
  if (submittedDisplayEl) submittedDisplayEl.style.display  = isWaitingFirst ? 'flex' : 'none';

  // ===== 헤더 상대 제출 카드 표시 =====
  var oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if ((view.phase === 'reveal' || view.phase === 'result' || view.phase === 'game-result') && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else if (isOppSubmittedFirst) {
    oppPlayedEl.innerHTML = ecardCardHTML(null, true, 'ecard-card-opp-small');
  } else {
    oppPlayedEl.innerHTML = '';
  }

  // ===== 카드 렌더링 =====
  document.getElementById('ecardMyCardsCount').textContent = String((view.myCards || []).length);
  var myCardsEl = document.getElementById('ecardMyCards');
  var cards = view.myCards || [];

  if (ecState.selectedCard !== null && ecState.selectedCard < cards.length) {
    var selCard = cards[ecState.selectedCard];
    myCardsEl.innerHTML = '<div class="ecard-card ecard-card-' + selCard + ' selected"' +
      (canPlay ? ' onclick="ecardSelectCard(' + ecState.selectedCard + ')"' : '') + '>' +
      '<div class="ecard-card-icon">' + ecardCardIcon(selCard) + '</div>' +
      '<div class="ecard-card-name">' + ecardCardName(selCard) + '</div>' +
      '<div style="font-size:10px;opacity:0.6;margin-top:2px;">탭해서 취소</div>' +
      '</div>';
  } else {
    myCardsEl.innerHTML = cards.map(function(card, i) {
      return '<div class="ecard-card ecard-card-' + card + '"' +
        (canPlay ? ' onclick="ecardSelectCard(' + i + ')"' : '') +
        ' data-card-idx="' + i + '">' +
        '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
        '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
        '</div>';
    }).join('');
  }

  // ===== 상태 텍스트 =====
  var resultTextEl = document.getElementById('ecardResultText');
  if (view.phase === 'betting') {
    var setter = view.betSetterId === state.myId ? '내가' : (view.betSetterId === view.oppId ? view.oppName : '상대');
    resultTextEl.textContent = setter + ' 이번 판 배팅 금액 설정 중';
    resultTextEl.style.color = 'var(--text-dim)';
  } else if ((view.phase === 'result' || view.phase === 'game-result') && view._lastResult && view._lastResult.message) {
    resultTextEl.textContent = view._lastResult.message;
    resultTextEl.style.color = view._lastResult.myWin ? 'var(--gold)' : 'var(--text-dim)';
  } else {
    resultTextEl.textContent = '';
    resultTextEl.style.color = 'var(--gold)';
  }

  // ===== 하단 버튼 영역 =====
  var actionButtons = document.getElementById('ecardActionButtons');
  var waiting        = document.getElementById('ecardWaiting');
  var betArea        = document.getElementById('ecardBetArea');
  var betResponse    = document.getElementById('ecardBetResponse');
  var submitBtn      = document.getElementById('ecardSubmitBtn');
  var waitingText    = document.getElementById('ecardWaitingText');

  betArea.style.display    = 'none';
  betResponse.style.display = 'none';
  actionButtons.style.display = 'none';
  waiting.style.display    = 'none';

  if (view.phase === 'betting') {
    if (view.betSetterId === state.myId) {
      betArea.style.display = 'block';
      var slider    = document.getElementById('ecardBetSlider');
      var betAmount = document.getElementById('ecardBetAmount');
      if (slider)    slider.value = String(ecClampBet(view.currentBet));
      if (betAmount) betAmount.textContent = String(ecClampBet(view.currentBet));
    } else {
      waiting.style.display = 'flex';
      waitingText.textContent = '상대가 배팅 금액을 설정 중...';
    }
    return;
  }

  if (view.phase === 'emperor-play') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '뒷면으로 제출 (' + view.exchange + '/' + view.maxExchanges + ')';
      submitBtn.disabled = ecState.selectedCard === null;
    } else if (!isWaitingFirst) {
      // 상대가 아직 내기 전 (기다리는 중)
      waiting.style.display = 'flex';
      waitingText.textContent = '황제가 카드를 선택 중...';
    }
    return;
  }

  if (view.phase === 'slave-play') {
    if (view.myRole === 'slave') {
      actionButtons.style.display = 'flex';
      submitBtn.textContent = '뒷면으로 제출 (' + view.exchange + '/' + view.maxExchanges + ')';
      submitBtn.disabled = ecState.selectedCard === null;
    } else if (!isWaitingFirst) {
      waiting.style.display = 'flex';
      waitingText.textContent = '노예가 카드를 선택 중...';
    }
    return;
  }
}

function ecardSelectCard(idx) {
  var view = state._ecardView;
  if (!view) return;
  if (!ecardCanPlay(view)) return;
  // 같은 카드 탭하면 선택 취소
  ecState.selectedCard = ecState.selectedCard === idx ? null : idx;
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

function ecardSubmitCard() {
  if (ecState.selectedCard === null) {
    showToast('카드를 선택해 주세요');
    return;
  }

  var view = state._ecardView;
  if (!view || !ecardCanPlay(view)) return;
  if (ecState.selectedCard < 0 || ecState.selectedCard >= view.myCards.length) return;

  var cardType = view.myCards[ecState.selectedCard];
  var cardIdx = ecState.selectedCard;

  if (state.isHost) {
    processECardPlay(state.myId, cardType, cardIdx);
  } else {
    sendToHost({ type: 'ec-play', cardType: cardType, cardIdx: cardIdx });
  }

  ecState.selectedCard = null;
}

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

    if (ec.firstSubmittedRole === null) {
      // 황제가 선공 — 다음에 노예가 냄
      ec.firstSubmittedRole = 'emperor';
      ec.phase = 'slave-play';
      broadcastECardState();
    } else {
      // 황제가 후공 (노예가 이미 냄) — 공개
      ec.phase = 'reveal';
      broadcastECardState();
      setTimeout(function() { ecResolveExchange(); }, 2500);
    }
    return;
  }

  if (ec.phase === 'slave-play') {
    if (playerId !== ec.slavePlayerId) return;
    if (cardIdx >= ec.slaveCards.length) return;
    if (ec.slaveCards[cardIdx] !== cardType) return;

    ec.slavePlayed = cardType;
    ec.slaveCards.splice(cardIdx, 1);

    if (ec.firstSubmittedRole === null) {
      // 노예가 선공 — 다음에 황제가 냄
      ec.firstSubmittedRole = 'slave';
      ec.phase = 'emperor-play';
      broadcastECardState();
    } else {
      // 노예가 후공 (황제가 이미 냄) — 공개
      ec.phase = 'reveal';
      broadcastECardState();
      setTimeout(function() { ecResolveExchange(); }, 2500);
    }
  }
}

// 해당 교환 번호에서의 선공 페이즈 반환 (1, 3 홀수=황제 선공 / 2, 4 짝수=노예 선공)
function ecGetStartPhase(exchange) {
  return (exchange % 2 === 1) ? 'emperor-play' : 'slave-play';
}

function ecApplyGameWin(winnerRole, reasonText) {
  var ec = state.ecard;
  if (!ec) return;

  var winnerId = winnerRole === 'emperor' ? ec.emperorPlayerId : ec.slavePlayerId;
  var winner = ecGetPlayerById(winnerId);
  var scoreKey = ecGetScoreKeyById(winnerId);
  var gain = ecClampBet(ec.currentBet);
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

  // 노예가 황제 카드에 노예 카드로 맞춤 → 즉시 노예 승리
  if (empCard === 'emperor' && slvCard === 'slave') {
    ecApplyGameWin('slave', '노예가 황제를 잡음');
    return;
  }

  // 황제 회피(황제 카드 냈는데 노예가 시민 냄)는 즉시 승리 없음 — 계속 진행
  // 4교환 모두 마쳤는데 잡히지 않으면 황제 생존 승리
  if (ec.exchange >= ec.maxExchanges) {
    ecApplyGameWin('emperor', '황제 생존! 남은 카드 결과 발표');
    return;
  }

  ec._lastResult = {
    message: ec.exchange + '차 제출 완료 · 다음 제출 진행',
    myWin: false
  };
  ec.phase = 'result';
  broadcastECardState();

  setTimeout(function() {
    ec.exchange += 1;
    ec.emperorPlayed = null;
    ec.slavePlayed = null;
    ec.firstSubmittedRole = null;
    ec._lastResult = null;
    ec.phase = ecGetStartPhase(ec.exchange); // 홀수=황제선공, 짝수=노예선공
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
  var winnerId = null;
  var winnerName = '무승부';
  var message = '';

  if (p1Score > p2Score) {
    winnerId = ec.player1.id;
    winnerName = ec.player1.name;
    message = ec.player1.name + ' 승리! (' + p1Score + ':' + p2Score + ')';
  } else if (p2Score > p1Score) {
    winnerId = ec.player2.id;
    winnerName = ec.player2.name;
    message = ec.player2.name + ' 승리! (' + p1Score + ':' + p2Score + ')';
  } else {
    message = '무승부! (' + p1Score + ':' + p2Score + ')';
  }

  var result = {
    type: 'ec-result',
    winnerId: winnerId,
    winnerName: winnerName,
    message: message,
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
  document.getElementById('resultPot').textContent = '';
  document.getElementById('resultCards').innerHTML = '';
  document.getElementById('resultOverlay').classList.add('active');
}

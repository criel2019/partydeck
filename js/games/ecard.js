// ===== E CARD ENGINE (v2 — 12판 구조) =====
// 룰: 황제(1)+시민(4) vs 노예(1)+시민(4)
// 황제 먼저 제출 → 노예 제출 → 동시 공개
// 노예>황제, 황제>시민, 시민>노예 (순환)
// 한 판에 5교환, 황제와 노예가 만나면 노예 승, 안 만나면 황제 승

let ecState = {
  player1: { id: '', name: '', avatar: '' },
  player2: { id: '', name: '', avatar: '' },
  gameNum: 1,
  maxGames: 12,
  exchange: 1, // 현재 교환 번호 (1~5)
  emperorPlayerId: '',
  slavePlayerId: '',
  emperorCards: [],
  slaveCards: [],
  emperorPlayed: null,
  slavePlayed: null,
  phase: 'emperor-play', // emperor-play, slave-play, reveal, game-result, gameover
  score: { p1: 0, p2: 0 }, // 플레이어별 승수
  selectedCard: null,
  _lastResult: null,
};

function startECard() {
  if (state.players.length !== 2) {
    showToast('E카드는 정확히 2명만 플레이 가능합니다');
    return;
  }

  ecState = {
    player1: { id: state.players[0].id, name: state.players[0].name, avatar: state.players[0].avatar },
    player2: { id: state.players[1].id, name: state.players[1].name, avatar: state.players[1].avatar },
    gameNum: 1,
    maxGames: 12,
    exchange: 1,
    emperorPlayerId: state.players[0].id, // 첫 판: P1이 황제
    slavePlayerId: state.players[1].id,
    emperorCards: ['emperor', 'citizen', 'citizen', 'citizen', 'citizen'],
    slaveCards: ['slave', 'citizen', 'citizen', 'citizen', 'citizen'],
    emperorPlayed: null,
    slavePlayed: null,
    phase: 'emperor-play',
    score: { p1: 0, p2: 0 },
    selectedCard: null,
    _lastResult: null,
  };

  state.ecard = ecState;
  broadcastECardState();
  showScreen('ecardGame');
}

function ecardGetMyRole(view) {
  return view.myRole;
}

function broadcastECardState() {
  var ec = state.ecard;
  var p1 = ec.player1, p2 = ec.player2;

  [p1, p2].forEach(function(p) {
    var isEmperor = p.id === ec.emperorPlayerId;
    var opp = p === p1 ? p2 : p1;
    var myCards = isEmperor ? ec.emperorCards : ec.slaveCards;
    var oppCards = isEmperor ? ec.slaveCards : ec.emperorCards;
    var myPlayed = isEmperor ? ec.emperorPlayed : ec.slavePlayed;
    var oppPlayed = isEmperor ? ec.slavePlayed : ec.emperorPlayed;

    var view = {
      type: 'ec-state',
      myId: p.id,
      myRole: isEmperor ? 'emperor' : 'slave',
      myCards: myCards.slice(),
      myPlayed: myPlayed,
      myName: p.name,
      myAvatar: p.avatar,
      oppId: opp.id,
      oppName: opp.name,
      oppAvatar: opp.avatar,
      oppRole: isEmperor ? 'slave' : 'emperor',
      oppCardsCount: oppCards.length,
      oppPlayed: oppPlayed,
      gameNum: ec.gameNum,
      maxGames: ec.maxGames,
      exchange: ec.exchange,
      score: ec.score,
      phase: ec.phase,
      _lastResult: ec._lastResult,
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

  // 라운드 표시
  document.getElementById('ecardRound').textContent = view.gameNum;
  // maxRounds 표시 (5 → 12로 변경된 것을 HTML에도 반영)
  var roundEl = document.getElementById('ecardRound');
  if (roundEl && roundEl.parentNode) {
    roundEl.parentNode.innerHTML = 'G<span id="ecardRound">' + view.gameNum + '</span>/' + view.maxGames + ' E' + view.exchange;
  }

  document.getElementById('ecardScoreEmperor').textContent = view.score.p1;
  document.getElementById('ecardScoreSlave').textContent = view.score.p2;

  var roleIcon = view.myRole === 'emperor' ? '👑' : '⛓️';
  var roleName = view.myRole === 'emperor' ? '황제' : '노예';
  var roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';

  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  var oppIndex = state.players.findIndex(function(p) { return p.id === view.oppId; });
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[oppIndex % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = view.oppCardsCount;

  // 상대 낸 카드 표시 (심리전: 황제가 먼저 내면 노예에게 뒷면으로 표시)
  var oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if (view.phase === 'slave-play' && view.myRole === 'slave' && view.oppPlayed) {
    // 황제가 냈지만 아직 미공개 → 뒷면
    oppPlayedEl.innerHTML = ecardCardHTML(null, true, 'ecard-card-opp-small');
  } else if (view.phase === 'reveal' && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else {
    oppPlayedEl.innerHTML = '';
  }

  // 내 카드 표시
  document.getElementById('ecardMyCardsCount').textContent = view.myCards.length;
  var myCardsEl = document.getElementById('ecardMyCards');
  myCardsEl.innerHTML = view.myCards.map(function(card, i) {
    return '<div class="ecard-card ecard-card-' + card + ' ' + (ecState.selectedCard === i ? 'selected' : '') + '"' +
          ' onclick="ecardSelectCard(' + i + ')" data-card-idx="' + i + '">' +
      '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
      '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
    '</div>';
  }).join('');

  // 배틀 영역
  var battleArea = document.getElementById('ecardBattleArea');
  if (view.phase === 'reveal' && view.myPlayed && view.oppPlayed) {
    battleArea.style.display = 'flex';
    document.getElementById('ecardBattleOpp').innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-battle');
    document.getElementById('ecardBattleMy').innerHTML = ecardCardHTML(view.myPlayed, false, 'ecard-card-battle');
  } else {
    battleArea.style.display = 'none';
  }

  // 결과 텍스트
  var resultTextEl = document.getElementById('ecardResultText');
  if ((view.phase === 'result' || view.phase === 'game-result') && view._lastResult) {
    resultTextEl.textContent = view._lastResult.message;
    resultTextEl.style.color = view._lastResult.myWin ? 'var(--gold)' : 'var(--text-dim)';
  } else {
    resultTextEl.textContent = '';
  }

  // 액션 영역
  var actionButtons = document.getElementById('ecardActionButtons');
  var waiting = document.getElementById('ecardWaiting');
  var betArea = document.getElementById('ecardBetArea');
  var betResponse = document.getElementById('ecardBetResponse');

  betArea.style.display = 'none';
  betResponse.style.display = 'none';
  actionButtons.style.display = 'none';
  waiting.style.display = 'none';

  if (view.phase === 'emperor-play') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '황제가 카드를 선택 중...';
    }
  } else if (view.phase === 'slave-play') {
    if (view.myRole === 'slave') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '노예가 카드를 선택 중...';
    }
  } else if (view.phase === 'game-result' || view.phase === 'gameover') {
    // 결과 표시 중 — 아무 버튼 안 보임
  }
}

function ecardCardIcon(card) {
  var icons = { emperor: '👑', citizen: '🤵', slave: '⛓️' };
  return icons[card] || '?';
}

function ecardCardName(card) {
  var names = { emperor: '황제', citizen: '시민', slave: '노예' };
  return names[card] || '?';
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

function ecardSelectCard(idx) {
  var view = state._ecardView;
  if (!view) return;

  var canPlay = (view.phase === 'emperor-play' && view.myRole === 'emperor') ||
                (view.phase === 'slave-play' && view.myRole === 'slave');
  if (!canPlay) return;

  ecState.selectedCard = idx;
  renderECardView(view);
}

// 배팅 슬라이더 (기존 호환)
var betSlider = document.getElementById('ecardBetSlider');
if (betSlider) {
  betSlider.addEventListener('input', function(e) {
    document.getElementById('ecardBetAmount').textContent = e.target.value;
  });
}

function ecardSubmitBet() {} // 배팅 제거 — 빈 함수 유지
function ecardAcceptBet() {}
function ecardRejectBet() {}

function ecardSubmitCard() {
  if (ecState.selectedCard === null) {
    showToast('카드를 선택하세요');
    return;
  }

  var view = state._ecardView;
  var cardType = view.myCards[ecState.selectedCard];

  if (state.isHost) {
    processECardPlay(state.myId, cardType, ecState.selectedCard);
  } else {
    sendToHost({ type: 'ec-play', cardType: cardType, cardIdx: ecState.selectedCard });
  }

  ecState.selectedCard = null;
}

function processECardPlay(playerId, cardType, cardIdx) {
  if (!state.isHost) return;
  var ec = state.ecard;
  var validCards = ['emperor', 'citizen', 'slave'];
  if (validCards.indexOf(cardType) === -1) return;
  if (typeof cardIdx !== 'number' || cardIdx < 0) return;

  var isEmperor = playerId === ec.emperorPlayerId;

  if (ec.phase === 'emperor-play' && isEmperor) {
    if (cardIdx >= ec.emperorCards.length) return;
    ec.emperorPlayed = cardType;
    ec.emperorCards.splice(cardIdx, 1);
    ec.phase = 'slave-play';
    broadcastECardState();
  } else if (ec.phase === 'slave-play' && !isEmperor) {
    if (cardIdx >= ec.slaveCards.length) return;
    ec.slavePlayed = cardType;
    ec.slaveCards.splice(cardIdx, 1);
    ec.phase = 'reveal';
    broadcastECardState();
    setTimeout(function() { ecardRevealExchange(); }, 1500);
  }
}

function ecardRevealExchange() {
  if (!state.isHost) return;
  var ec = state.ecard;

  var empCard = ec.emperorPlayed;
  var slvCard = ec.slavePlayed;

  // 황제와 노예가 만났는지 체크
  var emperorMeetsSlave = (empCard === 'emperor' && slvCard === 'slave');
  var slaveMeetsEmperor = (empCard === 'slave' && slvCard === 'emperor'); // shouldn't happen but safety

  var exchangeResult = ecardJudge(empCard, slvCard);

  if (emperorMeetsSlave) {
    // 노예 승리! — 이 판 종료
    var slavePlayerKey = ec.slavePlayerId === ec.player1.id ? 'p1' : 'p2';
    ec.score[slavePlayerKey]++;

    var slaveName = ec.slavePlayerId === ec.player1.id ? ec.player1.name : ec.player2.name;
    ec._lastResult = { message: '노예 승리! ' + slaveName + ' +1점', winner: 'slave' };
    ec.phase = 'game-result';
    broadcastECardState();

    setTimeout(function() { ecardNextGame(); }, 2500);
    return;
  }

  // 마지막 교환이면 황제 승리
  if (ec.exchange >= 5) {
    var empPlayerKey = ec.emperorPlayerId === ec.player1.id ? 'p1' : 'p2';
    ec.score[empPlayerKey]++;

    var empName = ec.emperorPlayerId === ec.player1.id ? ec.player1.name : ec.player2.name;
    ec._lastResult = { message: '황제 승리! ' + empName + ' +1점 (노예 회피 성공)', winner: 'emperor' };
    ec.phase = 'game-result';
    broadcastECardState();

    setTimeout(function() { ecardNextGame(); }, 2500);
    return;
  }

  // 다음 교환
  var resultMsg = '';
  if (exchangeResult === 0) resultMsg = '무승부 (시민 vs 시민)';
  else if (exchangeResult === 1) resultMsg = '황제측 교환 승리';
  else resultMsg = '노예측 교환 승리';

  ec._lastResult = { message: resultMsg + ' — 교환 ' + ec.exchange + '/5', winner: null };
  ec.phase = 'result';
  broadcastECardState();

  setTimeout(function() {
    ec.exchange++;
    ec.emperorPlayed = null;
    ec.slavePlayed = null;
    ec._lastResult = null;
    ec.phase = 'emperor-play';
    broadcastECardState();
  }, 2000);
}

function ecardJudge(card1, card2) {
  if (card1 === 'citizen' && card2 === 'citizen') return 0;
  if (card1 === 'emperor' && card2 === 'citizen') return 1;
  if (card1 === 'citizen' && card2 === 'emperor') return -1;
  if (card1 === 'citizen' && card2 === 'slave') return 1;
  if (card1 === 'slave' && card2 === 'citizen') return -1;
  if (card1 === 'slave' && card2 === 'emperor') return 1;
  if (card1 === 'emperor' && card2 === 'slave') return -1;
  return 0;
}

function ecardNextGame() {
  if (!state.isHost) return;
  var ec = state.ecard;

  if (ec.gameNum >= ec.maxGames) {
    ecardGameOver();
    return;
  }

  ec.gameNum++;
  ec.exchange = 1;
  ec.emperorPlayed = null;
  ec.slavePlayed = null;
  ec._lastResult = null;

  // 역할 교대 (매 게임마다 교대)
  var temp = ec.emperorPlayerId;
  ec.emperorPlayerId = ec.slavePlayerId;
  ec.slavePlayerId = temp;

  // 새 카드 배분
  ec.emperorCards = ['emperor', 'citizen', 'citizen', 'citizen', 'citizen'];
  ec.slaveCards = ['slave', 'citizen', 'citizen', 'citizen', 'citizen'];

  ec.phase = 'emperor-play';
  broadcastECardState();
}

function ecardGameOver() {
  if (!state.isHost) return;
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
    score: { emperor: p1Score, slave: p2Score },
  };

  broadcast(result);
  handleECardResult(result);
}

function handleECardResult(msg) {
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

function processECardBet() {}
function processECardBetResponse() {}

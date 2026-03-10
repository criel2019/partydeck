// ===== 황제를 잡아라 ENGINE =====
// 12-game duel rules
// - Games 1~6: player A sets bet (A role alternates Emperor/Slave 3 times each)
// - Games 7~12: player B sets bet (B role alternates Emperor/Slave 3 times each)
// - Per game order: Emperor > Slave > Emperor > Slave > remaining-card result
// - If Emperor avoids Slave or gets caught by Slave, that game ends immediately

var EC_TOTAL_GAMES = 12;
var EC_MAX_EXCHANGES = 4;
var EC_DEFAULT_BET = 100;
var EC_BET_MIN = 10;
var EC_BET_MAX = 500;
var EC_SLAVE_MULTIPLIER = 5; // 노예 승리 시 황제가 지불하는 배수

var ecState = {
  player1: { id: '', name: '', avatar: '' },
  player2: { id: '', name: '', avatar: '' },
  firstPlayerId: '',   // 주사위 높은 쪽 (첫 선공)
  diceRoll: null,      // { p1: number, p2: number }
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
  // dice-roll | betting | emperor-play | slave-play | reveal | result | game-result | gameover
  phase: 'dice-roll',
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
  var ec = ecState;
  ec.gameNum = gameNum;
  ec.exchange = 1;
  ec.maxExchanges = EC_MAX_EXCHANGES;
  ec.emperorPlayed = null;
  ec.slavePlayed = null;
  ec.firstSubmittedRole = null;
  ec.selectedCard = null;
  ec._lastResult = null;

  // firstPlayerId = 주사위 선공 플레이어
  var firstId  = ec.firstPlayerId || ec.player1.id;
  var secondId = firstId === ec.player1.id ? ec.player2.id : ec.player1.id;

  // 황제/노예: 홀수 판 → firstPlayer 황제, 짝수 판 → firstPlayer 노예
  var firstIsEmperor = (gameNum % 2 === 1);
  ec.emperorPlayerId = firstIsEmperor ? firstId : secondId;
  ec.slavePlayerId   = firstIsEmperor ? secondId : firstId;

  // 베팅 설정자: 2판 단위로 교대 (1-2:first, 3-4:second, 5-6:first, ...)
  var betGroup = Math.floor((gameNum - 1) / 2) % 2;
  ec.betSetterId = betGroup === 0 ? firstId : secondId;

  ec.emperorCards = ecCreateRoleCards('emperor');
  ec.slaveCards   = ecCreateRoleCards('slave');
  ec.phase = 'betting';
}

// ===== 3D 주사위 로드 & 오버레이 =====
var _ecDiceThreeLoaded = false;
var _ecDiceThreeQueue = [];

function ecLoadDiceThree(cb) {
  if (_ecDiceThreeLoaded && typeof idolDiceThreeRoll === 'function') { cb(); return; }
  _ecDiceThreeQueue.push(cb);
  if (_ecDiceThreeQueue.length > 1) return; // 이미 로딩 중
  var done = function() {
    _ecDiceThreeLoaded = true;
    var q = _ecDiceThreeQueue.splice(0);
    q.forEach(function(fn) { try { fn(); } catch(e) {} });
  };
  var loadScript = function() {
    if (typeof idolDiceThreeRoll === 'function') {
      var canvas = document.getElementById('ecardDiceCanvas');
      if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);
      done(); return;
    }
    var s = document.createElement('script');
    s.src = 'js/idol-dice-three.js';
    s.onload = function() {
      var canvas = document.getElementById('ecardDiceCanvas');
      if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);
      done();
    };
    s.onerror = done;
    document.head.appendChild(s);
  };
  if (typeof THREE !== 'undefined') { loadScript(); return; }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = loadScript;
  s1.onerror = done;
  document.head.appendChild(s1);
}

var _ecDiceAnimPlayed = false;

function ecShowDiceOverlay(d1, d2, firstIsMe, oppName) {
  var overlay = document.getElementById('ecardDiceOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  var badge = document.getElementById('ecardDiceResultMsg');
  if (badge) { badge.textContent = ''; badge.className = 'ecard-dice-result-badge'; }

  ecLoadDiceThree(function() {
    var canvas = document.getElementById('ecardDiceCanvas');
    if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);
    if (typeof idolDiceThreeRoll === 'function') {
      idolDiceThreeRoll(d1, d2, function() {
        if (badge) {
          var EMOJIS = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
          var who = firstIsMe ? '내가 선공 👑' : (escapeHTML(oppName) + '이 선공');
          badge.innerHTML = EMOJIS[d1] + ' ' + d1 + '  vs  ' + d2 + ' ' + EMOJIS[d2] + '<br>' + who;
          badge.className = 'ecard-dice-result-badge visible' + (firstIsMe ? ' winner' : '');
        }
      });
    }
  });
}

// 게임 시작 시 주사위 굴리기 (host only)
function ecRollStartingDice() {
  var ec = state.ecard;
  if (!ec || !state.isHost) return;

  var d1, d2;
  do {
    d1 = Math.floor(Math.random() * 6) + 1;
    d2 = Math.floor(Math.random() * 6) + 1;
  } while (d1 === d2);

  ec.diceRoll = { p1: d1, p2: d2 };
  ec.firstPlayerId = d1 > d2 ? ec.player1.id : ec.player2.id;
  broadcastECardState();

  // 2.5초 후 첫 번째 판 세팅
  setTimeout(function() {
    if (!state.ecard) return;
    ecPrepareGame(1);
    broadcastECardState();
  }, 2500);
}

function startECard() {
  if (state.players.length !== 2) {
    showToast('형사와 강도는 정확히 2명만 플레이 가능합니다');
    return;
  }

  ecState = {
    player1: { id: state.players[0].id, name: state.players[0].name, avatar: state.players[0].avatar },
    player2: { id: state.players[1].id, name: state.players[1].name, avatar: state.players[1].avatar },
    firstPlayerId: '',
    diceRoll: null,
    gameNum: 0,
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
    phase: 'dice-roll',
    score: { p1: 0, p2: 0 },
    selectedCard: null,
    _lastResult: null
  };

  state.ecard = ecState;
  showScreen('ecardGame');
  broadcastECardState();
  // host가 주사위 굴림
  if (state.isHost) ecRollStartingDice();
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
      firstPlayerId: ec.firstPlayerId,
      myDice:  ec.diceRoll ? (player.id === ec.player1.id ? ec.diceRoll.p1 : ec.diceRoll.p2) : null,
      oppDice: ec.diceRoll ? (player.id === ec.player1.id ? ec.diceRoll.p2 : ec.diceRoll.p1) : null,
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
  var names = { emperor: '강도', citizen: '시민', slave: '형사' };
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
  // 노예 > 황제
  if (empCard === 'emperor' && slvCard === 'slave') {
    return view.myRole === 'slave' ? 'win' : 'lose';
  }
  // 황제 > 시민
  if (empCard === 'emperor' && slvCard === 'citizen') {
    return view.myRole === 'emperor' ? 'win' : 'lose';
  }
  // 시민 > 노예 (시민을 낸 황제 플레이어 승)
  if (empCard === 'citizen' && slvCard === 'slave') {
    return view.myRole === 'emperor' ? 'win' : 'lose';
  }
  // 시민 vs 시민 → 무승부(계속)
  return 'draw';
}

function ecardFillFlipFront(el, cardType) {
  if (!el) return;
  el.className = 'ec-flip-front ec-front-' + (cardType || 'citizen');
  el.innerHTML = '<div style="font-size:26px">' + ecardCardIcon(cardType) + '</div>' +
    '<div style="font-size:11px;font-weight:700">' + ecardCardName(cardType) + '</div>';
}

function ecardShowReveal(view) {
  var revealArea = document.getElementById('ecardRevealArea');
  var resultEl   = document.getElementById('ecardRevealResult');
  if (!revealArea) return;

  var oppInner = document.getElementById('ecardRevealOppInner');
  var myInner  = document.getElementById('ecardRevealMyInner');
  var oppFront = document.getElementById('ecardRevealOppFront');
  var myFront  = document.getElementById('ecardRevealMyFront');
  var oppSlot  = document.getElementById('ecardRevealOppSlot');
  var mySlot   = document.getElementById('ecardRevealMySlot');

  // Reset
  oppInner.classList.remove('flipped');
  myInner.classList.remove('flipped');
  oppSlot.classList.remove('ec-exit-up');
  mySlot.classList.remove('ec-exit-down');
  if (resultEl) { resultEl.className = 'ecard-reveal-result'; resultEl.textContent = ''; }

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
      if (resultEl) {
        resultEl.textContent = labels[result] || result;
        resultEl.className = 'ecard-reveal-result ec-result-' + result;
        void resultEl.offsetHeight;
        resultEl.classList.add('ec-result-visible');
      }

      if (result === 'draw') {
        // 1000ms DRAW 표시 후 카드 퇴장
        setTimeout(function() {
          if (!_ecRevealActive) return;
          oppSlot.classList.add('ec-exit-up');
          mySlot.classList.add('ec-exit-down');
          setTimeout(function() {
            if (_ecRevealActive) {
              _ecRevealActive = false;
              revealArea.style.display = 'none';
              if (resultEl) { resultEl.className = 'ecard-reveal-result'; resultEl.textContent = ''; }
              ecState.selectedCard = null;
            }
          }, 380);
        }, 1000);
      }
      // win/lose: host가 game-result 전환하면 renderECardView에서 정리
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
  var roleName = view.myRole === 'emperor' ? '강도' : '형사';
  var roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';
  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  var oppIndex = state.players.findIndex(function(p) { return p.id === view.oppId; });
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[(oppIndex >= 0 ? oppIndex : 0) % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = String(view.oppCardsCount);

  // ===== 플레이 상태 분석 =====
  var isPlayPhase = (view.phase === 'emperor-play' || view.phase === 'slave-play');
  var canPlay = ecardCanPlay(view);
  // 내가 선공으로 제출 완료, 상대 대기 중
  var isWaitingFirst = isPlayPhase && !canPlay && !!view.myPlayed;

  // ===== Reveal 영역 관리 =====
  var revealAreaEl   = document.getElementById('ecardRevealArea');
  var revealResultEl = document.getElementById('ecardRevealResult');
  if (view.phase === 'reveal' && view.myPlayed && view.oppPlayed) {
    if (!_ecRevealActive) {
      _ecRevealActive = true;
      if (revealAreaEl) revealAreaEl.style.display = 'flex';
      ecardShowReveal(view);
    }
  } else if (_ecRevealActive && ['emperor-play', 'slave-play', 'betting'].indexOf(view.phase) !== -1) {
    // 새 교환 시작 — 정리
    _ecRevealActive = false;
    if (revealAreaEl) revealAreaEl.style.display = 'none';
    if (revealResultEl) { revealResultEl.className = 'ecard-reveal-result'; revealResultEl.textContent = ''; }
  }
  // result / game-result 중에는 reveal 영역 그대로 유지

  // ===== 영역 표시 전환 =====
  var myCardsAreaEl    = document.getElementById('ecardMyCardsArea');
  var submittedDisplayEl = document.getElementById('ecardSubmittedDisplay');
  // 내가 선공 대기 중: 큰 카드 표시, 패 숨김
  // reveal 중에는 패 보여줌 (인라인이므로 아래에 그대로)
  if (!_ecRevealActive) {
    if (myCardsAreaEl)      myCardsAreaEl.style.display      = isWaitingFirst ? 'none' : '';
    if (submittedDisplayEl) submittedDisplayEl.style.display = isWaitingFirst ? 'flex' : 'none';
  } else {
    // reveal 중: 선공 대기 숨김, 패 보임
    if (submittedDisplayEl) submittedDisplayEl.style.display = 'none';
    if (myCardsAreaEl)      myCardsAreaEl.style.display      = '';
  }

  // ===== 헤더 상대 제출 카드 표시 =====
  var oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if ((view.phase === 'reveal' || view.phase === 'result' || view.phase === 'game-result') && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else if (isPlayPhase && view.firstSubmittedRole !== null && !view.myPlayed) {
    // 상대가 먼저 제출한 경우 — 헤더에 뒷면 표시
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

  if (view.phase === 'dice-roll') {
    if (view.myDice !== null && !_ecDiceAnimPlayed) {
      _ecDiceAnimPlayed = true;
      var firstIsMe = view.firstPlayerId === view.myId;
      ecShowDiceOverlay(view.myDice, view.oppDice, firstIsMe, view.oppName);
    }
    return;
  }
  // dice-roll 벗어나면 오버레이 닫기
  var diceOverlay = document.getElementById('ecardDiceOverlay');
  if (diceOverlay) diceOverlay.style.display = 'none';
  _ecDiceAnimPlayed = false;

  if (view.phase === 'betting') {
    if (view.betSetterId === state.myId) {
      betArea.style.display = 'block';
      var slider    = document.getElementById('ecardBetSlider');
      var betAmount = document.getElementById('ecardBetAmount');
      if (slider)    slider.value = String(ecClampBet(view.currentBet));
      if (betAmount) betAmount.textContent = String(ecClampBet(view.currentBet));
      var betRoleHint = document.getElementById('ecardBetRoleHint');
      if (betRoleHint) {
        // 내가 노예이고 내가 베팅 설정자일 때만 5× 적용
        var iAmSlave = view.myRole === 'slave';
        var iAmSetter = view.betSetterId === view.myId;
        if (iAmSlave && iAmSetter) {
          betRoleHint.textContent = '형사 베팅 · 이기면 ×' + EC_SLAVE_MULTIPLIER + ' 획득 / 지면 베팅액만 잃음';
        } else if (!iAmSlave && iAmSetter) {
          betRoleHint.textContent = '강도 베팅 · 양쪽 동일 리스크 (×1)';
        } else if (iAmSlave) {
          betRoleHint.textContent = '강도가 베팅 설정 중 · 양쪽 동일 리스크';
        } else {
          betRoleHint.textContent = '';
        }
      }
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
      waitingText.textContent = '강도가 카드를 선택 중...';
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
      waitingText.textContent = '형사가 카드를 선택 중...';
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
  var loserId  = winnerRole === 'emperor' ? ec.slavePlayerId  : ec.emperorPlayerId;
  var winner   = ecGetPlayerById(winnerId);
  var baseBet  = ecClampBet(ec.currentBet);
  // 노예가 베팅 설정자이고 노예가 이긴 경우에만 5× 적용
  // 그 외(황제 설정 or 노예 설정+황제 승)는 1× 동일 리스크
  var slaveSetterSlaveWin = (ec.betSetterId === ec.slavePlayerId && winnerRole === 'slave');
  var multiplier = slaveSetterSlaveWin ? EC_SLAVE_MULTIPLIER : 1;
  var gain = baseBet * multiplier;
  var loss = baseBet * multiplier;

  ec.score[ecGetScoreKeyById(winnerId)] += gain;
  ec.score[ecGetScoreKeyById(loserId)]  -= loss;

  var myWin = winnerId === state.myId;
  ec._lastResult = {
    message: (winner ? winner.name : '플레이어') + ' 승리! ' +
      (myWin ? '+' : '-') + gain + 'P (' + reasonText + ')',
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

  // 형사(slave) VS 강도(emperor): 형사가 강도를 잡음 → 형사 Win
  if (empCard === 'emperor' && slvCard === 'slave') {
    ecApplyGameWin('slave', '형사가 강도를 잡았습니다. 형사 Win');
    return;
  }
  // 강도(emperor) VS 시민: 무고한 시민을 잡음 → 강도 Win (형사 패배)
  if (empCard === 'emperor' && slvCard === 'citizen') {
    ecApplyGameWin('emperor', '무고한 시민을 잡았습니다.. 강도Win');
    return;
  }
  // 시민 VS 형사(slave): 시민이 강도에게 금품갈취 → 강도 Win (황제 승)
  if (empCard === 'citizen' && slvCard === 'slave') {
    ecApplyGameWin('emperor', '시민이 강도에게 금품갈취 당했습니다. 강도Win');
    return;
  }
  // 시민 vs 시민 → 다음 교환으로
  // 4교환 모두 마쳤는데 잡히지 않으면 황제 생존 승리
  if (ec.exchange >= ec.maxExchanges) {
    ecApplyGameWin('emperor', '강도가 도주에 성공했습니다! 강도 Win');
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

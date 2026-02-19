// ===== SUTDA ENGINE =====

// --- 화투패 정의 ---
const HWATU_DECK = [];
(function buildHwatuDeck() {
  for (let i = 1; i <= 10; i++) {
    const isGwangMonth = [1, 3, 8].includes(i);
    // 광 또는 첫번째 패
    HWATU_DECK.push({ num: i, gwang: isGwangMonth, id: i + 'g' });
    // 비광 또는 두번째 패
    HWATU_DECK.push({ num: i, gwang: false, id: i + 'n' });
  }
})();

// 광 이름
const GWANG_NAMES = { 1: '송학', 3: '사쿠라', 8: '공산' };

// --- 호스트 상태 ---
let sutdaHost = null;

// --- 클라이언트 뷰 ---
let sutdaView = null;

// =========================
// 족보 판정 함수 (핵심!)
// =========================
function getSutdaRank(card1, card2) {
  const n1 = card1.num, n2 = card2.num;
  const g1 = card1.gwang, g2 = card2.gwang;

  // === 광땡 체크 (최상위) ===
  // 38광땡: 3광 + 8광
  if ((n1 === 3 && g1 && n2 === 8 && g2) || (n1 === 8 && g1 && n2 === 3 && g2)) {
    return { rank: 100, name: '38광땡', tier: 'gwangttaeng' };
  }
  // 18광땡: 1광 + 8광
  if ((n1 === 1 && g1 && n2 === 8 && g2) || (n1 === 8 && g1 && n2 === 1 && g2)) {
    return { rank: 99, name: '18광땡', tier: 'gwangttaeng' };
  }
  // 13광땡: 1광 + 3광
  if ((n1 === 1 && g1 && n2 === 3 && g2) || (n1 === 3 && g1 && n2 === 1 && g2)) {
    return { rank: 98, name: '13광땡', tier: 'gwangttaeng' };
  }

  // === 땡 (같은 숫자 2장) ===
  if (n1 === n2) {
    // 장땡(10땡)은 최상위 (광땡보다 위)
    if (n1 === 10) return { rank: 101, name: '장땡', tier: 'ttaeng' };
    const ttRank = 80 + n1; // 1땡=81, ... 9땡=89
    return { rank: ttRank, name: n1 + '땡', tier: 'ttaeng' };
  }

  // === 특수패 체크 ===
  // 암행어사 (4+7): 13광땡, 18광땡만 잡음
  if ((n1 === 4 && n2 === 7) || (n1 === 7 && n2 === 4)) {
    return { rank: 75, name: '암행어사', tier: 'special', special: '47' };
  }
  // 땡잡이 (3+7): 모든 땡을 잡음, 일반패에겐 짐
  if ((n1 === 3 && n2 === 7) || (n1 === 7 && n2 === 3)) {
    return { rank: 74, name: '땡잡이', tier: 'special', special: '37' };
  }
  // 세륙 (6+4): 특수 기능
  if ((n1 === 6 && n2 === 4) || (n1 === 4 && n2 === 6)) {
    return { rank: 73, name: '세륙', tier: 'special', special: '64' };
  }

  // === 끗 (두 수의 합의 일의 자리) ===
  const kkut = (n1 + n2) % 10;
  const mult = n1 * n2; // 같은 끗일 때 곱으로 비교

  if (kkut === 9) {
    return { rank: 60, name: '갑오', tier: 'kkut', kkut: 9, mult: mult };
  }
  if (kkut === 0) {
    return { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: mult };
  }
  // 1끗~8끗
  return { rank: 50 + kkut, name: kkut + '끗', tier: 'kkut', kkut: kkut, mult: mult };
}

// =========================
// 대결 판정 함수
// =========================
function sutdaCompare(r1, r2) {
  // === 1순위: 땡잡이(37) - 모든 땡을 잡음 (장땡 포함), 일반패에겐 짐 ===
  if (r1.special === '37' && r2.tier === 'ttaeng') return 1;
  if (r2.special === '37' && r1.tier === 'ttaeng') return -1;
  if (r1.special === '37' && r2.tier !== 'ttaeng') {
    const r1asKkut = { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: 21 };
    return sutdaCompare(r1asKkut, r2);
  }
  if (r2.special === '37' && r1.tier !== 'ttaeng') {
    const r2asKkut = { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: 21 };
    return sutdaCompare(r1, r2asKkut);
  }

  // === 2순위: 암행어사(47) - 13광땡(98), 18광땡(99)만 잡음 ===
  if (r1.special === '47' && (r2.rank === 99 || r2.rank === 98)) return 1;
  if (r2.special === '47' && (r1.rank === 99 || r1.rank === 98)) return -1;
  if (r1.special === '47') {
    const r1asKkut = { rank: 51, name: '1끗', tier: 'kkut', kkut: 1, mult: 28 };
    return sutdaCompare(r1asKkut, r2);
  }
  if (r2.special === '47') {
    const r2asKkut = { rank: 51, name: '1끗', tier: 'kkut', kkut: 1, mult: 28 };
    return sutdaCompare(r1, r2asKkut);
  }

  // === 3순위: 같은 끗일 때 곱으로 비교 (무승부 없음) ===
  if (r1.rank === r2.rank && r1.tier === 'kkut' && r2.tier === 'kkut') {
    if (r1.mult !== r2.mult) return r1.mult > r2.mult ? 1 : -1;
    return 0;
  }

  // === 일반 rank 비교: 장땡(101) > 38광땡(100) > 18광땡(99) > 13광땡(98) > 9땡~1땡 > ... ===
  return r1.rank > r2.rank ? 1 : r1.rank < r2.rank ? -1 : 0;
}

// =========================
// 화투패 HTML 렌더링
// =========================
var _sutdaCardsHidden = false;
function hwatuCardHTML(card, big) {
  if (!card) {
    const cls = big ? 'hwatu-card hwatu-card-big back' : 'hwatu-card back';
    return '<div class="' + cls + '"></div>';
  }
  if (big && _sutdaCardsHidden) {
    return '<div class="hwatu-card hwatu-card-big back" onclick="sutdaToggleCards()" style="cursor:pointer;"></div>';
  }
  const sizeClass = big ? 'hwatu-card hwatu-card-big' : 'hwatu-card';
  const typeClass = card.gwang ? 'gwang' : 'normal';
  const monthClass = 'm' + card.num;
  const gwangText = card.gwang ? '<span class="hwatu-gwang-text">' + (GWANG_NAMES[card.num] || '광') + '</span>' : '';
  const monthLabel = card.num + '월';
  const clickAttr = big ? ' onclick="sutdaToggleCards()" style="cursor:pointer;"' : '';
  return '<div class="' + sizeClass + ' ' + typeClass + ' ' + monthClass + '"' + clickAttr + '>' +
    '<span class="hwatu-num">' + card.num + '</span>' +
    '<span class="hwatu-month">' + monthLabel + '</span>' +
    gwangText +
    '</div>';
}
function sutdaToggleCards() {
  _sutdaCardsHidden = !_sutdaCardsHidden;
  if(sutdaView) renderSutdaView(sutdaView);
}

// =========================
// 덱 셔플
// =========================
function shuffleHwatu() {
  const deck = HWATU_DECK.map(c => ({ num: c.num, gwang: c.gwang, id: c.id }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// =========================
// 게임 시작 (호스트)
// =========================
function startSutda() {
  if (!state.isHost) return;
  if (state.players.length < 2 || state.players.length > 6) {
    showToast('섯다는 2~6인 플레이입니다');
    return;
  }

  const deck = shuffleHwatu();
  let deckIdx = 0;

  const prevHost = sutdaHost;
  const n = state.players.length;

  sutdaHost = {
    deck: deck,
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: [deck[deckIdx++], deck[deckIdx++]],
      chips: prevHost ? (prevHost.players.find(pp => pp.id === p.id)?.chips ?? 500000) : 500000,
      bet: 0,
      totalBet: 0,
      died: false,
      allIn: false,
      seatIdx: i,
      acted: false,
      rank: null,
      seryukChoice: null, // 'push' or 'chaos' or null
    })),
    pot: 0,
    currentBet: 0,
    phase: 'betting', // betting, seryuk_choice, showdown
    turnIdx: 0,
    dealerIdx: prevHost ? (prevHost.dealerIdx + 1) % n : 0,
    baseBet: 10000, // 기본 판돈
    roundNum: prevHost ? (prevHost.roundNum || 0) + 1 : 1,
    bettingRound: 0,
    lastRaiser: -1,
    seryukPlayerId: null,
    seryukCanChaos: false,
  };

  // 기본 판돈 차감
  sutdaHost.players.forEach(p => {
    const ante = Math.min(sutdaHost.baseBet, p.chips);
    p.chips -= ante;
    p.totalBet += ante;
    sutdaHost.pot += ante;
  });

  // 족보 계산
  sutdaHost.players.forEach(p => {
    p.rank = getSutdaRank(p.cards[0], p.cards[1]);
  });

  // 세륙 체크 - 세륙을 가진 플레이어가 있는지
  const seryukPlayer = sutdaHost.players.find(p => p.rank.special === '64');
  if (seryukPlayer) {
    // 세륙 플레이어가 있으면, 나중에 콜을 먼저 받았을 때 선택
    sutdaHost.seryukPlayerId = seryukPlayer.id;
    // 9땡 이하인 상대가 있어야 깽판 가능
    const others = sutdaHost.players.filter(p => p.id !== seryukPlayer.id);
    sutdaHost.seryukCanChaos = others.some(p => p.rank.rank <= 89);
  }

  // 딜러 다음 사람부터 시작
  sutdaHost.turnIdx = (sutdaHost.dealerIdx + 1) % n;
  // 턴 플레이어 찾기
  sutdaHost.turnIdx = findNextSutdaActive(sutdaHost, sutdaHost.turnIdx);

  broadcastSutdaState();

  // 호스트 자신도 게임 화면 표시
  showScreen('sutdaGame');

  // 다른 플레이어에게 game-start 전송
  state.players.forEach(p => {
    if (p.id !== state.myId) {
      sendTo(p.id, {
        type: 'game-start',
        game: 'sutda',
        state: buildSutdaView(p.id),
      });
    }
  });
}

// =========================
// 다음 활성 플레이어 찾기
// =========================
function findNextSutdaActive(gs, from) {
  let idx = from;
  for (let i = 0; i < gs.players.length; i++) {
    const p = gs.players[idx];
    if (!p.died && !p.allIn) return idx;
    idx = (idx + 1) % gs.players.length;
  }
  return from;
}

// =========================
// 뷰 빌드 (각 플레이어별)
// =========================
function buildSutdaView(forPlayerId) {
  const gs = sutdaHost;
  const isShowdown = gs.phase === 'showdown';

  return {
    type: 'sutda-state',
    players: gs.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      bet: p.bet,
      totalBet: p.totalBet,
      died: p.died,
      allIn: p.allIn,
      seatIdx: p.seatIdx,
      // 자기 패만 보임, showdown이면 전원 공개 (죽은 사람도)
      cards: (p.id === forPlayerId || isShowdown) ? p.cards : null,
      rank: (p.id === forPlayerId || isShowdown) ? p.rank : null,
      seryukChoice: p.seryukChoice,
    })),
    pot: gs.pot,
    currentBet: gs.currentBet,
    phase: gs.phase,
    turnIdx: gs.turnIdx,
    dealerIdx: gs.dealerIdx,
    roundNum: gs.roundNum,
    baseBet: gs.baseBet,
    seryukPlayerId: gs.seryukPlayerId,
    seryukCanChaos: gs.seryukCanChaos,
  };
}

// =========================
// 상태 브로드캐스트
// =========================
function broadcastSutdaState() {
  const gs = sutdaHost;
  gs.players.forEach(p => {
    const view = buildSutdaView(p.id);
    if (p.id === state.myId) {
      sutdaView = view;
      renderSutdaView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

// =========================
// 뷰 렌더링 (클라이언트)
// =========================
function renderSutdaView(vs) {
  sutdaView = vs;
  showScreen('sutdaGame');

  const me = vs.players.find(p => p.id === state.myId);
  const isMyTurn = vs.players[vs.turnIdx]?.id === state.myId && vs.phase === 'betting' && !me?.died;

  // 상단
  document.getElementById('sutdaPotBadge').textContent = formatChips(vs.pot);
  document.getElementById('sutdaMyBalance').textContent = formatChips(me?.chips || 0);

  // 판돈
  document.getElementById('sutdaPotAmount').textContent = formatChips(vs.pot);

  // 턴 표시
  const turnPlayer = vs.players[vs.turnIdx];
  if (vs.phase === 'betting' && turnPlayer && !turnPlayer.died) {
    document.getElementById('sutdaTurnIndicator').textContent =
      turnPlayer.id === state.myId ? '내 차례' : turnPlayer.name + '의 차례';
  } else if (vs.phase === 'seryuk_choice') {
    document.getElementById('sutdaTurnIndicator').textContent = '세륙 선택 중...';
  } else if (vs.phase === 'showdown') {
    document.getElementById('sutdaTurnIndicator').textContent = '결과 공개!';
  } else {
    document.getElementById('sutdaTurnIndicator').textContent = '';
  }

  // 상대방
  const oppArea = document.getElementById('sutdaOpponents');
  const ops = vs.players.filter(p => p.id !== state.myId);
  oppArea.innerHTML = ops.map(p => {
    const isTurn = vs.players[vs.turnIdx]?.id === p.id && vs.phase === 'betting';
    const pIdx = vs.players.findIndex(pp => pp.id === p.id);
    let statusText = '';
    let statusClass = 'waiting';
    if (p.died) { statusText = '다이'; statusClass = 'die'; }
    else if (p.allIn) { statusText = '올인'; statusClass = 'bet'; }
    else if (p.bet > 0) { statusText = formatChips(p.bet); statusClass = 'bet'; }

    const cardsHTML = p.cards
      ? p.cards.map(c => hwatuCardHTML(c, false)).join('')
      : hwatuCardHTML(null, false) + hwatuCardHTML(null, false);

    return '<div class="sutda-opp-slot' + (p.died ? ' died' : '') + '">' +
      '<div class="sutda-opp-avatar' + (isTurn ? ' active-turn' : '') + '" style="background:' + PLAYER_COLORS[pIdx % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
      '<div class="sutda-opp-name">' + escapeHTML(p.name) + '</div>' +
      '<div class="sutda-opp-chips">' + formatChips(p.chips) + '</div>' +
      '<div class="sutda-opp-status ' + statusClass + '">' + statusText + '</div>' +
      '<div class="sutda-opp-cards">' + cardsHTML + '</div>' +
      (p.rank && vs.phase === 'showdown' ? '<div style="font-size:11px;color:#ff1744;font-weight:700;margin-top:2px;">' + p.rank.name + '</div>' : '') +
      '</div>';
  }).join('');

  // 내 패
  const myCardsEl = document.getElementById('sutdaMyCards');
  if (me?.cards) {
    myCardsEl.innerHTML = me.cards.map(c => hwatuCardHTML(c, true)).join('');
  } else {
    myCardsEl.innerHTML = hwatuCardHTML(null, true) + hwatuCardHTML(null, true);
  }

  // 내 칩
  document.getElementById('sutdaMyChips').textContent = formatChips(me?.chips || 0);
  document.getElementById('sutdaMyName').textContent = me?.name || '나';

  // 족보 표시
  const rankEl = document.getElementById('sutdaMyRank');
  if (me?.rank) {
    rankEl.textContent = me.rank.name;
  } else {
    rankEl.textContent = '';
  }

  // 세륙 패널
  const seryukPanel = document.getElementById('sutdaSeryukPanel');
  if (vs.phase === 'seryuk_choice' && vs.seryukPlayerId === state.myId) {
    seryukPanel.style.display = 'flex';
  } else {
    seryukPanel.style.display = 'none';
  }

  // 배팅 버튼
  const actionBar = document.getElementById('sutdaActionBar');
  const allBtns = actionBar.querySelectorAll('.sutda-bet-btn');

  if (isMyTurn && vs.phase === 'betting') {
    allBtns.forEach(b => b.disabled = false);

    // 콜 금액 계산
    const toCall = vs.currentBet - (me?.bet || 0);
    const callBtn = document.getElementById('sutdaBtnCall');
    if (toCall > 0) {
      callBtn.textContent = '콜 ' + formatChips(toCall);
    } else {
      callBtn.textContent = '콜';
    }

    // 칩이 부족하면 레이즈 비활성화
    if (me && me.chips <= 0) {
      document.getElementById('sutdaBtn10k').disabled = true;
      document.getElementById('sutdaBtn50k').disabled = true;
      document.getElementById('sutdaBtn100k').disabled = true;
    }
    if (me && me.chips < 10000) document.getElementById('sutdaBtn10k').disabled = true;
    if (me && me.chips < 50000) document.getElementById('sutdaBtn50k').disabled = true;
    if (me && me.chips < 100000) document.getElementById('sutdaBtn100k').disabled = true;
  } else {
    allBtns.forEach(b => b.disabled = true);
  }
}

// =========================
// 칩 포맷
// =========================
function formatChips(n) {
  if (n >= 10000) {
    const man = Math.floor(n / 10000);
    const rest = n % 10000;
    if (rest === 0) return man + '만';
    return man + '만' + rest.toLocaleString();
  }
  return n.toLocaleString();
}

// =========================
// 배팅 액션 (클라이언트)
// =========================
function sutdaBet(action, amount) {
  if (state.isHost) {
    processSutdaAction(state.myId, action, amount);
  } else {
    sendToHost({ type: 'sutda-bet', action, amount });
  }
}

// =========================
// 세륙 선택 (클라이언트)
// =========================
function sutdaSeryukChoice(choice) {
  document.getElementById('sutdaSeryukPanel').style.display = 'none';
  if (state.isHost) {
    processSutdaSeryuk(state.myId, choice);
  } else {
    sendToHost({ type: 'sutda-seryuk', choice });
  }
}

// =========================
// 배팅 처리 (호스트)
// =========================
function processSutdaAction(playerId, action, amount) {
  const gs = sutdaHost;
  if (!gs || gs.phase !== 'betting') return;

  const pIdx = gs.players.findIndex(p => p.id === playerId);
  if (pIdx !== gs.turnIdx) return;

  const player = gs.players[pIdx];
  if (player.died || player.allIn) return;

  const toCall = gs.currentBet - player.bet;

  switch (action) {
    case 'die':
      player.died = true;
      break;

    case 'call': {
      const a = Math.min(toCall, player.chips);
      player.chips -= a;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      if (player.chips === 0) player.allIn = true;
      break;
    }

    case 'raise': {
      // 먼저 콜 금액 + 추가 레이즈
      const raiseTotal = toCall + (amount || 10000);
      const a = Math.min(raiseTotal, player.chips);
      player.chips -= a;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      if (player.bet > gs.currentBet) {
        gs.currentBet = player.bet;
        gs.lastRaiser = pIdx;
      }
      if (player.chips === 0) player.allIn = true;
      // 다른 사람들 acted 리셋
      gs.players.forEach((p, i) => {
        if (i !== pIdx && !p.died && !p.allIn) p.acted = false;
      });
      break;
    }

    case 'allin': {
      const a = player.chips;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      player.chips = 0;
      player.allIn = true;
      if (player.bet > gs.currentBet) {
        gs.currentBet = player.bet;
        gs.lastRaiser = pIdx;
        gs.players.forEach((p, i) => {
          if (i !== pIdx && !p.died && !p.allIn) p.acted = false;
        });
      }
      break;
    }
  }

  player.acted = true;

  // 살아있는 플레이어 수 체크
  const alive = gs.players.filter(p => !p.died);
  if (alive.length === 1) {
    // 혼자 남으면 즉시 승리
    endSutdaRound(alive[0]);
    return;
  }

  // 세륙 체크: 세륙 플레이어가 살아있고, 콜을 받았을 때 (첫 번째 배팅 라운드 종료 시)
  // 세륙 선택은 모든 사람이 한 번씩 배팅을 마친 후 트리거
  const canAct = gs.players.filter(p => !p.died && !p.allIn);
  const allActed = canAct.every(p => p.acted && p.bet >= gs.currentBet);

  if (canAct.length === 0 || allActed) {
    // 세륙 플레이어가 있고, 아직 선택을 안 했으면
    const seryukP = gs.players.find(p => p.id === gs.seryukPlayerId && !p.died);
    if (seryukP && seryukP.seryukChoice === null && gs.phase === 'betting') {
      gs.phase = 'seryuk_choice';
      broadcastSutdaState();
      return;
    }

    // 쇼다운
    resolveSutdaShowdown();
    return;
  }

  // 다음 턴
  gs.turnIdx = findNextSutdaActive(gs, (gs.turnIdx + 1) % gs.players.length);
  broadcastSutdaState();
}

// =========================
// 세륙 처리 (호스트)
// =========================
function processSutdaSeryuk(playerId, choice) {
  const gs = sutdaHost;
  if (!gs || gs.phase !== 'seryuk_choice') return;
  if (playerId !== gs.seryukPlayerId) return;

  const seryukP = gs.players.find(p => p.id === playerId);
  if (!seryukP) return;

  seryukP.seryukChoice = choice;

  if (choice === 'push') {
    // 밀기: 숫자 10으로써 기능 → 10%10=0끗=망통
    seryukP.rank = { rank: 50, name: '세륙밀기(망통)', tier: 'kkut', kkut: 0, mult: 24, special: null };
    gs.phase = 'betting';
    // 배팅 계속 (추가 라운드 없이 바로 showdown)
    resolveSutdaShowdown();
  } else if (choice === 'chaos') {
    // 깽판: 9땡 이하인 경우만 가능
    // 살아있는 유저 전원 패 재분배
    const alive = gs.players.filter(p => !p.died);
    // 9땡 이상이면 깽판 불가 (38광땡, 18광땡, 13광땡, 장땡)
    const hasHighHand = alive.some(p => p.id !== playerId && p.rank.rank >= 90);
    if (hasHighHand) {
      // 깽판 실패 - 밀기로 강제 전환 (망통)
      seryukP.rank = { rank: 50, name: '세륙밀기(망통)', tier: 'kkut', kkut: 0, mult: 24, special: null };
      showToast('상대에게 장땡 이상이 있어 깽판 실패!');
    } else {
      // 패 재분배
      const newDeck = shuffleHwatu();
      let newIdx = 0;
      alive.forEach(p => {
        p.cards = [newDeck[newIdx++], newDeck[newIdx++]];
        p.rank = getSutdaRank(p.cards[0], p.cards[1]);
        p.seryukChoice = null;
      });
      // 세륙 상태 리셋
      gs.seryukPlayerId = null;
      // 새로운 패에서 세륙이 또 나올 수 있음
      const newSeryuk = alive.find(p => p.rank.special === '64');
      if (newSeryuk) {
        gs.seryukPlayerId = newSeryuk.id;
        gs.seryukCanChaos = alive.some(p => p.id !== newSeryuk.id && p.rank.rank <= 89);
        // 다시 세륙 선택
        gs.phase = 'seryuk_choice';
        broadcastSutdaState();
        return;
      }
    }
    gs.phase = 'betting';
    resolveSutdaShowdown();
  }
}

// =========================
// 쇼다운 (결과 판정)
// =========================
function resolveSutdaShowdown() {
  const gs = sutdaHost;
  gs.phase = 'showdown';

  const alive = gs.players.filter(p => !p.died);

  if (alive.length === 0) return;
  if (alive.length === 1) {
    endSutdaRound(alive[0]);
    return;
  }

  // 가장 강한 패 찾기
  let bestPlayer = alive[0];
  for (let i = 1; i < alive.length; i++) {
    const cmp = sutdaCompare(alive[i].rank, bestPlayer.rank);
    if (cmp > 0) bestPlayer = alive[i];
  }

  endSutdaRound(bestPlayer);
}

// =========================
// 라운드 종료
// =========================
function endSutdaRound(winner) {
  const gs = sutdaHost;
  winner.chips += gs.pot;
  gs.phase = 'showdown';

  // 먼저 showdown 뷰를 브로드캐스트
  broadcastSutdaState();

  // 패 공개 순서: 콜을 받는 사람(lastRaiser)이 먼저, 나머지 후에
  const alive = gs.players.filter(p => !p.died);
  const revealOrder = [];
  if (gs.lastRaiser !== undefined && gs.lastRaiser !== null) {
    const firstReveal = gs.players[gs.lastRaiser];
    if (firstReveal && !firstReveal.died) revealOrder.push(firstReveal.id);
  }
  alive.forEach(p => { if (!revealOrder.includes(p.id)) revealOrder.push(p.id); });

  const result = {
    type: 'sutda-result',
    winnerId: winner.id,
    winnerName: winner.name,
    winnerAvatar: winner.avatar,
    winnerCards: winner.cards,
    winnerRank: winner.rank,
    pot: gs.pot,
    revealOrder: revealOrder,
    allHands: gs.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: p.cards,
      rank: p.rank,
      died: p.died,
      seatIdx: p.seatIdx,
    })),
  };

  setTimeout(() => {
    broadcast(result);
    handleSutdaResult(result);
  }, 1200);
}

// =========================
// 결과 표시 (클라이언트)
// =========================
function handleSutdaResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won, won ? Math.min(Math.floor(msg.pot / 1000), 200) : 5);

  const overlay = document.getElementById('sutdaResultOverlay');
  document.getElementById('sutdaResultTitle').textContent = won ? '승리!' : '패배...';
  document.getElementById('sutdaResultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('sutdaResultWinner').textContent = msg.winnerName + ' ' + msg.winnerAvatar;
  document.getElementById('sutdaResultRank').textContent = msg.winnerRank ? msg.winnerRank.name : '';
  document.getElementById('sutdaResultCards').innerHTML = msg.winnerCards
    ? msg.winnerCards.map(c => hwatuCardHTML(c, true)).join('')
    : '';
  document.getElementById('sutdaResultPot').textContent = formatChips(msg.pot);

  // 전체 결과 표시 (순차 공개: 콜 받은 사람 먼저)
  const allEl = document.getElementById('sutdaResultAllHands');
  allEl.innerHTML = '';

  const order = msg.revealOrder || msg.allHands.map(h => h.id);
  const sortedHands = [];
  order.forEach(id => {
    const h = msg.allHands.find(x => x.id === id);
    if (h) sortedHands.push(h);
  });
  msg.allHands.forEach(h => { if (!sortedHands.includes(h)) sortedHands.push(h); });

  sortedHands.forEach((h, idx) => {
    const isWinner = h.id === msg.winnerId;
    const isDied = h.died;
    const rowClass = 'sutda-result-hand-row' + (isWinner ? ' winner-row' : '') + (isDied ? ' died-row' : '');
    const pIdx = h.seatIdx;
    const rowHTML = '<div class="' + rowClass + '" style="opacity:0;animation:sutdaReveal 0.4s ease ' + (idx * 0.6) + 's forwards;">' +
      '<div class="sutda-result-hand-avatar" style="background:' + PLAYER_COLORS[pIdx % PLAYER_COLORS.length] + ';">' + h.avatar + '</div>' +
      '<div class="sutda-result-hand-name">' + escapeHTML(h.name) + (isWinner ? ' (승)' : '') + (isDied ? ' (다이)' : '') + (idx === 0 && !isDied ? ' (선공개)' : '') + '</div>' +
      '<div class="sutda-result-hand-rank">' + (h.rank ? h.rank.name : '-') + '</div>' +
      '<div class="sutda-result-hand-cards">' + (h.cards ? h.cards.map(c => hwatuCardHTML(c, false)).join('') : '') + '</div>' +
      '</div>';
    allEl.innerHTML += rowHTML;
  });

  overlay.classList.add('active');
}

// =========================
// 결과 닫기
// =========================
function closeSutdaResult() {
  document.getElementById('sutdaResultOverlay').classList.remove('active');
  if (state.isHost) {
    // 다음 라운드 시작
    setTimeout(() => startSutda(), 500);
  }
}



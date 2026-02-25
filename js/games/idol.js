// ===== 팟플 아이돌 매니지먼트 — 메인 게임 엔진 =====

// ─── 게임 상태 ────────────────────────────────
let idolState = null;

const IDOL_TOTAL_TURNS = 25;
const IDOL_START_MONEY = 2000;
const IDOL_SALARY     = 400;  // 출발 통과 월급

// 플레이어 초기 생성
function idolCreatePlayer(p, idolTypeId, idolName) {
  const type = IDOL_TYPES.find(t => t.id === idolTypeId) ?? IDOL_TYPES[3];
  return {
    id: p.id, name: p.name, avatar: p.avatar,
    idolType: idolTypeId, idolName: idolName || type.name,
    money:    IDOL_START_MONEY,
    fame:     0,
    talent:   type.bonus.talent,
    looks:    type.bonus.looks,
    favor:    0,   // 비공개
    pos:      0,
    jailTurns: 0,
    bankrupt:  false,
    skipTrainCount: 0,
    ownedShops: [],  // shopId[]
    shopLevels: {},  // { shopId: 0-3 }
    consecutiveDoubles: 0,
    lastFavorDir: null,  // 'up'|'down' (다른 플레이어에게는 안 보임)
  };
}

// ─── 게임 시작 ────────────────────────────────
function startIdolManagement() {
  if (!state.isHost) return;

  // 선택 화면으로 이동 (각 플레이어가 아이돌 선택)
  showScreen('idolGame');
  idolShowSelectPhase();
}

// 호스트가 초기 게임 생성 (모든 플레이어 선택 완료 후)
function idolInitGame(selections) {
  // selections: [{ playerId, idolTypeId, idolName }]
  const players = state.players.map(p => {
    const sel = selections.find(s => s.playerId === p.id);
    return idolCreatePlayer(p, sel?.idolTypeId ?? 'ai', sel?.idolName);
  });

  // 순서 결정 (랜덤 셔플)
  const order = players.map(p => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  idolState = {
    phase: 'playing',
    turnNum: 1,
    currentIdx: 0,
    order,
    players,
    shopOwners: {},    // { shopId: playerId }
    shopLevels: {},    // { shopId: 0-3 }
    pendingAction: null,
  };

  broadcastIdolState();
  idolRenderAll();
}

// ─── 브로드캐스트 ─────────────────────────────
function broadcastIdolState() {
  if (!state.isHost) return;
  const publicState = idolGetPublicState();
  broadcast({ type: 'idol-state', state: publicState });
}

function idolGetPublicState() {
  if (!idolState) return null;
  return {
    ...idolState,
    players: idolState.players.map(p => ({
      ...p,
      favor: undefined,       // 호감도 숨김
      lastFavorDir: undefined,
    })),
    _myFavor: idolState.players.find(p => p.id === state.myId)?.favor,
    _myFavorDir: idolState.players.find(p => p.id === state.myId)?.lastFavorDir,
  };
}

// ─── 현재 플레이어 ────────────────────────────
function idolCurrentPlayer() {
  if (!idolState) return null;
  const id = idolState.order[idolState.currentIdx];
  return idolState.players.find(p => p.id === id);
}

function idolIsMyTurn() {
  return idolCurrentPlayer()?.id === state.myId;
}

// ─── 주사위 굴리기 ────────────────────────────
function idolRollDice() {
  if (!state.isHost || !idolIsMyTurn()) return;

  const p = idolCurrentPlayer();
  if (p.bankrupt) { idolAdvanceTurn(); return; }

  // 경찰서 수감 처리
  if (p.jailTurns > 0) {
    p.jailTurns--;
    idolShowJailPop(p);
    return;
  }

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const isDouble = d1 === d2;

  if (isDouble) {
    p.consecutiveDoubles++;
    if (p.consecutiveDoubles >= 3) {
      p.consecutiveDoubles = 0;
      p.jailTurns = 1;
      idolState.pendingAction = { type: 'goto-jail', dice: [d1, d2] };
      broadcastIdolState();
      idolRenderAll();
      return;
    }
  } else {
    p.consecutiveDoubles = 0;
  }

  idolState.pendingAction = { type: 'rolling', dice: [d1, d2], isDouble };
  broadcastIdolState();
  idolRenderAll();

  // 이동 처리
  setTimeout(() => idolMovePlayer(p, d1 + d2, isDouble), 600);
}

// ─── 플레이어 이동 ────────────────────────────
function idolMovePlayer(p, steps, isDouble) {
  const oldPos = p.pos;
  const newPos = (p.pos + steps) % BOARD_CELLS.length;

  // 출발 칸 통과 → 월급 (출발 칸에 도착하는 경우는 processCell에서 처리)
  if (newPos < oldPos && newPos !== 0) {
    p.money += IDOL_SALARY;
    idolShowFavorToast(p.id, null, `출발 통과! 월급 +${IDOL_SALARY}만`);
  }

  p.pos = newPos;
  idolState.pendingAction = { type: 'landed', dice: idolState.pendingAction?.dice, pos: newPos, isDouble };
  broadcastIdolState();
  idolRenderAll();

  setTimeout(() => idolProcessCell(p, newPos, isDouble), 400);
}

// ─── 칸 처리 ──────────────────────────────────
function idolProcessCell(p, pos, isDouble) {
  const cell = BOARD_CELLS[pos];
  if (!cell) return;

  switch (cell.type) {
    case 'start':
      p.money += IDOL_SALARY;
      idolShowCellResult(p, `🏁 출발! 월급 +${IDOL_SALARY}만원`);
      idolState.pendingAction = { type: 'turn-end-auto' };
      break;
    case 'police':
      p.jailTurns = 1;
      idolShowCellResult(p, '🚓 경찰서! 1턴 수감');
      idolState.pendingAction = { type: 'turn-end-auto' };
      break;
    case 'free':
      idolShowCellResult(p, '🅿️ 무료 주차! 편히 쉬어가세요');
      idolState.pendingAction = { type: 'turn-end-auto' };
      break;
    case 'stage':
      idolState.pendingAction = { type: 'gacha', playerId: p.id };
      break;
    case 'tax':
      p.money -= cell.amount;
      if (p.money < 0) p.money = 0;
      idolShowCellResult(p, `💸 세금 ${cell.amount}만원 납부`);
      idolCheckBankruptcy(p);
      idolState.pendingAction = { type: 'turn-end-auto' };
      break;
    case 'event':
      idolDrawEventCard(p);
      return;
    case 'gacha':
      idolState.pendingAction = { type: 'gacha', playerId: p.id };
      break;
    case 'chance':
      idolDrawChanceCard(p);
      return;
    case 'shop':
      idolHandleShop(p, cell.shopId);
      return;
  }

  broadcastIdolState();
  idolRenderAll();

  if (idolState.pendingAction?.type === 'turn-end-auto') {
    setTimeout(() => idolOnTurnEnd(isDouble), 800);
  }
}

// ─── 샵 처리 ──────────────────────────────────
function idolHandleShop(p, shopId) {
  const shop = SHOPS.find(s => s.id === shopId);
  const ownerId = idolState.shopOwners[shopId];

  if (!ownerId) {
    // 미분양 → 구매 여부 팝업
    idolState.pendingAction = { type: 'shop-buy', shopId, playerId: p.id };
  } else if (ownerId === p.id) {
    // 내 샵 → 업그레이드 팝업
    idolState.pendingAction = { type: 'shop-upgrade', shopId, playerId: p.id };
  } else {
    // 타인 샵 → 수수료 자동 납부
    const owner = idolState.players.find(pl => pl.id === ownerId);
    const level = idolState.shopLevels[shopId] ?? 0;
    let rent = shop.rent[level];

    // 배우형: 미디어 샵 수수료 감면
    if (p.idolType === 'jun' && shop.cat === 'media') rent = Math.floor(rent * 0.7);

    p.money -= rent;
    if (owner) owner.money += rent;
    if (p.money < 0) p.money = 0;
    idolCheckBankruptcy(p);

    idolShowCellResult(p, `💰 ${shop.name} 수수료 ${rent}만원`);

    // 훈련 여부 팝업 (수수료 낸 후)
    idolState.pendingAction = { type: 'shop-train-other', shopId, playerId: p.id };
  }

  broadcastIdolState();
  idolRenderAll();
}

// ─── 샵 구매 ──────────────────────────────────
function idolBuyShop(shopId) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const shop = SHOPS.find(s => s.id === shopId);
  if (!p || !shop) return;

  if (p.money < shop.price) { showToast('돈이 부족합니다'); return; }

  p.money -= shop.price;
  p.ownedShops.push(shopId);
  idolState.shopOwners[shopId] = p.id;
  idolState.shopLevels[shopId] = 0;

  // 뷰티 카테고리 독점 확인
  idolCheckBeautyMonopoly(p);

  idolState.pendingAction = { type: 'shop-train-self', shopId, playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
}

function idolPassShop() {
  if (!state.isHost) return;
  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 400);
}

// ─── 샵 업그레이드 ────────────────────────────
function idolUpgradeShop(shopId) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const level = idolState.shopLevels[shopId] ?? 0;
  if (level >= 3) { idolPassShop(); return; }

  const cost = SHOP_UPGRADE_COST[level];
  if (p.money < cost) { idolPassShop(); return; }

  p.money -= cost;
  idolState.shopLevels[shopId] = level + 1;

  idolState.pendingAction = { type: 'shop-train-self', shopId, playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
}

// ─── 샵 훈련 ──────────────────────────────────
function idolTrainAtShop(shopId, isOwned) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const shop = SHOPS.find(s => s.id === shopId);
  if (!p || !shop) return;

  const die = Math.floor(Math.random() * 6) + 1;
  let gain = die <= 2 ? 1 : die <= 4 ? 2 : 3;

  if (isOwned) gain += 1;  // 전속 샵 보너스
  else         gain = Math.max(0, gain - 1);  // 타인 샵 패널티

  // 아이돌 타입 시너지
  const cat = shop.cat;
  if ((p.idolType === 'luna' && cat === 'music') ||
      (p.idolType === 'bibi' && (cat === 'beauty' || cat === 'media')) ||
      (p.idolType === 'ai')) {
    gain += 1;
  }

  const stat = shop.trainStat;
  if (stat === 'talent') p.talent += gain;
  else if (stat === 'looks') {
    const oldStage = getIdolStage(p.looks).stage;
    p.looks += gain;
    const newStage = getIdolStage(p.looks).stage;
    if (newStage > oldStage) idolShowEvolution(p, newStage);
  } else if (stat === 'fame') {
    p.fame += gain;
  }

  p.skipTrainCount = 0;

  idolState.pendingAction = {
    type: 'train-result',
    die, gain, stat, playerId: p.id,
  };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 1200);
}

function idolSkipTrain() {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  p.skipTrainCount++;

  // 3연속 훈련 스킵 → 호감도 하락
  if (p.skipTrainCount >= 3) {
    p.favor -= 2;
    p.skipTrainCount = 0;
    p.lastFavorDir = 'down';
    idolShowFavorToast(p.id, 'down', null);
  }

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 300);
}

// ─── 이벤트 카드 ──────────────────────────────
function idolDrawEventCard(p) {
  const isLast = idolGetRank(p.id) === idolState.players.filter(x => !x.bankrupt).length;
  const isFirst = idolGetRank(p.id) === 1;

  // 역전 보정
  let card;
  const r = Math.random();
  if (isLast && r < 0.40) {
    card = { ...REVERSAL_CARDS[Math.floor(Math.random() * REVERSAL_CARDS.length)], type: 'reversal' };
  } else if (isFirst && r < 0.30) {
    const scandals = EVENT_CARDS.filter(c => c.type === 'scandal');
    card = scandals[Math.floor(Math.random() * scandals.length)];
  } else {
    card = EVENT_CARDS[Math.floor(Math.random() * EVENT_CARDS.length)];
  }

  idolState.pendingAction = { type: 'event-card', card, playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
}

function idolChooseEvent(cardId, choiceIdx) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const action = idolState.pendingAction;
  if (!action || action.type !== 'event-card') return;

  const card = action.card;

  if (card.type === 'reversal') {
    // 역전 카드 직접 효과
    idolApplyEffect(p, card.effect);
    idolShowFavorToast(p.id, 'up', `⚡ 역전 카드! +${card.effect.fame} 인기도`);
  } else {
    const choice = card.choices[choiceIdx];
    if (!choice) return;
    const effect = typeof choice.effect === 'function' ? choice.effect(p, idolState) : choice.effect;
    idolApplyEffect(p, effect);
    if (choice.allPlayers) {
      idolState.players.forEach(pl => idolApplyEffect(pl, choice.allPlayers));
    }
  }

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 600);
}

// ─── 가챠 ─────────────────────────────────────
function idolDoGacha() {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const result = rollGacha();

  idolApplyGachaReward(p, result.reward);

  if (result.grade === 'legend') {
    p.favor += 2;
    p.lastFavorDir = 'up';
  }

  idolState.pendingAction = { type: 'gacha-result', result, playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), result.grade === 'legend' ? 2500 : 1500);
}

function idolApplyGachaReward(p, reward) {
  if (!reward) return;
  if (reward.type === 'fame')  p.fame += reward.value;
  else if (reward.type === 'money') p.money += reward.value;
  else if (reward.type === 'stat') {
    if (reward.stat === 'talent') p.talent += reward.value;
    if (reward.stat === 'looks') {
      const oldStage = getIdolStage(p.looks).stage;
      p.looks += reward.value;
      const newStage = getIdolStage(p.looks).stage;
      if (newStage > oldStage) idolShowEvolution(p, newStage);
    }
    if (reward.stat2) p[reward.stat2] = (p[reward.stat2] || 0) + reward.value;
  }
}

// ─── 찬스 카드 ────────────────────────────────
function idolDrawChanceCard(p) {
  const card = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
  idolState.pendingAction = { type: 'chance-card', card, playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
}

function idolApplyChance(cardId, targetId) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const action = idolState.pendingAction;
  if (!action || action.type !== 'chance-card') return;

  const card = CHANCE_CARDS.find(c => c.id === cardId);
  if (!card) return;

  if (card.effect.target && targetId) {
    const target = idolState.players.find(pl => pl.id === targetId);
    if (target) idolApplyEffect(target, card.effect);
  } else {
    idolApplyEffect(p, card.effect);
  }

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 600);
}

// ─── 효과 적용 헬퍼 ───────────────────────────
function idolApplyEffect(p, effect) {
  if (!effect) return;
  if (effect.money !== undefined)  p.money  = Math.max(0, p.money + effect.money);
  if (effect.fame !== undefined)   p.fame   = Math.max(0, p.fame  + effect.fame);
  if (effect.talent !== undefined) p.talent = Math.max(0, p.talent + effect.talent);
  if (effect.looks !== undefined) {
    const oldStage = getIdolStage(p.looks).stage;
    p.looks = Math.max(0, p.looks + effect.looks);
    const newStage = getIdolStage(p.looks).stage;
    if (newStage > oldStage) idolShowEvolution(p, newStage);
  }
  if (effect.favor !== undefined) {
    p.favor = Math.max(0, p.favor + effect.favor);
    p.lastFavorDir = effect.favor > 0 ? 'up' : 'down';
    idolShowFavorToast(p.id, p.lastFavorDir, null);
  }
  idolCheckBankruptcy(p);
}

// ─── 5턴 결산 ─────────────────────────────────
function idolRunSettlement() {
  const bonuses = idolState.players.map(p => {
    if (p.bankrupt) return { playerId: p.id, bonus: 0 };
    const ownedShopObjs = p.ownedShops.map(id => SHOPS.find(s => s.id === id));
    const bonus = calcSettlementBonus(p.talent, p.looks, ownedShopObjs);
    p.fame += bonus;

    // 호감도 보너스: 스탯 일정 이상이면 상승
    if (p.talent + p.looks >= 10) {
      p.favor += 2;
      p.lastFavorDir = 'up';
    }
    return { playerId: p.id, bonus };
  });

  idolState.pendingAction = { type: 'settlement', bonuses, turn: idolState.turnNum };
  broadcastIdolState();
  idolRenderAll();
}

// ─── 파산 체크 ────────────────────────────────
function idolCheckBankruptcy(p) {
  if (p.bankrupt) return;
  if (p.money > 0) return;

  // 팔 수 있는 샵이 있으면 유예
  if (p.ownedShops.length > 0) return;

  // 진짜 파산
  p.bankrupt = true;
  p.ownedShops.forEach(shopId => {
    delete idolState.shopOwners[shopId];
    delete idolState.shopLevels[shopId];
  });
  p.ownedShops = [];

  idolState.pendingAction = { type: 'bankrupt', playerId: p.id };
  broadcastIdolState();
  idolRenderAll();
}

// ─── 샵 매각 (파산 방지용) ────────────────────
function idolSellShop(shopId) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  if (!p || !p.ownedShops.includes(shopId)) return;

  const shop = SHOPS.find(s => s.id === shopId);
  const level = idolState.shopLevels[shopId] ?? 0;
  const sellPrice = Math.floor(shop.price * 0.5) + level * 150;

  p.money += sellPrice;
  p.ownedShops = p.ownedShops.filter(id => id !== shopId);
  delete idolState.shopOwners[shopId];
  delete idolState.shopLevels[shopId];

  broadcastIdolState();
  idolRenderAll();
}

// ─── 뷰티 독점 체크 ──────────────────────────
function idolCheckBeautyMonopoly(p) {
  const beautyShops = SHOPS.filter(s => s.cat === 'beauty').map(s => s.id);
  const owned = beautyShops.filter(id => p.ownedShops.includes(id));
  if (owned.length >= 3) {
    p.looks += 3;
    p.favor += 1;
    p.lastFavorDir = 'up';
    const oldStage = getIdolStage(p.looks - 3).stage;
    const newStage = getIdolStage(p.looks).stage;
    if (newStage > oldStage) idolShowEvolution(p, newStage);
  }
}

// ─── 턴 종료 ──────────────────────────────────
function idolOnTurnEnd(isDouble) {
  if (!idolState) return;

  // 더블이면 한 번 더
  if (isDouble) {
    idolState.pendingAction = { type: 'roll-again' };
    broadcastIdolState();
    idolRenderAll();
    return;
  }

  // 5턴 결산 체크
  if (idolState.turnNum % 5 === 0) {
    idolRunSettlement();
    setTimeout(() => {
      idolAdvanceTurn();
    }, 3500);
    return;
  }

  idolAdvanceTurn();
}

function idolAdvanceTurn() {
  if (!idolState) return;

  // 다음 활성 플레이어
  const activePlayers = idolState.order.filter(id => {
    const p = idolState.players.find(pl => pl.id === id);
    return p && !p.bankrupt;
  });

  if (activePlayers.length <= 1) {
    idolEndGame();
    return;
  }

  // 현재 인덱스 이후 다음 활성 플레이어 찾기
  let nextIdx = (idolState.currentIdx + 1) % idolState.order.length;
  let tries = 0;
  while (tries < idolState.order.length) {
    const nextId = idolState.order[nextIdx];
    const nextP = idolState.players.find(p => p.id === nextId);
    if (nextP && !nextP.bankrupt) break;
    nextIdx = (nextIdx + 1) % idolState.order.length;
    tries++;
  }

  // 한 바퀴 돌았으면 turnNum 증가
  if (nextIdx <= idolState.currentIdx) {
    idolState.turnNum++;
  }
  idolState.currentIdx = nextIdx;

  if (idolState.turnNum > IDOL_TOTAL_TURNS) {
    idolEndGame();
    return;
  }

  idolState.pendingAction = { type: 'waiting-roll' };
  broadcastIdolState();
  idolRenderAll();
}

// ─── 게임 종료 ────────────────────────────────
function idolEndGame() {
  if (!idolState) return;

  // 인기도 순위 정렬
  const ranked = [...idolState.players]
    .filter(p => !p.bankrupt)
    .sort((a, b) => b.fame - a.fame);

  idolState.phase = 'ending';
  idolState.ranked = ranked;
  idolState.pendingAction = { type: 'ending' };

  broadcastIdolState();
  idolRenderAll();
}

// ─── 순위 계산 ────────────────────────────────
function idolGetRank(playerId) {
  const active = idolState.players
    .filter(p => !p.bankrupt)
    .sort((a, b) => b.fame - a.fame);
  const idx = active.findIndex(p => p.id === playerId);
  return idx >= 0 ? idx + 1 : active.length + 1;
}

// ─── 렌더링 진입점 ────────────────────────────
function renderIdolView(gs) {
  if (gs) idolState = gs;  // 비호스트: 서버 상태 수신
  showScreen('idolGame');
  idolRenderAll();
}

function idolRenderAll() {
  if (!idolState) return;
  // 선택 화면 인라인 스타일 초기화
  const panel = document.getElementById('idolActionPanel');
  if (panel) { panel.style.flex = ''; panel.style.overflowY = ''; panel.style.maxHeight = ''; }
  idolRenderHeader();
  idolRenderResourceBar();
  idolRenderBoard();
  idolRenderActionPanel();
}

// ─── 헤더 렌더 ────────────────────────────────
function idolRenderHeader() {
  const el = document.getElementById('idolTurnBadge');
  if (el) el.textContent = `${idolState.turnNum} / ${IDOL_TOTAL_TURNS}턴`;
}

// ─── 자원 바 렌더 ─────────────────────────────
function idolRenderResourceBar() {
  const me = idolState.players.find(p => p.id === state.myId);
  if (!me) return;

  const bar = document.getElementById('idolResourceBar');
  if (!bar) return;

  bar.innerHTML = `
    <div class="idol-res-item res-money">
      <span class="idol-res-icon">💰</span>
      <span class="idol-res-label">돈</span>
      <span class="idol-res-value">${me.money.toLocaleString()}</span>
    </div>
    <div class="idol-res-item res-fame">
      <span class="idol-res-icon">⭐</span>
      <span class="idol-res-label">인기도</span>
      <span class="idol-res-value">${me.fame}</span>
    </div>
    <div class="idol-res-item res-talent">
      <span class="idol-res-icon">🎵</span>
      <span class="idol-res-label">재능</span>
      <span class="idol-res-value">${me.talent}</span>
    </div>
    <div class="idol-res-item res-looks">
      <span class="idol-res-icon">💄</span>
      <span class="idol-res-label">외모</span>
      <span class="idol-res-value">${me.looks}</span>
    </div>
    <div class="idol-res-item" style="border-color:rgba(255,100,150,0.3);">
      <span class="idol-res-icon">💗</span>
      <span class="idol-res-label">호감도</span>
      <span class="idol-res-value">?</span>
    </div>
  `;
}

// ─── 보드 렌더 ────────────────────────────────
function idolRenderBoard() {
  const board = document.getElementById('idolBoard');
  if (!board) return;
  board.innerHTML = '';

  const cellCoords = idolGetCellGridCoords();

  // 실제 셀 렌더
  BOARD_CELLS.forEach((cell, idx) => {
    const [col, row] = cellCoords[idx];
    const el = idolCreateCellElement(cell, idx);
    el.style.gridColumn = col + 1;
    el.style.gridRow    = row + 1;
    board.appendChild(el);
  });

  // 중앙 영역
  const center = document.createElement('div');
  center.className = 'idol-board-center';
  center.style.gridColumn = '2 / 10';
  center.style.gridRow    = '2 / 10';
  center.innerHTML = idolRenderCenterHTML();
  board.appendChild(center);
}

// 36칸 → 10x10 외곽 그리드 좌표
function idolGetCellGridCoords() {
  const coords = [];
  // 하단: 0~9 (row=9, col=0→9)
  for (let i = 0; i <= 9; i++) coords.push([i, 9]);
  // 우측: 10~18 (col=9, row=8→1)  — 9칸
  for (let i = 8; i >= 1; i--) coords.push([9, i]);
  // 상단: 19~27 (row=0, col=9→1) — 9칸
  for (let i = 9; i >= 1; i--) coords.push([i, 0]);
  // 좌측: 28~35 (col=0, row=1→8) — 8칸
  for (let i = 1; i <= 8; i++) coords.push([0, i]);
  return coords;
}

function idolCreateCellElement(cell, idx) {
  const el = document.createElement('div');
  el.className = 'idol-cell';
  el.dataset.cellIdx = idx;

  // 타입별 클래스
  el.classList.add(`cell-${cell.type}`);
  if (cell.type === 'shop') {
    const shop = SHOPS.find(s => s.id === cell.shopId);
    if (shop) el.classList.add(`cell-shop-${shop.cat}`);
  }

  // 플레이어 위치 표시
  const here = idolState.players.filter(p => p.pos === idx && !p.bankrupt);
  if (here.length > 0) el.classList.add('player-here');

  // 소유자 표시
  if (cell.type === 'shop') {
    const ownerId = idolState.shopOwners[cell.shopId];
    if (ownerId === state.myId) el.classList.add('owned-mine');
    else if (ownerId) el.classList.add('owned-other');

    if (ownerId) {
      const owner = idolState.players.find(p => p.id === ownerId);
      if (owner) {
        const dot = document.createElement('div');
        dot.className = 'cell-owner-dot';
        const colors = ['#ff6b35','#00e5ff','#ff2d78','#ffd700'];
        const ownerIdx = idolState.order.indexOf(ownerId);
        dot.style.background = colors[ownerIdx % colors.length];
        el.appendChild(dot);
      }
    }
  }

  // 셀 내용
  const info = getCellInfo(idx);
  const shop = cell.type === 'shop' ? SHOPS.find(s => s.id === cell.shopId) : null;
  const level = shop ? (idolState.shopLevels[cell.shopId] ?? 0) : 0;

  el.innerHTML += `
    <span class="idol-cell-emoji">${info?.emoji ?? '⬜'}</span>
    <span class="idol-cell-name">${info?.name ?? ''}</span>
    ${shop ? `<span class="idol-cell-rent">${shop.rent[level]}만</span>` : ''}
  `;

  // 플레이어 토큰
  if (here.length > 0) {
    const tokenWrap = document.createElement('div');
    tokenWrap.className = 'cell-tokens';
    here.forEach((p, i) => {
      const token = document.createElement('div');
      token.className = 'player-token';
      const colors = ['#ff6b35','#00e5ff','#ff2d78','#ffd700'];
      const pi = idolState.order.indexOf(p.id);
      token.style.background = colors[pi % colors.length];
      token.textContent = p.avatar || '😎';
      tokenWrap.appendChild(token);
    });
    el.appendChild(tokenWrap);
  }

  el.onclick = () => idolOnCellTap(idx);
  return el;
}

function idolRenderCenterHTML() {
  const currentP = idolCurrentPlayer();
  if (!currentP) return '<div class="idol-center-title">🎤</div>';

  const stage = getIdolStage(currentP.looks);
  const currentType = IDOL_TYPES.find(t => t.id === currentP.idolType);

  const playersHTML = idolState.order.map(id => {
    const p = idolState.players.find(pl => pl.id === id);
    if (!p) return '';
    const isCurrent = id === currentP.id;
    const pType = IDOL_TYPES.find(t => t.id === p.idolType);
    return `<div class="idol-player-mini ${isCurrent ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''}">
      ${pType?.img ? `<img src="${pType.img}" alt="" class="idol-mini-img">` : `<div class="idol-player-mini-emoji">${p.avatar}</div>`}
      <div class="idol-player-mini-name">${escapeHTML(p.name)}</div>
      <div class="idol-player-mini-fame">${p.fame}⭐</div>
    </div>`;
  }).join('');

  return `
    <div class="idol-center-portrait idol-stage-${stage.stage}">
      ${currentType?.img
        ? `<img src="${currentType.img}" alt="${escapeHTML(currentP.idolName ?? '')}" class="idol-center-img">`
        : `<div class="idol-center-img-placeholder">${currentType?.emoji ?? '🎤'}</div>`}
      <div class="idol-center-name">${escapeHTML(currentP.idolName ?? currentP.name)}</div>
      <div class="idol-center-stage" style="color:${stage.color}">${stage.emoji} ${stage.name}</div>
    </div>
    <div class="idol-players-mini">${playersHTML}</div>
  `;
}

// ─── 액션 패널 렌더 ───────────────────────────
function idolRenderActionPanel() {
  const panel = document.getElementById('idolActionPanel');
  if (!panel) return;

  const action = idolState.pendingAction;
  const isMyTurn = idolIsMyTurn();
  const currentP = idolCurrentPlayer();
  const isHost = state.isHost;

  if (idolState.phase === 'ending') {
    panel.innerHTML = idolRenderEndingPanel();
    return;
  }

  if (!action || action.type === 'waiting-roll') {
    if (isMyTurn) {
      panel.innerHTML = `
        <div class="idol-action-title">내 턴 — 주사위를 굴리세요!</div>
        <div class="idol-action-buttons">
          <button class="idol-btn idol-btn-primary" onclick="idolRollDice()">🎲 주사위 굴리기</button>
        </div>`;
    } else {
      panel.innerHTML = `
        <div class="idol-action-title" style="color:#888;">
          ${escapeHTML(currentP?.name ?? '?')}의 턴 — 대기 중...
        </div>`;
    }
    return;
  }

  switch (action.type) {
    case 'rolling':
      panel.innerHTML = idolRenderDicePanel(action.dice, action.isDouble);
      break;
    case 'shop-buy':
      panel.innerHTML = isMyTurn ? idolRenderShopBuyPanel(action.shopId) : `<div class="idol-action-title">샵 구매 결정 중...</div>`;
      break;
    case 'shop-upgrade':
      panel.innerHTML = isMyTurn ? idolRenderShopUpgradePanel(action.shopId) : `<div class="idol-action-title">업그레이드 결정 중...</div>`;
      break;
    case 'shop-train-self':
    case 'shop-train-other':
      panel.innerHTML = isMyTurn ? idolRenderTrainPanel(action.shopId, action.type === 'shop-train-self') : `<div class="idol-action-title">훈련 결정 중...</div>`;
      break;
    case 'train-result':
      panel.innerHTML = idolRenderTrainResult(action);
      break;
    case 'event-card':
      panel.innerHTML = isMyTurn ? idolRenderEventPanel(action.card) : `<div class="idol-action-title">이벤트 선택 중...</div>`;
      break;
    case 'gacha':
    case 'stage-gacha':
      panel.innerHTML = isMyTurn ? idolRenderGachaPanel() : `<div class="idol-action-title">가챠 중...</div>`;
      break;
    case 'gacha-result':
      panel.innerHTML = idolRenderGachaResult(action.result);
      break;
    case 'chance-card':
      panel.innerHTML = isMyTurn ? idolRenderChancePanel(action.card) : `<div class="idol-action-title">찬스 카드 처리 중...</div>`;
      break;
    case 'settlement':
      panel.innerHTML = idolRenderSettlementPanel(action);
      break;
    case 'bankrupt':
      panel.innerHTML = idolRenderBankruptPanel(action.playerId);
      break;
    case 'roll-again':
      panel.innerHTML = isMyTurn
        ? `<div class="idol-action-title">🎲 더블! 한 번 더!</div>
           <div class="idol-action-buttons"><button class="idol-btn idol-btn-gold" onclick="idolRollDice()">한 번 더 굴리기</button></div>`
        : `<div class="idol-action-title">더블! 추가 이동 중...</div>`;
      break;
    case 'goto-jail':
      panel.innerHTML = `<div class="idol-action-title">🚓 3연속 더블! 경찰서 직행!</div>`;
      if (isHost) setTimeout(() => idolOnTurnEnd(false), 1500);
      break;
    case 'turn-end-auto':
      panel.innerHTML = `<div class="idol-action-title">처리 중...</div>`;
      break;
  }
}

// ─── 패널 렌더 헬퍼들 ─────────────────────────
function idolRenderDicePanel(dice, isDouble) {
  const DICE_EMOJIS = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
  return `
    <div class="idol-action-title">${isDouble ? '🎲 더블!' : '🎲 이동!'}</div>
    <div class="idol-dice-area">
      <div class="idol-dice">${DICE_EMOJIS[dice[0]]}</div>
      <div class="idol-dice-sum">${dice[0] + dice[1]}</div>
      <div class="idol-dice">${DICE_EMOJIS[dice[1]]}</div>
    </div>`;
}

function idolRenderShopBuyPanel(shopId) {
  const shop = SHOPS.find(s => s.id === shopId);
  const cat  = SHOP_CATEGORIES[shop.cat];
  const me   = idolState.players.find(p => p.id === state.myId);
  const canAfford = me && me.money >= shop.price;
  return `
    <div class="idol-action-title">${cat.emoji} ${escapeHTML(shop.name)}</div>
    <div class="idol-popup-sub">구매가: ${shop.price.toLocaleString()}만원 | 수수료: ${shop.rent[0]}만원</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-gold" onclick="idolBuyShop('${shopId}')" ${canAfford ? '' : 'disabled'}>
        💰 구매 (${shop.price.toLocaleString()}만)
      </button>
      <button class="idol-btn" onclick="idolPassShop()">패스</button>
    </div>`;
}

function idolRenderShopUpgradePanel(shopId) {
  const shop  = SHOPS.find(s => s.id === shopId);
  const level = idolState.shopLevels[shopId] ?? 0;
  const me    = idolState.players.find(p => p.id === state.myId);
  const canUpgrade = level < 3 && me && me.money >= SHOP_UPGRADE_COST[level];
  return `
    <div class="idol-action-title">🏠 ${escapeHTML(shop.name)} (Lv.${level + 1})</div>
    <div class="idol-popup-sub">${SHOP_LEVEL_NAMES[level]} → ${level < 3 ? SHOP_LEVEL_NAMES[level + 1] : 'MAX'}</div>
    <div class="idol-action-buttons">
      ${level < 3 ? `<button class="idol-btn idol-btn-purple" onclick="idolUpgradeShop('${shopId}')" ${canUpgrade ? '' : 'disabled'}>
        ⬆️ 업그레이드 (${SHOP_UPGRADE_COST[level]}만)
      </button>` : '<div style="color:#ffd700;font-size:13px;text-align:center;">MAX 레벨!</div>'}
      <button class="idol-btn" onclick="idolPassShop()">그냥 지나가기</button>
    </div>`;
}

function idolRenderTrainPanel(shopId, isOwned) {
  const shop = SHOPS.find(s => s.id === shopId);
  const stat = shop.trainStat === 'talent' ? '재능' : shop.trainStat === 'looks' ? '외모' : '인기도';
  return `
    <div class="idol-action-title">🎓 ${escapeHTML(shop.name)} 훈련</div>
    <div class="idol-popup-sub">${stat} 훈련 ${isOwned ? '(전속 보너스 +1)' : '(효율 -1)'}</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-primary" onclick="idolTrainAtShop('${shopId}', ${isOwned})">훈련하기</button>
      <button class="idol-btn" onclick="idolSkipTrain()">건너뛰기</button>
    </div>`;
}

function idolRenderTrainResult(action) {
  const DICE_EMOJIS = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
  const statLabel = action.stat === 'talent' ? '재능' : action.stat === 'looks' ? '외모' : '인기도';
  return `
    <div class="idol-train-result">
      <div class="idol-action-title">훈련 결과!</div>
      <div class="idol-train-die">${DICE_EMOJIS[action.die]}</div>
      <div class="idol-train-gain">+${action.gain} ${statLabel}</div>
    </div>`;
}

function idolRenderEventPanel(card) {
  if (!card) return '';
  if (card.type === 'reversal') {
    return `
      <div class="idol-action-title">⚡ 역전 카드!</div>
      <div class="idol-popup-sub">${escapeHTML(card.title)}</div>
      <div class="idol-popup-sub" style="color:#69f0ae;">${card.desc}</div>
      <div class="idol-action-buttons">
        <button class="idol-btn idol-btn-gold" onclick="idolChooseEvent('${card.id}', 0)">받기!</button>
      </div>`;
  }
  const choicesHTML = (card.choices || []).map((c, i) =>
    `<button class="idol-choice-btn" onclick="idolChooseEvent('${card.id}', ${i})">
      <span style="color:#888;font-size:12px;">${String.fromCharCode(65+i)}.</span> ${escapeHTML(c.label)}
    </button>`
  ).join('');
  return `
    <div class="idol-action-title">🎴 ${escapeHTML(card.title)}</div>
    <div style="margin-bottom:8px;">${choicesHTML}</div>`;
}

function idolRenderGachaPanel() {
  return `
    <div class="idol-action-title">🎰 가챠!</div>
    <div class="idol-popup-sub">💎 레전드 15% · ✨ 히트 50% · 🌀 커먼 35%</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-gold" onclick="idolDoGacha()">뽑기!</button>
    </div>`;
}

function idolRenderGachaResult(result) {
  return `
    <div class="idol-gacha-slot">
      <div class="idol-action-title grade-${result.grade}">${result.emoji} ${result.label}!</div>
      <div class="idol-gacha-reel">${result.emoji}</div>
      <div class="idol-popup-sub" style="color:#69f0ae;">${result.reward?.desc ?? ''}</div>
    </div>`;
}

function idolRenderChancePanel(card) {
  if (!card) return '';
  if (card.effect?.target) {
    const others = idolState.players.filter(p => p.id !== state.myId && !p.bankrupt);
    const targetsHTML = others.map(p =>
      `<button class="idol-choice-btn" onclick="idolApplyChance('${card.id}', '${p.id}')">
        ${p.avatar} ${escapeHTML(p.name)}
      </button>`
    ).join('');
    return `
      <div class="idol-action-title">⚡ ${escapeHTML(card.title)}</div>
      <div class="idol-popup-sub">${card.desc} — 대상을 선택하세요</div>
      ${targetsHTML}`;
  }
  return `
    <div class="idol-action-title">⚡ ${escapeHTML(card.title)}</div>
    <div class="idol-popup-sub">${card.desc}</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-gold" onclick="idolApplyChance('${card.id}', null)">확인</button>
    </div>`;
}

function idolRenderSettlementPanel(action) {
  const rankList = idolState.players
    .filter(p => !p.bankrupt)
    .sort((a, b) => b.fame - a.fame)
    .map((p, i) => {
      const bonus = action.bonuses.find(b => b.playerId === p.id)?.bonus ?? 0;
      const stage = getIdolStage(p.looks);
      return `<div class="idol-rank-row">
        <div class="idol-rank-num">${i + 1}</div>
        <div class="idol-rank-avatar">${p.avatar}</div>
        <div class="idol-rank-name">${escapeHTML(p.name)}</div>
        <div class="idol-rank-fame">${p.fame}⭐ ${bonus > 0 ? `<span style="color:#69f0ae;">+${bonus}</span>` : ''}</div>
        <div class="idol-rank-stage">${stage.emoji}</div>
      </div>`;
    }).join('');

  return `
    <div class="idol-settlement-popup">
      <div class="idol-action-title">📊 ${action.turn}턴 결산!</div>
      <div class="idol-rank-list">${rankList}</div>
    </div>`;
}

function idolRenderBankruptPanel(playerId) {
  const p = idolState.players.find(pl => pl.id === playerId);
  const isMe = playerId === state.myId;
  return `
    <div style="text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">💀</div>
      <div class="idol-action-title">${escapeHTML(p?.name ?? '?')} 파산!</div>
      ${isMe ? '<div class="idol-popup-sub">게임에서 탈락했습니다</div>' : ''}
    </div>`;
}

function idolRenderEndingPanel() {
  return `
    <div class="idol-action-title">🎬 게임 종료!</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-primary" onclick="idolShowEndings()">결과 보기</button>
      <button class="idol-btn" onclick="leaveGame()">나가기</button>
    </div>`;
}

// ─── 엔딩 표시 ────────────────────────────────
function idolShowEndings() {
  const ranked = idolState.ranked ?? [...idolState.players].sort((a, b) => b.fame - a.fame);

  // 각 플레이어의 엔딩 결정
  const endingCards = ranked.map((p, i) => {
    const isFirst = i === 0;
    const favor   = p.id === state.myId ? (idolState._myFavor ?? p.favor ?? 0) : 10;
    const ending  = getEnding(p.bankrupt, isFirst, favor);
    return { p, ending };
  });

  // 내 엔딩 먼저 찾기
  const myEntry = endingCards.find(e => e.p.id === state.myId);

  const overlay = document.createElement('div');
  overlay.className = 'idol-ending-screen';
  overlay.style.background = myEntry?.ending.bg ?? '#0d0d1a';

  const allRanks = ranked.map((p, i) => {
    const stage = getIdolStage(p.looks);
    return `<div class="idol-rank-row">
      <div class="idol-rank-num" style="font-size:20px;">${['🥇','🥈','🥉','4위'][i] ?? (i+1+'위')}</div>
      <div class="idol-rank-avatar" style="font-size:24px;">${p.avatar}</div>
      <div class="idol-rank-name" style="font-size:15px;">${escapeHTML(p.name)}</div>
      <div class="idol-rank-fame" style="font-size:16px;">${p.fame}⭐</div>
      <div class="idol-rank-stage" style="font-size:16px;">${stage.emoji}</div>
    </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="idol-ending-emoji">${myEntry?.ending.emoji ?? '⭐'}</div>
    <div class="idol-ending-title">${myEntry?.ending.title ?? '게임 종료'}</div>
    <div class="idol-ending-text">${myEntry?.ending.text ?? ''}</div>
    <div class="idol-rank-list" style="width:100%;max-width:360px;margin-bottom:20px;">${allRanks}</div>
    <div class="idol-action-buttons" style="width:100%;max-width:360px;padding:0 16px;">
      <button class="idol-btn idol-btn-primary" onclick="this.closest('.idol-ending-screen').remove()">계속</button>
      <button class="idol-btn" onclick="leaveGame()">나가기</button>
    </div>`;

  document.getElementById('idolGame').appendChild(overlay);
}

// ─── 에볼루션 팝업 ────────────────────────────
function idolShowEvolution(p, newStage) {
  const stage = IDOL_STAGES[newStage];
  showToast(`${p.idolName || p.name} 아이돌이 ${stage.emoji} ${stage.name}으로 진화!`);
}

// ─── 호감도 토스트 ────────────────────────────
function idolShowFavorToast(playerId, dir, customMsg) {
  if (playerId !== state.myId) return;
  const div = document.createElement('div');
  div.className = 'idol-favor-toast';
  div.textContent = customMsg ?? (dir === 'up' ? '💗 호감도 상승!' : '💔 호감도 하락');
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

// ─── 셀 탭 (정보 보기) ───────────────────────
function idolOnCellTap(idx) {
  const cell = BOARD_CELLS[idx];
  if (!cell || cell.type !== 'shop') return;
  const shop = SHOPS.find(s => s.id === cell.shopId);
  if (!shop) return;
  const cat   = SHOP_CATEGORIES[shop.cat];
  const owner = idolState.shopOwners[cell.shopId];
  const ownerName = owner ? (idolState.players.find(p => p.id === owner)?.name ?? '?') : '없음';
  const level = idolState.shopLevels[cell.shopId] ?? 0;

  showToast(`${cat.emoji} ${shop.name} | 소유: ${ownerName} | Lv.${level + 1} | 수수료 ${shop.rent[level]}만`);
}

// ─── 셀 결과 표시 (임시 토스트) ──────────────
function idolShowCellResult(p, msg) {
  if (p.id === state.myId) showToast(msg);
}

function idolShowJailPop(p) {
  showToast(`🚓 ${escapeHTML(p.name)} 수감 중... (남은 턴: ${p.jailTurns + 1})`);
  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 800);
}

// ─── 선택 화면 ────────────────────────────────
let _idolSelections = {};

function idolShowSelectPhase() {
  const panel = document.getElementById('idolActionPanel');
  const board  = document.getElementById('idolBoardWrapper');
  const resBar = document.getElementById('idolResourceBar');

  if (board)  board.style.display  = 'none';
  if (resBar) resBar.style.display = 'none';

  if (panel) {
    // 선택 화면이 전체 높이를 차지하도록 패널 확장
    panel.style.flex = '1';
    panel.style.overflowY = 'auto';
    panel.style.maxHeight = '';

    const idolTypeOptions = IDOL_TYPES.map(t => `
      <div class="idol-type-card" id="idolTypeCard_${t.id}" data-type="${t.id}" onclick="idolSelectType('${t.id}')">
        <div class="idol-type-img-wrap">
          <img src="${t.img}" alt="${t.name}" class="idol-type-img" loading="lazy">
          <div class="idol-type-img-overlay"></div>
        </div>
        <div class="idol-type-info">
          <div class="idol-type-name">${t.name} <span class="idol-type-tag">${t.type}</span></div>
          <div class="idol-type-bonus">${t.desc}</div>
        </div>
      </div>`).join('');

    panel.innerHTML = `
      <div class="idol-select-screen">
        <div class="idol-select-title">🎤 아이돌 선택</div>
        <div class="idol-type-grid">${idolTypeOptions}</div>
        <input id="idolNameInput" class="input-field" placeholder="아이돌 이름 (선택)" maxlength="8"
          style="margin-top:4px;padding:10px 12px;font-size:14px;">
        <button class="idol-btn idol-btn-primary" onclick="idolConfirmSelection()" style="margin-top:6px;">
          선택 완료
        </button>
      </div>`;
  }
}

function idolSelectType(typeId) {
  document.querySelectorAll('.idol-type-card').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`idolTypeCard_${typeId}`);
  if (el) el.classList.add('selected');
  _idolSelections._selectedType = typeId;
}

function idolConfirmSelection() {
  const typeId = _idolSelections._selectedType ?? 'ai';
  const name   = document.getElementById('idolNameInput')?.value.trim() || '';

  if (state.isHost) {
    // 호스트: 바로 게임 시작 (싱글 플레이어로도 동작)
    const selections = state.players.map(p => ({
      playerId: p.id,
      idolTypeId: p.id === state.myId ? typeId : 'ai',
      idolName: p.id === state.myId ? name : null,
    }));

    const board  = document.getElementById('idolBoardWrapper');
    const resBar = document.getElementById('idolResourceBar');
    if (board)  board.style.display  = '';
    if (resBar) resBar.style.display = '';

    idolInitGame(selections);
  } else {
    broadcast({ type: 'idol-player-select', typeId, name });
    showToast('선택 완료! 호스트를 기다리는 중...');
  }
}

// ─── 메시지 수신 핸들러 ───────────────────────
function handleIdolMsg(msg) {
  switch (msg.type) {
    case 'idol-state':
      renderIdolView(msg.state);
      break;
    case 'idol-player-select':
      if (state.isHost) {
        _idolSelections[msg.from] = { typeId: msg.typeId, name: msg.name };
        // 모든 플레이어 선택 완료 시 시작
        const allSelected = state.players.every(p => p.id === state.myId || _idolSelections[p.id]);
        if (allSelected) {
          const selections = state.players.map(p => ({
            playerId: p.id,
            idolTypeId: p.id === state.myId ? (_idolSelections['_host']?.typeId ?? 'ai') : _idolSelections[p.id]?.typeId ?? 'ai',
            idolName: _idolSelections[p.id]?.name ?? null,
          }));
          const board  = document.getElementById('idolBoardWrapper');
          const resBar = document.getElementById('idolResourceBar');
          if (board)  board.style.display  = '';
          if (resBar) resBar.style.display = '';
          idolInitGame(selections);
        }
      }
      break;
  }
}

// ─── 연습 모드 (AI) ───────────────────────────
function idolStartPractice() {
  const cpus = Math.min(3, (_cpuCount || 0) + 1);
  // state.players 에 AI 플레이어 추가
  const fakePlayers = [
    { id: state.myId, name: state.myName, avatar: state.myAvatar },
    ...Array.from({ length: cpus }, (_, i) => ({
      id: `cpu${i}`, name: `CPU ${i + 1}`, avatar: ['🤖','👾','🎭'][i % 3],
    })),
  ];
  state.players = fakePlayers;
  state.isHost  = true;
  showScreen('idolGame');
  idolShowSelectPhase();
}

// ===== UX refresh overrides (UI/UX best-practice pass) =====
function idolUxGetPlayerAccent(playerId) {
  const palette = ['#ff6b35', '#00d9ff', '#ff4f9a', '#ffd166'];
  const idx = idolState?.order?.indexOf(playerId) ?? 0;
  return palette[(idx >= 0 ? idx : 0) % palette.length];
}

function idolUxGetBoardCellMeta(player) {
  if (!idolState || !player) return null;
  const info = getCellInfo(player.pos);
  if (!info) return null;

  const meta = {
    emoji: info.emoji ?? '⬜',
    name: info.name ?? '알 수 없음',
    detail: '',
    ownerName: null,
    level: null,
  };

  if (info.type === 'shop') {
    const level = idolState.shopLevels?.[info.shopId] ?? 0;
    const shop = SHOPS.find(s => s.id === info.shopId);
    const ownerId = idolState.shopOwners?.[info.shopId];
    const owner = ownerId ? idolState.players.find(p => p.id === ownerId) : null;
    meta.level = level + 1;
    meta.ownerName = owner?.name ?? null;
    if (shop) meta.detail = `Lv.${level + 1} · 통행료 ${shop.rent[level]}만`;
  } else if (info.type === 'tax' && typeof info.amount === 'number') {
    meta.detail = `세금 ${info.amount}만`;
  } else if (info.type === 'event' || info.type === 'chance') {
    meta.detail = '카드 선택 이벤트';
  } else if (info.type === 'gacha' || info.type === 'stage') {
    meta.detail = '즉시 결과 이벤트';
  }

  return meta;
}

function idolUxGetActionMeta(action) {
  const type = action?.type ?? 'waiting-roll';
  switch (type) {
    case 'waiting-roll': return { label: '주사위 대기', tone: 'primary' };
    case 'rolling': return { label: '이동 중', tone: 'info' };
    case 'shop-buy': return { label: '구매 결정', tone: 'gold' };
    case 'shop-upgrade': return { label: '업그레이드', tone: 'gold' };
    case 'shop-train-self': return { label: '내 시설 훈련', tone: 'success' };
    case 'shop-train-other': return { label: '훈련 선택', tone: 'warn' };
    case 'train-result': return { label: '훈련 결과', tone: 'success' };
    case 'event-card': return { label: '이벤트 카드', tone: 'warn' };
    case 'gacha':
    case 'stage-gacha': return { label: '가챠 진행', tone: 'gold' };
    case 'gacha-result': return { label: '가챠 결과', tone: 'gold' };
    case 'chance-card': return { label: '찬스 카드', tone: 'info' };
    case 'settlement': return { label: '턴 결산', tone: 'info' };
    case 'bankrupt': return { label: '파산 처리', tone: 'danger' };
    case 'roll-again': return { label: '더블 보너스', tone: 'gold' };
    case 'goto-jail': return { label: '경찰서 이동', tone: 'danger' };
    case 'turn-end-auto': return { label: '자동 처리', tone: 'muted' };
    case 'ending': return { label: '게임 종료', tone: 'gold' };
    default: return { label: '진행 중', tone: 'muted' };
  }
}

function idolUxGetActionHint(action, currentP, isMyTurn) {
  const type = action?.type ?? 'waiting-roll';
  if (!currentP) return '현재 턴 정보를 불러오는 중입니다.';
  if (!action || type === 'waiting-roll') {
    return isMyTurn ? '주사위를 굴려 이동을 시작하세요.' : `${currentP.name}님의 입력을 기다리는 중입니다.`;
  }
  switch (type) {
    case 'rolling': return '주사위 결과가 적용되어 이동 중입니다.';
    case 'shop-buy': return isMyTurn ? '시설 구매 여부를 결정하세요.' : '구매 결정을 기다리는 중입니다.';
    case 'shop-upgrade': return isMyTurn ? '업그레이드 여부를 결정하세요.' : '업그레이드 결정을 기다리는 중입니다.';
    case 'shop-train-self':
    case 'shop-train-other': return isMyTurn ? '훈련을 진행할지 선택하세요.' : '훈련 선택을 기다리는 중입니다.';
    case 'event-card': return isMyTurn ? '이벤트 선택지 중 하나를 고르세요.' : '이벤트 카드 처리 중입니다.';
    case 'chance-card': return isMyTurn ? '찬스 카드 효과를 처리하세요.' : '찬스 카드 처리 중입니다.';
    case 'gacha':
    case 'stage-gacha': return isMyTurn ? '가챠를 실행해 결과를 확인하세요.' : '가챠 연출이 재생 중입니다.';
    case 'gacha-result': return '가챠 보상이 반영되었습니다.';
    case 'settlement': return '현재 순위와 보너스를 확인하세요.';
    case 'roll-again': return isMyTurn ? '더블 보너스로 한 번 더 굴릴 수 있습니다.' : '더블 보너스 턴 처리 중입니다.';
    case 'goto-jail': return '3연속 더블로 경찰서로 이동합니다.';
    case 'turn-end-auto': return '다음 턴으로 전환 중입니다.';
    case 'bankrupt': return '파산 플레이어가 발생했습니다.';
    case 'ending': return '최종 결과를 확인하세요.';
    default: return '게임 진행 중입니다.';
  }
}

function idolUxToneClass(tone) {
  return `tone-${tone || 'muted'}`;
}

function idolRenderResourceBar() {
  const me = idolState?.players?.find(p => p.id === state.myId);
  if (!me) return;

  const bar = document.getElementById('idolResourceBar');
  if (!bar) return;

  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', '내 상태 요약');

  const activePlayers = idolState.players.filter(p => !p.bankrupt);
  const rank = idolGetRank(me.id);
  const stage = getIdolStage(me.looks);
  const favor = idolState._myFavor ?? me.favor;
  const favorText = Number.isFinite(favor) ? String(favor) : '?';
  const currentP = idolCurrentPlayer();
  const currentCell = idolUxGetBoardCellMeta(me);
  const actionMeta = idolUxGetActionMeta(idolState.pendingAction);

  bar.innerHTML = `
    <div class="idol-topdash">
      <div class="idol-res-hero">
        <div class="idol-res-hero-top">
          <span class="idol-status-chip ${idolUxToneClass(actionMeta.tone)}">${actionMeta.label}</span>
          <span class="idol-status-chip tone-muted">${rank}위 / ${activePlayers.length}명</span>
        </div>

        <div class="idol-res-hero-name" style="--idol-accent:${idolUxGetPlayerAccent(me.id)};">
          <span class="idol-res-hero-avatar">${me.avatar ?? '🎤'}</span>
          <div class="idol-res-hero-texts">
            <div class="idol-res-hero-title">${escapeHTML(me.idolName ?? me.name)}</div>
            <div class="idol-res-hero-sub">
              <span>${escapeHTML(me.name)}</span>
              <span class="idol-dot-sep" aria-hidden="true"></span>
              <span style="color:${stage.color};">${stage.emoji} ${stage.name}</span>
            </div>
          </div>
        </div>

        <div class="idol-res-hero-meta">
          <span class="idol-res-meta-pill ${currentP?.id === me.id ? 'is-active' : ''}">${currentP?.id === me.id ? '내 턴' : '대기'}</span>
          <span class="idol-res-meta-pill">${currentCell ? `${currentCell.emoji} ${escapeHTML(currentCell.name)}` : '위치 확인 중'}</span>
          ${currentCell?.detail ? `<span class="idol-res-meta-pill">${escapeHTML(currentCell.detail)}</span>` : ''}
        </div>
      </div>

      <div class="idol-res-grid" role="list">
        <div class="idol-res-item res-money" role="listitem">
          <span class="idol-res-icon">💰</span>
          <span class="idol-res-label">자금</span>
          <span class="idol-res-value">${me.money.toLocaleString()}</span>
        </div>
        <div class="idol-res-item res-fame" role="listitem">
          <span class="idol-res-icon">⭐</span>
          <span class="idol-res-label">인기도</span>
          <span class="idol-res-value">${me.fame}</span>
        </div>
        <div class="idol-res-item res-talent" role="listitem">
          <span class="idol-res-icon">🎵</span>
          <span class="idol-res-label">재능</span>
          <span class="idol-res-value">${me.talent}</span>
        </div>
        <div class="idol-res-item res-looks" role="listitem">
          <span class="idol-res-icon">💄</span>
          <span class="idol-res-label">외모</span>
          <span class="idol-res-value">${me.looks}</span>
        </div>
        <div class="idol-res-item res-favor" role="listitem">
          <span class="idol-res-icon">💗</span>
          <span class="idol-res-label">호감도</span>
          <span class="idol-res-value">${favorText}</span>
        </div>
      </div>
    </div>
  `;
}

function idolCreateCellElement(cell, idx) {
  const el = document.createElement('div');
  el.className = 'idol-cell';
  el.dataset.cellIdx = idx;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;

  el.classList.add(`cell-${cell.type}`);
  if (cell.type === 'shop') {
    const shopMeta = SHOPS.find(s => s.id === cell.shopId);
    if (shopMeta) el.classList.add(`cell-shop-${shopMeta.cat}`);
  }

  const here = idolState.players.filter(p => p.pos === idx && !p.bankrupt);
  if (here.length > 0) el.classList.add('player-here');

  let ownerId = null;
  if (cell.type === 'shop') {
    ownerId = idolState.shopOwners[cell.shopId];
    if (ownerId === state.myId) el.classList.add('owned-mine');
    else if (ownerId) el.classList.add('owned-other');
  }

  const info = getCellInfo(idx);
  const shop = cell.type === 'shop' ? SHOPS.find(s => s.id === cell.shopId) : null;
  const level = shop ? (idolState.shopLevels[cell.shopId] ?? 0) : 0;
  const cellName = info?.name ?? '';
  const displayName = cellName.length > 8 ? `${cellName.slice(0, 8)}…` : cellName;
  const rentText = shop ? `${shop.rent[level]}만` : '';
  const ownerName = ownerId ? (idolState.players.find(p => p.id === ownerId)?.name ?? '알 수 없음') : null;

  const ariaParts = [
    `${idx + 1}번 칸`,
    cellName || '이름 없음',
    shop ? `레벨 ${level + 1}` : '',
    shop ? `통행료 ${rentText}` : '',
    ownerName ? `소유자 ${ownerName}` : '',
  ].filter(Boolean);
  el.setAttribute('aria-label', ariaParts.join(', '));
  el.title = ownerName ? `${cellName} (Lv.${level + 1}, ${rentText}, 소유: ${ownerName})` : (shop ? `${cellName} (Lv.${level + 1}, ${rentText})` : cellName);

  if (ownerId) {
    const dot = document.createElement('div');
    dot.className = 'cell-owner-dot';
    dot.style.background = idolUxGetPlayerAccent(ownerId);
    el.appendChild(dot);
  }

  el.innerHTML += `
    <span class="idol-cell-emoji">${info?.emoji ?? '⬜'}</span>
    <span class="idol-cell-name">${escapeHTML(displayName)}</span>
    ${shop ? `<span class="idol-cell-rent">${rentText}</span>` : ''}
  `;

  if (here.length > 0) {
    const tokenWrap = document.createElement('div');
    tokenWrap.className = 'cell-tokens';
    here.forEach(p => {
      const token = document.createElement('div');
      token.className = 'player-token';
      token.style.background = idolUxGetPlayerAccent(p.id);
      token.textContent = p.avatar || '🙂';
      tokenWrap.appendChild(token);
    });
    el.appendChild(tokenWrap);
  }

  const openCellInfo = () => idolOnCellTap(idx);
  el.onclick = openCellInfo;
  el.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      openCellInfo();
    }
  };

  return el;
}

function idolRenderCenterHTML() {
  const currentP = idolCurrentPlayer();
  if (!currentP) {
    return `<div class="idol-center-shell"><div class="idol-center-empty">현재 턴 정보를 불러오는 중...</div></div>`;
  }

  const stage = getIdolStage(currentP.looks);
  const currentType = IDOL_TYPES.find(t => t.id === currentP.idolType);
  const currentRank = idolGetRank(currentP.id);
  const actionMeta = idolUxGetActionMeta(idolState.pendingAction);
  const actionHint = idolUxGetActionHint(idolState.pendingAction, currentP, idolIsMyTurn());
  const cellMeta = idolUxGetBoardCellMeta(currentP);

  const playersHTML = idolState.order.map(id => {
    const p = idolState.players.find(pl => pl.id === id);
    if (!p) return '';
    const isCurrent = id === currentP.id;
    const pType = IDOL_TYPES.find(t => t.id === p.idolType);
    const pRank = idolGetRank(p.id);
    const pStage = getIdolStage(p.looks);

    return `
      <div class="idol-player-mini ${isCurrent ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''}" style="--idol-accent:${idolUxGetPlayerAccent(p.id)};">
        <div class="idol-player-mini-portrait">
          ${pType?.img ? `<img src="${pType.img}" alt="" class="idol-mini-img">` : `<div class="idol-player-mini-emoji">${p.avatar}</div>`}
        </div>
        <div class="idol-player-mini-body">
          <div class="idol-player-mini-top">
            <div class="idol-player-mini-name">${escapeHTML(p.name)}</div>
            <div class="idol-player-mini-rank">${p.bankrupt ? '탈락' : `${pRank}위`}</div>
          </div>
          <div class="idol-player-mini-stats">
            <span class="idol-player-mini-fame">${p.fame}⭐</span>
            <span class="idol-player-mini-money">${p.money.toLocaleString()}만</span>
            <span class="idol-player-mini-stage" style="color:${pStage.color};">${pStage.emoji}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="idol-center-shell">
      <div class="idol-center-head">
        <div class="idol-center-title-wrap">
          <div class="idol-center-title">현재 턴</div>
          <div class="idol-center-subtitle">${idolState.turnNum} / ${IDOL_TOTAL_TURNS}턴 · ${currentRank}위</div>
        </div>
        <div class="idol-center-statuses">
          <span class="idol-status-chip ${idolUxToneClass(actionMeta.tone)}">${actionMeta.label}</span>
          <span class="idol-status-chip tone-muted">${idolIsMyTurn() ? '내 차례' : '관전'}</span>
        </div>
      </div>

      <div class="idol-center-main">
        <div class="idol-center-portrait idol-stage-${stage.stage}">
          ${currentType?.img
            ? `<img src="${currentType.img}" alt="${escapeHTML(currentP.idolName ?? '')}" class="idol-center-img">`
            : `<div class="idol-center-img-placeholder">${currentType?.emoji ?? '🎤'}</div>`}
          <div class="idol-center-name">${escapeHTML(currentP.idolName ?? currentP.name)}</div>
          <div class="idol-center-stage" style="color:${stage.color};">${stage.emoji} ${stage.name}</div>
        </div>

        <div class="idol-center-summary">
          <div class="idol-center-current-name" style="--idol-accent:${idolUxGetPlayerAccent(currentP.id)};">
            ${currentP.avatar ?? '🎤'} ${escapeHTML(currentP.name)}
          </div>
          <div class="idol-center-current-meta">
            <span>💰 ${currentP.money.toLocaleString()}만</span>
            <span>⭐ ${currentP.fame}</span>
            <span>🎵 ${currentP.talent}</span>
            <span>💄 ${currentP.looks}</span>
          </div>

          <div class="idol-center-cell-card">
            <div class="idol-center-cell-title">현재 위치</div>
            <div class="idol-center-cell-name">${cellMeta ? `${cellMeta.emoji} ${escapeHTML(cellMeta.name)}` : '위치 확인 중'}</div>
            <div class="idol-center-cell-detail">${cellMeta?.detail ? escapeHTML(cellMeta.detail) : '효과 없음'}</div>
            ${cellMeta?.ownerName ? `<div class="idol-center-cell-detail">소유자: ${escapeHTML(cellMeta.ownerName)}</div>` : ''}
          </div>

          <div class="idol-center-hint">${escapeHTML(actionHint)}</div>
        </div>
      </div>

      <div class="idol-center-roster-label">플레이어 현황</div>
      <div class="idol-players-mini">${playersHTML}</div>
    </div>
  `;
}

function idolUxRenderActionContextCard(currentP, action, isMyTurn) {
  if (!currentP) {
    return `
      <div class="idol-action-context">
        <div class="idol-action-context-title">행동 안내</div>
        <div class="idol-action-context-hint">현재 턴 정보를 불러오는 중...</div>
      </div>
    `;
  }

  const actionMeta = idolUxGetActionMeta(action);
  const actionHint = idolUxGetActionHint(action, currentP, isMyTurn);
  const cellMeta = idolUxGetBoardCellMeta(currentP);
  const stage = getIdolStage(currentP.looks);

  return `
    <div class="idol-action-context">
      <div class="idol-action-context-row">
        <div class="idol-action-context-title">행동 안내</div>
        <div class="idol-action-context-chips">
          <span class="idol-status-chip ${idolUxToneClass(actionMeta.tone)}">${actionMeta.label}</span>
          <span class="idol-status-chip tone-muted">${isMyTurn ? '입력 가능' : '관전'}</span>
        </div>
      </div>

      <div class="idol-action-context-player" style="--idol-accent:${idolUxGetPlayerAccent(currentP.id)};">
        <span class="idol-action-context-avatar">${currentP.avatar ?? '🎤'}</span>
        <div class="idol-action-context-player-texts">
          <div class="idol-action-context-player-name">${escapeHTML(currentP.name)}</div>
          <div class="idol-action-context-player-meta">
            <span>${idolState.turnNum} / ${IDOL_TOTAL_TURNS}턴</span>
            <span>${idolGetRank(currentP.id)}위</span>
            <span style="color:${stage.color};">${stage.emoji} ${stage.name}</span>
          </div>
        </div>
      </div>

      <div class="idol-action-context-grid">
        <div class="idol-context-stat">
          <span class="label">위치</span>
          <span class="value">${cellMeta ? `${cellMeta.emoji} ${escapeHTML(cellMeta.name)}` : '확인 중'}</span>
        </div>
        <div class="idol-context-stat">
          <span class="label">상세</span>
          <span class="value">${cellMeta?.detail ? escapeHTML(cellMeta.detail) : '효과 없음'}</span>
        </div>
      </div>

      <div class="idol-action-context-hint">${escapeHTML(actionHint)}</div>
    </div>
  `;
}

function idolUxWrapActionPanelHTML(contentHtml, currentP, action, isMyTurn) {
  return `
    <div class="idol-action-shell">
      ${idolUxRenderActionContextCard(currentP, action, isMyTurn)}
      <div class="idol-task-card">
        ${contentHtml}
      </div>
    </div>
  `;
}

function idolRenderActionPanel() {
  const panel = document.getElementById('idolActionPanel');
  if (!panel || !idolState) return;

  const action = idolState.pendingAction;
  const isMyTurn = idolIsMyTurn();
  const currentP = idolCurrentPlayer();
  const isHost = state.isHost;

  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', '행동 안내 패널');

  let contentHtml = '';

  if (idolState.phase === 'ending') {
    contentHtml = idolRenderEndingPanel();
    panel.innerHTML = idolUxWrapActionPanelHTML(contentHtml, currentP, action, isMyTurn);
    return;
  }

  if (!action || action.type === 'waiting-roll') {
    contentHtml = isMyTurn
      ? `
        <div class="idol-action-title">다음 행동: 주사위를 굴리세요</div>
        <div class="idol-popup-sub">이동 후 칸 이벤트는 자동으로 이어집니다.</div>
        <div class="idol-action-buttons">
          <button class="idol-btn idol-btn-primary" onclick="idolRollDice()">🎲 주사위 굴리기</button>
        </div>
      `
      : `
        <div class="idol-action-title">대기 중</div>
        <div class="idol-popup-sub">${escapeHTML(currentP?.name ?? '플레이어')}님의 입력을 기다리는 중입니다.</div>
      `;
    panel.innerHTML = idolUxWrapActionPanelHTML(contentHtml, currentP, action, isMyTurn);
    return;
  }

  switch (action.type) {
    case 'rolling':
      contentHtml = idolRenderDicePanel(action.dice, action.isDouble);
      break;
    case 'shop-buy':
      contentHtml = isMyTurn ? idolRenderShopBuyPanel(action.shopId) : `<div class="idol-action-title">시설 구매 결정 대기 중...</div>`;
      break;
    case 'shop-upgrade':
      contentHtml = isMyTurn ? idolRenderShopUpgradePanel(action.shopId) : `<div class="idol-action-title">업그레이드 결정 대기 중...</div>`;
      break;
    case 'shop-train-self':
    case 'shop-train-other':
      contentHtml = isMyTurn ? idolRenderTrainPanel(action.shopId, action.type === 'shop-train-self') : `<div class="idol-action-title">훈련 선택 대기 중...</div>`;
      break;
    case 'train-result':
      contentHtml = idolRenderTrainResult(action);
      break;
    case 'event-card':
      contentHtml = isMyTurn ? idolRenderEventPanel(action.card) : `<div class="idol-action-title">이벤트 처리 중...</div>`;
      break;
    case 'gacha':
    case 'stage-gacha':
      contentHtml = isMyTurn ? idolRenderGachaPanel() : `<div class="idol-action-title">가챠 연출 진행 중...</div>`;
      break;
    case 'gacha-result':
      contentHtml = idolRenderGachaResult(action.result);
      break;
    case 'chance-card':
      contentHtml = isMyTurn ? idolRenderChancePanel(action.card) : `<div class="idol-action-title">찬스 카드 처리 중...</div>`;
      break;
    case 'settlement':
      contentHtml = idolRenderSettlementPanel(action);
      break;
    case 'bankrupt':
      contentHtml = idolRenderBankruptPanel(action.playerId);
      break;
    case 'roll-again':
      contentHtml = isMyTurn
        ? `<div class="idol-action-title">🎲 더블 보너스</div>
           <div class="idol-popup-sub">추가 턴을 바로 진행할 수 있습니다.</div>
           <div class="idol-action-buttons"><button class="idol-btn idol-btn-gold" onclick="idolRollDice()">한 번 더 굴리기</button></div>`
        : `<div class="idol-action-title">더블 보너스 처리 중...</div>`;
      break;
    case 'goto-jail':
      contentHtml = `
        <div class="idol-action-title">🚓 3연속 더블! 경찰서 직행</div>
        <div class="idol-popup-sub">이번 턴 이동이 종료되고 수감 상태가 적용됩니다.</div>
      `;
      if (isHost) setTimeout(() => idolOnTurnEnd(false), 1500);
      break;
    case 'turn-end-auto':
      contentHtml = `<div class="idol-action-title">다음 턴 준비 중...</div>`;
      break;
    default:
      contentHtml = `<div class="idol-action-title">진행 중...</div>`;
      break;
  }

  panel.innerHTML = idolUxWrapActionPanelHTML(contentHtml, currentP, action, isMyTurn);
}

// ===== 팟플 아이돌 매니지먼트 — 메인 게임 엔진 =====

// ─── 3D 다이스 로더 ──────────────────────────
let _idolThreeState = 'none'; // 'none' | 'loading' | 'ready'
let _idolThreeQueue = [];

function loadIdolDiceThree(onReady) {
  if (_idolThreeState === 'ready') { if (onReady) onReady(); return; }
  if (typeof onReady === 'function') _idolThreeQueue.push(onReady);
  if (_idolThreeState === 'loading') return; // 로드 중 — 큐에 추가됨

  _idolThreeState = 'loading';

  const _flush = () => {
    _idolThreeState = 'ready';
    const q = _idolThreeQueue.splice(0);
    q.forEach(fn => { try { fn(); } catch (e) {} });
  };
  const _fail = () => {
    _idolThreeState = 'none'; // 재시도 가능하도록
    const q = _idolThreeQueue.splice(0);
    q.forEach(fn => { try { fn(); } catch (e) {} }); // 실패해도 콜백 호출
  };

  const _loadDiceScript = () => {
    // idol-dice-three.js가 이미 로드됐으면 초기화만
    if (typeof idolDiceThreeRoll === 'function') {
      const canvas = document.getElementById('idolDiceCanvas');
      if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);
      _flush();
      return;
    }
    const s2 = document.createElement('script');
    s2.src = 'js/idol-dice-three.js';
    s2.onload = () => {
      const canvas = document.getElementById('idolDiceCanvas');
      if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);
      _flush();
    };
    s2.onerror = _fail;
    document.head.appendChild(s2);
  };

  // Three.js가 이미 로드된 경우(yahtzee 등에서) 재로드 불필요
  if (typeof THREE !== 'undefined') {
    _loadDiceScript();
    return;
  }

  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = _loadDiceScript;
  s1.onerror = _fail;
  document.head.appendChild(s1);
}

function idolShowDiceOverlay(d1, d2, isDouble, onDone) {
  const overlay = document.getElementById('idolDiceOverlay');
  if (!overlay) { if (onDone) onDone(); return; }
  overlay.style.display = 'flex';

  const badge = document.getElementById('idolDiceResultBadge');
  if (badge) { badge.textContent = ''; badge.className = 'idol-dice-result-badge'; }

  const doRoll = () => {
    const canvas = document.getElementById('idolDiceCanvas');
    // Three.js가 준비됐으면 초기화(이미 된 경우 no-op)
    if (canvas && typeof initIdolDiceThree === 'function') initIdolDiceThree(canvas);

    if (typeof idolDiceThreeRoll === 'function') {
      idolDiceThreeRoll(d1, d2, () => {
        if (badge) {
          const EMOJIS = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
          badge.textContent = `${EMOJIS[d1]}  ${d1 + d2}  ${EMOJIS[d2]}${isDouble ? '  🎲 더블!' : ''}`;
          badge.className = `idol-dice-result-badge visible${isDouble ? ' double' : ''}`;
        }
        setTimeout(() => { idolHideDiceOverlay(); if (onDone) onDone(); }, 700);
      });
    } else {
      // Three.js 없음 → 즉시 완료
      setTimeout(() => { idolHideDiceOverlay(); if (onDone) onDone(); }, 200);
    }
  };

  loadIdolDiceThree(doRoll);
}

function idolHideDiceOverlay() {
  const overlay = document.getElementById('idolDiceOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── 게임 상태 ────────────────────────────────
let idolState = null;

// ─── 카메라 상태 ──────────────────────────────
// current: 실제 렌더 값 / target: lerp 목표값
let _idolCam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1 };
let _idolCamRafId = null;
let _idolCamGestureInit = false;
const _CAM_LERP     = 0.13;   // lerp 계수 (0~1, 낮을수록 부드럽고 느림)
const _CAM_ZOOM_MIN = 0.75;
const _CAM_ZOOM_MAX = 2.8;

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

  idolState = null;
  idolResetSelectionState();

  // 비호스트도 선택 화면으로 진입할 수 있도록 표준 game-started 신호 전송
  if ((state.players?.length ?? 0) > 1) {
    broadcast({ type: 'game-started', game: 'idol' });
  }

  // 선택 화면으로 이동 (각 플레이어가 아이돌 선택)
  showScreen('idolGame');
  idolShowSelectPhase();
}

// 호스트가 초기 게임 생성 (모든 플레이어 선택 완료 후)
function idolInitGame(selections) {
  // Three.js 미리 로드 (첫 주사위 전에 완료되도록)
  loadIdolDiceThree();
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

  _idolSelectionLocked = false;
  // 카메라 초기화 (rAF 루프도 정리)
  if (_idolCamRafId) { cancelAnimationFrame(_idolCamRafId); _idolCamRafId = null; }
  _idolCam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1 };
  broadcastIdolState();
  idolRenderAll();
  // ISO 보드 fit-zoom: 레이아웃 완료 후 래퍼에 맞는 줌 계산
  requestAnimationFrame(() => {
    const _w = document.getElementById('idolBoardWrapper');
    if (_w && typeof ISO_BOARD !== 'undefined') {
      const wW = _w.offsetWidth, wH = _w.offsetHeight;
      if (wW > 0 && wH > 0) {
        const fz = Math.min(wW / ISO_BOARD.SVG_W, wH / ISO_BOARD.SVG_H) * 0.9;
        _idolCam.x = _idolCam.tx = 0;
        _idolCam.y = _idolCam.ty = 0;
        _idolCam.zoom = _idolCam.tzoom = fz;
        _idolCamFlush();
      }
    }
  });
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
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  if (!p) return;
  // 내 턴이거나 CPU 플레이어 턴일 때만 허용
  if (p.id !== state.myId && !idolIsCpuPlayerId(p.id)) return;
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
      // 다이스 애니메이션 후 자동 턴 진행
      idolShowDiceOverlay(d1, d2, true, () => {
        if (idolState?.pendingAction?.type === 'goto-jail') idolOnTurnEnd(false);
      });
      return;
    }
  } else {
    p.consecutiveDoubles = 0;
  }

  idolState.pendingAction = { type: 'rolling', dice: [d1, d2], isDouble };
  broadcastIdolState();
  idolRenderAll();

  // 3D 다이스 애니메이션 → 완료 후 이동 처리
  idolShowDiceOverlay(d1, d2, isDouble, () => {
    idolMovePlayer(p, d1 + d2, isDouble);
  });
}

// ─── 플레이어 이동 ────────────────────────────
function idolMovePlayer(p, steps, isDouble) {
  const oldPos = p.pos;
  const newPos = (p.pos + steps) % BOARD_CELLS.length;
  const passedStart = newPos < oldPos && newPos !== 0;

  // 토큰 애니메이션 → 완료 후 상태 확정
  idolAnimateMoveToken(p.id, oldPos, newPos, () => {
    if (passedStart) {
      p.money += IDOL_SALARY;
      idolShowFavorToast(p.id, null, `출발 통과! 월급 +${IDOL_SALARY}만`);
    }
    p.pos = newPos;
    idolState.pendingAction = { type: 'landed', dice: idolState.pendingAction?.dice, pos: newPos, isDouble };
    broadcastIdolState();
    idolRenderAll();
    setTimeout(() => idolProcessCell(p, newPos, isDouble), 400);
  });
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
      // 파산하면 idolCheckBankruptcy가 pendingAction='bankrupt'+자동진행 예약 → 덮어쓰지 않음
      if (!p.bankrupt) idolState.pendingAction = { type: 'turn-end-auto' };
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
      idolHandleShop(p, cell.shopId, isDouble);
      return;
  }

  broadcastIdolState();
  idolRenderAll();

  if (idolState.pendingAction?.type === 'turn-end-auto') {
    setTimeout(() => idolOnTurnEnd(isDouble), 800);
  }
}

// ─── 샵 처리 ──────────────────────────────────
function idolHandleShop(p, shopId, isDouble) {
  const shop = SHOPS.find(s => s.id === shopId);
  const ownerId = idolState.shopOwners[shopId];

  if (!ownerId) {
    // 미분양 → 구매 여부 팝업
    idolState.pendingAction = { type: 'shop-buy', shopId, playerId: p.id, isDouble: !!isDouble };
  } else if (ownerId === p.id) {
    // 내 샵 → 업그레이드 팝업
    idolState.pendingAction = { type: 'shop-upgrade', shopId, playerId: p.id, isDouble: !!isDouble };
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

    // 파산이면 idolCheckBankruptcy가 pendingAction을 'bankrupt'로 설정하고 자동진행 예약함
    if (p.bankrupt) {
      broadcastIdolState();
      idolRenderAll();
      return;
    }

    idolShowCellResult(p, `💰 ${shop.name} 수수료 ${rent}만원`);

    // 훈련 여부 팝업 (수수료 낸 후)
    idolState.pendingAction = { type: 'shop-train-other', shopId, playerId: p.id, isDouble: !!isDouble };
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

  const prevIsDouble = idolState.pendingAction?.isDouble ?? false;
  idolState.pendingAction = { type: 'shop-train-self', shopId, playerId: p.id, isDouble: prevIsDouble };
  broadcastIdolState();
  idolRenderAll();
}

function idolPassShop() {
  if (!state.isHost) return;
  const isDouble = idolState.pendingAction?.isDouble ?? false;
  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(isDouble), 400);
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

  const prevIsDouble = idolState.pendingAction?.isDouble ?? false;
  idolState.pendingAction = { type: 'shop-train-self', shopId, playerId: p.id, isDouble: prevIsDouble };
  broadcastIdolState();
  idolRenderAll();
}

// ─── 샵 훈련 ──────────────────────────────────
function idolTrainAtShop(shopId, isOwned) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const shop = SHOPS.find(s => s.id === shopId);
  if (!p || !shop) return;
  const isDouble = idolState.pendingAction?.isDouble ?? false;

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
    isDouble,
  };
  broadcastIdolState();
  idolRenderAll();
}

function idolConfirmTrainResult() {
  if (!state.isHost) return;
  const action = idolState.pendingAction;
  if (!action || action.type !== 'train-result') return;
  idolOnTurnEnd(action.isDouble ?? false);
}

function idolSkipTrain() {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const isDouble = idolState.pendingAction?.isDouble ?? false;
  p.skipTrainCount++;

  // 3연속 훈련 스킵 → 호감도 하락
  if (p.skipTrainCount >= 3) {
    p.favor = Math.max(0, p.favor - 2);
    p.skipTrainCount = 0;
    p.lastFavorDir = 'down';
    idolShowFavorToast(p.id, 'down', null);
  }

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(isDouble), 300);
}

// ─── 샵 인수 제안 ─────────────────────────────
function idolProposeTakeover(shopId) {
  if (!state.isHost) return;
  const p = idolCurrentPlayer();
  const shop = SHOPS.find(s => s.id === shopId);
  const ownerId = idolState.shopOwners[shopId];
  if (!p || !shop || !ownerId) return;

  const price = Math.floor(shop.price * 1.5);
  if (p.money < price) { showToast('돈이 부족합니다'); return; }

  const isDouble = idolState.pendingAction?.isDouble ?? false;
  idolState.pendingAction = {
    type: 'shop-takeover-offer',
    shopId,
    fromId: p.id,
    toId: ownerId,
    price,
    isDouble,
  };
  broadcastIdolState();
  idolRenderAll();

  // CPU 오너 자동 응답
  if (idolIsCpuPlayerId(ownerId)) {
    setTimeout(() => {
      if (idolState.pendingAction?.type !== 'shop-takeover-offer') return;
      const shopLevel = idolState.shopLevels[shopId] ?? 0;
      // 높은 레벨 샵일수록 거절 확률 높아짐
      const acceptChance = shopLevel >= 2 ? 0.2 : shopLevel >= 1 ? 0.4 : 0.65;
      if (Math.random() < acceptChance) {
        idolAcceptTakeover();
      } else {
        idolDeclineTakeover();
      }
    }, 1800);
  }
}

function idolAcceptTakeover() {
  if (!state.isHost) return;
  const action = idolState.pendingAction;
  if (!action || action.type !== 'shop-takeover-offer') return;

  const buyer = idolState.players.find(p => p.id === action.fromId);
  const seller = idolState.players.find(p => p.id === action.toId);
  const shop = SHOPS.find(s => s.id === action.shopId);
  if (!buyer || !seller || !shop) return;

  if (buyer.money < action.price) {
    showToast('구매자 자금 부족 — 거절 처리합니다');
    idolDeclineTakeover();
    return;
  }

  buyer.money -= action.price;
  seller.money += action.price;

  // 소유권 이전
  idolState.shopOwners[action.shopId] = action.fromId;
  const sellerIdx = seller.ownedShops.indexOf(action.shopId);
  if (sellerIdx !== -1) seller.ownedShops.splice(sellerIdx, 1);
  if (!buyer.ownedShops.includes(action.shopId)) buyer.ownedShops.push(action.shopId);

  idolCheckBeautyMonopoly(buyer);
  idolCheckBeautyMonopoly(seller);

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(action.isDouble ?? false), 400);
}

function idolDeclineTakeover() {
  if (!state.isHost) return;
  const action = idolState.pendingAction;
  if (!action || action.type !== 'shop-takeover-offer') return;

  // 거절하면 오너 호감도 -1 (룰북 6-2), 0 미만 불가
  const owner = idolState.players.find(p => p.id === action.toId);
  if (owner) {
    owner.favor = Math.max(0, owner.favor - 1);
    owner.lastFavorDir = 'down';
    idolShowFavorToast(owner.id, 'down', null);
  }

  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(action.isDouble ?? false), 400);
}

function idolRenderTakeoverPanel(action) {
  const shop = SHOPS.find(s => s.id === action.shopId);
  const buyer = idolState.players.find(p => p.id === action.fromId);
  const owner = idolState.players.find(p => p.id === action.toId);
  const canAfford = (buyer?.money ?? 0) >= action.price;
  const isOwnerMe = action.toId === state.myId;
  const showButtons = state.isHost;

  return `
    <div class="idol-action-title">🏠 인수 제안</div>
    <div class="idol-popup-sub">
      ${escapeHTML(buyer?.name ?? '?')}이(가) <b>${escapeHTML(shop?.name ?? '?')}</b> 인수를 제안합니다
    </div>
    <div class="idol-popup-sub" style="color:#ffd700;font-size:15px;">제안 금액: ${action.price}만원</div>
    <div class="idol-popup-sub" style="opacity:.75;">${escapeHTML(owner?.name ?? '?')}님의 결정</div>
    ${showButtons ? `
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-primary" onclick="idolAcceptTakeover()" ${canAfford ? '' : 'disabled'}>수락</button>
      <button class="idol-btn idol-btn-danger" onclick="idolDeclineTakeover()">거절 (호감도 -1)</button>
    </div>` : `<div class="idol-popup-sub" style="opacity:.6;">결정 대기 중...</div>`}`;
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

  // 파산 발생 시 idolCheckBankruptcy가 이미 pendingAction='bankrupt' + 자동진행 예약
  if (p.bankrupt) {
    broadcastIdolState();
    idolRenderAll();
    return;
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

  if (card.target && targetId) {
    const target = idolState.players.find(pl => pl.id === targetId);
    if (target) idolApplyEffect(target, card.effect);
  } else {
    idolApplyEffect(p, card.effect);
  }

  // 파산 발생 시 idolCheckBankruptcy가 이미 pendingAction='bankrupt' + 자동진행 예약
  if (p.bankrupt) {
    broadcastIdolState();
    idolRenderAll();
    return;
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
    const ownedShopObjs = p.ownedShops.map(id => SHOPS.find(s => s.id === id)).filter(Boolean);
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

  // 팔 수 있는 샵이 있으면 유예 (매각 패널에서 플레이어가 직접 처리)
  if (p.ownedShops.length > 0) return;

  // 진짜 파산
  p.bankrupt = true;
  p.ownedShops = [];

  idolState.pendingAction = { type: 'bankrupt', playerId: p.id };
  broadcastIdolState();
  idolRenderAll();

  // 2.5초 후 자동으로 다음 턴 진행 (bankrupt 패널 표시 후)
  setTimeout(() => {
    if (idolState && idolState.pendingAction?.type === 'bankrupt' && idolState.pendingAction.playerId === p.id) {
      idolAdvanceTurn();
    }
  }, 2500);
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

  // 매각 후에도 자금 부족 → 파산 재체크
  if (p.money <= 0) idolCheckBankruptcy(p);

  broadcastIdolState();
  idolRenderAll();
}

// ─── 뷰티 독점 체크 ──────────────────────────
function idolCheckBeautyMonopoly(p) {
  const beautyShops = SHOPS.filter(s => s.cat === 'beauty').map(s => s.id);
  const owned = beautyShops.filter(id => p.ownedShops.includes(id));
  // === 3 으로 정확히 독점 달성 시에만 보너스 (이미 독점 상태에서 추가 구매 시 중복 방지)
  if (owned.length === 3) {
    p.looks += 3;
    p.favor = Math.min(p.favor + 1, 10);
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

  // 5턴 결산 체크 (이미 settlement 중이면 중복 방지)
  if (idolState.turnNum % 5 === 0 && idolState.pendingAction?.type !== 'settlement') {
    idolRunSettlement();
    const settleTurn = idolState.turnNum;
    setTimeout(() => {
      if (idolState?.pendingAction?.type === 'settlement'
          && idolState.turnNum === settleTurn) {
        idolAdvanceTurn();
      }
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

  // Watchdog: CPU 턴이면 AI가 응답하지 않을 경우 3.5초 후 재시도
  const watchdogIdx = idolState.currentIdx;
  const watchdogTurn = idolState.turnNum;
  setTimeout(() => {
    if (!idolState || idolState.phase !== 'playing') return;
    if (idolState.currentIdx !== watchdogIdx || idolState.turnNum !== watchdogTurn) return;
    if (idolState.pendingAction?.type !== 'waiting-roll') return;
    const cp = idolCurrentPlayer();
    if (!cp || !idolIsCpuPlayerId(cp.id)) return;
    // CPU가 아직 주사위를 굴리지 않음 → 강제 실행
    if (typeof aiIdol === 'function') aiIdol();
    else idolRollDice();
  }, 3500);
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
  if (gs) {
    idolState = gs;
    // 브로드캐스트 시 숨겨진 내 호감도 복원
    if (idolState._myFavor !== undefined) {
      const me = idolState.players.find(p => p.id === state.myId);
      if (me) {
        me.favor = idolState._myFavor;
        me.lastFavorDir = idolState._myFavorDir ?? null;
      }
    }
  }
  showScreen('idolGame');
  idolRenderAll();
}

function idolRenderAll() {
  if (!idolState) return;
  // 선택 화면 인라인 스타일 초기화
  const screen = document.getElementById('idolGame');
  const panel = document.getElementById('idolActionPanel');
  const board = document.getElementById('idolBoardWrapper');
  const resBar = document.getElementById('idolResourceBar');
  if (screen) screen.classList.remove('idol-select-mode');
  idolRemoveSelectOverlay();
  if (panel) { panel.style.flex = ''; panel.style.overflowY = ''; panel.style.maxHeight = ''; }
  if (panel) panel.style.display = '';
  if (board) board.style.display = '';
  if (resBar) resBar.style.display = '';
  idolRenderHeader();
  idolRenderResourceBar();
  idolRenderBoard();
  idolRenderCenterPanel();
  idolRenderActionPanel();
  // 카메라 제스처 초기화 (첫 렌더 때 한 번만)
  idolCamInitGestures();
  // 현재 카메라 상태 즉시 반영
  _idolCamFlush();
}

// ─── 헤더 렌더 ────────────────────────────────
function idolRenderHeader() {
  const el = document.getElementById('idolTurnBadge');
  if (el) el.textContent = `${idolState.turnNum} / ${IDOL_TOTAL_TURNS}턴`;
}

// ─── 보드 렌더 ────────────────────────────────
function idolRenderBoard() {
  const viewport = document.getElementById('idolBoardViewport');
  if (!viewport) return;

  const existingSvg = document.getElementById('idolIsoBoardSvg');
  if (existingSvg && typeof idolIsoUpdateCellHighlights === 'function') {
    // 이미 SVG가 있으면 하이라이트/소유자 점만 갱신 (가벼운 업데이트)
    idolIsoUpdateCellHighlights(idolState);
  } else if (typeof idolRenderIsoBoard === 'function') {
    // 최초 렌더 또는 SVG 소실 시 전체 재빌드
    idolRenderIsoBoard(viewport, idolState);
  }

  // 토큰 레이어 동기화 (viewport 기준)
  idolSyncTokenLayer(viewport, null);
}

// ─── 토큰 레이어 관련 ─────────────────────────

// 셀 인덱스 → 보드 로컬 좌표계 중심 {x, y}
// ISO 수학 기반 (DOM 측정 없음, 항상 정확)
function idolGetCellCenter(cellIdx) {
  if (typeof ISO_BOARD === 'undefined') return null;
  const coords = idolGetCellGridCoords();
  const cr = coords[cellIdx];
  if (!cr) return null;
  const [c, r] = cr;
  return {
    x: ISO_BOARD.OX + (c - r)     * ISO_BOARD.HW,
    y: ISO_BOARD.OY + (c + r + 1) * ISO_BOARD.HH,
  };
}

// 토큰 레이어 동기화 (ISO 보드: viewport 안에 토큰 레이어 배치)
function idolSyncTokenLayer(parent, _unused) {
  if (!parent) parent = document.getElementById('idolBoardViewport');
  if (!parent || !idolState) return;

  let layer = document.getElementById('idolTokenLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'idolTokenLayer';
    layer.className = 'idol-token-layer';
  }
  parent.appendChild(layer); // 뷰포트 맨 뒤에 배치 (SVG 위에 오도록)

  // 파산 플레이어 토큰 제거
  layer.querySelectorAll('[data-tok-id]').forEach(el => {
    const pid = el.dataset.tokId;
    const player = idolState.players.find(p => p.id === pid);
    if (!player || player.bankrupt) el.remove();
  });

  // 활성 플레이어 토큰 생성 / 위치 즉시 갱신
  idolState.players.filter(p => !p.bankrupt).forEach(p => {
    let tokenEl = layer.querySelector(`[data-tok-id="${p.id}"]`);
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'idol-board-token';
      tokenEl.dataset.tokId = p.id;
      tokenEl.style.setProperty('--tok-color', idolUxGetPlayerAccent(p.id));
      tokenEl.title = p.name;
      const inner = document.createElement('span');
      inner.className = 'idol-board-token-inner';
      inner.textContent = p.avatar || '🙂';
      tokenEl.appendChild(inner);
      layer.appendChild(tokenEl);
    }

    // 애니메이션 중이 아닌 경우에만 위치 업데이트
    if (!tokenEl.classList.contains('tok-moving')) {
      const c = idolGetCellCenter(p.pos);
      if (c) {
        // transition 잠시 끄고 즉시 배치
        tokenEl.style.transition = 'none';
        tokenEl.style.left = c.x + 'px';
        tokenEl.style.top  = c.y + 'px';
        // 다음 프레임부터 transition 복원
        requestAnimationFrame(() => { tokenEl.style.transition = ''; });
      }
    }
  });
}

// 토큰을 fromPos → toPos까지 한 칸씩 이동
function idolAnimateMoveToken(playerId, fromPos, toPos, onDone) {
  const totalCells = BOARD_CELLS.length; // 36

  // 이동 경로 (시계방향)
  const path = [];
  let cur = fromPos;
  while (cur !== toPos) {
    cur = (cur + 1) % totalCells;
    path.push(cur);
  }

  if (path.length === 0) { if (onDone) onDone(); return; }

  // 칸 수에 따라 스텝 간격 조정 (1칸=250ms, 12칸+=120ms)
  const stepMs = Math.max(120, Math.min(250, 120 + (14 - path.length) * 10));

  // 레이어가 없으면 먼저 생성 (viewport 기준)
  const viewport = document.getElementById('idolBoardViewport');
  if (!document.getElementById('idolTokenLayer')) idolSyncTokenLayer(viewport, null);

  const layer   = document.getElementById('idolTokenLayer');
  const tokenEl = layer ? layer.querySelector(`[data-tok-id="${playerId}"]`) : null;

  if (!tokenEl) { if (onDone) onDone(); return; }

  tokenEl.classList.add('tok-moving');

  let step = 0;
  function nextStep() {
    if (step >= path.length) {
      // 완료
      tokenEl.classList.remove('tok-moving', 'tok-bounce', 'tok-land');
      if (typeof _idolIsoSetStepHL === 'function') _idolIsoSetStepHL(null);
      if (onDone) onDone();
      return;
    }

    const pos    = path[step];
    const isLast = (step === path.length - 1);

    // 토큰 이동 (CSS transition이 처리)
    const c = idolGetCellCenter(pos);
    if (c) {
      tokenEl.style.left = c.x + 'px';
      tokenEl.style.top  = c.y + 'px';
      // 카메라가 이동 중인 토큰을 lerp로 부드럽게 따라가도록
      idolCamFollowPos(c.x, c.y);
    }

    // 바운스 애니메이션 클래스 교체
    tokenEl.classList.remove('tok-bounce', 'tok-land');
    void tokenEl.offsetWidth; // reflow
    tokenEl.classList.add(isLast ? 'tok-land' : 'tok-bounce');

    // ISO 보드: 현재 스텝 칸 하이라이트
    if (typeof _idolIsoSetStepHL === 'function') _idolIsoSetStepHL(pos);

    step++;
    setTimeout(nextStep, stepMs);
  }

  nextStep();
}

// 36칸 → 10x10 외곽 그리드 좌표
function idolGetCellGridCoords() {
  const coords = [];
  for (let i = 0; i <= 9; i++) coords.push([i, 9]);       // 하단: 0~9
  for (let i = 8; i >= 0; i--) coords.push([9, i]);        // 우측: 10~18
  for (let i = 8; i >= 0; i--) coords.push([i, 0]);        // 상단: 19~27
  for (let i = 1; i <= 8; i++) coords.push([0, i]);         // 좌측: 28~35
  return coords;
}

// ─── 카메라 시스템 (rAF lerp 기반) ────────────

// DOM에 현재(current) 값 즉시 반영
function _idolCamFlush() {
  const vp = document.getElementById('idolBoardViewport');
  if (!vp) return;
  vp.style.transform =
    'translate(' + _idolCam.x.toFixed(2) + 'px,' + _idolCam.y.toFixed(2) + 'px)' +
    ' scale(' + _idolCam.zoom.toFixed(4) + ')';
}

// rAF 루프: current → target 으로 lerp
function _idolCamTick() {
  const c = _idolCam;
  const ex = c.tx - c.x;
  const ey = c.ty - c.y;
  const ez = c.tzoom - c.zoom;

  const done = Math.abs(ex) < 0.04 && Math.abs(ey) < 0.04 && Math.abs(ez) < 0.0002;
  if (done) {
    c.x = c.tx; c.y = c.ty; c.zoom = c.tzoom;
    _idolCamFlush();
    _idolCamRafId = null;
    return;
  }

  c.x    += ex * _CAM_LERP;
  c.y    += ey * _CAM_LERP;
  c.zoom += ez * _CAM_LERP;
  _idolCamFlush();
  _idolCamRafId = requestAnimationFrame(_idolCamTick);
}

// lerp 루프 시작 (중복 방지)
function _idolCamKick() {
  if (!_idolCamRafId) {
    _idolCamRafId = requestAnimationFrame(_idolCamTick);
  }
}

// 목표 pan 클램프 (보드 범위 밖으로 못 나가게)
function _idolCamClamp() {
  const bW = (typeof ISO_BOARD !== 'undefined') ? ISO_BOARD.SVG_W : 580;
  const bH = (typeof ISO_BOARD !== 'undefined') ? ISO_BOARD.SVG_H : 320;
  const maxX = bW * Math.max(0, _idolCam.tzoom - 1) * 0.55 + bW * 0.08;
  const maxY = bH * Math.max(0, _idolCam.tzoom - 1) * 0.55 + bH * 0.08;
  _idolCam.tx = Math.max(-maxX, Math.min(maxX, _idolCam.tx));
  _idolCam.ty = Math.max(-maxY, Math.min(maxY, _idolCam.ty));
}

// 스크린 오프셋(sx, sy) 기준 줌 — target에만 적용
function _idolCamZoomAt(newZoom, sx, sy) {
  const oldZoom = _idolCam.tzoom;
  newZoom = Math.max(_CAM_ZOOM_MIN, Math.min(_CAM_ZOOM_MAX, newZoom));
  if (oldZoom === newZoom) return;
  // 커서·핀치 위치가 공간상 고정되도록 pan 보정
  _idolCam.tx = sx - newZoom * (sx - _idolCam.tx) / oldZoom;
  _idolCam.ty = sy - newZoom * (sy - _idolCam.ty) / oldZoom;
  _idolCam.tzoom = newZoom;
  _idolCamClamp();
}

// ── 공개 API ──────────────────────────────────

// 보드 로컬 좌표 → 화면 중심으로 lerp 이동
function idolCamFollowPos(cx, cy) {
  const bW = (typeof ISO_BOARD !== 'undefined') ? ISO_BOARD.SVG_W : 580;
  const bH = (typeof ISO_BOARD !== 'undefined') ? ISO_BOARD.SVG_H : 320;
  _idolCam.tx = -_idolCam.tzoom * (cx - bW / 2);
  _idolCam.ty = -_idolCam.tzoom * (cy - bH / 2);
  _idolCamClamp();
  _idolCamKick();
}

// 셀 인덱스 기준 팔로우
function idolCamFollow(cellIdx) {
  const c = idolGetCellCenter(cellIdx);
  if (c) idolCamFollowPos(c.x, c.y);
}

// 줌 버튼 (lerp)
function idolCamZoomIn() {
  _idolCamZoomAt(_idolCam.tzoom * 1.35, 0, 0);
  _idolCamKick();
}
function idolCamZoomOut() {
  _idolCamZoomAt(_idolCam.tzoom / 1.35, 0, 0);
  _idolCamKick();
}
function idolCamReset() {
  let fitZoom = 1;
  const wrapper = document.getElementById('idolBoardWrapper');
  if (wrapper && typeof ISO_BOARD !== 'undefined') {
    const wW = wrapper.offsetWidth, wH = wrapper.offsetHeight;
    if (wW > 0 && wH > 0) fitZoom = Math.min(wW / ISO_BOARD.SVG_W, wH / ISO_BOARD.SVG_H) * 0.9;
  }
  _idolCam.tx = 0; _idolCam.ty = 0; _idolCam.tzoom = fitZoom;
  _idolCamKick();
}

// 터치·마우스·휠 제스처 초기화 (한 번만 실행)
function idolCamInitGestures() {
  if (_idolCamGestureInit) return;
  _idolCamGestureInit = true;

  const wrapper = document.getElementById('idolBoardWrapper');
  if (!wrapper) return;

  function wrapCenter() {
    const r = wrapper.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  // ── 마우스 휠 줌 ──
  wrapper.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const wc = wrapCenter();
    _idolCamZoomAt(_idolCam.tzoom * factor, e.clientX - wc.cx, e.clientY - wc.cy);
    _idolCamKick();
  }, { passive: false });

  // ── 마우스 드래그 팬 (delta 방식, 1:1 반응) ──
  let _mPrev = null;
  wrapper.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _mPrev = { x: e.clientX, y: e.clientY };
    const vp = document.getElementById('idolBoardViewport');
    if (vp) vp.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!_mPrev) return;
    const dx = e.clientX - _mPrev.x;
    const dy = e.clientY - _mPrev.y;
    _mPrev = { x: e.clientX, y: e.clientY };
    // 드래그 중: current·target 동시 이동 (lerp 없이 1:1)
    _idolCam.tx += dx; _idolCam.ty += dy;
    _idolCamClamp();
    _idolCam.x = _idolCam.tx; _idolCam.y = _idolCam.ty;
    _idolCamFlush();
  });
  window.addEventListener('mouseup', () => {
    _mPrev = null;
    const vp = document.getElementById('idolBoardViewport');
    if (vp) vp.classList.remove('dragging');
  });

  // ── 터치 팬·핀치줌 (delta 방식) ──
  let _prevTouches = [];

  wrapper.addEventListener('touchstart', e => {
    _prevTouches = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }, { passive: true });

  wrapper.addEventListener('touchmove', e => {
    e.preventDefault();
    const cur = Array.from(e.touches);
    const wc  = wrapCenter();

    if (cur.length === 1 && _prevTouches.length >= 1) {
      // 단일 터치 팬 (1:1 직접 이동)
      const prev = _prevTouches.find(p => p.id === cur[0].identifier) || _prevTouches[0];
      const dx = cur[0].clientX - prev.x;
      const dy = cur[0].clientY - prev.y;
      _idolCam.tx += dx; _idolCam.ty += dy;
      _idolCamClamp();
      _idolCam.x = _idolCam.tx; _idolCam.y = _idolCam.ty;
      _idolCamFlush();

    } else if (cur.length === 2 && _prevTouches.length >= 2) {
      // 핀치줌 + 팬 (프레임 간 delta, 누적 오차 없음)
      const t0 = cur[0], t1 = cur[1];
      const p0 = _prevTouches.find(p => p.id === t0.identifier) || _prevTouches[0];
      const p1 = _prevTouches.find(p => p.id === t1.identifier) || _prevTouches[1];

      const prevDist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const curDist  = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

      // 핀치 중심 (스크린 오프셋)
      const midX = (t0.clientX + t1.clientX) / 2 - wc.cx;
      const midY = (t0.clientY + t1.clientY) / 2 - wc.cy;
      const pmidX = (p0.x + p1.x) / 2 - wc.cx;
      const pmidY = (p0.y + p1.y) / 2 - wc.cy;

      // 줌 delta 적용
      _idolCamZoomAt(_idolCam.tzoom * (curDist / prevDist), midX, midY);
      // 중심점 이동 (팬)
      _idolCam.tx += midX - pmidX;
      _idolCam.ty += midY - pmidY;
      _idolCamClamp();
      // 핀치/팬은 즉시 반영 (1:1)
      _idolCam.x = _idolCam.tx; _idolCam.y = _idolCam.ty;
      _idolCam.zoom = _idolCam.tzoom;
      _idolCamFlush();
    }

    _prevTouches = cur.map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }, { passive: false });

  wrapper.addEventListener('touchend', e => {
    _prevTouches = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }, { passive: true });
  wrapper.addEventListener('touchcancel', () => {
    _prevTouches = [];
  }, { passive: true });
}

// idolRenderResourceBar, idolCreateCellElement, idolRenderCenterHTML →
// 파일 하단 UX 개선 버전에서 정의됩니다.

// ─── 액션 패널 렌더 ───────────────────────────
// idolRenderActionPanel() → 파일 하단 UX 개선 버전에서 정의됩니다.

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
  const takeoverPrice = Math.floor(shop.price * 1.5);
  const currentP = idolCurrentPlayer();
  const canPropose = !isOwned && currentP && currentP.money >= takeoverPrice;
  const takeoverBtn = !isOwned
    ? `<button class="idol-btn idol-btn-gold" onclick="idolProposeTakeover('${shopId}')" ${canPropose ? '' : 'disabled'}>
        🏠 인수 제안 (${takeoverPrice}만)
       </button>`
    : '';
  return `
    <div class="idol-action-title">🎓 ${escapeHTML(shop.name)} 훈련</div>
    <div class="idol-popup-sub">${stat} 훈련 ${isOwned ? '(전속 보너스 +1)' : '(효율 -1)'}</div>
    <div class="idol-action-buttons">
      <button class="idol-btn idol-btn-primary" onclick="idolTrainAtShop('${shopId}', ${isOwned})">훈련하기</button>
      ${takeoverBtn}
      <button class="idol-btn" onclick="idolSkipTrain()">건너뛰기</button>
    </div>`;
}

function idolRenderTrainResult(action) {
  const DICE_EMOJIS = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
  const statLabel = action.stat === 'talent' ? '재능' : action.stat === 'looks' ? '외모' : '인기도';
  const confirmBtn = state.isHost
    ? `<div class="idol-action-buttons"><button class="idol-btn idol-btn-primary" onclick="idolConfirmTrainResult()">확인</button></div>`
    : `<div class="idol-popup-sub" style="opacity:.6;">결과 확인 대기 중...</div>`;
  return `
    <div class="idol-train-result">
      <div class="idol-action-title">훈련 결과!</div>
      <div class="idol-train-die">${DICE_EMOJIS[action.die]}</div>
      <div class="idol-train-gain">+${action.gain} ${statLabel}</div>
      ${confirmBtn}
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
  if (card.target) {
    const others = idolState.players.filter(p => p.id !== state.myId && !p.bankrupt);
    if (others.length === 0) {
      // 대상이 없으면 자신에게 적용
      return `
        <div class="idol-action-title">⚡ ${escapeHTML(card.title)}</div>
        <div class="idol-popup-sub">대상 플레이어 없음 — 자신에게 적용됩니다</div>
        <div class="idol-action-buttons">
          <button class="idol-btn idol-btn-gold" onclick="idolApplyChance('${card.id}', null)">확인</button>
        </div>`;
    }
    const targetsHTML = others.map(p =>
      `<button class="idol-choice-btn" onclick="idolApplyChance('${card.id}', '${p.id}')">
        ${p.avatar} ${escapeHTML(p.name)}
      </button>`
    ).join('');
    return `
      <div class="idol-action-title">⚡ ${escapeHTML(card.title)}</div>
      <div class="idol-popup-sub">${escapeHTML(card.desc)} — 대상을 선택하세요</div>
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
  showToast(`🚓 ${escapeHTML(p.name)} 수감 중... (남은 턴: ${p.jailTurns})`);
  idolState.pendingAction = { type: 'turn-end-auto' };
  broadcastIdolState();
  idolRenderAll();
  setTimeout(() => idolOnTurnEnd(false), 800);
}

// ─── 선택 화면 ────────────────────────────────
let _idolSelections = {};
let _idolSelectionLocked = false;

function idolIsCpuPlayerId(pid) {
  return /^cpu\d+$/.test(String(pid ?? ''));
}

// ─── 플레이어 연결 끊김 처리 ──────────────────
// core.js disconnect 핸들러에서 호출됨 (호스트 전용)
function idolHandlePlayerDisconnect(playerId) {
  if (!state.isHost || !idolState || !idolState.players) return;
  const p = idolState.players.find(pl => pl.id === playerId);
  if (!p || p.bankrupt) return;

  // 보유 샵 전부 반환 (소유권 제거)
  p.ownedShops.forEach(shopId => {
    delete idolState.shopOwners[shopId];
    idolState.shopLevels[shopId] = 0;
  });
  p.ownedShops = [];
  idolCheckBeautyMonopoly();

  // 파산 처리로 이후 턴에서 자동 스킵
  p.bankrupt = true;

  showToast(`${p.name} 연결 끊김 — 게임에서 제외됩니다`);

  // 남은 활성 플레이어가 1명 이하면 게임 종료
  const alive = idolState.players.filter(pl => !pl.bankrupt);
  if (alive.length <= 1) {
    broadcastIdolState();
    idolRenderAll();
    setTimeout(() => idolEndGame(), 1000);
    return;
  }

  // 현재 턴이 끊긴 플레이어 차례였으면 즉시 다음 턴으로
  const currentId = idolState.order[idolState.currentIdx];
  if (currentId === playerId) {
    idolState.pendingAction = { type: 'turn-end-auto' };
    broadcastIdolState();
    idolRenderAll();
    setTimeout(() => {
      if (idolState?.pendingAction?.type === 'turn-end-auto') {
        idolAdvanceTurn();
      }
    }, 800);
  } else {
    broadcastIdolState();
    idolRenderAll();
  }
}

function idolResetSelectionState() {
  _idolSelections = {};
  _idolSelectionLocked = false;
}

function idolAutoFillCpuSelections() {
  const fallbackType = _idolSelections[state.myId]?.typeId ?? 'ai';
  (state.players || []).forEach((p, idx) => {
    if (!idolIsCpuPlayerId(p.id)) return;
    if (_idolSelections[p.id]) return;
    const typeId = IDOL_TYPES[idx % IDOL_TYPES.length]?.id ?? fallbackType;
    _idolSelections[p.id] = { typeId, name: p.name };
  });
}

function idolGetSelectionProgress() {
  const humans = (state.players || []).filter(p => !idolIsCpuPlayerId(p.id));
  const selected = humans.filter(p => _idolSelections[p.id]).length;
  return {
    total: Math.max(1, humans.length),
    selected,
    waiting: humans.filter(p => !_idolSelections[p.id]),
  };
}

function idolTryStartGameFromSelections() {
  if (!state.isHost || idolState) return false;

  idolAutoFillCpuSelections();

  const allSelected = (state.players || []).every(p => !!_idolSelections[p.id]);
  if (!allSelected) return false;

  const selections = state.players.map(p => ({
    playerId: p.id,
    idolTypeId: _idolSelections[p.id]?.typeId ?? 'ai',
    idolName: _idolSelections[p.id]?.name ?? null,
  }));

  idolInitGame(selections);
  return true;
}

function idolGetSelectOverlay() {
  const screen = document.getElementById('idolGame');
  if (!screen) return null;

  let overlay = screen.querySelector('#idolSelectOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'idolSelectOverlay';
    overlay.className = 'idol-select-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '아이돌 선택');
    screen.appendChild(overlay);
  }
  return overlay;
}

function idolRemoveSelectOverlay() {
  const overlay = document.getElementById('idolSelectOverlay');
  if (overlay) overlay.remove();
}

function idolShowSelectPhase() {
  if (idolState) {
    idolRenderAll();
    return;
  }

  const screen = document.getElementById('idolGame');
  const panel = document.getElementById('idolActionPanel');
  const board  = document.getElementById('idolBoardWrapper');
  const resBar = document.getElementById('idolResourceBar');
  const overlay = idolGetSelectOverlay();
  const selectedType = _idolSelections._selectedType ?? 'ai';
  const mySaved = _idolSelections[state.myId] || null;
  const locked = !!_idolSelectionLocked;
  const progress = idolGetSelectionProgress();
  const waitingNames = state.isHost
    ? progress.waiting.filter(p => p.id !== state.myId).map(p => p.name).slice(0, 3)
    : [];
  const selectedMeta = IDOL_TYPES.find(t => t.id === (mySaved?.typeId ?? selectedType));

  if (board)  board.style.display  = 'none';
  if (resBar) resBar.style.display = 'none';
  if (panel) panel.style.display = 'none';
  if (screen) screen.classList.add('idol-select-mode');
  if (!overlay) return;

  const waitingText = state.isHost
    ? (progress.waiting.filter(p => p.id !== state.myId).length > 0
        ? `다른 플레이어 선택 대기 중 (${progress.selected}/${progress.total})`
        : '게임 시작 준비 중...')
    : '선택이 제출되었습니다. 호스트 시작을 기다리는 중입니다.';

  if (locked) {
    overlay.innerHTML = `
      <div class="idol-select-overlay-card idol-select-wait-card">
        <div class="idol-select-title">🎤 선택 완료</div>
        <div class="idol-select-progress">
          ${state.isHost ? `선택 진행: <b>${progress.selected}</b> / ${progress.total}명` : '아이돌이 확정되었습니다'}
        </div>
        <div class="idol-select-picked">
          <div class="idol-select-picked-media">
            ${selectedMeta?.img ? `<img src="${selectedMeta.img}" alt="${escapeHTML(selectedMeta.name)}" class="idol-select-picked-img">` : '<div class="idol-select-picked-img idol-select-picked-fallback">🎤</div>'}
          </div>
          <div class="idol-select-picked-body">
            <div class="idol-select-picked-name">${escapeHTML(mySaved?.name || selectedMeta?.name || '아이돌')}</div>
            <div class="idol-select-picked-sub">${escapeHTML(selectedMeta?.type || '')}</div>
            <div class="idol-select-picked-desc">${escapeHTML(selectedMeta?.desc || '')}</div>
          </div>
        </div>
        <div class="idol-select-wait">${escapeHTML(waitingText)}</div>
        ${state.isHost && waitingNames.length
          ? `<div class="idol-select-help">대기 중: ${escapeHTML(waitingNames.join(', '))}${progress.waiting.length - waitingNames.length > 0 ? ' 외' : ''}</div>`
          : ''}
      </div>
    `;
    return;
  }

  const idolTypeOptions = IDOL_TYPES.map(t => `
      <div class="idol-type-card ${selectedType === t.id ? 'selected' : ''}" id="idolTypeCard_${t.id}" data-type="${t.id}" onclick="idolSelectType('${t.id}')">
        <div class="idol-type-img-wrap">
          <img src="${t.img}" alt="${t.name}" class="idol-type-img" loading="lazy">
          <div class="idol-type-img-overlay"></div>
        </div>
        <div class="idol-type-info">
          <div class="idol-type-name">${t.name} <span class="idol-type-tag">${t.type}</span></div>
          <div class="idol-type-bonus">${t.desc}</div>
        </div>
      </div>`).join('');

  overlay.innerHTML = `
      <div class="idol-select-overlay-card">
      <div class="idol-select-screen">
        <div class="idol-select-title">🎤 아이돌 선택</div>
        <div class="idol-select-progress">
          ${state.isHost
            ? `선택 진행: <b>${progress.selected}</b> / ${progress.total}명`
            : '아이돌은 한 번 선택하면 변경할 수 없습니다'}
        </div>
        ${state.isHost && waitingNames.length
          ? `<div class="idol-select-help">대기 중: ${escapeHTML(waitingNames.join(', '))}${progress.waiting.length - waitingNames.length > 0 ? ' 외' : ''}</div>`
          : ''}
        <div class="idol-type-grid">${idolTypeOptions}</div>
        <input id="idolNameInput" class="input-field" placeholder="아이돌 이름 (선택)" maxlength="8"
          value="${escapeHTML(mySaved?.name ?? '')}"
          style="margin-top:4px;padding:10px 12px;font-size:14px;">
        <button id="idolSelectConfirmBtn" class="idol-btn idol-btn-primary" onclick="idolConfirmSelection()" style="margin-top:6px;">
          선택 완료
        </button>
      </div>
      </div>`;
}

function idolSelectType(typeId) {
  if (_idolSelectionLocked || idolState) return;
  document.querySelectorAll('.idol-type-card').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`idolTypeCard_${typeId}`);
  if (el) el.classList.add('selected');
  _idolSelections._selectedType = typeId;
}

function idolConfirmSelection() {
  if (idolState || _idolSelectionLocked) return;
  const typeId = _idolSelections._selectedType ?? 'ai';
  const name   = document.getElementById('idolNameInput')?.value.trim() || '';
  _idolSelections[state.myId] = { typeId, name };
  _idolSelectionLocked = true;

  if (state.isHost) {
    if (!idolTryStartGameFromSelections()) {
      showToast('선택 완료! 다른 플레이어를 기다리는 중...');
      idolShowSelectPhase();
    }
  } else {
    broadcast({ type: 'idol-player-select', typeId, name });
    showToast('선택 완료! 변경 불가 · 호스트 시작 대기 중');
    idolShowSelectPhase();
  }
}

// ─── 메시지 수신 핸들러 ───────────────────────
function handleIdolMsg(msg) {
  switch (msg.type) {
    case 'idol-state':
      // 게임이 실제 시작된(playing) 경우에만 선택 잠금 해제 (race condition 방지)
      if (msg.state?.phase === 'playing') _idolSelectionLocked = false;
      renderIdolView(msg.state);
      break;
    case 'idol-player-select':
      if (state.isHost) {
        if (idolState || !msg.from || _idolSelections[msg.from]) break;
        _idolSelections[msg.from] = { typeId: msg.typeId, name: msg.name };
        if (!idolTryStartGameFromSelections()) idolShowSelectPhase();
      }
      break;
  }
}

// ─── 연습 모드 (AI) ───────────────────────────
function idolStartPractice() {
  // startPracticeGame('idol')이 state.players에 ai-* ID로 설정한 플레이어들을 cpu* 형식으로 변환
  if (state.players && state.players.some(p => p.id && p.id.startsWith('ai-'))) {
    state.players = state.players.map((p) => {
      if (!p.id || !p.id.startsWith('ai-')) return p;
      const idx = parseInt(p.id.replace('ai-', ''), 10);
      return { id: `cpu${idx}`, name: p.name || `CPU ${idx + 1}`, avatar: p.avatar || ['🤖','👾','🎭'][idx % 3] };
    });
  } else if (!state.players || state.players.length <= 1) {
    // 단독 호출 시 기본 플레이어 구성 (인간 1 + CPU 2)
    state.players = [
      { id: state.myId || ('p-' + Math.random().toString(36).substr(2, 5)), name: state.myName || '플레이어', avatar: state.myAvatar || '😎' },
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `cpu${i}`, name: `CPU ${i + 1}`, avatar: ['🤖','👾','🎭'][i % 3],
      })),
    ];
  }
  state.isHost = true;
  idolState = null;
  idolResetSelectionState();
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
    case 'shop-takeover-offer': return { label: '인수 제안', tone: 'gold' };
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
    case 'shop-takeover-offer': return state.isHost ? '인수 제안 수락/거절 여부를 결정하세요.' : '인수 제안 처리 중입니다.';
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
  const favorDir = idolState._myFavorDir ?? me.lastFavorDir ?? null;
  const favorIcon = favorDir === 'up' ? '💗⬆' : favorDir === 'down' ? '💗⬇' : '💗';
  const turnProgress = Math.max(0, Math.min(100, Math.round((idolState.turnNum / IDOL_TOTAL_TURNS) * 100)));
  const currentP = idolCurrentPlayer();
  const currentCell = idolUxGetBoardCellMeta(me);
  const actionMeta = idolUxGetActionMeta(idolState.pendingAction);

  const meType = IDOL_TYPES.find(t => t.id === me.idolType);
  const idolPortraitHTML = meType?.img
    ? `<img src="${meType.img}" alt="${meType.name}" class="idol-res-idol-img">`
    : `<span class="idol-res-idol-emoji">${meType?.emoji ?? '🌟'}</span>`;

  bar.innerHTML = `
    <div class="idol-topdash">
      <div class="idol-res-hero">
        <div class="idol-res-hero-top">
          <span class="idol-status-chip ${idolUxToneClass(actionMeta.tone)}">${actionMeta.label}</span>
          <span class="idol-status-chip tone-muted">${rank}위 / ${activePlayers.length}명</span>
        </div>

        <div class="idol-res-hero-name" style="--idol-accent:${idolUxGetPlayerAccent(me.id)}; --tok-color:${idolUxGetPlayerAccent(me.id)};">
          <div class="idol-res-portraits">
            <div class="idol-res-producer-wrap" title="${escapeHTML(me.name)} (프로듀서)">
              <span class="idol-res-producer-emoji">${me.avatar ?? '🎤'}</span>
            </div>
            <div class="idol-res-idol-wrap" title="${escapeHTML(me.idolName ?? meType?.name ?? '아이돌')}">
              ${idolPortraitHTML}
            </div>
          </div>
          <div class="idol-res-hero-texts">
            <div class="idol-res-hero-title">${escapeHTML(me.idolName ?? me.name)}</div>
            <div class="idol-res-hero-sub">
              <span>${escapeHTML(me.name)}</span>
              <span class="idol-dot-sep" aria-hidden="true"></span>
              <span style="color:${stage.color};">${stage.emoji} ${stage.name}</span>
            </div>
          </div>
        </div>

        <div class="idol-turn-progress" role="progressbar" aria-label="턴 진행률" aria-valuemin="0" aria-valuemax="${IDOL_TOTAL_TURNS}" aria-valuenow="${idolState.turnNum}">
          <div class="idol-turn-progress-track">
            <div class="idol-turn-progress-fill" style="width:${turnProgress}%"></div>
          </div>
          <div class="idol-turn-progress-label">${idolState.turnNum} / ${IDOL_TOTAL_TURNS}턴 진행</div>
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
          <span class="idol-res-icon">${favorIcon}</span>
          <span class="idol-res-label">호감도</span>
          <span class="idol-res-value">비공개</span>
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

  // 토큰은 별도의 idol-token-layer에서 렌더링

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

    const idolImgHTML = pType?.img
      ? `<img src="${pType.img}" alt="${pType.name}" class="idol-mini-idol-img">`
      : `<span class="idol-mini-idol-emoji">${pType?.emoji ?? '🌟'}</span>`;
    return `
      <div class="idol-player-mini ${isCurrent ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''}" style="--idol-accent:${idolUxGetPlayerAccent(p.id)};">
        <div class="idol-player-mini-portraits">
          <div class="idol-mini-producer" title="${escapeHTML(p.name)} (프로듀서)" style="--tok-color:${idolUxGetPlayerAccent(p.id)}">
            <span class="idol-mini-producer-emoji">${p.avatar || '🙂'}</span>
          </div>
          <div class="idol-mini-idol" title="${pType?.name ?? '아이돌'}">
            ${idolImgHTML}
          </div>
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
  const cpType = IDOL_TYPES.find(t => t.id === currentP.idolType);
  const cpIdolImg = cpType?.img
    ? `<img src="${cpType.img}" alt="${cpType.name}" class="idol-res-idol-img">`
    : `<span class="idol-res-idol-emoji">${cpType?.emoji ?? '🌟'}</span>`;

  return `
    <div class="idol-action-context">
      <div class="idol-action-context-row">
        <div class="idol-action-context-title">행동 안내</div>
        <div class="idol-action-context-chips">
          <span class="idol-status-chip ${idolUxToneClass(actionMeta.tone)}">${actionMeta.label}</span>
          <span class="idol-status-chip tone-muted">${isMyTurn ? '입력 가능' : '관전'}</span>
        </div>
      </div>

      <div class="idol-action-context-player" style="--idol-accent:${idolUxGetPlayerAccent(currentP.id)}; --tok-color:${idolUxGetPlayerAccent(currentP.id)};">
        <div class="idol-res-portraits idol-action-portraits">
          <div class="idol-res-producer-wrap" title="${escapeHTML(currentP.name)} (프로듀서)">
            <span class="idol-res-producer-emoji">${currentP.avatar ?? '🎤'}</span>
          </div>
          <div class="idol-res-idol-wrap" title="${cpType?.name ?? '아이돌'}">
            ${cpIdolImg}
          </div>
        </div>
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
    case 'shop-takeover-offer':
      contentHtml = idolRenderTakeoverPanel(action);
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
      // 자동 진행은 idolRollDice()에서 단 한 번 설정됨
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

// ─── ISO 보드 중앙 패널 ────────────────────────
// 평상시: 플레이어 랭킹 + 스탯 미니 카드
function idolRenderCenterPanel() {
  const panel = document.getElementById('idolCenterPanel');
  if (!panel || !idolState) return;

  // 오버라이드 중이면 스탯 갱신 안 함
  const overlay = document.getElementById('idolCenterOverlay');
  if (overlay && overlay.style.display !== 'none') return;

  const currentP = idolCurrentPlayer();

  // 명성 기준 내림차순 정렬 (랭킹 순)
  const sorted = [...idolState.order]
    .map(id => idolState.players.find(p => p.id === id))
    .filter(Boolean)
    .sort((a, b) => b.fame - a.fame);

  const rows = sorted.map((p, i) => {
    const rank    = p.bankrupt ? '탈' : `${i + 1}위`;
    const isCur   = currentP && p.id === currentP.id;
    const accent  = idolUxGetPlayerAccent(p.id);
    const moneyFmt = p.money >= 1000
      ? (p.money / 1000).toFixed(1) + 'k'
      : String(p.money);
    const name = escapeHTML(p.name.length > 5 ? p.name.slice(0, 5) + '…' : p.name);

    return `<div class="iso-cp-row${isCur ? ' is-current' : ''}${p.bankrupt ? ' is-bankrupt' : ''}"
                 style="--cp-accent:${accent}">
      <span class="iso-cp-rank">${rank}</span>
      <span class="iso-cp-av">${p.avatar || '🙂'}</span>
      <span class="iso-cp-name">${name}</span>
      <span class="iso-cp-fame">⭐${p.fame}</span>
      <span class="iso-cp-money">💰${moneyFmt}</span>
    </div>`;
  }).join('');

  panel.innerHTML = rows;
}

// 오버라이드 표시 (이벤트 연출용 — 지금은 흰색 빈 박스)
// html 인자를 나중에 채워 쓰면 됨
function idolCenterPanelShowOverride(html) {
  const overlay = document.getElementById('idolCenterOverlay');
  if (!overlay) return;
  overlay.innerHTML = html ?? '';
  overlay.style.display = 'flex';
}

function idolCenterPanelHideOverride() {
  const overlay = document.getElementById('idolCenterOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  idolRenderCenterPanel(); // 스탯 패널 갱신
}

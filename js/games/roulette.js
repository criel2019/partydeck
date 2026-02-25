// ===== RUSSIAN ROULETTE ENGINE =====
let rrState = {
  bullets: 1,
  chambers: 6,
  cylinder: [],
  currentChamber: 0,
  turnIdx: 0,
  players: [],
  phase: 'setup',
  setupDone: false,
  lastResult: null,
};

function startRussianRoulette() {
  if(!state.isHost) return;

  rrState = {
    bullets: 1,
    chambers: 6,
    cylinder: [],
    currentChamber: 0,
    turnIdx: 0,
    players: state.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, alive: true
    })),
    phase: 'setup',
    setupDone: false,
    lastResult: null,
  };

  showScreen('rouletteGame');
  document.getElementById('rouletteSetup').style.display = 'block';

  document.getElementById('bulletsSlider').oninput = (e) => {
    document.getElementById('bulletsValue').textContent = e.target.value;
  };
  document.getElementById('chambersSlider').oninput = (e) => {
    document.getElementById('chambersValue').textContent = e.target.value;
  };
}

function confirmRouletteSetup() {
  const bullets = parseInt(document.getElementById('bulletsSlider').value);
  const chambers = parseInt(document.getElementById('chambersSlider').value);

  rrState.bullets = bullets;
  rrState.chambers = chambers;
  rrState.cylinder = new Array(chambers).fill(false);

  const positions = [];
  while(positions.length < bullets) {
    const pos = Math.floor(Math.random() * chambers);
    if(!positions.includes(pos)) positions.push(pos);
  }
  positions.forEach(p => rrState.cylinder[p] = true);

  rrState.currentChamber = Math.floor(Math.random() * chambers);
  rrState.phase = 'playing';
  rrState.setupDone = true;
  rrState.turnIdx = 0;

  document.getElementById('rouletteSetup').style.display = 'none';

  broadcastRRState();
  renderRouletteView();
}

function broadcastRRState() {
  const rs = rrState;

  rs.players.forEach(p => {
    const view = {
      type: 'roulette-state',
      players: rs.players.map(pp => ({
        id: pp.id, name: pp.name, avatar: pp.avatar, alive: pp.alive
      })),
      turnIdx: rs.turnIdx,
      phase: rs.phase,
      chambers: rs.chambers,
      bullets: rs.bullets,
      lastResult: rs.lastResult,
      showCylinder: false,
    };

    if(p.id === state.myId) renderRouletteView(view);
    else sendTo(p.id, view);
  });
}

function renderRouletteView(data) {
  const rs = data || {
    players: rrState.players,
    turnIdx: rrState.turnIdx,
    phase: rrState.phase,
    chambers: rrState.chambers,
    bullets: rrState.bullets,
    lastResult: rrState.lastResult,
  };

  const alive = rs.players.filter(p => p.alive).length;
  document.getElementById('rouletteSurvivors').textContent = alive;
  document.getElementById('rouletteTotalPlayers').textContent = rs.players.length;

  const currentPlayer = rs.players[rs.turnIdx];
  if(currentPlayer) {
    document.getElementById('currentTurnName').textContent = currentPlayer.name;
  }

  const cylinder = document.getElementById('cylinder');
  cylinder.innerHTML = '';
  const angleStep = 360 / rs.chambers;

  for(let i = 0; i < rs.chambers; i++) {
    const indicator = document.createElement('div');
    indicator.className = 'chamber-indicator empty';
    const angle = i * angleStep;
    const radius = 80;
    const x = 100 + radius * Math.cos((angle - 90) * Math.PI / 180);
    const y = 100 + radius * Math.sin((angle - 90) * Math.PI / 180);
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    cylinder.appendChild(indicator);
  }

  // Build turn order for alive players starting from current turn
  const aliveOrder = [];
  if(rs.phase !== 'gameover') {
    let idx = rs.turnIdx;
    for(let i = 0; i < rs.players.length; i++) {
      if(rs.players[idx].alive) aliveOrder.push(idx);
      idx = (idx + 1) % rs.players.length;
    }
  }

  const survivorsList = document.getElementById('survivorsList');
  survivorsList.innerHTML = rs.players.map((p, i) => {
    const isCurrent = i === rs.turnIdx && p.alive && rs.phase !== 'gameover';
    const orderNum = aliveOrder.indexOf(i);
    const orderLabel = isCurrent ? 'NOW' : (orderNum > 0 && orderNum <= 3 ? (orderNum + 1) + '번째' : '');
    return `<div class="survivor-item ${!p.alive ? 'dead' : ''} ${isCurrent ? 'current-turn' : ''}">
      <div class="survivor-avatar-sm" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>
      <div class="survivor-name">${escapeHTML(p.name)}</div>
      ${orderLabel ? `<div class="survivor-order ${isCurrent ? 'now' : ''}">${orderLabel}</div>` : ''}
    </div>`;
  }).join('');

  const isMyTurn = currentPlayer?.id === state.myId;
  const spinBtn = document.getElementById('spinBtn');
  const triggerBtn = document.getElementById('triggerBtn');
  const restartBtn = document.getElementById('restartBtn');
  const cylinderInfo = document.getElementById('cylinderInfo');

  spinBtn.style.display = 'none';
  triggerBtn.style.display = 'none';
  restartBtn.style.display = 'none';

  if(rs.phase === 'gameover') {
    cylinderInfo.textContent = '게임 종료!';
    if(state.isHost) {
      restartBtn.style.display = 'block';
    }
  } else if(isMyTurn && rs.phase === 'playing') {
    spinBtn.style.display = 'block';
    cylinderInfo.textContent = '실린더를 돌려주세요';
  } else if(isMyTurn && rs.phase === 'spinning') {
    triggerBtn.style.display = 'block';
    cylinderInfo.textContent = '방아쇠를 당기세요...';
  } else {
    cylinderInfo.textContent = currentPlayer ? `${currentPlayer.name}의 차례` : '대기 중...';
  }
}

function spinCylinder() {
  if(!state.isHost) {
    sendToHost({ type: 'rr-action', action: 'spin' });
    return;
  }

  rrState.phase = 'spinning';

  const cylinder = document.getElementById('cylinder');
  cylinder.classList.add('spinning');

  setTimeout(() => {
    cylinder.classList.remove('spinning');
    broadcastRRState();
  }, 3000);

  broadcastRRState();
}

function pullTrigger() {
  if(!state.isHost) {
    sendToHost({ type: 'rr-action', action: 'trigger' });
    return;
  }

  const currentPlayer = rrState.players[rrState.turnIdx];
  const isBullet = rrState.cylinder[rrState.currentChamber];

  if(isBullet) {
    currentPlayer.alive = false;
    rrState.lastResult = { playerId: currentPlayer.id, result: 'dead' };

    if(navigator.vibrate) navigator.vibrate([100, 50, 300, 100, 200]);

    showRouletteFlash('bang', '💥', '탕!');

    setTimeout(() => {
      rrState.currentChamber = (rrState.currentChamber + 1) % rrState.chambers;
      advanceRouletteTurn();
    }, 2000);

  } else {
    rrState.lastResult = { playerId: currentPlayer.id, result: 'safe' };

    if(navigator.vibrate) navigator.vibrate(50);
    showRouletteFlash('safe', '😮‍💨', '찰칵... 살았다!');

    setTimeout(() => {
      rrState.currentChamber = (rrState.currentChamber + 1) % rrState.chambers;
      advanceRouletteTurn();
    }, 2000);
  }

  broadcastRRState();
}

function showRouletteFlash(type, icon, text) {
  const flash = document.getElementById('rouletteFlash');
  const flashIcon = document.getElementById('flashIcon');
  const flashText = document.getElementById('flashText');

  flash.className = 'roulette-flash active ' + type;
  flashIcon.textContent = icon;
  flashText.textContent = text;

  setTimeout(() => {
    flash.classList.remove('active', type);
  }, 800);
}

function advanceRouletteTurn() {
  const alivePlayers = rrState.players.filter(p => p.alive);

  if(alivePlayers.length === 1) {
    rrState.phase = 'gameover';
    const winner = alivePlayers[0];

    const result = {
      type: 'rr-result',
      winnerId: winner.id,
      winnerName: winner.name,
      winnerAvatar: winner.avatar,
    };

    broadcast(result);
    handleRRResult(result);
    return;
  }

  if(alivePlayers.length === 0) {
    rrState.phase = 'gameover';
    broadcastRRState();
    return;
  }

  let nextIdx = (rrState.turnIdx + 1) % rrState.players.length;
  while(!rrState.players[nextIdx].alive) {
    nextIdx = (nextIdx + 1) % rrState.players.length;
  }

  rrState.turnIdx = nextIdx;
  rrState.phase = 'playing';
  broadcastRRState();
}

function handleRRResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won, won ? 50 : 0);

  document.getElementById('resultTitle').textContent = won ? '🏆 생존!' : '💀 탈락...';
  document.getElementById('resultTitle').style.color = won ? 'var(--success)' : 'var(--danger)';
  document.getElementById('winnerName').textContent = msg.winnerName + ' ' + msg.winnerAvatar + ' 승리!';
  document.getElementById('resultHand').textContent = '러시안 룰렛 최후의 생존자';
  document.getElementById('resultPot').textContent = '';
  document.getElementById('resultCards').innerHTML = '';
  document.getElementById('resultOverlay').classList.add('active');
}

function restartRoulette() {
  if(!state.isHost) return;
  startRussianRoulette();
}

function processRRAction(peerId, action) {
  const currentPlayer = rrState.players[rrState.turnIdx];
  if(!currentPlayer || currentPlayer.id !== peerId) return;

  if(action === 'spin') {
    spinCylinder();
  } else if(action === 'trigger') {
    pullTrigger();
  }
}


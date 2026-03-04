// ===== LOTTERY ROULETTE ENGINE =====

let lotteryState = {
  mode: 'lottery',
  items: [],
  grid: [],
  gridSize: 10,
  picked: [],
  spinning: false,
  resultAngle: 0,
  currentRotation: 0,
  phase: 'setup'
};

function startLottery() {
  if(!state.isHost) {
    showToast('호스트만 게임을 시작할 수 있습니다');
    return;
  }

  lotteryState.mode = 'lottery';
  lotteryState.phase = 'setup';

  broadcast({ type: 'game-start', game: 'lottery', state: lotteryState });
  showScreen('lotteryGame');
  renderLotterySetup();
}

function getLotteryFieldItems(containerId) {
  const container = document.getElementById(containerId);
  if(!container) return [];
  return Array.from(container.querySelectorAll('.lottery-field-input'))
    .map(inp => inp.value.trim()).filter(s => s);
}

// 항목명 + 개수를 가져오는 함수
function getLotteryFieldItemsWithCount(containerId) {
  const container = document.getElementById(containerId);
  if(!container) return [];
  const rows = container.querySelectorAll('.lottery-field-row');
  const result = [];
  rows.forEach(row => {
    const inp = row.querySelector('.lottery-field-input');
    const countInp = row.querySelector('.lottery-field-count');
    const name = inp ? inp.value.trim() : '';
    const count = countInp ? Math.max(1, parseInt(countInp.value) || 1) : 1;
    if(name) result.push({ name, count });
  });
  return result;
}

function addLotteryField(containerId) {
  const container = document.getElementById(containerId);
  if(!container) return;
  const count = container.querySelectorAll('.lottery-field-row').length;
  if(count >= 20) { showToast('최대 20개까지 가능합니다'); return; }
  const row = document.createElement('div');
  row.className = 'lottery-field-row';
  // 종이뽑기 모드일 때만 개수 입력 표시
  const isLottery = containerId === 'lotteryFieldsContainer';
  row.innerHTML = `<span class="lottery-field-num">${count + 1}</span><input type="text" class="lottery-field-input" maxlength="20" placeholder="항목 입력">${isLottery ? '<input type="number" class="lottery-field-count" min="1" max="99" value="1" placeholder="개수">' : ''}<button class="lottery-field-del" onclick="removeLotteryField(this)">✕</button>`;
  container.appendChild(row);
  row.querySelector('.lottery-field-input').focus();
  container.scrollTop = container.scrollHeight;
}

function removeLotteryField(btn) {
  const container = btn.closest('.lottery-fields-container');
  const rows = container.querySelectorAll('.lottery-field-row');
  if(rows.length <= 2) { showToast('최소 2개 항목 필요'); return; }
  btn.closest('.lottery-field-row').remove();
  // Renumber
  container.querySelectorAll('.lottery-field-num').forEach((el, i) => el.textContent = i + 1);
}

function startLotteryGame() {
  if(!state.isHost) return;

  const itemsWithCount = getLotteryFieldItemsWithCount('lotteryFieldsContainer');
  const gridSize = parseInt(document.getElementById('gridSizeSelect').value);

  if(itemsWithCount.length < 2) {
    showToast('최소 2개 항목을 입력하세요');
    return;
  }

  // 항목별 개수를 기반으로 풀(pool) 생성
  const pool = [];
  itemsWithCount.forEach(({ name, count }) => {
    for(let c = 0; c < count; c++) pool.push(name);
  });

  const items = itemsWithCount.map(x => x.name);
  lotteryState.items = items;
  lotteryState.gridSize = gridSize;
  lotteryState.phase = 'playing';

  const totalCells = gridSize * gridSize;
  lotteryState.grid = [];

  for(let i = 0; i < totalCells; i++) {
    // pool에서 순환 배분, pool이 totalCells보다 적으면 반복
    const item = pool.length > 0 ? pool[i % pool.length] : items[i % items.length];
    lotteryState.grid.push({
      index: i,
      item: item,
      revealed: false,
      revealedBy: null
    });
  }

  // 그리드 셔플 (항목이 랜덤 위치에 배치되도록)
  for(let i = lotteryState.grid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmpItem = lotteryState.grid[i].item;
    lotteryState.grid[i].item = lotteryState.grid[j].item;
    lotteryState.grid[j].item = tmpItem;
  }

  lotteryState.picked = [];

  const stateToSend = {
    mode: 'lottery',
    phase: 'playing',
    gridSize: gridSize,
    grid: lotteryState.grid.map(c => ({
      index: c.index,
      revealed: false,
      revealedBy: null
    })),
    items: items
  };

  broadcast({ type: 'lottery-state', state: stateToSend });
  // Host keeps full grid items locally so picked result text is available.
  renderLotteryGame({
    mode: 'lottery',
    phase: 'playing',
    gridSize: gridSize,
    grid: lotteryState.grid.map(c => ({
      index: c.index,
      item: c.item,
      revealed: c.revealed,
      revealedBy: c.revealedBy
    })),
    items: items
  });
}

function startRouletteGame() {
  if(!state.isHost) return;

  const items = getLotteryFieldItems('rouletteFieldsContainer');

  if(items.length < 2 || items.length > 12) {
    showToast('2~12개 항목을 입력하세요');
    return;
  }

  lotteryState.items = items;
  lotteryState.mode = 'roulette';
  lotteryState.phase = 'playing';
  lotteryState.currentRotation = 0;

  const stateToSend = {
    mode: 'roulette',
    phase: 'playing',
    items: items,
    currentRotation: 0
  };

  broadcast({ type: 'lottery-state', state: stateToSend });
  renderRouletteGame(stateToSend);
}

function pickLotteryCell(index) {
  if(lotteryState.phase !== 'playing') return;

  const cell = lotteryState.grid[index];
  if(!cell || cell.revealed) return;

  if(state.isHost) {
    cell.revealed = true;
    cell.revealedBy = state.myId;

    const update = {
      type: 'lottery-pick',
      index: index,
      item: cell.item,
      playerId: state.myId,
      playerName: state.myName
    };

    broadcast(update);
    handleLotteryPick(update);
  } else {
    sendToHost({
      type: 'lottery-pick-request',
      index: index,
      playerId: state.myId,
      playerName: state.myName
    });
  }
}

function handleLotteryPick(msg) {
  const cell = lotteryState.grid[msg.index];
  if(!cell) return;

  cell.revealed = true;
  cell.revealedBy = msg.playerId;
  cell.item = msg.item;

  lotteryState.picked.push({
    playerId: msg.playerId,
    playerName: msg.playerName,
    item: msg.item
  });

  const cellEl = document.querySelector(`[data-cell-index="${msg.index}"]`);
  if(cellEl) {
    cellEl.classList.add('revealed');
    cellEl.innerHTML = `<div class="cell-content">${escapeHTML(msg.item)}</div>`;
  }

  const pickedCount = lotteryState.grid.filter(c => c.revealed).length;

  if(document.getElementById('pickedCount')) {
    document.getElementById('pickedCount').textContent = pickedCount;
  }

  if(msg.playerId === state.myId) {
    updateMyLotteryResult();
  }

  // 결과를 화면 중앙에 크게 표시 (종이 펼치기 연출)
  showLotteryRevealOverlay(msg.playerName, msg.item);
}

function showLotteryRevealOverlay(playerName, item) {
  // 기존 오버레이 제거
  var old = document.getElementById('lotteryRevealOverlay');
  if(old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'lotteryRevealOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);animation:lotRevealFadeIn 0.3s ease;';
  overlay.innerHTML = '<div style="text-align:center;animation:lotRevealPop 0.5s cubic-bezier(0.34,1.56,0.64,1);">' +
    '<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-bottom:12px;">' + escapeHTML(playerName) + '님이 뽑았습니다!</div>' +
    '<div style="background:linear-gradient(135deg,#ff6b35,#ff2d78);border-radius:16px;padding:24px 40px;box-shadow:0 8px 30px rgba(255,45,120,0.4);">' +
    '<div style="font-size:36px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.3);">' + escapeHTML(item) + '</div>' +
    '</div></div>';
  overlay.addEventListener('click', function() { overlay.remove(); });
  document.body.appendChild(overlay);

  // 2초 후 자동 닫기
  setTimeout(function() { if(overlay.parentNode) overlay.remove(); }, 2000);
}

function updateMyLotteryResult() {
  const myPicks = lotteryState.picked.filter(p => p.playerId === state.myId);

  if(myPicks.length > 0) {
    document.getElementById('myLotteryResult').style.display = 'block';
    const list = document.getElementById('myResultList');
    list.innerHTML = myPicks.map((p, i) =>
      `<div class="result-item">${i + 1}. ${escapeHTML(p.item)}</div>`
    ).join('');
  }
}

function spinRoulette() {
  if(lotteryState.spinning) return;

  const items = lotteryState.items;
  if(!items || items.length < 2) return;

  if(state.isHost) {
    const randomIndex = Math.floor(Math.random() * items.length);
    const resultItem = items[randomIndex];

    const anglePerItem = 360 / items.length;
    const targetAngle = randomIndex * anglePerItem;
    const fullRotations = 5 + Math.floor(Math.random() * 3);
    const totalRotation = lotteryState.currentRotation + (fullRotations * 360) + (360 - targetAngle);

    const spinData = {
      type: 'roulette-spin',
      resultItem: resultItem,
      resultIndex: randomIndex,
      totalRotation: totalRotation
    };

    broadcast(spinData);
    handleRouletteSpin(spinData);
  } else {
    sendToHost({
      type: 'roulette-spin-request',
      playerId: state.myId,
      playerName: state.myName
    });
  }
}

function handleRouletteSpin(msg) {
  lotteryState.spinning = true;
  lotteryState.currentRotation = msg.totalRotation;

  const wheel = document.getElementById('rouletteWheel');
  const btn = document.getElementById('rouletteSpinBtn');
  const resultDisplay = document.getElementById('rouletteResultDisplay');

  if(btn) btn.disabled = true;
  if(resultDisplay) resultDisplay.style.display = 'none';

  if(wheel) {
    wheel.style.transform = `rotate(${msg.totalRotation}deg)`;
  }

  setTimeout(() => {
    lotteryState.spinning = false;
    if(btn) btn.disabled = false;

    if(resultDisplay) {
      resultDisplay.style.display = 'block';
      document.getElementById('rouletteResultText').textContent = msg.resultItem;
    }

    showToast(`🎉 결과: ${msg.resultItem}`);
  }, 4000);
}

function switchLotteryMode(mode) {
  lotteryState.mode = mode;

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.remove('active');
  });

  document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

  if(mode === 'lottery') {
    document.getElementById('lotteryModeContainer').style.display = 'flex';
    document.getElementById('rouletteModeContainer').style.display = 'none';

    if(state.isHost && lotteryState.phase === 'setup') {
      renderLotterySetup();
    }
  } else {
    document.getElementById('lotteryModeContainer').style.display = 'none';
    document.getElementById('rouletteModeContainer').style.display = 'flex';

    if(state.isHost && lotteryState.phase === 'setup') {
      renderRouletteSetup();
    }
  }
}

function renderLotterySetup() {
  const isHost = state.isHost;

  document.getElementById('lotterySetupPanel').style.display = isHost ? 'block' : 'none';
  document.getElementById('lotteryGridContainer').style.display = 'none';
  document.getElementById('myLotteryResult').style.display = 'none';

  if(!isHost) {
    document.getElementById('lotteryModeContainer').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <div class="spinner"></div>
        <div style="color:var(--text-dim);font-size:14px;">호스트가 설정 중...</div>
      </div>
    `;
  }
}

function renderRouletteSetup() {
  const isHost = state.isHost;

  document.getElementById('rouletteSetupPanel').style.display = isHost ? 'block' : 'none';
  document.getElementById('rouletteDisplayContainer').style.display = 'none';

  if(!isHost) {
    document.getElementById('rouletteModeContainer').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <div class="spinner"></div>
        <div style="color:var(--text-dim);font-size:14px;">호스트가 설정 중...</div>
      </div>
    `;
  }
}

function renderLotteryGame(stateData) {
  const prevGrid = Array.isArray(lotteryState.grid) ? lotteryState.grid : [];
  lotteryState.grid = (stateData.grid || []).map((cell, i) => {
    const prev = prevGrid[i];
    return {
      index: typeof cell.index === 'number' ? cell.index : i,
      item: typeof cell.item === 'string' ? cell.item : (typeof prev?.item === 'string' ? prev.item : ''),
      revealed: !!cell.revealed,
      revealedBy: cell.revealedBy ?? null
    };
  });
  lotteryState.gridSize = stateData.gridSize;
  lotteryState.items = stateData.items;
  lotteryState.phase = 'playing';
  lotteryState.picked = [];

  document.getElementById('lotterySetupPanel').style.display = 'none';
  document.getElementById('lotteryGridContainer').style.display = 'flex';
  document.getElementById('myLotteryResult').style.display = 'none';

  const grid = document.getElementById('lotteryGrid');
  grid.style.gridTemplateColumns = `repeat(${stateData.gridSize}, 1fr)`;

  const totalCount = stateData.grid.length;
  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('pickedCount').textContent = '0';

  grid.innerHTML = stateData.grid.map((cell, i) => `
    <div class="lottery-cell" data-cell-index="${i}" onclick="pickLotteryCell(${i})">
      <div class="cell-content">?</div>
    </div>
  `).join('');
}

function renderRouletteGame(stateData) {
  lotteryState.items = stateData.items;
  lotteryState.phase = 'playing';
  lotteryState.currentRotation = stateData.currentRotation || 0;

  document.getElementById('rouletteSetupPanel').style.display = 'none';
  document.getElementById('rouletteDisplayContainer').style.display = 'flex';
  document.getElementById('rouletteResultDisplay').style.display = 'none';

  drawRouletteWheel(stateData.items);
}

function drawRouletteWheel(items) {
  const canvas = document.getElementById('rouletteCanvas');
  if(!canvas) return;

  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 10;

  const anglePerItem = (2 * Math.PI) / items.length;

  const colors = [
    '#ff6b35', '#00e5ff', '#ff2d78', '#ffd700',
    '#76ff03', '#e040fb', '#ff6e40', '#18ffff',
    '#ffab40', '#69f0ae', '#ea80fc', '#ff80ab'
  ];

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  items.forEach((item, i) => {
    const startAngle = i * anglePerItem - Math.PI / 2;
    const endAngle = startAngle + anglePerItem;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();

    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + anglePerItem / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Noto Sans KR"';
    ctx.fillText(item, radius * 0.6, 5);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
  ctx.fillStyle = '#1c1c3a';
  ctx.fill();
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function handleLotteryMessage(peerId, msg) {
  if(msg.type === 'lottery-state') {
    showScreen('lotteryGame');

    if(msg.state.mode === 'lottery') {
      switchLotteryMode('lottery');
      renderLotteryGame(msg.state);
    } else {
      switchLotteryMode('roulette');
      renderRouletteGame(msg.state);
    }
  }
  else if(msg.type === 'lottery-pick-request') {
    if(state.isHost) {
      const cell = lotteryState.grid[msg.index];
      if(cell && !cell.revealed) {
        cell.revealed = true;
        cell.revealedBy = msg.playerId;

        const response = {
          type: 'lottery-pick',
          index: msg.index,
          item: cell.item,
          playerId: msg.playerId,
          playerName: msg.playerName
        };

        broadcast(response);
        handleLotteryPick(response);
      }
    }
  }
  else if(msg.type === 'lottery-pick') {
    handleLotteryPick(msg);
  }
  else if(msg.type === 'roulette-spin-request') {
    if(state.isHost && !lotteryState.spinning) {
      spinRoulette();
    }
  }
  else if(msg.type === 'roulette-spin') {
    handleRouletteSpin(msg);
  }
}

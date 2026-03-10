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

// Spin effect timer handles (for cleanup)
let _rrSpinTimers = { phase2: null, phase3: null, shake: null, celebClose: null };

function cleanupRouletteEffects() {
  const celeb = document.getElementById('rouletteCelebration');
  if(celeb) celeb.remove();
  const confetti = document.querySelector('.roulette-confetti-wrap');
  if(confetti) confetti.remove();
}

function lotteryCleanup() {
  clearTimeout(_rrSpinTimers.phase2);
  clearTimeout(_rrSpinTimers.phase3);
  clearTimeout(_rrSpinTimers.shake);
  clearTimeout(_rrSpinTimers.celebClose);
  cleanupRouletteEffects();
  lotteryState.spinning = false;
}

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
    // 슬라이스 중앙에 정확히 멈추도록: 시작각 + 절반
    const sliceCenter = randomIndex * anglePerItem + anglePerItem / 2;
    const fullRotations = 5 + Math.floor(Math.random() * 3);
    const totalRotation = lotteryState.currentRotation + (fullRotations * 360) + (360 - sliceCenter);

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

  // Cancel any in-flight timers from a previous spin
  clearTimeout(_rrSpinTimers.phase2);
  clearTimeout(_rrSpinTimers.phase3);
  clearTimeout(_rrSpinTimers.shake);
  clearTimeout(_rrSpinTimers.celebClose);

  // Clean up any previous celebration / confetti DOM
  cleanupRouletteEffects();

  const wheel = document.getElementById('rouletteWheel');
  const btn = document.getElementById('rouletteSpinBtn');
  const resultDisplay = document.getElementById('rouletteResultDisplay');
  const wheelContainer = document.querySelector('.roulette-wheel-container');
  const pointer = document.querySelector('.roulette-pointer');
  const statusText = document.querySelector('.roulette-status .status-text');

  if(btn) btn.disabled = true;
  if(resultDisplay) resultDisplay.style.display = 'none';

  // === Phase 1: Spinning ===
  if(wheelContainer) wheelContainer.classList.add('wheel-active');
  if(pointer) pointer.classList.add('ticking');
  if(statusText) statusText.textContent = '🎰 돌리는 중...!';

  if(wheel) {
    wheel.style.transform = `rotate(${msg.totalRotation}deg)`;
  }

  if(navigator.vibrate) navigator.vibrate([30, 20, 30, 20, 30]);

  // === Phase 2: Anticipation (~3.2s) ===
  _rrSpinTimers.phase2 = setTimeout(() => {
    if(pointer) {
      pointer.classList.remove('ticking');
      pointer.classList.add('ticking-slow');
    }
    if(statusText) statusText.textContent = '🥁 곧 결과가...!';
  }, 3200);

  // === Phase 3: Result (~4s) ===
  _rrSpinTimers.phase3 = setTimeout(() => {
    lotteryState.spinning = false;
    if(btn) btn.disabled = false;
    if(wheelContainer) wheelContainer.classList.remove('wheel-active');
    if(pointer) pointer.classList.remove('ticking', 'ticking-slow');

    if(navigator.vibrate) navigator.vibrate([50, 30, 100, 50, 200]);

    // Screen shake
    const displayContainer = document.getElementById('rouletteDisplayContainer');
    if(displayContainer) {
      displayContainer.classList.add('result-shake');
      _rrSpinTimers.shake = setTimeout(() => displayContainer.classList.remove('result-shake'), 600);
    }

    // Inline result
    if(resultDisplay) {
      resultDisplay.style.display = 'flex';
      const resultText = document.getElementById('rouletteResultText');
      if(resultText) {
        resultText.textContent = msg.resultItem;
        resultText.classList.remove('show');
        void resultText.offsetWidth;
        resultText.classList.add('show');
      }
    }

    // Full-screen celebration + confetti
    showRouletteCelebration(msg.resultItem);
    launchRouletteConfetti();

    if(statusText) statusText.textContent = '🎉 결과 발표!';
  }, 4000);
}

function showRouletteCelebration(resultItem) {
  const old = document.getElementById('rouletteCelebration');
  if(old) old.remove();
  clearTimeout(_rrSpinTimers.celebClose);

  const overlay = document.createElement('div');
  overlay.id = 'rouletteCelebration';
  overlay.className = 'roulette-celebration';
  overlay.innerHTML =
    '<div class="celebration-content">' +
      '<div class="celebration-burst"></div>' +
      '<div class="celebration-ring"></div>' +
      '<div class="celebration-emoji">🎊</div>' +
      '<div class="celebration-label">결과 발표!</div>' +
      '<div class="celebration-result">' + escapeHTML(resultItem) + '</div>' +
      '<div class="celebration-sub">터치하여 닫기</div>' +
    '</div>';

  function dismissOverlay() {
    if(!overlay.parentNode || overlay.classList.contains('hiding')) return;
    clearTimeout(_rrSpinTimers.celebClose);
    overlay.classList.add('hiding');
    setTimeout(function() { if(overlay.parentNode) overlay.remove(); }, 500);
  }

  overlay.addEventListener('click', dismissOverlay);
  document.body.appendChild(overlay);

  _rrSpinTimers.celebClose = setTimeout(dismissOverlay, 3500);
}

function launchRouletteConfetti() {
  const wrapper = document.createElement('div');
  wrapper.className = 'roulette-confetti-wrap';

  const colors = ['#ff3d71','#ffd700','#00d68f','#0095ff','#ff6f3c','#9b51e0','#ff758f','#00c9db','#FFB800','#F71559'];
  const frag = document.createDocumentFragment();

  for(let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    const c = colors[Math.floor(Math.random() * colors.length)];
    const x = Math.random() * 100;
    const d = Math.random() * 0.6;
    const dur = 1.8 + Math.random() * 2;
    const sz = 5 + Math.random() * 7;
    const isRect = Math.random() > 0.4;
    const rot = Math.floor(Math.random() * 360);
    const drift = (Math.random() - 0.5) * 120;

    p.style.cssText =
      'position:absolute;top:-10px;' +
      'left:' + x + '%;' +
      'width:' + (isRect ? sz * 0.5 : sz) + 'px;' +
      'height:' + (isRect ? sz * 1.5 : sz) + 'px;' +
      'background:' + c + ';' +
      'border-radius:' + (isRect ? '2px' : '50%') + ';' +
      'opacity:0;' +
      'transform:rotate(' + rot + 'deg);' +
      'animation:rrConfettiFall ' + dur + 's ease-in ' + d + 's forwards;' +
      '--drift:' + drift + 'px;';

    frag.appendChild(p);
  }

  wrapper.appendChild(frag);
  document.body.appendChild(wrapper);
  setTimeout(function() { if(wrapper.parentNode) wrapper.remove(); }, 5000);
}

// ===== LOTTERY PRESET SAVE / LOAD =====

const LOTTERY_PRESET_KEY = 'partydeck_lottery_presets';

function _getLotteryPresets() {
  try {
    return JSON.parse(localStorage.getItem(LOTTERY_PRESET_KEY)) || [];
  } catch(e) { return []; }
}

function _saveLotteryPresets(presets) {
  localStorage.setItem(LOTTERY_PRESET_KEY, JSON.stringify(presets));
}

function saveLotteryPreset() {
  const itemsWithCount = getLotteryFieldItemsWithCount('lotteryFieldsContainer');
  if(itemsWithCount.length < 1) {
    showToast('저장할 항목이 없습니다');
    return;
  }

  const name = prompt('프리셋 이름을 입력하세요:');
  if(!name || !name.trim()) return;

  const presets = _getLotteryPresets();
  // 같은 이름이 있으면 덮어쓰기
  const existIdx = presets.findIndex(p => p.name === name.trim());
  const preset = { name: name.trim(), items: itemsWithCount, savedAt: Date.now() };
  if(existIdx >= 0) {
    presets[existIdx] = preset;
  } else {
    presets.push(preset);
  }
  _saveLotteryPresets(presets);
  showToast('프리셋 "' + name.trim() + '" 저장 완료!');
  // 목록이 열려 있으면 갱신
  const wrap = document.getElementById('lotteryPresetListWrap');
  if(wrap && wrap.style.display !== 'none') showLotteryPresetList();
}

function showLotteryPresetList() {
  const wrap = document.getElementById('lotteryPresetListWrap');
  if(!wrap) return;

  const presets = _getLotteryPresets();
  if(presets.length === 0) {
    showToast('저장된 프리셋이 없습니다');
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';
  wrap.innerHTML = '<div class="preset-list-title">저장된 프리셋</div>' +
    presets.map((p, i) =>
      '<div class="preset-list-item">' +
        '<span class="preset-item-name" onclick="loadLotteryPreset(' + i + ')">' +
          escapeHTML(p.name) +
          ' <span class="preset-item-count">(' + p.items.length + '개 항목)</span>' +
        '</span>' +
        '<button class="preset-item-del" onclick="deleteLotteryPreset(' + i + ')">✕</button>' +
      '</div>'
    ).join('') +
    '<div class="preset-list-close" onclick="closeLotteryPresetList()">닫기</div>';
}

function closeLotteryPresetList() {
  const wrap = document.getElementById('lotteryPresetListWrap');
  if(wrap) wrap.style.display = 'none';
}

function loadLotteryPreset(index) {
  const presets = _getLotteryPresets();
  const preset = presets[index];
  if(!preset) return;

  const container = document.getElementById('lotteryFieldsContainer');
  if(!container) return;

  // 기존 항목 모두 제거
  container.innerHTML = '';

  // 프리셋 항목으로 채우기
  preset.items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'lottery-field-row';
    row.innerHTML =
      '<span class="lottery-field-num">' + (i + 1) + '</span>' +
      '<input type="text" class="lottery-field-input" maxlength="20" placeholder="항목 입력" value="' + escapeHTML(item.name) + '">' +
      '<input type="number" class="lottery-field-count" min="1" max="99" value="' + item.count + '" placeholder="개수">' +
      '<button class="lottery-field-del" onclick="removeLotteryField(this)">✕</button>';
    container.appendChild(row);
  });

  closeLotteryPresetList();
  showToast('"' + preset.name + '" 불러오기 완료!');
}

function deleteLotteryPreset(index) {
  const presets = _getLotteryPresets();
  if(!presets[index]) return;
  const name = presets[index].name;
  presets.splice(index, 1);
  _saveLotteryPresets(presets);
  showToast('"' + name + '" 삭제됨');
  showLotteryPresetList();
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
      <div class="cell-content"><span class="cell-number">${i + 1}</span>?</div>
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

  // 고해상도 캔버스 (레티나 대응)
  const dpr = window.devicePixelRatio || 1;
  const size = 300;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const sliceR = outerR - 12; // 핀 안쪽 실제 파이 반지름
  const arc = (2 * Math.PI) / items.length;

  // 색상 팔레트 — 채도 높고 대비 강한 쌍
  const palette = [
    ['#FF3D71','#FF6B8A'], ['#0095FF','#44B4FF'], ['#FFB800','#FFD04D'],
    ['#00D68F','#33E5A5'], ['#9B51E0','#B87AED'], ['#FF6F3C','#FF9A6C'],
    ['#00C9DB','#4DDBE5'], ['#F71559','#F9527A'], ['#3366FF','#6B8FFF'],
    ['#FFC600','#FFD84D'], ['#17C964','#50DC8B'], ['#C850C0','#D880D2']
  ];

  ctx.clearRect(0, 0, size, size);

  // ── 외곽 림 (두꺼운 메탈 느낌) ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  const rimGrad = ctx.createRadialGradient(cx, cy, outerR - 14, cx, cy, outerR);
  rimGrad.addColorStop(0, '#e8e0d4');
  rimGrad.addColorStop(0.4, '#f5f0e8');
  rimGrad.addColorStop(0.7, '#d4c8b8');
  rimGrad.addColorStop(1, '#b0a090');
  ctx.fillStyle = rimGrad;
  ctx.fill();
  // 외곽선
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a7a6a';
  ctx.stroke();
  ctx.restore();

  // ── 핀 마커 (림 위 작은 원) ──
  const pinCount = items.length * 2;
  for(let p = 0; p < pinCount; p++) {
    const a = (p / pinCount) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * (outerR - 6);
    const py = cy + Math.sin(a) * (outerR - 6);
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#666';
    ctx.stroke();
  }

  // ── 파이 슬라이스 ──
  items.forEach((item, i) => {
    const startA = i * arc - Math.PI / 2;
    const endA = startA + arc;
    const midA = startA + arc / 2;
    const cols = palette[i % palette.length];

    // 그라디언트 (안→밖 방사형이 아닌, 슬라이스 방향 선형)
    const gx1 = cx + Math.cos(midA) * sliceR * 0.15;
    const gy1 = cy + Math.sin(midA) * sliceR * 0.15;
    const gx2 = cx + Math.cos(midA) * sliceR * 0.95;
    const gy2 = cy + Math.sin(midA) * sliceR * 0.95;
    const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    grad.addColorStop(0, cols[0]);
    grad.addColorStop(1, cols[1]);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, sliceR, startA, endA);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 슬라이스 경계선
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();

    // 슬라이스 안쪽 하이라이트 (상단 쪽 밝게)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, sliceR, startA, endA);
    ctx.closePath();
    ctx.clip();
    const hlGrad = ctx.createLinearGradient(cx, cy - sliceR, cx, cy + sliceR);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
    hlGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    hlGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = hlGrad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // ── 텍스트 ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midA);

    const label = item.length > 6 ? item.slice(0, 5) + '…' : item;
    const fontSize = items.length <= 4 ? 16 : items.length <= 8 ? 13 : 11;
    ctx.font = `bold ${fontSize}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = sliceR * 0.58;
    // 텍스트 외곽선 (가독성)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineJoin = 'round';
    ctx.strokeText(label, textX, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, textX, 0);
    ctx.restore();
  });

  // ── 중앙 허브 ──
  // 외곽 링
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  const hubOuterGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 24);
  hubOuterGrad.addColorStop(0, '#f0e8dc');
  hubOuterGrad.addColorStop(1, '#c0b0a0');
  ctx.fillStyle = hubOuterGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a7a6a';
  ctx.stroke();

  // 내부 원
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  const hubGrad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 16);
  hubGrad.addColorStop(0, '#fff');
  hubGrad.addColorStop(0.3, '#e8ddd0');
  hubGrad.addColorStop(1, '#a09080');
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#7a6a5a';
  ctx.stroke();

  // 중앙 점
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#5a4a3a';
  ctx.fill();
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

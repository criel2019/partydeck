// ===== FORTRESS — UI & Game Over =====
// Separated from fortress.js for modularity

// ===== UI RENDERING =====
function renderFortressView(view) {
  if (!view) return;
  FortPerf.begin('renderView.DOM');
  window._fortView = view;

  // non-host 첫 렌더 시 스킬 로드
  if (!state.isHost && _fortEquippedSkills.length === 0 && typeof skillsGetEquipped === 'function') {
    _fortEquippedSkills = skillsGetEquipped('fortress');
    _fortSkillUsage = {};
    _fortActiveSkill = null;
  }

  // Sync platform data from host so client path computation matches host
  if (view.skyPlatforms) fortSkyPlatforms = view.skyPlatforms;

  if (!fortCtx) initFortCanvas();

  // Start camera loop if not running (for non-host clients)
  if (!_fortCamLoopId) {
    // Snap camera to current turn player on first render
    const cp = view.players[view.turnIdx];
    if (cp) {
      const cpx = cp.x;
      const cpy = (view.terrain || [])[Math.floor(Math.max(0, Math.min(cpx, FORT_CANVAS_W - 1)))] || 250;
      fortCameraSnap(cpx, cpy - FORT_TANK_H);
    }
    _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
  }

  // Update camera target to current turn player on state updates
  if (view.phase === 'aiming') {
    const tp = view.players[view.turnIdx];
    if (tp) {
      const tpx = tp.x;
      const tpy = (view.terrain || [])[Math.floor(Math.max(0, Math.min(tpx, FORT_CANVAS_W - 1)))] || 250;
      fortCameraTarget(tpx, tpy - FORT_TANK_H);
    }
  }

  const isMyTurn = view.players[view.turnIdx]?.id === state.myId;
  const canAct = isMyTurn && view.phase === 'aiming';

  // Sync client-side fuel tracking from server state
  if (isMyTurn) {
    const cp = view.players[view.turnIdx];
    if (cp) {
      const fuel = cp.moveFuel !== undefined ? cp.moveFuel : FORT_MOVE_FUEL;
      fortMovedThisTurn = FORT_MOVE_FUEL - fuel;
    }
  }

  // Round badge
  const roundBadge = document.getElementById('fortRoundBadge');
  if (roundBadge) roundBadge.textContent = 'ROUND ' + view.round;

  // Turn name
  const turnName = document.getElementById('fortTurnName');
  const currentPlayer = view.players[view.turnIdx];
  if (turnName && currentPlayer) {
    turnName.textContent = currentPlayer.name + '의 차례';
  }

  // Wind
  const windArrow = document.getElementById('fortWindArrow');
  const windValue = document.getElementById('fortWindValue');
  if (windArrow) {
    if (view.wind > 0) windArrow.textContent = '→';
    else if (view.wind < 0) windArrow.textContent = '←';
    else windArrow.textContent = '·';
  }
  if (windValue) windValue.textContent = Math.abs(view.wind);

  // Players bar — 딜레이 순으로 정렬하여 좌측 세로 패널에 표시
  const bar = document.getElementById('fortPlayersBar');
  if (bar) {
    // 딜레이 기준 정렬 (낮은 순 = 다음 턴 우선)
    const sorted = view.players.map((p, i) => ({ ...p, origIdx: i }))
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return (a.delay || 0) - (b.delay || 0);
      });

    bar.innerHTML = sorted.map((p, rank) => {
      const hpPct = Math.max(0, (p.hp / FORT_MAX_HP) * 100);
      let hpClass = '';
      if (hpPct <= 30) hpClass = 'low';
      else if (hpPct <= 60) hpClass = 'mid';
      const itemClass = 'fort-player-hp-item' +
        (p.origIdx === view.turnIdx ? ' active-turn' : '') +
        (!p.alive ? ' dead' : '');
      const statusIcons = (p.poison > 0 ? `<span class="fort-status-icon" title="독 (${p.poison}턴)">☠️</span>` : '') +
                          (p.frozen > 0 ? `<span class="fort-status-icon" title="빙결 (${p.frozen}턴)">❄️</span>` : '') +
                          (p.shield > 0 ? `<span class="fort-status-icon" title="방어막">🛡️</span>` : '');
      const orderNum = p.alive ? (rank + 1) : '-';
      return `<div class="${itemClass}" data-player-id="${p.id}">
        <span class="fort-turn-order-num">${orderNum}</span>
        <div class="fort-player-avatar">${p.avatar}</div>
        <div class="fort-player-info">
          <div class="fort-player-name">${escapeHTML(p.name)}${statusIcons}</div>
          <div class="fort-hp-bar"><div class="fort-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
          <div class="fort-hp-text">${p.hp}/${FORT_MAX_HP}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Controls — toggle disabled state via CSS class
  const controls = document.getElementById('fortControls');
  const fireBtn = document.getElementById('fortFireBtn');
  if (controls) controls.classList.toggle('fort-disabled', !canAct);
  if (fireBtn) fireBtn.disabled = !canAct;

  const angleVal = document.getElementById('fortAngleValue');
  const powerVal = document.getElementById('fortPowerValue');
  if (angleVal) angleVal.textContent = fortLocalAngle;
  if (powerVal) powerVal.textContent = fortLocalPower;

  // Update fuel display
  const fuelFill = document.getElementById('fortFuelFill');
  const fuelText = document.getElementById('fortFuelText');
  if (fuelFill && isMyTurn) {
    const cp = view.players[view.turnIdx];
    const fuel = cp ? (cp.moveFuel !== undefined ? cp.moveFuel : FORT_MOVE_FUEL) : 0;
    const pct = (fuel / FORT_MOVE_FUEL) * 100;
    fuelFill.style.width = pct + '%';
    if (fuelText) fuelText.textContent = Math.round(pct) + '%';
  }

  // 스킬바 업데이트 (내 턴일 때만 보임)
  if (typeof fortUpdateSkillBar === 'function') fortUpdateSkillBar();
  FortPerf.end('renderView.DOM');

  renderFortressScene(view);
}

// ===== GAME OVER =====
function showFortressGameOver(msg) {
  if (!msg) return;

  const overlay = document.getElementById('fortGameOver');
  const title = document.getElementById('fortGameOverTitle');
  const rankings = document.getElementById('fortRankings');
  if (!overlay || !rankings) return;

  const allPlayers = msg.players || [];
  const deathOrder = msg.deathOrder || [];
  const ranked = [];

  const winner = allPlayers.find(p => p.alive);
  if (winner) ranked.push(winner);

  for (let i = deathOrder.length - 1; i >= 0; i--) {
    const p = allPlayers.find(pp => pp.id === deathOrder[i]);
    if (p && !p.alive) ranked.push(p);
  }

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    if (!ranked.find(r => r.id === p.id)) ranked.push(p);
  }

  const medals = ['🥇', '🥈', '🥉'];
  const goldRewards = [60, 30, 10];

  title.textContent = winner ? winner.name + ' 승리!' : '무승부!';

  rankings.innerHTML = ranked.map((p, i) => {
    const medal = medals[i] || `${i + 1}위`;
    const gold = goldRewards[i] || 0;
    const rankClass = i < 3 ? ` rank-${i + 1}` : '';
    return `<div class="fort-rank-item${rankClass}">
      <div class="fort-rank-medal">${medal}</div>
      <div class="fort-rank-name">${p.avatar} ${escapeHTML(p.name)}</div>
      ${gold ? `<div class="fort-rank-gold">+${gold} 🪙</div>` : ''}
    </div>`;
  }).join('');

  overlay.style.display = '';

  const myRank = ranked.findIndex(p => p.id === state.myId);
  const won = myRank === 0;
  const goldReward = myRank >= 0 ? (goldRewards[myRank] || 0) : 0;
  recordGame(won, goldReward);

  // 스킬 업적 기록 (연습 모드에서는 제외)
  const isPractice = typeof practiceMode !== 'undefined' && practiceMode;
  if (typeof skillsRecordPlay === 'function' && !isPractice) {
    skillsRecordPlay('fortress');
    if (won) skillsRecordWin('fortress');
  }

  // 스킬바 숨기기
  const skillBar = document.getElementById('fortSkillBar');
  if (skillBar) skillBar.classList.remove('visible');
}

// ===== CLEANUP =====
function closeFortressCleanup() {
  fortClearTurnTimer();
  const overlay = document.getElementById('fortGameOver');
  if (overlay) overlay.style.display = 'none';
  if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
  if (_fortCamLoopId) { cancelAnimationFrame(_fortCamLoopId); _fortCamLoopId = null; }
  if (_fortResizeObserver) { _fortResizeObserver.disconnect(); _fortResizeObserver = null; }
  cleanupFortressKeyboard();
  fortStopMove();
  fortAngleStop();
  // 스킬 상태 초기화
  _fortActiveSkill = null;
  const skillBar = document.getElementById('fortSkillBar');
  if (skillBar) { skillBar.classList.remove('visible'); skillBar.innerHTML = ''; }
  if (fortCanvas) {
    fortCanvas.ontouchstart = null;
    fortCanvas.ontouchmove = null;
    fortCanvas.ontouchend = null;
    fortCanvas.onmousedown = null;
    fortCanvas.onmousemove = null;
    fortCanvas.onmouseup = null;
    fortCanvas.onmouseleave = null;
    if (_fortWheelHandler) fortCanvas.removeEventListener('wheel', _fortWheelHandler);
  }
  _fortWheelHandler = null;
  _fortDrag = null;
  fortState = null;
  window._fortView = null;
  fortCtx = null;
  fortCanvas = null;
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  fortWindParticles = [];
  fortCam.x = 400; fortCam.y = 250;
  fortCam.targetX = 400; fortCam.targetY = 250;
  fortCam.zoom = 2.0;
  _fortSkyCache = null;
  _fortTerrainGrad = null;
  _fortTerrainCache = null;
  _fortTerrainCacheRef = null;
  _fortTerrainCacheVer = -1;
  _fortTerrainDirtyVer = 0;
  _fortPlayerInfoCache = {};
  _fortCharAnim = {};
  _ftCloudTempCanvas = null;
  _ftCloudTempCtx = null;
  _ftCloudTempW = 0;
  _ftCloudTempH = 0;
  // 충전 인터벌 정리
  if (_fortChargeInterval) { clearInterval(_fortChargeInterval); _fortChargeInterval = null; }
  _fortCharging = false;
  _fortChargeValue = 0;
  _fortChargeTouched = false;
  // AudioContext 해제
  if (_fortAudioCtx) { try { _fortAudioCtx.close(); } catch(e) {} _fortAudioCtx = null; }
  fortBirds = [];
  fortSkyPlatforms = [];
  _fortFallingFeathers = [];
  _fortBirdHitCount = 0;
}

function closeFortressGame() {
  closeFortressCleanup();
  returnToLobby();
}

// ===== SKILL BAR UI =====
let _fortSkillBarState = '';  // 이전 상태 해시 (불필요한 innerHTML 교체 방지)

function fortUpdateSkillBar() {
  const bar = document.getElementById('fortSkillBar');
  if (!bar) return;

  const view = window._fortView;
  const isMyTurn = view && view.phase === 'aiming' &&
                   view.players[view.turnIdx]?.id === state.myId;

  if (!isMyTurn || _fortEquippedSkills.length === 0) {
    if (bar.classList.contains('visible')) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      _fortSkillBarState = '';
    }
    return;
  }

  bar.classList.add('visible');

  // 쉴드 활성 상태: 이번 턴에 쉴드를 썼으면 기본 포탄만 허용
  const currentPlayer = view.players[view.turnIdx];
  const shieldActive = currentPlayer && currentPlayer.shield > 0;

  // 기본 포탄 버튼 + 장착 스킬 버튼
  const items = [{ id: null, emoji: '💫', name: '기본 포탄' }];
  for (let i = 0; i < _fortEquippedSkills.length; i++) {
    const id = _fortEquippedSkills[i];
    if (typeof skillsGetDef === 'function') {
      const def = skillsGetDef(id);
      if (def) items.push({ id, emoji: def.emoji, name: def.name });
    }
  }

  // 상태 해시: active 스킬 + 사용횟수 + 쉴드 상태가 바뀔 때만 DOM 교체
  const stateKey = (_fortActiveSkill || '') + '|' + (shieldActive ? 'S' : '') + '|' + items.map(i => i.id + ':' + (_fortSkillUsage[i.id] || 0)).join(',');
  if (stateKey === _fortSkillBarState) return;
  _fortSkillBarState = stateKey;

  bar.innerHTML = items.map(item => {
    const uses = item.id ? (_fortSkillUsage[item.id] || 0) : 0;
    const remaining = item.id ? (SKILL_MAX_USES - uses) : null;
    const depleted = item.id && (remaining <= 0 || shieldActive);
    const isActive = _fortActiveSkill === item.id;
    const usesHtml = item.id
      ? `<span class="fort-skill-uses${remaining === SKILL_MAX_USES ? ' full' : ''}">${remaining}/${SKILL_MAX_USES}</span>`
      : '';
    const btnClass = [
      item.id ? 'fort-skill-btn' : 'fort-skill-btn fort-skill-btn-default',
      isActive ? 'active' : '',
      depleted ? 'depleted' : '',
    ].filter(Boolean).join(' ');
    return `<button class="${btnClass}" data-skill="${item.id || ''}">
      <span class="fort-skill-emoji">${item.emoji}</span>
      <span class="fort-skill-name">${item.name}</span>
      ${usesHtml}
    </button>`;
  }).join('');

  // 이벤트 위임: 버튼 클릭/터치 처리
  bar.querySelectorAll('button[data-skill]').forEach(btn => {
    const sid = btn.dataset.skill || null;
    btn.addEventListener('touchstart', (e) => { e.stopPropagation(); btn._tapped = true; }, { passive: true });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (btn._tapped) { btn._tapped = false; fortSelectSkill(sid); }
    });
    btn.addEventListener('click', (e) => { e.stopPropagation(); fortSelectSkill(sid); });
  });
}

function fortSelectSkill(skillId) {
  // 토글: 같은 스킬 다시 누르면 기본으로
  if (_fortActiveSkill === skillId) {
    _fortActiveSkill = null;
  } else {
    const uses = skillId ? (_fortSkillUsage[skillId] || 0) : 0;
    if (skillId && uses >= SKILL_MAX_USES) return;
    const cp = window._fortView?.players[window._fortView?.turnIdx];
    if (skillId && cp && cp.shield > 0) return; // 쉴드 활성 → 스킬 선택 차단
    _fortActiveSkill = skillId;
  }
  fortUpdateSkillBar();
}

function _fortShowSkillFlash(text) {
  const gameEl = document.getElementById('fortressGame');
  if (!gameEl) return;
  const el = document.createElement('div');
  el.className = 'fort-skill-flash';
  el.textContent = text;
  gameEl.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
}

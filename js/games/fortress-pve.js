// =============================================
// ===== FORTRESS PvE MODE (원정 모드) ==========
// =============================================
// 플레이어 1명 vs CPU 여러 명, 스테이지 진행형
// CPU는 플레이어가 해금하지 못한 스킬도 사용 가능
// 스테이지 사이: 이벤트 연출 → 디버프 선택 → 위치 지정 → 전투

// ===== PvE STATE =====
let _pveMode = false;
let _pveStage = 0;           // 현재 스테이지 (0-indexed)
let _pvePhase = 'battle';    // 'battle' | 'event' | 'debuff' | 'position' | 'ready'
let _pveCpuSkills = {};      // { cpuId: [skill1, skill2, skill3] }
let _pveCpuDebuffs = {};     // { cpuId: { dmgDown: 0, hpDown: 0, moveDown: 0, powerDown: 0, skillSeal: null } }
let _pvePlayerHp = 100;      // 플레이어 HP (스테이지 간 유지)
let _pveRunStats = {};        // 런 통계
let _pveSelectedPosition = null;
let _pveOriginalShowGameOver = null;
let _pveOriginalApplyDamage = null;
let _pveOriginalRenderView = null;

// ===== PvE CPU NAMES & AVATARS =====
const PVE_CPU_NAMES = [
  '야생 거위', '숲의 파수꾼', '모래 폭군', '빙하 사냥꾼', '화산 수호자',
  '바람의 전사', '뇌전 정령', '영혼 집행자', '암석 골렘', '불꽃 드래곤',
  '서리 마녀', '사막 독수리', '용암 거인', '눈보라 늑대', '최종 보스'
];
const PVE_CPU_AVATARS = ['🐺', '🦇', '🦂', '🐻‍❄️', '🌋', '🦅', '⚡', '👹', '🗿', '🐲', '🧙‍♀️', '🦅', '👾', '🐺', '💀'];
const PVE_CPU_TRIBES = ['fire', 'rock', 'wind', 'thunder', 'spirit'];

// ===== STAGE DEFINITIONS =====
const PVE_STAGES = [
  {
    name: '수풀 지대',
    desc: '야생 펫들이 영역을 지키고 있다...',
    cpuCount: 2,
    cpuBaseHp: 80,
    skillTier: 1,
    biome: 'temperate',
    theme: 'day',
  },
  {
    name: '사막 전선',
    desc: '모래 폭풍 속에 강적이 기다린다.',
    cpuCount: 2,
    cpuBaseHp: 100,
    skillTier: 2,
    biome: 'desert',
    theme: 'dusk',
  },
  {
    name: '빙하 고원',
    desc: '얼어붙은 대지에서 3마리와 동시에...',
    cpuCount: 3,
    cpuBaseHp: 100,
    skillTier: 2,
    biome: 'arctic',
    theme: 'day',
  },
  {
    name: '화산 분화구',
    desc: '용암이 흐르는 전장, 한 치 앞도 보이지 않는다.',
    cpuCount: 3,
    cpuBaseHp: 120,
    skillTier: 3,
    biome: 'volcanic',
    theme: 'night',
  },
  {
    name: '최종 결전',
    desc: '가장 강력한 적이 모든 스킬을 동원한다.',
    cpuCount: 3,
    cpuBaseHp: 150,
    skillTier: 3,
    biome: 'volcanic',
    theme: 'dusk',
  },
];

// ===== SKILL TIERS (CPU가 사용 가능한 스킬 — 플레이어 해금 무관) =====
const PVE_SKILL_TIERS = {
  1: ['sniper', 'bounce', 'knockback', 'heal_10'],
  2: ['sniper', 'bounce', 'penetrate', 'homing', 'knockback', 'poison', 'double_shot', 'heal_10', 'heal_30'],
  3: ['sniper', 'bounce', 'penetrate', 'earthquake', 'homing', 'knockback', 'poison', 'double_shot', 'split', 'cluster', 'ice', 'heal_30', 'heal_50', 'shield'],
};

// ===== EVENT DEFINITIONS =====
const PVE_EVENTS = [
  {
    title: '적의 보급선을 발견!',
    desc: '후방에서 물자를 운반 중인 적의 수송대를 포착했다. 무엇을 빼앗을까?',
    emoji: '📦',
    choices: [
      { label: '🗡️ 탄약 빼앗기', desc: '적의 공격력을 약화시킨다', debuff: 'dmgDown', value: 15 },
      { label: '🍖 식량 빼앗기', desc: '적의 체력을 감소시킨다', debuff: 'hpDown', value: 20 },
    ],
  },
  {
    title: '폭풍이 불어온다!',
    desc: '거대한 폭풍이 전장을 휩쓸고 있다. 자연의 힘을 빌려 적을 약화시키자.',
    emoji: '🌪️',
    choices: [
      { label: '💨 바람의 저주', desc: '적의 이동력을 제한한다', debuff: 'moveDown', value: 30 },
      { label: '⛰️ 대지의 속박', desc: '적의 파워를 제한한다', debuff: 'powerDown', value: 20 },
    ],
  },
  {
    title: '적 스파이를 포획!',
    desc: '적의 정찰병을 잡았다! 정보를 뜯어내면 전략적 우위를 점할 수 있다.',
    emoji: '🕵️',
    choices: [
      { label: '🔒 스킬 봉인', desc: '적의 스킬 1개를 사용 불가로 만든다', debuff: 'skillSeal', value: 1 },
      { label: '🎯 약점 분석', desc: '적의 공격력을 크게 약화시킨다', debuff: 'dmgDown', value: 25 },
    ],
  },
  {
    title: '고대 유적 발견!',
    desc: '전장 근처에서 잊혀진 유적을 발견했다. 유적의 힘을 활용할 수 있다.',
    emoji: '🏛️',
    choices: [
      { label: '💚 치유의 샘', desc: '체력을 30 회복한다', debuff: 'playerHeal', value: 30 },
      { label: '💀 저주의 제단', desc: '모든 적의 체력을 깎는다', debuff: 'hpDown', value: 15 },
    ],
  },
  {
    title: '배신자의 밀서!',
    desc: '적 진영 내부의 배신자가 비밀 편지를 보내왔다.',
    emoji: '📜',
    choices: [
      { label: '🗡️ 무기고 파괴', desc: '적의 공격력과 파워를 동시에 약화', debuff: 'dmgDown', value: 10 },
      { label: '🏃 퇴로 차단', desc: '적의 이동력을 크게 제한한다', debuff: 'moveDown', value: 40 },
    ],
  },
];

// ===== PvE DEBUFF DISPLAY =====
const PVE_DEBUFF_LABELS = {
  dmgDown:   { emoji: '🗡️⬇', label: '공격력 약화' },
  hpDown:    { emoji: '❤️⬇', label: '체력 감소' },
  moveDown:  { emoji: '🏃⬇', label: '이동력 제한' },
  powerDown: { emoji: '💪⬇', label: '파워 제한' },
  skillSeal: { emoji: '🔒',  label: '스킬 봉인' },
};

// =============================================
// ===== PvE ENTRY POINT =======================
// =============================================

function startFortressPvE() {
  // 상태 초기화
  _pveMode = true;
  _pveStage = 0;
  _pvePhase = 'battle';
  _pveCpuSkills = {};
  _pveCpuDebuffs = {};
  _pvePlayerHp = FORT_MAX_HP;
  _pveSelectedPosition = null;
  _pveRunStats = { kills: 0, stagesCleared: 0, debuffsApplied: [] };

  // 연습 모드 기반 세팅 (네트워크 차단)
  practiceMode = true;
  state.myId = 'player-' + Math.random().toString(36).substr(2, 6);
  state.myName = document.getElementById('nameInput').value.trim() || '플레이어';
  state.myAvatar = AVATARS[state.avatarIdx] || '😎';
  state.isHost = true;
  state.selectedGame = 'fortress';
  state.roomCode = 'PVE';
  state.connections = {};
  state.peer = null;
  state.poker = null;
  state.mafia = null;
  state.ecard = null;

  interceptNetworking();

  // 훅 설치
  pveInstallHooks();

  // 스테이지 인트로 표시
  pveShowStageIntro();
}

// =============================================
// ===== HOOKS =================================
// =============================================

function pveInstallHooks() {
  pveHookGameOver();
  pveHookDamage();
  pveHookRenderView();
}

function pveUninstallHooks() {
  pveUnhookGameOver();
  pveUnhookDamage();
  pveUnhookRenderView();
}

function pveHookGameOver() {
  if (_pveOriginalShowGameOver) return;
  _pveOriginalShowGameOver = window.showFortressGameOver;

  window.showFortressGameOver = function(msg) {
    if (!_pveMode) { _pveOriginalShowGameOver(msg); return; }

    const playerAlive = msg.players?.find(p => p.id === state.myId && p.alive);
    const playerData = msg.players?.find(p => p.id === state.myId);

    if (playerAlive) {
      // 승리
      _pveRunStats.stagesCleared++;
      _pvePlayerHp = playerData ? playerData.hp : FORT_MAX_HP;

      if (_pveStage + 1 >= PVE_STAGES.length) {
        pveShowVictory();
      } else {
        _pveStage++;
        setTimeout(() => pveShowEvent(), 1500);
      }
    } else {
      pveShowDefeat();
    }
  };
}

function pveUnhookGameOver() {
  if (_pveOriginalShowGameOver) {
    window.showFortressGameOver = _pveOriginalShowGameOver;
    _pveOriginalShowGameOver = null;
  }
}

function pveHookDamage() {
  if (_pveOriginalApplyDamage) return;
  _pveOriginalApplyDamage = window.applyDamage;

  window.applyDamage = function(hitResult) {
    if (_pveMode && fortState && hitResult && hitResult.targets) {
      const current = fortState.players[fortState.turnIdx];
      if (current && current._pveDmgDown > 0) {
        const reduction = current._pveDmgDown / 100;
        hitResult.targets.forEach(t => {
          t.damage = Math.max(1, Math.floor(t.damage * (1 - reduction)));
        });
      }
    }
    _pveOriginalApplyDamage(hitResult);
  };
}

function pveUnhookDamage() {
  if (_pveOriginalApplyDamage) {
    window.applyDamage = _pveOriginalApplyDamage;
    _pveOriginalApplyDamage = null;
  }
}

function pveHookRenderView() {
  if (_pveOriginalRenderView) return;
  _pveOriginalRenderView = window.renderFortressView;

  window.renderFortressView = function(view) {
    _pveOriginalRenderView(view);
    if (_pveMode) pveRenderDebuffIndicators();
  };
}

function pveUnhookRenderView() {
  if (_pveOriginalRenderView) {
    window.renderFortressView = _pveOriginalRenderView;
    _pveOriginalRenderView = null;
  }
}

// =============================================
// ===== STAGE INTRO ===========================
// =============================================

function pveShowStageIntro() {
  const stageDef = PVE_STAGES[_pveStage];
  if (!stageDef) { pveShowVictory(); return; }

  _pvePhase = 'event';
  showScreen('fortressGame');

  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;
  ovl.style.display = 'flex';
  ovl.className = 'pve-overlay pve-stage-intro';

  const biomeEmoji = { temperate: '🌿', desert: '🏜️', arctic: '❄️', volcanic: '🌋' };

  ovl.innerHTML = `
    <div class="pve-intro-box">
      <div class="pve-intro-stage">STAGE ${_pveStage + 1} / ${PVE_STAGES.length}</div>
      <div class="pve-intro-biome">${biomeEmoji[stageDef.biome] || '🗺️'}</div>
      <div class="pve-intro-name">${stageDef.name}</div>
      <div class="pve-intro-desc">${stageDef.desc}</div>
      <div class="pve-intro-info">
        <span>적 ${stageDef.cpuCount}마리</span>
        <span class="pve-dot">·</span>
        <span>HP ${stageDef.cpuBaseHp}</span>
      </div>
      ${_pveStage > 0 ? `<div class="pve-intro-player-hp">내 HP: ${_pvePlayerHp}/${FORT_MAX_HP}</div>` : ''}
      <button class="pve-btn pve-btn-primary" onclick="pveStartCurrentStage()">전투 시작!</button>
    </div>
  `;
}

// =============================================
// ===== START A STAGE =========================
// =============================================

function pveStartCurrentStage() {
  const stageDef = PVE_STAGES[_pveStage];
  if (!stageDef) return;

  _pvePhase = 'battle';

  const ovl = document.getElementById('pveOverlay');
  if (ovl) ovl.style.display = 'none';

  // 플레이어 tama 로드
  let _practiceTama = null;
  try {
    const _r = localStorage.getItem('pd_tama_pet');
    if (_r) { const _p = JSON.parse(_r); if (_p && _p.tribe) _practiceTama = { tribe: _p.tribe, level: _p.level || 1 }; }
  } catch (e) {}

  state.players = [
    { id: state.myId, name: state.myName, avatar: state.myAvatar, isHost: true, tama: _practiceTama }
  ];

  // CPU 생성 + 스킬 할당
  const cpuOffset = _pveStage * 3;
  for (let i = 0; i < stageDef.cpuCount; i++) {
    const cpuId = 'ai-' + i;
    const nameIdx = (cpuOffset + i) % PVE_CPU_NAMES.length;
    const avatarIdx = (cpuOffset + i) % PVE_CPU_AVATARS.length;
    const tribe = PVE_CPU_TRIBES[(cpuOffset + i) % PVE_CPU_TRIBES.length];

    state.players.push({
      id: cpuId,
      name: PVE_CPU_NAMES[nameIdx],
      avatar: PVE_CPU_AVATARS[avatarIdx],
      isHost: false,
      tama: { tribe, level: 5 + _pveStage * 3 },
    });

    _pveCpuSkills[cpuId] = pveAssignCpuSkills(stageDef.skillTier, cpuId);
  }

  pveInitFortress(stageDef);
}

// ===== CPU SKILL ASSIGNMENT =====
function pveAssignCpuSkills(tier, cpuId) {
  const pool = PVE_SKILL_TIERS[tier] || PVE_SKILL_TIERS[1];
  const debuff = _pveCpuDebuffs[cpuId];
  const sealed = debuff && debuff.skillSeal ? [debuff.skillSeal] : [];
  const available = pool.filter(s => !sealed.includes(s));
  const shuffled = available.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ===== PvE FORTRESS INIT =====
function pveInitFortress(stageDef) {
  fortLoadTamaPet();
  _fortPreloadCloudImages();
  _fortCurrentBiome = stageDef.biome;
  _fortCurrentTheme = stageDef.theme || 'day';
  _fortSkyCache = null;

  const n = state.players.length;
  const canvasW = FORT_CANVAS_W;
  const terrain = generateFortressTerrain(canvasW, FORT_CANVAS_H, n);

  const players = state.players.map((p, i) => {
    const isCpu = p.id.startsWith('ai-');
    const debuff = _pveCpuDebuffs[p.id] || {};

    let hp = isCpu
      ? Math.max(10, stageDef.cpuBaseHp - (debuff.hpDown || 0))
      : _pvePlayerHp;

    let moveFuel = FORT_MOVE_FUEL;
    if (isCpu && debuff.moveDown) moveFuel = Math.max(10, FORT_MOVE_FUEL - debuff.moveDown);

    // 플레이어 위치: 선택된 위치가 있으면 사용
    let xPos;
    if (!isCpu && _pveSelectedPosition) {
      xPos = Math.max(40, Math.min(canvasW - 40, _pveSelectedPosition));
    } else {
      xPos = Math.floor((i + 1) * canvasW / (n + 1));
    }

    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: FORT_TANK_COLORS[i % FORT_TANK_COLORS.length],
      tama: p.tama || null,
      x: xPos,
      hp,
      alive: true,
      angle: 45,
      power: 50,
      moveFuel,
      poison: 0,
      frozen: 0,
      shield: 0,
      delay: 0,
      _pveMaxFuel: moveFuel,
      _pveDmgDown: isCpu ? (debuff.dmgDown || 0) : 0,
      _pvePowerDown: isCpu ? (debuff.powerDown || 0) : 0,
    };
  });

  _pveSelectedPosition = null; // 사용 후 초기화

  fortState = {
    players,
    terrain,
    wind: Math.floor(Math.random() * 11) - 5,
    turnIdx: 0,
    round: 1,
    phase: 'aiming',
    canvasW,
    canvasH: FORT_CANVAS_H,
    deathOrder: [],
  };

  // 로컬 컨트롤 초기화
  fortLocalAngle = 45;
  fortLocalPower = 50;
  fortMovedThisTurn = 0;
  _fortEquippedSkills = (typeof skillsGetEquipped === 'function') ? skillsGetEquipped('fortress') : [];
  _fortSkillUsage = {};
  _fortActiveSkill = null;
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];
  fortWindParticles = [];
  _fortFallingFeathers = [];
  _fortBirdHitCount = 0;
  _fortResolveTamaGlobals();
  if (typeof initFortBirds === 'function') initFortBirds();
  if (typeof initFortSkyPlatforms === 'function') initFortSkyPlatforms();

  // 카메라
  const xs = players.map(p => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const spanX = Math.max(maxX - minX, 200);
  const fitZoom = Math.max(FORT_CAM_ZOOM_MIN, Math.min(1.2, FORT_CANVAS_W / (spanX + 240)));
  fortCam.zoom = fitZoom;
  const cx = (minX + maxX) / 2;
  const cty = Math.floor(Math.max(0, Math.min(cx, FORT_CANVAS_W - 1)));
  const cy = (terrain[cty] || FORT_CANVAS_H * 0.7) - 40;
  fortCameraSnap(cx, cy);

  const view = createFortressView();
  broadcast({ type: 'game-start', game: 'fortress', state: view });
  showScreen('fortressGame');
  initFortCanvas();
  renderFortressView(view);
  setupFortressKeyboard();

  if (_fortCamLoopId) cancelAnimationFrame(_fortCamLoopId);
  _fortCamLoopId = requestAnimationFrame(fortCameraLoop);
  fortStartTurnTimer();

  // PvE UI
  pveShowStageBanner();
}

// ===== STAGE BANNER =====
function pveShowStageBanner() {
  const stageDef = PVE_STAGES[_pveStage];
  if (!stageDef) return;

  let banner = document.getElementById('pveStageBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'pveStageBanner';
    banner.className = 'pve-stage-banner';
    const gameEl = document.getElementById('fortressGame');
    if (gameEl) gameEl.appendChild(banner);
  }

  banner.innerHTML = `<span class="pve-banner-stage">STAGE ${_pveStage + 1}</span> <span class="pve-banner-name">${stageDef.name}</span>`;
  banner.style.display = 'flex';
  banner.classList.add('pve-banner-enter');

  setTimeout(() => {
    banner.classList.remove('pve-banner-enter');
    banner.classList.add('pve-banner-exit');
    setTimeout(() => {
      banner.style.display = 'none';
      banner.classList.remove('pve-banner-exit');
    }, 600);
  }, 2500);
}

// ===== DEBUFF INDICATORS ON PLAYER BAR =====
function pveRenderDebuffIndicators() {
  if (!_pveMode) return;
  setTimeout(() => {
    const bar = document.getElementById('fortPlayersBar');
    if (!bar) return;
    bar.querySelectorAll('.fort-player-hp-item').forEach(el => {
      const pid = el.dataset.playerId;
      if (!pid || !pid.startsWith('ai-')) return;
      const debuff = _pveCpuDebuffs[pid];
      if (!debuff) return;

      const existing = el.querySelector('.pve-debuff-icons');
      if (existing) existing.remove();

      const icons = [];
      if (debuff.dmgDown > 0) icons.push(PVE_DEBUFF_LABELS.dmgDown.emoji);
      if (debuff.hpDown > 0) icons.push(PVE_DEBUFF_LABELS.hpDown.emoji);
      if (debuff.moveDown > 0) icons.push(PVE_DEBUFF_LABELS.moveDown.emoji);
      if (debuff.powerDown > 0) icons.push(PVE_DEBUFF_LABELS.powerDown.emoji);
      if (debuff.skillSeal) icons.push(PVE_DEBUFF_LABELS.skillSeal.emoji);

      if (icons.length > 0) {
        const div = document.createElement('div');
        div.className = 'pve-debuff-icons';
        div.innerHTML = icons.map(ic => `<span class="pve-debuff-icon">${ic}</span>`).join('');
        const info = el.querySelector('.fort-player-info');
        if (info) info.appendChild(div);
      }
    });
  }, 50);
}

// =============================================
// ===== EVENT CUTSCENE ========================
// =============================================

function pveShowEvent() {
  _pvePhase = 'event';
  const eventIdx = Math.floor(Math.random() * PVE_EVENTS.length);
  const evt = PVE_EVENTS[eventIdx];

  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;
  ovl.style.display = 'flex';
  ovl.className = 'pve-overlay pve-event';

  ovl.innerHTML = `
    <div class="pve-event-box">
      <div class="pve-event-header">
        <div class="pve-event-stage">STAGE ${_pveStage} / ${PVE_STAGES.length} 클리어!</div>
        <div class="pve-event-hp">내 HP: <span class="pve-hp-value">${_pvePlayerHp}</span> / ${FORT_MAX_HP}</div>
      </div>
      <div class="pve-event-emoji">${evt.emoji}</div>
      <div class="pve-event-title">${evt.title}</div>
      <div class="pve-event-desc">${evt.desc}</div>
      <div class="pve-event-choices">
        ${evt.choices.map((c, i) => `
          <button class="pve-choice-btn" onclick="pveSelectDebuff(${eventIdx}, ${i})">
            <div class="pve-choice-label">${c.label}</div>
            <div class="pve-choice-desc">${c.desc}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// =============================================
// ===== DEBUFF SELECTION ======================
// =============================================

function pveSelectDebuff(eventIdx, choiceIdx) {
  const evt = PVE_EVENTS[eventIdx];
  if (!evt) return;
  const choice = evt.choices[choiceIdx];
  if (!choice) return;

  _pvePhase = 'debuff';

  // 플레이어 회복 이벤트
  if (choice.debuff === 'playerHeal') {
    _pvePlayerHp = Math.min(FORT_MAX_HP, _pvePlayerHp + choice.value);
    pveShowDebuffApplied(`💚 체력 ${choice.value} 회복! (HP: ${_pvePlayerHp})`, true);
    return;
  }

  // 모든 CPU에게 디버프 적용
  const nextStage = PVE_STAGES[_pveStage];
  if (!nextStage) return;

  for (let i = 0; i < nextStage.cpuCount; i++) {
    const cpuId = 'ai-' + i;
    if (!_pveCpuDebuffs[cpuId]) {
      _pveCpuDebuffs[cpuId] = { dmgDown: 0, hpDown: 0, moveDown: 0, powerDown: 0, skillSeal: null };
    }
    const d = _pveCpuDebuffs[cpuId];

    if (choice.debuff === 'skillSeal') {
      const skills = _pveCpuSkills[cpuId] || [];
      if (skills.length > 0) d.skillSeal = skills[Math.floor(Math.random() * skills.length)];
    } else {
      d[choice.debuff] = (d[choice.debuff] || 0) + choice.value;
    }
  }

  _pveRunStats.debuffsApplied.push(choice.debuff);
  const debuffInfo = PVE_DEBUFF_LABELS[choice.debuff] || { emoji: '❓', label: choice.debuff };
  pveShowDebuffApplied(`${debuffInfo.emoji} ${debuffInfo.label} 적용!`, false);
}

function pveShowDebuffApplied(text, isHeal) {
  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;
  ovl.className = 'pve-overlay pve-debuff-applied';
  ovl.innerHTML = `
    <div class="pve-debuff-result-box ${isHeal ? 'pve-heal' : 'pve-debuff'}">
      <div class="pve-debuff-result-text">${text}</div>
      <div class="pve-debuff-cpu-list">${pveRenderDebuffSummary()}</div>
      <button class="pve-btn pve-btn-primary" onclick="pveProceedToPosition()">다음 전투 준비</button>
    </div>
  `;
}

function pveRenderDebuffSummary() {
  const nextStage = PVE_STAGES[_pveStage];
  if (!nextStage) return '';
  let html = '';
  for (let i = 0; i < nextStage.cpuCount; i++) {
    const cpuId = 'ai-' + i;
    const debuff = _pveCpuDebuffs[cpuId];
    if (!debuff) continue;

    const cpuOffset = _pveStage * 3;
    const name = PVE_CPU_NAMES[(cpuOffset + i) % PVE_CPU_NAMES.length];
    const avatar = PVE_CPU_AVATARS[(cpuOffset + i) % PVE_CPU_AVATARS.length];

    const icons = [];
    if (debuff.dmgDown > 0) icons.push(`${PVE_DEBUFF_LABELS.dmgDown.emoji} -${debuff.dmgDown}`);
    if (debuff.hpDown > 0) icons.push(`${PVE_DEBUFF_LABELS.hpDown.emoji} -${debuff.hpDown}`);
    if (debuff.moveDown > 0) icons.push(`${PVE_DEBUFF_LABELS.moveDown.emoji} -${debuff.moveDown}`);
    if (debuff.powerDown > 0) icons.push(`${PVE_DEBUFF_LABELS.powerDown.emoji} -${debuff.powerDown}`);
    if (debuff.skillSeal) {
      const sd = (typeof SKILL_DEFS !== 'undefined') ? SKILL_DEFS.find(s => s.id === debuff.skillSeal) : null;
      icons.push(`${PVE_DEBUFF_LABELS.skillSeal.emoji} ${sd ? sd.name : debuff.skillSeal}`);
    }
    if (icons.length > 0) {
      html += `<div class="pve-cpu-debuff-row">
        <span class="pve-cpu-avatar">${avatar}</span>
        <span class="pve-cpu-name">${name}</span>
        <span class="pve-cpu-debuffs">${icons.join(' ')}</span>
      </div>`;
    }
  }
  return html || '<div class="pve-no-debuffs">디버프 없음</div>';
}

// =============================================
// ===== POSITION SELECTION ====================
// =============================================

function pveProceedToPosition() {
  _pvePhase = 'position';
  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;

  // 랜덤 위치 3개 생성
  const canvasW = FORT_CANVAS_W;
  const positions = [];
  const zones = [
    { min: 0.10, max: 0.30, label: '좌측' },
    { min: 0.35, max: 0.65, label: '중앙' },
    { min: 0.70, max: 0.90, label: '우측' },
  ];
  zones.forEach(z => {
    positions.push({
      x: Math.floor(canvasW * (z.min + Math.random() * (z.max - z.min))),
      label: z.label,
    });
  });

  ovl.className = 'pve-overlay pve-position';
  ovl.innerHTML = `
    <div class="pve-position-box">
      <div class="pve-position-title">⚡ 전장 진입 지점 선택</div>
      <div class="pve-position-desc">다음 전투의 시작 위치를 선택하세요</div>
      <div class="pve-position-choices">
        ${positions.map(p => `
          <button class="pve-position-btn" onclick="pveSelectPosition(${p.x})">
            <div class="pve-pos-icon">📍</div>
            <div class="pve-pos-label">${p.label}</div>
            <div class="pve-pos-detail">X: ${p.x}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function pveSelectPosition(x) {
  _pveSelectedPosition = x;
  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;

  // 텔레포트 연출
  ovl.className = 'pve-overlay pve-teleport';
  ovl.innerHTML = `
    <div class="pve-teleport-box">
      <div class="pve-teleport-emoji">⚡</div>
      <div class="pve-teleport-text">전장으로 이동 중...</div>
    </div>
  `;

  setTimeout(() => {
    ovl.style.display = 'none';
    pveStartCurrentStage();
  }, 1200);
}

// =============================================
// ===== VICTORY / DEFEAT ======================
// =============================================

function pveShowVictory() {
  _pvePhase = 'event';
  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;
  ovl.style.display = 'flex';
  ovl.className = 'pve-overlay pve-victory';
  ovl.innerHTML = `
    <div class="pve-result-box pve-victory-box">
      <div class="pve-result-emoji">🏆</div>
      <div class="pve-result-title">원정 성공!</div>
      <div class="pve-result-desc">모든 스테이지를 클리어했습니다!</div>
      <div class="pve-result-stats">
        <div>클리어 스테이지: ${_pveRunStats.stagesCleared} / ${PVE_STAGES.length}</div>
        <div>최종 HP: ${_pvePlayerHp} / ${FORT_MAX_HP}</div>
      </div>
      <button class="pve-btn pve-btn-primary" onclick="pveExit()">돌아가기</button>
    </div>
  `;
}

function pveShowDefeat() {
  _pvePhase = 'event';
  const ovl = document.getElementById('pveOverlay');
  if (!ovl) return;
  ovl.style.display = 'flex';
  ovl.className = 'pve-overlay pve-defeat';
  ovl.innerHTML = `
    <div class="pve-result-box pve-defeat-box">
      <div class="pve-result-emoji">💀</div>
      <div class="pve-result-title">원정 실패...</div>
      <div class="pve-result-desc">STAGE ${_pveStage + 1}에서 쓰러졌습니다.</div>
      <div class="pve-result-stats">
        <div>클리어 스테이지: ${_pveRunStats.stagesCleared} / ${PVE_STAGES.length}</div>
      </div>
      <div class="pve-result-btns">
        <button class="pve-btn pve-btn-primary" onclick="pveRetry()">다시 도전</button>
        <button class="pve-btn pve-btn-secondary" onclick="pveExit()">돌아가기</button>
      </div>
    </div>
  `;
}

function pveRetry() {
  const ovl = document.getElementById('pveOverlay');
  if (ovl) ovl.style.display = 'none';
  closeFortressCleanup();
  startFortressPvE();
}

function pveExit() {
  const ovl = document.getElementById('pveOverlay');
  if (ovl) ovl.style.display = 'none';
  closeFortressCleanup();
  pveCleanup();
  if (typeof leavePracticeMode === 'function') leavePracticeMode();
}

function pveCleanup() {
  pveUninstallHooks();
  _pveMode = false;
  _pveStage = 0;
  _pvePhase = 'battle';
  _pveCpuSkills = {};
  _pveCpuDebuffs = {};
  _pvePlayerHp = FORT_MAX_HP;
  _pveSelectedPosition = null;
  const banner = document.getElementById('pveStageBanner');
  if (banner) banner.remove();
}

// =============================================
// ===== PvE ENHANCED AI =======================
// =============================================
// aiFortress()에서 호출됨 — PvE 모드일 때 스킬 사용 AI

function aiFortressPvE() {
  if (!_pveMode) return false;
  if (!fortState || fortState.phase !== 'aiming') return true;

  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.id.startsWith('ai-')) return true;
  if (!current.alive) return true;

  // 중복 방지
  const turnKey = 'pve-' + fortState.round + '-' + fortState.turnIdx;
  if (_fortAIKey === turnKey) return true;
  _fortAIKey = turnKey;

  const enemies = fortState.players.filter(p => p.alive && p.id !== current.id);
  if (enemies.length === 0) return true;

  // 가장 가까운 적
  let target = enemies[0];
  let minDist = Math.abs(target.x - current.x);
  enemies.forEach(e => {
    const d = Math.abs(e.x - current.x);
    if (d < minDist) { minDist = d; target = e; }
  });

  // 이동 결정
  const shouldMove = Math.random() < 0.4 || current.x < 50 || current.x > FORT_CANVAS_W - 50;
  let moveSteps = 0;

  if (shouldMove && current.moveFuel > 0) {
    let moveDir;
    if (current.x < 50) moveDir = 1;
    else if (current.x > FORT_CANVAS_W - 50) moveDir = -1;
    else moveDir = Math.random() > 0.5 ? 1 : -1;

    moveSteps = Math.min(
      Math.floor(Math.random() * 5) + 1,
      Math.floor(current.moveFuel / FORT_MOVE_SPEED)
    );

    for (let i = 0; i < moveSteps; i++) {
      const mt = setTimeout(() => {
        if (!fortState || fortState.phase !== 'aiming') return;
        const cp = fortState.players[fortState.turnIdx];
        if (!cp || cp.id !== current.id) return;
        handleFortMove(state.myId, { type: 'fort-move', dir: moveDir });
      }, 300 + i * 80);
      if (typeof _aiTimers !== 'undefined') _aiTimers.push(mt);
    }
  }

  // 각도
  const dx = target.x - current.x;
  const baseAngle = dx > 0 ? 35 + Math.random() * 25 : 115 + Math.random() * 25;

  // 파워 (디버프 적용)
  const dist = Math.abs(dx);
  let basePower = Math.min(95, Math.max(20, dist * 0.12 + 30));
  const windEffect = fortState.wind * 2;
  if ((dx > 0 && fortState.wind < 0) || (dx < 0 && fortState.wind > 0)) basePower += Math.abs(windEffect);
  else basePower -= Math.abs(windEffect) * 0.5;
  basePower += (Math.random() - 0.5) * 12;
  const maxPower = Math.max(30, 100 - (current._pvePowerDown || 0));
  basePower = Math.max(15, Math.min(maxPower, Math.round(basePower)));

  const angle = Math.round(baseAngle);
  const power = Math.round(basePower);

  // 스킬 선택 (45% 확률)
  let selectedSkill = null;
  const cpuSkills = _pveCpuSkills[current.id] || [];
  if (cpuSkills.length > 0 && Math.random() < 0.45) {
    // HP 낮으면 힐 우선
    if (current.hp < 40) {
      const healSkills = cpuSkills.filter(s => s.startsWith('heal_'));
      if (healSkills.length > 0) selectedSkill = healSkills[Math.floor(Math.random() * healSkills.length)];
    }
    // 쉴드
    if (!selectedSkill && current.hp < 30 && cpuSkills.includes('shield') && !current.shield) {
      selectedSkill = 'shield';
    }
    // 공격 스킬
    if (!selectedSkill) {
      const atkSkills = cpuSkills.filter(s => !s.startsWith('heal_') && s !== 'shield');
      if (atkSkills.length > 0) selectedSkill = atkSkills[Math.floor(Math.random() * atkSkills.length)];
    }
  }

  const skillDef = selectedSkill && (typeof skillsGetDef === 'function') ? skillsGetDef(selectedSkill) : null;
  const isInstant = skillDef && skillDef.type === 'instant';

  const fireDelay = 800 + Math.random() * 600 + moveSteps * 100;
  const t = setTimeout(() => {
    if (!isAIActive() || !fortState) return;
    if (fortState.phase !== 'aiming') return;
    const cp = fortState.players[fortState.turnIdx];
    if (!cp || cp.id !== current.id) return;

    if (isInstant) {
      handleFortInstantSkill(state.myId, { type: 'fort-instant-skill', skill: selectedSkill });
    } else {
      handleFortFire(state.myId, { type: 'fort-fire', angle, power, skill: selectedSkill });
    }
  }, fireDelay);
  if (typeof _aiTimers !== 'undefined') _aiTimers.push(t);

  return true;
}

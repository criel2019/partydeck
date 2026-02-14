// ====================================================================
// ===== MAFIA FULL VERSION ENGINE ====================================
// ====================================================================

/*
 * Replaces the basic startMafia() with a complete 11-role implementation.
 *
 * ROLES:
 *  마피아팀: mafia (x2), spy
 *  시민팀:   police, doctor, reporter, undertaker, detective,
 *            senator, soldier, lover (x2), baeksu (unemployed), citizen
 *
 * Architecture:
 *  - Host-authoritative: all game state lives on host
 *  - Host sends each player a personalized "view" object
 *  - Clients render purely from their view
 *  - Night actions collected from all players, resolved simultaneously on host
 *
 * Message types used:
 *  Host -> Client:  { type: 'mf-state', ...viewData }
 *  Host -> Client:  { type: 'mf-result', winner, message }
 *  Client -> Host:  { type: 'mf-action', action, targetId, extra }
 *  Client -> Host:  { type: 'mf-vote', targetId }
 *  Client -> Host:  { type: 'mf-chat', text }
 *  Client -> Host:  { type: 'mf-extend' }
 *  Client -> Host:  { type: 'mf-skip-vote' }
 */

// ========================= CONSTANTS =========================

const MF_ROLES = {
  mafia:      { emoji: '🔪', name: '마피아',   team: 'mafia',   desc: '밤에 팀원과 상의하여 1명을 제거하세요' },
  spy:        { emoji: '🕵️', name: '스파이',   team: 'mafia',   desc: '밤마다 마피아를 1명 찾을 수 있습니다' },
  police:     { emoji: '🔍', name: '경찰',     team: 'citizen', desc: '밤마다 1명이 마피아인지 조사합니다' },
  doctor:     { emoji: '💊', name: '의사',     team: 'citizen', desc: '밤마다 1명을 치료하여 마피아 공격을 막습니다' },
  reporter:   { emoji: '📰', name: '기자',     team: 'citizen', desc: '밤마다 1명이 스파이인지 조사합니다' },
  undertaker: { emoji: '⚰️', name: '장의사',   team: 'citizen', desc: '밤에 죽은 시체가 마피아인지 시민인지 확인합니다' },
  detective:  { emoji: '🔎', name: '탐정',     team: 'citizen', desc: '시민이 죽으면 그 시민을 죽인 마피아를 알 수 있습니다' },
  senator:    { emoji: '🏛️', name: '국회의원', team: 'citizen', desc: '투표로 처형당하지 않습니다' },
  soldier:    { emoji: '🛡️', name: '군인',     team: 'citizen', desc: '마피아 일반 공격을 1회 막을 수 있습니다 (저격은 즉사)' },
  lover:      { emoji: '💕', name: '연인',     team: 'citizen', desc: '서로 연인이 누구인지 알고 시작합니다' },
  baeksu:     { emoji: '😴', name: '백수',     team: 'citizen', desc: '4번째 사망 시, 첫 사망자의 직업을 이어받습니다' },
  citizen:    { emoji: '👤', name: '시민',     team: 'citizen', desc: '마피아를 찾아 투표하세요' },
};

const MF_PHASE_LABELS = {
  'role-reveal': { icon: '🎭', text: '역할 배분', cls: 'night' },
  'night':       { icon: '🌙', text: '밤',       cls: 'night' },
  'day-announce': { icon: '☀️', text: '아침 발표', cls: 'day' },
  'day-discuss':  { icon: '☀️', text: '토론',     cls: 'day' },
  'day-vote':     { icon: '🗳️', text: '투표',     cls: 'vote' },
  'vote-result':  { icon: '⚖️', text: '처형 결과', cls: 'vote' },
  'result':       { icon: '🏆', text: '게임 종료', cls: 'result' },
};

const MF_NIGHT_DURATION = 30;
const MF_DISCUSS_DURATION = 180;
const MF_VOTE_DURATION = 30;
const MF_ANNOUNCE_DURATION = 8;
const MF_REVEAL_DURATION = 8;
const MF_VOTE_RESULT_DURATION = 6;

// ========================= HOST STATE =========================

let mfState = null;    // host-only full state
let mfView = null;     // local player's current view
let mfTimer = null;    // interval id
let mfSelectedTarget = null;
let mfUseSnipe = false;

// ========================= ROLE CONFIG =========================
let mfConfig = {
  mafia: 1, spy: false, reporter: false, police: false, doctor: false,
  undertaker: false, detective: false, senator: false, soldier: false,
  lover: false, baeksu: false,
};
let mfSetupDone = false; // tracks if host has configured

// ========================= SETUP UI ============================

function mfOpenSetup() {
  if (!state.isHost) return;
  const overlay = document.getElementById('mfSetupOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  mfRenderSetup();
}

function mfCloseSetup() {
  const overlay = document.getElementById('mfSetupOverlay');
  if (overlay) overlay.style.display = 'none';
}

function mfConfirmSetup() {
  // Validate: need at least 1 mafia
  if (mfConfig.mafia < 1) { showToast('마피아는 최소 1명 필요합니다'); return; }

  mfSetupDone = true;
  mfCloseSetup();

  // Broadcast config to all players (lobby info sharing)
  broadcast({ type: 'mf-config', config: mfConfig });
  mfShowConfigInLobby();

  showToast('직업 설정 완료!');
}

function mfToggleRole(role) {
  if (role === 'reporter') {
    // Reporter is linked to spy - cannot toggle independently
    return;
  }

  mfConfig[role] = !mfConfig[role];

  // Spy ↔ Reporter linkage
  if (role === 'spy') {
    mfConfig.reporter = mfConfig.spy;
  }

  mfRenderSetup();
}

function mfAdjustMafiaCount(delta) {
  mfConfig.mafia = Math.max(1, Math.min(3, mfConfig.mafia + delta));
  mfRenderSetup();
}

function mfGetConfigRoleCount() {
  let count = mfConfig.mafia;
  if (mfConfig.spy) count++;
  if (mfConfig.reporter) count++;
  if (mfConfig.police) count++;
  if (mfConfig.doctor) count++;
  if (mfConfig.undertaker) count++;
  if (mfConfig.detective) count++;
  if (mfConfig.senator) count++;
  if (mfConfig.soldier) count++;
  if (mfConfig.lover) count += 2;
  if (mfConfig.baeksu) count++;
  return count;
}

function mfRenderSetup() {
  const content = document.getElementById('mfSetupContent');
  if (!content) return;

  const totalRoles = mfGetConfigRoleCount();
  const playerCount = state.players.length;
  const isOver = totalRoles > playerCount;

  // Update count display
  const countEl = document.getElementById('mfSetupRoleCount');
  if (countEl) {
    countEl.textContent = totalRoles;
    countEl.style.color = isOver ? '#ff4444' : '#d4af37';
  }
  const playerCountEl = document.getElementById('mfSetupPlayerCount');
  if (playerCountEl) playerCountEl.textContent = `/ ${playerCount}명`;

  const SETUP_ROLES = [
    { key: 'mafia', name: '마피아', emoji: '🔪', type: 'count',
      desc: '시민을 모두 탈락시키면 승리. 밤마다 시민 1명을 죽인다.', team: 'mafia' },
    { key: 'spy', name: '스파이', emoji: '🕵️', type: 'toggle',
      desc: '스파이 ON 시 기자가 자동 포함됩니다.', team: 'mafia' },
    { key: 'reporter', name: '기자', emoji: '📰', type: 'toggle', linkedTo: 'spy',
      desc: '밤마다 스파이를 찾을 수 있다.', team: 'citizen' },
    { key: 'police', name: '경찰', emoji: '🔍', type: 'toggle',
      desc: '밤마다 마피아인지 조사한다.', team: 'citizen' },
    { key: 'doctor', name: '의사', emoji: '💊', type: 'toggle',
      desc: '밤마다 1명을 치료하여 마피아 공격을 막는다. (저격은 치료 불가)', team: 'citizen' },
    { key: 'undertaker', name: '장의사', emoji: '⚰️', type: 'toggle',
      desc: '밤에 죽은 사람이 마피아인지 시민인지 확인한다.', team: 'citizen' },
    { key: 'detective', name: '탐정', emoji: '🔎', type: 'toggle',
      desc: '추적 중인 시민이 죽으면 범인을 알 수 있다.', team: 'citizen' },
    { key: 'lover', name: '연인', emoji: '💕', type: 'toggle',
      desc: '연인 ON 시 항상 2명으로 배정됩니다. 서로 누구인지 알고 시작합니다.', team: 'citizen' },
    { key: 'senator', name: '국회의원', emoji: '🏛️', type: 'toggle',
      desc: '투표로 처형당하지 않는다. (영구 면역)', team: 'citizen' },
    { key: 'soldier', name: '군인', emoji: '🛡️', type: 'toggle',
      desc: '마피아 공격을 1회 막을 수 있다. (저격은 즉사)', team: 'citizen' },
    { key: 'baeksu', name: '백수', emoji: '😴', type: 'toggle',
      desc: '4명 사망 시 첫 사망자의 직업을 이어받는다.', team: 'citizen' },
  ];

  let html = '';
  SETUP_ROLES.forEach(role => {
    const isLinked = role.linkedTo && !mfConfig[role.linkedTo];
    const isEnabled = mfConfig[role.key];
    const isMafia = role.team === 'mafia';
    const rowClass = `mf-setup-row ${isMafia ? 'mafia-row' : ''} ${isEnabled ? 'active' : ''} ${isLinked ? 'linked-disabled' : ''}`;

    html += `<div class="${rowClass}">`;
    html += `<div class="mf-setup-role-left">`;
    html += `<span class="mf-setup-role-emoji">${role.emoji}</span>`;
    html += `<div class="mf-setup-role-info">`;
    html += `<div class="mf-setup-role-name ${isMafia ? 'mafia-name' : ''}">${role.name}</div>`;
    html += `<div class="mf-setup-role-desc">${role.desc}</div>`;
    html += `</div></div>`;

    html += `<div class="mf-setup-role-right">`;
    if (role.type === 'count') {
      html += `<div class="mf-setup-count-ctrl">`;
      html += `<button class="mf-setup-count-btn plus" onclick="mfAdjustMafiaCount(1)">+</button>`;
      html += `<span class="mf-setup-count-num">${mfConfig.mafia}</span>`;
      html += `<button class="mf-setup-count-btn minus" onclick="mfAdjustMafiaCount(-1)">−</button>`;
      html += `</div>`;
    } else {
      const disabled = isLinked ? 'disabled' : '';
      const checked = isEnabled ? 'checked' : '';
      html += `<label class="mf-setup-switch">`;
      html += `<input type="checkbox" ${checked} ${disabled} onchange="mfToggleRole('${role.key}')">`;
      html += `<span class="mf-setup-slider"></span>`;
      html += `</label>`;
    }
    html += `</div></div>`;
  });

  content.innerHTML = html;
}

function mfHandleConfig(msg) {
  if (msg.config) {
    mfConfig = { ...mfConfig, ...msg.config };
    mfSetupDone = true;
    mfShowConfigInLobby();
  }
}

function mfShowConfigInLobby() {
  const display = document.getElementById('mfConfigDisplay');
  if (!display) return;

  // Show the mafia lobby area too
  const mfLobbyArea = document.getElementById('mfLobbyArea');
  if (mfLobbyArea) mfLobbyArea.style.display = 'block';

  display.style.display = 'block';

  const roles = [];
  roles.push(`🔪 마피아 x${mfConfig.mafia}`);
  if (mfConfig.spy) roles.push('🕵️ 스파이');
  if (mfConfig.reporter) roles.push('📰 기자');
  if (mfConfig.police) roles.push('🔍 경찰');
  if (mfConfig.doctor) roles.push('💊 의사');
  if (mfConfig.undertaker) roles.push('⚰️ 장의사');
  if (mfConfig.detective) roles.push('🔎 탐정');
  if (mfConfig.lover) roles.push('💕 연인 x2');
  if (mfConfig.senator) roles.push('🏛️ 국회의원');
  if (mfConfig.soldier) roles.push('🛡️ 군인');
  if (mfConfig.baeksu) roles.push('😴 백수');

  const totalRoles = mfGetConfigRoleCount();
  const citizens = Math.max(0, state.players.length - totalRoles);
  if (citizens > 0) roles.push(`👤 시민 x${citizens}`);

  const hostLabel = state.isHost ? '(수정하려면 위 버튼 클릭)' : '';

  display.innerHTML = `
    <div class="mf-config-title">🎭 직업 구성 (${totalRoles}/${state.players.length}명) ${hostLabel}</div>
    <div class="mf-config-tags">${roles.map(r => `<span class="mf-config-tag">${r}</span>`).join('')}</div>
  `;
}

// ========================= ROLE ASSIGNMENT ====================

function mfAssignRoles(playerCount) {
  const roles = [];
  for (let i = 0; i < mfConfig.mafia; i++) roles.push('mafia');
  if (mfConfig.spy) roles.push('spy');
  if (mfConfig.reporter) roles.push('reporter');
  if (mfConfig.police) roles.push('police');
  if (mfConfig.doctor) roles.push('doctor');
  if (mfConfig.undertaker) roles.push('undertaker');
  if (mfConfig.detective) roles.push('detective');
  if (mfConfig.senator) roles.push('senator');
  if (mfConfig.soldier) roles.push('soldier');
  if (mfConfig.lover) { roles.push('lover', 'lover'); }
  if (mfConfig.baeksu) roles.push('baeksu');

  if (roles.length > playerCount) {
    showToast(`직업 수(${roles.length})가 플레이어 수(${playerCount})보다 많습니다!`);
    return null;
  }
  while (roles.length < playerCount) roles.push('citizen');

  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

// ========================= START GAME =========================

function startMafia() {
  if (!state.isHost) return;
  const n = state.players.length;
  if (n < 4) {
    showToast('마피아는 최소 4명이 필요합니다');
    return;
  }
  if (!mfSetupDone) {
    showToast('먼저 직업 설정을 해주세요!');
    return;
  }

  // Validate role count against current players
  const totalRoles = mfGetConfigRoleCount();
  if (totalRoles > n) {
    showToast(`직업 수(${totalRoles})가 플레이어 수(${n})보다 많습니다! 직업 설정을 수정하세요.`);
    return;
  }

  mfStartGame();
}

function mfStartGame() {
  if (!state.isHost) return;
  const n = state.players.length;

  const roles = mfAssignRoles(n);
  if (!roles) return; // validation failed

  // Find lover partner IDs
  const loverIndices = [];
  roles.forEach((r, i) => { if (r === 'lover') loverIndices.push(i); });

  mfState = {
    phase: 'role-reveal',
    round: 1,
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost || false,
      role: roles[i],
      activeRole: roles[i],
      alive: true,
      lives: roles[i] === 'soldier' ? 2 : 1,
      snipesLeft: roles[i] === 'mafia' ? 1 : 0,
      spyFoundMafia: false,
      baeksuInherited: false,
      senatorRevealed: false,
      loverPartnerId: null,
    })),
    nightActions: {},
    killLog: [],
    deathOrder: [],
    chatMessages: [],
    spyKnownRoles: {},
    votes: {},
    extensionUsed: {},
    extensionAdded: false,
    timer: MF_REVEAL_DURATION,
    announcements: [],
    discussSkipVotes: {},
  };

  // Assign lover partners
  if (loverIndices.length === 2) {
    const p0 = mfState.players[loverIndices[0]];
    const p1 = mfState.players[loverIndices[1]];
    p0.loverPartnerId = p1.id;
    p1.loverPartnerId = p0.id;
  }

  mfBroadcastState();
  showScreen('mafiaGame');
  mfStartTimer();
}

// ========================= TIMER ==============================

function mfStartTimer() {
  clearInterval(mfTimer);
  mfTimer = setInterval(() => {
    if (!mfState) return;
    mfState.timer--;

    // Update local display
    const timerEl = document.getElementById('mfTimer');
    if (timerEl) timerEl.textContent = mfState.timer;

    if (mfState.timer <= 0) {
      clearInterval(mfTimer);
      if (state.isHost) mfAdvancePhase();
    }
  }, 1000);
}

function mfSetPhaseTimer(duration) {
  mfState.timer = duration;
  mfStartTimer();
}

// ========================= PHASE ADVANCEMENT ==================

function mfAdvancePhase() {
  if (!state.isHost || !mfState) return;

  const phase = mfState.phase;

  if (phase === 'role-reveal') {
    // Move to first night
    mfState.phase = 'night';
    mfState.nightActions = {};
    mfSetPhaseTimer(MF_NIGHT_DURATION);
  }
  else if (phase === 'night') {
    mfResolveNight();
  }
  else if (phase === 'day-announce') {
    mfState.phase = 'day-discuss';
    mfState.votes = {};
    mfState.extensionUsed = {};
    mfState.extensionAdded = false;
    mfState.discussSkipVotes = {};
    mfSetPhaseTimer(MF_DISCUSS_DURATION);
  }
  else if (phase === 'day-discuss') {
    mfState.phase = 'day-vote';
    mfState.votes = {};
    mfSetPhaseTimer(MF_VOTE_DURATION);
  }
  else if (phase === 'day-vote') {
    mfResolveVote();
  }
  else if (phase === 'vote-result') {
    // Check win condition
    if (mfCheckWin()) return;
    // Go to night
    mfState.phase = 'night';
    mfState.round++;
    mfState.nightActions = {};
    mfState.announcements = [];
    mfSetPhaseTimer(MF_NIGHT_DURATION);
  }

  mfBroadcastState();
}

// ========================= NIGHT RESOLUTION ===================

function mfResolveNight() {
  const ms = mfState;
  const actions = ms.nightActions;
  const announcements = [];

  // --- Collect mafia team actions ---
  // Find mafia kill action (only 1 mafia acts per night for kill/snipe)
  let killTargetId = null;
  let killerId = null;
  let isSnipe = false;

  // Iterate mafia actions
  const mafiaPlayers = ms.players.filter(p => p.activeRole === 'mafia' && p.alive);
  for (const mp of mafiaPlayers) {
    const act = actions[mp.id];
    if (act && act.action === 'kill') {
      killTargetId = act.targetId;
      killerId = mp.id;
      isSnipe = false;
      break;
    }
    if (act && act.action === 'snipe') {
      killTargetId = act.targetId;
      killerId = mp.id;
      isSnipe = true;
      break;
    }
  }

  // --- Doctor heal target ---
  const doctorPlayer = ms.players.find(p => p.activeRole === 'doctor' && p.alive);
  let healTargetId = null;
  if (doctorPlayer && actions[doctorPlayer.id]) {
    healTargetId = actions[doctorPlayer.id].targetId;
  }

  // --- Detective tracking target ---
  const detectivePlayer = ms.players.find(p => p.activeRole === 'detective' && p.alive);
  let detectiveTargetId = null;
  if (detectivePlayer && actions[detectivePlayer.id]) {
    detectiveTargetId = actions[detectivePlayer.id].targetId;
  }

  // --- Police investigation ---
  const policePlayer = ms.players.find(p => p.activeRole === 'police' && p.alive);
  let policeTargetId = null;
  let policeResult = null;
  if (policePlayer && actions[policePlayer.id]) {
    policeTargetId = actions[policePlayer.id].targetId;
    const target = ms.players.find(p => p.id === policeTargetId);
    if (target) {
      const isMafia = (target.activeRole === 'mafia');
      policeResult = { targetId: policeTargetId, targetName: target.name, isMafia };
    }
  }

  // --- Reporter investigation (looking for spy) ---
  const reporterPlayer = ms.players.find(p => p.activeRole === 'reporter' && p.alive);
  let reporterTargetId = null;
  let reporterResult = null;
  if (reporterPlayer && actions[reporterPlayer.id]) {
    reporterTargetId = actions[reporterPlayer.id].targetId;
    const target = ms.players.find(p => p.id === reporterTargetId);
    if (target) {
      const isSpy = (target.activeRole === 'spy');
      reporterResult = { targetId: reporterTargetId, targetName: target.name, isSpy };
    }
  }

  // --- Spy investigation (looking for mafia) ---
  const spyPlayer = ms.players.find(p => p.activeRole === 'spy' && p.alive);
  let spyTargetId = null;
  let spyResult = null;
  if (spyPlayer && actions[spyPlayer.id]) {
    spyTargetId = actions[spyPlayer.id].targetId;
    const target = ms.players.find(p => p.id === spyTargetId);
    if (target) {
      const isMafia = (target.activeRole === 'mafia');
      if (isMafia) {
        spyPlayer.spyFoundMafia = true;
      }
      spyResult = { targetId: spyTargetId, targetName: target.name, isMafia };
    }
  }

  // --- Undertaker target (check corpse from last night/vote death) ---
  const undertakerPlayer = ms.players.find(p => p.activeRole === 'undertaker' && p.alive);
  let undertakerTargetId = null;
  let undertakerResult = null;
  if (undertakerPlayer && actions[undertakerPlayer.id]) {
    undertakerTargetId = actions[undertakerPlayer.id].targetId;
    const target = ms.players.find(p => p.id === undertakerTargetId);
    if (target && !target.alive) {
      // Spy shows as citizen
      const showTeam = (target.activeRole === 'mafia') ? '마피아' : '시민';
      undertakerResult = { targetId: undertakerTargetId, targetName: target.name, team: showTeam };
    }
  }

  // =========================
  // RESOLVE KILL
  // =========================
  let killedPlayer = null;
  let killBlocked = false;
  let deathMessage = '';

  if (killTargetId) {
    const victim = ms.players.find(p => p.id === killTargetId);
    if (victim && victim.alive) {
      if (isSnipe) {
        // Snipe bypasses doctor, soldier, detective
        victim.alive = false;
        victim.lives = 0;
        killedPlayer = victim;
        deathMessage = 'snipe';

        // Deduct snipe from killer
        const killer = ms.players.find(p => p.id === killerId);
        if (killer) killer.snipesLeft = Math.max(0, killer.snipesLeft - 1);

        // Log kill
        ms.killLog.push({ victimId: victim.id, killerId, method: 'snipe', round: ms.round });
        ms.deathOrder.push(victim.id);

        announcements.push({
          type: 'snipe',
          icon: '🎯',
          text: `${victim.name}님이 저격당했습니다!`
        });
      } else {
        // Normal kill - check doctor heal and soldier
        if (healTargetId === killTargetId) {
          // Doctor saved
          killBlocked = true;
          announcements.push({
            type: 'safe',
            icon: '🌙',
            text: '밤에 아무 일도 일어나지 않았습니다.'
          });
        } else if (victim.activeRole === 'soldier' && victim.lives > 1) {
          // Soldier survives
          victim.lives--;
          killBlocked = true;
          announcements.push({
            type: 'safe',
            icon: '🌙',
            text: '밤에 아무 일도 일어나지 않았습니다.'
          });
        } else {
          // Victim dies
          victim.alive = false;
          victim.lives = 0;
          killedPlayer = victim;
          deathMessage = 'kill';

          ms.killLog.push({ victimId: victim.id, killerId, method: 'kill', round: ms.round });
          ms.deathOrder.push(victim.id);

          announcements.push({
            type: 'death',
            icon: '💀',
            text: `${victim.name}님이 마피아에게 살해당했습니다.`
          });
        }
      }
    }
  } else {
    // No mafia action
    announcements.push({
      type: 'safe',
      icon: '🌙',
      text: '평화로운 밤이었습니다.'
    });
  }

  // --- Detective result (only if a citizen was killed by normal kill) ---
  let detectiveResult = null;
  if (detectivePlayer && detectivePlayer.alive && detectiveTargetId && killedPlayer) {
    // Detective was tracking the killed person
    if (detectiveTargetId === killedPlayer.id && deathMessage === 'kill') {
      const killerP = ms.players.find(p => p.id === killerId);
      if (killerP) {
        detectiveResult = { victimName: killedPlayer.name, killerName: killerP.name, killerId };
      }
    }
    // Note: snipe bypasses detective
  }

  // --- Spy: update dead player roles knowledge ---
  if (spyPlayer && spyPlayer.alive) {
    ms.players.forEach(p => {
      if (!p.alive && !ms.spyKnownRoles[p.id]) {
        // Spy can see dead player's role
        ms.spyKnownRoles[p.id] = MF_ROLES[p.activeRole]?.name || '시민';
      }
    });
  }

  // --- Baeksu mechanic: 4th death triggers inheritance ---
  if (ms.deathOrder.length >= 4) {
    const baeksuPlayer = ms.players.find(p => p.activeRole === 'baeksu' && p.alive && !p.baeksuInherited);
    if (baeksuPlayer) {
      let inheritFrom = null;
      // First death's role
      const firstDead = ms.players.find(p => p.id === ms.deathOrder[0]);
      if (firstDead) {
        const firstRole = firstDead.activeRole;
        const firstTeam = MF_ROLES[firstRole]?.team;
        if (firstTeam === 'mafia') {
          // If first dead was mafia team, inherit next citizen's role
          for (let i = 1; i < ms.deathOrder.length; i++) {
            const dp = ms.players.find(p => p.id === ms.deathOrder[i]);
            if (dp && MF_ROLES[dp.activeRole]?.team === 'citizen') {
              inheritFrom = dp;
              break;
            }
          }
        } else {
          inheritFrom = firstDead;
        }
      }

      if (inheritFrom) {
        baeksuPlayer.activeRole = inheritFrom.activeRole;
        baeksuPlayer.baeksuInherited = true;
        // Copy special attributes
        if (inheritFrom.activeRole === 'soldier') {
          baeksuPlayer.lives = 2;
        }
      }
    }
  }

  // Store announcements
  ms.announcements = announcements;

  // Store personal results for this night
  ms._nightResults = {
    policeResult,
    reporterResult,
    spyResult,
    detectiveResult,
    undertakerResult,
    killedPlayer,
    deathMessage,
  };

  // Check win
  if (mfCheckWin()) return;

  // Move to day announce
  ms.phase = 'day-announce';
  mfSetPhaseTimer(MF_ANNOUNCE_DURATION);
  mfBroadcastState();
}

// ========================= VOTE RESOLUTION ====================

function mfResolveVote() {
  const ms = mfState;
  const votes = ms.votes;

  // Count votes
  const counts = {};
  let skipCount = 0;
  Object.values(votes).forEach(v => {
    if (v === 'skip') { skipCount++; return; }
    counts[v] = (counts[v] || 0) + 1;
  });

  // Find highest vote
  let maxVotes = 0;
  let candidates = [];
  Object.entries(counts).forEach(([pid, c]) => {
    if (c > maxVotes) {
      maxVotes = c;
      candidates = [pid];
    } else if (c === maxVotes) {
      candidates.push(pid);
    }
  });

  const announcements = [];

  if (candidates.length === 1 && maxVotes > skipCount) {
    const targetId = candidates[0];
    const target = ms.players.find(p => p.id === targetId);

    if (target) {
      // Check senator immunity
      if (target.activeRole === 'senator') {
        announcements.push({
          type: 'immunity',
          icon: '🏛️',
          text: `${target.name}님은 국회의원입니다! 투표로 처형할 수 없습니다.`
        });
      } else {
        // Execute
        target.alive = false;
        target.lives = 0;
        ms.deathOrder.push(target.id);

        const roleName = MF_ROLES[target.activeRole]?.name || '시민';
        const teamLabel = MF_ROLES[target.activeRole]?.team === 'mafia' ? '마피아팀' : '시민팀';

        announcements.push({
          type: 'vote-result',
          icon: '⚖️',
          text: `${target.name}님이 처형되었습니다. 정체: ${roleName} (${teamLabel})`
        });

        // Check baeksu inheritance
        if (ms.deathOrder.length >= 4) {
          const baeksu = ms.players.find(p => p.activeRole === 'baeksu' && p.alive && !p.baeksuInherited);
          if (baeksu) {
            const firstDead = ms.players.find(p => p.id === ms.deathOrder[0]);
            if (firstDead) {
              const firstTeam = MF_ROLES[firstDead.activeRole]?.team;
              let inheritFrom = null;
              if (firstTeam === 'mafia') {
                for (let i = 1; i < ms.deathOrder.length; i++) {
                  const dp = ms.players.find(p => p.id === ms.deathOrder[i]);
                  if (dp && MF_ROLES[dp.activeRole]?.team === 'citizen') {
                    inheritFrom = dp;
                    break;
                  }
                }
              } else {
                inheritFrom = firstDead;
              }
              if (inheritFrom) {
                baeksu.activeRole = inheritFrom.activeRole;
                baeksu.baeksuInherited = true;
                if (inheritFrom.activeRole === 'soldier') baeksu.lives = 2;
              }
            }
          }
        }
      }
    }
  } else if (candidates.length > 1) {
    announcements.push({
      type: 'safe',
      icon: '⚖️',
      text: '투표가 동률입니다. 아무도 처형되지 않았습니다.'
    });
  } else {
    announcements.push({
      type: 'safe',
      icon: '⚖️',
      text: '과반수 건너뛰기로 아무도 처형되지 않았습니다.'
    });
  }

  ms.announcements = announcements;
  ms._nightResults = null;
  ms.votes = {};

  // Check win
  if (mfCheckWin()) return;

  ms.phase = 'vote-result';
  mfSetPhaseTimer(MF_VOTE_RESULT_DURATION);
  mfBroadcastState();
}

// ========================= WIN CHECK ==========================

function mfCheckWin() {
  const ms = mfState;
  const alive = ms.players.filter(p => p.alive);
  const mafiaAlive = alive.filter(p => MF_ROLES[p.activeRole]?.team === 'mafia').length;
  const citizenAlive = alive.filter(p => MF_ROLES[p.activeRole]?.team !== 'mafia').length;

  let winner = null;
  let message = '';

  if (mafiaAlive === 0) {
    winner = 'citizen';
    message = '시민 팀 승리! 모든 마피아가 제거되었습니다.';
  } else if (mafiaAlive >= citizenAlive) {
    winner = 'mafia';
    message = '마피아 팀 승리! 마피아가 도시를 장악했습니다.';
  }

  if (winner) {
    ms.phase = 'result';
    clearInterval(mfTimer);
    mfBroadcastState();

    const result = { type: 'mf-result', winner, message };
    broadcast(result);
    mfHandleResult(result);
    return true;
  }
  return false;
}

// ========================= STATE BROADCAST ====================

function mfBroadcastState() {
  if (!mfState) return;
  const ms = mfState;

  ms.players.forEach(p => {
    const view = mfBuildView(p.id);
    if (p.id === state.myId) {
      mfView = view;
      mfRenderView();
    } else {
      sendTo(p.id, { type: 'mf-state', ...view });
    }
  });
}

function mfBuildView(playerId) {
  const ms = mfState;
  const me = ms.players.find(p => p.id === playerId);
  if (!me) return {};

  const myRole = me.activeRole;
  const myTeam = MF_ROLES[myRole]?.team || 'citizen';
  const isAlive = me.alive;
  const results = ms._nightResults || {};

  // Build player list with visibility rules
  const playersView = ms.players.map(p => {
    const pv = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      alive: p.alive,
      isHost: p.isHost,
      isMe: p.id === playerId,
      role: null,           // hidden by default
      roleEmoji: null,
      roleName: null,
      showLoverHeart: false,
      showSoldierShield: false,
      showSnipeUsed: false,
      voteCount: 0,
    };

    // Self always sees own role
    if (p.id === playerId) {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Mafia can see other mafia
    if (myRole === 'mafia' && p.activeRole === 'mafia' && p.id !== playerId) {
      pv.role = 'mafia';
      pv.roleEmoji = '🔪';
      pv.roleName = '마피아';
    }

    // Spy who found mafia can see mafia
    if (myRole === 'spy' && me.spyFoundMafia && p.activeRole === 'mafia') {
      pv.role = 'mafia';
      pv.roleEmoji = '🔪';
      pv.roleName = '마피아';
    }

    // Lover sees partner
    if (myRole === 'lover' && me.loverPartnerId === p.id) {
      pv.showLoverHeart = true;
    }

    // Result phase: show all roles
    if (ms.phase === 'result') {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Dead player role reveal (public)
    if (!p.alive && ms.phase !== 'night' && ms.phase !== 'role-reveal') {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Soldier shield indicator (only for self or result)
    if (p.activeRole === 'soldier' && p.lives > 1 && (p.id === playerId || ms.phase === 'result')) {
      pv.showSoldierShield = true;
    }

    // Vote counts
    if (ms.phase === 'day-vote' || ms.phase === 'vote-result') {
      let vc = 0;
      Object.values(ms.votes).forEach(v => { if (v === p.id) vc++; });
      pv.voteCount = vc;
    }

    return pv;
  });

  // Build personal notifications
  const personalEvents = [];

  // Police result
  if (results.policeResult && playerId === (ms.players.find(p => p.activeRole === 'police' && p.alive)?.id)) {
    const r = results.policeResult;
    personalEvents.push({
      type: 'info',
      icon: '🔍',
      text: `${r.targetName}님은 ${r.isMafia ? '마피아입니다!' : '마피아가 아닙니다.'}`
    });
  }

  // Reporter result
  if (results.reporterResult && playerId === (ms.players.find(p => p.activeRole === 'reporter' && p.alive)?.id)) {
    const r = results.reporterResult;
    personalEvents.push({
      type: 'info',
      icon: '📰',
      text: `${r.targetName}님은 ${r.isSpy ? '스파이입니다!' : '스파이가 아닙니다.'}`
    });
  }

  // Spy result
  if (results.spyResult && playerId === (ms.players.find(p => p.activeRole === 'spy' && p.alive)?.id)) {
    const r = results.spyResult;
    personalEvents.push({
      type: 'info',
      icon: '🕵️',
      text: `${r.targetName}님은 ${r.isMafia ? '마피아입니다! 이제 마피아와 대화할 수 있습니다.' : '마피아가 아닙니다.'}`
    });
  }

  // Detective result
  if (results.detectiveResult && playerId === (ms.players.find(p => p.activeRole === 'detective' && p.alive)?.id)) {
    const r = results.detectiveResult;
    personalEvents.push({
      type: 'info',
      icon: '🔎',
      text: `${r.victimName}님을 죽인 마피아는 ${r.killerName}님입니다!`
    });
  }

  // Undertaker result
  if (results.undertakerResult && playerId === (ms.players.find(p => p.activeRole === 'undertaker' && p.alive)?.id)) {
    const r = results.undertakerResult;
    personalEvents.push({
      type: 'info',
      icon: '⚰️',
      text: `${r.targetName}님의 시체를 확인: ${r.team}입니다.`
    });
  }

  // Baeksu inheritance notification
  const mePlayer = ms.players.find(p => p.id === playerId);
  if (mePlayer && mePlayer.role === 'baeksu' && mePlayer.baeksuInherited) {
    const newRoleName = MF_ROLES[mePlayer.activeRole]?.name || '시민';
    personalEvents.push({
      type: 'info',
      icon: '😴',
      text: `백수 능력 발동! 이제 당신의 역할은 "${newRoleName}"입니다.`
    });
  }

  // Can this player chat with mafia team?
  const canChat = (myRole === 'mafia') ||
                  (myRole === 'spy' && me.spyFoundMafia);

  // What chat messages to show
  const chatView = canChat ? ms.chatMessages : [];

  // Spy dead role info
  const spyDeadRoles = (myRole === 'spy') ? ms.spyKnownRoles : {};

  // Determine what night action this player can take
  let nightAction = null;
  if (ms.phase === 'night' && isAlive) {
    if (myRole === 'mafia') {
      nightAction = { type: 'mafia', canSnipe: me.snipesLeft > 0, label: '제거할 대상 선택' };
    } else if (myRole === 'spy') {
      nightAction = { type: 'spy', label: '마피아로 의심되는 대상 선택' };
    } else if (myRole === 'police') {
      nightAction = { type: 'police', label: '조사할 대상 선택' };
    } else if (myRole === 'doctor') {
      nightAction = { type: 'doctor', label: '치료할 대상 선택' };
    } else if (myRole === 'reporter') {
      nightAction = { type: 'reporter', label: '스파이 의심 대상 선택' };
    } else if (myRole === 'undertaker') {
      nightAction = { type: 'undertaker', label: '확인할 시체 선택' };
    } else if (myRole === 'detective') {
      nightAction = { type: 'detective', label: '추적할 대상 선택' };
    }
  }

  // Did this player already submit night action?
  const nightActionDone = ms.nightActions[playerId] !== undefined;

  // My snipes remaining
  const mySnipesLeft = me.snipesLeft;

  // Lover partner info
  let loverPartnerName = null;
  if (myRole === 'lover' && me.loverPartnerId) {
    const partner = ms.players.find(p => p.id === me.loverPartnerId);
    if (partner) loverPartnerName = partner.name;
  }

  return {
    phase: ms.phase,
    round: ms.round,
    timer: ms.timer,
    players: playersView,
    myId: playerId,
    myRole: myRole,
    myOriginalRole: me.role,
    myTeam: myTeam,
    isAlive: isAlive,
    announcements: ms.announcements || [],
    personalEvents,
    nightAction,
    nightActionDone,
    canChat,
    chatMessages: chatView,
    spyDeadRoles,
    votes: ms.votes,
    mySnipesLeft,
    loverPartnerName,
    discussSkipVotes: ms.discussSkipVotes || {},
    discussSkipCount: Object.keys(ms.discussSkipVotes || {}).length,
    aliveCount: ms.players.filter(p => p.alive).length,
  };
}

// ========================= HOST: PROCESS ACTIONS ==============

function mfProcessAction(senderId, data) {
  if (!state.isHost || !mfState) return;
  const ms = mfState;

  if (data.action === 'night-action') {
    if (ms.phase !== 'night') return;
    const player = ms.players.find(p => p.id === senderId && p.alive);
    if (!player) return;

    // Validate targetId exists in game
    if(data.targetId && !ms.players.find(p => p.id === data.targetId)) return;
    // Validate nightAction is a known action type
    const validNightActions = ['kill', 'snipe', 'heal', 'investigate', 'track'];
    if(!validNightActions.includes(data.nightAction)) return;

    ms.nightActions[senderId] = {
      action: data.nightAction,
      targetId: data.targetId,
    };

    // Check if all required night actions are submitted
    if (mfAllNightActionsDone()) {
      clearInterval(mfTimer);
      // Small delay to let last player see confirmation
      setTimeout(() => mfAdvancePhase(), 500);
    } else {
      // Send updated state to show action was received
      mfBroadcastState();
    }
  }
  else if (data.action === 'vote') {
    if (ms.phase !== 'day-vote') return;
    const player = ms.players.find(p => p.id === senderId && p.alive);
    if (!player) return;

    // Validate vote target
    if(data.targetId !== 'skip' && !ms.players.find(p => p.id === data.targetId && p.alive)) return;
    ms.votes[senderId] = data.targetId;

    // Check if all alive players voted
    const aliveCount = ms.players.filter(p => p.alive).length;
    if (Object.keys(ms.votes).length >= aliveCount) {
      clearInterval(mfTimer);
      setTimeout(() => mfAdvancePhase(), 500);
    } else {
      mfBroadcastState();
    }
  }
  else if (data.action === 'chat') {
    // Mafia team chat
    const player = ms.players.find(p => p.id === senderId);
    if (!player) return;
    const role = player.activeRole;
    const canChat = (role === 'mafia') || (role === 'spy' && player.spyFoundMafia);
    if (!canChat) return;

    const text = (typeof data.text === 'string' ? data.text : '').slice(0, 200);
    if(!text) return;

    ms.chatMessages.push({
      sender: senderId,
      senderName: player.name,
      text,
      round: ms.round,
    });

    mfBroadcastState();
  }
  else if (data.action === 'extend') {
    if (ms.phase !== 'day-discuss') return;
    if (ms.extensionUsed[senderId]) return;
    if (ms.extensionAdded) return; // only one extension per day phase

    ms.extensionUsed[senderId] = true;
    ms.extensionAdded = true;
    ms.timer += 60; // +1 minute
    mfBroadcastState();
    // Notify
    const player = ms.players.find(p => p.id === senderId);
    // Broadcast will update timer display
  }
  else if (data.action === 'discuss-skip') {
    if (ms.phase !== 'day-discuss') return;
    const player = ms.players.find(p => p.id === senderId && p.alive);
    if (!player) return;

    // Toggle skip vote
    if (ms.discussSkipVotes[senderId]) {
      delete ms.discussSkipVotes[senderId];
    } else {
      ms.discussSkipVotes[senderId] = true;
    }

    // Check majority
    const aliveCount = ms.players.filter(p => p.alive).length;
    const skipCount = Object.keys(ms.discussSkipVotes).length;

    if (skipCount > aliveCount / 2) {
      // Majority skip - advance to vote
      clearInterval(mfTimer);
      ms.phase = 'day-vote';
      ms.votes = {};
      mfSetPhaseTimer(MF_VOTE_DURATION);
    }

    mfBroadcastState();
  }
}

function mfAllNightActionsDone() {
  const ms = mfState;

  // Check mafia
  const mafiaAlive = ms.players.filter(p => p.alive && p.activeRole === 'mafia');
  const mafiaActed = mafiaAlive.filter(p => ms.nightActions[p.id]).length;
  const mafiaOk = mafiaAlive.length === 0 || mafiaActed >= 1;

  // Check if there are any dead players (for undertaker)
  const hasDeadPlayers = ms.players.some(p => !p.alive);

  // Check other action roles
  const otherRoles = ['spy', 'police', 'doctor', 'reporter', 'undertaker', 'detective'];
  let othersOk = true;
  for (const role of otherRoles) {
    // Skip undertaker if no dead players exist (can't act)
    if (role === 'undertaker' && !hasDeadPlayers) continue;

    const p = ms.players.find(pp => pp.alive && pp.activeRole === role);
    if (p && !ms.nightActions[p.id]) {
      othersOk = false;
      break;
    }
  }

  return mafiaOk && othersOk;
}

// ========================= CLIENT: HANDLE MESSAGES ============

function mfHandleState(msg) {
  mfView = msg;
  showScreen('mafiaGame');
  mfRenderView();
}

function mfHandleResult(msg) {
  clearInterval(mfTimer);
  const myRole = mfView?.myRole;
  const myTeam = mfView?.myTeam;
  const won = (msg.winner === myTeam);
  recordGame(won);

  // Show result overlay
  const overlay = document.getElementById('mfResultOverlay');
  const title = document.getElementById('mfResultTitle');
  const subtitle = document.getElementById('mfResultSubtitle');
  const rolesDiv = document.getElementById('mfResultRoles');

  title.textContent = won ? '승리!' : '패배...';
  title.className = 'mf-result-title ' + (won ? 'win' : 'lose');
  subtitle.textContent = msg.message;

  // Show all player roles
  if (mfView && mfView.players) {
    rolesDiv.innerHTML = mfView.players.map((p, i) => {
      const roleInfo = MF_ROLES[p.role] || MF_ROLES.citizen;
      const teamCls = (roleInfo.team === 'mafia') ? 'mafia-text' : 'citizen-text';
      const deadCls = !p.alive ? 'dead-result' : '';
      return `
        <div class="mf-result-player ${deadCls}">
          <div class="mf-result-player-avatar" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>
          <div class="mf-result-player-name">${escapeHTML(p.name)}</div>
          <div class="mf-result-player-role ${teamCls}">${roleInfo.emoji} ${roleInfo.name}</div>
        </div>
      `;
    }).join('');
  }

  overlay.style.display = 'flex';
}

function mfCloseResult() {
  document.getElementById('mfResultOverlay').style.display = 'none';
  mfState = null;
  mfView = null;
  clearInterval(mfTimer);
  returnToLobby();
}

function mfLeaveGame() {
  clearInterval(mfTimer);
  mfState = null;
  mfView = null;
  leaveGame();
}

// ========================= RENDER =============================

function mfRenderView() {
  const v = mfView;
  if (!v) return;

  // --- Phase Badge ---
  const phaseInfo = MF_PHASE_LABELS[v.phase] || { icon: '❓', text: '알 수 없음', cls: 'day' };
  const phaseBadge = document.getElementById('mfPhaseBadge');
  document.getElementById('mfPhaseIcon').textContent = phaseInfo.icon;
  document.getElementById('mfPhaseText').textContent = phaseInfo.text;
  phaseBadge.className = 'mf-phase-badge ' + phaseInfo.cls;

  // Night mode on game screen
  const gameScreen = document.getElementById('mafiaGame');
  if (v.phase === 'night' || v.phase === 'role-reveal') {
    gameScreen.classList.add('night-mode');
  } else {
    gameScreen.classList.remove('night-mode');
  }

  // --- Day Counter ---
  document.getElementById('mfDayCounter').textContent = `${v.round}일차`;

  // --- Timer ---
  const timerEl = document.getElementById('mfTimer');
  timerEl.textContent = v.timer;
  const timerBox = document.getElementById('mfTimerBox');
  timerBox.classList.toggle('urgent', v.timer <= 10);

  // --- Role Banner ---
  const roleInfo = MF_ROLES[v.myRole] || MF_ROLES.citizen;
  const banner = document.getElementById('mfRoleBanner');
  banner.className = 'mf-role-banner ' + (roleInfo.team === 'mafia' ? 'team-mafia' : 'team-citizen');
  document.getElementById('mfRoleEmoji').textContent = roleInfo.emoji;
  document.getElementById('mfRoleName').textContent = roleInfo.name;
  document.getElementById('mfRoleName').className = 'mf-role-name ' + (roleInfo.team === 'mafia' ? 'mafia-color' : 'citizen-color');
  document.getElementById('mfRoleDesc').textContent = roleInfo.desc;

  // If baeksu inherited, show both
  if (v.myOriginalRole === 'baeksu' && v.myRole !== 'baeksu') {
    document.getElementById('mfRoleDesc').textContent = `백수에서 ${roleInfo.name}(으)로 전직! ${roleInfo.desc}`;
  }

  // --- Main Content ---
  const content = document.getElementById('mfContent');
  let html = '';

  // ============ ROLE REVEAL PHASE ============
  if (v.phase === 'role-reveal') {
    html += `
      <div style="text-align:center; padding:20px 0;">
        <div style="font-size:64px; margin-bottom:12px;">${roleInfo.emoji}</div>
        <div style="font-family:'Black Han Sans',sans-serif; font-size:28px; color:${roleInfo.team === 'mafia' ? '#ff4444' : '#4fc3f7'}; margin-bottom:8px;">${roleInfo.name}</div>
        <div style="font-size:14px; color:var(--text-dim); line-height:1.6;">${roleInfo.desc}</div>
      </div>
    `;

    // Mafia: show team members
    if (v.myRole === 'mafia') {
      const teammates = v.players.filter(p => p.role === 'mafia' && !p.isMe);
      if (teammates.length > 0) {
        html += `<div class="mf-section-label">동료 마피아</div>`;
        html += `<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">`;
        teammates.forEach(t => {
          html += `
            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
              <div class="mf-player-avatar" style="background:${PLAYER_COLORS[v.players.indexOf(t) % PLAYER_COLORS.length]};">${t.avatar}</div>
              <div style="font-size:12px; font-weight:700; color:#ff6b6b;">${escapeHTML(t.name)}</div>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    // Lover: show partner
    if (v.myRole === 'lover' && v.loverPartnerName) {
      html += `
        <div class="mf-lover-reveal">
          <div class="mf-lover-reveal-title">💕 당신의 연인</div>
          <div class="mf-lover-reveal-text">${escapeHTML(v.loverPartnerName)}님이 당신의 연인입니다!</div>
        </div>
      `;
    }
  }

  // ============ NIGHT PHASE ============
  else if (v.phase === 'night') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 당신은 사망했습니다. 관전 중...</div>`;
      html += mfRenderPlayerGrid(v, false);
    } else if (v.nightAction) {
      // Player has an action to take
      html += `
        <div class="mf-night-panel">
          <div class="mf-night-title">${roleInfo.emoji} ${roleInfo.name} 행동</div>
          <div class="mf-night-desc">${v.nightAction.label}</div>
        </div>
      `;

      // Undertaker: show dead players only (or waiting if no dead)
      if (v.nightAction.type === 'undertaker') {
        const hasDeadTargets = v.players.some(p => !p.alive);
        if (hasDeadTargets) {
          html += mfRenderPlayerGrid(v, true, 'dead-only');
        } else {
          html += `
            <div class="mf-night-waiting">
              <div class="mf-night-waiting-icon">⚰️</div>
              <div class="mf-night-waiting-text">확인할 시체가 없습니다</div>
              <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">다음 밤을 기다리세요</div>
            </div>
          `;
        }
      } else {
        html += mfRenderPlayerGrid(v, true);
      }
    } else {
      // Citizen / no action - waiting screen
      html += `
        <div class="mf-night-waiting">
          <div class="mf-night-waiting-icon">🌙</div>
          <div class="mf-night-waiting-text">밤이 깊었습니다...</div>
          <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">다른 플레이어들이 행동 중입니다</div>
        </div>
      `;
      html += mfRenderPlayerGrid(v, false);
    }

    // Mafia/Spy Chat
    if (v.canChat) {
      html += mfRenderChat(v);
    }

    // Spy: dead player roles
    if (v.myRole === 'spy' && Object.keys(v.spyDeadRoles).length > 0) {
      html += `
        <div class="mf-spy-info">
          <div class="mf-spy-info-title">🕵️ 사망자 직업 정보</div>
          <div class="mf-spy-dead-roles">
      `;
      Object.entries(v.spyDeadRoles).forEach(([pid, roleName]) => {
        const p = v.players.find(pp => pp.id === pid);
        if (p) {
          html += `<div class="mf-spy-dead-tag">${escapeHTML(p.name)}: ${escapeHTML(roleName)}</div>`;
        }
      });
      html += `</div></div>`;
    }
  }

  // ============ DAY ANNOUNCE PHASE ============
  else if (v.phase === 'day-announce') {
    html += `<div class="mf-events-list">`;

    // Public announcements
    v.announcements.forEach(a => {
      html += `
        <div class="mf-event-item ${a.type}">
          <span class="mf-event-icon">${a.icon}</span>
          <span>${escapeHTML(a.text)}</span>
        </div>
      `;
    });

    // Personal events
    v.personalEvents.forEach(e => {
      html += `
        <div class="mf-event-item ${e.type}">
          <span class="mf-event-icon">${e.icon}</span>
          <span>${escapeHTML(e.text)}</span>
        </div>
      `;
    });

    html += `</div>`;
    html += mfRenderPlayerGrid(v, false);
  }

  // ============ DAY DISCUSS PHASE ============
  else if (v.phase === 'day-discuss') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 당신은 사망했습니다. 관전 중...</div>`;
    }
    html += mfRenderPlayerGrid(v, false);

    // Skip vote panel
    if (v.isAlive) {
      html += mfRenderSkipVotePanel(v);
    }

    // Mafia/Spy Chat (even during day for coordination)
    if (v.canChat) {
      html += mfRenderChat(v);
    }

    // Spy: dead player roles
    if (v.myRole === 'spy' && Object.keys(v.spyDeadRoles).length > 0) {
      html += `
        <div class="mf-spy-info">
          <div class="mf-spy-info-title">🕵️ 사망자 직업 정보</div>
          <div class="mf-spy-dead-roles">
      `;
      Object.entries(v.spyDeadRoles).forEach(([pid, roleName]) => {
        const p = v.players.find(pp => pp.id === pid);
        if (p) {
          html += `<div class="mf-spy-dead-tag">${escapeHTML(p.name)}: ${escapeHTML(roleName)}</div>`;
        }
      });
      html += `</div></div>`;
    }
  }

  // ============ DAY VOTE PHASE ============
  else if (v.phase === 'day-vote') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 사망한 플레이어는 투표할 수 없습니다.</div>`;
    }
    html += mfRenderPlayerGrid(v, v.isAlive && !v.votes[v.myId]);

    // Vote status panel
    html += mfRenderVotePanel(v);
  }

  // ============ VOTE RESULT PHASE ============
  else if (v.phase === 'vote-result') {
    html += `<div class="mf-events-list">`;
    v.announcements.forEach(a => {
      html += `
        <div class="mf-event-item ${a.type}">
          <span class="mf-event-icon">${a.icon}</span>
          <span>${escapeHTML(a.text)}</span>
        </div>
      `;
    });
    html += `</div>`;
    html += mfRenderPlayerGrid(v, false);
  }

  // ============ RESULT PHASE ============
  else if (v.phase === 'result') {
    html += mfRenderPlayerGrid(v, false);
  }

  content.innerHTML = html;

  // --- Bottom Action Area ---
  mfRenderActionArea(v);

  // Attach event listeners for player cards
  mfAttachCardListeners(v);

  // Restore selection state after re-render (fixes disabled button bug)
  mfRestoreSelection(v);

  // Scroll chat to bottom
  const chatMsgs = document.querySelector('.mf-chat-messages');
  if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ========================= RENDER HELPERS =====================

function mfRenderPlayerGrid(v, selectable, mode) {
  const gridCls = v.players.length > 8 ? 'mf-player-grid three-col' : 'mf-player-grid';
  let html = `<div class="${gridCls}">`;

  v.players.forEach((p, i) => {
    // mode === 'dead-only': only show dead players as selectable
    const isSelectable = selectable && (mode === 'dead-only' ? !p.alive : (p.alive && !p.isMe));
    const isDeadCard = !p.alive;
    const classes = [
      'mf-player-card',
      isSelectable ? 'selectable' : '',
      isDeadCard ? 'dead' : '',
      p.isMe ? 'is-me' : '',
      p.voteCount > 0 ? 'voted-on' : '',
    ].filter(Boolean).join(' ');

    html += `<div class="${classes}" data-pid="${p.id}">`;

    // Host crown
    if (p.isHost) {
      html += `<span class="mf-host-crown">👑</span>`;
    }

    // Lover heart
    if (p.showLoverHeart) {
      html += `<span class="mf-lover-heart">💕</span>`;
    }

    // Vote count badge
    if (p.voteCount > 0) {
      html += `<span class="mf-vote-count-badge">${p.voteCount}</span>`;
    }

    // Dead overlay
    html += `<div class="mf-dead-overlay">💀</div>`;

    // Avatar
    html += `<div class="mf-player-avatar" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>`;

    // Name
    html += `<div class="mf-player-name">${escapeHTML(p.name)}</div>`;

    // Role tag (if visible)
    if (p.role && (isDeadCard || p.isMe || v.phase === 'result' || p.role === 'mafia')) {
      const rInfo = MF_ROLES[p.role] || MF_ROLES.citizen;
      const tagCls = rInfo.team === 'mafia' ? 'mafia-tag' : 'citizen-tag';
      html += `<div class="mf-player-role-tag ${tagCls}">${rInfo.emoji} ${rInfo.name}</div>`;
    }

    // Soldier shield
    if (p.showSoldierShield) {
      html += `<span class="mf-soldier-shield">🛡️</span>`;
    }

    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

function mfRenderChat(v) {
  let html = `
    <div class="mf-chat-panel">
      <div class="mf-chat-header">
        <span>🔪</span>
        <span>마피아 팀 채팅</span>
      </div>
      <div class="mf-chat-messages" id="mfChatMessages">
  `;

  v.chatMessages.forEach(m => {
    html += `
      <div class="mf-chat-msg">
        <span class="sender">${escapeHTML(m.senderName)}:</span>
        <span class="text"> ${escapeHTML(m.text)}</span>
      </div>
    `;
  });

  html += `
      </div>
      <div class="mf-chat-input-row">
        <input type="text" class="mf-chat-input" id="mfChatInput" placeholder="메시지 입력..." maxlength="100"
               onkeydown="if(event.key==='Enter')mfSendChat()">
        <button class="mf-chat-send-btn" onclick="mfSendChat()">전송</button>
      </div>
    </div>
  `;
  return html;
}

function mfRenderVotePanel(v) {
  // Count votes per target
  const counts = {};
  let skipCount = 0;
  Object.values(v.votes).forEach(t => {
    if (t === 'skip') { skipCount++; return; }
    counts[t] = (counts[t] || 0) + 1;
  });

  const alivePlayers = v.players.filter(p => p.alive);
  const totalVoters = alivePlayers.length;
  const votedCount = Object.keys(v.votes).length;

  let html = `
    <div class="mf-vote-panel">
      <div class="mf-vote-title">투표 현황 (${votedCount}/${totalVoters})</div>
      <div class="mf-vote-bars">
  `;

  // Sort by vote count
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  entries.forEach(([pid, count]) => {
    const p = v.players.find(pp => pp.id === pid);
    if (!p) return;
    const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
    html += `
      <div class="mf-vote-bar">
        <div class="mf-vote-bar-name">${escapeHTML(p.name)}</div>
        <div class="mf-vote-bar-track">
          <div class="mf-vote-bar-fill" style="width:${pct}%;">${count}</div>
        </div>
      </div>
    `;
  });

  html += `</div>`;

  if (skipCount > 0) {
    html += `<div class="mf-skip-count">건너뛰기: ${skipCount}표</div>`;
  }

  html += `</div>`;
  return html;
}

function mfRenderSkipVotePanel(v) {
  const skipCount = v.discussSkipCount || 0;
  const aliveCount = v.aliveCount || 1;
  const majority = Math.floor(aliveCount / 2) + 1;
  const pct = aliveCount > 0 ? Math.round((skipCount / aliveCount) * 100) : 0;
  const mySkipped = v.discussSkipVotes && v.discussSkipVotes[v.myId];

  return `
    <div class="mf-skip-vote-panel">
      <div class="mf-skip-vote-header">
        <span>⏭️ 토론 스킵 투표</span>
        <span class="mf-skip-vote-count">${skipCount} / ${majority} (과반수)</span>
      </div>
      <div class="mf-skip-vote-bar-track">
        <div class="mf-skip-vote-bar-fill" style="width:${pct}%;"></div>
      </div>
    </div>
  `;
}

// ========================= ACTION AREA ========================

function mfRenderActionArea(v) {
  const msgBox = document.getElementById('mfMessageBox');
  const btnRow = document.getElementById('mfBtnRow');
  let msg = '';
  let btns = '';

  if (v.phase === 'role-reveal') {
    msg = '🎭 역할을 확인하세요! 잠시 후 밤이 시작됩니다.';
  }
  else if (v.phase === 'night') {
    if (!v.isAlive) {
      msg = '👻 관전 모드';
    } else if (v.nightActionDone) {
      msg = '✅ 행동 완료! 다른 플레이어를 기다리는 중...';
    } else if (v.nightAction) {
      msg = v.nightAction.label;

      if (v.nightAction.type === 'mafia') {
        btns += `<button class="mf-action-btn primary" id="mfConfirmBtn" onclick="mfConfirmNightAction()" disabled>🔪 제거</button>`;
        if (v.nightAction.canSnipe) {
          btns += `<button class="mf-action-btn snipe" id="mfSnipeBtn" onclick="mfToggleSnipe()">🎯 저격 (${v.mySnipesLeft}회)</button>`;
        }
      } else {
        const actionLabel = {
          spy: '🕵️ 조사',
          police: '🔍 조사',
          doctor: '💊 치료',
          reporter: '📰 조사',
          undertaker: '⚰️ 확인',
          detective: '🔎 추적',
        };
        btns += `<button class="mf-action-btn primary" id="mfConfirmBtn" onclick="mfConfirmNightAction()" disabled>${actionLabel[v.nightAction.type] || '확인'}</button>`;
      }
    } else {
      msg = '🌙 밤입니다... 기다리세요.';
    }
  }
  else if (v.phase === 'day-announce') {
    msg = '☀️ 밤이 지나고 아침이 밝았습니다...';
  }
  else if (v.phase === 'day-discuss') {
    if (!v.isAlive) {
      msg = '👻 관전 모드';
    } else {
      msg = '☀️ 의심되는 사람에 대해 토론하세요!';
      const mySkipped = v.discussSkipVotes && v.discussSkipVotes[v.myId];
      const skipLabel = mySkipped ? '⏭️ 스킵 취소' : '⏭️ 토론 스킵';
      const skipClass = mySkipped ? 'danger' : 'secondary';
      btns += `<button class="mf-action-btn ${skipClass}" onclick="mfToggleDiscussSkip()">${skipLabel}</button>`;
      btns += `<button class="mf-action-btn extend" onclick="mfRequestExtend()">⏰ 연장</button>`;
    }
  }
  else if (v.phase === 'day-vote') {
    if (!v.isAlive) {
      msg = '👻 사망한 플레이어는 투표할 수 없습니다.';
    } else if (v.votes[v.myId]) {
      msg = '✅ 투표 완료! 결과를 기다리는 중...';
    } else {
      msg = '🗳️ 처형할 사람을 선택하고 투표하세요!';
      btns += `<button class="mf-action-btn primary" id="mfVoteBtn" onclick="mfConfirmVote()" disabled>🗳️ 투표</button>`;
      btns += `<button class="mf-action-btn secondary" onclick="mfSkipVote()">건너뛰기</button>`;
    }
  }
  else if (v.phase === 'vote-result') {
    msg = '⚖️ 투표 결과를 확인하세요.';
  }
  else if (v.phase === 'result') {
    msg = '';
  }

  msgBox.innerHTML = msg;
  btnRow.innerHTML = btns;
}

// ========================= UI INTERACTIONS ====================

function mfAttachCardListeners(v) {
  document.querySelectorAll('.mf-player-card.selectable').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.pid;
      if (!pid) return;

      // Deselect all
      document.querySelectorAll('.mf-player-card').forEach(c => {
        c.classList.remove('selected', 'selected-snipe');
      });

      mfSelectedTarget = pid;
      card.classList.add(mfUseSnipe ? 'selected-snipe' : 'selected');

      // Enable confirm button
      const confirmBtn = document.getElementById('mfConfirmBtn');
      const voteBtn = document.getElementById('mfVoteBtn');
      if (confirmBtn) confirmBtn.disabled = false;
      if (voteBtn) voteBtn.disabled = false;
    });
  });
}

function mfRestoreSelection(v) {
  // If player had selected a target before re-render, restore it
  if (!mfSelectedTarget) return;
  if (v.nightActionDone || (v.phase === 'day-vote' && v.votes[v.myId])) return;

  const card = document.querySelector(`.mf-player-card.selectable[data-pid="${mfSelectedTarget}"]`);
  if (card) {
    card.classList.add(mfUseSnipe ? 'selected-snipe' : 'selected');
    // Re-enable confirm/vote button
    const confirmBtn = document.getElementById('mfConfirmBtn');
    const voteBtn = document.getElementById('mfVoteBtn');
    if (confirmBtn) confirmBtn.disabled = false;
    if (voteBtn) voteBtn.disabled = false;
  } else {
    // Target card no longer selectable (died, etc.) — clear selection
    mfSelectedTarget = null;
  }
}

function mfToggleSnipe() {
  mfUseSnipe = !mfUseSnipe;
  const snipeBtn = document.getElementById('mfSnipeBtn');
  if (snipeBtn) {
    if (mfUseSnipe) {
      snipeBtn.style.background = 'linear-gradient(135deg, #b71c1c, #880e0e)';
      snipeBtn.textContent = '🎯 저격 모드 ON';
    } else {
      snipeBtn.style.background = '';
      snipeBtn.textContent = `🎯 저격 (${mfView?.mySnipesLeft || 0}회)`;
    }
  }

  // Update selection visual if target already selected
  const selectedCard = document.querySelector('.mf-player-card.selected, .mf-player-card.selected-snipe');
  if (selectedCard) {
    selectedCard.classList.remove('selected', 'selected-snipe');
    selectedCard.classList.add(mfUseSnipe ? 'selected-snipe' : 'selected');
  }
}

function mfConfirmNightAction() {
  if (!mfSelectedTarget) { showToast('대상을 선택하세요'); return; }

  const actionType = mfView?.nightAction?.type;
  let nightAction = 'investigate';

  if (actionType === 'mafia') {
    nightAction = mfUseSnipe ? 'snipe' : 'kill';
  } else if (actionType === 'doctor') {
    nightAction = 'heal';
  } else if (actionType === 'detective') {
    nightAction = 'track';
  }

  const data = {
    type: 'mf-action',
    action: 'night-action',
    nightAction,
    targetId: mfSelectedTarget,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }

  showToast('행동 완료!');
  mfSelectedTarget = null;
  mfUseSnipe = false;

  // Disable buttons
  const confirmBtn = document.getElementById('mfConfirmBtn');
  if (confirmBtn) confirmBtn.disabled = true;
  const snipeBtn = document.getElementById('mfSnipeBtn');
  if (snipeBtn) snipeBtn.disabled = true;
}

function mfConfirmVote() {
  if (!mfSelectedTarget) { showToast('투표 대상을 선택하세요'); return; }

  const data = {
    type: 'mf-action',
    action: 'vote',
    targetId: mfSelectedTarget,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }

  showToast('투표 완료!');
  mfSelectedTarget = null;
}

function mfSkipVote() {
  const data = {
    type: 'mf-action',
    action: 'vote',
    targetId: 'skip',
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }

  showToast('건너뛰기 투표 완료');
}

function mfSendChat() {
  const input = document.getElementById('mfChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const data = {
    type: 'mf-action',
    action: 'chat',
    text,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }

  input.value = '';
}

function mfRequestExtend() {
  const data = {
    type: 'mf-action',
    action: 'extend',
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }

  showToast('연장 요청!');
}

function mfToggleDiscussSkip() {
  const data = {
    type: 'mf-action',
    action: 'discuss-skip',
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    sendToHost(data);
  }
}

// ========================= ROLES INFO PANEL ===================

function mfToggleRolesPanel() {
  const panel = document.getElementById('mfRolesPanel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    mfRenderRolesPanel();
    panel.style.display = 'flex';
  } else {
    panel.style.display = 'none';
  }
}

function mfRenderRolesPanel() {
  const body = document.getElementById('mfRolesPanelBody');
  if (!body) return;

  const roleList = [];
  roleList.push({ emoji: '🔪', name: '마피아', count: mfConfig.mafia, team: 'mafia', desc: MF_ROLES.mafia.desc });
  if (mfConfig.spy) roleList.push({ emoji: '🕵️', name: '스파이', count: 1, team: 'mafia', desc: MF_ROLES.spy.desc });
  if (mfConfig.reporter) roleList.push({ emoji: '📰', name: '기자', count: 1, team: 'citizen', desc: MF_ROLES.reporter.desc });
  if (mfConfig.police) roleList.push({ emoji: '🔍', name: '경찰', count: 1, team: 'citizen', desc: MF_ROLES.police.desc });
  if (mfConfig.doctor) roleList.push({ emoji: '💊', name: '의사', count: 1, team: 'citizen', desc: MF_ROLES.doctor.desc });
  if (mfConfig.undertaker) roleList.push({ emoji: '⚰️', name: '장의사', count: 1, team: 'citizen', desc: MF_ROLES.undertaker.desc });
  if (mfConfig.detective) roleList.push({ emoji: '🔎', name: '탐정', count: 1, team: 'citizen', desc: MF_ROLES.detective.desc });
  if (mfConfig.lover) roleList.push({ emoji: '💕', name: '연인', count: 2, team: 'citizen', desc: MF_ROLES.lover.desc });
  if (mfConfig.senator) roleList.push({ emoji: '🏛️', name: '국회의원', count: 1, team: 'citizen', desc: MF_ROLES.senator.desc });
  if (mfConfig.soldier) roleList.push({ emoji: '🛡️', name: '군인', count: 1, team: 'citizen', desc: MF_ROLES.soldier.desc });
  if (mfConfig.baeksu) roleList.push({ emoji: '😴', name: '백수', count: 1, team: 'citizen', desc: MF_ROLES.baeksu.desc });

  const totalSpecial = roleList.reduce((s, r) => s + r.count, 0);
  const playerCount = mfState ? mfState.players.length : (mfView ? mfView.players.length : state.players.length);
  const citizenCount = Math.max(0, playerCount - totalSpecial);
  if (citizenCount > 0) {
    roleList.push({ emoji: '👤', name: '시민', count: citizenCount, team: 'citizen', desc: MF_ROLES.citizen.desc });
  }

  body.innerHTML = roleList.map(r => {
    const teamCls = r.team === 'mafia' ? 'mafia-row' : '';
    const countLabel = r.count > 1 ? ` x${r.count}` : '';
    return `
      <div class="mf-roles-panel-item ${teamCls}">
        <span class="mf-roles-panel-emoji">${r.emoji}</span>
        <div class="mf-roles-panel-info">
          <div class="mf-roles-panel-name">${r.name}${countLabel}</div>
          <div class="mf-roles-panel-desc">${r.desc}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== GAME STUBS =====
// startSutda - 아래 엔진 코드에서 정의됨
// startECard, startYahtzee, startUpDown - 아래 엔진 코드에서 정의됨


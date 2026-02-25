// ===== BUILD INFO (auto-fetch from GitHub API) =====
(function() {
  var REPO = 'criel2019/partydeck';
  var BRANCH = 'master';

  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('buildFooter');
    if (!el) return;
    el.textContent = 'build info loading...';

    fetch('https://api.github.com/repos/' + REPO + '/commits/' + BRANCH)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var hash = data.sha ? data.sha.substring(0, 7) : '?';
        var msg = data.commit && data.commit.message ? data.commit.message.split('\n')[0] : '';
        var date = data.commit && data.commit.committer && data.commit.committer.date
          ? new Date(data.commit.committer.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          : '';
        el.textContent = hash + ' · ' + date;
        el.title = msg;
      })
      .catch(function() { el.textContent = 'build info unavailable'; });
  });
})();

// ===== HTML SANITIZATION =====
function escapeHTML(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== ICE SERVER CONFIG =====
// TURN 서버 자격증명은 프로덕션에서 반드시 서버사이드 API를 통해 임시 발급하세요.
// 예: Cloudflare Workers, Vercel Edge Function 등에서 metered.ca REST API 호출
// 현재는 STUN 서버만 사용합니다 (NAT 환경에 따라 P2P 연결 성공률이 낮아질 수 있음).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
];

// ===== LOAD PEERJS DYNAMICALLY =====
function loadPeerJS() {
  return new Promise((resolve, reject) => {
    if(window.Peer) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = resolve;
    s.onerror = () => {
      // Fallback CDN
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
      s2.onload = resolve;
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
}

// ===== CONSTANTS & STATE =====
const SOLO_GAMES = ['tetris', 'jewel', 'colorchain', 'lottery', 'yahtzee', 'slinkystairs', 'pupil', 'tamagotchi', 'blackjack', 'idol'];
const SOLO_ONLY_GAMES = ['pupil', 'tamagotchi']; // 1인 전용 (다인 시 비활성화)
const AVATARS = ['😎','🤠','👻','🦊','🐱','🐼','🦁','🐸','🎃','🤖','👽','🦄'];
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const PLAYER_COLORS = [
  'linear-gradient(135deg, #ff6b35, #ff8f5a)',
  'linear-gradient(135deg, #00e5ff, #00b8d4)',
  'linear-gradient(135deg, #ff2d78, #ff6090)',
  'linear-gradient(135deg, #ffd700, #ffab00)',
  'linear-gradient(135deg, #76ff03, #64dd17)',
  'linear-gradient(135deg, #e040fb, #aa00ff)',
  'linear-gradient(135deg, #ff6e40, #ff3d00)',
  'linear-gradient(135deg, #18ffff, #00b8d4)',
  'linear-gradient(135deg, #ffab40, #ff6d00)',
  'linear-gradient(135deg, #69f0ae, #00c853)',
  'linear-gradient(135deg, #ea80fc, #d500f9)',
  'linear-gradient(135deg, #ff80ab, #f50057)',
  'linear-gradient(135deg, #b388ff, #651fff)',
  'linear-gradient(135deg, #84ffff, #00e5ff)'
];

const ENERGY_REGEN_MS = 3 * 60 * 1000; // 3분
const INITIAL_ECONOMY = { gold: 500, energy: 10, maxEnergy: 10, diamond: 0, lastEnergyTime: Date.now() };

let _economy = null;
let _energyTimerId = null;

let state = {
  myId: '', myName: '', myAvatar: '😎', avatarIdx: 0,
  isHost: false, roomCode: '',
  peer: null, connections: {}, players: [],
  selectedGame: 'poker',
  poker: null, mafia: null,
  _pokerView: null, _mafiaView: null,
};

let _cpuCount = 0;

// ===== INIT =====
async function init() {
  const bar = document.getElementById('loadingBar');
  const txt = document.getElementById('loadingText');
  
  bar.style.width = '30%';
  txt.textContent = 'PeerJS 라이브러리 로딩 중...';
  
  try {
    await loadPeerJS();
    bar.style.width = '80%';
    txt.textContent = '프로필 로딩 중...';
    loadProfile();
    loadEconomy();
    startEnergyTimer();

    // Check URL for room code
    const params = new URLSearchParams(location.search);
    const code = params.get('room');
    if(code) {
      document.getElementById('joinCodeInput').value = code;
    }
    
    bar.style.width = '100%';
    txt.textContent = '완료!';
    
    setTimeout(() => {
      showScreen('mainMenu');
    }, 400);
    
  } catch(e) {
    txt.textContent = '❌ PeerJS 로드 실패. 새로고침 해주세요.';
    console.error('Failed to load PeerJS:', e);
  }
}

// ===== UTILS =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showScreen(id) {
  // Destroy Three.js scene when leaving yahtzee
  const prev = document.querySelector('.screen.active');
  if(prev && prev.id === 'yahtzeeGame' && id !== 'yahtzeeGame') {
    if(typeof destroyYahtzeeThree === 'function') destroyYahtzeeThree();
    // Unlock orientation when leaving yahtzee
    try { screen.orientation.unlock(); } catch(e) {}
  }
  // Cleanup pupil camera/mediapipe when leaving
  if(prev && prev.id === 'pupilGame' && id !== 'pupilGame') {
    if(typeof pplCleanup === 'function') pplCleanup();
  }
  // Cleanup tamagotchi tick/save when leaving
  if(prev && prev.id === 'tamagotchiGame' && id !== 'tamagotchiGame') {
    if(typeof tamaCleanup === 'function') tamaCleanup();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Init Three.js scene when entering yahtzee
  if(id === 'yahtzeeGame') {
    // Force landscape orientation
    try { screen.orientation.lock('landscape').catch(()=>{}); } catch(e) {}
    if(typeof initYahtzeeThree === 'function') {
      const canvas = document.getElementById('yahtzeeCanvas');
      if(canvas) setTimeout(() => initYahtzeeThree(canvas), 300);
    }
  }
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for(let i = 0; i < 5; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

// ===== PROFILE =====
function loadProfile() {
  const s = localStorage.getItem('pd_profile');
  if(s) {
    try {
      const p = JSON.parse(s);
      state.myName = p.name || '';
      state.myAvatar = p.avatar || '😎';
      state.avatarIdx = Math.max(0, AVATARS.indexOf(state.myAvatar));
    } catch(e) { /* corrupt profile, use defaults */ }
  }
  document.getElementById('nameInput').value = state.myName;
  document.getElementById('myAvatar').textContent = state.myAvatar;
  updateStats();
}

function saveProfile() {
  state.myName = document.getElementById('nameInput').value.trim() || '플레이어';
  state.myAvatar = AVATARS[state.avatarIdx];
  localStorage.setItem('pd_profile', JSON.stringify({ name: state.myName, avatar: state.myAvatar }));
}

function updateStats() {
  let s;
  try { s = JSON.parse(localStorage.getItem('pd_stats') || '{"w":0,"g":0}'); } catch(e) { s = {w:0,g:0}; }
  const r = s.g > 0 ? Math.round((s.w / s.g) * 100) : 0;
  document.getElementById('profileStats').textContent = `${s.g}전 ${s.w}승 (${r}%)`;
}

// ===== ECONOMY =====
function loadEconomy() {
  const raw = localStorage.getItem('pd_economy');
  if (raw) {
    try { _economy = JSON.parse(raw); } catch(e) { _economy = { ...INITIAL_ECONOMY }; }
  } else {
    _economy = { ...INITIAL_ECONOMY };
  }
  // Passive energy regen based on elapsed time
  const now = Date.now();
  const elapsed = now - (_economy.lastEnergyTime || now);
  if (elapsed > 0 && _economy.energy < _economy.maxEnergy) {
    const regenCount = Math.floor(elapsed / ENERGY_REGEN_MS);
    if (regenCount > 0) {
      _economy.energy = Math.min(_economy.maxEnergy, _economy.energy + regenCount);
      _economy.lastEnergyTime = _economy.lastEnergyTime + regenCount * ENERGY_REGEN_MS;
    }
  }
  if (_economy.energy >= _economy.maxEnergy) {
    _economy.lastEnergyTime = now;
  }
  saveEconomy(_economy);
}

function saveEconomy(eco) {
  _economy = eco;
  localStorage.setItem('pd_economy', JSON.stringify(eco));
  updateEconomyUI(eco);
}

function getEconomy() {
  if (!_economy) loadEconomy();
  return { ..._economy };
}

function addGold(amount) {
  if (!_economy) loadEconomy();
  _economy.gold += amount;
  if (_economy.gold < 0) _economy.gold = 0;
  saveEconomy(_economy);
  if (amount > 0) showToast('🪙 +' + amount + ' 골드');
  else if (amount < 0) showToast('🪙 ' + amount + ' 골드');
}

function spendEnergy(amount) {
  if (typeof practiceMode !== 'undefined' && practiceMode) return true;
  if (!_economy) loadEconomy();
  if (_economy.energy < amount) return false;
  const wasFull = _economy.energy >= _economy.maxEnergy;
  _economy.energy -= amount;
  if (wasFull) _economy.lastEnergyTime = Date.now();
  saveEconomy(_economy);
  return true;
}

function addDiamond(amount) {
  if (!_economy) loadEconomy();
  _economy.diamond += amount;
  if (_economy.diamond < 0) _economy.diamond = 0;
  saveEconomy(_economy);
}

function startEnergyTimer() {
  if (_energyTimerId) clearInterval(_energyTimerId);
  _energyTimerId = setInterval(() => {
    if (!_economy) return;
    const now = Date.now();
    if (_economy.energy < _economy.maxEnergy) {
      const elapsed = now - _economy.lastEnergyTime;
      const regenCount = Math.floor(elapsed / ENERGY_REGEN_MS);
      if (regenCount > 0) {
        _economy.energy = Math.min(_economy.maxEnergy, _economy.energy + regenCount);
        _economy.lastEnergyTime = _economy.lastEnergyTime + regenCount * ENERGY_REGEN_MS;
        if (_economy.energy >= _economy.maxEnergy) _economy.lastEnergyTime = now;
        saveEconomy(_economy);
      }
    }
    updateEnergyCountdown(_economy);
  }, 1000);
  updateEconomyUI(_economy);
  updateEnergyCountdown(_economy);
}

function updateEconomyUI(eco) {
  if (!eco) return;
  const ids = [
    ['mmGold', eco.gold],
    ['lobbyGold', eco.gold],
    ['mmDiamond', eco.diamond],
  ];
  ids.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
  const energyText = eco.energy + '/' + eco.maxEnergy;
  const eIds = ['mmEnergy', 'lobbyEnergy'];
  eIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = energyText;
  });
}

function updateEnergyCountdown(eco) {
  const el = document.getElementById('energyCountdown');
  if (!el) return;
  if (eco.energy >= eco.maxEnergy) {
    el.textContent = 'MAX';
    return;
  }
  const remaining = ENERGY_REGEN_MS - (Date.now() - eco.lastEnergyTime);
  if (remaining <= 0) {
    el.textContent = '곧 충전';
    return;
  }
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  el.textContent = mins + ':' + String(secs).padStart(2, '0');
}

function recordGame(won, goldReward) {
  if(typeof practiceMode !== 'undefined' && practiceMode) return;
  let s;
  try { s = JSON.parse(localStorage.getItem('pd_stats') || '{"w":0,"g":0}'); } catch(e) { s = {w:0,g:0}; }
  s.g++;
  if(won) s.w++;
  localStorage.setItem('pd_stats', JSON.stringify(s));
  updateStats();
  if(typeof goldReward === 'number' && goldReward !== 0) addGold(goldReward);
}

function cycleAvatar() {
  state.avatarIdx = (state.avatarIdx + 1) % AVATARS.length;
  state.myAvatar = AVATARS[state.avatarIdx];
  document.getElementById('myAvatar').textContent = state.myAvatar;
  saveProfile();
}

// ===== PEER CONNECTION =====
function initPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, {
      config: { iceServers: ICE_SERVERS }
    });
    
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 15000);
    
    peer.on('open', (myId) => {
      clearTimeout(timeout);
      state.myId = myId;
      state.peer = peer;
      console.log('Peer connected:', myId);
      resolve(peer);
    });
    
    peer.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Peer error:', err);
      if(err.type === 'unavailable-id') showToast('이미 사용 중인 코드입니다');
      else if(err.type === 'peer-unavailable') showToast('방을 찾을 수 없습니다');
      else showToast('연결 오류: ' + err.type);
      reject(err);
    });
    
    peer.on('disconnected', () => {
      console.log('Peer disconnected, reconnecting...');
      if(!peer.destroyed) peer.reconnect();
    });
  });
}

function broadcast(data, exclude) {
  const msg = JSON.stringify(data);
  const targets = Object.entries(state.connections).filter(([pid]) => pid !== exclude);
  console.log('[PartyDeck] broadcast:', data.type, '→', targets.length, '명에게 전송');
  targets.forEach(([pid, conn]) => {
    if(conn.open) { conn.send(msg); console.log('[PartyDeck]   → 전송:', pid); }
    else console.warn('[PartyDeck]   → 연결 닫힘:', pid);
  });
  // Trigger AI for CPU players in the room (lobby CPU mode)
  if(data && data.type && typeof handleBroadcastForAI === 'function' && state.players.some(p => p.id.startsWith('ai-'))) {
    handleBroadcastForAI(data);
  }
}

function sendTo(peerId, data) {
  // Route AI peer messages to local AI handler
  if(peerId && peerId.toString().startsWith('ai-') && typeof handleAIMessage === 'function') {
    handleAIMessage(peerId, data);
    return;
  }
  const conn = state.connections[peerId];
  if(conn?.open) conn.send(JSON.stringify(data));
}

function sendToHost(data) {
  const host = Object.values(state.connections)[0];
  if(host?.open) host.send(JSON.stringify(data));
}

function handleMessage(peerId, raw) {
  let msg;
  try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { console.warn('[PartyDeck] 잘못된 메시지:', e); return; }
  console.log('[PartyDeck] 메시지 수신:', msg.type, 'from:', peerId);

  const handlers = {
    'player-info': () => handlePlayerJoin(peerId, msg),
    'player-list': () => { state.players = msg.players; updateLobbyUI(); },
    'game-start': () => handleGameStart(msg),
    'game-restart': () => handleGameStart(msg),
    'poker-state': () => { showScreen('pokerGame'); renderPokerView(msg); },
    'poker-action': () => { if(state.isHost) processPokerAction(peerId, msg.action, msg.amount); },
    'poker-result': () => handlePokerResult(msg),
    'mf-state': () => { mfHandleState(msg); },
    'mf-timer': () => { mfHandleTimer(msg); },
    'mf-action': () => { if(state.isHost) mfProcessAction(peerId, msg); },
    'mf-result': () => { mfHandleResult(msg); },
    'mf-config': () => { mfHandleConfig(msg); },
    'game-selected': () => {
      state.selectedGame = msg.game;
      // Show mafia lobby area for non-host when mafia is selected
      const mfLobbyArea = document.getElementById('mfLobbyArea');
      if (mfLobbyArea) {
        mfLobbyArea.style.display = msg.game === 'mafia' ? 'block' : 'none';
      }
      // Show bombshot lobby area for non-host
      const bsLobbyArea = document.getElementById('bsLobbyArea');
      if (bsLobbyArea) {
        bsLobbyArea.style.display = msg.game === 'bombshot' ? 'block' : 'none';
      }
      // Update waiting text
      const waitingText = document.getElementById('waitingText');
      if (waitingText) {
        const gameNames = { poker:'포커', mafia:'마피아', sutda:'섯다', quickdraw:'총잡이', roulette:'룰렛', lottery:'뽑기', ecard:'E카드', yahtzee:'야추', updown:'업다운', truth:'진실게임', fortress:'요새', bombshot:'폭탄주', blackjack:'블랙잭', stairs:'무한계단', tetris:'테트리스', jewel:'보석맞추기', colorchain:'컬러체인' };
        waitingText.textContent = `${gameNames[msg.game] || msg.game} 게임 대기 중...`;
      }
    },
    'bs-config': () => {
      if (typeof bsHandleConfig === 'function') bsHandleConfig(msg);
    },
    'truth-state': () => {
      showScreen('truthGame');
      renderTruthView(msg);
    },
    'truth-question': () => {
      if (state.isHost) processTruthQuestion(peerId, msg.question);
    },
    'truth-vote': () => {
      if (state.isHost) processTruthVote(peerId, msg.vote);
    },
    'truth-next': () => {
      if (state.isHost) processTruthNext();
    },
    'qd-state': () => {
      if(msg.phase === 'fire' && navigator.vibrate) navigator.vibrate(200);
      qdState.phase = msg.phase;
      qdState.startTime = msg.startTime;
      qdState.results = msg.results;
      qdState.roundNum = msg.roundNum;
      renderQuickDrawView(qdState);
    },
    'qd-action': () => {
      if(state.isHost) processQDAction(msg);
    },
    'qd-result': () => handleQDResult(msg),
    'roulette-state': () => { showScreen('rouletteGame'); renderRouletteView(msg); },
    'rr-action': () => { if(state.isHost) processRRAction(peerId, msg.action); },
    'rr-result': () => handleRRResult(msg),
    'lottery-state': () => handleLotteryMessage(peerId, msg),
    'lottery-pick-request': () => handleLotteryMessage(peerId, msg),
    'lottery-pick': () => handleLotteryMessage(peerId, msg),
    'roulette-spin-request': () => handleLotteryMessage(peerId, msg),
    'roulette-spin': () => handleLotteryMessage(peerId, msg),
    // UpDown handlers
    'ud-state': () => { showScreen('updownGame'); renderUpDownView(msg.state); },
    'ud-choice': () => { if(state.isHost) processUpDownChoice(peerId, msg.choice); },
    'ud-addbet': () => {
      if(state.isHost) {
        const text = (typeof msg.text === 'string' ? msg.text : '').trim().slice(0, 100);
        if(!text) return;
        udState.penalties.push(text); udState.currentBet = text; broadcastUpDownState();
      }
    },
    'ud-special': () => {
      if(state.isHost) {
        if(msg.action === 'blackknight') processBlackKnight(peerId, msg.targetId);
        else if(msg.action === 'king') processKingPenalty(peerId, msg.targets);
      }
    },
    'ud-bk-request': () => showUpDownBKModal(msg),
    'ud-bk-response': () => {
      if(state.isHost) {
        const penaltyText = udState.specialData?.penaltyText || '벌칙';
        if(msg.accepted) resolveBKAccept(msg.requesterId, peerId, penaltyText);
        else resolveBKReject(msg.requesterId, peerId, penaltyText);
      }
    },
    'ud-penalty': () => handleUpDownPenalty(msg),
    'ud-penalty-done': () => { if(state.isHost) continueUpDown(); },
    // Yahtzee handlers
    'yah-state': () => { showScreen('yahtzeeGame'); renderYahtzeeView(msg.state); },
    'yah-action': () => handleYahAction(peerId, msg),
    // E-Card handlers
    'ec-state': () => { showScreen('ecardGame'); renderECardView(msg); },
    'ec-bet': () => { if(state.isHost) processECardBet(peerId, msg.bet); },
    'ec-bet-response': () => { if(state.isHost) processECardBetResponse(peerId, msg.accept); },
    'ec-play': () => { if(state.isHost) processECardPlay(peerId, msg.cardType, msg.cardIdx); },
    'ec-result': () => handleECardResult(msg),
    // Sutda handlers
    'sutda-state': () => { showScreen('sutdaGame'); renderSutdaView(msg); },
    'sutda-bet': () => { if(state.isHost) processSutdaAction(peerId, msg.action, msg.amount); },
    'sutda-seryuk': () => { if(state.isHost) processSutdaSeryuk(peerId, msg.choice); },
    'sutda-result': () => handleSutdaResult(msg),
    // Fortress handlers
    'fort-state': () => { showScreen('fortressGame'); initFortCanvas(); renderFortressView(msg.state); if(typeof setupFortressKeyboard==='function' && !_fortKeyDown) setupFortressKeyboard(); },
    'fort-fire': () => { if(state.isHost) handleFortFire(peerId, msg); },
    'fort-move': () => { if(state.isHost) handleFortMove(peerId, msg); },
    'fort-anim': () => { startFortAnimation(msg); },
    'fort-result': () => { showFortressGameOver(msg); },
    // BombShot handlers
    'bs-state': () => { showScreen('bombshotGame'); initBSCanvas(); renderBSView(msg); },
    'bs-submit': () => { if(state.isHost) processBSSubmit(peerId, msg.cardIndices); },
    'bs-liar': () => { if(state.isHost) processBSLiar(peerId); },
    'bs-spin': () => { if(state.isHost) processBSSpin(peerId); },
    'bs-anim': () => { handleBSAnim(msg); },
    'bs-result': () => { handleBSResult(msg); },
    // Blackjack handlers
    'bj-state': () => { showScreen('blackjackGame'); renderBJView(msg); },
    'bj-action': () => { if(state.isHost) processBJAction(peerId, msg.action); },
    'bj-bet': () => { if(state.isHost) processBJBet(peerId, msg.amount); },
    'bj-result': () => handleBJResult(msg),
    // Stairs handlers
    'stairs-dead': () => { if(state.isHost) processStairsDead(msg); },
    'stairs-update': () => {
      if(stMulti) { stMulti.players = msg.players; stUpdatePlayersBar(); }
    },
    'stairs-rankings': () => { stRenderRankings(msg.rankings); },
    // Tetris handlers
    'tetris-dead': () => { if(state.isHost && typeof processTetrisDead === 'function') processTetrisDead({ ...msg, id: peerId }); },
    'tetris-rankings': () => { if(typeof tetShowRankings === 'function') tetShowRankings(msg.rankings); },
    // Jewel Match handlers
    'jewel-dead': () => { if(state.isHost && typeof processJewelDead === 'function') processJewelDead({ ...msg, id: peerId }); },
    'jewel-rankings': () => { if(typeof jwlShowRankings === 'function') jwlShowRankings(msg.rankings); },
    // ColorChain handlers
    'cc-dead': () => { if(state.isHost && typeof processColorChainDead === 'function') processColorChainDead({ ...msg, id: peerId }); },
    'cc-rankings': () => { if(typeof ccShowRankings === 'function') ccShowRankings(msg.rankings); },
    // Idol Management handlers
    'idol-state': () => { if(typeof renderIdolView === 'function') { showScreen('idolGame'); renderIdolView(msg.state); } },
    'idol-player-select': () => { if(state.isHost && typeof handleIdolMsg === 'function') handleIdolMsg({ ...msg, from: peerId }); },
    'player-left': () => {
      state.players = state.players.filter(p => p.id !== msg.playerId);
      updateLobbyUI();
      showToast(msg.name + ' 퇴장');
    },
    'room-full': () => showToast('방이 가득 찼습니다'),
  };
  
  if(handlers[msg.type]) handlers[msg.type]();
}

// ===== ROOM =====
async function createRoom() {
  saveProfile();
  state.roomCode = genCode();
  state.isHost = true;
  
  try {
    showToast('방 생성 중...');
    await initPeer('pd-' + state.roomCode);
    
    state.players = [{
      id: state.myId, name: state.myName, avatar: state.myAvatar, isHost: true
    }];
    
    state.peer.on('connection', (conn) => {
      console.log('[PartyDeck] 새 연결 수신:', conn.peer);
      conn.on('open', () => {
        console.log('[PartyDeck] 연결 열림:', conn.peer);
        state.connections[conn.peer] = conn;
        conn.on('data', (d) => handleMessage(conn.peer, d));
        conn.on('close', () => {
          const p = state.players.find(pp => pp.id === conn.peer);
          delete state.connections[conn.peer];
          state.players = state.players.filter(pp => pp.id !== conn.peer);
          broadcast({ type: 'player-list', players: state.players });
          updateLobbyUI();
          if(p) showToast(p.name + ' 퇴장');
        });
      });
    });

    document.getElementById('roomCodeDisplay').textContent = state.roomCode;
    document.getElementById('gameSelectArea').style.display = 'block';
    document.getElementById('startGameBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    showScreen('lobby');
    updateLobbyUI();
    updateConnectionStatus('connected', '호스트 (방 코드: ' + state.roomCode + ')');
    showToast('방이 만들어졌습니다! 코드: ' + state.roomCode);

    setTimeout(() => {
      const qrDiv = document.getElementById('qrCodeDisplay');
      if(qrDiv && window.QRCode) {
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, {
          text: location.origin + location.pathname + '?room=' + state.roomCode,
          width: 180, height: 180,
          colorDark: '#e8e8f0', colorLight: '#14142a'
        });
      }
    }, 200);

  } catch(e) { console.error(e); }
}

async function joinRoom() {
  saveProfile();
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if(!code || code.length < 4) { showToast('방 코드를 입력하세요'); return; }

  state.roomCode = code;
  state.isHost = false;

  try {
    showToast('방 연결 중...');
    await initPeer('pd-' + code + '-' + Date.now().toString(36));

    // 로비 화면 먼저 표시 (연결 상태 표시용)
    document.getElementById('roomCodeDisplay').textContent = code;
    document.getElementById('gameSelectArea').style.display = 'none';
    document.getElementById('startGameBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'block';
    document.getElementById('waitingText').textContent = '호스트에 연결 중...';
    showScreen('lobby');
    updateConnectionStatus('connecting', '호스트에 연결 시도 중...');

    const conn = state.peer.connect('pd-' + code, { reliable: true });

    // 연결 타임아웃 (15초)
    const connTimeout = setTimeout(() => {
      if(!conn.open) {
        updateConnectionStatus('error', '연결 시간 초과. 방 코드를 확인하세요.');
        document.getElementById('waitingText').textContent = '연결 실패 - 뒤로가기 후 다시 시도하세요';
        showToast('호스트 연결 시간 초과');
      }
    }, 15000);

    conn.on('open', () => {
      clearTimeout(connTimeout);
      console.log('[PartyDeck] 호스트 연결 성공:', conn.peer);
      state.connections[conn.peer] = conn;
      conn.send(JSON.stringify({
        type: 'player-info', name: state.myName, avatar: state.myAvatar, id: state.myId
      }));
      conn.on('data', (d) => handleMessage(conn.peer, d));
      conn.on('close', () => {
        showToast('호스트와 연결이 끊어졌습니다');
        leaveLobby();
      });
      updateConnectionStatus('connected', '호스트에 연결됨');
      document.getElementById('waitingText').textContent = '호스트가 게임을 시작하길 대기 중...';
      showToast('방에 참가했습니다!');
    });

    conn.on('error', (err) => {
      clearTimeout(connTimeout);
      console.error('[PartyDeck] 연결 에러:', err);
      updateConnectionStatus('error', '연결 실패: ' + (err.type || err));
      document.getElementById('waitingText').textContent = '연결 실패 - 뒤로가기 후 다시 시도하세요';
      showToast('연결 실패: ' + (err.type || err));
    });

    state.peer.on('connection', (inConn) => {
      inConn.on('open', () => {
        state.connections[inConn.peer] = inConn;
        inConn.on('data', (d) => handleMessage(inConn.peer, d));
      });
    });

  } catch(e) {
    console.error('[PartyDeck] joinRoom 에러:', e);
    showToast('연결 오류: ' + e.message);
  }
}

function updateConnectionStatus(status, text) {
  const el = document.getElementById('connectionStatus');
  if(!el) return;
  el.style.display = 'block';
  el.textContent = text;
  if(status === 'connecting') {
    el.style.background = 'rgba(255,180,0,0.15)';
    el.style.color = '#ffb400';
  } else if(status === 'connected') {
    el.style.background = 'rgba(0,230,118,0.15)';
    el.style.color = '#00e676';
  } else if(status === 'error') {
    el.style.background = 'rgba(255,50,50,0.15)';
    el.style.color = '#ff5252';
  }
}

function handlePlayerJoin(peerId, msg) {
  if(!state.isHost) return;
  if(state.players.length >= 14) {
    sendTo(peerId, { type: 'room-full' });
    return;
  }
  const name = (typeof msg.name === 'string' ? msg.name : '').trim().slice(0, 20) || '플레이어';
  const avatar = AVATARS.includes(msg.avatar) ? msg.avatar : '😎';
  state.players.push({ id: peerId, name, avatar, isHost: false });
  broadcast({ type: 'player-list', players: state.players });
  updateLobbyUI();
  showToast(name + ' 참가!');
}

function leaveLobby() {
  if(state.peer) { state.peer.destroy(); state.peer = null; }
  state.connections = {};
  state.players = [];
  state.poker = null;
  state.mafia = null;
  _cpuCount = 0;
  if(typeof cleanupAI === 'function') cleanupAI();
  showScreen('mainMenu');
}

function returnToLobby() {
  // Clean up all game timers
  if (typeof mfTimer !== 'undefined') clearInterval(mfTimer);
  if (typeof mfClientTimer !== 'undefined') { clearInterval(mfClientTimer); mfClientTimer = null; }
  if (typeof qdState !== 'undefined' && qdState) {
    if (qdState.countdownTimeout) { clearTimeout(qdState.countdownTimeout); qdState.countdownTimeout = null; }
    if (qdState.fireTimeout) { clearTimeout(qdState.fireTimeout); qdState.fireTimeout = null; }
  }
  // Clean up all game state without destroying peer connection
  if (typeof mfState !== 'undefined') { mfState = null; mfView = null; }
  state.poker = null;
  state.mafia = null;
  if (typeof sutdaHost !== 'undefined') sutdaHost = null;
  if (typeof sutdaView !== 'undefined') sutdaView = null;
  if (typeof rrState !== 'undefined' && rrState) rrState.phase = 'waiting';
  if (typeof truthState !== 'undefined') truthState = null;
  if (typeof yahState !== 'undefined' && yahState) yahState.phase = 'waiting';
  if (typeof fortState !== 'undefined' && fortState) {
    if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
    fortState = null;
  }
  if (typeof stLocal !== 'undefined' && stLocal) {
    if (typeof stCleanup === 'function') stCleanup();
  }
  if (typeof tetGame !== 'undefined' && tetGame) {
    if (typeof tetCleanup === 'function') tetCleanup();
  }
  if (typeof ccCleanup === 'function') ccCleanup();
  if (typeof slkCleanup === 'function') slkCleanup();
  if (typeof closeBJCleanup === 'function') closeBJCleanup();
  // Clean up AI timers (lobby CPU mode)
  if(typeof cleanupAI === 'function') cleanupAI();
  showScreen('lobby');
  updateLobbyUI();
}

function leaveGame() {
  if(typeof practiceMode !== 'undefined' && practiceMode) { leavePracticeMode(); return; }
  returnToLobby();
}

// ===== RESTART CURRENT GAME =====
function restartCurrentGame() {
  if(!state.isHost) { showToast('호스트만 재시작할 수 있습니다'); return; }
  const g = state.selectedGame;
  if(!g) { returnToLobby(); return; }
  // Broadcast restart to all clients
  broadcast({ type: 'game-restart', game: g });
  // Re-invoke the start function directly (no energy cost for restart)
  if(g === 'yahtzee') { document.getElementById('yahtzeeGameOver').style.display='none'; startYahtzee(); }
  else if(g === 'fortress') { closeFortressCleanup(); startFortress(); }
  else if(g === 'bombshot') { closeBombShotCleanup(); startBombShot(); }
  else if(g === 'blackjack') { if(typeof closeBJCleanup==='function') closeBJCleanup(); startBlackjack(); }
  else if(g === 'stairs') { if(typeof stCleanup==='function') stCleanup(); document.getElementById('stResultsOverlay').style.display='none'; startStairs(); }
  else if(g === 'ecard') startECard();
  else if(g === 'truth') startTruthGame();
  else if(g === 'lottery') startLottery();
  else if(g === 'updown') startUpDown();
  else if(g === 'slinkystairs') { if(typeof slkCleanup==='function') slkCleanup(); startSlinkyStairs(); }
  else if(g === 'pupil') { pplCleanup(); startPupil(); }
  else { showToast('이 게임은 자동 재시작됩니다'); }
}

// ===== HAND RANKING OVERLAY =====
const HAND_RANKINGS = {
  poker: {
    title: '🃏 포커 족보',
    content: `<div style="display:flex;flex-direction:column;gap:6px;">
<div><b style="color:#ffd700;">1. 로얄 플러시</b> — A K Q J 10 같은 무늬</div>
<div><b style="color:#e0e0e0;">2. 스트레이트 플러시</b> — 연속 5장 같은 무늬</div>
<div><b style="color:#e0e0e0;">3. 포카드</b> — 같은 숫자 4장</div>
<div><b style="color:#e0e0e0;">4. 풀하우스</b> — 트리플 + 원페어</div>
<div><b style="color:#e0e0e0;">5. 플러시</b> — 같은 무늬 5장</div>
<div><b style="color:#e0e0e0;">6. 스트레이트</b> — 연속 5장</div>
<div><b style="color:#e0e0e0;">7. 트리플</b> — 같은 숫자 3장</div>
<div><b style="color:#e0e0e0;">8. 투페어</b> — 페어 2개</div>
<div><b style="color:#e0e0e0;">9. 원페어</b> — 같은 숫자 2장</div>
<div><b style="color:#888;">10. 하이카드</b> — 위에 해당 없음</div>
</div>`
  },
  sutda: {
    title: '🎴 섯다 족보',
    content: `<div style="display:flex;flex-direction:column;gap:4px;">
<div style="color:#ffd700;font-weight:700;margin-bottom:4px;">[ 땡 ]</div>
<div><b>장땡</b> 10+10 (최강)</div>
<div><b>38광땡</b> 3광+8광</div>
<div><b>18광땡</b> 1광+8광</div>
<div><b>13광땡</b> 1광+3광</div>
<div><b>9땡~1땡</b> 같은 숫자 페어</div>
<div style="color:#ff6b35;font-weight:700;margin:8px 0 4px;">[ 특수패 ]</div>
<div><b>세륙 (4+6)</b> — 콜 받으면 밀기(10끗) or 깽판(패 재분배, 9땡이하만)</div>
<div><b>암행어사 (4+7)</b> — 13광땡·18광땡만 잡음</div>
<div><b>땡잡이 (3+7)</b> — 땡만 잡음, 일반패에겐 짐</div>
<div style="color:#4fc3f7;font-weight:700;margin:8px 0 4px;">[ 끗 ]</div>
<div><b>갑오 (9끗)</b> — 두 패 합 끝자리 9</div>
<div><b>8끗~1끗</b></div>
<div><b>망통 (0끗)</b> — 최하</div>
<div style="font-size:11px;color:#aaa;margin-top:6px;">※ 같은 끗: 두 수의 곱이 큰 쪽 승리 (비김 없음)</div>
<div style="font-size:11px;color:#aaa;">※ 콜 받는 사람이 패를 먼저 공개</div>
</div>`
  },
  ecard: {
    title: '👑 E카드 규칙',
    content: `<div style="display:flex;flex-direction:column;gap:6px;">
<div style="color:#ffd700;font-weight:700;">승패 관계</div>
<div>👑 <b>황제</b> &gt; 🧑 <b>시민</b> &gt; ⛓️ <b>노예</b></div>
<div>⛓️ <b>노예</b> &gt; 👑 <b>황제</b> (역전!)</div>
<div>❓ <b>더미</b> — 항상 무승부</div>
<div style="margin-top:8px;color:#aaa;">
<div>황제 팀: 황제1 + 시민4</div>
<div>노예 팀: 노예1 + 시민4</div>
<div>5라운드 동안 진행, 많이 이긴 쪽 승리</div>
</div>
</div>`
  }
};

function toggleHandRanking(game) {
  const overlay = document.getElementById('handRankingOverlay');
  const data = HAND_RANKINGS[game];
  if(!data || !overlay) return;
  document.getElementById('handRankingTitle').textContent = data.title;
  document.getElementById('handRankingContent').innerHTML = data.content;
  overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
}

function copyRoomCode() {
  const url = location.origin + location.pathname + '?room=' + state.roomCode;
  navigator.clipboard?.writeText(state.roomCode).then(() => showToast('코드 복사됨: ' + state.roomCode));
}

function shareLink() {
  const url = location.origin + location.pathname + '?room=' + state.roomCode;
  if(navigator.share) {
    navigator.share({ title: '파티덱', text: '파티덱 게임에 참가하세요! 코드: ' + state.roomCode, url: url });
  } else {
    navigator.clipboard?.writeText(url).then(() => showToast('링크가 복사되었습니다'));
  }
}

function shareApp() {
  const url = location.origin + location.pathname;
  if(navigator.share) {
    navigator.share({ title: '파티덱', text: '파티덱 - 서버 없이 즐기는 미니게임!', url: url });
  } else {
    navigator.clipboard?.writeText(url).then(() => showToast('링크가 복사되었습니다'));
  }
}

function updateLobbyUI() {
  const list = document.getElementById('playerList');
  list.innerHTML = state.players.map((p, i) => `
    <div class="player-item">
      <div class="player-avatar-sm" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>
      <div class="player-name">${escapeHTML(p.name)}</div>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      ${p.id === state.myId ? '<span style="font-size:11px;color:var(--accent2);">나</span>' : ''}
      ${p.id.startsWith('ai-') ? '<span style="font-size:11px;color:var(--text-dim);background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;">CPU</span>' : ''}
    </div>
  `).join('');
  document.getElementById('playerCount').textContent = state.players.length;

  // CPU selector (host only)
  const cpuSelector = document.getElementById('cpuSelectorArea');
  if(cpuSelector) {
    cpuSelector.style.display = state.isHost ? 'block' : 'none';
    const cpuCountEl = document.getElementById('cpuCount');
    if(cpuCountEl) cpuCountEl.textContent = _cpuCount;
  }

  // Solo-only games: disable when >1 player
  document.querySelectorAll('.game-option').forEach(el => {
    if (SOLO_ONLY_GAMES.includes(el.dataset.game)) {
      if (state.players.length > 1) {
        el.classList.add('solo-only-disabled');
        if (el.classList.contains('selected')) {
          el.classList.remove('selected');
          // Auto-select first non-disabled game
          const first = document.querySelector('.game-option:not(.solo-only-disabled)');
          if (first) { first.classList.add('selected'); state.selectedGame = first.dataset.game; }
        }
      } else {
        el.classList.remove('solo-only-disabled');
      }
    }
  });

  if(state.isHost) {
    const _minP = SOLO_GAMES.includes(state.selectedGame) ? 1 : 2;
    document.getElementById('startGameBtn').style.display = state.players.length >= _minP ? 'block' : 'none';
  }
  // Show game info panel for currently selected game
  if(typeof updateGameInfoPanel === 'function') updateGameInfoPanel(state.selectedGame);
}

function addCPU() {
  if(!state.isHost) return;
  if(state.players.length >= 14) { showToast('최대 14명까지 가능합니다'); return; }

  const names = (typeof AI_NAMES !== 'undefined') ? AI_NAMES : ['봇짱', '로봇킹', '알파봇', 'AI마스터', '사이보그'];
  const avatars = (typeof AI_AVATARS !== 'undefined') ? AI_AVATARS : ['🤖', '👾', '🎮', '🕹️', '💻'];

  const idx = _cpuCount;
  state.players.push({
    id: 'ai-' + idx,
    name: names[idx % names.length],
    avatar: avatars[idx % avatars.length],
    isHost: false,
  });
  _cpuCount++;

  updateLobbyUI();
  broadcast({ type: 'player-list', players: state.players });
}

function removeCPU() {
  if(!state.isHost || _cpuCount <= 0) return;

  // Remove last AI player from list
  for(let i = state.players.length - 1; i >= 0; i--) {
    if(state.players[i].id.startsWith('ai-')) {
      state.players.splice(i, 1);
      _cpuCount--;
      break;
    }
  }

  updateLobbyUI();
  broadcast({ type: 'player-list', players: state.players });
}

function selectGame(el) {
  if(el.classList.contains('disabled') || el.classList.contains('solo-only-disabled')) return;
  document.querySelectorAll('.game-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedGame = el.dataset.game;

  // Show/hide mafia lobby area (setup button + config display)
  const mfLobbyArea = document.getElementById('mfLobbyArea');
  const mfSetupBtn = document.getElementById('mfSetupBtn');
  const cfgDisplay = document.getElementById('mfConfigDisplay');
  if (mfLobbyArea) {
    mfLobbyArea.style.display = state.selectedGame === 'mafia' ? 'block' : 'none';
  }
  if (mfSetupBtn) {
    mfSetupBtn.style.display = (state.selectedGame === 'mafia' && state.isHost) ? 'block' : 'none';
  }
  if (cfgDisplay) {
    cfgDisplay.style.display = (state.selectedGame === 'mafia' && typeof mfSetupDone !== 'undefined' && mfSetupDone) ? 'block' : 'none';
  }

  // Show/hide bet mode lobby area (poker/sutda/blackjack)
  const betModeLobbyArea = document.getElementById('betModeLobbyArea');
  if (betModeLobbyArea) {
    betModeLobbyArea.style.display = (state.selectedGame === 'poker' || state.selectedGame === 'sutda' || state.selectedGame === 'blackjack') ? 'block' : 'none';
  }

  // Show/hide bombshot lobby area
  const bsLobbyArea = document.getElementById('bsLobbyArea');
  const bsSetupBtn = document.getElementById('bsSetupBtn');
  const bsCfgDisplay = document.getElementById('bsConfigDisplay');
  if (bsLobbyArea) {
    bsLobbyArea.style.display = state.selectedGame === 'bombshot' ? 'block' : 'none';
  }
  if (bsSetupBtn) {
    bsSetupBtn.style.display = (state.selectedGame === 'bombshot' && state.isHost) ? 'block' : 'none';
  }
  if (bsCfgDisplay) {
    bsCfgDisplay.style.display = (state.selectedGame === 'bombshot' && typeof _bsSetupDone !== 'undefined' && _bsSetupDone) ? 'block' : 'none';
  }

  // Update game info panel + start button visibility
  updateGameInfoPanel(state.selectedGame);
  if(state.isHost) {
    const _minP = SOLO_GAMES.includes(state.selectedGame) ? 1 : 2;
    document.getElementById('startGameBtn').style.display = state.players.length >= _minP ? 'block' : 'none';
  }

  // Broadcast game selection so non-host players can see mafia config
  if (state.isHost) {
    broadcast({ type: 'game-selected', game: state.selectedGame });
  }
}

const GAME_INFO = {
  poker:    { emoji:'🃏', name:'포커', desc:'텍사스 홀덤 포커. 2장의 개인 카드와 5장의 공용 카드로 최강의 족보를 만드세요.', players:'2~14명', time:'10~30분', type:'카드' },
  mafia:    { emoji:'🕵️', name:'마피아', desc:'마피아와 시민의 두뇌 싸움. 밤에 암살, 낮에 투표로 적을 찾아내세요.', players:'3~14명', time:'15~45분', type:'추리' },
  sutda:    { emoji:'🎴', name:'섯다', desc:'화투 2장으로 승부! 땡, 광땡, 끗 등 다양한 족보로 베팅 대결.', players:'2~6명', time:'5~10분', type:'카드' },
  quickdraw:{ emoji:'🤠', name:'총잡이', desc:'서부 결투! "Fire!" 신호에 가장 빠르게 반응하는 사람이 승리.', players:'2~14명', time:'2~5분', type:'반응속도' },
  roulette: { emoji:'🔫', name:'러시안 룰렛', desc:'스마트폰을 총처럼! 실린더를 돌리고 방아쇠를 당기는 스릴 게임.', players:'2~14명', time:'1~3분', type:'운' },
  lottery:  { emoji:'🎰', name:'뽑기', desc:'번호를 뽑아 운명을 결정! 랜덤 추첨으로 당첨자를 가려내세요.', players:'1~14명', time:'5~15분', type:'운' },
  ecard:    { emoji:'👑', name:'E카드', desc:'황제 vs 노예의 심리전. 5장의 카드로 상대의 수를 읽어라!', players:'2명', time:'5~10분', type:'심리전' },
  yahtzee:  { emoji:'🎲', name:'야추', desc:'5개의 주사위로 최고 점수를 노려라! 3번의 기회로 족보 완성.', players:'1~14명', time:'10~15분', type:'주사위' },
  updown:   { emoji:'🃏', name:'업다운', desc:'다음 카드가 높을까 낮을까? 연속 맞추기 도전!', players:'2~14명', time:'5~10분', type:'카드' },
  truth:    { emoji:'⭕', name:'진실게임', desc:'질문을 하고, 비밀투표를 통해 다른 사람의 속마음을 엿볼 수 있어요.', players:'3~14명', time:'10~20분', type:'파티' },
  fortress: { emoji:'🏰', name:'요새', desc:'탱크 포격전! 각도와 파워를 조절해서 상대 요새를 파괴하세요.', players:'2~14명', time:'5~10분', type:'전략' },
  bombshot: { emoji:'🍺', name:'폭탄주', desc:'거짓말로 술을 섞는 라이어를 찾아라. 거짓말을 간파하고 폭탄주 룰렛을 피하자!', players:'2~4명', time:'5~15분', type:'블러프' },
  blackjack:{ emoji:'🃏', name:'블랙잭', desc:'딜러와의 21점 대결! 히트, 스탠드, 더블로 최적의 전략을 펼치세요.', players:'1~14명', time:'5~15분', type:'카드' },
  stairs:   { emoji:'🪜', name:'무한계단', desc:'끝없이 올라가는 계단! 좌우 타이밍을 맞춰 최고 기록 도전.', players:'1~14명', time:'3~10분', type:'레이싱' },
  tetris:   { emoji:'🧩', name:'테트리스', desc:'클래식 퍼즐! 블록을 쌓고 줄을 지워 최고 점수에 도전.', players:'1~14명', time:'5~10분', type:'퍼즐' },
  jewel:    { emoji:'💎', name:'보석맞추기', desc:'같은 보석 3개를 맞춰 제거! 콤보와 연쇄로 고득점.', players:'1~14명', time:'5~10분', type:'퍼즐' },
  colorchain:{ emoji:'🔗', name:'컬러체인', desc:'같은 색 구슬을 연결해서 터뜨려라! 중력과 연쇄 콤보.', players:'1~14명', time:'5~10분', type:'퍼즐' },
  slinkystairs:{ emoji:'🌀', name:'슬링키 스테어즈', desc:'무너지는 계단 위에서 슬링키를 조종해 살아남으세요! 좌우 타이밍이 핵심.', players:'1~14명', time:'3~10분', type:'아케이드' },
  pupil:{ emoji:'👁', name:'동공 탐지기', desc:'카메라로 동공 반응을 분석하여 진술의 신뢰도를 측정합니다. 혼자서만 플레이 가능!', players:'1명 전용', time:'5~10분', type:'분석' },
  tamagotchi:{ emoji:'🐉', name:'다마고치', desc:'나만의 포트리스 펫을 키워보세요! 먹이, 돌봄, 훈련으로 성장시키고 진화하세요.', players:'1명 전용', time:'상시', type:'육성' },
  idol:      { emoji:'🎤', name:'아이돌 매니지먼트', desc:'블루마블 보드판에서 내 아이돌을 스타로 키우는 전략 보드게임! 샵을 사고, 훈련하고, 가챠로 역전을 노려라.', players:'1~4명', time:'45~60분', type:'보드게임' }
};

function updateGameInfoPanel(game) {
  const panel = document.getElementById('gameInfoPanel');
  const info = GAME_INFO[game];
  if(!panel || !info) { if(panel) panel.style.display='none'; return; }
  panel.style.display = 'block';
  document.getElementById('gameInfoEmoji').textContent = info.emoji;
  document.getElementById('gameInfoName').textContent = info.name;
  document.getElementById('gameInfoDesc').textContent = info.desc;
  document.getElementById('gameInfoPlayers').textContent = '👥 ' + info.players;
  document.getElementById('gameInfoTime').textContent = '⏱ ' + info.time;
  document.getElementById('gameInfoType').textContent = '🏷 ' + info.type;
}

// ===== GAME START =====
function startGame() {
  console.log('[PartyDeck] startGame 호출. isHost:', state.isHost, 'players:', state.players.length, 'game:', state.selectedGame);
  const minPlayers = SOLO_GAMES.includes(state.selectedGame) ? 1 : 2;
  if(!state.isHost || state.players.length < minPlayers) { showToast('최소 ' + minPlayers + '명 필요 (현재 ' + state.players.length + '명)'); return; }
  if(!spendEnergy(1)) { showToast('⚡ 에너지가 부족합니다! 충전을 기다려주세요'); return; }
  const g = state.selectedGame;
  if(g === 'poker') startPoker();
  else if(g === 'mafia') startMafia();
  else if(g === 'sutda') startSutda();
  else if(g === 'quickdraw') startQuickDraw();
  else if(g === 'roulette') startRussianRoulette();
  else if(g === 'lottery') startLottery();
  else if(g === 'ecard') startECard();
  else if(g === 'yahtzee') startYahtzee();
  else if(g === 'updown') startUpDown();
  else if(g === 'truth') startTruthGame();
  else if(g === 'fortress') startFortress();
  else if(g === 'bombshot') startBombShot();
  else if(g === 'blackjack') startBlackjack();
  else if(g === 'stairs') startStairs();
  else if(g === 'tetris') startTetris();
  else if(g === 'jewel') startJewel();
  else if(g === 'colorchain') startColorChain();
  else if(g === 'slinkystairs') startSlinkyStairs();
  else if(g === 'pupil') { if(state.players.length > 1) { showToast('👁 동공 탐지기는 1인 전용입니다'); return; } startPupil(); }
  else if(g === 'tamagotchi') { if(state.players.length > 1) { showToast('🐉 다마고치는 1인 전용입니다'); return; } startTamagotchi(); }
  else if(g === 'idol') startIdolManagement();
  else showToast('준비 중인 게임입니다');
}

function handleGameStart(msg) {
  spendEnergy(1); // Non-host soft spend (proceeds even if 0)
  if(msg.game === 'poker') { showScreen('pokerGame'); renderPokerView(msg.state); }
  else if(msg.game === 'mafia') { showScreen('mafiaGame'); }
  else if(msg.game === 'sutda') { showScreen('sutdaGame'); renderSutdaView(msg.state); }
  else if(msg.game === 'quickdraw') {
    showScreen('quickDrawGame');
    qdState = msg.state;
    renderQuickDrawView(qdState);
  }
  else if(msg.game === 'roulette') {
    showScreen('rouletteGame');
    renderRouletteView(msg.state);
  }
  else if(msg.game === 'lottery') {
    if(msg.state) {
      showScreen('lotteryGame');
      if(msg.state.mode === 'lottery') {
        switchLotteryMode('lottery');
        if(msg.state.phase === 'playing') {
          renderLotteryGame(msg.state);
        } else {
          renderLotterySetup();
        }
      } else {
        switchLotteryMode('roulette');
        if(msg.state.phase === 'playing') {
          renderRouletteGame(msg.state);
        } else {
          renderRouletteSetup();
        }
      }
    }
  }
  else if(msg.game === 'updown') { showScreen('updownGame'); renderUpDownView(msg.state); }
  else if(msg.game === 'yahtzee') { showScreen('yahtzeeGame'); renderYahtzeeView(msg.state); }
  else if(msg.game === 'ecard') { showScreen('ecardGame'); renderECardView(msg.state); }
  else if(msg.game === 'truth') {
    showScreen('truthGame');
    renderTruthView(msg.state);
  }
  else if(msg.game === 'fortress') {
    showScreen('fortressGame');
    initFortCanvas();
    renderFortressView(msg.state);
  }
  else if(msg.game === 'bombshot') {
    showScreen('bombshotGame');
    loadBombShotThree();
    initBSCanvas();
    // State will arrive via bs-state message
  }
  else if(msg.game === 'blackjack') {
    showScreen('blackjackGame');
    if(msg.state) renderBJView(msg.state);
  }
  else if(msg.game === 'stairs') {
    showScreen('stairsGame');
    renderStairsView(msg.state);
  }
  else if(msg.game === 'tetris') {
    showScreen('tetrisGame');
    renderTetrisView(msg.state);
  }
  else if(msg.game === 'jewel') {
    showScreen('jewelGame');
    renderJewelView(msg.state);
  }
  else if(msg.game === 'colorchain') {
    showScreen('colorchainGame');
    renderColorChainView(msg.state);
  }
  else if(msg.game === 'slinkystairs') {
    showScreen('slinkyStairsGame');
    renderSlinkyStairsView(msg.state);
  }
  else if(msg.game === 'pupil') {
    startPupil();
  }
  else if(msg.game === 'idol') {
    showScreen('idolGame');
    if(msg.state) renderIdolView(msg.state);
    else if(typeof idolShowSelectPhase === 'function') idolShowSelectPhase();
  }
}

// ===== DEBUG / PREVIEW MODE =====
let debugModeOn = false;

function toggleDebugMode() {
  debugModeOn = !debugModeOn;
  const btn = document.getElementById('debugToggleBtn');
  const selector = document.getElementById('debugGameSelector');
  if(debugModeOn) {
    btn.classList.add('active');
    btn.textContent = '🛠 디버그 모드 ON (닫기)';
    selector.style.display = '';
  } else {
    btn.classList.remove('active');
    btn.textContent = '🛠 디버그 미리보기';
    selector.style.display = 'none';
  }
}

function debugGame(game) {
  state.myId = 'debug-me';
  state.myName = '테스터';
  state.myAvatar = '😎';
  state.isHost = true;
  state.players = [
    { id: 'debug-me', name: '테스터', avatar: '😎' },
    { id: 'debug-bot', name: '봇', avatar: '🤖' }
  ];

  const screenMap = {
    poker: 'pokerGame',
    mafia: 'mafiaGame',
    sutda: 'sutdaGame',
    quickdraw: 'quickDrawGame',
    roulette: 'rouletteGame',
    lottery: 'lotteryGame',
    ecard: 'ecardGame',
    yahtzee: 'yahtzeeGame',
    updown: 'updownGame',
    truth: 'truthGame',
    fortress: 'fortressGame',
    bombshot: 'bombshotGame',
    blackjack: 'blackjackGame',
    stairs: 'stairsGame',
    tetris: 'tetrisGame',
    jewel: 'jewelGame',
    colorchain: 'colorchainGame',
    slinkystairs: 'slinkyStairsGame',
    pupil: 'pupilGame',
    tamagotchi: 'tamagotchiGame'
  };

  if(game === 'pupil') {
    state.players = [{ id: 'debug-me', name: '테스터', avatar: '😎' }];
    startPupil();
    return;
  }

  if(game === 'tamagotchi') {
    state.players = [{ id: 'debug-me', name: '테스터', avatar: '😎' }];
    startTamagotchi();
    return;
  }

  if(game === 'idol') {
    state.players = [
      { id: 'debug-me', name: '테스터', avatar: '😎' },
      { id: 'debug-cpu1', name: 'CPU 루나', avatar: '🎤' },
    ];
    startIdolManagement();
    return;
  }

  if(game === 'stairs') {
    startStairs();
    return;
  }

  if(game === 'yahtzee') {
    yahState = {
      players: state.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        scores: {
          ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null,
          'four-kind': null, 'full-house': null,
          'small-straight': null, 'large-straight': null, yahtzee: null, chance: null
        },
        total: 0
      })),
      turnIdx: 0,
      dice: [0, 0, 0, 0, 0],
      held: [false, false, false, false, false],
      rollsLeft: 3,
      turnNum: 1,
      maxTurns: 12,
      selectedCategory: null,
      phase: 'rolling'
    };
    showScreen('yahtzeeGame');
    renderYahtzeeView(createYahtzeeView());
    return;
  }

  if(game === 'tetris') {
    showScreen('tetrisGame');
    tetShowModeSelect();
    return;
  }

  if(game === 'jewel') {
    showScreen('jewelGame');
    jwlShowModeSelect();
    return;
  }

  if(game === 'colorchain') {
    startColorChain();
    return;
  }

  if(game === 'slinkystairs') {
    startSlinkyStairs();
    return;
  }

  if(game === 'blackjack') {
    startBlackjack();
    return;
  }

  const screenId = screenMap[game];
  if(screenId) {
    showScreen(screenId);
  }
}

// ===== BET MODE =====
let _betMode = 'free-1000';

function getStartChips() {
  if (_betMode === 'gold') {
    const eco = getEconomy();
    return eco.gold;
  }
  const val = parseInt(_betMode.split('-')[1]);
  return val || 1000;
}

function isBetModeGold() { return _betMode === 'gold'; }

// Setup bet mode radio buttons
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#betModeOptions .bet-mode-option').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('#betModeOptions .bet-mode-option').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
      const radio = label.querySelector('input');
      if (radio) { radio.checked = true; _betMode = radio.value; }
    });
  });
});

// ===== EVENTS =====
document.getElementById('nameInput').addEventListener('change', saveProfile);
document.getElementById('nameInput').addEventListener('blur', saveProfile);

// ===== START =====
init();

// Auto-enter debug mode if ?debug= param present
(function() {
  const p = new URLSearchParams(location.search);
  const d = p.get('debug');
  if(d) setTimeout(() => debugGame(d), 500);
})();

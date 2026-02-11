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

let state = {
  myId: '', myName: '', myAvatar: '😎', avatarIdx: 0,
  isHost: false, roomCode: '',
  peer: null, connections: {}, players: [],
  selectedGame: 'poker',
  poker: null, mafia: null,
  _pokerView: null, _mafiaView: null,
};

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
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Init Three.js scene when entering yahtzee
  if(id === 'yahtzeeGame') {
    if(typeof initYahtzeeThree === 'function') {
      const canvas = document.getElementById('yahtzeeCanvas');
      if(canvas) initYahtzeeThree(canvas);
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
    const p = JSON.parse(s);
    state.myName = p.name || '';
    state.myAvatar = p.avatar || '😎';
    state.avatarIdx = Math.max(0, AVATARS.indexOf(state.myAvatar));
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
  const s = JSON.parse(localStorage.getItem('pd_stats') || '{"w":0,"g":0}');
  const r = s.g > 0 ? Math.round((s.w / s.g) * 100) : 0;
  document.getElementById('profileStats').textContent = `${s.g}전 ${s.w}승 (${r}%)`;
}

function recordGame(won) {
  const s = JSON.parse(localStorage.getItem('pd_stats') || '{"w":0,"g":0}');
  s.g++;
  if(won) s.w++;
  localStorage.setItem('pd_stats', JSON.stringify(s));
  updateStats();
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
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.relay.metered.ca:80' },
          { urls: 'turn:global.relay.metered.ca:80', username: 'e8dd65b92f6aee9b1b166122', credential: 'FhMnGasa+JeQChi3' },
          { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'e8dd65b92f6aee9b1b166122', credential: 'FhMnGasa+JeQChi3' },
          { urls: 'turn:global.relay.metered.ca:443', username: 'e8dd65b92f6aee9b1b166122', credential: 'FhMnGasa+JeQChi3' },
          { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'e8dd65b92f6aee9b1b166122', credential: 'FhMnGasa+JeQChi3' },
        ]
      }
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
}

function sendTo(peerId, data) {
  const conn = state.connections[peerId];
  if(conn?.open) conn.send(JSON.stringify(data));
}

function handleMessage(peerId, raw) {
  const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  console.log('[PartyDeck] 메시지 수신:', msg.type, 'from:', peerId);

  const handlers = {
    'player-info': () => handlePlayerJoin(peerId, msg),
    'player-list': () => { state.players = msg.players; updateLobbyUI(); },
    'game-start': () => handleGameStart(msg),
    'poker-state': () => { showScreen('pokerGame'); renderPokerView(msg); },
    'poker-action': () => { if(state.isHost) processPokerAction(peerId, msg.action, msg.amount); },
    'poker-result': () => handlePokerResult(msg),
    'mf-state': () => { mfHandleState(msg); },
    'mf-action': () => { if(state.isHost) mfProcessAction(peerId, msg); },
    'mf-result': () => { mfHandleResult(msg); },
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
    'ud-addbet': () => { if(state.isHost) { udState.penalties.push(msg.text); udState.currentBet = msg.text; broadcastUpDownState(); } },
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
    'yah-action': () => {
      if(state.isHost) {
        if(yahState.players[yahState.turnIdx].id !== peerId) return;
        if(msg.action === 'roll') {
          if(yahState.rollsLeft > 0) { yahRollDice(); broadcastYahtzeeState(); }
        } else if(msg.action === 'hold') {
          if(yahState.rollsLeft < 3) { yahState.held[msg.index] = !yahState.held[msg.index]; broadcastYahtzeeState(); }
        } else if(msg.action === 'select') {
          const player = yahState.players[yahState.turnIdx];
          if(player.scores[msg.category] === null) { yahState.selectedCategory = msg.category; yahState.phase = 'scoring'; broadcastYahtzeeState(); }
        } else if(msg.action === 'score') {
          if(yahState.selectedCategory) {
            const player = yahState.players[yahState.turnIdx];
            const score = calcYahtzeeScore(yahState.dice, yahState.selectedCategory);
            player.scores[yahState.selectedCategory] = score;
            player.total = calculatePlayerTotal(player);
            const allFinished = yahState.players.every(p => YAHTZEE_CATEGORIES.every(cat => p.scores[cat] !== null));
            if(allFinished) { yahState.phase = 'gameover'; broadcastYahtzeeState(); handleYahtzeeGameOver(); return; }
            yahState.turnIdx = (yahState.turnIdx + 1) % yahState.players.length;
            if(yahState.turnIdx === 0) yahState.turnNum++;
            yahState.dice = [1,1,1,1,1]; yahState.held = [false,false,false,false,false];
            yahState.rollsLeft = 3; yahState.selectedCategory = null; yahState.phase = 'rolling';
            yahRollDice(); broadcastYahtzeeState();
          }
        }
      }
    },
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
    // Racing handlers
    'race-position': () => { if(state.isHost) handleRacePosition(peerId, msg); },
    'race-result': () => handleRaceResult(msg),
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
  state.players.push({ id: peerId, name: msg.name, avatar: msg.avatar, isHost: false });
  broadcast({ type: 'player-list', players: state.players });
  updateLobbyUI();
  showToast(msg.name + ' 참가!');
}

function leaveLobby() {
  if(state.peer) { state.peer.destroy(); state.peer = null; }
  state.connections = {};
  state.players = [];
  state.poker = null;
  state.mafia = null;
  showScreen('mainMenu');
}

function leaveGame() { leaveLobby(); }

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
      <div class="player-name">${p.name}</div>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      ${p.id === state.myId ? '<span style="font-size:11px;color:var(--accent2);">나</span>' : ''}
    </div>
  `).join('');
  document.getElementById('playerCount').textContent = state.players.length;
  if(state.isHost) {
    document.getElementById('startGameBtn').style.display = state.players.length >= 2 ? 'block' : 'none';
  }
}

function selectGame(el) {
  if(el.classList.contains('disabled')) return;
  document.querySelectorAll('.game-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedGame = el.dataset.game;
}

// ===== GAME START =====
function startGame() {
  console.log('[PartyDeck] startGame 호출. isHost:', state.isHost, 'players:', state.players.length, 'game:', state.selectedGame);
  if(!state.isHost || state.players.length < 2) { showToast('최소 2명 필요 (현재 ' + state.players.length + '명)'); return; }
  const g = state.selectedGame;
  if(g === 'poker') startPoker();
  else if(g === 'mafia') startMafia();
  else if(g === 'sutda') startSutda();
  else if(g === 'quickdraw') startQuickDraw();
  else if(g === 'roulette') startRussianRoulette();
  else if(g === 'racing') startRacing();
  else if(g === 'lottery') startLottery();
  else if(g === 'ecard') startECard();
  else if(g === 'yahtzee') startYahtzee();
  else if(g === 'updown') startUpDown();
  else if(g === 'truth') startTruthGame();
  else showToast('준비 중인 게임입니다');
}

function handleGameStart(msg) {
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
  else if(msg.game === 'racing') { showScreen('racingGame'); document.getElementById('racingModeSelect').style.display = 'flex'; }
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
}

// ===== EVENTS =====
document.getElementById('nameInput').addEventListener('change', saveProfile);
document.getElementById('nameInput').addEventListener('blur', saveProfile);

// ===== START =====
init();

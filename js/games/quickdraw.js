// ===== QUICK DRAW ENGINE =====

let qdState = {
  phase: 'waiting',
  startTime: 0,
  results: {},
  roundNum: 1,
  countdownTimeout: null,
  fireTimeout: null,
};

function startQuickDraw() {
  if(!state.isHost) return;

  qdState = {
    phase: 'waiting',
    startTime: 0,
    results: {},
    roundNum: state.quickdraw?.roundNum || 1,
    countdownTimeout: null,
    fireTimeout: null,
  };

  state.quickdraw = qdState;

  broadcast({ type: 'game-start', game: 'quickdraw', state: qdState });
  showScreen('quickDrawGame');
  renderQuickDrawView(qdState);

  setTimeout(() => {
    qdState.phase = 'countdown';
    broadcastQDState();

    const delay = 2000 + Math.random() * 4000;
    qdState.countdownTimeout = setTimeout(() => {
      qdState.phase = 'fire';
      qdState.startTime = Date.now();
      broadcastQDState();

      if(navigator.vibrate) navigator.vibrate(200);
      qdPlayFireSound();

      qdState.fireTimeout = setTimeout(() => {
        resolveQD();
      }, 5000);
    }, delay);
  }, 3000);
}

// Web Audio API gunshot sound for fire signal
// AudioContext is created on first user gesture (qdTap) and reused
var _qdAudioCtx = null;
function qdEnsureAudioCtx() {
  if(!_qdAudioCtx) {
    try { _qdAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { /* audio not supported */ }
  }
  // Resume if suspended (iOS requires resume after user gesture)
  if(_qdAudioCtx && _qdAudioCtx.state === 'suspended') {
    _qdAudioCtx.resume();
  }
}

function qdPlayFireSound() {
  if(!_qdAudioCtx) return;
  try {
    const ctx = _qdAudioCtx;
    const duration = 0.15;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch(e) { /* ignore playback errors */ }
}

function broadcastQDState() {
  const msg = {
    type: 'qd-state',
    phase: qdState.phase,
    startTime: qdState.startTime,
    results: qdState.results,
    roundNum: qdState.roundNum,
  };

  broadcast(msg);
  renderQuickDrawView(msg);
}

function renderQuickDrawView(qd) {
  if(!qd) return;

  const zone = document.getElementById('qdTapZone');
  const statusText = document.getElementById('qdStatusText');
  const reactionTime = document.getElementById('qdReactionTime');
  const roundNum = document.getElementById('qdRoundNum');

  roundNum.textContent = qd.roundNum;

  zone.className = 'qd-tap-zone ' + qd.phase;

  switch(qd.phase) {
    case 'waiting':
      statusText.textContent = '준비...';
      reactionTime.textContent = '';
      break;

    case 'countdown':
      statusText.textContent = '⏳';
      reactionTime.textContent = '';
      break;

    case 'fire':
      statusText.textContent = '🔫 발사!';
      reactionTime.textContent = '';

      if(navigator.vibrate) navigator.vibrate(200);
      qdPlayFireSound();
      break;

    case 'result':
      statusText.textContent = '결과';

      const myResult = qd.results[state.myId];
      if(myResult) {
        if(myResult.cheated) {
          reactionTime.textContent = '실격!';
          reactionTime.style.color = 'var(--danger)';
        } else {
          reactionTime.textContent = (myResult.time / 1000).toFixed(3) + '초';
          reactionTime.style.color = 'var(--accent2)';
        }
      } else {
        reactionTime.textContent = '미응답';
        reactionTime.style.color = 'var(--text-dim)';
      }

      document.getElementById('qdRestartBtn').style.display = state.isHost ? 'block' : 'none';
      break;
  }

  renderQDRankings(qd);
}

function renderQDRankings(qd) {
  const list = document.getElementById('qdRankingsList');

  if(qd.phase !== 'result' || Object.keys(qd.results).length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:20px;">대기 중...</div>';
    return;
  }

  const sorted = Object.entries(qd.results)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => {
      if(a.cheated && !b.cheated) return 1;
      if(!a.cheated && b.cheated) return -1;
      if(a.cheated && b.cheated) return 0;
      return a.time - b.time;
    });

  list.innerHTML = sorted.map((r, i) => {
    const rank = r.cheated ? '❌' : (i + 1) + '위';
    const timeStr = r.cheated ? '너무 빨라요!' : (r.time / 1000).toFixed(3) + '초';
    const isWinner = !r.cheated && i === 0;
    const playerIdx = state.players.findIndex(p => p.id === r.id);

    return `
      <div class="qd-ranking-item ${isWinner ? 'winner' : ''}">
        <div class="qd-ranking-rank">${rank}</div>
        <div class="qd-ranking-avatar" style="background:${PLAYER_COLORS[playerIdx % PLAYER_COLORS.length]};">${r.avatar}</div>
        <div class="qd-ranking-name">${escapeHTML(r.name)}</div>
        <div class="qd-ranking-time ${r.cheated ? 'cheated' : ''}">${timeStr}</div>
      </div>
    `;
  }).join('');
}

function qdTap() {
  // Create/resume AudioContext on user gesture (required by iOS Safari)
  qdEnsureAudioCtx();

  const qd = qdState;
  const now = Date.now();

  if(qd.results[state.myId]) return;

  if(qd.phase === 'waiting') {
    return;
  } else if(qd.phase === 'countdown') {
    sendQDAction({ cheated: true, time: 0 });

    qdState.results[state.myId] = {
      cheated: true,
      time: 0,
      name: state.myName,
      avatar: state.myAvatar,
    };

    const zone = document.getElementById('qdTapZone');
    const statusText = document.getElementById('qdStatusText');
    zone.className = 'qd-tap-zone cheated';
    statusText.textContent = '너무 빨라요!\n실격!';
    statusText.style.fontSize = '32px';

  } else if(qd.phase === 'fire') {
    const reactionTime = now - qd.startTime;
    sendQDAction({ cheated: false, time: reactionTime });

    qdState.results[state.myId] = {
      cheated: false,
      time: reactionTime,
      name: state.myName,
      avatar: state.myAvatar,
    };

    const zone = document.getElementById('qdTapZone');
    const statusText = document.getElementById('qdStatusText');
    const reactionTimeEl = document.getElementById('qdReactionTime');
    zone.className = 'qd-tap-zone done';
    statusText.textContent = '완료!';
    reactionTimeEl.textContent = (reactionTime / 1000).toFixed(3) + '초';
  }
}

function sendQDAction(action) {
  const msg = {
    type: 'qd-action',
    playerId: state.myId,
    name: state.myName,
    avatar: state.myAvatar,
    cheated: action.cheated,
    time: action.time,
  };

  if(state.isHost) {
    processQDAction(msg);
  } else {
    sendToHost(msg);
  }
}

function processQDAction(msg) {
  if(!state.isHost) return;

  qdState.results[msg.playerId] = {
    cheated: msg.cheated,
    time: msg.time,
    name: msg.name,
    avatar: msg.avatar,
  };

  if(Object.keys(qdState.results).length >= state.players.length) {
    clearTimeout(qdState.fireTimeout);
    resolveQD();
  }
}

function resolveQD() {
  if(!state.isHost) return;

  qdState.phase = 'result';

  const valid = Object.entries(qdState.results)
    .filter(([id, r]) => !r.cheated)
    .sort((a, b) => a[1].time - b[1].time);

  let winnerId = null;
  let winnerName = '';
  if(valid.length > 0) {
    winnerId = valid[0][0];
    winnerName = valid[0][1].name;
  }

  const result = {
    type: 'qd-result',
    winnerId,
    winnerName,
    results: qdState.results,
    roundNum: qdState.roundNum,
  };

  broadcast(result);
  handleQDResult(result);
}

function handleQDResult(msg) {
  qdState.phase = 'result';
  qdState.results = msg.results;
  qdState.roundNum = msg.roundNum;

  renderQuickDrawView(qdState);

  const won = msg.winnerId === state.myId;
  if(msg.winnerId) {
    recordGame(won, won ? 30 : 5);
  }

  if(msg.winnerId === state.myId) {
    showToast('🏆 승리!');
  } else if(msg.winnerId) {
    showToast(`${msg.winnerName} 승리!`);
  }
}

function restartQuickDraw() {
  if(!state.isHost) return;
  qdState.roundNum++;
  startQuickDraw();
}


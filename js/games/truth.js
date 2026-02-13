// ===== TRUTH GAME ENGINE =====

// --- 호스트 상태 ---
let truthState = null;

function startTruthGame() {
  if (!state.isHost) return;
  if (state.players.length < 3) {
    showToast('진실게임은 3명 이상 필요합니다');
    return;
  }

  truthState = {
    round: 1,
    questionerIdx: 0,
    question: '',
    votes: {},
    votedSet: new Set(),
    phase: 'question',
    playerOrder: state.players.map(p => p.id),
    playerMap: {},
  };

  state.players.forEach((p, i) => {
    truthState.playerMap[p.id] = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      colorIdx: i,
    };
  });

  const initView = buildTruthView(state.myId);
  showScreen('truthGame');
  renderTruthView(initView);

  state.players.forEach(p => {
    if (p.id !== state.myId) {
      const view = buildTruthView(p.id);
      sendTo(p.id, {
        type: 'game-start',
        game: 'truth',
        state: view,
      });
    }
  });
}

function buildTruthView(forPlayerId) {
  const ts = truthState;
  const questionerId = ts.playerOrder[ts.questionerIdx];
  const isQuestioner = (forPlayerId === questionerId);
  const totalPlayers = ts.playerOrder.length;

  const votedList = Array.from(ts.votedSet || []);
  const voteCount = votedList.length;

  let oCount = 0;
  let xCount = 0;
  if (ts.phase === 'result') {
    Object.values(ts.votes).forEach(v => {
      if (v === 'O') oCount++;
      else if (v === 'X') xCount++;
    });
  }

  const myVoted = ts.votedSet ? ts.votedSet.has(forPlayerId) : false;

  return {
    type: 'truth-state',
    round: ts.round,
    phase: ts.phase,
    questionerId: questionerId,
    questionerName: ts.playerMap[questionerId]?.name || '???',
    isQuestioner: isQuestioner,
    question: ts.phase !== 'question' ? ts.question : (isQuestioner ? '' : ''),
    totalPlayers: totalPlayers,
    voteCount: voteCount,
    votedList: votedList,
    myVoted: myVoted,
    oCount: oCount,
    xCount: xCount,
    players: ts.playerOrder.map(pid => ({
      id: pid,
      name: ts.playerMap[pid]?.name || '???',
      avatar: ts.playerMap[pid]?.avatar || '😎',
      colorIdx: ts.playerMap[pid]?.colorIdx || 0,
      isQuestioner: pid === questionerId,
      hasVoted: ts.votedSet ? ts.votedSet.has(pid) : false,
    })),
    isHost: forPlayerId === state.myId && state.isHost,
  };
}

function broadcastTruthState() {
  if (!truthState) return;
  const ts = truthState;

  ts.playerOrder.forEach(pid => {
    const view = buildTruthView(pid);
    if (pid === state.myId) {
      renderTruthView(view);
    } else {
      sendTo(pid, view);
    }
  });
}

function processTruthQuestion(peerId, question) {
  if (!truthState || truthState.phase !== 'question') return;
  const questionerId = truthState.playerOrder[truthState.questionerIdx];
  if (peerId !== questionerId) return;

  truthState.question = question;
  truthState.phase = 'voting';
  truthState.votes = {};
  truthState.votedSet = new Set();

  broadcastTruthState();
}

function processTruthVote(peerId, vote) {
  if (!truthState || truthState.phase !== 'voting') return;
  if (truthState.votedSet.has(peerId)) return;
  if (vote !== 'O' && vote !== 'X') return;

  truthState.votes[peerId] = vote;
  truthState.votedSet.add(peerId);

  if (truthState.votedSet.size >= truthState.playerOrder.length) {
    truthState.phase = 'result';
  }
  broadcastTruthState();
}

function processTruthNext() {
  if (!truthState) return;
  truthState.round++;
  truthState.questionerIdx = (truthState.questionerIdx + 1) % truthState.playerOrder.length;
  truthState.question = '';
  truthState.votes = {};
  truthState.votedSet = new Set();
  truthState.phase = 'question';

  broadcastTruthState();
}

function renderTruthView(view) {
  if (!view) return;

  document.getElementById('truthRoundBadge').textContent = 'ROUND ' + view.round;
  document.getElementById('truthQuestionerDisplay').textContent = '질문자: ' + view.questionerName;

  document.getElementById('truthQuestionInputArea').style.display = 'none';
  document.getElementById('truthWaitQuestionArea').style.display = 'none';
  document.getElementById('truthVotingArea').style.display = 'none';
  document.getElementById('truthResultArea').style.display = 'none';

  if (view.phase === 'question') {
    if (view.isQuestioner) {
      document.getElementById('truthQuestionInputArea').style.display = 'flex';
      document.getElementById('truthQuestionInput').value = '';
      document.getElementById('truthCharCount').textContent = '0';
    } else {
      document.getElementById('truthWaitQuestionArea').style.display = 'flex';
      document.getElementById('truthWaitingText').textContent = '질문을 기다리는 중...';
      document.getElementById('truthWaitingSubText').textContent =
        view.questionerName + '님이 질문을 작성하고 있습니다';
    }
  } else if (view.phase === 'voting') {
    document.getElementById('truthVotingArea').style.display = 'flex';
    document.getElementById('truthQuestionText').textContent = view.question;

    if (view.myVoted) {
      document.getElementById('truthVoteButtons').style.display = 'none';
      document.getElementById('truthVoteWaiting').style.display = 'block';
      const pct = Math.round((view.voteCount / view.totalPlayers) * 100);
      document.getElementById('truthProgressFill').style.width = pct + '%';
      document.getElementById('truthProgressText').textContent =
        '투표 중... (' + view.voteCount + '/' + view.totalPlayers + '명 완료)';
    } else {
      document.getElementById('truthVoteButtons').style.display = 'flex';
      document.getElementById('truthVoteWaiting').style.display = 'none';
      document.getElementById('truthBtnO').classList.remove('selected', 'disabled');
      document.getElementById('truthBtnX').classList.remove('selected', 'disabled');
    }
  } else if (view.phase === 'result') {
    document.getElementById('truthResultArea').style.display = 'flex';
    document.getElementById('truthResultQuestionText').textContent = view.question;
    document.getElementById('truthResultOCount').textContent = view.oCount + '명';
    document.getElementById('truthResultXCount').textContent = view.xCount + '명';
    document.getElementById('truthResultTotal').textContent =
      '총 ' + view.totalPlayers + '명 참여';

    const oDots = document.getElementById('truthResultODots');
    let oHTML = '';
    for (let i = 0; i < view.totalPlayers; i++) {
      const delay = (i * 0.08).toFixed(2);
      if (i < view.oCount) {
        oHTML += '<div class="truth-dot filled-o" style="animation-delay:' + delay + 's"></div>';
      } else {
        oHTML += '<div class="truth-dot empty"></div>';
      }
    }
    oDots.innerHTML = oHTML;

    const xDots = document.getElementById('truthResultXDots');
    let xHTML = '';
    for (let i = 0; i < view.totalPlayers; i++) {
      const delay = (i * 0.08).toFixed(2);
      if (i < view.xCount) {
        xHTML += '<div class="truth-dot filled-x" style="animation-delay:' + delay + 's"></div>';
      } else {
        xHTML += '<div class="truth-dot empty"></div>';
      }
    }
    xDots.innerHTML = xHTML;

    if (view.isHost) {
      document.getElementById('truthNextBtn').style.display = 'block';
      document.getElementById('truthNextWaiting').style.display = 'none';
    } else {
      document.getElementById('truthNextBtn').style.display = 'none';
      document.getElementById('truthNextWaiting').style.display = 'block';
    }
  }

  renderTruthPlayersBar(view.players);
}

function renderTruthPlayersBar(players) {
  const bar = document.getElementById('truthPlayersBar');
  bar.innerHTML = players.map(p => {
    const isMe = p.id === state.myId;
    const avatarClasses = [
      'truth-player-avatar',
      p.isQuestioner ? 'is-questioner' : '',
      p.hasVoted ? 'has-voted' : '',
    ].filter(Boolean).join(' ');

    const nameClass = p.isQuestioner ? 'truth-player-name active-name' : 'truth-player-name';

    return '<div class="truth-player-chip">' +
      '<div class="' + avatarClasses + '" style="background:' + PLAYER_COLORS[p.colorIdx % PLAYER_COLORS.length] + ';">' +
        p.avatar +
      '</div>' +
      '<div class="' + nameClass + '">' + (isMe ? '나' : p.name) + '</div>' +
    '</div>';
  }).join('');
}

function submitTruthQuestion() {
  const input = document.getElementById('truthQuestionInput');
  const question = input.value.trim();
  if (!question) {
    showToast('질문을 입력하세요');
    return;
  }
  if (question.length > 200) {
    showToast('질문이 너무 깁니다 (200자 이내)');
    return;
  }

  if (state.isHost) {
    processTruthQuestion(state.myId, question);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-question',
        question: question,
      }));
    }
  }
}

function castTruthVote(vote) {
  const btnO = document.getElementById('truthBtnO');
  const btnX = document.getElementById('truthBtnX');

  if (vote === 'O') {
    btnO.classList.add('selected');
    btnX.classList.add('disabled');
  } else {
    btnX.classList.add('selected');
    btnO.classList.add('disabled');
  }

  setTimeout(() => {
    document.getElementById('truthVoteButtons').style.display = 'none';
    document.getElementById('truthVoteWaiting').style.display = 'block';
    document.getElementById('truthVotedBadge').textContent =
      vote === 'O' ? '⭕ 투표 완료' : '❌ 투표 완료';
  }, 400);

  if (state.isHost) {
    processTruthVote(state.myId, vote);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-vote',
        vote: vote,
      }));
    }
  }
}

function truthNextRound() {
  if (state.isHost) {
    processTruthNext();
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-next',
      }));
    }
  }
}

document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'truthQuestionInput') {
    const cnt = document.getElementById('truthCharCount');
    if (cnt) cnt.textContent = e.target.value.length;
  }
});


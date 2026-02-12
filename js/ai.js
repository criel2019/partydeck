// =============================================
// ===== AI PRACTICE MODE ======================
// =============================================

let practiceMode = false;
let _originalBroadcast = null;
let _originalSendTo = null;
let _originalCloseResult = null;
let _originalCloseSutdaResult = null;
let _originalMfCloseResult = null;
let _originalCloseYahtzeeGame = null;
let _aiTimer = null;
let _aiTimers = []; // tracked timeouts for cleanup on exit
let _qdTimers = []; // QuickDraw-specific timers (separate to avoid clearing others)
let _udContinuePending = false; // debounce for UpDown continueUpDown
let _rrPullScheduled = false; // one-shot flag for roulette pullTrigger
let _truthNextScheduled = false; // one-shot flag for truth processTruthNext

const AI_NAMES = ['봇짱', '로봇킹', '알파봇', 'AI마스터', '사이보그'];
const AI_AVATARS = ['🤖', '👾', '🎮', '🕹️', '💻'];
const AI_COUNTS = {
  poker: 2,
  sutda: 2,
  updown: 2,
  quickdraw: 2,
  roulette: 2,
  ecard: 1,
  yahtzee: 1,
  truth: 2,
  mafia: 5,
  lottery: 0,
  racing: 0,
};

// ========== ENTRY / EXIT ==========

function startPracticeMode() {
  showScreen('practiceSelect');
}

function leavePracticeMode() {
  practiceMode = false;
  cleanupAI();
  restoreNetworking();
  state.players = [];
  state.poker = null;
  state.mafia = null;
  state.ecard = null;
  state.isHost = false;
  state.roomCode = '';
  state.selectedGame = 'poker';
  state.connections = {};
  // Reset game-specific globals (null-safe)
  if (typeof ecState !== 'undefined') ecState = null;
  if (typeof sutdaHost !== 'undefined') sutdaHost = null;
  showScreen('mainMenu');
}

function startPracticeGame(gameName) {
  practiceMode = true;

  // Setup state
  state.myId = 'player-' + Math.random().toString(36).substr(2, 6);
  state.myName = document.getElementById('nameInput').value.trim() || '플레이어';
  state.myAvatar = AVATARS[state.avatarIdx] || '😎';
  state.isHost = true;
  state.selectedGame = gameName;
  state.roomCode = 'PRACTICE';
  state.connections = {};
  state.peer = null;
  state.poker = null;
  state.mafia = null;
  state.ecard = null;

  // Add human player + AI players
  const aiCount = AI_COUNTS[gameName] || 2;
  state.players = [
    { id: state.myId, name: state.myName, avatar: state.myAvatar, isHost: true }
  ];
  for (let i = 0; i < aiCount; i++) {
    state.players.push({
      id: 'ai-' + i,
      name: AI_NAMES[i % AI_NAMES.length],
      avatar: AI_AVATARS[i % AI_AVATARS.length],
      isHost: false,
    });
  }

  // Intercept networking
  interceptNetworking();

  // Start the game
  startGame();
}

// ========== NETWORK INTERCEPTION ==========

function interceptNetworking() {
  if (_originalBroadcast) return; // already intercepted
  _originalBroadcast = window.broadcast;
  _originalSendTo = window.sendTo;

  window.broadcast = function(data, exclude) {
    // Don't send over network — host already renders locally
    // Just schedule AI response
    if (data && data.type) {
      handleBroadcastForAI(data);
    }
  };

  window.sendTo = function(peerId, data) {
    if (!peerId || !peerId.toString().startsWith('ai-')) return;
    // Handle messages directed to AI peers
    handleAIMessage(peerId, data);
  };

  // Override close/result functions for practice mode
  _originalCloseResult = window.closeResult;
  window.closeResult = function() {
    document.getElementById('resultOverlay').classList.remove('active');
    if (practiceMode) {
      const g = state.selectedGame;
      if (g === 'poker') {
        const t = setTimeout(() => { if (practiceMode) startPoker(); }, 300);
        _aiTimers.push(t);
      } else if (g === 'roulette') {
        const t = setTimeout(() => { if (practiceMode) startRussianRoulette(); }, 300);
        _aiTimers.push(t);
      } else {
        showScreen('practiceSelect');
      }
      return;
    }
    if (_originalCloseResult) _originalCloseResult();
  };

  _originalCloseSutdaResult = window.closeSutdaResult;
  window.closeSutdaResult = function() {
    document.getElementById('sutdaResultOverlay').classList.remove('active');
    if (practiceMode) {
      const t = setTimeout(() => { if (practiceMode) startSutda(); }, 500);
      _aiTimers.push(t);
      return;
    }
    if (_originalCloseSutdaResult) _originalCloseSutdaResult();
  };

  _originalMfCloseResult = window.mfCloseResult;
  window.mfCloseResult = function() {
    if (practiceMode) {
      document.getElementById('mfResultOverlay').style.display = 'none';
      clearInterval(mfTimer);
      mfState = null;
      mfView = null;
      showScreen('practiceSelect');
      return;
    }
    if (_originalMfCloseResult) _originalMfCloseResult();
  };

  _originalCloseYahtzeeGame = window.closeYahtzeeGame;
  window.closeYahtzeeGame = function() {
    document.getElementById('yahtzeeGameOver').style.display = 'none';
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseYahtzeeGame) _originalCloseYahtzeeGame();
  };
}

function restoreNetworking() {
  if (_originalBroadcast) { window.broadcast = _originalBroadcast; _originalBroadcast = null; }
  if (_originalSendTo) { window.sendTo = _originalSendTo; _originalSendTo = null; }
  if (_originalCloseResult) { window.closeResult = _originalCloseResult; _originalCloseResult = null; }
  if (_originalCloseSutdaResult) { window.closeSutdaResult = _originalCloseSutdaResult; _originalCloseSutdaResult = null; }
  if (_originalMfCloseResult) { window.mfCloseResult = _originalMfCloseResult; _originalMfCloseResult = null; }
  if (_originalCloseYahtzeeGame) { window.closeYahtzeeGame = _originalCloseYahtzeeGame; _originalCloseYahtzeeGame = null; }
}

function cleanupAI() {
  if (_aiTimer) { clearTimeout(_aiTimer); _aiTimer = null; }
  _aiTimers.forEach(t => clearTimeout(t));
  _aiTimers = [];
  _qdTimers.forEach(t => clearTimeout(t));
  _qdTimers = [];
  _udContinuePending = false;
  _rrPullScheduled = false;
  _truthNextScheduled = false;
  // Clear any game-specific timers
  if (typeof mfTimer !== 'undefined' && mfTimer) clearInterval(mfTimer);
  if (typeof racingLoop !== 'undefined' && racingLoop) { clearInterval(racingLoop); racingLoop = null; }
  if (typeof qdState !== 'undefined' && qdState) {
    if (qdState.countdownTimeout) clearTimeout(qdState.countdownTimeout);
    if (qdState.fireTimeout) clearTimeout(qdState.fireTimeout);
  }
}

// ========== BROADCAST HANDLER ==========
// Called when game code broadcasts state updates
// We check if AI needs to act

function handleBroadcastForAI(data) {
  const game = state.selectedGame;

  // Special: UpDown penalty for AI player — auto continue
  // Skip for King penalty (processKingPenalty has its own turn advance setTimeout)
  if (data.type === 'ud-penalty' && data.playerId && data.playerId.startsWith('ai-')) {
    if (udState && udState.phase === 'special_k') return;
    // Debounce: only one continueUpDown per penalty event (BK reject can target multiple)
    if (!_udContinuePending) {
      _udContinuePending = true;
      const t = setTimeout(() => {
        _udContinuePending = false;
        if (!practiceMode || !udState) return;
        // Guard: if turn already advanced (e.g. human also accepted penalty), skip
        if (udState.phase === 'playing') return;
        if (state.isHost && typeof continueUpDown === 'function') continueUpDown();
      }, 800);
      _aiTimers.push(t);
    }
    return;
  }

  // Special: QuickDraw fire phase — AI responds immediately with individual timers
  if (game === 'quickdraw' && data.type === 'qd-state' && data.phase === 'fire') {
    scheduleQDAIResponses();
    return;
  }

  // General AI scheduling
  scheduleAIAction();
}

// ========== AI MESSAGE HANDLER ==========
// Called when game code sends a message to an AI peer via sendTo()

function handleAIMessage(peerId, data) {
  if (!data) return;
  let msg;
  try {
    msg = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    return;
  }

  // UpDown: Black Knight request to AI — special handling
  if (msg.type === 'ud-bk-request') {
    const accept = Math.random() < 0.5;
    const t = setTimeout(() => {
      if (!practiceMode) return;
      if (accept) {
        resolveBKAccept(msg.requesterId, peerId, msg.penaltyText);
      } else {
        resolveBKReject(msg.requesterId, peerId, msg.penaltyText);
      }
    }, 600 + Math.random() * 800);
    _aiTimers.push(t);
    return;
  }

  // All other messages: schedule AI action
  scheduleAIAction();
}

// ========== AI SCHEDULING ==========

function scheduleAIAction() {
  if (!practiceMode) return;
  if (_aiTimer) clearTimeout(_aiTimer);
  _aiTimer = setTimeout(() => {
    _aiTimer = null;
    if (!practiceMode) return;
    executeAIAction();
  }, 600 + Math.random() * 1200);
}

function executeAIAction() {
  if (!practiceMode) return;
  const game = state.selectedGame;

  switch (game) {
    case 'poker': aiPoker(); break;
    case 'sutda': aiSutda(); break;
    case 'updown': aiUpDown(); break;
    case 'quickdraw': /* handled by scheduleQDAIResponses */ break;
    case 'roulette': aiRoulette(); break;
    case 'ecard': aiECard(); break;
    case 'yahtzee': aiYahtzee(); break;
    case 'truth': aiTruth(); break;
    case 'mafia': aiMafia(); break;
    // lottery and racing: no AI needed
  }
}

// ========== POKER AI ==========

function aiPoker() {
  const ps = state.poker;
  if (!ps || ps.phase === 'showdown') return;

  const currentPlayer = ps.players[ps.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;
  if (currentPlayer.folded || currentPlayer.allIn) return;

  const toCall = ps.currentBet - currentPlayer.bet;
  const rand = Math.random();

  if (rand < 0.08) {
    // Fold (8%)
    if (toCall > 0) {
      processPokerAction(currentPlayer.id, 'fold');
    } else {
      processPokerAction(currentPlayer.id, 'check');
    }
  } else if (rand < 0.75) {
    // Call/Check (67%)
    if (toCall > 0) {
      processPokerAction(currentPlayer.id, 'call');
    } else {
      processPokerAction(currentPlayer.id, 'check');
    }
  } else if (rand < 0.93) {
    // Raise (18%)
    const raiseAmt = ps.currentBet + ps.minRaise + Math.floor(Math.random() * 3) * ps.bb;
    const totalNeeded = raiseAmt - currentPlayer.bet;
    if (totalNeeded > currentPlayer.chips) {
      // Can't afford raise — go all-in instead
      processPokerAction(currentPlayer.id, 'allin');
    } else {
      processPokerAction(currentPlayer.id, 'raise', raiseAmt);
    }
  } else {
    // All-in (7%)
    processPokerAction(currentPlayer.id, 'allin');
  }
}

// ========== SUTDA AI ==========

function aiSutda() {
  if (!sutdaHost || sutdaHost.phase === 'showdown') return;

  // Seryuk choice
  if (sutdaHost.phase === 'seryuk_choice') {
    const seryukP = sutdaHost.players.find(p => p.id === sutdaHost.seryukPlayerId);
    if (seryukP && seryukP.id.startsWith('ai-') && seryukP.seryukChoice === null) {
      const choice = sutdaHost.seryukCanChaos && Math.random() < 0.5 ? 'chaos' : 'push';
      processSutdaSeryuk(seryukP.id, choice);
    }
    return;
  }

  if (sutdaHost.phase !== 'betting') return;

  const currentPlayer = sutdaHost.players[sutdaHost.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;
  if (currentPlayer.died || currentPlayer.allIn) return;

  // AI decision based on hand rank
  const rank = currentPlayer.rank;
  const rankScore = rank ? rank.rank : 0;
  const rand = Math.random();

  if (rankScore >= 80) {
    // Strong hand (8끗 이상, 땡 등)
    if (rand < 0.4) {
      processSutdaAction(currentPlayer.id, 'raise', 50000);
    } else if (rand < 0.7) {
      processSutdaAction(currentPlayer.id, 'raise', 100000);
    } else {
      processSutdaAction(currentPlayer.id, 'allin');
    }
  } else if (rankScore >= 50) {
    // Medium hand
    if (rand < 0.6) {
      processSutdaAction(currentPlayer.id, 'call');
    } else if (rand < 0.85) {
      processSutdaAction(currentPlayer.id, 'raise', 10000);
    } else {
      processSutdaAction(currentPlayer.id, 'die');
    }
  } else {
    // Weak hand
    if (rand < 0.3) {
      processSutdaAction(currentPlayer.id, 'die');
    } else if (rand < 0.85) {
      processSutdaAction(currentPlayer.id, 'call');
    } else {
      processSutdaAction(currentPlayer.id, 'raise', 10000);
    }
  }
}

// ========== UPDOWN AI ==========

function aiUpDown() {
  if (!udState) return;

  // Handle special phases for AI
  if (udState.phase === 'special_jq') {
    const currentPlayer = udState.players[udState.turnIdx];
    if (currentPlayer && currentPlayer.id.startsWith('ai-')) {
      // AI picks a random other player as black knight target
      const others = udState.players.filter(p => p.id !== currentPlayer.id);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        processBlackKnight(currentPlayer.id, target.id);
      }
    }
    return;
  }

  if (udState.phase === 'special_k') {
    const currentPlayer = udState.players[udState.turnIdx];
    if (currentPlayer && currentPlayer.id.startsWith('ai-')) {
      // AI picks 1-2 random targets for king penalty
      const others = udState.players.filter(p => p.id !== currentPlayer.id);
      const count = Math.min(1 + Math.floor(Math.random() * 2), others.length);
      const targets = [];
      const shuffled = [...others].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) targets.push(shuffled[i].id);
      processKingPenalty(currentPlayer.id, targets);
    }
    return;
  }

  if (udState.phase !== 'playing') return;

  const currentPlayer = udState.players[udState.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;

  // AI decision: check card value
  const cardVal = getCardValue(udState.currentCard);
  let choice;

  if (cardVal <= 6) {
    choice = 'up';
  } else if (cardVal >= 8) {
    choice = 'down';
  } else {
    // 7: coin flip
    choice = Math.random() < 0.5 ? 'up' : 'down';
  }

  processUpDownChoice(currentPlayer.id, choice);
}

// ========== QUICKDRAW AI ==========

function scheduleQDAIResponses() {
  // Clear previous QD timers only (not other game timers)
  _qdTimers.forEach(t => clearTimeout(t));
  _qdTimers = [];

  if (!qdState) return;

  // Each AI responds independently with random reaction time
  state.players.forEach(p => {
    if (!p.id.startsWith('ai-')) return;
    if (qdState.results[p.id]) return; // already responded

    const reactionTime = 300 + Math.random() * 600; // 300-900ms
    const timer = setTimeout(() => {
      if (!practiceMode) return;
      if (!qdState || qdState.phase !== 'fire') return;
      if (qdState.results[p.id]) return;

      processQDAction({
        type: 'qd-action',
        playerId: p.id,
        name: p.name,
        avatar: p.avatar,
        cheated: false,
        time: reactionTime,
      });
    }, reactionTime);

    _qdTimers.push(timer);
  });
}

// ========== ROULETTE AI ==========

function aiRoulette() {
  if (!rrState || rrState.phase === 'setup' || rrState.phase === 'gameover') return;

  const currentPlayer = rrState.players[rrState.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;

  if (rrState.phase === 'playing') {
    spinCylinder();
  } else if (rrState.phase === 'spinning') {
    // Prevent double-scheduling (spinCylinder broadcasts twice: immediate + 3s)
    if (_rrPullScheduled) return;
    _rrPullScheduled = true;
    const aiId = currentPlayer.id;
    const t = setTimeout(() => {
      _rrPullScheduled = false;
      if (!practiceMode || !rrState) return;
      if (rrState.phase !== 'spinning') return;
      const cp = rrState.players[rrState.turnIdx];
      if (!cp || cp.id !== aiId) return;
      pullTrigger();
    }, 3200); // wait for spin animation (3s) + small buffer
    _aiTimers.push(t);
  }
}

// ========== E-CARD AI ==========

function aiECard() {
  const ec = state.ecard;
  if (!ec) return;

  // Find the AI player
  const aiPlayer = ec.player1.id.startsWith('ai-') ? ec.player1 :
                    (ec.player2.id.startsWith('ai-') ? ec.player2 : null);
  if (!aiPlayer) return;

  if (ec.phase === 'betting') {
    if (aiPlayer.role === 'slave' && !ec.betProposed) {
      // AI proposes a bet (100-500)
      const bet = 100 + Math.floor(Math.random() * 5) * 100;
      processECardBet(aiPlayer.id, bet);
    } else if (aiPlayer.role === 'emperor' && ec.betProposed && !ec.betAccepted) {
      // AI accepts 80% of the time
      if (Math.random() < 0.8) {
        processECardBetResponse(aiPlayer.id, true);
      } else {
        processECardBetResponse(aiPlayer.id, false);
      }
    }
  } else if (ec.phase === 'slave-play' && aiPlayer.role === 'slave') {
    if (!aiPlayer.cards || aiPlayer.cards.length === 0) return;
    const cardIdx = Math.floor(Math.random() * aiPlayer.cards.length);
    const cardType = aiPlayer.cards[cardIdx];
    processECardPlay(aiPlayer.id, cardType, cardIdx);
  } else if (ec.phase === 'emperor-play' && aiPlayer.role === 'emperor') {
    if (!aiPlayer.cards || aiPlayer.cards.length === 0) return;
    const cardIdx = Math.floor(Math.random() * aiPlayer.cards.length);
    const cardType = aiPlayer.cards[cardIdx];
    processECardPlay(aiPlayer.id, cardType, cardIdx);
  }
}

// ========== YAHTZEE AI ==========

function aiYahtzee() {
  if (!yahState || yahState.phase === 'gameover') return;

  const currentPlayer = yahState.players[yahState.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;

  if (yahState.phase === 'rolling') {
    if (yahState.rollsLeft === 3) {
      // First roll — must roll
      yahRollDice();
      broadcastYahtzeeState(); // triggers scheduleAIAction via broadcast handler
      return;
    }

    if (yahState.rollsLeft > 0 && Math.random() < 0.5) {
      // Maybe hold high dice before re-rolling
      yahState.dice.forEach((val, idx) => {
        if (val >= 4 && !yahState.held[idx] && Math.random() < 0.6) {
          yahState.held[idx] = true;
        }
      });
      yahRollDice();
      broadcastYahtzeeState(); // triggers scheduleAIAction via broadcast handler
      return;
    }

    // Done rolling — select best category
    aiYahtzeeSelectCategory(currentPlayer);
  } else if (yahState.phase === 'scoring') {
    // Use shared scoring function from games.js (no more logic duplication)
    if (yahState.selectedCategory) {
      yahConfirmScore();
    }
  }
}

function aiYahtzeeSelectCategory(player) {
  // Find best scoring category
  const possible = calcPossibleScores(yahState.dice);
  let bestCat = null;
  let bestScore = -1;

  YAHTZEE_CATEGORIES.forEach(cat => {
    if (player.scores[cat] === null && possible[cat] > bestScore) {
      bestScore = possible[cat];
      bestCat = cat;
    }
  });

  // If no positive score, pick first available (sacrifice)
  if (!bestCat || bestScore === 0) {
    for (const cat of YAHTZEE_CATEGORIES) {
      if (player.scores[cat] === null) {
        bestCat = cat;
        break;
      }
    }
  }

  if (bestCat) {
    yahState.selectedCategory = bestCat;
    yahState.phase = 'scoring';
    broadcastYahtzeeState(); // triggers scheduleAIAction via broadcast handler
  }
}

// ========== TRUTH GAME AI ==========

function aiTruth() {
  if (!truthState) return;

  const questionerId = truthState.playerOrder[truthState.questionerIdx];

  if (truthState.phase === 'question') {
    // If AI is the questioner, submit a random question
    if (questionerId.startsWith('ai-')) {
      const questions = [
        '여기서 가장 잘생긴 사람은?',
        '오늘 아침을 먹은 사람?',
        '지금 졸린 사람?',
        '최근에 운동한 사람?',
        '게임을 좋아하는 사람?',
        '고양이를 좋아하는 사람?',
        '매운 음식을 좋아하는 사람?',
        '아이돌 팬인 사람?',
        '최근에 영화를 본 사람?',
        '커피를 좋아하는 사람?',
      ];
      const q = questions[Math.floor(Math.random() * questions.length)];
      processTruthQuestion(questionerId, q);
    }
  } else if (truthState.phase === 'voting') {
    // AI players that haven't voted yet
    state.players.forEach(p => {
      if (!p.id.startsWith('ai-')) return;
      if (truthState.votedSet.has(p.id)) return;
      // Random vote
      const vote = Math.random() < 0.6 ? 'O' : 'X';
      processTruthVote(p.id, vote);
    });
  } else if (truthState.phase === 'result') {
    // Auto-advance after delay — prevent double-fire with one-shot flag
    if (_truthNextScheduled) return;
    _truthNextScheduled = true;
    const t = setTimeout(() => {
      _truthNextScheduled = false;
      if (!practiceMode) return;
      if (truthState && truthState.phase === 'result') {
        processTruthNext();
      }
    }, 3000);
    _aiTimers.push(t);
  }
}

// ========== MAFIA AI ==========

function aiMafia() {
  if (!mfState) return;

  if (mfState.phase === 'night') {
    aiMafiaNight();
  } else if (mfState.phase === 'day-vote') {
    aiMafiaVote();
  }
  // Other phases are timer-driven, no AI action needed
}

function aiMafiaNight() {
  const ms = mfState;
  const alivePlayers = ms.players.filter(p => p.alive);
  const isFirstNight = ms.round === 1;
  const sixRestrict = ms.sixPlayerFirstNight && isFirstNight;

  ms.players.forEach(p => {
    if (!p.id.startsWith('ai-') || !p.alive) return;
    if (ms.nightActions[p.id]) return; // already acted

    const role = p.activeRole;
    let action = null;
    let targetId = null;

    // Get valid targets (alive players excluding self)
    const targets = alivePlayers.filter(t => t.id !== p.id);
    if (targets.length === 0) return;

    const randomTarget = () => targets[Math.floor(Math.random() * targets.length)].id;

    if (role === 'mafia' && !sixRestrict) {
      // Kill a random non-mafia target
      const nonMafia = targets.filter(t => t.activeRole !== 'mafia');
      if (nonMafia.length > 0) {
        targetId = nonMafia[Math.floor(Math.random() * nonMafia.length)].id;
        action = p.snipesLeft > 0 && Math.random() < 0.2 ? 'snipe' : 'kill';
      }
    } else if (role === 'spy') {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'police' && !sixRestrict) {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'doctor') {
      // Heal a random alive player (can include self)
      targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
      action = 'heal';
    } else if (role === 'reporter' && !sixRestrict) {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'undertaker') {
      const deadPlayers = ms.players.filter(t => !t.alive);
      if (deadPlayers.length > 0) {
        targetId = deadPlayers[Math.floor(Math.random() * deadPlayers.length)].id;
        action = 'investigate';
      }
    } else if (role === 'detective' && !sixRestrict) {
      targetId = randomTarget();
      action = 'investigate';
    }

    if (action && targetId) {
      mfProcessAction(p.id, {
        action: 'night-action',
        nightAction: action,
        targetId: targetId,
      });
    }
  });
}

function aiMafiaVote() {
  const ms = mfState;
  const alivePlayers = ms.players.filter(p => p.alive);

  alivePlayers.forEach(p => {
    if (!p.id.startsWith('ai-')) return;
    if (ms.votes[p.id]) return; // already voted

    // Random vote: either a random alive player or 'skip'
    if (Math.random() < 0.2) {
      mfProcessAction(p.id, { action: 'vote', targetId: 'skip' });
    } else {
      const others = alivePlayers.filter(t => t.id !== p.id);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        mfProcessAction(p.id, { action: 'vote', targetId: target.id });
      }
    }
  });
}

// ========== RACING AI ==========
// Racing is solo gameplay — no AI needed

// ========== LOTTERY AI ==========
// Lottery is solo (player picks cells) — no AI needed

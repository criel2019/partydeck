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
let _originalCloseFortressGame = null;
let _originalCloseBombShotGame = null;
let _aiTimer = null;
let _aiTimers = []; // tracked timeouts for cleanup on exit
let _qdTimers = []; // QuickDraw-specific timers (separate to avoid clearing others)
let _udContinuePending = false; // debounce for UpDown continueUpDown
let _rrPullScheduled = false; // one-shot flag for roulette pullTrigger
let _truthNextScheduled = false; // one-shot flag for truth processTruthNext
let _fortAIKey = ''; // guard: prevent fortress AI re-entry during same turn
let _bsSpinScheduled = false; // guard: prevent duplicate roulette spin
let _bsPracticeReady = false; // flag: bombshot setup modal shown in practice mode
let _originalCloseStairsGame = null;

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
  fortress: 2,
  lottery: 0,
  bombshot: 3,
  stairs: 2,
  tetris: 0,
  jewel: 0,
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
  if (typeof bsState !== 'undefined') bsState = null;
  if (typeof stCleanup === 'function') stCleanup();
  if (typeof tetCleanup === 'function') tetCleanup();
  if (typeof destroyBombShotThree === 'function') destroyBombShotThree();
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

  // Bombshot: show setup modal so user can configure bartender + penalties
  if (gameName === 'bombshot') {
    _bsPracticeReady = true;
    bsOpenSetup();
    return; // startGame() will be called from bsConfirmSetup()
  }

  // Mafia: auto-setup for practice mode (skip host config screen)
  if (gameName === 'mafia') {
    mfSetupDone = true;
  }

  // Tetris: solo game — skip startGame() validation, go directly
  if (gameName === 'tetris') {
    showScreen('tetrisGame');
    tetShowModeSelect();
    return;
  }

  // Jewel: solo game — skip startGame() validation, go directly
  if (gameName === 'jewel') {
    showScreen('jewelGame');
    jwlShowModeSelect();
    return;
  }

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

  _originalCloseFortressGame = window.closeFortressGame;
  window.closeFortressGame = function() {
    document.getElementById('fortGameOver').style.display = 'none';
    if (fortAnimId) { cancelAnimationFrame(fortAnimId); fortAnimId = null; }
    fortState = null;
    window._fortView = null;
    fortCtx = null;
    fortCanvas = null;
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseFortressGame) _originalCloseFortressGame();
  };

  _originalCloseStairsGame = window.closeStairsGame;
  window.closeStairsGame = function() {
    if (typeof stCleanup === 'function') stCleanup();
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseStairsGame) _originalCloseStairsGame();
  };

  _originalCloseBombShotGame = window.closeBombShotGame;
  window.closeBombShotGame = function() {
    _bsTimers.forEach(t => clearTimeout(t));
    _bsTimers = [];
    _bsSelected = [];
    _bsView = null;
    bsState = null;
    if (typeof destroyBombShotThree === 'function') destroyBombShotThree();
    var goEl = document.getElementById('bsGameOver');
    if (goEl) goEl.style.display = 'none';
    var revEl = document.getElementById('bsReveal');
    if (revEl) revEl.style.display = 'none';
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseBombShotGame) _originalCloseBombShotGame();
  };
}

function restoreNetworking() {
  if (_originalBroadcast) { window.broadcast = _originalBroadcast; _originalBroadcast = null; }
  if (_originalSendTo) { window.sendTo = _originalSendTo; _originalSendTo = null; }
  if (_originalCloseResult) { window.closeResult = _originalCloseResult; _originalCloseResult = null; }
  if (_originalCloseSutdaResult) { window.closeSutdaResult = _originalCloseSutdaResult; _originalCloseSutdaResult = null; }
  if (_originalMfCloseResult) { window.mfCloseResult = _originalMfCloseResult; _originalMfCloseResult = null; }
  if (_originalCloseYahtzeeGame) { window.closeYahtzeeGame = _originalCloseYahtzeeGame; _originalCloseYahtzeeGame = null; }
  if (_originalCloseFortressGame) { window.closeFortressGame = _originalCloseFortressGame; _originalCloseFortressGame = null; }
  if (_originalCloseStairsGame) { window.closeStairsGame = _originalCloseStairsGame; _originalCloseStairsGame = null; }
  if (_originalCloseBombShotGame) { window.closeBombShotGame = _originalCloseBombShotGame; _originalCloseBombShotGame = null; }
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
  _bsPracticeReady = false;
  // Clear any game-specific timers
  if (typeof mfTimer !== 'undefined' && mfTimer) clearInterval(mfTimer);
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

  // Special: BombShot — AI auto-spin when it's the roulette target
  if (game === 'bombshot' && data.type === 'bs-anim' && data.anim === 'roulette-setup' && bsState) {
    if (bsState.rouletteTarget && bsState.rouletteTarget.id.startsWith('ai-')) {
      var aiSpinId = bsState.rouletteTarget.id;
      var tSpin = setTimeout(function() {
        if (!practiceMode || !bsState || bsState.phase !== 'roulette-setup') return;
        if (!bsState.rouletteTarget || bsState.rouletteTarget.id !== aiSpinId) return;
        processBSSpin(aiSpinId);
      }, 1000 + Math.random() * 1000);
      _aiTimers.push(tSpin);
    }
  }

  // Special: BombShot — non-turn AI players may call liar after human submits
  if (game === 'bombshot' && data.type === 'bs-anim' && data.anim === 'submit' && bsState && bsState.lastSubmission) {
    const submitterId = bsState.lastSubmission.playerId;
    // Each AI (except submitter) has a chance to call liar
    bsState.players.forEach(p => {
      if (!p.id.startsWith('ai-') || p.id === submitterId) return;
      const chance = bsState.lastSubmission.count === 3 ? 0.2 : bsState.lastSubmission.count === 2 ? 0.1 : 0.03;
      if (Math.random() < chance) {
        const t = setTimeout(() => {
          if (!practiceMode || !bsState || bsState.phase !== 'playing') return;
          processBSLiar(p.id);
        }, 500 + Math.random() * 1500);
        _aiTimers.push(t);
      }
    });
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

  // Mafia timer ticks: ignore to prevent constant AI action timer resets
  if (msg.type === 'mf-timer') return;

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
    case 'fortress': aiFortress(); break;
    case 'bombshot': aiBombShot(); break;
    case 'stairs': aiStairs(); break;
    // lottery: no AI needed
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
    // Prefer non-dummy cards; use dummy only when nothing else remains
    const nonDummy = [];
    aiPlayer.cards.forEach((c, i) => { if (c !== 'dummy') nonDummy.push(i); });
    const pool = nonDummy.length > 0 ? nonDummy : [aiPlayer.cards.indexOf('dummy')];
    const cardIdx = pool[Math.floor(Math.random() * pool.length)];
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
  // day-discuss: AI does NOT vote early (respects human discussion time)
}

function aiMafiaNight() {
  const ms = mfState;
  const alivePlayers = ms.players.filter(p => p.alive);
  let advanceScheduled = false;

  for (let i = 0; i < ms.players.length; i++) {
    const p = ms.players[i];
    if (advanceScheduled) break; // stop after phase advance is scheduled
    if (!p.id.startsWith('ai-') || !p.alive) continue;
    if (ms.nightActions[p.id]) continue; // already acted

    const role = p.activeRole;
    let action = null;
    let targetId = null;

    // Get valid targets (alive players excluding self)
    const targets = alivePlayers.filter(t => t.id !== p.id);
    if (targets.length === 0) continue;

    const randomTarget = () => targets[Math.floor(Math.random() * targets.length)].id;

    if (role === 'mafia') {
      // Kill a random non-mafia target
      const nonMafia = targets.filter(t => t.activeRole !== 'mafia');
      if (nonMafia.length > 0) {
        targetId = nonMafia[Math.floor(Math.random() * nonMafia.length)].id;
        action = p.snipesLeft > 0 && Math.random() < 0.2 ? 'snipe' : 'kill';
      }
    } else if (role === 'spy') {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'police') {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'doctor') {
      // Heal a random alive player (can include self)
      targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
      action = 'heal';
    } else if (role === 'reporter') {
      targetId = randomTarget();
      action = 'investigate';
    } else if (role === 'undertaker') {
      const deadPlayers = ms.players.filter(t => !t.alive);
      if (deadPlayers.length > 0) {
        targetId = deadPlayers[Math.floor(Math.random() * deadPlayers.length)].id;
        action = 'investigate';
      }
    } else if (role === 'detective') {
      targetId = randomTarget();
      action = 'investigate';
    }

    if (action && targetId) {
      mfProcessAction(p.id, {
        action: 'night-action',
        nightAction: action,
        targetId: targetId,
      });
      // Check if all actions are done — if so, stop to avoid double mfAdvancePhase
      if (mfAllNightActionsDone()) advanceScheduled = true;
    }
  }
}

function aiMafiaVote() {
  const ms = mfState;
  const alivePlayers = ms.players.filter(p => p.alive);

  alivePlayers.forEach(p => {
    if (!p.id.startsWith('ai-')) return;
    if (ms.votes[p.id]) return; // already voted

    // 15% chance to vote-skip instead of voting
    if (Math.random() < 0.15) {
      mfProcessAction(p.id, { action: 'vote-skip' });
    } else {
      const others = alivePlayers.filter(t => t.id !== p.id);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        mfProcessAction(p.id, { action: 'vote', targetId: target.id });
      }
    }
  });
}

// ========== FORTRESS AI ==========

function aiFortress() {
  if (!fortState || fortState.phase !== 'aiming') return;

  const current = fortState.players[fortState.turnIdx];
  if (!current || !current.id.startsWith('ai-')) return;
  if (!current.alive) return;

  // Guard: AI movement broadcasts re-trigger scheduleAIAction → aiFortress
  // Prevent duplicate move/fire timers for the same turn
  const turnKey = fortState.round + '-' + fortState.turnIdx;
  if (_fortAIKey === turnKey) return;
  _fortAIKey = turnKey;

  // Find closest alive enemy tank
  const enemies = fortState.players.filter(p => p.alive && p.id !== current.id);
  if (enemies.length === 0) return;

  let target = enemies[0];
  let minDist = Math.abs(target.x - current.x);
  enemies.forEach(e => {
    const d = Math.abs(e.x - current.x);
    if (d < minDist) { minDist = d; target = e; }
  });

  // AI sometimes moves before firing (30% chance, or if very close to edge)
  const shouldMove = Math.random() < 0.3 || current.x < 40 || current.x > FORT_CANVAS_W - 40;
  let moveSteps = 0;

  if (shouldMove && current.moveFuel > 0) {
    // Decide direction: move away from edge, or towards better position
    let moveDir = 0;
    if (current.x < 40) moveDir = 1;
    else if (current.x > FORT_CANVAS_W - 40) moveDir = -1;
    else moveDir = Math.random() > 0.5 ? 1 : -1;

    moveSteps = Math.min(
      Math.floor(Math.random() * 5) + 1,
      Math.floor(current.moveFuel / FORT_MOVE_SPEED)
    );

    // Execute moves with delays
    for (let i = 0; i < moveSteps; i++) {
      const mt = setTimeout(() => {
        if (!fortState || fortState.phase !== 'aiming') return;
        const cp = fortState.players[fortState.turnIdx];
        if (!cp || cp.id !== current.id) return;
        handleFortMove(state.myId, { type: 'fort-move', dir: moveDir });
      }, 300 + i * 80);
      _aiTimers.push(mt);
    }
  }

  // Calculate angle: right = ~45, left = ~135
  const dx = target.x - current.x;
  let baseAngle;
  if (dx > 0) {
    baseAngle = 40 + Math.random() * 20; // 40-60
  } else {
    baseAngle = 120 + Math.random() * 20; // 120-140
  }

  // Power based on distance + wind compensation + randomness
  const dist = Math.abs(dx);
  let basePower = Math.min(95, Math.max(20, dist * 0.12 + 30));
  // Wind compensation
  const windEffect = fortState.wind * 2;
  if ((dx > 0 && fortState.wind < 0) || (dx < 0 && fortState.wind > 0)) {
    basePower += Math.abs(windEffect);
  } else {
    basePower -= Math.abs(windEffect) * 0.5;
  }
  // Add randomness
  basePower += (Math.random() - 0.5) * 15;
  basePower = Math.max(15, Math.min(100, Math.round(basePower)));

  const angle = Math.round(baseAngle);
  const power = Math.round(basePower);

  // Delay then fire (wait for moves to complete)
  const fireDelay = 800 + Math.random() * 600 + moveSteps * 100;
  const t = setTimeout(() => {
    if (!practiceMode || !fortState) return;
    if (fortState.phase !== 'aiming') return;
    const cp = fortState.players[fortState.turnIdx];
    if (!cp || cp.id !== current.id) return;

    handleFortFire(state.myId, {
      type: 'fort-fire',
      angle: angle,
      power: power,
    });
  }, fireDelay);
  _aiTimers.push(t);
}

// ========== BOMB SHOT AI ==========

function aiBombShot() {
  if (!bsState) return;

  // Handle roulette spin when AI is the penalty target
  if (bsState.phase === 'roulette-setup' && bsState.rouletteTarget) {
    if (_bsSpinScheduled) return;
    const targetId = bsState.rouletteTarget.id;
    if (targetId.startsWith('ai-')) {
      _bsSpinScheduled = true;
      const t = setTimeout(() => {
        _bsSpinScheduled = false;
        if (!practiceMode || !bsState || bsState.phase !== 'roulette-setup') return;
        processBSSpin(targetId);
      }, 1000 + Math.random() * 1000);
      _aiTimers.push(t);
    }
    return;
  }

  if (bsState.phase !== 'playing') return;

  const currentPlayer = bsState.players[bsState.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;
  // AI: decide whether to call liar first (on previous submission)
  if (bsState.lastSubmission && bsState.lastSubmission.playerId !== currentPlayer.id) {
    // Call liar based on last submission size (more cards = more suspicious)
    const liarChance = bsState.lastSubmission.count === 3 ? 0.3 :
                       bsState.lastSubmission.count === 2 ? 0.15 : 0.05;
    if (Math.random() < liarChance) {
      const t = setTimeout(() => {
        if (!practiceMode || !bsState || bsState.phase !== 'playing') return;
        processBSLiar(currentPlayer.id);
      }, 400 + Math.random() * 600);
      _aiTimers.push(t);
      return;
    }
  }

  // AI: submit cards
  const hand = currentPlayer.cards;
  if (hand.length === 0) return;

  const designated = bsState.designatedDrink;

  // Find valid cards (designated or water)
  const validIndices = [];
  const invalidIndices = [];
  hand.forEach((card, i) => {
    if (card === designated || card === 'water') validIndices.push(i);
    else invalidIndices.push(i);
  });

  let submitIndices = [];
  const submitCount = Math.min(hand.length, 1 + Math.floor(Math.random() * 3)); // 1~3

  if (validIndices.length >= submitCount && Math.random() < 0.7) {
    // Play honestly (70% if possible)
    for (let i = 0; i < submitCount && i < validIndices.length; i++) {
      submitIndices.push(validIndices[i]);
    }
  } else {
    // Bluff: mix valid and invalid, or all invalid
    const allIdx = [];
    for (let i = 0; i < hand.length; i++) allIdx.push(i);
    // Shuffle
    for (let i = allIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = allIdx[i]; allIdx[i] = allIdx[j]; allIdx[j] = tmp;
    }
    submitIndices = allIdx.slice(0, submitCount);
  }

  if (submitIndices.length === 0) submitIndices = [0];

  const t = setTimeout(() => {
    if (!practiceMode || !bsState || bsState.phase !== 'playing') return;
    const cp = bsState.players[bsState.turnIdx];
    if (!cp || cp.id !== currentPlayer.id) return;
    processBSSubmit(currentPlayer.id, submitIndices);
  }, 800 + Math.random() * 1000);
  _aiTimers.push(t);
}

// Also: AI liar calls when it's NOT their turn (react to broadcasts)
// This is handled in handleBroadcastForAI via general scheduleAIAction

// ========== STAIRS AI ==========

function aiStairs() {
  if (!stMulti || stMulti.phase === 'results') return;

  // Each AI player that hasn't finished yet should "die" after a random delay
  stMulti.players.forEach(p => {
    if (!p.id.startsWith('ai-') || p.finished || p._aiScheduled) return;

    // Mark as "scheduled" to avoid re-scheduling
    p._aiScheduled = true;

    // AI generates a random score (100-500 range, roughly matching human play)
    const aiScore = 50 + Math.floor(Math.random() * 350);
    const aiStep = aiScore; // roughly 1 point per step

    const delay = 3000 + Math.random() * 8000; // 3-11 seconds
    const t = setTimeout(() => {
      if (!practiceMode || !stMulti) return;
      processStairsDead({
        type: 'stairs-dead',
        playerId: p.id,
        score: aiScore,
        step: aiStep,
      });
    }, delay);
    _aiTimers.push(t);
  });
}

// ========== LOTTERY AI ==========
// Lottery is solo (player picks cells) — no AI needed

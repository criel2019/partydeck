// =============================================
// ===== AI PRACTICE MODE ======================
// =============================================

let practiceMode = false;

// Returns true when AI players should be active (practice mode OR lobby CPU mode)
function isAIActive() {
  return practiceMode || (state && state.players && state.players.some(p => p.id.startsWith('ai-') || /^cpu\d/.test(p.id)));
}

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
let _originalCloseBJResult = null;
let _originalCloseStairsGame = null;
let _originalCloseDPGame = null;
let _originalCloseKingstagramGame = null;

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
  colorchain: 0,
  slinkystairs: 0,
  blackjack: 2,
  idol: 2,
  drinkpoker: 2,
  kingstagram: 3,
  coinstack: 1,
};

// ========== ENTRY / EXIT ==========

function startPracticeMode() {
  showScreen('practiceSelect');
}

function leavePracticeMode() {
  // PvE 정리
  if (typeof _pveMode !== 'undefined' && _pveMode && typeof pveCleanup === 'function') pveCleanup();
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
  if (typeof idolState !== 'undefined') idolState = null;
  if (typeof _idolStopCpuWatchdog === 'function') _idolStopCpuWatchdog();
  if (typeof idolResetSelectionState === 'function') idolResetSelectionState();
  if (typeof stCleanup === 'function') stCleanup();
  if (typeof tetCleanup === 'function') tetCleanup();
  if (typeof ccCleanup === 'function') ccCleanup();
  if (typeof destroyBombShotThree === 'function') destroyBombShotThree();
  if (typeof destroyIdolDiceThree === 'function') destroyIdolDiceThree();
  if (typeof dpState !== 'undefined') dpState = null;
  if (typeof closeDPCleanup === 'function') closeDPCleanup();
  if (typeof kingState !== 'undefined') kingState = null;
  if (typeof closeKingstagramCleanup === 'function') closeKingstagramCleanup();
  if (typeof closeCoinStackCleanup === 'function') closeCoinStackCleanup();
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
  let _practiceTama = null;
  try { const _r = localStorage.getItem('pd_tama_pet'); if (_r) { const _p = JSON.parse(_r); if (_p && _p.tribe) _practiceTama = { tribe: _p.tribe, level: _p.level || 1 }; } } catch(e) {}
  state.players = [
    { id: state.myId, name: state.myName, avatar: state.myAvatar, isHost: true, tama: _practiceTama }
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

  // ColorChain: solo game — skip startGame() validation, go directly
  if (gameName === 'colorchain') {
    startColorChain();
    return;
  }

  // Idol Management: go directly (handles own select screen)
  if (gameName === 'idol') {
    if (typeof idolStartPractice === 'function') idolStartPractice();
    else startIdolManagement();
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
    // PvE 모드: pveExit로 전체 정리
    if (typeof _pveMode !== 'undefined' && _pveMode) {
      if (typeof pveExit === 'function') pveExit();
      return;
    }
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

  _originalCloseBJResult = window.closeBJResult;
  window.closeBJResult = function() {
    document.getElementById('bjResultOverlay').classList.remove('active');
    if (practiceMode) {
      var betInput = document.getElementById('bjBetAmount');
      if (betInput) delete betInput.dataset.init;
      var t = setTimeout(function() { if (practiceMode) startBlackjack(); }, 300);
      _aiTimers.push(t);
      return;
    }
    if (_originalCloseBJResult) _originalCloseBJResult();
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

  _originalCloseDPGame = window.closeDPGame;
  window.closeDPGame = function() {
    if (typeof closeDPCleanup === 'function') closeDPCleanup();
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseDPGame) _originalCloseDPGame();
  };

  _originalCloseKingstagramGame = window.closeKingstagramGame;
  window.closeKingstagramGame = function() {
    if (typeof closeKingstagramCleanup === 'function') closeKingstagramCleanup();
    if (practiceMode) {
      showScreen('practiceSelect');
      return;
    }
    if (_originalCloseKingstagramGame) _originalCloseKingstagramGame();
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
  if (_originalCloseBJResult) { window.closeBJResult = _originalCloseBJResult; _originalCloseBJResult = null; }
  if (_originalCloseBombShotGame) { window.closeBombShotGame = _originalCloseBombShotGame; _originalCloseBombShotGame = null; }
  if (_originalCloseDPGame) { window.closeDPGame = _originalCloseDPGame; _originalCloseDPGame = null; }
  if (_originalCloseKingstagramGame) { window.closeKingstagramGame = _originalCloseKingstagramGame; _originalCloseKingstagramGame = null; }
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
        if (!isAIActive() || !udState) return;
        // Guard: if turn already advanced (e.g. human also accepted penalty), skip
        if (udState.phase === 'drawing') return;
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
        if (!isAIActive() || !bsState || bsState.phase !== 'roulette-setup') return;
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
          if (!isAIActive() || !bsState || bsState.phase !== 'playing') return;
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
      if (!isAIActive()) return;
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
  if (!isAIActive()) return;
  if (_aiTimer) clearTimeout(_aiTimer);
  _aiTimer = setTimeout(() => {
    _aiTimer = null;
    if (!isAIActive()) return;
    executeAIAction();
  }, 600 + Math.random() * 1200);
}

function executeAIAction() {
  if (!isAIActive()) return;
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
    case 'fortress':
      // PvE 모드: 스킬 사용 강화 AI 우선
      if (typeof aiFortressPvE === 'function' && typeof _pveMode !== 'undefined' && _pveMode) {
        aiFortressPvE();
      } else {
        aiFortress();
      }
      break;
    case 'bombshot': aiBombShot(); break;
    case 'blackjack': aiBlackjack(); break;
    case 'stairs': aiStairs(); break;
    case 'idol': aiIdol(); break;
    case 'drinkpoker': aiDrinkPoker(); break;
    case 'kingstagram': aiKingstagram(); break;
    case 'coinstack': aiCoinStack(); break;
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

  // Phase: guessing -> AI picks UP or DOWN
  if (udState.phase === 'guessing') {
    const currentPlayer = udState.players[udState.turnIdx];
    if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;
    const guess = Math.random() < 0.5 ? 'up' : 'down';
    processUpDownGuess(currentPlayer.id, guess);
    return;
  }
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
      if (!isAIActive()) return;
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
      if (!isAIActive() || !rrState) return;
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

  const aiPlayer = ec.player1.id.startsWith('ai-') ? ec.player1 :
    (ec.player2.id.startsWith('ai-') ? ec.player2 : null);
  if (!aiPlayer) return;

  const aiId = aiPlayer.id;
  const isEmperor = ec.emperorPlayerId === aiId;
  const isSlave = ec.slavePlayerId === aiId;

  if (ec.phase === 'betting') {
    if (ec.betSetterId !== aiId) return;
    const bet = 50 + Math.floor(Math.random() * 10) * 50;
    processECardBet(aiId, bet);
    return;
  }

  if (ec.phase === 'emperor-play' && isEmperor) {
    const cards = Array.isArray(ec.emperorCards) ? ec.emperorCards : [];
    if (!cards.length) return;
    let cardIdx = Math.floor(Math.random() * cards.length);
    if (cards.includes('citizen') && Math.random() < 0.6) {
      cardIdx = cards.indexOf('citizen');
    }
    processECardPlay(aiId, cards[cardIdx], cardIdx);
    return;
  }

  if (ec.phase === 'slave-play' && isSlave) {
    const cards = Array.isArray(ec.slaveCards) ? ec.slaveCards : [];
    if (!cards.length) return;
    let cardIdx = Math.floor(Math.random() * cards.length);
    if (ec.emperorPlayed === 'emperor') {
      const slaveIdx = cards.indexOf('slave');
      if (slaveIdx >= 0 && Math.random() < 0.75) {
        cardIdx = slaveIdx;
      }
    }
    processECardPlay(aiId, cards[cardIdx], cardIdx);
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
      if (!isAIActive()) return;
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
    if (!isAIActive() || !fortState) return;
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
        if (!isAIActive() || !bsState || bsState.phase !== 'roulette-setup') return;
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
        if (!isAIActive() || !bsState || bsState.phase !== 'playing') return;
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
    if (!isAIActive() || !bsState || bsState.phase !== 'playing') return;
    const cp = bsState.players[bsState.turnIdx];
    if (!cp || cp.id !== currentPlayer.id) return;
    processBSSubmit(currentPlayer.id, submitIndices);
  }, 800 + Math.random() * 1000);
  _aiTimers.push(t);
}

// Also: AI liar calls when it's NOT their turn (react to broadcasts)
// This is handled in handleBroadcastForAI via general scheduleAIAction

// ========== BLACKJACK AI ==========

function aiBlackjack() {
  if (!bjState) return;

  // Betting phase: AI auto-bets
  if (bjState.phase === 'betting') {
    bjState.players.forEach(function(p) {
      if (!p.id.startsWith('ai-') || p.bet > 0) return;
      var betAmt = Math.min(bjState.baseBet + Math.floor(Math.random() * bjState.baseBet), p.chips);
      if (betAmt > 0) processBJBet(p.id, betAmt);
    });
    // Auto-deal only when ALL human players have also bet (or are broke)
    var allHumansBet = bjState.players.every(function(p) {
      if (p.id.startsWith('ai-')) return true;
      return p.bet > 0 || p.status === 'broke';
    });
    if (allHumansBet) {
      var t = setTimeout(function() {
        if (!isAIActive() || !bjState || bjState.phase !== 'betting') return;
        bjDeal();
      }, 500);
      _aiTimers.push(t);
    }
    return;
  }

  if (bjState.phase !== 'playing') return;

  var current = bjState.players[bjState.turnIdx];
  if (!current || !current.id.startsWith('ai-') || current.status !== 'playing') return;

  var total = bjHandTotal(current.cards);

  // Simple strategy: stand on 17+, hit on 16-
  var action;
  if (total >= 17) {
    action = 'stand';
  } else if (total === 11 && current.cards.length === 2 && current.chips >= current.bet) {
    action = 'double'; // double on 11
  } else if (total === 10 && current.cards.length === 2 && current.chips >= current.bet && Math.random() < 0.6) {
    action = 'double'; // sometimes double on 10
  } else {
    action = 'hit';
  }

  var t2 = setTimeout(function() {
    if (!isAIActive() || !bjState || bjState.phase !== 'playing') return;
    var cp = bjState.players[bjState.turnIdx];
    if (!cp || cp.id !== current.id) return;
    processBJAction(current.id, action);
  }, 500 + Math.random() * 800);
  _aiTimers.push(t2);
}

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
      if (!isAIActive() || !stMulti) return;
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

// ========== IDOL AI ==========

function aiIdol() {
  if (typeof idolState === 'undefined' || !idolState) return;
  if (idolState.phase !== 'playing') return;

  if (typeof idolCurrentPlayer !== 'function') return;
  const currentP = idolCurrentPlayer();
  if (!currentP) return;

  // CPU 플레이어 턴에만 동작
  if (typeof idolIsCpuPlayerId !== 'function' || !idolIsCpuPlayerId(currentP.id)) return;
  if (currentP.bankrupt) return; // bankrupt는 idolCheckBankruptcy에서 자동 처리됨

  const action = idolState.pendingAction;
  const actionType = action ? action.type : 'waiting-roll';

  switch (actionType) {
    // ── 주사위 굴리기 ──────────────────────────
    case 'waiting-roll':
    case 'roll-again':
      if (typeof idolRollDice === 'function') idolRollDice();
      break;

    // ── 샵 구매 결정 ──────────────────────────
    case 'shop-buy': {
      // playerId 불일치 시 패스로 안전 처리
      if (!action.playerId || action.playerId !== currentP.id) {
        if (typeof idolPassShop === 'function') idolPassShop();
        break;
      }
      const shop = (typeof SHOPS !== 'undefined') ? SHOPS.find(s => s.id === action.shopId) : null;
      if (!shop) { if (typeof idolPassShop === 'function') idolPassShop(); break; }
      // 구매 기준: 잔고가 가격의 1.1배 이상 && 랜덤 70% 확률
      const canAfford = currentP.money >= shop.price * 1.1;
      if (canAfford && Math.random() < 0.70 && typeof idolBuyShop === 'function') {
        idolBuyShop(action.shopId);
      } else if (typeof idolPassShop === 'function') {
        idolPassShop();
      }
      break;
    }

    // ── 업그레이드 결정 ───────────────────────
    case 'shop-upgrade': {
      if (!action.playerId || action.playerId !== currentP.id) {
        if (typeof idolPassShop === 'function') idolPassShop();
        break;
      }
      const level = idolState.shopLevels ? (idolState.shopLevels[action.shopId] ?? 0) : 0;
      const upgCost = (typeof SHOP_UPGRADE_COST !== 'undefined') ? SHOP_UPGRADE_COST[level] : Infinity;
      // 최대 레벨 아니고 잔고 1.5배 이상 && 60% 확률
      const shouldUpgrade = level < 3 && currentP.money >= upgCost * 1.5 && Math.random() < 0.60;
      if (shouldUpgrade && typeof idolUpgradeShop === 'function') {
        idolUpgradeShop(action.shopId);
      } else if (typeof idolPassShop === 'function') {
        idolPassShop();
      }
      break;
    }

    // ── 전속 샵 훈련 (항상 훈련) ──────────────
    case 'shop-train-self':
      if (!action.playerId || action.playerId !== currentP.id) {
        if (typeof idolSkipTrain === 'function') idolSkipTrain();
        break;
      }
      if (typeof idolTrainAtShop === 'function') idolTrainAtShop(action.shopId, true);
      break;

    // ── 타인 샵 훈련 (70% 확률로 훈련, 15%로 인수 제안) ──
    case 'shop-train-other':
      if (!action.playerId || action.playerId !== currentP.id) {
        if (typeof idolSkipTrain === 'function') idolSkipTrain();
        break;
      }
      {
        const shopLevel = idolState.shopLevels[action.shopId] ?? 0;
        const takeoverPrice = Math.floor((SHOPS.find(s => s.id === action.shopId)?.price ?? 999) * 1.5);
        const canAfford = currentP.money >= takeoverPrice;
        const r = Math.random();
        if (canAfford && shopLevel <= 1 && r < 0.15 && typeof idolProposeTakeover === 'function') {
          // 낮은 레벨 샵은 인수 시도 (15%)
          idolProposeTakeover(action.shopId);
        } else if (r < 0.70 && typeof idolTrainAtShop === 'function') {
          idolTrainAtShop(action.shopId, false);
        } else if (typeof idolSkipTrain === 'function') {
          idolSkipTrain();
        }
      }
      break;

    // ── 이벤트 카드 선택 ──────────────────────
    case 'event-card': {
      if (!action.playerId || action.playerId !== currentP.id) break; // 자동진행 대기
      const card = action.card;
      if (!card) break;
      if (typeof idolChooseEvent !== 'function') break;
      if (card.type === 'reversal') {
        idolChooseEvent(card.id, 0);
      } else {
        const choiceIdx = idolAiPickEventChoice(card, currentP);
        idolChooseEvent(card.id, choiceIdx);
      }
      break;
    }

    // ── 가챠 ──────────────────────────────────
    case 'gacha':
    case 'stage-gacha':
      if (!action.playerId || action.playerId !== currentP.id) break;
      if (typeof idolDoGacha === 'function') idolDoGacha();
      break;

    // ── 찬스 카드 ─────────────────────────────
    case 'chance-card': {
      if (!action.playerId || action.playerId !== currentP.id) break;
      const chCard = action.card;
      if (!chCard || typeof idolApplyChance !== 'function') break;
      if (chCard.target) {
        // 살아있는 다른 플레이어 중 랜덤 대상
        const others = idolState.players.filter(p => p.id !== currentP.id && !p.bankrupt);
        const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
        idolApplyChance(chCard.id, target ? target.id : null);
      } else {
        idolApplyChance(chCard.id, null);
      }
      break;
    }

    // ── 훈련 결과 확인 (CPU는 결과 표시 후 확인) ─────
    case 'train-result':
      if (idolIsCpuPlayerId(currentP.id) && typeof idolConfirmTrainResult === 'function') {
        const trIdx = idolState.currentIdx;
        const trTurn = idolState.turnNum;
        let tries = 0;
        const tryConfirm = () => {
          if (!idolState || idolState.phase !== 'playing') return;
          if (idolState.currentIdx !== trIdx || idolState.turnNum !== trTurn) return;
          const a = idolState.pendingAction;
          if (!a || a.type !== 'train-result') return;
          if (a.confirmReady) {
            idolConfirmTrainResult();
            return;
          }
          tries++;
          if (tries < 20) setTimeout(tryConfirm, 250);
        };
        setTimeout(tryConfirm, 450);
      }
      break;

    // ── 인수 제안 수신 (CPU 오너 응답은 idolProposeTakeover에서 이미 예약됨)
    case 'shop-takeover-offer': {
      // CPU 오너의 1차 응답은 idolProposeTakeover() setTimeout에서 처리됨
      // 혹시 타이머가 소실된 경우 대비 watchdog
      const taSnap = actionType;
      const taIdx = idolState.currentIdx;
      const taTurn = idolState.turnNum;
      const tw = setTimeout(() => {
        if (!idolState || idolState.phase !== 'playing') return;
        if (idolState.currentIdx !== taIdx || idolState.turnNum !== taTurn) return;
        if (idolState.pendingAction?.type !== taSnap) return;
        const ownerId = idolState.pendingAction?.toId;
        if (!ownerId || !idolIsCpuPlayerId(ownerId)) return;
        // 여전히 CPU 오너가 응답 안 함 → 강제 거절
        if (typeof idolDeclineTakeover === 'function') idolDeclineTakeover();
      }, 5000);
      if (typeof _aiTimers !== 'undefined') _aiTimers.push(tw);
      break;
    }

    // ── 내 땅 선택 (아이템 구매 vs 무료 훈련) ────
    case 'own-land-choice': {
      if (!action.playerId || action.playerId !== currentP.id) break;
      const r3 = Math.random();
      if (r3 < 0.70 && typeof idolTrainAtShop === 'function') {
        idolTrainAtShop(action.shopId, true); // 70% 무료 훈련
      } else if (r3 < 0.90 && typeof idolOpenItemShop === 'function') {
        idolOpenItemShop(action.shopId); // 20% 아이템 구매
      } else if (typeof idolPassShop === 'function') {
        idolPassShop(); // 10% 패스
      }
      break;
    }

    // ── 타인 땅 도착 시 선택 (아이템 구매 vs 훈련) ───
    case 'land-choice': {
      if (!action.playerId || action.playerId !== currentP.id) break;
      const lcShop = (typeof SHOPS !== 'undefined') ? SHOPS.find(s => s.id === action.shopId) : null;
      const lcTrainCost = lcShop ? Math.floor(lcShop.price * (typeof IDOL_OTHER_LAND_TRAIN_COST_RATIO !== 'undefined' ? IDOL_OTHER_LAND_TRAIN_COST_RATIO : 0.3)) : 999;
      const canTrain = currentP.money >= lcTrainCost;
      const r2 = Math.random();
      if (canTrain && r2 < 0.65 && typeof idolTrainAtOtherLand === 'function') {
        idolTrainAtOtherLand(action.shopId); // 65% 훈련
      } else if (r2 < 0.85 && typeof idolOpenItemShop === 'function') {
        idolOpenItemShop(action.shopId); // 20% 아이템 구매
      } else if (typeof idolPassShop === 'function') {
        idolPassShop(); // 15% 패스
      }
      break;
    }

    // ── 아이템 구매 ────────────────────────────
    case 'item-shop': {
      if (!action.playerId || action.playerId !== currentP.id) break;
      const lcShop2 = (typeof SHOPS !== 'undefined') ? SHOPS.find(s => s.id === action.shopId) : null;
      if (!lcShop2 || typeof getItemsForShopCat !== 'function' || typeof idolBuyItem !== 'function') {
        if (typeof idolPassShop === 'function') idolPassShop();
        break;
      }
      const availItems = getItemsForShopCat(lcShop2.cat).filter(item => currentP.money >= item.price);
      if (availItems.length > 0) {
        // 가장 비싼 구매 가능 아이템 선택
        const best = availItems.sort((a, b) => b.price - a.price)[0];
        idolBuyItem(best.id);
      } else if (typeof idolPassShop === 'function') {
        idolPassShop();
      }
      break;
    }

    // ── 아이템 교체 ────────────────────────────
    case 'item-replace': {
      if (!action.playerId || action.playerId !== currentP.id) break;
      if (typeof idolReplaceItem !== 'function') { if (typeof idolCancelItemReplace === 'function') idolCancelItemReplace(); break; }
      // 가장 약한(가격 낮은) 아이템 교체
      const items = currentP.items || [];
      if (items.length === 0) { if (typeof idolCancelItemReplace === 'function') idolCancelItemReplace(); break; }
      let weakIdx = 0;
      let weakPrice = Infinity;
      items.forEach((it, i) => {
        const def = typeof getItemDef === 'function' ? getItemDef(it.id) : null;
        const pr = def ? def.price : 0;
        if (pr < weakPrice) { weakPrice = pr; weakIdx = i; }
      });
      idolReplaceItem(weakIdx);
      break;
    }

    // ── 페스티벌 (자동 진행 대기) ───────────────
    case 'festival':
      // 페스티벌은 idol-festival.js의 Promise로 자동 진행
      break;

    // ── 자동 처리 상태들 (AI 개입 불필요) ─────
    // rolling, landed, gacha-result, turn-end-auto,
    // settlement, bankrupt, goto-jail, ending → 모두 자동 진행됨
    // 단, 이 상태에서 자동진행이 멈춘 경우 대비 watchdog 예약
    default: {
      const autoStates = ['rolling', 'landed', 'gacha-result', 'gacha-rolling',
        'turn-end-auto', 'settlement', 'bankrupt', 'goto-jail', 'festival'];
      if (autoStates.includes(actionType) && idolIsCpuPlayerId(currentP.id)) {
        // 자동진행 상태에서 너무 오래 머물면 nudge
        const snapIdx = idolState.currentIdx;
        const snapTurn = idolState.turnNum;
        const snapAction = actionType;
        const t = setTimeout(() => {
          if (!idolState || idolState.phase !== 'playing') return;
          if (idolState.currentIdx !== snapIdx || idolState.turnNum !== snapTurn) return;
          if (idolState.pendingAction?.type !== snapAction) return;
          // 여전히 같은 상태 → 강제 진행
          if (snapAction === 'bankrupt') {
            idolAdvanceTurn();
          } else if (snapAction === 'rolling') {
            // 다이스 애니메이션이 막혔을 때 → 이동 처리 강제 실행
            if (typeof idolHideDiceOverlay === 'function') idolHideDiceOverlay();
            const cp2 = typeof idolCurrentPlayer === 'function' ? idolCurrentPlayer() : null;
            const dice = idolState.pendingAction?.dice;
            if (cp2 && dice) {
              const isDouble = dice[0] === dice[1];
              if (typeof idolMovePlayer === 'function') idolMovePlayer(cp2, dice[0] + dice[1], isDouble);
            }
          } else if (['turn-end-auto', 'gacha-result'].includes(snapAction)) {
            if (typeof idolOnTurnEnd === 'function') idolOnTurnEnd(false);
          }
        }, 5000); // 5초 대기 (다이스 애니메이션 최대 2초 + 여유)
        if (typeof _aiTimers !== 'undefined') _aiTimers.push(t);
      }
      break;
    }
  }
}

// 이벤트 카드 선택지 중 AI에게 가장 유리한 인덱스를 반환
function idolAiPickEventChoice(card, p) {
  if (!card || !card.choices || card.choices.length === 0) return 0;
  let bestIdx = 0;
  let bestScore = -Infinity;
  card.choices.forEach(function(choice, i) {
    try {
      const eff = typeof choice.effect === 'function'
        ? choice.effect(p, idolState)
        : (choice.effect || {});
      // 인기도 3점, 재능/외모 2점, 돈/100 1점, 호감도 1점
      const score = (eff.fame || 0) * 3
        + (eff.talent || 0) * 2
        + (eff.looks || 0) * 2
        + (eff.money || 0) / 100
        + (eff.favor || 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    } catch (e) { /* effect 함수 오류 무시 */ }
  });
  return bestIdx;
}

// ========== DRINK-DODGE POKER AI ==========

function aiDrinkPoker() {
  if (!dpState || dpState.phase === 'gameover' || dpState.phase === 'reveal') return;

  var dp = dpState;

  // === SEND PHASE: AI is the sender ===
  if (dp.phase === 'send') {
    var sender = dp.turnPlayerId;
    if (!sender || !sender.startsWith('ai-')) return;
    var hand = dp.hands[sender];
    if (!hand || hand.length === 0) return;

    // Pick a random card
    var cardIdx = Math.floor(Math.random() * hand.length);
    var card = hand[cardIdx];

    // Pick target: prefer player closest to losing
    var targets = dp.players.filter(function(p) { return p.id !== sender; });
    if (targets.length === 0) return;

    var bestTarget = targets[0];
    var bestScore = -1;
    targets.forEach(function(t) {
      var fu = dp.faceUp[t.id];
      if (!fu) return;
      var maxSame = 0;
      var allTypes = 0;
      DP_TYPES.forEach(function(type) {
        if (fu[type] > maxSame) maxSame = fu[type];
        if (fu[type] >= DP_LOSE_EACH) allTypes++;
      });
      var danger = maxSame * 2 + allTypes;
      if (danger > bestScore) { bestScore = danger; bestTarget = t; }
    });

    // 50% chance to lie about the claim
    var claim = card;
    if (Math.random() < 0.5) {
      var otherTypes = DP_TYPES.filter(function(t) { return t !== card; });
      claim = otherTypes[Math.floor(Math.random() * otherTypes.length)];
    }

    var capturedSender = sender;
    var capturedCardIdx = cardIdx;
    var capturedTarget = bestTarget.id;
    var capturedClaim = claim;
    var t = setTimeout(function() {
      if (!dpState || dpState.phase !== 'send') return;
      if (dpState.turnPlayerId !== capturedSender) return;
      processDPSend(capturedSender, capturedCardIdx, capturedTarget, capturedClaim);
    }, 800 + Math.random() * 600);
    _aiTimers.push(t);
    return;
  }

  // === RESPOND PHASE: AI is the target ===
  if (dp.phase === 'respond') {
    var cc = dp.currentCard;
    if (!cc) return;
    var target = cc.targetId;
    if (!target || !target.startsWith('ai-')) return;

    // Check eligible peek targets
    var eligible = dpGetEligibleTargets(cc);
    var canPeek = eligible.length > 0;

    // Decide: 35% peek if possible, otherwise call true/false
    if (canPeek && Math.random() < 0.35) {
      var peekTarget = target;
      var t2 = setTimeout(function() {
        if (!dpState || dpState.phase !== 'respond') return;
        if (!dpState.currentCard || dpState.currentCard.targetId !== peekTarget) return;
        processDPRespond(peekTarget, 'peek');
      }, 600 + Math.random() * 500);
      _aiTimers.push(t2);
      return;
    }

    // Decide true or false
    // If claimed type is already heavily on face-up for sender, more likely it's a lie
    var senderFu = dp.faceUp[cc.senderId];
    var claimCount = senderFu ? (senderFu[cc.claim] || 0) : 0;
    var callTrue = Math.random() < (claimCount >= 3 ? 0.3 : 0.55);

    var callTarget = target;
    var callChoice = callTrue ? 'true' : 'false';
    var t3 = setTimeout(function() {
      if (!dpState || dpState.phase !== 'respond') return;
      if (!dpState.currentCard || dpState.currentCard.targetId !== callTarget) return;
      processDPRespond(callTarget, callChoice);
    }, 700 + Math.random() * 600);
    _aiTimers.push(t3);
    return;
  }

  // === PEEK-PASS PHASE: AI saw the card, needs to pass ===
  if (dp.phase === 'peek-pass') {
    var cc2 = dp.currentCard;
    if (!cc2) return;
    var peeker = cc2.fromId;
    if (!peeker || !peeker.startsWith('ai-')) return;

    var eligible2 = dpGetEligibleTargets(cc2);
    if (eligible2.length === 0) return;

    // Pick target closest to losing
    var target2 = eligible2[0];
    var bestDanger = -1;
    eligible2.forEach(function(p) {
      var fu2 = dp.faceUp[p.id];
      if (!fu2) return;
      var maxS = 0;
      DP_TYPES.forEach(function(type) { if (fu2[type] > maxS) maxS = fu2[type]; });
      if (maxS > bestDanger) { bestDanger = maxS; target2 = p; }
    });

    // Decide claim: if actual matches claim, maybe change it (strategic lie)
    var newClaim = cc2.claim;
    if (cc2.card === cc2.claim && Math.random() < 0.4) {
      // Change claim to something else
      var others = DP_TYPES.filter(function(t) { return t !== cc2.card; });
      newClaim = others[Math.floor(Math.random() * others.length)];
    } else if (cc2.card !== cc2.claim && Math.random() < 0.5) {
      // Correct the lie or keep it
      newClaim = Math.random() < 0.5 ? cc2.card : cc2.claim;
    }

    var passFrom = peeker;
    var passTo = target2.id;
    var passClaim = newClaim;
    var t4 = setTimeout(function() {
      if (!dpState || dpState.phase !== 'peek-pass') return;
      if (!dpState.currentCard || dpState.currentCard.fromId !== passFrom) return;
      processDPPeekPass(passFrom, passTo, passClaim);
    }, 900 + Math.random() * 700);
    _aiTimers.push(t4);
  }
}

// ========== KINGSTAGRAM AI ==========

function aiKingstagram() {
  if (!kingState || kingState.phase === 'gameover' || kingState.phase === 'scoring' || kingState.phase === 'placed') return;

  var ks = kingState;
  var currentPlayer = ks.players[ks.turnIdx];
  if (!currentPlayer || !currentPlayer.id.startsWith('ai-')) return;

  if (ks.phase === 'rolling') {
    var rollPlayerId = currentPlayer.id;
    var rollTurnIdx = ks.turnIdx;
    var t = setTimeout(function() {
      if (!kingState || kingState.phase !== 'rolling') return;
      if (kingState.turnIdx !== rollTurnIdx) return;
      processKingRoll(rollPlayerId);
    }, 400 + Math.random() * 400);
    _aiTimers.push(t);
  } else if (ks.phase === 'choosing') {
    var cpId = currentPlayer.id;
    var cpTurnIdx = ks.turnIdx;
    var t2 = setTimeout(function() {
      if (!kingState || kingState.phase !== 'choosing') return;
      if (kingState.turnIdx !== cpTurnIdx) return;
      var cp = kingState.players[kingState.turnIdx];
      if (!cp || cp.id !== cpId) return;
      var groups = kingState.rollGroups;
      if (!groups) return;

      // Pick the best dice group: dice value = land number, so evaluate each land
      var bestValue = null;
      var bestScore = -Infinity;
      var keys = Object.keys(groups);
      for (var i = 0; i < keys.length; i++) {
        var v = parseInt(keys[i]);
        var landIdx = v - 1;
        var land = kingState.lands[landIdx];
        if (!land) continue;
        var cardSum = 0;
        for (var c = 0; c < land.cards.length; c++) cardSum += land.cards[c];
        var myDice = land.dice[cp.id] || 0;
        var newTotal = myDice + groups[v];
        var enemyDice = 0;
        var dKeys = Object.keys(land.dice);
        for (var d = 0; d < dKeys.length; d++) {
          if (dKeys[d] !== cp.id) enemyDice += land.dice[dKeys[d]];
        }
        // Score: value of winning this land, adjusted by competition
        var winChance = newTotal > enemyDice ? 1 : (newTotal === enemyDice ? -0.5 : 0.2);
        var score = cardSum * winChance + Math.random() * 3000;
        if (score > bestScore) {
          bestScore = score;
          bestValue = v;
        }
      }
      if (bestValue === null) return;
      processKingPlace(cpId, bestValue);
    }, 600 + Math.random() * 600);
    _aiTimers.push(t2);
  }
}

// ========== COINSTACK AI ==========

function aiCoinStack() {
  if (!csState || csState.phase !== 'playing') return;
  if (!state.isHost) return;

  var currentId = csState.currentPlayer;
  if (!currentId || !currentId.startsWith('ai-')) return;

  var coinCount = csState.coins.length;
  var spread = CS_MAX_X * 0.6;

  // AI gets more conservative as stack grows
  if (coinCount > 3) spread *= 0.7;
  if (coinCount > 6) spread *= 0.5;
  if (coinCount > 10) spread *= 0.4;
  if (coinCount > 15) spread *= 0.3;

  // AI compensates for wind (partially — not perfect)
  var windComp = 0;
  if (csState.windForce) {
    windComp = -csState.windForce * (0.5 + Math.random() * 0.3);
  }

  var x;
  if (coinCount > 0) {
    var lastX = csState.coins[coinCount - 1].x;
    // AI tries to place near the last coin, counter wind
    x = lastX * 0.5 + windComp + (Math.random() - 0.5) * spread;
  } else {
    x = windComp + (Math.random() - 0.5) * spread * 0.2;
  }

  // Clamp (respect narrow event)
  var maxX = CS_MAX_X;
  if (csState.pendingEvent && csState.pendingEvent.id === 'narrow') maxX = CS_MAX_X * 0.5;
  x = Math.max(-maxX, Math.min(maxX, x));

  var t = setTimeout(function() {
    if (!isAIActive() || !csState || csState.phase !== 'playing') return;
    if (csState.currentPlayer !== currentId) return;
    csProcessDrop(currentId, x);
  }, 800 + Math.random() * 1000);
  _aiTimers.push(t);
}

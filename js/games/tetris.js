// ============================
// TETRIS — Block Puzzle
// Full SRS implementation
// ============================

// ===== Constants =====
const TET_COLS = 10;
const TET_ROWS = 40;        // internal rows (top 20 hidden)
const TET_VISIBLE = 20;     // visible rows (bottom 20)
const TET_SPAWN_ROW = 18;   // spawn at row 18 (just above visible)
const TET_DAS_DEFAULT = 167; // ms
const TET_ARR_DEFAULT = 33;  // ms
const TET_SDF = 20;         // soft drop factor
const TET_LOCK_DELAY = 500; // ms
const TET_LOCK_MOVES = 15;  // max lock resets

// Tetromino shapes: [rotation_state][row][col], 1=filled
const TET_SHAPES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]]
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]]
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]]
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]]
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]]
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]]
  ]
};

// SRS Wall Kick data: offsets for JLSTZ
const TET_KICK_JLSTZ = {
  '0>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '1>0': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  '1>2': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  '2>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '2>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  '3>2': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '3>0': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '0>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]]
};

// SRS Wall Kick data: offsets for I piece
const TET_KICK_I = {
  '0>1': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
  '1>0': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
  '1>2': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
  '2>1': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
  '2>3': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
  '3>2': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
  '3>0': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
  '0>3': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]]
};

// Colors for each piece type
const TET_COLORS = {
  I: '#00d2ff', O: '#ffd93d', T: '#c56cf0',
  S: '#6bcb77', Z: '#ff6b6b', J: '#4a90e2', L: '#ff9f43'
};
const TET_COLORS_DARK = {
  I: '#0099bb', O: '#bba020', T: '#9040b0',
  S: '#4a9050', Z: '#bb3030', J: '#2060a0', L: '#bb7020'
};

// Gravity intervals per level (ms per cell)
function tetGravityInterval(level) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000;
}

// ===== State =====
let tetGame = null;     // current game state
let tetAnimId = null;
let tetLastTime = 0;
let tetCanvas = null;
let tetCtx = null;
let tetCellSize = 0;
let tetHoldCanvas = null;
let tetHoldCtx = null;
let tetNextCanvases = [];
let tetNextCtxs = [];
let _tetKeyBound = false;
let _tetDASTimer = { left: 0, right: 0, down: 0 };
let _tetDASActive = { left: false, right: false, down: false };
let _tetKeyState = {};
let _tetActionQueue = [];
let _tetActionTextTimer = null;
let tetMulti = null; // multiplayer state (host)
let tetParticles = [];
let tetFireworks = [];  // 2-phase firework rockets
let _tetResizeHandler = null;

// ===== 7-Bag Generator =====
function tetShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tetCreateBag() {
  return tetShuffle(['I','O','T','S','Z','J','L']);
}

function tetNextPiece(g) {
  while (g.nextQueue.length < 7) {
    g.nextQueue.push(...tetCreateBag());
  }
  const type = g.nextQueue.shift();
  return tetCreatePiece(type);
}

// ===== Create piece object =====
function tetCreatePiece(type) {
  const shape = TET_SHAPES[type];
  const size = shape[0].length;
  // Spawn centered horizontally
  const x = Math.floor((TET_COLS - size) / 2);
  const y = TET_SPAWN_ROW;
  return { type, x, y, rotation: 0 };
}

// ===== Board helpers =====
function tetCreateBoard() {
  const board = [];
  for (let r = 0; r < TET_ROWS; r++) {
    board.push(new Array(TET_COLS).fill(0));
  }
  return board;
}

function tetGetCells(piece) {
  const shape = TET_SHAPES[piece.type][piece.rotation];
  const cells = [];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        cells.push({ x: piece.x + c, y: piece.y + r });
      }
    }
  }
  return cells;
}

function tetIsValid(board, piece, x, y, rotation) {
  const shape = TET_SHAPES[piece.type][rotation];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= TET_COLS) return false;
      if (by >= TET_ROWS) return false;
      if (by >= 0 && board[by][bx]) return false;
    }
  }
  return true;
}

// ===== SRS Rotation =====
function tetRotate(g, dir) {
  // dir: 1 = CW, -1 = CCW
  const piece = g.currentPiece;
  if (!piece) return false;
  if (piece.type === 'O') return false;

  const oldRot = piece.rotation;
  const newRot = (oldRot + dir + 4) % 4;
  const kickKey = `${oldRot}>${newRot}`;
  const kicks = piece.type === 'I' ? TET_KICK_I[kickKey] : TET_KICK_JLSTZ[kickKey];

  if (!kicks) return false;

  for (const [dx, dy] of kicks) {
    if (tetIsValid(g.board, piece, piece.x + dx, piece.y - dy, newRot)) {
      piece.x += dx;
      piece.y -= dy;
      piece.rotation = newRot;
      g.lastAction = 'rotate';
      g.lastKick = (dx !== 0 || dy !== 0);
      // Reset lock delay
      if (g.onGround) {
        g.lockMoveCount++;
        if (g.lockMoveCount < TET_LOCK_MOVES) {
          g.lockTimer = 0;
        }
      }
      return true;
    }
  }
  return false;
}

// ===== Movement =====
function tetMoveH(g, dx) {
  const p = g.currentPiece;
  if (!p) return false;
  if (tetIsValid(g.board, p, p.x + dx, p.y, p.rotation)) {
    p.x += dx;
    g.lastAction = 'move';
    if (g.onGround) {
      g.lockMoveCount++;
      if (g.lockMoveCount < TET_LOCK_MOVES) {
        g.lockTimer = 0;
      }
    }
    return true;
  }
  return false;
}

function tetSoftDrop(g) {
  const p = g.currentPiece;
  if (!p) return false;
  if (tetIsValid(g.board, p, p.x, p.y + 1, p.rotation)) {
    p.y++;
    g.score += 1;
    g.gravityTimer = 0;
    g.lastAction = 'move';
    return true;
  }
  return false;
}

function tetHardDrop(g) {
  const p = g.currentPiece;
  if (!p) return;
  let dist = 0;
  while (tetIsValid(g.board, p, p.x, p.y + 1, p.rotation)) {
    p.y++;
    dist++;
  }
  g.score += dist * 2;
  tetLockPiece(g);
}

// ===== Ghost position =====
function tetGhostY(g) {
  const p = g.currentPiece;
  if (!p) return p?.y || 0;
  let gy = p.y;
  while (tetIsValid(g.board, p, p.x, gy + 1, p.rotation)) {
    gy++;
  }
  return gy;
}

// ===== Hold =====
function tetHold(g) {
  if (g.holdUsed || !g.currentPiece) return;
  const type = g.currentPiece.type;
  if (g.holdPiece) {
    g.currentPiece = tetCreatePiece(g.holdPiece);
    g.holdPiece = type;
  } else {
    g.holdPiece = type;
    g.currentPiece = tetNextPiece(g);
  }
  g.holdUsed = true;
  g.onGround = false;
  g.lockTimer = 0;
  g.lockMoveCount = 0;
  g.gravityTimer = 0;
  g.lastAction = null;
}

// ===== Lock piece & check lines =====
function tetLockPiece(g) {
  const p = g.currentPiece;
  if (!p) return;

  // Place on board
  const cells = tetGetCells(p);
  let allAbove = true;
  for (const { x, y } of cells) {
    if (y >= 0 && y < TET_ROWS) {
      // Store piece type index (1-7)
      g.board[y][x] = ['I','O','T','S','Z','J','L'].indexOf(p.type) + 1;
    }
    if (y >= TET_ROWS - TET_VISIBLE) allAbove = false;
  }

  // Check lock out (all blocks above visible area)
  if (allAbove) {
    tetGameOver(g);
    return;
  }

  // T-Spin detection
  let tSpin = false;
  let tSpinMini = false;
  if (p.type === 'T' && g.lastAction === 'rotate') {
    const cx = p.x + 1;
    const cy = p.y + 1;
    // Check 4 corners
    const corners = [
      [cx - 1, cy - 1], [cx + 1, cy - 1],
      [cx - 1, cy + 1], [cx + 1, cy + 1]
    ];
    let filled = 0;
    for (const [fx, fy] of corners) {
      if (fx < 0 || fx >= TET_COLS || fy < 0 || fy >= TET_ROWS || (fy >= 0 && g.board[fy][fx])) {
        filled++;
      }
    }
    if (filled >= 3) {
      // Check if it's a mini T-Spin
      // Front corners (pointing side) must both be filled for full T-Spin
      const frontCorners = {
        0: [[cx - 1, cy - 1], [cx + 1, cy - 1]], // pointing up
        1: [[cx + 1, cy - 1], [cx + 1, cy + 1]], // pointing right
        2: [[cx - 1, cy + 1], [cx + 1, cy + 1]], // pointing down
        3: [[cx - 1, cy - 1], [cx - 1, cy + 1]]  // pointing left
      };
      const fc = frontCorners[p.rotation];
      let frontFilled = 0;
      for (const [fx, fy] of fc) {
        if (fx < 0 || fx >= TET_COLS || fy < 0 || fy >= TET_ROWS || (fy >= 0 && g.board[fy][fx])) {
          frontFilled++;
        }
      }
      if (frontFilled === 2) {
        tSpin = true;
      } else if (g.lastKick) {
        tSpin = true; // wall kick T-Spin counts as full
      } else {
        tSpinMini = true;
      }
    }
  }

  // Check line clears
  const clearedRows = [];
  for (let r = TET_ROWS - 1; r >= 0; r--) {
    if (g.board[r].every(c => c !== 0)) {
      clearedRows.push(r);
    }
  }

  const lines = clearedRows.length;

  // Calculate score
  let points = 0;
  let actionText = '';
  let isDifficult = false; // for B2B

  if (lines > 0) {
    if (tSpin) {
      isDifficult = true;
      if (lines === 1) { points = 800 * g.level; actionText = 'T-SPIN SINGLE'; }
      else if (lines === 2) { points = 1200 * g.level; actionText = 'T-SPIN DOUBLE'; }
      else if (lines === 3) { points = 1600 * g.level; actionText = 'T-SPIN TRIPLE'; }
    } else if (tSpinMini) {
      if (lines === 1) { points = 200 * g.level; actionText = 'T-SPIN MINI'; }
      else { points = 400 * g.level; actionText = 'T-SPIN MINI'; }
    } else {
      if (lines === 1) { points = 100 * g.level; actionText = 'SINGLE'; }
      else if (lines === 2) { points = 300 * g.level; actionText = 'DOUBLE'; }
      else if (lines === 3) { points = 500 * g.level; actionText = 'TRIPLE'; }
      else if (lines === 4) { points = 800 * g.level; actionText = 'TETRIS!'; isDifficult = true; }
    }

    // B2B bonus
    if (isDifficult) {
      if (g.backToBack) {
        points = Math.floor(points * 1.5);
        actionText = 'B2B ' + actionText;
      }
      g.backToBack = true;
    } else if (lines > 0 && !tSpinMini) {
      g.backToBack = false;
    }

    // Combo
    g.combo++;
    if (g.combo > 1) {
      points += 50 * (g.combo - 1) * g.level;
      actionText += ` (${g.combo - 1}REN)`;
    }
  } else {
    g.combo = 0;
    if (tSpin) {
      actionText = 'T-SPIN';
      points = 400 * g.level;
    }
  }

  // Remove cleared rows
  if (lines > 0) {
    // Store for animation
    g.clearingRows = clearedRows.slice();
    g.clearAnim = 0;
    g.lineClearFlash = 150; // ms

    // Spawn firework particles
    tetSpawnFireworks(g, clearedRows, lines, tSpin);

    for (const r of clearedRows.sort((a, b) => a - b)) {
      g.board.splice(r, 1);
      g.board.unshift(new Array(TET_COLS).fill(0));
    }
    g.linesCleared += lines;
    g.totalLines += lines;

    // Perfect Clear bonus
    if (g.board.every(row => row.every(c => c === 0))) {
      points += 3000;
      actionText = 'PERFECT CLEAR!';
    }

    // Level up check (every 10 lines)
    const newLevel = Math.floor(g.totalLines / 10) + g.startLevel;
    if (newLevel > g.level) {
      g.level = newLevel;
      // Marathon mode: check victory at level 15
      if (g.mode === 'marathon' && g.level > 15) {
        g.level = 15;
      }
    }
  }

  g.score += points;

  // Show action text
  if (actionText) {
    tetShowActionText(g, actionText);
  }

  // Track stats
  if (lines === 4) g.tetrisCount++;
  if (tSpin && lines > 0) g.tSpinCount++;
  if (g.combo - 1 > g.maxCombo) g.maxCombo = g.combo - 1;

  // Mode-specific checks
  if (g.mode === 'sprint' && g.totalLines >= 40) {
    tetVictory(g);
    return;
  }
  if (g.mode === 'marathon' && g.totalLines >= 150) {
    tetVictory(g);
    return;
  }

  // Spawn next piece
  g.currentPiece = tetNextPiece(g);
  g.holdUsed = false;
  g.onGround = false;
  g.lockTimer = 0;
  g.lockMoveCount = 0;
  g.gravityTimer = 0;
  g.lastAction = null;

  // Check block out
  if (!tetIsValid(g.board, g.currentPiece, g.currentPiece.x, g.currentPiece.y, g.currentPiece.rotation)) {
    tetGameOver(g);
  }
}

// ===== Game Over / Victory =====
function tetGameOver(g) {
  g.phase = 'gameover';
  g.gameOverTime = Date.now();
  tetSaveBest(g);
  if (tetAnimId) {
    cancelAnimationFrame(tetAnimId);
    tetAnimId = null;
  }
  tetRenderGameOver(g);

  // Multiplayer: report death
  if (tetMulti && typeof sendToHost === 'function') {
    sendToHost({ type: 'tetris-dead', score: g.score, lines: g.totalLines, level: g.level });
  }
}

function tetVictory(g) {
  g.phase = 'victory';
  g.gameOverTime = Date.now();
  tetSaveBest(g);
  if (tetAnimId) {
    cancelAnimationFrame(tetAnimId);
    tetAnimId = null;
  }
  tetRenderGameOver(g, true);

  if (tetMulti && typeof sendToHost === 'function') {
    sendToHost({ type: 'tetris-dead', score: g.score, lines: g.totalLines, level: g.level });
  }
}

function tetSaveBest(g) {
  const key = `tetris_best_${g.mode}`;
  const best = parseInt(localStorage.getItem(key) || '0', 10);
  if (g.score > best) {
    localStorage.setItem(key, g.score.toString());
    g.newBest = true;
  }
  g.bestScore = Math.max(best, g.score);
}

// ===== Initialize game =====
function tetStartGame(mode, startLevel) {
  mode = mode || 'marathon';
  startLevel = startLevel || 1;

  tetGame = {
    mode: mode,
    phase: 'countdown',
    board: tetCreateBoard(),
    currentPiece: null,
    holdPiece: null,
    holdUsed: false,
    nextQueue: [],
    score: 0,
    level: startLevel,
    startLevel: startLevel,
    linesCleared: 0,
    totalLines: 0,
    combo: 0,
    backToBack: false,
    lastAction: null,
    lastKick: false,
    onGround: false,
    lockTimer: 0,
    lockMoveCount: 0,
    gravityTimer: 0,
    clearingRows: [],
    clearAnim: 0,
    lineClearFlash: 0,
    tetrisCount: 0,
    tSpinCount: 0,
    maxCombo: 0,
    newBest: false,
    bestScore: 0,
    startTime: 0,
    elapsedTime: 0,
    countdownValue: 3,
    countdownTimer: 0,
    gameOverTime: 0,
  };
  tetParticles = [];
  tetFireworks = [];

  // Fill initial queue
  tetGame.nextQueue = [...tetCreateBag(), ...tetCreateBag()];
  tetGame.currentPiece = tetNextPiece(tetGame);

  // Setup canvas (use rAF to ensure layout is computed after overlay hides)
  requestAnimationFrame(() => {
    tetSetupCanvases();
    tetRender(tetGame);
  });
  tetBindKeys();

  // Reset input state
  _tetDASTimer = { left: 0, right: 0, down: 0 };
  _tetDASActive = { left: false, right: false, down: false };
  _tetKeyState = {};
  _tetActionQueue = [];

  // Show/hide timer bar
  const timerBar = document.getElementById('tetTimerBar');
  if (timerBar) timerBar.style.display = mode === 'ultra' ? 'block' : 'none';

  // Show mode select overlay is hidden
  const modeOverlay = document.getElementById('tetModeOverlay');
  if (modeOverlay) modeOverlay.style.display = 'none';
  const goOverlay = document.getElementById('tetGameOver');
  if (goOverlay) goOverlay.style.display = 'none';
  const pauseOverlay = document.getElementById('tetPause');
  if (pauseOverlay) pauseOverlay.style.display = 'none';
  const countdownOverlay = document.getElementById('tetCountdown');
  if (countdownOverlay) countdownOverlay.style.display = 'flex';

  // Start countdown
  tetGame.countdownValue = 3;
  tetGame.countdownTimer = 0;
  tetLastTime = performance.now();
  tetGameLoop(tetLastTime);
}

// ===== Canvas setup =====
function tetSetupCanvases() {
  tetCanvas = document.getElementById('tetCanvas');
  if (!tetCanvas) return;
  tetCtx = tetCanvas.getContext('2d');

  tetRecalcSize();

  // Hold canvas
  tetHoldCanvas = document.getElementById('tetHoldCanvas');
  if (tetHoldCanvas) {
    tetHoldCtx = tetHoldCanvas.getContext('2d');
    tetHoldCanvas.width = 48;
    tetHoldCanvas.height = 32;
  }

  // Next canvases
  tetNextCanvases = [];
  tetNextCtxs = [];
  for (let i = 0; i < 3; i++) {
    const c = document.getElementById('tetNextCanvas' + i);
    if (c) {
      tetNextCanvases.push(c);
      tetNextCtxs.push(c.getContext('2d'));
      c.width = 48;
      c.height = 32;
    }
  }

  // Resize listener
  if (_tetResizeHandler) window.removeEventListener('resize', _tetResizeHandler);
  _tetResizeHandler = function() { tetRecalcSize(); };
  window.addEventListener('resize', _tetResizeHandler);
}

function tetRecalcSize() {
  if (!tetCanvas) return;
  const screenH = window.innerHeight || 700;
  const screenW = window.innerWidth || 375;
  const isLandscape = screenW > screenH;
  const boardAvailH = screenH - (isLandscape ? 140 : 200);
  const boardAvailW = screenW - (isLandscape ? 180 : 140);
  tetCellSize = Math.floor(Math.min(boardAvailH / TET_VISIBLE, boardAvailW / TET_COLS));
  tetCellSize = Math.max(tetCellSize, 14);
  tetCellSize = Math.min(tetCellSize, 28);

  tetCanvas.width = TET_COLS * tetCellSize;
  tetCanvas.height = TET_VISIBLE * tetCellSize;
  tetCanvas.style.width = tetCanvas.width + 'px';
  tetCanvas.style.height = tetCanvas.height + 'px';
}

// ===== Game loop =====
function tetGameLoop(timestamp) {
  const dt = timestamp - tetLastTime;
  tetLastTime = timestamp;
  const g = tetGame;
  if (!g) return;

  if (g.phase === 'countdown') {
    tetUpdateCountdown(g, dt);
  } else if (g.phase === 'playing') {
    tetProcessInput(g, dt);
    tetUpdateGravity(g, dt);
    tetUpdateLock(g, dt);
    tetUpdateTimer(g, dt);
  }

  // Clear animation
  if (g.clearAnim > 0) {
    g.clearAnim -= dt;
    if (g.clearAnim < 0) g.clearAnim = 0;
  }
  if (g.lineClearFlash > 0) {
    g.lineClearFlash -= dt;
    if (g.lineClearFlash < 0) g.lineClearFlash = 0;
  }

  tetUpdateParticles(dt);
  tetRender(g);

  if (g.phase !== 'gameover' && g.phase !== 'victory' && g.phase !== 'modeselect' && g.phase !== 'paused') {
    tetAnimId = requestAnimationFrame(tetGameLoop);
  }
}

// ===== Countdown =====
function tetUpdateCountdown(g, dt) {
  g.countdownTimer += dt;
  if (g.countdownTimer >= 800) {
    g.countdownTimer = 0;
    g.countdownValue--;
    const numEl = document.getElementById('tetCountdownNum');
    if (numEl) {
      if (g.countdownValue > 0) {
        numEl.textContent = g.countdownValue;
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = 'tet-countdown-pop 0.8s ease-out';
      }
    }
    if (g.countdownValue <= 0) {
      g.phase = 'playing';
      g.startTime = Date.now();
      const overlay = document.getElementById('tetCountdown');
      if (overlay) overlay.style.display = 'none';
    }
  }
}

// ===== Timer (Sprint/Ultra) =====
function tetUpdateTimer(g, dt) {
  if (g.phase !== 'playing') return;
  g.elapsedTime = Date.now() - g.startTime;

  if (g.mode === 'ultra') {
    const remaining = 120000 - g.elapsedTime;
    if (remaining <= 0) {
      g.elapsedTime = 120000;
      tetVictory(g);
    }
  }
}

// ===== Input processing =====
function tetProcessInput(g, dt) {
  // Process action queue
  while (_tetActionQueue.length > 0) {
    const action = _tetActionQueue.shift();
    if (action === 'rotate_cw') tetRotate(g, 1);
    else if (action === 'rotate_ccw') tetRotate(g, -1);
    else if (action === 'hard_drop') tetHardDrop(g);
    else if (action === 'hold') tetHold(g);
  }

  // DAS/ARR for left
  if (_tetKeyState['left']) {
    _tetDASTimer.left += dt;
    if (!_tetDASActive.left) {
      if (_tetDASTimer.left >= TET_DAS_DEFAULT) {
        _tetDASActive.left = true;
        _tetDASTimer.left = 0;
        tetMoveH(g, -1);
      }
    } else {
      while (_tetDASTimer.left >= TET_ARR_DEFAULT) {
        _tetDASTimer.left -= TET_ARR_DEFAULT;
        tetMoveH(g, -1);
      }
    }
  }

  // DAS/ARR for right
  if (_tetKeyState['right']) {
    _tetDASTimer.right += dt;
    if (!_tetDASActive.right) {
      if (_tetDASTimer.right >= TET_DAS_DEFAULT) {
        _tetDASActive.right = true;
        _tetDASTimer.right = 0;
        tetMoveH(g, 1);
      }
    } else {
      while (_tetDASTimer.right >= TET_ARR_DEFAULT) {
        _tetDASTimer.right -= TET_ARR_DEFAULT;
        tetMoveH(g, 1);
      }
    }
  }

  // Soft drop (continuous)
  if (_tetKeyState['down']) {
    _tetDASTimer.down += dt;
    const sdInterval = tetGravityInterval(g.level) / TET_SDF;
    while (_tetDASTimer.down >= sdInterval) {
      _tetDASTimer.down -= sdInterval;
      tetSoftDrop(g);
    }
  }
}

// ===== Gravity =====
function tetUpdateGravity(g, dt) {
  if (!g.currentPiece || g.phase !== 'playing') return;
  if (_tetKeyState['down']) return; // soft drop handles gravity

  g.gravityTimer += dt;
  const interval = tetGravityInterval(g.level);
  while (g.gravityTimer >= interval) {
    g.gravityTimer -= interval;
    if (tetIsValid(g.board, g.currentPiece, g.currentPiece.x, g.currentPiece.y + 1, g.currentPiece.rotation)) {
      g.currentPiece.y++;
    }
  }
}

// ===== Lock delay =====
function tetUpdateLock(g, dt) {
  if (!g.currentPiece || g.phase !== 'playing') return;

  const onGround = !tetIsValid(g.board, g.currentPiece, g.currentPiece.x, g.currentPiece.y + 1, g.currentPiece.rotation);

  if (onGround) {
    if (!g.onGround) {
      g.onGround = true;
      g.lockTimer = 0;
      g.lockMoveCount = 0;
    }
    g.lockTimer += dt;
    if (g.lockTimer >= TET_LOCK_DELAY || g.lockMoveCount >= TET_LOCK_MOVES) {
      tetLockPiece(g);
    }
  } else {
    g.onGround = false;
    g.lockTimer = 0;
  }
}

// ===== Key bindings =====
function tetBindKeys() {
  if (_tetKeyBound) return;
  _tetKeyBound = true;

  document.addEventListener('keydown', tetKeyDown);
  document.addEventListener('keyup', tetKeyUp);
}

function tetUnbindKeys() {
  document.removeEventListener('keydown', tetKeyDown);
  document.removeEventListener('keyup', tetKeyUp);
  _tetKeyBound = false;
}

function tetKeyDown(e) {
  if (!tetGame || tetGame.phase !== 'playing') {
    // Allow escape for pause
    if (e.key === 'Escape' && tetGame && tetGame.phase === 'paused') {
      tetResume();
      e.preventDefault();
      return;
    }
    return;
  }

  // Pause
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    tetPause();
    e.preventDefault();
    return;
  }

  const key = e.key;

  if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && !_tetKeyState['left']) {
    _tetKeyState['left'] = true;
    _tetDASTimer.left = 0;
    _tetDASActive.left = false;
    tetMoveH(tetGame, -1);
    e.preventDefault();
  }
  if ((key === 'ArrowRight' || key === 'd' || key === 'D') && !_tetKeyState['right']) {
    _tetKeyState['right'] = true;
    _tetDASTimer.right = 0;
    _tetDASActive.right = false;
    tetMoveH(tetGame, 1);
    e.preventDefault();
  }
  if ((key === 'ArrowDown' || key === 's' || key === 'S') && !_tetKeyState['down']) {
    _tetKeyState['down'] = true;
    _tetDASTimer.down = 0;
    e.preventDefault();
  }
  if (key === 'ArrowUp' || key === 'x' || key === 'X') {
    _tetActionQueue.push('rotate_cw');
    e.preventDefault();
  }
  if (key === 'z' || key === 'Z' || key === 'Control') {
    _tetActionQueue.push('rotate_ccw');
    e.preventDefault();
  }
  if (key === ' ') {
    _tetActionQueue.push('hard_drop');
    e.preventDefault();
  }
  if (key === 'c' || key === 'C' || key === 'Shift') {
    _tetActionQueue.push('hold');
    e.preventDefault();
  }
}

function tetKeyUp(e) {
  const key = e.key;
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    _tetKeyState['left'] = false;
  }
  if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    _tetKeyState['right'] = false;
  }
  if (key === 'ArrowDown' || key === 's' || key === 'S') {
    _tetKeyState['down'] = false;
  }
}

// ===== Touch controls =====
function tetTouchLeft() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetMoveH(tetGame, -1);
}
function tetTouchRight() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetMoveH(tetGame, 1);
}
function tetTouchDown() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetSoftDrop(tetGame);
}
function tetTouchRotate() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetRotate(tetGame, 1);
}
function tetTouchHardDrop() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetHardDrop(tetGame);
}
function tetTouchHold() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetHold(tetGame);
}

// Touch repeat for movement buttons
let _tetTouchInterval = null;
let _tetTouchTimeout = null;

function tetTouchStart(action) {
  if (!tetGame || tetGame.phase !== 'playing') return;
  // Immediate action
  if (action === 'left') tetMoveH(tetGame, -1);
  else if (action === 'right') tetMoveH(tetGame, 1);
  else if (action === 'down') tetSoftDrop(tetGame);

  clearTimeout(_tetTouchTimeout);
  clearInterval(_tetTouchInterval);

  _tetTouchTimeout = setTimeout(() => {
    _tetTouchInterval = setInterval(() => {
      if (!tetGame || tetGame.phase !== 'playing') {
        clearInterval(_tetTouchInterval);
        return;
      }
      if (action === 'left') tetMoveH(tetGame, -1);
      else if (action === 'right') tetMoveH(tetGame, 1);
      else if (action === 'down') tetSoftDrop(tetGame);
    }, TET_ARR_DEFAULT);
  }, TET_DAS_DEFAULT);
}

function tetTouchEnd() {
  clearTimeout(_tetTouchTimeout);
  clearInterval(_tetTouchInterval);
}

// ===== Pause =====
function tetPause() {
  if (!tetGame || tetGame.phase !== 'playing') return;
  tetGame.phase = 'paused';
  tetGame._pauseStart = Date.now();
  const overlay = document.getElementById('tetPause');
  if (overlay) overlay.style.display = 'flex';
}

function tetResume() {
  if (!tetGame || tetGame.phase !== 'paused') return;
  // Adjust start time for pause duration
  if (tetGame._pauseStart) {
    const pauseDuration = Date.now() - tetGame._pauseStart;
    tetGame.startTime += pauseDuration;
  }
  tetGame.phase = 'playing';
  const overlay = document.getElementById('tetPause');
  if (overlay) overlay.style.display = 'none';
  tetLastTime = performance.now();
  tetAnimId = requestAnimationFrame(tetGameLoop);
}

// ===== Rendering =====
function tetRender(g) {
  if (!tetCtx || !tetCanvas) return;
  const ctx = tetCtx;
  const cs = tetCellSize;
  const w = tetCanvas.width;
  const h = tetCanvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let r = 0; r < TET_VISIBLE; r++) {
    for (let c = 0; c < TET_COLS; c++) {
      ctx.strokeRect(c * cs, r * cs, cs, cs);
    }
  }

  // Draw placed blocks
  const offset = TET_ROWS - TET_VISIBLE;
  for (let r = 0; r < TET_VISIBLE; r++) {
    const boardRow = r + offset;
    for (let c = 0; c < TET_COLS; c++) {
      const val = g.board[boardRow][c];
      if (val) {
        const types = ['I','O','T','S','Z','J','L'];
        const type = types[val - 1];
        tetDrawCell(ctx, c * cs, r * cs, cs, TET_COLORS[type], TET_COLORS_DARK[type]);
      }
    }
  }

  if (g.currentPiece && g.phase === 'playing') {
    // Ghost piece
    const ghostY = tetGhostY(g);
    const ghostCells = tetGetCells({ ...g.currentPiece, y: ghostY });
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (const { x, y } of ghostCells) {
      const vy = y - offset;
      if (vy >= 0 && vy < TET_VISIBLE) {
        ctx.fillRect(x * cs + 1, vy * cs + 1, cs - 2, cs - 2);
        ctx.strokeRect(x * cs + 1, vy * cs + 1, cs - 2, cs - 2);
      }
    }
    ctx.setLineDash([]);

    // Current piece
    const pColor = TET_COLORS[g.currentPiece.type];
    const pColorDark = TET_COLORS_DARK[g.currentPiece.type];
    const cells = tetGetCells(g.currentPiece);
    for (const { x, y } of cells) {
      const vy = y - offset;
      if (vy >= 0 && vy < TET_VISIBLE) {
        tetDrawCell(ctx, x * cs, vy * cs, cs, pColor, pColorDark);
      }
    }
  }

  // Line clear flash
  tetDrawLineClearFlash(ctx, g);

  // Draw particles
  tetDrawParticles(ctx);

  // Update HUD
  tetUpdateHUD(g);

  // Update side panels
  tetRenderHold(g);
  tetRenderNext(g);
}

function tetDrawCell(ctx, x, y, size, color, darkColor) {
  const s = size;
  const m = 1;
  // Main fill
  ctx.fillStyle = color;
  ctx.fillRect(x + m, y + m, s - m * 2, s - m * 2);
  // Inner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + m, y + m, s - m * 2, 2);
  ctx.fillRect(x + m, y + m, 2, s - m * 2);
  // Inner shadow
  ctx.fillStyle = darkColor;
  ctx.fillRect(x + m, y + s - m - 2, s - m * 2, 2);
  ctx.fillRect(x + s - m - 2, y + m, 2, s - m * 2);
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + m, y + m, s - m * 2, s - m * 2);
}

function tetRenderMiniPiece(ctx, canvas, type) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!type) return;

  const shape = TET_SHAPES[type][0];
  const rows = shape.length;
  const cols = shape[0].length;
  const cs = Math.min(Math.floor(canvas.width / cols), Math.floor(canvas.height / rows), 10);
  const ox = Math.floor((canvas.width - cols * cs) / 2);
  const oy = Math.floor((canvas.height - rows * cs) / 2);

  const color = TET_COLORS[type];
  const dark = TET_COLORS_DARK[type];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r][c]) {
        tetDrawCell(ctx, ox + c * cs, oy + r * cs, cs, color, dark);
      }
    }
  }
}

function tetRenderHold(g) {
  if (tetHoldCtx && tetHoldCanvas) {
    tetRenderMiniPiece(tetHoldCtx, tetHoldCanvas, g.holdPiece);
  }
}

function tetRenderNext(g) {
  for (let i = 0; i < tetNextCtxs.length; i++) {
    const type = g.nextQueue[i] || null;
    tetRenderMiniPiece(tetNextCtxs[i], tetNextCanvases[i], type);
  }
}

function tetUpdateHUD(g) {
  const scoreEl = document.getElementById('tetScoreValue');
  const levelEl = document.getElementById('tetLevelValue');
  const linesEl = document.getElementById('tetLinesValue');
  const timerEl = document.getElementById('tetTimerValue');

  if (scoreEl) scoreEl.textContent = g.score.toLocaleString();
  if (levelEl) levelEl.textContent = g.level;
  if (linesEl) {
    if (g.mode === 'sprint') {
      linesEl.textContent = Math.max(0, 40 - g.totalLines);
    } else {
      linesEl.textContent = g.totalLines;
    }
  }

  if (timerEl) {
    if (g.mode === 'ultra') {
      const remaining = Math.max(0, 120000 - g.elapsedTime);
      timerEl.textContent = tetFormatTime(remaining);
      timerEl.className = remaining < 15000 ? 'tet-hud-value tet-timer-warn' : 'tet-hud-value';
      // Update timer progress bar
      const fill = document.getElementById('tetTimerFill');
      if (fill) {
        const pct = (remaining / 120000) * 100;
        fill.style.width = pct + '%';
        fill.className = 'tet-timer-bar-fill' + (remaining < 15000 ? ' danger' : remaining < 30000 ? ' warn' : '');
      }
    } else if (g.mode === 'sprint') {
      timerEl.textContent = tetFormatTime(g.elapsedTime);
      timerEl.className = 'tet-hud-value';
    } else {
      timerEl.textContent = tetFormatTime(g.elapsedTime);
      timerEl.className = 'tet-hud-value';
    }
  }

  // Mode badge
  const modeEl = document.getElementById('tetModeBadge');
  if (modeEl) {
    const names = { marathon: 'MARATHON', sprint: 'SPRINT 40L', ultra: 'ULTRA 2:00', endless: 'ENDLESS' };
    modeEl.textContent = names[g.mode] || g.mode.toUpperCase();
  }
}

function tetFormatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2,'0')}.${centis.toString().padStart(2,'0')}`;
}

// ===== Action text =====
function tetShowActionText(g, text) {
  const wrap = document.querySelector('.tet-board-wrap');
  if (!wrap) return;

  // Remove old
  const old = wrap.querySelector('.tet-action-text');
  if (old) old.remove();

  const el = document.createElement('div');
  el.className = 'tet-action-text';
  el.textContent = text;
  wrap.appendChild(el);

  setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
}

// ===== Game Over rendering =====
function tetRenderGameOver(g, isVictory) {
  const overlay = document.getElementById('tetGameOver');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.className = isVictory ? 'tet-gameover tet-victory' : 'tet-gameover';

  const titleEl = document.getElementById('tetGoTitle');
  const subEl = document.getElementById('tetGoSubtitle');
  const scoreEl = document.getElementById('tetGoScore');
  const levelStat = document.getElementById('tetGoLevel');
  const linesStat = document.getElementById('tetGoLines');
  const comboStat = document.getElementById('tetGoCombo');
  const tetrisStat = document.getElementById('tetGoTetris');
  const bestEl = document.getElementById('tetGoBest');
  const timeStat = document.getElementById('tetGoTime');

  if (titleEl) titleEl.textContent = isVictory ? 'CLEAR!' : 'GAME OVER';
  if (subEl) {
    if (g.mode === 'sprint' && isVictory) {
      subEl.textContent = `40줄 클리어! ${tetFormatTime(g.elapsedTime)}`;
    } else if (g.mode === 'ultra') {
      subEl.textContent = '2분 타임 오버';
    } else if (g.mode === 'marathon' && isVictory) {
      subEl.textContent = '레벨 15 클리어!';
    } else {
      subEl.textContent = `레벨 ${g.level}에서 종료`;
    }
  }
  if (scoreEl) scoreEl.textContent = g.score.toLocaleString();
  if (levelStat) levelStat.textContent = 'Lv.' + g.level;
  if (linesStat) linesStat.textContent = g.totalLines;
  if (comboStat) comboStat.textContent = 'x' + g.maxCombo;
  if (tetrisStat) tetrisStat.textContent = g.tetrisCount;
  if (timeStat) timeStat.textContent = tetFormatTime(g.elapsedTime);
  if (bestEl) {
    if (g.newBest) {
      bestEl.textContent = '🏆 NEW BEST!';
      bestEl.style.display = 'block';
    } else {
      bestEl.textContent = 'BEST: ' + g.bestScore.toLocaleString();
      bestEl.style.display = 'block';
    }
  }
}

// ===== Mode selection =====
function tetShowModeSelect() {
  // Stop any running game
  if (tetAnimId) {
    cancelAnimationFrame(tetAnimId);
    tetAnimId = null;
  }
  tetGame = { phase: 'modeselect' };

  const modeOverlay = document.getElementById('tetModeOverlay');
  if (modeOverlay) modeOverlay.style.display = 'flex';
  const goOverlay = document.getElementById('tetGameOver');
  if (goOverlay) goOverlay.style.display = 'none';
  const pauseOverlay = document.getElementById('tetPause');
  if (pauseOverlay) pauseOverlay.style.display = 'none';
  const countdownOverlay = document.getElementById('tetCountdown');
  if (countdownOverlay) countdownOverlay.style.display = 'none';
}

function tetSelectMode(mode) {
  const startLevel = (mode === 'sprint' || mode === 'ultra') ? 1 : 1;
  tetStartGame(mode, startLevel);
}

function tetRetry() {
  if (!tetGame) return;
  const mode = tetGame.mode || 'marathon';
  tetStartGame(mode, tetGame.startLevel || 1);
}

function tetGoHome() {
  if (tetAnimId) {
    cancelAnimationFrame(tetAnimId);
    tetAnimId = null;
  }
  tetGame = null;
  _tetKeyState = {};

  // If in practice mode or multiplayer, go back appropriately
  if (typeof practiceMode !== 'undefined' && practiceMode) {
    showScreen('practiceSelect');
    return;
  }
  if (typeof state !== 'undefined' && state.roomCode) {
    showScreen('lobby');
    return;
  }
  showScreen('mainMenu');
}

// ===== Entry points (called from core.js) =====

// Host starts Tetris (multiplayer)
function startTetris() {
  if (typeof state === 'undefined' || !state.isHost) return;

  tetMulti = {
    phase: 'playing',
    mode: 'marathon',
    players: state.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      score: 0, lines: 0, level: 1, finished: false
    })),
  };

  broadcast({ type: 'game-start', game: 'tetris', state: tetMulti });
  showScreen('tetrisGame');
  tetShowModeSelect();
}

// Guest receives game start
function renderTetrisView(multiState) {
  if (multiState) tetMulti = multiState;
  tetShowModeSelect();
}

// Handle multiplayer messages
function processTetrisDead(msg) {
  if (!tetMulti) return;
  const p = tetMulti.players.find(pl => pl.id === msg.id);
  if (p) {
    p.score = msg.score || 0;
    p.lines = msg.lines || 0;
    p.level = msg.level || 1;
    p.finished = true;
  }

  // Check if all finished
  const allDone = tetMulti.players.every(pl => pl.finished);
  if (allDone) {
    const rankings = tetMulti.players.slice().sort((a, b) => b.score - a.score);
    broadcast({ type: 'tetris-rankings', rankings });
    tetShowRankings(rankings);
  }
}

function tetShowRankings(rankings) {
  if (!rankings || rankings.length === 0) return;
  const overlay = document.getElementById('tetGameOver');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const titleEl = document.getElementById('tetGoTitle');
  if (titleEl) titleEl.textContent = '🏆 결과';
  const subEl = document.getElementById('tetGoSubtitle');
  if (subEl) {
    subEl.innerHTML = rankings.map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `<div style="margin:4px 0;">${medal} ${p.name || '???'} - ${p.score || 0}점</div>`;
    }).join('');
  }
}

// ===== Cleanup =====
function tetCleanup() {
  if (tetAnimId) {
    cancelAnimationFrame(tetAnimId);
    tetAnimId = null;
  }
  tetUnbindKeys();
  tetGame = null;
  tetMulti = null;
  tetParticles = [];
  tetFireworks = [];
  _tetKeyState = {};
  clearTimeout(_tetTouchTimeout);
  clearInterval(_tetTouchInterval);
  if (_tetResizeHandler) {
    window.removeEventListener('resize', _tetResizeHandler);
    _tetResizeHandler = null;
  }
}

// ===== Particle & Firework System =====
const TET_FW_COLORS = [
  ['#ff5252','#ff8a80','#ffcdd2'],  // red
  ['#ffd740','#ffe57f','#fff8e1'],  // gold
  ['#69f0ae','#b9f6ca','#e8f5e9'],  // green
  ['#448aff','#82b1ff','#bbdefb'],  // blue
  ['#e040fb','#ea80fc','#f3e5f5'],  // purple
  ['#00d2ff','#80deea','#e0f7fa'],  // cyan
  ['#ffab40','#ffd180','#fff3e0'],  // orange
];

function tetSpawnFireworks(g, clearedRows, lines, isTSpin) {
  const cs = tetCellSize;
  const W = TET_COLS * cs;
  const H = TET_VISIBLE * cs;
  const offset = TET_ROWS - TET_VISIBLE;

  // --- Row-level sparks (always) ---
  let sparkCount = 10;
  if (lines >= 4 || isTSpin) sparkCount = 30;
  else if (lines >= 2) sparkCount = 18;

  for (const row of clearedRows) {
    const ry = (row - offset) * cs + cs / 2;
    for (let i = 0; i < Math.ceil(sparkCount / clearedRows.length); i++) {
      const vx = Math.random() * W;
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      tetParticles.push({
        x: vx, y: ry,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 1.5 + Math.random() * 1.5,
        color: TET_FW_COLORS[Math.floor(Math.random() * TET_FW_COLORS.length)][0],
        glow: false, trail: false
      });
    }
  }

  // --- Real firework rockets on combo ---
  if (g.combo >= 1) {
    let rockets = 1;
    if (g.combo >= 6) rockets = 5;
    else if (g.combo >= 4) rockets = 4;
    else if (g.combo >= 3) rockets = 3;
    else if (g.combo >= 2) rockets = 2;
    if (lines >= 4 || isTSpin) rockets += 2;

    for (let i = 0; i < rockets; i++) {
      const palette = TET_FW_COLORS[Math.floor(Math.random() * TET_FW_COLORS.length)];
      const startX = 20 + Math.random() * (W - 40);
      const startY = H + 5;
      const peakY = 15 + Math.random() * (H * 0.45);
      const riseTime = 0.3 + Math.random() * 0.25;
      tetFireworks.push({
        phase: 'rise',     // 'rise' → 'burst' → done
        x: startX, y: startY,
        targetY: peakY,
        riseTime: riseTime,
        riseTimer: 0,
        palette: palette,
        burstCount: 20 + Math.floor(Math.random() * 20),
        trailTimer: 0,
        delay: i * 0.08     // stagger rockets
      });
    }
  }

  // T-Spin radial burst
  if (isTSpin && g.currentPiece) {
    const px = (g.currentPiece.x + 1.5) * cs;
    const py = (g.currentPiece.y - offset + 1.5) * cs;
    tetSpawnBurst(px, py, 25, 120);
  }

  // Cap particles
  if (tetParticles.length > 300) tetParticles.splice(0, tetParticles.length - 300);
}

function tetSpawnBurst(x, y, count, spread) {
  const palette = TET_FW_COLORS[Math.floor(Math.random() * TET_FW_COLORS.length)];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.3;
    const speed = spread * 0.3 + Math.random() * spread * 0.7;
    tetParticles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      size: 2 + Math.random() * 2.5,
      color: palette[Math.floor(Math.random() * palette.length)],
      glow: true, trail: true
    });
  }
}

function tetUpdateParticles(dt) {
  const dtSec = dt / 1000;

  // --- Update firework rockets ---
  for (let i = tetFireworks.length - 1; i >= 0; i--) {
    const fw = tetFireworks[i];

    // Stagger delay
    if (fw.delay > 0) { fw.delay -= dtSec; continue; }

    if (fw.phase === 'rise') {
      fw.riseTimer += dtSec;
      const t = Math.min(fw.riseTimer / fw.riseTime, 1);
      const startY = tetCanvas ? tetCanvas.height + 5 : 400;
      // Ease-out rise
      fw.y = startY + (fw.targetY - startY) * (1 - Math.pow(1 - t, 2));

      // Trail sparks during rise
      fw.trailTimer += dtSec;
      if (fw.trailTimer > 0.02) {
        fw.trailTimer = 0;
        tetParticles.push({
          x: fw.x + (Math.random() - 0.5) * 3,
          y: fw.y,
          vx: (Math.random() - 0.5) * 15,
          vy: 15 + Math.random() * 25,
          life: 0.2 + Math.random() * 0.15,
          maxLife: 0.2 + Math.random() * 0.15,
          size: 1 + Math.random(),
          color: fw.palette[0],
          glow: true, trail: false
        });
      }

      // Peak → burst
      if (t >= 1) {
        fw.phase = 'done';
        tetSpawnBurst(fw.x, fw.y, fw.burstCount, 90 + Math.random() * 40);
      }
    }

    if (fw.phase === 'done') {
      tetFireworks.splice(i, 1);
    }
  }

  // --- Update particles ---
  for (let i = tetParticles.length - 1; i >= 0; i--) {
    const p = tetParticles[i];
    // Trail: spawn fading sub-particle
    if (p.trail && p.life > 0.2 && Math.random() < 0.3) {
      tetParticles.push({
        x: p.x, y: p.y,
        vx: 0, vy: 0,
        life: 0.15 + Math.random() * 0.1,
        maxLife: 0.15 + Math.random() * 0.1,
        size: p.size * 0.5,
        color: p.color,
        glow: false, trail: false
      });
    }
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.vy += 80 * dtSec; // gravity
    p.vx *= 0.97;
    p.life -= dtSec;
    if (p.life <= 0) {
      tetParticles.splice(i, 1);
    }
  }

  // Hard cap
  if (tetParticles.length > 400) tetParticles.splice(0, tetParticles.length - 400);
}

function tetDrawParticles(ctx) {
  // Draw firework rockets (rising phase)
  for (const fw of tetFireworks) {
    if (fw.phase !== 'rise' || fw.delay > 0) continue;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = fw.palette[0];
    ctx.shadowColor = fw.palette[0];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(fw.x, fw.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Draw particles
  for (const p of tetParticles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    if (p.glow) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6 + alpha * 6;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
    ctx.fill();
    if (p.glow) ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function tetDrawLineClearFlash(ctx, g) {
  if (g.lineClearFlash <= 0) return;
  const alpha = g.lineClearFlash / 150;
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.3})`;
  ctx.fillRect(0, 0, tetCanvas.width, tetCanvas.height);
}

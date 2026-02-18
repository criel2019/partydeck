// ============================
// JEWEL MATCH — 보석맞추기
// Match-3 Puzzle Game
// ============================

// ===== Constants =====
const JWL_ROWS = 8;
const JWL_COLS = 8;
const JWL_GEM_TYPES = 7;  // 0-6: basic gems
// Special gem types (stored as 10 + base color for flame/star/supernova, 100 for rainbow)
const JWL_FLAME = 10;   // 10-16: flame gems (10+color)
const JWL_STAR  = 20;   // 20-26: star gems (20+color)
const JWL_RAINBOW = 100;
const JWL_SUPERNOVA = 30; // 30-36: supernova gems (30+color)

const JWL_GEM_EMOJIS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⚪'];
const JWL_GEM_SHAPES = ['●', '◆', '⬡', '★', '▲', '♥', '■'];

// Scoring
const JWL_SCORE_3 = 30;
const JWL_SCORE_4 = 60;
const JWL_SCORE_LT = 80;
const JWL_SCORE_5 = 100;
const JWL_SCORE_6 = 150;

// Level thresholds
const JWL_LEVEL_THRESHOLDS = [
  0, 1000, 1000, 1000,    // Lv 1-3: 1000
  2500, 2500, 2500,        // Lv 4-6: 2500
  5000, 5000, 5000, 5000,  // Lv 7-10: 5000
  10000, 10000, 10000, 10000, 10000, // Lv 11-15: 10000
];

// Animation timing (ms)
const JWL_MATCH_DELAY = 300;
const JWL_FALL_DELAY = 180;
const JWL_FILL_DELAY = 200;
const JWL_SWAP_DELAY = 200;
const JWL_HINT_TIMEOUT = 5000;

// ===== State =====
let jwlState = null;
let jwlMulti = null;
let jwlAnimating = false;
let jwlHintTimer = null;
let jwlTimerInterval = null;
let jwlSelected = null;
let jwlDragStart = null;
let jwlGridEl = null;

// ===== Helpers =====
function jwlGetBaseColor(val) {
  if (val === JWL_RAINBOW) return -1;
  if (val >= JWL_SUPERNOVA) return val - JWL_SUPERNOVA;
  if (val >= JWL_STAR) return val - JWL_STAR;
  if (val >= JWL_FLAME) return val - JWL_FLAME;
  return val;
}

function jwlIsSpecial(val) {
  return val >= JWL_FLAME;
}

function jwlSpecialType(val) {
  if (val === JWL_RAINBOW) return 'rainbow';
  if (val >= JWL_SUPERNOVA) return 'supernova';
  if (val >= JWL_STAR) return 'star';
  if (val >= JWL_FLAME) return 'flame';
  return 'normal';
}

function jwlMatchesColor(a, b) {
  if (a === JWL_RAINBOW || b === JWL_RAINBOW) return false;
  return jwlGetBaseColor(a) === jwlGetBaseColor(b);
}

function jwlGetLevelThreshold(level) {
  if (level <= 0) return 1000;
  if (level <= 15) return JWL_LEVEL_THRESHOLDS[level] || 20000;
  return 20000;
}

function jwlComboMultiplier(combo) {
  if (combo >= 8) return 8;
  if (combo >= 5) return 5;
  if (combo >= 3) return 3;
  if (combo >= 2) return 2;
  return 1;
}

function jwlComboText(combo) {
  if (combo >= 8) return 'INCREDIBLE!';
  if (combo >= 5) return 'AMAZING!';
  if (combo >= 3) return 'GREAT!';
  return '';
}

// ===== Board initialization =====
function jwlInitBoard() {
  const grid = [];
  for (let r = 0; r < JWL_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < JWL_COLS; c++) {
      let gem;
      do {
        gem = Math.floor(Math.random() * JWL_GEM_TYPES);
      } while (
        (c >= 2 && grid[r][c - 1] === gem && grid[r][c - 2] === gem) ||
        (r >= 2 && grid[r - 1][c] === gem && grid[r - 2][c] === gem)
      );
      grid[r][c] = gem;
    }
  }
  return grid;
}

// ===== Match finding =====
function jwlFindMatches(grid) {
  const matched = new Set();
  const matchGroups = [];

  // Horizontal scan
  for (let r = 0; r < JWL_ROWS; r++) {
    let c = 0;
    while (c < JWL_COLS) {
      const val = grid[r][c];
      if (val === -1 || val === JWL_RAINBOW) { c++; continue; }
      const baseColor = jwlGetBaseColor(val);
      let end = c + 1;
      while (end < JWL_COLS && jwlGetBaseColor(grid[r][end]) === baseColor && grid[r][end] !== -1 && grid[r][end] !== JWL_RAINBOW) {
        end++;
      }
      const len = end - c;
      if (len >= 3) {
        const group = [];
        for (let i = c; i < end; i++) {
          matched.add(r * JWL_COLS + i);
          group.push({ r, c: i });
        }
        matchGroups.push({ cells: group, dir: 'h', len });
      }
      c = end;
    }
  }

  // Vertical scan
  for (let c = 0; c < JWL_COLS; c++) {
    let r = 0;
    while (r < JWL_ROWS) {
      const val = grid[r][c];
      if (val === -1 || val === JWL_RAINBOW) { r++; continue; }
      const baseColor = jwlGetBaseColor(val);
      let end = r + 1;
      while (end < JWL_ROWS && jwlGetBaseColor(grid[end][c]) === baseColor && grid[end][c] !== -1 && grid[end][c] !== JWL_RAINBOW) {
        end++;
      }
      const len = end - r;
      if (len >= 3) {
        const group = [];
        for (let i = r; i < end; i++) {
          matched.add(i * JWL_COLS + c);
          group.push({ r: i, c });
        }
        matchGroups.push({ cells: group, dir: 'v', len });
      }
      r = end;
    }
  }

  return { matched, matchGroups };
}

// Determine special gem creation from match groups
function jwlDetermineSpecials(matchGroups, grid, swapPos) {
  const specials = []; // { r, c, type }
  const allMatched = new Set();
  matchGroups.forEach(g => g.cells.forEach(cell => allMatched.add(cell.r * JWL_COLS + cell.c)));

  // Check for L/T shapes: find overlapping horizontal+vertical groups
  const hGroups = matchGroups.filter(g => g.dir === 'h');
  const vGroups = matchGroups.filter(g => g.dir === 'v');

  const usedGroups = new Set();

  for (let hi = 0; hi < hGroups.length; hi++) {
    for (let vi = 0; vi < vGroups.length; vi++) {
      if (usedGroups.has(hi) || usedGroups.has('v' + vi)) continue;
      const hg = hGroups[hi];
      const vg = vGroups[vi];
      // Check if they share a cell
      const hCells = new Set(hg.cells.map(c => c.r * JWL_COLS + c.c));
      const intersection = vg.cells.find(c => hCells.has(c.r * JWL_COLS + c.c));
      if (intersection) {
        const totalCells = hg.len + vg.len - 1; // minus shared cell
        if (totalCells >= 5) {
          // L/T shape → Star Gem
          const color = jwlGetBaseColor(grid[intersection.r][intersection.c]);
          specials.push({ r: intersection.r, c: intersection.c, val: JWL_STAR + color });
          usedGroups.add(hi);
          usedGroups.add('v' + vi);
        }
      }
    }
  }

  // Process remaining groups
  matchGroups.forEach((g, i) => {
    const isH = g.dir === 'h';
    const gIdx = isH ? i : 'v' + (i - hGroups.length);
    if (usedGroups.has(isH ? i : gIdx)) return;

    if (g.len >= 6) {
      // Supernova
      const pos = jwlSpecialPosition(g, swapPos);
      const color = jwlGetBaseColor(grid[g.cells[0].r][g.cells[0].c]);
      specials.push({ r: pos.r, c: pos.c, val: JWL_SUPERNOVA + color });
    } else if (g.len === 5) {
      // Rainbow
      const pos = jwlSpecialPosition(g, swapPos);
      specials.push({ r: pos.r, c: pos.c, val: JWL_RAINBOW });
    } else if (g.len === 4) {
      // Flame (horizontal match → vertical explosion, vice versa)
      const pos = jwlSpecialPosition(g, swapPos);
      const color = jwlGetBaseColor(grid[g.cells[0].r][g.cells[0].c]);
      specials.push({ r: pos.r, c: pos.c, val: JWL_FLAME + color });
    }
  });

  return specials;
}

// Pick where the special gem appears (prefer the swapped cell position)
function jwlSpecialPosition(group, swapPos) {
  if (swapPos) {
    const found = group.cells.find(c => c.r === swapPos.r && c.c === swapPos.c);
    if (found) return found;
  }
  return group.cells[Math.floor(group.cells.length / 2)];
}

// ===== Special gem activation =====
function jwlActivateSpecial(grid, r, c, toRemove) {
  const val = grid[r][c];
  const type = jwlSpecialType(val);

  if (type === 'flame') {
    // Remove entire row or column (alternate based on position for variety)
    const color = jwlGetBaseColor(val);
    // Check if it was created from horizontal or vertical match
    // For simplicity, alternate: even row=horizontal clear, odd=vertical
    if (r % 2 === 0) {
      for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(r * JWL_COLS + cc);
    } else {
      for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + c);
    }
  } else if (type === 'star') {
    // 3x3 area
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < JWL_ROWS && nc >= 0 && nc < JWL_COLS) {
          toRemove.add(nr * JWL_COLS + nc);
        }
      }
    }
  } else if (type === 'supernova') {
    // Row + Column + 3x3
    for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(r * JWL_COLS + cc);
    for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + c);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < JWL_ROWS && nc >= 0 && nc < JWL_COLS) {
          toRemove.add(nr * JWL_COLS + nc);
        }
      }
    }
  } else if (type === 'rainbow') {
    // This shouldn't be called directly - handled in swap
  }
}

// Rainbow activation: remove all gems of a target color
function jwlActivateRainbow(grid, targetColor, toRemove) {
  for (let r = 0; r < JWL_ROWS; r++) {
    for (let c = 0; c < JWL_COLS; c++) {
      if (jwlGetBaseColor(grid[r][c]) === targetColor) {
        toRemove.add(r * JWL_COLS + c);
      }
    }
  }
}

// Special + Special combination effects
function jwlSpecialCombo(grid, r1, c1, r2, c2) {
  const v1 = grid[r1][c1], v2 = grid[r2][c2];
  const t1 = jwlSpecialType(v1), t2 = jwlSpecialType(v2);
  const toRemove = new Set();

  // Sort types for easier matching
  const types = [t1, t2].sort();
  const key = types.join('+');

  if (key === 'rainbow+rainbow') {
    // Full board clear
    for (let r = 0; r < JWL_ROWS; r++)
      for (let c = 0; c < JWL_COLS; c++)
        toRemove.add(r * JWL_COLS + c);
    return { toRemove, score: 500, text: 'PERFECT CLEAR!' };
  }

  if (types.includes('rainbow')) {
    const other = t1 === 'rainbow' ? v2 : v1;
    const otherType = t1 === 'rainbow' ? t2 : t1;
    const targetColor = jwlGetBaseColor(other);

    if (otherType === 'flame') {
      // All of target color become flame, then explode
      for (let r = 0; r < JWL_ROWS; r++)
        for (let c = 0; c < JWL_COLS; c++)
          if (jwlGetBaseColor(grid[r][c]) === targetColor) {
            toRemove.add(r * JWL_COLS + c);
            // Also clear that row/column
            for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(r * JWL_COLS + cc);
          }
      return { toRemove, score: 300, text: 'RAINBOW FLAME!' };
    }
    if (otherType === 'star') {
      // All of target color become star, then explode 3x3
      for (let r = 0; r < JWL_ROWS; r++)
        for (let c = 0; c < JWL_COLS; c++)
          if (jwlGetBaseColor(grid[r][c]) === targetColor) {
            for (let dr = -1; dr <= 1; dr++)
              for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < JWL_ROWS && nc >= 0 && nc < JWL_COLS)
                  toRemove.add(nr * JWL_COLS + nc);
              }
          }
      return { toRemove, score: 300, text: 'RAINBOW STAR!' };
    }
    if (otherType === 'supernova') {
      // Rainbow + Supernova = clear everything of that color + cross for each
      for (let r = 0; r < JWL_ROWS; r++)
        for (let c = 0; c < JWL_COLS; c++)
          if (jwlGetBaseColor(grid[r][c]) === targetColor) {
            for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(r * JWL_COLS + cc);
            for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + c);
          }
      return { toRemove, score: 400, text: 'ANNIHILATOR!' };
    }
    // Rainbow + normal special (shouldn't happen, but fallback)
    jwlActivateRainbow(grid, targetColor, toRemove);
    return { toRemove, score: 200 };
  }

  if (key === 'flame+flame') {
    // Cross explosion (row + column)
    const mr = Math.floor((r1 + r2) / 2), mc = Math.floor((c1 + c2) / 2);
    for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(mr * JWL_COLS + cc);
    for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + mc);
    return { toRemove, score: 150, text: 'CROSS BLAST!' };
  }

  if (key === 'flame+star') {
    // 3 rows or 3 columns cleared
    const mr = r1, mc = c1;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = mr + dr;
      if (rr >= 0 && rr < JWL_ROWS) {
        for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(rr * JWL_COLS + cc);
      }
    }
    for (let dc = -1; dc <= 1; dc++) {
      const cc = mc + dc;
      if (cc >= 0 && cc < JWL_COLS) {
        for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + cc);
      }
    }
    return { toRemove, score: 200, text: 'MEGA BLAST!' };
  }

  if (key === 'flame+supernova' || key === 'star+supernova' || key === 'supernova+supernova') {
    // Massive 5x5 + cross
    const mr = r1, mc = c1;
    for (let cc = 0; cc < JWL_COLS; cc++) toRemove.add(mr * JWL_COLS + cc);
    for (let rr = 0; rr < JWL_ROWS; rr++) toRemove.add(rr * JWL_COLS + mc);
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const nr = mr + dr, nc = mc + dc;
        if (nr >= 0 && nr < JWL_ROWS && nc >= 0 && nc < JWL_COLS)
          toRemove.add(nr * JWL_COLS + nc);
      }
    return { toRemove, score: 300, text: 'SUPERNOVA!' };
  }

  if (key === 'star+star') {
    // 5x5 explosion
    const mr = r1, mc = c1;
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const nr = mr + dr, nc = mc + dc;
        if (nr >= 0 && nr < JWL_ROWS && nc >= 0 && nc < JWL_COLS)
          toRemove.add(nr * JWL_COLS + nc);
      }
    return { toRemove, score: 200, text: 'MEGA STAR!' };
  }

  return null;
}

// ===== Valid move check =====
function jwlHasValidMoves(grid) {
  for (let r = 0; r < JWL_ROWS; r++) {
    for (let c = 0; c < JWL_COLS; c++) {
      // Try swap right
      if (c + 1 < JWL_COLS) {
        jwlSwapInGrid(grid, r, c, r, c + 1);
        const { matched } = jwlFindMatches(grid);
        jwlSwapInGrid(grid, r, c, r, c + 1);
        if (matched.size > 0 || grid[r][c] === JWL_RAINBOW || grid[r][c + 1] === JWL_RAINBOW) return { r1: r, c1: c, r2: r, c2: c + 1 };
      }
      // Try swap down
      if (r + 1 < JWL_ROWS) {
        jwlSwapInGrid(grid, r, c, r + 1, c);
        const { matched } = jwlFindMatches(grid);
        jwlSwapInGrid(grid, r, c, r + 1, c);
        if (matched.size > 0 || grid[r][c] === JWL_RAINBOW || grid[r + 1][c] === JWL_RAINBOW) return { r1: r, c1: c, r2: r + 1, c2: c };
      }
    }
  }
  return null;
}

function jwlSwapInGrid(grid, r1, c1, r2, c2) {
  const tmp = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = tmp;
}

// ===== Gravity / Fall =====
function jwlApplyGravity(grid) {
  const falls = []; // { r, c, fromR }
  for (let c = 0; c < JWL_COLS; c++) {
    let writeRow = JWL_ROWS - 1;
    for (let r = JWL_ROWS - 1; r >= 0; r--) {
      if (grid[r][c] !== -1) {
        if (r !== writeRow) {
          falls.push({ r: writeRow, c, fromR: r, val: grid[r][c] });
          grid[writeRow][c] = grid[r][c];
          grid[r][c] = -1;
        }
        writeRow--;
      }
    }
    // Fill empty top cells
    for (let r = writeRow; r >= 0; r--) {
      const newGem = Math.floor(Math.random() * JWL_GEM_TYPES);
      grid[r][c] = newGem;
      falls.push({ r, c, fromR: r - (writeRow - r + 1), val: newGem, isNew: true });
    }
  }
  return falls;
}

// ===== Reshuffle =====
function jwlReshuffle(grid) {
  // Collect all non-special gems
  const specials = [];
  const normals = [];
  for (let r = 0; r < JWL_ROWS; r++) {
    for (let c = 0; c < JWL_COLS; c++) {
      if (jwlIsSpecial(grid[r][c])) {
        specials.push({ r, c, val: grid[r][c] });
      } else {
        normals.push(grid[r][c]);
      }
    }
  }

  // Shuffle normals
  for (let i = normals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normals[i], normals[j]] = [normals[j], normals[i]];
  }

  // Place back
  let ni = 0;
  for (let r = 0; r < JWL_ROWS; r++) {
    for (let c = 0; c < JWL_COLS; c++) {
      if (!jwlIsSpecial(grid[r][c])) {
        grid[r][c] = normals[ni++];
      }
    }
  }

  // Check no matches exist after shuffle
  let { matched } = jwlFindMatches(grid);
  let attempts = 0;
  while (matched.size > 0 && attempts < 100) {
    // Re-init those cells
    matched.forEach(idx => {
      const r = Math.floor(idx / JWL_COLS), c = idx % JWL_COLS;
      if (!jwlIsSpecial(grid[r][c])) {
        grid[r][c] = Math.floor(Math.random() * JWL_GEM_TYPES);
      }
    });
    ({ matched } = jwlFindMatches(grid));
    attempts++;
  }
}

// ===== Sound Effects (simple Web Audio) =====
let jwlAudioCtx = null;

function jwlPlaySound(type, combo) {
  try {
    if (!jwlAudioCtx) jwlAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = jwlAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.12, now);

    if (type === 'select') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'swap') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(660, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'invalid') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'match') {
      const baseFreq = 523 + (combo || 0) * 60;  // pitch rises with combo
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.linearRampToValueAtTime(baseFreq * 1.5, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'special') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.linearRampToValueAtTime(1320, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'levelup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      osc.frequency.setValueAtTime(1047, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) { /* audio not available */ }
}

// ===== Start / Init =====
function startJewel() {
  if (typeof state === 'undefined' || !state.isHost) return;

  jwlMulti = {
    phase: 'playing',
    players: state.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      score: 0, level: 1, finished: false
    })),
  };

  broadcast({ type: 'game-start', game: 'jewel', state: jwlMulti });
  showScreen('jewelGame');
  jwlShowModeSelect();
}

function renderJewelView(multiState) {
  if (multiState) jwlMulti = multiState;
  jwlShowModeSelect();
}

// ===== Mode Select Screen =====
function jwlShowModeSelect() {
  const el = document.getElementById('jewelGame');
  const overlay = el.querySelector('.jwl-title-overlay');
  const gameOver = el.querySelector('.jwl-gameover-overlay');
  const pause = el.querySelector('.jwl-pause-overlay');
  if (overlay) overlay.style.display = 'flex';
  if (gameOver) gameOver.classList.remove('active');
  if (pause) pause.classList.remove('active');
}

function jwlStartMode(mode) {
  const overlay = document.querySelector('#jewelGame .jwl-title-overlay');
  if (overlay) overlay.style.display = 'none';

  jwlState = {
    grid: jwlInitBoard(),
    score: 0,
    level: 1,
    levelScore: 0,
    combo: 0,
    maxCombo: 0,
    gemsCleared: 0,
    specialsUsed: 0,
    mode: mode,
    movesLeft: mode === 'moves' ? 30 : -1,
    timeLeft: mode === 'timed' ? 120 : -1,
    gameState: 'playing',
    reshuffles: 0,
    bestScore: parseInt(localStorage.getItem('jwl_best_' + mode) || '0'),
  };

  jwlSelected = null;
  jwlAnimating = false;
  jwlGridEl = document.getElementById('jwlGrid');

  // Calculate cell size
  jwlCalcCellSize();
  window.addEventListener('resize', jwlCalcCellSize);

  jwlRender();

  // Start timer for timed mode
  if (mode === 'timed') {
    jwlStartTimer();
  }

  // Reset hint timer
  jwlResetHintTimer();
}

function jwlCalcCellSize() {
  const container = document.querySelector('.jwl-grid-area');
  if (!container) return;
  const available = Math.min(container.clientWidth - 24, container.clientHeight - 16);
  const cellSize = Math.floor((available - 8 - 14) / 8); // 8 gaps of 2px + 8px padding
  const clamped = Math.min(Math.max(cellSize, 32), 52);
  document.getElementById('jewelGame').style.setProperty('--jwl-cell-size', clamped + 'px');
}

// ===== Timer =====
function jwlStartTimer() {
  if (jwlTimerInterval) clearInterval(jwlTimerInterval);
  jwlTimerInterval = setInterval(() => {
    if (!jwlState || jwlState.gameState !== 'playing') {
      clearInterval(jwlTimerInterval);
      return;
    }
    jwlState.timeLeft -= 0.1;
    if (jwlState.timeLeft <= 0) {
      jwlState.timeLeft = 0;
      clearInterval(jwlTimerInterval);
      jwlGameOver();
    }
    jwlUpdateHUD();
  }, 100);
}

// ===== Rendering =====
function jwlRender() {
  if (!jwlState || !jwlGridEl) return;
  jwlRenderGrid();
  jwlUpdateHUD();
}

function jwlRenderGrid() {
  const grid = jwlState.grid;
  let html = '';
  for (let r = 0; r < JWL_ROWS; r++) {
    for (let c = 0; c < JWL_COLS; c++) {
      const val = grid[r][c];
      const baseColor = jwlGetBaseColor(val);
      const special = jwlSpecialType(val);
      const colorClass = baseColor >= 0 ? `jwl-gem-${baseColor}` : '';
      const specialClass = special !== 'normal' ? `jwl-gem-${special}` : '';
      const selectedClass = (jwlSelected && jwlSelected.r === r && jwlSelected.c === c) ? 'selected' : '';

      let shape = '';
      if (val === JWL_RAINBOW) {
        shape = '🌈';
      } else if (baseColor >= 0 && baseColor < JWL_GEM_SHAPES.length) {
        shape = JWL_GEM_SHAPES[baseColor];
      }

      let specialIcon = '';
      if (special === 'flame') specialIcon = '🔥';
      else if (special === 'star') specialIcon = '💥';
      else if (special === 'supernova') specialIcon = '⚡';

      html += `<div class="jwl-cell ${colorClass} ${specialClass} ${selectedClass}"
                    data-r="${r}" data-c="${c}"
                    ontouchstart="jwlTouchStart(event)"
                    ontouchmove="jwlTouchMove(event)"
                    ontouchend="jwlTouchEnd(event)"
                    onmousedown="jwlMouseDown(event)"
                    onmouseup="jwlMouseUp(event)">
                <span class="jwl-gem-shape">${specialIcon || shape}</span>
              </div>`;
    }
  }
  jwlGridEl.innerHTML = html;
}

function jwlUpdateHUD() {
  if (!jwlState) return;
  const scoreEl = document.getElementById('jwlScoreValue');
  const comboEl = document.getElementById('jwlComboBadge');
  const levelEl = document.getElementById('jwlLevelLabel');
  const progressEl = document.getElementById('jwlProgressFill');
  const modeEl = document.getElementById('jwlModeInfo');

  if (scoreEl) scoreEl.textContent = jwlState.score.toLocaleString();

  if (comboEl) {
    if (jwlState.combo > 1) {
      comboEl.textContent = `⛓️ x${jwlState.combo}`;
      comboEl.classList.add('active');
    } else {
      comboEl.classList.remove('active');
    }
  }

  if (levelEl) levelEl.textContent = `LEVEL ${jwlState.level}`;
  if (progressEl) {
    const threshold = jwlGetLevelThreshold(jwlState.level);
    const pct = Math.min(100, (jwlState.levelScore / threshold) * 100);
    progressEl.style.width = pct + '%';
  }

  const progressPctEl = document.getElementById('jwlProgressPct');
  if (progressPctEl) {
    const threshold = jwlGetLevelThreshold(jwlState.level);
    const pct = Math.min(100, Math.floor((jwlState.levelScore / threshold) * 100));
    progressPctEl.textContent = pct + '%';
  }

  if (modeEl) {
    if (jwlState.mode === 'moves') {
      modeEl.innerHTML = `<span class="jwl-mode-badge jwl-mode-moves">MOVES: ${jwlState.movesLeft}</span>`;
    } else if (jwlState.mode === 'timed') {
      const mins = Math.floor(jwlState.timeLeft / 60);
      const secs = Math.floor(jwlState.timeLeft % 60);
      modeEl.innerHTML = `<span class="jwl-mode-badge jwl-mode-timed">⏱ ${mins}:${secs.toString().padStart(2, '0')}</span>`;
    } else if (jwlState.mode === 'zen') {
      modeEl.innerHTML = `<span class="jwl-mode-badge jwl-mode-zen">ZEN ∞</span>`;
    } else {
      modeEl.innerHTML = `<span class="jwl-mode-badge jwl-mode-classic">CLASSIC</span>`;
    }
  }
}

// ===== Input Handling =====
function jwlTouchStart(e) {
  if (jwlAnimating || !jwlState || jwlState.gameState !== 'playing') return;
  e.preventDefault();
  const touch = e.touches[0];
  const cell = e.currentTarget;
  jwlDragStart = {
    r: parseInt(cell.dataset.r),
    c: parseInt(cell.dataset.c),
    x: touch.clientX,
    y: touch.clientY
  };
}

function jwlTouchMove(e) {
  if (!jwlDragStart || jwlAnimating) return;
  e.preventDefault();
  const touch = e.touches[0];
  const dx = touch.clientX - jwlDragStart.x;
  const dy = touch.clientY - jwlDragStart.y;
  const threshold = 20;

  if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
    let dr = 0, dc = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      dc = dx > 0 ? 1 : -1;
    } else {
      dr = dy > 0 ? 1 : -1;
    }
    const r1 = jwlDragStart.r;
    const c1 = jwlDragStart.c;
    const r2 = r1 + dr;
    const c2 = c1 + dc;
    jwlDragStart = null;
    if (r2 >= 0 && r2 < JWL_ROWS && c2 >= 0 && c2 < JWL_COLS) {
      jwlTrySwap(r1, c1, r2, c2);
    }
  }
}

function jwlTouchEnd(e) {
  if (!jwlDragStart || jwlAnimating) { jwlDragStart = null; return; }
  // Tap-tap mode
  const cell = e.currentTarget;
  const r = parseInt(cell.dataset.r);
  const c = parseInt(cell.dataset.c);
  jwlDragStart = null;
  jwlHandleTap(r, c);
}

function jwlMouseDown(e) {
  if (jwlAnimating || !jwlState || jwlState.gameState !== 'playing') return;
  const cell = e.currentTarget;
  jwlDragStart = {
    r: parseInt(cell.dataset.r),
    c: parseInt(cell.dataset.c),
    x: e.clientX,
    y: e.clientY
  };
}

function jwlMouseUp(e) {
  if (!jwlDragStart || jwlAnimating) { jwlDragStart = null; return; }
  const cell = e.currentTarget;
  const r = parseInt(cell.dataset.r);
  const c = parseInt(cell.dataset.c);
  const dx = e.clientX - jwlDragStart.x;
  const dy = e.clientY - jwlDragStart.y;
  const startR = jwlDragStart.r, startC = jwlDragStart.c;
  jwlDragStart = null;

  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    // Drag
    let dr = 0, dc = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      dc = dx > 0 ? 1 : -1;
    } else {
      dr = dy > 0 ? 1 : -1;
    }
    const r2 = startR + dr, c2 = startC + dc;
    if (r2 >= 0 && r2 < JWL_ROWS && c2 >= 0 && c2 < JWL_COLS) {
      jwlTrySwap(startR, startC, r2, c2);
    }
  } else {
    // Click/tap
    jwlHandleTap(r, c);
  }
}

function jwlHandleTap(r, c) {
  if (jwlAnimating || !jwlState || jwlState.gameState !== 'playing') return;

  if (jwlSelected) {
    const sr = jwlSelected.r, sc = jwlSelected.c;
    // Check if adjacent
    const dr = Math.abs(r - sr), dc = Math.abs(c - sc);
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      jwlSelected = null;
      jwlTrySwap(sr, sc, r, c);
    } else {
      // Select new
      jwlSelected = { r, c };
      jwlPlaySound('select');
      jwlRenderGrid();
    }
  } else {
    jwlSelected = { r, c };
    jwlPlaySound('select');
    jwlRenderGrid();
  }
  jwlResetHintTimer();
}

// ===== Swap Logic =====
async function jwlTrySwap(r1, c1, r2, c2) {
  if (jwlAnimating || !jwlState || jwlState.gameState !== 'playing') return;
  jwlAnimating = true;
  jwlSelected = null;
  jwlClearHint();

  const grid = jwlState.grid;
  const v1 = grid[r1][c1], v2 = grid[r2][c2];

  // Check special + special combo
  if (jwlIsSpecial(v1) && jwlIsSpecial(v2)) {
    const combo = jwlSpecialCombo(grid, r1, c1, r2, c2);
    if (combo) {
      jwlPlaySound('special');
      jwlSwapInGrid(grid, r1, c1, r2, c2);
      await jwlAnimateSwap(r1, c1, r2, c2);

      jwlState.specialsUsed += 2;
      grid[r1][c1] = -1;
      grid[r2][c2] = -1;

      // Remove cells
      combo.toRemove.forEach(idx => {
        const rr = Math.floor(idx / JWL_COLS), cc = idx % JWL_COLS;
        if (grid[rr][cc] !== -1) {
          jwlState.gemsCleared++;
          grid[rr][cc] = -1;
        }
      });

      jwlState.score += combo.score;
      jwlState.levelScore += combo.score;
      if (combo.text) jwlShowComboText(combo.text);

      await jwlAnimateMatches(combo.toRemove);
      if (jwlState.mode === 'moves') jwlState.movesLeft--;
      await jwlProcessCascade();
      await jwlCheckGameState();
      jwlAnimating = false;
      jwlResetHintTimer();
      return;
    }
  }

  // Rainbow + any gem
  if (v1 === JWL_RAINBOW || v2 === JWL_RAINBOW) {
    jwlPlaySound('special');
    jwlSwapInGrid(grid, r1, c1, r2, c2);
    await jwlAnimateSwap(r1, c1, r2, c2);

    // After swap: rainbow moved to the other position
    const rainbowR = v1 === JWL_RAINBOW ? r2 : r1;
    const rainbowC = v1 === JWL_RAINBOW ? c2 : c1;
    const targetVal = v1 === JWL_RAINBOW ? v2 : v1;
    const targetColor = jwlGetBaseColor(targetVal);

    jwlState.specialsUsed++;
    const toRemove = new Set();
    toRemove.add(rainbowR * JWL_COLS + rainbowC);
    jwlActivateRainbow(grid, targetColor, toRemove);

    toRemove.forEach(idx => {
      const rr = Math.floor(idx / JWL_COLS), cc = idx % JWL_COLS;
      if (grid[rr][cc] !== -1) { jwlState.gemsCleared++; grid[rr][cc] = -1; }
    });

    const score = toRemove.size * 15;
    jwlState.score += score;
    jwlState.levelScore += score;
    jwlShowComboText('RAINBOW!');

    await jwlAnimateMatches(toRemove);
    if (jwlState.mode === 'moves') jwlState.movesLeft--;
    jwlState.combo = 1;
    await jwlProcessCascade();
    await jwlCheckGameState();
    jwlAnimating = false;
    jwlResetHintTimer();
    return;
  }

  // Normal swap
  jwlSwapInGrid(grid, r1, c1, r2, c2);
  const { matched, matchGroups } = jwlFindMatches(grid);

  if (matched.size === 0) {
    // Invalid swap - reverse
    jwlSwapInGrid(grid, r1, c1, r2, c2);
    jwlPlaySound('invalid');
    await jwlAnimateInvalidSwap(r1, c1, r2, c2);
    jwlAnimating = false;
    jwlResetHintTimer();
    return;
  }

  // Valid swap
  jwlPlaySound('swap');
  await jwlAnimateSwap(r1, c1, r2, c2);

  if (jwlState.mode === 'moves') jwlState.movesLeft--;
  jwlState.combo = 0;

  await jwlProcessMatchAndCascade(matched, matchGroups, { r: r1, c: c1 });
  await jwlCheckGameState();
  jwlAnimating = false;
  jwlResetHintTimer();
}

// Process match, create specials, cascade
async function jwlProcessMatchAndCascade(matched, matchGroups, swapPos) {
  const grid = jwlState.grid;
  jwlState.combo++;
  if (jwlState.combo > jwlState.maxCombo) jwlState.maxCombo = jwlState.combo;

  // Determine specials
  const specials = jwlDetermineSpecials(matchGroups, grid, swapPos);

  // Calculate score
  let baseScore = 0;
  matchGroups.forEach(g => {
    if (g.len >= 6) baseScore += JWL_SCORE_6;
    else if (g.len === 5) baseScore += JWL_SCORE_5;
    else if (g.len === 4) baseScore += JWL_SCORE_4;
    else baseScore += JWL_SCORE_3;
  });
  const mult = jwlComboMultiplier(jwlState.combo);
  const score = baseScore * mult;
  jwlState.score += score;
  jwlState.levelScore += score;

  // Show combo text
  const comboTxt = jwlComboText(jwlState.combo);
  if (comboTxt) jwlShowComboText(comboTxt);

  // Check for special gem activations in matched cells
  const toRemove = new Set(matched);
  const activatedSpecials = [];
  matched.forEach(idx => {
    const r = Math.floor(idx / JWL_COLS), c = idx % JWL_COLS;
    if (jwlIsSpecial(grid[r][c])) {
      activatedSpecials.push({ r, c, val: grid[r][c] });
      jwlState.specialsUsed++;
    }
  });

  // Activate any matched special gems
  activatedSpecials.forEach(s => {
    jwlActivateSpecial(grid, s.r, s.c, toRemove);
  });

  // Remove matched cells
  jwlPlaySound('match', jwlState.combo);
  // Build set of special positions to skip
  const specialPos = new Set(specials.map(s => s.r * JWL_COLS + s.c));
  toRemove.forEach(idx => {
    if (specialPos.has(idx)) return; // don't remove cells where specials will go
    const r = Math.floor(idx / JWL_COLS), c = idx % JWL_COLS;
    if (grid[r][c] !== -1) jwlState.gemsCleared++;
    grid[r][c] = -1;
  });

  // Place specials (these cells keep the special gem instead of being cleared)
  specials.forEach(s => {
    jwlState.gemsCleared++; // count the original gem as cleared
    grid[s.r][s.c] = s.val;
    jwlPlaySound('special');
  });

  await jwlAnimateMatches(toRemove);

  // Show score popup
  jwlShowScorePopup(score, swapPos);

  // Check level up
  jwlCheckLevelUp();

  // Cascade
  await jwlProcessCascade();
}

async function jwlProcessCascade() {
  const grid = jwlState.grid;

  // Apply gravity
  const falls = jwlApplyGravity(grid);
  if (falls.length > 0) {
    jwlRenderGrid();
    await jwlDelay(JWL_FALL_DELAY);
  }

  // Check for new matches
  const { matched, matchGroups } = jwlFindMatches(grid);
  if (matched.size > 0) {
    await jwlProcessMatchAndCascade(matched, matchGroups, null);
  } else {
    jwlState.combo = 0;
    jwlRender();
  }
}

// ===== Game State Checks =====
async function jwlCheckGameState() {
  if (!jwlState || jwlState.gameState !== 'playing') return;

  // Moves mode: check if out of moves
  if (jwlState.mode === 'moves' && jwlState.movesLeft <= 0) {
    jwlGameOver();
    return;
  }

  // Check for valid moves
  const validMove = jwlHasValidMoves(jwlState.grid);
  if (!validMove) {
    if (jwlState.mode === 'zen') {
      await jwlDoReshuffle();
    } else if (jwlState.reshuffles < 1) {
      jwlState.reshuffles++;
      await jwlDoReshuffle();
    } else {
      jwlGameOver();
    }
  }
}

function jwlCheckLevelUp() {
  if (!jwlState) return;
  const threshold = jwlGetLevelThreshold(jwlState.level);
  if (jwlState.levelScore >= threshold) {
    jwlState.levelScore -= threshold;
    jwlState.level++;
    jwlPlaySound('levelup');
    jwlShowLevelUp();
  }
}

async function jwlDoReshuffle() {
  jwlReshuffle(jwlState.grid);
  jwlShowReshuffleEffect();
  await jwlDelay(800);
  jwlRender();

  // Re-check valid moves after reshuffle
  if (!jwlHasValidMoves(jwlState.grid)) {
    if (jwlState.mode === 'zen') {
      await jwlDoReshuffle(); // try again
    } else {
      jwlGameOver();
    }
  }
}

// ===== Game Over =====
function jwlGameOver() {
  if (!jwlState) return;
  jwlState.gameState = 'gameover';
  if (jwlTimerInterval) clearInterval(jwlTimerInterval);
  if (jwlHintTimer) clearTimeout(jwlHintTimer);

  const isNewBest = jwlState.score > jwlState.bestScore;
  if (isNewBest) {
    localStorage.setItem('jwl_best_' + jwlState.mode, jwlState.score.toString());
    jwlState.bestScore = jwlState.score;
  }

  // Send death message for multiplayer
  if (typeof state !== 'undefined' && typeof broadcast === 'function') {
    const msg = {
      type: 'jewel-dead',
      id: state.myId,
      score: jwlState.score,
      level: jwlState.level,
    };
    if (state.isHost) {
      processJewelDead(msg);
    } else {
      sendToHost(msg);
    }
  }

  // Show game over
  setTimeout(() => jwlShowGameOver(isNewBest), 500);
}

function jwlShowGameOver(isNewBest) {
  const overlay = document.querySelector('#jewelGame .jwl-gameover-overlay');
  if (!overlay) return;

  overlay.querySelector('.jwl-go-score').textContent = jwlState.score.toLocaleString();
  overlay.querySelector('.jwl-go-sub').textContent = `레벨 ${jwlState.level} · ${jwlState.mode.toUpperCase()}`;

  const stats = overlay.querySelectorAll('.jwl-go-stat-val');
  if (stats[0]) stats[0].textContent = `🏆 ${jwlState.bestScore.toLocaleString()}`;
  if (stats[1]) stats[1].textContent = `⛓️ x${jwlState.maxCombo}`;
  if (stats[2]) stats[2].textContent = `💎 ${jwlState.gemsCleared}`;

  const newBestEl = overlay.querySelector('.jwl-go-new-best');
  if (newBestEl) {
    if (isNewBest) newBestEl.classList.add('active');
    else newBestEl.classList.remove('active');
  }

  overlay.classList.add('active');
}

// ===== Animations =====
function jwlDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function jwlAnimateSwap(r1, c1, r2, c2) {
  jwlRenderGrid();
  await jwlDelay(JWL_SWAP_DELAY);
}

async function jwlAnimateInvalidSwap(r1, c1, r2, c2) {
  // Show shake animation on both cells
  const cells = jwlGridEl.querySelectorAll('.jwl-cell');
  const idx1 = r1 * JWL_COLS + c1;
  const idx2 = r2 * JWL_COLS + c2;
  if (cells[idx1]) cells[idx1].classList.add('invalid-swap');
  if (cells[idx2]) cells[idx2].classList.add('invalid-swap');
  await jwlDelay(300);
}

async function jwlAnimateMatches(toRemove) {
  // Add matched class to cells being removed
  const cells = jwlGridEl.querySelectorAll('.jwl-cell');
  toRemove.forEach(idx => {
    if (cells[idx]) cells[idx].classList.add('matched');
  });

  // Spawn particles
  toRemove.forEach(idx => {
    const cell = cells[idx];
    if (cell) jwlSpawnParticles(cell);
  });

  await jwlDelay(JWL_MATCH_DELAY);
  jwlRenderGrid();
}

function jwlSpawnParticles(cell) {
  const rect = cell.getBoundingClientRect();
  const container = document.querySelector('.jwl-grid-container');
  if (!container) return;
  const cRect = container.getBoundingClientRect();
  const cx = rect.left - cRect.left + rect.width / 2;
  const cy = rect.top - cRect.top + rect.height / 2;

  const colors = ['#ff5252', '#448aff', '#69f0ae', '#ffd740', '#e040fb', '#ffab40', '#e0e0e0'];

  for (let i = 0; i < 4; i++) {
    const p = document.createElement('div');
    p.className = 'jwl-particle';
    const angle = (Math.PI * 2 / 4) * i + Math.random() * 0.5;
    const dist = 15 + Math.random() * 20;
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    container.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

function jwlShowComboText(text) {
  const container = document.querySelector('.jwl-grid-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'jwl-combo-text';
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function jwlShowScorePopup(score, pos) {
  if (!pos || !jwlGridEl) return;
  const cells = jwlGridEl.querySelectorAll('.jwl-cell');
  const idx = pos.r * JWL_COLS + pos.c;
  const cell = cells[idx];
  if (!cell) return;

  const container = document.querySelector('.jwl-grid-container');
  if (!container) return;
  const rect = cell.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();

  const el = document.createElement('div');
  el.className = 'jwl-score-popup';
  el.textContent = '+' + score;
  el.style.left = (rect.left - cRect.left + rect.width / 2) + 'px';
  el.style.top = (rect.top - cRect.top) + 'px';
  container.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function jwlShowLevelUp() {
  const container = document.querySelector('.jwl-grid-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'jwl-levelup-text';
  el.textContent = `LEVEL ${jwlState.level}!`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function jwlShowReshuffleEffect() {
  const container = document.querySelector('.jwl-grid-container');
  if (!container) return;
  const overlay = document.createElement('div');
  overlay.className = 'jwl-reshuffle-overlay';
  overlay.innerHTML = '<div class="jwl-reshuffle-text">🔀 RESHUFFLE!</div>';
  container.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1000);
}

// ===== Hint System =====
function jwlResetHintTimer() {
  jwlClearHint();
  if (!jwlState || jwlState.gameState !== 'playing') return;
  jwlHintTimer = setTimeout(() => jwlShowHint(), JWL_HINT_TIMEOUT);
}

function jwlClearHint() {
  if (jwlHintTimer) { clearTimeout(jwlHintTimer); jwlHintTimer = null; }
  if (!jwlGridEl) return;
  jwlGridEl.querySelectorAll('.hint').forEach(el => el.classList.remove('hint'));
}

function jwlShowHint() {
  if (!jwlState || jwlState.gameState !== 'playing' || jwlAnimating) return;
  const move = jwlHasValidMoves(jwlState.grid);
  if (!move) return;

  const cells = jwlGridEl.querySelectorAll('.jwl-cell');
  const idx1 = move.r1 * JWL_COLS + move.c1;
  const idx2 = move.r2 * JWL_COLS + move.c2;
  if (cells[idx1]) cells[idx1].classList.add('hint');
  if (cells[idx2]) cells[idx2].classList.add('hint');
}

function jwlManualHint() {
  if (jwlAnimating || !jwlState || jwlState.gameState !== 'playing') return;
  jwlClearHint();
  jwlShowHint();
}

// ===== Pause / Resume =====
function jwlPause() {
  if (!jwlState || jwlState.gameState !== 'playing') return;
  jwlState.gameState = 'paused';
  if (jwlTimerInterval) clearInterval(jwlTimerInterval);
  if (jwlHintTimer) clearTimeout(jwlHintTimer);
  const overlay = document.querySelector('#jewelGame .jwl-pause-overlay');
  if (overlay) overlay.classList.add('active');
}

function jwlResume() {
  if (!jwlState || jwlState.gameState !== 'paused') return;
  jwlState.gameState = 'playing';
  const overlay = document.querySelector('#jewelGame .jwl-pause-overlay');
  if (overlay) overlay.classList.remove('active');
  if (jwlState.mode === 'timed') jwlStartTimer();
  jwlResetHintTimer();
}

function jwlQuit() {
  jwlCleanup();
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

function jwlRetry() {
  const mode = jwlState ? jwlState.mode : 'classic';
  jwlCleanup();
  const overlay = document.querySelector('#jewelGame .jwl-gameover-overlay');
  if (overlay) overlay.classList.remove('active');
  jwlStartMode(mode);
}

function jwlHome() {
  jwlCleanup();
  const overlay = document.querySelector('#jewelGame .jwl-gameover-overlay');
  if (overlay) overlay.classList.remove('active');
  jwlShowModeSelect();
}

// ===== Multiplayer =====
function processJewelDead(msg) {
  if (!jwlMulti) return;
  const p = jwlMulti.players.find(pl => pl.id === msg.id);
  if (p) {
    p.score = msg.score || 0;
    p.level = msg.level || 1;
    p.finished = true;
  }

  const allDone = jwlMulti.players.every(pl => pl.finished);
  if (allDone) {
    const rankings = jwlMulti.players.slice().sort((a, b) => b.score - a.score);
    broadcast({ type: 'jewel-rankings', rankings });
    jwlShowRankings(rankings);
  }
}

function jwlShowRankings(rankings) {
  if (!rankings || rankings.length === 0) return;
  const overlay = document.querySelector('#jewelGame .jwl-gameover-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  const titleEl = overlay.querySelector('.jwl-go-title');
  if (titleEl) titleEl.textContent = '🏆 결과';
  const subEl = overlay.querySelector('.jwl-go-sub');
  if (subEl) {
    subEl.innerHTML = rankings.map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `<div style="margin:4px 0;">${medal} ${p.name || '???'} - ${p.score || 0}점</div>`;
    }).join('');
  }
}

// ===== Cleanup =====
function jwlCleanup() {
  if (jwlTimerInterval) { clearInterval(jwlTimerInterval); jwlTimerInterval = null; }
  if (jwlHintTimer) { clearTimeout(jwlHintTimer); jwlHintTimer = null; }
  window.removeEventListener('resize', jwlCalcCellSize);
  jwlState = null;
  jwlAnimating = false;
  jwlSelected = null;
  jwlDragStart = null;
}

// ===== Visibility Change (auto-pause) =====
document.addEventListener('visibilitychange', () => {
  if (document.hidden && jwlState && jwlState.gameState === 'playing') {
    if (jwlState.mode !== 'zen') {
      jwlPause();
    }
  }
});

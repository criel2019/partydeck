// ═══════════════════════════════════════
//  COLOR CHAIN — PartyDeck Integration
// ═══════════════════════════════════════

// ═══ CONSTANTS ═══
const CC_COLS = 6, CC_ROWS = 12, CC_CELL = 36, CC_PAD = 0;
const CC_BOARD_W = CC_COLS * CC_CELL, CC_BOARD_H = CC_ROWS * CC_CELL;
const CC_COLORS = [null, '#9b59b6', '#3498db', '#2ecc71', '#f1c40f', '#e74c3c'];
const CC_COLOR_RGB = [null, [155,89,182], [52,152,219], [46,204,113], [241,196,15], [231,76,60]];
const CC_MAX_LEVEL = 5, CC_JUNK = -1;
const CC_JUNK_COLOR = '#555566', CC_JUNK_RGB = [85, 85, 102];
const CC_HEAT_INTERVAL = 10, CC_JUNK_START = 5, CC_JUNK_BASE_INT = 3;
const CC_RESOLVE_DELAY = 350, CC_HEAT_DURATION = 700;
const CC_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const CC_SHAPES = [
  { cells: [[0,0]],             id: 'O1' },
  { cells: [[0,0],[0,1]],       id: 'I2' },
  { cells: [[0,0],[0,1],[0,2]], id: 'I3' },
  { cells: [[0,0],[1,0],[1,1]], id: 'L3' },
];
const CC_SHAPE_WEIGHTS = [20, 25, 30, 25];
const CC_SHAPE_WEIGHT_SUM = CC_SHAPE_WEIGHTS.reduce((a, b) => a + b, 0);

// ═══ STATE ═══
let ccCanvas = null, ccCtx = null;
let ccNextCanvas = null, ccNextCtx = null;
let ccHoldCanvas = null, ccHoldCtx = null;
let ccAnimId = null;
let ccPaused = false;
let ccMulti = null;
let ccCountdownIv = null;
let ccTouchBound = false;

let ccBoard, ccScore, ccTurn, ccCurrentPiece, ccNextPiece, ccHoldPiece, ccHoldUsedThisTurn, ccGameOver;
let ccDropTimer, ccDropInterval = 800, ccLastFrameTime;
let ccGameState = 'playing', ccResolveTimer = 0;
let ccHeatAnimTimer = 0, ccPreHeatBoard = null;
let ccComboCount = 0, ccHitstopTimer = 0;
let ccActiveCells = new Set();
let ccPendingJunkCols = [], ccWarningJunkCols = [];
let ccParticles = [], ccFloatingTexts = [], ccRings = [];
let ccShakeAmount = 0, ccScreenFlash = 0;
let ccCellFlash = {}, ccCellScale = {};

// ═══ BOARD ═══
function ccInitBoard() {
  ccBoard = [];
  for (let r = 0; r < CC_ROWS; r++) ccBoard.push(new Array(CC_COLS).fill(0));
}

function ccRandomLevel() {
  const w = [0, 40, 35, 25];
  let roll = Math.random() * 100;
  for (let i = 1; i <= 3; i++) { roll -= w[i]; if (roll <= 0) return i; }
  return 1;
}

// ═══ PIECES ═══
function ccCreatePiece() {
  let roll = Math.random() * CC_SHAPE_WEIGHT_SUM;
  let idx = 0;
  for (let i = 0; i < CC_SHAPE_WEIGHTS.length; i++) {
    roll -= CC_SHAPE_WEIGHTS[i];
    if (roll <= 0) { idx = i; break; }
  }
  const tmpl = CC_SHAPES[idx];
  return {
    cells: tmpl.cells.map(c => [...c]),
    colors: tmpl.cells.map(() => ccRandomLevel()),
    row: 0,
    col: Math.floor(CC_COLS / 2) - (idx >= 2 ? 1 : 0),
    id: tmpl.id,
  };
}

function ccGetDefaultCells(id) {
  const t = CC_SHAPES.find(s => s.id === id);
  return t ? t.cells.map(c => [...c]) : [[0,0]];
}
function ccGetDefaultCol(id) {
  const i = CC_SHAPES.findIndex(s => s.id === id);
  return Math.floor(CC_COLS / 2) - (i >= 2 ? 1 : 0);
}

function ccTryRotate(piece, fn) {
  if (piece.cells.length === 1) return;
  const nc = piece.cells.map(fn);
  const mr = Math.min(...nc.map(s => s[0]));
  const mc = Math.min(...nc.map(s => s[1]));
  const norm = nc.map(([r, c]) => [r - mr, c - mc]);
  for (const [r, c] of norm) {
    const br = piece.row + r, bc = piece.col + c;
    if (bc < 0 || bc >= CC_COLS || br >= CC_ROWS) return;
    if (br >= 0 && ccBoard[br][bc] !== 0) return;
  }
  piece.cells = norm;
}
function ccRotateCW(p) { ccTryRotate(p, ([r, c]) => [c, -r]); }
function ccRotateCCW(p) { ccTryRotate(p, ([r, c]) => [-c, r]); }

function ccCanMove(p, dr, dc) {
  for (const [sr, sc] of p.cells) {
    const nr = p.row + sr + dr, nc = p.col + sc + dc;
    if (nc < 0 || nc >= CC_COLS || nr >= CC_ROWS) return false;
    if (nr >= 0 && ccBoard[nr][nc] !== 0) return false;
  }
  return true;
}
function ccCanPlaceAt(p, row, col) {
  for (const [sr, sc] of p.cells) {
    const nr = row + sr, nc = col + sc;
    if (nc < 0 || nc >= CC_COLS || nr >= CC_ROWS) return false;
    if (nr >= 0 && ccBoard[nr][nc] !== 0) return false;
  }
  return true;
}

// ═══ HOLD ═══
function ccDoHold() {
  if (ccGameState !== 'playing' || ccGameOver || !ccCurrentPiece || ccHoldUsedThisTurn) return;
  ccHoldUsedThisTurn = true;
  if (ccHoldPiece) {
    const saved = ccHoldPiece;
    ccHoldPiece = { cells: ccGetDefaultCells(ccCurrentPiece.id), colors: [...ccCurrentPiece.colors], id: ccCurrentPiece.id };
    ccCurrentPiece = { cells: ccGetDefaultCells(saved.id), colors: [...saved.colors], row: 0, col: ccGetDefaultCol(saved.id), id: saved.id };
  } else {
    ccHoldPiece = { cells: ccGetDefaultCells(ccCurrentPiece.id), colors: [...ccCurrentPiece.colors], id: ccCurrentPiece.id };
    ccCurrentPiece = ccNextPiece;
    ccNextPiece = ccCreatePiece();
  }
  if (!ccCanMove(ccCurrentPiece, 0, 0)) ccTriggerGameOver();
  ccDropTimer = 0;
}

// ═══ LOCK → REACTIONS ═══
function ccLockPiece(piece) {
  const TAG_BASE = 100;
  for (let i = 0; i < piece.cells.length; i++) {
    const r = piece.row + piece.cells[i][0];
    const c = piece.col + piece.cells[i][1];
    if (r < 0) { ccTriggerGameOver(); return; }
    ccBoard[r][c] = TAG_BASE + piece.colors[i];
  }
  ccApplyGravityRaw();
  ccActiveCells = new Set();
  for (let r = 0; r < CC_ROWS; r++) {
    for (let c = 0; c < CC_COLS; c++) {
      if (ccBoard[r][c] >= TAG_BASE) {
        ccBoard[r][c] = ccBoard[r][c] - TAG_BASE;
        ccActiveCells.add(r + ',' + c);
      }
    }
  }
  ccTurn++;
  ccHoldUsedThisTurn = false;
  const turnEl = document.getElementById('ccTurnValue');
  if (turnEl) turnEl.textContent = ccTurn;
  ccComboCount = 0;
  if (ccTurn % CC_HEAT_INTERVAL === 0) ccStartHeat();
  else { ccUpdateHeatBar(); ccStartResolve(); }
}

// ═══ MERGE ═══
function ccProcessMerges() {
  if (ccActiveCells.size === 0) return false;
  let merged = false;
  const nextActive = new Set();
  const processed = new Set();

  for (const key of ccActiveCells) {
    if (processed.has(key)) continue;
    const parts = key.split(',');
    const r = Number(parts[0]), c = Number(parts[1]);
    if (ccBoard[r][c] <= 0 || ccBoard[r][c] > CC_MAX_LEVEL) continue;
    const level = ccBoard[r][c];

    const group = [], visited = new Set(), stack = [{r, c}];
    while (stack.length) {
      const u = stack.pop();
      const k = u.r + ',' + u.c;
      if (u.r < 0 || u.r >= CC_ROWS || u.c < 0 || u.c >= CC_COLS) continue;
      if (visited.has(k) || ccBoard[u.r][u.c] !== level) continue;
      visited.add(k);
      group.push(u);
      for (const [dr, dc] of CC_DIRS) stack.push({r: u.r + dr, c: u.c + dc});
    }
    if (group.length < 2) continue;

    for (const g of group) processed.add(g.r + ',' + g.c);
    merged = true;

    group.sort((a, b) => b.r - a.r || a.c - b.c);
    const sv = group[0];
    const newLv = Math.min(level + (group.length - 1), CC_MAX_LEVEL + 1);
    for (const g of group) ccBoard[g.r][g.c] = 0;
    ccBoard[sv.r][sv.c] = newLv;
    nextActive.add(sv.r + ',' + sv.c);

    const sx = sv.c * CC_CELL + CC_CELL / 2, sy = sv.r * CC_CELL + CC_CELL / 2;
    const rgb = CC_COLOR_RGB[Math.min(newLv, CC_MAX_LEVEL)] || [200,200,200];
    for (let i = 1; i < group.length; i++) {
      const g = group[i], gx = g.c * CC_CELL + CC_CELL / 2, gy = g.r * CC_CELL + CC_CELL / 2;
      const ang = Math.atan2(sy - gy, sx - gx);
      for (let j = 0; j < 6; j++) {
        const a = ang + (Math.random() - 0.5) * 0.8, sp = 1.5 + Math.random() * 2;
        ccParticles.push({x:gx,y:gy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:0.025,size:3+Math.random()*2.5,r:rgb[0],g:rgb[1],b:rgb[2]});
      }
    }
    for (let i = 0; i < 4 + group.length * 2; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.5;
      ccParticles.push({x:sx,y:sy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-0.5,life:0.7,decay:0.025,size:2+Math.random()*2,r:Math.min(rgb[0]+60,255),g:Math.min(rgb[1]+60,255),b:Math.min(rgb[2]+60,255)});
    }
    if (group.length >= 3) ccRings.push({x:sx,y:sy,radius:3,maxR:CC_CELL*1.2+group.length*5,life:1,spd:2.5,color:CC_COLORS[Math.min(newLv,CC_MAX_LEVEL)]});

    const pts = group.length * level * 15 * Math.max(ccComboCount, 1);
    ccScore += pts;
    ccFloatingTexts.push({x:sx,y:sy,text:group.length>=3?group.length+'MERGE +'+pts:'+'+pts,life:1.1,decay:0.02,vy:-1.3,size:group.length>=3?16:12,color:group.length>=3?'#66ffcc':'#fff',scale:1.2});
    ccCellScale[sv.r+','+sv.c] = 1.3 + group.length * 0.05;
    ccCellFlash[sv.r+','+sv.c] = {alpha:1.2,type:'white'};
  }

  if (merged) {
    const scoreEl = document.getElementById('ccScoreValue');
    if (scoreEl) scoreEl.textContent = ccScore;
    ccShakeAmount = Math.max(ccShakeAmount, 4);
    ccActiveCells = nextActive;
  } else {
    ccActiveCells = new Set();
  }
  return merged;
}

// ═══ EXPLOSIONS ═══
function ccProcessExplosions() {
  const ex = [];
  for (let r = 0; r < CC_ROWS; r++) for (let c = 0; c < CC_COLS; c++) if (ccBoard[r][c] > CC_MAX_LEVEL) ex.push({r,c});
  if (!ex.length) return false;

  const chain = ccComboCount + 1;
  const pts = ex.length * 200 * chain;
  ccScore += pts;
  const scoreEl = document.getElementById('ccScoreValue');
  if (scoreEl) scoreEl.textContent = ccScore;

  const comboEl = document.getElementById('ccComboDisplay');
  if (chain >= 2 && comboEl) {
    comboEl.textContent = chain >= 4 ? '\u{1F4A5} ' + chain + 'x CHAIN!' : chain + 'x CHAIN!';
    comboEl.className = 'cc-combo active';
    comboEl.style.transform = 'scale(1.3)';
    setTimeout(function(){ comboEl.style.transform = 'scale(1)'; }, 150);
  }

  for (const pos of ex) {
    const px = pos.c * CC_CELL + CC_CELL / 2, py = pos.r * CC_CELL + CC_CELL / 2, rgb = CC_COLOR_RGB[CC_MAX_LEVEL];
    const cnt = 18 + chain * 5;
    for (let i = 0; i < cnt; i++) {
      const a = (Math.PI*2/cnt)*i+(Math.random()-0.5)*0.6, sp = 3+Math.random()*4+chain*0.5;
      ccParticles.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2.5,life:1.5,decay:0.01+Math.random()*0.008,size:3.5+Math.random()*5,r:rgb[0],g:rgb[1],b:rgb[2]});
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random()*Math.PI*2, sp = 1+Math.random()*2;
      ccParticles.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,life:0.8,decay:0.025,size:4+Math.random()*3,r:255,g:255,b:220});
    }
    ccRings.push({x:px,y:py,radius:5,maxR:CC_CELL*1.8+chain*8,life:1,spd:3+chain,color:CC_COLORS[CC_MAX_LEVEL]});
    ccFloatingTexts.push({x:px+(Math.random()-0.5)*8,y:py,text:'+'+200*chain,life:1.5,decay:0.014,vy:-2.2-chain*0.2,size:chain>=3?24:chain>=2?20:16,color:chain>=3?'#ff2222':chain>=2?'#ffcc00':'#fff',scale:1.5});
    ccCellFlash[pos.r+','+pos.c] = {alpha:2.5,type:'white'};
  }
  if (chain >= 2) ccFloatingTexts.push({x:CC_BOARD_W/2,y:CC_BOARD_H/2-30,text:(chain>=4?'\u{1F4A5} ':'')+chain+'x CHAIN!',life:2,decay:0.015,vy:-0.4,size:26+chain*4,color:chain>=4?'#ff1111':'#ffaa00',scale:1.8});
  if (chain === 1 && ex.length >= 2) ccFloatingTexts.push({x:CC_BOARD_W/2,y:CC_BOARD_H/2,text:'BOOM!',life:1.2,decay:0.02,vy:-0.5,size:24,color:'#ff6644',scale:1.4});

  ccHitstopTimer = chain >= 3 ? 120 : chain >= 2 ? 80 : 50;
  ccShakeAmount = Math.min(8 + chain * 5, 25);
  ccScreenFlash = Math.min(0.35 + chain * 0.12, 0.8);

  for (const pos of ex) ccBoard[pos.r][pos.c] = 0;
  const affected = new Set(), junkDead = [];
  for (const pos of ex) for (const [dr, dc] of CC_DIRS) {
    const nr = pos.r+dr, nc = pos.c+dc;
    if (nr < 0 || nr >= CC_ROWS || nc < 0 || nc >= CC_COLS) continue;
    if (ccBoard[nr][nc] === CC_JUNK) { junkDead.push({r:nr,c:nc}); ccBoard[nr][nc] = 0; }
    else if (ccBoard[nr][nc] > 0) affected.add(nr+','+nc);
  }
  for (const jd of junkDead) {
    const jx = jd.c*CC_CELL+CC_CELL/2, jy = jd.r*CC_CELL+CC_CELL/2;
    for (let i = 0; i < 6; i++) { const a = (Math.PI*2/6)*i+Math.random()*0.5; ccParticles.push({x:jx,y:jy,vx:Math.cos(a)*2,vy:Math.sin(a)*2-1,life:0.8,decay:0.025,size:3,r:CC_JUNK_RGB[0],g:CC_JUNK_RGB[1],b:CC_JUNK_RGB[2]}); }
  }
  for (const k of affected) {
    const p2 = k.split(','); const ar = Number(p2[0]), ac = Number(p2[1]);
    ccBoard[ar][ac]++;
    ccCellFlash[k] = {alpha:1,type:'warm'};
    ccCellScale[k] = 1.15;
    ccActiveCells.add(k);
  }
  return true;
}

// ═══ GRAVITY ═══
function ccApplyGravityRaw() {
  for (let c = 0; c < CC_COLS; c++) {
    let w = CC_ROWS - 1;
    for (let r = CC_ROWS - 1; r >= 0; r--) {
      if (ccBoard[r][c] !== 0) { if (r !== w) { ccBoard[w][c] = ccBoard[r][c]; ccBoard[r][c] = 0; } w--; }
    }
  }
}

const CC_GRAV_TAG = 100;
function ccApplyGravity() {
  for (const key of ccActiveCells) {
    const p2 = key.split(','); const r = Number(p2[0]), c = Number(p2[1]);
    if (ccBoard[r][c] !== 0 && ccBoard[r][c] !== CC_JUNK) {
      ccBoard[r][c] = CC_GRAV_TAG + ccBoard[r][c];
    }
  }
  ccApplyGravityRaw();
  ccActiveCells = new Set();
  for (let r = 0; r < CC_ROWS; r++) {
    for (let c = 0; c < CC_COLS; c++) {
      if (ccBoard[r][c] >= CC_GRAV_TAG) {
        ccBoard[r][c] = ccBoard[r][c] - CC_GRAV_TAG;
        ccActiveCells.add(r + ',' + c);
      }
    }
  }
}

// ═══ HEAT ═══
function ccStartHeat() {
  ccGameState = 'heat'; ccHeatAnimTimer = 0;
  ccPreHeatBoard = ccBoard.map(function(r){ return r.slice(); });
  for (let r = 0; r < CC_ROWS; r++) for (let c = 0; c < CC_COLS; c++) if (ccBoard[r][c] > 0) ccBoard[r][c]++;
  ccShakeAmount = 5;
}
function ccUpdateHeat(dt) {
  ccHeatAnimTimer += dt;
  const t = Math.min(ccHeatAnimTimer / CC_HEAT_DURATION, 1);
  ccShakeAmount = Math.sin(t * Math.PI) * 5;
  if (t >= 1) {
    ccPreHeatBoard = null; ccShakeAmount = 0; ccUpdateHeatBar();
    ccActiveCells = new Set();
    for (let r = 0; r < CC_ROWS; r++) for (let c = 0; c < CC_COLS; c++) if (ccBoard[r][c] > 0) ccActiveCells.add(r+','+c);
    ccComboCount = 0; ccStartResolve();
  }
}
function ccUpdateHeatBar() {
  const fill = document.getElementById('ccHeatFill');
  if (fill) fill.style.width = (ccTurn % CC_HEAT_INTERVAL) / CC_HEAT_INTERVAL * 100 + '%';
}

// ═══ RESOLVE ═══
function ccStartResolve() { ccGameState = 'resolve'; ccResolveTimer = 0; }
function ccUpdateResolve(dt) { ccResolveTimer += dt; if (ccResolveTimer >= CC_RESOLVE_DELAY) ccDoResolveStep(); }
function ccDoResolveStep() {
  ccFloatingTexts = [];
  if (ccProcessMerges()) { ccApplyGravity(); ccComboCount++; ccResolveTimer = 0; return; }
  if (ccProcessExplosions()) { ccApplyGravity(); ccComboCount++; ccResolveTimer = 0; return; }
  ccUpdateHeatBar(); ccFinishTurn();
}

// ═══ JUNK ═══
function ccPlanNextJunk() {
  ccPendingJunkCols = [];
  const ne = ccTurn + 1 - CC_JUNK_START;
  if (ne < 0) return;
  const intv = Math.max(3, CC_JUNK_BASE_INT - Math.floor(ne / 20));
  if (ne % intv !== 0) return;
  const cnt = Math.min(2 + Math.floor(ne / 15), 4), used = new Set();
  for (let i = 0; i < cnt; i++) { let c, att = 0; do { c = Math.floor(Math.random()*CC_COLS); att++; } while (used.has(c) && att < 10); used.add(c); ccPendingJunkCols.push(c); }
}
function ccSpawnJunk(cols) {
  for (const c of cols) {
    let placed = false;
    for (let r = 0; r < CC_ROWS; r++) { if (ccBoard[r][c] !== 0) { if (r===0) break; ccBoard[r-1][c]=CC_JUNK; ccCellScale[(r-1)+','+c]=1.4; ccCellFlash[(r-1)+','+c]={alpha:1,type:'white'}; placed=true; break; } }
    if (!placed && ccBoard[CC_ROWS-1][c]===0) { ccBoard[CC_ROWS-1][c]=CC_JUNK; ccCellScale[(CC_ROWS-1)+','+c]=1.4; }
  }
  if (cols.length) { ccFloatingTexts.push({x:CC_BOARD_W/2,y:40,text:'\u26A0 JUNK!',life:1,decay:0.025,vy:-0.3,size:14,color:'#888'}); ccShakeAmount=2; }
}

function ccFinishTurn() {
  if (ccWarningJunkCols.length) { ccSpawnJunk(ccWarningJunkCols); ccApplyGravityRaw(); }
  ccWarningJunkCols = ccPendingJunkCols.slice();
  ccPlanNextJunk();
  ccGameState = 'playing'; ccCurrentPiece = ccNextPiece; ccNextPiece = ccCreatePiece();
  if (!ccCanMove(ccCurrentPiece, 0, 0)) ccTriggerGameOver();
  ccDropTimer = 0;
  setTimeout(function(){ var el=document.getElementById('ccComboDisplay'); if(el){el.textContent=''; el.className='cc-combo';} }, 600);
}

function ccHardDrop() { if (ccGameState!=='playing'||ccGameOver||!ccCurrentPiece) return; while(ccCanMove(ccCurrentPiece,1,0)) ccCurrentPiece.row++; ccLockPiece(ccCurrentPiece); }

function ccTriggerGameOver() {
  ccGameOver = true;
  const goEl = document.getElementById('ccGameOver');
  const goScore = document.getElementById('ccGoScore');
  const goTurn = document.getElementById('ccGoTurn');
  const goBest = document.getElementById('ccGoBest');
  if (goScore) goScore.textContent = ccScore;
  if (goTurn) goTurn.textContent = ccTurn;

  // Save/show best score
  let best = parseInt(localStorage.getItem('cc_best') || '0');
  if (ccScore > best) { best = ccScore; localStorage.setItem('cc_best', best); }
  if (goBest) goBest.textContent = best;

  if (goEl) goEl.style.display = 'flex';

  // Report score for multiplayer
  if (ccMulti) {
    if (typeof state !== 'undefined' && state.isHost) {
      processColorChainDead({ id: state.myId, score: ccScore, turn: ccTurn });
    } else if (typeof sendToHost === 'function') {
      try { sendToHost({ type: 'cc-dead', score: ccScore, turn: ccTurn }); } catch(e) {}
    }
  }
}

// ═══ DRAWING ═══
function ccDrawCell(c, x, y, lv, sz, al) {
  if (sz === undefined) sz = CC_CELL;
  if (al === undefined) al = 1;
  if (lv === 0) return;
  var pd=2, dx=x+pd, dy=y+pd, ds=sz-pd*2, rd=4;
  c.save(); c.globalAlpha *= al;

  if (lv === CC_JUNK) {
    c.fillStyle=CC_JUNK_COLOR; c.beginPath(); c.roundRect(dx,dy,ds,ds,rd); c.fill();
    c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=1;
    for (var i=0;i<ds;i+=6) { c.beginPath(); c.moveTo(dx+i,dy); c.lineTo(dx,dy+i); c.stroke(); c.beginPath(); c.moveTo(dx+ds-i,dy+ds); c.lineTo(dx+ds,dy+ds-i); c.stroke(); }
    var g=c.createLinearGradient(dx,dy,dx,dy+ds); g.addColorStop(0,'rgba(255,255,255,0.08)'); g.addColorStop(1,'rgba(0,0,0,0.15)'); c.fillStyle=g; c.beginPath(); c.roundRect(dx,dy,ds,ds,rd); c.fill();
    c.fillStyle='rgba(255,255,255,'+0.3*al+')'; c.font='bold '+Math.floor(sz*0.35)+'px Outfit,Oswald,sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('\u2715',x+sz/2,y+sz/2);
    c.restore(); return;
  }

  var v = Math.min(lv, CC_MAX_LEVEL);
  if (v>=4) { c.shadowColor=CC_COLORS[v]; c.shadowBlur=v===5?16:8; }
  c.fillStyle=CC_COLORS[v]; c.beginPath(); c.roundRect(dx,dy,ds,ds,rd); c.fill();
  var g2=c.createLinearGradient(dx,dy,dx,dy+ds); g2.addColorStop(0,'rgba(255,255,255,0.25)'); g2.addColorStop(0.5,'rgba(255,255,255,0)'); g2.addColorStop(1,'rgba(0,0,0,0.2)'); c.fillStyle=g2; c.beginPath(); c.roundRect(dx,dy,ds,ds,rd); c.fill();
  c.shadowColor='transparent'; c.shadowBlur=0;
  c.fillStyle='rgba(255,255,255,'+0.55*al+')'; c.font='bold '+Math.floor(sz*0.35)+'px Outfit,Oswald,sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(v,x+sz/2,y+sz/2);
  c.restore();
}

function ccDraw() {
  if (!ccCtx) return;
  var sx=0, sy=0;
  if (ccShakeAmount>0.2) { sx=(Math.random()-0.5)*ccShakeAmount; sy=(Math.random()-0.5)*ccShakeAmount; ccShakeAmount*=0.87; if(ccShakeAmount<0.2)ccShakeAmount=0; }
  ccCtx.clearRect(0,0,ccCanvas.width,ccCanvas.height);
  ccCtx.save(); ccCtx.translate(sx,sy);
  if (ccScreenFlash>0.01) { ccCtx.fillStyle='rgba(255,220,100,'+ccScreenFlash+')'; ccCtx.fillRect(0,0,ccCanvas.width,ccCanvas.height); ccScreenFlash*=0.88; if(ccScreenFlash<0.01)ccScreenFlash=0; }
  ccCtx.fillStyle='#0d0d18'; ccCtx.fillRect(0,0,CC_BOARD_W,CC_BOARD_H);

  // Grid
  ccCtx.strokeStyle='#151525'; ccCtx.lineWidth=1;
  for (var r=0;r<=CC_ROWS;r++) { ccCtx.beginPath(); ccCtx.moveTo(0,r*CC_CELL); ccCtx.lineTo(CC_BOARD_W,r*CC_CELL); ccCtx.stroke(); }
  for (var c=0;c<=CC_COLS;c++) { ccCtx.beginPath(); ccCtx.moveTo(c*CC_CELL,0); ccCtx.lineTo(c*CC_CELL,CC_BOARD_H); ccCtx.stroke(); }

  // Junk warnings
  for (var wi=0;wi<ccWarningJunkCols.length;wi++) {
    var col=ccWarningJunkCols[wi];
    ccCtx.fillStyle='rgba(255,60,60,0.06)'; ccCtx.fillRect(col*CC_CELL,0,CC_CELL,CC_BOARD_H);
    var pulse=0.5+Math.sin(Date.now()*0.006)*0.3;
    ccCtx.fillStyle='rgba(255,80,60,'+pulse+')'; ccCtx.font='bold 16px Outfit,Oswald,sans-serif'; ccCtx.textAlign='center'; ccCtx.textBaseline='middle'; ccCtx.fillText('\u26A0',col*CC_CELL+CC_CELL/2,12);
    var eg=ccCtx.createLinearGradient(col*CC_CELL,0,col*CC_CELL,CC_CELL); eg.addColorStop(0,'rgba(255,60,40,'+pulse*0.3+')'); eg.addColorStop(1,'rgba(255,60,40,0)'); ccCtx.fillStyle=eg; ccCtx.fillRect(col*CC_CELL,0,CC_CELL,CC_CELL);
  }

  // Board cells
  if (ccGameState==='heat' && ccPreHeatBoard) {
    var t=Math.min(ccHeatAnimTimer/CC_HEAT_DURATION,1), wY=t*(CC_BOARD_H+60)-30;
    for (var r=0;r<CC_ROWS;r++) for (var c=0;c<CC_COLS;c++) {
      var ol=ccPreHeatBoard[r][c];
      if (ol===CC_JUNK) ccDrawCell(ccCtx,c*CC_CELL,r*CC_CELL,CC_JUNK);
      else if (ol>0) { var nl=ccBoard[r][c],cY=r*CC_CELL+CC_CELL/2,ct=Math.max(0,Math.min(1,(wY-cY+40)/80)); ccDrawCell(ccCtx,c*CC_CELL,r*CC_CELL,ol,CC_CELL,1-ct); ccDrawCell(ccCtx,c*CC_CELL,r*CC_CELL,nl,CC_CELL,ct); }
    }
    var hg=ccCtx.createLinearGradient(0,wY-40,0,wY+40); hg.addColorStop(0,'rgba(255,80,30,0)'); hg.addColorStop(0.5,'rgba(255,80,30,'+0.2*Math.sin(t*Math.PI)+')'); hg.addColorStop(1,'rgba(255,80,30,0)'); ccCtx.fillStyle=hg; ccCtx.fillRect(0,wY-40,CC_BOARD_W,80);
    var pu=Math.sin(t*Math.PI)*0.08; if(pu>0){ccCtx.fillStyle='rgba(231,76,60,'+pu+')';ccCtx.fillRect(0,0,CC_BOARD_W,CC_BOARD_H);}
  } else {
    for (var r=0;r<CC_ROWS;r++) for (var c=0;c<CC_COLS;c++) {
      if (ccBoard[r][c]===0) continue;
      var k=r+','+c; var sc=ccCellScale[k]||1;
      if (sc>1){sc-=0.04;if(sc<=1){sc=1;delete ccCellScale[k];}else ccCellScale[k]=sc;}
      var px=c*CC_CELL+CC_CELL/2,py=r*CC_CELL+CC_CELL/2;
      ccCtx.save();ccCtx.translate(px,py);ccCtx.scale(sc,sc);ccCtx.translate(-px,-py);
      ccDrawCell(ccCtx,c*CC_CELL,r*CC_CELL,ccBoard[r][c]===CC_JUNK?CC_JUNK:ccBoard[r][c]);ccCtx.restore();
      var fl=ccCellFlash[k];if(fl&&fl.alpha>0){ccCtx.save();ccCtx.globalAlpha=Math.min(fl.alpha,1)*0.6;ccCtx.fillStyle=fl.type==='white'?'#fff':'#ff6633';ccCtx.beginPath();ccCtx.roundRect(c*CC_CELL+2,r*CC_CELL+2,CC_CELL-4,CC_CELL-4,4);ccCtx.fill();ccCtx.restore();fl.alpha-=0.05;if(fl.alpha<=0)delete ccCellFlash[k];}
    }
  }

  // Ghost + current
  if (ccCurrentPiece && ccGameState==='playing' && !ccGameOver) {
    var gr=ccCurrentPiece.row; while(ccCanPlaceAt(ccCurrentPiece,gr+1,ccCurrentPiece.col))gr++;
    if (gr!==ccCurrentPiece.row) for (var i=0;i<ccCurrentPiece.cells.length;i++){var r2=gr+ccCurrentPiece.cells[i][0],c2=ccCurrentPiece.col+ccCurrentPiece.cells[i][1];ccDrawCell(ccCtx,c2*CC_CELL,r2*CC_CELL,ccCurrentPiece.colors[i],CC_CELL,0.18);}
    for (var i=0;i<ccCurrentPiece.cells.length;i++){var r2=ccCurrentPiece.row+ccCurrentPiece.cells[i][0],c2=ccCurrentPiece.col+ccCurrentPiece.cells[i][1];if(r2>=0)ccDrawCell(ccCtx,c2*CC_CELL,r2*CC_CELL,ccCurrentPiece.colors[i]);}
  }

  // Particles (clipped to canvas)
  for (var i=ccParticles.length-1;i>=0;i--){var p=ccParticles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.08;p.life-=p.decay;if(p.life<=0){ccParticles.splice(i,1);continue;}ccCtx.save();ccCtx.globalAlpha=Math.min(p.life,1);ccCtx.fillStyle='rgb('+p.r+','+p.g+','+p.b+')';ccCtx.shadowColor='rgba('+p.r+','+p.g+','+p.b+',0.8)';ccCtx.shadowBlur=8;ccCtx.beginPath();ccCtx.arc(p.x,p.y,p.size*Math.min(p.life,1),0,Math.PI*2);ccCtx.fill();ccCtx.restore();}

  // Rings
  for (var i=ccRings.length-1;i>=0;i--){var ri=ccRings[i];ri.radius+=ri.spd;ri.life-=0.03;if(ri.life<=0||ri.radius>ri.maxR){ccRings.splice(i,1);continue;}ccCtx.save();ccCtx.globalAlpha=ri.life*0.7;ccCtx.strokeStyle=ri.color;ccCtx.lineWidth=3*ri.life;ccCtx.shadowColor=ri.color;ccCtx.shadowBlur=12;ccCtx.beginPath();ccCtx.arc(ri.x,ri.y,ri.radius,0,Math.PI*2);ccCtx.stroke();ccCtx.restore();}

  // Float texts
  for (var i=ccFloatingTexts.length-1;i>=0;i--){var f=ccFloatingTexts[i];f.y+=f.vy;f.vy*=0.97;f.life-=f.decay;if(f.scale)f.scale=Math.max(1,f.scale-0.03);if(f.life<=0){ccFloatingTexts.splice(i,1);continue;}ccCtx.save();ccCtx.globalAlpha=Math.min(f.life,1);var s=f.scale||1;ccCtx.translate(f.x,f.y);ccCtx.scale(s,s);ccCtx.fillStyle=f.color;ccCtx.font='900 '+f.size+'px Outfit,Oswald,sans-serif';ccCtx.textAlign='center';ccCtx.textBaseline='middle';ccCtx.shadowColor='rgba(0,0,0,0.7)';ccCtx.shadowBlur=6;ccCtx.strokeStyle='rgba(0,0,0,0.5)';ccCtx.lineWidth=3;ccCtx.strokeText(f.text,0,0);ccCtx.fillText(f.text,0,0);ccCtx.restore();}

  ccCtx.restore();
}

function ccDrawSide(context, piece, w, h) {
  if (!context) return;
  context.clearRect(0, 0, w, h); if (!piece) return;
  var cs = 16, cells = piece.cells;
  var mc = 0, mr = 0;
  for (var i = 0; i < cells.length; i++) { if (cells[i][1] > mc) mc = cells[i][1]; if (cells[i][0] > mr) mr = cells[i][0]; }
  mc++; mr++;
  var ox = (w - mc * cs) / 2, oy = (h - mr * cs) / 2;
  for (var i = 0; i < cells.length; i++) ccDrawCell(context, ox + cells[i][1] * cs, oy + cells[i][0] * cs, piece.colors[i], cs);
}

// ═══ GAME LOOP ═══
function ccGameLoop(ts) {
  if (ccPaused) { ccAnimId = requestAnimationFrame(ccGameLoop); return; }
  if (!ccLastFrameTime) ccLastFrameTime = ts;
  var dt = ts - ccLastFrameTime; ccLastFrameTime = ts;
  if (dt > 200) dt = 200; // cap delta for tab-away

  if (!ccGameOver) {
    if (ccHitstopTimer > 0) ccHitstopTimer -= dt;
    else switch (ccGameState) {
      case 'playing': ccDropTimer+=dt; if(ccDropTimer>=ccDropInterval){ccDropTimer=0;if(ccCurrentPiece&&ccCanMove(ccCurrentPiece,1,0))ccCurrentPiece.row++;else if(ccCurrentPiece)ccLockPiece(ccCurrentPiece);} break;
      case 'heat': ccUpdateHeat(dt); break;
      case 'resolve': ccUpdateResolve(dt); break;
    }
  }
  ccDraw();
  ccDrawSide(ccNextCtx, ccNextPiece, 60, 60);
  ccDrawSide(ccHoldCtx, ccHoldPiece, 60, 60);
  ccAnimId = requestAnimationFrame(ccGameLoop);
}

// ═══ INPUT ═══
function _ccKeyHandler(e) {
  if (ccGameOver || ccGameState !== 'playing' || !ccCurrentPiece || ccPaused) return;
  switch(e.key) {
    case 'ArrowLeft': if(ccCanMove(ccCurrentPiece,0,-1))ccCurrentPiece.col--; break;
    case 'ArrowRight': if(ccCanMove(ccCurrentPiece,0,1))ccCurrentPiece.col++; break;
    case 'ArrowDown': if(ccCanMove(ccCurrentPiece,1,0)){ccCurrentPiece.row++;ccDropTimer=0;} break;
    case 'ArrowUp': case 'x': case 'X': ccRotateCW(ccCurrentPiece); break;
    case 'z': case 'Z': ccRotateCCW(ccCurrentPiece); break;
    case ' ': e.preventDefault(); ccHardDrop(); break;
    case 'c': case 'C': ccDoHold(); break;
    case 'Escape': ccPause(); break;
    default: return;
  }
}

function _ccTouchAction(action) {
  if (ccGameOver || ccGameState !== 'playing' || !ccCurrentPiece || ccPaused) return;
  switch(action) {
    case 'left': if(ccCanMove(ccCurrentPiece,0,-1))ccCurrentPiece.col--; break;
    case 'right': if(ccCanMove(ccCurrentPiece,0,1))ccCurrentPiece.col++; break;
    case 'down': if(ccCanMove(ccCurrentPiece,1,0)){ccCurrentPiece.row++;ccDropTimer=0;} break;
    case 'rotR': ccRotateCW(ccCurrentPiece); break;
    case 'rotL': ccRotateCCW(ccCurrentPiece); break;
    case 'drop': ccHardDrop(); break;
    case 'hold': ccDoHold(); break;
  }
}

function _ccBindTouch() {
  if (ccTouchBound) return;
  ccTouchBound = true;
  const btns = document.querySelectorAll('#colorchainGame .cc-btn');
  btns.forEach(function(b) {
    b.addEventListener('touchstart', function(e) {
      e.preventDefault();
      _ccTouchAction(b.dataset.action);
    });
    b.addEventListener('mousedown', function(e) {
      _ccTouchAction(b.dataset.action);
    });
  });
}

// ═══ CANVAS INIT ═══
function ccInitCanvas() {
  ccCanvas = document.getElementById('ccCanvas');
  if (!ccCanvas) return;
  ccCtx = ccCanvas.getContext('2d');
  ccCanvas.width = CC_BOARD_W;
  ccCanvas.height = CC_BOARD_H;

  // Set board wrapper size
  const wrap = ccCanvas.closest('.cc-board-wrap');
  if (wrap) {
    wrap.style.width = CC_BOARD_W + 'px';
    wrap.style.height = CC_BOARD_H + 'px';
  }

  ccNextCanvas = document.getElementById('ccNextCanvas');
  ccHoldCanvas = document.getElementById('ccHoldCanvas');
  if (ccNextCanvas) ccNextCtx = ccNextCanvas.getContext('2d');
  if (ccHoldCanvas) ccHoldCtx = ccHoldCanvas.getContext('2d');
}

// ═══ GAME START/RESET ═══
function ccResetState() {
  ccInitBoard();
  ccScore = 0; ccTurn = 0; ccGameOver = false; ccGameState = 'playing';
  ccDropTimer = 0; ccDropInterval = 800; ccComboCount = 0; ccHitstopTimer = 0;
  ccResolveTimer = 0; ccHeatAnimTimer = 0;
  ccHoldPiece = null; ccHoldUsedThisTurn = false;
  ccParticles = []; ccFloatingTexts = []; ccRings = [];
  ccCellFlash = {}; ccCellScale = {}; ccActiveCells = new Set();
  ccShakeAmount = 0; ccScreenFlash = 0; ccPreHeatBoard = null;
  ccPendingJunkCols = []; ccWarningJunkCols = [];
  ccPaused = false;

  const scoreEl = document.getElementById('ccScoreValue');
  const turnEl = document.getElementById('ccTurnValue');
  const comboEl = document.getElementById('ccComboDisplay');
  const heatFill = document.getElementById('ccHeatFill');
  const goEl = document.getElementById('ccGameOver');
  const pauseEl = document.getElementById('ccPauseOverlay');
  const cdEl = document.getElementById('ccCountdown');

  if (scoreEl) scoreEl.textContent = '0';
  if (turnEl) turnEl.textContent = '0';
  if (comboEl) { comboEl.textContent = ''; comboEl.className = 'cc-combo'; }
  if (heatFill) heatFill.style.width = '0%';
  if (goEl) goEl.style.display = 'none';
  if (pauseEl) pauseEl.style.display = 'none';
  if (cdEl) cdEl.style.display = 'none';

  ccCurrentPiece = ccCreatePiece();
  ccNextPiece = ccCreatePiece();
  ccPlanNextJunk();
  ccLastFrameTime = 0;
}

function ccBeginGameLoop() {
  if (ccAnimId) cancelAnimationFrame(ccAnimId);
  ccLastFrameTime = 0;
  ccAnimId = requestAnimationFrame(ccGameLoop);
}

// ═══ COUNTDOWN ═══
function ccDoCountdown(cb) {
  const overlay = document.getElementById('ccCountdown');
  const numEl = document.getElementById('ccCountdownNum');
  if (!overlay || !numEl) { cb(); return; }
  if (ccCountdownIv) { clearInterval(ccCountdownIv); ccCountdownIv = null; }
  overlay.style.display = 'flex';
  let count = 3;
  numEl.textContent = count;
  ccCountdownIv = setInterval(function() {
    count--;
    if (count > 0) {
      numEl.textContent = count;
    } else if (count === 0) {
      numEl.textContent = 'GO!';
    } else {
      clearInterval(ccCountdownIv);
      ccCountdownIv = null;
      overlay.style.display = 'none';
      cb();
    }
  }, 700);
}

// ═══ ENTRY POINTS ═══

// Called by core.js for host
function startColorChain() {
  if (typeof state === 'undefined' || !state.isHost) return;

  ccMulti = {
    phase: 'playing',
    players: state.players.map(function(p) {
      return { id: p.id, name: p.name, avatar: p.avatar, score: 0, dead: false };
    })
  };

  // Broadcast to all players
  if (typeof broadcast === 'function') {
    broadcast({ type: 'game-start', game: 'colorchain', state: ccMulti });
  }

  showScreen('colorchainGame');
  ccInitCanvas();
  _ccBindTouch();
  ccResetState();
  ccUpdatePlayersBar();
  document.addEventListener('keydown', _ccKeyHandler);
  ccDoCountdown(function() { ccBeginGameLoop(); });
}

// Called by core.js for guests
function renderColorChainView(multiState) {
  ccMulti = multiState;
  ccInitCanvas();
  _ccBindTouch();
  ccResetState();
  ccUpdatePlayersBar();
  document.addEventListener('keydown', _ccKeyHandler);
  ccDoCountdown(function() { ccBeginGameLoop(); });
}

// Players bar
function ccUpdatePlayersBar() {
  const bar = document.getElementById('ccPlayersBar');
  if (!bar || !ccMulti || !ccMulti.players) { if (bar) bar.innerHTML = ''; return; }
  if (ccMulti.players.length <= 1) { bar.innerHTML = ''; return; }
  bar.innerHTML = ccMulti.players.map(function(p) {
    const me = (typeof state !== 'undefined' && p.id === state.myId) ? ' me' : '';
    return '<div class="cc-player-chip' + me + '"><span class="cc-chip-avatar">' + (p.avatar || '') + '</span>' + (p.name || '') + '<span class="score">' + (p.score || 0) + '</span></div>';
  }).join('');
}

// ═══ PAUSE / RESUME ═══
function ccPause() {
  if (ccGameOver) return;
  ccPaused = true;
  const el = document.getElementById('ccPauseOverlay');
  if (el) el.style.display = 'flex';
}
function ccResume() {
  ccPaused = false;
  ccLastFrameTime = 0;
  const el = document.getElementById('ccPauseOverlay');
  if (el) el.style.display = 'none';
}

// ═══ CLEANUP ═══
function ccCleanup() {
  if (ccAnimId) { cancelAnimationFrame(ccAnimId); ccAnimId = null; }
  if (ccCountdownIv) { clearInterval(ccCountdownIv); ccCountdownIv = null; }
  document.removeEventListener('keydown', _ccKeyHandler);
  ccCanvas = null; ccCtx = null;
  ccNextCanvas = null; ccNextCtx = null;
  ccHoldCanvas = null; ccHoldCtx = null;
  ccMulti = null;
  ccPaused = false;
  ccTouchBound = false;
}

// ═══ MULTIPLAYER RANKINGS ═══
function processColorChainDead(msg) {
  if (!ccMulti) return;
  const p = ccMulti.players.find(function(pl) { return pl.id === msg.id; });
  if (p) {
    p.score = msg.score || 0;
    p.turn = msg.turn || 0;
    p.dead = true;
  }
  ccUpdatePlayersBar();
  var allDone = ccMulti.players.every(function(pl) { return pl.dead; });
  if (allDone) {
    var rankings = ccMulti.players.slice().sort(function(a, b) { return b.score - a.score; });
    if (typeof broadcast === 'function') broadcast({ type: 'cc-rankings', rankings: rankings });
    ccShowRankings(rankings);
  }
}

function ccShowRankings(rankings) {
  if (!rankings || rankings.length === 0) return;
  var overlay = document.getElementById('ccGameOver');
  if (!overlay) return;
  overlay.style.display = 'flex';
  var titleEl = overlay.querySelector('.cc-go-title');
  if (titleEl) titleEl.textContent = '\uD83C\uDFC6 결과';
  var scoreBox = overlay.querySelector('.cc-go-score-box');
  if (scoreBox) {
    scoreBox.innerHTML = rankings.map(function(p, i) {
      var medal = i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : i === 2 ? '\uD83E\uDD49' : (i + 1) + '.';
      return '<div style="margin:4px 0;font-size:16px;">' + medal + ' ' + (p.name || '???') + ' - ' + (p.score || 0) + '점</div>';
    }).join('');
  }
  var statsEl = overlay.querySelector('.cc-go-stats');
  if (statsEl) statsEl.style.display = 'none';
}

// ═══ NAVIGATION ═══
function ccGoHome() {
  ccCleanup();
  if (typeof practiceMode !== 'undefined' && practiceMode) {
    if (typeof leavePracticeMode === 'function') leavePracticeMode();
    else if (typeof showScreen === 'function') showScreen('mainMenu');
  } else {
    if (typeof returnToLobby === 'function') returnToLobby();
    else if (typeof showScreen === 'function') showScreen('lobby');
  }
}

function ccRetry() {
  const goEl = document.getElementById('ccGameOver');
  if (goEl) goEl.style.display = 'none';
  ccResetState();
  ccBeginGameLoop();
}

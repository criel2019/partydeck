// ═══════════════════════════════════════
//  SLINKY STAIRS — PartyDeck Integration
// ═══════════════════════════════════════

/* ===== CONFIG ===== */
const SLK_STAIR_W = 88, SLK_STAIR_H = 16, SLK_STAIR_D = 10, SLK_OFF_X = 88, SLK_OFF_Y = 68;
const SLK_VIS_B = 5, SLK_VIS_A = 14;
const SLK_IN_CD = 42;
const SLK_NC = 14, SLK_POUR_START = 480, SLK_POUR_MIN = 340;
const SLK_ARCH_H = 34, SLK_SPREAD = 0.72, SLK_COIL_THICK = 3.5;
const SLK_CL_GRACE = 4;
const SLK_CL_IDLE = 2.8;
const SLK_CL_MOVE = 0.5;
const SLK_CL_MAX = 3.8;
const SLK_CL_ACC = 0.003;
const SLK_CL_IDLE_AFTER = 0.6;
const SLK_FV_NEED = 18, SLK_FV_DUR = 4500;
const SLK_GHOST_MAX = 5;

const SLK_SCOL = [
  {t:'#a29bfe',f:'#6c5ce7',s:'#4a3db0'},{t:'#55efc4',f:'#00b894',s:'#00876a'},
  {t:'#fab1a0',f:'#e17055',s:'#b85540'},{t:'#74b9ff',f:'#0984e3',s:'#0767b3'},
  {t:'#ffeaa7',f:'#fdcb6e',s:'#d4a84a'},{t:'#fd79a8',f:'#e84393',s:'#b83275'},
];
const SLK_PCOL = ['#ff6b6b','#ffa06b','#ffd93d','#6bffa0','#6bb5ff','#a06bff','#ff6bcc','#fff'];
const SLK_BGT = [{f:'#87CEEB',t:'#4A90D9'},{f:'#FF7F50',t:'#8B3A62'},{f:'#191970',t:'#0B0B2B'},{f:'#1B0533',t:'#0D001A'},{f:'#0a0020',t:'#1a002a'}];
const SLK_ML = [10,25,50,100,200,300,500,1000];

const SLK_CC = [];
{ for (let i = 0; i < SLK_NC; i++) { const h = (i / SLK_NC) * 360; SLK_CC.push({m:`hsl(${h},82%,62%)`,d:`hsl(${h},65%,40%)`,l:`hsl(${h},90%,80%)`}); } }

/* ===== STATE ===== */
let slkCv = null, slkCtx = null;
let slkW = 0, slkH = 0, slkDpr = 1;
let slkGs = 'idle';
let slkG = {};
let slkPts = [];
let slkBgS = [], slkBgC = [];
let slkSP = [], slkSD = [];
let slkPrevTs = 0;
let slkAnimId = null;
let slkMulti = null;
let slkResizeHandler = null;
let slkSafeTop = 0;

/* ===== UTIL ===== */
function slkRng(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function slkSs(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function slkDimH(h, a) { return '#' + h.slice(1).replace(/../g, s => Math.max(0, parseInt(s, 16) - a).toString(16).padStart(2, '0')); }
function slkLC(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  return `rgb(${~~(((ah >> 16) & 255) + (((bh >> 16) & 255) - ((ah >> 16) & 255)) * t)},${~~(((ah >> 8) & 255) + (((bh >> 8) & 255) - ((ah >> 8) & 255)) * t)},${~~((ah & 255) + ((bh & 255) - (ah & 255)) * t)})`;
}
function slkCB(ax, ay, bx, by, cx2, cy, dx, dy, t) {
  const o = 1 - t, o2 = o * o, o3 = o2 * o, t2 = t * t, t3 = t2 * t;
  return { x: o3 * ax + 3 * o2 * t * bx + 3 * o * t2 * cx2 + t3 * dx, y: o3 * ay + 3 * o2 * t * by + 3 * o * t2 * cy + t3 * dy };
}
function slkCBT(ax, ay, bx, by, cx2, cy, dx, dy, t) {
  const o = 1 - t;
  return { x: 3 * o * o * (bx - ax) + 6 * o * t * (cx2 - bx) + 3 * t * t * (dx - cx2), y: 3 * o * o * (by - ay) + 6 * o * t * (cy - by) + 3 * t * t * (dy - cy) };
}

/* ===== GENERATION ===== */
function slkGenDirs(seed, n) {
  const r = slkRng(seed), d = [0];
  for (let i = 1; i < n; i++) {
    if (r() < .15 + Math.min(i / 500, .3) && i > 1) d.push(d[i - 1]);
    else d.push(r() < .5 ? -1 : 1);
  }
  return d;
}
function slkCompPos(d) {
  const p = [{ x: 0, y: 0 }];
  for (let i = 1; i < d.length; i++) p.push({ x: p[i - 1].x + d[i] * SLK_OFF_X, y: p[i - 1].y + SLK_OFF_Y });
  return p;
}
function slkGenStars(d) { const r = slkRng(42), s = {}; for (let i = 5; i < d.length; i++) if (r() < .07) s[i] = 1; return s; }
function slkGenShields(d) { const r = slkRng(99), s = {}; for (let i = 25; i < d.length; i++) if (r() < .015) s[i] = 1; return s; }
function slkInitBg() {
  slkBgS = []; for (let i = 0; i < 180; i++) slkBgS.push({ x: Math.random() * 2000 - 500, y: Math.random() * 50000, z: Math.random() * 2 + .5, w: Math.random() * 6.28, p: Math.random() * .5 + .3 });
  slkBgC = []; for (let i = 0; i < 25; i++) slkBgC.push({ x: Math.random() * 2000 - 500, y: Math.random() * 8000, w: Math.random() * 120 + 60, h: Math.random() * 30 + 15, o: Math.random() * .25 + .08, p: Math.random() * .3 + .1 });
}

/* ===== GAME INIT ===== */
function slkInit() {
  slkSD = slkGenDirs(Date.now(), 10000);
  slkSP = slkCompPos(slkSD);
  slkInitBg();
  slkG = {
    step: 0, camX: 0, camY: 0, tgtX: 0, tgtY: 0,
    combo: 0, maxCombo: 0, score: 0,
    best: +(localStorage.getItem('slkBest') || 0),
    face: 1, lastInput: 0,
    pouring: false, pourFrom: 0, pourTo: 0, pourStart: 0, pourDur: SLK_POUR_START, pourT: 0,
    flipped: false,
    dead: false, deathReason: '', deathTime: 0,
    stars: 0, starSlots: slkGenStars(slkSD), mText: '', mTime: 0, shakeEnd: 0, cdStart: 0,
    cl: -2, cs: SLK_CL_IDLE, clActive: false, cst: {}, lastMove: 0,
    fg: 0, fv: false, fe: 0,
    sh: false, shSlots: slkGenShields(slkSD),
    ghosts: [], slines: [], landT: 0, landS: -1, vel: 0, pcy: 0, redF: 0,
  };
  slkPts = [];
}

/* ===== RESIZE ===== */
function slkResize() {
  if (!slkCv) return;
  slkDpr = devicePixelRatio || 1;
  slkW = slkCv.parentElement.clientWidth || innerWidth;
  slkH = slkCv.parentElement.clientHeight || innerHeight;
  slkCv.width = slkW * slkDpr;
  slkCv.height = slkH * slkDpr;
  slkCv.style.width = slkW + 'px';
  slkCv.style.height = slkH + 'px';
  if (slkCtx) slkCtx.setTransform(slkDpr, 0, 0, slkDpr, 0, 0);
  // Detect safe area inset for notched phones
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
  document.body.appendChild(el);
  slkSafeTop = el.offsetHeight || 0;
  el.remove();
}

/* ===== INPUT ===== */
function slkInp(dir) {
  if (slkGs !== 'playing') return;
  const now = performance.now();
  if (now - slkG.lastInput < SLK_IN_CD) return;
  slkG.lastInput = now;

  let nextStep;
  if (slkG.pouring) nextStep = slkG.pourTo + 1;
  else nextStep = slkG.step + 1;
  if (nextStep >= slkSD.length) return;

  const ok = slkG.fv || dir === slkSD[nextStep];
  if (ok) {
    if (slkG.pouring) { slkG.step = slkG.pourTo; slkG.flipped = !slkG.flipped; }

    slkG.pourFrom = slkG.step; slkG.pourTo = nextStep; slkG.pourStart = now;
    const stepSpeedup = Math.min(nextStep * 0.4, 180);
    const comboSpeedup = Math.max(0, slkG.combo - 3) * 3;
    slkG.pourDur = slkG.fv ? Math.max(90, SLK_POUR_MIN - 20) : Math.max(SLK_POUR_MIN, SLK_POUR_START - stepSpeedup - comboSpeedup);
    slkG.pourT = 0; slkG.pouring = true;

    slkG.combo++; if (slkG.combo > slkG.maxCombo) slkG.maxCombo = slkG.combo;
    slkG.face = slkG.fv ? slkSD[nextStep] : dir;
    slkG.tgtX = slkSP[nextStep].x; slkG.tgtY = slkSP[nextStep].y;
    slkG.lastMove = now;

    slkG.ghosts.push({ step: slkG.step, time: now });
    if (slkG.ghosts.length > SLK_GHOST_MAX) slkG.ghosts.shift();
    if (!slkG.fv) { slkG.fg = Math.min(SLK_FV_NEED, slkG.fg + 1); if (slkG.fg >= SLK_FV_NEED) { slkG.fv = true; slkG.fe = now + SLK_FV_DUR; slkG.fg = 0; } }
    if (slkG.starSlots[nextStep]) { slkG.stars++; delete slkG.starSlots[nextStep]; slkBurstStar(nextStep); }
    if (slkG.shSlots[nextStep]) { slkG.sh = true; delete slkG.shSlots[nextStep]; }
    slkBurstStep(nextStep, slkG.face);
    for (const m of SLK_ML) if (nextStep === m) { slkG.mText = `${m}칸!`; slkG.mTime = now; slkBurstMile(nextStep); slkG.shakeEnd = now + 200; }
    slkG.score = nextStep; slkG.landT = now; slkG.landS = nextStep;
    const n = 2 + Math.min(~~(slkG.combo * .2), 6);
    for (let i = 0; i < n; i++) slkG.slines.push({ x: Math.random() * slkW, y: -10, l: 30 + Math.random() * 60, sp: 400 + Math.random() * 600, a: .8 });
    if (nextStep >= SLK_CL_GRACE && !slkG.clActive) slkG.clActive = true;
  } else {
    if (slkG.sh) { slkG.sh = false; slkG.combo = 0; slkG.fg = Math.max(0, slkG.fg - 5); slkG.shakeEnd = now + 200; slkG.redF = now; }
    else { slkG.redF = now; slkDie('wrong'); }
  }
}

function slkDie(r) {
  if (slkG.dead) return;
  slkG.dead = true; slkG.deathReason = r; slkG.deathTime = performance.now();
  slkGs = 'dead';
  if (slkG.score > slkG.best) { slkG.best = slkG.score; localStorage.setItem('slkBest', slkG.score); }
  slkBurstDeath(); slkG.shakeEnd = performance.now() + 500;
}

function slkDeathMsg() {
  switch (slkG.deathReason) {
    case 'wrong': return '방향 실수!';
    case 'collapse': return '계단 붕괴!';
    default: return '으악!';
  }
}

/* ===== PARTICLES ===== */
function slkBurstStep(i, d) { const p = slkSP[i]; for (let j = 0; j < 6 + Math.min(slkG.combo, 20); j++) slkPts.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * 3 + d * 1.5, vy: (Math.random() - .8) * 3, l: 1, d: .02 + Math.random() * .02, s: Math.random() * 4 + 2, c: SLK_PCOL[~~(Math.random() * 8)], t: 'c' }); }
function slkBurstStar(i) { const p = slkSP[i]; for (let j = 0; j < 12; j++) { const a = j / 12 * 6.28; slkPts.push({ x: p.x, y: p.y - 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, l: 1, d: .025, s: 3, c: '#ffd93d', t: 's' }); } }
function slkBurstMile(i) { const p = slkSP[i]; for (let j = 0; j < 30; j++) { const a = Math.random() * 6.28, sp = Math.random() * 8 + 2; slkPts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: 1, d: .01 + Math.random() * .01, s: Math.random() * 6 + 3, c: SLK_PCOL[~~(Math.random() * 8)], t: 'c' }); } }
function slkBurstDeath() { const p = slkSP[slkG.step]; for (let i = 0; i < SLK_NC; i++) { const a = Math.random() * 6.28, sp = Math.random() * 5 + 1; slkPts.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, l: 1, d: .008, s: Math.random() * 5 + 4, c: SLK_CC[i % SLK_NC].m, t: 'r' }); } }
function slkBurstCollapse(i) { const p = slkSP[i], c = SLK_SCOL[i % 6]; for (let j = 0; j < 12; j++) slkPts.push({ x: p.x + (Math.random() - .5) * SLK_STAIR_W, y: p.y + (Math.random() - .5) * SLK_STAIR_H, vx: (Math.random() - .5) * 4, vy: Math.random() * 4 + 2, l: 1, d: .012 + Math.random() * .008, s: Math.random() * 5 + 2, c: j < 6 ? c.f : c.s, t: 'c' }); }
function slkUpdateParts(dt) { for (let i = slkPts.length - 1; i >= 0; i--) { const p = slkPts[i]; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += .1 * dt * 60; p.l -= p.d * dt * 60; if (p.l <= 0) slkPts.splice(i, 1); } }
function slkDrawParts(ox, oy) {
  const ctx = slkCtx;
  for (const p of slkPts) {
    const sx = p.x + ox, sy = p.y + oy;
    ctx.globalAlpha = Math.max(0, p.l);
    if (p.t === 'r') { ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, p.s, p.s * .5, 0, 0, 6.28); ctx.stroke(); }
    else if (p.t === 's') { ctx.fillStyle = p.c; ctx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? p.s * .5 : p.s, a = k * Math.PI / 5 - 1.5708; k ? ctx.lineTo(sx + r * Math.cos(a), sy + r * Math.sin(a)) : ctx.moveTo(sx + r * Math.cos(a), sy + r * Math.sin(a)); } ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(sx, sy, p.s * p.l, 0, 6.28); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

/* ===== DRAW HELPERS ===== */
function slkDrawBg(step, camY, t) {
  const ctx = slkCtx, W = slkW, H = slkH;
  const ti = step < 100 ? 0 : step < 300 ? 1 : step < 500 ? 2 : step < 700 ? 3 : 4;
  const th = SLK_BGT[ti], nx = SLK_BGT[Math.min(ti + 1, 4)]; const thr = [100, 300, 500, 700, 99999][ti];
  let tr = 0; if (step > thr - 30) tr = Math.min(1, (step - (thr - 30)) / 30);
  const fc = tr > 0 ? slkLC(th.f, nx.f, tr) : th.f, tc = tr > 0 ? slkLC(th.t, nx.t, tr) : th.t;
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, fc); gr.addColorStop(1, tc); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  if (ti <= 1) { ctx.globalAlpha = ti ? .12 : .18; for (const c of slkBgC) { const x = c.x + Math.sin(t * .001 * c.p + c.y) * 20, y = (c.y - camY * .2) % (H + 100) - 50; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x % (W + 200) - 100, y, c.w, c.h, 0, 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1; }
  if (ti >= 2) { for (const s of slkBgS) { const y = (s.y - camY * .1) % (H + 100) - 50, x = (s.x + Math.sin(t * .002) * 5) % (W + 200) - 100, tw = Math.sin(t * .003 * s.p + s.w) * .5 + .5; ctx.globalAlpha = tw * .6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s.z * tw, 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1; }
  if (ti === 4) { ctx.globalAlpha = .05; ctx.strokeStyle = '#f0f'; ctx.lineWidth = 1; for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + (camY * .3) % 40); ctx.lineTo(W, y + (camY * .3) % 40); ctx.stroke(); } for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } ctx.globalAlpha = 1; }
}

function slkDrawStair(sx, sy, ci, cur, al, ts) {
  const ctx = slkCtx;
  const w = SLK_STAIR_W, h = SLK_STAIR_H, d = SLK_STAIR_D, c = SLK_SCOL[ci % 6];
  let sq = 0; if (ts && ci === slkG.landS && ts - slkG.landT < 180) { const p = (ts - slkG.landT) / 180; sq = Math.sin(p * Math.PI) * (1 - p); }
  const sw = w + sq * 6, sh = h - sq * 3, by = sq * 2;
  ctx.globalAlpha = al;
  ctx.fillStyle = cur ? c.t : slkDimH(c.t, 25); ctx.beginPath(); ctx.moveTo(sx - sw / 2, sy - sh / 2 + by); ctx.lineTo(sx - sw / 2 + d, sy - sh / 2 - d + by); ctx.lineTo(sx + sw / 2 + d, sy - sh / 2 - d + by); ctx.lineTo(sx + sw / 2, sy - sh / 2 + by); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cur ? c.f : slkDimH(c.f, 20); ctx.fillRect(sx - sw / 2, sy - sh / 2 + by, sw, sh);
  ctx.fillStyle = cur ? c.s : slkDimH(c.s, 15); ctx.beginPath(); ctx.moveTo(sx + sw / 2, sy - sh / 2 + by); ctx.lineTo(sx + sw / 2 + d, sy - sh / 2 - d + by); ctx.lineTo(sx + sw / 2 + d, sy + sh / 2 - d + by); ctx.lineTo(sx + sw / 2, sy + sh / 2 + by); ctx.closePath(); ctx.fill();
  if (cur) { const gc = slkG.fv ? `hsl(${(performance.now() * .2) % 360},90%,60%)` : c.t; ctx.shadowColor = gc; ctx.shadowBlur = slkG.fv ? 22 : 14; ctx.globalAlpha = .2 * al; ctx.fillStyle = gc; ctx.fillRect(sx - sw / 2 - 4, sy - sh / 2 - 4 + by, sw + 8, sh + 8); ctx.shadowBlur = 0; }
  ctx.globalAlpha = 1;
}

function slkDrawCollapsingStair(sx, sy, ci, progress) {
  const ctx = slkCtx;
  ctx.save();
  const shake = progress < .4 ? (Math.sin(progress * 80 + ci) * 3 * (1 - progress / .4)) : 0;
  const fall = progress >= .4 ? ((progress - .4) / .6) : 0;
  ctx.translate(sx + shake, sy + fall * fall * 90); ctx.rotate(fall * .4 * (ci % 2 ? 1 : -1));
  ctx.globalAlpha = (1 - fall) * .75;
  const c = SLK_SCOL[ci % 6];
  ctx.fillStyle = slkDimH(c.f, 30 + fall * 30); ctx.fillRect(-SLK_STAIR_W / 2, -SLK_STAIR_H / 2, SLK_STAIR_W / 2 - fall * 4, SLK_STAIR_H);
  ctx.fillStyle = slkDimH(c.f, 35 + fall * 25); ctx.fillRect(fall * 4, -SLK_STAIR_H / 2 + fall * 6, SLK_STAIR_W / 2, SLK_STAIR_H);
  ctx.restore(); ctx.globalAlpha = 1;
}

function slkDrawShield(sx, sy, t) {
  const ctx = slkCtx;
  ctx.save(); ctx.translate(sx, sy - 25 + Math.sin(t * .004) * 4);
  const pulse = Math.sin(t * .006) * .15 + 1; ctx.scale(pulse, pulse);
  ctx.globalAlpha = .2; ctx.fillStyle = '#74b9ff'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 6.28); ctx.fill();
  ctx.globalAlpha = .35; ctx.strokeStyle = '#74b9ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.28); ctx.stroke();
  ctx.globalAlpha = 1; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('\u{1F6E1}\uFE0F', 0, 0);
  ctx.restore();
}

function slkDrawStar(sx, sy, t) {
  const ctx = slkCtx;
  const p = Math.sin(t * .005) * .2 + 1, r = t * .002; ctx.save(); ctx.translate(sx, sy - 22); ctx.rotate(r); ctx.scale(p, p);
  ctx.shadowColor = '#ffd93d'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffd93d'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const R = i % 2 ? 4 : 8, a = i * Math.PI / 5 - 1.5708; i ? ctx.lineTo(R * Math.cos(a), R * Math.sin(a)) : ctx.moveTo(R * Math.cos(a), R * Math.sin(a)); }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
}

/* ===== COIL ===== */
function slkDrawCoil(x, y, w, h, ci, tilt, alpha) {
  const ctx = slkCtx, c = SLK_CC[ci % SLK_NC];
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (tilt) ctx.rotate(tilt);
  ctx.strokeStyle = c.d; ctx.lineWidth = SLK_COIL_THICK * .65; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI, false); ctx.stroke();
  ctx.strokeStyle = slkG.fv ? `hsl(${(performance.now() * .3 + ci * 25) % 360},90%,65%)` : c.m; ctx.lineWidth = SLK_COIL_THICK;
  ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, Math.PI, Math.PI * 2, false); ctx.stroke();
  ctx.strokeStyle = c.l; ctx.lineWidth = SLK_COIL_THICK * .3;
  ctx.beginPath(); ctx.ellipse(0, -h * .15, w * .68, h * .5, 0, Math.PI * 1.1, Math.PI * 1.8, false); ctx.stroke();
  ctx.restore();
}

/* ===== SLINKY ===== */
function slkGetSlot(i, flipped) { return flipped ? (SLK_NC - 1) - i : i; }

function slkDrawSlinky(ox, oy, now) {
  const cw = 22, ch = 7, sp = 2.8;

  if (slkG.dead) {
    const el = (now - slkG.deathTime) / 1000; const p = slkSP[slkG.step];
    for (let i = 0; i < SLK_NC; i++) {
      const slot = slkGetSlot(i, slkG.flipped);
      const t = Math.min(Math.max(0, (el - (1 - i / SLK_NC) * .3)) * 2, 1);
      if (t <= 0) { slkDrawCoil(p.x + ox, p.y - SLK_STAIR_H / 2 - (slot + 1) * sp + oy, cw, ch, i, 0, 1); continue; }
      const al = 1 - t * t; if (al <= 0) continue;
      const fx = slkG.face * t * t * 120 * (.3 + (i / SLK_NC) * .7);
      const fy = -t * 30 * (i / SLK_NC) + t * t * 200 * (1 - (i / SLK_NC) * .3);
      slkDrawCoil(p.x + ox + fx, p.y - SLK_STAIR_H / 2 - (slot + 1) * sp + oy + fy, cw + t * 10, ch + t * 4, i, t * (i * .4 - 2.8), al);
    }
    return;
  }

  if (!slkG.pouring) {
    const p = slkSP[slkG.step], surfY = p.y - SLK_STAIR_H / 2;
    const breath = Math.sin(now * .002) * 1;
    for (let i = 0; i < SLK_NC; i++) {
      const slot = slkGetSlot(i, slkG.flipped);
      slkDrawCoil(p.x + ox + breath * (slot / (SLK_NC - 1)), surfY - (slot + 1) * sp + oy, cw, ch, i, 0, 1);
    }
    return;
  }

  const from = slkSP[slkG.pourFrom], to = slkSP[slkG.pourTo];
  const dir = Math.sign(to.x - from.x);
  const fromSurf = from.y - SLK_STAIR_H / 2, toSurf = to.y - SLK_STAIR_H / 2;
  const pourT = slkG.pourT;

  for (let i = 0; i < SLK_NC; i++) {
    const srcSlot = slkGetSlot(i, slkG.flipped);
    const dstSlot = slkGetSlot(i, !slkG.flipped);
    const srcTop = srcSlot / (SLK_NC - 1);
    const delay = (1 - srcTop) * SLK_SPREAD, dur = 1 - SLK_SPREAD;
    const rawP = (pourT - delay) / dur;
    const pi = Math.max(0, Math.min(1, rawP));
    const si = slkSs(pi);

    const srcX = from.x, srcY = fromSurf - (srcSlot + 1) * sp;
    const dstX = to.x, dstY = toSurf - (dstSlot + 1) * sp;

    let coilX, coilY, tilt = 0, alpha = 1;

    if (pi <= 0) {
      coilX = srcX; coilY = srcY;
      if (rawP > -.12) { const u = (rawP + .12) / .12; coilX += u * 5 * dir; coilY -= u * 1.5; tilt = u * .08 * dir; }
    } else if (pi >= 1) {
      coilX = dstX; coilY = dstY;
      const ot = (rawP - 1) * dur * 6;
      if (ot > 0 && ot < 1) coilX += Math.sin(ot * Math.PI * 2) * Math.exp(-ot * 5) * 2.5 * (dstSlot / (SLK_NC - 1));
      tilt = 0;
    } else {
      const dx = Math.abs(dstX - srcX);
      const p1x = srcX + dir * dx * .2, p1y = srcY - SLK_ARCH_H;
      const p2x = dstX - dir * dx * .2, p2y = dstY - SLK_ARCH_H * .6;
      const pos = slkCB(srcX, srcY, p1x, p1y, p2x, p2y, dstX, dstY, si);
      coilX = pos.x; coilY = pos.y;
      coilX += Math.sin(si * Math.PI) * ((1 - srcTop) - .5) * 3;
      coilX += Math.sin(si * Math.PI) * Math.sin(now * .012 + i * .35) * 1.2;
      coilY += Math.sin(si * Math.PI) * 5;
      const tan = slkCBT(srcX, srcY, p1x, p1y, p2x, p2y, dstX, dstY, si);
      const rawTilt = Math.atan2(tan.y, tan.x);
      tilt = rawTilt * .18 * Math.sin(si * Math.PI);
      const str = Math.sin(si * Math.PI);
      slkDrawCoil(coilX + ox, coilY + oy, cw * (1 + str * .22), ch * (1 + str * .12), i, tilt, .9 + .1 * (1 - str));
      continue;
    }
    slkDrawCoil(coilX + ox, coilY + oy, cw, ch, i, tilt, alpha);
  }
}

/* ===== HUD ===== */
function slkST(t, cx, cy, f, c) {
  const ctx = slkCtx;
  ctx.font = f; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillText(t, cx + 1, cy + 2); ctx.fillStyle = c; ctx.fillText(t, cx, cy);
}
function slkDrawHUD(now) {
  const ctx = slkCtx, W = slkW, H = slkH, st = slkSafeTop;
  const fs = Math.min(42, W * .1);
  slkST(`${slkG.score}`, W / 2, st + fs + 4, `800 ${fs}px "Baloo 2",sans-serif`, '#fff');
  ctx.font = '700 11px "Baloo 2",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillText('칸', W / 2, st + fs + 16);
  if (slkG.best > 0 && slkG.score < slkG.best) { ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillText(`BEST ${slkG.best}`, W / 2, st + fs + 27); }
  if (slkG.combo > 1) { const sz = Math.min(14 + slkG.combo * .25, 26); const cc = slkG.fv ? `hsl(${(now * .3) % 360},90%,65%)` : slkG.combo >= 15 ? SLK_CC[~~(now * .01) % SLK_NC].m : slkG.combo >= 8 ? '#ffd93d' : 'rgba(255,255,255,.5)'; slkST(`${slkG.combo}x`, W / 2, st + fs + 42, `700 ${sz}px "Baloo 2",sans-serif`, cc); }
  if (!slkG.fv && slkG.fg > 0) { const fW = Math.min(80, W * .2), fH = 3, fX = W / 2 - fW / 2, fY = H - 22; ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(fX, fY, fW, fH); const gr = ctx.createLinearGradient(fX, 0, fX + fW, 0); gr.addColorStop(0, '#ff6b6b'); gr.addColorStop(1, '#ffd93d'); ctx.fillStyle = gr; ctx.fillRect(fX, fY, (slkG.fg / SLK_FV_NEED) * fW, fH); }
  if (slkG.stars > 0) { ctx.font = '700 14px "Baloo 2",sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#ffd93d'; ctx.fillText(`★${slkG.stars}`, W - 10, st + 22); }
  if (slkG.sh) { ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('\u{1F6E1}\uFE0F', 8, st + 22); }
  if (slkG.mText && now - slkG.mTime < 1800) { const m = (now - slkG.mTime) / 1800; ctx.globalAlpha = 1 - m; slkST(slkG.mText, W / 2, H * .25 - m * 25, `800 ${28 + (1 - m) * 8}px "Baloo 2",sans-serif`, SLK_CC[~~(now * .008) % SLK_NC].m); ctx.globalAlpha = 1; }
}

function slkDrawDeath(now) {
  const ctx = slkCtx, W = slkW, H = slkH;
  const el = (now - slkG.deathTime) / 1000, fd = Math.min(el / .35, 1);
  ctx.globalAlpha = fd * .75; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = fd;
  slkST(slkDeathMsg(), W / 2, H * .18, `800 ${Math.min(36, W * .09)}px "Baloo 2",sans-serif`, slkG.deathReason === 'collapse' ? '#ff8c00' : '#ff6b6b');
  slkST(`${slkG.score}`, W / 2, H * .36, `800 ${Math.min(80, W * .2)}px "Baloo 2",sans-serif`, '#fff');
  ctx.font = '700 16px "Baloo 2",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('칸', W / 2, H * .41);
  if (slkG.score >= slkG.best && slkG.score > 0) { const pu = Math.sin(now * .006) * .08 + 1; ctx.save(); ctx.translate(W / 2, H * .48); ctx.scale(pu, pu); slkST('\u{1F3C6} NEW BEST!', 0, 0, '800 20px "Baloo 2",sans-serif', '#ffd93d'); ctx.restore(); }
  else if (slkG.best > 0) { const diff = slkG.best - slkG.score; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '700 14px "Baloo 2",sans-serif'; ctx.fillText(diff > 0 ? `BEST까지 ${diff}칸` : `BEST ${slkG.best}`, W / 2, H * .48); }
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '700 13px "Baloo 2",sans-serif'; ctx.fillText(`콤보 ${slkG.maxCombo}x \u00B7 ★${slkG.stars}`, W / 2, H * .56);
  if (el > .5) { ctx.globalAlpha = .5 + Math.sin(now * .005) * .3; ctx.fillStyle = '#fff'; ctx.font = '700 15px "Baloo 2",sans-serif'; ctx.fillText('탭하여 재시작', W / 2, H * .7); ctx.globalAlpha = 1; }
  ctx.globalAlpha = 1;
}

function slkDrawCD(now) {
  const ctx = slkCtx, W = slkW, H = slkH;
  const el = (now - slkG.cdStart) / 1000; let txt;
  if (el < .7) txt = '3'; else if (el < 1.4) txt = '2'; else if (el < 2.1) txt = '1';
  else { txt = 'GO!'; if (el > 2.5) { slkGs = 'playing'; slkG.lastMove = performance.now(); return; } }
  const ph = (el % .7) / .7;
  ctx.globalAlpha = txt === 'GO!' ? Math.max(0, 1 - (el - 2.1) * 2.5) : 1;
  ctx.fillStyle = txt === 'GO!' ? '#55efc4' : '#fff';
  ctx.font = `800 ${Math.min(80 * (1 + (1 - ph) * .5), 120)}px 'Baloo 2',sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText(txt, W / 2, H * .45); ctx.globalAlpha = 1;
}

function slkStartCD() { slkGs = 'countdown'; slkG.cdStart = performance.now(); }

/* ===== MAIN LOOP ===== */
function slkLoop(ts) {
  if (!slkCv || !slkCtx) { slkAnimId = null; return; }
  if (slkGs === 'idle') { slkAnimId = null; return; }
  const ctx = slkCtx, W = slkW, H = slkH;
  const dt = Math.min((ts - slkPrevTs) / 1000, .05); slkPrevTs = ts;
  ctx.clearRect(0, 0, W, H);

  // === PLAYING UPDATES ===
  if (slkGs === 'playing') {
    if (slkG.fv && ts > slkG.fe) { slkG.fv = false; slkG.fg = 0; }
    if (slkG.clActive && !slkG.dead) {
      const idle = (ts - slkG.lastMove) / 1000;
      const baseSpd = idle > SLK_CL_IDLE_AFTER ? SLK_CL_IDLE : SLK_CL_MOVE;
      slkG.cs = Math.min(SLK_CL_MAX, baseSpd + slkG.score * SLK_CL_ACC);
      slkG.cl += slkG.cs * dt;
      const ci = Math.floor(slkG.cl);
      for (let j = Math.max(0, ci - 2); j <= ci; j++) {
        if (j >= 0 && !slkG.cst[j]) { slkG.cst[j] = { start: ts }; slkBurstCollapse(j); }
      }
      const currentStair = slkG.pouring ? slkG.pourFrom : slkG.step;
      if (currentStair <= slkG.cl) slkDie('collapse');
    }
  }

  // Pour progress
  if (slkG.pouring) {
    slkG.pourT = (ts - slkG.pourStart) / slkG.pourDur;
    if (slkG.pourT >= 1) { slkG.pourT = 1; slkG.pouring = false; slkG.step = slkG.pourTo; slkG.flipped = !slkG.flipped; }
  }

  // Camera
  const cl = 1 - Math.pow(.001, dt);
  slkG.camX += (slkG.tgtX - slkG.camX) * cl; slkG.camY += (slkG.tgtY - slkG.camY) * cl;
  slkG.vel = Math.abs(slkG.camY - slkG.pcy) / Math.max(dt, .001); slkG.pcy = slkG.camY;
  let shx = 0, shy = 0;
  if (ts < slkG.shakeEnd) { const i = (slkG.shakeEnd - ts) / 400 * 5; shx = (Math.random() - .5) * i; shy = (Math.random() - .5) * i; }
  ctx.save();
  if (ts - slkG.landT < 120) { const lp = (ts - slkG.landT) / 120; const sc = 1 + Math.sin(lp * Math.PI) * .006; ctx.translate(W / 2 * (1 - sc), H / 2 * (1 - sc)); ctx.scale(sc, sc); }
  const ox = W / 2 - slkG.camX + shx, oy = H * .3 - slkG.camY + shy;

  slkDrawBg(slkG.score, slkG.camY, ts);
  // Speed lines
  for (let i = slkG.slines.length - 1; i >= 0; i--) { const l = slkG.slines[i]; l.y += l.sp * dt; l.a -= dt * 1.8; if (l.a <= 0 || l.y > H) { slkG.slines.splice(i, 1); continue; } ctx.globalAlpha = l.a * Math.min(.15, slkG.vel * .0003 + .01); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 + slkG.vel * .002; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.l); ctx.stroke(); } ctx.globalAlpha = 1;

  // === DRAW STAIRS ===
  const baseStep = slkG.pouring ? slkG.pourFrom : slkG.step;
  const si = Math.max(0, baseStep - SLK_VIS_B), ei = Math.min(slkSP.length - 1, baseStep + SLK_VIS_A);
  const collapseFloor = Math.floor(slkG.cl);

  for (let i = si; i <= ei; i++) {
    const p = slkSP[i], sx = p.x + ox, sy = p.y + oy;
    if (slkG.cst[i]) { const elapsed = (ts - slkG.cst[i].start) / 600; if (elapsed < 1) slkDrawCollapsingStair(sx, sy, i, elapsed); continue; }
    if (i < collapseFloor) continue;
    const cur = slkG.pouring ? (i === slkG.pourFrom || i === slkG.pourTo) : (i === slkG.step);
    let al = 1;
    if (i < baseStep) al = Math.max(.15, 1 - (baseStep - i) * .2);
    else if (i > baseStep + 2) al = Math.max(.45, 1 - (i - baseStep - 2) * .04);
    const dangerDist = i - collapseFloor;
    if (slkG.clActive && dangerDist >= 0 && dangerDist < 3 && !slkG.dead) { al *= .5 + Math.sin(ts * .025 - dangerDist * 1.5) * .5; }
    const nextHint = slkG.pouring ? slkG.pourTo + 1 : slkG.step + 1;
    if (i === nextHint && slkGs === 'playing' && !slkG.pouring) {
      const d = slkSD[i], ax = sx + d * 45, pulse = Math.sin(ts * .01) * .4 + .6;
      ctx.globalAlpha = pulse * .22; ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(d > 0 ? '\u203A' : '\u2039', ax + d * 8, sy + 5); ctx.globalAlpha = pulse * .1; ctx.fillText(d > 0 ? '\u203A' : '\u2039', ax + d * 18, sy + 5); ctx.globalAlpha = 1;
    }
    slkDrawStair(sx, sy, i, cur, al, ts);
    if (slkG.starSlots[i]) slkDrawStar(sx, sy, ts);
    if (slkG.shSlots[i]) slkDrawShield(sx, sy, ts);
  }

  // Ghosts
  for (let gi = slkG.ghosts.length - 1; gi >= 0; gi--) {
    const gh = slkG.ghosts[gi], age = (ts - gh.time) / 300;
    if (age > 1) { slkG.ghosts.splice(gi, 1); continue; }
    const al = .25 * (1 - age); if (al < .02) continue;
    const p = slkSP[gh.step], sf = p.y - SLK_STAIR_H / 2;
    for (let ci = 0; ci < SLK_NC; ci += 3) {
      const sl = slkGetSlot(ci, slkG.flipped);
      ctx.globalAlpha = al; ctx.strokeStyle = slkG.fv ? `hsla(${(ts * .3 + ci * 25) % 360},90%,65%,${al})` : `rgba(140,140,255,${al})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x + ox, sf - (sl + 1) * 2.8 + oy, 17, 5, 0, 0, 6.28); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  slkDrawSlinky(ox, oy, ts);

  // Shield aura
  if (slkG.sh && !slkG.dead) {
    const sp2 = slkSP[slkG.pouring ? slkG.pourTo : slkG.step], shx2 = sp2.x + ox, shy2 = sp2.y + oy - 20;
    const pulse = Math.sin(ts * .007) * .2 + .8;
    ctx.globalAlpha = .25 * pulse; ctx.fillStyle = '#40a0ff'; ctx.beginPath(); ctx.arc(shx2, shy2, 48, 0, 6.28); ctx.fill();
    ctx.globalAlpha = .5 * pulse; ctx.strokeStyle = '#60b0ff'; ctx.lineWidth = 3; ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.arc(shx2, shy2, 48, ts * .003 % (Math.PI * 2), ts * .003 % (Math.PI * 2) + Math.PI * 1.7); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = .9; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('\u{1F6E1}\uFE0F', shx2, shy2 - 40);
    ctx.globalAlpha = 1;
  }

  slkUpdateParts(dt); slkDrawParts(ox, oy);

  // Fire column
  if (slkG.clActive && slkG.cl >= 0) {
    const clIdx = Math.min(Math.floor(slkG.cl), slkSP.length - 1);
    if (clIdx >= 0 && slkSP[clIdx]) {
      const cp = slkSP[clIdx], fireY = cp.y + oy - SLK_OFF_Y;
      const fh = Math.max(0, fireY + 120);
      const gr = ctx.createLinearGradient(0, fh, 0, Math.max(fireY - 100, 0));
      gr.addColorStop(0, 'transparent');
      gr.addColorStop(.2, 'rgba(255,80,0,.25)');
      gr.addColorStop(.4, 'rgba(255,40,0,.55)');
      gr.addColorStop(.65, 'rgba(220,0,0,.8)');
      gr.addColorStop(.85, 'rgba(120,0,0,.93)');
      gr.addColorStop(1, 'rgba(30,0,0,.98)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, fh);
      for (let i = 0; i < 24; i++) {
        const fx = (i / 24) * W + Math.sin(ts * .003 + i * 2.1) * 30;
        const fy = fireY + Math.sin(ts * .005 + i * 1.7) * 35 - 10;
        if (fy < -40 || fy > H + 40) continue;
        const sz = 4 + Math.sin(ts * .02 + i) * 3 + Math.random() * .5;
        ctx.globalAlpha = .6 + Math.sin(ts * .012 + i) * .3;
        ctx.fillStyle = ['#ff4400', '#ff8800', '#ffcc00', '#ff2200', '#ffaa00'][i % 5];
        ctx.beginPath(); ctx.arc(fx, fy, sz, 0, 6.28); ctx.fill();
        for (let k = 1; k <= 2; k++) {
          ctx.globalAlpha *= .55;
          ctx.beginPath(); ctx.arc(fx + Math.sin(ts * .008 + i + k) * 8, fy - sz * k * 2.5 - Math.random() * 5, sz * (.5 / k), 0, 6.28); ctx.fill();
        }
      }
      ctx.globalAlpha = .5 + Math.sin(ts * .01) * .2; ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, fireY);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, fireY + Math.sin(ts * .008 + x * .02) * 12);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // Danger vignette
  if (slkG.clActive && !slkG.dead) {
    const dng = slkG.step - Math.floor(slkG.cl);
    if (dng <= 7 && dng > 0) {
      const it = 1 - dng / 7, pu = Math.sin(ts * .016) * .5 + .5;
      const vigA = it * .45 * (.4 + pu * .6);
      const gT = ctx.createLinearGradient(0, 0, 0, H * .3); gT.addColorStop(0, `rgba(255,20,0,${vigA})`); gT.addColorStop(1, 'transparent'); ctx.fillStyle = gT; ctx.fillRect(0, 0, W, H * .3);
      const sideA = vigA * .7;
      const gL = ctx.createLinearGradient(0, 0, W * .15, 0); gL.addColorStop(0, `rgba(255,40,0,${sideA})`); gL.addColorStop(1, 'transparent'); ctx.fillStyle = gL; ctx.fillRect(0, 0, W * .15, H);
      const gR = ctx.createLinearGradient(W, 0, W * .85, 0); gR.addColorStop(0, `rgba(255,40,0,${sideA})`); gR.addColorStop(1, 'transparent'); ctx.fillStyle = gR; ctx.fillRect(W * .85, 0, W * .15, H);
      if (dng <= 3) {
        ctx.globalAlpha = it * .15; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(255,${~~(20 + dng * 15)},0,${(.5 + pu * .4).toFixed(2)})`; ctx.lineWidth = 4 + it * 6; ctx.strokeRect(0, 0, W, H);
      }
    }
  }

  // Fever overlay
  if (slkG.fv && !slkG.dead) {
    const hue = (ts * .3) % 360;
    const rm = Math.max(0, (slkG.fe - ts) / 1000);
    ctx.globalAlpha = .15 + Math.sin(ts * .006) * .05; ctx.fillStyle = `hsl(${hue},90%,50%)`; ctx.fillRect(0, 0, W, H);
    const gw = 70 + Math.sin(ts * .005) * 20;
    const gL2 = ctx.createLinearGradient(0, 0, gw, 0); gL2.addColorStop(0, `hsla(${hue},95%,55%,.5)`); gL2.addColorStop(1, 'transparent'); ctx.fillStyle = gL2; ctx.fillRect(0, 0, gw, H);
    const gR2 = ctx.createLinearGradient(W, 0, W - gw, 0); gR2.addColorStop(0, `hsla(${(hue + 180) % 360},95%,55%,.5)`); gR2.addColorStop(1, 'transparent'); ctx.fillStyle = gR2; ctx.fillRect(W - gw, 0, gw, H);
    const gTop = ctx.createLinearGradient(0, 0, 0, 50); gTop.addColorStop(0, `hsla(${(hue + 90) % 360},95%,55%,.35)`); gTop.addColorStop(1, 'transparent'); ctx.fillStyle = gTop; ctx.fillRect(0, 0, W, 50);
    const gBot = ctx.createLinearGradient(0, H, 0, H - 50); gBot.addColorStop(0, `hsla(${(hue + 270) % 360},95%,55%,.35)`); gBot.addColorStop(1, 'transparent'); ctx.fillStyle = gBot; ctx.fillRect(0, H - 50, W, 50);
    ctx.globalAlpha = .6; ctx.strokeStyle = `hsl(${hue},95%,60%)`; ctx.lineWidth = 6 + Math.sin(ts * .008) * 3; ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.globalAlpha = .25 + Math.sin(ts * .01) * .1;
    ctx.font = `900 ${Math.min(W * .25, 120)}px "Baloo 2",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `hsl(${hue},95%,65%)`; ctx.fillText('FEVER', W / 2, H / 2);
    ctx.shadowColor = `hsl(${hue},95%,55%)`; ctx.shadowBlur = 30; ctx.globalAlpha = .12; ctx.fillText('FEVER', W / 2, H / 2); ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    slkST(`\u{1F525} ${rm.toFixed(1)}s \u{1F525}`, W / 2, H - 18, `800 ${20 + Math.sin(ts * .012) * 3}px "Baloo 2",sans-serif`, `hsl(${hue},95%,65%)`);
  }

  // Red flash
  if (slkG.redF > 0) { const rf = (ts - slkG.redF) / 350; if (rf < 1) { ctx.globalAlpha = (1 - rf) * .5; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; } else slkG.redF = 0; }

  if (slkG.combo >= 20 && !slkG.fv && !slkG.dead) { ctx.globalAlpha = .06; ctx.strokeStyle = SLK_CC[~~(ts * .01) % SLK_NC].m; ctx.lineWidth = 4; ctx.strokeRect(3, 3, W - 6, H - 6); ctx.globalAlpha = 1; }
  ctx.restore();

  if (slkGs === 'playing' || slkGs === 'dead') slkDrawHUD(ts);
  if (slkGs === 'countdown') slkDrawCD(ts);
  if (slkGs === 'dead') slkDrawDeath(ts);

  slkAnimId = requestAnimationFrame(slkLoop);
}

/* ===== EVENT HANDLERS ===== */
function _slkKeyHandler(e) {
  if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); slkInp(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); slkInp(1); }
  else if ((e.key === ' ' || e.key === 'Enter') && slkGs === 'dead') { e.preventDefault(); slkInit(); slkStartCD(); }
}

function _slkTouchHandler(e) {
  e.preventDefault();
  if (slkGs === 'dead') { slkInit(); slkStartCD(); return; }
  slkInp(e.touches[0].clientX < slkW / 2 ? -1 : 1);
}

function _slkMouseHandler(e) {
  if (slkGs === 'dead') { slkInit(); slkStartCD(); return; }
  slkInp(e.clientX < slkW / 2 ? -1 : 1);
}

/* ===== PARTYDECK INTEGRATION ===== */
function slkInitCanvas() {
  // Clean up any previous session to prevent duplicate handlers
  slkCleanup();

  slkCv = document.getElementById('slkCanvas');
  if (!slkCv) return;
  slkCtx = slkCv.getContext('2d');
  slkResize();

  // Bind events
  slkResizeHandler = slkResize;
  window.addEventListener('resize', slkResizeHandler);
  document.addEventListener('keydown', _slkKeyHandler);
  slkCv.addEventListener('touchstart', _slkTouchHandler, { passive: false });
  slkCv.addEventListener('mousedown', _slkMouseHandler);
}

function startSlinkyStairs() {
  if (typeof state === 'undefined' || !state.isHost) return;

  slkMulti = {
    phase: 'playing',
    players: state.players.map(function(p) {
      return { id: p.id, name: p.name, avatar: p.avatar, score: 0 };
    })
  };

  if (typeof broadcast === 'function') {
    broadcast({ type: 'game-start', game: 'slinkystairs', state: slkMulti });
  }

  showScreen('slinkyStairsGame');
  slkInitCanvas();
  slkInit();
  slkPrevTs = performance.now();
  slkStartCD();
  slkAnimId = requestAnimationFrame(slkLoop);
}

function renderSlinkyStairsView(st) {
  if (st) slkMulti = st;
  slkInitCanvas();
  slkInit();
  slkPrevTs = performance.now();
  slkStartCD();
  slkAnimId = requestAnimationFrame(slkLoop);
}

function slkCleanup() {
  if (slkAnimId) { cancelAnimationFrame(slkAnimId); slkAnimId = null; }
  if (slkResizeHandler) { window.removeEventListener('resize', slkResizeHandler); slkResizeHandler = null; }
  document.removeEventListener('keydown', _slkKeyHandler);
  if (slkCv) {
    slkCv.removeEventListener('touchstart', _slkTouchHandler);
    slkCv.removeEventListener('mousedown', _slkMouseHandler);
  }
  slkCv = null; slkCtx = null;
  slkMulti = null;
  slkGs = 'idle';
  slkSafeTop = 0;
  slkPts = [];
  slkBgS = []; slkBgC = [];
  slkSP = []; slkSD = [];
}

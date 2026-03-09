// ===== FORTRESS — Sky & Terrain Rendering =====
// Separated from fortress.js for modularity

let _ftCloudTempCanvas = null;
let _ftCloudTempCtx = null;
let _ftCloudTempW = 0, _ftCloudTempH = 0;
function _ftDrawCloudSprite(c, img, cx, cy, w, h, opacity, tint) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const cw = Math.ceil(w), ch = Math.ceil(h);
  // Reuse temp canvas, resize only when needed
  if (!_ftCloudTempCanvas || _ftCloudTempW < cw || _ftCloudTempH < ch) {
    _ftCloudTempW = Math.max(_ftCloudTempW, cw);
    _ftCloudTempH = Math.max(_ftCloudTempH, ch);
    _ftCloudTempCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(_ftCloudTempW, _ftCloudTempH)
      : (() => { const el = document.createElement('canvas'); el.width = _ftCloudTempW; el.height = _ftCloudTempH; return el; })();
    _ftCloudTempCtx = _ftCloudTempCanvas.getContext('2d');
  }
  const tc2 = _ftCloudTempCtx;
  tc2.globalCompositeOperation = 'source-over';
  tc2.globalAlpha = 1;
  tc2.clearRect(0, 0, cw, ch);
  tc2.drawImage(img, 0, 0, w, h);
  if (tint) {
    tc2.globalCompositeOperation = 'source-atop';
    tc2.globalAlpha = tint.a;
    tc2.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
    tc2.fillRect(0, 0, w, h);
  }
  c.save();
  c.globalAlpha = opacity;
  c.drawImage(_ftCloudTempCanvas, 0, 0, cw, ch, cx - w / 2, cy - h / 2, w, h);
  c.restore();
}

function _ftMakeMtnPath(W, H, baseY, freq, amp1, amp2, amp3, seed) {
  const pts = [];
  for (let x = 0; x <= W; x++) {
    let y = baseY;
    y += Math.sin(x * freq + seed) * amp1;
    y += Math.sin(x * freq * 2.3 + seed + 1.1) * amp2;
    y += Math.sin(x * freq * 5.7 + seed + 2.3) * amp3;
    pts.push(y);
  }
  return pts;
}
function _ftFillMtnLayer(c, pts, colorTop, colorBot, opacity, H) {
  let minY = pts[0];
  for (let i = 1; i < pts.length; i++) if (pts[i] < minY) minY = pts[i];
  const grd = c.createLinearGradient(0, minY, 0, H * 0.78);
  grd.addColorStop(0, colorTop); grd.addColorStop(1, colorBot);
  c.save(); c.globalAlpha = opacity;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, pts[0]);
  for (let x = 1; x <= pts.length - 1; x++) c.lineTo(x, pts[x]);
  c.lineTo(pts.length - 1, H); c.closePath();
  c.fillStyle = grd; c.fill(); c.globalAlpha = 1; c.restore();
}
function _ftPineTreeSil(c, x, groundY, h, col) {
  const layers = 3;
  c.fillStyle = col;
  for (let i = 0; i < layers; i++) {
    const ly = groundY - h * 0.18 * i;
    const lw = (layers - i) * (h * 0.28) + h * 0.12;
    c.beginPath(); c.moveTo(x, ly - h * 0.32); c.lineTo(x - lw, ly); c.lineTo(x + lw, ly); c.closePath(); c.fill();
  }
}
function _ftTreeLineSil(c, W, H, ridgePts, B, opacity) {
  c.save(); c.globalAlpha = opacity;
  c.fillStyle = B.treeColor[0];
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x++) {
    const th = 8 + Math.sin(x * 0.18 + 1.3) * 4 + Math.sin(x * 0.41 + 0.7) * 3;
    c.lineTo(x, ridgePts[x] - th);
  }
  c.lineTo(W, H); c.closePath(); c.fill();
  c.fillStyle = B.treeColor[1];
  for (let x = 15; x < W - 15; x += 18 + Math.floor(Math.sin(x * 0.3) * 6)) {
    _ftPineTreeSil(c, x, ridgePts[x], 12 + Math.sin(x * 0.25) * 6, B.treeColor[1]);
  }
  c.globalAlpha = 1; c.restore();
}
function _ftDrawCloud(c, cx, cy, cloudW, cloudH, puffs, opacity, T) {
  c.save();

  // Build main puff circles
  const circles = [];
  for (let i = 0; i < puffs; i++) {
    const t = puffs > 1 ? i / (puffs - 1) : 0.5;
    const xOff = (t - 0.5) * cloudW * 1.05;
    const edgeFade = 1 - Math.abs(t - 0.5) * 1.15;
    const r = cloudH * (0.5 + edgeFade * 0.6);
    circles.push({ x: cx + xOff, y: cy, r: Math.max(cloudH * 0.18, r) });
  }
  // Extra top-bump sub-circles between main ones
  for (let i = 0; i < puffs - 1; i++) {
    const c1 = circles[i], c2 = circles[i + 1];
    const r = (c1.r + c2.r) * 0.42;
    circles.push({ x: (c1.x + c2.x) * 0.5, y: cy - r * 0.65, r });
  }

  // Drop shadow below the cloud
  c.globalAlpha = opacity * 0.5;
  const shadowGrd = c.createLinearGradient(cx, cy + cloudH * 0.15, cx, cy + cloudH * 1.1);
  shadowGrd.addColorStop(0, T.cloudShadow);
  shadowGrd.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = shadowGrd;
  c.beginPath();
  c.ellipse(cx, cy + cloudH * 0.55, cloudW * 0.62, cloudH * 0.45, 0, 0, Math.PI * 2);
  c.fill();

  // Main puff bodies using radial gradients (soft, overlapping)
  c.globalAlpha = opacity * 0.92;
  for (const circle of circles) {
    const g = c.createRadialGradient(
      circle.x - circle.r * 0.18, circle.y - circle.r * 0.28, 0,
      circle.x, circle.y, circle.r
    );
    g.addColorStop(0, T.cloudHighlight);
    g.addColorStop(0.5, T.cloudBase);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    c.fill();
  }

  // Dark underside for depth
  c.globalAlpha = opacity * 0.38;
  c.fillStyle = T.cloudDark;
  c.beginPath();
  c.ellipse(cx, cy + cloudH * 0.22, cloudW * 0.5, cloudH * 0.24, 0, 0, Math.PI * 2);
  c.fill();

  c.globalAlpha = 1;
  c.restore();
}
function _ftDrawMountains(c, W, H, T, B) {
  const m4 = _ftMakeMtnPath(W, H, H*0.42, 0.005, 55, 22, 8, 0.8);
  _ftFillMtnLayer(c, m4, B.mtn4[0], B.mtn4[1], 0.80, H);
  // Fog between layer 4 and 3
  const fog1 = c.createLinearGradient(0, H*0.38, 0, H*0.56);
  fog1.addColorStop(0,'rgba(0,0,0,0)'); fog1.addColorStop(0.5, T.hazeColor); fog1.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle = fog1; c.fillRect(0, 0, W, H);
  const m3 = _ftMakeMtnPath(W, H, H*0.49, 0.008, 70, 28, 10, 2.1);
  _ftFillMtnLayer(c, m3, B.mtn3[0], B.mtn3[1], 0.88, H);
  if (B.snowCap) {
    c.save(); c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x++) c.lineTo(x, m3[x]);
    c.lineTo(W, H); c.closePath(); c.clip();
    c.fillStyle = B.snowCap; c.globalAlpha = 0.7; c.fillRect(0, 0, W, H * 0.44); c.globalAlpha = 1; c.restore();
  }
  const m2 = _ftMakeMtnPath(W, H, H*0.55, 0.011, 50, 20, 8, 3.5);
  _ftFillMtnLayer(c, m2, B.mtn2[0], B.mtn2[1], 0.92, H);
  _ftTreeLineSil(c, W, H, m2, B, 0.42);
  const m1 = _ftMakeMtnPath(W, H, H*0.60, 0.017, 38, 14, 6, 5.2);
  _ftFillMtnLayer(c, m1, B.mtn1[0], B.mtn1[1], 0.96, H);
  _ftTreeLineSil(c, W, H, m1, B, 0.68);
}

function _buildSkyCache(w, h) {
  // Build at DPR resolution so drawImage doesn't upscale on Retina displays
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  const oc = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(pw, ph)
    : (() => { const el = document.createElement('canvas'); el.width = pw; el.height = ph; return el; })();
  const sCtx = oc.getContext('2d');
  sCtx.scale(dpr, dpr);
  const c = sCtx;
  const T = FORT_THEMES[_fortCurrentTheme] || FORT_THEMES.day;
  const B = FORT_BIOMES[_fortCurrentBiome] || FORT_BIOMES.temperate;

  // ── Sky gradient ──
  const grd = c.createLinearGradient(0, 0, 0, h);
  for (const [stop, col] of T.skyBands) grd.addColorStop(stop, col);
  c.fillStyle = grd; c.fillRect(0, 0, w, h);

  // ── Stars ──
  if (T.starOpacity > 0) {
    for (let i = 0; i < 180; i++) {
      const sr = i < 126 ? 0.6 : i < 165 ? 1.0 : 1.5;
      const sa = (0.3 + ((i * 137 + 31) % 71) / 100) * T.starOpacity;
      c.globalAlpha = sa; c.fillStyle = '#fff';
      c.beginPath(); c.arc((i * 137 + 50) % w, (i * 97 + 10) % (h * 0.5), sr, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  // ── Sun / Moon + God Rays ──
  const sx = T.sunX * w, sy = T.sunY * h;
  // God rays (screen blend)
  if (!T.moonVisible) {
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 16; i++) {
      const baseAngle = Math.atan2(h - sy, w / 2 - sx);
      const spread = Math.PI * 0.9;
      const angle = baseAngle - spread / 2 + (i / 16) * spread;
      const rayW = 15 + ((i * 41 + 7) % 60);
      const rayLen = Math.max(w, h) * 1.8;
      const rayAlpha = T.godRayAlpha * (0.5 + ((i * 31) % 50) / 100);
      const rg = c.createLinearGradient(sx, sy, sx + Math.cos(angle) * rayLen, sy + Math.sin(angle) * rayLen);
      rg.addColorStop(0, `rgba(255,240,200,${rayAlpha})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.save(); c.translate(sx, sy); c.rotate(angle);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(rayLen, -rayW/2); c.lineTo(rayLen, rayW/2); c.closePath(); c.fill(); c.restore();
    }
    c.globalCompositeOperation = 'source-over'; c.restore();
  }
  // Outer glow
  const r1 = c.createRadialGradient(sx,sy,0,sx,sy,T.moonVisible?120:200);
  r1.addColorStop(0,T.sunGlow1); r1.addColorStop(0.4,T.sunGlow2); r1.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=r1; c.beginPath(); c.arc(sx,sy,T.moonVisible?120:200,0,Math.PI*2); c.fill();
  if (!T.moonVisible) {
    const corona = c.createRadialGradient(sx,sy,16,sx,sy,50);
    corona.addColorStop(0,T.sunGlow1); corona.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=corona; c.beginPath(); c.arc(sx,sy,50,0,Math.PI*2); c.fill();
  }
  const diskR = T.moonVisible ? 13 : 20;
  c.fillStyle = T.sunColor; c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.fill();
  if (!T.moonVisible) {
    const core = c.createRadialGradient(sx-diskR*0.2,sy-diskR*0.2,0,sx,sy,diskR);
    core.addColorStop(0,'rgba(255,255,255,0.9)'); core.addColorStop(0.5,'rgba(255,255,255,0.2)'); core.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=core; c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.fill();
  } else {
    c.save(); c.beginPath(); c.arc(sx,sy,diskR,0,Math.PI*2); c.clip();
    c.fillStyle='rgba(0,0,0,0.35)'; c.beginPath(); c.arc(sx+diskR*0.35,sy,diskR*1.1,0,Math.PI*2); c.fill();
    for (const [ox,oy,cr] of [[-4,-2,2.5],[3,3,1.8],[-1,5,1.5],[5,-3,1.2]]) {
      c.globalAlpha=0.22; c.fillStyle='#000'; c.beginPath(); c.arc(sx+ox,sy+oy,cr,0,Math.PI*2); c.fill();
    }
    c.globalAlpha=1; c.restore();
  }

  // ── Atmospheric haze ──
  const hazeGrd = c.createLinearGradient(0, h*0.58, 0, h*0.72);
  hazeGrd.addColorStop(0,'rgba(0,0,0,0)'); hazeGrd.addColorStop(0.45,T.hazeColor); hazeGrd.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=hazeGrd; c.fillRect(0,0,w,h);

  // ── Layered background mountains (4 layers) ──
  _ftDrawMountains(c, w, h, T, B);

  // ── Clouds: sprite assets (with procedural fallback) ──
  // [imgIdx, cx_frac, cy_frac, w, h, opacity]
  const cloudSpriteDefs = [
    // Far layer – small, high up
    [0, 0.07, 0.08, 120, 68,  0.52],
    [2, 0.39, 0.06, 110, 62,  0.48],
    [4, 0.68, 0.09, 115, 65,  0.50],
    [3, 0.91, 0.07, 105, 60,  0.45],
    // Mid layer
    [1, 0.22, 0.19, 220, 124, 0.78],
    [3, 0.58, 0.17, 250, 142, 0.82],
    [0, 0.86, 0.22, 200, 113, 0.75],
    // Near layer – large
    [2, 0.12, 0.30, 290, 164, 0.90],
    [4, 0.70, 0.28, 310, 175, 0.92],
  ];
  const tintMap = {
    day:  null,
    dusk: { r:210, g:110, b:40,  a:0.42 },
    night:{ r:15,  g:22,  b:60,  a:0.60 },
  };
  const cloudTint = tintMap[_fortCurrentTheme] || null;
  const imgsReady = _fortCloudImgs && _fortCloudImgs.every(img => img.complete && img.naturalWidth);
  if (imgsReady) {
    for (const [idx, cxf, cyf, cw, ch, op] of cloudSpriteDefs) {
      _ftDrawCloudSprite(c, _fortCloudImgs[idx], cxf * w, cyf * h, cw, ch, op, cloudTint);
    }
  } else {
    // Fallback procedural clouds until images load
    const cloudDefs = [
      {cx:w*0.22, cy:h*0.19, cw:200, ch:55, puffs:5, op:0.68},
      {cx:w*0.57, cy:h*0.16, cw:220, ch:60, puffs:5, op:0.72},
      {cx:w*0.84, cy:h*0.20, cw:175, ch:50, puffs:4, op:0.65},
    ];
    for (const cd of cloudDefs) _ftDrawCloud(c, cd.cx, cd.cy, cd.cw, cd.ch, cd.puffs, cd.op, T);
  }

  return oc;
}

function drawSky(ctx, w, h) {
  if (!_fortSkyCache) _fortSkyCache = FortPerf.once('buildSkyCache', () => _buildSkyCache(w, h));
  // Draw at logical size — ctx already has DPR base transform applied
  ctx.drawImage(_fortSkyCache, 0, 0, w, h);
}

function drawClouds() { /* merged into drawSky cache */ }

function drawTerrain(ctx, terrain, w, h) {
  // Cache check: rebuild only when terrain data changes
  if (!_fortTerrainCache || _fortTerrainCacheVer !== _fortTerrainDirtyVer || _fortTerrainCacheRef !== terrain) {
    _fortTerrainCache = FortPerf.once('buildTerrainCache', () => _buildTerrainCache(terrain, w, h));
    _fortTerrainCacheVer = _fortTerrainDirtyVer;
    _fortTerrainCacheRef = terrain;
  }
  ctx.drawImage(_fortTerrainCache, 0, 0, w, h);
}

function _buildTerrainCache(terrain, w, h) {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  const oc = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(pw, ph)
    : (() => { const el = document.createElement('canvas'); el.width = pw; el.height = ph; return el; })();
  const ctx = oc.getContext('2d');
  ctx.scale(dpr, dpr);

  const B = FORT_BIOMES[_fortCurrentBiome] || FORT_BIOMES.temperate;
  const T = FORT_THEMES[_fortCurrentTheme] || FORT_THEMES.day;

  function terrainPath(offset) {
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, terrain[x] + offset);
    ctx.lineTo(w, h); ctx.closePath();
  }

  // ── Bedrock ──
  const bedGrd = ctx.createLinearGradient(0, h*0.78, 0, h);
  bedGrd.addColorStop(0, B.bedrock[0]); bedGrd.addColorStop(1, B.bedrock[1]);
  terrainPath(52); ctx.fillStyle = bedGrd; ctx.fill();

  // ── Stone + strata ──
  const stoneGrd = ctx.createLinearGradient(0, h*0.62, 0, h*0.9);
  stoneGrd.addColorStop(0, B.stone[0]); stoneGrd.addColorStop(1, B.stone[1]);
  terrainPath(30); ctx.fillStyle = stoneGrd; ctx.fill();
  // Strata lines clipped inside stone layer
  ctx.save(); terrainPath(30); ctx.clip();
  ctx.strokeStyle = B.strata; ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const ly = h * 0.72 + i * 16 + Math.sin(i * 1.5) * 4;
    ctx.beginPath();
    for (let x = 0; x < w; x += 2) {
      const wy = ly + Math.sin(x * 0.04 + i * 1.3) * 3;
      x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // ── Clay / subsoil ──
  const clayGrd = ctx.createLinearGradient(0, h*0.52, 0, h*0.82);
  clayGrd.addColorStop(0, B.clay[0]); clayGrd.addColorStop(1, B.clay[1]);
  terrainPath(18); ctx.fillStyle = clayGrd; ctx.fill();

  // ── Topsoil ──
  const topGrd = ctx.createLinearGradient(0, h*0.45, 0, h*0.72);
  topGrd.addColorStop(0, B.topsoil[0]); topGrd.addColorStop(1, B.topsoil[1]);
  terrainPath(9); ctx.fillStyle = topGrd; ctx.fill();

  // Embedded pebbles in topsoil
  for (let i = 0; i < 35; i++) {
    const rx = (i * 191 + 44) % w, ry = terrain[rx] + 11 + (i * 41) % 16;
    if (ry > h - 4) continue;
    ctx.globalAlpha = 0.45; ctx.fillStyle = B.stone[0];
    ctx.beginPath(); ctx.ellipse(rx, ry, 3+(i*7)%8, 2+(i*5)%4, (i*0.5)%Math.PI, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Grass cap ──
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  for (let x = w-1; x >= 0; x--) ctx.lineTo(x, terrain[x] + 8);
  ctx.closePath(); ctx.fillStyle = B.grassCap; ctx.fill();

  // ── Grass edge highlight ──
  ctx.shadowColor = B.grassEdge; ctx.shadowBlur = 4;
  ctx.strokeStyle = B.grassEdge; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.stroke(); ctx.shadowBlur = 0;

  // ── Grass blades ──
  ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = B.grassBlade;
  ctx.lineWidth = 1; ctx.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const gx = (i * 173 + 17) % w, gy = terrain[gx];
    const bh2 = 5 + (i * 11) % 7;
    const lean = Math.sin(gx * 0.08 + i * 0.4) * 3.5;
    ctx.beginPath(); ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + lean * 0.5, gy - bh2 * 0.55, gx + lean, gy - bh2);
    ctx.stroke();
  }
  ctx.restore();

  // ── Cliff face detail ──
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  for (let x = 2; x < w - 2; x++) {
    const slope = Math.abs(terrain[x+1] - terrain[x-1]) / 2;
    if (slope < 1.8) continue;
    ctx.globalAlpha = Math.min(0.6, (slope - 1.8) * 0.2);
    ctx.beginPath(); ctx.moveTo(x, terrain[x] + 6); ctx.lineTo(x, Math.min(terrain[x] + 40, h - 4)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5;
  for (let x = 2; x < w - 2; x++) {
    const slope = terrain[x+1] - terrain[x-1];
    if (slope > -3.0) continue;
    ctx.globalAlpha = Math.min(0.5, (-slope - 3.0) * 0.15);
    ctx.beginPath(); ctx.moveTo(x, terrain[x]); ctx.lineTo(x, terrain[x] + 20); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();

  // ── Boulders ──
  for (let i = 0; i < 18; i++) {
    const bx = (i * 241 + 70) % w, by = terrain[bx];
    const bw2 = 8 + (i * 13) % 18, bh3 = bw2 * (0.55 + ((i * 37) % 40) / 100);
    const ang = (i * 0.6) % (Math.PI * 0.6);
    if (by < 20 || by > h - 10) continue;
    ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(bx+3, by+2, bw2*0.8, bh3*0.3, 0, 0, Math.PI*2); ctx.fill();
    const bg2 = ctx.createRadialGradient(bx-bw2*0.25, by-bh3*0.3, 0, bx, by, bw2);
    bg2.addColorStop(0,'rgba(200,195,190,0.9)'); bg2.addColorStop(0.4,B.stone[0]); bg2.addColorStop(1,B.bedrock[0]);
    ctx.globalAlpha = 0.92; ctx.fillStyle = bg2;
    ctx.save(); ctx.translate(bx, by - bh3*0.5); ctx.rotate(ang * 0.3);
    ctx.beginPath();
    for (let j = 0; j < 7; j++) {
      const a2 = (j/7)*Math.PI*2, jitter = 0.75 + Math.sin(j*2.3+ang)*0.22;
      const rx2 = Math.cos(a2)*bw2*jitter, ry2 = Math.sin(a2)*bh3*jitter;
      j===0 ? ctx.moveTo(rx2, ry2) : ctx.lineTo(rx2, ry2);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-bw2*0.2,-bh3*0.2,bw2*0.3,bh3*0.18,-0.4,0,Math.PI*2); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── Foreground pine trees ──
  for (let i = 0; i < 12; i++) {
    const gx = (i * 277 + 100) % w, gy = terrain[gx];
    if (gy < h * 0.25 || gy > h * 0.85) continue;
    const th2 = 30 + Math.sin(gx * 0.15) * 14;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath(); ctx.ellipse(gx + th2*0.4, gy, th2*0.35, th2*0.07, 0, 0, Math.PI*2); ctx.fill();
    const trunkGrd = ctx.createLinearGradient(gx-3, gy-th2*0.3, gx+3, gy);
    trunkGrd.addColorStop(0, B.treeTrunk); trunkGrd.addColorStop(1, 'rgba(20,10,0,0.9)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = trunkGrd;
    ctx.beginPath(); ctx.roundRect(gx-2.5, gy-th2*0.28, 5, th2*0.28, 1); ctx.fill();
    for (let ti = 0; ti < 3; ti++) {
      const ty2 = gy - th2*(0.22 + ti/3*0.55), tw2 = th2*(0.38-ti*0.1)*(1-ti*0.08);
      // Dark shadow side (right)
      ctx.globalAlpha = 0.65; ctx.fillStyle = B.treeColor[0];
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx, ty2); ctx.lineTo(gx+tw2, ty2); ctx.closePath(); ctx.fill();
      // Light side (left)
      ctx.globalAlpha = 0.82; ctx.fillStyle = B.treeColor[2] || B.treeColor[1];
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx-tw2, ty2); ctx.lineTo(gx, ty2); ctx.closePath(); ctx.fill();
      // Rim highlight
      ctx.globalAlpha = 0.14; ctx.fillStyle = 'rgba(200,255,150,1)';
      ctx.beginPath(); ctx.moveTo(gx, ty2-th2*0.28); ctx.lineTo(gx-tw2*0.95, ty2); ctx.lineTo(gx-tw2*0.65, ty2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  // ── AO under terrain top edge ──
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.clip();
  const aoGrd = ctx.createLinearGradient(0, 0, 0, 22);
  aoGrd.addColorStop(0, 'rgba(0,0,0,0.35)'); aoGrd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < w; x++) ctx.lineTo(x, terrain[x]);
  for (let x = w-1; x >= 0; x--) ctx.lineTo(x, terrain[x]+22);
  ctx.closePath(); ctx.fillStyle = aoGrd; ctx.fill(); ctx.restore();

  // ── Subtle valley ground fog (low-lying mist, not a sea) ──
  ctx.save();
  ctx.globalAlpha = 0.18;
  const fogBand = h * 0.68;
  for (let x = 60; x < w - 60; x += 60) {
    const ty = terrain[x];
    if (ty < fogBand) continue; // only in deep valleys
    const fogR = 55 + (ty - fogBand) * 0.5;
    const fg = ctx.createRadialGradient(x, ty, 0, x, ty, fogR);
    fg.addColorStop(0, T.hazeColor);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(x, ty, fogR, fogR * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();

  return oc;
}

function darkenColor(hex, factor) {
  let r, g, b;
  if (hex.startsWith('#')) {
    const c = hex.slice(1);
    r = parseInt(c.substring(0, 2), 16);
    g = parseInt(c.substring(2, 4), 16);
    b = parseInt(c.substring(4, 6), 16);
  } else if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g);
    if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
    else return '#333';
  } else {
    return '#333';
  }
  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);
  return `rgb(${r},${g},${b})`;
}

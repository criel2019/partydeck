// ===== FORTRESS — Effects (Particles, Birds, Platforms) =====
// Separated from fortress.js for modularity

// ===== PARTICLE SYSTEM =====
function spawnExplosionParticles(x, y, count, isBig) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (isBig ? 2 : 1) + Math.random() * (isBig ? 5 : 3);
    fortParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (isBig ? 3 : 1),
      life: 1.0,
      decay: 0.015 + Math.random() * 0.025,
      size: (isBig ? 3 : 1.5) + Math.random() * (isBig ? 4 : 2),
      color: Math.random() > 0.3
        ? `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`
        : `hsl(0, 0%, ${60 + Math.random() * 30}%)`,
    });
  }
}

function spawnDebris(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 1 + Math.random() * 4;
    fortDebris.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1.0,
      decay: 0.01 + Math.random() * 0.015,
      size: 2 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      color: `hsl(30, ${30 + Math.random() * 20 | 0}%, ${25 + Math.random() * 15 | 0}%)`,
    });
  }
}

function spawnSmoke(x, y, count) {
  for (let i = 0; i < count; i++) {
    fortSmoke.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.3 - Math.random() * 0.8,
      life: 1.0,
      decay: 0.008 + Math.random() * 0.012,
      size: 8 + Math.random() * 15,
    });
  }
}

function updateParticles() {
  FortPerf.begin('particles.update');
  // In-place compact (avoids new array allocation every frame)
  let j = 0;
  for (let i = 0; i < fortParticles.length; i++) {
    const p = fortParticles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= p.decay;
    if (p.life > 0) fortParticles[j++] = p;
  }
  fortParticles.length = j;

  j = 0;
  for (let i = 0; i < fortDebris.length; i++) {
    const p = fortDebris[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rotation += p.rotSpeed; p.life -= p.decay;
    if (p.life > 0) fortDebris[j++] = p;
  }
  fortDebris.length = j;

  j = 0;
  for (let i = 0; i < fortSmoke.length; i++) {
    const p = fortSmoke[i];
    p.x += p.vx; p.y += p.vy; p.size += 0.3; p.life -= p.decay;
    if (p.life > 0) fortSmoke[j++] = p;
  }
  fortSmoke.length = j;
  FortPerf.end('particles.update');
}

function drawParticles(ctx) {
  FortPerf.begin('particles.draw');
  // Fire particles — batch by color where possible, minimize state changes
  let lastColor = null;
  for (let i = 0; i < fortParticles.length; i++) {
    const p = fortParticles[i];
    if (p.color !== lastColor) {
      if (lastColor !== null) ctx.fill(); // flush previous batch
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      lastColor = p.color;
    } else {
      ctx.globalAlpha = p.life;
    }
    ctx.moveTo(p.x + p.size * p.life, p.y);
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
  }
  if (lastColor !== null) ctx.fill();

  // Debris — color cached at spawn, reduce save/restore overhead
  for (let i = 0; i < fortDebris.length; i++) {
    const p = fortDebris[i];
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // Smoke — each particle needs its own alpha so draw individually
  if (fortSmoke.length > 0) {
    ctx.fillStyle = 'rgba(100,100,100,1)';
    for (let i = 0; i < fortSmoke.length; i++) {
      const p = fortSmoke[i];
      ctx.globalAlpha = p.life * 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  FortPerf.end('particles.draw');
}

// ===== WIND PARTICLE SYSTEM =====
function updateWindParticles(wind) {
  // Update existing particles — in-place compact (no allocation)
  let j = 0;
  for (let i = 0; i < fortWindParticles.length; i++) {
    const p = fortWindParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    // Wrap horizontally so particle re-enters from opposite edge
    if (p.x < -20) p.x = FORT_CANVAS_W + 20;
    if (p.x > FORT_CANVAS_W + 20) p.x = -20;
    if (p.life > 0) fortWindParticles[j++] = p;
  }
  fortWindParticles.length = j;

  // Don't spawn if no wind
  if (wind === 0) return;

  const absWind = Math.abs(wind);
  const dir = wind > 0 ? 1 : -1;
  // Keep pool small so individual particles are visibly moving (max 40)
  const maxPool = 40;
  if (fortWindParticles.length >= maxPool) return;

  const spawnCount = absWind > 3 ? 2 : 1;
  for (let i = 0; i < spawnCount && fortWindParticles.length < maxPool; i++) {
    // Spawn off the upwind edge so we see them fly across
    const spawnX = dir > 0 ? -10 - Math.random() * 30 : FORT_CANVAS_W + 10 + Math.random() * 30;
    const spawnY = Math.random() * FORT_CANVAS_H * 0.65;

    // Faster speed so movement is clearly visible
    const baseSpeed = 2.5 + absWind * 1.2;
    const speed = baseSpeed + Math.random() * baseSpeed * 0.3;

    let length, alpha;
    if (absWind <= 2) {
      length = 6 + Math.random() * 6;
      alpha = 0.35 + Math.random() * 0.15;
    } else if (absWind <= 4) {
      length = 12 + Math.random() * 10;
      alpha = 0.45 + Math.random() * 0.2;
    } else {
      length = 20 + Math.random() * 14;
      alpha = 0.55 + Math.random() * 0.2;
    }

    fortWindParticles.push({
      x: spawnX,
      y: spawnY,
      vx: speed * dir,
      vy: (Math.random() - 0.3) * 0.5,
      life: 1.0,
      decay: 0.006 + Math.random() * 0.008,
      length,
      alpha,
    });
  }
}

function drawWindParticles(ctx, wind) {
  if (wind === 0 || fortWindParticles.length === 0) return;
  const dir = wind > 0 ? 1 : -1;
  const lw = 1 / (fortCam.zoom || 1);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#fff';

  // Batch particles into 8 alpha buckets to cut 40 stroke() calls → ≤8
  const buckets = new Float32Array(8);      // alpha value per bucket
  const bucketPaths = [];                   // [moveTo/lineTo pairs] per bucket
  for (let b = 0; b < 8; b++) bucketPaths.push([]);

  for (let i = 0; i < fortWindParticles.length; i++) {
    const p = fortWindParticles[i];
    const a = p.alpha * p.life;
    const bi = Math.min(7, Math.floor(a * 8));   // bucket 0-7
    buckets[bi] = (bi + 1) / 8;                  // representative alpha
    bucketPaths[bi].push(p.x, p.y, p.x - p.length * dir, p.y);
  }

  for (let b = 0; b < 8; b++) {
    const pts = bucketPaths[b];
    if (pts.length === 0) continue;
    ctx.globalAlpha = buckets[b];
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 4) {
      ctx.moveTo(pts[i], pts[i + 1]);
      ctx.lineTo(pts[i + 2], pts[i + 3]);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ===== BIRDS SYSTEM =====
function initFortBirds() {
  fortBirds = [];
  const count = 4 + Math.floor(Math.random() * 4); // 4-7 birds
  for (let i = 0; i < count; i++) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    fortBirds.push({
      x: dir > 0 ? -40 - Math.random() * 200 : FORT_CANVAS_W + 40 + Math.random() * 200,
      y: 40 + Math.random() * 200,
      vx: dir * (0.6 + Math.random() * 1.0),
      dir,
      phase: Math.random() * Math.PI * 2,
      alive: true,
      falling: false,
      fallVy: 0,
      fallRot: 0,
      fallRotV: (Math.random() - 0.5) * 0.15,
      size: 0.7 + Math.random() * 0.6, // scale
    });
  }
}

function updateFortBirds() {
  const now = Date.now() * 0.003;
  for (const bird of fortBirds) {
    if (bird.falling) {
      bird.fallVy += 0.06;
      bird.y += bird.fallVy;
      bird.fallRot += bird.fallRotV;
      bird.x += bird.vx * 0.3;
      continue;
    }
    bird.x += bird.vx;
    bird.y += Math.sin(now + bird.phase) * 0.4;
    // Wrap around edges
    if (bird.dir > 0 && bird.x > FORT_CANVAS_W + 60) {
      bird.x = -40;
      bird.y = 40 + Math.random() * 200;
    } else if (bird.dir < 0 && bird.x < -60) {
      bird.x = FORT_CANVAS_W + 40;
      bird.y = 40 + Math.random() * 200;
    }
  }
}

function drawFortBirds(ctx) {

  const now = Date.now() * 0.005;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.5;

  for (const bird of fortBirds) {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    if (bird.falling) ctx.rotate(bird.fallRot);
    if (bird.dir < 0) ctx.scale(-1, 1);
    ctx.scale(bird.size, bird.size);

    const wingUp = bird.falling ? -0.8 : Math.sin(now * 5 + bird.phase) * 6 - 2;
    const bodyColor = bird.falling ? 'rgba(100,70,40,0.6)' : '#4a3728';
    const strokeColor = bird.falling ? 'rgba(80,50,30,0.7)' : 'rgba(40,30,20,0.85)';

    // Body
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wings + head in a single stroke call
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.quadraticCurveTo(-7, wingUp - 2, -13, wingUp);
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(7, wingUp - 2, 13, wingUp);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(5, -1, 2.5, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#cc8800';
    ctx.beginPath(); ctx.moveTo(7, -1); ctx.lineTo(10, -0.5); ctx.lineTo(7, 0.5); ctx.closePath(); ctx.fill();

    ctx.restore();
  }
  ctx.restore();
}

// ===== FALLING FEATHERS =====
function updateFallingFeathers() {
  let j = 0;
  for (let i = 0; i < _fortFallingFeathers.length; i++) {
    const f = _fortFallingFeathers[i];
    f.x += f.vx; f.y += f.vy; f.vy += 0.04; f.vx *= 0.98;
    f.rot += f.rotV; f.life -= f.decay;
    if (f.life > 0) _fortFallingFeathers[j++] = f;
  }
  _fortFallingFeathers.length = j;
}

function drawFallingFeathers(ctx) {
  for (const f of _fortFallingFeathers) {
    ctx.save();
    ctx.globalAlpha = f.life;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.fillStyle = '#d4b896';
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ===== SKY PLATFORMS =====
function initFortSkyPlatforms() {
  fortSkyPlatforms = [];
  const count = 3 + Math.floor(Math.random() * 3); // 3-5 platforms
  for (let i = 0; i < count; i++) {
    const pw = 60 + Math.random() * 80;
    const ph = 14 + Math.random() * 10;
    const px = FORT_CANVAS_W * 0.1 + Math.random() * FORT_CANVAS_W * 0.8;
    const py = FORT_CANVAS_H * 0.15 + Math.random() * FORT_CANVAS_H * 0.35;
    fortSkyPlatforms.push({ x: px, y: py, w: pw, h: ph, destroyed: false,
      type: Math.floor(Math.random() * 3) }); // 0=rock, 1=dark rock, 2=stone
  }
}

function drawSkyPlatforms(ctx) {
  for (const p of fortSkyPlatforms) {
    if (p.destroyed) continue;
    const { x, y, w, h } = p;
    ctx.save();

    // Main rock body
    const rockColors = ['#7a6b58', '#5a5048', '#8a7c6a'];
    ctx.fillStyle = rockColors[p.type] || '#7a6b58';
    ctx.beginPath();
    ctx.moveTo(x - w/2 + 8, y);
    ctx.lineTo(x - w/2, y + h - 4);
    ctx.lineTo(x - w/2 + 5, y + h);
    ctx.lineTo(x + w/2 - 5, y + h);
    ctx.lineTo(x + w/2, y + h - 4);
    ctx.lineTo(x + w/2 - 6, y);
    ctx.closePath();
    ctx.fill();

    // Top surface highlight (mossy look)
    const topGrad = ctx.createLinearGradient(x - w/2, y, x + w/2, y);
    topGrad.addColorStop(0, 'rgba(100,140,80,0.6)');
    topGrad.addColorStop(0.5, 'rgba(120,160,90,0.7)');
    topGrad.addColorStop(1, 'rgba(90,120,70,0.5)');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(x - w/2 + 8, y);
    ctx.lineTo(x + w/2 - 6, y);
    ctx.lineTo(x + w/2 - 8, y + 5);
    ctx.lineTo(x - w/2 + 10, y + 5);
    ctx.closePath();
    ctx.fill();

    // Rock texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let li = 0; li < 3; li++) {
      const lx = x - w/2 + (w / 4) * (li + 1);
      ctx.beginPath(); ctx.moveTo(lx, y + 2); ctx.lineTo(lx - 3, y + h - 2); ctx.stroke();
    }

    // Drop shadow (painted manually — avoids expensive canvas shadow compositing)
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + h + 3, w * 0.42, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

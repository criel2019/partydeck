// ===== FORTRESS — Physics & Hit Detection =====
// Separated from fortress.js for modularity

function drawTrajectoryPreview(ctx, startX, startY, angleDeg, wind) {
  const rad = angleDeg * Math.PI / 180;
  const lineLen = 72;
  const endX = startX + Math.cos(rad) * lineLen;
  const endY = startY - Math.sin(rad) * lineLen;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

// skillOpts: { skill, homingTargets }
function computeProjectilePath(startX, startY, angleDeg, power, wind, skillOpts) {
  const skill = (skillOpts && skillOpts.skill) || null;
  const rad = angleDeg * Math.PI / 180;

  // 저격탄: 3배 속도
  const speedMult = (skill === 'sniper') ? 3 : 1;
  const speed = (1.5 + power * 0.1) * speedMult;

  let vx = speed * Math.cos(rad);
  let vy = -speed * Math.sin(rad);
  let x = startX;
  let y = startY;

  const MAX_STEPS = (skill === 'sniper') ? 8000 : 4000;
  const xs = new Float32Array(MAX_STEPS + 1);
  const ys = new Float32Array(MAX_STEPS + 1);
  xs[0] = x; ys[0] = y;
  let len = 1;

  const terrain = fortState ? fortState.terrain :
    (window._fortView ? window._fortView.terrain : new Array(FORT_CANVAS_W).fill(380));
  const width = fortState ? fortState.canvasW : FORT_CANVAS_W;
  const platforms = (typeof fortSkyPlatforms !== 'undefined') ? fortSkyPlatforms : [];

  // 유도 대상 (homing)
  const homingTargets = (skillOpts && skillOpts.homingTargets) || [];

  // 관통·바운스·구멍뚫기 상태
  let pierceCount = 0;
  const maxPierce = (skill === 'triple_pierce') ? 3 : (skill === 'double_pierce') ? 2 : 0;
  let bounceCount = 0;
  const maxBounce = (skill === 'bounce') ? 3 : 0;

  // 관통탄: 경로 상 플레이어 히트 지점 기록
  const penetrateHitX = [];
  const penetrateHitY = [];
  const penetrateHitIds = new Set();
  const playerPositions = (skillOpts && skillOpts.homingTargets) || [];

  // 땅뚫기: 관통 지점 기록
  const pierceImpacts = [];
  let wasInTerrain = false;

  let exitReason = 'maxsteps';
  for (let i = 0; i < MAX_STEPS; i++) {
    // 바람 (저격탄은 바람 무시)
    if (skill !== 'sniper') vx += wind * 0.003;
    // 중력 (관통탄은 중력 무시 — 직선 관통)
    if (skill !== 'penetrate') vy += FORT_GRAVITY;

    // 유도탄: 목표 추적 유도 (각도 기반 턴 레이트 제한)
    if (skill === 'homing' && homingTargets.length > 0) {
      let nearest = homingTargets[0], minD = Infinity;
      for (let hi = 0; hi < homingTargets.length; hi++) {
        const ht = homingTargets[hi];
        const d = (ht.x - x) ** 2 + (ht.y - y) ** 2;
        if (d < minD) { minD = d; nearest = ht; }
      }
      const dx = nearest.x - x, dy = nearest.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        // 현재 속도 방향 벡터
        const spd = Math.sqrt(vx * vx + vy * vy);
        if (spd > 0.1) {
          // 목표 방향 각도
          const targetAngle = Math.atan2(dy, dx);
          // 현재 진행 방향 각도
          const currentAngle = Math.atan2(vy, vx);
          // 각도 차이 (-PI ~ PI)
          let angleDiff = targetAngle - currentAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          // 거리에 따른 유도 강도: 가까울수록 강하게
          const proxGain = Math.min(1.0, 200 / Math.max(dist, 1));
          // 턴 레이트 제한: 거리가 가까울수록 강하게 꺾음
          const turnRate = Math.min(Math.abs(angleDiff), 0.08 + proxGain * 0.07) * Math.sign(angleDiff);
          const newAngle = currentAngle + turnRate;
          vx = spd * Math.cos(newAngle);
          vy = spd * Math.sin(newAngle);
        }
      }
    }

    x += vx; y += vy;
    xs[len] = x; ys[len] = y; len++;

    const tx = Math.floor(x);

    // 좌우 벽 처리
    if (tx < 0 || tx >= width) {
      if (skill === 'bounce' && bounceCount < maxBounce) {
        vx = -vx;
        x = tx < 0 ? 1 : width - 1;
        bounceCount++;
        continue;
      }
      exitReason = 'offscreen'; break;
    }

    // 관통탄: 경로 상 플레이어 히트 체크
    if (skill === 'penetrate' && playerPositions.length > 0) {
      for (let pi = 0; pi < playerPositions.length; pi++) {
        const pt = playerPositions[pi];
        const dx = x - pt.x, dy = y - pt.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= FORT_HIT_RADIUS && !penetrateHitIds.has(pi)) {
          penetrateHitIds.add(pi);
          penetrateHitX.push(x);
          penetrateHitY.push(y);
        }
      }
    }

    // 지형 충돌
    if (y >= terrain[tx]) {
      if (skill === 'penetrate') { continue; }  // 관통탄은 지형 통과
      if (skill === 'bounce' && bounceCount < maxBounce) {
        vy = -Math.abs(vy) * 0.72;
        y = terrain[tx] - 1;
        bounceCount++;
        continue;
      }
      if (pierceCount < maxPierce) {
        // 땅뚫기: 지형에 진입하는 순간만 카운트 (이미 지형 안에 있으면 그냥 통과)
        if (!wasInTerrain) {
          pierceImpacts.push({ x, y });
          wasInTerrain = true;
          pierceCount++;
        }
        continue;
      }
      exitReason = 'terrain'; break;
    } else {
      wasInTerrain = false;
    }
    if (y > FORT_CANVAS_H + 100) { exitReason = 'offscreen'; break; }

    let hitPlatform = false;
    for (let pi = 0; pi < platforms.length; pi++) {
      const plat = platforms[pi];
      if (plat.destroyed) continue;
      if (x >= plat.x - plat.w / 2 && x <= plat.x + plat.w / 2 &&
          y >= plat.y && y <= plat.y + plat.h) { hitPlatform = true; break; }
    }
    if (hitPlatform) { exitReason = 'platform'; break; }
  }

  const path = { xs, ys, length: len };
  return {
    path, impactX: x, impactY: y,
    hitTerrain: exitReason === 'terrain' || exitReason === 'platform',
    penetrateHitX, penetrateHitY,
    pierceImpacts,
  };
}

function checkHit(impactX, impactY, shooterId) {
  if (!fortState) return { hit: false, targets: [] };

  const targets = [];
  for (let i = 0; i < fortState.players.length; i++) {
    const p = fortState.players[i];
    if (!p.alive) continue;
    const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
    const tankY = fortState.terrain[px] - FORT_TANK_H / 2;
    const dx = impactX - p.x;
    const dy = impactY - tankY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= FORT_HIT_RADIUS) {
      const ratio = 1 - (dist / FORT_HIT_RADIUS);
      const dmg = Math.floor(FORT_DIRECT_DMG[0] + ratio * (FORT_DIRECT_DMG[1] - FORT_DIRECT_DMG[0]));
      targets.push({ id: p.id, damage: dmg, direct: true });
    } else if (dist <= FORT_SPLASH_RADIUS) {
      const ratio = 1 - ((dist - FORT_HIT_RADIUS) / (FORT_SPLASH_RADIUS - FORT_HIT_RADIUS));
      const dmg = Math.floor(FORT_SPLASH_DMG[0] + ratio * (FORT_SPLASH_DMG[1] - FORT_SPLASH_DMG[0]));
      targets.push({ id: p.id, damage: dmg, direct: false });
    }
  }

  return { hit: targets.length > 0, targets };
}

function applyDamage(hitResult) {
  if (!fortState || !hitResult.targets) return;
  for (let i = 0; i < hitResult.targets.length; i++) {
    const t = hitResult.targets[i];
    const p = fortState.players.find(pp => pp.id === t.id);
    if (!p || !p.alive) continue;
    // 쉴드: 1회 공격 차단
    if (p.shield > 0 && t.damage > 0) {
      p.shield--;
      t.damage = 0;
      t.shielded = true;
      continue;
    }
    p.hp = Math.max(0, p.hp - t.damage);
    if (p.hp <= 0) {
      p.alive = false;
      fortState.deathOrder.push(p.id);
    }
  }
}

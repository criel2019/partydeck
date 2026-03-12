// ===== FORTRESS — Animation System =====
// Separated from fortress.js for modularity

function _fortAnimateExtraShot(shot, terrainAfter, onDone) {
  const skillOpts = {};
  const pathResult = computeProjectilePath(shot.startX, shot.startY, shot.angle, shot.power, 0, skillOpts);
  const path = pathResult.path;
  const view = window._fortView;
  if (!view) { if (onDone) onDone(); return; }

  let frameIdx = 0;
  const speed = 3;

  function loop() {
    if (!view) { if (onDone) onDone(); return; }
    updateParticles();
    renderFortressScene(view);
    if (fortCtx && frameIdx < path.length) {
      const ctx = fortCtx;
      ctx.save(); applyCameraTransform(ctx);
      const ti = Math.min(frameIdx, path.length - 1);
      const ptx = path.xs[ti], pty = path.ys[ti];
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.arc(ptx, pty, 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(ptx, pty, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    frameIdx += speed;
    if (frameIdx >= path.length) {
      const ix = shot.impactX != null ? shot.impactX : path.xs[path.length - 1];
      const iy = shot.impactY != null ? shot.impactY : path.ys[path.length - 1];
      animateExplosion(ix, iy, shot.hitResult, view, onDone, terrainAfter);
      return;
    }
    fortAnimId = requestAnimationFrame(loop);
  }
  fortAnimId = requestAnimationFrame(loop);
}

// ===== ANIMATION =====
function startFortAnimation(msg, callback) {
  // Play fire sound for all clients (shooter and observers alike)
  fortPlaySound('fire', msg.shooterTribe || 'fire');

  const view = window._fortView;

  // ── terrainBefore를 경로 계산 전에 적용 ──────────────────────
  // HOST와 CLIENT 모두 동일한 terrainBefore 기준으로 경로를 계산해야
  // 시각 경로와 폭발 위치가 일치한다. 순서가 중요!
  const savedFortTerrain = fortState ? fortState.terrain : null;
  if (msg.terrainBefore) {
    if (view) view.terrain = msg.terrainBefore;
    if (fortState) fortState.terrain = msg.terrainBefore; // host도 일시 교체
  }

  // 스킬 효과에 따른 skillOpts (클라이언트 경로 재계산용)
  // penetrate/homing은 플레이어 위치 목록이 필요 → view에서 추출
  const _animPlayers = (view && view.players) || [];
  const _animHomingTargets = _animPlayers
    .filter(p => p.alive && p.id !== msg.shooterId)
    .map(p => {
      const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
      const t = (view && view.terrain) || (fortState ? fortState.terrain : []);
      return { x: p.x, y: (t[px] || 380) - FORT_TANK_H / 2 };
    });
  const animSkillOpts = (msg.skill === 'sniper' || msg.skill === 'penetrate' || msg.skill === 'bounce' ||
                         msg.skill === 'double_pierce' || msg.skill === 'triple_pierce' || msg.skill === 'homing')
    ? { skill: msg.skill, homingTargets: _animHomingTargets }
    : {};
  const pathResult = computeProjectilePath(msg.startX, msg.startY, msg.angle, msg.power, msg.wind, animSkillOpts);
  const path = pathResult.path;

  // host terrain 복구 (state 로직은 terrainAfter 기준으로 돌아감)
  if (savedFortTerrain && fortState) fortState.terrain = savedFortTerrain;

  // 분열탄: 클라이언트도 경로를 40% 지점에서 잘라냄
  if (msg.skill === 'split' && path.length > 1) {
    path.length = Math.max(1, Math.floor(path.length * 0.40) + 1);
  }
  const hitResult = msg.hitResult;

  // Clear old particles
  fortParticles = [];
  fortDebris = [];
  fortSmoke = [];

  // Trigger fire squash on shooter — magnitude scales with power (chargeRatio)
  if (view && view.players && view.turnIdx !== undefined) {
    const shooter = view.players[view.turnIdx];
    if (shooter) {
      const cr = Math.max(0, Math.min(1, (msg.power - 10) / 90));
      fortTriggerSquash(shooter.id, 'fire', cr);
    }
  }

  let frameIdx = 0;
  const speed = 2; // slower projectile (was 4)
  let muzzleFlashFrame = 0;

  if (fortAnimId) cancelAnimationFrame(fortAnimId);

  // Muzzle flash particles at barrel tip
  const muzzleRad = msg.angle * Math.PI / 180;
  const muzzleX = msg.startX + FORT_BARREL_LEN * Math.cos(muzzleRad);
  const muzzleY = msg.startY - FORT_BARREL_LEN * Math.sin(muzzleRad);
  spawnExplosionParticles(muzzleX, muzzleY, 8, false);

  function animLoop() {
    if (!view) { if (callback) callback(); return; }
    FortPerf.frameStart();

    // Camera lerp: track projectile
    if (frameIdx < path.length) {
      const ti = Math.min(frameIdx, path.length - 1);
      fortCam.targetX = path.xs[ti];
      fortCam.targetY = path.ys[ti];
    }
    fortCam.x += (fortCam.targetX - fortCam.x) * fortCam.lerp;
    fortCam.y += (fortCam.targetY - fortCam.y) * fortCam.lerp;
    clampCamera();

    updateParticles();
    renderFortressScene(view);

    if (fortCtx) {
      const ctx = fortCtx;

      // Apply camera transform for projectile/trail rendering
      ctx.save();
      applyCameraTransform(ctx);

      // Draw fading trajectory line (dotted)
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.25)';
      ctx.lineWidth = 1 / fortCam.zoom; // keep line thin at zoom
      ctx.beginPath();
      const trailStart = 0;
      const trailEnd = Math.min(frameIdx, path.length - 1);
      for (let i = trailStart; i <= trailEnd; i++) {
        if (i === trailStart) ctx.moveTo(path.xs[i], path.ys[i]);
        else ctx.lineTo(path.xs[i], path.ys[i]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Check bird hits
      if (frameIdx < path.length) {
        const bx = path.xs[frameIdx], by = path.ys[frameIdx];
        for (let bi = 0; bi < fortBirds.length; bi++) {
          const bird = fortBirds[bi];
          if (!bird.alive || bird.falling) continue;
          if (Math.abs(bx - bird.x) < 18 && Math.abs(by - bird.y) < 12) {
            bird.falling = true; bird.fallVy = -1; bird.fallRot = 0; bird.alive = false;
            _fortBirdHitCount++;
            fortPlaySound('bird');
            // Feather burst
            for (let fi = 0; fi < 6; fi++) _fortFallingFeathers.push({ x:bird.x, y:bird.y, vx:(Math.random()-0.5)*3, vy:-1-Math.random()*2, rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.3, life:1.0, decay:0.018 });
            if (_fortBirdHitCount === 1) setTimeout(() => showToast('🐦 새 명중! [새 저격] 업적 달성!'), 300);
            else if (_fortBirdHitCount >= 5) setTimeout(() => showToast('🦅 새 5마리 격추! [조류 전멸] 업적!'), 300);
            else setTimeout(() => showToast('🐦 새 명중! (' + _fortBirdHitCount + '마리)'), 300);
          }
        }
      }

      // Draw tribe-specific projectile trail + ball
      const tribe = msg.shooterTribe || 'fire';
      const trailLen = 15;
      const tStart = Math.max(0, frameIdx - trailLen);
      const tEnd = Math.min(frameIdx, path.length - 1);

      const getTrailColor = FORT_TRAIL_COLORS[tribe] || FORT_TRAIL_COLORS.fire;

      for (let i = tStart; i <= tEnd; i++) {
        const t = (i - tStart) / trailLen;
        const size = tribe === 'wind' ? 1 + t * 2 : 1 + t * 3;
        ctx.fillStyle = getTrailColor(t);
        ctx.beginPath();
        ctx.arc(path.xs[i], path.ys[i], size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw projectile head
      if (frameIdx < path.length) {
        const ptx = path.xs[frameIdx];
        const pty = path.ys[frameIdx];

        ctx.save();
        if (tribe === 'fire') {
          // Outer glow (replaces shadowBlur)
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#ff6600';
          ctx.beginPath(); ctx.arc(ptx, pty, 10, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath(); ctx.arc(ptx, pty, 5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#ff3300';
          ctx.beginPath(); ctx.arc(ptx, pty, 3, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 2 === 0 && fortParticles.length < FORT_PARTICLE_CAP) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2, life:0.6, decay:0.05+Math.random()*0.03, size:2+Math.random()*2, color:`hsl(${20+Math.random()*30},100%,${55+Math.random()*25}%)` });

        } else if (tribe === 'rock') {
          ctx.fillStyle = '#8b7355';
          // Draw as jagged polygon
          const pts = 7, r1=6, r2=4;
          ctx.beginPath();
          for (let k=0; k<pts; k++) {
            const a = (k/pts)*Math.PI*2, r = k%2===0?r1:r2;
            k===0 ? ctx.moveTo(ptx+Math.cos(a)*r, pty+Math.sin(a)*r) : ctx.lineTo(ptx+Math.cos(a)*r, pty+Math.sin(a)*r);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(200,180,140,0.5)';
          ctx.beginPath(); ctx.arc(ptx-2, pty-2, 2, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 4 === 0 && fortParticles.length < FORT_PARTICLE_CAP) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*1.5, vy:(Math.random()-0.5)*1.5, life:0.4, decay:0.03, size:1.5+Math.random()*2, color:`hsl(30,40%,40%)` });

        } else if (tribe === 'wind') {
          ctx.strokeStyle = 'rgba(150,240,255,0.9)'; ctx.lineWidth = 2;
          const vd = Math.atan2(path.ys[Math.min(frameIdx+1,path.length-1)]-pty, path.xs[Math.min(frameIdx+1,path.length-1)]-ptx);
          ctx.save(); ctx.translate(ptx,pty); ctx.rotate(vd);
          ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.moveTo(4,-4); ctx.lineTo(8,0); ctx.lineTo(4,4);
          ctx.stroke(); ctx.restore();
          if (frameIdx % 2 === 0 && fortParticles.length < FORT_PARTICLE_CAP) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*2, vy:-0.5-Math.random(), life:0.5, decay:0.06, size:1+Math.random()*2, color:`rgba(100,230,255,0.7)` });

        } else if (tribe === 'thunder') {
          // Thick blurred pass for glow (replaces shadowBlur)
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(ptx-6, pty+6); ctx.lineTo(ptx, pty-2); ctx.lineTo(ptx+3, pty); ctx.lineTo(ptx+8, pty-7);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffe000'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(ptx-6, pty+6); ctx.lineTo(ptx, pty-2); ctx.lineTo(ptx+3, pty); ctx.lineTo(ptx+8, pty-7);
          ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ptx-6, pty+6); ctx.lineTo(ptx, pty-2); ctx.lineTo(ptx+3, pty); ctx.lineTo(ptx+8, pty-7);
          ctx.stroke();
          if (frameIdx % 2 === 0 && fortParticles.length < FORT_PARTICLE_CAP) fortParticles.push({ x:ptx, y:pty, vx:(Math.random()-0.5)*3, vy:(Math.random()-0.5)*3, life:0.4, decay:0.08, size:1+Math.random()*2, color:`hsl(55,100%,70%)` });

        } else { // spirit
          const gr = ctx.createRadialGradient(ptx,pty,0,ptx,pty,12);
          gr.addColorStop(0,'rgba(255,255,255,0.9)'); gr.addColorStop(0.35,'rgba(180,120,255,0.7)'); gr.addColorStop(0.6,'rgba(140,80,240,0.3)'); gr.addColorStop(1,'rgba(100,60,200,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(ptx, pty, 12, 0, Math.PI*2); ctx.fill();
          if (frameIdx % 3 === 0 && fortParticles.length < FORT_PARTICLE_CAP) {
            const sa = Math.random()*Math.PI*2, sd = 4+Math.random()*4;
            fortParticles.push({ x:ptx+Math.cos(sa)*sd, y:pty+Math.sin(sa)*sd, vx:Math.cos(sa)*0.5, vy:Math.sin(sa)*0.5, life:0.7, decay:0.04, size:1.5, color:`hsl(${260+Math.random()*40},80%,70%)` });
          }
        }
        ctx.restore();
      }

      // Draw particles on top
      drawParticles(ctx);

      ctx.restore(); // end camera transform
    }

    FortPerf.frameEnd();
    frameIdx += speed;

    if (frameIdx >= path.length) {
      const impactIdx = path.length - 1;
      const exX = (msg.impactX != null) ? msg.impactX : path.xs[impactIdx];
      const exY = (msg.impactY != null) ? msg.impactY : path.ys[impactIdx];

      // 스킬 플래시 표시
      if (msg.skill && msg.skill !== null) {
        const def = (typeof skillsGetDef === 'function') ? skillsGetDef(msg.skill) : null;
        if (def) _fortShowSkillFlash(def.emoji + ' ' + def.name);
      }

      // 메인 폭발 후 → 추가 포탄 / 클러스터 애니메이션 체인
      function runExtras(extIdx, finalCb) {
        const extras = msg.extraShots || [];
        if (extIdx >= extras.length) {
          // 땅뚫기 순차 착탄 연출
          const pierces = msg.pierceHits || [];
          if (pierces.length > 0) {
            let pi = 0;
            // 이전 착탄 위치 (메인 폭발 지점에서 시작)
            let prevX = (msg.impactX != null) ? msg.impactX : path.xs[path.length - 1];
            let prevY = (msg.impactY != null) ? msg.impactY : path.ys[path.length - 1];
            function nextPierce() {
              if (pi >= pierces.length) { runClusters(); return; }
              const ph = pierces[pi++];
              // 100ms 후 착탄 연출 (카메라를 착탄 지점으로 이동 + 폭발)
              setTimeout(() => {
                // 카메라를 착탄 지점으로 부드럽게 이동
                fortCam.targetX = ph.impactX;
                fortCam.targetY = ph.impactY;
                // 작은 지면 충격파 파티클 (아래로 쏟아지는 느낌)
                for (let k = 0; k < 8 && fortParticles.length < FORT_PARTICLE_CAP; k++) {
                  fortParticles.push({
                    x: ph.impactX + (Math.random() - 0.5) * 12,
                    y: ph.impactY - Math.random() * 4,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random() * 2,
                    life: 0.5,
                    decay: 0.04,
                    size: 2 + Math.random() * 2,
                    color: `hsl(30,60%,${40 + Math.random() * 20}%)`
                  });
                }
                // 착탄 폭발 (규모 줄임 → 관통 느낌)
                animateExplosion(ph.impactX, ph.impactY, ph.hitResult, view, nextPierce, null);
                prevX = ph.impactX;
                prevY = ph.impactY;
              }, 100);
            }
            nextPierce(); return;
          }
          function runClusters() {
            // 클러스터 폭발 처리
            const clusters = msg.clusterImpacts || [];
            if (clusters.length > 0) {
              let ci = 0;
              function nextCluster() {
                if (ci >= clusters.length) { finalCb && finalCb(); return; }
                const cl = clusters[ci++];
                setTimeout(() => {
                  animateExplosion(cl.impactX, cl.impactY, cl.hitResult, view, nextCluster, null);
                }, 80);
              }
              nextCluster(); return;
            }
            finalCb && finalCb();
          }
          runClusters(); return;
        }
        const shot = extras[extIdx];
        setTimeout(() => {
          fortPlaySound('fire', msg.shooterTribe || 'fire');
          _fortAnimateExtraShot(shot, msg.terrainAfter, () => runExtras(extIdx + 1, finalCb));
        }, shot.delay || 0);
      }

      // 넉백 시각 반영 (뷰의 플레이어 위치 이동)
      if (msg.skillEffects && msg.skillEffects.knockback && view) {
        msg.skillEffects.knockback.forEach(({ id, newX }) => {
          const p = view.players.find(pp => pp.id === id);
          if (p) p.x = newX;
        });
      }

      animateExplosion(exX, exY, hitResult, view, () => {
        runExtras(0, callback);
      }, msg.terrainAfter);
      return;
    }

    fortAnimId = requestAnimationFrame(animLoop);
  }

  fortAnimId = requestAnimationFrame(animLoop);
}

function animateExplosion(x, y, hitResult, view, callback, terrainAfter) {
  let frame = 0;
  const totalFrames = 35;
  const maxRadius = 50;
  let terrainApplied = false;

  // Spawn lots of particles at impact
  spawnExplosionParticles(x, y, 40, true);
  spawnDebris(x, y, 20);
  spawnSmoke(x, y, 12);
  fortPlaySound('explosion');

  // Apply damage to view NOW (at impact moment, not before animation)
  if (view && hitResult && hitResult.targets) {
    for (let i = 0; i < hitResult.targets.length; i++) {
      const t = hitResult.targets[i];
      const p = view.players.find(pp => pp.id === t.id);
      if (p) { p.hp = Math.max(0, p.hp - t.damage); if (p.hp <= 0) p.alive = false; }
    }
  }

  // Trigger hit squash on all damaged players
  if (hitResult && hitResult.targets) {
    for (let i = 0; i < hitResult.targets.length; i++) {
      if (hitResult.targets[i].damage > 0) fortTriggerSquash(hitResult.targets[i].id, 'hit');
    }
  }

  // Camera: target impact point
  fortCam.targetX = x;
  fortCam.targetY = y;

  // Screen shake state
  let shakeIntensity = 8;

  function explodeLoop() {
    FortPerf.frameStart();
    // Apply terrain destruction after flash fades (frame 5)
    if (!terrainApplied && frame >= 5 && terrainAfter && view) {
      view.terrain = terrainAfter;
      terrainApplied = true;
    }
    // Camera lerp
    fortCam.x += (fortCam.targetX - fortCam.x) * fortCam.lerp;
    fortCam.y += (fortCam.targetY - fortCam.y) * fortCam.lerp;
    clampCamera();

    updateParticles();

    // Screen shake
    const dprShake = window.devicePixelRatio || 1;
    const shakeX = (Math.random() - 0.5) * shakeIntensity / dprShake;
    const shakeY = (Math.random() - 0.5) * shakeIntensity / dprShake;
    shakeIntensity *= 0.9;

    if (fortCtx) {
      fortCtx.save();
      if (frame < 15) fortCtx.translate(shakeX, shakeY);
    }

    renderFortressScene(view);

    if (fortCtx) {
      const ctx = fortCtx;
      const progress = frame / totalFrames;

      // Explosion flash (very bright at start, no camera transform needed)
      if (frame < 5) {
        const flashAlpha = (1 - frame / 5) * 0.6;
        ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.fillRect(0, 0, FORT_CANVAS_W, FORT_CANVAS_H);
      }

      // Apply camera transform for explosion effects in world space
      ctx.save();
      applyCameraTransform(ctx);

      // Multi-layer explosion
      const radius = maxRadius * Math.min(1, progress * 2);
      const alpha = Math.max(0, 1 - progress);

      // Outer ring
      const grad1 = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.3);
      grad1.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.3})`);
      grad1.addColorStop(0.5, `rgba(255, 120, 0, ${alpha * 0.5})`);
      grad1.addColorStop(1, `rgba(200, 50, 0, 0)`);
      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Inner core
      const coreR = radius * 0.6;
      const grad2 = ctx.createRadialGradient(x, y, 0, x, y, coreR);
      grad2.addColorStop(0, `rgba(255, 255, 220, ${alpha})`);
      grad2.addColorStop(0.6, `rgba(255, 180, 50, ${alpha * 0.8})`);
      grad2.addColorStop(1, `rgba(255, 80, 0, 0)`);
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(x, y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Add more smoke over time
      if (frame % 4 === 0 && frame < 20) {
        spawnSmoke(x, y, 2);
      }

      // Draw particles
      drawParticles(ctx);

      // Draw damage numbers
      if (hitResult && hitResult.targets && frame > 5) {
        for (let ti = 0; ti < hitResult.targets.length; ti++) {
          const t = hitResult.targets[ti];
          const p = view.players.find(pp => pp.id === t.id);
          if (!p) continue;
          const px = Math.floor(Math.max(0, Math.min(p.x, FORT_CANVAS_W - 1)));
          const dmgY = (view.terrain || fortState?.terrain || [])[px] || 380;
          const floatY = dmgY - FORT_TANK_H - 30 - (frame - 5) * 1.2;
          const dmgAlpha = Math.max(0, 1 - (frame - 5) / 25);
          const scale = 1 + Math.sin((frame - 5) * 0.3) * 0.1;

          ctx.save();
          ctx.translate(p.x, floatY);
          ctx.scale(scale, scale);
          ctx.font = 'bold 18px Oswald, sans-serif';
          ctx.textAlign = 'center';

          const label = t.shielded ? '🛡️ BLOCK' : '-' + t.damage;
          const color = t.shielded
            ? `rgba(100, 200, 255, ${dmgAlpha})`
            : t.direct
            ? `rgba(255, 60, 60, ${dmgAlpha})`
            : `rgba(255, 200, 60, ${dmgAlpha})`;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(label, 0, 0);
          ctx.fillStyle = color;
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }

      ctx.restore(); // end camera transform

      ctx.restore(); // undo screen shake
    }

    FortPerf.frameEnd();
    frame++;
    if (frame >= totalFrames) {
      fortAnimId = null;
      fortParticles = [];
      fortDebris = [];
      fortSmoke = [];
      if (callback) callback();
      return;
    }

    fortAnimId = requestAnimationFrame(explodeLoop);
  }

  fortAnimId = requestAnimationFrame(explodeLoop);
}

// ===== 팟플 아이돌 매니지먼트 — 페스티벌 & VFX 모듈 =====
// 페스티벌 시퀀스, 전광판, 가챠 레전드, 성장 진화 연출

// ─── 공통 유틸 ──────────────────────────────────

/** DOM 유틸: 요소 생성 + 인라인 스타일 + 클래스 */
function _festEl(tag, cls, style, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (style) el.style.cssText = style;
  if (html) el.innerHTML = html;
  return el;
}

/** 풀스크린 오버레이 생성 (게임 컨테이너 기준) */
function _festCreateOverlay(cls) {
  const overlay = _festEl('div', cls, [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.85)',
    'opacity:0', 'transition:opacity 0.4s ease',
    'pointer-events:auto', 'overflow:hidden',
    'font-family:inherit',
  ].join(';'));
  document.body.appendChild(overlay);
  // Force reflow then fade in
  void overlay.offsetWidth;
  overlay.style.opacity = '1';
  return overlay;
}

/** 오버레이 페이드아웃 후 제거 */
function _festRemoveOverlay(overlay) {
  return new Promise(resolve => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve();
    }, 400);
  });
}

/** 딜레이 Promise */
function _festDelay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 현재 FX 티어 반환 */
function _festGetTier() {
  return typeof _idolFxTier !== 'undefined' ? _idolFxTier : 'full';
}

/** 아이돌 타입 정보 가져오기 */
function _festGetIdolType(player) {
  if (typeof IDOL_TYPES === 'undefined') return null;
  return IDOL_TYPES.find(t => t.id === player.idolType) || null;
}

/** 성장 단계 정보 */
function _festGetStage(player) {
  return typeof getIdolStage === 'function' ? getIdolStage(player.looks) : null;
}

/** 스타일 주입 (한 번만) */
let _festStyleInjected = false;
function _festInjectStyles() {
  if (_festStyleInjected) return;
  _festStyleInjected = true;

  const css = `
    /* ── 페스티벌 파티클 ── */
    @keyframes idol-fest-particle {
      0%   { transform:translateY(0) scale(1); opacity:1; }
      100% { transform:translateY(-120vh) scale(0.3); opacity:0; }
    }
    @keyframes idol-fest-glow {
      0%, 100% { text-shadow:0 0 10px rgba(255,215,0,0.6); }
      50%      { text-shadow:0 0 30px rgba(255,215,0,1), 0 0 60px rgba(255,165,0,0.5); }
    }
    @keyframes idol-fest-countup {
      0%   { transform:scale(1.3); }
      100% { transform:scale(1); }
    }
    @keyframes idol-fest-slidein-left {
      0%   { transform:translateX(-100%); opacity:0; }
      100% { transform:translateX(0); opacity:1; }
    }
    @keyframes idol-fest-slidein-right {
      0%   { transform:translateX(100%); opacity:0; }
      100% { transform:translateX(0); opacity:1; }
    }
    @keyframes idol-fest-slam {
      0%   { transform:scale(0); opacity:0; }
      60%  { transform:scale(1.25); opacity:1; }
      100% { transform:scale(1); opacity:1; }
    }
    @keyframes idol-fest-fadeup {
      0%   { transform:translateY(20px); opacity:0; }
      100% { transform:translateY(0); opacity:1; }
    }
    @keyframes idol-fest-shine {
      0%   { background-position:200% center; }
      100% { background-position:-200% center; }
    }
    /* ── 레전드 파티클 ── */
    @keyframes idol-legend-particle {
      0%   { transform:translate(0,0) rotate(0deg) scale(1); opacity:1; }
      100% { transform:translate(var(--dx), var(--dy)) rotate(720deg) scale(0); opacity:0; }
    }
    @keyframes idol-legend-spin {
      0%   { transform:scale(0) rotate(-180deg); }
      60%  { transform:scale(1.3) rotate(20deg); }
      100% { transform:scale(1) rotate(0deg); }
    }
    /* ── 진화 전환 ── */
    @keyframes idol-evo-arrow {
      0%   { transform:scaleX(0); }
      100% { transform:scaleX(1); }
    }
    /* ── 전광판 ── */
    @keyframes idol-billboard-glow-pulse {
      0%, 100% { box-shadow:0 0 15px rgba(255,215,0,0.3); }
      50%      { box-shadow:0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(255,165,0,0.4); }
    }
    @keyframes idol-billboard-noise {
      0%   { transform:translate(0,0); }
      25%  { transform:translate(-2px,1px); }
      50%  { transform:translate(1px,-1px); }
      75%  { transform:translate(-1px,2px); }
      100% { transform:translate(0,0); }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.id = 'idol-festival-vfx-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}


// ═══════════════════════════════════════════════
// 1. idolFestivalStart() — 페스티벌 시퀀스
// ═══════════════════════════════════════════════

function idolFestivalStart() {
  _festInjectStyles();
  const tier = _festGetTier();

  return new Promise(async (resolve) => {
    if (!idolState || !idolState.players) { resolve(true); return; }

    const activePlayers = idolState.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 0) { resolve(true); return; }

    // 카메라 줌아웃
    if (typeof idolCamReset === 'function') idolCamReset();

    const overlay = _festCreateOverlay('idol-festival-overlay');

    // ── Step 1: 오프닝 ──
    await _festOpening(overlay, tier);

    // ── Step 2: 각 플레이어 채점 (낮은 순위부터) ──
    const scored = _festScorePlayers(activePlayers);
    await _festShowScoring(overlay, scored, tier);

    // ── Step 3: 순위 발표 ──
    await _festShowRanking(overlay, scored, tier);

    // ── Step 4: 보상 지급 ──
    _festApplyRewards(scored);
    await _festShowRewards(overlay, scored, tier);

    // ── Step 5: 닫기 ──
    await _festClosing(overlay, tier);

    resolve(true);
  });
}

/** Step 1: 오프닝 */
async function _festOpening(overlay, tier) {
  overlay.innerHTML = '';

  // 무대 조명 효과 (full 티어만)
  if (tier === 'full') {
    _festSpawnStageParticles(overlay, 15);
  }

  const titleWrap = _festEl('div', 'idol-festival-title-wrap', [
    'text-align:center', 'z-index:1',
  ].join(';'));

  const emoji = _festEl('div', 'idol-festival-title-emoji', [
    'font-size:64px', 'margin-bottom:8px',
    'animation:idol-fest-slam 0.6s ease-out forwards',
  ].join(';'), '🎪');
  titleWrap.appendChild(emoji);

  const title = _festEl('div', 'idol-festival-title-text', [
    'font-size:28px', 'font-weight:900', 'color:#ffd700',
    'text-shadow:0 0 20px rgba(255,215,0,0.6), 0 2px 8px rgba(0,0,0,0.8)',
    'animation:idol-fest-glow 2s ease-in-out infinite',
    'letter-spacing:4px',
  ].join(';'), escapeHTML('페스티벌 스테이지!'));
  titleWrap.appendChild(title);

  const turnInfo = _festEl('div', 'idol-festival-turn', [
    'font-size:14px', 'color:rgba(255,255,255,0.6)', 'margin-top:8px',
    'animation:idol-fest-fadeup 0.5s ease-out 0.3s both',
  ].join(';'), escapeHTML(`${idolState.turnNum}턴 결산`));
  titleWrap.appendChild(turnInfo);

  overlay.appendChild(titleWrap);

  await _festDelay(1500);
}

/** Step 2: 플레이어 채점 데이터 준비 (낮은 순위부터 정렬) */
function _festScorePlayers(activePlayers) {
  const scored = activePlayers.map(p => {
    const scoreData = typeof calcFestivalScore === 'function'
      ? calcFestivalScore(p) : { baseBonus: 0, itemStats: {}, combos: [], comboStats: {}, totalScore: 0 };
    const idolType = _festGetIdolType(p);
    const stage = _festGetStage(p);
    return { player: p, scoreData, idolType, stage };
  });

  // 점수 낮은 순으로 정렬 (역순 등장)
  scored.sort((a, b) => a.scoreData.totalScore - b.scoreData.totalScore);
  return scored;
}

/** Step 2: 채점 연출 */
async function _festShowScoring(overlay, scored, tier) {
  overlay.innerHTML = '';

  const container = _festEl('div', 'idol-festival-scoring', [
    'width:100%', 'max-width:380px', 'padding:0 16px',
    'display:flex', 'flex-direction:column', 'gap:12px',
    'z-index:1',
  ].join(';'));
  overlay.appendChild(container);

  // 섹션 타이틀
  const sectionTitle = _festEl('div', 'idol-festival-section-title', [
    'font-size:18px', 'font-weight:700', 'color:#fff',
    'text-align:center', 'margin-bottom:8px',
    'animation:idol-fest-fadeup 0.4s ease-out forwards',
  ].join(';'), escapeHTML('🎤 무대 평가'));
  container.appendChild(sectionTitle);

  for (let i = 0; i < scored.length; i++) {
    const entry = scored[i];
    const p = entry.player;
    const sd = entry.scoreData;
    const idolType = entry.idolType;
    const accent = typeof idolUxGetPlayerAccent === 'function'
      ? idolUxGetPlayerAccent(p.id) : '#ffffff';

    const card = _festEl('div', 'idol-festival-score-card', [
      'background:rgba(255,255,255,0.08)',
      'border:1px solid rgba(255,255,255,0.15)',
      'border-radius:12px', 'padding:12px 14px',
      'display:flex', 'align-items:center', 'gap:12px',
      'animation:idol-fest-slidein-left 0.5s ease-out forwards',
      'opacity:0',
    ].join(';'));

    // SD 캐릭터 (이모지 fallback)
    const avatar = _festEl('div', 'idol-festival-avatar', [
      'width:48px', 'height:48px', 'border-radius:50%',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:28px',
      `background:linear-gradient(135deg, ${accent}40, ${accent}20)`,
      `border:2px solid ${accent}`,
      'flex-shrink:0',
    ].join(';'), idolType ? idolType.emoji : '🌟');
    card.appendChild(avatar);

    // 정보 영역
    const info = _festEl('div', 'idol-festival-info', [
      'flex:1', 'min-width:0',
    ].join(';'));

    const nameRow = _festEl('div', 'idol-festival-name', [
      'font-size:14px', 'font-weight:700', 'color:#fff',
      'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    ].join(';'), `${escapeHTML(p.idolName || p.name)}`);
    info.appendChild(nameRow);

    // 아이템 아이콘 나열
    if (p.items && p.items.length > 0) {
      const itemRow = _festEl('div', 'idol-festival-items', [
        'display:flex', 'gap:2px', 'margin-top:2px',
        'font-size:12px', 'opacity:0.7',
      ].join(';'));
      p.items.forEach(item => {
        const def = typeof IDOL_ITEMS !== 'undefined'
          ? IDOL_ITEMS.find(d => d.id === item.id) : null;
        if (def) {
          const icon = _festEl('span', '', '', def.emoji);
          itemRow.appendChild(icon);
        }
      });
      info.appendChild(itemRow);
    }

    // 콤보 표시
    if (sd.combos && sd.combos.length > 0 && tier !== 'minimal') {
      const comboRow = _festEl('div', 'idol-festival-combos', [
        'display:flex', 'flex-wrap:wrap', 'gap:4px', 'margin-top:4px',
      ].join(';'));
      sd.combos.forEach(c => {
        const chip = _festEl('span', 'idol-festival-combo-chip', [
          'font-size:10px', 'padding:1px 6px',
          'background:rgba(255,215,0,0.2)',
          'border:1px solid rgba(255,215,0,0.4)',
          'border-radius:8px', 'color:#ffd700',
          'white-space:nowrap',
        ].join(';'), escapeHTML(c.desc));
        comboRow.appendChild(chip);
      });
      info.appendChild(comboRow);
    }

    card.appendChild(info);

    // 점수 표시 (카운트업)
    const scoreEl = _festEl('div', 'idol-festival-score-value', [
      'font-size:24px', 'font-weight:900',
      'color:#ffd700', 'text-align:right',
      'min-width:48px', 'flex-shrink:0',
    ].join(';'), '0');
    card.appendChild(scoreEl);

    container.appendChild(card);

    // 슬라이드인 후 카운트업
    await _festDelay(300);
    card.style.opacity = '1';

    if (tier !== 'minimal') {
      await _festCountUp(scoreEl, sd.totalScore, 1200);
    } else {
      scoreEl.textContent = String(sd.totalScore);
    }

    await _festDelay(tier === 'full' ? 500 : 200);
  }

  await _festDelay(800);
}

/** 숫자 카운트업 애니메이션 */
function _festCountUp(el, target, durationMs) {
  return new Promise(resolve => {
    if (target <= 0) { el.textContent = '0'; resolve(); return; }
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / durationMs);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - ratio, 3);
      const current = Math.round(eased * target);
      el.textContent = String(current);
      if (ratio < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = String(target);
        el.style.animation = 'idol-fest-countup 0.3s ease-out';
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

/** Step 3: 순위 발표 */
async function _festShowRanking(overlay, scored, tier) {
  overlay.innerHTML = '';

  const container = _festEl('div', 'idol-festival-ranking', [
    'width:100%', 'max-width:380px', 'padding:0 16px',
    'text-align:center', 'z-index:1',
  ].join(';'));
  overlay.appendChild(container);

  const title = _festEl('div', 'idol-festival-rank-title', [
    'font-size:22px', 'font-weight:900', 'color:#fff',
    'margin-bottom:16px',
    'animation:idol-fest-slam 0.5s ease-out forwards',
  ].join(';'), escapeHTML('🏆 순위 발표'));
  container.appendChild(title);

  // 점수 높은 순으로 재정렬 (발표는 역순)
  const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);

  const RANK_MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
  const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32', '#8899aa'];

  // 역순 공개 (4등→1등)
  for (let i = ranked.length - 1; i >= 0; i--) {
    const entry = ranked[i];
    const p = entry.player;
    const rankNum = i + 1;
    const isFirst = (i === 0);
    const medal = RANK_MEDALS[i] || `${rankNum}`;
    const color = RANK_COLORS[i] || '#8899aa';

    const row = _festEl('div', 'idol-festival-rank-row', [
      'display:flex', 'align-items:center', 'gap:10px',
      'padding:10px 14px', 'margin-bottom:8px',
      'border-radius:10px',
      isFirst
        ? 'background:linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,165,0,0.15));border:2px solid rgba(255,215,0,0.6)'
        : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)',
      'animation:idol-fest-slidein-right 0.4s ease-out forwards',
      'opacity:0',
    ].join(';'));

    const medalEl = _festEl('span', 'idol-festival-rank-medal', [
      'font-size:24px', 'flex-shrink:0',
    ].join(';'), medal);
    row.appendChild(medalEl);

    const name = _festEl('span', 'idol-festival-rank-name', [
      'flex:1', 'font-size:16px', 'font-weight:700',
      `color:${color}`,
      'text-align:left',
      'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    ].join(';'), escapeHTML(p.idolName || p.name));
    row.appendChild(name);

    const score = _festEl('span', 'idol-festival-rank-score', [
      'font-size:18px', 'font-weight:900',
      `color:${color}`,
    ].join(';'), String(entry.scoreData.totalScore));
    row.appendChild(score);

    container.appendChild(row);

    await _festDelay(200);
    row.style.opacity = '1';

    // 1등 금빛 하이라이트 + 글로우
    if (isFirst && tier !== 'minimal') {
      row.style.animation = 'idol-fest-glow 2s ease-in-out infinite';
    }

    await _festDelay(tier === 'full' ? 500 : 300);
  }

  await _festDelay(tier === 'full' ? 1000 : 500);
}

/** Step 4: 보상 적용 (실제 스탯 변경) */
function _festApplyRewards(scored) {
  if (!idolState) return;

  // 점수 높은 순으로 정렬
  const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);

  ranked.forEach((entry, i) => {
    const p = entry.player;
    const rewardDef = (typeof FESTIVAL_REWARDS !== 'undefined' && FESTIVAL_REWARDS[i])
      ? FESTIVAL_REWARDS[i]
      : { fame: 1, money: 100, talent: 0, looks: 0 };

    // 실제 스탯 반영
    p.fame   += rewardDef.fame   || 0;
    p.money  += rewardDef.money  || 0;
    p.talent += rewardDef.talent || 0;
    p.looks  += rewardDef.looks  || 0;

    // 콤보 보너스도 실제 반영
    const cs = entry.scoreData.comboStats;
    if (cs) {
      p.talent += cs.talent || 0;
      p.looks  += cs.looks  || 0;
      p.fame   += cs.fame   || 0;
      p.favor  += cs.favor  || 0;
    }

    entry.rewardDef = rewardDef;
  });

  // P2P 동기화
  if (typeof broadcastIdolState === 'function') broadcastIdolState();
}

/** Step 4: 보상 표시 */
async function _festShowRewards(overlay, scored, tier) {
  overlay.innerHTML = '';

  const container = _festEl('div', 'idol-festival-rewards', [
    'width:100%', 'max-width:380px', 'padding:0 16px',
    'text-align:center', 'z-index:1',
  ].join(';'));
  overlay.appendChild(container);

  const title = _festEl('div', 'idol-festival-reward-title', [
    'font-size:18px', 'font-weight:700', 'color:#fff',
    'margin-bottom:12px',
    'animation:idol-fest-fadeup 0.4s ease-out forwards',
  ].join(';'), escapeHTML('🎁 보상 지급'));
  container.appendChild(title);

  const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);

  const STAT_EMOJIS = { fame: '⭐', money: '💰', talent: '🎵', looks: '💎' };

  ranked.forEach((entry, i) => {
    const p = entry.player;
    const rw = entry.rewardDef || {};
    const accent = typeof idolUxGetPlayerAccent === 'function'
      ? idolUxGetPlayerAccent(p.id) : '#ffffff';

    const row = _festEl('div', 'idol-festival-reward-row', [
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:8px 12px', 'margin-bottom:6px',
      'background:rgba(255,255,255,0.06)',
      'border-radius:8px',
      `border-left:3px solid ${accent}`,
      'animation:idol-fest-fadeup 0.4s ease-out forwards',
    ].join(';'));

    const name = _festEl('span', '', [
      'flex:1', 'font-size:13px', 'font-weight:600', 'color:#fff',
      'text-align:left', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    ].join(';'), escapeHTML(p.idolName || p.name));
    row.appendChild(name);

    const rewards = _festEl('span', '', [
      'font-size:12px', 'color:rgba(255,255,255,0.8)',
      'display:flex', 'gap:6px', 'flex-shrink:0',
    ].join(';'));

    ['fame', 'money', 'talent', 'looks'].forEach(key => {
      if (rw[key]) {
        const chip = _festEl('span', '', [
          'background:rgba(255,255,255,0.1)',
          'padding:1px 5px', 'border-radius:4px',
          'white-space:nowrap',
        ].join(';'), `${STAT_EMOJIS[key] || ''}+${rw[key]}`);
        rewards.appendChild(chip);
      }
    });

    row.appendChild(rewards);
    container.appendChild(row);
  });

  await _festDelay(2000);
}

/** Step 5: 닫기 (버튼 클릭 or 자동) */
async function _festClosing(overlay, tier) {
  // 닫기 버튼 추가
  const btnWrap = _festEl('div', 'idol-festival-close-wrap', [
    'position:absolute', 'bottom:40px', 'left:0', 'right:0',
    'text-align:center', 'z-index:2',
    'animation:idol-fest-fadeup 0.4s ease-out forwards',
  ].join(';'));

  const btn = _festEl('button', 'idol-festival-close-btn', [
    'padding:10px 32px', 'font-size:16px', 'font-weight:700',
    'color:#fff', 'background:rgba(255,215,0,0.3)',
    'border:2px solid rgba(255,215,0,0.6)',
    'border-radius:24px', 'cursor:pointer',
    'transition:all 0.2s ease',
  ].join(';'), escapeHTML('확인'));
  btnWrap.appendChild(btn);
  overlay.appendChild(btnWrap);

  // 버튼 클릭 or 3초 자동 닫기
  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    btn.addEventListener('click', finish);
    setTimeout(finish, 3000);
  });

  await _festRemoveOverlay(overlay);
}

/** 무대 파티클 생성 (full 티어용) */
function _festSpawnStageParticles(overlay, count) {
  for (let i = 0; i < count; i++) {
    const particle = _festEl('div', 'idol-festival-particle', [
      'position:absolute',
      'width:4px', 'height:4px', 'border-radius:50%',
      `background:hsl(${Math.random() * 60 + 30}, 100%, 70%)`,
      `left:${Math.random() * 100}%`,
      `bottom:-10px`,
      `animation:idol-fest-particle ${2 + Math.random() * 3}s linear ${Math.random() * 2}s infinite`,
      'pointer-events:none', 'z-index:0',
    ].join(';'));
    overlay.appendChild(particle);
  }
}


// ═══════════════════════════════════════════════
// 2. idolBillboardShow() — 전광판 연출
// ═══════════════════════════════════════════════

/**
 * 보드 중앙 전광판 스타일 연출
 * @param {string} playerId
 * @param {string} statName - 'fame'|'talent'|'looks'|'money' 등
 * @param {number} amount - 상승량
 * @returns {Promise<void>}
 */
function idolBillboardShow(playerId, statName, amount) {
  _festInjectStyles();
  const tier = _festGetTier();

  return new Promise(resolve => {
    if (!idolState) { resolve(); return; }

    const p = idolState.players.find(pl => pl.id === playerId);
    if (!p) { resolve(); return; }

    const idolType = _festGetIdolType(p);
    const accent = typeof idolUxGetPlayerAccent === 'function'
      ? idolUxGetPlayerAccent(playerId) : '#ffd700';

    const STAT_LABELS = {
      fame: { label: '인기도', emoji: '⭐' },
      talent: { label: '재능', emoji: '🎵' },
      looks: { label: '외모', emoji: '💎' },
      money: { label: '자금', emoji: '💰' },
      favor: { label: '호감도', emoji: '💕' },
    };
    const stat = STAT_LABELS[statName] || { label: statName, emoji: '📊' };

    // 카메라 줌아웃 (full 티어)
    if (tier === 'full' && typeof idolCamReset === 'function') {
      idolCamReset();
    }

    // ── minimal: 토스트만 ──
    if (tier === 'minimal') {
      if (typeof showToast === 'function') {
        showToast(`${stat.emoji} ${p.idolName || p.name}: ${stat.label} +${amount}`);
      }
      setTimeout(resolve, 1500);
      return;
    }

    // ── 기존 전광판 스프라이트 체크 ──
    const sprite = (typeof IDOL_BILLBOARD_SPRITES !== 'undefined' && p.idolType)
      ? IDOL_BILLBOARD_SPRITES[p.idolType] : null;

    if (sprite && typeof idolEventScreenShow === 'function') {
      idolEventScreenShow(sprite);
    }

    // ── 오버레이 생성 ──
    const overlay = _festEl('div', 'idol-billboard-overlay', [
      'position:fixed', 'inset:0', 'z-index:9998',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.6)',
      'opacity:0', 'transition:opacity 0.3s ease',
      'pointer-events:none',
    ].join(';'));
    document.body.appendChild(overlay);

    // 노이즈 질감 (full 티어)
    if (tier === 'full') {
      const noise = _festEl('div', 'idol-billboard-noise', [
        'position:absolute', 'inset:0',
        'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.015) 2px,rgba(255,255,255,0.015) 4px)',
        'animation:idol-billboard-noise 0.15s steps(3) infinite',
        'pointer-events:none', 'z-index:0',
      ].join(';'));
      overlay.appendChild(noise);
    }

    // 메인 카드
    const card = _festEl('div', 'idol-billboard-card', [
      'position:relative', 'z-index:1',
      'background:linear-gradient(135deg, rgba(20,20,40,0.95), rgba(10,10,30,0.95))',
      `border:2px solid ${accent}60`,
      'border-radius:16px', 'padding:24px 32px',
      'text-align:center',
      'animation:idol-fest-slam 0.5s ease-out forwards',
      tier === 'full'
        ? 'animation:idol-fest-slam 0.5s ease-out forwards, idol-billboard-glow-pulse 2s ease-in-out infinite 0.5s'
        : '',
    ].join(';'));

    // 캐릭터 이모지
    const charEmoji = _festEl('div', 'idol-billboard-char', [
      'font-size:48px', 'margin-bottom:8px',
    ].join(';'), idolType ? idolType.emoji : '🌟');
    card.appendChild(charEmoji);

    // 이름
    const nameEl = _festEl('div', 'idol-billboard-name', [
      'font-size:16px', 'font-weight:700', 'color:#fff',
      'margin-bottom:12px',
    ].join(';'), escapeHTML(p.idolName || p.name));
    card.appendChild(nameEl);

    // 스탯 표시
    const statEl = _festEl('div', 'idol-billboard-stat', [
      'font-size:36px', 'font-weight:900',
      `color:${accent}`,
      'text-shadow:0 0 20px ' + accent + '80',
      'animation:idol-fest-slam 0.6s ease-out 0.2s both',
    ].join(';'), `${stat.emoji} ${escapeHTML(stat.label)} +${amount}`);
    card.appendChild(statEl);

    overlay.appendChild(card);

    // Fade in
    void overlay.offsetWidth;
    overlay.style.opacity = '1';

    // 2.5초 후 자동 종료
    const duration = tier === 'full' ? 2500 : 2000;
    setTimeout(() => {
      overlay.style.opacity = '0';
      if (typeof idolEventScreenHide === 'function') idolEventScreenHide();
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve();
      }, 350);
    }, duration);
  });
}


// ═══════════════════════════════════════════════
// 3. idolLegendCelebration() — 가챠 레전드 이펙트
// ═══════════════════════════════════════════════

/**
 * 레전드 가챠 당첨 시 전체화면 축하 연출
 * @param {Object} player
 * @param {Object} reward - { type, value, desc, ... }
 * @returns {Promise<void>}
 */
function idolLegendCelebration(player, reward) {
  _festInjectStyles();
  const tier = _festGetTier();

  return new Promise(resolve => {
    // minimal: 토스트만
    if (tier === 'minimal') {
      if (typeof showToast === 'function') {
        showToast('💎 LEGEND! ' + (reward?.desc || ''));
      }
      setTimeout(resolve, 1500);
      return;
    }

    const overlay = _festCreateOverlay('idol-legend-overlay');

    // 금빛 파티클 (full 티어: 30개, reduced: 10개)
    const particleCount = tier === 'full' ? 30 : 10;
    _festSpawnLegendParticles(overlay, particleCount);

    // 💎 이모지 확대 + 회전
    const diamond = _festEl('div', 'idol-legend-diamond', [
      'font-size:80px', 'z-index:1',
      'animation:idol-legend-spin 0.8s ease-out forwards',
    ].join(';'), '💎');
    overlay.appendChild(diamond);

    // "LEGEND!" 텍스트 슬램
    const legendText = _festEl('div', 'idol-legend-text', [
      'font-size:40px', 'font-weight:900',
      'color:#ffd700', 'letter-spacing:6px',
      'text-shadow:0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,165,0,0.4)',
      'z-index:1', 'margin-top:12px',
      'animation:idol-fest-slam 0.6s ease-out 0.4s both',
    ].join(';'), 'LEGEND!');
    overlay.appendChild(legendText);

    // 보상 내용
    if (reward && reward.desc) {
      const rewardEl = _festEl('div', 'idol-legend-reward', [
        'font-size:16px', 'color:rgba(255,255,255,0.9)',
        'z-index:1', 'margin-top:12px',
        'animation:idol-fest-fadeup 0.4s ease-out 0.8s both',
      ].join(';'), escapeHTML(reward.desc));
      overlay.appendChild(rewardEl);
    }

    // 플레이어 이름
    if (player) {
      const nameEl = _festEl('div', 'idol-legend-player', [
        'font-size:14px', 'color:rgba(255,255,255,0.6)',
        'z-index:1', 'margin-top:8px',
        'animation:idol-fest-fadeup 0.4s ease-out 1s both',
      ].join(';'), escapeHTML(player.idolName || player.name || ''));
      overlay.appendChild(nameEl);
    }

    // 2.5초 후 자동 닫힘
    setTimeout(async () => {
      await _festRemoveOverlay(overlay);
      resolve();
    }, 2500);
  });
}

/** 레전드 금빛 파티클 */
function _festSpawnLegendParticles(overlay, count) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const dist = 80 + Math.random() * 200;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 100; // 위로 치우침

    const particle = _festEl('div', 'idol-legend-particle', [
      'position:absolute',
      `width:${4 + Math.random() * 6}px`,
      `height:${4 + Math.random() * 6}px`,
      'border-radius:50%',
      `background:hsl(${40 + Math.random() * 20}, 100%, ${60 + Math.random() * 30}%)`,
      'left:50%', 'top:50%',
      `--dx:${dx}px`, `--dy:${dy}px`,
      `animation:idol-legend-particle ${1.2 + Math.random() * 1}s ease-out ${Math.random() * 0.3}s forwards`,
      'pointer-events:none', 'z-index:0',
    ].join(';'));
    overlay.appendChild(particle);
  }
}


// ═══════════════════════════════════════════════
// 4. idolEvolutionCelebration() — 성장 진화 축하
// ═══════════════════════════════════════════════

/**
 * 외모 스탯 구간 돌파 시 전체 플레이어에게 알림
 * @param {Object} player
 * @param {Object} newStage - { stage, name, emoji, color }
 * @returns {Promise<void>}
 */
function idolEvolutionCelebration(player, newStage) {
  _festInjectStyles();
  const tier = _festGetTier();

  return new Promise(resolve => {
    if (!player || !newStage) { resolve(); return; }

    // 이전 단계 추론
    const prevStageIdx = Math.max(0, newStage.stage - 1);
    const prevStage = (typeof IDOL_STAGES !== 'undefined')
      ? IDOL_STAGES[prevStageIdx] : { name: '???', emoji: '❓', color: '#888' };

    // minimal: 토스트만
    if (tier === 'minimal') {
      if (typeof showToast === 'function') {
        showToast(`${newStage.emoji} ${player.idolName || player.name}: ${prevStage.name} → ${newStage.name}!`);
      }
      setTimeout(resolve, 1500);
      return;
    }

    const overlay = _festCreateOverlay('idol-evolution-overlay');
    overlay.style.background = `linear-gradient(135deg, ${newStage.color}30, rgba(0,0,0,0.9))`;

    // 플레이어 이름
    const idolType = _festGetIdolType(player);
    const nameEl = _festEl('div', 'idol-evolution-name', [
      'font-size:14px', 'color:rgba(255,255,255,0.7)',
      'z-index:1', 'margin-bottom:8px',
      'animation:idol-fest-fadeup 0.3s ease-out forwards',
    ].join(';'), `${idolType ? idolType.emoji : '🌟'} ${escapeHTML(player.idolName || player.name)}`);
    overlay.appendChild(nameEl);

    // 전환 컨테이너
    const transWrap = _festEl('div', 'idol-evolution-transition', [
      'display:flex', 'align-items:center', 'gap:16px',
      'z-index:1',
    ].join(';'));

    // 이전 단계
    const prevEl = _festEl('div', 'idol-evolution-stage idol-evolution-prev', [
      'text-align:center',
      'animation:idol-fest-fadeup 0.4s ease-out forwards',
    ].join(';'));
    prevEl.appendChild(_festEl('div', '', 'font-size:48px;opacity:0.5', prevStage.emoji));
    prevEl.appendChild(_festEl('div', '', [
      'font-size:14px', 'font-weight:600',
      `color:${prevStage.color}`, 'margin-top:4px', 'opacity:0.6',
    ].join(';'), escapeHTML(prevStage.name)));
    transWrap.appendChild(prevEl);

    // 화살표
    const arrow = _festEl('div', 'idol-evolution-arrow', [
      'font-size:32px', 'color:#ffd700',
      'animation:idol-evo-arrow 0.3s ease-out 0.3s both',
      'transform-origin:left center',
    ].join(';'), '→');
    transWrap.appendChild(arrow);

    // 새 단계
    const newEl = _festEl('div', 'idol-evolution-stage idol-evolution-new', [
      'text-align:center',
      'animation:idol-fest-slam 0.5s ease-out 0.5s both',
    ].join(';'));
    newEl.appendChild(_festEl('div', '', 'font-size:64px', newStage.emoji));
    newEl.appendChild(_festEl('div', '', [
      'font-size:18px', 'font-weight:900',
      `color:${newStage.color}`, 'margin-top:4px',
      `text-shadow:0 0 15px ${newStage.color}80`,
    ].join(';'), escapeHTML(newStage.name)));
    transWrap.appendChild(newEl);

    overlay.appendChild(transWrap);

    // "진화!" 텍스트
    const evoText = _festEl('div', 'idol-evolution-label', [
      'font-size:20px', 'font-weight:700',
      `color:${newStage.color}`, 'margin-top:16px',
      'z-index:1',
      'animation:idol-fest-fadeup 0.4s ease-out 0.7s both',
    ].join(';'), escapeHTML(`${prevStage.name} → ${newStage.name}!`));
    overlay.appendChild(evoText);

    // 2초 후 자동 닫힘
    setTimeout(async () => {
      await _festRemoveOverlay(overlay);
      resolve();
    }, 2000);
  });
}

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
// 1. idolFestivalStart() — 페스티벌 시퀀스 v2
// ═══════════════════════════════════════════════

// ─── 오디오 시스템 (Web Audio API 프로시저럴 사운드) ───
let _festAudioCtx = null;
function _festAudioInit() {
  if (_festAudioCtx) return;
  try { _festAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch(e) { /* 무음 fallback */ }
}

function _festSfx(type) {
  if (!_festAudioCtx || _festGetTier() === 'minimal') return;
  const ctx = _festAudioCtx;
  const now = ctx.currentTime;
  try {
    if (type === 'sharang') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 2000;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'shararang') {
      [1500, 2500].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 + i * 0.05);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.05); osc.stop(now + 0.3);
      });
    } else if (type === 'shararaRang') {
      [1200, 1800, 2400].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.08); osc.stop(now + 0.6);
      });
    } else if (type === 'swoosh') {
      const bufSize = ctx.sampleRate * 0.15;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      src.connect(gain); gain.connect(ctx.destination);
      src.start(now);
    } else if (type === 'fanfare') {
      [500, 630, 750, 880, 1000].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.12); osc.stop(now + 0.6 + i * 0.12);
      });
    }
  } catch(e) { /* 무음 fallback */ }
}

// ─── 햅틱 ───
function _festHaptic(intensity) {
  if (!navigator.vibrate || _festGetTier() === 'minimal') return;
  try {
    if (intensity === 'light') navigator.vibrate(30);
    else if (intensity === 'medium') navigator.vibrate(80);
    else if (intensity === 'strong') navigator.vibrate([100, 50, 200]);
  } catch(e) {}
}

// ─── 스킵/닫기 투표 관리 ───
let _festSkipped = false;
let _festClosed = false;

function _festIsSolo() {
  return !!(typeof state !== 'undefined' && (state.isPractice || state.players?.length <= 1));
}

function _festSendVote(action) {
  if (_festIsSolo()) return;
  if (typeof state !== 'undefined' && state.isHost) {
    // 호스트는 직접 집계
    if (idolState?.pendingAction?.festivalVotes) {
      const votes = idolState.pendingAction.festivalVotes;
      if (!votes[action].includes(state.myId)) {
        votes[action].push(state.myId);
        if (typeof broadcastIdolState === 'function') broadcastIdolState();
      }
    }
  } else {
    if (typeof broadcast === 'function') {
      broadcast({ type: 'idol-fest-action', action });
    }
  }
}

function _festGetVoteCount(action) {
  if (_festIsSolo()) return 999;
  const votes = idolState?.pendingAction?.festivalVotes;
  return votes ? (votes[action]?.length || 0) : 0;
}

function _festGetTotalPlayers() {
  if (!idolState) return 1;
  return idolState.players.filter(p => !p.bankrupt && !idolIsCpuPlayerId(p.id)).length || 1;
}

function _festCheckAllVoted(action) {
  if (_festIsSolo()) return true;
  return _festGetVoteCount(action) >= _festGetTotalPlayers();
}

// ─── 사전 예고 배너 ───
function _festPreBanner() {
  const banner = _festEl('div', 'idol-prefest-banner', '', '');
  banner.innerHTML = `⭐ 다음 턴 페스티벌! ⭐<div class="idol-prefest-banner-sub">아이템과 스탯을 점검하세요!</div>`;
  document.body.appendChild(banner);
  _festHaptic('light');
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.4s ease';
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 400);
  }, 3000);
}

// ─── 메인 시퀀스 ───
function idolFestivalStart() {
  _festInjectStyles();
  _festAudioInit();
  const tier = _festGetTier();

  _festSkipped = false;
  _festClosed = false;

  return new Promise(async (resolve) => {
    if (!idolState || !idolState.players) { resolve(true); return; }

    const activePlayers = idolState.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 0) { resolve(true); return; }

    // 카메라 줌아웃
    if (typeof idolCamReset === 'function') idolCamReset();

    const overlay = _festCreateOverlay('idol-festival-overlay');

    // 스킵/닫기 바 (전체 시퀀스 동안 하단 고정)
    const skipBar = _festEl('div', 'fest-skip-bar', '');
    const skipBtn = _festEl('button', 'fest-skip-btn', '', '⏩ 스킵');
    const skipVote = _festEl('span', 'fest-vote-count', '', '');
    skipBtn.appendChild(skipVote);
    skipBtn.addEventListener('click', () => {
      _festSendVote('skip');
      if (_festIsSolo()) { _festSkipped = true; }
      skipBtn.style.opacity = '0.5';
      skipBtn.style.pointerEvents = 'none';
    });
    skipBar.appendChild(skipBtn);
    overlay.appendChild(skipBar);

    // ── Phase 1: 진입 ──
    if (!_festSkipped) {
      overlay.style.background = 'rgba(0,0,0,0)';
      await _festDelay(50);
      overlay.style.transition = 'background 0.4s ease';
      overlay.style.background = 'rgba(0,0,0,0.88)';
      await _festDelay(400);

      if (tier === 'full') _festSpawnStageParticles(overlay, 15);

      const titleWrap = _festEl('div', '', 'text-align:center;z-index:1;');
      titleWrap.innerHTML = `<div style="font-size:52px;animation:idol-fest-slam 0.5s ease-out forwards">✨</div>
        <div style="font-size:26px;font-weight:900;color:#ffd700;letter-spacing:4px;animation:idol-fest-glow 2s ease-in-out infinite;margin-top:8px">${escapeHTML('FESTIVAL')}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:6px">${escapeHTML(idolState.turnNum + '턴 결산')}</div>`;
      overlay.appendChild(titleWrap);
      _festSfx('shararang');
      _festHaptic('medium');
      await _festDelay(1500);

      // 타이틀 위로 슬라이드 아웃
      titleWrap.style.transition = 'transform 0.5s ease-in, opacity 0.5s ease-in';
      titleWrap.style.transform = 'translateY(-100vh)';
      titleWrap.style.opacity = '0';
      await _festDelay(500);
      titleWrap.remove();
    }
    if (_festSkipped || _festCheckAllVoted('skip')) { _festSkipped = true; }

    // ── Phase 2: 순서 공개 ──
    const scored = _festScorePlayers(activePlayers);
    if (!_festSkipped) {
      const orderWrap = _festEl('div', 'fest-order-list', 'z-index:1;');
      let orderHtml = `<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px">${escapeHTML('🎭 공연 순서')}</div>`;
      scored.forEach((entry, i) => {
        const isMe = entry.player.id === state?.myId;
        const cls = isMe ? 'fest-order-me' : '';
        orderHtml += `<div class="${cls}">${i + 1}번: ${escapeHTML(entry.player.idolName || entry.player.name)}</div>`;
      });
      orderWrap.innerHTML = orderHtml;
      overlay.appendChild(orderWrap);
      await _festDelay(2000);
      orderWrap.style.transition = 'opacity 0.3s ease';
      orderWrap.style.opacity = '0';
      await _festDelay(300);
      orderWrap.remove();
    }
    if (_festSkipped || _festCheckAllVoted('skip')) { _festSkipped = true; }

    // ── Phase 3: 플레이어별 카드 + 콤보 루프 ──
    const rankedSoFar = [];
    if (!_festSkipped) {
      for (let i = 0; i < scored.length; i++) {
        if (_festSkipped || _festCheckAllVoted('skip')) { _festSkipped = true; break; }

        const entry = scored[i];
        const p = entry.player;
        const sd = entry.scoreData;
        const idolType = entry.idolType;
        const accent = typeof idolUxGetPlayerAccent === 'function'
          ? idolUxGetPlayerAccent(p.id) : '#ffffff';
        const isMe = p.id === state?.myId;

        // 이름 프리뷰
        const preview = _festEl('div', 'fest-name-preview', 'z-index:1;',
          `${i + 1}번째: ${escapeHTML(p.idolName || p.name)}`);
        overlay.appendChild(preview);
        _festSfx('swoosh');
        await _festDelay(500);
        preview.remove();

        // 좌우 분할 컨테이너
        const split = _festEl('div', 'fest-split-container', 'z-index:1;');
        overlay.appendChild(split);

        // 카드 영역 (좌 45%)
        const cardArea = _festEl('div', 'fest-card-area', '');
        const card = _festEl('div', `fest-player-card${isMe ? ' fest-my-card' : ''}`, '');

        const avatarEl = _festEl('div', 'fest-avatar', `background:linear-gradient(135deg,${accent}40,${accent}20);border:2px solid ${accent};`,
          idolType ? idolType.emoji : '🌟');
        card.appendChild(avatarEl);

        const nameEl = _festEl('div', 'fest-idol-name', '', escapeHTML(p.idolName || p.name));
        card.appendChild(nameEl);

        // 스탯 표시
        const statsEl = _festEl('div', 'fest-stats', '',
          `⭐${p.fame} 🎵${p.talent} 💎${p.looks}`);
        card.appendChild(statsEl);

        // 호감도 (페스티벌에서 최초 공개)
        const favorVal = idolState.pendingAction?.festivalScores?.find(s => s.id === p.id)?.favor ?? p.favor ?? 0;
        const favorEl = _festEl('div', 'fest-favor', '', `💕 호감도: ${favorVal}`);
        card.appendChild(favorEl);

        // 아이템 행
        if (p.items && p.items.length > 0) {
          const itemsRow = _festEl('div', 'fest-items-row', '');
          p.items.forEach(item => {
            const def = typeof IDOL_ITEMS !== 'undefined' ? IDOL_ITEMS.find(d => d.id === item.id) : null;
            if (def) itemsRow.appendChild(_festEl('span', '', '', def.emoji));
          });
          card.appendChild(itemsRow);
        }

        cardArea.appendChild(card);
        split.appendChild(cardArea);

        // 콤보 영역 (우 55%)
        const comboArea = _festEl('div', 'fest-combo-area', '');
        const comboTitle = _festEl('div', 'fest-combo-title', '', '🎯 콤보 계산 중...');
        comboArea.appendChild(comboTitle);
        split.appendChild(comboArea);

        _festHaptic('light');
        await _festDelay(600);

        // 콤보 조건 순차 등장
        comboTitle.textContent = '🎯 콤보 결과';
        let runningScore = sd.baseBonus;
        const allCombos = sd.combos || [];

        // 스코어 카운터
        const scoreCounter = _festEl('div', '', 'text-align:center;font-size:18px;font-weight:700;color:rgba(255,255,255,0.6);margin-bottom:8px;',
          `기본 점수: ${sd.baseBonus}`);
        comboArea.insertBefore(scoreCounter, comboTitle.nextSibling);

        for (let ci = 0; ci < allCombos.length; ci++) {
          if (_festSkipped) break;
          const c = allCombos[ci];
          const delay = ci === 0 ? 500 : ci === 1 ? 400 : 300;
          await _festDelay(delay);

          const isZero = c.value === 0;
          const comboItem = _festEl('div', `fest-combo-item${isZero ? ' fest-combo-zero' : ''}`, '');
          const emojiEl = _festEl('span', 'fest-combo-emoji', '', c.item?.emoji || '📊');
          const descEl = _festEl('span', 'fest-combo-desc', '', escapeHTML(c.desc));
          const valEl = _festEl('span', 'fest-combo-value', '', isZero ? '-' : `+${c.value}`);
          comboItem.appendChild(emojiEl);
          comboItem.appendChild(descEl);
          comboItem.appendChild(valEl);

          // 리액션
          if (!isZero) {
            let reactionText = '', reactionCls = '';
            if (c.value >= 50)      { reactionText = 'AMAZING! 🌟'; reactionCls = 'amazing'; }
            else if (c.value >= 30) { reactionText = 'Great! ✨'; reactionCls = 'great'; }
            else if (c.value >= 10) { reactionText = 'Good!'; reactionCls = 'good'; }
            if (reactionText) {
              const reaction = _festEl('span', `fest-combo-reaction ${reactionCls}`, '', reactionText);
              comboItem.appendChild(reaction);
            }
            _festSfx(c.value >= 30 ? 'shararang' : 'sharang');
            _festHaptic(c.value >= 50 ? 'medium' : 'light');
          }

          comboArea.appendChild(comboItem);
          // Force visible
          void comboItem.offsetWidth;
          comboItem.style.opacity = '1';

          // 스크롤 (6개 초과 시)
          if (ci >= 5) comboArea.scrollTop = comboArea.scrollHeight;
        }

        if (!_festSkipped) {
          await _festDelay(400);

          // 최종 점수 중앙 확대
          const totalEl = _festEl('div', 'fest-total-score', '', String(sd.totalScore));
          comboArea.appendChild(totalEl);
          _festSfx('shararaRang');
          _festHaptic('medium');
          if (tier === 'full') _festSpawnStageParticles(overlay, 8);

          // 순위 예측
          rankedSoFar.push({ entry, score: sd.totalScore });
          rankedSoFar.sort((a, b) => b.score - a.score);
          const myRank = rankedSoFar.findIndex(r => r.entry === entry) + 1;
          const predEl = _festEl('div', 'fest-rank-prediction', '', `현재 ${myRank}위 예상`);
          comboArea.appendChild(predEl);

          await _festDelay(1200);

          // 퇴장
          split.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
          split.style.transform = 'translateX(-100%)';
          split.style.opacity = '0';
          _festSfx('swoosh');
          await _festDelay(500);
          split.remove();
        } else {
          split.remove();
        }
      }
    }
    // 스킵 시 채점은 실행 but 연출 건너뜀
    if (rankedSoFar.length === 0) {
      scored.forEach(entry => rankedSoFar.push({ entry, score: entry.scoreData.totalScore }));
      rankedSoFar.sort((a, b) => b.score - a.score);
    }

    // ── 보상 적용 ──
    _festApplyRewards(scored);

    // ── 스킵 시 요약본 표시 ──
    if (_festSkipped) {
      // 스킵 버튼 비활성화
      skipBtn.style.display = 'none';
      await _festShowSummary(overlay, scored);
    } else {
      // ── Phase 4: 최종 순위 ──
      skipBtn.style.display = 'none'; // Phase 4부터 스킵 불가
      const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);
      const rankIndices = [];
      for (let i = 0; i < ranked.length; i++) {
        let rIdx = i;
        for (let j = 0; j < i; j++) {
          if (ranked[j].scoreData.totalScore === ranked[i].scoreData.totalScore) { rIdx = j; break; }
        }
        rankIndices.push(rIdx);
      }

      const RANK_MEDALS = ['👑', '🥈', '🥉', '4️⃣'];
      const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32', '#8899aa'];

      const rankTitle = _festEl('div', '', 'text-align:center;font-size:22px;font-weight:900;color:#fff;z-index:1;margin-bottom:16px;animation:idol-fest-slam 0.5s ease-out forwards',
        escapeHTML('🏆 최종 순위'));
      overlay.appendChild(rankTitle);

      const rankContainer = _festEl('div', 'fest-rank-container', 'z-index:1;');
      overlay.appendChild(rankContainer);

      for (let i = 0; i < ranked.length; i++) {
        const entry = ranked[i];
        const p = entry.player;
        const rIdx = rankIndices[i];
        const isFirst = rIdx === 0;
        const isTie = i > 0 && ranked[i - 1].scoreData.totalScore === entry.scoreData.totalScore;
        const medal = RANK_MEDALS[rIdx] || `${rIdx + 1}`;
        const color = RANK_COLORS[rIdx] || '#8899aa';

        const rankCard = _festEl('div',
          `fest-rank-card${isFirst ? ' fest-rank-first' : ''}${isTie ? ' fest-rank-tie' : ''}`, '');

        const medalEl = _festEl('span', 'fest-rank-medal', '', medal);
        rankCard.appendChild(medalEl);

        if (isFirst) {
          const crownEl = _festEl('span', 'fest-rank-crown', '', '');
        }

        const infoEl = _festEl('div', 'fest-rank-info', '');
        const nameEl = _festEl('div', 'fest-rank-name', `color:${color}`, escapeHTML(p.idolName || p.name));
        infoEl.appendChild(nameEl);

        if (!isFirst) {
          const msgEl = _festEl('div', 'fest-rank-msg', '', '다음엔 꼭! 👏');
          infoEl.appendChild(msgEl);
        }
        rankCard.appendChild(infoEl);

        const scoreEl = _festEl('span', 'fest-rank-score', `color:${color}`, String(entry.scoreData.totalScore));
        rankCard.appendChild(scoreEl);

        rankContainer.appendChild(rankCard);

        await _festDelay(150);
        void rankCard.offsetWidth;
        rankCard.style.opacity = '1';

        if (isFirst) {
          _festSfx('fanfare');
          _festHaptic('strong');
          if (tier === 'full') _festSpawnStageParticles(overlay, 20);
        } else {
          _festHaptic('light');
        }

        await _festDelay(tier === 'full' ? 500 : 300);
      }

      await _festDelay(1000);
    }

    // ── Phase 5: 닫기 (전원 동의 필요) ──
    const closeBar = _festEl('div', 'fest-skip-bar', 'z-index:10;');
    const closeBtn = _festEl('button', 'fest-close-btn', '', '✅ 확인');
    const closeVote = _festEl('span', 'fest-vote-count', '', '');
    closeBtn.appendChild(closeVote);
    overlay.appendChild(closeBar);
    closeBar.appendChild(closeBtn);

    await new Promise(closeResolve => {
      let closeDone = false;
      const tryClose = () => {
        if (closeDone) return;
        if (_festCheckAllVoted('close')) {
          closeDone = true;
          closeResolve();
        }
      };

      closeBtn.addEventListener('click', () => {
        _festSendVote('close');
        if (_festIsSolo()) { _festClosed = true; closeDone = true; closeResolve(); return; }
        closeBtn.style.opacity = '0.5';
        closeBtn.style.pointerEvents = 'none';
        // 투표 상태 표시 업데이트
        const cnt = _festGetVoteCount('close');
        const total = _festGetTotalPlayers();
        closeVote.textContent = `👤 ${cnt}/${total}`;
        tryClose();
      });

      // 솔로/연습모드: 5초 자동 닫기
      if (_festIsSolo()) {
        setTimeout(() => { if (!closeDone) { closeDone = true; closeResolve(); } }, 5000);
      }

      // 멀티: 주기적으로 투표 체크
      const voteCheck = setInterval(() => {
        if (closeDone) { clearInterval(voteCheck); return; }
        const cnt = _festGetVoteCount('close');
        const total = _festGetTotalPlayers();
        closeVote.textContent = total > 1 ? `👤 ${cnt}/${total}` : '';
        tryClose();
      }, 500);

      // 30초 타임아웃
      setTimeout(() => { clearInterval(voteCheck); if (!closeDone) { closeDone = true; closeResolve(); } }, 30000);
    });

    // 페이드아웃
    await _festRemoveOverlay(overlay);
    window._festLocalRunning = false;

    resolve(true);
  });
}

/** 스킵 요약본 */
async function _festShowSummary(overlay, scored) {
  const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);
  const RANK_MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
  const STAT_EMOJIS = { fame: '⭐', money: '💰', talent: '🎵', looks: '💎' };

  // 동점 처리
  const rankIndices = [];
  for (let i = 0; i < ranked.length; i++) {
    let rIdx = i;
    for (let j = 0; j < i; j++) {
      if (ranked[j].scoreData.totalScore === ranked[i].scoreData.totalScore) { rIdx = j; break; }
    }
    rankIndices.push(rIdx);
  }

  const title = _festEl('div', '', 'text-align:center;font-size:18px;font-weight:700;color:#fff;z-index:1;margin-bottom:12px;',
    escapeHTML('📋 페스티벌 결과'));
  overlay.appendChild(title);

  const container = _festEl('div', 'fest-summary-container', 'z-index:1;margin:0 auto;');
  overlay.appendChild(container);

  ranked.forEach((entry, i) => {
    const p = entry.player;
    const rIdx = rankIndices[i];
    const medal = RANK_MEDALS[rIdx] || `${rIdx + 1}`;
    const rw = entry.rewardDef || {};

    const row = _festEl('div', 'fest-summary-row', '');
    row.appendChild(_festEl('span', 'fest-summary-medal', '', medal));
    row.appendChild(_festEl('span', 'fest-summary-name', '', escapeHTML(p.idolName || p.name)));
    row.appendChild(_festEl('span', 'fest-summary-score', '', String(entry.scoreData.totalScore)));

    const rewards = _festEl('span', 'fest-summary-rewards', '');
    ['fame', 'money', 'talent', 'looks'].forEach(key => {
      if (rw[key]) rewards.appendChild(_festEl('span', '', '', `${STAT_EMOJIS[key]}+${rw[key]}`));
    });
    row.appendChild(rewards);
    container.appendChild(row);
  });
}

/** 사전 배너 (idol.js에서 호출) */
// _festPreBanner is defined above

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

/** 숫자 카운트업 애니메이션 */
function _festCountUp(el, target, durationMs) {
  return new Promise(resolve => {
    if (target <= 0) { el.textContent = '0'; resolve(); return; }
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / durationMs);
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

/** 보상 적용 (실제 스탯 변경) — 동점자는 같은 보상 */
function _festApplyRewards(scored) {
  if (!idolState) return;

  const ranked = [...scored].sort((a, b) => b.scoreData.totalScore - a.scoreData.totalScore);

  ranked.forEach((entry, i) => {
    const p = entry.player;
    let rankIdx = i;
    for (let j = 0; j < i; j++) {
      if (ranked[j].scoreData.totalScore === entry.scoreData.totalScore) {
        rankIdx = j;
        break;
      }
    }
    const rewardDef = (typeof FESTIVAL_REWARDS !== 'undefined' && FESTIVAL_REWARDS[rankIdx])
      ? FESTIVAL_REWARDS[rankIdx]
      : { fame: 1, money: 100, talent: 0, looks: 0 };

    p.fame   += rewardDef.fame   || 0;
    p.money  += rewardDef.money  || 0;
    p.talent += rewardDef.talent || 0;
    p.looks  += rewardDef.looks  || 0;

    const cs = entry.scoreData.comboStats;
    if (cs) {
      p.talent += cs.talent || 0;
      p.looks  += cs.looks  || 0;
      p.fame   += cs.fame   || 0;
      p.favor  += cs.favor  || 0;
    }

    entry.rewardDef = rewardDef;
    entry.rankIdx = rankIdx;
  });

  if (typeof broadcastIdolState === 'function') broadcastIdolState();
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


// ═══════════════════════════════════════════════
// 5. idolGachaAnimation() — 가챠 릴 연출
// ═══════════════════════════════════════════════

/** 릴 이모지 풀 */
const _GACHA_REEL_EMOJIS = ['🎤','🎵','💎','⭐','🌟','✨','🎪','🎭','💫','🎶','🌈','🔥','💖','🎸','🎹'];

/**
 * 가챠 릴 회전 → 등급 판정 연출
 * @param {string} grade - 'common'|'hit'|'legend'
 * @param {string} emoji - 결과 이모지
 * @param {string} label - 결과 라벨 텍스트
 * @returns {Promise<void>}
 */
function idolGachaAnimation(grade, emoji, label) {
  _festInjectStyles();
  _gachaInjectStyles();
  const tier = _festGetTier();

  return new Promise(async (resolve) => {
    // ── minimal: 릴 없이 딜레이만 ──
    if (tier === 'minimal') {
      await _festDelay(500);
      resolve();
      return;
    }

    // ── 레전드는 이 함수에서 처리 안함 ──
    if (grade === 'legend') {
      resolve();
      return;
    }

    const isReduced = (tier === 'reduced');

    // ── Step 1: 오버레이 등장 ──
    const overlay = _festEl('div', 'idol-gacha-overlay', [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.85)',
      'opacity:0', 'transition:opacity 0.2s ease',
      'pointer-events:auto',
    ].join(';'));
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.style.opacity = '1';

    // 가챠 머신 프레임
    const machine = _festEl('div', 'idol-gacha-machine', '');
    overlay.appendChild(machine);

    // 타이틀
    const title = _festEl('div', 'idol-gacha-title', '', escapeHTML('가챠!'));
    machine.appendChild(title);

    // 릴 박스 컨테이너
    const reelBox = _festEl('div', 'idol-gacha-reel-box', '');
    machine.appendChild(reelBox);

    // 릴 슬롯 생성 (reduced=1개, full=3개)
    const reelCount = isReduced ? 1 : 3;
    const slots = [];
    for (let i = 0; i < reelCount; i++) {
      const slot = _festEl('div', 'idol-gacha-reel-slot', '');
      const content = _festEl('span', 'idol-gacha-reel-content', '', _gachaRandomEmoji());
      slot.appendChild(content);
      reelBox.appendChild(slot);
      slots.push({ el: slot, content, timer: null });
    }

    await _festDelay(200);

    // ── Step 2: 릴 스핀 시작 ──
    slots.forEach(s => {
      s.content.classList.add('idol-gacha-spinning');
      s.timer = setInterval(() => {
        s.content.textContent = _gachaRandomEmoji();
      }, 60);
    });

    // ── Step 3: 순차 정지 ──
    const stopDelays = isReduced ? [800] : [1200, 1800, 2400];

    for (let i = 0; i < slots.length; i++) {
      await _festDelay(i === 0 ? stopDelays[0] : (stopDelays[i] - stopDelays[i - 1]));
      // 감속: interval 늘리다가 정지
      const s = slots[i];
      clearInterval(s.timer);
      // 감속 단계
      s.timer = setInterval(() => { s.content.textContent = _gachaRandomEmoji(); }, 200);
      await _festDelay(200);
      clearInterval(s.timer);
      s.timer = setInterval(() => { s.content.textContent = _gachaRandomEmoji(); }, 300);
      await _festDelay(300);
      clearInterval(s.timer);
      // 최종 이모지 (마지막 릴은 결과 이모지)
      s.content.textContent = (i === slots.length - 1) ? (emoji || '🌀') : _gachaRandomEmoji();
      s.content.classList.remove('idol-gacha-spinning');
      s.content.classList.add('idol-gacha-stopped');
    }

    // ── Step 4: 등급 판정 연출 ──
    const reveal = _festEl('div', 'idol-gacha-grade-reveal', '');
    machine.appendChild(reveal);

    if (grade === 'hit') {
      // 히트: 화면 플래시 + 바운스 텍스트
      const flash = _festEl('div', 'idol-gacha-flash', '');
      overlay.appendChild(flash);
      await _festDelay(150);
      if (flash.parentNode) flash.parentNode.removeChild(flash);

      reveal.className = 'idol-gacha-grade-reveal idol-gacha-grade-hit';
      reveal.innerHTML = escapeHTML('✨ 히트!');
      await _festDelay(1000);
    } else {
      // 커먼: 페이드인
      reveal.className = 'idol-gacha-grade-reveal idol-gacha-grade-common';
      reveal.innerHTML = escapeHTML('🌀 커먼');
      await _festDelay(800);
    }

    // ── Step 5: 보상 텍스트 페이드인 ──
    if (label) {
      const reward = _festEl('div', 'idol-gacha-reward-text', '', escapeHTML(label));
      machine.appendChild(reward);
      await _festDelay(600);
    }

    // 닫기
    overlay.style.opacity = '0';
    await _festDelay(300);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

    resolve();
  });
}

/** 랜덤 릴 이모지 반환 */
function _gachaRandomEmoji() {
  return _GACHA_REEL_EMOJIS[Math.floor(Math.random() * _GACHA_REEL_EMOJIS.length)];
}

/** 가챠 전용 스타일 주입 (한 번만) */
let _gachaStyleInjected = false;
function _gachaInjectStyles() {
  if (_gachaStyleInjected) return;
  _gachaStyleInjected = true;

  const css = `
    @keyframes idol-gacha-spin {
      0%   { transform: translateY(0); }
      100% { transform: translateY(-20px); }
    }
    @keyframes idol-gacha-bounce {
      0%   { transform: scale(1) translateY(0); }
      40%  { transform: scale(1.15) translateY(-6px); }
      70%  { transform: scale(0.95) translateY(2px); }
      100% { transform: scale(1) translateY(0); }
    }
    @keyframes idol-gacha-hit-bounce {
      0%   { transform: scale(0.5); opacity: 0; }
      50%  { transform: scale(1.3); opacity: 1; }
      75%  { transform: scale(0.9); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes idol-gacha-flash-anim {
      0%   { opacity: 0.9; }
      100% { opacity: 0; }
    }
    @keyframes idol-gacha-reward-fadein {
      0%   { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.id = 'idol-gacha-reel-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

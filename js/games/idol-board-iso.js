// ===== 팟플 아이돌 — ISO 보드 렌더러 =====
// Monopoly GO 스타일 등각 3D 보드 (SVG 기반, 게임 로직 무관)

// ─── 상수 ────────────────────────────────────────────
const ISO_BOARD = {
  TILE_W: 56,   // 다이아몬드 타일 너비
  TILE_H: 28,   // = TILE_W/2 (2:1 비율)
  HW:     28,   // 반너비
  HH:     14,   // 반높이
  DEPTH:  10,   // 3D 벽 두께 (px)
  OX:     290,  // SVG 수평 중심 오프셋
  OY:     10,   // 상단 여백
  SVG_W:  580,  // SVG 전체 너비
  SVG_H:  320,  // SVG 전체 높이 (벽 depth 포함)
};

// ─── 셀 타입 색상 팔레트 ─────────────────────────────
const _ISO_COLORS = {
  shop:   { grad: ['#fff0f5', '#fce4ec'], south: '#e0a0b4', west: '#c890a0' },
  event:  { grad: ['#fff0e6', '#ffccbc'], south: '#d4956a', west: '#c07850' },
  gacha:  { grad: ['#f3e5ff', '#e1bee7'], south: '#b088cc', west: '#9070b0' },
  chance: { grad: ['#e8f5e9', '#c8e6c9'], south: '#80b888', west: '#689a70' },
  tax:    { grad: ['#fff8e1', '#ffecb3'], south: '#cca840', west: '#b09030' },
  start:  { grad: ['#fff9c4', '#ffe082'], south: '#c8a020', west: '#a08010' },
  police: { grad: ['#bbdefb', '#90caf9'], south: '#5080c8', west: '#4060a8' },
  free:   { grad: ['#dcedc8', '#aed581'], south: '#70a040', west: '#508030' },
  stage:  { grad: ['#ffe0b2', '#ffcc80'], south: '#d4880a', west: '#b06800' },
};

// 코너 셀 인덱스 집합 (특수 시각 처리 — 더 두꺼운 depth, 금색 테두리)
const _ISO_CORNERS = new Set([0, 9, 18, 27]);

// ─── 꼭짓점 계산 ─────────────────────────────────────
// 격자 [c, r]의 상단면 다이아몬드 4꼭짓점 반환
function _isoVtx(c, r) {
  const { OX, OY, HW, HH } = ISO_BOARD;
  return {
    top:    { x: OX + (c - r)     * HW, y: OY + (c + r)     * HH },
    right:  { x: OX + (c - r + 1) * HW, y: OY + (c + r + 1) * HH },
    bottom: { x: OX + (c - r)     * HW, y: OY + (c + r + 2) * HH },
    left:   { x: OX + (c - r - 1) * HW, y: OY + (c + r + 1) * HH },
  };
}

// SVG polygon points 문자열
function _pts(arr) {
  return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// ─── SVG <defs> 빌더 ─────────────────────────────────
function _isoDefsHTML() {
  let html = '<defs>';

  // 셀 타입별 상단면 그라디언트
  for (const [type, col] of Object.entries(_ISO_COLORS)) {
    html += `<linearGradient id="isoG_${type}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0%" stop-color="${col.grad[0]}"/>` +
            `<stop offset="100%" stop-color="${col.grad[1]}"/>` +
            `</linearGradient>`;
  }

  // 센터 대리석 방사형 그라디언트
  html += `<radialGradient id="isoG_center" cx="50%" cy="40%" r="60%">` +
          `<stop offset="0%" stop-color="#fffbfd"/>` +
          `<stop offset="55%" stop-color="#f9eaf4"/>` +
          `<stop offset="100%" stop-color="#f0d8ec"/>` +
          `</radialGradient>`;

  // 플레이어 위치 글로우 필터
  html += `<filter id="isoGlow" x="-60%" y="-60%" width="220%" height="220%">` +
          `<feGaussianBlur stdDeviation="2.5" result="b"/>` +
          `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
          `</filter>`;

  html += '</defs>';
  return html;
}

// ─── 센터 대리석 다이아몬드 ──────────────────────────
function _isoCenterHTML() {
  const { OX, OY, HW, HH } = ISO_BOARD;
  // 내부 8×8 영역 경계 ([1,1]→[8,8] 격자 범위)
  // top    = [1,1].top   = (OX,        OY + 2*HH)
  // right  = [8,1].right = (OX + 8*HW, OY + 10*HH)
  // bottom = [8,8].bottom= (OX,        OY + 18*HH)
  // left   = [1,8].left  = (OX - 8*HW, OY + 10*HH)
  const top    = { x: OX,           y: OY + 2  * HH };
  const right  = { x: OX + 8 * HW,  y: OY + 10 * HH };
  const bottom = { x: OX,           y: OY + 18 * HH };
  const left   = { x: OX - 8 * HW,  y: OY + 10 * HH };
  return `<polygon points="${_pts([top, right, bottom, left])}" ` +
         `fill="url(#isoG_center)" stroke="#e8d0de" stroke-width="1"/>`;
}

// ─── 셀 <g> 요소 생성 ────────────────────────────────
function _isoCreateCellGroup(idx, c, r, state) {
  const { DEPTH } = ISO_BOARD;
  const isCorner  = _ISO_CORNERS.has(idx);
  const depth     = isCorner ? 14 : DEPTH;

  const vtx  = _isoVtx(c, r);
  const cell = BOARD_CELLS[idx];
  const info = (typeof getCellInfo === 'function') ? getCellInfo(idx) : cell;

  const colorType = cell.type;
  const col       = _ISO_COLORS[colorType] || _ISO_COLORS.shop;

  const ns = 'http://www.w3.org/2000/svg';
  const g  = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'iso-cell');
  g.setAttribute('data-idx', idx);

  // ① 서쪽 벽 (Left→Bottom 엣지, depth만큼 아래로 연장)
  const wp = document.createElementNS(ns, 'polygon');
  wp.setAttribute('class', 'iso-west');
  wp.setAttribute('points', _pts([
    vtx.left,
    vtx.bottom,
    { x: vtx.bottom.x, y: vtx.bottom.y + depth },
    { x: vtx.left.x,   y: vtx.left.y   + depth },
  ]));
  wp.setAttribute('fill', col.west);
  g.appendChild(wp);

  // ② 남쪽 벽 (Right→Bottom 엣지, depth만큼 아래로 연장)
  const sp = document.createElementNS(ns, 'polygon');
  sp.setAttribute('class', 'iso-south');
  sp.setAttribute('points', _pts([
    vtx.right,
    vtx.bottom,
    { x: vtx.bottom.x, y: vtx.bottom.y + depth },
    { x: vtx.right.x,  y: vtx.right.y  + depth },
  ]));
  sp.setAttribute('fill', col.south);
  g.appendChild(sp);

  // ③ 상단면 다이아몬드
  const tp = document.createElementNS(ns, 'polygon');
  tp.setAttribute('class', 'iso-top');
  tp.setAttribute('points', _pts([vtx.top, vtx.right, vtx.bottom, vtx.left]));
  tp.setAttribute('fill', `url(#isoG_${colorType})`);
  tp.setAttribute('stroke', isCorner ? '#d4a020' : '#e0b8c8');
  tp.setAttribute('stroke-width', isCorner ? '1.5' : '0.5');
  g.appendChild(tp);

  // ④ 이모지 (상단면 중심)
  const cx = (vtx.top.x + vtx.right.x + vtx.bottom.x + vtx.left.x) / 4;
  const cy = (vtx.top.y + vtx.right.y + vtx.bottom.y + vtx.left.y) / 4;
  const emojiEl = document.createElementNS(ns, 'text');
  emojiEl.setAttribute('class', 'iso-emoji');
  emojiEl.setAttribute('x', cx.toFixed(1));
  emojiEl.setAttribute('y', (cy + 4).toFixed(1));
  emojiEl.setAttribute('text-anchor', 'middle');
  emojiEl.setAttribute('dominant-baseline', 'middle');
  emojiEl.setAttribute('font-size', isCorner ? '13' : '10');
  emojiEl.setAttribute('pointer-events', 'none');
  emojiEl.textContent = info?.emoji ?? '⬜';
  g.appendChild(emojiEl);

  // ⑤ 소유자 점 (shop 셀 전용)
  if (cell.type === 'shop') {
    const ownerId = state?.shopOwners?.[cell.shopId];
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'iso-owner');
    dot.setAttribute('cx', (vtx.right.x - 4).toFixed(1));
    dot.setAttribute('cy', (vtx.right.y + 3).toFixed(1));
    dot.setAttribute('r', '3.5');
    dot.setAttribute('pointer-events', 'none');
    if (ownerId && typeof idolUxGetPlayerAccent === 'function') {
      dot.setAttribute('fill', idolUxGetPlayerAccent(ownerId));
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '0.8');
    } else {
      dot.setAttribute('fill', 'none');
      dot.setAttribute('stroke', 'none');
    }
    g.appendChild(dot);
  }

  return g;
}

// ─── 전체 보드 SVG 렌더 ──────────────────────────────
// container = #idolBoardViewport DOM 요소
// 게임 시작 시 1회, 이후 turn 전환 시 호출
function idolRenderIsoBoard(container, state) {
  const { SVG_W, SVG_H } = ISO_BOARD;
  const ns = 'http://www.w3.org/2000/svg';

  // 기존 SVG 제거
  const oldSvg = document.getElementById('idolIsoBoardSvg');
  if (oldSvg) oldSvg.remove();

  // SVG 루트 생성
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'idolIsoBoardSvg';
  svg.setAttribute('width',   SVG_W);
  svg.setAttribute('height',  SVG_H);
  svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
  svg.style.cssText = 'position:absolute;top:0;left:0;display:block;pointer-events:auto;overflow:visible';

  // defs
  svg.innerHTML = _isoDefsHTML();

  // 센터 다이아몬드 그룹 (가장 뒤)
  const gCenter = document.createElementNS(ns, 'g');
  gCenter.id = 'iso-center';
  gCenter.innerHTML = _isoCenterHTML();
  svg.appendChild(gCenter);

  // 셀 그룹 — 깊이 정렬: (c+r) 오름차순, 동일 시 c 내림차순
  const gCells = document.createElementNS(ns, 'g');
  gCells.id = 'iso-cells';

  const coordsList = idolGetCellGridCoords();
  const sorted = coordsList
    .map((cr, idx) => ({ idx, c: cr[0], r: cr[1] }))
    .sort((a, b) => {
      const da = a.c + a.r, db = b.c + b.r;
      return da !== db ? da - db : b.c - a.c;
    });

  sorted.forEach(({ idx, c, r }) => {
    gCells.appendChild(_isoCreateCellGroup(idx, c, r, state));
  });
  svg.appendChild(gCells);

  // 하이라이트 그룹 (플레이어 위치, 이동 스텝 오버레이 — 가장 앞)
  const gHL = document.createElementNS(ns, 'g');
  gHL.id = 'iso-highlights';
  svg.appendChild(gHL);

  // 토큰 레이어가 이미 있으면 그 앞에 SVG 삽입 (토큰이 SVG 위에 오도록)
  const tokenLayer = document.getElementById('idolTokenLayer');
  if (tokenLayer && tokenLayer.parentNode === container) {
    container.insertBefore(svg, tokenLayer);
  } else {
    container.insertBefore(svg, container.firstChild);
  }

  // 초기 하이라이트 적용
  if (state) idolIsoUpdateCellHighlights(state);
}

// ─── 하이라이트 부분 갱신 (매 턴 상태 변화 시 호출) ──
// 플레이어 위치 링 + 소유자 점 업데이트 (SVG 전체 재빌드 없이)
function idolIsoUpdateCellHighlights(state) {
  const gHL = document.getElementById('iso-highlights');
  if (!gHL) return;

  // 기존 player-here 링만 제거 (step-hl 은 유지)
  gHL.querySelectorAll('.iso-player-here').forEach(e => e.remove());

  if (!state) return;

  const ns          = 'http://www.w3.org/2000/svg';
  const coordsList  = idolGetCellGridCoords();

  // 플레이어 현재 위치 링
  state.players.filter(p => !p.bankrupt).forEach(p => {
    const [c, r] = coordsList[p.pos];
    const vtx = _isoVtx(c, r);
    const cx  = (vtx.top.x + vtx.right.x + vtx.bottom.x + vtx.left.x) / 4;
    const cy  = (vtx.top.y + vtx.right.y + vtx.bottom.y + vtx.left.y) / 4;

    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('class', 'iso-player-here');
    ring.setAttribute('cx', cx.toFixed(1));
    ring.setAttribute('cy', cy.toFixed(1));
    ring.setAttribute('r',  '9');
    ring.setAttribute('fill',         'none');
    ring.setAttribute('stroke',       typeof idolUxGetPlayerAccent === 'function'
                                        ? idolUxGetPlayerAccent(p.id) : '#ffffff');
    ring.setAttribute('stroke-width', '2');
    ring.setAttribute('opacity',      '0.75');
    ring.setAttribute('filter',       'url(#isoGlow)');
    gHL.appendChild(ring);
  });

  // 소유자 점 업데이트 (shop 셀)
  if (state.shopOwners) {
    document.querySelectorAll('#idolIsoBoardSvg .iso-cell').forEach(cellG => {
      const idx  = parseInt(cellG.getAttribute('data-idx'));
      const cell = BOARD_CELLS[idx];
      if (!cell || cell.type !== 'shop') return;

      const ownerId = state.shopOwners[cell.shopId];
      const dot     = cellG.querySelector('.iso-owner');
      if (!dot) return;

      if (ownerId && typeof idolUxGetPlayerAccent === 'function') {
        dot.setAttribute('fill',         idolUxGetPlayerAccent(ownerId));
        dot.setAttribute('stroke',       '#fff');
        dot.setAttribute('stroke-width', '0.8');
      } else {
        dot.setAttribute('fill',   'none');
        dot.setAttribute('stroke', 'none');
      }
    });
  }
}

// ─── 이동 스텝 하이라이트 (이동 중 현재 칸 강조) ────
// cellIdx = null 이면 제거
function _idolIsoSetStepHL(cellIdx) {
  const gHL = document.getElementById('iso-highlights');
  if (!gHL) return;

  // 기존 스텝 하이라이트 제거
  gHL.querySelector('.iso-step-hl')?.remove();
  if (cellIdx === null || cellIdx === undefined) return;

  const coordsList = idolGetCellGridCoords();
  const [c, r]     = coordsList[cellIdx];
  const vtx        = _isoVtx(c, r);
  const ns         = 'http://www.w3.org/2000/svg';

  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('class',        'iso-step-hl');
  poly.setAttribute('points',       _pts([vtx.top, vtx.right, vtx.bottom, vtx.left]));
  poly.setAttribute('fill',         'rgba(255, 220, 240, 0.38)');
  poly.setAttribute('stroke',       '#ff80c0');
  poly.setAttribute('stroke-width', '1.5');
  poly.setAttribute('pointer-events', 'none');
  gHL.appendChild(poly);
}

// ─── 셀 인덱스 → 보드 좌표 (idol.js 에서 사용) ──────
// (ISO 수학 기반, DOM 측정 없음)
function idolIsoGetCellCenter(cellIdx) {
  const coords = idolGetCellGridCoords();
  const [c, r] = coords[cellIdx];
  return {
    x: ISO_BOARD.OX + (c - r)     * ISO_BOARD.HW,
    y: ISO_BOARD.OY + (c + r + 1) * ISO_BOARD.HH,
  };
}

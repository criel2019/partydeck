// ===== 팟플 아이돌 — ISO 보드 렌더러 =====
// Monopoly GO 스타일 등각 3D 보드 (SVG 기반, 게임 로직 무관)

// ─── 상수 (기본값 — 실제 값은 렌더 시 래퍼 크기 기반으로 재계산) ───
const ISO_BOARD = {
  HW: 40, HH: 20, DEPTH: 14, DEPTH_C: 20,
  OX: 450, OY: 20, SVG_W: 900, SVG_H: 460,
};

// 래퍼 크기(px)를 받아 ISO_BOARD 상수를 in-place 재계산
// 보드 다이아몬드가 가용 공간을 꽉 채우도록 타일 크기 결정
function _isoCalcConstants(wW, wH) {
  // 다이아몬드: 너비=20*HW, 높이=10*HW + DEPTH_C (HH=HW/2)
  // SVG: 너비=22*HW (양쪽 1타일 여백), 높이=11.5*HW
  const maxHW = Math.min(
    Math.floor(wW / 22),
    Math.floor(wH / 11.5),
  );
  const HW = Math.max(28, maxHW); // 최소 28px
  const HH = Math.round(HW / 2);
  const DEPTH   = Math.round(HW * 0.35);
  const DEPTH_C = Math.round(HW * 0.50);
  const SVG_W   = HW * 22;
  const SVG_H   = Math.ceil(HH * 22 + DEPTH_C);
  const OX      = Math.round(SVG_W / 2);
  const OY      = HH;

  Object.assign(ISO_BOARD, { HW, HH, DEPTH, DEPTH_C, OX, OY, SVG_W, SVG_H });
}

// ─── 셀 타입 색상 팔레트 ─────────────────────────────
// grad[0]=상단 밝은 색, grad[1]=상단 어두운 색, south=남쪽 벽, west=서쪽 벽, glowClr=아이콘 후광색
const _ISO_COLORS = {
  shop:   { grad: ['#ffd4ea', '#f490bc'], south: '#c8508c', west: '#a83070', glowClr: '#f080b8' },
  event:  { grad: ['#ffe8cc', '#ffb46a'], south: '#d47028', west: '#b05008', glowClr: '#ff9a40' },
  gacha:  { grad: ['#eedcff', '#cc8af8'], south: '#8c3cc8', west: '#6c1ca8', glowClr: '#b060ee' },
  chance: { grad: ['#d4f8ee', '#7cdcc0'], south: '#28a880', west: '#109068', glowClr: '#50d4a8' },
  tax:    { grad: ['#fffcd4', '#ffd840'], south: '#c09010', west: '#9c7000', glowClr: '#d8b020' },
  start:  { grad: ['#fffff0', '#f8f040'], south: '#b0b000', west: '#909000', glowClr: '#f0e820' },
  police: { grad: ['#d4eaff', '#88b4f8'], south: '#2858c8', west: '#1040a8', glowClr: '#5090f0' },
  free:   { grad: ['#d4ffd8', '#78eaa8'], south: '#24a848', west: '#008028', glowClr: '#50d870' },
  stage:  { grad: ['#fff8d4', '#ffd040'], south: '#c88018', west: '#a06000', glowClr: '#e8a020' },
};

// 코너 셀 인덱스 집합 (특수 시각 처리 — 더 두꺼운 depth, 금색 테두리)
const _ISO_CORNERS = new Set([0, 9, 18, 27]);

// ─── 아이콘 이미지 경로 매핑 ──────────────────────────
const _ISO_ICONS = {
  start:       'img/games/idol/icon-start.png',
  event:       'img/games/idol/icon-event.png',
  gacha:       'img/games/idol/icon-gacha.png',
  chance:      'img/games/idol/icon-chance.png',
  tax:         'img/games/idol/icon-tax.png',
  police:      'img/games/idol/icon-police.png',
  free:        'img/games/idol/icon-free.png',
  stage:       'img/games/idol/icon-stage.png',
  shop_music:  'img/games/idol/icon-shop-music.png',
  shop_media:  'img/games/idol/icon-shop-film.png',
  shop_beauty: 'img/games/idol/icon-shop-beauty.png',
  shop_event:  'img/games/idol/icon-shop-fashion.png',
};

// 셀 인덱스 + 셀 데이터 → 아이콘 경로 반환
function _isoGetIconPath(idx, cell) {
  if (cell.type === 'shop') {
    const shop = (typeof SHOPS !== 'undefined') ? SHOPS.find(s => s.id === cell.shopId) : null;
    return shop ? (_ISO_ICONS[`shop_${shop.cat}`] || null) : null;
  }
  return _ISO_ICONS[cell.type] || null;
}

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

  // 타입별 아이콘 후광 방사형 그라디언트 (컬러드 글로우)
  for (const [type, col] of Object.entries(_ISO_COLORS)) {
    html += `<radialGradient id="isoIconGlow_${type}" cx="50%" cy="45%" r="55%">` +
            `<stop offset="0%"   stop-color="${col.glowClr}" stop-opacity="0.85"/>` +
            `<stop offset="35%"  stop-color="${col.glowClr}" stop-opacity="0.55"/>` +
            `<stop offset="70%"  stop-color="${col.glowClr}" stop-opacity="0.20"/>` +
            `<stop offset="100%" stop-color="${col.glowClr}" stop-opacity="0"/>` +
            `</radialGradient>`;
  }

  // 센터 스테이지 바닥 방사형 그라디언트 (무대 조명 느낌)
  html += `<radialGradient id="isoG_center" cx="50%" cy="38%" r="62%">` +
          `<stop offset="0%"   stop-color="#ffffff" stop-opacity="1"/>` +
          `<stop offset="35%"  stop-color="#fef8ff" stop-opacity="1"/>` +
          `<stop offset="70%"  stop-color="#f8e8f8" stop-opacity="1"/>` +
          `<stop offset="100%" stop-color="#ecd4e8" stop-opacity="1"/>` +
          `</radialGradient>`;

  // 센터 스포트라이트 오버레이 그라디언트
  html += `<radialGradient id="isoSpotlight" cx="50%" cy="30%" r="55%">` +
          `<stop offset="0%"   stop-color="#fff8d8" stop-opacity="0.75"/>` +
          `<stop offset="45%"  stop-color="#ffe8c0" stop-opacity="0.30"/>` +
          `<stop offset="100%" stop-color="#ffd0d8" stop-opacity="0"/>` +
          `</radialGradient>`;

  // 플레이어 위치 글로우 필터
  html += `<filter id="isoGlow" x="-60%" y="-60%" width="220%" height="220%">` +
          `<feGaussianBlur stdDeviation="2.5" result="b"/>` +
          `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
          `</filter>`;

  // 이동 스텝 하이라이트 글로우 필터 (강한 흰색 블룸)
  html += `<filter id="isoStepGlow" x="-120%" y="-120%" width="340%" height="340%">` +
          `<feGaussianBlur stdDeviation="5" result="blur"/>` +
          `<feColorMatrix in="blur" type="matrix"` +
          ` values="1 0 0 0 0.4  0 1 0 0 0.4  0 0 1 0 0.1  0 0 0 1.2 0" result="colorized"/>` +
          `<feMerge><feMergeNode in="colorized"/><feMergeNode in="SourceGraphic"/></feMerge>` +
          `</filter>`;

  // 아이콘 원형 클립 (objectBoundingBox → 재사용 가능한 단일 정의)
  html += `<clipPath id="isoIconClip" clipPathUnits="objectBoundingBox">` +
          `<circle cx="0.5" cy="0.5" r="0.5"/>` +
          `</clipPath>`;

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
  const cx = OX;
  const cy = OY + 10 * HH;
  let html = '';

  // ① 바닥 면 (대리석 그라디언트)
  html += `<polygon points="${_pts([top, right, bottom, left])}" ` +
          `fill="url(#isoG_center)" stroke="#e0c8d8" stroke-width="1.5"/>`;

  // ② ISO 원근 바닥 격자선 (무대 타일 느낌, 4×4 분할)
  const nGrid = 5;
  const gridClr = 'rgba(180, 130, 160, 0.22)';
  for (let i = 1; i < nGrid; i++) {
    const t = i / nGrid;
    // top→right 에서 left→bottom 방향
    const p1x = top.x  + (right.x - top.x)  * t;
    const p1y = top.y  + (right.y - top.y)  * t;
    const p2x = left.x + (bottom.x - left.x) * t;
    const p2y = left.y + (bottom.y - left.y) * t;
    html += `<line x1="${p1x.toFixed(1)}" y1="${p1y.toFixed(1)}" ` +
            `x2="${p2x.toFixed(1)}" y2="${p2y.toFixed(1)}" ` +
            `stroke="${gridClr}" stroke-width="0.8" pointer-events="none"/>`;
    // top→left 에서 right→bottom 방향
    const p3x = top.x   + (left.x  - top.x)  * t;
    const p3y = top.y   + (left.y  - top.y)  * t;
    const p4x = right.x + (bottom.x - right.x) * t;
    const p4y = right.y + (bottom.y - right.y) * t;
    html += `<line x1="${p3x.toFixed(1)}" y1="${p3y.toFixed(1)}" ` +
            `x2="${p4x.toFixed(1)}" y2="${p4y.toFixed(1)}" ` +
            `stroke="${gridClr}" stroke-width="0.8" pointer-events="none"/>`;
  }

  // ③ 스포트라이트 오버레이 (상단에서 내리비치는 따뜻한 빛)
  html += `<polygon points="${_pts([top, right, bottom, left])}" ` +
          `fill="url(#isoSpotlight)" pointer-events="none"/>`;

  // ④ 중앙 시머 타원 (바닥 반사 하이라이트)
  html += `<ellipse cx="${cx.toFixed(1)}" cy="${(cy - HH).toFixed(1)}" ` +
          `rx="${(HW * 2.5).toFixed(1)}" ry="${(HH * 1.4).toFixed(1)}" ` +
          `fill="rgba(255,250,240,0.22)" pointer-events="none" class="iso-center-shimmer"/>`;

  // ⑤ 안쪽 테두리 글로우 (타일↔센터 경계 림 라이트)
  html += `<polygon points="${_pts([top, right, bottom, left])}" ` +
          `fill="none" stroke="rgba(255,180,210,0.55)" stroke-width="2.5" pointer-events="none"/>`;

  return html;
}

// ─── 셀 <g> 요소 생성 ────────────────────────────────
function _isoCreateCellGroup(idx, c, r, state) {
  const { DEPTH, DEPTH_C, HW, HH } = ISO_BOARD;
  const isCorner  = _ISO_CORNERS.has(idx);
  const depth     = isCorner ? DEPTH_C : DEPTH;

  const vtx  = _isoVtx(c, r);
  const cell = BOARD_CELLS[idx];
  const info = (typeof getCellInfo === 'function') ? getCellInfo(idx) : cell;

  const colorType = cell.type;
  const col       = _ISO_COLORS[colorType] || _ISO_COLORS.shop;

  const ns = 'http://www.w3.org/2000/svg';
  const g  = document.createElementNS(ns, 'g');
  g.setAttribute('class', isCorner ? 'iso-cell iso-corner-cell' : 'iso-cell');
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

  // ④ 아이콘 이미지 (상단면 중심, 원형 클립)
  const cx = (vtx.top.x + vtx.right.x + vtx.bottom.x + vtx.left.x) / 4;
  const cy = (vtx.top.y + vtx.right.y + vtx.bottom.y + vtx.left.y) / 4;
  const iconPath = _isoGetIconPath(idx, cell);
  const iconSize = isCorner ? Math.round(HW * 2.2) : Math.round(HW * 1.8);
  const halfIcon = iconSize / 2;
  if (iconPath) {
    // ④-a 아이콘 후광 원 (아이콘 뒤에서 빛나는 컬러드 오브)
    const orbDur = (2.6 + (idx % 6) * 0.32).toFixed(1);
    const orbDel = `-${((idx * 0.19) % parseFloat(orbDur)).toFixed(2)}s`;
    const glowCirc = document.createElementNS(ns, 'circle');
    glowCirc.setAttribute('class', 'iso-icon-glow');
    glowCirc.setAttribute('cx', cx.toFixed(1));
    glowCirc.setAttribute('cy', (cy + 1).toFixed(1));
    glowCirc.setAttribute('r', (iconSize * 0.40).toFixed(1));
    glowCirc.setAttribute('fill', `url(#isoIconGlow_${colorType})`);
    glowCirc.setAttribute('pointer-events', 'none');
    glowCirc.style.animation = `isoGlowOrb ${orbDur}s ease-in-out infinite ${orbDel}`;
    g.appendChild(glowCirc);

    // ④-b 아이콘 이미지
    const imgEl = document.createElementNS(ns, 'image');
    imgEl.setAttribute('class', 'iso-icon');
    imgEl.setAttribute('href', iconPath);
    imgEl.setAttribute('x', (cx - halfIcon).toFixed(1));
    imgEl.setAttribute('y', (cy - halfIcon).toFixed(1));
    imgEl.setAttribute('width', iconSize);
    imgEl.setAttribute('height', iconSize);
    imgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    imgEl.setAttribute('pointer-events', 'none');
    // 셀마다 다른 타이밍으로 둥실 + 글로우 애니메이션
    const floatDur = (2.4 + (idx % 4) * 0.3).toFixed(1);
    const floatDel = `-${((idx * 0.17) % floatDur).toFixed(2)}s`;
    const glowDel  = `-${((idx * 0.31) % 4.5).toFixed(2)}s`;
    imgEl.style.animation =
      `isoIconFloat ${floatDur}s ease-in-out infinite ${floatDel},` +
      `isoIconGlow 4.5s ease-in-out infinite ${glowDel}`;
    g.appendChild(imgEl);
  }

  // ④-c 타일 이름 레이블 (타일 면 내부 하단 — 넘침 없음)
  {
    // 2글자 약칭 테이블 (타일 면 너비에 맞게 짧게)
    const _ABBR = {
      start: '출발', event: '이벤', gacha: '가챠', chance: '찬스',
      tax: '세금', police: '경찰', free: '주차', stage: '무대',
    };
    const _CAT_ABBR = { music: '음악', media: '미디', beauty: '뷰티', event: '행사' };

    let label = '';
    if (cell.type === 'shop') {
      const shop = (typeof SHOPS !== 'undefined') ? SHOPS.find(s => s.id === cell.shopId) : null;
      label = shop ? (_CAT_ABBR[shop.cat] || '') : '';
    } else {
      label = _ABBR[cell.type] || '';
    }

    if (label) {
      // 타일 면 하단 1/4 지점 — 타일 면 내부에 머물도록
      const lFz = isCorner ? Math.round(HW * 0.38) : Math.round(HW * 0.30);
      const lx  = cx;
      const ly  = cy + HH * 0.72;   // vtx.bottom보다 위, 타일 면 안쪽

      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('class', 'iso-tile-label');
      lbl.setAttribute('x', lx.toFixed(1));
      lbl.setAttribute('y', ly.toFixed(1));
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('dominant-baseline', 'middle');
      lbl.setAttribute('font-size', lFz + 'px');
      lbl.setAttribute('font-weight', 'bold');
      lbl.setAttribute('font-family', "'Black Han Sans','Noto Sans KR',sans-serif");
      lbl.setAttribute('fill', '#ffffff');
      lbl.setAttribute('stroke', 'rgba(0,0,0,0.75)');
      lbl.setAttribute('stroke-width', '1.2');
      lbl.setAttribute('paint-order', 'stroke fill');
      lbl.setAttribute('pointer-events', 'none');
      lbl.textContent = label;
      g.appendChild(lbl);
    }
  }

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

  // ⑥ 호버 오버레이 (마우스 인터랙션 영역 + hover 브라이트닝용)
  const hoverEl = document.createElementNS(ns, 'polygon');
  hoverEl.setAttribute('class', 'iso-hover-overlay');
  hoverEl.setAttribute('points', _pts([vtx.top, vtx.right, vtx.bottom, vtx.left]));
  hoverEl.setAttribute('fill', 'transparent');
  hoverEl.setAttribute('pointer-events', 'all');
  g.appendChild(hoverEl);

  return g;
}

// ─── 전체 보드 SVG 렌더 ──────────────────────────────
// container = #idolBoardViewport DOM 요소
// 게임 시작 시 1회, 이후 turn 전환 시 호출
function idolRenderIsoBoard(container, state) {
  // 래퍼 크기 기반 상수 재계산 (레이아웃이 완료된 경우에만)
  const wrapper = document.getElementById('idolBoardWrapper');
  if (wrapper && wrapper.offsetWidth > 0) {
    _isoCalcConstants(wrapper.offsetWidth, wrapper.offsetHeight);
  }

  const { SVG_W, SVG_H } = ISO_BOARD;

  // 뷰포트·토큰 레이어 크기 JS로 지정 (CSS !important 오버라이드)
  container.style.width  = SVG_W + 'px';
  container.style.height = SVG_H + 'px';
  const _tl = document.getElementById('idolTokenLayer');
  if (_tl) { _tl.style.width = SVG_W + 'px'; _tl.style.height = SVG_H + 'px'; }

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

  // ─── 보드 외곽 림 라이트 (보드 경계를 빛나는 선으로 강조) ───
  const { OX, OY, HW, HH, DEPTH_C } = ISO_BOARD;
  const outerTop    = { x: OX,              y: OY };
  const outerRight  = { x: OX + 10 * HW,    y: OY + 10 * HH };
  const outerBottom = { x: OX,              y: OY + 20 * HH + DEPTH_C };
  const outerLeft   = { x: OX - 10 * HW,    y: OY + 10 * HH };
  const gRim = document.createElementNS(ns, 'g');
  gRim.id = 'iso-rim';
  const rimPoly = document.createElementNS(ns, 'polygon');
  rimPoly.setAttribute('points', _pts([outerTop, outerRight, outerBottom, outerLeft]));
  rimPoly.setAttribute('fill',         'none');
  rimPoly.setAttribute('stroke',       'rgba(255,180,230,0.70)');
  rimPoly.setAttribute('stroke-width', '2');
  rimPoly.setAttribute('pointer-events', 'none');
  rimPoly.setAttribute('filter', 'url(#isoGlow)');
  rimPoly.setAttribute('class', 'iso-rim-line');
  gRim.appendChild(rimPoly);
  // 외곽 림 두번째 레이어 (퍼짐)
  const rimPoly2 = document.createElementNS(ns, 'polygon');
  rimPoly2.setAttribute('points', _pts([outerTop, outerRight, outerBottom, outerLeft]));
  rimPoly2.setAttribute('fill',         'none');
  rimPoly2.setAttribute('stroke',       'rgba(200,140,255,0.45)');
  rimPoly2.setAttribute('stroke-width', '5');
  rimPoly2.setAttribute('pointer-events', 'none');
  rimPoly2.setAttribute('filter', 'url(#isoGlow)');
  gRim.appendChild(rimPoly2);
  svg.insertBefore(gRim, gCells);

  // ─── 스파클 파티클 (타일 위 반짝이는 별 점들) ───────
  const gSparkle = document.createElementNS(ns, 'g');
  gSparkle.id = 'iso-sparkles';
  const sparkCoords = idolGetCellGridCoords();
  const sparkColors = ['#ffffff', '#ffe8c0', '#ffc8e8', '#c8e8ff', '#e8c8ff'];
  sparkCoords.forEach(([sc, sr], tileIdx) => {
    const vtx = _isoVtx(sc, sr);
    // 타일당 1~2개 스파클
    const positions = [
      { x: vtx.top.x   + ((tileIdx % 5) - 2) * 2.5, y: vtx.top.y   - 4 },
      ...(tileIdx % 2 === 0 ? [
        { x: vtx.right.x + 2, y: vtx.right.y - 2 },
      ] : []),
    ];
    positions.forEach((pos, pi) => {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pos.x.toFixed(1));
      dot.setAttribute('cy', pos.y.toFixed(1));
      dot.setAttribute('r',  (0.8 + (tileIdx % 3) * 0.45).toFixed(1));
      dot.setAttribute('fill', sparkColors[(tileIdx + pi) % sparkColors.length]);
      dot.setAttribute('pointer-events', 'none');
      const dur = (1.3 + (tileIdx * 0.17 + pi * 0.6) % 2.4).toFixed(1);
      const del = `-${((tileIdx * 0.31 + pi * 0.9) % parseFloat(dur)).toFixed(2)}s`;
      dot.style.animation = `isoSparkle ${dur}s ease-in-out infinite ${del}`;
      gSparkle.appendChild(dot);
    });
  });
  svg.appendChild(gSparkle);

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

  // 센터 패널 위치 동적 업데이트 (SVG 크기에 맞춰 정렬)
  _idolUpdateCenterPanelPos();

  // 초기 하이라이트 적용
  if (state) idolIsoUpdateCellHighlights(state);
}

// ─── 센터 패널 DOM 위치·크기를 ISO_BOARD 기준으로 동적 설정 ──
// 센터 다이아몬드 경계: left=HW*3, top=HH*3, w=HW*16, h=HH*16
function _idolUpdateCenterPanelPos() {
  const { HW, HH } = ISO_BOARD;
  const L = HW * 3, T = HH * 3, W = HW * 16, H = HH * 16;
  ['idolCenterPanel', 'idolCenterOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left   = L + 'px';
    el.style.top    = T + 'px';
    el.style.width  = W + 'px';
    el.style.height = H + 'px';
    el.style.setProperty('--iso-hw', HW + 'px');
    el.style.setProperty('--iso-hh', HH + 'px');
  });
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
  gHL.querySelectorAll('.iso-step-hl').forEach(e => e.remove());

  // 기존 셀 활성화 제거
  document.querySelectorAll('#iso-cells .iso-cell-active')
    .forEach(e => e.classList.remove('iso-cell-active'));

  if (cellIdx === null || cellIdx === undefined) return;

  const coordsList = idolGetCellGridCoords();
  const [c, r]     = coordsList[cellIdx];
  const vtx        = _isoVtx(c, r);
  const ns         = 'http://www.w3.org/2000/svg';

  // 상단면 밝은 오버레이 (황금빛 채움)
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('class',          'iso-step-hl');
  poly.setAttribute('points',         _pts([vtx.top, vtx.right, vtx.bottom, vtx.left]));
  poly.setAttribute('fill',           'rgba(255, 245, 140, 0.65)');
  poly.setAttribute('stroke',         '#fff0a0');
  poly.setAttribute('stroke-width',   '2.5');
  poly.setAttribute('pointer-events', 'none');
  poly.setAttribute('filter',         'url(#isoStepGlow)');
  gHL.appendChild(poly);

  // 중심 스파크 원 (집중 광원)
  const icx = (vtx.top.x + vtx.right.x + vtx.bottom.x + vtx.left.x) / 4;
  const icy = (vtx.top.y + vtx.right.y + vtx.bottom.y + vtx.left.y) / 4;
  const spark = document.createElementNS(ns, 'circle');
  spark.setAttribute('class',          'iso-step-hl');
  spark.setAttribute('cx',             icx.toFixed(1));
  spark.setAttribute('cy',             icy.toFixed(1));
  spark.setAttribute('r',              (ISO_BOARD.HW * 0.55).toFixed(1));
  spark.setAttribute('fill',           'rgba(255, 255, 220, 0.80)');
  spark.setAttribute('pointer-events', 'none');
  spark.setAttribute('filter',         'url(#isoStepGlow)');
  gHL.appendChild(spark);

  // 해당 셀 그룹에 'iso-cell-active' 클래스 (CSS 리프트 애니메이션)
  const cellGroup = document.querySelector(`#iso-cells .iso-cell[data-idx="${cellIdx}"]`);
  if (cellGroup) {
    void cellGroup.offsetWidth; // reflow → 애니메이션 재시작
    cellGroup.classList.add('iso-cell-active');
  }
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

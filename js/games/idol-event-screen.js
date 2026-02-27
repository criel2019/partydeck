// ===== 아이돌 이벤트 스크린 — 전광판 오버레이 =====
// 이벤트 트리거 시 전광판 다이아몬드 스크린으로 스프라이트 재생
(function () {
  // ─── 스프라이트 메타 ──────────────────────────────
  const FRAME_W  = 208;   // 스프라이트 시트 내 1프레임 너비
  const FRAME_H  = 376;   // 스프라이트 시트 내 1프레임 높이
  const COLS     = 8;     // 시트 열 수
  const TOTAL    = 73;    // 전체 프레임 수
  const FPS      = 12;    // 재생 fps
  const MS_FRAME = 1000 / FPS;

  let _overlay = null, _canvas = null, _ctx = null;
  let _img = null, _frame = 0, _lastT = 0, _raf = null;
  let _imgCache = {};     // 스프라이트 URL → Image 캐시

  // ─── DOM 초기화 (1회) ───────────────────────────
  function _init() {
    if (document.getElementById('idolEventOverlay')) return;

    _overlay = document.createElement('div');
    _overlay.id = 'idolEventOverlay';

    // 외부 어둠 막
    const backdrop = document.createElement('div');
    backdrop.className = 'ies-backdrop';

    // 다이아몬드 컨테이너 (45° 회전)
    const diamond = document.createElement('div');
    diamond.className = 'ies-diamond';

    // 스프라이트 캔버스
    _canvas = document.createElement('canvas');
    _canvas.id = 'idolEventCanvas';
    diamond.appendChild(_canvas);

    // LED 도트 오버레이
    const led = document.createElement('div');
    led.className = 'ies-led';
    diamond.appendChild(led);

    // 반짝이는 테두리 빛
    const glow = document.createElement('div');
    glow.className = 'ies-glow';
    diamond.appendChild(glow);

    _overlay.appendChild(backdrop);
    _overlay.appendChild(diamond);
    document.body.appendChild(_overlay);

    // 클릭으로 닫기
    _overlay.addEventListener('click', idolEventScreenHide);

    // 컨텍스트
    _ctx = _canvas.getContext('2d');
  }

  // ─── 스프라이트 사이즈 계산 (화면 크기 기반) ─────
  function _calcSize() {
    // 화면이 작으면 축소 (보드 중앙 위에 딱 맞도록)
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 다이아몬드 외접 정사각형 = (W+H)/√2
    // 목표: 화면의 70% 이하에 들어오도록
    const maxBox = Math.min(vw, vh) * 0.70;
    // (W+H)/√2 = maxBox → W+H = maxBox * √2
    // 비율 유지: W:H = 208:376 → W = k*208, H = k*376
    // k * (208+376) / √2 = maxBox → k = maxBox * √2 / 584
    const k = (maxBox * Math.SQRT2) / 584;
    const W = Math.round(208 * k);
    const H = Math.round(376 * k);
    return { W, H };
  }

  // ─── 이미지 로드 (캐시) ────────────────────────
  function _loadImg(src) {
    if (_imgCache[src]) return Promise.resolve(_imgCache[src]);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { _imgCache[src] = img; resolve(img); };
      img.src = src;
    });
  }

  // ─── 애니메이션 루프 ───────────────────────────
  function _tick(ts) {
    if (ts - _lastT < MS_FRAME) { _raf = requestAnimationFrame(_tick); return; }
    _lastT = ts;

    const col = _frame % COLS;
    const row = Math.floor(_frame / COLS);
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.drawImage(_img,
      col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H,
      0, 0, _canvas.width, _canvas.height
    );
    _frame = (_frame + 1) % TOTAL;
    _raf = requestAnimationFrame(_tick);
  }

  // ─── 공개 API ──────────────────────────────────
  window.idolEventScreenShow = async function (spriteSrc) {
    _init();
    const { W, H } = _calcSize();

    // 캔버스·컨테이너 크기 적용
    _canvas.width  = W;
    _canvas.height = H;
    const diamond = _overlay.querySelector('.ies-diamond');
    diamond.style.width  = W + 'px';
    diamond.style.height = H + 'px';

    // 스프라이트 로드
    _img = await _loadImg(spriteSrc || 'img/games/idol/sol-sprite.jpg');

    // 표시
    _overlay.classList.add('ies-visible');
    _frame = 0;
    _lastT = 0;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_tick);
  };

  window.idolEventScreenHide = function () {
    if (_overlay) _overlay.classList.remove('ies-visible');
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  };

  // DOMContentLoaded 후 미리 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();

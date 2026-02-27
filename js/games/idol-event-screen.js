// ===== 아이돌 이벤트 스크린 — 전광판 오버레이 =====
// 보드 센터 다이아몬드 위에 45° 회전 스프라이트 플레이어
(function () {
  const FRAME_W  = 208;
  const FRAME_H  = 376;
  const COLS     = 8;
  const TOTAL    = 73;
  const FPS      = 12;
  const MS_FRAME = 1000 / FPS;

  let _el = null, _canvas = null, _ctx = null;
  let _img = null, _frame = 0, _lastT = 0, _raf = null;
  let _imgCache = {};

  // ─── DOM 생성 (보드 뷰포트 안에 absolute) ────────
  function _build() {
    if (document.getElementById('idolEventScreen')) return;

    // 컨테이너 — 45° 회전하면 다이아몬드 모양이 됨
    _el = document.createElement('div');
    _el.id = 'idolEventScreen';

    _canvas = document.createElement('canvas');
    _canvas.id = 'idolEventCanvas';
    _el.appendChild(_canvas);

    // LED 도트 텍스처 오버레이
    const led = document.createElement('div');
    led.className = 'ies-led';
    _el.appendChild(led);

    _ctx = _canvas.getContext('2d');
  }

  // ─── 보드 중앙 좌표로 위치 갱신 ─────────────────
  function _positionOnBoard() {
    const vp = document.getElementById('idolBoardViewport');
    if (!vp) return false;

    // 아직 _el이 없으면 빌드
    _build();

    // 뷰포트 안에 삽입 (없으면)
    if (!vp.contains(_el)) vp.appendChild(_el);

    // ISO_BOARD 상수 참조 (idol-board-iso.js 전역)
    const { OX, OY, HW, HH } = (typeof ISO_BOARD !== 'undefined')
      ? ISO_BOARD
      : { OX: 440, OY: 20, HW: 40, HH: 20 };

    // 보드 센터 중심점
    const cx = OX;
    const cy = OY + 10 * HH;

    // 컨테이너 크기: 세로 = 다이아몬드 수직 대각선, 가로 = 영상 비율 유지
    const cH = Math.round(8 * HW);          // 다이아몬드 수직 대각선 크기
    const cW = Math.round(cH * (FRAME_W / FRAME_H)); // 영상 비율 유지

    // 캔버스
    _canvas.width  = cW;
    _canvas.height = cH;

    // 컨테이너 위치: 중심점에서 반반 빼기 (회전 기준점 = 50% 50%)
    _el.style.width  = cW + 'px';
    _el.style.height = cH + 'px';
    _el.style.left   = (cx - cW / 2) + 'px';
    _el.style.top    = (cy - cH / 2) + 'px';

    return true;
  }

  // ─── 스프라이트 로드 ────────────────────────────
  function _loadImg(src) {
    if (_imgCache[src]) return Promise.resolve(_imgCache[src]);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { _imgCache[src] = img; resolve(img); };
      img.src = src;
    });
  }

  // ─── 프레임 루프 ────────────────────────────────
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

  // ─── 공개 API ───────────────────────────────────
  window.idolEventScreenShow = async function (spriteSrc) {
    if (!_positionOnBoard()) return;
    _img = await _loadImg(spriteSrc || 'img/games/idol/sol-sprite.jpg');
    _el.classList.add('ies-on');
    _frame = 0; _lastT = 0;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_tick);
  };

  window.idolEventScreenHide = function () {
    if (_el) _el.classList.remove('ies-on');
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  };
})();

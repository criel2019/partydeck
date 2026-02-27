// ===== 아이돌 이벤트 스크린 — 전광판 오버레이 =====
// 보드 센터 다이아몬드와 정확히 맞도록 정사각형 컨테이너 + ISO 변형
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

  function _build() {
    if (document.getElementById('idolEventScreen')) return;

    _el = document.createElement('div');
    _el.id = 'idolEventScreen';

    _canvas = document.createElement('canvas');
    _canvas.id = 'idolEventCanvas';
    _el.appendChild(_canvas);

    const led = document.createElement('div');
    led.className = 'ies-led';
    _el.appendChild(led);

    _ctx = _canvas.getContext('2d');
  }

  function _positionOnBoard() {
    const vp = document.getElementById('idolBoardViewport');
    if (!vp) return false;

    _build();
    if (!vp.contains(_el)) vp.appendChild(_el);

    const { OX, OY, HW, HH } = (typeof ISO_BOARD !== 'undefined')
      ? ISO_BOARD
      : { OX: 440, OY: 20, HW: 40, HH: 20 };

    // 보드 센터 중심점
    const cx = OX;
    const cy = OY + 10 * HH;

    // 정사각형 크기: scale(1,0.5)rotate(-45deg) 변형 후
    // 수평 대각선 = S√2 = 16*HW → S = 16*HW/√2
    const S = Math.round(16 * HW / Math.SQRT2);

    _canvas.width  = S;
    _canvas.height = S;

    _el.style.width  = S + 'px';
    _el.style.height = S + 'px';
    _el.style.left   = (cx - S / 2) + 'px';
    _el.style.top    = (cy - S / 2) + 'px';

    return true;
  }

  function _loadImg(src) {
    if (_imgCache[src]) return Promise.resolve(_imgCache[src]);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { _imgCache[src] = img; resolve(img); };
      img.src = src;
    });
  }

  function _tick(ts) {
    if (ts - _lastT < MS_FRAME) { _raf = requestAnimationFrame(_tick); return; }
    _lastT = ts;

    const col   = _frame % COLS;
    const row   = Math.floor(_frame / COLS);
    const S     = _canvas.width;

    // 세로 영상 → 정사각 캔버스: 중앙 정사각형 크롭 (object-fit:cover 효과)
    const cropY = Math.floor((FRAME_H - FRAME_W) / 2); // 위아래 잘라 정사각형으로
    _ctx.clearRect(0, 0, S, S);
    _ctx.drawImage(
      _img,
      col * FRAME_W,               // sx
      row * FRAME_H + cropY,       // sy (중앙 크롭)
      FRAME_W, FRAME_W,            // sw, sh (정사각형)
      0, 0, S, S                   // dx, dy, dw, dh
    );

    _frame = (_frame + 1) % TOTAL;
    _raf = requestAnimationFrame(_tick);
  }

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

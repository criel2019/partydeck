// ===== Idol event billboard module =====
(function () {
  const FRAME_W = 208;
  const FRAME_H = 376;
  const COLS = 8;
  const TOTAL = 73;
  const FPS = 12;
  const MS_FRAME = 1000 / FPS;

  const TRAIN_HOLD_MS = 500;

  let _el = null;
  let _canvas = null;
  let _ctx = null;
  let _video = null;
  let _trainOverlay = null;

  let _img = null;
  let _frame = 0;
  let _lastT = 0;
  let _raf = null;
  const _imgCache = {};

  let _videoModeToken = 0;
  let _videoListeners = null;

  function _clampNumber(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function _applyVideoFrame(frameOpts) {
    if (!_video) return;
    const frame = frameOpts && typeof frameOpts === 'object' ? frameOpts : {};

    const fit = frame.fit === 'cover' ? 'cover' : 'contain';
    const x = _clampNumber(frame.x, 0, 100, 50);
    const y = _clampNumber(frame.y, 0, 100, 50);
    const scale = _clampNumber(frame.scale, 0.7, 1.8, 1);

    _video.style.objectFit = fit;
    _video.style.objectPosition = `${x}% ${y}%`;
    _video.style.transform = `scale(${scale})`;
    _video.style.transformOrigin = 'center center';
  }

  function _build() {
    _el = document.getElementById('idolEventScreen');

    if (!_el) {
      _el = document.createElement('div');
      _el.id = 'idolEventScreen';
    }

    _canvas = _el.querySelector('#idolEventCanvas');
    if (!_canvas) {
      _canvas = document.createElement('canvas');
      _canvas.id = 'idolEventCanvas';
      _el.appendChild(_canvas);
    }

    _video = _el.querySelector('#idolEventVideo');
    if (!_video) {
      _video = document.createElement('video');
      _video.id = 'idolEventVideo';
      _video.muted = true;
      _video.playsInline = true;
      _video.preload = 'auto';
      _video.setAttribute('aria-hidden', 'true');
      _el.appendChild(_video);
    }

    _trainOverlay = _el.querySelector('.ies-train-overlay');
    if (!_trainOverlay) {
      _trainOverlay = document.createElement('div');
      _trainOverlay.className = 'ies-train-overlay';
      _el.appendChild(_trainOverlay);
    }

    let led = _el.querySelector('.ies-led');
    if (!led) {
      led = document.createElement('div');
      led.className = 'ies-led';
      _el.appendChild(led);
    }

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

    const cx = OX;
    const cy = OY + 10 * HH;
    const S = Math.round(16 * HW / Math.SQRT2);

    _canvas.width = S;
    _canvas.height = S;

    _el.style.width = S + 'px';
    _el.style.height = S + 'px';
    _el.style.left = (cx - S / 2) + 'px';
    _el.style.top = (cy - S / 2) + 'px';

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

  function _stopSpritePlayback() {
    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = null;
    }
  }

  function _detachVideoListeners() {
    if (!_video || !_videoListeners) return;
    if (_videoListeners.onTimeUpdate) {
      _video.removeEventListener('timeupdate', _videoListeners.onTimeUpdate);
    }
    _video.removeEventListener('ended', _videoListeners.onEnded);
    _video.removeEventListener('error', _videoListeners.onError);
    _videoListeners = null;
  }

  function _cancelVideoPlayback() {
    _videoModeToken += 1;
    _detachVideoListeners();
    if (_video) {
      try { _video.pause(); } catch (e) {}
      try {
        _video.removeAttribute('src');
        _video.load();
      } catch (e) {}
      _applyVideoFrame(null);
    }
    if (_trainOverlay) {
      _trainOverlay.className = 'ies-train-overlay';
      _trainOverlay.innerHTML = '';
    }
  }

  function _tick(ts) {
    if (!_img) return;

    if (ts - _lastT < MS_FRAME) {
      _raf = requestAnimationFrame(_tick);
      return;
    }
    _lastT = ts;

    const col = _frame % COLS;
    const row = Math.floor(_frame / COLS);
    const S = _canvas.width;
    const cropY = Math.floor((FRAME_H - FRAME_W) / 2);

    _ctx.clearRect(0, 0, S, S);
    _ctx.drawImage(
      _img,
      col * FRAME_W,
      row * FRAME_H + cropY,
      FRAME_W, FRAME_W,
      0, 0, S, S
    );

    _frame = (_frame + 1) % TOTAL;
    _raf = requestAnimationFrame(_tick);
  }

  window.idolEventScreenShow = async function (spriteSrc) {
    if (!_positionOnBoard()) return;

    _stopSpritePlayback();
    _cancelVideoPlayback();

    _el.classList.remove('ies-video-mode');
    _img = await _loadImg(spriteSrc || 'img/games/idol/sol-sprite.jpg');
    _el.classList.add('ies-on');
    _frame = 0;
    _lastT = 0;
    _raf = requestAnimationFrame(_tick);
  };

  window.idolEventScreenPlayTraining = function (opts) {
    return new Promise(resolve => {
      if (!_positionOnBoard()) { resolve(false); return; }

      const videoSrc = opts && opts.videoSrc ? opts.videoSrc : '';
      if (!videoSrc) { resolve(false); return; }

      _stopSpritePlayback();
      _cancelVideoPlayback();

      const token = _videoModeToken;
      const holdMs = Math.max(0, Number(opts?.holdMs) || TRAIN_HOLD_MS);

      function isCurrentToken() {
        return token === _videoModeToken;
      }

      function onEnded() {
        if (!isCurrentToken()) return;
        try { _video.pause(); } catch (e) {}
        if (_video.duration && isFinite(_video.duration)) {
          try { _video.currentTime = Math.max(0, _video.duration - (1 / 30)); } catch (e) {}
        }

        setTimeout(() => {
          if (!isCurrentToken()) return;
          _el.classList.remove('ies-on', 'ies-video-mode');
          _cancelVideoPlayback();
          resolve(true);
        }, holdMs);
      }

      function onError() {
        if (!isCurrentToken()) return;
        _el.classList.remove('ies-on', 'ies-video-mode');
        _cancelVideoPlayback();
        resolve(false);
      }

      _videoListeners = { onEnded, onError };
      _video.addEventListener('ended', onEnded);
      _video.addEventListener('error', onError);

      _el.classList.add('ies-on', 'ies-video-mode');
      _video.loop = false;
      _video.muted = true;
      _applyVideoFrame(opts?.videoFrame || null);
      _video.src = videoSrc;
      _video.currentTime = 0;

      const p = _video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => onError());
      }
    });
  };

  window.idolEventScreenHide = function () {
    if (_el) _el.classList.remove('ies-on', 'ies-video-mode');
    _stopSpritePlayback();
    _cancelVideoPlayback();
  };
})();

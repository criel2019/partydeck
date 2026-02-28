// ===== 아이돌 게임 퍼포먼스 프로파일러 =====
// 게임 플레이 후 JSON 로그 파일을 다운로드 → Claude가 읽고 분석
// index.html에서 idol.js, idol-board-iso.js 뒤에 로드

(function () {
  'use strict';

  const SLOW_MS = 3; // 이 이상이면 타임라인에 기록

  // ─── 데이터 저장소 ───
  const _stats = {};          // { fnName: { calls, totalMs, maxMs } }
  const _timeline = [];       // [ { t, fn, ms }, ... ] 느린 호출만
  const _fpsSamples = [];     // [ { t, fps, anims }, ... ] 매초 기록
  let _reflows = 0;
  let _innerHTMLSets = 0;
  let _innerHTMLLog = [];     // [ { t, id, chars }, ... ]
  let _startTime = performance.now();

  // ─── 유틸 ───
  function _ts() { return +((performance.now() - _startTime) / 1000).toFixed(2); }

  function _record(name, ms) {
    if (!_stats[name]) _stats[name] = { calls: 0, totalMs: 0, maxMs: 0 };
    const s = _stats[name];
    s.calls++;
    s.totalMs += ms;
    if (ms > s.maxMs) s.maxMs = ms;
    if (ms >= SLOW_MS) {
      _timeline.push({ t: _ts(), fn: name, ms: +ms.toFixed(2) });
    }
  }

  // ─── monkey-patch ───
  function wrapFn(name, original) {
    const wrapped = function (...args) {
      const t0 = performance.now();
      const result = original.apply(this, args);
      _record(name, performance.now() - t0);
      return result;
    };
    wrapped._perfOriginal = original;
    return wrapped;
  }

  const TARGETS = [
    // 보드 렌더링 (idol-board-iso.js)
    'idolRenderIsoBoard', 'idolIsoUpdateCellHighlights',
    '_idolIsoSetStepHL', 'idolIsoGetCellCenter',
    '_isoDefsHTML', '_isoCenterHTML', '_isoCreateCellGroup',
    '_idolUpdateCenterPanelPos',
    // 메인 엔진 (idol.js)
    'idolRenderAll', 'idolRenderHeader', 'idolRenderBoard',
    'idolRenderResourceBar', 'idolRenderCenterPanel',
    'idolRenderCenterHTML', 'idolRenderActionPanel',
    'idolSyncTokenLayer', 'idolAnimateMoveToken',
    'idolShowSelectPhase', 'idolShowEndings', 'idolShowEvolution',
    'idolRollDice', 'idolMovePlayer', 'idolProcessCell',
    'idolShowDiceOverlay', 'idolBgSet',
    // 카메라
    'idolCamInitGestures', 'idolCamFollowPos', 'idolCamFollow',
    'idolCamReset', '_idolCamFlush', '_idolCamTick',
    // 서브 패널
    'idolRenderDicePanel', 'idolRenderShopBuyPanel',
    'idolRenderShopUpgradePanel', 'idolRenderTrainPanel',
    'idolRenderTrainResult', 'idolRenderEventPanel',
    'idolRenderGachaPanel', 'idolRenderGachaResult',
    'idolRenderChancePanel', 'idolRenderSettlementPanel',
    'idolRenderBankruptPanel', 'idolRenderEndingPanel',
    'idolRenderTakeoverPanel', 'idolShowCellResult',
    // 기타
    'broadcastIdolState', 'idolStartPractice',
  ];

  let wrappedCount = 0;
  TARGETS.forEach(name => {
    if (typeof window[name] === 'function') {
      window[name] = wrapFn(name, window[name]);
      wrappedCount++;
    }
  });
  console.log(`[PERF] ${wrappedCount}개 함수 계측 중`);

  // ─── innerHTML 감시 ───
  const _origInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (_origInnerHTML && _origInnerHTML.set) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      get: _origInnerHTML.get,
      set: function (val) {
        _innerHTMLSets++;
        if (this.id && this.id.startsWith('idol') && val.length > 300) {
          _innerHTMLLog.push({ t: _ts(), id: this.id, chars: val.length });
        }
        return _origInnerHTML.set.call(this, val);
      },
      configurable: true,
    });
  }

  // ─── offsetWidth 리플로우 감시 ───
  const _origOW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  if (_origOW && _origOW.get) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      get: function () { _reflows++; return _origOW.get.call(this); },
      configurable: true,
    });
  }

  // ─── FPS 샘플링 (매초) ───
  const _frameTimes = [];
  let _lastFrame = performance.now();
  function _fpsLoop(now) {
    _frameTimes.push(now - _lastFrame);
    if (_frameTimes.length > 120) _frameTimes.shift();
    _lastFrame = now;
    requestAnimationFrame(_fpsLoop);
  }
  requestAnimationFrame(_fpsLoop);

  function _getFPS() {
    if (_frameTimes.length < 2) return 60;
    const avg = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
    return Math.round(1000 / avg);
  }

  function _countAnims() {
    try { return document.getAnimations ? document.getAnimations().length : -1; }
    catch { return -1; }
  }

  setInterval(() => {
    _fpsSamples.push({ t: _ts(), fps: _getFPS(), anims: _countAnims() });
  }, 1000);

  // ─── JSON 빌드 & 다운로드 ───
  function _buildReport() {
    const elapsed = _ts();
    const sorted = Object.entries(_stats)
      .map(([name, s]) => ({
        name, calls: s.calls,
        avg: +(s.totalMs / s.calls).toFixed(2),
        max: +s.maxMs.toFixed(2),
        total: +s.totalMs.toFixed(1),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      _info: '아이돌 게임 퍼포먼스 로그 — Claude 분석용',
      elapsed_sec: elapsed,
      summary: {
        fps_avg: _fpsSamples.length
          ? Math.round(_fpsSamples.reduce((a, b) => a + b.fps, 0) / _fpsSamples.length)
          : null,
        fps_min: _fpsSamples.length
          ? Math.min(..._fpsSamples.map(s => s.fps))
          : null,
        total_innerHTML: _innerHTMLSets,
        total_reflows: _reflows,
        css_anims_last: _countAnims(),
      },
      functions: sorted,
      fps_over_time: _fpsSamples,
      slow_calls_timeline: _timeline,
      innerHTML_log: _innerHTMLLog,
    };
  }

  function _download() {
    const report = _buildReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'idol-perf-log.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log('[PERF] 로그 다운로드 완료: idol-perf-log.json');
  }

  // ─── 게임 종료 시 자동 저장 후킹 ───
  const _origShowEndings = window.idolShowEndings?._perfOriginal || window.idolShowEndings;
  if (_origShowEndings) {
    // idolShowEndings는 이미 wrapFn으로 래핑됨 → 거기에 후처리 추가
    const _wrappedEndings = window.idolShowEndings;
    window.idolShowEndings = function (...args) {
      const result = _wrappedEndings.apply(this, args);
      // 2초 뒤 자동 다운로드 (엔딩 화면 렌더 후)
      setTimeout(_download, 2000);
      return result;
    };
  }

  // ─── 수동 다운로드 버튼 (화면 좌하단) ───
  const btn = document.createElement('button');
  btn.textContent = 'PERF 저장';
  btn.style.cssText = [
    'position:fixed', 'bottom:8px', 'left:8px', 'z-index:999999',
    'background:#222', 'color:#0f0', 'border:1px solid #0f0',
    'font:bold 11px monospace', 'padding:4px 10px', 'border-radius:4px',
    'cursor:pointer', 'opacity:0.7',
  ].join(';');
  btn.addEventListener('click', _download);
  document.body.appendChild(btn);

  // ─── 글로벌 API ───
  window.idolPerf = { download: _download, report: _buildReport, fps: _getFPS };

  // ─── 30초 후 자동 저장 ───
  setTimeout(() => {
    console.log('[PERF] 30초 경과 — 자동 저장');
    _download();
  }, 30000);

  console.log('[PERF] 준비 완료 — 30초 후 자동 저장 or [PERF 저장] 버튼 클릭');

})();

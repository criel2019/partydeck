// ===== 아이돌 게임 퍼포먼스 프로파일러 =====
// 기존 코드 수정 없이 monkey-patch로 함수 실행시간 계측
// index.html에서 idol.js, idol-board-iso.js 뒤에 로드

(function () {
  'use strict';

  // ─── 설정 ───
  const SLOW_THRESHOLD = 5;    // ms 이상이면 노란색 경고
  const CRITICAL_THRESHOLD = 16; // ms 이상이면 빨간색 (1프레임 = 16.67ms)
  const LOG_ALL = false;        // true면 모든 호출 로그, false면 느린 것만
  const HISTORY_SIZE = 200;     // 호출 기록 보관 수

  // ─── 데이터 저장소 ───
  const _stats = {};       // { fnName: { calls, totalMs, maxMs, avgMs, history[] } }
  const _frameTimes = [];  // FPS 계산용
  let _fpsRafId = null;
  let _overlayEl = null;
  let _overlayVisible = false;
  let _reflows = 0;        // offsetWidth 강제 리플로우 카운트
  let _innerHTMLSets = 0;  // innerHTML 할당 카운트
  let _lastResetTime = performance.now();

  // ─── 유틸 ───
  function _getStat(name) {
    if (!_stats[name]) {
      _stats[name] = { calls: 0, totalMs: 0, maxMs: 0, history: [] };
    }
    return _stats[name];
  }

  function _record(name, ms) {
    const s = _getStat(name);
    s.calls++;
    s.totalMs += ms;
    if (ms > s.maxMs) s.maxMs = ms;
    s.history.push(ms);
    if (s.history.length > HISTORY_SIZE) s.history.shift();

    // 콘솔 로그
    if (ms >= CRITICAL_THRESHOLD) {
      console.warn(`🔴 [PERF] ${name}: ${ms.toFixed(2)}ms (CRITICAL — 프레임 드랍)`);
    } else if (ms >= SLOW_THRESHOLD) {
      console.warn(`🟡 [PERF] ${name}: ${ms.toFixed(2)}ms (느림)`);
    } else if (LOG_ALL) {
      console.log(`🟢 [PERF] ${name}: ${ms.toFixed(2)}ms`);
    }
  }

  // ─── 함수 래핑 (monkey-patch) ───
  function wrapFn(name, original) {
    return function (...args) {
      const t0 = performance.now();
      const result = original.apply(this, args);
      const ms = performance.now() - t0;
      _record(name, ms);
      return result;
    };
  }

  // async/Promise 반환 함수용 래핑은 필요 없음 — idol 게임은 전부 동기 함수

  // ─── 계측 대상 함수 목록 ───
  const TARGETS = [
    // idol-board-iso.js — 보드 렌더링
    'idolRenderIsoBoard',
    'idolIsoUpdateCellHighlights',
    '_idolIsoSetStepHL',
    'idolIsoGetCellCenter',
    '_isoDefsHTML',
    '_isoCenterHTML',
    '_isoCreateCellGroup',
    '_idolUpdateCenterPanelPos',

    // idol.js — 메인 엔진
    'idolRenderAll',
    'idolRenderHeader',
    'idolRenderBoard',
    'idolRenderResourceBar',
    'idolRenderCenterPanel',
    'idolRenderCenterHTML',
    'idolRenderActionPanel',
    'idolSyncTokenLayer',
    'idolAnimateMoveToken',
    'idolShowSelectPhase',
    'idolShowEndings',
    'idolShowEvolution',
    'idolRollDice',
    'idolMovePlayer',
    'idolProcessCell',
    'idolShowDiceOverlay',
    'idolBgSet',

    // 카메라
    'idolCamInitGestures',
    'idolCamFollowPos',
    'idolCamFollow',
    'idolCamReset',
    '_idolCamFlush',
    '_idolCamTick',

    // 렌더 서브 함수들
    'idolRenderDicePanel',
    'idolRenderShopBuyPanel',
    'idolRenderShopUpgradePanel',
    'idolRenderTrainPanel',
    'idolRenderTrainResult',
    'idolRenderEventPanel',
    'idolRenderGachaPanel',
    'idolRenderGachaResult',
    'idolRenderChancePanel',
    'idolRenderSettlementPanel',
    'idolRenderBankruptPanel',
    'idolRenderEndingPanel',
    'idolRenderTakeoverPanel',
    'idolShowCellResult',

    // broadcast
    'broadcastIdolState',

    // 연습모드 시작
    'idolStartPractice',
  ];

  // 래핑 실행
  let wrappedCount = 0;
  let missingFns = [];
  TARGETS.forEach(name => {
    if (typeof window[name] === 'function') {
      window[name] = wrapFn(name, window[name]);
      wrappedCount++;
    } else {
      missingFns.push(name);
    }
  });

  console.log(`[PERF] 프로파일러 활성: ${wrappedCount}개 함수 계측 중`);
  if (missingFns.length) {
    console.log(`[PERF] 찾지 못한 함수 (private/스코프): ${missingFns.join(', ')}`);
  }

  // ─── innerHTML 사용 감시 ───
  // Element.innerHTML setter를 감시하여 얼마나 자주 호출되는지 추적
  const _origInnerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (_origInnerHTMLDesc && _origInnerHTMLDesc.set) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      get: _origInnerHTMLDesc.get,
      set: function (val) {
        _innerHTMLSets++;
        // idol 관련 요소만 상세 로그
        if (this.id && this.id.startsWith('idol') && val.length > 500) {
          console.log(`[PERF] innerHTML set on #${this.id} (${val.length} chars)`);
        }
        return _origInnerHTMLDesc.set.call(this, val);
      },
      configurable: true,
    });
  }

  // ─── offsetWidth 리플로우 감시 ───
  const _origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  if (_origOffsetWidth && _origOffsetWidth.get) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      get: function () {
        _reflows++;
        return _origOffsetWidth.get.call(this);
      },
      configurable: true,
    });
  }

  // ─── FPS 카운터 ───
  let _lastFrameTime = performance.now();
  function _fpsLoop(now) {
    _frameTimes.push(now - _lastFrameTime);
    if (_frameTimes.length > 120) _frameTimes.shift();
    _lastFrameTime = now;
    _fpsRafId = requestAnimationFrame(_fpsLoop);
  }
  _fpsRafId = requestAnimationFrame(_fpsLoop);

  function _getFPS() {
    if (_frameTimes.length < 2) return 60;
    const avg = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
    return Math.round(1000 / avg);
  }

  // ─── CSS 애니메이션 카운트 ───
  function _countAnimations() {
    try {
      return document.getAnimations ? document.getAnimations().length : '?';
    } catch { return '?'; }
  }

  // ─── 오버레이 UI ───
  function _createOverlay() {
    if (_overlayEl) return _overlayEl;
    const el = document.createElement('div');
    el.id = 'idolPerfOverlay';
    el.style.cssText = [
      'position:fixed', 'top:4px', 'right:4px', 'z-index:999999',
      'background:rgba(0,0,0,0.85)', 'color:#0f0', 'font:11px/1.4 monospace',
      'padding:8px 10px', 'border-radius:6px', 'max-width:360px',
      'max-height:80vh', 'overflow-y:auto', 'pointer-events:auto',
      'user-select:text', 'white-space:pre',
    ].join(';');
    document.body.appendChild(el);
    _overlayEl = el;
    return el;
  }

  function _updateOverlay() {
    if (!_overlayVisible) return;
    const el = _createOverlay();
    const elapsed = ((performance.now() - _lastResetTime) / 1000).toFixed(0);
    const fps = _getFPS();
    const anims = _countAnimations();

    // 가장 느린 함수 TOP 10
    const sorted = Object.entries(_stats)
      .filter(([, s]) => s.calls > 0)
      .map(([name, s]) => ({
        name,
        calls: s.calls,
        avg: s.totalMs / s.calls,
        max: s.maxMs,
        total: s.totalMs,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    let txt = '';
    // 헤더
    const fpsColor = fps < 30 ? '#f44' : fps < 50 ? '#fa0' : '#0f0';
    txt += `FPS: <span style="color:${fpsColor}">${fps}</span>`;
    txt += `  Anims: ${anims}  Time: ${elapsed}s\n`;
    txt += `innerHTML: ${_innerHTMLSets}  reflows: ${_reflows}\n`;
    txt += '─'.repeat(42) + '\n';
    txt += 'Function             calls  avg    max   total\n';
    txt += '─'.repeat(42) + '\n';

    sorted.forEach(r => {
      const n = r.name.length > 20 ? r.name.slice(0, 19) + '…' : r.name.padEnd(20);
      const avgC = r.avg >= CRITICAL_THRESHOLD ? '#f44' : r.avg >= SLOW_THRESHOLD ? '#fa0' : '#0f0';
      const maxC = r.max >= CRITICAL_THRESHOLD ? '#f44' : r.max >= SLOW_THRESHOLD ? '#fa0' : '#0f0';
      txt += `${n} ${String(r.calls).padStart(5)} `;
      txt += `<span style="color:${avgC}">${r.avg.toFixed(1).padStart(5)}</span> `;
      txt += `<span style="color:${maxC}">${r.max.toFixed(1).padStart(5)}</span> `;
      txt += `${r.total.toFixed(0).padStart(6)}ms\n`;
    });

    if (sorted.length === 0) {
      txt += '(아직 데이터 없음 — 게임을 시작하세요)\n';
    }

    txt += '─'.repeat(42) + '\n';
    txt += '[P] 토글  [R] 리셋  [C] 콘솔 덤프';

    el.innerHTML = txt;
  }

  // 주기적 갱신
  setInterval(_updateOverlay, 500);

  // ─── 키보드 단축키 ───
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // P 키: 오버레이 토글
    if (e.key === 'p' || e.key === 'P') {
      _overlayVisible = !_overlayVisible;
      if (_overlayVisible) {
        _createOverlay();
        _updateOverlay();
      } else if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
      }
    }

    // R 키: 통계 리셋
    if (e.key === 'r' || e.key === 'R') {
      Object.keys(_stats).forEach(k => {
        _stats[k] = { calls: 0, totalMs: 0, maxMs: 0, history: [] };
      });
      _reflows = 0;
      _innerHTMLSets = 0;
      _lastResetTime = performance.now();
      console.log('[PERF] 통계 리셋됨');
    }

    // C 키: 콘솔에 전체 덤프
    if (e.key === 'c' || e.key === 'C') {
      _dumpToConsole();
    }
  });

  // ─── 콘솔 덤프 ───
  function _dumpToConsole() {
    const elapsed = ((performance.now() - _lastResetTime) / 1000).toFixed(1);
    console.group(`[PERF] 프로파일 덤프 (${elapsed}s 경과)`);
    console.log(`FPS: ${_getFPS()}, CSS 애니메이션: ${_countAnimations()}`);
    console.log(`innerHTML 횟수: ${_innerHTMLSets}, 강제 리플로우: ${_reflows}`);

    const sorted = Object.entries(_stats)
      .filter(([, s]) => s.calls > 0)
      .map(([name, s]) => ({
        name,
        calls: s.calls,
        avg: +(s.totalMs / s.calls).toFixed(2),
        max: +s.maxMs.toFixed(2),
        total: +s.totalMs.toFixed(1),
      }))
      .sort((a, b) => b.total - a.total);

    console.table(sorted);
    console.groupEnd();
  }

  // ─── 글로벌 API ───
  window.idolPerf = {
    show()  { _overlayVisible = true; _createOverlay(); _updateOverlay(); },
    hide()  { _overlayVisible = false; if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; } },
    reset() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'R' })); },
    dump()  { _dumpToConsole(); },
    stats() { return JSON.parse(JSON.stringify(_stats)); },
    fps()   { return _getFPS(); },
  };

  console.log('[PERF] 단축키: P=오버레이 토글, R=리셋, C=콘솔 덤프');
  console.log('[PERF] API: idolPerf.show(), .hide(), .dump(), .stats(), .fps()');

})();

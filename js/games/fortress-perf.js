// ===== FORTRESS — Performance Profiler =====
// 60프레임마다 병목 지점 요약 로그 출력
// 사용법: FortPerf.begin('label') ... FortPerf.end('label')
// 제거 시 이 파일 + 각 파일의 FortPerf.begin/end 호출만 삭제

const FortPerf = (() => {
  const REPORT_EVERY = 60; // 프레임 수
  const WARN_MS = 2;       // 이 이상이면 ⚠ 경고
  const _timers = {};      // label → start timestamp
  const _acc = {};         // label → { sum, max, count, samples[] }
  let _frameCount = 0;
  let _frameStart = 0;
  let _frameTimes = [];
  let _enabled = true;

  function _ensure(label) {
    if (!_acc[label]) _acc[label] = { sum: 0, max: 0, count: 0, samples: [] };
  }

  return {
    get enabled() { return _enabled; },
    set enabled(v) { _enabled = !!v; },

    // 프레임 시작 (fortCameraLoop / animLoop 최상단)
    frameStart() {
      if (!_enabled) return;
      _frameStart = performance.now();
    },

    // 프레임 끝
    frameEnd() {
      if (!_enabled || !_frameStart) return;
      const dt = performance.now() - _frameStart;
      _frameTimes.push(dt);
      _frameCount++;
      if (_frameCount >= REPORT_EVERY) this._report();
    },

    // 구간 시작
    begin(label) {
      if (!_enabled) return;
      _timers[label] = performance.now();
    },

    // 구간 끝
    end(label) {
      if (!_enabled) return;
      const start = _timers[label];
      if (start === undefined) return;
      const dt = performance.now() - start;
      _ensure(label);
      const a = _acc[label];
      a.sum += dt;
      a.count++;
      if (dt > a.max) a.max = dt;
      delete _timers[label];
    },

    // 일회성 이벤트 (캐시 빌드 등)
    once(label, fn) {
      if (!_enabled) return fn();
      const t0 = performance.now();
      const result = fn();
      const dt = performance.now() - t0;
      console.log(
        `%c[FortPerf] ${label}: ${dt.toFixed(2)}ms`,
        dt > 16 ? 'color:#ff4444;font-weight:bold' : 'color:#4caf50'
      );
      return result;
    },

    // 보고서 출력
    _report() {
      if (_frameTimes.length === 0) return;

      // 프레임 통계
      const avgFrame = _frameTimes.reduce((s, v) => s + v, 0) / _frameTimes.length;
      const maxFrame = Math.max(..._frameTimes);
      const fps = 1000 / avgFrame;

      // 구간별 통계 (평균 기준 내림차순 정렬)
      const entries = Object.keys(_acc).map(label => {
        const a = _acc[label];
        const avg = a.count > 0 ? a.sum / a.count : 0;
        return { label, avg, max: a.max, count: a.count, total: a.sum };
      }).sort((a, b) => b.avg - a.avg);

      // 콘솔 그룹 출력
      const frameColor = avgFrame > 16.7 ? '#ff4444' : avgFrame > 10 ? '#ff9800' : '#4caf50';
      console.groupCollapsed(
        `%c[FortPerf] ${REPORT_EVERY}f | FPS: ${fps.toFixed(0)} | frame avg: ${avgFrame.toFixed(1)}ms / max: ${maxFrame.toFixed(1)}ms`,
        `color:${frameColor};font-weight:bold`
      );

      // 테이블 형태
      const table = {};
      for (const e of entries) {
        const warn = e.avg >= WARN_MS ? ' ⚠' : '';
        table[e.label + warn] = {
          'avg(ms)': +e.avg.toFixed(2),
          'max(ms)': +e.max.toFixed(2),
          'calls': e.count,
          'total(ms)': +e.total.toFixed(1),
        };
      }
      if (Object.keys(table).length > 0) console.table(table);

      // 가장 무거운 항목 하이라이트
      if (entries.length > 0 && entries[0].avg >= WARN_MS) {
        console.log(
          `%c⚠ 최대 병목: "${entries[0].label}" — avg ${entries[0].avg.toFixed(2)}ms, max ${entries[0].max.toFixed(2)}ms`,
          'color:#ff4444;font-weight:bold;font-size:12px'
        );
      }

      console.groupEnd();

      // 리셋
      _frameCount = 0;
      _frameStart = 0;
      _frameTimes = [];
      for (const k of Object.keys(_acc)) delete _acc[k];
    },

    // 수동 리셋
    reset() {
      _frameCount = 0;
      _frameStart = 0;
      _frameTimes = [];
      for (const k of Object.keys(_acc)) delete _acc[k];
      for (const k of Object.keys(_timers)) delete _timers[k];
    }
  };
})();

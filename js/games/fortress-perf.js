// ===== FORTRESS — Performance Profiler =====
// 60프레임마다 병목 지점 요약 로그 출력 + 파일 내보내기
// 사용법: FortPerf.begin('label') ... FortPerf.end('label')
// 내보내기: FortPerf.save()  — 브라우저에서 JSON 파일 다운로드
// 제거 시 이 파일 + 각 파일의 FortPerf.begin/end 호출만 삭제

const FortPerf = (() => {
  const REPORT_EVERY = 60; // 프레임 수
  const WARN_MS = 2;       // 이 이상이면 ⚠ 경고
  const _timers = {};      // label → start timestamp
  const _acc = {};         // label → { sum, max, count }
  let _frameCount = 0;
  let _frameStart = 0;
  let _frameTimes = [];
  let _enabled = true;

  // ── 히스토리 (파일 내보내기용) ──
  const _history = [];     // 매 리포트마다 스냅샷 저장
  const _onceLog = [];     // once() 일회성 이벤트 기록
  let _sessionStart = 0;   // 세션 시작 시각

  function _ensure(label) {
    if (!_acc[label]) _acc[label] = { sum: 0, max: 0, count: 0 };
  }

  function _ts() {
    return _sessionStart ? performance.now() - _sessionStart : 0;
  }

  return {
    get enabled() { return _enabled; },
    set enabled(v) { _enabled = !!v; },

    // 프레임 시작 (fortCameraLoop / animLoop 최상단)
    frameStart() {
      if (!_enabled) return;
      if (!_sessionStart) _sessionStart = performance.now();
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
      _onceLog.push({ t: _ts(), label, ms: +dt.toFixed(2) });
      return result;
    },

    // 보고서 출력 + 히스토리 저장
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
        return { label, avg: +avg.toFixed(3), max: +a.max.toFixed(3), count: a.count, total: +a.sum.toFixed(1) };
      }).sort((a, b) => b.avg - a.avg);

      // ── 히스토리에 스냅샷 추가 ──
      _history.push({
        t: +_ts().toFixed(0),
        frames: _frameTimes.length,
        fps: +fps.toFixed(1),
        frame_avg: +avgFrame.toFixed(2),
        frame_max: +maxFrame.toFixed(2),
        frame_p95: +_frameTimes.sort((a, b) => a - b)[Math.floor(_frameTimes.length * 0.95)].toFixed(2),
        sections: entries,
      });

      // ── 콘솔 출력 ──
      const frameColor = avgFrame > 16.7 ? '#ff4444' : avgFrame > 10 ? '#ff9800' : '#4caf50';
      console.groupCollapsed(
        `%c[FortPerf] ${REPORT_EVERY}f | FPS: ${fps.toFixed(0)} | frame avg: ${avgFrame.toFixed(1)}ms / max: ${maxFrame.toFixed(1)}ms`,
        `color:${frameColor};font-weight:bold`
      );

      const table = {};
      for (const e of entries) {
        const warn = e.avg >= WARN_MS ? ' ⚠' : '';
        table[e.label + warn] = {
          'avg(ms)': e.avg,
          'max(ms)': e.max,
          'calls': e.count,
          'total(ms)': e.total,
        };
      }
      if (Object.keys(table).length > 0) console.table(table);

      if (entries.length > 0 && entries[0].avg >= WARN_MS) {
        console.log(
          `%c⚠ 최대 병목: "${entries[0].label}" — avg ${entries[0].avg}ms, max ${entries[0].max}ms`,
          'color:#ff4444;font-weight:bold;font-size:12px'
        );
      }

      console.groupEnd();

      // 리셋 (현재 윈도우만, 히스토리는 유지)
      _frameCount = 0;
      _frameStart = 0;
      _frameTimes = [];
      for (const k of Object.keys(_acc)) delete _acc[k];
    },

    // ── 파일 내보내기 ──
    // 브라우저 콘솔에서 FortPerf.save() 호출
    save() {
      const data = {
        exported: new Date().toISOString(),
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        canvas: FORT_CANVAS_W + 'x' + FORT_CANVAS_H,
        duration_ms: +_ts().toFixed(0),
        reports: _history,
        oneshot: _onceLog,
        // 전체 요약
        summary: this._buildSummary(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `fort-perf-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`%c[FortPerf] ${_history.length}개 리포트 저장 완료 → ${a.download}`, 'color:#4caf50;font-weight:bold');
      return a.download;
    },

    // 전체 히스토리 기반 요약 통계
    _buildSummary() {
      if (_history.length === 0) return null;
      // 전체 FPS 통계
      const allFps = _history.map(r => r.fps);
      const allFrameAvg = _history.map(r => r.frame_avg);
      const allFrameMax = _history.map(r => r.frame_max);

      // 구간별 글로벌 통계 집계
      const globalSections = {};
      for (const report of _history) {
        for (const s of report.sections) {
          if (!globalSections[s.label]) {
            globalSections[s.label] = { sumAvg: 0, maxMax: 0, reportCount: 0, totalCalls: 0, totalMs: 0 };
          }
          const g = globalSections[s.label];
          g.sumAvg += s.avg;
          g.maxMax = Math.max(g.maxMax, s.max);
          g.reportCount++;
          g.totalCalls += s.count;
          g.totalMs += s.total;
        }
      }

      const sectionsSummary = Object.entries(globalSections)
        .map(([label, g]) => ({
          label,
          global_avg: +(g.sumAvg / g.reportCount).toFixed(3),
          global_max: +g.maxMax.toFixed(3),
          total_calls: g.totalCalls,
          total_ms: +g.totalMs.toFixed(1),
          appeared_in: g.reportCount + '/' + _history.length,
        }))
        .sort((a, b) => b.global_avg - a.global_avg);

      return {
        total_reports: _history.length,
        total_frames: _history.reduce((s, r) => s + r.frames, 0),
        fps: {
          avg: +(allFps.reduce((s, v) => s + v, 0) / allFps.length).toFixed(1),
          min: +Math.min(...allFps).toFixed(1),
          max: +Math.max(...allFps).toFixed(1),
        },
        frame_ms: {
          avg: +(allFrameAvg.reduce((s, v) => s + v, 0) / allFrameAvg.length).toFixed(2),
          worst_avg: +Math.max(...allFrameAvg).toFixed(2),
          worst_single: +Math.max(...allFrameMax).toFixed(2),
        },
        sections: sectionsSummary,
        bottleneck: sectionsSummary.length > 0 ? sectionsSummary[0].label : null,
      };
    },

    // 히스토리 조회 (콘솔 디버깅용)
    history() { return _history; },

    // 수동 리셋 (히스토리도 초기화)
    reset() {
      _frameCount = 0;
      _frameStart = 0;
      _frameTimes = [];
      _history.length = 0;
      _onceLog.length = 0;
      _sessionStart = 0;
      for (const k of Object.keys(_acc)) delete _acc[k];
      for (const k of Object.keys(_timers)) delete _timers[k];
    }
  };
})();

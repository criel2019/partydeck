// ===== GamePerf — 범용 게임 퍼포먼스 프로파일러 =====
// 사용법:
//   const perf = GamePerf.create({ name: 'fortress', ... });
//   perf.frameStart(); ... perf.frameEnd();
//   perf.begin('label'); ... perf.end('label');
//   perf.show();  // UI 표시
//   perf.hide();  // UI 숨김
//
// 여러 게임에서 재사용 가능. 게임별 설정만 다르게 전달.

class GamePerf {

  // ── 팩토리 ──
  static create(opts = {}) {
    return new GamePerf(opts);
  }

  /**
   * @param {Object} opts
   * @param {string}  opts.name          - 게임 이름 (표시용, 파일명에 사용)
   * @param {number}  [opts.reportEvery] - 몇 프레임마다 리포트 (기본 60)
   * @param {number}  [opts.warnMs]      - 이 ms 이상이면 경고 (기본 2)
   * @param {boolean} [opts.console]     - 콘솔 출력 여부 (기본 true)
   * @param {Object}  [opts.extra]       - save 시 추가 메타데이터 함수 () => ({...})
   * @param {string[]}[opts.wrapFns]     - monkey-patch 대상 전역 함수명 목록
   * @param {boolean} [opts.watchDOM]    - innerHTML/reflow 감시 (기본 false)
   */
  constructor(opts) {
    this._name = opts.name || 'game';
    this._REPORT_EVERY = opts.reportEvery || 60;
    this._WARN_MS = opts.warnMs || 2;
    this._consoleLog = opts.console !== false;
    this._extraMeta = opts.extra || null;

    // 프레임 측정
    this._timers = {};
    this._acc = {};
    this._frameCount = 0;
    this._frameStart = 0;
    this._frameTimes = [];
    this._enabled = true;

    // 히스토리
    this._history = [];
    this._onceLog = [];
    this._sessionStart = 0;
    this._lastReport = null;

    // UI
    this._btn = null;
    this._panel = null;
    this._panelOpen = false;
    this._uiCreated = false;

    // monkey-patch 래핑
    if (opts.wrapFns && opts.wrapFns.length > 0) {
      this._wrapFunctions(opts.wrapFns);
    }

    // DOM 감시
    this._domStats = null;
    if (opts.watchDOM) {
      this._initDOMWatch();
    }
  }

  // ═══════════════════════════════════════════
  //  Core 측정
  // ═══════════════════════════════════════════

  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; }

  frameStart() {
    if (!this._enabled) return;
    if (!this._sessionStart) this._sessionStart = performance.now();
    this._frameStart = performance.now();
    this._ensureUI();
  }

  frameEnd() {
    if (!this._enabled || !this._frameStart) return;
    const dt = performance.now() - this._frameStart;
    this._frameTimes.push(dt);
    this._frameCount++;
    if (this._frameCount >= this._REPORT_EVERY) this._report();
  }

  begin(label) {
    if (!this._enabled) return;
    this._timers[label] = performance.now();
  }

  end(label) {
    if (!this._enabled) return;
    const start = this._timers[label];
    if (start === undefined) return;
    const dt = performance.now() - start;
    if (!this._acc[label]) this._acc[label] = { sum: 0, max: 0, count: 0 };
    const a = this._acc[label];
    a.sum += dt;
    a.count++;
    if (dt > a.max) a.max = dt;
    delete this._timers[label];
  }

  once(label, fn) {
    if (!this._enabled) return fn();
    const t0 = performance.now();
    const result = fn();
    const dt = performance.now() - t0;
    if (this._consoleLog) {
      console.log(
        `%c[${this._name}Perf] ${label}: ${dt.toFixed(2)}ms`,
        dt > 16 ? 'color:#ff4444;font-weight:bold' : 'color:#4caf50'
      );
    }
    this._onceLog.push({ t: this._ts(), label, ms: +dt.toFixed(2) });
    return result;
  }

  // ═══════════════════════════════════════════
  //  Monkey-patch 래핑
  // ═══════════════════════════════════════════

  _wrapFunctions(names) {
    let count = 0;
    for (const name of names) {
      if (typeof window[name] === 'function') {
        const original = window[name];
        const self = this;
        const wrapped = function (...args) {
          const t0 = performance.now();
          const result = original.apply(this, args);
          const dt = performance.now() - t0;
          if (!self._acc[name]) self._acc[name] = { sum: 0, max: 0, count: 0 };
          const a = self._acc[name];
          a.sum += dt; a.count++; if (dt > a.max) a.max = dt;
          return result;
        };
        wrapped._perfOriginal = original;
        window[name] = wrapped;
        count++;
      }
    }
    if (this._consoleLog) {
      console.log(`[${this._name}Perf] ${count}/${names.length}개 함수 래핑 완료`);
    }
  }

  // ═══════════════════════════════════════════
  //  DOM 감시 (innerHTML / reflow)
  // ═══════════════════════════════════════════

  _initDOMWatch() {
    this._domStats = { innerHTML: 0, reflows: 0, innerHTMLLog: [] };
    const self = this;
    const prefix = this._name;

    // innerHTML 감시
    const origIH = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (origIH && origIH.set) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        get: origIH.get,
        set: function (val) {
          self._domStats.innerHTML++;
          if (this.id && this.id.toLowerCase().startsWith(prefix) && val.length > 300) {
            self._domStats.innerHTMLLog.push({ t: self._ts(), id: this.id, chars: val.length });
          }
          return origIH.set.call(this, val);
        },
        configurable: true,
      });
    }

    // reflow 감시
    const origOW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    if (origOW && origOW.get) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get: function () { self._domStats.reflows++; return origOW.get.call(this); },
        configurable: true,
      });
    }
  }

  // ═══════════════════════════════════════════
  //  리포트
  // ═══════════════════════════════════════════

  _ts() {
    return this._sessionStart ? performance.now() - this._sessionStart : 0;
  }

  _report() {
    if (this._frameTimes.length === 0) return;

    const avgFrame = this._frameTimes.reduce((s, v) => s + v, 0) / this._frameTimes.length;
    const maxFrame = Math.max(...this._frameTimes);
    const fps = 1000 / avgFrame;

    const entries = Object.keys(this._acc).map(label => {
      const a = this._acc[label];
      const avg = a.count > 0 ? a.sum / a.count : 0;
      return { label, avg: +avg.toFixed(3), max: +a.max.toFixed(3), count: a.count, total: +a.sum.toFixed(1) };
    }).sort((a, b) => b.avg - a.avg);

    const sorted = [...this._frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    const snapshot = {
      t: +this._ts().toFixed(0),
      frames: this._frameTimes.length,
      fps: +fps.toFixed(1),
      frame_avg: +avgFrame.toFixed(2),
      frame_max: +maxFrame.toFixed(2),
      frame_p95: +p95.toFixed(2),
      sections: entries,
    };
    this._history.push(snapshot);
    this._lastReport = snapshot;
    this._updatePanel();

    // 버튼 FPS 미니 표시
    if (this._btn && this._btn.style.display !== 'none') {
      this._btn.textContent = `Perf ${fps.toFixed(0)}`;
      this._btn.style.borderColor = GamePerf._fpsColor(fps);
      if (!this._panelOpen) this._btn.style.color = GamePerf._fpsColor(fps);
    }

    // 콘솔 출력
    if (this._consoleLog) {
      const fc = avgFrame > 16.7 ? '#ff4444' : avgFrame > 10 ? '#ff9800' : '#4caf50';
      console.groupCollapsed(
        `%c[${this._name}Perf] ${this._REPORT_EVERY}f | FPS: ${fps.toFixed(0)} | avg: ${avgFrame.toFixed(1)}ms / max: ${maxFrame.toFixed(1)}ms`,
        `color:${fc};font-weight:bold`
      );
      const table = {};
      for (const e of entries) {
        const warn = e.avg >= this._WARN_MS ? ' ⚠' : '';
        table[e.label + warn] = { 'avg(ms)': e.avg, 'max(ms)': e.max, calls: e.count, 'total(ms)': e.total };
      }
      if (Object.keys(table).length > 0) console.table(table);
      if (entries.length > 0 && entries[0].avg >= this._WARN_MS) {
        console.log(`%c⚠ 최대 병목: "${entries[0].label}" — avg ${entries[0].avg}ms`, 'color:#ff4444;font-weight:bold');
      }
      console.groupEnd();
    }

    // 리셋 (현재 윈도우)
    this._frameCount = 0;
    this._frameStart = 0;
    this._frameTimes = [];
    for (const k of Object.keys(this._acc)) delete this._acc[k];
  }

  // ═══════════════════════════════════════════
  //  저장
  // ═══════════════════════════════════════════

  save() {
    const data = {
      game: this._name,
      exported: new Date().toISOString(),
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio || 1,
      duration_ms: +this._ts().toFixed(0),
      reports: this._history,
      oneshot: this._onceLog,
      summary: this._buildSummary(),
    };

    // 게임별 추가 메타
    if (this._extraMeta) {
      try { Object.assign(data, this._extraMeta()); } catch (e) {}
    }

    // DOM 감시 데이터
    if (this._domStats) {
      data.dom = {
        total_innerHTML: this._domStats.innerHTML,
        total_reflows: this._domStats.reflows,
        innerHTML_log: this._domStats.innerHTMLLog,
      };
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `${this._name}-perf-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (this._consoleLog) {
      console.log(`%c[${this._name}Perf] ${this._history.length}개 리포트 저장 → ${a.download}`, 'color:#4caf50;font-weight:bold');
    }
    return a.download;
  }

  _buildSummary() {
    if (this._history.length === 0) return null;
    const allFps = this._history.map(r => r.fps);
    const allAvg = this._history.map(r => r.frame_avg);
    const allMax = this._history.map(r => r.frame_max);

    const gs = {};
    for (const report of this._history) {
      for (const s of report.sections) {
        if (!gs[s.label]) gs[s.label] = { sumAvg: 0, maxMax: 0, cnt: 0, calls: 0, ms: 0 };
        const g = gs[s.label];
        g.sumAvg += s.avg; g.maxMax = Math.max(g.maxMax, s.max);
        g.cnt++; g.calls += s.count; g.ms += s.total;
      }
    }

    const sections = Object.entries(gs)
      .map(([label, g]) => ({
        label,
        global_avg: +(g.sumAvg / g.cnt).toFixed(3),
        global_max: +g.maxMax.toFixed(3),
        total_calls: g.calls,
        total_ms: +g.ms.toFixed(1),
        appeared_in: g.cnt + '/' + this._history.length,
      }))
      .sort((a, b) => b.global_avg - a.global_avg);

    return {
      total_reports: this._history.length,
      total_frames: this._history.reduce((s, r) => s + r.frames, 0),
      fps: {
        avg: +(allFps.reduce((s, v) => s + v, 0) / allFps.length).toFixed(1),
        min: +Math.min(...allFps).toFixed(1),
        max: +Math.max(...allFps).toFixed(1),
      },
      frame_ms: {
        avg: +(allAvg.reduce((s, v) => s + v, 0) / allAvg.length).toFixed(2),
        worst_avg: +Math.max(...allAvg).toFixed(2),
        worst_single: +Math.max(...allMax).toFixed(2),
      },
      sections,
      bottleneck: sections.length > 0 ? sections[0].label : null,
    };
  }

  history() { return this._history; }

  reset() {
    this._frameCount = 0;
    this._frameStart = 0;
    this._frameTimes = [];
    this._history.length = 0;
    this._onceLog.length = 0;
    this._sessionStart = 0;
    this._lastReport = null;
    for (const k of Object.keys(this._acc)) delete this._acc[k];
    for (const k of Object.keys(this._timers)) delete this._timers[k];
    if (this._domStats) {
      this._domStats.innerHTML = 0;
      this._domStats.reflows = 0;
      this._domStats.innerHTMLLog = [];
    }
    if (this._btn) {
      this._btn.textContent = 'Perf';
      this._btn.style.borderColor = '#0f0';
      if (!this._panelOpen) this._btn.style.color = '#0f0';
    }
  }

  // ═══════════════════════════════════════════
  //  UI — lazy 생성 + show/hide
  // ═══════════════════════════════════════════

  show() { this._ensureUI(); }

  hide() {
    if (this._btn) this._btn.style.display = 'none';
    if (this._panel) this._panel.style.display = 'none';
    this._panelOpen = false;
  }

  _ensureUI() {
    if (this._uiCreated) {
      if (this._btn) this._btn.style.display = '';
      return;
    }
    if (!document.body) return;
    this._uiCreated = true;

    // 버튼
    this._btn = document.createElement('button');
    this._btn.id = `${this._name}PerfBtn`;
    this._btn.textContent = 'Perf';
    this._btn.style.cssText = [
      'position:fixed', 'bottom:8px', 'left:8px', 'z-index:999999',
      'background:#1a1a2e', 'color:#0f0', 'border:1px solid #0f0',
      'font:bold 11px monospace', 'padding:5px 12px', 'border-radius:4px',
      'cursor:pointer', 'opacity:0.8', 'transition:opacity .2s',
    ].join(';');
    this._btn.addEventListener('mouseenter', () => this._btn.style.opacity = '1');
    this._btn.addEventListener('mouseleave', () => this._btn.style.opacity = '0.8');
    this._btn.addEventListener('click', () => this._togglePanel());
    document.body.appendChild(this._btn);

    // 패널
    this._panel = document.createElement('div');
    this._panel.id = `${this._name}PerfPanel`;
    this._panel.style.cssText = [
      'position:fixed', 'bottom:42px', 'left:8px', 'z-index:999998',
      'width:340px', 'max-height:70vh', 'overflow-y:auto',
      'background:rgba(10,10,30,0.92)', 'color:#ddd',
      'border:1px solid #333', 'border-radius:8px',
      'font:12px/1.5 monospace', 'padding:0',
      'display:none', 'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      'backdrop-filter:blur(4px)',
    ].join(';');
    const title = this._name.toUpperCase();
    this._panel.innerHTML = `
      <div style="padding:8px 12px;background:rgba(255,255,255,0.05);border-bottom:1px solid #333;
                  display:flex;align-items:center;justify-content:space-between">
        <span style="color:#0f0;font-weight:bold">${title} PERF</span>
        <div class="gp-btn-row" style="display:flex;gap:4px"></div>
      </div>
      <div class="gp-fps" style="padding:8px 12px;border-bottom:1px solid #222"></div>
      <div class="gp-sections" style="padding:4px 8px"></div>
      <div class="gp-bottleneck" style="padding:6px 12px;border-top:1px solid #222;font-size:11px"></div>
    `;
    document.body.appendChild(this._panel);

    // 액션 버튼
    const btnRow = this._panel.querySelector('.gp-btn-row');
    const self = this;
    const actions = [
      { label: 'Save', color: '#4caf50', fn() { self.save(); } },
      { label: 'Reset', color: '#ff9800', fn() { self.reset(); self._updatePanel(); } },
      { label: 'ON', color: '#0f0', cls: 'gp-toggle', fn() { self._toggleEnabled(); } },
    ];
    for (const act of actions) {
      const b = document.createElement('button');
      b.textContent = act.label;
      if (act.cls) b.className = act.cls;
      b.style.cssText = [
        'background:transparent', `color:${act.color}`, `border:1px solid ${act.color}`,
        'font:bold 10px monospace', 'padding:2px 8px', 'border-radius:3px', 'cursor:pointer',
      ].join(';');
      b.addEventListener('click', act.fn);
      btnRow.appendChild(b);
    }
  }

  _togglePanel() {
    this._panelOpen = !this._panelOpen;
    this._panel.style.display = this._panelOpen ? 'block' : 'none';
    this._btn.style.background = this._panelOpen ? '#0f0' : '#1a1a2e';
    this._btn.style.color = this._panelOpen ? '#1a1a2e' : '#0f0';
    if (this._panelOpen) this._updatePanel();
  }

  _toggleEnabled() {
    this._enabled = !this._enabled;
    const tb = this._panel.querySelector('.gp-toggle');
    if (tb) {
      tb.textContent = this._enabled ? 'ON' : 'OFF';
      tb.style.color = this._enabled ? '#0f0' : '#888';
      tb.style.borderColor = this._enabled ? '#0f0' : '#888';
    }
  }

  _updatePanel() {
    if (!this._panel || !this._panelOpen) return;

    const fpsBar = this._panel.querySelector('.gp-fps');
    const secDiv = this._panel.querySelector('.gp-sections');
    const bnDiv = this._panel.querySelector('.gp-bottleneck');

    if (!this._lastReport) {
      fpsBar.innerHTML = '<span style="color:#888">데이터 수집 중...</span>';
      secDiv.innerHTML = '';
      bnDiv.innerHTML = '';
      return;
    }

    const r = this._lastReport;
    const W = this._WARN_MS;

    fpsBar.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span>FPS <b style="color:${GamePerf._fpsColor(r.fps)};font-size:16px">${r.fps.toFixed(0)}</b></span>
        <span style="color:#888;font-size:11px">리포트 #${this._history.length}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;color:#aaa">
        <span>avg <b style="color:${GamePerf._msColor(r.frame_avg)}">${r.frame_avg.toFixed(1)}ms</b></span>
        <span>max <b style="color:${GamePerf._msColor(r.frame_max)}">${r.frame_max.toFixed(1)}ms</b></span>
        <span>P95 <b style="color:${GamePerf._msColor(r.frame_p95)}">${r.frame_p95.toFixed(1)}ms</b></span>
      </div>`;

    if (r.sections.length === 0) {
      secDiv.innerHTML = '<div style="color:#666;padding:8px 4px">구간 데이터 없음</div>';
    } else {
      let rows = '';
      for (const s of r.sections) {
        const warn = s.avg >= W;
        const rowColor = warn ? 'color:#ff4444' : 'color:#ccc';
        const barW = Math.min(100, (s.avg / 16.7) * 100);
        const barColor = warn ? '#ff4444' : s.avg > 1 ? '#ff9800' : '#4caf50';
        rows += `<tr style="${rowColor};font-size:11px">
          <td style="padding:1px 4px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${s.label}">${warn ? '! ' : ''}${s.label}</td>
          <td style="padding:1px 4px;text-align:right">${s.avg.toFixed(2)}</td>
          <td style="padding:1px 4px;text-align:right">${s.max.toFixed(2)}</td>
          <td style="padding:1px 4px;width:60px"><div style="background:#333;border-radius:2px;height:6px;overflow:hidden"><div style="width:${barW}%;height:100%;background:${barColor}"></div></div></td>
        </tr>`;
      }
      secDiv.innerHTML = `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:#888;font-size:10px;border-bottom:1px solid #333">
          <th style="padding:2px 4px;text-align:left">구간</th>
          <th style="padding:2px 4px;text-align:right">avg</th>
          <th style="padding:2px 4px;text-align:right">max</th>
          <th style="padding:2px 4px">비중</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
    }

    if (r.sections.length > 0 && r.sections[0].avg >= W) {
      bnDiv.innerHTML = `<span style="color:#ff4444">&#9888; 병목: <b>${r.sections[0].label}</b> — avg ${r.sections[0].avg.toFixed(2)}ms</span>`;
    } else {
      bnDiv.innerHTML = `<span style="color:#4caf50">&#10003; 병목 없음</span>`;
    }
  }

  // ── 색상 유틸 (static) ──
  static _fpsColor(fps) {
    if (fps >= 55) return '#4caf50';
    if (fps >= 30) return '#ff9800';
    return '#ff4444';
  }
  static _msColor(ms) {
    if (ms <= 10) return '#4caf50';
    if (ms <= 16.7) return '#ff9800';
    return '#ff4444';
  }
}

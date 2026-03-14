// ===== MOBILE DEV CONSOLE OVERLAY =====
// Captures console.log/warn/error and displays in an overlay for mobile debugging
// FPS counter included

(function() {
  'use strict';

  const MAX_ENTRIES = 200;
  const _logs = [];
  let _consoleEl = null;
  let _listEl = null;
  let _fpsEl = null;
  let _btnEl = null;
  let _visible = false;

  // FPS tracking
  let _fpsFrames = 0;
  let _fpsLastTime = performance.now();
  let _fpsValue = 0;
  let _fpsLoopId = null;

  // Intercept console methods
  const _origLog = console.log.bind(console);
  const _origWarn = console.warn.bind(console);
  const _origError = console.error.bind(console);
  const _origInfo = console.info.bind(console);

  function formatArgs(args) {
    return Array.from(args).map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 1); }
        catch(e) { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function addEntry(level, args) {
    const ts = new Date();
    const time = ts.toTimeString().slice(0, 8) + '.' + String(ts.getMilliseconds()).padStart(3, '0');
    const text = formatArgs(args);
    _logs.push({ level, time, text });
    if (_logs.length > MAX_ENTRIES) _logs.shift();
    if (_visible && _listEl) renderEntry(_logs[_logs.length - 1]);
  }

  function renderEntry(entry) {
    const div = document.createElement('div');
    div.className = 'dc-entry dc-' + entry.level;
    div.innerHTML = '<span class="dc-time">' + entry.time + '</span> ' + escapeHtml(entry.text);
    _listEl.appendChild(div);
    // Auto-scroll
    _listEl.scrollTop = _listEl.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Patch console
  console.log = function() { _origLog.apply(console, arguments); addEntry('log', arguments); };
  console.warn = function() { _origWarn.apply(console, arguments); addEntry('warn', arguments); };
  console.error = function() { _origError.apply(console, arguments); addEntry('error', arguments); };
  console.info = function() { _origInfo.apply(console, arguments); addEntry('info', arguments); };

  // Capture uncaught errors
  window.addEventListener('error', function(e) {
    addEntry('error', ['[UNCAUGHT] ' + e.message + ' at ' + (e.filename || '') + ':' + (e.lineno || '')]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    addEntry('error', ['[PROMISE] ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown')]);
  });

  // FPS loop
  function fpsLoop() {
    _fpsFrames++;
    const now = performance.now();
    if (now - _fpsLastTime >= 1000) {
      _fpsValue = Math.round(_fpsFrames * 1000 / (now - _fpsLastTime));
      _fpsFrames = 0;
      _fpsLastTime = now;
      if (_fpsEl) _fpsEl.textContent = _fpsValue + ' FPS';
      if (_btnEl && !_visible) _btnEl.textContent = '🔧' + _fpsValue;
    }
    _fpsLoopId = requestAnimationFrame(fpsLoop);
  }

  function createUI() {
    if (_consoleEl) return;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #dcToggleBtn{position:fixed;bottom:12px;right:12px;z-index:99999;background:#1a1a2e;color:#0f0;
        border:1px solid #333;border-radius:8px;padding:6px 12px;font:bold 13px monospace;
        cursor:pointer;opacity:0.85;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      #dcToggleBtn:active{opacity:1;background:#2a2a4e}
      #dcOverlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;background:rgba(0,0,0,0.92);
        display:none;flex-direction:column;font:12px/1.5 'Courier New',monospace;color:#ddd}
      #dcOverlay.dc-show{display:flex}
      #dcHeader{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#111;border-bottom:1px solid #333;flex-shrink:0}
      #dcHeader .dc-title{flex:1;color:#0f0;font-weight:bold;font-size:14px}
      #dcHeader button{background:#222;color:#ccc;border:1px solid #444;border-radius:6px;padding:6px 14px;
        font:bold 12px monospace;cursor:pointer;touch-action:manipulation}
      #dcHeader button:active{background:#444}
      #dcHeader .dc-close{color:#f55}
      #dcHeader .dc-copy{color:#5af}
      #dcHeader .dc-clear{color:#fa5}
      #dcHeader .dc-reload{color:#5f5}
      #dcFps{color:#0f0;font-weight:bold;margin-right:4px}
      #dcList{flex:1;overflow-y:auto;padding:6px 10px;-webkit-overflow-scrolling:touch}
      .dc-entry{padding:2px 0;border-bottom:1px solid #1a1a1a;word-break:break-all;white-space:pre-wrap}
      .dc-time{color:#666;font-size:11px}
      .dc-log{color:#ccc}.dc-info{color:#6cf}.dc-warn{color:#fa0}.dc-error{color:#f44}
      .dc-filter-bar{display:flex;gap:4px;padding:6px 10px;background:#0a0a0a;border-bottom:1px solid #222;flex-shrink:0}
      .dc-filter-bar button{background:transparent;color:#888;border:1px solid #333;border-radius:4px;
        padding:3px 10px;font:11px monospace;cursor:pointer}
      .dc-filter-bar button.active{color:#fff;border-color:#555;background:#333}
    `;
    document.head.appendChild(style);

    // Toggle button
    _btnEl = document.createElement('button');
    _btnEl.id = 'dcToggleBtn';
    _btnEl.textContent = '🔧--';
    _btnEl.addEventListener('click', toggleConsole);
    document.body.appendChild(_btnEl);

    // Overlay
    _consoleEl = document.createElement('div');
    _consoleEl.id = 'dcOverlay';
    _consoleEl.innerHTML = `
      <div id="dcHeader">
        <span class="dc-title">Dev Console</span>
        <span id="dcFps">-- FPS</span>
        <button class="dc-reload" id="dcReloadBtn">⟳ Hard</button>
        <button class="dc-clear" id="dcClearBtn">Clear</button>
        <button class="dc-copy" id="dcCopyBtn">Copy</button>
        <button class="dc-close" id="dcCloseBtn">✕</button>
      </div>
      <div class="dc-filter-bar" id="dcFilters">
        <button class="active" data-f="all">ALL</button>
        <button data-f="log">LOG</button>
        <button data-f="warn">WARN</button>
        <button data-f="error">ERR</button>
      </div>
      <div id="dcList"></div>
    `;
    document.body.appendChild(_consoleEl);

    _listEl = document.getElementById('dcList');
    _fpsEl = document.getElementById('dcFps');

    document.getElementById('dcCloseBtn').addEventListener('click', hideConsole);
    document.getElementById('dcCopyBtn').addEventListener('click', copyLogs);
    document.getElementById('dcClearBtn').addEventListener('click', clearLogs);
    document.getElementById('dcReloadBtn').addEventListener('click', hardReload);

    // Filter buttons
    document.getElementById('dcFilters').addEventListener('click', function(e) {
      const btn = e.target.closest('button[data-f]');
      if (!btn) return;
      document.querySelectorAll('#dcFilters button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.f);
    });

    // Start FPS counter
    _fpsLoopId = requestAnimationFrame(fpsLoop);
  }

  let _activeFilter = 'all';
  function applyFilter(f) {
    _activeFilter = f;
    renderAll();
  }

  function renderAll() {
    if (!_listEl) return;
    _listEl.innerHTML = '';
    const filtered = _activeFilter === 'all' ? _logs : _logs.filter(e => e.level === _activeFilter);
    filtered.forEach(renderEntry);
  }

  function toggleConsole() {
    _visible ? hideConsole() : showConsole();
  }

  function showConsole() {
    createUI();
    _visible = true;
    _consoleEl.classList.add('dc-show');
    renderAll();
  }

  function hideConsole() {
    _visible = false;
    if (_consoleEl) _consoleEl.classList.remove('dc-show');
  }

  function copyLogs() {
    const filtered = _activeFilter === 'all' ? _logs : _logs.filter(e => e.level === _activeFilter);
    const text = filtered.map(e => `[${e.time}][${e.level.toUpperCase()}] ${e.text}`).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('dcCopyBtn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); }
      });
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const btn = document.getElementById('dcCopyBtn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); }
    }
  }

  function clearLogs() {
    _logs.length = 0;
    if (_listEl) _listEl.innerHTML = '';
  }

  function hardReload() {
    // 서비스 워커 캐시 + 브라우저 캐시 모두 무효화 후 새로고침
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(n) { return caches.delete(n); }));
      }).then(function() {
        location.reload(true);
      });
    } else {
      location.reload(true);
    }
  }

  // Auto-create UI when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }
})();

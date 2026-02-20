// ===== PUPIL — 동공 거짓말 탐지기 (1인 전용) =====

// MediaPipe FaceMesh loader (deduped with pending promise)
let _pplFaceMeshPromise = null;
function _pplLoadFaceMesh() {
  if (window.FaceMesh) return Promise.resolve();
  if (_pplFaceMeshPromise) return _pplFaceMeshPromise;
  _pplFaceMeshPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => { _pplFaceMeshPromise = null; reject(new Error('FaceMesh load failed')); };
    document.head.appendChild(s);
  });
  return _pplFaceMeshPromise;
}

// Orbitron / JetBrains Mono font loader
let _pplFontsLoaded = false;
function _pplLoadFonts() {
  if (_pplFontsLoaded) return;
  _pplFontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap';
  document.head.appendChild(link);
}

// ===== CONFIG =====
const PPL_CAP = 5, PPL_INTV = 300, PPL_MIN_V = 3, PPL_MAX_RT = 3, PPL_QT = 30;
const PPL_ADAPT_SEC = 15;
const PPL_MEASURE_WINDOW = [800, 1500];
const PPL_CALIB_QS = [
  "지금 이 화면을 보고 있습니까?",
  "오늘 아침에 일어났습니까?",
  "지금 숨을 쉬고 있습니까?",
  "당신은 사람입니까?",
  "지금 한국어를 읽고 있습니까?"
];

// ===== STATE =====
let pplPhase = 'intro';
let pplFM = null, pplStream = null;
let pplCalibData = [], pplTestData = [], pplTestMeta = [];
let pplQIdx = 0, pplTQs = [], pplCritIdx = -1;
let pplTotV = 0, pplTotA = 0;
let pplLM = null, pplEyeOk = false, pplEyeQ = 0, pplLostN = 0;
let pplPupilStream = [], pplBlinkStream = [];
let pplStreamStartT = 0;
let pplMonitorId = null;
let pplAnimLoopActive = false;
let pplAdaptTimerId = null;
let pplSpeechRec = null;
let pplVoiceActive = false;

const ppl$ = id => document.getElementById(id);

// ===== START PUPIL =====
function startPupil() {
  _pplLoadFonts();
  showScreen('pupilGame');
  pplPhase = 'intro';
  pplShowInternal('ppl-intro');
}

function pplShowInternal(id) {
  document.querySelectorAll('#pupilGame .ppl-screen').forEach(s => s.classList.remove('active'));
  const el = ppl$(id);
  if (el) el.classList.add('active');
}

// ===== EYE MONITOR (50ms) =====
function pplStartMonitor() {
  if (pplMonitorId) return;
  pplMonitorId = setInterval(() => {
    if (pplPhase === 'intro' || pplPhase === 'az' || pplPhase === 'res') return;
    if (pplLM) { pplEyeQ = pplCompQ(pplLM); pplEyeOk = pplEyeQ >= PPL_QT; pplLostN = 0; }
    else { pplLostN++; if (pplLostN > 5) { pplEyeOk = false; pplEyeQ = 0; } }
    pplUpdUI();
    pplUpdBtns();
  }, 50);
}

function pplStopMonitor() {
  if (pplMonitorId) { clearInterval(pplMonitorId); pplMonitorId = null; }
}

function pplCompQ(l) {
  if (!l) return 0;
  try {
    const lc = l[468], rc = l[473]; if (!lc || !rc) return 0;
    const lo = Math.abs(l[159].y - l[145].y), ro = Math.abs(l[386].y - l[374].y), ao = (lo + ro) / 2;
    if (ao < .008) return 10;
    const lL = l[33].x, lR = l[133].x, rL = l[362].x, rR = l[263].x;
    if (lc.x < lL || lc.x > lR || rc.x < rL || rc.x > rR) return 15;
    const lg = (lc.x - lL) / (lR - lL + .001), rg = (rc.x - rL) / (rR - rL + .001);
    const gc = 1 - (Math.abs(lg - .5) + Math.abs(rg - .5));
    const fs = 1 - Math.abs(l[1].x - l[168].x) * 10;
    return pplClamp(Math.min(ao / .025, 1) * 40 + Math.max(gc, 0) * 35 + Math.max(fs, 0) * 25, 0, 100);
  } catch { return 0; }
}

function pplUpdUI() {
  [
    { d: 'pplSd1', t: 'pplSt1', b: 'pplSb1', f: 'pplEf1', v: 'pplEv1', w: 'pplEw1' },
    { d: 'pplSd2', t: 'pplSt2', b: 'pplSb2', f: 'pplEf2', v: 'pplEv2', w: 'pplEw2' },
    { d: 'pplSd3', t: 'pplSt3', b: 'pplSb3', f: 'pplEf3', v: 'pplEv3', w: 'pplEw3' }
  ].forEach(s => {
    const d = ppl$(s.d), t = ppl$(s.t), b = ppl$(s.b), f = ppl$(s.f), v = ppl$(s.v), w = ppl$(s.w);
    if (!d || !f) return;
    f.style.width = pplEyeQ + '%'; v.textContent = Math.round(pplEyeQ) + '%';
    const col = pplEyeQ >= 60 ? '#00ff88' : pplEyeQ >= 30 ? '#ffaa00' : '#ff3366';
    f.style.background = col; v.style.color = col;
    if (pplEyeOk) {
      b.className = 'ppl-sb ok'; w.classList.remove('v'); d.className = pplEyeQ >= 60 ? 'ppl-sd a' : 'ppl-sd wr';
      t.textContent = pplEyeQ >= 60 ? '동공 추적 중 — 준비 완료' : '동공 감지됨 — 정면을 봐주세요';
    } else {
      d.className = 'ppl-sd l'; b.className = 'ppl-sb w'; t.textContent = '⚠ 얼굴/눈 미감지'; w.classList.add('v');
    }
  });
}

function pplUpdBtns() {
  ['pplBY', 'pplBN', 'pplCBtn', 'pplTbY', 'pplTbN'].forEach(id => {
    const e = ppl$(id); if (e && e.offsetParent !== null) e.disabled = !pplEyeOk;
  });
}

// ===== MEDIAPIPE =====
const PPL_LI = [468, 469, 470, 471, 472], PPL_RI = [473, 474, 475, 476, 477];
const PPL_LE = [33, 160, 158, 133, 153, 144], PPL_RE = [362, 385, 387, 263, 373, 380];

function pplSetupFM(v, c) {
  const f = new FaceMesh({ locateFile: x => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${x}` });
  f.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .5, minTrackingConfidence: .5 });
  f.onResults(r => {
    const ctx = c.getContext('2d'); c.width = v.videoWidth; c.height = v.videoHeight; ctx.clearRect(0, 0, c.width, c.height);
    if (r.multiFaceLandmarks?.length > 0) { pplLM = r.multiFaceLandmarks[0]; pplDrawOvl(ctx, pplLM, c.width, c.height); pplRecordStream(pplLM); }
    else { pplLM = null; }
    ['pplOvl2', 'pplOvl3'].forEach(cid => {
      const c2 = ppl$(cid); if (!c2 || !pplLM) return;
      const x2 = c2.getContext('2d'); c2.width = v.videoWidth; c2.height = v.videoHeight; x2.clearRect(0, 0, c2.width, c2.height);
      pplDrawOvl(x2, pplLM, c2.width, c2.height);
    });
  });
  pplFM = f; return f;
}

function pplRecordStream(l) {
  if (!l) return;
  const t = Date.now();
  const pir = pplGetPIR(l);
  const ear = pplGetEAR(l);
  if (pir !== null) pplPupilStream.push({ t, pir });
  if (ear !== null) pplBlinkStream.push({ t, ear, blink: ear < 0.18 });
  const cutoff = t - 30000;
  while (pplPupilStream.length && pplPupilStream[0].t < cutoff) pplPupilStream.shift();
  while (pplBlinkStream.length && pplBlinkStream[0].t < cutoff) pplBlinkStream.shift();
}

function pplGetPIR(l) {
  if (!l) return null;
  try {
    const liD = Math.hypot(l[469].x - l[471].x, l[469].y - l[471].y);
    const riD = Math.hypot(l[474].x - l[476].x, l[474].y - l[476].y);
    const lo = Math.abs(l[159].y - l[145].y);
    const ro = Math.abs(l[386].y - l[374].y);
    const lPIR = lo / (liD + .0001);
    const rPIR = ro / (riD + .0001);
    return (lPIR + rPIR) / 2;
  } catch { return null; }
}

function pplGetEAR(l) {
  if (!l) return null;
  try {
    const rV1 = Math.abs(l[159].y - l[145].y);
    const rV2 = Math.abs(l[158].y - l[153].y);
    const rH = Math.abs(l[33].x - l[133].x);
    const rEAR = (rV1 + rV2) / (2 * rH + .0001);
    const lV1 = Math.abs(l[386].y - l[374].y);
    const lV2 = Math.abs(l[387].y - l[373].y);
    const lH = Math.abs(l[362].x - l[263].x);
    const lEAR = (lV1 + lV2) / (2 * lH + .0001);
    return (rEAR + lEAR) / 2;
  } catch { return null; }
}

function pplDrawOvl(ctx, l, w, h) {
  const lc = l[468], rc = l[473];
  const lr = pplIR(l, PPL_LI, w, h), rr = pplIR(l, PPL_RI, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,.35)'; ctx.lineWidth = 1.5; pplDP(ctx, l, PPL_LE, w, h); pplDP(ctx, l, PPL_RE, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(lc.x * w, lc.y * h, lr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rc.x * w, rc.y * h, rr, 0, Math.PI * 2); ctx.stroke();
  const col = pplEyeQ >= 60 ? 'rgba(0,255,136,.6)' : pplEyeQ >= 30 ? 'rgba(255,170,0,.6)' : 'rgba(255,51,102,.5)';
  ctx.strokeStyle = col; ctx.lineWidth = 1; pplXH(ctx, lc.x * w, lc.y * h, 5); pplXH(ctx, rc.x * w, rc.y * h, 5);
}
function pplIR(l, ids, w, h) { const c = l[ids[0]]; let d = 0; for (let i = 1; i < ids.length; i++) { const p = l[ids[i]]; d += Math.hypot((p.x - c.x) * w, (p.y - c.y) * h); } return d / (ids.length - 1); }
function pplDP(ctx, l, ids, w, h) { ctx.beginPath(); ids.forEach((id, i) => { const p = l[id]; i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h); }); ctx.closePath(); ctx.stroke(); }
function pplXH(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }

// ===== EXTRACT =====
function pplExtract(l) {
  if (!l) return null; const q = pplCompQ(l); if (q < PPL_QT) return null;
  const pir = pplGetPIR(l); if (pir === null) return null;
  const ear = pplGetEAR(l);
  const lg = (l[468].x - l[33].x) / (l[133].x - l[33].x + .001);
  const rg = (l[473].x - l[362].x) / (l[263].x - l[362].x + .001);
  const liD = Math.hypot(l[469].x - l[471].x, l[469].y - l[471].y);
  const riD = Math.hypot(l[474].x - l[476].x, l[474].y - l[476].y);
  const lo = Math.abs(l[159].y - l[145].y), ro = Math.abs(l[386].y - l[374].y);
  const lPIR = lo / (liD + .0001), rPIR = ro / (riD + .0001);
  return { pir, ear, gazeS: Math.abs(lg - .5) + Math.abs(rg - .5), asym: Math.abs(lPIR - rPIR), quality: q, t: Date.now() };
}

// ===== CAMERA =====
async function pplStartCam() {
  try {
    pplStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
    // Detect camera disconnection
    pplStream.getVideoTracks().forEach(track => {
      track.onended = () => {
        if (pplPhase !== 'intro' && pplPhase !== 'res') {
          showToast('카메라 연결이 끊겼습니다');
        }
      };
    });
    ['pplVid', 'pplVid2', 'pplVid3'].forEach(id => { const el = ppl$(id); if (el) el.srcObject = pplStream; });
    const v = ppl$('pplVid');
    await new Promise(r => { v.onloadedmetadata = r; });
    const f = pplSetupFM(v, ppl$('pplOvl'));
    pplAnimLoopActive = true;
    (async function loop() { if (pplStream && pplAnimLoopActive) { try { await f.send({ image: v }); } catch {} } if (pplAnimLoopActive) requestAnimationFrame(loop); })();
    return true;
  } catch { showToast('카메라 권한이 필요합니다. 로비로 돌아갑니다.'); return false; }
}

// ===== START APP (from intro) =====
async function pplStartApp() {
  if (pplPhase !== 'intro') return; // double-click guard
  pplShowInternal('ppl-adapt');
  pplPhase = 'adapt';

  // Pre-grant mic permission for SpeechRecognition + warm up TTS (requires user gesture)
  try { const a = await navigator.mediaDevices.getUserMedia({ audio: true }); a.getTracks().forEach(t => t.stop()); } catch {}
  if (window.speechSynthesis) { const w = new SpeechSynthesisUtterance(' '); w.volume = 0; speechSynthesis.speak(w); }

  await _pplLoadFaceMesh();
  const ok = await pplStartCam();
  if (!ok) { pplCleanup(); leaveGame(); return; }

  pplStartMonitor();

  let sec = PPL_ADAPT_SEC;
  const timer = ppl$('pplAdaptTimer');
  if (pplAdaptTimerId) clearInterval(pplAdaptTimerId);
  pplAdaptTimerId = setInterval(() => {
    sec--;
    if (timer) timer.textContent = sec;
    if (sec <= 0) { clearInterval(pplAdaptTimerId); pplAdaptTimerId = null; pplPhase = 'calib'; pplShowInternal('ppl-calib'); pplSetupCalibScreen(); }
  }, 1000);
}

function pplSetupCalibScreen() {
  pplBuildPh('pplCPh', 5); pplBuildStr('pplStr1', PPL_CAP);
  const cBtn = ppl$('pplCBtn');
  if (cBtn) cBtn.style.display = 'block';
  const qtxt = ppl$('pplQtxt');
  if (qtxt) qtxt.textContent = '준비되면 시작을 눌러주세요';
  const qins = ppl$('pplQins');
  if (qins) qins.textContent = '';
}

// ===== VOICE (TTS + STT) =====
function pplSpeak(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.05;
    const voices = speechSynthesis.getVoices();
    const ko = voices.find(v => v.lang.startsWith('ko'));
    if (ko) u.voice = ko;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

function pplStartVoice(onYes, onNo) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  pplStopVoice();
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.onresult = (e) => {
    for (let r = e.resultIndex; r < e.results.length; r++) {
      if (!e.results[r].isFinal) continue;
      for (let i = 0; i < e.results[r].length; i++) {
        const t = e.results[r][i].transcript.trim();
        if (/^(네|예|응|어|맞아|맞습니다|yes)/i.test(t)) { pplStopVoice(); onYes(); return; }
        if (/^(아니|아뇨|노|no)/i.test(t)) { pplStopVoice(); onNo(); return; }
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      pplVoiceActive = false;
      pplSpeechRec = null;
      pplShowVoiceInd(false);
    }
  };
  rec.onend = () => { if (pplVoiceActive) setTimeout(() => { if (pplVoiceActive && pplSpeechRec) try { rec.start(); } catch { pplVoiceActive = false; pplShowVoiceInd(false); } }, 500); };
  pplSpeechRec = rec;
  pplVoiceActive = true;
  pplShowVoiceInd(true);
  try { rec.start(); } catch {}
}

function pplStopVoice() {
  pplVoiceActive = false;
  if (pplSpeechRec) { try { pplSpeechRec.abort(); } catch {} pplSpeechRec = null; }
  pplShowVoiceInd(false);
}

function pplShowVoiceInd(show) {
  ['pplVoice1', 'pplVoice2'].forEach(id => { const el = ppl$(id); if (el) el.style.display = show ? 'flex' : 'none'; });
}

function pplVoiceCalib() {
  pplStartVoice(
    () => { const yn = ppl$('pplYn1'); if (yn && yn.style.display !== 'none') pplAnsCalib('yes'); },
    () => { const yn = ppl$('pplYn1'); if (yn && yn.style.display !== 'none') pplAnsCalib('no'); }
  );
}

function pplVoiceTest() {
  pplStartVoice(
    () => { const yn = ppl$('pplYn2'); if (yn && yn.style.display !== 'none') pplAnsTest('yes'); },
    () => { const yn = ppl$('pplYn2'); if (yn && yn.style.display !== 'none') pplAnsTest('no'); }
  );
}

// ===== CALIBRATION =====
function pplBeginCalib() {
  const cBtn = ppl$('pplCBtn');
  if (cBtn) cBtn.style.display = 'none';
  pplCalibData = []; pplQIdx = 0; pplTotV = 0; pplTotA = 0;
  pplShowCQ(0);
}

function pplShowCQ(i) {
  pplQIdx = i; pplUpdPh('pplCPh', i, 'c'); pplBuildStr('pplStr1', PPL_CAP); pplHideRB('pplRb1');
  const qlbl = ppl$('pplQlbl'); if (qlbl) qlbl.textContent = `캘리브레이션 ${i + 1}/5`;
  const qtxt = ppl$('pplQtxt'); if (qtxt) qtxt.textContent = PPL_CALIB_QS[i];
  const qins = ppl$('pplQins'); if (qins) qins.textContent = '"네" 또는 "아니오"로 대답해주세요';
  const yn1 = ppl$('pplYn1'); if (yn1) yn1.style.display = 'flex';
  pplUpdBtns();
  pplStreamStartT = Date.now();
  pplSpeak(PPL_CALIB_QS[i]).then(() => { if (pplPhase === 'calib') pplVoiceCalib(); });
}

async function pplAnsCalib(a) {
  pplStopVoice();
  const responseTime = Date.now() - pplStreamStartT;
  const yn1 = ppl$('pplYn1'); if (yn1) yn1.style.display = 'none';
  const qins = ppl$('pplQins'); if (qins) qins.textContent = '촬영 중... 카메라를 봐주세요';
  await pplCdown('pplCd1', 3);
  const res = await pplCapValid('calib');
  if (res.ok) {
    const slope = pplCalcSlope(pplStreamStartT + PPL_MEASURE_WINDOW[0], pplStreamStartT + PPL_MEASURE_WINDOW[1]);
    const blinkRate = pplCalcBlinkRate(pplStreamStartT, Date.now());
    pplCalibData.push({ frames: res.frames, slope, blinkRate, responseTime });
    if (pplQIdx < PPL_CALIB_QS.length - 1) pplShowCQ(pplQIdx + 1);
    else { pplStopVoice(); pplPhase = 'cq'; pplShowInternal('ppl-cq'); }
  } else {
    if (qins) qins.textContent = '눈 감지 실패. 다시 시도해주세요.';
    if (yn1) yn1.style.display = 'flex';
    pplUpdBtns();
    pplVoiceCalib();
  }
}

// ===== TEST =====
function pplBeginTest() {
  const main = ppl$('pplQMain').value.trim();
  if (!main) { ppl$('pplQMain').style.borderColor = '#ff3366'; return; }
  const irrRaw = ppl$('pplQIrr').value.trim();
  const irrs = irrRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  if (irrs.length < 2) { ppl$('pplQIrr').style.borderColor = '#ff3366'; return; }
  pplTQs = irrs.slice(0, 4);
  pplCritIdx = Math.floor(Math.random() * (pplTQs.length + 1));
  pplTQs.splice(pplCritIdx, 0, main);
  pplTestData = []; pplTestMeta = []; pplQIdx = 0;
  pplPhase = 'test'; pplShowInternal('ppl-test');
  pplBuildPh('pplTPh', pplTQs.length); pplBuildStr('pplStr2', PPL_CAP, true);
  pplShowTQ(0);
}

function pplShowTQ(i) {
  pplQIdx = i; pplUpdPh('pplTPh', i, 't'); pplBuildStr('pplStr2', PPL_CAP, true); pplHideRB('pplRb2');
  const tqlbl = ppl$('pplTqlbl'); if (tqlbl) tqlbl.textContent = `테스트 ${i + 1}/${pplTQs.length}`;
  const tqtxt = ppl$('pplTqtxt'); if (tqtxt) tqtxt.textContent = pplTQs[i];
  const tqins = ppl$('pplTqins'); if (tqins) tqins.textContent = '솔직하게 대답해주세요';
  const yn2 = ppl$('pplYn2'); if (yn2) yn2.style.display = 'flex';
  pplUpdBtns();
  pplStreamStartT = Date.now();
  pplSpeak(pplTQs[i]).then(() => { if (pplPhase === 'test') pplVoiceTest(); });
}

async function pplAnsTest(a) {
  pplStopVoice();
  const responseTime = Date.now() - pplStreamStartT;
  const yn2 = ppl$('pplYn2'); if (yn2) yn2.style.display = 'none';
  const tqins = ppl$('pplTqins'); if (tqins) tqins.textContent = '촬영 중...';
  await pplCdown('pplCd2', 3);
  const res = await pplCapValid('test');
  if (res.ok) {
    const slope = pplCalcSlope(pplStreamStartT + PPL_MEASURE_WINDOW[0], pplStreamStartT + PPL_MEASURE_WINDOW[1]);
    const blinkRate = pplCalcBlinkRate(pplStreamStartT, Date.now());
    pplTestData.push({ frames: res.frames, slope, blinkRate, responseTime });
    pplTestMeta.push({ isCritical: pplQIdx === pplCritIdx, responseTime });
    if (pplQIdx < pplTQs.length - 1) pplShowTQ(pplQIdx + 1);
    else { pplStopVoice(); pplPhase = 'az'; pplShowInternal('ppl-az'); pplAnalyze(); }
  } else {
    if (tqins) tqins.textContent = '눈 감지 실패. 다시 시도해주세요.';
    if (yn2) yn2.style.display = 'flex';
    pplUpdBtns();
    pplVoiceTest();
  }
}

// ===== CAPTURE WITH VALIDATION =====
async function pplCapValid(mode) {
  const bid = mode === 'calib' ? 'pplRb1' : 'pplRb2', btid = mode === 'calib' ? 'pplRbt1' : 'pplRbt2';
  for (let att = 0; att < PPL_MAX_RT; att++) {
    if (att > 0) { pplShowRB(bid, btid, `재촬영 ${att}/${PPL_MAX_RT}`); await pplSlp(1200); }
    const { valid, failed } = await pplCapRound(mode);
    pplTotA += PPL_CAP; pplTotV += valid.length;
    if (valid.length >= PPL_MIN_V) { pplHideRB(bid); return { ok: true, frames: valid }; }
    pplShowRB(bid, btid, `${PPL_CAP - valid.length}장 실패. 재촬영...`);
  }
  pplHideRB(bid); return { ok: false, frames: [] };
}

async function pplCapRound(mode) {
  const sid = mode === 'calib' ? 'pplStr1' : 'pplStr2', fid = mode === 'calib' ? 'pplFl1' : 'pplFl2', isT = mode === 'test';
  pplBuildStr(sid, PPL_CAP, isT); const valid = [], failed = [];
  for (let i = 0; i < PPL_CAP; i++) {
    await pplSlp(PPL_INTV); const data = pplExtract(pplLM);
    const fl = ppl$(fid); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
    const v = ppl$('pplVid'), tc = document.createElement('canvas'); tc.width = 88; tc.height = 88;
    const tx = tc.getContext('2d'); tx.save(); tx.scale(-1, 1); tx.drawImage(v, -88, 0, 88, 88); tx.restore();
    const ths = ppl$(sid) ? ppl$(sid).querySelectorAll('.ppl-th') : [];
    if (ths[i]) {
      ths[i].innerHTML = `<img src="${tc.toDataURL('image/jpeg', .6)}">`;
      if (data) { ths[i].classList.add('ok'); if (isT) ths[i].classList.add('t'); valid.push(data); }
      else { ths[i].classList.add('fa'); failed.push(i); }
    }
  }
  return { valid, failed };
}

// ===== SIGNAL PROCESSING =====
function pplCalcSlope(t0, t1) {
  const pts = pplPupilStream.filter(p => p.t >= t0 && p.t <= t1);
  if (pts.length < 2) return 0;
  const n = pts.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  pts.forEach(p => { const x = (p.t - t0) / 1000; sx += x; sy += p.pir; sxy += x * p.pir; sx2 += x * x; });
  return (n * sxy - sx * sy) / (n * sx2 - sx * sx + .0001);
}

function pplCalcBlinkRate(t0, t1) {
  const pts = pplBlinkStream.filter(p => p.t >= t0 && p.t <= t1);
  if (pts.length < 5) return 0;
  let blinks = 0, wasBlink = false;
  pts.forEach(p => { if (p.blink && !wasBlink) blinks++; wasBlink = p.blink; });
  const durSec = (t1 - t0) / 1000;
  return blinks / (durSec / 60);
}

// ===== ANALYSIS =====
async function pplAnalyze() {
  const d = ppl$('pplAzD');
  const steps = ['동공/홍채 비율(PIR) 계산 중...', 'Z-score 정규화 적용 중...', '깜빡임 패턴 분석 중...', '동공 확장 속도 계산 중...', '응답 시간 분석 중...', 'CIT 대조 비교 중...', '로지스틱 회귀 복합 점수 산출 중...', '최종 판정 생성 중...'];
  for (let i = 0; i < steps.length; i++) { await pplSlp(400); if (d) d.innerHTML = steps.slice(0, i + 1).join('<br>'); }
  await pplSlp(600);
  pplShowResult(pplCalcResult());
}

function pplCalcResult() {
  const cFrames = pplCalibData.flatMap(d => d.frames).filter(Boolean);
  if (!cFrames.length) return pplDefaultResult();

  // Baseline statistics
  const bPIR = pplAvg(cFrames.map(f => f.pir));
  const bGaze = pplAvg(cFrames.map(f => f.gazeS));
  const bAsym = pplAvg(cFrames.map(f => f.asym));
  const bSlope = pplAvg(pplCalibData.map(d => d.slope));
  const bBlink = pplAvg(pplCalibData.map(d => d.blinkRate));
  const bRT = pplAvg(pplCalibData.map(d => d.responseTime));

  // Robust std floors — prevent tiny denominators while allowing meaningful z-scores
  const bPIR_sd = Math.max(pplStd(cFrames.map(f => f.pir)), bPIR * 0.005, 0.003);
  const bSlope_sd = Math.max(pplStd(pplCalibData.map(d => d.slope)), 0.0005);
  const bBlink_sd = Math.max(pplStd(pplCalibData.map(d => d.blinkRate)), 2);
  const bRT_sd = Math.max(pplStd(pplCalibData.map(d => d.responseTime)), 150);
  const bGaze_sd = Math.max(pplStd(cFrames.map(f => f.gazeS)), 0.003);

  // Extract critical vs irrelevant test data
  let critFrames = [], irrFrames = [];
  let critSlope = 0, critBlink = 0, critRT = 0;

  pplTestData.forEach((td, i) => {
    const meta = pplTestMeta[i];
    if (meta?.isCritical) { critFrames.push(...td.frames); critSlope = td.slope; critBlink = td.blinkRate; critRT = td.responseTime; }
    else { irrFrames.push(...td.frames); }
  });

  if (!critFrames.length) return pplDefaultResult();

  const tPIR_crit = pplAvg(critFrames.map(f => f.pir));
  const tPIR_irr = irrFrames.length ? pplAvg(irrFrames.map(f => f.pir)) : bPIR;
  const tGaze_crit = pplAvg(critFrames.map(f => f.gazeS));
  const tAsym_crit = pplAvg(critFrames.map(f => f.asym));

  // Z-scores with robust std (amplified sensitivity)
  const zPIR = (tPIR_crit - bPIR) / bPIR_sd;
  const citZ = (tPIR_crit - tPIR_irr) / bPIR_sd;
  const slopeZ = (critSlope - bSlope) / bSlope_sd;
  const blinkZ = -(critBlink - bBlink) / bBlink_sd;
  const rtZ = (critRT - bRT) / bRT_sd;
  const gazeZ = (tGaze_crit - bGaze) / bGaze_sd;
  const asymDiff = tAsym_crit - bAsym;
  const pirChange = ((tPIR_crit - bPIR) / (bPIR + .0001)) * 100;

  // CIT rank: position of critical item among all test items (0=lowest, 1=highest)
  const allTestPIRs = pplTestData.map(td => pplAvg(td.frames.map(f => f.pir)));
  const nOther = allTestPIRs.length - 1;
  const citRank = nOther > 0 ? allTestPIRs.filter((p, i) => i !== pplCritIdx && p < tPIR_crit).length / nOther : 0.5;

  // Logistic regression — amplified scale for decisive verdicts
  // Old range: logit ~[-0.5, +0.5] → sigmoid 38-62% (always uncertain)
  // New range: logit ~[-4, +8] → sigmoid 2-99% (clear verdicts)
  let logit = -0.3;
  logit += pplClamp(zPIR, -3, 6) * 1.2;
  logit += pplClamp(citZ, -3, 5) * 0.8;
  logit += (citRank - 0.5) * 2.0;
  logit += pplClamp(slopeZ, -3, 5) * 0.7;
  logit += pplClamp(blinkZ, -3, 4) * 0.5;
  logit += pplClamp(rtZ, -2, 5) * 0.5;
  logit += pplClamp(gazeZ, -2, 4) * 0.4;
  logit += pplClamp(asymDiff * 80, -2, 3) * 0.3;

  const prob = 1 / (1 + Math.exp(-logit));
  const score = pplClamp(Math.round(prob * 100), 5, 98);

  return { score, pirChange, slopeVal: critSlope, blinkChange: critBlink - bBlink, responseTime: critRT, gazeVal: tGaze_crit, asymVal: tAsym_crit, bPIR, tPIR: tPIR_crit, zPIR };
}

function pplDefaultResult() { return { score: 50, pirChange: 0, slopeVal: 0, blinkChange: 0, responseTime: 0, gazeVal: 0, asymVal: 0, bPIR: 0, tPIR: 0, zPIR: 0 }; }

// ===== SHOW RESULT =====
function pplShowResult(r) {
  pplPhase = 'res'; pplShowInternal('ppl-res');
  const qr = pplTotA > 0 ? pplTotV / pplTotA : 0; const b = ppl$('pplDqb');
  if (b) {
    if (qr >= .8) { b.className = 'ppl-dqb h'; b.textContent = `DATA QUALITY: HIGH (${Math.round(qr * 100)}%)`; }
    else if (qr >= .5) { b.className = 'ppl-dqb m'; b.textContent = `DATA QUALITY: MEDIUM (${Math.round(qr * 100)}%)`; }
    else { b.className = 'ppl-dqb lo'; b.textContent = `DATA QUALITY: LOW (${Math.round(qr * 100)}%)`; }
  }

  const s = r.score, circ = 2 * Math.PI * 68;
  setTimeout(() => {
    const a = ppl$('pplRArc');
    if (a) {
      a.style.strokeDasharray = `${(s / 100) * circ} ${circ}`;
      if (s >= 65) { a.style.stroke = '#ff3366'; const pct = ppl$('pplRPct'); if (pct) pct.style.color = '#ff3366'; const lbl = ppl$('pplRLbl'); if (lbl) { lbl.textContent = '거짓말 의심'; lbl.style.color = '#ff3366'; } }
      else if (s >= 45) { a.style.stroke = '#ffaa00'; const pct = ppl$('pplRPct'); if (pct) pct.style.color = '#ffaa00'; const lbl = ppl$('pplRLbl'); if (lbl) { lbl.textContent = '판별 불확실'; lbl.style.color = '#ffaa00'; } }
      else { a.style.stroke = '#00ff88'; const pct = ppl$('pplRPct'); if (pct) pct.style.color = '#00ff88'; const lbl = ppl$('pplRLbl'); if (lbl) { lbl.textContent = '진실 추정'; lbl.style.color = '#00ff88'; } }
    }
  }, 100);

  pplAnimN('pplRPct', 0, s, 2000, '%');
  const bpD = ppl$('pplBpD'); if (bpD) bpD.textContent = r.bPIR.toFixed(4);
  const tpD = ppl$('pplTpD'); if (tpD) tpD.textContent = r.tPIR.toFixed(4);

  pplSetMetric('pplMD', `${r.pirChange >= 0 ? '+' : ''}${r.pirChange.toFixed(1)}%`, 'pplBD', pplClamp(Math.abs(r.pirChange) * 5, 0, 100));
  pplSetMetric('pplMS', r.slopeVal.toFixed(4), 'pplBS', pplClamp(Math.abs(r.slopeVal) * 500, 0, 100));
  pplSetMetric('pplMB', `${r.blinkChange >= 0 ? '+' : ''}${r.blinkChange.toFixed(1)}`, 'pplBB', pplClamp(Math.abs(r.blinkChange) * 3, 0, 100));
  pplSetMetric('pplMR', Math.round(r.responseTime), 'pplBR', pplClamp(r.responseTime / 5000 * 100, 0, 100));
  pplSetMetric('pplMG', r.gazeVal.toFixed(3), 'pplBG2', pplClamp(r.gazeVal * 200, 0, 100));
  pplSetMetric('pplMA', r.asymVal.toFixed(4), 'pplBA', pplClamp(r.asymVal * 500, 0, 100));

  const mn = ppl$('pplMethodNote');
  if (mn) mn.textContent = `Z-SCORE: ${r.zPIR >= 0 ? '+' : ''}${r.zPIR.toFixed(2)} · CIT PROTOCOL · LOGISTIC REGRESSION`;

  setTimeout(() => {
    document.querySelectorAll('#pupilGame .ppl-db .ppl-fill').forEach(e => e.style.transition = 'width 1.5s ease');
  }, 200);
}

function pplSetMetric(mId, mVal, bId, bWidth) {
  const m = ppl$(mId); if (m) m.textContent = mVal;
  const b = ppl$(bId); if (b) b.style.width = bWidth + '%';
}

// ===== CLEANUP & RESET =====
function pplCleanup() {
  pplStopVoice();
  if (window.speechSynthesis) speechSynthesis.cancel();
  pplStopMonitor();
  if (pplAdaptTimerId) { clearInterval(pplAdaptTimerId); pplAdaptTimerId = null; }
  pplAnimLoopActive = false;
  if (pplStream) {
    pplStream.getTracks().forEach(t => t.stop());
    pplStream = null;
  }
  pplFM = null;
  pplLM = null;
  pplPhase = 'intro';
  pplCalibData = []; pplTestData = []; pplTestMeta = [];
  pplTQs = []; pplCritIdx = -1; pplQIdx = 0;
  pplTotV = 0; pplTotA = 0;
  pplPupilStream = []; pplBlinkStream = [];
  pplEyeOk = false; pplEyeQ = 0; pplLostN = 0;
}

function pplResetAll() {
  pplCalibData = []; pplTestData = []; pplTestMeta = []; pplTQs = []; pplCritIdx = -1; pplQIdx = 0; pplTotV = 0; pplTotA = 0;
  pplPupilStream = []; pplBlinkStream = [];
  pplEyeOk = false; pplEyeQ = 0; pplLostN = 0; pplStreamStartT = 0;
  const qMain = ppl$('pplQMain'); if (qMain) qMain.value = '';
  const qIrr = ppl$('pplQIrr'); if (qIrr) qIrr.value = '';
  const rArc = ppl$('pplRArc'); if (rArc) rArc.style.strokeDasharray = '0 428';
  const rPct = ppl$('pplRPct'); if (rPct) rPct.textContent = '0%';
  pplPhase = 'calib'; pplShowInternal('ppl-calib'); pplSetupCalibScreen();
}

function pplLeavePupil() {
  pplCleanup();
  leaveGame();
}

// ===== UTILS =====
function pplAvg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function pplStd(a) { if (a.length < 2) return .001; const m = pplAvg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || .001; }
function pplClamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function pplSlp(ms) { return new Promise(r => setTimeout(r, ms)); }
function pplAnimN(id, fr, to, dur, sf = '') {
  const el = ppl$(id); if (!el) return;
  const st = performance.now();
  (function u(n) { const p = Math.min((n - st) / dur, 1); el.textContent = Math.round(fr + (to - fr) * (1 - Math.pow(1 - p, 3))) + sf; if (p < 1) requestAnimationFrame(u); })(st);
}
function pplBuildPh(id, n) { const el = ppl$(id); if (!el) return; el.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'ppl-ps'; el.appendChild(d); } }
function pplUpdPh(id, cur, type) { const el = ppl$(id); if (!el) return; el.querySelectorAll('.ppl-ps').forEach((s, i) => { s.className = 'ppl-ps'; if (i < cur) s.classList.add(type === 't' ? 'td' : 'd'); if (i === cur) s.classList.add(type === 't' ? 'tc' : 'c'); }); }
function pplBuildStr(id, n, t = false) { const el = ppl$(id); if (!el) return; el.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'ppl-th'; el.appendChild(d); } }
async function pplCdown(id, sec) { const el = ppl$(id); if (!el) return; for (let i = sec; i > 0; i--) { el.textContent = i; el.classList.add('v'); await pplSlp(600); } el.textContent = '📸'; await pplSlp(350); el.classList.remove('v'); }
function pplShowRB(bid, tid, txt) { const b = ppl$(bid); if (b) b.style.display = 'flex'; const t = ppl$(tid); if (t) t.textContent = txt; }
function pplHideRB(bid) { const b = ppl$(bid); if (b) b.style.display = 'none'; }

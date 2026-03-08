// ===== FORTRESS — Audio System =====
// Separated from fortress.js for modularity

// ===== WEB AUDIO =====
let _fortAudioCtx = null;
function _fortGetAudioCtx() {
  if (!_fortAudioCtx) _fortAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _fortAudioCtx;
}
function fortPlaySound(type, tribe) {
  try {
    const ctx = _fortGetAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (type === 'fire') _fortSoundFire(ctx, tribe || 'fire');
    else if (type === 'explosion') _fortSoundExplosion(ctx);
    else if (type === 'bird') _fortSoundBird(ctx);
    else if (type === 'hit') _fortSoundHit(ctx);
    else if (type === 'move') _fortSoundMove(ctx);
  } catch(e) {}
}
function _fortSoundFire(ctx, tribe) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  if (tribe === 'rock') {
    osc.type = 'square'; osc.frequency.setValueAtTime(90, now); osc.frequency.exponentialRampToValueAtTime(35, now+0.5);
    gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  } else if (tribe === 'wind') {
    // noise-like whoosh
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(150, now+0.3);
    gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.4);
  } else if (tribe === 'thunder') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(80, now+0.25);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.35);
  } else if (tribe === 'spirit') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(400, now+0.3);
    gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.45);
  } else { // fire default
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.exponentialRampToValueAtTime(60, now+0.35);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.45);
  }
  osc.start(now); osc.stop(now+0.7);
}
function _fortSoundExplosion(ctx) {
  try {
    const sr = ctx.sampleRate, dur = 0.6, buf = ctx.createBuffer(1, sr*dur, sr), d = buf.getChannelData(0);
    for (let i = 0; i < sr*dur; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/(sr*0.15));
    const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), gain = ctx.createGain();
    filt.type = 'lowpass'; filt.frequency.value = 350;
    src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.7, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.6);
    src.start(now);
  } catch(e) {}
}
function _fortSoundBird(ctx) {
  const now = ctx.currentTime;
  const offsets = [0, 0.08, 0.16];
  for (let i = 0; i < 3; i++) {
    const t = offsets[i];
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(1200+i*200, now+t); o.frequency.linearRampToValueAtTime(900+i*150, now+t+0.06);
    g.gain.setValueAtTime(0.12, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.1);
    o.start(now+t); o.stop(now+t+0.12);
  }
}
function _fortSoundHit(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(60, now+0.2);
  gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.3);
  osc.start(now); osc.stop(now+0.35);
}
function _fortSoundMove(ctx) {
  try {
    const now = ctx.currentTime, sr = ctx.sampleRate, dur=0.12;
    const buf = ctx.createBuffer(1, sr*dur, sr), d=buf.getChannelData(0);
    for(let i=0;i<sr*dur;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(sr*0.04));
    const src=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    f.type='bandpass'; f.frequency.value=200; src.buffer=buf;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.08, now);
    src.start(now);
  } catch(e) {}
}

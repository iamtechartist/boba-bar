// Procedural Web Audio: pours, drizzles, plops, ice clinks, shake rattle, seal, straw pop.
// Everything is scheduled on ctx.currentTime so it stays in sync with the visuals.

export function createAudio() {
  let ctx = null, master = null, noise = null;
  let muted = false;
  let lastPlop = 0, lastClink = 0;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const ready = () => ctx && ctx.state === 'running' && !muted;
  const R = (a, b) => a + Math.random() * (b - a);

  function src(t0, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true;
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
    return s;
  }
  function env(g, t0, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
  }
  function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function tone(t0, f0, f1, dur, vol, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain(); env(g, t0, 0.004, vol, 0, dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst(t0, dur, vol, type, f, q = 0.8) {
    const s = src(t0, dur);
    const b = filt(type, f, q);
    const g = ctx.createGain(); env(g, t0, 0.003, vol, 0, dur);
    s.connect(b).connect(g).connect(master);
  }
  function bubbles(t0, dur, rate, vol, fLo, fHi) {
    let t = t0;
    while (t < t0 + dur) {
      t += -Math.log(1 - Math.random()) / rate;
      const f = R(fLo, fHi);
      tone(t, f, f * R(1.6, 2.4), R(0.025, 0.05), vol * R(0.4, 1));
    }
  }

  const api = {
    unlock() { init(); if (ctx && ctx.state !== 'running') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.03);
    },
    get muted() { return muted; },
    pour(dur, kind = 'tea') {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const s = src(t0, dur + 0.4);
      const bp = filt('bandpass', kind === 'milk' ? 650 : 900, 0.9);
      const lp = filt('lowpass', 3200, 0.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = R(5, 8);
      const lg = ctx.createGain(); lg.gain.value = 220;
      lfo.connect(lg).connect(bp.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.5);
      const g = ctx.createGain(); env(g, t0, 0.12, 0.2, Math.max(0, dur - 0.2), 0.35);
      s.connect(bp).connect(lp).connect(g).connect(master);
      bubbles(t0 + 0.25, dur - 0.2, 14, 0.035, 380, 900);
    },
    drizzle(dur) {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const s = src(t0, dur);
      const bp = filt('bandpass', 1800, 2.2);
      bp.frequency.setValueAtTime(2400, t0); bp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
      const g = ctx.createGain(); env(g, t0, 0.2, 0.05, dur - 0.5, 0.3);
      s.connect(bp).connect(g).connect(master);
    },
    foam(dur) {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const s = src(t0, dur);
      const hp = filt('highpass', 2600, 0.7);
      const g = ctx.createGain(); env(g, t0, 0.15, 0.07, dur - 0.4, 0.25);
      s.connect(hp).connect(g).connect(master);
      bubbles(t0 + 0.2, dur - 0.3, 22, 0.012, 1200, 2600);
    },
    plop(speed = 1) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (t - lastPlop < 0.035) return;
      lastPlop = t;
      const f = R(240, 480);
      tone(t, f, f * R(1.8, 2.6), R(0.04, 0.07), Math.min(0.09, 0.03 + speed * 0.02));
    },
    splash(big = false) {
      if (!ready()) return;
      const t = ctx.currentTime;
      burst(t, big ? 0.22 : 0.12, big ? 0.16 : 0.07, 'lowpass', big ? 1400 : 2200);
      tone(t, big ? 190 : 320, big ? 110 : 200, 0.12, big ? 0.12 : 0.05);
    },
    clink(rel = 1, both = true) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (t - lastClink < 0.06) return;
      lastClink = t;
      const v = Math.min(0.06, 0.012 * rel) * (both ? 1 : 0.6);
      const base = R(0.9, 1.15);
      for (const [f, d] of [[2150, 0.35], [3420, 0.25], [4980, 0.18], [6900, 0.12]]) tone(t, f * base, f * base * 0.995, d * R(0.7, 1.2), v * R(0.5, 1));
      burst(t, 0.015, v * 1.5, 'highpass', 4000);
    },
    rattle(dur = 1.2, ice = false) {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      // shaker hits on each swing + a sloshing body
      for (let k = 0; k < dur * 6.4; k++) {
        const t = t0 + k / 6.4 + R(-0.01, 0.01);
        burst(t, 0.09, 0.09 * Math.exp(-k * 0.1), 'bandpass', R(1800, 2800), 1.2);
        if (ice) for (let j = 0; j < 2; j++) setTimeout(() => api.clink(R(3, 6), true), (t - t0 + R(0, 0.06)) * 1000);
      }
      const s = src(t0, dur + 0.6);
      const lp = filt('lowpass', 500, 0.8);
      const g = ctx.createGain(); env(g, t0, 0.1, 0.22, dur - 0.1, 0.6);
      s.connect(lp).connect(g).connect(master);
    },
    seal() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.28;
      tone(t, 120, 60, 0.16, 0.22);
      burst(t, 0.07, 0.12, 'highpass', 1600);
      tone(t + 0.01, 2400, 1800, 0.02, 0.04, 'triangle');
    },
    snap(v = 1) {
      if (!ready()) return;
      const t = ctx.currentTime;
      burst(t, 0.025, 0.14 * v, 'highpass', 2200);
      tone(t, 1900, 1500, 0.02, 0.06 * v, 'triangle');
      tone(t, 260, 180, 0.05, 0.06 * v);
    },
    pop() {
      if (!ready()) return;
      const t = ctx.currentTime;
      burst(t, 0.035, 0.22, 'bandpass', 1300, 1.6);
      tone(t, 760, 240, 0.07, 0.16);
      tone(t, 150, 90, 0.09, 0.14);
    },
    plunk() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 320, 150, 0.09, 0.1);
      burst(t, 0.06, 0.05, 'lowpass', 1500);
    },
    whoosh(d = 0.35) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const s = src(t, d);
      const bp = filt('bandpass', 400, 1.4);
      bp.frequency.setValueAtTime(380, t); bp.frequency.exponentialRampToValueAtTime(1800, t + d);
      const g = ctx.createGain(); env(g, t, d * 0.5, 0.06, 0, d * 0.5);
      s.connect(bp).connect(g).connect(master);
    },
    paper() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const s = src(t, 0.5);
      const hp = filt('highpass', 1900, 0.6);
      const g = ctx.createGain(); env(g, t, 0.05, 0.05, 0.25, 0.2);
      s.connect(hp).connect(g).connect(master);
    },
    thud() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 95, 55, 0.2, 0.26);
      burst(t, 0.08, 0.08, 'lowpass', 600);
      tone(t, 1700, 1300, 0.03, 0.02, 'triangle');
    },
    tick() {
      if (!ready()) return;
      tone(ctx.currentTime, 1900, 1700, 0.018, 0.018, 'triangle');
    },
  };
  return api;
}

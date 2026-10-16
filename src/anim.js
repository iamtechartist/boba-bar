// Tiny pausable timeline: tweens + waits on the simulation clock, cancellable by token.

export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
  in3: (t) => t * t * t,
  back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

export class Token {
  constructor() { this.dead = false; }
  cancel() { this.dead = true; }
}

export class Timeline {
  constructor() {
    this.time = 0;
    this.items = [];
  }
  update(dt) {
    this.time += dt;
    const items = this.items;
    this.items = [];
    const keep = [];
    for (const it of items) {
      if (it.token && it.token.dead) { it.resolve(false); continue; }
      if (it.kind === 'wait') {
        if (this.time >= it.until) it.resolve(true); else keep.push(it);
      } else {
        it.t += dt;
        const k = Math.min(1, it.t / it.dur);
        it.fn(it.ease(k), k);
        if (k >= 1) it.resolve(true); else keep.push(it);
      }
    }
    // items added during callbacks were pushed to this.items
    this.items = keep.concat(this.items);
  }
  wait(sec, token) {
    return new Promise((resolve) => this.items.push({ kind: 'wait', until: this.time + sec, token, resolve }));
  }
  tween(dur, fn, opts = {}) {
    fn((opts.ease || ease.inOut)(0), 0);
    return new Promise((resolve) => this.items.push({ kind: 'tween', t: 0, dur: Math.max(1e-4, dur), fn, ease: opts.ease || ease.inOut, token: opts.token, resolve }));
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

import * as THREE from 'three';
import { LQ } from './glsl.js';
import { CUP } from './cup.js';
import { sceneColor } from './color.js';
import { Timeline, Token, ease, lerp, clamp } from './anim.js';
import { TEAS, MILKS, SYRUPS, TOPPINGS, ICE, byId, recipeFromPreset, PRESETS } from './recipes.js';

// Turns recipes into animated builds: pours, milk clouds, pearl rain, ice, foam, lid, straw.

const B = () => LQ.uLqBottom.value;
const setV3 = (v, c) => v.set(c.r, c.g, c.b);
const FULL = 1.3;

function layersFor(r) {
  const tea = byId(TEAS, r.tea);
  const milk = byId(MILKS, r.milk);
  const hasMilk = milk && milk.id !== 'none';
  const syrup = byId(SYRUPS, r.syrup);
  const hasSyrup = syrup && syrup.id !== 'none';
  const pearls = r.toppings.includes('pearls');
  const b = B();
  const level = tea || hasMilk ? FULL : b;
  let c1, c2, c3, s1, s2, s3, top1 = (b + FULL) / 2, top2 = FULL - 0.2;
  if (tea && hasMilk) {
    const mt = new THREE.Color(tea.milk).lerp(new THREE.Color(milk.color), milk.tint);
    if (tea.style === 'under') {
      c1 = milk.color; s1 = 42; c2 = c3 = '#' + new THREE.Color(tea.tea).lerp(new THREE.Color(tea.milk), 0.35).getHexString(); s2 = s3 = Math.max(tea.sigTea, 40);
      top1 = b + (FULL - b) * 0.46;
    } else if (tea.style === 'float') {
      c1 = c2 = tea.tea; s1 = s2 = tea.sigTea + 14; c3 = milk.color; s3 = 45; top2 = FULL - 0.11;
    } else {
      c1 = c2 = c3 = '#' + mt.getHexString(); s1 = s2 = s3 = tea.sigMilk;
    }
  } else if (tea) {
    c1 = c2 = c3 = tea.tea; s1 = s2 = s3 = tea.sigTea;
  } else if (hasMilk) {
    c1 = c2 = c3 = milk.color; s1 = s2 = s3 = 45;
  } else {
    c1 = c2 = c3 = '#f2ede4'; s1 = s2 = s3 = 60;
  }
  let c0 = c1, s0 = s1, top0 = b;
  if (hasSyrup) {
    c0 = syrup.layer; s0 = syrup.layerSig;
    top0 = b + (pearls ? 0.25 : 0.13);
  }
  return {
    level,
    cols: [c0, c1, c2, c3].map((h) => sceneColor(h)),
    sig: [s0, s1, s2, s3],
    tops: [top0, Math.max(top0 + 0.02, top1), top2],
    fe: [hasSyrup ? 0.07 : 0.03, 0.035, 0.045],
  };
}

export function createDirector({ cup, drink, toppings, studio, audio, rig }) {
  const tl = new Timeline();
  let token = new Token();
  let chain = Promise.resolve();
  let listeners = [];

  const recipe = { tea: null, milk: 'none', syrup: 'none', toppings: [], ice: 0, sleeve: 'kraft', lid: 'film', straw: 'black', backdrop: '#f2b48e' };
  const ui = { presetId: null, name: 'Boba Bar', tagline: '', sealed: false, busy: false };
  const notify = () => listeners.forEach((f) => f(recipe, ui));

  // current (animated) layer state
  const cur = { cols: [0, 1, 2, 3].map(() => new THREE.Color('#ffffff')), sig: [60, 60, 60, 60], tops: [B(), 0.7, 1.1], fe: [0.03, 0.035, 0.045] };
  const applyLayers = () => {
    for (let i = 0; i < 4; i++) { LQ.uLayerCol.value[i].set(cur.cols[i].r, cur.cols[i].g, cur.cols[i].b); LQ.uLayerSig.value[i] = cur.sig[i]; }
    for (let i = 0; i < 3; i++) { LQ.uLayerTop.value[i] = cur.tops[i]; LQ.uLayerFe.value[i] = cur.fe[i]; }
  };
  function setLayersNow(L) {
    for (let i = 0; i < 4; i++) { cur.cols[i].copy(L.cols[i]); cur.sig[i] = L.sig[i]; }
    for (let i = 0; i < 3; i++) { cur.tops[i] = L.tops[i]; cur.fe[i] = L.fe[i]; }
    applyLayers();
  }
  function tweenLayers(L, dur, tk) {
    const from = { cols: cur.cols.map((c) => c.clone()), sig: [...cur.sig], tops: [...cur.tops], fe: [...cur.fe] };
    return tl.tween(dur, (e) => {
      for (let i = 0; i < 4; i++) { cur.cols[i].copy(from.cols[i]).lerp(L.cols[i], e); cur.sig[i] = lerp(from.sig[i], L.sig[i], e); }
      for (let i = 0; i < 3; i++) { cur.tops[i] = lerp(from.tops[i], L.tops[i], e); cur.fe[i] = lerp(from.fe[i], L.fe[i], e); }
      applyLayers();
    }, { token: tk });
  }

  // ------------------------------------------------------------------ primitives
  const streamWorld = new THREE.Vector3(0.11, 0, 0.13);
  const surfW = new THREE.Vector3();
  let pourState = null; // {color, rad, head, tail}

  function surfaceWorld(out) {
    // world point where the stream meets the drink (or the cup floor / pile)
    const lvl = drink.state.level;
    const local = out.set(0, Math.max(lvl, B() + 0.01), 0).applyMatrix4(cup.local.matrixWorld);
    out.x = streamWorld.x; out.z = streamWorld.z;
    return out.setY(local.y);
  }

  async function pour({ hex, toLevel, dur = 1.3, radius = 0.032, tk, kind = 'tea', onFlow }) {
    const col = sceneColor(hex);
    const SU = drink.streamUniforms;
    drink.setStream({ on: true, x: streamWorld.x, z: streamWorld.z, color: col, radius: 0 });
    pourState = { head: 1, tail: 1, rad: 0, color: col, kind };
    audio.pour(dur + 0.35, kind);
    // stream front falls in
    tl.tween(0.18, (e) => { pourState.rad = radius * e; }, { token: tk, ease: ease.out });
    await tl.tween(0.28, (e) => { pourState.head = 1 - e; }, { token: tk, ease: ease.in });
    if (tk.dead) return;
    const from = drink.state.level;
    if (onFlow) onFlow();
    await tl.tween(dur, (e) => { drink.state.level = lerp(from, toLevel, e); }, { token: tk, ease: ease.inOut });
    // tail falls
    await tl.tween(0.25, (e) => { pourState.tail = 1 - e; pourState.rad = radius * (1 - e * 0.5); }, { token: tk, ease: ease.in });
    pourState = null;
    drink.setStream({ on: false });
  }

  function updateStream(dt) {
    const SU = drink.streamUniforms;
    if (!pourState) { SU.uRad.value = 0; return; }
    surfaceWorld(surfW);
    SU.uA.value.set(streamWorld.x, 4.6, streamWorld.z);
    SU.uB.value.copy(surfW);
    SU.uRad.value = pourState.rad;
    // head/tail are expressed along the stream (0 = bottom, 1 = top)
    SU.uHead.value = pourState.head;
    SU.uTail.value = pourState.tail;
    drink.setStream({ on: true, x: streamWorld.x, z: streamWorld.z, radius: pourState.rad });
    if (pourState.head < 0.02 && pourState.tail > 0.05 && Math.random() < dt * 40) {
      drink.emitSplash(surfW, pourState.color, 2, 0.8);
      if (Math.random() < 0.25) {
        const l = surfW.clone().applyMatrix4(LQ.uLqInv.value);
        drink.addRipple(l.x, l.z, 0.6);
      }
    }
  }

  async function syrupIn(id, tk) {
    const s = byId(SYRUPS, id);
    drink.syrup.visible = true;
    drink.SY.uThin.value.copy(sceneColor(s.thin));
    drink.SY.uThick.value.copy(sceneColor(s.thick));
    drink.SY.uSyrupAmt.value = 1;
    audio.drizzle(1.4);
    const lvl0 = drink.state.level;
    await tl.tween(1.7, (e) => {
      drink.SY.uSyrupProg.value = e;
      // a thin puddle collects at the bottom
      if (lvl0 < B() + 0.05) drink.state.level = Math.max(drink.state.level, B() + 0.055 * clamp((e - 0.45) / 0.55, 0, 1));
    }, { token: tk, ease: ease.out });
  }

  async function syrupOut(tk) {
    await tl.tween(0.5, (e) => { drink.SY.uSyrupAmt.value = 1 - e; }, { token: tk });
    drink.syrup.visible = false;
    drink.SY.uSyrupProg.value = 0;
  }

  function clouds({ hex, dir = -1, from, to, limit, dur = 2.4, amt = 1, tk }) {
    setV3(LQ.uCloudCol.value, sceneColor(hex));
    LQ.uCloudDir.value = dir;
    LQ.uCloudLimit.value = limit;
    LQ.uCloudSig.value = 70;
    tl.tween(0.35, (e) => { LQ.uCloudAmt.value = Math.max(LQ.uCloudAmt.value, amt * e); }, { token: tk });
    return tl.tween(dur, (e) => { LQ.uCloudFront.value = lerp(from, to, e); }, { token: tk, ease: ease.out });
  }
  const cloudsOut = (dur, tk) => { const a0 = LQ.uCloudAmt.value; return tl.tween(dur, (e) => { LQ.uCloudAmt.value = a0 * (1 - e); }, { token: tk }); };

  async function toppingIn(id, tk) {
    const t = byId(TOPPINGS, id);
    if (t.kind === 'foam') return foamIn(tk);
    toppings.add(t.kind, t.count, { tag: id, color: t.color, spread: t.kind === 'pearl' ? 1.0 : 0.8 });
    await tl.wait(t.kind === 'pearl' ? 1.1 : 0.9, tk);
  }
  async function toppingOut(id, tk) {
    const t = byId(TOPPINGS, id);
    if (t.kind === 'foam') return foamOut(tk);
    toppings.remove(id);
    await tl.wait(0.35, tk);
  }

  async function foamIn(tk) {
    drink.foam.visible = true;
    drink.FO.uFoamBase.value = drink.state.level - 0.012;
    setV3(LQ.uFoamCol.value, sceneColor('#eadcbf'));
    const SU = drink.streamUniforms;
    const col = sceneColor('#fff7ea');
    drink.setStream({ on: true, x: 0, z: 0, color: col, radius: 0 });
    const saved = streamWorld.clone();
    streamWorld.set(0.0, 0, 0.02);
    pourState = { head: 1, tail: 1, rad: 0, color: col, kind: 'foam' };
    audio.foam(1.8);
    tl.tween(0.2, (e) => { pourState.rad = 0.05 * e; }, { token: tk });
    await tl.tween(0.25, (e) => { pourState.head = 1 - e; }, { token: tk, ease: ease.in });
    toppings.state.foamTop = drink.state.level + 0.01;
    tl.tween(1.0, (e) => { LQ.uFoamBand.value = e; }, { token: tk });
    await tl.tween(1.05, (e) => { drink.FO.uFoamProg.value = e; }, { token: tk, ease: ease.inOut });
    await tl.tween(0.25, (e) => { pourState.tail = 1 - e; }, { token: tk, ease: ease.in });
    pourState = null;
    streamWorld.copy(saved);
    drink.setStream({ on: false });
  }
  async function foamOut(tk) {
    tl.tween(0.6, (e) => { LQ.uFoamBand.value = 1 - e; }, { token: tk });
    await tl.tween(0.6, (e) => { drink.FO.uFoamProg.value = 1 - e; }, { token: tk });
    drink.foam.visible = false;
    toppings.state.foamTop = 99;
  }

  async function iceTo(level, tk) {
    const want = byId(ICE, level).count;
    const have = toppings.countTag('ice');
    if (want > have) {
      for (let i = 0; i < want - have; i++) {
        toppings.add('ice', 1, { tag: 'ice', delay: i * 0.12 });
      }
      await tl.wait(0.3 + (want - have) * 0.12, tk);
    } else if (want < have) {
      let n = have - want;
      for (const p of toppings.particles) if (p.tag === 'ice' && !p.dying && n-- > 0) p.dying = true;
      await tl.wait(0.35, tk);
    }
  }

  async function lidOn(type, tk) {
    cup.setLidType(type);
    cup.lidState.on = true;
    toppings.state.ceiling = CUP.H;
    if (type === 'film') {
      audio.seal();
      await tl.tween(0.32, (e) => { cup.lidState.y = (1 - e) * 0.55; }, { token: tk, ease: ease.in });
      rig.bump(0.018);
    } else {
      await tl.tween(0.36, (e) => { cup.lidState.y = (1 - e) * 0.6; }, { token: tk, ease: ease.in });
      audio.snap();
      rig.bump(0.01);
      await tl.tween(0.12, (e) => { cup.lidState.y = -0.008 * Math.sin(e * Math.PI); }, { token: tk });
    }
    cup.lidState.y = 0;
  }
  async function lidOff(tk) {
    if (!cup.lidState.on) return;
    await tl.tween(0.32, (e) => { cup.lidState.y = e * e * 1.4; }, { token: tk, ease: ease.linear });
    cup.lidState.on = false;
    cup.lidState.y = 0;
    toppings.state.ceiling = 99;
  }

  async function strawIn(tk) {
    const type = cup.lidState.on ? cup.lidState.type : 'film';
    const depth = cup.strawDepth(type);
    cup.strawState.visible = true;
    const start = depth + 1.2;
    await tl.tween(0.34, (e) => { cup.strawState.lift = lerp(start, depth + 0.002, e); }, { token: tk, ease: ease.in });
    if (tk.dead) return;
    if (cup.lidState.on && type === 'film') {
      // the film dents under the tip, then gives with a pop
      await tl.tween(0.1, (e) => { cup.strawState.lift = depth - 0.03 * e; cup.FU.uDimple.value = 0.03 * e; }, { token: tk });
      audio.pop();
      rig.bump(0.012);
      tl.tween(0.35, (e) => { cup.FU.uDimple.value = 0.03 * (1 - e) * Math.cos(e * 9); }, { token: tk, ease: ease.linear });
    } else if (cup.lidState.on) {
      audio.snap(0.7);
    } else {
      audio.plunk();
    }
    const l0 = cup.strawState.lift;
    await tl.tween(0.42, (e) => { cup.strawState.lift = lerp(l0, 0, e); }, { token: tk, ease: ease.out3 });
    cup.FU.uDimple.value = 0;
    // a bob of the surface where the straw went in
    drink.addRipple(-0.1, 0.05, 0.7);
  }
  async function strawOut(tk) {
    if (!cup.strawState.visible) return;
    audio.whoosh(0.3);
    const l0 = cup.strawState.lift;
    await tl.tween(0.32, (e) => { cup.strawState.lift = l0 + e * e * 2.6; }, { token: tk, ease: ease.linear });
    cup.strawState.visible = false;
  }

  async function seal(tk) {
    ui.sealed = false; notify();
    if (cup.strawState.visible) await strawOut(tk);
    if (!cup.lidState.on) await lidOn(recipe.lid, tk);
    await strawIn(tk);
    ui.sealed = true; notify();
  }
  async function unseal(tk) {
    if (!cup.strawState.visible && !cup.lidState.on) return;
    await strawOut(tk);
    await lidOff(tk);
    ui.sealed = false; notify();
  }

  // ------------------------------------------------------------------ full builds
  function resetCup() {
    toppings.clear();
    drink.state.level = B();
    drink.syrup.visible = false; drink.SY.uSyrupProg.value = 0; drink.SY.uSyrupAmt.value = 0;
    drink.foam.visible = false; drink.FO.uFoamProg.value = 0; LQ.uFoamBand.value = 0; toppings.state.foamTop = 99;
    LQ.uCloudAmt.value = 0; LQ.uMix.value = 0; LQ.uSwirl.value = 0;
    cup.lidState.on = false; cup.lidState.y = 0; cup.strawState.visible = false;
    toppings.state.ceiling = 99;
    pourState = null; drink.setStream({ on: false });
  }

  async function build(r, tk, { intro = false } = {}) {
    Object.assign(recipe, r, { toppings: [...r.toppings] });
    ui.sealed = false;
    notify();
    if (!intro) studio.setBackdrop(r.backdrop || backdropFor(r), 0.9);
    if (!intro && (drink.state.level > B() + 0.02 || cup.lidState.on || toppings.particles.length)) {
      audio.whoosh(0.3);
      await rig.flyOut();
      if (tk.dead) return;
    }
    resetCup();
    cup.setSleeve(r.sleeve);
    cup.setLidType(r.lid);
    cup.setStrawColor(r.straw);
    if (intro) studio.setBackdrop(r.backdrop || backdropFor(r), 0.01);
    setV3(LQ.uBackCol.value, sceneColor(r.backdrop || backdropFor(r)));
    const L = layersFor(r);
    // before liquid arrives, layer 0 shows the syrup puddle colour
    setLayersNow(L);
    const tea = byId(TEAS, r.tea);
    const milk = r.milk && r.milk !== 'none' ? byId(MILKS, r.milk) : null;
    const syrup = r.syrup && r.syrup !== 'none' ? byId(SYRUPS, r.syrup) : null;
    const particles = r.toppings.filter((t) => t !== 'foam');

    await rig.dropIn(intro ? 0.0 : 0.05);
    if (tk.dead) return;
    // syrup streaks start while the cup settles
    const jobs = [];
    if (syrup) jobs.push(syrupIn(r.syrup, tk));
    await tl.wait(syrup ? 0.5 : 0.1, tk);
    // pearls & other particle toppings rain in
    for (const [i, t] of particles.entries()) {
      const tp = byId(TOPPINGS, t);
      toppings.add(tp.kind, tp.count, { tag: t, color: tp.color, spread: 0.9, delay: i * 0.35 });
    }
    if (particles.length) await tl.wait(0.3, tk);
    if (tk.dead) return;
    // ice goes in before the liquid so it floats up as the cup fills
    if (r.ice) iceTo(r.ice, tk);
    if (tk.dead) return;
    // liquids
    const liquidTop = tea || milk ? FULL : B();
    if (tea && milk) {
      const teaOnly = layersFor({ ...r, milk: 'none' });
      setLayersNow(teaOnly);
      await pour({ hex: tea.tea, toLevel: tea.style === 'float' ? FULL - 0.16 : 0.86, dur: 0.6, tk, kind: 'tea' });
      if (tk.dead) return;
      const hint = tea.style === 'under' ? { dir: -1, limit: B(), to: B() - 0.05 } : tea.style === 'float' ? { dir: -1, limit: FULL - 0.4, to: FULL - 0.45 } : { dir: -1, limit: B(), to: B() };
      const mp = pour({ hex: milk.color, toLevel: liquidTop, dur: 0.75, tk, kind: 'milk', onFlow: () => clouds({ hex: milk.color, dir: hint.dir, from: drink.state.level, to: hint.to, limit: hint.limit, dur: 1.7, tk }) });
      await tl.wait(0.75, tk);
      const done = tweenLayers(L, 1.1, tk);
      await mp;
      cloudsOut(1.2, tk);
    } else if (tea || milk) {
      const hex = tea ? tea.tea : milk.color;
      const p = pour({
        hex, toLevel: liquidTop, dur: 1.25, tk, kind: tea ? 'tea' : 'milk',
        onFlow: syrup ? () => clouds({ hex: syrup.layer, dir: 1, from: B() + 0.02, to: B() + 0.62, limit: B() + 0.7, dur: 2.8, amt: 0.9, tk }) : null,
      });
      await p;
      if (syrup) cloudsOut(1.8, tk);
    }
    if (tk.dead) return;
    if (r.toppings.includes('foam')) await foamIn(tk);
    if (tk.dead) return;
    await Promise.all(jobs);
    await tl.wait(0.1, tk);
    await seal(tk);
  }

  function backdropFor(r) {
    const tea = byId(TEAS, r.tea);
    if (tea) return tea.backdrop;
    const syrup = byId(SYRUPS, r.syrup);
    if (syrup && syrup.id === 'strawberry') return '#f9cfda';
    return '#f2b48e';
  }

  // ------------------------------------------------------------------ queue
  function run(fn, { cancel = false } = {}) {
    if (cancel) { token.cancel(); token = new Token(); chain = Promise.resolve(); }
    const tk = token;
    ui.busy = true; notify();
    chain = chain.then(() => (tk.dead ? null : fn(tk))).catch((e) => console.error(e)).then(() => { if (tk === token) { ui.busy = false; notify(); } });
    return chain;
  }
  const custom = () => { ui.presetId = null; ui.name = 'Your Creation'; };

  // ingredient change while sealed: lift the straw + lid first
  async function opened(tk) { if (cup.lidState.on || cup.strawState.visible) await unseal(tk); }

  const api = {
    tl, recipe, ui,
    onChange(f) { listeners.push(f); f(recipe, ui); },
    update(dt) { tl.update(dt); updateStream(dt); },
    playPreset(id, opts = {}) {
      const p = PRESETS.find((x) => x.id === id);
      ui.presetId = id; ui.name = p.name; ui.tagline = p.tagline;
      return run((tk) => build(recipeFromPreset(p), tk, opts), { cancel: true });
    },
    playRecipe(r, name = 'Surprise!') {
      ui.presetId = null; ui.name = name; ui.tagline = '';
      return run((tk) => build(r, tk), { cancel: true });
    },
    setTea(id) {
      if (recipe.tea === id) return;
      custom();
      run(async (tk) => {
        await opened(tk);
        const prev = recipe.tea;
        recipe.tea = id; notify();
        const tea = byId(TEAS, id);
        const L = layersFor(recipe);
        studio.setBackdrop(backdropFor(recipe));
        setV3(LQ.uBackCol.value, sceneColor(backdropFor(recipe)));
        LQ.uMix.value = 0;
        if (!tea) { await tweenLayers(L, 0.8, tk); return; }
        const empty = drink.state.level < B() + 0.1;
        if (empty) setLayersNow(L);
        const p = pour({
          hex: tea.tea, toLevel: FULL, dur: empty ? 1.4 : 0.9, tk, kind: 'tea',
          onFlow: empty ? null : () => clouds({ hex: tea.tea, dir: -1, from: drink.state.level, to: B(), limit: B(), dur: 1.8, amt: 0.85, tk }),
        });
        if (!empty) { await tl.wait(1.0, tk); await tweenLayers(L, 1.2, tk); cloudsOut(0.9, tk); }
        await p;
      });
    },
    setMilk(id) {
      if (recipe.milk === id) return;
      custom();
      run(async (tk) => {
        await opened(tk);
        recipe.milk = id; notify();
        const L = layersFor(recipe);
        LQ.uMix.value = 0;
        if (id === 'none') { await tweenLayers(L, 0.9, tk); return; }
        const milk = byId(MILKS, id);
        const empty = drink.state.level < B() + 0.1;
        if (empty) { setLayersNow(L); await pour({ hex: milk.color, toLevel: FULL, dur: 1.3, tk, kind: 'milk' }); return; }
        const tea = byId(TEAS, recipe.tea);
        const lim = tea && tea.style === 'float' ? FULL - 0.4 : B();
        const p = pour({ hex: milk.color, toLevel: FULL, dur: 0.9, tk, kind: 'milk', onFlow: () => clouds({ hex: milk.color, dir: -1, from: drink.state.level, to: lim - 0.05, limit: lim, dur: 2.0, tk }) });
        await tl.wait(1.1, tk);
        const d = tweenLayers(L, 1.5, tk);
        await p; cloudsOut(1.2, tk); await d;
      });
    },
    setSyrup(id) {
      if (recipe.syrup === id) return;
      custom();
      run(async (tk) => {
        await opened(tk);
        recipe.syrup = id; notify();
        const L = layersFor(recipe);
        if (id === 'none') { syrupOut(tk); await tweenLayers(L, 0.8, tk); return; }
        drink.SY.uSyrupProg.value = 0;
        const s = syrupIn(id, tk);
        await tl.wait(0.8, tk);
        await tweenLayers(L, 1.0, tk);
        await s;
      });
    },
    toggleTopping(id) {
      custom();
      const on = recipe.toppings.includes(id);
      run(async (tk) => {
        await opened(tk);
        if (on) recipe.toppings = recipe.toppings.filter((t) => t !== id);
        else recipe.toppings.push(id);
        notify();
        const L = layersFor(recipe);
        if (on) await toppingOut(id, tk); else await toppingIn(id, tk);
        tweenLayers(L, 0.8, tk);
      });
    },
    setIce(level) {
      if (recipe.ice === level) return;
      custom();
      run(async (tk) => { await opened(tk); recipe.ice = level; notify(); await iceTo(level, tk); });
    },
    setSleeve(id) {
      if (recipe.sleeve === id) return;
      recipe.sleeve = id; notify();
      run(async (tk) => {
        cup.beginSleeveWipe(id);
        audio.paper();
        await tl.tween(0.75, (e) => cup.sleeveWipe(e), { token: tk, ease: ease.inOut });
        cup.endSleeveWipe(id);
      });
    },
    setLid(id) {
      if (recipe.lid === id) return;
      recipe.lid = id; notify();
      run(async (tk) => {
        if (!cup.lidState.on) { cup.setLidType(id); return; }
        const hadStraw = cup.strawState.visible;
        await strawOut(tk);
        await lidOff(tk);
        await lidOn(id, tk);
        if (hadStraw) await strawIn(tk);
      });
    },
    setStraw(id) {
      if (recipe.straw === id) return;
      recipe.straw = id; notify();
      run(async (tk) => {
        if (!cup.strawState.visible) { cup.setStrawColor(id); return; }
        await strawOut(tk);
        cup.setStrawColor(id);
        await strawIn(tk);
      });
    },
    finalTouch() { run((tk) => seal(tk)); },
    surprise() {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const tea = pick(TEAS);
      const tops = TOPPINGS.filter(() => Math.random() < 0.35).map((t) => t.id);
      if (!tops.length) tops.push('pearls');
      const r = {
        tea: tea.id, milk: pick(MILKS.slice(1)).id, syrup: Math.random() < 0.45 ? pick(SYRUPS.slice(1)).id : 'none',
        toppings: tops.slice(0, 3), ice: Math.floor(Math.random() * 4), sleeve: pick(['gingham', 'clouds', 'cherry', 'kraft', 'stripe']),
        lid: pick(['film', 'dome']), straw: pick(['clear', 'pink', 'matcha', 'black']), backdrop: tea.backdrop,
      };
      return api.playRecipe(r, 'Surprise Blend');
    },
    get pouring() { return !!pourState; },
  };
  return api;
}

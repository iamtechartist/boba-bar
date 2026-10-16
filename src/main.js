import * as THREE from 'three';
import { EXPOSURE } from './color.js';
import { LQ } from './glsl.js';
import { createStudio } from './studio.js';
import { createCup, CUP } from './cup.js';
import { createDrink } from './drink.js';
import { createToppings } from './toppings.js';
import { createDirector } from './director.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';

const T0 = performance.now();
const marks = [];
const mark = (n) => marks.push(n + ' ' + Math.round(performance.now() - T0));
const canvas = document.getElementById('c');
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const forcedPR = Number(params.get('pr')) || 0; // e.g. ?pr=1.5 to supersample a recording
let pixelRatio = forcedPR || Math.min(devicePixelRatio, isMobile ? 1.5 : 2);
function applyPixelRatio() {
  renderer.setPixelRatio(pixelRatio);
  // refraction buffer at ~CSS resolution is plenty for the thin cup wall
  renderer.transmissionResolutionScale = isMobile ? 0.5 : Math.min(1, 1.15 / pixelRatio);
}
applyPixelRatio();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

const audio = createAudio();
mark('start@' + Math.round(T0));
const studio = createStudio(renderer, scene);
mark('studio');
const cup = createCup(renderer, scene);
scene.add(cup.group);
mark('cup');
const drink = createDrink(cup);
scene.add(drink.stream, drink.splash);

// ------------------------------------------------------------------ cup rig: drag, rock, drop, slosh
const rig = {
  yaw: -0.3, yawVel: 0, lean: new THREE.Vector2(), leanVel: new THREE.Vector2(), leanTarget: new THREE.Vector2(),
  y: 0, yVel: 0, squash: 1, squashVel: 0, dropping: false, hop: 0,
  slosh: new THREE.Vector2(), sloshVel: new THREE.Vector2(),
  shakeT: -1, turntable: false,
  dropIn(delay = 0) {
    return new Promise((resolve) => {
      rig.y = 3.4; rig.yVel = -1; rig.dropping = true; rig.dropDelay = delay; rig.onLand = resolve;
    });
  },
  // the finished drink is whisked up and out of frame before the next one drops in
  flyOut() {
    return new Promise((resolve) => { rig.flying = true; rig.yVel = 0.6; rig.onFlown = resolve; });
  },
  bump(a) { rig.squashVel -= a * 30; rig.sloshVel.x += (Math.random() - 0.5) * a * 6; },
};

const toppings = createToppings(cup, {
  onSurface(p, speed) {
    const big = p.kind === 'ice';
    if (big) { audio.splash(true); setTimeout(() => audio.clink(4, false), 60); }
    else audio.plop(p.kind === 'pearl' ? speed : speed * 0.8);
    drink.addRipple(p.p.x, p.p.z, big ? 1.2 : 0.45);
    if (Math.random() < (big ? 1 : 0.3)) {
      const w = p.p.clone().applyMatrix4(cup.local.matrixWorld);
      const c = LQ.uLayerCol.value[3];
      drink.emitSplash(w, new THREE.Color(c.x, c.y, c.z), big ? 9 : 3, big ? 1.1 : 0.6);
    }
  },
  onClink(rel, both) { audio.clink(rel * 2, both); },
});

const director = createDirector({ cup, drink, toppings, studio, audio, rig });

// ------------------------------------------------------------------ framing (shift-lens)
let UI_TOP = 78, UI_BOTTOM = 156;
const view = { d: 0, shift: 0, td: 0, tshift: 0 };
function frame(snap = true) {
  const w = innerWidth, h = innerHeight;
  const clean = document.body.classList.contains('clean');
  UI_TOP = clean ? 30 : (w < 640 ? 70 : 78);
  UI_BOTTOM = clean ? 30 : (w < 640 ? 150 : 158);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const elev = THREE.MathUtils.degToRad(10);
  const contentH = 2.55, contentW = 1.35;
  const usable = Math.max(0.35, (h - UI_TOP - UI_BOTTOM) / h);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dV = contentH / 2 / (tanV * usable);
  const dH = contentW / 2 / (tanV * camera.aspect);
  view.td = Math.max(dV, dH, 4.8);
  view.tshift = (UI_BOTTOM - UI_TOP) / 2;
  if (snap || !view.d) { view.d = view.td; view.shift = view.tshift; }
  placeCamera();
}
const camTarget = new THREE.Vector3(0, 1.08, 0);
const ELEV = THREE.MathUtils.degToRad(10);
function placeCamera() {
  const d = view.d;
  camera.position.set(0, camTarget.y + Math.sin(ELEV) * d, Math.cos(ELEV) * d);
  camera.lookAt(camTarget);
  camera.clearViewOffset();
  camera.setViewOffset(innerWidth, innerHeight, 0, view.shift, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
function glideCamera(dt) {
  if (Math.abs(view.d - view.td) < 1e-4 && Math.abs(view.shift - view.tshift) < 0.05) return;
  const k = 1 - Math.exp(-dt * 4.5);
  view.d += (view.td - view.d) * k;
  view.shift += (view.tshift - view.shift) * k;
  placeCamera();
}
addEventListener('resize', () => frame(true));
frame();

// ------------------------------------------------------------------ interaction
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false, lastT: performance.now() };
  rig.yawVel = 0;
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const now = performance.now();
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; canvas.classList.add('dragging'); }
  if (drag.moved) {
    const k = 0.0085;
    rig.yaw += dx * k;
    const dt = Math.max(8, now - drag.lastT) / 1000;
    rig.yawVel = THREE.MathUtils.lerp(rig.yawVel, (dx * k) / dt, 0.5);
    rig.leanTarget.set(0, THREE.MathUtils.clamp(-(e.clientY - drag.y0) * 0.0012, -0.13, 0.13));
  }
  drag.x = e.clientX; drag.y = e.clientY; drag.lastT = now;
});
function endDrag(e) {
  if (!drag) return;
  const tap = !drag.moved && performance.now() - drag.t < 450;
  if (performance.now() - drag.lastT > 90) rig.yawVel = 0;
  rig.leanTarget.set(0, 0);
  canvas.classList.remove('dragging');
  if (tap) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(cup.proxy, false).length) shake();
  }
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function shake() {
  if (rig.shakeT >= 0 && rig.shakeT < 0.9) return;
  rig.shakeT = 0;
  rig.shakeDir = Math.random() < 0.5 ? 1 : -1;
  toppings.state.swirlDir = rig.shakeDir;
  audio.rattle(1.25, toppings.countTag('ice') > 0);
}

// ------------------------------------------------------------------ UI
let paused = false;
createUI(document.getElementById('ui'), director, {
  audio,
  onPause: (p) => { paused = p; },
  onHide: (hidden) => { rig.turntable = hidden; frame(false); },
});

// ------------------------------------------------------------------ simulation
const m = new THREE.Matrix4(), mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), mY = new THREE.Matrix4(), mS = new THREE.Matrix4();
const inv = new THREE.Matrix4();
const pivot = new THREE.Vector3(), axis = new THREE.Vector3(), upL = new THREE.Vector3(), base = new THREE.Vector3();
const keyW = new THREE.Vector3(-2.6, 4.2, 3.4).normalize();
const leanAcc = new THREE.Vector2(), prevLeanVel = new THREE.Vector2(), lt = new THREE.Vector2();

function simulate(dt) {
  LQ.uTime.value += dt;
  // --- yaw inertia / turntable
  if (!drag) {
    rig.yaw += rig.yawVel * dt;
    rig.yawVel *= Math.exp(-2.4 * dt);
    if (rig.turntable) rig.yaw += 0.26 * dt;
  }
  // --- shake: rocking on the base rim, contents swirl
  lt.copy(rig.leanTarget);
  if (rig.shakeT >= 0) {
    const t = rig.shakeT;
    rig.shakeT += dt;
    const f = 3.1, env = Math.exp(-t * 1.7) * Math.min(1, t * 10);
    if (t < 1.25) {
      lt.x += Math.sin(t * Math.PI * 2 * f) * 0.2 * env * rig.shakeDir;
      lt.y += Math.sin(t * Math.PI * 2 * f * 0.73 + 1.1) * 0.09 * env;
      rig.hop = Math.abs(Math.sin(t * Math.PI * 2 * f)) * 0.035 * env;
    } else rig.hop = 0;
    toppings.state.swirl = Math.max(0, t < 1.35 ? Math.min(1, t * 4) : 1 - (t - 1.35) / 1.2);
    LQ.uSwirl.value = t < 1.3 ? Math.min(1, t * 3) : Math.max(0, 1 - (t - 1.3) / 2.6);
    LQ.uMix.value = Math.max(LQ.uMix.value, Math.min(1, t / 1.4));
    if (t > 4) rig.shakeT = -1;
  } else toppings.state.swirl = 0;
  const kL = 140, cL = 9;
  rig.leanVel.x += ((lt.x - rig.lean.x) * kL - rig.leanVel.x * cL) * dt;
  rig.leanVel.y += ((lt.y - rig.lean.y) * kL - rig.leanVel.y * cL) * dt;
  rig.lean.addScaledVector(rig.leanVel, dt);
  if (dt > 1e-4) leanAcc.copy(rig.leanVel).sub(prevLeanVel).divideScalar(dt);
  prevLeanVel.copy(rig.leanVel);
  // --- fly out (preset change) / drop in + landing squash
  if (rig.flying) {
    rig.yVel += 26 * dt;
    rig.y += rig.yVel * dt;
    if (rig.y > 3.6) { rig.flying = false; rig.yVel = 0; if (rig.onFlown) rig.onFlown(); }
  } else if (rig.dropping) {
    if (rig.dropDelay > 0) rig.dropDelay -= dt;
    else {
      rig.yVel -= 22 * dt;
      rig.y += rig.yVel * dt;
      if (rig.y <= 0) {
        rig.y = 0;
        rig.squashVel = rig.yVel * 1.6;
        rig.sloshVel.x += 0.6;
        rig.dropping = false;
        audio.thud();
        if (rig.onLand) rig.onLand();
      }
    }
  }
  rig.squashVel += ((1 - rig.squash) * 520 - rig.squashVel * 16) * dt;
  rig.squash = THREE.MathUtils.clamp(rig.squash + rig.squashVel * dt, 0.88, 1.08);

  // --- rig matrix: lift * rock-about-rim * squash * yaw
  const lean = rig.lean;
  const ang = lean.length();
  mY.makeRotationY(rig.yaw);
  mS.makeScale(1 + (1 - rig.squash) * 0.5, rig.squash, 1 + (1 - rig.squash) * 0.5);
  if (ang > 1e-5) {
    const dx = lean.x / ang, dz = lean.y / ang;
    pivot.set(dx * CUP.rb, 0, dz * CUP.rb);
    axis.set(dz, 0, -dx);
    mR.makeRotationAxis(axis, ang);
    m.makeTranslation(pivot.x, rig.y + rig.hop, pivot.z).multiply(mR).multiply(mT.makeTranslation(-pivot.x, 0, -pivot.z));
  } else m.makeTranslation(0, rig.y + rig.hop, 0);
  m.multiply(mS).multiply(mY);
  cup.group.matrixAutoUpdate = false;
  cup.group.matrix.copy(m);
  cup.group.updateMatrixWorld(true);
  inv.copy(cup.local.matrixWorld).invert();
  LQ.uLqInv.value.copy(inv);
  LQ.uKeyDir.value.copy(keyW).transformDirection(inv);

  // --- slosh: surface stays level in world space and rings after the cup moves
  upL.set(0, 1, 0).transformDirection(inv);
  const eqx = -upL.x / upL.y, eqz = -upL.z / upL.y;
  const w = 2 * Math.PI * 1.55, z = 0.09;
  const shaking = rig.shakeT >= 0 && rig.shakeT < 1.3;
  rig.sloshVel.x += (-w * w * rig.slosh.x - 2 * z * w * rig.sloshVel.x - leanAcc.x * 0.1) * dt;
  rig.sloshVel.y += (-w * w * rig.slosh.y - 2 * z * w * rig.sloshVel.y - leanAcc.y * 0.1) * dt;
  rig.slosh.addScaledVector(rig.sloshVel, dt);
  rig.slosh.clampLength(0, shaking ? 0.5 : 0.32);
  const c = Math.cos(-rig.yaw), s = Math.sin(-rig.yaw);
  LQ.uLqTilt.value.set(eqx + rig.slosh.x * c - rig.slosh.y * s, eqz + rig.slosh.x * s + rig.slosh.y * c);
  toppings.state.gravity.set(0, -1, 0).transformDirection(inv);

  glideCamera(dt);
  director.update(dt);
  cup.setFill(drink.state.level);
  cup.update(dt, { cold: drink.state.level > 0.3 });
  drink.update(dt);
  toppings.update(dt);
  studio.update(dt);

  // shadow follows the cup base; the drink tints the caustic
  base.set(0, 0, 0).applyMatrix4(cup.local.matrixWorld);
  studio.uniforms.uCup.value.copy(base);
  studio.uniforms.uLift.value = Math.max(0, rig.y + rig.hop);
  const lc = LQ.uLayerCol.value[1];
  studio.uniforms.uCaustic.value.setRGB(Math.min(1.5, lc.x * 1.4), Math.min(1.5, lc.y * 1.4), Math.min(1.5, lc.z * 1.4));
  const fill = THREE.MathUtils.clamp((drink.state.level - 0.1) / 1.0, 0, 1);
  studio.uniforms.uCausticAmt.value = 0.25 + 0.6 * fill;
}

// frame-time governor: if we can't hold ~55 fps, step the pixel ratio down (never below 1)
const gov = { acc: 0, n: 0, cool: 2.5 };
function governor(raw) {
  if (document.hidden || paused) return;
  gov.cool -= raw;
  if (gov.cool > 0) return;
  gov.acc += raw; gov.n++;
  if (gov.acc >= 1.5) {
    const avg = gov.acc / gov.n;
    gov.acc = 0; gov.n = 0;
    if (avg > 1 / 54 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      applyPixelRatio(); frame();
      gov.cool = 1.0;
    }
  }
}

let last = performance.now();
function tick(now) {
  const raw = Math.max((now - last) / 1000, 0);
  const dt = Math.min(raw, 1 / 30);
  last = now;
  if (raw < 0.25 && !forcedPR) governor(raw);
  if (!paused) simulate(dt);
  else if (drag) simulate(1e-4);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ boot
// Phase 1 compiles only what the opening Brown Sugar Tiger build needs (screen + transmission-
// buffer variants, in parallel), so the intro starts fast. Phase 2 compiles the rest in the
// background while the intro plays.
const rtProbe = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
async function compileBoth(root, target = scene) {
  try {
    await renderer.compileAsync(root, camera, target);
    renderer.setRenderTarget(rtProbe);
    const p = renderer.compileAsync(root, camera, target); // programs are created synchronously here
    renderer.setRenderTarget(null);
    await p;
  } catch { renderer.setRenderTarget(null); /* fall back to compiling on first draw */ }
}

async function boot() {
  cup.lidState.on = true; cup.strawState.visible = true; cup.strawState.lift = 0;
  drink.foam.visible = true; drink.syrup.visible = true; drink.stream.visible = true;
  drink.state.level = 1.0;
  simulate(1 / 60);
  cup.dome.visible = true; cup.film.visible = true;
  for (const k of ['pearl', 'pop', 'jelly', 'ice']) toppings.meshes[k].count = 1;
  drink.splash.count = 1;
  mark('setup');
  const later = [cup.dome, drink.foam, toppings.meshes.pop, toppings.meshes.jelly, toppings.meshes.ice];
  const parents = later.map((o) => o.parent);
  later.forEach((o) => o.parent.remove(o));
  await compileBoth(scene);
  mark('compile');
  later.forEach((o, i) => parents[i].add(o));
  // start from an empty studio
  drink.foam.visible = false; drink.syrup.visible = false; drink.stream.visible = false;
  cup.lidState.on = false; cup.strawState.visible = false;
  drink.state.level = LQ.uLqBottom.value;
  rig.y = 3.4;
  document.getElementById('loader').classList.add('gone');
  window.__bbBootMs = Math.round(performance.now());
  last = performance.now();
  requestAnimationFrame(tick);
  if (params.get('still') == null) director.playPreset(params.get('preset') || 'tiger', { intro: true });
  // phase 2: everything else, plus every straw colour
  const extras = new THREE.Group();
  for (const mat of cup.allStrawMaterials()) extras.add(new THREE.Mesh(cup.strawBody.children[0].geometry, mat));
  for (const o of [...later, extras]) await compileBoth(o);
  cup.preloadSleeves(['gingham', 'clouds', 'cherry', 'kraft', 'stripe']);
  mark('background');
  window.__bbMarks = marks;
}
boot();

window.__bb = { get pixelRatio() { return pixelRatio; }, THREE, renderer, scene, camera, cup, drink, studio, LQ, rig, toppings, director, audio, shake, simulate };

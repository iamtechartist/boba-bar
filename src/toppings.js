import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { withLiquid, LQ } from './glsl.js';
import { CUP, rIn } from './cup.js';
import { sceneColor } from './color.js';

// Instanced toppings with a small position-based physics solver in cup-local space:
// gravity + buoyancy + drag, sphere–sphere contacts, cup wall/floor/ceiling, straw capsule,
// shake swirl. Pearls, popping boba, lychee jelly and ice cubes.

const KIND = {
  pearl: { r: 0.043, rWall: 0.043, density: 1.28, max: 80 },
  pop: { r: 0.036, rWall: 0.036, density: 1.09, max: 72 },
  jelly: { r: 0.04, rWall: 0.05, density: 1.05, max: 30 },
  ice: { r: 0.098, rWall: 0.124, density: 0.84, max: 9 },
};
const G = 30;

export function createToppings(cupApi, hooks = {}) {
  const local = cupApi.local;
  const group = new THREE.Group();
  local.add(group);

  // ---------------------------------------------------------------- materials
  const pearlMat = withLiquid(new THREE.MeshPhysicalMaterial({
    color: sceneColor('#1d0b03'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.45,
    sheen: 0.2, sheenColor: new THREE.Color('#9a5420'), sheenRoughness: 0.35, envMapIntensity: 1.3,
  }), {
    key: 'pearl',
    patch(s) {
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ndv = saturate(dot(normal, normalize(vViewPosition)));
          // translucent tapioca: light glows amber through the thin edges
          totalEmissiveRadiance += vec3(0.30, 0.10, 0.02) * pow(1.0 - ndv, 2.2) * 0.4 + vec3(0.025, 0.008, 0.002);
        }`);
    },
  });
  const popMat = withLiquid(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, transmission: 1, thickness: 0.07, ior: 1.38, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, attenuationColor: new THREE.Color('#ffffff'), attenuationDistance: 0.5,
  }), {
    key: 'pop',
    patch(s) {
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_INSTANCING_COLOR
          totalEmissiveRadiance += vColor * vColor * 0.22;
        #endif`);
    },
  });
  const jellyMat = withLiquid(new THREE.MeshPhysicalMaterial({
    color: sceneColor('#f7f1de'), roughness: 0.16, transmission: 0.92, thickness: 0.05, ior: 1.36, specularIntensity: 1,
    attenuationColor: new THREE.Color('#fff2cc'), attenuationDistance: 0.25, envMapIntensity: 1.1,
  }), {
    key: 'jelly',
    patch(s) {
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.11, 0.105, 0.085);`);
    },
  });
  const iceMat = withLiquid(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.16, ior: 1.31, specularIntensity: 1,
    dispersion: 0.35, envMapIntensity: 2.2, attenuationColor: new THREE.Color('#e8f6ff'), attenuationDistance: 0.6,
  }), {
    key: 'ice',
    patch(s) {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIceP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIceP = position;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIceP;')
        .replace('#include <transmission_fragment>', `#include <transmission_fragment>
          {
            // cloudy core + a few trapped bubbles
            float core = smoothstep(0.42, 0.0, length(vIceP * vec3(1.0, 1.3, 1.0)));
            totalDiffuse = mix(totalDiffuse, vec3(1.0, 1.04, 1.1) * 1.15, 0.18 + core * 0.3);
            float edge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
            totalDiffuse += vec3(0.5, 0.58, 0.68) * edge * 0.55;
            // faces are flat, the rounded edges catch light: brighten where the normal bends
            vec3 an = abs(normalize(vIceP));
            float bevel = 1.0 - smoothstep(0.86, 0.97, max(an.x, max(an.y, an.z)));
            totalDiffuse += vec3(0.35, 0.4, 0.45) * bevel * 0.5;
          }`);
    },
  });

  const mk = (geo, mat, max, order) => {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = order;
    group.add(m);
    return m;
  };
  const meshes = {
    pearl: mk(new THREE.IcosahedronGeometry(1, 4), pearlMat, KIND.pearl.max, 0),
    pop: mk(new THREE.SphereGeometry(1, 36, 18), popMat, KIND.pop.max, 2),
    jelly: mk(new RoundedBoxGeometry(1, 1, 1, 3, 0.2), jellyMat, KIND.jelly.max, 2),
    ice: mk(new RoundedBoxGeometry(1, 1, 1, 4, 0.18), iceMat, KIND.ice.max, 1),
  };
  // instance colors
  meshes.pearl.setColorAt(0, new THREE.Color(1, 1, 1));
  meshes.pop.setColorAt(0, new THREE.Color(1, 1, 1));

  // ---------------------------------------------------------------- particles
  const P = [];
  let nextId = 1;
  const v3 = () => new THREE.Vector3();
  function spawn(kind, opt) {
    const k = KIND[kind];
    const p = {
      id: nextId++, kind, tag: opt.tag, r: k.r, rWall: k.rWall, density: k.density,
      p: v3(), prev: v3(), v: v3(), q: new THREE.Quaternion(), w: v3(),
      scale: new THREE.Vector3(1, 1, 1), color: new THREE.Color(1, 1, 1),
      delay: opt.delay || 0, life: 0, dying: false, grow: 1, size: 1, sub: 0,
    };
    p.p.copy(opt.pos); p.prev.copy(opt.pos); p.v.copy(opt.vel || v3());
    p.q.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    if (kind === 'pearl') {
      const s = k.r * (0.92 + Math.random() * 0.16);
      p.scale.set(s * (1 + Math.random() * 0.06), s * (0.92 + Math.random() * 0.06), s * (1 + Math.random() * 0.05));
      const t = 0.85 + Math.random() * 0.3;
      p.color.setRGB(t, t * (0.95 + Math.random() * 0.1), t);
    } else if (kind === 'pop') {
      const s = k.r * (0.95 + Math.random() * 0.1);
      p.scale.set(s, s * 0.97, s);
      p.color.copy(sceneColor(opt.color)).multiplyScalar(1.15);
    } else if (kind === 'jelly') {
      const s = 0.07 * (0.9 + Math.random() * 0.2);
      p.scale.set(s * (1 + Math.random() * 0.25), s * (0.8 + Math.random() * 0.2), s);
    } else if (kind === 'ice') {
      const s = 0.165 * (0.92 + Math.random() * 0.14);
      p.scale.set(s, s * (0.9 + Math.random() * 0.12), s * (0.95 + Math.random() * 0.1));
      p.q.setFromEuler(new THREE.Euler(Math.random() * 0.5, Math.random() * 6.28, Math.random() * 0.5));
    }
    p.grow = opt.grow ?? 1;
    P.push(p);
    return p;
  }

  const state = {
    swirl: 0, // 0..1 shake vortex strength
    swirlDir: 1,
    gravity: new THREE.Vector3(0, -1, 0), // cup-local gravity direction
    ceiling: 99, // lid / foam limit (cup-local y)
    foamTop: 99,
    time: 0,
  };

  // ---------------------------------------------------------------- spatial hash
  const CELL = 0.2;
  const grid = new Map();
  const key = (x, y, z) => ((x + 64) * 73856093) ^ ((y + 64) * 19349663) ^ ((z + 64) * 83492791);

  const segA = v3(), segB = v3(), tmp = v3(), tmp2 = v3(), d = v3();
  const UP = new THREE.Vector3(0, 1, 0);

  function topY(x, z) { return LQ.uLqLevel.value + LQ.uLqTilt.value.x * x + LQ.uLqTilt.value.y * z; }
  const liquidOn = () => LQ.uLqOn.value > 0.5;

  function step(dt) {
    const level = liquidOn();
    const strawOn = cupApi.strawSegment(segA, segB);
    const gdir = state.gravity;
    // integrate
    for (const p of P) {
      if (p.delay > 0) continue;
      p.prev.copy(p.p);
      const y = p.p.y;
      let sub = 0;
      if (level) {
        const ty = topY(p.p.x, p.p.z);
        sub = THREE.MathUtils.clamp((ty - (y - p.r)) / (2 * p.r), 0, 1);
      }
      p.sub = sub;
      // gravity minus buoyancy
      const acc = G * (1 - sub / p.density);
      p.v.addScaledVector(gdir, acc * dt);
      // shake vortex: swirl around the axis + lift from the bottom
      if (state.swirl > 0.001 && sub > 0) {
        const rr = Math.hypot(p.p.x, p.p.z) + 1e-4;
        const tx = -p.p.z / rr, tz = p.p.x / rr;
        const s = state.swirl * sub;
        // vortex: spin around the axis and fling outward so the toppings ride up the wall
        p.v.x += (tx * 4.2 * state.swirlDir + (p.p.x / rr) * 2.2) * s * dt;
        p.v.z += (tz * 4.2 * state.swirlDir + (p.p.z / rr) * 2.2) * s * dt;
        const lift = (p.kind === 'ice' ? 0 : 1) * (7.5 + 4 * Math.sin(state.time * 7 + p.id)) * Math.max(0, 1.1 - p.p.y / 1.25);
        p.v.y += lift * s * dt;
        p.v.x += Math.sin(state.time * 11 + p.id * 1.7) * 1.2 * s * dt;
        p.v.z += Math.cos(state.time * 9 + p.id * 2.3) * 1.2 * s * dt;
      }
      // drag
      const drag = 0.15 + sub * (p.kind === 'ice' ? 5 : 7.5);
      p.v.multiplyScalar(Math.exp(-drag * dt));
      p.p.addScaledVector(p.v, dt);
      // splash / plop when crossing the surface
      if (level && hooks.onSurface) {
        const ty = topY(p.p.x, p.p.z);
        if (p.prev.y > ty && p.p.y <= ty && p.v.y < -0.4) hooks.onSurface(p, -p.v.y);
      }
    }
    // constraints
    for (let it = 0; it < 4; it++) {
      grid.clear();
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.delay > 0) continue;
        const k = key(Math.floor(p.p.x / CELL), Math.floor(p.p.y / CELL), Math.floor(p.p.z / CELL));
        let b = grid.get(k);
        if (!b) grid.set(k, (b = []));
        b.push(i);
      }
      for (let i = 0; i < P.length; i++) {
        const a = P[i];
        if (a.delay > 0) continue;
        const cx = Math.floor(a.p.x / CELL), cy = Math.floor(a.p.y / CELL), cz = Math.floor(a.p.z / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const b = grid.get(key(cx + dx, cy + dy, cz + dz));
          if (!b) continue;
          for (const j of b) {
            if (j <= i) continue;
            const c = P[j];
            const ra = a.kind === 'ice' && c.kind === 'ice' ? 0.112 : a.r * a.size;
            const rc = a.kind === 'ice' && c.kind === 'ice' ? 0.112 : c.r * c.size;
            const min = ra + rc;
            d.subVectors(c.p, a.p);
            const dist2 = d.lengthSq();
            if (dist2 >= min * min || dist2 < 1e-12) continue;
            const dist = Math.sqrt(dist2);
            const pen = (min - dist) / dist;
            const ma = a.kind === 'ice' ? 4 : 1, mc = c.kind === 'ice' ? 4 : 1;
            const wa = mc / (ma + mc), wc = ma / (ma + mc);
            a.p.addScaledVector(d, -pen * wa);
            c.p.addScaledVector(d, pen * wc);
            if (it === 0 && hooks.onClink && (a.kind === 'ice' || c.kind === 'ice')) {
              const rel = tmp.subVectors(a.v, c.v).length();
              if (rel > 0.9) hooks.onClink(rel, a.kind === 'ice' && c.kind === 'ice');
            }
          }
        }
      }
      for (const p of P) {
        if (p.delay > 0) continue;
        const r = p.r * p.size, rw = p.rWall * p.size;
        // floor
        const floor = CUP.floorIn + r + 0.002;
        if (p.p.y < floor) {
          p.p.y = floor;
          // rolling friction on the floor
          const fx = p.p.x - p.prev.x, fz = p.p.z - p.prev.z;
          p.p.x -= fx * 0.08; p.p.z -= fz * 0.08;
        }
        // wall (only inside the cup)
        if (p.p.y < CUP.H + 0.05) {
          const yy = Math.min(p.p.y, CUP.H);
          const maxR = rIn(yy) - rw - 0.004;
          const rr = Math.hypot(p.p.x, p.p.z);
          if (rr > maxR) {
            const s = maxR / rr;
            p.p.x *= s; p.p.z *= s;
            if (it === 0 && p.kind === 'ice' && hooks.onClink) {
              const vr = Math.abs((p.v.x * p.p.x + p.v.z * p.p.z) / (rr + 1e-5));
              if (vr > 0.8) hooks.onClink(vr, false);
            }
          }
        }
        // lid / foam ceiling
        const ceil = Math.min(state.ceiling, state.foamTop) - (p.kind === 'ice' ? 0.07 : r);
        if (p.p.y > ceil && p.p.y < CUP.H + 0.2 && p.delay <= 0 && p.life > 0.6) p.p.y = ceil;
        // straw capsule
        if (strawOn) {
          const sr = CUP.strawR + r + 0.004;
          tmp.subVectors(segB, segA);
          const t = THREE.MathUtils.clamp(tmp2.subVectors(p.p, segA).dot(tmp) / tmp.lengthSq(), 0, 1);
          const cpt = tmp2.copy(segA).addScaledVector(tmp, t);
          d.subVectors(p.p, cpt);
          const dl = d.length();
          if (dl < sr && dl > 1e-6) p.p.addScaledVector(d, (sr - dl) / dl);
        }
      }
    }
    // velocities from positions (PBD)
    for (const p of P) {
      if (p.delay > 0) continue;
      p.v.subVectors(p.p, p.prev).divideScalar(dt);
      // rotation: rolling for spheres, tumbling for cubes
      if (p.kind === 'ice' || p.kind === 'jelly') {
        tmp.crossVectors(UP, p.v).multiplyScalar(p.kind === 'ice' ? 2.5 : 6);
        p.w.lerp(tmp, Math.min(1, dt * 4));
        p.w.multiplyScalar(Math.exp(-dt * (p.sub > 0 ? 2.2 : 0.3)));
        if (p.sub > 0.3 && p.kind === 'ice') {
          // floating cubes settle face-up
          const e = new THREE.Vector3();
          const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
          let best = null, bd = -1;
          for (const ax of axes) { e.copy(ax).applyQuaternion(p.q); const dd = Math.abs(e.y); if (dd > bd) { bd = dd; best = e.clone().multiplyScalar(Math.sign(e.y)); } }
          const corr = new THREE.Quaternion().setFromUnitVectors(best, UP);
          const idq = new THREE.Quaternion();
          idq.slerp(corr, Math.min(1, dt * 1.2));
          p.q.premultiply(idq);
        }
      } else {
        tmp.crossVectors(UP, p.v).divideScalar(p.r);
        p.w.copy(tmp);
      }
      const wl = p.w.length();
      if (wl > 1e-5) {
        const dq = new THREE.Quaternion().setFromAxisAngle(tmp.copy(p.w).divideScalar(wl), wl * dt);
        p.q.premultiply(dq);
      }
    }
  }

  const m4 = new THREE.Matrix4(), sc = v3();
  function writeInstances() {
    const counts = { pearl: 0, pop: 0, jelly: 0, ice: 0 };
    for (const p of P) {
      if (p.delay > 0) continue;
      const mesh = meshes[p.kind];
      const i = counts[p.kind]++;
      sc.copy(p.scale).multiplyScalar(p.size);
      m4.compose(p.p, p.q, sc);
      mesh.setMatrixAt(i, m4);
      if (mesh.instanceColor) mesh.setColorAt(i, p.color);
    }
    for (const k in meshes) {
      const m = meshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- API
  const api = {
    group, meshes, state, particles: P,
    /** rain particles in from above the cup over `spread` seconds */
    add(kind, count, { tag = kind, color, spread = 1.0, from = 'scoop', delay = 0 } = {}) {
      const out = [];
      const cx = 0.06, cz = 0.08;
      for (let i = 0; i < count; i++) {
        let pos;
        if (kind === 'ice') {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.16;
          pos = new THREE.Vector3(Math.cos(a) * r, CUP.H + 0.9 + i * 0.05, Math.sin(a) * r);
        } else {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (from === 'scoop' ? 0.13 : 0.26);
          pos = new THREE.Vector3(cx + Math.cos(a) * r, CUP.H + 0.75 + Math.random() * 0.25, cz + Math.sin(a) * r);
        }
        const p = spawn(kind, {
          tag, color, pos, vel: new THREE.Vector3(0, -2.2 - Math.random() * 0.6, 0),
          delay: delay + (count > 1 ? (i / (count - 1)) * spread : 0) * (0.7 + Math.random() * 0.3),
        });
        out.push(p);
      }
      return out;
    },
    /** shrink and remove all particles with this tag */
    remove(tag) {
      for (const p of P) if (p.tag === tag) p.dying = true;
    },
    has(tag) { return P.some((p) => p.tag === tag && !p.dying); },
    countTag(tag) { return P.filter((p) => p.tag === tag && !p.dying).length; },
    clear() { P.length = 0; writeInstances(); },
    update(dt) {
      if (!(dt > 1e-5)) { writeInstances(); return; }
      state.time += dt;
      // delays / growth / death
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0 && hooks.onSpawn) hooks.onSpawn(p); continue; }
        p.life += dt;
        if (p.dying) { p.size -= dt * 3; if (p.size <= 0) { P.splice(i, 1); continue; } }
      }
      const n = dt > 1 / 50 ? 3 : 2;
      for (let s = 0; s < n; s++) step(dt / n);
      writeInstances();
    },
  };
  return api;
}

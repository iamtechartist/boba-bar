import * as THREE from 'three';
import { LQ, NOISE, LIQUID, withLiquid } from './glsl.js';
import { CUP, LIQ_R0, LIQ_K, rIn } from './cup.js';
import { sceneColor } from './color.js';

// The drink: analytic layered liquid (wall + surface), syrup tiger stripes, cheese foam,
// the pour stream with splashes, and surface ripples.

const SEG = 128;

function wallGeometry() {
  // side wall (v from 0 bottom to 1 top) + bottom cap; positions are rebuilt in the vertex shader
  const pos = [], aP = [], idx = [];
  const rows = 40;
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      pos.push(0, 0, 0); aP.push(a, i / rows, 0);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, d, b, a, c, d); // outward-facing; we render BackSide
    }
  }
  // bottom cap rings
  const base = pos.length / 3;
  const crings = 10;
  pos.push(0, 0, 0); aP.push(0, 0, 1);
  for (let i = 1; i <= crings; i++) for (let j = 0; j <= SEG; j++) { pos.push(0, 0, 0); aP.push((j / SEG) * Math.PI * 2, 0, 1 + i / crings); }
  for (let j = 0; j < SEG; j++) idx.push(base, base + 1 + j, base + 1 + j + 1);
  for (let i = 1; i < crings; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = base + 1 + (i - 1) * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.2);
  return g;
}

function discGeometry(rings = 28) {
  const pos = [], aP = [], idx = [];
  pos.push(0, 0, 0); aP.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) for (let j = 0; j <= SEG; j++) { pos.push(0, 0, 0); aP.push((j / SEG) * Math.PI * 2, Math.pow(i / rings, 0.8), 0); }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + j + 1, 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = 1 + (i - 1) * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, d, c, a, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.2);
  return g;
}

const WALL_VS = /* glsl */`
  attribute vec3 aP;
  uniform float uLqBottom, uLqLevel, uLqR0, uLqK;
  uniform vec2 uLqTilt;
  varying vec3 vLocal;
  void main(){
    vec2 dir = vec2(cos(aP.x), sin(aP.x));
    vec3 p;
    if (aP.z > 0.5) { // bottom cap: aP.z = 1 + radial fraction
      float rr = (uLqR0 + uLqK * uLqBottom) * (aP.z - 1.0);
      p = vec3(dir.x * rr, uLqBottom, dir.y * rr);
    } else {
      float rTop = uLqR0 + uLqK * uLqLevel;
      float yTop = uLqLevel + dot(uLqTilt, dir * rTop);
      float y = mix(uLqBottom, yTop, aP.y);
      float r = uLqR0 + uLqK * y;
      p = vec3(dir.x * r, y, dir.y * r);
    }
    vLocal = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const WALL_FS = /* glsl */`
  ${NOISE}
  ${LIQUID}
  varying vec3 vLocal;
  void main(){
    vec3 p = vLocal;
    vec3 c = (uLqInv * vec4(cameraPosition, 1.0)).xyz;
    vec3 d = normalize(c - p);
    vec3 p0 = p + d * 0.01;
    float t = bbExit(p0, d) + 0.01;
    vec3 pin = p + d * t;
    vec4 L = bbLayer(pin - d * min(t * 0.5, 0.02));
    float amt = 1.0 - exp(-L.w * t);
    vec3 back = uBackCol * mix(vec3(1.0), bbTint(L.rgb) * 0.92, clamp(t * 3.0, 0.0, 1.0));
    // a little lensing glow in clear drinks
    back *= 1.0 + 0.25 * exp(-pow(length(p.xz) / max(bbR(p.y), 0.01), 2.0) * 2.0);
    vec3 col = mix(back, bbShade(L.rgb, pin, bbEntryNormal(pin)), amt);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const TOP_VS = /* glsl */`
  attribute vec3 aP;
  uniform float uLqLevel, uLqR0, uLqK;
  uniform vec2 uLqTilt;
  varying vec3 vLocal;
  void main(){
    vec2 dir = vec2(cos(aP.x), sin(aP.x));
    float rTop = uLqR0 + uLqK * uLqLevel;
    vec2 xz = dir * rTop * aP.y;
    float y = uLqLevel + dot(uLqTilt, xz);
    y += smoothstep(0.9, 1.0, aP.y) * 0.006; // meniscus
    vec3 p = vec3(xz.x, y, xz.y);
    vLocal = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const TOP_FS = /* glsl */`
  ${NOISE}
  ${LIQUID}
  uniform vec4 uRip[8];
  uniform vec4 uPourHit; // xz, strength, radius
  varying vec3 vLocal;
  void main(){
    vec3 p = vLocal;
    vec3 c = (uLqInv * vec4(cameraPosition, 1.0)).xyz;
    vec3 v = normalize(c - p);
    vec3 d = -v;
    float t = bbExit(p + d * 0.004, d) + 0.004;
    vec4 L = bbLayer(p + d * min(t * 0.5, 0.02));
    float amt = 1.0 - exp(-L.w * t);
    vec3 back = uBackCol * bbTint(L.rgb) * 0.8;
    vec3 col = mix(back, bbShade(L.rgb, p, vec3(0.0, 1.0, 0.0)) * 0.9, amt);
    // surface normal: slosh tilt + ripples + pour churn
    vec3 n = normalize(vec3(-uLqTilt.x, 1.0, -uLqTilt.y));
    vec2 g = vec2(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 r = uRip[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > 2.5) continue;
      vec2 q = p.xz - r.xy;
      float dd = length(q) + 1e-4;
      float front = age * 0.55;
      float env = exp(-age * 1.8) * smoothstep(front + 0.05, front - 0.05, dd) * r.w;
      g += (q / dd) * cos(dd * 70.0 - age * 22.0) * env * 0.35;
    }
    float churn = 0.0;
    if (uPourHit.z > 0.0) {
      vec2 q = p.xz - uPourHit.xy;
      churn = exp(-dot(q, q) / (uPourHit.w * uPourHit.w)) * uPourHit.z;
      g += vec2(bb_snoise(vec3(p.xz * 40.0, uTime * 6.0)), bb_snoise(vec3(p.zx * 40.0, uTime * 6.0 + 3.0))) * churn * 0.5;
      col = mix(col, col * 1.12 + 0.03, churn * 0.6);
    }
    g += vec2(bb_snoise(vec3(p.xz * 9.0, uTime * 0.4)), bb_snoise(vec3(p.zx * 9.0 + 5.0, uTime * 0.4))) * 0.02;
    n = normalize(n + vec3(g.x, 0.0, g.y));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = reflect(-v, n);
    vec3 sky = mix(vec3(0.85, 0.83, 0.82), vec3(1.6), smoothstep(0.1, 0.9, r.y));
    col = mix(col, sky, clamp(fres, 0.0, 1.0) * 0.6);
    vec3 h = normalize(uKeyDir + v);
    col += vec3(1.0, 0.97, 0.94) * pow(max(dot(n, h), 0.0), 220.0) * 2.0;
    // soft edge band where it meets the wall
    float edgeT = length(p.xz) / bbR(p.y);
    col *= 1.0 - 0.12 * smoothstep(0.85, 1.0, edgeT);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// syrup streaks on the inside of the wall: cone shell between cup wall and liquid boundary
const SYRUP_FS = /* glsl */`
  ${NOISE}
  ${LIQUID}
  uniform float uSyrupProg, uSyrupAmt, uSyrupTop;
  uniform vec3 uThin, uThick;
  varying vec3 vLocal;
  float bbStripes(vec3 p, out float thick){
    float ang = atan(p.z, p.x);
    float hN = clamp((p.y - uLqBottom) / (uSyrupTop - uLqBottom), 0.0, 1.0);
    vec3 cq = vec3(cos(ang), p.y * 0.8, sin(ang));
    // main tiger stripes: wavy, leaning, thin at the top and fat where the syrup collected
    float N = 8.0;
    float wob = bb_snoise(cq * 1.2 + 2.0) * 0.5 + bb_snoise(cq * 3.3 + 7.0) * 0.15;
    float x = (ang / 6.2831853 + 0.5) * N + wob + p.y * 0.55;
    float id = mod(floor(x), N);
    float f = fract(x) - 0.5;
    float wTop = 0.05 + 0.06 * bb_hash(id);
    float wBot = 0.27 + 0.15 * bb_hash(id + 1.0);
    float w = mix(wBot, wTop, pow(hN, 0.75)) * (1.0 + 0.4 * bb_snoise(cq * vec3(2.4, 7.0, 2.4) + 11.0));
    float startH = 0.8 + 0.17 * bb_hash(id + 3.0);
    float speed = 0.8 + 0.45 * bb_hash(id + 9.0);
    float front = startH - uSyrupProg * speed * 1.35;
    float growing = 1.0 - step(0.999, uSyrupProg);
    float bulb = smoothstep(0.07, 0.0, hN - front) * step(front, hN) * growing;
    w *= 1.0 + 0.9 * bulb;
    w *= smoothstep(startH + 0.02, startH - 0.14, hN);
    float vis = step(front, hN);
    float cov = smoothstep(w, w - 0.045, abs(f)) * vis;
    float th = clamp(1.0 - pow(abs(f) / max(w, 0.005), 2.0), 0.0, 1.0) * vis * smoothstep(0.0, 0.12, w);
    // thin drips between the stripes
    float x2 = (ang / 6.2831853 + 0.5) * 15.0 - p.y * 1.4 + bb_snoise(cq * 2.0 + 21.0) * 0.7;
    float f2 = fract(x2) - 0.5;
    float id2 = mod(floor(x2), 15.0);
    float w2 = 0.05 + 0.06 * bb_hash(id2 + 17.0);
    float st2 = 0.55 + 0.3 * bb_hash(id2 + 5.0);
    float fr2 = st2 - uSyrupProg * (0.7 + 0.4 * bb_hash(id2)) * 1.0;
    w2 *= smoothstep(st2 + 0.02, st2 - 0.1, hN) * (1.0 + 0.8 * smoothstep(0.05, 0.0, hN - fr2) * growing);
    float vis2 = step(fr2, hN) * step(0.4, bb_hash(id2 + 31.0));
    float cov2 = smoothstep(w2, w2 - 0.035, abs(f2)) * vis2;
    // pooled syrup at the bottom
    float pool = smoothstep(0.07 + 0.03 * bb_snoise(cq * 3.0), 0.02, hN) * clamp(uSyrupProg * 1.6 - 0.45, 0.0, 1.0) * 0.0;
    thick = max(max(th, cov2 * 0.4), pool);
    return max(max(cov, cov2), pool);
  }
  void main(){
    vec3 p = vLocal;
    float thick;
    float cov = bbStripes(p, thick) * uSyrupAmt;
    if (cov < 0.02) discard;
    vec3 c = (uLqInv * vec4(cameraPosition, 1.0)).xyz;
    vec3 v = normalize(c - p);
    // what is behind the syrup: the drink (seen from just inside the wall) or the far side
    vec3 behind = uBackCol * 0.95;
    vec2 rd = normalize(p.xz);
    vec3 n0 = normalize(vec3(rd.x, -uLqK, rd.y));
    if (uLqOn > 0.5 && p.y < bbTopY(p.xz)) {
      vec3 pin = vec3(rd.x * (bbR(p.y) - 0.006), p.y, rd.y * (bbR(p.y) - 0.006));
      vec3 d = -v;
      float t = bbExit(pin, d);
      vec4 L = bbLayer(pin + d * min(t * 0.5, 0.02));
      float amt = 1.0 - exp(-L.w * t);
      behind = mix(uBackCol * bbTint(L.rgb), bbShade(L.rgb, pin, n0), amt);
    }
    // bump from thickness for glossy ridges
    float th = clamp(thick, 0.0, 1.0);
    vec3 dpx = dFdx(p), dpy = dFdy(p);
    float dtx = dFdx(th), dty = dFdy(th);
    vec3 grad = dtx * dpx / max(dot(dpx, dpx), 1e-9) + dty * dpy / max(dot(dpy, dpy), 1e-9);
    vec3 bn = normalize(n0 - grad * 0.01);
    vec3 alb = mix(uThin, uThick, smoothstep(0.0, 0.85, th));
    float a = mix(0.5, 0.97, smoothstep(0.0, 0.6, th));
    float wrap = dot(bn, uKeyDir) * 0.5 + 0.5;
    vec3 lit = alb * (0.75 + 0.35 * wrap);
    vec3 col = mix(behind, lit, a * cov);
    vec3 h = normalize(uKeyDir + v);
    col += vec3(1.0, 0.92, 0.8) * pow(max(dot(bn, h), 0.0), 90.0) * 0.6 * cov;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const SHELL_VS = /* glsl */`
  varying vec3 vLocal;
  void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// --------------------------------------------------------------------------------- pour stream
const STREAM_VS = /* glsl */`
  uniform vec3 uA, uB;      // top, bottom (world)
  uniform float uRad, uTime, uHead, uTail;
  varying vec3 vW; varying vec3 vN; varying float vY;
  void main(){
    float y = position.y; // 0 bottom .. 1 top
    vec3 axis = mix(uB, uA, y);
    float taper = mix(0.62, 1.0, pow(y, 0.6));
    float wob = sin(y * 26.0 - uTime * 22.0) * 0.12 + sin(y * 61.0 - uTime * 37.0) * 0.06;
    vec2 dir = normalize(position.xz + 1e-5);
    float r = uRad * taper * (1.0 + wob * 0.35);
    vec3 off = vec3(sin(y * 9.0 + uTime * 3.0), 0.0, cos(y * 7.0 + uTime * 2.6)) * 0.004 * (1.0 - y);
    vec3 w = axis + vec3(dir.x * r, 0.0, dir.y * r) + off;
    vW = w; vN = normalize(vec3(dir.x, 0.0, dir.y)); vY = y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const STREAM_FS = /* glsl */`
  ${NOISE}
  ${LIQUID}
  uniform vec3 uCol;
  uniform float uHead, uTail;
  uniform float uTime2;
  varying vec3 vW; varying vec3 vN; varying float vY;
  void main(){
    if (vY < uHead || vY > uTail) discard;
    vec3 v = normalize(cameraPosition - vW);
    float ndv = abs(dot(vN, v));
    float flow = bb_snoise(vec3(atan(vN.z, vN.x) * 2.0, vW.y * 9.0 + uTime2 * 14.0, 0.0));
    vec3 col = uCol * (0.82 + 0.22 * ndv + 0.07 * flow);
    float rim = pow(1.0 - ndv, 3.0);
    col = mix(col, vec3(1.35), rim * 0.35);
    vec3 h = normalize(normalize(vec3(-0.5, 0.6, 0.62)) + v);
    col += pow(max(dot(vN, h), 0.0), 60.0) * 0.8;
    col = bbLiquidApply(col, vW);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createDrink(cupApi) {
  const local = cupApi.local;
  const group = new THREE.Group();
  local.add(group);

  LQ.uLqR0.value = LIQ_R0;
  LQ.uLqK.value = LIQ_K;
  LQ.uLqBottom.value = CUP.floorIn + 0.002;
  LQ.uLqLevel.value = LQ.uLqBottom.value;

  const wall = new THREE.Mesh(wallGeometry(), new THREE.ShaderMaterial({
    uniforms: LQ, vertexShader: WALL_VS, fragmentShader: WALL_FS, side: THREE.BackSide,
  }));
  wall.frustumCulled = false;
  group.add(wall);

  const RIP = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -10, 0));
  const TU = { ...LQ, uRip: { value: RIP }, uPourHit: { value: new THREE.Vector4(0, 0, 0, 0.06) } };
  const top = new THREE.Mesh(discGeometry(), new THREE.ShaderMaterial({ uniforms: TU, vertexShader: TOP_VS, fragmentShader: TOP_FS }));
  top.frustumCulled = false;
  group.add(top);
  let ripI = 0;

  // syrup shell (just inside the cup wall)
  const SY = {
    ...LQ, uSyrupProg: { value: 0 }, uSyrupAmt: { value: 0 }, uSyrupTop: { value: CUP.H - 0.12 },
    uThin: { value: new THREE.Color() }, uThick: { value: new THREE.Color() },
  };
  const syP = [];
  for (let y = CUP.floorIn + 0.004; y <= CUP.H - 0.05; y += 0.02) syP.push(new THREE.Vector2(rIn(y) - 0.0018, y));
  const syGeo = new THREE.LatheGeometry(syP.reverse(), 160, Math.PI, Math.PI * 2);
  const syrup = new THREE.Mesh(syGeo, new THREE.ShaderMaterial({
    uniforms: SY, vertexShader: SHELL_VS, fragmentShader: SYRUP_FS, side: THREE.DoubleSide,
  }));
  syrup.visible = false;
  group.add(syrup);

  // ------------------------------------------------------------------ cheese foam
  const FO = { uFoamBase: { value: 1.3 }, uFoamProg: { value: 0 }, uFoamThick: { value: 0.2 }, uLqR0: LQ.uLqR0, uLqK: LQ.uLqK, uT: LQ.uTime };
  const foamGeo = (() => {
    const rings = 40, segs = 128, skirt = 6;
    const aP = [], pos = [], idx = [];
    for (let i = 0; i <= rings + skirt; i++) {
      for (let j = 0; j <= segs; j++) {
        const rn = Math.min(1, i / rings);
        const sk = i > rings ? (i - rings) / skirt : 0;
        aP.push(rn, (j / segs) * Math.PI * 2, sk); pos.push(0, 0, 0);
      }
    }
    for (let i = 0; i < rings + skirt; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
        idx.push(a, d, c, a, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0), 0.8);
    return g;
  })();
  const foamMat = new THREE.MeshPhysicalMaterial({
    color: sceneColor('#e9d9b9'), roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color('#fff4dc'), sheenRoughness: 0.5,
    clearcoat: 0.1, clearcoatRoughness: 0.4, envMapIntensity: 0.7,
  });
  foamMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, FO);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aP;
        uniform float uFoamBase, uFoamProg, uFoamThick, uLqR0, uLqK, uT;
        varying vec3 vFoamP;
        ${NOISE}
        vec3 foamPos(float rn, float a, float sk){
          float prog = uFoamProg;
          float spread = mix(0.22, 1.0, smoothstep(0.0, 0.75, prog));
          float rWall = (uLqR0 + uLqK * uFoamBase) + 0.003;
          float R = rWall * spread;
          vec2 dir = vec2(cos(a), sin(a));
          float thick = uFoamThick * smoothstep(0.0, 0.55, prog);
          float dome = (1.0 - rn * rn) * (0.05 + 0.1 * (1.0 - spread));
          vec3 nq = vec3(dir * rn * 2.2, 0.0);
          float bumps = bb_snoise(nq + vec3(0.0, 0.0, 1.7)) * 0.016 + bb_snoise(nq * 3.1 + 4.0) * 0.006;
          float spiral = 0.5 + 0.5 * sin(rn * 26.0 + a * 1.0 + 1.5);
          float ridge = pow(spiral, 3.0) * 0.022 * smoothstep(1.0, 0.25, rn);
          float edgeRound = sqrt(max(0.0, 1.0 - pow(max(rn - 0.86, 0.0) / 0.14, 2.0)));
          float hTop = (thick * (0.72 + 0.28 * edgeRound) + dome * smoothstep(0.0, 0.4, prog) + (bumps + ridge) * smoothstep(0.1, 0.6, prog)) ;
          float y = uFoamBase + hTop;
          float r = R * rn;
          if (sk > 0.0) { y = mix(uFoamBase + hTop, uFoamBase - 0.035, sk); r = R; }
          return vec3(dir.x * r, y, dir.y * r);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 fp = foamPos(aP.x, aP.y, aP.z);
        float e = 0.004;
        vec3 fr = aP.z > 0.0 ? foamPos(aP.x, aP.y, min(1.0, aP.z + 0.05)) - fp : foamPos(min(1.0, aP.x + e), aP.y, 0.0) - foamPos(max(0.0, aP.x - e), aP.y, 0.0);
        vec3 fa = foamPos(aP.x, aP.y + 0.02, aP.z) - foamPos(aP.x, aP.y - 0.02, aP.z);
        if (aP.x < 0.001 && aP.z == 0.0) { fa = vec3(0.0, 0.0, 1.0); fr = vec3(1.0, 0.0, 0.0); }
        vec3 objectNormal = normalize(cross(fa, fr));
        if (aP.z > 0.0) objectNormal = normalize(vec3(fp.x, 0.0, fp.z));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = fp; vFoamP = fp;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFoamP;\nuniform float uT;\n${NOISE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 q = vFoamP * 70.0;
          float n1 = bb_snoise(q) + 0.5 * bb_snoise(q * 2.7), n2 = bb_snoise(q + 17.0) + 0.5 * bb_snoise(q * 2.7 + 9.0);
          normal = normalize(normal + vec3(n1, n2 * 0.5, n2) * 0.32);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.9 + 0.1 * bb_snoise(vFoamP * 140.0) + 0.06 * bb_snoise(vFoamP * 22.0);`);
  };
  foamMat.customProgramCacheKey = () => 'bbFoam';
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.frustumCulled = false;
  foam.visible = false;
  group.add(foam);

  // ------------------------------------------------------------------ pour stream (world space)
  const SU = {
    ...LQ, uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uRad: { value: 0.03 },
    uHead: { value: 0 }, uTail: { value: 1 }, uCol: { value: new THREE.Color() }, uTime2: { value: 0 },
  };
  const streamGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 80, true).translate(0, 0.5, 0);
  const stream = new THREE.Mesh(streamGeo, new THREE.ShaderMaterial({ uniforms: SU, vertexShader: STREAM_VS, fragmentShader: STREAM_FS }));
  stream.frustumCulled = false;
  stream.visible = false;

  // splash droplets (world space)
  const NS = 40;
  const splashMat = withLiquid(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }), { key: 'splash' });
  const splash = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), splashMat, NS);
  splash.frustumCulled = false;
  splash.count = 0;
  const SP = Array.from({ length: NS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, r: 0 }));
  let spI = 0;
  const m4 = new THREE.Matrix4(), qI = new THREE.Quaternion(), sc = new THREE.Vector3();

  const state = {
    level: LQ.uLqBottom.value,
    pour: null, // {x,z (world), on, head, tail}
    foamOn: false,
  };

  const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();

  const api = {
    group, wall, top, syrup, foam, stream, splash, SY, FO, TU, state,
    get bottom() { return LQ.uLqBottom.value; },
    addRipple(x, z, s = 1) {
      RIP[ripI].set(x, z, LQ.uTime.value, s);
      ripI = (ripI + 1) % 8;
    },
    emitSplash(worldPos, color, n = 6, power = 1) {
      for (let i = 0; i < n; i++) {
        const s = SP[spI]; spI = (spI + 1) % NS;
        s.p.copy(worldPos);
        const a = Math.random() * Math.PI * 2, sp = (0.35 + Math.random() * 0.6) * power;
        s.v.set(Math.cos(a) * sp * 0.6, (1.1 + Math.random() * 1.1) * power, Math.sin(a) * sp * 0.6);
        s.life = 0.35 + Math.random() * 0.4;
        s.r = 0.006 + Math.random() * 0.012;
      }
      splashMat.color.copy(color);
    },
    setStream({ on, x = 0.12, z = 0.04, color, radius = 0.03 }) {
      if (color) SU.uCol.value.copy(color);
      SU.uRad.value = radius;
      state.pour = state.pour || { x, z };
      state.pour.x = x; state.pour.z = z;
      stream.visible = on;
    },
    streamUniforms: SU,
    update(dt, world) {
      LQ.uLqOn.value = state.level > LQ.uLqBottom.value + 0.012 ? 1 : 0;
      LQ.uLqLevel.value = state.level;
      wall.visible = top.visible = LQ.uLqOn.value > 0.5;
      SU.uTime2.value += dt;
      // splash particles
      let n = 0;
      for (const s of SP) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.v.y -= 9.0 * dt;
        s.p.addScaledVector(s.v, dt);
        const k = Math.max(0, Math.min(1, s.life * 5));
        sc.setScalar(s.r * k);
        m4.compose(s.p, qI, sc);
        splash.setMatrixAt(n++, m4);
      }
      splash.count = n;
      splash.instanceMatrix.needsUpdate = true;
      // pour churn on the surface
      if (stream.visible && state.pour) {
        tmpV.set(state.pour.x, 0, state.pour.z);
        tmpL.copy(tmpV).applyMatrix4(LQ.uLqInv.value);
        TU.uPourHit.value.set(tmpL.x, tmpL.z, Math.min(1, SU.uRad.value * 30), 0.07);
      } else TU.uPourHit.value.z = Math.max(0, TU.uPourHit.value.z - dt * 3);
    },
  };
  return api;
}

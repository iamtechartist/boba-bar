import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// Shared liquid state. The drink is an analytic volume (a truncated cone under a tilting plane)
// in cup-local space. Everything that sits inside it (pearls, ice, straw, pour stream...) calls
// bbLiquidApply() so it is seen *through* the tea with the right amount of milky fog.
// ---------------------------------------------------------------------------------------------
const v3 = () => new THREE.Vector3();
export const LQ = {
  uLqInv: { value: new THREE.Matrix4() },
  uLqBottom: { value: 0.05 },
  uLqLevel: { value: 0.05 },
  uLqTilt: { value: new THREE.Vector2() },
  uLqR0: { value: 0.3 },
  uLqK: { value: 0.1 },
  uLqOn: { value: 0 },
  uLayerCol: { value: [v3(), v3(), v3(), v3()] },
  uLayerSig: { value: [40, 40, 40, 40] },
  uLayerTop: { value: [0, 0, 0] },
  uLayerFe: { value: [0.05, 0.04, 0.05] },
  uMix: { value: 0 },
  uSwirl: { value: 0 },
  uTime: { value: 0 },
  uCloudCol: { value: v3() },
  uCloudAmt: { value: 0 },
  uCloudFront: { value: 0 },
  uCloudDir: { value: -1 },
  uCloudLimit: { value: 0 },
  uCloudSig: { value: 60 },
  uFoamBand: { value: 0 },
  uFoamCol: { value: v3() },
  uBackCol: { value: v3() },
  uKeyDir: { value: new THREE.Vector3(-0.5, 0.6, 0.62).normalize() },
};

export const NOISE = /* glsl */ `
vec3 bb_mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bb_mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bb_perm(vec4 x){ return bb_mod289(((x * 34.0) + 10.0) * x); }
vec4 bb_tis(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float bb_snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = bb_mod289(i);
  vec4 p = bb_perm(bb_perm(bb_perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = bb_tis(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float bb_hash(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
`;

export const LIQUID = /* glsl */ `
uniform mat4 uLqInv;
uniform float uLqBottom, uLqLevel, uLqR0, uLqK, uLqOn;
uniform vec2 uLqTilt;
uniform vec3 uLayerCol[4];
uniform float uLayerSig[4];
uniform float uLayerTop[3];
uniform float uLayerFe[3];
uniform float uMix, uSwirl, uTime;
uniform vec3 uCloudCol, uBackCol, uKeyDir, uFoamCol;
uniform float uCloudAmt, uCloudFront, uCloudDir, uCloudLimit, uCloudSig, uFoamBand;

float bbTopY(vec2 xz){ return uLqLevel + dot(uLqTilt, xz); }
float bbR(float y){ return uLqR0 + uLqK * y; }

// distance along d (unit) from interior point p to the boundary of the liquid volume
float bbExit(vec3 p, vec3 d){
  float t = 1e3;
  float fp = p.y - bbTopY(p.xz);
  float fd = d.y - dot(uLqTilt, d.xz);
  if (fd > 1e-5) t = min(t, max(-fp / fd, 0.0));
  if (d.y < -1e-5) t = min(t, max((uLqBottom - p.y) / d.y, 0.0));
  float k = uLqK;
  float rp = uLqR0 + k * p.y;
  float A = d.x * d.x + d.z * d.z - k * k * d.y * d.y;
  float B = 2.0 * (p.x * d.x + p.z * d.z - k * rp * d.y);
  float C = p.x * p.x + p.z * p.z - rp * rp;
  if (abs(A) < 1e-6) A = 1e-6;
  float disc = B * B - 4.0 * A * C;
  if (disc > 0.0) {
    float s = sqrt(disc);
    float t1 = (-B - s) / (2.0 * A);
    float t2 = (-B + s) / (2.0 * A);
    float lo = min(t1, t2), hi = max(t1, t2);
    float tc = lo > 1e-4 ? lo : (hi > 1e-4 ? hi : 1e3);
    t = min(t, tc);
  }
  return t;
}

// albedo (scene-linear) + extinction at a point inside the drink
vec4 bbLayer(vec3 p){
  float h = p.y;
  float ang = atan(p.z, p.x);
  vec3 cq = vec3(cos(ang), h * 1.7, sin(ang));
  float sw = uSwirl;
  float n1 = bb_snoise(cq * 1.6 + vec3(0.0, -uTime * 0.07, uTime * 0.035));
  float n2 = bb_snoise(cq * 4.3 + vec3(uTime * 0.05, uTime * 0.02, -uTime * 0.04));
  float hh = h + n1 * (0.016 + 0.17 * sw) + n2 * (0.006 + 0.05 * sw)
           + sw * 0.11 * sin(ang * 2.0 + h * 10.0 - uTime * 4.0);
  vec3 col = uLayerCol[0];
  float sig = uLayerSig[0];
  for (int i = 1; i < 4; i++) {
    float fe = mix(uLayerFe[i - 1], 0.42, uMix);
    float f = smoothstep(uLayerTop[i - 1] - fe, uLayerTop[i - 1] + fe, hh);
    col = mix(col, uLayerCol[i], f);
    sig = mix(sig, uLayerSig[i], f);
  }
  if (uCloudAmt > 0.002) {
    vec3 q = vec3(p.x * 6.0, h * 3.2, p.z * 6.0);
    float drift = uTime * 0.45 * -uCloudDir;
    float w = bb_snoise(q * 0.55 + vec3(0.0, drift * 0.6, 0.0));
    float c = bb_snoise(q + vec3(w * 1.4, drift, -w * 1.1)) * 0.62 + bb_snoise(q * 2.2 + vec3(w, drift * 1.6, 0.0)) * 0.38;
    float s = (uCloudDir < 0.0) ? (h - uCloudFront) : (uCloudFront - h);
    float region = smoothstep(-0.03, 0.16, s + c * 0.13);
    float lim = (uCloudDir < 0.0) ? smoothstep(uCloudLimit - 0.06, uCloudLimit + 0.06, h)
                                  : smoothstep(uCloudLimit + 0.08, uCloudLimit - 0.08, h);
    float dens = region * lim * smoothstep(-0.32, 0.38, c) * uCloudAmt;
    col = mix(col, uCloudCol, dens);
    sig = mix(sig, uCloudSig, dens);
  }
  if (uFoamBand > 0.002) {
    float fb = smoothstep(uLqLevel - 0.06, uLqLevel - 0.005, h + n2 * 0.012) * uFoamBand;
    col = mix(col, uFoamCol, fb);
    sig = mix(sig, 90.0, fb);
  }
  return vec4(col, sig);
}

vec3 bbShade(vec3 alb, vec3 pin, vec3 nIn){
  float wrap = dot(nIn, uKeyDir) * 0.5 + 0.5;
  float hN = clamp((pin.y - uLqBottom) / max(uLqLevel - uLqBottom, 0.05), 0.0, 1.0);
  float L = (0.60 + 0.46 * wrap) * (0.86 + 0.14 * hN);
  return alb * L;
}

vec3 bbEntryNormal(vec3 pin){
  if (abs(pin.y - bbTopY(pin.xz)) < 0.002) return vec3(0.0, 1.0, 0.0);
  vec2 r = normalize(pin.xz + 1e-6);
  return normalize(vec3(r.x, -uLqK, r.y));
}

vec3 bbTint(vec3 alb){
  float m = max(max(alb.r, alb.g), max(alb.b, 1e-4));
  return alb / m;
}

// colIn: shaded colour of an object at world position wp, as it would look in air.
vec3 bbLiquidApply(vec3 colIn, vec3 wp){
  if (uLqOn < 0.5) return colIn;
  vec3 p = (uLqInv * vec4(wp, 1.0)).xyz;
  float rp = bbR(p.y);
  if (p.y > bbTopY(p.xz) || p.y < uLqBottom - 0.02 || dot(p.xz, p.xz) > rp * rp) return colIn;
  vec3 c = (uLqInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 d = normalize(c - p);
  float t = bbExit(p, d);
  vec3 pin = p + d * t;
  vec4 L = bbLayer(pin - d * min(t * 0.5, 0.02));
  float amt = 1.0 - exp(-L.w * t * 0.4);
  vec3 tinted = colIn * mix(vec3(1.0), bbTint(L.rgb), clamp(t * 5.0, 0.0, 1.0));
  return mix(tinted, bbShade(L.rgb, pin, bbEntryNormal(pin)), amt);
}
`;

// Inject liquid fog into a built-in material (MeshStandard/MeshPhysical), instancing-aware.
export function withLiquid(material, extra = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, LQ);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBBWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 bbWP = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          bbWP = batchingMatrix * bbWP;
        #endif
        #ifdef USE_INSTANCING
          bbWP = instanceMatrix * bbWP;
        #endif
        vBBWorld = (modelMatrix * bbWP).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBBWorld;\n${NOISE}\n${LIQUID}`)
      .replace('#include <opaque_fragment>', `outgoingLight = bbLiquidApply(outgoingLight, vBBWorld);\n#include <opaque_fragment>`);
    if (extra.patch) extra.patch(shader);
    if (prev) prev(shader, renderer);
  };
  const key = extra.key || '';
  material.customProgramCacheKey = () => 'bbLiquid' + key;
  return material;
}

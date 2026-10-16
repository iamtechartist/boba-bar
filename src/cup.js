import * as THREE from 'three';
import { makeDropletNormalMap, makePaperGrain, sleeveTexture, filmTexture } from './textures.js';
import { withLiquid } from './glsl.js';
import { STRAWS } from './recipes.js';

// ------------------------------------------------------------------ dimensions (1 unit = 10 cm)
export const CUP = {
  H: 1.6, rb: 0.30, rt: 0.455, wall: 0.007, floorIn: 0.048,
  sleeveY0: 0.6, sleeveY1: 1.04,
  filmY: 1.6 + 0.0095,
  domeTop: 1.6 + 0.37,
  strawR: 0.06, strawL: 2.3, strawTilt: 0.105, strawYaw: -0.55,
};
const K = (CUP.rt - CUP.rb) / CUP.H;
const ridge = (y) => (y > 0.07 && y < 0.27 ? 0.0032 * Math.pow(Math.sin(((y - 0.07) / 0.2) * Math.PI * 4), 2) : 0);
export const rOut = (y) => CUP.rb + K * y + ridge(y);
export const rIn = (y) => CUP.rb + K * y - CUP.wall + ridge(y);
// liquid boundary cone (slightly inset from the inner wall)
export const LIQ_R0 = CUP.rb - CUP.wall - 0.004;
export const LIQ_K = K;

function cupGeometry() {
  const P = [];
  const v = (r, y) => P.push(new THREE.Vector2(Math.max(r, 0), y));
  v(0.0, 0.03); v(0.12, 0.028); v(0.2, 0.021); v(0.245, 0.011); v(0.27, 0.003); v(0.284, 0.0); v(0.296, 0.004);
  for (let y = 0.014; y < CUP.H - 0.012; y += (y > 0.05 && y < 0.3 ? 0.006 : 0.04)) v(rOut(y), y);
  v(rOut(CUP.H - 0.012), CUP.H - 0.012);
  v(rOut(CUP.H - 0.012) - CUP.wall * 0.5, CUP.H - 0.006);
  v(rIn(CUP.H - 0.012), CUP.H - 0.012);
  for (let y = CUP.H - 0.05; y > 0.075; y -= (y > 0.05 && y < 0.3 ? 0.006 : 0.04)) v(rIn(y), y);
  v(rIn(0.07), 0.07); v(rIn(0.06) - 0.008, 0.055); v(rIn(0.06) - 0.03, CUP.floorIn + 0.002); v(0.0, CUP.floorIn);
  const g = new THREE.LatheGeometry(P, 160, Math.PI, Math.PI * 2);
  // uv.y = height (units) so the droplet map has even density
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i));
  return g;
}

// condensation mask + grazing-angle thickening for the PET shell; art-directed softbox
// reflections for the additive "glaze" pass drawn over everything inside the cup.
const STRIPS = /* glsl */`
  float bbStrip(float az, float el, float c, float w, float soft){
    float d = abs(mod(az - c + 3.14159265, 6.2831853) - 3.14159265);
    return smoothstep(w + soft, w, d) * smoothstep(-0.6, -0.3, el) * smoothstep(0.95, 0.72, el);
  }`;

function cupShader(material, U, { glaze = false, strips = 1, edge = 0.8, direct = 1 } = {}) {
  material.onBeforeCompile = (s) => {
    if (U) Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCupY;\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCupY = position.y;\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vCupY;\nvarying vec3 vGW;\n${U ? 'uniform float uFill, uCold;' : ''}\n${STRIPS}`);
    if (U) {
      s.fragmentShader = s.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float bbCond = smoothstep(uFill + 0.1, uFill - 0.04, vCupY) * smoothstep(0.0, 0.05, vCupY);
          float bbAmt = mix(0.06, 0.85, bbCond * uCold);`)
        .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * bbAmt;');
    }
    if (!glaze) {
      s.fragmentShader = s.fragmentShader.replace('#include <transmission_fragment>', `#include <transmission_fragment>
        float bbEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        totalDiffuse = mix(totalDiffuse, totalDiffuse * vec3(0.78, 0.83, 0.88) + vec3(0.03, 0.035, 0.04), bbEdge * ${edge.toFixed(2)});`);
    } else {
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
        outgoingLight -= reflectedLight.directSpecular * ${(1 - direct).toFixed(2)};
        {
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 vW = normalize(cameraPosition - vGW);
          vec3 R = reflect(-vW, nW);
          float ndv = clamp(abs(dot(nW, vW)), 0.0, 1.0);
          float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          float az = atan(R.x, R.z);
          float hl = bbStrip(az, R.y, -1.05, 0.11, 0.05) * 15.0
                   + bbStrip(az, R.y, 1.95, 0.08, 0.05) * 11.0
                   + bbStrip(az, R.y, 0.72, 0.03, 0.02) * 7.0;
          outgoingLight += vec3(1.0, 0.99, 0.97) * hl * F * ${strips.toFixed(2)};
          outgoingLight += vec3(0.92, 0.94, 0.97) * pow(1.0 - ndv, 3.0) * 0.1 * ${strips.toFixed(2)};
        }
        #include <opaque_fragment>`);
    }
  };
  material.customProgramCacheKey = () => 'cupShell' + (glaze ? 'G' : 'T') + (U ? 'U' : '') + strips + '_' + edge + '_' + direct;
}

function glazeMaterial(normalMap, U, normalScale = 0.5, strips = 1, env = 1.2, direct = 1) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: 0.03, ior: 1.5, specularIntensity: 1,
    envMapIntensity: env, normalMap, normalScale: new THREE.Vector2(normalScale, normalScale),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  cupShader(m, U, { glaze: true, strips, direct });
  return m;
}

function shellMaterial(normalMap, U, normalScale = 0.5, edge = 0.8) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.0, transmission: 1, thickness: 0.05, ior: 1.5,
    specularIntensity: 0, attenuationColor: new THREE.Color('#eef6fb'), attenuationDistance: 3,
    normalMap, normalScale: new THREE.Vector2(normalScale, normalScale), depthWrite: false,
  });
  cupShader(m, U, { edge });
  return m;
}

// ------------------------------------------------------------------ dome lid profile
function domeGeometry() {
  const outer = [];
  const v = (r, y) => outer.push(new THREE.Vector2(r, y));
  const H = CUP.H, rt = CUP.rt;
  v(rt + 0.02, H - 0.032); v(rt + 0.024, H - 0.01); v(rt + 0.023, H + 0.012); v(rt + 0.014, H + 0.024);
  v(rt - 0.01, H + 0.027); v(rt - 0.028, H + 0.032);
  const rd = rt - 0.036, hd = 0.335, base = H + 0.034;
  for (let i = 1; i <= 26; i++) {
    const s = i / 26;
    const r = 0.075 + (rd - 0.075) * Math.pow(Math.cos(s * Math.PI / 2), 0.78);
    const y = base + hd * Math.pow(Math.sin(s * Math.PI / 2), 1.25);
    v(r, y);
  }
  v(0.072, base + hd + 0.003); v(0.07, base + hd - 0.006);
  // inner surface: offset along the 2D normal
  const t = 0.0055, inner = [];
  for (let i = outer.length - 1; i >= 0; i--) {
    const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    inner.push(new THREE.Vector2(outer[i].x - dy / l * t, outer[i].y + dx / l * t));
  }
  const g = new THREE.LatheGeometry(outer.concat(inner), 128, Math.PI, Math.PI * 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i));
  return g;
}

// ------------------------------------------------------------------ straw (cut at an angle)
function strawGeometry(r, L) {
  const g = new THREE.CylinderGeometry(r, r, L, 40, 24, true);
  g.translate(0, L / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i);
    const cut = 0.085 + x * 1.15; // slanted bottom end
    // compress the bottom band so the slant is clean and the rest of the tube stays uniform
    if (y < 0.3) pos.setY(i, cut + (y / 0.3) * (0.3 - cut));
  }
  g.computeVertexNormals();
  return g;
}

export function createCup(renderer, scene) {
  const group = new THREE.Group(); // the whole drink rig: rotated by drag, rocked by shake
  group.name = 'cupRig';
  const local = new THREE.Group(); // cup-local frame (pivot math lives in main)
  group.add(local);

  const dropTex = makeDropletNormalMap(512);
  dropTex.repeat.set(3, 1.1);
  const U = { uFill: { value: 1.3 }, uCold: { value: 1 } };

  // shell + glaze
  const shellGeo = cupGeometry();
  const shellMat = shellMaterial(dropTex, U, 0.12);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.renderOrder = 0;
  local.add(shell);
  const rimGeo = new THREE.TorusGeometry(CUP.rt - CUP.wall * 0.5 + 0.0035, 0.0125, 20, 200).rotateX(Math.PI / 2).translate(0, CUP.H - 0.004, 0);
  const rimMat = shellMaterial(null, null);
  rimMat.thickness = 0.12;
  const rim = new THREE.Mesh(rimGeo, rimMat);
  local.add(rim);
  const glaze = new THREE.Mesh(shellGeo, glazeMaterial(dropTex, U, 0.3));
  glaze.renderOrder = 30;
  local.add(glaze);
  const rimGlaze = new THREE.Mesh(rimGeo, glazeMaterial(null, null, 0.5, 1.4));
  rimGlaze.renderOrder = 30;
  local.add(rimGlaze);

  // invisible proxy for tap picking
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(CUP.rt + 0.05, CUP.rb + 0.05, CUP.H + 0.4, 16).translate(0, (CUP.H + 0.4) / 2, 0), new THREE.MeshBasicMaterial());
  proxy.visible = false;
  local.add(proxy);

  // ---------------------------------------------------------------- sleeve
  const sleeve = new THREE.Group();
  local.add(sleeve);
  const grain = makePaperGrain();
  grain.repeat.set(10, 2);
  const sW = 2048, sH = Math.round(2048 * (CUP.sleeveY1 - CUP.sleeveY0) / (2 * Math.PI * rOut((CUP.sleeveY0 + CUP.sleeveY1) / 2)));
  const sleeveTex = {};
  const getSleeveTex = (id) => (sleeveTex[id] ||= sleeveTexture(id, sW, sH, renderer));
  const SU = { uMap2: { value: null }, uWipe: { value: 0 } };
  const sleeveMat = new THREE.MeshStandardMaterial({ map: getSleeveTex('kraft'), roughness: 0.78, bumpMap: grain, bumpScale: 0.5, envMapIntensity: 0.45 });
  sleeveMat.color.setScalar(0.78);
  sleeveMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SU);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMap2;\nuniform float uWipe;')
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        if (uWipe > 0.0) {
          vec4 s2 = texture2D( uMap2, vMapUv );
          float edge = uWipe * 1.08 - 0.04;
          float m = smoothstep(edge + 0.004, edge - 0.004, vMapUv.x);
          sampledDiffuseColor = mix(sampledDiffuseColor, s2, m);
          sampledDiffuseColor.rgb *= 1.0 - 0.25 * exp(-pow((vMapUv.x - edge) / 0.01, 2.0)) * step(0.001, uWipe) * step(uWipe, 0.999);
        }
        diffuseColor *= sampledDiffuseColor;`);
  };
  const sOff = 0.0032, sT = 0.0035;
  const sleeveR = (y) => CUP.rb + K * y + sOff;
  const outerS = new THREE.LatheGeometry([new THREE.Vector2(sleeveR(CUP.sleeveY0) + sT, CUP.sleeveY0), new THREE.Vector2(sleeveR(CUP.sleeveY1) + sT, CUP.sleeveY1)], 160, Math.PI, Math.PI * 2);
  sleeve.add(new THREE.Mesh(outerS, sleeveMat));
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#f3ead9', roughness: 0.9 });
  const ring = (y, up) => new THREE.LatheGeometry(up
    ? [new THREE.Vector2(sleeveR(y) + sT, y), new THREE.Vector2(sleeveR(y) - 0.001, y)]
    : [new THREE.Vector2(sleeveR(y) - 0.001, y), new THREE.Vector2(sleeveR(y) + sT, y)], 160, Math.PI, Math.PI * 2);
  sleeve.add(new THREE.Mesh(ring(CUP.sleeveY1, true), edgeMat));
  sleeve.add(new THREE.Mesh(ring(CUP.sleeveY0, false), edgeMat));
  let sleeveId = 'kraft';

  // ---------------------------------------------------------------- lids
  const lid = new THREE.Group();
  local.add(lid);
  // film
  const filmTex = {};
  const getFilmTex = (id) => (filmTex[id] ||= filmTexture(id, renderer));
  const FU = { uDimple: { value: 0 }, uPierce: { value: new THREE.Vector2() } };
  const filmMat = new THREE.MeshPhysicalMaterial({ map: getFilmTex('kraft'), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.035, specularIntensity: 0.6 });
  filmMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, FU);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uDimple;\nuniform vec2 uPierce;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bbR = length(position.xz - uPierce);
        transformed.y -= uDimple * exp(-bbR * bbR / 0.018);
        float bbE = length(position.xz) / ${(CUP.rt + 0.014).toFixed(4)};
        transformed.y -= smoothstep(0.93, 1.0, bbE) * 0.012;`);
  };
  const filmGeo = new THREE.CircleGeometry(CUP.rt + 0.014, 128, 0, Math.PI * 2);
  {
    // polar grid would be nicer for the dimple; circle geometry with radial subdivisions:
    const rings = 24, segs = 128, R = CUP.rt + 0.014;
    const posA = [], uvA = [], idx = [];
    posA.push(0, 0, 0); uvA.push(0.5, 0.5);
    for (let i = 1; i <= rings; i++) {
      const r = (i / rings) * R;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        posA.push(Math.cos(a) * r, 0, -Math.sin(a) * r);
        uvA.push(0.5 + Math.cos(a) * r / R * 0.5, 0.5 + Math.sin(a) * r / R * 0.5);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
    for (let i = 1; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs);
        const c = 1 + i * segs + j, d = 1 + i * segs + ((j + 1) % segs);
        idx.push(a, c, d, a, d, b);
      }
    }
    filmGeo.setIndex(idx);
    filmGeo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    filmGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    filmGeo.deleteAttribute('normal');
    filmGeo.computeVertexNormals();
  }
  const film = new THREE.Mesh(filmGeo, filmMat);
  film.position.y = CUP.filmY;
  lid.add(film);
  // dome
  const domeGeo = domeGeometry();
  const dome = new THREE.Group();
  const domeShell = new THREE.Mesh(domeGeo, shellMaterial(null, null, 0.5, 0.22));
  domeShell.material.thickness = 0.03;
  domeShell.renderOrder = 0;
  const domeGlaze = new THREE.Mesh(domeGeo, glazeMaterial(null, null, 0.5, 0.4, 0.05, 0.0));
  domeGlaze.renderOrder = 31;
  dome.add(domeShell, domeGlaze);
  lid.add(dome);
  const lidState = { type: 'film', y: 0, on: false };

  // ---------------------------------------------------------------- straw
  const strawRig = new THREE.Group();
  local.add(strawRig);
  const strawGeo = strawGeometry(CUP.strawR, CUP.strawL);
  const strawInnerGeo = strawGeometry(CUP.strawR - 0.006, CUP.strawL);
  const strawMats = {};
  for (const s of STRAWS) {
    if (s.id === 'clear') {
      strawMats.clear = [
        withLiquid(new THREE.MeshPhysicalMaterial({ color: '#e9f1f6', roughness: 0.04, transmission: 1, thickness: 0.06, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6, side: THREE.FrontSide }), {
          key: 'strawC',
          patch(s) {
            s.fragmentShader = s.fragmentShader.replace('#include <transmission_fragment>', `#include <transmission_fragment>
              float bbE = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.6);
              totalDiffuse = mix(totalDiffuse, totalDiffuse * vec3(0.55, 0.62, 0.68), bbE * 0.85);`);
          },
        }),
        withLiquid(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 1, thickness: 0.02, ior: 1.45, specularIntensity: 0.6, side: THREE.BackSide }), { key: 'strawCi' }),
      ];
    } else {
      const c = new THREE.Color(s.color);
      strawMats[s.id] = [
        withLiquid(new THREE.MeshPhysicalMaterial({ color: c, roughness: s.id === 'black' ? 0.12 : 0.28, clearcoat: 1, clearcoatRoughness: 0.06, sheen: s.id === 'black' ? 0 : 0.4, sheenColor: c, sheenRoughness: 0.5 }), { key: 'strawO' }),
        withLiquid(new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.7), roughness: 0.4, side: THREE.BackSide }), { key: 'strawOi' }),
      ];
    }
  }
  const straw = new THREE.Mesh(strawGeo, strawMats.black[0]);
  const strawInner = new THREE.Mesh(strawInnerGeo, strawMats.black[1]);
  straw.renderOrder = 2; strawInner.renderOrder = 2;
  const strawBody = new THREE.Group();
  strawBody.add(straw, strawInner);
  strawRig.add(strawBody);
  const strawState = { color: 'black', lift: 3, visible: false };
  const strawAxis = new THREE.Vector3();
  const pierceFor = (type) => new THREE.Vector3(0, type === 'dome' ? CUP.domeTop : CUP.filmY, 0);
  const strawDepth = (type) => (pierceFor(type).y - 0.065) / Math.cos(CUP.strawTilt);

  // ---------------------------------------------------------------- condensation droplets (instanced)
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const ND = isMobile ? 22 : 40;
  const dropGeo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.0, transmission: 1, thickness: 0.02, ior: 1.33, specularIntensity: 1, envMapIntensity: 1.6 });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, ND);
  drops.renderOrder = 6;
  drops.frustumCulled = false;
  local.add(drops);
  const D = [];
  const spawnDrop = (d, anywhere) => {
    const fill = U.uFill.value;
    for (let k = 0; k < 20; k++) {
      d.a = Math.random() * Math.PI * 2;
      d.y = 0.1 + Math.random() * Math.max(0.05, Math.min(fill, CUP.H - 0.1) - 0.12);
      if (d.y < CUP.sleeveY0 - 0.03 || d.y > CUP.sleeveY1 + 0.03) break;
    }
    d.r = 0.007 + Math.pow(Math.random(), 2.2) * 0.016;
    d.v = 0; d.wait = anywhere ? Math.random() * 6 : 2 + Math.random() * 8;
    d.grow = anywhere ? 1 : 0;
  };
  for (let i = 0; i < ND; i++) { const d = {}; spawnDrop(d, true); D.push(d); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), nv = new THREE.Vector3();
  const upV = new THREE.Vector3(0, 1, 0);
  let dropVis = 0;

  function updateDrops(dt, cold) {
    dropVis += ((cold ? 1 : 0) - dropVis) * Math.min(1, dt * 1.5);
    for (let i = 0; i < ND; i++) {
      const d = D[i];
      d.grow = Math.min(1, d.grow + dt * 0.8);
      if (d.wait > 0) { d.wait -= dt; if (d.r > 0.014) d.r += dt * 0.0008; }
      else {
        d.v = Math.min(0.12 + d.r * 4, d.v + dt * 0.25);
        d.y -= d.v * dt;
        if (Math.random() < dt * 0.6) { d.wait = Math.random() * 1.2; d.v = 0; }
      }
      const inSleeve = d.y < CUP.sleeveY1 + 0.02 && d.y > CUP.sleeveY0 - 0.02;
      if (d.y < 0.06 || inSleeve) spawnDrop(d, false);
      const r = rOut(d.y) + 0.0005;
      pv.set(Math.sin(d.a) * r, d.y, Math.cos(d.a) * r);
      nv.set(Math.sin(d.a), -K, Math.cos(d.a)).normalize();
      q.setFromUnitVectors(upV, nv);
      const s = d.r * d.grow * dropVis;
      const stretch = d.wait > 0 ? 1 : 1 + Math.min(0.5, d.v * 3);
      sc.set(s, s * 0.42, s * stretch);
      // stretch along the slide direction (down the cup): local z after rotation points ~down
      m4.compose(pv, q, sc);
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- API
  const api = {
    group, local, shell, glaze, rim, proxy, sleeve, lid, film, dome, strawRig, strawBody, drops, U, FU,
    lidState, strawState,
    setFill(y) { U.uFill.value = y; },
    setSleeve(id) { sleeveId = id; sleeveMat.map = getSleeveTex(id); SU.uWipe.value = 0; sleeveMat.needsUpdate = false; filmMat.map = getFilmTex(id); },
    get sleeveId() { return sleeveId; },
    beginSleeveWipe(id) { SU.uMap2.value = getSleeveTex(id); SU.uWipe.value = 0.0001; },
    sleeveWipe(t) { SU.uWipe.value = Math.max(0.0001, t); },
    endSleeveWipe(id) { sleeveId = id; sleeveMat.map = getSleeveTex(id); SU.uWipe.value = 0; filmMat.map = getFilmTex(id); },
    preloadSleeves(ids) { for (const id of ids) { getSleeveTex(id); getFilmTex(id); } },
    setLidType(type) { lidState.type = type; },
    setStrawColor(id) {
      strawState.color = id;
      straw.material = strawMats[id][0];
      strawInner.material = strawMats[id][1];
      straw.renderOrder = id === 'clear' ? 4 : 2;
    },
    strawDepth, pierceFor, strawAxis,
    allStrawMaterials: () => Object.values(strawMats).flat(),
    update(dt, { cold }) {
      // lid placement
      film.visible = lidState.on && lidState.type === 'film';
      dome.visible = lidState.on && lidState.type === 'dome';
      lid.position.y = lidState.y;
      // straw pose: rig at pierce point, tilted; body slides along its axis
      const pierce = pierceFor(lidState.type);
      strawRig.position.copy(pierce);
      strawRig.rotation.set(0, CUP.strawYaw, 0);
      strawRig.rotateZ(CUP.strawTilt);
      strawBody.position.set(0, -strawDepth(lidState.type) + strawState.lift, 0);
      strawRig.visible = strawState.visible;
      strawAxis.set(0, 1, 0).applyQuaternion(strawRig.quaternion);
      updateDrops(dt, cold);
    },
    // straw capsule in cup-local space (tip, top) for the toppings physics
    strawSegment(a, b) {
      const pierce = pierceFor(lidState.type);
      const off = -strawDepth(lidState.type) + strawState.lift;
      a.copy(pierce).addScaledVector(strawAxis, off + 0.05);
      b.copy(pierce).addScaledVector(strawAxis, off + CUP.strawL);
      return strawState.visible;
    },
  };
  api.setStrawColor('black');
  return api;
}

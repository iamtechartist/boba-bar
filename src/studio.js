import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sceneColor } from './color.js';

// Soft pastel infinity-cove studio: gradient sweep, light pool, contact shadow + drink caustic.

const DITHER = /* glsl */ `
float bbDither(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
`;

export function createStudio(renderer, scene) {
  // --- environment for reflections: RoomEnvironment + two tall softbox strips for product highlights
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const stripMat = (i) => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); m.color.setScalar(i); return m; };
  const box = new THREE.BoxGeometry();
  const addStrip = (x, y, z, w, h, inten, rotY) => {
    const m = new THREE.Mesh(box, stripMat(inten));
    m.position.set(x, y, z);
    m.scale.set(w, h, 0.1);
    m.rotation.y = rotY;
    room.add(m);
  };
  // positions are in RoomEnvironment space (shifted down 3.5)
  addStrip(-9.5, 9.0, 8.5, 1.8, 16, 30, Math.atan2(9.5, -8.5));
  addStrip(10.5, 9.5, -2.5, 1.2, 15, 24, Math.atan2(-10.5, 2.5));
  addStrip(6.5, 8.0, 11.5, 0.9, 12, 14, Math.atan2(-6.5, -11.5));
  const envTex = pmrem.fromScene(room, 0.025).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.75;
  scene.environmentRotation = new THREE.Euler(0, 0.35, 0);
  room.dispose?.();

  // --- lights for the opaque PBR bits (pearls, sleeve, foam, straw)
  const key = new THREE.DirectionalLight(0xfff4ea, 1.7);
  key.position.set(-2.6, 4.2, 3.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(3.0, 3.2, -3.4);
  scene.add(rim);
  const fill = new THREE.HemisphereLight(0xffffff, 0xf2d8c8, 0.35);
  scene.add(fill);

  // --- palette
  const U = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFloorNear: { value: new THREE.Color() },
    uCup: { value: new THREE.Vector3() },
    uLift: { value: 0 },
    uBaseR: { value: 0.3 },
    uShadowDir: { value: new THREE.Vector2(0.55, -0.83).normalize() },
    uShadowLen: { value: 1.25 },
    uShadowAmt: { value: 1 },
    uCaustic: { value: new THREE.Color(1, 0.8, 0.6) },
    uCausticAmt: { value: 0.0 },
  };

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: U,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uFloorNear;
        varying vec3 vDir;
        ${DITHER}
        void main(){
          float e = vDir.y;
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.5, e));
          float glow = exp(-pow(acos(clamp(dot(vDir, normalize(vec3(0.02, 0.06, -1.0))), -1.0, 1.0)) / 0.42, 2.0));
          float up = smoothstep(0.0, 0.25, e);
          col *= 1.0 + 0.16 * glow * up;
          col *= 1.0 - 0.10 * smoothstep(0.15, 0.9, abs(vDir.x)) * up;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += bbDither(gl_FragCoord.xy) / 255.0;
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uFloorNear, uCup, uCaustic;
        uniform float uLift, uBaseR, uShadowLen, uShadowAmt, uCausticAmt;
        uniform vec2 uShadowDir;
        varying vec3 vW;
        ${DITHER}
        void main(){
          float r = length(vW.xz);
          vec3 col = mix(uFloorNear, uHorizon, smoothstep(1.0, 26.0, r));
          col *= 1.0 - 0.08 * smoothstep(2.0, 9.0, abs(vW.x)) * (1.0 - smoothstep(10.0, 26.0, r));
          float pool = exp(-dot(vW.xz - vec2(-0.3, -0.4), vW.xz - vec2(-0.3, -0.4)) / 7.0);
          col *= 1.0 + 0.08 * pool;
          // contact + cast shadow
          vec2 q = vW.xz - uCup.xz;
          float d = length(q);
          float h = uLift;
          float fade = 1.0 - smoothstep(0.0, 1.6, h);
          float core = 1.0 - smoothstep(uBaseR * 0.55, uBaseR * 1.18 + h * 0.9, d);
          float ring = exp(-pow((d - uBaseR * 0.97) / (0.03 + h * 0.4), 2.0));
          vec2 ld = uShadowDir;
          float al = dot(q, ld);
          float alc = clamp(al, 0.0, uShadowLen);
          float perp = length(q - ld * alc);
          float w = uBaseR * 1.05 + alc * 0.18 + h * 0.6;
          float castS = exp(-pow(perp / w, 2.0)) * (1.0 - 0.75 * alc / uShadowLen) * smoothstep(-0.25, 0.25, al + uBaseR * 0.5);
          float shadow = (core * 0.42 + ring * 0.3 + castS * 0.3) * fade * uShadowAmt;
          // light focused through the drink lands inside the cast shadow
          vec2 cc = q - ld * (uBaseR * 1.55);
          float caus = exp(-dot(cc, cc) / 0.07);
          float cring = exp(-pow((length(cc * vec2(1.0, 1.25)) - 0.17) / 0.04, 2.0));
          vec3 lit = col * (1.0 - shadow);
          lit += col * uCaustic * (caus * 0.45 + cring * 0.22) * uCausticAmt * fade;
          gl_FragColor = vec4(lit, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += bbDither(gl_FragCoord.xy) / 255.0;
        }`,
    }),
  );
  floor.renderOrder = -9;
  scene.add(floor);

  // palette tweening in display space
  const cur = { top: new THREE.Color('#f7e3d2'), hor: new THREE.Color('#f0cfb5'), near: new THREE.Color('#f8dcc7') };
  const from = { top: new THREE.Color(), hor: new THREE.Color(), near: new THREE.Color() };
  const to = { top: new THREE.Color(), hor: new THREE.Color(), near: new THREE.Color() };
  let t = 1, dur = 1;
  const derive = (hex, o) => {
    const base = new THREE.Color(hex);
    const hsl = {}; base.getHSL(hsl);
    o.hor.copy(base);
    o.top.setHSL(hsl.h, Math.min(1, hsl.s * 1.12 + 0.04), hsl.l * 0.86);
    o.near.copy(base).lerp(new THREE.Color('#ffffff'), 0.16);
  };
  const apply = () => {
    sceneColor(cur.top, U.uTop.value);
    sceneColor(cur.hor, U.uHorizon.value);
    sceneColor(cur.near, U.uFloorNear.value);
  };
  derive('#f6d5bd', cur); apply();

  return {
    uniforms: U,
    envTex,
    setBackdrop(hex, seconds = 1.2) {
      from.top.copy(cur.top); from.hor.copy(cur.hor); from.near.copy(cur.near);
      derive(hex, to);
      t = 0; dur = Math.max(0.001, seconds);
    },
    update(dt) {
      if (t < 1) {
        t = Math.min(1, t + dt / dur);
        const e = t * t * (3 - 2 * t);
        cur.top.copy(from.top).lerp(to.top, e);
        cur.hor.copy(from.hor).lerp(to.hor, e);
        cur.near.copy(from.near).lerp(to.near, e);
        apply();
      }
    },
    currentHorizon: () => cur.hor,
  };
}

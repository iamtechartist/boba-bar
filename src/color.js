import * as THREE from 'three';

// Exact inverse of three.js' ACESFilmicToneMapping (+ sRGB output), so authored display colours
// (backdrop, drink albedo) land on screen as designed instead of being crushed by the curve.
export const EXPOSURE = 1.0;

const IN = [ // rows of ACESInputMat * v
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];
const OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];
const inv3 = (m) => {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
};
const IN_INV = inv3(IN), OUT_INV = inv3(OUT);
const mul = (m, v) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);

function rrtInv(x) {
  // solve (v^2 + 0.0245786 v - 0.000090537) / (0.983729 v^2 + 0.4329510 v + 0.238081) = x
  x = Math.min(Math.max(x, 0), 0.985);
  const a = 1 - 0.983729 * x, b = 0.0245786 - 0.432951 * x, c = -0.000090537 - 0.238081 * x;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

const tmp = new THREE.Color();
/** display sRGB (hex or Color) -> scene-linear value that tone-maps back to it */
export function sceneColor(hexOrColor, out = new THREE.Color()) {
  tmp.set(hexOrColor); // three converts hex to linear-sRGB working space
  const lin = [Math.min(tmp.r, 0.97), Math.min(tmp.g, 0.97), Math.min(tmp.b, 0.97)];
  const x = mul(OUT_INV, lin).map(rrtInv);
  const v = mul(IN_INV, x).map((u) => Math.max(u, 0) * 0.6 / EXPOSURE);
  return out.setRGB(v[0], v[1], v[2], THREE.LinearSRGBColorSpace);
}

export const lerpColor = (a, b, t, out = new THREE.Color()) => out.copy(a).lerp(b, t);

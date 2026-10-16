import * as THREE from 'three';

// All textures are generated here: condensation normals, paper grain, sleeve artwork, film print.

let seed = 1234567;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();

// ---------------------------------------------------------------- condensation normal map
export function makeDropletNormalMap(size = 512) {
  seed = 99173;
  const h = new Float32Array(size * size);
  const drop = (cx, cy, r, k) => {
    const r2 = r * r;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const v = Math.sqrt(1 - d2 / r2) * r * k;
        const i = ((y + size) % size) * size + ((x + size) % size);
        if (v > h[i]) h[i] = v;
      }
    }
  };
  for (let i = 0; i < 260; i++) drop(rr(0, size), rr(0, size), rr(1.6, 3.0), 0.5);
  for (let i = 0; i < 110; i++) drop(rr(0, size), rr(0, size), rr(3.5, 7), 0.5);
  for (let i = 0; i < 22; i++) { const r = rr(8, 13); drop(rr(0, size), rr(0, size), r, 0.45); }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = (at(x - 1, y) - at(x + 1, y)) * 0.9;
      let ny = (at(x, y + 1) - at(x, y - 1)) * 0.9;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = (nx / l * 0.5 + 0.5) * 255;
      data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      data[i + 3] = Math.min(255, at(x, y) * 60);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- paper grain (bump)
export function makePaperGrain(size = 256) {
  seed = 4242;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(rr(95, 165));
    g.strokeStyle = `rgba(${v},${v},${v},${rr(0.15, 0.4)})`;
    g.lineWidth = rr(0.5, 1.4);
    const x = rr(0, size), y = rr(0, size), a = rr(0, Math.PI), l = rr(3, 14);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ---------------------------------------------------------------- sleeve artwork
const ROUND = '"SF Pro Rounded", ui-rounded, "Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wordmark(g, x, y, size, fill, stroke, strokeW = 0) {
  g.save();
  g.font = `800 ${size}px ${ROUND}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) { g.lineJoin = 'round'; g.lineWidth = strokeW; g.strokeStyle = stroke; g.strokeText('boba bar', x, y); }
  g.fillStyle = fill;
  g.fillText('boba bar', x, y);
  g.restore();
}

function pearlRow(g, x, y, n, r, col) {
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * r * 2.6;
    g.fillStyle = col;
    g.beginPath(); g.arc(px, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(px - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); g.fill();
  }
}

function cloudShape(g, x, y, s) {
  const blobs = [[-0.9, 0.15, 0.5], [-0.4, -0.2, 0.62], [0.25, -0.32, 0.7], [0.85, 0.05, 0.52], [0.2, 0.25, 0.55], [-0.35, 0.3, 0.5]];
  g.beginPath();
  for (const [bx, by, br] of blobs) { g.moveTo(x + bx * s + br * s, y + by * s); g.arc(x + bx * s, y + by * s, br * s, 0, Math.PI * 2); }
}

function cherry(g, x, y, s, rot) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.strokeStyle = '#4f7a2a'; g.lineWidth = s * 0.09; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-s * 0.42, s * 0.2); g.quadraticCurveTo(-s * 0.3, -s * 0.6, s * 0.12, -s * 0.95); g.stroke();
  g.beginPath(); g.moveTo(s * 0.42, s * 0.28); g.quadraticCurveTo(s * 0.35, -s * 0.5, s * 0.12, -s * 0.95); g.stroke();
  g.fillStyle = '#5fa83a';
  g.beginPath(); g.ellipse(s * 0.38, -s * 0.95, s * 0.32, s * 0.14, -0.4, 0, Math.PI * 2); g.fill();
  for (const [cx, cy] of [[-s * 0.45, s * 0.42], [s * 0.42, s * 0.5]]) {
    const gr = g.createRadialGradient(cx - s * 0.12, cy - s * 0.12, s * 0.05, cx, cy, s * 0.36);
    gr.addColorStop(0, '#ff5a6e'); gr.addColorStop(0.6, '#e0182f'); gr.addColorStop(1, '#b30c22');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, s * 0.34, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(cx - s * 0.12, cy - s * 0.12, s * 0.08, s * 0.05, -0.6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function cupIcon(g, x, y, s, col) {
  g.save();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s * 0.07; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.38); g.lineTo(x - s * 0.3, y + s * 0.55); g.lineTo(x + s * 0.3, y + s * 0.55); g.lineTo(x + s * 0.42, y - s * 0.38); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.38); g.lineTo(x + s * 0.5, y - s * 0.38); g.stroke();
  g.beginPath(); g.moveTo(x + s * 0.08, y - s * 0.38); g.lineTo(x + s * 0.24, y - s * 0.9); g.stroke();
  for (const [px, py] of [[-0.14, 0.38], [0.04, 0.42], [0.18, 0.34], [-0.05, 0.25], [0.12, 0.2]]) {
    g.beginPath(); g.arc(x + px * s, y + py * s, s * 0.065, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function grain(g, W, H, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rr(0.02, alpha)})`;
    g.fillRect(rr(0, W), rr(0, H), rr(1, 3), rr(1, 3));
  }
}

const DESIGNS = {
  gingham(g, W, H) {
    g.fillStyle = '#fffaf6'; g.fillRect(0, 0, W, H);
    const s = H / 6.5;
    g.fillStyle = 'rgba(242, 128, 160, 0.42)';
    for (let x = 0; x < W + s; x += s * 2) g.fillRect(x, 0, s, H);
    for (let y = s * 0.25; y < H; y += s * 2) g.fillRect(0, y, W, s);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let x = s * 0.5; x < W; x += s) g.fillRect(x, 0, 1.5, H);
    // label
    const lw = H * 1.55, lh = H * 0.56;
    g.fillStyle = 'rgba(70,20,30,0.12)'; roundRect(g, W / 2 - lw / 2 + 4, H / 2 - lh / 2 + 6, lw, lh, lh / 2); g.fill();
    g.fillStyle = '#ffffff'; roundRect(g, W / 2 - lw / 2, H / 2 - lh / 2, lw, lh, lh / 2); g.fill();
    g.strokeStyle = '#ef7096'; g.lineWidth = 5; g.setLineDash([12, 9]); roundRect(g, W / 2 - lw / 2 + 12, H / 2 - lh / 2 + 12, lw - 24, lh - 24, lh / 2 - 12); g.stroke(); g.setLineDash([]);
    wordmark(g, W / 2, H / 2 - lh * 0.06, lh * 0.42, '#e04a77');
    pearlRow(g, W / 2, H / 2 + lh * 0.27, 5, lh * 0.045, '#5a2e16');
  },
  clouds(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#a9d8ff'); bg.addColorStop(1, '#d4ecff');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    seed = 777;
    const cl = [];
    for (let i = 0; i < 13; i++) cl.push([(i + rr(0.1, 0.6)) * W / 13, rr(H * 0.22, H * 0.78), rr(H * 0.13, H * 0.2)]);
    for (const [x, y, s] of cl) {
      if (Math.abs(x - W / 2) < H * 0.95) continue;
      g.save();
      g.fillStyle = '#ffffff';
      cloudShape(g, x, y, s); g.fill();
      g.strokeStyle = '#5d7fd6'; g.lineWidth = H * 0.012; g.lineJoin = 'round';
      cloudShape(g, x + 3, y + 2, s); g.stroke();
      g.fillStyle = '#5d7fd6';
      g.beginPath(); g.arc(x - s * 0.25, y + s * 0.02, s * 0.06, 0, Math.PI * 2); g.arc(x + s * 0.25, y + s * 0.02, s * 0.06, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,140,170,0.55)';
      g.beginPath(); g.arc(x - s * 0.48, y + s * 0.18, s * 0.09, 0, Math.PI * 2); g.arc(x + s * 0.48, y + s * 0.18, s * 0.09, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const x = rr(0, W), y = rr(0, H), r = rr(2, 6);
      if (Math.abs(x - W / 2) < H * 0.9) continue;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // front: big cloud with wordmark
    g.fillStyle = '#ffffff';
    cloudShape(g, W / 2, H * 0.52, H * 0.42); g.fill();
    g.strokeStyle = '#5d7fd6'; g.lineWidth = H * 0.014;
    cloudShape(g, W / 2 + 4, H * 0.52 + 3, H * 0.42); g.stroke();
    wordmark(g, W / 2, H * 0.53, H * 0.2, '#4c6fcf');
  },
  cherry(g, W, H) {
    g.fillStyle = '#fff3e4'; g.fillRect(0, 0, W, H);
    seed = 31337;
    g.fillStyle = 'rgba(230, 60, 80, 0.16)';
    for (let x = 0; x < W; x += H / 9) for (let y = (x / (H / 9)) % 2 ? H / 18 : 0; y < H; y += H / 9) { g.beginPath(); g.arc(x, y, H * 0.012, 0, Math.PI * 2); g.fill(); }
    const step = H * 0.5;
    for (let row = 0; row < 3; row++) {
      for (let x = (row % 2) * step * 0.5; x < W + step; x += step) {
        const cx = x + rr(-12, 12), cy = row * H * 0.38 + H * 0.12 + rr(-8, 8);
        if (Math.abs(cx - W / 2) < H * 0.85) continue;
        cherry(g, cx, cy, H * 0.17, rr(-0.5, 0.5));
      }
    }
    const lw = H * 1.4, lh = H * 0.62;
    g.fillStyle = '#e0233c'; roundRect(g, W / 2 - lw / 2, H / 2 - lh / 2, lw, lh, 22); g.fill();
    g.strokeStyle = '#fff3e4'; g.lineWidth = 4; roundRect(g, W / 2 - lw / 2 + 10, H / 2 - lh / 2 + 10, lw - 20, lh - 20, 14); g.stroke();
    wordmark(g, W / 2, H * 0.47, lh * 0.36, '#fff3e4');
    g.save(); g.font = `700 ${lh * 0.12}px ${ROUND}`; g.fillStyle = '#ffd6dc'; g.textAlign = 'center'; g.fillText('FRESH  ·  FRUITY  ·  CHEWY', W / 2, H * 0.7); g.restore();
  },
  kraft(g, W, H) {
    g.fillStyle = '#c4935d'; g.fillRect(0, 0, W, H);
    seed = 2468;
    for (let i = 0; i < 9000; i++) {
      const v = rnd() < 0.55 ? `rgba(110,70,30,${rr(0.04, 0.14)})` : `rgba(240,210,170,${rr(0.04, 0.14)})`;
      g.strokeStyle = v; g.lineWidth = rr(0.6, 1.6);
      const x = rr(0, W), y = rr(0, H), a = rr(-0.4, 0.4), l = rr(4, 22);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(60,35,15,${rr(0.15, 0.5)})`; g.fillRect(rr(0, W), rr(0, H), rr(0.8, 2.4), rr(0.8, 2.4)); }
    // repeating tiny text band
    g.save(); g.font = `700 ${H * 0.07}px ${ROUND}`; g.fillStyle = 'rgba(60,32,14,0.55)';
    const band = 'BROWN SUGAR  ·  FRESH MILK  ·  TAPIOCA  ·  ';
    for (let x = -100; x < W; x += g.measureText(band).width) { g.fillText(band, x, H * 0.12); g.fillText(band, x + 90, H * 0.95); }
    g.restore();
    // stamp
    const R = H * 0.36, cx = W / 2, cy = H * 0.53;
    g.save();
    g.translate(cx, cy); g.rotate(-0.12);
    g.strokeStyle = '#3d220f'; g.fillStyle = '#3d220f';
    g.lineWidth = H * 0.018; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = H * 0.008; g.beginPath(); g.arc(0, 0, R * 0.68, 0, Math.PI * 2); g.stroke();
    g.font = `800 ${H * 0.075}px ${ROUND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = 'BOBA BAR  ★  HAND SHAKEN  ★  ';
    const n = txt.length;
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate((i / n) * Math.PI * 2); g.translate(0, -R * 0.84); g.fillText(txt[i], 0, 0); g.restore();
    }
    cupIcon(g, 0, R * 0.02, R * 0.85, '#3d220f');
    g.restore();
    // ink grunge: knock out specks
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 700; i++) { const a = rr(0, Math.PI * 2), d = rr(0, R * 1.1); g.fillStyle = `rgba(0,0,0,${rr(0.3, 0.9)})`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr(1, 4), rr(1, 3)); }
    g.restore();
    // refill knocked-out holes with kraft so they are paper, not transparent
    g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#c4935d'; g.fillRect(0, 0, W, H); g.restore();
  },
  stripe(g, W, H) {
    const cols = ['#bfead6', '#ffffff', '#d9cdf6', '#ffffff', '#ffd6c2', '#ffffff', '#fff0b0', '#ffffff', '#ffd1df', '#ffffff'];
    const sw = W / 60;
    g.save();
    for (let i = -6; i < 66; i++) {
      g.fillStyle = cols[((i % cols.length) + cols.length) % cols.length];
      g.beginPath();
      g.moveTo(i * sw, 0); g.lineTo(i * sw + sw, 0); g.lineTo(i * sw + sw - H * 0.35, H); g.lineTo(i * sw - H * 0.35, H); g.closePath(); g.fill();
    }
    g.restore();
    const lw = H * 1.35, lh = H * 0.5;
    g.fillStyle = 'rgba(80,60,120,0.12)'; roundRect(g, W / 2 - lw / 2 + 4, H / 2 - lh / 2 + 6, lw, lh, lh / 2); g.fill();
    g.fillStyle = '#ffffff'; roundRect(g, W / 2 - lw / 2, H / 2 - lh / 2, lw, lh, lh / 2); g.fill();
    wordmark(g, W / 2, H / 2 - lh * 0.03, lh * 0.46, '#7a62c9');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H * 0.05); g.fillRect(0, H * 0.95, W, H * 0.05);
  },
};

export function drawSleeve(id, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  DESIGNS[id](g, W, H);
  grain(g, W, H, Math.floor(W * H / 300), 0.05);
  return c;
}

export function sleeveTexture(id, W, H, renderer) {
  const tex = new THREE.CanvasTexture(drawSleeve(id, W, H));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------- sealing film print
export function filmTexture(id, renderer, S = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const palettes = {
    gingham: ['#fffaf6', '#f2809f', '#e04a77'], clouds: ['#bfe1ff', '#ffffff', '#4c6fcf'], cherry: ['#fff3e4', '#e0233c', '#e0233c'],
    kraft: ['#f3e3cc', '#7a4a24', '#3d220f'], stripe: ['#fdf6ff', '#c9b8f2', '#7a62c9'],
  };
  const [bg, mid, ink] = palettes[id] || palettes.gingham;
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  seed = 5150;
  // all-over motif
  if (id === 'cherry') { for (let i = 0; i < 26; i++) cherry(g, rr(0, S), rr(0, S), S * 0.06, rr(-0.6, 0.6)); }
  else if (id === 'clouds') { g.fillStyle = '#ffffff'; for (let i = 0; i < 16; i++) { cloudShape(g, rr(0, S), rr(0, S), S * rr(0.04, 0.07)); g.fill(); } }
  else if (id === 'stripe') { const cols = ['#bfead6', '#d9cdf6', '#ffd6c2', '#fff0b0', '#ffd1df']; for (let i = 0; i < 24; i++) { g.fillStyle = cols[i % 5]; g.save(); g.translate(S / 2, S / 2); g.rotate(i / 24 * Math.PI * 2); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, S, 0, Math.PI / 24); g.closePath(); g.fill(); g.restore(); } }
  else if (id === 'kraft') { for (let i = 0; i < 40; i++) { g.fillStyle = mid; g.globalAlpha = 0.25; g.beginPath(); g.arc(rr(0, S), rr(0, S), S * rr(0.008, 0.02), 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
  else { const s = S / 14; g.fillStyle = 'rgba(242, 128, 160, 0.38)'; for (let x = 0; x < S; x += s * 2) g.fillRect(x, 0, s, S); for (let y = 0; y < S; y += s * 2) g.fillRect(0, y, S, s); }
  // centre medallion
  const R = S * 0.27;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ink; g.lineWidth = S * 0.008; g.setLineDash([S * 0.02, S * 0.014]);
  g.beginPath(); g.arc(S / 2, S / 2, R * 0.9, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  wordmark(g, S / 2, S / 2 - R * 0.12, R * 0.36, ink);
  pearlRow(g, S / 2, S / 2 + R * 0.32, 5, R * 0.05, '#4a2612');
  // ring text near the edge
  g.save(); g.translate(S / 2, S / 2);
  g.font = `800 ${S * 0.034}px ${ROUND}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const txt = 'SHAKE ME  ·  POKE ME  ·  SIP ME  ·  ';
  const reps = 2, n = txt.length * reps;
  for (let i = 0; i < n; i++) { g.save(); g.rotate((i / n) * Math.PI * 2); g.translate(0, -S * 0.43); g.fillText(txt[i % txt.length], 0, 0); g.restore(); }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  return tex;
}

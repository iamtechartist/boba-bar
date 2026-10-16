import { TEAS, MILKS, SYRUPS, TOPPINGS, ICE, SLEEVES, LIDS, STRAWS, PRESETS, byId, describe } from './recipes.js';
import { drawSleeve } from './textures.js';

// Minimal floating dock: tabs + round swatches, title, hint, mute/pause.

const S = 104; // swatch canvas size (2x for retina)
function canvas() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };

function glossy(g, base, x = S / 2, y = S / 2, r = S / 2) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, shade(base, 1.25));
  gr.addColorStop(0.55, base);
  gr.addColorStop(1, shade(base, 0.72));
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(x - r * 0.32, y - r * 0.42, r * 0.28, r * 0.15, -0.5, 0, Math.PI * 2); g.fill();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function pearl(g, x, y, r, col = '#2a1206') {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, shade(col, 2.2)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, 0.6));
  g.fillStyle = gr; circle(g, x, y, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)'; circle(g, x - r * 0.38, y - r * 0.38, r * 0.2); g.fill();
}
function slash(g) {
  g.fillStyle = '#f4f2ef'; circle(g, S / 2, S / 2, S / 2); g.fill();
  g.strokeStyle = 'rgba(29,29,31,0.28)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S * 0.3, S * 0.7); g.lineTo(S * 0.7, S * 0.3); g.stroke();
}
function cube(g, x, y, s, fill, stroke) {
  g.save(); g.translate(x, y);
  g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 2.5; g.lineJoin = 'round';
  const r = s * 0.22;
  g.beginPath(); g.moveTo(-s / 2 + r, -s / 2); g.arcTo(s / 2, -s / 2, s / 2, s / 2, r); g.arcTo(s / 2, s / 2, -s / 2, s / 2, r); g.arcTo(-s / 2, s / 2, -s / 2, -s / 2, r); g.arcTo(-s / 2, -s / 2, s / 2, -s / 2, r); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-s * 0.18, -s * 0.2, s * 0.16, s * 0.07, -0.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

const icon = {
  tea(t) {
    const [c, g] = canvas();
    if (!t) { slash(g); return c.toDataURL(); }
    glossy(g, t.tea);
    g.save(); circle(g, S / 2, S / 2, S / 2); g.clip();
    g.fillStyle = t.milk; g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(0, S * 0.62); g.bezierCurveTo(S * 0.3, S * 0.5, S * 0.6, S * 0.78, S, S * 0.6); g.lineTo(S, S); g.lineTo(0, S); g.fill();
    g.restore();
    return c.toDataURL();
  },
  milk(m) {
    const [c, g] = canvas();
    if (m.id === 'none') { slash(g); return c.toDataURL(); }
    glossy(g, m.color);
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2; circle(g, S / 2, S / 2, S / 2 - 1); g.stroke();
    return c.toDataURL();
  },
  syrup(s) {
    const [c, g] = canvas();
    if (s.id === 'none') { slash(g); return c.toDataURL(); }
    g.fillStyle = '#fbf6ee'; circle(g, S / 2, S / 2, S / 2); g.fill();
    g.save(); circle(g, S / 2, S / 2, S / 2); g.clip();
    for (let i = 0; i < 5; i++) {
      const x = S * (0.1 + i * 0.2), len = S * (0.45 + (i % 2) * 0.3);
      const gr = g.createLinearGradient(x - 8, 0, x + 8, 0);
      gr.addColorStop(0, s.thin); gr.addColorStop(0.5, s.thick); gr.addColorStop(1, s.thin);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 7, 0); g.lineTo(x + 7, 0); g.lineTo(x + 5, len); g.arc(x, len, 6, 0, Math.PI); g.closePath(); g.fill();
    }
    g.fillStyle = s.thick; g.fillRect(0, S * 0.84, S, S);
    g.restore();
    return c.toDataURL();
  },
  topping(t) {
    const [c, g] = canvas();
    g.fillStyle = '#fbf6ee'; circle(g, S / 2, S / 2, S / 2); g.fill();
    if (t.kind === 'pearl') {
      for (const [x, y] of [[0.35, 0.62], [0.62, 0.64], [0.48, 0.4], [0.25, 0.4], [0.72, 0.4]]) pearl(g, S * x, S * y, S * 0.13);
    } else if (t.kind === 'pop') {
      for (const [x, y, r] of [[0.38, 0.6, 0.17], [0.64, 0.56, 0.14], [0.5, 0.33, 0.12]]) {
        g.globalAlpha = 0.95; glossy(g, t.color, S * x, S * y, S * r); g.globalAlpha = 1;
      }
    } else if (t.kind === 'jelly') {
      cube(g, S * 0.4, S * 0.58, S * 0.3, 'rgba(250,244,226,0.95)', 'rgba(200,180,140,0.6)');
      cube(g, S * 0.64, S * 0.42, S * 0.24, 'rgba(250,244,226,0.95)', 'rgba(200,180,140,0.6)');
    } else {
      // cheese foam swirl
      g.fillStyle = '#fff6e4';
      for (const [y, w] of [[0.66, 0.36], [0.5, 0.27], [0.36, 0.17]]) { g.beginPath(); g.ellipse(S / 2, S * y, S * w, S * 0.1, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(190,150,90,0.55)'; g.lineWidth = 2.5;
      for (const [y, w] of [[0.66, 0.36], [0.5, 0.27], [0.36, 0.17]]) { g.beginPath(); g.ellipse(S / 2, S * y, S * w, S * 0.1, 0, 0.15, Math.PI - 0.15); g.stroke(); }
      g.fillStyle = '#e8b25b'; circle(g, S * 0.5, S * 0.24, S * 0.035); g.fill();
    }
    return c.toDataURL();
  },
  ice(i) {
    const [c, g] = canvas();
    if (!i.count) { slash(g); return c.toDataURL(); }
    g.fillStyle = '#eef6fb'; circle(g, S / 2, S / 2, S / 2); g.fill();
    const n = i.id;
    const pos = n === 1 ? [[0.5, 0.52]] : n === 2 ? [[0.38, 0.58], [0.62, 0.44]] : [[0.32, 0.6], [0.62, 0.62], [0.48, 0.36]];
    for (const [x, y] of pos) cube(g, S * x, S * y, S * (n === 1 ? 0.4 : 0.3), 'rgba(255,255,255,0.9)', 'rgba(120,170,210,0.7)');
    return c.toDataURL();
  },
  sleeve(id) {
    const [c, g] = canvas();
    const art = drawSleeve(id, 640, 120);
    g.save(); circle(g, S / 2, S / 2, S / 2); g.clip();
    g.drawImage(art, 320 - 60, 0, 120, 120, 0, 0, S, S);
    g.restore();
    return c.toDataURL();
  },
  lid(id) {
    const [c, g] = canvas();
    g.fillStyle = '#f3f1ee'; circle(g, S / 2, S / 2, S / 2); g.fill();
    g.strokeStyle = 'rgba(29,29,31,0.55)'; g.lineWidth = 3.5; g.lineJoin = 'round'; g.lineCap = 'round';
    if (id === 'dome') {
      g.beginPath(); g.moveTo(S * 0.2, S * 0.64); g.lineTo(S * 0.8, S * 0.64); g.stroke();
      g.beginPath(); g.moveTo(S * 0.26, S * 0.64); g.bezierCurveTo(S * 0.28, S * 0.3, S * 0.72, S * 0.3, S * 0.74, S * 0.64); g.stroke();
      g.beginPath(); g.moveTo(S * 0.45, S * 0.36); g.lineTo(S * 0.55, S * 0.36); g.stroke();
    } else {
      g.fillStyle = '#ffd2dc'; g.beginPath(); g.ellipse(S / 2, S * 0.5, S * 0.32, S * 0.12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(S * 0.18, S * 0.5); g.lineTo(S * 0.18, S * 0.58); g.moveTo(S * 0.82, S * 0.5); g.lineTo(S * 0.82, S * 0.58); g.stroke();
      g.beginPath(); g.ellipse(S / 2, S * 0.58, S * 0.32, S * 0.12, 0, 0, Math.PI); g.stroke();
    }
    return c.toDataURL();
  },
  straw(st) {
    const [c, g] = canvas();
    g.fillStyle = '#f3f1ee'; circle(g, S / 2, S / 2, S / 2); g.fill();
    g.save(); g.translate(S / 2, S / 2); g.rotate(0.5);
    const w = S * 0.2;
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    if (st.id === 'clear') { gr.addColorStop(0, 'rgba(160,190,210,0.6)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(150,180,200,0.6)'); }
    else { gr.addColorStop(0, shade(st.color, 0.7)); gr.addColorStop(0.35, shade(st.color, 1.25)); gr.addColorStop(1, shade(st.color, 0.8)); }
    g.fillStyle = gr; g.fillRect(-w / 2, -S * 0.6, w, S * 1.2);
    g.restore();
    return c.toDataURL();
  },
  preset(p) {
    const [c, g] = canvas();
    g.fillStyle = p.backdrop; circle(g, S / 2, S / 2, S / 2); g.fill();
    // mini cup
    const tea = byId(TEAS, p.tea), milk = byId(MILKS, p.milk), syrup = byId(SYRUPS, p.syrup);
    const top = tea ? (p.milk !== 'none' ? (tea.style === 'under' ? tea.tea : tea.milk) : tea.tea) : milk.color;
    const bottom = tea && tea.style === 'under' ? milk.color : top;
    g.save();
    g.beginPath(); g.moveTo(S * 0.3, S * 0.24); g.lineTo(S * 0.7, S * 0.24); g.lineTo(S * 0.64, S * 0.84); g.lineTo(S * 0.36, S * 0.84); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, S * 0.3, 0, S * 0.84);
    gr.addColorStop(0, p.toppings.includes('foam') ? '#fff7e8' : top); gr.addColorStop(0.18, top); gr.addColorStop(0.62, bottom); gr.addColorStop(1, syrup && syrup.id !== 'none' ? syrup.layer : bottom);
    g.fillStyle = gr; g.fillRect(0, S * 0.3, S, S);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, S * 0.24, S, S * 0.06);
    if (syrup && syrup.id !== 'none') { g.strokeStyle = syrup.thick; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(S * (0.36 + i * 0.09), S * 0.36); g.quadraticCurveTo(S * (0.4 + i * 0.09), S * 0.6, S * (0.35 + i * 0.09), S * 0.84); g.stroke(); } }
    const tp = p.toppings.map((t) => byId(TOPPINGS, t)).filter((t) => t.kind !== 'foam');
    for (let i = 0; i < 9; i++) {
      const t = tp[i % Math.max(1, tp.length)];
      if (!t) break;
      const x = S * (0.39 + (i % 5) * 0.055), y = S * (0.8 - Math.floor(i / 5) * 0.06);
      if (t.kind === 'pearl') pearl(g, x, y, S * 0.03);
      else if (t.kind === 'pop') { g.fillStyle = t.color; circle(g, x, y, S * 0.027); g.fill(); }
      else { g.fillStyle = 'rgba(255,250,235,0.9)'; g.fillRect(x - 3, y - 3, 6, 6); }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(S * 0.3, S * 0.24); g.lineTo(S * 0.36, S * 0.84); g.lineTo(S * 0.64, S * 0.84); g.lineTo(S * 0.7, S * 0.24); g.stroke();
    g.strokeStyle = byId(STRAWS, p.straw).id === 'clear' ? 'rgba(255,255,255,0.95)' : byId(STRAWS, p.straw).color; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(S * 0.53, S * 0.28); g.lineTo(S * 0.6, S * 0.1); g.stroke();
    return c.toDataURL();
  },
  shuffle() {
    const [c, g] = canvas();
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#ffd1df'); gr.addColorStop(0.5, '#d9cdf6'); gr.addColorStop(1, '#bfead6');
    g.fillStyle = gr; circle(g, S / 2, S / 2, S / 2); g.fill();
    g.strokeStyle = '#1d1d1f'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(S * 0.28, S * 0.38); g.bezierCurveTo(S * 0.48, S * 0.38, S * 0.52, S * 0.62, S * 0.72, S * 0.62); g.stroke();
    g.beginPath(); g.moveTo(S * 0.28, S * 0.62); g.bezierCurveTo(S * 0.48, S * 0.62, S * 0.52, S * 0.38, S * 0.72, S * 0.38); g.stroke();
    for (const y of [0.38, 0.62]) { g.beginPath(); g.moveTo(S * 0.66, S * (y - 0.07)); g.lineTo(S * 0.73, S * y); g.lineTo(S * 0.66, S * (y + 0.07)); g.stroke(); }
    return c.toDataURL();
  },
};

const SVG = {
  sound: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.4"/><rect x="13.5" y="5" width="4" height="14" rx="1.4"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  straw: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h12l-1.6 11.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8z"/><path d="M5 9h14"/><path d="M13 9l2.5-6.5L19 2"/></svg>',
  cup: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8h13l-1.7 12.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8z"/><path d="M12.5 8l2-6"/><circle cx="10" cy="17" r="1.1" fill="currentColor"/><circle cx="13.5" cy="17.5" r="1.1" fill="currentColor"/><circle cx="12" cy="15" r="1.1" fill="currentColor"/></svg>',
};

export function createUI(root, director, { audio, onPause, onHide }) {
  const DEFAULT_HINT = 'Drag to turn · Tap the cup to shake';
  root.innerHTML = `
    <header class="top">
      <div class="brand">${SVG.cup}<span>boba bar</span></div>
      <div class="title"><h1 id="dname">Boba Bar</h1><p id="dtag"></p></div>
      <div class="tools">
        <button class="ib" id="mute" aria-label="Mute sound" title="Sound (M)">${SVG.sound}</button>
        <button class="ib" id="pause" aria-label="Pause" title="Pause (Space)">${SVG.pause}</button>
      </div>
    </header>
    <footer class="dock">
      <p class="hint" id="hint">${DEFAULT_HINT}</p>
      <nav class="tabs" role="tablist" id="tabs"></nav>
      <div class="bar">
        <div class="swatches" id="sw" role="listbox"></div>
        <span class="sep"></span>
        <button class="final" id="final" title="Seal the lid and pop the straw in">${SVG.straw}<span>Pop the straw</span></button>
      </div>
    </footer>`;
  const $ = (id) => root.querySelector('#' + id);
  const tabs = $('tabs'), sw = $('sw'), hint = $('hint');
  // swatches are rebuilt on every change, so reset the hover label when the pointer leaves the row
  sw.addEventListener('mouseleave', () => { hint.textContent = DEFAULT_HINT; hint.classList.remove('named'); });

  const TABS = [
    ['signature', 'Signature'], ['tea', 'Tea'], ['milk', 'Milk'], ['syrup', 'Syrup'], ['toppings', 'Toppings'], ['ice', 'Ice'], ['cup', 'Cup'],
  ];
  let tab = 'signature';
  try { tab = localStorage.getItem('bb.tab') || 'signature'; } catch { /* private mode */ }

  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.tab = id; b.textContent = label; b.setAttribute('role', 'tab');
    b.onclick = () => { tab = id; try { localStorage.setItem('bb.tab', id); } catch { /* ignore */ } audio.tick(); render(); };
    tabs.appendChild(b);
  }

  const cache = new Map();
  const img = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

  function swatch({ key, src, label, selected, onClick, group }) {
    const b = document.createElement('button');
    b.className = 'sw' + (selected ? ' on' : '');
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    if (group) b.dataset.group = group;
    b.style.backgroundImage = `url(${src})`;
    b.onmouseenter = () => { hint.textContent = label; hint.classList.add('named'); };
    b.onmouseleave = () => { hint.textContent = DEFAULT_HINT; hint.classList.remove('named'); };
    b.onclick = () => { audio.unlock(); audio.tick(); onClick(); };
    return b;
  }
  const divider = (text) => { const d = document.createElement('span'); d.className = 'grp'; d.textContent = text; return d; };

  function render() {
    const r = director.recipe, u = director.ui;
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    sw.innerHTML = '';
    const add = (o) => sw.appendChild(swatch(o));
    if (tab === 'signature') {
      for (const p of PRESETS) add({ key: 'p' + p.id, src: img('p' + p.id, () => icon.preset(p)), label: p.name, selected: u.presetId === p.id, onClick: () => director.playPreset(p.id) });
      add({ key: 'shuffle', src: img('shuffle', icon.shuffle), label: 'Surprise me', selected: false, onClick: () => director.surprise() });
    } else if (tab === 'tea') {
      add({ src: img('t-none', () => icon.tea(null)), label: 'No tea (milk only)', selected: !r.tea, onClick: () => director.setTea(null) });
      for (const t of TEAS) add({ src: img('t' + t.id, () => icon.tea(t)), label: t.name, selected: r.tea === t.id, onClick: () => director.setTea(t.id) });
    } else if (tab === 'milk') {
      for (const m of MILKS) add({ src: img('m' + m.id, () => icon.milk(m)), label: m.name, selected: r.milk === m.id, onClick: () => director.setMilk(m.id) });
    } else if (tab === 'syrup') {
      for (const s of SYRUPS) add({ src: img('s' + s.id, () => icon.syrup(s)), label: s.id === 'none' ? s.name : s.name + ' syrup', selected: r.syrup === s.id, onClick: () => director.setSyrup(s.id) });
    } else if (tab === 'toppings') {
      for (const t of TOPPINGS) add({ src: img('tp' + t.id, () => icon.topping(t)), label: t.name, selected: r.toppings.includes(t.id), onClick: () => director.toggleTopping(t.id) });
    } else if (tab === 'ice') {
      for (const i of ICE) add({ src: img('i' + i.id, () => icon.ice(i)), label: i.name, selected: r.ice === i.id, onClick: () => director.setIce(i.id) });
    } else if (tab === 'cup') {
      sw.appendChild(divider('Sleeve'));
      for (const s of SLEEVES) add({ src: img('sl' + s.id, () => icon.sleeve(s.id)), label: s.name, selected: r.sleeve === s.id, onClick: () => director.setSleeve(s.id) });
      sw.appendChild(divider('Lid'));
      for (const l of LIDS) add({ src: img('l' + l.id, () => icon.lid(l.id)), label: l.name, selected: r.lid === l.id, onClick: () => director.setLid(l.id) });
      sw.appendChild(divider('Straw'));
      for (const s of STRAWS) add({ src: img('st' + s.id, () => icon.straw(s)), label: s.name, selected: r.straw === s.id, onClick: () => director.setStraw(s.id) });
    }
    $('dname').textContent = u.name;
    $('dtag').textContent = u.presetId ? u.tagline : describe(r);
    const fin = $('final');
    fin.classList.toggle('invite', !u.sealed && !u.busy);
    fin.querySelector('span').textContent = u.sealed ? 'Pop it again' : 'Pop the straw';
  }
  director.onChange(render);

  $('final').onclick = () => { audio.unlock(); director.finalTouch(); };
  const muteBtn = $('mute'), pauseBtn = $('pause');
  const setMute = (m) => { audio.setMuted(m); muteBtn.innerHTML = m ? SVG.muted : SVG.sound; muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound'); try { localStorage.setItem('bb.muted', m ? '1' : '0'); } catch { /* ignore */ } };
  try { if (localStorage.getItem('bb.muted') === '1') setMute(true); } catch { /* ignore */ }
  muteBtn.onclick = () => { audio.unlock(); setMute(!audio.muted); };
  let paused = false;
  const setPause = (p) => { paused = p; pauseBtn.innerHTML = p ? SVG.play : SVG.pause; pauseBtn.setAttribute('aria-label', p ? 'Resume' : 'Pause'); onPause(p); };
  pauseBtn.onclick = () => setPause(!paused);

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'h' || e.key === 'H') { const hidden = document.body.classList.toggle('clean'); onHide(hidden); }
    else if (e.key === 'm' || e.key === 'M') { audio.unlock(); setMute(!audio.muted); }
    else if (e.key === ' ') { e.preventDefault(); setPause(!paused); }
  });

  return {
    setHint(t) { hint.textContent = t || DEFAULT_HINT; },
    render,
  };
}

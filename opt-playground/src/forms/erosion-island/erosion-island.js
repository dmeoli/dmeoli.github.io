// Island carved by erosion: the map of the island (heights, hill shading and
// the rivers given by the drainage area), the tile in 3D and the print panel.

import { t, onLang, onTheme } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { DEFAULTS } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  seed: { def: DEFAULTS.seed, min: 1, max: 99999, int: true },
  steps: { def: DEFAULTS.steps, min: 10, max: 400, int: true },
  K: { def: DEFAULTS.K, min: 0.2, max: 6 },
  m: { def: DEFAULTS.m, min: 0.3, max: 0.7 },
  rough: { def: DEFAULTS.rough, min: 0, max: 1 },
  rivers: { def: 2, min: 0.5, max: 6 },
};

const hex = s => { const v = s.replace('#', ''); const f = v.length === 3 ? v.split('').map(c => c + c).join('') : v; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); };
let last = null;

// the map: sea in the colour of the ground, land from lilac to the accent by
// height, shaded by a light from the north-west; rivers where the drainage
// area exceeds a share of the island, wider downstream
function draw(m) {
  if (!m || !m.H) return;
  last = m;
  const { H, A, R, n } = m, cv = $('map'), W = cv.clientWidth || 400, dpr = Math.min(2, devicePixelRatio);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = W * dpr; }
  const c = cv.getContext('2d'), img = c.createImageData(n, n);
  const sea = hex(css('--panel') || '#f4f0fa'), lo = hex(css('--lilac') || '#c8b3e0'), hi = hex(css('--accent') || '#7338a8');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light');
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, o = 4 * ((n - 1 - j) * n + i), h = H[k];
    let col;
    if (h <= 0) col = sea;
    else {
      const gx = (H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)]) * n, gy = (H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i]) * n;
      const sh = Math.max(0.35, Math.min(1.25, 0.9 + 0.03 * (-gx + gy)));
      const u = Math.pow(h, 0.7);
      col = lo.map((v, q) => Math.max(0, Math.min(255, (v + (hi[q] - v) * u) * sh)));
    }
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  const off = new OffscreenCanvas(n, n); off.getContext('2d').putImageData(img, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true;
  c.drawImage(off, 0, 0, cv.width, cv.height);
  // the rivers
  let land = 0;
  for (let k = 0; k < n * n; k++) if (H[k] > 0) land++;
  const thr = s.state.rivers / 1000 * land / (n * n), s0 = cv.width / n;
  c.strokeStyle = dark ? '#8fc3ff' : '#2f6fb0'; c.lineCap = 'round';
  let count = 0;
  for (let k = 0; k < n * n; k++) {
    if (A[k] < thr || H[k] <= 0) continue;
    const r = R[k], x0 = (k % n + 0.5) * s0, y0 = (n - 1 - Math.floor(k / n) + 0.5) * s0, x1 = (r % n + 0.5) * s0, y1 = (n - 1 - Math.floor(r / n) + 0.5) * s0;
    c.lineWidth = Math.min(4, 0.6 + 1.6 * Math.sqrt(A[k] / thr) / 3) * dpr;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    count++;
  }
  $('stats').innerHTML = `<span>${t('land', 'terra')} <b>${(100 * land / (n * n)).toFixed(0)}%</b></span>` +
    `<span>${t('river cells', 'celle di fiume')} <b>${count}</b></span>` +
    `<span>${t('steps', 'passi')} <b>${s.state.steps}</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.6, -1.5, 0.8],
  onMesh: draw,
  panel: {
    size: { value: 100, min: 40, max: 250, label: { en: 'side of the tile, mm', it: 'lato della piastrella, mm' } },
    fields: [
      { key: 'mode', type: 'select', label: { en: 'kind', it: 'tipo' }, value: 'relief',
        options: [{ value: 'relief', en: 'relief on a base', it: 'rilievo su una base' }, { value: 'lithophane', en: 'lithophane', it: 'litofania' }] },
      { key: 'height', label: { en: 'highest peak, mm', it: 'picco più alto, mm' }, value: 24, min: 2, max: 60, step: 0.5 },
      { key: 'base', label: { en: 'base, mm', it: 'base, mm' }, value: 3, min: 1, max: 10, step: 0.5 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft (192 cells)', it: 'bozza (192 celle)' }, { value: 'fine', en: 'fine (256 cells)', it: 'alta (256 celle)' }] },
    ],
    name: o => `erosion_island_seed${o.seed}_t${o.steps}_${o.mode}_${o.size}mm`,
    head: 'binary STL, millimetres, island carved by erosion',
    object: 'erosion island',
  },
  panelKeys: ['mode', 'height', 'base'],
});
$('rivers').addEventListener('input', () => { s.state.rivers = +$('rivers').value; draw(last); });
onLang(() => draw(last)); onTheme(() => draw(last));

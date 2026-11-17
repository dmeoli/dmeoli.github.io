// Damascus swords: the parent and its eight children drawn with their etched
// steel, a click on a child makes it the parent of the next generation; the
// parent in 3D, its genes, the etched blade at full size, and the print panel.

import { t, onLang, onTheme, bi } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { writeState } from '../../print/index.js';
import { GENES, DEFAULT_CODE, decode, encode, children, sword, parts, at, damascus, bladeC, bladeW } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  g: { def: DEFAULT_CODE },
  gen: { def: 1, min: 1, max: 99999, int: true },
  rate: { def: 0.25, min: 0.05, max: 0.6 },
  roll: { def: 0, min: 0, max: 99999, int: true },
};
let ready = false;
const hex = c => { const v = (c || '#888').replace('#', ''); const f = v.length === 3 ? v.split('').map(x => x + x).join('') : v; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); };

// a sword drawn into a canvas: the steel of the blade in two tones by the
// sign of the layer, the guard and the pommel in gold, the grip in the accent,
// shaded by the height so that bevels and wraps show
function drawSword(cv, g, W, Hh) {
  const dpr = Math.min(2, devicePixelRatio), w = Math.round(W * dpr), h = Math.round(Hh * dpr);
  if (cv.width !== w) { cv.width = w; cv.height = h; }
  const s = sword(g, 180), P = parts(s), c = cv.getContext('2d'), img = c.createImageData(w, h);
  const sc = Math.min(w / 186, h / (s.width + 6)), ox = (w - 180 * sc) / 2, oy = h / 2;
  const light = hex(css('--steel-light') || '#e4e0ea'), dark = hex('#5f5a6b'), gold = hex(css('--gold')), grip = hex(css('--accent'));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i - ox) / sc, y = (oy - j) / sc, [k, top] = at(P, x, y), o = 4 * (j * w + i);
    if (k < 0) continue;
    let col;
    if (k === 0) {
      const tt = (x - s.xg) / s.Lb, tc = Math.min(1, Math.max(0, tt));
      const v = damascus(s, tc, (y - bladeC(s, tc)) / Math.max(1.5, bladeW(s, tc)));
      const u = 0.5 + 0.5 * Math.tanh(3 * v);
      col = dark.map((a, q) => a + (light[q] - a) * u);
    } else col = k === 2 ? grip : gold;
    const sh = 0.7 + 0.06 * top;
    img.data[o] = col[0] * sh; img.data[o + 1] = col[1] * sh; img.data[o + 2] = col[2] * sh; img.data[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

let lineage = [];
const grid = () => {
  const g = decode(s.state.g) || decode(DEFAULT_CODE), kids = children(g, s.state.gen, s.state.rate, s.state.roll);
  const cells = [...kids.slice(0, 4), g, ...kids.slice(4)];
  const host = $('brood');
  if (!host.children.length) {
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'kid' + (i === 4 ? ' parent' : '');
      b.appendChild(document.createElement('canvas'));
      b.addEventListener('click', () => pick(i));
      host.appendChild(b);
    }
  }
  [...host.children].forEach((b, i) => {
    const cv = b.firstChild, W = Math.max(90, b.clientWidth - 8);
    drawSword(cv, cells[i], W, Math.round(W * 0.28));
    b.title = encode(cells[i]);
    b.setAttribute('aria-label', i === 4 ? t('the parent', 'il genitore') : t('child ', 'figlio ') + (i < 4 ? i + 1 : i));
  });
  return cells;
};

function pick(i) {
  if (i === 4) return;
  const cells = grid();
  lineage.push(s.state.g);
  s.state.g = encode(cells[i]); s.state.gen++; s.state.roll = 0;
  s.sync(); s.rebuild(); grid(); genes();
}

function genes() {
  const g = decode(s.state.g) || decode(DEFAULT_CODE), sw = sword(g, 180);
  $('genes').innerHTML = GENES.map((G, i) => `<span>${bi(G.en, G.it)} <b>${g[i].toString(16)}</b></span>`).join('');
  $('stats').innerHTML = `<span>${t('generation', 'generazione')} <b>${s.state.gen}</b></span>` +
    `<span>${t('pattern', 'motivo')} <b>${sw.ptype}</b></span><span>${t('pommel', 'pomolo')} <b>${sw.pommel}</b></span>` +
    `<span>${t('guard ends', 'estremi della guardia')} <b>${sw.gend}</b></span>`;
  drawSword($('etched'), g, $('etched').clientWidth || 330, Math.round((($('etched').clientWidth || 330)) * 0.3));
  $('back').disabled = !lineage.length;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.35, -1.0, 1.4],
  onChange: () => { if (ready) { grid(); genes(); } },
  panel: {
    size: { value: 180, min: 100, max: 320, label: { en: 'overall length, mm', it: 'lunghezza totale, mm' } },
    fields: [
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `damascus_sword_${o.g}_${o.size}mm`,
    head: 'binary STL, millimetres, damascus sword model',
    object: 'damascus sword',
  },
  panelKeys: ['size'],
});
$('back').addEventListener('click', () => {
  if (!lineage.length) return;
  s.state.g = lineage.pop(); s.state.gen = Math.max(1, s.state.gen - 1);
  s.sync(); s.rebuild(); grid(); genes();
});
$('reroll').addEventListener('click', () => { s.state.roll++; writeState(SPEC, s.state); grid(); });
ready = true;
grid(); genes();
new ResizeObserver(() => { grid(); genes(); }).observe($('brood'));
onLang(() => { grid(); genes(); }); onTheme(() => { grid(); genes(); });

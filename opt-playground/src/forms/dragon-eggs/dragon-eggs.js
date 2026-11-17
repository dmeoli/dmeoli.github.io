// Dragon eggs: the four measures of the egg, its outline drawn with the
// measures marked, the scaled egg in 3D and the print panel.

import { t, onLang } from '../../i18n.js';
import { setTex } from '../../tex.js';
import { fantasyScene } from '../fantasy/scene.js';
import { eggRadius, SHAPES, profile, cutHeight } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = {
  B: { def: 0.64, min: 0.5, max: 0.95 },
  w: { def: 0.07, min: 0, max: 0.16 },
  D: { def: 0.5, min: 0.3, max: 0.85 },
  pattern: { def: 'phyllotaxis', values: ['phyllotaxis', 'voronoi', 'smooth'] },
  scales: { def: 240, min: 40, max: 600, int: true },
  seed: { def: 1, min: 1, max: 99999, int: true },
  cut: { def: '45', values: ['45', 'small'] },
};

// the outline in SVG, the pointed end up, with L, B, w and D marked
function outline(st) {
  const L = 1, n = 200, sc = 200, cx = 150, top = 20;
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = -L / 2 + L * i / n; pts.push([x, eggRadius(x, L, st.B, st.w, st.D)]); }
  const X = r => cx + r * sc, Y = x => top + (L / 2 - x) * sc;
  const d = 'M' + pts.map(([x, r]) => `${X(r).toFixed(1)} ${Y(x).toFixed(1)}`).join('L') + 'L' + pts.reverse().map(([x, r]) => `${X(-r).toFixed(1)} ${Y(x).toFixed(1)}`).join('L') + 'Z';
  const P = profile(st, 1, 1000), zc = cutHeight(P, st.cut !== 'small');
  const xb = -st.w, rb = st.B / 2, rd = st.D / 2;
  const svg = $('outline');
  svg.innerHTML = `<path d="${d}" fill="var(--lilac)" stroke="var(--accent)" stroke-width="1.5"/>` +
    `<line x1="${X(-rb)}" x2="${X(rb)}" y1="${Y(xb)}" y2="${Y(xb)}" stroke="var(--accent)" stroke-dasharray="4 3"/>` +
    `<text x="${X(rb) + 6}" y="${Y(xb) + 4}" class="lab">B</text>` +
    `<line x1="${X(-rd)}" x2="${X(rd)}" y1="${Y(0.25)}" y2="${Y(0.25)}" stroke="var(--gold)" stroke-dasharray="4 3"/>` +
    `<text x="${X(rd) + 6}" y="${Y(0.25) + 4}" class="lab">D<tspan dy="3" font-size="9">L/4</tspan></text>` +
    `<line x1="${cx}" x2="${cx}" y1="${Y(0.5)}" y2="${Y(-0.5)}" stroke="var(--ink-soft)" stroke-width="0.8"/>` +
    `<text x="${cx + 4}" y="${Y(0.5) + 14}" class="lab">L</text>` +
    `<line x1="${X(-rb) - 10}" x2="${X(rb) + 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-soft)" stroke-width="0.6" stroke-dasharray="1 3"/>` +
    `<text x="${X(-rb) - 12}" y="${(Y(0) + Y(xb)) / 2 + 4}" class="lab" text-anchor="end">w</text>` +
    `<line x1="${X(-rb) - 20}" x2="${X(rb) + 20}" y1="${Y(zc - 0.5)}" y2="${Y(zc - 0.5)}" stroke="var(--ink)" stroke-width="1.2"/>` +
    `<text x="${X(rb) + 22}" y="${Y(zc - 0.5) + 4}" class="lab">${t('cut', 'taglio')}</text>`;
  $('stats').innerHTML = `<span>B/L <b>${st.B.toFixed(2)}</b></span><span>w/L <b>${st.w.toFixed(3)}</b></span>` +
    `<span>D<sub>L/4</sub>/L <b>${st.D.toFixed(2)}</b></span><span>${t('cut at', 'taglio a')} <b>${(100 * zc).toFixed(1)}%</b> ${t('of L', 'di L')}</span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [1, -1.6, 0.55],
  onChange: outline,
  panel: {
    size: { value: 80, min: 30, max: 220, label: { en: 'egg length L, mm', it: 'lunghezza L dell\'uovo, mm' } },
    fields: [
      { key: 'relief', label: { en: 'relief of the scales, mm', it: 'rilievo delle squame, mm' }, value: 0.8, min: 0, max: 2.5, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `dragon_egg_${o.pattern}_B${o.B}_w${o.w}_D${o.D}_${o.size}mm`,
    head: 'binary STL, millimetres, dragon egg',
    object: 'dragon egg',
  },
  panelKeys: ['relief'],
});
$('shape').addEventListener('change', e => {
  const p = SHAPES[e.target.value];
  if (!p) return;
  Object.assign(s.state, p); s.sync(); s.rebuild();
});
onLang(() => outline(s.state));
setTex($('formula'), String.raw`\(y = \pm\frac{B}{2}\sqrt{\frac{L^2-4x^2}{L^2+8wx+4w^2}}\left(1-c\left(1-\sqrt{\frac{L(L^2+8wx+4w^2)}{2(L-2w)x^2+(L^2+8Lw-4w^2)x+2Lw^2+L^2w+L^3}}\right)\right),\) \(\;c = \frac{\sqrt{5.5L^2+11Lw+4w^2}\,\bigl(\sqrt3BL-2D_{L/4}\sqrt{L^2+2wL+4w^2}\bigr)}{\sqrt3BL\bigl(\sqrt{5.5L^2+11Lw+4w^2}-2\sqrt{L^2+2wL+4w^2}\bigr)}\)`);

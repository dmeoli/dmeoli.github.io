// Elven amulets: the plane graph and the knot drawn over it in SVG, with the
// strands broken where they pass under, the amulet in 3D and the print panel.

import { t, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';

const $ = id => document.getElementById(id);
const SPEC = {
  graph: { def: 'wheel', values: ['wheel', 'web', 'grid', 'tri'] },
  n: { def: 2, min: 1, max: 4, int: true },
  k: { def: 7, min: 3, max: 12, int: true },
  shape: { def: 'amulet', values: ['amulet', 'shield'] },
  band: { def: 0.32, min: 0.18, max: 0.45 },
};

let last = null;
function draw(m) {
  if (m) last = m;
  m = last;
  if (!m) return;
  // every short segment of every strand, painted from the lowest up: each
  // drawn as a wide line in the color of the ground, then a narrower one in
  // the color of the strand, so that a strand passing over cuts the one below
  const segs = [];
  for (const P of m.curves) for (let i = 0; i + 1 < P.length; i++) segs.push([P[i], P[i + 1], (P[i][2] + P[i + 1][2]) / 2]);
  segs.sort((a, b) => a[2] - b[2]);
  let ext = 0;
  for (const P of m.curves) for (const [x, y] of P) ext = Math.max(ext, Math.abs(x), Math.abs(y));
  const R = ext * 1.08, sw = 0.045 * 2 * R * 0.5;
  let s = '';
  for (const [a, b] of m.E) s += `<line x1="${m.V[a][0]}" y1="${-m.V[a][1]}" x2="${m.V[b][0]}" y2="${-m.V[b][1]}" class="edge"/>`;
  for (const [p, q] of segs) {
    const d = `M${p[0].toFixed(4)} ${(-p[1]).toFixed(4)}L${q[0].toFixed(4)} ${(-q[1]).toFixed(4)}`;
    s += `<path d="${d}" class="under" stroke-width="${(sw * 1.9).toFixed(4)}"/><path d="${d}" class="strand" stroke-width="${sw.toFixed(4)}"/>`;
  }
  const svg = $('knot');
  svg.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`);
  svg.innerHTML = s;
  $('stats').innerHTML = `<span>${t('vertices', 'vertici')} <b>${m.V.length}</b></span><span>${t('edges = crossings', 'lati = incroci')} <b>${m.E.length}</b></span>` +
    `<span>${t('strands', 'fili')} <b>${m.strands}</b></span>`;
}

fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  preview: 'preview',
  eye: [0.25, -1.1, 1.6],
  onMesh: draw,
  panel: {
    size: { value: 50, min: 25, max: 160, what: { en: 'width', it: 'larghezza' }, label: { en: 'width, mm', it: 'larghezza, mm' } },
    fields: [
      { key: 'base', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2, min: 1, max: 5, step: 0.2 },
      { key: 'lift', label: { en: 'relief step, mm', it: 'gradino del rilievo, mm' }, value: 1.2, min: 0.4, max: 3, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `elven_knot_${o.shape}_${o.graph}_${o.n}_${o.k}_${o.size}mm`,
    head: 'binary STL, millimetres, Celtic knot amulet',
    object: 'celtic knot amulet',
  },
  panelKeys: ['base', 'lift'],
});
onLang(() => draw());

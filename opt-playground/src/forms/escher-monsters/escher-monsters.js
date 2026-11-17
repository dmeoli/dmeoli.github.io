// Escher monster tiles: the goal and the tile found by annealing, the tiling
// they make drawn in SVG, the printed patch in 3D and the print panel.

import { t, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';

const $ = id => document.getElementById(id);
const SPEC = {
  seed: { def: 1, min: 1, max: 99999, int: true },
  type: { def: 'auto', values: ['auto', 'TTTT', 'TTTTTT', 'CCCC', 'TCCTCC'] },
  count: { def: 6, min: 2, max: 16, int: true },
};

let last = null;
const path = P => 'M' + P.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join('L') + 'Z';
function draw(m) {
  if (m) last = m;
  m = last;
  if (!m) return;
  const R = 3.2 * Math.max(...m.goal.map(p => Math.hypot(p[0], p[1])));
  const svg = $('tiling');
  svg.setAttribute('viewBox', `${-R} ${-R * 0.75} ${2 * R} ${1.5 * R}`);
  let s = '';
  m.tiles.forEach(([f, P], i) => { s += `<path d="${path(P)}" class="t${f ? 1 : (i % 3 === 0 ? 2 : 0)}"/>`; });
  s += `<path d="${path(m.goal)}" class="goal"/>`;
  s += `<path d="${path(m.outline)}" class="tile"/>`;
  for (const [x, y] of m.corners) s += `<circle cx="${x}" cy="${-y}" r="${R * 0.012}" class="corner"/>`;
  svg.innerHTML = s;
  $('stats').innerHTML = `<span>${t('type', 'tipo')} <b>${m.type}</b></span>` +
    `<span>${t('deformation', 'deformazione')} <b>${(100 * m.cost).toFixed(2)}</b></span>` +
    `<span>${t('tiles printed', 'tessere stampate')} <b>${state().count}</b></span>`;
}

const sc = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  preview: 'preview',
  eye: [0.2, -1.2, 1.6],
  onMesh: draw,
  panel: {
    size: { value: 40, min: 15, max: 120, what: { en: 'largest side of one tile', it: 'lato maggiore di una tessera' }, label: { en: 'tile size, mm', it: 'dimensione della tessera, mm' } },
    fields: [
      { key: 'thick', label: { en: 'thickness, mm', it: 'spessore, mm' }, value: 3, min: 1.2, max: 10, step: 0.2 },
      { key: 'gap', label: { en: 'clearance, mm', it: 'gioco, mm' }, value: 0.3, min: 0.1, max: 1, step: 0.05 },
    ],
    name: o => `escher_monster_${o.type}_s${o.seed}_${o.count}tiles_${o.size}mm`,
    head: 'binary STL, millimetres, Escher monster tiles',
    object: 'escher monster tiles',
  },
  panelKeys: ['size', 'thick', 'gap'],
});
const state = () => sc.state;
onLang(() => draw());

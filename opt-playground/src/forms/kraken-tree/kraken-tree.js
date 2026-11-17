// Kraken and elven tree: the side view of the attraction points and of the
// branches grown towards them, the form in 3D and the print panel.

import { t, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { DEFAULTS } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = {
  scene: { def: DEFAULTS.scene, values: ['tree', 'kraken'] },
  seed: { def: DEFAULTS.seed, min: 1, max: 99999, int: true },
  points: { def: DEFAULTS.points, min: 200, max: 2500, int: true },
  di: { def: DEFAULTS.di, min: 6, max: 30 },
  dk: { def: DEFAULTS.dk, min: 1.5, max: 8 },
  up: { def: DEFAULTS.up, min: 0, max: 1 },
  gamma: { def: DEFAULTS.gamma, min: 2, max: 3 },
};
let last = null;

function side(m) {
  if (!m || !m.att) return;
  last = m;
  const kr = s.state.scene === 'kraken', x0 = kr ? -50 : -40, x1 = -x0, z0 = -4, z1 = kr ? 60 : 100;
  const W = 330, Hh = Math.round(W * (z1 - z0) / (x1 - x0)), k = W / (x1 - x0);
  const X = x => ((x - x0) * k).toFixed(1), Y = z => (Hh - (z - z0) * k).toFixed(1);
  let dots = '', segs = '';
  for (let i = 0; i < m.att.length; i += 3) dots += `<circle cx="${X(m.att[i])}" cy="${Y(m.att[i + 1])}" r="1.1" fill="${m.att[i + 2] ? 'var(--gold)' : 'var(--rule)'}"/>`;
  for (let i = 0; i < m.skel.length; i += 5) segs += `<line x1="${X(m.skel[i])}" y1="${Y(m.skel[i + 1])}" x2="${X(m.skel[i + 2])}" y2="${Y(m.skel[i + 3])}" stroke-width="${Math.max(0.6, 2 * m.skel[i + 4] * k).toFixed(2)}"/>`;
  const svg = $('side');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.innerHTML = `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--rule)"/>${dots}<g stroke="var(--accent)" stroke-linecap="round">${segs}</g>`;
  $('stats').innerHTML = `<span>${t('nodes', 'nodi')} <b>${m.nodes}</b></span>` +
    `<span>${t('points left', 'punti rimasti')} <b>${m.left} / ${m.points}</b></span>` +
    `<span>${kr ? t('thickest tentacle', 'tentacolo più grosso') : t('trunk radius', 'raggio del tronco')} <b>${m.trunk.toFixed(1)} mm</b></span>` +
    `<span>${t('length flatter than 45°', 'lunghezza sotto i 45°')} <b>${(100 * m.flat).toFixed(0)}%</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.9, -1.6, 0.6],
  onChange: st => { $('gamma').disabled = st.scene === 'kraken'; },
  onMesh: side,
  panel: {
    size: { value: 100, min: 60, max: 250, label: { en: 'size, mm (tree height, sea length)', it: 'dimensione, mm (altezza albero, lunghezza mare)' } },
    fields: [
      { key: 'rmin', label: { en: 'thinnest branch, radius mm', it: 'ramo più sottile, raggio mm' }, value: 0.8, min: 0.5, max: 2, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `${o.scene}_space_colonization_seed${o.seed}_${o.size}mm`,
    head: 'binary STL, millimetres, space colonization',
    object: 'space colonization',
  },
  panelKeys: ['rmin', 'size'],
});
onLang(() => side(last));

// Wulff mana crystals: the energies of the three facet families, presets of
// the classical habits, the shares of the faces, the solid in 3D and the
// print panel.

import { t, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { wulff, shares } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = {
  g100: { def: 1, min: 0.6, max: 2 },
  g111: { def: 1.1, min: 0.6, max: 2 },
  g110: { def: 1.25, min: 0.6, max: 2 },
  stretch: { def: 1.8, min: 1, max: 3.5 },
  axis: { def: '001', values: ['001', '111'] },
  twin: { def: false },
  mode: { def: 'cluster', values: ['cluster', 'single'] },
  count: { def: 7, min: 3, max: 12, int: true },
  seed: { def: 1, min: 1, max: 99999, int: true },
};
// energies of the classical habits
const PRESETS = {
  cube: [1, 1.9, 1.9], octahedron: [1.9, 1, 1.9], cubocta: [1, 2 / Math.sqrt(3), 1.9],
  dodeca: [1.9, 1.9, 1], truncoct: [1.2, 1, 1.9], mixed: [1, 1.1, 1.05],
};

function habit(s) {
  const has = f => s[f] > 0.005, a = has('100'), b = has('111'), c = has('110');
  if (a && !b && !c) return t('cube', 'cubo');
  if (!a && b && !c) return t('octahedron', 'ottaedro');
  if (!a && !b && c) return t('rhombic dodecahedron', 'rombododecaedro');
  if (a && b && !c) return t('cube and octahedron', 'cubo e ottaedro');
  if (a && !b && c) return t('cube and dodecahedron', 'cubo e dodecaedro');
  if (!a && b && c) return t('octahedron and dodecahedron', 'ottaedro e dodecaedro');
  return t('all three forms', 'tutte e tre le forme');
}

function stats(state) {
  const P = wulff({ '100': state.g100, '111': state.g111, '110': state.g110 }), s = shares(P);
  const pc = f => `${(100 * s[f]).toFixed(0)}%`;
  $('stats').innerHTML = `<span>${t('habit', 'abito')} <b>${habit(s)}</b></span><span>${t('faces', 'facce')} <b>${P.faces.length}</b></span>` +
    `<span>{100} <b>${pc('100')}</b></span><span>{111} <b>${pc('111')}</b></span><span>{110} <b>${pc('110')}</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [1, -1.5, 0.75],
  onChange: stats,
  panel: {
    size: { value: 70, min: 20, max: 200, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [],
    name: o => `wulff_${o.mode}_${o.g100}_${o.g111}_${o.g110}${o.twin ? '_twin' : ''}_${o.size}mm`,
    head: 'binary STL, millimetres, Wulff crystals',
    object: 'wulff crystals',
    note: info => (info.overhang !== undefined ? ` · ${(100 * info.overhang).toFixed(1)}% ${t('overhangs beyond 45°', 'sporge oltre 45°')}` : ''),
  },
});
$('preset').addEventListener('change', e => {
  const p = PRESETS[e.target.value];
  if (!p) return;
  [s.state.g100, s.state.g111, s.state.g110] = p.map(x => +x.toFixed(3));
  s.sync(); s.rebuild();
});
onLang(() => stats(s.state));

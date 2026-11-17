// Minimal surfaces: the surface and its container chosen above, the sheet
// built in a worker at the resolution of the view, its formula and its
// history, and the download panel, which builds the same solid finer.

import { t } from '../../i18n.js';
import { setTex, texClear, texSet } from '../../tex.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, isTPMS } from './model.js';

const $ = id => document.getElementById(id);
const MODEL = new URL('./model.js', import.meta.url).href;

// the formula and a line of history of each surface
const INFO = {
  gyroid: {
    tex: '\\sin x\\cos y + \\sin y\\cos z + \\sin z\\cos x = 0',
    en: 'Found by Alan Schoen at NASA in 1970: it has no straight lines and no planes of symmetry, and it divides space into two congruent labyrinths that wind like screws. It is also the gyroid infill of the slicers of 3D printers, chosen because it is equally strong in every direction and every layer is a smooth wave that needs no support.',
    it: 'Trovato da Alan Schoen alla NASA nel 1970: non contiene rette né piani di simmetria, e divide lo spazio in due labirinti congruenti che si avvitano come viti. È anche il riempimento giroide degli slicer delle stampanti 3D, scelto perché è ugualmente resistente in ogni direzione e ogni strato è un\'onda liscia che non ha bisogno di supporti.',
  },
  'schwarz-p': {
    tex: '\\cos x + \\cos y + \\cos z = 0',
    en: 'The primitive surface of Hermann Amandus Schwarz (1860s): tubes along the three axes that meet at the nodes of a cubic lattice, and two congruent labyrinths, one inside the tubes and one around them.',
    it: 'La superficie primitiva di Hermann Amandus Schwarz (anni 1860): tubi lungo i tre assi che si incontrano nei nodi di un reticolo cubico, e due labirinti congruenti, uno dentro i tubi e uno attorno.',
  },
  'schwarz-d': {
    tex: '\\sin x\\sin y\\sin z + \\sin x\\cos y\\cos z + \\cos x\\sin y\\cos z + \\cos x\\cos y\\sin z = 0',
    en: 'The diamond surface of Schwarz: the two labyrinths it separates are the two interpenetrating lattices of the diamond crystal, whose channels meet four at a time, as the bonds of carbon do.',
    it: 'La superficie diamante di Schwarz: i due labirinti che separa sono i due reticoli compenetrati del cristallo di diamante, i cui canali si incontrano a quattro a quattro, come i legami del carbonio.',
  },
  neovius: {
    tex: '3(\\cos x + \\cos y + \\cos z) + 4\\cos x\\cos y\\cos z = 0',
    en: 'Found in 1883 by Edvard Rudolf Neovius, a student of Schwarz: the P surface with a second, finer lattice of holes, twelve tubes leaving every cell.',
    it: 'Trovata nel 1883 da Edvard Rudolf Neovius, allievo di Schwarz: la superficie P con un secondo reticolo di fori, più fitto, dodici tubi che escono da ogni cella.',
  },
  costa: {
    tex: 'z = \\tfrac{\\sqrt{2\\pi}}{4}\\,\\ln\\left|\\frac{\\wp(w) - e_1}{\\wp(w) + e_1}\\right|,\\quad w = u + iv',
    en: 'Found by Celso Costa in 1982: a plane and two catenoids joined by a handle, the first complete embedded minimal surface of finite topology after the plane, the catenoid and the helicoid; Hoffman and Meeks proved in 1985 that it does not cross itself, helped by pictures drawn by computer. The coordinates are those of A. Gray, with the Weierstrass functions of the square lattice.',
    it: 'Trovata da Celso Costa nel 1982: un piano e due catenoidi uniti da un manico, la prima superficie minima completa e immersa di topologia finita dopo il piano, il catenoide e l\'elicoide; Hoffman e Meeks dimostrarono nel 1985 che non interseca se stessa, aiutati da immagini disegnate al calcolatore. Le coordinate sono quelle di A. Gray, con le funzioni di Weierstrass del reticolo quadrato.',
  },
  enneper: {
    tex: '(u - \\tfrac{u^3}{3} + uv^2,\\; v - \\tfrac{v^3}{3} + vu^2,\\; u^2 - v^2)',
    en: 'Described by Alfred Enneper in 1864: a saddle whose rim waves more and more as it grows, and that crosses itself beyond the radius \\(\\sqrt 3\\) of the parameters.',
    it: 'Descritta da Alfred Enneper nel 1864: una sella il cui bordo ondeggia sempre di più man mano che cresce, e che interseca se stessa oltre il raggio \\(\\sqrt 3\\) dei parametri.',
  },
};

const view = createView($('stage'), { eye: [1, -1.45, 0.95] });
const build = workerBuilder(f => view.status(building(f)));
let panel;

// the scene in the address, so that a link restores it
const SPEC = {
  s: { def: 'gyroid', values: Object.keys(INFO) },
  c: { def: 'cube', values: ['cube', 'sphere', 'cylinder'] },
  n: { def: 2, min: 1, max: 4, int: true },
  r: { def: 1.4, min: 0.8, max: 2.2 },
};
const st = readState(SPEC);
const state = { surface: st.s, container: st.c, cells: st.n, reach: st.r };
const spec = () => ({ s: state.surface, c: state.container, n: state.cells, r: state.reach });

function sync() {
  for (const k of ['surface', 'container']) $(k).value = state[k];
  $('cells').value = state.cells; $('cellsout').textContent = state.cells;
  $('reach').value = state.reach; $('reachout').textContent = state.reach.toFixed(2);
  const tp = isTPMS(state.surface), en = state.surface === 'enneper';
  $('cellsbox').hidden = !tp; $('tpmsnote').hidden = !tp; $('reachbox').hidden = !en; $('container').disabled = en;
  const I = INFO[state.surface];
  setTex($('formula'), `\\(${I.tex}\\)`);
  if ($('history').dataset.s !== state.surface) {
    texClear($('history'));
    $('history').innerHTML = `<span data-l="en">${I.en}</span><span data-l="it" lang="it">${I.it}</span>`;
    $('history').dataset.s = state.surface; texSet($('history'));
  }
}

async function rebuild() {
  writeState(SPEC, spec()); sync();
  const o = { ...state, ...(panel ? panel.read() : { size: 60, wall: 1.6, flat: true, base: true }), res: 'preview' };
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [o]);
    if (!m) return;
    view.show(m);
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  for (const k of ['surface', 'container']) $(k).addEventListener('change', e => { state[k] = e.target.value; rebuild(); });
  $('cells').addEventListener('input', e => { state.cells = +e.target.value; $('cellsout').textContent = state.cells; });
  $('cells').addEventListener('change', rebuild);
  $('reach').addEventListener('input', e => { state.reach = +e.target.value; $('reachout').textContent = state.reach.toFixed(2); });
  $('reach').addEventListener('change', rebuild);
  $('spin').addEventListener('change', e => view.spin(e.target.checked));
  $('view').addEventListener('click', () => view.reset());
  panel = printPanel($('print'), {
    size: { value: 60, min: 20, max: 200, what: { en: 'side of the cube, or diameter', it: 'lato del cubo, o diametro' } },
    fields: [
      { key: 'wall', label: { en: 'wall, mm', it: 'parete, mm' }, value: 1.6, min: 0.8, max: 5, step: 0.1 },
      { key: 'flat', type: 'check', label: { en: 'flat cut (sphere)', it: 'taglio piano (sfera)' }, value: true },
      { key: 'base', type: 'check', label: { en: 'stand (Enneper)', it: 'supporto (Enneper)' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: o => `binary STL, millimetres, minimal surface ${state.surface}`,
    object: 'minimal surface',
    share: () => shareUrl(SPEC, spec()),
  });
  for (const k of ['wall', 'flat', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();

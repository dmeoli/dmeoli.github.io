// Strange attractors: the system and its parameters chosen above, the tube
// along the trajectory built in a worker at the resolution of the view, the
// equations and a line of history, and the download panel, which builds the
// same solid finer.

import { t } from '../../i18n.js';
import { setTex, texClear, texSet } from '../../tex.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { SYSTEMS, fileName } from './model.js';

const $ = id => document.getElementById(id);
const MODEL = new URL('./model.js', import.meta.url).href;

// the sliders of each system (name, range, step) and its text
const INFO = {
  lorenz: {
    pars: { p1: ['σ', 1, 20, 0.1], p2: ['ρ', 14, 60, 0.1], p3: ['β', 0.5, 5, 0.01] }, T: [5, 60, 1],
    tex: '\\dot x = \\sigma(y - x),\\quad \\dot y = x(\\rho - z) - y,\\quad \\dot z = xy - \\beta z',
    en: 'Edward Lorenz, a meteorologist at MIT, reduced the convection of a layer of air heated from below to these three equations in 1963 ("Deterministic Nonperiodic Flow"), and found that two runs from starting points that differ in the sixth digit soon go their separate ways: the butterfly effect, named after his talk of 1972, "Does the flap of a butterfly\'s wings in Brazil set off a tornado in Texas?". With his values σ = 10, ρ = 28, β = 8/3 the trajectory turns round one wing, then the other, a number of times that cannot be foreseen; below ρ ≈ 24 it ends by settling on one of the two centres.',
    it: 'Edward Lorenz, meteorologo al MIT, ridusse nel 1963 la convezione di uno strato d\'aria scaldato dal basso a queste tre equazioni ("Deterministic Nonperiodic Flow"), e trovò che due simulazioni da punti di partenza diversi alla sesta cifra si separano presto: l\'effetto farfalla, dal titolo della sua conferenza del 1972, "Il battito d\'ali di una farfalla in Brasile provoca un tornado in Texas?". Con i suoi valori σ = 10, ρ = 28, β = 8/3 la traiettoria gira attorno a un\'ala, poi all\'altra, un numero di volte che non si può prevedere; sotto ρ ≈ 24 finisce per fermarsi su uno dei due centri.',
  },
  rossler: {
    pars: { p1: ['a', 0.05, 0.35, 0.005], p2: ['b', 0.05, 2, 0.01], p3: ['c', 2, 12, 0.05] }, T: [20, 300, 5],
    tex: '\\dot x = -y - z,\\quad \\dot y = x + ay,\\quad \\dot z = b + z(x - c)',
    en: 'Otto Rössler looked in 1976 for the simplest flow with chaos, with one product of variables instead of the two of Lorenz: the trajectory spirals outwards in a plane, and at the outer edge it is lifted and folded back to the middle, like dough that is stretched and folded. As c grows from 2.5 the period of the loop doubles, and doubles again, until at 5.7 it never repeats.',
    it: 'Otto Rössler cercò nel 1976 il flusso più semplice con il caos, con un solo prodotto di variabili invece dei due di Lorenz: la traiettoria gira a spirale verso l\'esterno in un piano, e al bordo esterno viene sollevata e ripiegata verso il centro, come una pasta che si stira e si ripiega. Al crescere di c da 2.5 il periodo del giro raddoppia, e raddoppia ancora, finché a 5.7 non si ripete più.',
  },
  thomas: {
    pars: { p1: ['b', 0.1, 0.33, 0.001] }, T: [100, 1500, 10],
    tex: '\\dot x = \\sin y - bx,\\quad \\dot y = \\sin z - by,\\quad \\dot z = \\sin x - bz',
    en: 'René Thomas, a biologist who studied the feedback circuits of genes, proposed in 1999 this system, the same under the cyclic exchange of x, y and z. The number b is a friction: above about 0.33 the motion stops at a point, near 0.208 it is chaotic, and at b = 0 it becomes a random walk through a lattice of cells.',
    it: 'René Thomas, biologo che studiava i circuiti di retroazione dei geni, propose nel 1999 questo sistema, invariato per lo scambio ciclico di x, y e z. Il numero b è un attrito: sopra circa 0.33 il moto si ferma in un punto, vicino a 0.208 è caotico, e con b = 0 diventa una passeggiata a caso attraverso un reticolo di celle.',
  },
};

// every parameter of every system in the address, so that a link restores
// the scene: the sliders p1, p2, p3 and the time of the system shown are
// stored under the keys of KEYS
const SPEC = {
  a: { def: 'lorenz', values: ['lorenz', 'rossler', 'thomas'] },
  sigma: { def: 10, min: 1, max: 20 }, rho: { def: 28, min: 14, max: 60 }, beta: { def: 8 / 3, min: 0.5, max: 5 }, tl: { def: SYSTEMS.lorenz.T, min: 5, max: 60 },
  ra: { def: 0.2, min: 0.05, max: 0.35 }, rb: { def: 0.2, min: 0.05, max: 2 }, rc: { def: 5.7, min: 2, max: 12 }, tr: { def: SYSTEMS.rossler.T, min: 20, max: 300 },
  tb: { def: 0.208186, min: 0.1, max: 0.33 }, tt: { def: SYSTEMS.thomas.T, min: 100, max: 1500 },
  spin: { def: false },
};
const KEYS = {
  lorenz: { p1: 'sigma', p2: 'rho', p3: 'beta', T: 'tl' },
  rossler: { p1: 'ra', p2: 'rb', p3: 'rc', T: 'tr' },
  thomas: { p1: 'tb', T: 'tt' },
};
// the view and its builder first: the builder reads #sync before the
// address is rewritten
const view = createView($('stage'), { eye: [0.35, -1.6, 0.45] });
const build = workerBuilder(f => view.status(building(f)));
const state = readState(SPEC);
let panel;

const fmt = v => String(+(+v).toFixed(3));
// the parameters of the system shown, as the model takes them
const params = () => {
  const K = KEYS[state.a], o = { attractor: state.a };
  for (const [k, key] of Object.entries(K)) o[k] = state[key];
  return o;
};
function defaults(name) {
  state.a = name;
  for (const key of Object.values(KEYS[name])) state[key] = SPEC[key].def;
}

function sync() {
  const I = INFO[state.a], K = KEYS[state.a];
  $('attractor').value = state.a; $('spin').checked = state.spin;
  for (const k of ['p1', 'p2', 'p3']) {
    const p = I.pars[k], box = $(k + 'box');
    box.hidden = !p;
    if (!p) continue;
    $(k + 'name').textContent = p[0];
    Object.assign($(k), { min: p[1], max: p[2], step: p[3] });
    $(k).value = state[K[k]]; $(k + 'out').textContent = fmt(state[K[k]]);
  }
  Object.assign($('T'), { min: I.T[0], max: I.T[1], step: I.T[2] });
  $('T').value = state[K.T]; $('Tout').textContent = fmt(state[K.T]);
  setTex($('formula'), `\\[${I.tex}\\]`);
  if ($('history').dataset.s !== state.a) {
    texClear($('history'));
    $('history').innerHTML = `<span data-l="en">${I.en}</span><span data-l="it" lang="it">${I.it}</span>`;
    $('history').dataset.s = state.a; texSet($('history'));
  }
}

async function rebuild() {
  writeState(SPEC, state); sync();
  const o = { ...params(), ...(panel ? panel.read() : { size: 80, tube: 1.2, base: true }), res: 'preview' };
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [o]);
    if (!m) return;
    view.show(m);
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  $('attractor').addEventListener('change', e => { state.a = e.target.value; view.reset(); rebuild(); });
  for (const k of ['p1', 'p2', 'p3', 'T']) {
    $(k).addEventListener('input', e => { const key = KEYS[state.a][k]; state[key] = +e.target.value; $(k + 'out').textContent = fmt(state[key]); });
    $(k).addEventListener('change', rebuild);
  }
  $('classic').addEventListener('click', () => { defaults(state.a); rebuild(); });
  $('spin').addEventListener('change', e => { state.spin = e.target.checked; view.spin(state.spin); writeState(SPEC, state); });
  view.spin(state.spin);
  $('view').addEventListener('click', () => view.reset());
  panel = printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest side of the trajectory', it: 'lato maggiore della traiettoria' } },
    fields: [
      { key: 'tube', label: { en: 'tube radius, mm', it: 'raggio del tubo, mm' }, value: 1.2, min: 0.6, max: 5, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'plate and posts', it: 'piastra e colonne' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...params(), ...o }] },
    name: o => fileName({ ...params(), ...o }),
    head: () => `binary STL, millimetres, ${state.a} attractor`,
    share: () => shareUrl(SPEC, state),
    object: 'attractor',
  });
  for (const k of ['tube', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();

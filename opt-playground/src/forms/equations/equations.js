// Famous equations: the equation chosen above, its solid built in a worker at
// the resolution of the view, its formula and a line of its history, and the
// download panel, which builds the same solid finer.

import { t } from '../../i18n.js';
import { setTex, texClear, texSet } from '../../tex.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, coprime } from './model.js';

const $ = id => document.getElementById(id);
const MODEL = new URL('./model.js', import.meta.url).href;
// the size that each form takes when it is chosen
const SIZE = { heart: 60, butterfly: 100, lissajous: 70 };
const INTS = ['turns', 'nx', 'ny', 'nz'], PHASES = ['px', 'py', 'pz'];
// every parameter of the scene, kept in the address
const SPEC = {
  e: { def: 'heart', values: ['heart', 'butterfly', 'lissajous'] },
  turns: { def: 12, min: 1, max: 12, int: true },
  nx: { def: 3, min: 1, max: 9, int: true }, ny: { def: 2, min: 1, max: 9, int: true }, nz: { def: 7, min: 1, max: 11, int: true },
  px: { def: 0.7, min: 0, max: 3.14 }, py: { def: 0.2, min: 0, max: 3.14 }, pz: { def: 0, min: 0, max: 3.14 },
  spin: { def: false },
};
const state = readState(SPEC);

const INFO = {
  heart: {
    tex: '\\left(x^2 + \\tfrac94 y^2 + z^2 - 1\\right)^3 - x^2 z^3 - \\tfrac{9}{80}\\, y^2 z^3 = 0',
    en: 'A surface of degree 6 that appears in the work of Gabriel Taubin on drawing algebraic curves and surfaces in the 1990s, and that has since become the Valentine\'s day example of every plotting program. Its section by the plane \\(y = 0\\) is the heart curve \\((x^2 + z^2 - 1)^3 = x^2 z^3\\), with a cusp at the top and a point at the bottom, where the gradient vanishes.',
    it: 'Una superficie di grado 6 che compare nei lavori di Gabriel Taubin sul disegno di curve e superfici algebriche negli anni 1990, e che da allora è l\'esempio di San Valentino di ogni programma di grafici. La sua sezione col piano \\(y = 0\\) è la curva a cuore \\((x^2 + z^2 - 1)^3 = x^2 z^3\\), con una cuspide in alto e una punta in basso, dove il gradiente si annulla.',
  },
  butterfly: {
    tex: 'r = e^{\\sin\\theta} - 2\\cos 4\\theta + \\sin^5\\!\\left(\\frac{2\\theta - \\pi}{24}\\right)',
    en: 'Published by Temple H. Fay in the American Mathematical Monthly in 1989 as an example for students of polar curves: the first two terms draw the wings, and the slow fifth power, of period \\(24\\pi\\), makes each of the twelve turns a little different, so that the curve closes only after all of them.',
    it: 'Pubblicata da Temple H. Fay sull\'American Mathematical Monthly nel 1989 come esempio di curva polare per gli studenti: i primi due termini disegnano le ali, e la lenta quinta potenza, di periodo \\(24\\pi\\), rende ogni giro dei dodici un po\' diverso, sicché la curva si chiude solo dopo tutti.',
  },
  lissajous: {
    tex: '\\begin{aligned} x &= \\cos(n_x t + \\varphi_x)\\\\ y &= \\cos(n_y t + \\varphi_y)\\\\ z &= \\cos(n_z t + \\varphi_z) \\end{aligned}',
    en: 'Jules Antoine Lissajous showed in 1857 the figures drawn by a beam of light reflected by two tuning forks at right angles; with a third vibration the curve leaves the plane, and when the three frequencies are pairwise coprime it is a knot. Bogle, Hearst, Jones and Stoilov studied these knots in 1994: not every knot is one of them, and the trefoil, for instance, is not.',
    it: 'Jules Antoine Lissajous mostrò nel 1857 le figure disegnate da un raggio di luce riflesso da due diapason ad angolo retto; con una terza vibrazione la curva esce dal piano, e quando le tre frequenze sono prime fra loro a due a due è un nodo. Bogle, Hearst, Jones e Stoilov hanno studiato questi nodi nel 1994: non ogni nodo è uno di essi, e il trifoglio, per esempio, non lo è.',
  },
};

const view = createView($('stage'), { eye: [0.35, -1.6, 0.55] });
const build = workerBuilder(f => view.status(building(f)));
let panel;

function sync() {
  $('eq').value = state.e;
  for (const k of [...INTS, ...PHASES]) { $(k).value = state[k]; $(k + 'out').textContent = PHASES.includes(k) ? state[k].toFixed(2) : state[k]; }
  $('fly').hidden = state.e !== 'butterfly'; $('knot').hidden = state.e !== 'lissajous';
  $('warn').hidden = state.e !== 'lissajous' || coprime(state);
  for (const k of ['stroke', 'relief']) $('p' + k).closest('label').hidden = state.e !== 'butterfly';
  $('ptube').closest('label').hidden = state.e !== 'lissajous';
  $('pbase').closest('label').hidden = state.e === 'butterfly';
  const I = INFO[state.e];
  setTex($('formula'), `\\[${I.tex}\\]`);
  if ($('history').dataset.s !== state.e) {
    texClear($('history'));
    $('history').innerHTML = `<span data-l="en">${I.en}</span><span data-l="it" lang="it">${I.it}</span>`;
    $('history').dataset.s = state.e; texSet($('history'));
  }
}

async function rebuild() {
  writeState(SPEC, state); sync();
  const o = { ...state, eq: state.e, ...panel.read(), res: 'preview' };
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [o]);
    if (!m) return;
    // the butterfly, which is printed lying flat, is shown standing, facing
    // the camera
    if (o.eq === 'butterfly') for (let k = 0; k < m.pos.length; k += 3) { const y = m.pos[k + 1]; m.pos[k + 1] = -m.pos[k + 2]; m.pos[k + 2] = y; }
    view.show(m);
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  $('spin').checked = state.spin; view.spin(state.spin);
  $('eq').addEventListener('change', e => { state.e = e.target.value; $('psize').value = SIZE[state.e]; view.reset(); rebuild(); });
  for (const k of [...INTS, ...PHASES]) {
    $(k).addEventListener('input', e => { state[k] = +e.target.value; $(k + 'out').textContent = PHASES.includes(k) ? state[k].toFixed(2) : state[k]; });
    $(k).addEventListener('change', rebuild);
  }
  $('spin').addEventListener('change', e => { state.spin = e.target.checked; view.spin(state.spin); writeState(SPEC, state); });
  $('view').addEventListener('click', () => view.reset());
  panel = printPanel($('print'), {
    size: { value: SIZE[state.e], min: 20, max: 250, what: { en: 'largest width', it: 'larghezza massima' } },
    fields: [
      { key: 'stroke', label: { en: 'stroke, mm', it: 'tratto, mm' }, value: 1.6, min: 0.8, max: 5, step: 0.1 },
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 3, min: 1, max: 10, step: 0.5 },
      { key: 'tube', label: { en: 'tube radius, mm', it: 'raggio del tubo, mm' }, value: 2.4, min: 1, max: 6, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, eq: state.e, ...o }] },
    share: () => shareUrl(SPEC, state),
    name: o => fileName({ ...state, eq: state.e, ...o }),
    head: () => `binary STL, millimetres, ${state.e}`,
    object: 'famous equation',
  });
  for (const k of ['size', 'stroke', 'relief', 'tube', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();

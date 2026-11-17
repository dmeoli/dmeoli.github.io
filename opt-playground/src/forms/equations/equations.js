// Famous equations: the equation chosen above, its solid built in a worker at
// the resolution of the view, its formula and a line of its history, and the
// download panel, which builds the same solid finer.

import { t } from '../../i18n.js';
import { setTex, texClear, texSet } from '../../tex.js';
import { printPanel } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, coprime } from './model.js';

const $ = id => document.getElementById(id);
const MODEL = new URL('./model.js', import.meta.url).href;
const state = { eq: 'heart', turns: 12, nx: 3, ny: 2, nz: 7, px: 0.7, py: 0.2, pz: 0 };
// the size that each form takes when it is chosen
const SIZE = { heart: 60, butterfly: 100, lissajous: 70 };
const INTS = ['turns', 'nx', 'ny', 'nz'], PHASES = ['px', 'py', 'pz'];

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

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (INFO[h.get('e')]) state.eq = h.get('e');
  for (const k of INTS) if (h.get(k)) state[k] = Math.min(+$(k).max, Math.max(+$(k).min, Math.round(+h.get(k)) || state[k]));
  for (const k of PHASES) if (h.get(k)) state[k] = Math.min(3.14, Math.max(0, +h.get(k) || 0));
}
const writeHash = () => history.replaceState(null, '', '#' + new URLSearchParams({ e: state.eq, ...Object.fromEntries([...INTS, ...PHASES].map(k => [k, state[k]])) }));

function sync() {
  $('eq').value = state.eq;
  for (const k of [...INTS, ...PHASES]) { $(k).value = state[k]; $(k + 'out').textContent = PHASES.includes(k) ? state[k].toFixed(2) : state[k]; }
  $('fly').hidden = state.eq !== 'butterfly'; $('knot').hidden = state.eq !== 'lissajous';
  $('warn').hidden = state.eq !== 'lissajous' || coprime(state);
  for (const k of ['stroke', 'relief']) $('p' + k).closest('label').hidden = state.eq !== 'butterfly';
  $('ptube').closest('label').hidden = state.eq !== 'lissajous';
  $('pbase').closest('label').hidden = state.eq === 'butterfly';
  const I = INFO[state.eq];
  setTex($('formula'), `\\[${I.tex}\\]`);
  if ($('history').dataset.s !== state.eq) {
    texClear($('history'));
    $('history').innerHTML = `<span data-l="en">${I.en}</span><span data-l="it" lang="it">${I.it}</span>`;
    $('history').dataset.s = state.eq; texSet($('history'));
  }
}

async function rebuild() {
  writeHash(); sync();
  const o = { ...state, ...panel.read(), res: 'preview' };
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
  readHash();
  $('eq').addEventListener('change', e => { state.eq = e.target.value; $('psize').value = SIZE[state.eq]; view.reset(); rebuild(); });
  for (const k of [...INTS, ...PHASES]) {
    $(k).addEventListener('input', e => { state[k] = +e.target.value; $(k + 'out').textContent = PHASES.includes(k) ? state[k].toFixed(2) : state[k]; });
    $(k).addEventListener('change', rebuild);
  }
  $('spin').addEventListener('change', e => view.spin(e.target.checked));
  $('view').addEventListener('click', () => view.reset());
  panel = printPanel($('print'), {
    size: { value: SIZE[state.eq], min: 20, max: 250, what: { en: 'largest width', it: 'larghezza massima' } },
    fields: [
      { key: 'stroke', label: { en: 'stroke, mm', it: 'tratto, mm' }, value: 1.6, min: 0.8, max: 5, step: 0.1 },
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 3, min: 1, max: 10, step: 0.5 },
      { key: 'tube', label: { en: 'tube radius, mm', it: 'raggio del tubo, mm' }, value: 2.4, min: 1, max: 6, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: () => `binary STL, millimetres, ${state.eq}`,
    object: 'famous equation',
  });
  for (const k of ['size', 'stroke', 'relief', 'tube', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();

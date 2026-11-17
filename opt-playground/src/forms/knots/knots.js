// Knots and one-sided surfaces: the object chosen above, built in a worker at
// the resolution of the view, its formula and its history, and the download
// panel, which builds the same solid finer.

import { t } from '../../i18n.js';
import { setTex, texClear, texSet } from '../../tex.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, isKnot, OBJECTS } from './model.js';

const $ = id => document.getElementById(id);
const MODEL = new URL('./model.js', import.meta.url).href;
// every parameter of the scene, kept in the address
const SPEC = {
  object: { def: 'klein', values: OBJECTS },
  p: { def: 3, min: 1, max: 9, int: true }, q: { def: 5, min: 1, max: 9, int: true },
  twists: { def: 1, min: 1, max: 5, int: true }, half: { def: false },
};
const state = readState(SPEC);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// the formula and a line of history of each object
const INFO = {
  'torus-knot': {
    tex: '\\big((2 + \\cos qt)\\cos pt,\\; (2 + \\cos qt)\\sin pt,\\; -\\sin qt\\big)',
    en: 'The curve that winds p times around the axis of a torus and q times through its hole. It is a knot when p and q have no common factor, with min(p(q − 1), q(p − 1)) crossings at least, and a link of gcd(p, q) rings otherwise. The tables of knots began with P. G. Tait in the 1870s, after Kelvin\'s idea (1867) that atoms might be knotted vortices in the ether.',
    it: 'La curva che gira p volte attorno all\'asse di un toro e q volte nel suo foro. È un nodo quando p e q non hanno fattori comuni, con almeno min(p(q − 1), q(p − 1)) incroci, e altrimenti un allacciamento di mcd(p, q) anelli. Le tavole dei nodi cominciarono con P. G. Tait negli anni 1870, dopo l\'idea di Kelvin (1867) che gli atomi fossero vortici annodati nell\'etere.',
  },
  trefoil: {
    tex: '\\big(\\sin t + 2\\sin 2t,\\; \\cos t - 2\\cos 2t,\\; -\\sin 3t\\big)',
    en: 'The simplest knot that cannot be untied, with three crossings, the torus knot (2, 3). It is chiral: Max Dehn proved in 1914 that the left and the right trefoil cannot be deformed into each other.',
    it: 'Il nodo più semplice che non si può sciogliere, con tre incroci, il nodo torico (2, 3). È chirale: Max Dehn dimostrò nel 1914 che il trifoglio sinistro e quello destro non si possono deformare l\'uno nell\'altro.',
  },
  'figure-eight': {
    tex: '\\big((2 + \\cos 2t)\\cos 3t,\\; (2 + \\cos 2t)\\sin 3t,\\; \\sin 4t\\big)',
    en: 'The only knot with four crossings. Unlike the trefoil it equals its mirror image, and it is not a torus knot; Robert Riley showed in 1975 that the space around it carries a hyperbolic geometry, the first case of what Thurston then found for most knots.',
    it: 'L\'unico nodo con quattro incroci. A differenza del trifoglio coincide con la sua immagine speculare, e non è un nodo torico; Robert Riley mostrò nel 1975 che lo spazio attorno a esso ha una geometria iperbolica, il primo caso di ciò che Thurston trovò poi per la maggior parte dei nodi.',
  },
  moebius: {
    tex: '\\big((1 + s\\cos\\tfrac{kt}{2})\\cos t,\\; (1 + s\\cos\\tfrac{kt}{2})\\sin t,\\; s\\sin\\tfrac{kt}{2}\\big)',
    en: 'Found independently by Listing and by Möbius in 1858: a band closed with a half twist has one side and one edge. With an odd number k of half twists the band is one-sided, with an even number it has two sides; cut along the middle, the band with one half twist does not fall apart but becomes one longer band with two full twists.',
    it: 'Trovato indipendentemente da Listing e da Möbius nel 1858: un nastro chiuso con mezzo giro ha una sola faccia e un solo bordo. Con un numero dispari k di mezzi giri il nastro ha una faccia sola, con un numero pari ne ha due; tagliato lungo la mezzeria, il nastro con mezzo giro non si divide ma diventa un solo nastro più lungo con due giri interi.',
  },
  klein: {
    tex: 'z = \\tfrac{2}{15}\\,(3 + 5\\cos u\\sin u)\\sin v,\\quad x = -\\tfrac{2}{15}\\cos u\\,(3\\cos v - 30\\sin u + 90\\cos^4 u\\sin u - 60\\cos^6 u\\sin u + 5\\cos u\\cos v\\sin u)',
    en: 'Described by Felix Klein in 1882: a closed surface with one side, which cannot be built in space without crossing itself, here where the neck passes through the wall; the name of bottle probably comes from reading his Fläche (surface) as Flasche (bottle). Cut along its plane of symmetry it falls into two Möbius bands, mirror images of each other, as the half shows.',
    it: 'Descritta da Felix Klein nel 1882: una superficie chiusa con una sola faccia, che nello spazio non si può costruire senza che attraversi se stessa, qui dove il collo passa attraverso la parete; il nome di bottiglia viene probabilmente dall\'aver letto la sua Fläche (superficie) come Flasche (bottiglia). Tagliata lungo il piano di simmetria si divide in due nastri di Möbius, l\'uno speculare dell\'altro, come mostra la metà.',
  },
  klein8: {
    tex: '\\big(r\\cos u,\\; r\\sin u,\\; \\sin\\tfrac u2 \\sin v + \\cos\\tfrac u2 \\sin 2v\\big),\\quad r = 2 + \\cos\\tfrac u2 \\sin v - \\sin\\tfrac u2 \\sin 2v',
    en: 'Another Klein bottle: a figure eight carried around a circle while it turns by half a revolution, so that it comes back upside down and closes into a one-sided surface; it crosses itself along a circle.',
    it: 'Un\'altra bottiglia di Klein: un otto portato lungo un cerchio mentre ruota di mezzo giro, sicché torna capovolto e si chiude in una superficie con una sola faccia; attraversa se stessa lungo un cerchio.',
  },
  boy: {
    tex: 'g_1 = -\\tfrac32\\,\\mathrm{Im}\\frac{w(1 - w^4)}{w^6 + \\sqrt5\\,w^3 - 1},\\; g_2 = -\\tfrac32\\,\\mathrm{Re}\\frac{w(1 + w^4)}{w^6 + \\sqrt5\\,w^3 - 1},\\; g_3 = \\mathrm{Im}\\frac{1 + w^6}{w^6 + \\sqrt5\\,w^3 - 1} - \\tfrac12,\\; (x, y, z) = \\frac{(g_1, g_2, g_3)}{g_1^2 + g_2^2 + g_3^2}',
    en: 'The projective plane, the surface of the lines through a point, in space: Hilbert asked his student Werner Boy to prove that it cannot be built without folds, and Boy found in 1901 that it can, crossing itself along three loops that meet at one triple point. The formula, of the disc |w| ≤ 1 with its opposite boundary points glued, is that of Robert Bryant and Rob Kusner (1987).',
    it: 'Il piano proiettivo, la superficie delle rette per un punto, nello spazio: Hilbert chiese al suo allievo Werner Boy di dimostrare che non si può costruire senza pieghe, e Boy trovò nel 1901 che invece si può, attraversando se stesso lungo tre anelli che si incontrano in un punto triplo. La formula, del disco |w| ≤ 1 con i punti opposti del bordo incollati, è quella di Robert Bryant e Rob Kusner (1987).',
  },
};

// the knots and Boy's surface (along its axis of order 3) are seen from
// higher up, the other surfaces from the side
const EYE = { knot: [0.45, -0.9, 1.5], surface: [1, -1.45, 0.8] };
const eyeOf = o => EYE[isKnot(o) || o === 'boy' ? 'knot' : 'surface'];
const view = createView($('stage'), { eye: eyeOf(state.object) });
let lastKind = null;
const build = workerBuilder(f => view.status(building(f)));
let panel;


function sync() {
  $('object').value = state.object;
  for (const k of ['p', 'q', 'twists']) { $(k).value = state[k]; $(k + 'out').textContent = state[k]; }
  $('half').checked = state.half;
  const o = state.object;
  $('pbox').hidden = $('qbox').hidden = o !== 'torus-knot'; $('kbox').hidden = o !== 'moebius'; $('halfbox').hidden = o !== 'klein';
  const d = gcd(state.p, state.q);
  $('kind').textContent = o !== 'torus-knot' ? '' : state.p === 1 || state.q === 1 ? t('an unknot', 'un nodo banale')
    : d > 1 ? t(`a link of ${d} rings`, `un allacciamento di ${d} anelli`)
    : `${Math.min(state.p * (state.q - 1), state.q * (state.p - 1))} ${t('crossings', 'incroci')}`;
  const I = INFO[o];
  setTex($('formula'), `\\(${I.tex}\\)`);
  if ($('history').dataset.o !== o) {
    texClear($('history'));
    $('history').innerHTML = `<span data-l="en">${I.en}</span><span data-l="it" lang="it">${I.it}</span>`;
    $('history').dataset.o = o; texSet($('history'));
  }
}

async function rebuild() {
  writeState(SPEC, state); sync();
  const o = { ...state, ...(panel ? panel.read() : { size: 80, tube: 6, wall: 2, base: !isKnot(state.object) }), res: 'preview' };
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [o]);
    if (!m) return;
    const kind = isKnot(state.object) || state.object === 'boy';
    if (lastKind !== null && kind !== lastKind) {
      // a new direction of the camera, at the distance it has
      const { camera, controls } = view, d = camera.position.distanceTo(controls.target), e = eyeOf(state.object), n = Math.hypot(...e);
      camera.position.set(...e.map(x => x * d / n));
    }
    view.show(m, { refit: lastKind !== null && kind !== lastKind });
    lastKind = kind;
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  $('object').addEventListener('change', e => {
    state.object = e.target.value;
    // the knots lie on the bed, the surfaces stand on a post
    $('pbase').checked = !isKnot(state.object);
    rebuild();
  });
  for (const k of ['p', 'q', 'twists']) {
    $(k).addEventListener('input', e => { state[k] = +e.target.value; $(k + 'out').textContent = state[k]; });
    $(k).addEventListener('change', rebuild);
  }
  $('half').addEventListener('change', e => { state.half = e.target.checked; rebuild(); });
  $('spin').addEventListener('change', e => view.spin(e.target.checked));
  $('view').addEventListener('click', () => view.reset());
  panel = printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'tube', label: { en: 'tube (knots), mm', it: 'tubo (nodi), mm' }, value: 6, min: 2, max: 20, step: 0.5 },
      { key: 'wall', label: { en: 'wall (surfaces), mm', it: 'parete (superfici), mm' }, value: 2, min: 1, max: 6, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: !isKnot(state.object) },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: () => `binary STL, millimetres, ${state.object}`,
    object: 'knot or surface',
    share: () => shareUrl(SPEC, state),
  });
  for (const k of ['tube', 'wall', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();

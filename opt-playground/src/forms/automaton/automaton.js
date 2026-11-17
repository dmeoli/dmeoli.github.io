// The page of the automaton: the target curve (picked or drawn), the
// linkage turning in SVG with the curve of its foot, Nelder-Mead run a few
// iterations per frame from several starts, the printed parts in 3D, and
// the print panel.

import { t, onLang } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { pose, cost, nelderMead, starts, targetOf, resample, curveString, DEFAULT, HW, fileName } from './model.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const SPEC = {
  curve: { def: 'step', values: ['step', 'ellipse', 'drop', 'eight', 'draw'] },
  drawn: { def: '' },
  p: { def: DEFAULT.join(',') },
  pair: { def: true },
  run: { def: 1, min: 1, max: 9999, int: true },
};
const state = readState(SPEC);
const P = () => { const v = state.p.split(',').map(Number); return v.length === 7 && v.every(Number.isFinite) ? v : DEFAULT.slice(); };
let T = targetOf(state), shown = P(), C = cost(shown, T);

/* ------------------------------------------------------------ the drawing -- */

const svg = $('mech');
let box = [-40, -110, 180, 160];
function frame() {
  const pts = [...T, ...C.curve, [0, 0], [shown[3], shown[4]]];
  for (let k = 0; k < 24; k++) { const q = pose(shown, 2 * Math.PI * k / 24); if (q) pts.push(q.B, q.A); }
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const x0 = Math.min(...xs) - 18, x1 = Math.max(...xs) + 18, y0 = Math.min(...ys) - 18, y1 = Math.max(...ys) + 18;
  const w = Math.max(x1 - x0, (y1 - y0) * 1.25), hgt = w / 1.25;
  box = [(x0 + x1) / 2 - w / 2, -(y0 + y1) / 2 - hgt / 2, w, hgt];
  svg.setAttribute('viewBox', box.map(v => v.toFixed(1)).join(' '));
}
const path = (pts, close = true) => 'M' + pts.map(q => `${q[0].toFixed(1)} ${(-q[1]).toFixed(1)}`).join('L') + (close ? 'Z' : '');
const line = (a, b, cls) => `<line x1="${a[0].toFixed(1)}" y1="${(-a[1]).toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${(-b[1]).toFixed(1)}" class="${cls}"/>`;
const dot = (a, r, cls) => `<circle cx="${a[0].toFixed(1)}" cy="${(-a[1]).toFixed(1)}" r="${r}" class="${cls}"/>`;
let th = 0;
function leg(q, cls) {
  const O = [shown[3], shown[4]];
  return `<g class="${cls}">` + line(O, q.B, 'link rocker') + `<path d="${path([q.A, q.B, q.P])}" class="coupler"/>` +
    line(q.A, q.B, 'link') + line(q.A, q.P, 'link') + line(q.B, q.P, 'link') + line([0, 0], q.A, 'link crank') +
    dot(q.P, HW.w * 0.9, 'foot') + [q.A, q.B].map(a => dot(a, HW.pin + 0.8, 'pin')).join('') + '</g>';
}
function draw() {
  const O = [shown[3], shown[4]];
  let s = `<path d="${path(T)}" class="target"/>`;
  if (C.curve.length > 2) s += `<path d="${path(C.curve, C.curve.length === 72)}" class="trace"/>`;
  s += line([0, 0], O, 'ground') + dot([0, 0], HW.w * 1.2, 'boss') + dot(O, HW.w * 1.2, 'boss');
  const q = pose(shown, th), q2 = state.pair ? pose(shown, th + Math.PI) : null;
  if (q2) s += leg(q2, 'ghost');
  if (q) s += leg(q, 'main');
  s += dot([0, 0], HW.axle + 1, 'pin') + dot(O, HW.pin + 0.8, 'pin');
  svg.innerHTML = s;
}
function stats() {
  const [r1, r2, r3, gx, gy] = shown, g = Math.hypot(gx, gy), L = [r1, r2, r3, g].sort((a, b) => a - b);
  const grashof = L[0] + L[3] <= L[1] + L[2] && L[0] === r1;
  $('stats').innerHTML = `<span>${t('crank', 'manovella')} <b>${r1.toFixed(1)}</b></span><span>${t('coupler', 'biella')} <b>${r2.toFixed(1)}</b></span>` +
    `<span>${t('rocker', 'bilanciere')} <b>${r3.toFixed(1)}</b></span><span>O<sub>A</sub>O<sub>B</sub> <b>${g.toFixed(1)}</b> mm</span>` +
    `<span>${t('RMS distance', 'distanza RMS')} <b>${Number.isFinite(C.fit) ? Math.sqrt(C.fit).toFixed(2) + ' mm' : '—'}</b></span>` +
    `<span>Grashof <b>${grashof ? t('crank-rocker', 'manovella-bilanciere') : t('no', 'no')}</b></span>`;
}

/* ---------------------------------------------------------- animation -- */

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !still;
const tick = () => { if (playing) { th += 0.025; draw(); } requestAnimationFrame(tick); };
$('play').addEventListener('click', () => { playing = !playing; label(); });
const label = () => { $('play').innerHTML = playing ? '<span data-l="en">Pause</span><span data-l="it" lang="it">Pausa</span>' : '<span data-l="en">Play</span><span data-l="it" lang="it">Avvia</span>'; };

/* ----------------------------------------------------- the optimisation -- */

let job = null;
function optimise() {
  if (job) { job = null; $('opt').innerHTML = '<span data-l="en">Optimise</span><span data-l="it" lang="it">Ottimizza</span>'; return; }
  const S = starts(T, 6, state.run * 7919), f = p => cost(p, T).cost, scale = [3, 6, 6, 6, 6, 6, 6];
  let best = [P(), f(P())], k = 0, nm = nelderMead(f, S[0], scale), it = 0;
  const me = job = {};
  $('opt').innerHTML = '<span data-l="en">Stop</span><span data-l="it" lang="it">Ferma</span>';
  const work = () => {
    if (job !== me) return;
    nm.step(25); it += 25;
    const [x, fx] = nm.best;
    if (fx < best[1]) best = [x.slice(), fx];
    shown = x; C = cost(shown, T);
    $('progress').textContent = `${t('start', 'partenza')} ${k + 1}/6 · ${t('iteration', 'iterazione')} ${it} · ${t('best', 'migliore')} ${Number.isFinite(best[1]) && best[1] < 1e4 ? Math.sqrt(best[1]).toFixed(2) + ' mm' : '—'}`;
    if (it >= 800 || nm.spread < 1e-9) {
      k++; it = 0;
      if (k >= S.length) return finish(best[0]);
      nm = nelderMead(f, S[k], scale);
    }
    frame(); draw(); stats();
    requestAnimationFrame(work);
  };
  requestAnimationFrame(work);
}
function finish(p) {
  job = null;
  $('opt').innerHTML = '<span data-l="en">Optimise</span><span data-l="it" lang="it">Ottimizza</span>';
  shown = p; C = cost(shown, T);
  state.p = p.map(v => (+v.toFixed(2)).toString()).join(',');
  state.run++;
  writeState(SPEC, state); frame(); draw(); stats(); show3d();
}
$('opt').addEventListener('click', optimise);

/* ------------------------------------------------------- drawing a curve -- */

const toModel = e => {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, -q.y];
};
let pen = null;
svg.addEventListener('pointerdown', e => {
  if (state.curve !== 'draw') return;
  pen = [toModel(e)]; svg.setPointerCapture(e.pointerId); e.preventDefault();
});
svg.addEventListener('pointermove', e => {
  if (!pen) return;
  const q = toModel(e), l = pen[pen.length - 1];
  if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 1.5) pen.push(q);
  T = pen; draw();
});
svg.addEventListener('pointerup', () => {
  if (!pen) return;
  const pts = pen; pen = null;
  if (pts.length < 6) { T = targetOf(state); draw(); return; }
  state.drawn = curveString(resample(pts, 32));
  T = targetOf(state); C = cost(shown, T); writeState(SPEC, state);
  frame(); draw(); stats(); optimise();
});

/* --------------------------------------------------------- the controls -- */

$('curve').value = state.curve; $('pair').checked = state.pair;
$('curve').addEventListener('change', e => {
  if (job) optimise();
  state.curve = e.target.value; T = targetOf(state); C = cost(shown, T); writeState(SPEC, state);
  $('hint').hidden = state.curve !== 'draw';
  frame(); draw(); stats();
  if (state.curve !== 'draw' || state.drawn) optimise();
});
$('pair').addEventListener('change', e => { state.pair = e.target.checked; writeState(SPEC, state); draw(); });
$('reset').addEventListener('click', () => { if (job) optimise(); state.p = DEFAULT.join(','); shown = P(); C = cost(shown, T); writeState(SPEC, state); frame(); draw(); stats(); show3d(); });
$('hint').hidden = state.curve !== 'draw';
onLang(() => { stats(); label(); });

/* ------------------------------------------------------- the parts in 3D -- */

const view = createView($('stage'), { eye: [0.3, -1.1, 1.3], ratio: 0.6 });
const build = workerBuilder(f => view.status(building(f)));
const MODEL = new URL('./model.js', import.meta.url).href;
let pnl = null, ticket = 0;
async function show3d() {
  const me = ++ticket;
  try {
    const m = await build(MODEL, 'solid', [{ ...(pnl ? pnl.read() : {}), p: P(), res: 'preview' }]);
    if (!m || me !== ticket) return;
    view.show(m);
    view.status(`${m.count} ${t('parts', 'parti')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}
pnl = printPanel($('print'), {
  size: { value: 120, min: 100, max: 200, label: { en: 'scale of the linkage, mm', it: 'scala del meccanismo, mm' } },
  fields: [
    { key: 'clearance', label: { en: 'clearance of the free holes, mm', it: 'gioco dei fori liberi, mm' }, value: 0.25, min: 0.2, max: 0.3, step: 0.05 },
    { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
      options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
  ],
  worker: { module: MODEL, fn: 'solid', args: o => [{ ...o, p: P(), curve: state.curve }] },
  name: o => fileName({ ...o, curve: state.curve }),
  head: 'binary STL, millimetres, automaton leg, flat parts',
  object: 'automaton leg',
  share: () => shareUrl(SPEC, state),
});
for (const k of ['psize', 'pclearance']) $(k).addEventListener('change', show3d);

label(); frame(); draw(); stats(); show3d(); requestAnimationFrame(tick);

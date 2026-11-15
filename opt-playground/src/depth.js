// Scene O: why deep networks train only with the right initialization,
// normalization and residual connections, after Glorot and Bengio (2010), He
// et al. (2015, 2016), Ioffe and Szegedy (2015) and Ba et al. (2016); the
// ideas, rebuilt from the equations. A deep stack of layers of the same width
// is trained in the page on a data set of the TensorFlow Playground, and for
// every layer the page draws its activations and the gradient of its weights.

import { createRun, DATA } from './depth-run.js';
import { INITS } from './depth-net.js';
import { drawMap, drawLoss, drawLayers, drawStrip, nice } from './depth-views.js';

const $ = id => document.getElementById(id);
const DEF = { data: 'circle', depth: 20, width: 12, act: 'tanh', init: 'naive', norm: 'none', res: 0, opt: 'adam', lr: 0.01, seed: 1 };
const S = { ...DEF };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof DEF[k] === 'number' ? +v : v; });
const ok = (v, list, d) => (list.map(String).includes(String(v)) ? v : d);
S.data = ok(S.data, Object.keys(DATA), DEF.data);
S.depth = Math.max(2, Math.min(30, Math.round(S.depth) || DEF.depth));
S.width = +ok(S.width, [8, 12, 16], DEF.width);
S.act = ok(S.act, ['tanh', 'relu', 'sigmoid'], DEF.act);
S.init = ok(S.init, Object.keys(INITS), DEF.init);
S.norm = ok(S.norm, ['none', 'batch', 'layer'], DEF.norm);
S.res = S.res ? 1 : 0;
S.opt = ok(S.opt, ['adam', 'sgd'], DEF.opt);
S.lr = +ok(S.lr, [0.001, 0.003, 0.01, 0.03, 0.1, 0.3], DEF.lr);
S.seed = +ok(S.seed, [1, 2, 3, 4, 5], DEF.seed);

// the classic comparisons, one control at a time
const PRESETS = [
  ['20 layers, small init', { depth: 20, init: 'small', norm: 'none', res: 0 }],
  ['20 layers, naive init', { depth: 20, init: 'naive', norm: 'none', res: 0 }],
  ['20 layers, He', { depth: 20, init: 'he', norm: 'none', res: 0 }],
  ['+ batch norm', { depth: 20, init: 'he', norm: 'batch', res: 0 }],
  ['+ residual', { depth: 20, init: 'he', norm: 'batch', res: 1 }],
];

let run, timer = null;
const G = 40;

function save() { history.replaceState(null, '', '#' + new URLSearchParams(S)); }
function reset() {
  stop();
  run = createRun({ ...S, res: !!S.res });
  save(); sync(); draw();
}
function stop() { clearInterval(timer); timer = null; $('train').textContent = 'Play'; }
function step() { run.trainEpoch(); run.measure(); draw(); }
function play() {
  if (timer) return stop();
  $('train').textContent = 'Pause';
  timer = setInterval(() => {
    const t0 = performance.now();
    for (let k = 0; k < 10 && (k === 0 || performance.now() - t0 < 25); k++) run.trainEpoch();
    run.measure(); draw();
  }, 40);
}

// the range of the activation histograms and of the unit maps: [-1, 1] for
// tanh, [0, 1] for the sigmoid, otherwise (ReLU, or any residual stack, whose
// activations add up) a round number above the 99th percentile of |h|
function range(acts) {
  if (!S.res && S.act === 'tanh') return { lo: -1, R: 1, shift: 0, half: 1 };
  if (!S.res && S.act === 'sigmoid') return { lo: 0, R: 1, shift: 0.5, half: 0.5 };
  const all = acts.flatMap(a => Array.from(a, Math.abs)).filter(isFinite).sort((a, b) => a - b);
  const R = nice(all[Math.floor(0.99 * (all.length - 1))] || 1);
  return S.act === 'relu' && !S.res ? { lo: 0, R, shift: R / 2, half: R / 2 } : { lo: -R, R, shift: 0, half: R };
}

function draw() {
  const m = run.meas, rg = range(m.acts), gr = run.grid(G);
  drawMap($('map'), { o: gr.o, G, train: run.train.pts, test: $('showTest').checked ? run.test.pts : [] });
  drawLoss($('loss'), run.hist);
  drawLayers($('layers'), { acts: m.acts, grads: m.grads, gnorm: m.gnorm, R: rg.R, lo: rg.lo });
  drawStrip($('strip'), { units: gr.units, G, R: rg.half, shift: rg.shift });
  $('epoch').textContent = run.epoch;
  $('trainLoss').textContent = m.loss.toFixed(3); $('testLoss').textContent = m.testLoss.toFixed(3);
  $('testAcc').textContent = `${(100 * m.testAcc).toFixed(0)}%`;
  $('range').textContent = rg.lo === 0 ? `[0, ${rg.R}]` : `[-${rg.R}, ${rg.R}]`;
  $('explain').textContent = explain(m);
}

// what the panels show, in one sentence
function explain(m) {
  const d = S.depth, g1 = m.gnorm[0], gd = m.gnorm[d - 1], h = m.acts[d - 1];
  const e = Math.log10(g1 / gd), sci = v => (isFinite(v) ? v.toExponential(1).replace('e+', 'e') : 'not finite');
  let ratio;
  if (!isFinite(e)) ratio = 'is not finite';
  else if (Math.abs(e) < 1) ratio = 'is of the same order as that of the last layer';
  else ratio = `is 10^${e.toFixed(0)} times that of layer ${d}`;
  let sat = '';
  if (!S.res && S.act === 'tanh') sat = `${pct(h, v => Math.abs(v) > 0.99)} of the units of layer ${d} are saturated (|h| > 0.99)`;
  else if (!S.res && S.act === 'sigmoid') sat = `${pct(h, v => v < 0.01 || v > 0.99)} of the units of layer ${d} are saturated`;
  else if (!S.res && S.act === 'relu') sat = `${pct(h, v => v === 0)} of the outputs of layer ${d} are zero`;
  const sd = Math.sqrt(h.reduce((s, v) => s + v * v, 0) / h.length - (h.reduce((s, v) => s + v, 0) / h.length) ** 2);
  return `Epoch ${run.epoch}: the gradient with respect to the weights of layer 1 has norm ${sci(g1)} and ${ratio}; ` +
    `the activations of layer ${d} have standard deviation ${sci(sd)}${sat ? ', and ' + sat : ''}. Test accuracy ${(100 * m.testAcc).toFixed(0)}%.`;
}
const pct = (a, f) => `${(100 * a.reduce((s, v) => s + (f(v) ? 1 : 0), 0) / a.length).toFixed(0)}%`;

// the controls show S; the formulas of the active choices are lit
function sync() {
  for (const k of ['data', 'width', 'act', 'init', 'norm', 'opt', 'lr', 'seed']) $(k).value = String(S[k]);
  $('depth').value = S.depth; $('depthOut').textContent = S.depth; $('res').checked = !!S.res;
  for (const e of document.querySelectorAll('[data-init]')) e.classList.toggle('lit', e.dataset.init === S.init);
  for (const e of document.querySelectorAll('[data-norm]')) e.classList.toggle('lit', e.dataset.norm === S.norm);
  $('eqres').classList.toggle('lit', !!S.res);
  for (const b of document.querySelectorAll('.presets button')) {
    const p = PRESETS[+b.dataset.k][1];
    b.setAttribute('aria-pressed', Object.entries(p).every(([k, v]) => S[k] === v));
  }
}

for (const k of ['data', 'width', 'act', 'init', 'norm', 'opt', 'seed'])
  $(k).onchange = e => { S[k] = typeof DEF[k] === 'number' ? +e.target.value : e.target.value; reset(); };
$('lr').onchange = e => { S.lr = run.opt.lr = +e.target.value; save(); };
$('depth').oninput = e => { $('depthOut').textContent = e.target.value; };
$('depth').onchange = e => { S.depth = +e.target.value; reset(); };
$('res').onchange = e => { S.res = e.target.checked ? 1 : 0; reset(); };
$('showTest').onchange = draw;
const pb = document.querySelector('.presets');
PRESETS.forEach(([name, p], k) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.k = k;
  b.onclick = () => { Object.assign(S, p); reset(); };
  pb.appendChild(b);
});
$('reset').onclick = reset;
$('step').onclick = () => { stop(); step(); };
$('train').onclick = play;
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'checkbox') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stop(); step(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 100); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
reset();

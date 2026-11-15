// Scene W: an echo state network, after the labs LAB3_1 and LAB3_2 of
// github.com/dmeoli/ComputationalNeuroscience (the benchmarks, the splits, the
// hyperparameters the lab selected by grid search and the errors it reports),
// H. Jaeger (2001), M. Lukoševičius (2012) and H. Jaeger and H. Haas (2004).
// The reservoir is run on the whole series, the readout fitted in closed form
// on the design set after the washout, and the two networks of LAB3_1 (an
// input delayed network and an Elman network trained by BPTT) are trained in
// the page with Adam on the same set.

import { BENCH, DESIGN, makeTask, makeReservoir, runReservoir, echoDistance, gram, cholesky, cholSolve, predict, errors,
  memoryCapacity, makeIDNN, idnnEpoch, idnnPredict, makeRNN, rnnEpoch, rnnPredict } from './esn-core.js';
import { drawSeries, drawRing, drawEig, drawEcho, drawWeights, drawMC, drawCompare, drawCurves, fmt } from './esn-views.js';
import { t as tx, onLang, onTheme } from './i18n.js';

const $ = id => document.getElementById(id);
// the hyperparameters the lab selected (esn_*_hyperparams_immse.txt and the
// files of LAB3_1), and the test MSE it reports; the full NARMA10 has no lab run
const LAB = {
  narma: { N: 200, rho: 0.9, om: 0.5, lam: -1, d: 3, Hi: 40, Hr: 100, mse: { esn: 1.808e-3, idnn: 4.223e-3, rnn: 2.386e-3 } },
  narmafull: { N: 200, rho: 0.9, om: 0.5, lam: -1, d: 3, Hi: 40, Hr: 100, mse: null },
  mg: { N: 50, rho: 0.1, om: 2, lam: -3, d: 2, Hi: 40, Hr: 10, mse: { esn: 3.819e-5, idnn: 1.359e-3, rnn: 3.738e-4 } },
};
const S = { bench: 'narma', N: 200, rho: 0.9, om: 0.5, leak: 1, conn: 1, wash: 200, lam: -1, seed: 1, t: 400, d: 3 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = k === 'bench' ? v : +v; });
if (!BENCH[S.bench]) S.bench = 'narma';
const NS = [50, 100, 200, 300, 500], CONNS = [1, 0.5, 0.2, 0.1, 0.05];
if (!NS.includes(S.N)) S.N = 200;
if (!CONNS.includes(S.conn)) S.conn = 1;
const num = (v, a, b, d) => (isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
S.rho = num(S.rho, 0.05, 2, 0.9); S.om = num(S.om, 0.1, 3, 0.5); S.leak = num(S.leak, 0.05, 1, 1);
S.wash = num(S.wash, 0, 1000, 200); S.lam = num(S.lam, -10, 0, -1); S.d = num(S.d, 1, 12, 3); S.t = num(S.t, 0, 9998, 400);

// the computed state, level by level: task < reservoir < states < Gram < readout
let task, res, X, G, w, yh, err, echo, mc, edges, nets = null, hist = { idnn: [], rnn: [] }, net = { idnn: NaN, rnn: NaN };
let dirty = 0, playing = false, training = null, last = 0, overview = null;
const P = () => ({ rho: S.rho, omega: S.om, leak: S.leak });

function compute() {
  const t0 = performance.now();
  if (dirty <= 0) { task = makeTask(S.bench, 1); resetNets(); }
  if (dirty <= 1) {
    res = makeReservoir(S.N, S.conn, S.seed);
    // the strongest connections, for the ring
    const all = [];
    for (let i = 0; i < S.N; i++) for (const j of res.rows[i]) if (i !== j) all.push([i, j, res.W[i * S.N + j]]);
    all.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    edges = all.slice(0, Math.min(all.length, Math.max(60, S.N)));
  }
  if (dirty <= 2) {
    X = runReservoir(res, P(), task.u);
    echo = echoDistance(res, P(), task.u, 300);
    mc = null;
  }
  if (dirty <= 3) G = gram(X, S.N, task.y, Math.min(S.wash, DESIGN - 100), DESIGN);
  w = cholSolve(cholesky(G.A, G.M, 10 ** S.lam), G.M, G.b);
  yh = predict(X, S.N, w);
  const T = task.y.length, w0 = Math.min(S.wash, DESIGN - 100);
  err = { tr: errors(task.y, yh, w0, DESIGN), te: errors(task.y, yh, DESIGN, T), ms: performance.now() - t0 };
  dirty = 9;
  draw();
  if (!mc) setTimeout(() => { if (!mc && dirty === 9) { mc = memoryCapacity(res, P(), Math.min(100, 2 * S.N)); drawMemory(); } }, 30);
}
let pend = null;
function invalidate(level) {
  dirty = Math.min(dirty, level);
  $('rep').textContent = tx('computing...', 'calcolo in corso...');
  clearTimeout(pend); pend = setTimeout(() => { compute(); save(); }, 60);
}

function resetNets() {
  stopTrain();
  const L = LAB[S.bench];
  nets = { idnn: makeIDNN(task, S.d, L.Hi, S.seed), rnn: makeRNN(task, L.Hr, S.seed) };
  hist = { idnn: [], rnn: [] }; net = { idnn: NaN, rnn: NaN };
}
function stopTrain() { clearInterval(training); training = null; if ($('train')) $('train').textContent = tx('Train', 'Addestra'); }
function trainNets() {
  if (training) return stopTrain();
  $('train').textContent = tx('Pause', 'Pausa');
  training = setInterval(() => {
    const T = task.y.length;
    idnnEpoch(nets.idnn); rnnEpoch(nets.rnn);
    net.idnn = errors(task.y, idnnPredict(nets.idnn), DESIGN, T).mse; net.rnn = errors(task.y, rnnPredict(nets.rnn), DESIGN, T).mse;
    hist.idnn.push(net.idnn); hist.rnn.push(net.rnn);
    drawComparison();
    if (nets.rnn.epoch >= 200) stopTrain();
  }, 20);
}

function draw() {
  if (!X) return;
  const T = task.y.length, t = Math.min(S.t, T - 1), N = S.N;
  overview = drawSeries($('series'), { u: task.u, y: task.y, yh, t, wash: Math.min(S.wash, DESIGN - 100), design: DESIGN, win: 240 });
  const x = X.subarray(t * N, t * N + N);
  const uS = S.om * task.u[t] / (S.bench === 'mg' ? 0.6 : 0.5);
  drawRing($('ring'), { N, x, wout: w, edges, nnz: res.nnz, uScaled: uS, yhat: yh[t], y: task.y[t] });
  drawEig($('eig'), { re: res.ev.re, im: res.ev.im, scale: S.rho / res.rad, rho: S.rho });
  drawEcho($('echo'), echo);
  drawWeights($('wout'), w);
  drawMemory();
  drawComparison();
  $('count').textContent = t;
  for (const [k, v] of [['trmse', err.tr.mse], ['trnmse', err.tr.nmse], ['temse', err.te.mse], ['tenmse', err.te.nmse]]) $(k).textContent = fmt(v);
  // the distance after 300 steps
  const q = echo[300] / echo[0];
  $('echotxt').textContent = q === 0
    ? tx('After 300 steps the two runs coincide to the last digit: the reservoir has forgotten where it started.',
      "Dopo 300 passi le due corse coincidono fino all'ultima cifra: il serbatoio ha dimenticato da dove è partito.")
    : q < 1e-6
    ? tx(`After 300 steps the two runs differ by ${fmt(q)} of their initial distance: the reservoir has forgotten where it started.`,
      `Dopo 300 passi le due corse differiscono di ${fmt(q)} della distanza iniziale: il serbatoio ha dimenticato da dove è partito.`)
    : tx(`After 300 steps the two runs still differ by ${fmt(q)} of their initial distance: with these values the state depends on where it started, and the echo state property is lost.`,
      `Dopo 300 passi le due corse differiscono ancora di ${fmt(q)} della distanza iniziale: con questi valori lo stato dipende da dove è partito, e la proprietà dell'eco si perde.`);
  const L = LAB[S.bench], same = S.N === L.N && Math.abs(S.rho - L.rho) < 1e-9 && Math.abs(S.om - L.om) < 1e-9 && S.lam === L.lam && S.leak === 1 && S.conn === 1;
  $('rep').textContent = tx(
    `${BENCH[S.bench].name[0]}: the readout of ${N + 1} weights, solved in closed form on ${G.n} steps, gives a test MSE of ${fmt(err.te.mse)} (NMSE ${fmt(err.te.nmse)}), ` +
    `the whole pipeline in ${Math.round(err.ms)} ms. ` + (L.mse ? (same ? `These are the hyperparameters the lab selected, for which it reports a test MSE of ${fmt(L.mse.esn)}.` : `With the hyperparameters it selected, the lab reports a test MSE of ${fmt(L.mse.esn)}.`) : 'The lab ran only the NARMA10 of the course file.'),
    `${BENCH[S.bench].name[1]}: il readout di ${N + 1} pesi, risolto in forma chiusa su ${G.n} passi, dà un MSE di test di ${fmt(err.te.mse)} (NMSE ${fmt(err.te.nmse)}), ` +
    `l'intera catena in ${Math.round(err.ms)} ms. ` + (L.mse ? (same ? `Sono gli iperparametri scelti dal lab, per i quali riporta un MSE di test di ${fmt(L.mse.esn)}.` : `Con gli iperparametri che ha scelto, il lab riporta un MSE di test di ${fmt(L.mse.esn)}.`) : 'Il lab ha usato solo il NARMA10 del file del corso.'));
  for (const e of document.querySelectorAll('.eq[data-bench]')) e.classList.toggle('lit', e.dataset.bench === S.bench);
}
function drawMemory() {
  if (!mc) { $('mctxt').textContent = tx('computing...', 'calcolo in corso...'); return; }
  drawMC($('mc'), mc);
  const tot = mc.reduce((s, v) => s + v, 0);
  $('mctxt').textContent = tx(`Total memory capacity ${tot.toFixed(1)} over ${mc.length - 1} delays, against the bound N = ${S.N}.`,
    `Capacità di memoria totale ${tot.toFixed(1)} su ${mc.length - 1} ritardi, contro il limite N = ${S.N}.`);
}
function drawComparison() {
  if (!err) return;
  const L = LAB[S.bench];
  drawCompare($('cmp'), { esn: err.te.mse, idnn: net.idnn, rnn: net.rnn, lab: L.mse });
  drawCurves($('curves'), { esn: err.te.mse, idnn: hist.idnn, rnn: hist.rnn });
  $('epoch').textContent = nets ? nets.rnn.epoch : 0;
  $('nets').textContent = tx(`IDNN: window of ${S.d} inputs, ${L.Hi} tanh units; RNN: ${L.Hr} tanh units, BPTT on chunks of 40 steps; Adam, as many epochs as one likes up to 200.`,
    `IDNN: finestra di ${S.d} ingressi, ${L.Hi} unità tanh; RNN: ${L.Hr} unità tanh, BPTT su tratti di 40 passi; Adam, quante epoche si vuole fino a 200.`);
}

// ------------------------------------------------------------------ transport
function setT(v) { S.t = Math.max(0, Math.min(task.y.length - 1, v)); if (!playing) save(); draw(); }
function stopPlay() { playing = false; $('play').textContent = tx('Play', 'Avvia'); save(); }
function play() {
  if (playing) return stopPlay();
  playing = true; $('play').textContent = tx('Pause', 'Pausa'); last = performance.now();
  const frame = now => {
    if (!playing) return;
    const k = Math.max(1, Math.round((now - last) / 1000 * 60)); last = now;
    if (S.t + k >= task.y.length - 1) { setT(task.y.length - 1); return stopPlay(); }
    setT(S.t + k);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function save() {
  history.replaceState(null, '', '#' + new URLSearchParams({ bench: S.bench, N: S.N, rho: S.rho, om: S.om, leak: S.leak, conn: S.conn, wash: S.wash, lam: S.lam, seed: S.seed, t: S.t, d: S.d }));
}

// ----------------------------------------------------------------- controls
const lamText = v => (Number.isInteger(v) ? `1e${v}` : (10 ** v).toExponential(1)).replace('-', '−');
function outputs() {
  $('rhov').textContent = S.rho.toFixed(2); $('omv').textContent = S.om.toFixed(1); $('leakv').textContent = S.leak.toFixed(2);
  $('washv').textContent = S.wash; $('lamv').textContent = lamText(S.lam); $('dv').textContent = S.d;
}
function controls() {
  $('bench').value = S.bench; $('N').value = S.N; $('conn').value = S.conn;
  $('rho').value = S.rho; $('om').value = S.om; $('leak').value = S.leak; $('wash').value = S.wash; $('lam').value = S.lam; $('d').value = S.d;
  outputs();
}
function labSettings() {
  const L = LAB[S.bench];
  Object.assign(S, { N: L.N, rho: L.rho, om: L.om, lam: L.lam, leak: 1, conn: 1, wash: L.N, d: L.d });
  controls();
}
$('bench').onchange = e => { S.bench = e.target.value; labSettings(); invalidate(0); };
$('lab').onclick = () => { labSettings(); invalidate(1); resetNets(); };
$('N').onchange = e => { S.N = +e.target.value; invalidate(1); resetNets(); };
$('conn').onchange = e => { S.conn = +e.target.value; invalidate(1); };
$('seed').onclick = () => { S.seed++; invalidate(1); resetNets(); };
const slider = (id, key, level) => { $(id).oninput = e => { S[key] = +e.target.value; outputs(); invalidate(level); }; };
slider('rho', 'rho', 2); slider('om', 'om', 2); slider('leak', 'leak', 2); slider('wash', 'wash', 3); slider('lam', 'lam', 4);
$('d').oninput = e => { S.d = +e.target.value; outputs(); resetNets(); drawComparison(); save(); };
$('reset').onclick = () => { stopPlay(); setT(0); };
$('step').onclick = () => { stopPlay(); setT(S.t + 1); };
$('play').onclick = play;
$('train').onclick = trainNets;
$('netreset').onclick = () => { resetNets(); drawComparison(); };
$('series').onclick = e => {
  const r = $('series').getBoundingClientRect(), y = e.clientY - r.top;
  if (overview && y < 56) { const s = overview(e.clientX - r.left); if (s !== null) { stopPlay(); setT(s); } }
};
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); setT(S.t + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); setT(S.t - 1); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 100); });
onTheme(() => draw());
function words() {
  document.title = tx('Echo State Networks', 'Echo state network');
  for (const op of $('bench').options) op.textContent = tx(...BENCH[op.value].name);
  $('reset').textContent = 'Reset'; $('step').textContent = tx('Step', 'Passo');
  $('play').textContent = playing ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('train').textContent = training ? tx('Pause', 'Pausa') : tx('Train', 'Addestra');
  $('netreset').textContent = tx('New networks', 'Nuove reti');
  $('seed').textContent = tx('New reservoir', 'Nuovo serbatoio');
  $('lab').textContent = tx('Lab settings', 'Valori del lab');
}
onLang(() => { words(); draw(); drawMemory(); });
words();
controls();
dirty = 0;
compute();

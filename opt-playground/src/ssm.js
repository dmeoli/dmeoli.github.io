// Scene Q: state-space models, after Gu, Goel and Ré, S4 (2022), Gu et al.,
// HiPPO (2020), and Gu and Dao, Mamba (2023) (the ideas, rebuilt from the
// equations). Three parts: the same diagonal SSM computed as a recurrence and
// as a convolution, the HiPPO-LegS memory, and a selective SSM trained in the
// page against a time-invariant one.

import { discretize, scan, kernel, convolve, signal, legsScan, reconstruct, history, createRun, forward } from './ssm-model.js';
import { drawPoles, drawKernel, drawScan, drawConv, drawHistory, drawCoefs, drawBasis, drawSequence, drawCurves, SRANGE } from './ssm-views.js';
import { t as tx, onLang, onTheme } from './i18n.js';

const $ = id => document.getElementById(id);
const fmt = v => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(4));

// ---------------------------------------------------------------- part 1
const L1 = 64;
const S1 = { poles: [{ re: -0.12, im: 1.1 }, { re: -0.5, im: 3.2 }, { re: -0.04, im: 0.35 }], modes: 2, lg: -0.7, input: 'pulses', k: 28, sel: -1 };
let geo = null, timer1 = null;
const dt = () => 10 ** S1.lg;

function draw1() {
  const poles = S1.poles.slice(0, S1.modes), D = discretize(poles, dt()), u = signal(S1.input, L1, 3);
  const sc = scan(D, u), K = kernel(D, L1), yc = convolve(K, u);
  const parts = D.map(d => kernel([d], L1)), ys = Math.max(1e-9, ...Array.from(sc.y, Math.abs));
  geo = drawPoles($('poles'), { poles, D, dt: dt(), sel: S1.sel });
  drawKernel($('kern'), { K, parts });
  drawScan($('scan'), { u, y: sc.y, states: sc.states, D, k: S1.k, yscale: ys });
  drawConv($('conv'), { u, K, y: yc, k: S1.k, yscale: ys });
  let e = 0; for (let j = 0; j < L1; j++) e = Math.max(e, Math.abs(sc.y[j] - yc[j]));
  $('same').innerHTML = tx(
    `y<sub>${S1.k}</sub> by the scan <b>${fmt(sc.y[S1.k])}</b>, by the convolution <b>${fmt(yc[S1.k])}</b>; the largest difference over the ${L1} steps is <b>${e.toExponential(1)}</b>, the rounding of the arithmetic.`,
    `y<sub>${S1.k}</sub> dalla scansione <b>${fmt(sc.y[S1.k])}</b>, dalla convoluzione <b>${fmt(yc[S1.k])}</b>; la differenza massima sui ${L1} passi è <b>${e.toExponential(1)}</b>, l'arrotondamento dell'aritmetica.`);
  $('k1').textContent = S1.k;
  $('dtv').textContent = dt().toFixed(dt() < 0.1 ? 3 : 2);
}
function stop1() { clearInterval(timer1); timer1 = null; $('play1').textContent = tx('Play', 'Avvia'); }
function step1() { S1.k = Math.min(L1 - 1, S1.k + 1); draw1(); if (S1.k === L1 - 1) stop1(); }
$('modes').onchange = e => { S1.modes = +e.target.value; draw1(); };
$('dt').oninput = e => { S1.lg = +e.target.value; draw1(); };
$('input').onchange = e => { S1.input = e.target.value; draw1(); };
$('reset1').onclick = () => { stop1(); S1.k = 0; draw1(); };
$('step1').onclick = () => { stop1(); step1(); };
$('play1').onclick = () => {
  if (timer1) return stop1();
  if (S1.k >= L1 - 1) S1.k = 0;
  $('play1').textContent = tx('Pause', 'Pausa');
  timer1 = setInterval(step1, 600);
};
// dragging a pole, in the s-plane or in the disc
const at = (cv, e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
let drag = null;
const capture = (cv, e) => { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic event */ } };
function nearest(x, y) {
  const side = geo.side(x), D = discretize(S1.poles.slice(0, S1.modes), dt());
  let best = -1, bd = 18;
  S1.poles.slice(0, S1.modes).forEach((p, n) => {
    const [px, py] = side === 's' ? geo.sPos(p) : geo.zPos(D[n]);
    for (const [qx, qy] of [[px, py], [px, 2 * (side === 's' ? geo.sPos({ re: 0, im: 0 })[1] : geo.zPos({ zr: 0, zi: 0 })[1]) - py]]) {
      const d = Math.hypot(qx - x, qy - y); if (d < bd) { bd = d; best = n; }
    }
  });
  return best < 0 ? null : { n: best, side };
}
function moveTo(x, y) {
  const p = S1.poles[drag.n];
  if (drag.side === 's') {
    const s = geo.toS(x, y);
    p.re = Math.max(SRANGE.re0, Math.min(-0.01, s.re)); p.im = Math.min(SRANGE.im, Math.abs(s.im));
  } else {
    const z = geo.toZ(x, y), r = Math.max(0.02, Math.min(0.995, Math.hypot(z.re, z.im)));
    p.re = Math.max(SRANGE.re0 * 4, Math.log(r) / dt()); p.im = Math.abs(Math.atan2(z.im, z.re)) / dt();
  }
  draw1();
}
$('poles').onpointerdown = e => { const h = nearest(...at($('poles'), e)); if (!h) return; drag = h; S1.sel = h.n; capture($('poles'), e); moveTo(...at($('poles'), e)); };
$('poles').onpointermove = e => {
  if (drag) return moveTo(...at($('poles'), e));
  const h = nearest(...at($('poles'), e)), s = h ? h.n : -1;
  $('poles').style.cursor = h ? 'grab' : 'crosshair';
  if (s !== S1.sel) { S1.sel = s; draw1(); }
};
$('poles').onpointerup = $('poles').onpointercancel = () => { drag = null; };
$('poles').onpointerleave = () => { if (!drag && S1.sel >= 0) { S1.sel = -1; draw1(); } };

// ---------------------------------------------------------------- part 2
const M2 = 400;
const S2 = { N: 8, kind: 'smooth', seed: 1, k: 300 };
let u2 = history(S2.kind, M2, S2.seed), X2 = null, timer2 = null, hgeo = null;
function recompute2() { X2 = legsScan(u2, S2.N); }
function draw2() {
  const k = S2.k, t = k / M2, x = X2[k - 1], rec = reconstruct(x, t, k);
  let e = 0, s = 0; for (let g = 0; g < k; g++) { e += (rec[g] - u2[g]) ** 2; s += u2[g] ** 2; }
  hgeo = drawHistory($('hist'), { u: u2, k, rec });
  drawCoefs($('coef'), x);
  drawBasis($('basis'), { t, N: S2.N });
  $('herr').innerHTML = tx(
    `${S2.N} numbers hold the ${k} samples read up to t = ${t.toFixed(2)}; the error of the reconstruction is <b>${(100 * Math.sqrt(e / Math.max(s, 1e-12))).toFixed(1)}%</b> of the norm of the input.`,
    `${S2.N} numeri tengono i ${k} campioni letti fino a t = ${t.toFixed(2)}; l'errore della ricostruzione è il <b>${(100 * Math.sqrt(e / Math.max(s, 1e-12))).toFixed(1)}%</b> della norma dell'ingresso.`);
  $('tt').textContent = t.toFixed(2);
  $('Nv').textContent = S2.N;
}
function stop2() { clearInterval(timer2); timer2 = null; $('play2').textContent = tx('Play', 'Avvia'); }
function step2(n = 8) { S2.k = Math.min(M2, S2.k + n); draw2(); if (S2.k === M2) stop2(); }
$('N').oninput = e => { S2.N = +e.target.value; recompute2(); draw2(); };
$('hkind').onchange = e => { S2.kind = e.target.value; u2 = history(S2.kind, M2, S2.seed); recompute2(); draw2(); };
$('hnew').onclick = () => { S2.seed++; u2 = history(S2.kind, M2, S2.seed); recompute2(); draw2(); };
$('reset2').onclick = () => { stop2(); S2.k = 8; draw2(); };
$('step2').onclick = () => { stop2(); step2(); };
$('play2').onclick = () => {
  if (timer2) return stop2();
  if (S2.k >= M2) S2.k = 8;
  $('play2').textContent = tx('Pause', 'Pausa');
  // 2 samples every 40 ms: t sweeps [0, 1] in 8 s
  timer2 = setInterval(() => step2(2), 40);
};
// drawing the input: a soft brush around the pointer
let painting = false, lastP = null;
function paint(e) {
  const [x, y] = at($('hist'), e), s = hgeo.toS(x), v = hgeo.toV(y), j = Math.round(s * M2 - 1);
  const from = lastP == null ? j : lastP;
  for (let q = Math.min(from, j); q <= Math.max(from, j); q++) for (let d = -6; d <= 6; d++) {
    const i = q + d; if (i < 0 || i >= M2) continue;
    const w = Math.exp(-(d * d) / 12); u2[i] += w * (v - u2[i]);
  }
  lastP = j; recompute2(); draw2();
}
$('hist').onpointerdown = e => { painting = true; lastP = null; capture($('hist'), e); paint(e); };
$('hist').onpointermove = e => { if (painting) paint(e); };
$('hist').onpointerup = $('hist').onpointercancel = () => { painting = false; lastP = null; };

// ---------------------------------------------------------------- part 3
const S3 = { L: 16, DN: '4,4', lr: 0.01, seed: 1, q: 0 };
let run = null, raf = null;
function reset3() {
  stop3();
  const [D, N] = S3.DN.split(',').map(Number);
  run = createRun({ L: S3.L, D, N, lr: S3.lr, seed: S3.seed });
  S3.q = 0; draw3();
}
function draw3() {
  const s = run.test[S3.q % run.test.length];
  const F = { sel: forward(run.models.sel, s.xs, s.y), lti: forward(run.models.lti, s.xs, s.y) };
  for (const k of ['sel', 'lti']) { F[k].D = run.models[k].D; F[k].N = run.models[k].N; }
  drawSequence($('seqv'), { seq: s, F });
  drawCurves($('acc3'), run.hist, 'acc', run.epoch);
  drawCurves($('loss3'), run.hist, 'loss', run.epoch);
  const a = run.hist.sel.at(-1).acc, b = run.hist.lti.at(-1).acc, pct = v => `${(100 * v).toFixed(0)}%`;
  $('rep').textContent = tx(
    `After ${run.epoch} steps of Adam (${run.epoch * 4} minibatches of 32 fresh sequences) the selective model names the color after the marker in ${pct(a)} of the test sequences, the time-invariant one in ${pct(b)}; naming the color seen most often gives ${pct(run.majority)}, chance 25%.`,
    `Dopo ${run.epoch} passi di Adam (${run.epoch * 4} minibatch di 32 sequenze nuove) il modello selettivo indica il colore dopo il marcatore nel ${pct(a)} delle sequenze di test, quello tempo-invariante nel ${pct(b)}; indicare il colore visto più spesso dà il ${pct(run.majority)}, la scelta a caso il 25%.`);
  $('ep').textContent = run.epoch;
}
function stop3() { if (raf) cancelAnimationFrame(raf); raf = null; $('play3').textContent = tx('Play', 'Avvia'); }
function step3() { run.trainStep(); run.measure(); draw3(); }
function frame() {
  const t0 = performance.now();
  do run.trainStep(); while (performance.now() - t0 < 24);
  run.measure(); draw3();
  raf = requestAnimationFrame(frame);
}
$('L').onchange = e => { S3.L = +e.target.value; reset3(); };
$('DN').onchange = e => { S3.DN = e.target.value; reset3(); };
$('lr').onchange = e => { S3.lr = run.lr = +e.target.value; };
$('seed').onchange = e => { S3.seed = +e.target.value; reset3(); };
$('reset3').onclick = reset3;
$('step3').onclick = () => { stop3(); step3(); };
$('play3').onclick = () => {
  if (raf) return stop3();
  $('play3').textContent = tx('Pause', 'Pausa');
  raf = requestAnimationFrame(frame);
};
$('seqv').onclick = () => { S3.q++; draw3(); };

// ---------------------------------------------------------------- language, theme, size
const OPTS = {
  input: { pulses: ['pulses', 'impulsi'], impulse: ['impulse', 'impulso unitario'], step: ['step', 'gradino'], noise: ['noise', 'rumore'] },
  hkind: { smooth: ['smooth', 'liscio'], steps: ['steps', 'a gradini'] },
};
function words() {
  document.title = tx('State-Space Models', 'Modelli a spazio di stato');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  for (const n of ['1', '2', '3']) { $('reset' + n).textContent = tx('Reset', 'Ricomincia'); $('step' + n).textContent = tx('Step', 'Passo'); }
  $('play1').textContent = timer1 ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('play2').textContent = timer2 ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('play3').textContent = raf ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('hnew').textContent = tx('New input', 'Nuovo ingresso');
}
function drawAll() { draw1(); draw2(); if (run) draw3(); }
onLang(() => { words(); drawAll(); });
onTheme(drawAll);
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawAll, 100); });

$('modes').value = S1.modes; $('dt').value = S1.lg; $('input').value = S1.input;
$('N').value = S2.N; $('hkind').value = S2.kind;
$('L').value = S3.L; $('DN').value = S3.DN; $('lr').value = String(S3.lr); $('seed').value = S3.seed;
words();
recompute2();
draw1(); draw2(); reset3();

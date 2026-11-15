// Scene J: inside a recurrent network with LSTM cells, after C. Olah,
// "Understanding LSTM Networks" (2015),
// https://colah.github.io/posts/2015-08-Understanding-LSTMs/ (the idea, rebuilt
// from the equations; no figure or code of the post is used).
// An LSTM, a GRU (K. Cho et al., 2014) and a plain tanh RNN of the same size
// are trained together, with Adam on the same minibatches, on toy tasks generated in the page; the chain
// of cells, the heat maps and the gradients are drawn from the real values.

import { forward, rng, argmax } from './lstm-net.js';
import { createRun } from './lstm-run.js';
import { TASKS, sample } from './lstm-tasks.js';
import { drawChain, drawHeat, drawLoss, drawGrad } from './lstm-views.js';
import { t as tx, onLang, onTheme } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { task: 'first', T: 20, H: 6, lr: 0.005, show: 'lstm', seed: 2, seq: 1, t: 20 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
if (!TASKS[S.task]) S.task = 'first';
S.T = Math.max(5, Math.min(40, Math.round(S.T) || 20));
if (![4, 6, 8].includes(S.H)) S.H = 6;
if (!['gru', 'rnn'].includes(S.show)) S.show = 'lstm';

// the names of the tasks in Italian (src/lstm-tasks.js has the English ones)
const NAME_IT = { first: 'il primo bit', depth: 'la profondità di annidamento', count: 'il numero di uni' };

let run, seq, timer = null, part = null, chainHits = [], heat = null;

function reset() {
  stopTrain();
  run = createRun({ task: S.task, T: S.T, H: S.H, lr: S.lr, seed: S.seed });
  newSeq(); save(); draw();
}
function newSeq() { seq = sample(S.task, S.T, rng(S.seq * 7919 + S.T)); S.t = Math.min(Math.max(1, S.t), S.T); }

function draw() {
  const kind = S.show, net = run.nets[kind], H = S.H, t = S.t - 1;
  const F = forward(net, seq.xs, seq.outs), preds = {};
  seq.outs.forEach((o, q) => { preds[o.t] = { y: o.y, p: argmax(F.P[q]) }; });
  chainHits = drawChain($('chain'), { kind, F, H, seq, t, part, preds });
  heat = drawHeat($('heat'), { kind, F, H, seq, t, part });
  drawLoss($('loss'), run.hist, Math.log(run.K), run.epoch);
  drawGrad($('grad'), run.grads, t);
  // the means of the gates and states at step t, beside the equations
  const R = net.R, mean = f => { let s = 0; for (let j = 0; j < H; j++) s += f(j); return (s / H).toFixed(2); };
  if (kind === 'lstm') {
    ['f', 'i', 'g', 'o'].forEach((p, k) => { $('v' + p).textContent = mean(j => F.a[t * R + k * H + j]); });
    $('vc').textContent = mean(j => F.c[(t + 1) * H + j]);
    $('vh').textContent = mean(j => F.h[(t + 1) * H + j]);
  } else if (kind === 'gru') {
    ['z', 'rs', 'n'].forEach((p, k) => { $('v' + p).textContent = mean(j => F.a[t * R + k * H + j]); });
    $('vgh').textContent = mean(j => F.h[(t + 1) * H + j]);
  } else $('vr').textContent = mean(j => F.h[(t + 1) * H + j]);
  for (const k of ['lstm', 'gru', 'rnn']) for (const e of document.querySelectorAll(`.${k}-only`)) e.hidden = kind !== k;
  for (const e of document.querySelectorAll('.eq')) e.classList.toggle('lit', !!part && e.dataset.part === part && !e.hidden);
  $('eqt').textContent = S.t;
  $('where').textContent = S.task === 'depth' ? tx('at every step', 'a ogni passo') : tx('at the last step only', "solo all'ultimo passo");
  const L = run.hist.lstm.at(-1), Gr = run.hist.gru.at(-1), Rn = run.hist.rnn.at(-1), pct = v => `${(100 * v).toFixed(0)}%`;
  const name = tx(TASKS[S.task].name, NAME_IT[S.task]);
  $('rep').textContent = `${name[0].toUpperCase() + name.slice(1)}` + tx(
    `${S.task === 'depth' ? ' at every step' : ` after ${S.T} steps`}: the LSTM answers ${pct(L.acc)} of the test outputs right, ` +
    `the GRU ${pct(Gr.acc)}, the plain RNN ${pct(Rn.acc)}, a constant answer ${pct(run.baseline)}.`,
    `${S.task === 'depth' ? ' a ogni passo' : ` dopo ${S.T} passi`}: la LSTM risponde giusto sul ${pct(L.acc)} delle uscite di test, ` +
    `la GRU sul ${pct(Gr.acc)}, la RNN semplice sul ${pct(Rn.acc)}, una risposta costante sul ${pct(run.baseline)}.`);
  $('epoch').textContent = run.epoch;
  $('Tv').textContent = S.T;
  $('t').max = S.T; $('t').value = S.t; $('tv').textContent = `${S.t} / ${S.T}`;
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams({ task: S.task, T: S.T, H: S.H, lr: S.lr, show: S.show, seed: S.seed, seq: S.seq, t: S.t })); }
function stopTrain() { clearInterval(timer); timer = null; $('train').textContent = tx('Play', 'Avvia'); }
function step() { run.trainEpoch(); run.measure(); draw(); }
function train() {
  if (timer) return stopTrain();
  $('train').textContent = tx('Pause', 'Pausa');
  timer = setInterval(() => {
    const t0 = performance.now();
    for (let k = 0; k < 8 && (k === 0 || performance.now() - t0 < 30); k++) run.trainEpoch();
    run.measure(); draw();
  }, 40);
}
function setT(v) { S.t = Math.max(1, Math.min(S.T, v)); save(); draw(); }

$('task').value = S.task; $('T').value = S.T; $('H').value = S.H; $('lr').value = String(S.lr); $('show').value = S.show;
if ($('lr').value !== String(S.lr)) { S.lr = 0.005; $('lr').value = '0.005'; }
$('task').onchange = e => { S.task = e.target.value; reset(); };
$('T').oninput = e => { $('Tv').textContent = e.target.value; };
$('T').onchange = e => { S.T = +e.target.value; S.t = S.T; reset(); };
$('H').onchange = e => { S.H = +e.target.value; reset(); };
$('lr').onchange = e => { S.lr = run.lr = +e.target.value; save(); };
$('show').onchange = e => { S.show = e.target.value; part = null; save(); draw(); };
$('reset').onclick = reset;
$('step').onclick = () => { stopTrain(); step(); };
$('train').onclick = train;
$('t').oninput = e => setT(+e.target.value);
$('prev').onclick = () => setT(S.t - 1);
$('next').onclick = () => setT(S.t + 1);
$('seq').onclick = () => { S.seq++; newSeq(); save(); draw(); };
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stopTrain(); step(); }
  if (e.key === ' ') { e.preventDefault(); train(); }
});

// hovering a part of the drawing lights its equation, and the other way round
const at = (cv, e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const hitOf = (hits, x, y) => hits.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
function point(p) { if (p !== part) { part = p; draw(); } }
$('chain').onmousemove = e => { const h = hitOf(chainHits, ...at($('chain'), e)); point(h ? h.part : null); };
$('chain').onclick = e => { const h = hitOf(chainHits, ...at($('chain'), e)); if (h) setT(h.step + 1); };
$('heat').onmousemove = e => { const h = hitOf(heat.hits, ...at($('heat'), e)); point(h ? h.part : null); };
$('heat').onclick = e => { const s = heat.step(at($('heat'), e)[0]); if (s >= 0 && s < S.T) setT(s + 1); };
for (const cv of [$('chain'), $('heat')]) cv.onmouseleave = () => point(null);
for (const e of document.querySelectorAll('.eq')) { e.onmouseenter = () => point(e.dataset.part); e.onmouseleave = () => point(null); }
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 100); });
onTheme(() => { if (run) draw(); });
// the texts of the language: the title, the options of the selects, the buttons
const OPTS = {
  task: { first: ['Remember the first bit', 'Ricorda il primo bit'], depth: ['Bracket depth', 'Profondità delle parentesi'], count: ['Count the ones', 'Conta gli uni'] },
  show: { lstm: ['LSTM', 'LSTM'], gru: ['GRU', 'GRU'], rnn: ['plain RNN', 'RNN semplice'] },
};
function words() {
  document.title = tx('LSTM playground', 'Laboratorio LSTM');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  $('reset').textContent = tx('Reset', 'Reset'); $('step').textContent = tx('Step', 'Passo');
  $('train').textContent = timer ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('seq').textContent = tx('New sequence', 'Nuova sequenza');
  $('prev').setAttribute('aria-label', tx('previous step', 'passo precedente'));
  $('next').setAttribute('aria-label', tx('next step', 'passo successivo'));
}
onLang(() => { words(); if (run) draw(); });
words();
reset();

// Scene K: what happens inside attention, after C. Olah and S. Carter,
// "Attention and Augmented Recurrent Neural Networks" (Distill, 2016),
// https://distill.pub/2016/augmented-rnns/, and the transformer of Vaswani et
// al., "Attention Is All You Need" (2017); the ideas only, rebuilt from the
// equations (no figure or code of theirs is used).
// A transformer of 1 or 2 layers (src/attention-model.js) is trained with Adam
// on toy tasks generated in the page (src/attention-tasks.js); every head
// computes softmax(Q K^T / sqrt(d_k)) V, and the views (src/attention-views.js)
// show its attention matrices, the lines from each prediction to the tokens
// it reads, and q, k, v and the scores of one query.

import { createModel } from './attention-model.js';
import { VOCAB, randomPrompt, answer, example, generate, evaluate, trainStep } from './attention-tasks.js';
import { palette, label, exampleLayout, drawExample, bigLayout, drawBig, thumbsLayout, drawThumbs, qkvHeight, qkvPart, drawQKV, drawCurves } from './attention-views.js';
import { rng } from './nn.js';

const $ = id => document.getElementById(id);
const D = 24, MAXSTEPS = 4000;
const S = { task: 'reverse', n: 6, layers: 1, heads: 2, causal: 1, ln: 1, lr: 0.003, seed: 1, x: '' };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });

let M, r, evalSet, hist, steps, trainMs, timer = null, prompt, gen, lit = null;
const sel = { layer: 0, head: 0, query: 0 };

function reset() {
  stop();
  M = createModel({ vocab: VOCAB, T: 16, d: D, layers: S.layers, heads: S.heads, hidden: 2 * D, ln: !!S.ln, seed: S.seed });
  r = rng(S.seed * 104729 + 1);
  const er = rng(4242 + S.n);
  evalSet = Array.from({ length: 200 }, () => example(S.task, S.n, er));
  hist = []; steps = 0; trainMs = 0;
  sel.layer = S.layers - 1; sel.head = 0;
  prompt = parsePrompt(S.x) || randomPrompt(S.task, S.n, rng(S.seed + 77));
  record(); refresh();
}

// the digits typed by the reader, if they make a prompt of the task
function parsePrompt(s) {
  const xs = [...(s || '')].filter(c => c >= '0' && c <= '9').map(Number);
  if (S.task !== 'recall') return xs.length === S.n ? xs : null;
  const a = xs.slice(0, S.n);
  return xs.length === S.n + 1 && new Set(a).size === S.n && answer('recall', xs)[0] >= 0 ? xs : null;
}
const showPrompt = xs => (S.task === 'recall' ? `${xs.slice(0, -1).join(' ')} | ${xs.at(-1)}` : xs.join(' '));

function record() {
  const e = evaluate(M, evalSet, !!S.causal);
  hist.push({ step: steps, acc: e.acc, loss: e.loss });
}
function step1() {
  const t0 = performance.now();
  trainStep(M, S.task, S.n, !!S.causal, S.lr, r);
  steps++;
  if (steps % 20 === 0) record();
  trainMs += performance.now() - t0;
}

// the example is generated again after every change of the weights
function refresh() {
  gen = generate(M, S.task, prompt, !!S.causal);
  if (!gen.preds.some(p => p.pos === sel.query)) sel.query = gen.preds[0].pos;
  draw();
}

function draw() {
  const pal = palette(), P = S.causal ? 0 : gen.prompt, n = gen.tokens.length;
  drawExample($('example'), gen, sel, pal);
  drawBig($('big'), gen, sel, P, pal);
  const th = $('thumbs'), h = thumbsLayout(th, S.layers, S.heads).height;
  if (th.height !== h) th.height = h;
  drawThumbs(th, gen, sel, P, pal);
  const q = $('qkv'), qh = qkvHeight(n);
  if (q.height !== qh) q.height = qh;
  drawQKV(q, gen, sel, M, P, lit, pal);
  drawCurves($('curves2'), hist, pal);
  const last = hist.at(-1), ok = gen.preds.every(p => p.token === p.target);
  $('status').textContent = `Token accuracy ${(100 * last.acc).toFixed(1)}% on 200 held-out examples (teacher forcing), loss ${last.loss.toFixed(3)}, after ${steps} steps of Adam (${(trainMs / 1000).toFixed(1)} s of training)` +
    (S.task === 'recall' && S.layers === 1 ? '; with one layer the query cannot reach the token after its earlier copy.' : '.');
  $('steps').textContent = steps;
  const pred = gen.preds.map(p => p.token === p.target ? label(p.token) : `<span class="bad">${label(p.token)}</span>`).join(' ');
  $('readout').innerHTML = `prediction <b>${pred}</b> · answer ${answer(S.task, prompt).join(' ')} (${ok ? 'right' : 'wrong'})`;
  if (document.activeElement !== $('prompt')) $('prompt').value = showPrompt(prompt);
}

function save() {
  S.x = prompt ? prompt.join('') : S.x;
  history.replaceState(null, '', '#' + new URLSearchParams(S));
}
function stop() { clearTimeout(timer); timer = null; $('train').textContent = 'Play'; }
function frame() {
  const t0 = performance.now();
  do step1(); while (performance.now() - t0 < 40 && steps < MAXSTEPS);
  refresh();
  if (steps >= MAXSTEPS) return stop();
  timer = setTimeout(frame, 0);
}
function train() {
  if (timer) return stop();
  $('train').textContent = 'Pause';
  timer = setTimeout(frame, 0);
}
function step() { if (timer) stop(); step1(); refresh(); }

// ------------------------------------------------------------- controls
for (const k of ['task', 'n', 'layers', 'heads', 'causal', 'ln', 'lr']) {
  $(k).value = S[k];
  $(k).onchange = e => {
    S[k] = k === 'task' ? e.target.value : +e.target.value;
    if (k === 'task' || k === 'n') S.x = '';
    if (k === 'task' && S.task === 'recall' && S.layers < 2) { S.layers = 2; $('layers').value = 2; }
    reset(); save();
  };
}
$('reset').onclick = () => { S.seed++; reset(); save(); };
$('step').onclick = step;
$('train').onclick = train;
$('random').onclick = () => { prompt = randomPrompt(S.task, S.n, Math.random); save(); refresh(); };
$('prompt').oninput = e => {
  const xs = parsePrompt(e.target.value);
  if (xs) { prompt = xs; save(); refresh(); }
  else $('readout').textContent = S.task === 'recall'
    ? `type ${S.n} distinct digits and then one of the first ${S.n - 1} of them`
    : `type ${S.n} digits`;
};
$('prompt').onblur = () => draw();
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); step(); }
  if (e.key === ' ') { e.preventDefault(); train(); }
});

// ------------------------------------------------------------- pointer
const pos = (e, cv) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
const setLit = v => { if (lit === v) return; lit = v; v ? $('fig-qkv').dataset.lit = v : delete $('fig-qkv').dataset.lit; };
function pickQuery(i) {
  if (gen.preds.some(p => p.pos === i) && i !== sel.query) { sel.query = i; draw(); }
}
$('example').onmousemove = e => { const [x] = pos(e, e.target); pickQuery(exampleLayout(e.target, gen.tokens.length).hit(x)); setLit('a'); };
$('big').onmousemove = e => {
  const [x, y] = pos(e, e.target), Lo = bigLayout(e.target, gen.tokens.length);
  pickQuery(Lo.row(y)); setLit(Lo.col(x) >= 0 ? 'a' : 'q');
};
$('thumbs').onclick = e => {
  const [x, y] = pos(e, e.target), h = thumbsLayout(e.target, S.layers, S.heads).hit(x, y);
  if (h) { sel.layer = h.layer; sel.head = h.head; draw(); }
};
$('qkv').onmousemove = e => {
  const [x, y] = pos(e, e.target), v = qkvPart(e.target, D / S.heads, gen.tokens.length, x, y);
  if (v !== lit) { setLit(v); draw(); }
};
// a tap on a touch screen selects as the pointer does
for (const id of ['example', 'big', 'qkv']) $(id).onpointerdown = e => $(id).onmousemove(e);
for (const id of ['example', 'big', 'qkv']) $(id).onmouseleave = () => { setLit(null); draw(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());

reset();
save();

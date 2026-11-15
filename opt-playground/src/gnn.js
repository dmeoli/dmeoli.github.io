// Scene L: what happens in message passing, round by round, after Gilmer et
// al., "Neural Message Passing for Quantum Chemistry" (2017), the graph
// convolutional network of Kipf and Welling (2017), the sum aggregation and
// the 1-WL bound of Xu et al. (2019), and the literal-clause graph of NeuroSAT
// (Selsam et al., 2019); the ideas only, rebuilt from the equations.
// The network (src/gnn-model.js) is trained with Adam on graphs generated in
// the page (src/gnn-tasks.js); the views (src/gnn-views.js) colour every node
// by its state at the chosen round and show the messages into one node.

import { createModel, forward, incoming } from './gnn-model.js';
import { TASKS, argmax, PAIRS } from './gnn-tasks.js';
import { palette, project, createLayout, nodeRadius, drawGraph, drawStrips, stripsHeight, stripRow, drawCurves } from './gnn-views.js';
import { rng } from './nn.js';
import { setTex } from './tex.js';

const $ = id => document.getElementById(id);
const S = { task: 'community', agg: 'gcn', K: 3, H: 12, lr: 0.01, comm: 2, lab: 2, pair: 'ring', g: 1, seed: 1, k: 3, v: -1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
if (!TASKS[S.task]) S.task = 'community';
if (!['gcn', 'gin'].includes(S.agg)) S.agg = 'gcn';
S.K = Math.max(1, Math.min(6, Math.round(S.K) || 3));
if (![8, 12, 16].includes(S.H)) S.H = 12;
if (![2, 3].includes(S.comm)) S.comm = 2;
if (![1, 2, 3].includes(S.lab)) S.lab = 2;
if (!PAIRS[S.pair]) S.pair = 'ring';
S.k = Math.max(0, Math.min(S.K, Math.round(S.k)));
S.v = Number.isFinite(S.v) ? Math.round(S.v) : -1;

const MAXSTEPS = { community: 300, clauses: 1500, triangles: 2000 };
// at most this many steps per frame, so that the fast task can be watched
const PERFRAME = { community: 2, clauses: 50, triangles: 50 };
const EVERY = { community: 5, clauses: 20, triangles: 20 };
let T, D, M, r, hist, steps, trainMs, timer = null, L, proj = null, ev, vw, hover = -1, lit = null, drag = -1, raf = 0;

function reset() {
  stop();
  T = TASKS[S.task];
  D = T.build(S);
  M = createModel({ F: D.F, H: S.H, K: S.K, C: D.C, agg: S.agg, level: T.level, seed: S.seed });
  r = rng(S.seed * 104729 + 1);
  hist = []; steps = 0; trainMs = 0; proj = null;
  hover = S.v >= 0 && S.v < D.display.N ? S.v : -1;
  const cv = $('graph');
  cv.height = S.task === 'triangles' ? 320 : 460;
  L = createLayout(D.display, cv.width, cv.height, S.g);
  record(); draw();
}

function record() {
  ev = T.evaluate(M, D); vw = null;
  hist.push({ step: steps, acc: ev.acc, loss: ev.loss, ...(ev.acc2 !== undefined ? { acc2: ev.acc2 } : {}) });
}
function step1() {
  const t0 = performance.now();
  T.step(M, D, r, S.lr);
  steps++;
  trainMs += performance.now() - t0;
  if (steps % EVERY[S.task] === 0) record();
}

// ------------------------------------------------------------- drawing
const pct = v => `${(100 * v).toFixed(1)}%`;
function wrongSet(R) {
  const w = new Set(), g = D.display;
  if (S.task === 'community') for (const v of g.test) { if (argmax(R.P, v, D.C) !== g.y[v]) w.add(v); }
  if (S.task === 'clauses') g.nodes.forEach((n, v) => { if (n.kind === 'clause' && argmax(R.P, v, 2) !== n.y) w.add(v); });
  return w;
}

// the messages into the hovered node at the update that gives round k
function update(R, v) {
  const k = Math.max(1, S.k), H = S.H, inc = incoming(D.display, S.agg), W = M.W[k - 1].data;
  const hk = R.h[k - 1], msgs = inc[v].map(([u, c]) => {
    const m = new Float64Array(H), Wm = new Float64Array(H);
    for (let i = 0; i < H; i++) m[i] = c * hk[u * H + i];
    for (let j = 0; j < H; j++) for (let i = 0; i < H; i++) Wm[j] += m[i] * W[i * H + j];
    return { u, c, m, n: Math.hypot(...Wm) };
  });
  const tot = msgs.reduce((s, x) => s + x.n, 0) || 1, contrib = new Map();
  for (const x of msgs) contrib.set(x.u, x.n / tot);
  return { k, msgs, tot, contrib, z: R.z[k - 1].subarray(v * H, v * H + H), before: hk.subarray(v * H, v * H + H), after: R.h[k].subarray(v * H, v * H + H) };
}

const nodeName = (v) => {
  const n = D.display.nodes[v];
  if (n.kind === 'lit') return `literal ${n.text}`;
  if (n.kind === 'clause') return `clause ${n.text} (${n.clause.map(l => D.display.nodes[l].text).join(' ∨ ')})`;
  if (S.task === 'triangles') return `node ${v % 6 + 1} of the ${v < 6 ? 'left' : 'right'} graph`;
  return `node ${v + 1}${n.labelled ? `, labelled ${'ABC'[n.y]}` : `, community ${'ABC'[n.y]}`}`;
};

function draw() {
  const pal = palette(), g = D.display;
  // the states and their projection change only with the weights
  if (!vw) {
    vw = T.view(M, D);
    proj = project(D.pcaSet.map(x => (x === g ? vw.R : forward(M, x))), S.K, S.H, proj);
  }
  const R = vw.R;
  const up = hover >= 0 ? update(R, hover) : null;
  const notes = [];
  if (S.task === 'triangles') {
    const names = S.pair === 'ring' ? ['C6', 'two triangles'] : ['K3,3', 'prism'], cv = $('graph');
    vw.parts.forEach((p, i) => notes.push({ x: cv.width * (i ? 0.75 : 0.25), text: `${names[i]}: ${p.y ? 'triangle' : 'none'}, p = ${p.p.toFixed(3)}` }));
  }
  drawGraph($('graph'), { g, L, P: proj[S.k], R, k: S.k, hover, contrib: up ? up.contrib : new Map(), wrong: wrongSet(R), notes }, pal);
  // the strips of the update
  const rows = [];
  if (up) {
    const kk = up.k, sorted = [...up.msgs].sort((a, b) => b.n - a.n).slice(0, 8);
    rows.push({ name: `h_v^(${kk - 1}) before`, vec: up.before, part: 'h' });
    for (const x of sorted) rows.push({ name: `${x.u === hover ? 'self' : 'from ' + shortName(x.u)} ${Math.round(100 * x.n / up.tot)}%`, vec: x.m, part: 'm' });
    rows.push({ name: `z_v (sum)`, vec: up.z, part: 's' });
    rows.push({ name: `h_v^(${kk}) after`, vec: up.after, part: 'o' });
    // one scale for all the rows, so that they can be compared
    const sc = Math.max(0.05, ...rows.flatMap(rw => Array.from(rw.vec, Math.abs)));
    for (const rw of rows) rw.scale = sc;
  }
  // the strips and the curves are drawn at the size they are shown, so that
  // their labels stay readable on a phone
  for (const id of ['strips', 'curves3']) { const w = Math.round($(id).clientWidth) || 560; if ($(id).width !== w) $(id).width = w; }
  const st = $('strips'), sh = rows.length ? stripsHeight(rows.length) : 120;
  if (st.height !== sh) st.height = sh;
  drawStrips(st, rows, lit, pal);
  drawCurves($('curves3'), hist, pal);
  texts(R, up);
}
const shortName = u => { const n = D.display.nodes[u]; return n.kind === 'node' ? (S.task === 'triangles' ? `${u % 6 + 1}` : `${u + 1}`) : n.text; };

function texts(R, up) {
  const last = hist.at(-1), g = D.display;
  $('steps').textContent = steps;
  $('k').max = S.K; $('k').value = S.k; $('kv').textContent = `${S.k} / ${S.K}`;
  $('f-gcn').hidden = S.agg !== 'gcn'; $('f-gin').hidden = S.agg !== 'gin';
  for (const e of document.querySelectorAll('.opt-community')) e.hidden = S.task !== 'community';
  for (const e of document.querySelectorAll('.opt-triangles')) e.hidden = S.task !== 'triangles';
  $('regen').hidden = S.task === 'triangles';
  const time = `after ${last.step} steps of Adam (${(trainMs / 1000).toFixed(1)} s of training)`;
  let st = '', cap = '', ccap = '', leg = '';
  if (S.task === 'community') {
    st = `Accuracy ${pct(last.acc)} on the ${g.test.length} unlabelled nodes of the graph drawn, ${time}; the graph drawn is never trained on, only its ${g.lab.length} labels are used.`;
    cap = `A graph of a stochastic block model (${S.comm} communities of ${S.comm === 2 ? 16 : 14} nodes, an edge with probability 0.25 inside a community and 0.02 across); only the framed nodes have a feature, their label (A, B${S.comm === 3 ? ', C' : ''}), the others start from zero. The network is trained on fresh graphs of the same model to guess the unlabelled nodes; a dashed ring marks a wrong guess. Scrub the rounds to see the labels spread; drag a node to move it.`;
    ccap = 'Accuracy (violet) on the unlabelled nodes of the graph drawn and cross-entropy on the same nodes (gold, log scale), against the steps of Adam (4 fresh graphs per step).';
  } else if (S.task === 'clauses') {
    st = `Clauses right ${pct(last.acc)}, falsified clauses found ${pct(last.acc2)}, assignments checked right (every clause of the formula right) ${pct(ev.accF)}, on 200 held-out formulas, ${time}` +
      (S.K === 1 ? '; with one round a clause made only of negated literals cannot know their values.' : '.');
    cap = `A random 3-CNF formula of ${g.n} variables and ${g.m} clauses as its literal-clause graph (circles the literals, squares the clauses, an edge between x and ¬x). A hidden assignment is written on the positive literals only (true or false under them); every clause has to say whether it is satisfied, and the false ones are marked. What is learnt is the OR of the literal values, i.e., the check of a given assignment, not satisfiability, which NeuroSAT learns with many more rounds and much more training.`;
    ccap = 'Accuracy on all the clauses (violet) and on the falsified ones only (dashed), and the weighted cross-entropy (gold, log scale; a false clause weighs 7, since a random 3-clause is false with probability 1/8), on 200 held-out formulas, against the steps of Adam (8 fresh formulas per step).';
    leg = '<span><i style="background:var(--accent)"></i>all clauses</span><span><i class="dash"></i>falsified clauses</span><span><i style="background:var(--gold)"></i>loss</span>';
  } else {
    const pp = vw.parts, same = Math.abs(pp[0].p - pp[1].p) < 1e-9;
    st = `Accuracy ${pct(last.acc)} on 200 held-out random graphs, ${time}; on the pair drawn the network answers p = ${pp[0].p.toFixed(3)} and ${pp[1].p.toFixed(3)}${same ? ', the same number, so that one of the two is wrong whatever the weights' : ''}.` +
      (S.agg === 'gcn' ? ' With the GCN normalisation the coefficients of a node sum to nearly 1 whatever its degree, so that on nodes without features the network sees almost nothing; the sum of GIN counts the neighbours.' : '');
    cap = `Two graphs of 6 nodes, every node of degree ${S.pair === 'ring' ? 2 : 3}, side by side: every node starts from the same vector and receives, in every round, the same multiset of messages, so that the states are identical in every round (the 1-WL test of Xu et al., which bounds every network of this kind), although only one of the two has a triangle. The network is trained to say whether a random graph of 6 to 9 nodes contains a triangle, and reads the mean of the last states.`;
    ccap = 'Accuracy (violet) and cross-entropy (gold, log scale) on 200 held-out random graphs, half with a triangle, against the steps of Adam (16 fresh graphs per step).';
  }
  if (!leg) leg = '<span><i style="background:var(--accent)"></i>accuracy</span><span><i style="background:var(--gold)"></i>loss</span>';
  $('status').textContent = st; $('graphcap').textContent = cap; $('curvecap').textContent = ccap; $('curvelegend').innerHTML = leg;
  setTex($('f-out'), T.level === 'graph'
    ? `\\(\\hat y = \\operatorname{softmax}\\big(W_{\\text{out}}\\,\\tfrac{1}{|V|}\\textstyle\\sum_{v} h_v^{(${S.K})} + b_{\\text{out}}\\big)\\)`
    : `\\(\\hat y_v = \\operatorname{softmax}\\big(W_{\\text{out}}\\, h_v^{(${S.K})} + b_{\\text{out}}\\big)\\), \\(h_v^{(0)} = W_{\\text{in}} x_v + b_{\\text{in}}\\)`);
  // the hovered node
  if (hover < 0) $('readout').innerHTML = `hover a node: its messages light the edges and its update is drawn on the right`;
  else {
    const n = g.nodes[hover], C = D.C, deg = incoming(g, S.agg)[hover].length - 1;
    let pred = '';
    if (T.level === 'node' && (n.kind !== 'lit')) {
      const p = argmax(R.P, hover, C), pp = R.P[hover * C + p];
      pred = S.task === 'community' ? `, guessed ${'ABC'[p]} (${Math.round(100 * pp)}%)` : `, said ${p ? 'satisfied' : 'false'} (${Math.round(100 * pp)}%), ${n.y ? 'satisfied' : 'false'} in fact`;
    }
    const top = up ? [...up.msgs].filter(x => x.u !== hover).sort((a, b) => b.n - a.n)[0] : null;
    $('readout').innerHTML = `<b>${nodeName(hover)}</b>, degree ${deg}${pred}` +
      (up ? `<br>round ${up.k - 1} → ${up.k}: ${Math.round(100 * (up.contrib.get(hover) || 0))}% of the message from itself${top ? `, the largest from ${shortName(top.u)} (${Math.round(100 * top.n / up.tot)}%)` : ''}` : '');
  }
}

// ------------------------------------------------------------- transport
function save() { history.replaceState(null, '', '#' + new URLSearchParams(S)); }
function stop() { clearTimeout(timer); timer = null; $('train').textContent = 'Play'; }
function frame() {
  const t0 = performance.now();
  let n = 0;
  do { step1(); n++; } while (performance.now() - t0 < 40 && n < PERFRAME[S.task] && steps < MAXSTEPS[S.task]);
  vw = null;
  draw();
  if (steps >= MAXSTEPS[S.task]) return stop();
  timer = setTimeout(frame, 0);
}
function train() {
  if (timer) return stop();
  if (steps >= MAXSTEPS[S.task]) return;
  $('train').textContent = 'Pause';
  timer = setTimeout(frame, 0);
}
function step() { if (timer) stop(); step1(); if (hist.at(-1).step !== steps) record(); draw(); }

// ------------------------------------------------------------- controls
for (const k of ['task', 'agg', 'K', 'H', 'lr', 'comm', 'lab', 'pair']) {
  $(k).value = S[k];
  $(k).onchange = e => {
    S[k] = ['task', 'agg', 'pair'].includes(k) ? e.target.value : +e.target.value;
    if (k === 'task') { S.agg = S.task === 'triangles' ? 'gin' : S.task === 'clauses' ? 'gin' : 'gcn'; $('agg').value = S.agg; }
    if (k === 'K' || k === 'task') S.k = S.K;
    if (k === 'task' || k === 'comm' || k === 'pair') S.v = -1;
    if (k === 'lr') { save(); return; }
    reset(); save();
  };
}
$('regen').onclick = () => { S.g++; S.v = -1; reset(); save(); };
$('reset').onclick = () => { S.seed++; reset(); save(); };
$('step').onclick = step;
$('train').onclick = train;
const setK = v => { S.k = Math.max(0, Math.min(S.K, v)); save(); draw(); };
$('k').oninput = e => setK(+e.target.value);
$('prev').onclick = () => setK(S.k - 1);
$('next').onclick = () => setK(S.k + 1);
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'range') return;
  if (e.key === 'ArrowRight' && e.target.type !== 'range') { e.preventDefault(); step(); }
  if (e.key === ' ') { e.preventDefault(); train(); }
});

// ------------------------------------------------------------- pointer
const pos = (e, cv) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
const setLit = v => { if (lit === v) return; lit = v; v ? $('fig-update').dataset.lit = v : delete $('fig-update').dataset.lit; };
function animate() {
  cancelAnimationFrame(raf);
  const go = () => { L.tick(); draw(); if (drag >= 0 || L.alpha > 0.03) raf = requestAnimationFrame(go); };
  raf = requestAnimationFrame(go);
}
const gcv = $('graph');
gcv.onpointerdown = e => {
  const [x, y] = pos(e, gcv), v = L.hit(x, y, nodeRadius(D.display));
  hover = S.v = v; setLit(v >= 0 ? 'm' : null); save();
  if (v >= 0) { drag = v; L.pin = v; L.alpha = Math.max(L.alpha, 0.3); gcv.setPointerCapture(e.pointerId); gcv.classList.add('dragging'); animate(); }
  draw();
};
gcv.onpointermove = e => {
  const [x, y] = pos(e, gcv);
  if (drag >= 0) { L.x[drag] = Math.max(16, Math.min(gcv.width - 16, x)); L.y[drag] = Math.max(16, Math.min(gcv.height - 30, y)); L.alpha = Math.max(L.alpha, 0.3); return; }
  const v = L.hit(x, y, nodeRadius(D.display));
  if (v !== hover && e.pointerType === 'mouse') { hover = v; setLit(v >= 0 ? 'm' : null); draw(); }
};
gcv.onpointerup = gcv.onpointercancel = () => { drag = -1; L.pin = -1; gcv.classList.remove('dragging'); };
gcv.onpointerleave = e => { if (drag < 0 && e.pointerType === 'mouse') { hover = -1; setLit(null); draw(); } };
$('strips').onmousemove = e => {
  if (hover < 0) return;
  const [, y] = pos(e, e.target), i = stripRow(y), rows = 2 + Math.min(8, incoming(D.display, S.agg)[hover].length) + 1;
  const part = i <= 0 ? 'h' : i < rows - 2 ? 'm' : i === rows - 2 ? 's' : 'o';
  if (part !== lit) { setLit(part); draw(); }
};
$('strips').onmouseleave = () => { setLit(hover >= 0 ? 'm' : null); draw(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 100); });

reset();
save();

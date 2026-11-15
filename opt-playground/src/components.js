// Scene E: a Lagrangian dual that is a sum of components. K independent
// subproblems, each over the integer points of its own polygon, share one
// coupling row sum_k a_k.x_k <= b; relaxed with one multiplier,
//   L(l) = sum_k L_k(l),  L_k(l) = min_{v in P_k} c_k.v + l (a_k.v - b / K).
// The aggregated cutting-plane model keeps cuts of L, the disaggregated one keeps
// cuts of each L_k and sums their minima, which is a better model for the same
// oracle calls; the incremental subgradient moves after each component instead
// of after all of them. The cost of every method is counted in calls to the
// oracle of one component.

import { maxOfMin } from './problems/lagrangian1d.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

// a small random generator with a seed, so that an instance is the same at
// every visit
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// K components, each the integer points of a disc of radius 1.5 to 3
function instance(K, seed) {
  const r = rng(seed), comps = [];
  for (let k = 0; k < K; k++) {
    const R = 1.5 + 1.5 * r(), pts = [];
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++)
      if (x * x + y * y <= R * R) pts.push([x + 3, y + 3]);
    comps.push({ pts, c: [-0.4 - r(), -0.4 - r()], a: [0.3 + r(), 0.3 + r()] });
  }
  // half of what the components would use without the coupling row
  const b = 0.5 * comps.reduce((t, C) => t + Math.max(...C.pts.map(v => dot(C.a, v))), 0);
  return { K, comps, b, lmax: 3 };
}

const instances = {
  k3: { get label() { return t('3 components', '3 componenti'); }, K: 3, seed: 7 },
  k8: { get label() { return t('8 components', '8 componenti'); }, K: 8, seed: 11 },
  k20: { get label() { return t('20 components', '20 componenti'); }, K: 20, seed: 5 },
};

let P, Lstar, lstar, runs, timer = null;

// the oracle of one component: its best point at l and the line of that point
function oracleK(k, l) {
  const C = P.comps[k], sh = P.b / P.K;
  let best = null, bv = Infinity;
  for (const v of C.pts) { const val = dot(C.c, v) + l * (dot(C.a, v) - sh); if (val < bv - 1e-12) { bv = val; best = v; } }
  return { value: bv, slope: dot(C.a, best) - sh, line: { value: dot(C.c, best), slope: dot(C.a, best) - sh } };
}
const L = l => P.comps.reduce((t, _, k) => t + oracleK(k, l).value, 0);

// the maximum over [0, lmax] of sum_k min_j line_kj(l): the candidates are the
// ends and the kinks of each component's model
function maxOfSum(models) {
  const val = l => models.reduce((t, M) => t + Math.min(...M.map(q => q.value + q.slope * l)), 0);
  const cand = [0, P.lmax];
  for (const M of models) for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
    const ds = M[i].slope - M[j].slope;
    if (Math.abs(ds) < 1e-12) continue;
    const l = (M[j].value - M[i].value) / ds;
    if (l > 0 && l < P.lmax) cand.push(l);
  }
  let best = 0, bv = -Infinity;
  for (const l of cand) { const v = val(l); if (v > bv + 1e-12) { bv = v; best = l; } }
  return { lam: best, value: bv };
}

// every method: a state with the current l, the calls spent and the history of
// the best value, one entry per point visited
const methods = {
  aggregated: {
    get name() { return t('Kelley, aggregated', 'Kelley, aggregato'); }, color: 'var(--m1)',
    init: () => ({ l: 0, cuts: [] }),
    step(s) {
      let g = 0, v = 0;
      for (let k = 0; k < P.K; k++) { const o = oracleK(k, s.l); v += o.value; g += o.slope; }
      s.calls += P.K; s.cuts.push({ value: v - g * s.l, slope: g });
      s.record(s.l, v);
      const m = maxOfMin(s.cuts, 0, P.lmax);
      if (m.value - s.best < 1e-7 * (1 + Math.abs(s.best))) s.done = true;
      s.l = m.lam; s.model = m.value;
    },
  },
  disaggregated: {
    get name() { return t('Kelley, disaggregated', 'Kelley, disaggregato'); }, color: 'var(--m2)',
    init: () => ({ l: 0, models: Array.from({ length: P.K }, () => []) }),
    step(s) {
      let v = 0;
      for (let k = 0; k < P.K; k++) { const o = oracleK(k, s.l); v += o.value; s.models[k].push(o.line); }
      s.calls += P.K;
      s.record(s.l, v);
      const m = maxOfSum(s.models);
      if (m.value - s.best < 1e-7 * (1 + Math.abs(s.best))) s.done = true;
      s.l = m.lam; s.model = m.value;
    },
  },
  subgradient: {
    get name() { return t('Subgradient', 'Subgradiente'); }, color: 'var(--m3)',
    init: () => ({ l: 0, k: 0 }),
    step(s, p) {
      let g = 0, v = 0;
      for (let k = 0; k < P.K; k++) { const o = oracleK(k, s.l); v += o.value; g += o.slope; }
      s.calls += P.K;
      s.record(s.l, v);
      s.l = Math.min(P.lmax, Math.max(0, s.l + p.s0 / Math.sqrt(++s.k) * g / P.K));
    },
  },
  incremental: {
    get name() { return t('Incremental subgradient', 'Subgradiente incrementale'); }, color: 'var(--m4)',
    init: () => ({ l: 0, k: 0 }),
    // one cycle per step: K moves, each after one component; the value shown
    // is the true L at the end of the cycle, which the method does not compute
    step(s, p) {
      const a = p.s0 / Math.sqrt(++s.k) / P.K;
      for (let k = 0; k < P.K; k++) {
        const o = oracleK(k, s.l);
        s.l = Math.min(P.lmax, Math.max(0, s.l + a * o.slope));
      }
      s.calls += P.K;
      s.record(s.l, L(s.l));
    },
  },
};

function reset() {
  stop();
  const d = instances[$('inst').value];
  P = instance(d.K, d.seed);
  // the exact maximum: the disaggregated model with every point is L itself
  const all = P.comps.map((C, k) => C.pts.map(v => ({ value: dot(C.c, v), slope: dot(C.a, v) - P.b / P.K })));
  const m = maxOfSum(all);
  Lstar = m.value; lstar = m.lam;
  runs = Object.entries(methods).map(([key, M]) => {
    const s = { key, M, calls: 0, best: -Infinity, done: false, hist: [], ...M.init() };
    s.record = (l, v) => { s.best = Math.max(s.best, v); s.hist.push({ calls: s.calls, l, v, best: s.best }); };
    return s;
  });
  draw();
}

function step() {
  const p = { s0: +$('s0').value };
  let any = false;
  for (const s of runs) if (!s.done && s.calls < 60 * P.K) { s.M.step(s, p); any = true; }
  if (!any) stop();
  draw();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function play() { if (timer) return stop(); $('play').textContent = t('Pause', 'Pausa'); timer = setInterval(step, 400); }

// ------------------------------------------------------------------ drawing
const NS = 'http://www.w3.org/2000/svg';
function el(t, a, p) { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); p.appendChild(e); return e; }

function drawDual() {
  const svg = $('dual'); svg.replaceChildren();
  const W = 460, H = 360, pad = 36, n = 240, ls = Array.from({ length: n + 1 }, (_, i) => P.lmax * i / n);
  const Ls = ls.map(L), lo = Math.min(...Ls), hi = Lstar + 0.25 * (Lstar - lo);
  const X = l => pad + l / P.lmax * (W - 2 * pad), Y = v => H - pad - (Math.min(hi, v) - lo) / (hi - lo) * (H - 2 * pad);
  el('line', { x1: X(0), x2: X(P.lmax), y1: Y(lo), y2: Y(lo), class: 'axis' }, svg);
  el('line', { x1: X(0), x2: X(0), y1: Y(lo), y2: Y(hi), class: 'axis' }, svg);
  for (let t = 0; t <= P.lmax; t++) el('text', { x: X(t), y: H - pad + 16, class: 'lab small', 'text-anchor': 'middle' }, svg).textContent = t;
  const path = f => 'M' + ls.map(l => `${X(l)},${Y(f(l))}`).join('L');
  // the two models, from the runs of Kelley
  const ag = runs.find(s => s.key === 'aggregated'), dg = runs.find(s => s.key === 'disaggregated');
  if (ag.cuts.length) el('path', { d: path(l => Math.min(...ag.cuts.map(q => q.value + q.slope * l))), class: 'model', style: 'stroke: var(--m1)' }, svg);
  if (dg.models[0].length) el('path', { d: path(l => dg.models.reduce((t, M) => t + Math.min(...M.map(q => q.value + q.slope * l)), 0)), class: 'model', style: 'stroke: var(--m2)' }, svg);
  el('path', { d: path(L), class: 'dualfn' }, svg);
  el('line', { x1: X(lstar), x2: X(lstar), y1: Y(lo), y2: Y(Lstar), class: 'grid' }, svg);
  runs.forEach((s, i) => {
    el('circle', { cx: X(s.l), cy: Y(L(s.l)), r: 5 + (3 - i), style: `fill: none; stroke: ${s.M.color}; stroke-width: 2` }, svg);
  });
}

function drawConv() {
  const svg = $('conv'); svg.replaceChildren();
  const W = 460, H = 360, pad = 40, cmax = Math.max(4 * P.K, 1.1 * Math.max(...runs.map(s => s.calls)));
  const gap = v => Math.max(1e-8, (Lstar - v) / (1 + Math.abs(Lstar)));
  const X = c => pad + c / cmax * (W - 2 * pad), Y = g => pad + (-Math.log10(g)) / 8 * (H - 2 * pad);
  el('line', { x1: X(0), x2: X(cmax), y1: Y(1e-8), y2: Y(1e-8), class: 'axis' }, svg);
  el('line', { x1: X(0), x2: X(0), y1: Y(1), y2: Y(1e-8), class: 'axis' }, svg);
  for (let e = 0; e <= 8; e += 2) el('text', { x: pad - 6, y: Y(10 ** -e) + 4, class: 'lab small', 'text-anchor': 'end' }, svg).textContent = `1e-${e}`;
  el('text', { x: W - pad, y: H - pad + 18, class: 'lab small', 'text-anchor': 'end' }, svg).textContent = t('calls to the oracle of a component', "chiamate all'oracolo di una componente");
  runs.forEach((s, i) => {
    if (!s.hist.length) return;
    el('path', { d: 'M' + s.hist.map(h => `${X(h.calls)},${Y(gap(h.best))}`).join('L'), style: `fill: none; stroke: ${s.M.color}; stroke-width: 2` }, svg);
    el('text', { x: pad + 10, y: H - pad - 12 - 16 * (3 - i), class: 'lab small', style: `fill: ${s.M.color}` }, svg).textContent =
      t(`${s.M.name}: ${s.calls} calls, gap ${gap(s.best).toExponential(1)}${s.done ? ' (done)' : ''}`,
        `${s.M.name}: ${s.calls} chiamate, scarto ${gap(s.best).toExponential(1)}${s.done ? ' (finito)' : ''}`);
  });
}

function draw() {
  drawDual(); drawConv();
  $('lstar').textContent = Lstar.toFixed(4);
  document.querySelectorAll('.K').forEach(e => { e.textContent = P.K; });
}

for (const [k, v] of Object.entries(instances)) $('inst').append(new Option(v.label, k));
// the language: the title, the names of the instances, the buttons, the drawings
function texts() {
  document.title = t('Components playground', 'Laboratorio delle componenti');
  for (const o of $('inst').options) o.textContent = instances[o.value].label;
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('step').textContent = t('Step', 'Passo');
}
onLang(() => { texts(); draw(); });
texts();
$('inst').onchange = reset;
$('s0').oninput = () => { $('s0v').textContent = (+$('s0').value).toFixed(2); reset(); };
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const tg = e.target;
  if (tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && tg.type !== 'range')) return;
  if (e.key === 'ArrowRight' && tg.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
$('s0v').textContent = (+$('s0').value).toFixed(2);
reset();

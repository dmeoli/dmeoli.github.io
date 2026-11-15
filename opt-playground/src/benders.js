// Scene D: Benders decomposition. min c y + sum_s p_s Q_s(y), y in [0, Y], with
//   Q_s(y) = min q.x  s.t.  W x >= h_s - T_s y,  x >= 0
//          = max { u.(h_s - T_s y) : W'u <= q, u >= 0 }.
// The dual polygon {W'u <= q, u >= 0} is the same for every scenario: Q_s is the
// maximum of one line per vertex, and every Benders cut is a vertex. Single cut
// or multi-cut (int_BDSlv_CutType) and a trust region (dblTRRadius), as in SMS++.

import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

const P = {
  c: 1.0, Y: 10, q: [3, 2.5], W: [[1, 0.6], [0.4, 1]],     // W rows: the two constraints of x
  scen: [
    { p: 0.5, h: [8, 5], T: [0.9, 0.2] },
    { p: 0.3, h: [3, 9], T: [0.1, 1.0] },
    { p: 0.2, h: [10, 10], T: [0.8, 0.9] },
  ],
};

// the vertices of the dual polygon W'u <= q, u >= 0 (clip a large box)
function dualPolygon() {
  let poly = [[0, 0], [50, 0], [50, 50], [0, 50]];
  const rows = [[P.W[0][0], P.W[1][0], P.q[0]], [P.W[0][1], P.W[1][1], P.q[1]]];   // W'u <= q
  for (const [a, b, h] of rows) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length], fa = a * A[0] + b * A[1] - h, fb = a * B[0] + b * B[1] - h;
      if (fa <= 1e-12) out.push(A);
      if (fa * fb < -1e-18) { const t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
    }
    poly = out;
  }
  return poly;
}
const V = dualPolygon();
const rhs = (s, y) => [s.h[0] - s.T[0] * y, s.h[1] - s.T[1] * y];
// the subproblem of a scenario: its value and the vertex that attains it
function sub(s, y) {
  let best = 0, bv = -Infinity;
  V.forEach((u, k) => { const v = dot(u, rhs(s, y)); if (v > bv) { bv = v; best = k; } });
  return { value: bv, k: best };
}
const F = y => P.c * y + P.scen.reduce((a, s) => a + s.p * sub(s, y).value, 0);
// a cut of scenario s from vertex k: Q_s(y) >= u.(h - T y) = a + b y
const cutOf = (s, k) => ({ a: dot(V[k], s.h), b: -dot(V[k], s.T) });

let mode = 'single', tr = 0, cuts, iters, center, delta, timer = null;

function model(y) {
  if (mode === 'single') return P.c * y + Math.max(...cuts.single.map(k => k.a + k.b * y), -1e9);
  return P.c * y + P.scen.reduce((a, s, i) => a + s.p * Math.max(...cuts.multi[i].map(k => k.a + k.b * y), -1e9), 0);
}
// the master in one variable: the model is convex and piecewise linear, so its
// minimum over an interval is at an end or where two lines of a max cross
function master(lo, hi) {
  const cand = [lo, hi];
  const groups = mode === 'single' ? [cuts.single] : cuts.multi;
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    if (Math.abs(g[i].b - g[j].b) < 1e-12) continue;
    const y = (g[j].a - g[i].a) / (g[i].b - g[j].b);
    if (y > lo && y < hi) cand.push(y);
  }
  let best = lo, bv = Infinity;
  for (const y of cand) { const v = model(y); if (v < bv - 1e-12) { bv = v; best = y; } }
  return { y: best, value: bv };
}

function addCuts(y) {
  const subs = P.scen.map(s => sub(s, y));
  if (mode === 'single') {
    let a = 0, b = 0;
    subs.forEach((r, i) => { const k = cutOf(P.scen[i], r.k); a += P.scen[i].p * k.a; b += P.scen[i].p * k.b; });
    cuts.single.push({ a, b });
  } else subs.forEach((r, i) => cuts.multi[i].push(cutOf(P.scen[i], r.k)));
  return subs;
}

function reset() {
  stop();
  mode = $('cut').value; tr = +$('tr').value;
  cuts = { single: [], multi: P.scen.map(() => []) };
  const y0 = 0.5;
  iters = [{ y: y0, f: F(y0), subs: addCuts(y0) }];
  center = y0; delta = tr || P.Y;
  draw();
}
function step() {
  const lo = tr ? Math.max(0, center - delta) : 0, hi = tr ? Math.min(P.Y, center + delta) : P.Y;
  const m = master(lo, hi), fbest = Math.min(...iters.map(t => t.f));
  if (fbest - m.value < 1e-7 && !(tr && (m.y <= lo + 1e-9 || m.y >= hi - 1e-9) && delta < P.Y)) { stop(); draw(); return; }
  const f = F(m.y), subs = addCuts(m.y);
  // the trust region: the centre moves on a sufficient decrease, the radius
  // doubles when the box is binding
  if (tr) {
    const fc = F(center);
    if (f <= fc - 0.1 * (fc - m.value)) center = m.y;
    if (m.y <= lo + 1e-9 || m.y >= hi - 1e-9) delta = Math.min(P.Y, 2 * delta);
  }
  iters.push({ y: m.y, f, subs, lo, hi });
  draw();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function play() { if (timer) return stop(); $('play').textContent = t('Pause', 'Pausa'); timer = setInterval(step, 700); }

// ------------------------------------------------------------------ drawing
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); p.appendChild(e); return e; };
const scenColor = ['#7338a8', '#b59a45', '#047b7d'];

function drawMaster() {
  const svg = $('master'); svg.replaceChildren();
  const W = 520, H = 400, pad = 40, ys = Array.from({ length: 201 }, (_, i) => i / 200 * P.Y);
  const fv = ys.map(F), lo = Math.min(...fv) - 1, hi = Math.max(...fv);
  const X = y => pad + y / P.Y * (W - pad - 10), Yv = v => H - pad - (v - lo) / (hi - lo) * (H - pad - 14);
  const cp = el('clipPath', { id: 'mclip' }, el('defs', {}, svg)); el('rect', { x: pad, y: 0, width: W, height: H - pad }, cp);
  const g = el('g', { 'clip-path': 'url(#mclip)' }, svg);
  el('line', { x1: pad, x2: W - 10, y1: H - pad, y2: H - pad, class: 'axis' }, svg);
  for (let t = 0; t <= P.Y; t += 2) el('text', { x: X(t), y: H - pad + 16, class: 'tick' }, svg).textContent = t;
  el('text', { x: W - 10, y: H - 6, class: 'lab end' }, svg).textContent = t('y (the master variable)', 'y (la variabile del master)');
  const last = iters.at(-1);
  if (tr && last.lo !== undefined) el('rect', { x: X(last.lo), y: 0, width: X(last.hi) - X(last.lo), height: H - pad, class: 'trbox' }, g);
  el('polyline', { points: ys.map((y, i) => `${X(y)},${Yv(fv[i])}`).join(' '), class: 'truef' }, g);
  el('polyline', { points: ys.map(y => `${X(y)},${Yv(model(y))}`).join(' '), class: 'model' }, g);
  iters.forEach((t, i) => {
    el('circle', { cx: X(t.y), cy: Yv(t.f), r: i === iters.length - 1 ? 6 : 4, class: 'col' }, g);
    el('text', { x: X(t.y) + 6, y: Yv(t.f) - 6, class: 'lab' }, g).textContent = i;
  });
  if (tr) el('circle', { cx: X(center), cy: Yv(F(center)), r: 10, class: 'center' }, g);
}

function drawDual() {
  const svg = $('dualpoly'); svg.replaceChildren();
  const W = 400, pad = 34, span = Math.ceil(Math.max(...V.flat()) * 1.15 + 0.5);
  const X = u => pad + u / span * (W - 2 * pad), Y = u => W - pad - u / span * (W - 2 * pad);
  for (let i = 0; i <= span; i++) {
    el('line', { x1: X(i), x2: X(i), y1: Y(0), y2: Y(span), class: 'grid' }, svg);
    el('line', { y1: Y(i), y2: Y(i), x1: X(0), x2: X(span), class: 'grid' }, svg);
  }
  el('text', { x: W - 8, y: W - 8, class: 'lab end' }, svg).textContent = 'u1';
  el('text', { x: 6, y: 14, class: 'lab' }, svg).textContent = 'u2';
  el('polygon', { points: V.map(u => `${X(u[0])},${Y(u[1])}`).join(' '), class: 'inthull' }, svg);
  // the vertices chosen so far, by scenario, the last iteration ringed
  const last = iters.at(-1);
  V.forEach((u, k) => {
    const used = P.scen.map((_, s) => iters.some(t => t.subs[s].k === k));
    el('circle', { cx: X(u[0]), cy: Y(u[1]), r: 4, class: 'ipt' }, svg);
    used.forEach((on, s) => { if (on) el('circle', { cx: X(u[0]), cy: Y(u[1]), r: 7 + 4 * s, fill: 'none', stroke: scenColor[s], 'stroke-width': 2.5, opacity: last.subs[s].k === k ? 1 : 0.35 }, svg); });
  });
  // the direction h_s - T_s y of each scenario at the last y: the vertex that
  // maximizes it is the one chosen
  P.scen.forEach((s, i) => {
    const d = rhs(s, last.y), n = Math.hypot(...d) || 1, o = [span * 0.12, span * 0.12];
    el('line', { x1: X(o[0]), y1: Y(o[1]), x2: X(o[0]) + d[0] / n * 46, y2: Y(o[1]) - d[1] / n * 46, stroke: scenColor[i], 'stroke-width': 2.5 }, svg);
  });
}

function draw() {
  drawMaster(); drawDual();
  const fb = Math.min(...iters.map(t => t.f)), lb = master(0, P.Y).value;
  $('it').textContent = iters.length - 1; $('ub').textContent = fb.toFixed(4); $('lb').textContent = lb.toFixed(4);
  $('nc').textContent = mode === 'single' ? cuts.single.length : cuts.multi.map(c => c.length).join(' + ');
}

$('cut').onchange = reset; $('tr').oninput = e => { $('trOut').textContent = e.target.value; reset(); };
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const tg = e.target;
  if (tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && tg.type !== 'range')) return;
  if (e.key === 'ArrowRight' && tg.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
// the language: the title, the buttons, the drawings
function texts() {
  document.title = t('Benders playground', 'Laboratorio di Benders');
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('step').textContent = t('Step', 'Passo');
}
onLang(() => { texts(); draw(); });
texts();
reset();

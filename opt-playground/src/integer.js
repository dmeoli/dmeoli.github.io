// Scene B: integer programming in the plane. max c.x over the integer points of
// a polygon; the continuous relaxation is solved exactly (clip the polygon,
// take the best vertex). Branch and bound: every node is a piece of the
// polygon, the tree is linked to the plane. Cuts: the facets of the integer
// hull that separate the current continuous optimum, i.e., the best cuts.

import { hull } from './problems/lagrangian1d.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

// every instance is a set of integer inequalities a.x <= b (and x >= 0), so
// that Gomory cuts stay integer
const instances = {
  classic: { label: 'Textbook: max x + 2y', it: 'Da manuale: max x + 2y', ineq: [[2, 3, 12], [3, -1, 9], [0, 2, 7]], c: [1, 2] },
  knapsack: { label: 'Two knapsack rows', it: 'Due righe di zaino', ineq: [[3, 5, 19], [4, 2, 15]], c: [3, 4] },
  thin: { label: 'Thin polygon', it: 'Poligono sottile', ineq: [[5, -6, 3], [-5, 6, 2], [1, 0, 7]], c: [1, 1.4] },
  // binary: a knapsack row and the bounds x <= 1; the instance of the cover cuts
  binary: { label: 'Binary knapsack: 3x + 4y ≤ 5', it: 'Zaino binario: 3x + 4y ≤ 5', ineq: [[3, 4, 5], [1, 0, 1], [0, 1, 1]], c: [2, 3], span: 1.6, bin: true },
};

function clip(poly, a, b) {           // poly ∩ {a.x <= b}
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], fp = dot(a, P) - b, fq = dot(a, Q) - b;
    if (fp <= 1e-12) out.push(P);
    if (fp * fq < -1e-18) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
  }
  return out;
}
// the polygon of a set of rows a.x <= b, with x >= 0
function polyOf(R) {
  let poly = [[0, 0], [30, 0], [30, 30], [0, 30]];
  for (const [a1, a2, b] of R) poly = clip(poly, [a1, a2], b);
  return poly;
}

// a Gomory fractional cut: at the continuous optimum two rows are active (rows of
// the instance, earlier cuts, or x >= 0); with B their normals and f the
// fractional parts of the row of B^-1 of a fractional coordinate, the cut
// (sum f_j a_j).x <= floor(sum f_j b_j) has integer coefficients, holds for every
// integer point and cuts the optimum off
function gomoryStep() {
  const all = rows.concat([[-1, 0, 0], [0, -1, 0]]), r = lp(polyOf(rows), I.c);
  if (!r || (!frac(r.x[0]) && !frac(r.x[1]))) return false;
  const act = all.filter(([a1, a2, b]) => Math.abs(a1 * r.x[0] + a2 * r.x[1] - b) < 1e-7);
  for (let p = 0; p < act.length; p++) for (let q = p + 1; q < act.length; q++) {
    const B = [act[p], act[q]], det = B[0][0] * B[1][1] - B[0][1] * B[1][0];
    if (Math.abs(det) < 1e-12) continue;
    const inv = [[B[1][1] / det, -B[0][1] / det], [-B[1][0] / det, B[0][0] / det]];   // x = inv (b - s)
    for (const i of [0, 1]) {
      if (!frac(r.x[i])) continue;
      const fr = v => v - Math.floor(v + 1e-12);
      const f = [fr(inv[i][0]), fr(inv[i][1])];
      const a = [f[0] * B[0][0] + f[1] * B[1][0], f[0] * B[0][1] + f[1] * B[1][1]].map(v => Math.round(v * 1e9) / 1e9);
      const rhs = Math.floor(f[0] * B[0][2] + f[1] * B[1][2] + 1e-9);
      if (a[0] * r.x[0] + a[1] * r.x[1] > rhs + 1e-7) {
        rows.push([a[0], a[1], rhs]);
        cuts.push({ a, b: rhs, gomory: true });
        region = polyOf(rows);
        return true;
      }
    }
  }
  return false;
}

// a cover cut, for binary instances: a row a.x <= b with a >= 0 whose items in
// C weigh more than b cannot take them all, so sum_{j in C} x_j <= |C| - 1;
// the minimal covers are tried, the cut is kept if the optimum violates it
function coverStep() {
  if (!I.bin) return false;
  const r = lp(region, I.c);
  if (!r || (!frac(r.x[0]) && !frac(r.x[1]))) return false;
  for (const [a1, a2, b] of I.ineq) {
    if (a1 < 0 || a2 < 0) continue;
    const covers = [[0], [1], [0, 1]].filter(C => C.reduce((t, j) => t + [a1, a2][j], 0) > b + 1e-9)
      .filter(C => C.every(j => C.reduce((t, i) => t + (i === j ? 0 : [a1, a2][i]), 0) <= b + 1e-9));
    for (const C of covers) {
      const a = [C.includes(0) ? 1 : 0, C.includes(1) ? 1 : 0], rhs = C.length - 1;
      if (dot(a, r.x) > rhs + 1e-7 && !cuts.some(k => k.a[0] === a[0] && k.a[1] === a[1] && k.b === rhs)) {
        cuts.push({ a, b: rhs, cover: C });
        region = clip(region, a, rhs);
        return true;
      }
    }
  }
  return false;
}

function lp(poly, c) {
  if (poly.length === 0) return null;
  let best = null, bv = -Infinity;
  for (const p of poly) { const v = dot(c, p); if (v > bv + 1e-12) { bv = v; best = p; } }
  return { x: best, value: bv };
}
const frac = v => Math.abs(v - Math.round(v)) > 1e-7;

let rows = [];
let I, ipts, ihull, mode = 'bb', nodes, open, incumbent, selected, cuts, region, timer = null, rule = 'best';

function reset() {
  stop();
  I = instances[$('inst').value];
  I.poly = polyOf(I.ineq);
  rows = I.ineq.map(r => r.slice());
  const xs = I.poly.map(p => p[0]), ys = I.poly.map(p => p[1]);
  ipts = [];
  for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++)
      if (I.poly.every((P, i) => { const Q = I.poly[(i + 1) % I.poly.length]; return (Q[0] - P[0]) * (y - P[1]) - (Q[1] - P[1]) * (x - P[0]) >= -1e-9; })) ipts.push([x, y]);
  ihull = hull(ipts);
  const r = lp(I.poly, I.c);
  nodes = [{ id: 0, poly: I.poly, sol: r, depth: 0, parent: null, label: 'root', status: 'open' }];
  open = [0]; incumbent = null; selected = 0; cuts = []; region = I.poly;
  draw();
}

// branch and bound: one node per step
function bbStep() {
  if (!open.length) return false;
  open.sort((a, b) => rule === 'best' ? nodes[b].sol.value - nodes[a].sol.value : nodes[b].depth - nodes[a].depth || b - a);
  const id = open.shift(), n = nodes[id];
  selected = id;
  if (!n.sol) { n.status = 'infeasible'; return true; }
  if (incumbent && n.sol.value <= incumbent.value + 1e-9) { n.status = 'pruned (bound)'; return true; }
  const x = n.sol.x, fi = frac(x[0]) ? 0 : frac(x[1]) ? 1 : -1;
  if (fi < 0) { n.status = 'integer'; if (!incumbent || n.sol.value > incumbent.value) incumbent = { x, value: n.sol.value }; return true; }
  n.status = 'branched';
  const v = x[fi], lo = Math.floor(v), hi = lo + 1, e = fi ? [0, 1] : [1, 0];
  for (const [a, b, lab] of [[e, lo, `x${fi + 1} ≤ ${lo}`], [[-e[0], -e[1]], -hi, `x${fi + 1} ≥ ${hi}`]]) {
    const poly = clip(n.poly, a, b), sol = lp(poly, I.c);
    // an empty piece is closed at once
    nodes.push({ id: nodes.length, poly, sol, depth: n.depth + 1, parent: id, label: lab, status: sol ? 'open' : 'infeasible' });
    if (sol) open.push(nodes.length - 1);
  }
  return true;
}

// cuts: a facet of the integer hull violated by the current continuous optimum
function cutStep() {
  const r = lp(region, I.c);
  if (!r || (!frac(r.x[0]) && !frac(r.x[1]))) return false;
  for (let i = 0; i < ihull.length; i++) {
    const P = ihull[i], Q = ihull[(i + 1) % ihull.length], a = [Q[1] - P[1], P[0] - Q[0]], b = dot(a, P);
    if (dot(a, r.x) > b + 1e-7) { cuts.push({ a, b, P, Q }); region = clip(region, a, b); return true; }
  }
  return false;
}

const steps = { bb: () => bbStep(), gomory: () => gomoryStep(), cuts: () => cutStep(), cover: () => coverStep() };
function step() { if (!steps[mode]()) stop(); draw(); }
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function play() { if (timer) return stop(); $('play').textContent = t('Pause', 'Pausa'); timer = setInterval(step, 700); }

// ------------------------------------------------------------------ drawing
const NS = 'http://www.w3.org/2000/svg';
function el(t, a, p) { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); p.appendChild(e); return e; }

function drawPlane() {
  const svg = $('plane'); svg.replaceChildren();
  const W = 460, pad = 30, span = I.span || 8.5, X = x => pad + x / span * (W - 2 * pad), Y = y => W - pad - y / span * (W - 2 * pad);
  const pts = ps => ps.map(p => `${X(p[0])},${Y(p[1])}`).join(' ');
  for (let i = 0; i <= Math.floor(span); i++) {
    el('line', { x1: X(i), x2: X(i), y1: Y(0), y2: Y(span), class: 'grid' }, svg);
    el('line', { y1: Y(i), y2: Y(i), x1: X(0), x2: X(span), class: 'grid' }, svg);
  }
  el('polygon', { points: pts(I.poly), class: 'relaxation' }, svg);
  el('polygon', { points: pts(ihull), class: 'inthull' }, svg);
  if (mode === 'bb') {
    for (const n of nodes) if (n.poly.length && (n.status === 'open' || n.id === selected))
      el('polygon', { points: pts(n.poly), class: n.id === selected ? 'colhull' : 'bbopen' }, svg);
  } else {
    for (const k of cuts) {
      // the line a.x = b of the cut, across the frame
      const [a1, a2] = k.a, n = Math.hypot(a1, a2), p0 = [a1 * k.b / n / n, a2 * k.b / n / n], d = [-a2 / n, a1 / n];
      el('line', { x1: X(p0[0] - 20 * d[0]), y1: Y(p0[1] - 20 * d[1]), x2: X(p0[0] + 20 * d[0]), y2: Y(p0[1] + 20 * d[1]), class: 'coupling' }, svg);
    }
    if (region.length) el('polygon', { points: pts(region), class: 'colhull' }, svg);
  }
  for (const p of ipts) el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3, class: 'ipt' }, svg);
  const cur = mode === 'bb' ? nodes[selected].sol : lp(region, I.c);
  if (cur) el('circle', { cx: X(cur.x[0]), cy: Y(cur.x[1]), r: 6, class: 'lpopt' }, svg);
  if (incumbent && mode === 'bb') el('rect', { x: X(incumbent.x[0]) - 6, y: Y(incumbent.x[1]) - 6, width: 12, height: 12, class: 'ipopt' }, svg);
  // the objective direction
  const n = Math.hypot(...I.c);
  const o = 0.9 * span;
  el('line', { x1: X(o), y1: Y(o), x2: X(o) + I.c[0] / n * 30, y2: Y(o) - I.c[1] / n * 30, class: 'arrow' }, svg);
}

function drawTree() {
  const svg = $('tree'); svg.replaceChildren();
  if (mode !== 'bb') {
    if (mode === 'cover' && !I.bin) { el('text', { x: 20, y: 30, class: 'lab' }, svg).textContent = t('Cover cuts need a binary instance: choose the binary knapsack.', 'I tagli di copertura richiedono un\'istanza binaria: si scelga lo zaino binario.'); return; }
    const zc = lp(region, I.c) ? lp(region, I.c).value.toFixed(3) : '–';
    el('text', { x: 20, y: 30, class: 'lab' }, svg).textContent = t(`${cuts.length} cuts added; the continuous optimum after them is ${zc}.`, `${cuts.length} tagli aggiunti; l'ottimo continuo dopo di essi vale ${zc}.`);
    cuts.forEach((k, i) => { el('text', { x: 20, y: 56 + 18 * i, class: 'lab' }, svg).textContent = `${i + 1}. ${k.a[0]} x1 + ${k.a[1]} x2 ≤ ${k.b}` + (k.cover ? `  (${t('cover', 'copertura')} {${k.cover.map(j => 'x' + (j + 1)).join(', ')}})` : ''); });
    return;
  }
  const depth = Math.max(...nodes.map(n => n.depth)), W = 560, H = 60 + depth * 64, pos = new Map();
  svg.setAttribute('viewBox', `0 0 ${W} ${Math.max(H, 200)}`);
  // place the leaves in order, the parents above the middle of their children
  let leaf = 0;
  const kids = id => nodes.filter(n => n.parent === id);
  const leaves = nodes.filter(n => !kids(n.id).length).length;
  const place = id => {
    const ks = kids(id);
    let x;
    if (!ks.length) x = 30 + (leaf++ + 0.5) / leaves * (W - 60);
    else { ks.forEach(k => place(k.id)); x = (pos.get(ks[0].id)[0] + pos.get(ks.at(-1).id)[0]) / 2; }
    pos.set(id, [x, 30 + nodes[id].depth * 64]);
  };
  place(0);
  for (const n of nodes) if (n.parent !== null) {
    const [x1, y1] = pos.get(n.parent), [x2, y2] = pos.get(n.id);
    el('line', { x1, y1, x2, y2, class: 'treeedge' }, svg);
    el('text', { x: (x1 + x2) / 2 + 4, y: (y1 + y2) / 2, class: 'lab small' }, svg).textContent = nodeName(n);
  }
  for (const n of nodes) {
    const [x, y] = pos.get(n.id), g = el('g', { class: 'tnode ' + n.status.split(' ')[0] + (n.id === selected ? ' hot' : '') }, svg);
    el('circle', { cx: x, cy: y, r: 13 }, g);
    el('text', { x, y: y + 4, class: 'tval' }, g).textContent = n.sol ? n.sol.value.toFixed(1) : '∅';
    g.addEventListener('click', () => { selected = n.id; draw(); });
  }
}

// the status of a node stays in English (it names a class of the style); its
// words in the language of the page
const statusWords = { open: 'aperto', integer: 'intero', infeasible: 'non ammissibile', branched: 'diviso', 'pruned (bound)': 'potato (bound)' };
const nodeName = n => (n.label === 'root' ? t('root', 'radice') : n.label);
function draw() {
  drawPlane(); drawTree();
  const n = nodes[selected];
  $('node').textContent = mode === 'bb' ? `${nodeName(n)}: ${t(n.status, statusWords[n.status])}` + (n.sol ? t(`, bound ${n.sol.value.toFixed(3)} at (${n.sol.x.map(v => v.toFixed(2))})`, `, bound ${n.sol.value.toFixed(3)} in (${n.sol.x.map(v => v.toFixed(2))})`) : '') : '';
  $('inc').textContent = incumbent ? incumbent.value.toFixed(3) : '–';
  $('zlp').textContent = lp(I.poly, I.c).value.toFixed(3);
  const zip = Math.max(...ipts.map(p => dot(I.c, p)));
  $('zip').textContent = zip.toFixed(3);
  $('cnt').textContent = mode === 'bb' ? t(`${nodes.length} nodes, ${open.length} open`, `${nodes.length} nodi, ${open.length} aperti`) : t(`${cuts.length} cuts`, `${cuts.length} tagli`);
}

for (const [k, v] of Object.entries(instances)) $('inst').append(new Option(v.label, k));
// the words that depend on the language: title, options, the Play button
const optWords = { bb: ['Branch and bound', 'Branch and bound'], gomory: ['Gomory fractional cuts', 'Tagli frazionari di Gomory'],
  cuts: ['Cutting planes (hull facets)', 'Piani di taglio (faccette dell\'inviluppo)'], cover: ['Cover cuts (binary)', 'Tagli di copertura (binari)'],
  best: ['best bound', 'miglior bound'], depth: ['depth first', 'in profondità'] };
function words() {
  document.title = t('Integer playground', 'Laboratorio di programmazione intera');
  for (const o of $('inst').options) o.textContent = t(instances[o.value].label, instances[o.value].it);
  for (const o of [...$('mode').options, ...$('rule').options]) o.textContent = t(...optWords[o.value]);
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('step').textContent = t('Step', 'Passo');
}
words();
onLang(() => { words(); draw(); });
$('inst').onchange = reset;
$('mode').onchange = e => { mode = e.target.value; $('rule').parentElement.hidden = mode !== 'bb'; reset(); };
$('rule').onchange = e => { rule = e.target.value; reset(); };
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
reset();

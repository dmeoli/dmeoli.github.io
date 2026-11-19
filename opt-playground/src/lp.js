// Scene C: linear programming, primal and dual together. With two variables and
// two rows the dual has two variables too:
//   primal  max c.x  s.t.  A x <= b, x >= 0
//   dual    min b.y  s.t.  A'y >= c, y >= 0
// The simplex walks the vertices of the primal; each basis gives a dual point,
// outside the dual region until the basis is optimal. The interior point method
// follows the central path, in both regions at once.

import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const solve2 = (M, r) => { const d = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return Math.abs(d) < 1e-12 ? null : [(r[0] * M[1][1] - M[0][1] * r[1]) / d, (M[0][0] * r[1] - r[0] * M[1][0]) / d]; };

const instances = {
  classic: { label: 'max 3x1 + 2x2', it: 'max 3x1 + 2x2', c: [3, 2], A: [[1, 1], [2, 1]], b: [4, 6] },
  flat: { label: 'max x1 + 3x2', it: 'max x1 + 3x2', c: [1, 3], A: [[1, 2], [3, 1]], b: [9, 12] },
  degenerate: { label: 'Nearly parallel rows', it: 'Righe quasi parallele', c: [2, 2.1], A: [[1, 1.05], [1.05, 1]], b: [6, 6.1] },
};
let P, mode = 'simplex', path = [], dualPath = [], basis, mu, x, timer = null, last = null, done = false;

// the four constraints of the primal as rows g.x <= h: the two of A and x >= 0
const cons = () => [{ g: P.A[0], h: P.b[0], name: t('row 1', 'riga 1') }, { g: P.A[1], h: P.b[1], name: t('row 2', 'riga 2') },
                    { g: [-1, 0], h: 0, name: 'x1 ≥ 0' }, { g: [0, -1], h: 0, name: 'x2 ≥ 0' }];

// the vertex of a basis (two active constraints) and its dual: c = sum u_k g_k
function vertex(B) {
  const C = cons(), [i, j] = B, v = solve2([C[i].g, C[j].g], [C[i].h, C[j].h]);
  const u = solve2([[C[i].g[0], C[j].g[0]], [C[i].g[1], C[j].g[1]]], P.c);
  const y = [0, 0];
  if (u) B.forEach((k, t) => { if (k < 2) y[k] = u[t]; });
  return { x: v, u, y };
}

function reset() {
  stop();
  P = instances[$('inst').value];
  basis = [2, 3];                     // the origin: x1 = 0 and x2 = 0 active
  const v = vertex(basis);
  path = [v.x]; dualPath = [v.y];
  mu = 4; x = [0.2 * Math.min(P.b[0], P.b[1]) / 4, 0.2 * Math.min(P.b[0], P.b[1]) / 4];
  if (mode === 'ipm') { path = [x.slice()]; dualPath = [ipmDual()]; }
  last = null; done = false;
  draw();
}

// one pivot: drop the active constraint with the most negative multiplier, then
// move along the edge to the first constraint that becomes active (ratio test)
function simplexStep() {
  const C = cons(), v = vertex(basis);
  const t = v.u[0] < v.u[1] ? 0 : 1;
  if (v.u[t] >= -1e-12) return false;            // optimal: the dual point is feasible
  const keep = basis[1 - t], k = C[keep];
  let d = [-k.g[1], k.g[0]];                      // along the kept constraint
  if (dot(P.c, d) < 0) d = [-d[0], -d[1]];
  let best = null, bt = Infinity;
  C.forEach((q, i) => {
    if (basis.includes(i)) return;
    const gd = dot(q.g, d);
    if (gd > 1e-12) { const s = (q.h - dot(q.g, v.x)) / gd; if (s < bt - 1e-12) { bt = s; best = i; } }
  });
  if (best === null) return false;
  const leave = basis[t];
  basis = [keep, best];
  const w = vertex(basis);
  last = { leave, keep, enter: best, u: v.u[t], from: v.x, dfrom: v.y, to: w.x, dto: w.y };
  path.push(w.x); dualPath.push(w.y);
  return true;
}

// the barrier method: maximize c.x + mu sum log(slacks), a few Newton steps,
// then mu shrinks; the dual estimate is y_r = mu / slack_r
const slacks = z => cons().map(q => q.h - dot(q.g, z));
function ipmDual() { const s = slacks(x); return [mu / s[0], mu / s[1]]; }
function ipmStep() {
  if (mu < 1e-6) return false;
  for (let it = 0; it < 8; it++) {
    const s = slacks(x), C = cons();
    const g = [P.c[0], P.c[1]], H = [[0, 0], [0, 0]];
    C.forEach((q, i) => {
      g[0] -= mu * q.g[0] / s[i]; g[1] -= mu * q.g[1] / s[i];
      for (const a of [0, 1]) for (const b of [0, 1]) H[a][b] -= mu * q.g[a] * q.g[b] / (s[i] * s[i]);
    });
    const d = solve2(H, [-g[0], -g[1]]);
    if (!d) break;
    let step = 1;
    while (slacks([x[0] + step * d[0], x[1] + step * d[1]]).some(v => v <= 0) && step > 1e-8) step *= 0.5;
    x = [x[0] + step * d[0], x[1] + step * d[1]];
  }
  // the dual estimate belongs to the mu just used; then mu shrinks
  last = { from: path.at(-1), dfrom: dualPath.at(-1), mu };
  path.push(x.slice()); dualPath.push(ipmDual());
  last.to = path.at(-1); last.dto = dualPath.at(-1);
  mu *= 0.55;
  return true;
}

function step() { if (!(mode === 'simplex' ? simplexStep() : ipmStep())) { stop(); done = true; } draw(); }
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function play() { if (timer) return stop(); $('play').textContent = t('Pause', 'Pausa'); timer = setInterval(step, mode === 'simplex' ? 1000 : 800); }   // a pivot a second, a barrier step in 0.8 s

// ------------------------------------------------------------------ drawing
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); p.appendChild(e); return e; };
function clip(poly, g, h) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], fa = dot(g, A) - h, fb = dot(g, B) - h;
    if (fa <= 1e-12) out.push(A);
    if (fa * fb < -1e-18) { const t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
  }
  return out;
}
// marks: { active: indices of the lines tight at the current point, enter: the
// line that just became tight, move: [from, to] of the last step, level: the
// value of the objective whose level line goes through the current point }
function plane(svgId, region, lines, obj, pts, opt, span, labels, marks = {}) {
  const svg = $(svgId); svg.replaceChildren();
  const W = 420, pad = 30, X = v => pad + v / span * (W - 2 * pad), Y = v => W - pad - v / span * (W - 2 * pad);
  const defs = el('defs', {}, svg);
  el('rect', { x: X(0) - 2, y: Y(span) - 2, width: X(span) - X(0) + 4, height: Y(0) - Y(span) + 4 }, el('clipPath', { id: svgId + '-clip' }, defs));
  for (const [id, cls] of [['tip', 'tipfill'], ['gtip', 'tipgold']]) {
    const m = el('marker', { id: svgId + '-' + id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 11, markerHeight: 11, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }, m);
  }
  for (let i = 0; i <= span; i += span > 10 ? 2 : 1) {
    el('line', { x1: X(i), x2: X(i), y1: Y(0), y2: Y(span), class: 'grid' }, svg);
    el('line', { y1: Y(i), y2: Y(i), x1: X(0), x2: X(span), class: 'grid' }, svg);
    el('text', { x: X(i), y: W - 12, class: 'tick' }, svg).textContent = i;
  }
  el('text', { x: W - 10, y: W - 2, class: 'lab end' }, svg).textContent = labels[0];
  el('text', { x: 6, y: 14, class: 'lab' }, svg).textContent = labels[1];
  const g0 = el('g', { 'clip-path': `url(#${svgId}-clip)` }, svg);
  el('polygon', { points: region.map(p => `${X(p[0])},${Y(p[1])}`).join(' '), class: 'inthull' }, g0);
  const far = 4 * span, line = (g, h, cls) => {
    const n = Math.hypot(...g), p0 = [g[0] * h / n / n, g[1] * h / n / n], d = [-g[1] / n, g[0] / n];
    return el('line', { x1: X(p0[0] - far * d[0]), y1: Y(p0[1] - far * d[1]), x2: X(p0[0] + far * d[0]), y2: Y(p0[1] + far * d[1]), class: cls }, g0);
  };
  lines.forEach(([g, h], i) => line(g, h, 'coupling' + ((marks.active || []).includes(i) ? ' tight' : '') + (marks.enter === i ? ' entered' : '')));
  // the tight axes of the basis (x1 = 0 or x2 = 0) drawn as thick as the rows
  for (const a of marks.axes || []) el('line', a === 0 ? { x1: X(0), y1: Y(0), x2: X(0), y2: Y(span), class: 'coupling tight' + (marks.enter === 2 ? ' entered' : '') } : { x1: X(0), y1: Y(0), x2: X(span), y2: Y(0), class: 'coupling tight' + (marks.enter === 3 ? ' entered' : '') }, g0);
  // the level line of the objective through the current point
  if (marks.level !== undefined) line(obj, marks.level, 'levelobj');
  const n = Math.hypot(...obj);
  el('line', { x1: X(span * 0.8), y1: Y(span * 0.8), x2: X(span * 0.8) + obj[0] / n * 40, y2: Y(span * 0.8) - obj[1] / n * 40, class: 'arrow', 'marker-end': `url(#${svgId}-tip)` }, svg);
  el('polyline', { points: pts.map(p => `${X(p[0])},${Y(p[1])}`).join(' '), class: 'path' }, svg);
  pts.forEach((p, i) => el('circle', { cx: X(p[0]), cy: Y(p[1]), r: i === pts.length - 1 ? 6 : 3.5, class: i === pts.length - 1 ? 'dw' : 'col' }, svg));
  if (opt) el('rect', { x: X(opt[0]) - 6, y: Y(opt[1]) - 6, width: 12, height: 12, transform: `rotate(45 ${X(opt[0])} ${Y(opt[1])})`, class: 'opt' }, svg);
  // the last step: a gold arrow from the previous point to the new one, ringed
  if (marks.move) {
    const [a, b] = marks.move;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) * (W - 2 * pad) / span > 8)
      el('line', { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), class: 'move', 'marker-end': `url(#${svgId}-gtip)` }, svg);
    el('circle', { cx: X(b[0]), cy: Y(b[1]), r: 11, class: 'fresh' }, svg);
  }
}

function draw() {
  const C = cons();
  // the primal region; the optimum by brute force over the bases
  let reg = [[0, 0], [20, 0], [20, 20], [0, 20]];
  for (const q of C) reg = clip(reg, q.g, q.h);
  let best = null;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const v = vertex([i, j]);
    if (v.x && C.every(q => dot(q.g, v.x) <= q.h + 1e-9) && v.u && v.u.every(u => u >= -1e-9)) best = v;
  }
  const spanP = Math.ceil(Math.max(...reg.flat()) + 1);
  const xp = path.at(-1), yp = dualPath.at(-1);
  const smx = mode === 'simplex';
  plane('primal', reg, [[P.A[0], P.b[0]], [P.A[1], P.b[1]]], P.c, path, best && best.x, spanP, ['x1', 'x2'], {
    active: smx ? basis.filter(k => k < 2) : [], axes: smx ? basis.filter(k => k >= 2).map(k => k - 2) : [],
    enter: smx && last ? last.enter : undefined, move: last && [last.from, last.to], level: dot(P.c, xp) });
  // the dual region: y >= 0, A'y >= c, i.e., -A'y <= -c
  const AT = [[P.A[0][0], P.A[1][0]], [P.A[0][1], P.A[1][1]]];
  const spanD = Math.ceil(Math.max(4, ...dualPath.flat().filter(isFinite).map(v => Math.min(v, 12)), ...(best ? best.y : [0])) * 1.3);
  let dreg = [[0, 0], [spanD * 3, 0], [spanD * 3, spanD * 3], [0, spanD * 3]];
  dreg = clip(clip(dreg, [-AT[0][0], -AT[0][1]], -P.c[0]), [-AT[1][0], -AT[1][1]], -P.c[1]);
  const cl = p => p.map(v => Math.min(v, spanD * 1.2));
  plane('dual', dreg, [[AT[0], P.c[0]], [AT[1], P.c[1]]], P.b.map(v => -v), dualPath.map(cl), best && best.y, spanD, ['y1', 'y2'], {
    move: last && [cl(last.dfrom), cl(last.dto)] });
  $('pval').textContent = dot(P.c, xp).toFixed(4);
  $('dval').textContent = dot(P.b, yp).toFixed(4);
  $('gap').textContent = (dot(P.b, yp) - dot(P.c, xp)).toExponential(2);
  $('event').textContent = eventText(C, xp, yp);
  $('info').textContent = mode === 'simplex'
    ? t(`basis {${basis.map(k => C[k].name).join(', ')}}; dual point ${dualFeasible(yp) ? 'feasible: the basis is optimal' : 'infeasible: some multiplier is negative'}`,
        `base {${basis.map(k => C[k].name).join(', ')}}; punto duale ${dualFeasible(yp) ? 'ammissibile: la base è ottima' : 'non ammissibile: qualche moltiplicatore è negativo'}`)
    : t(`μ = ${mu.toExponential(2)}; the primal and the dual estimate follow the central path`,
        `μ = ${mu.toExponential(2)}; il primale e la stima duale seguono il cammino centrale`);
}
// the move of the last step in words
function eventText(C, xp, yp) {
  const f = v => (+v).toFixed(2), pt = p => `(${f(p[0])}, ${f(p[1])})`;
  if (done) return t(`Stop: ${mode === 'simplex' ? 'no multiplier of the basis is negative, so the dual point is feasible and the vertex is optimal' : 'μ is so small that the two points sit on the optimum'}; c·x = b·y = ${f(dot(P.c, xp))}.`,
    `Fine: ${mode === 'simplex' ? 'nessun moltiplicatore della base è negativo, quindi il punto duale è ammissibile e il vertice è ottimo' : 'μ è così piccolo che i due punti stanno sull\'ottimo'}; c·x = b·y = ${f(dot(P.c, xp))}.`);
  if (!last) return mode === 'simplex'
    ? t('Start at the vertex x = (0, 0), where x1 ≥ 0 and x2 ≥ 0 are tight (the basis, drawn thick). Press Step for a pivot.', 'Si parte dal vertice x = (0, 0), dove x1 ≥ 0 e x2 ≥ 0 sono attivi (la base, tracciata spessa). Premi Passo per un pivot.')
    : t(`Start inside the region, at x = ${pt(xp)}, with μ = ${f(mu)}. Press Step for a barrier step.`, `Si parte dentro la regione, in x = ${pt(xp)}, con μ = ${f(mu)}. Premi Passo per un passo di barriera.`);
  if (mode === 'simplex')
    return t(`Pivot: the multiplier of ${C[last.leave].name} is negative (${f(last.u)}), so it leaves the basis; the simplex walks along ${C[last.keep].name} until ${C[last.enter].name} becomes tight (gold line, the ratio test), from ${pt(last.from)} to ${pt(last.to)}; c·x rises from ${f(dot(P.c, last.from))} to ${f(dot(P.c, last.to))}, and the dual point jumps to ${pt(last.dto)}.`,
      `Pivot: il moltiplicatore di ${C[last.leave].name} è negativo (${f(last.u)}), quindi esce dalla base; il simplesso cammina lungo ${C[last.keep].name} finché ${C[last.enter].name} diventa attivo (linea dorata, il test del rapporto), da ${pt(last.from)} a ${pt(last.to)}; c·x sale da ${f(dot(P.c, last.from))} a ${f(dot(P.c, last.to))}, e il punto duale salta in ${pt(last.dto)}.`);
  return t(`Barrier step: with μ = ${last.mu.toExponential(1)}, Newton steps move x from ${pt(last.from)} to ${pt(last.to)}, the point of the central path for this μ, and y = μ / slack to ${pt(last.dto)}; then μ shrinks to ${mu.toExponential(1)}, and the gap b·y − c·x is ${(dot(P.b, yp) - dot(P.c, xp)).toFixed(3)}.`,
    `Passo di barriera: con μ = ${last.mu.toExponential(1)}, i passi di Newton portano x da ${pt(last.from)} a ${pt(last.to)}, il punto del cammino centrale per questo μ, e y = μ / scarto in ${pt(last.dto)}; poi μ scende a ${mu.toExponential(1)}, e lo scarto b·y − c·x vale ${(dot(P.b, yp) - dot(P.c, xp)).toFixed(3)}.`);
}
function dualFeasible(y) { return y.every(v => v >= -1e-9) && [0, 1].every(j => P.A[0][j] * y[0] + P.A[1][j] * y[1] >= P.c[j] - 1e-9); }

// the words that depend on the language: title, options, the Play button
function words() {
  document.title = t('LP playground', 'Laboratorio di PL');
  for (const o of $('inst').options) o.textContent = t(instances[o.value].label, instances[o.value].it);
  for (const o of $('mode').options) o.textContent = o.value === 'simplex' ? t('Simplex', 'Simplesso') : t('Interior point (barrier)', 'Punto interno (barriera)');
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('step').textContent = t('Step', 'Passo');
  $('reset').textContent = t('Reset', 'Ricomincia');
}
for (const [k, v] of Object.entries(instances)) $('inst').append(new Option(v.label, k));
words();
onLang(() => { words(); draw(); });
$('inst').onchange = reset;
$('mode').onchange = e => { mode = e.target.value; reset(); };
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
reset();

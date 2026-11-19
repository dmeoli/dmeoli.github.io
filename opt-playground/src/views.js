// The views: each draws the problem and the trace up to the current step into
// an SVG, and they are linked through the step under the pointer.

import { hull, primalPoint } from './problems/lagrangian1d.js';
import { t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function scale(d0, d1, r0, r1) { return v => r0 + (v - d0) / (d1 - d0) * (r1 - r0); }
const pts = (ps, X, Y) => ps.map(p => `${X(p[0])},${Y(p[1])}`).join(' ');

export function primal(svg, problem, state, hover) {
  svg.replaceChildren();
  const W = 440, H = 440, pad = 34;
  const [x0, x1, y0, y1] = problem.bounds, span = Math.max(x1 - x0, y1 - y0);
  const X = scale(x0, x0 + span, pad, W - pad), Y = scale(y0, y0 + span, H - pad, pad);
  // everything is clipped to the frame of the plot
  const cid = svg.id + '-clip', cp = el('clipPath', { id: cid }, el('defs', {}, svg));
  el('rect', { x: pad, y: pad, width: W - 2 * pad, height: H - 2 * pad }, cp);
  svg = el('g', { 'clip-path': `url(#${cid})` }, svg);
  for (let i = Math.ceil(x0); i <= x0 + span; i++) {
    el('line', { x1: X(i), x2: X(i), y1: Y(y0), y2: Y(y0 + span), class: 'grid' }, svg);
    el('line', { y1: Y(i), y2: Y(i), x1: X(x0), x2: X(x0 + span), class: 'grid' }, svg);
  }
  // the coupling constraint a.x <= b, its infeasible side shaded
  const [a1, a2] = problem.a, b = problem.b;
  const xa = x0 - 1, xb = x0 + span + 1;
  const yA = (b - a1 * xa) / a2, yB = (b - a1 * xb) / a2;
  el('polygon', { points: pts([[xa, yA], [xb, yB], [xb, y0 + span + 9], [xa, y0 + span + 9]], X, Y), class: 'infeasible' }, svg);
  el('line', { x1: X(xa), y1: Y(yA), x2: X(xb), y2: Y(yB), class: 'coupling' }, svg);
  el('polygon', { points: pts(problem.polygon, X, Y), class: 'relaxation' }, svg);
  el('polygon', { points: pts(problem.hull, X, Y), class: 'inthull' }, svg);
  // the hull of the columns generated so far: the inner approximation
  const cols = state.columns;
  if (cols.length > 2) el('polygon', { points: pts(hull(cols), X, Y), class: 'colhull' }, svg);
  else if (cols.length === 2) el('line', { x1: X(cols[0][0]), y1: Y(cols[0][1]), x2: X(cols[1][0]), y2: Y(cols[1][1]), class: 'colseg' }, svg);
  for (const p of problem.points) el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3, class: 'ipt' }, svg);
  cols.forEach((p, i) => {
    const h = hover != null && state.trace[hover] && state.trace[hover].column === p;
    el('circle', { cx: X(p[0]), cy: Y(p[1]), r: h ? 9 : 6, class: h ? 'col hot' : 'col' }, svg);
    el('text', { x: X(p[0]) + 9, y: Y(p[1]) - 7, class: 'lab' }, svg).textContent = i + 1;
  });
  // the column the last oracle call returned, ringed in gold: the move of the step
  const last = state.trace.at(-1);
  if (last && last.column && state.trace.length > 1)
    el('circle', { cx: X(last.column[0]), cy: Y(last.column[1]), r: 12, class: 'fresh' }, svg);
  // the direction of improvement, -c
  const cx = X(x0 + 0.6), cy = Y(y0 + 0.6), n = Math.hypot(...problem.c);
  el('line', { x1: cx, y1: cy, x2: cx - problem.c[0] / n * 40, y2: cy + problem.c[1] / n * 40, class: 'arrow', 'marker-end': 'url(#tip)' }, svg);
  const opt = problem.optimum.x;
  el('rect', { x: X(opt[0]) - 6, y: Y(opt[1]) - 6, width: 12, height: 12, transform: `rotate(45 ${X(opt[0])} ${Y(opt[1])})`, class: 'opt' }, svg);
  const dw = primalPoint(problem, cols, state.lam);
  if (dw) el('circle', { cx: X(dw[0]), cy: Y(dw[1]), r: 5, class: 'dw' }, svg);
  defs(svg);
}

export function dual(svg, problem, state, hover, onHover, params, algo) {
  svg.replaceChildren();
  const W = 560, H = 440, pad = 40;
  const ls = Array.from({ length: 241 }, (_, i) => i / 240 * problem.lmax);
  const Ls = ls.map(problem.L);
  // the vertical scale follows the values near the maximum, not the far tails
  const sorted = [...Ls].sort((u, v) => u - v);
  const vmax = problem.optimum.value, vmin = sorted[Math.floor(0.3 * sorted.length)];
  const gap = (vmax - vmin) || 1;
  const fcp = el('clipPath', { id: 'dframe' }, el('defs', {}, svg));
  el('rect', { x: pad, y: 0, width: W - pad, height: H - pad }, fcp);
  const X = scale(0, problem.lmax, pad, W - 14), Y = scale(vmin - 0.15 * gap, vmax + 0.35 * gap, H - pad, 14);
  el('line', { x1: X(0), x2: X(problem.lmax), y1: Y(vmax), y2: Y(vmax), class: 'grid' }, svg);
  el('text', { x: X(problem.lmax) - 4, y: Y(vmax) - 6, class: 'lab end' }, svg).textContent = 'max L';
  el('line', { x1: X(0), x2: X(problem.lmax), y1: H - pad, y2: H - pad, class: 'axis' }, svg);
  el('text', { x: W - 14, y: H - pad + 26, class: 'lab end' }, svg).textContent = 'λ';
  for (let t = 0; t <= problem.lmax; t += 0.5)
    el('text', { x: X(t), y: H - pad + 16, class: 'tick' }, svg).textContent = t;
  // the cuts, the model (their minimum), the true function
  const top = svg;
  svg = el('g', { 'clip-path': 'url(#dframe)' }, svg);
  for (const k of state.cuts)
    el('line', { x1: X(0), y1: Y(k.value), x2: X(problem.lmax), y2: Y(k.value + k.slope * problem.lmax), class: 'cut' }, svg);
  // the cut of the column returned by the last oracle call, in gold
  const lo = state.trace.at(-1);
  if (state.trace.length > 1 && lo.column && problem.cut) {
    const k = problem.cut(lo.column);
    el('line', { x1: X(0), y1: Y(k.value), x2: X(problem.lmax), y2: Y(k.value + k.slope * problem.lmax), class: 'freshcut' }, svg);
  }
  el('polyline', { points: ls.map((l, i) => `${X(l)},${Y(Ls[i])}`).join(' '), class: 'truef' }, svg);
  const mod = ls.map(l => Math.min(...state.cuts.map(k => k.value + k.slope * l)));
  el('polyline', { points: ls.map((l, i) => `${X(l)},${Y(mod[i])}`).join(' '), class: 'model' }, svg);
  if (algo === 'bundle') {
    const c = state.center, t = params.t, mc = problem.L(c);
    el('polyline', { points: ls.map(l => `${X(l)},${Y(mc - (l - c) ** 2 / (2 * t) + 0.0001)}`).filter((_, i) => true).join(' '), class: 'prox' }, svg);
    el('circle', { cx: X(c), cy: Y(mc), r: 10, class: 'center' }, svg);
  }
  state.trace.forEach((o, i) => {
    const g = el('g', { class: 'iter' + (i === hover ? ' hot' : '') + (o.serious ? '' : ' null') }, svg);
    el('circle', { cx: X(o.lam), cy: Y(o.value), r: i === hover ? 8 : 5 }, g);
    el('text', { x: X(o.lam) + 7, y: Y(o.value) + 16, class: 'lab' }, g).textContent = i;
    g.addEventListener('mouseenter', () => onHover(i));
    g.addEventListener('mouseleave', () => onHover(null));
  });
  const lt = state.trace.at(-1);
  if (state.trace.length > 1) el('circle', { cx: X(lt.lam), cy: Y(lt.value), r: 10, class: 'fresh' }, svg);
  defs(top);
}

export function curve(svg, problem, state) {
  svg.replaceChildren();
  const W = 560, H = 150, pad = 30;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const gaps = [];
  let best = -Infinity;
  for (const o of state.trace) { best = Math.max(best, o.value); gaps.push(Math.max(problem.optimum.value - best, 1e-6)); }
  const n = Math.max(gaps.length - 1, 10);
  const X = scale(0, n, pad, W - 10), Y = scale(-6, Math.log10(Math.max(...gaps, 1)) + 0.3, H - 22, 8);
  el('line', { x1: pad, x2: W - 10, y1: H - 22, y2: H - 22, class: 'axis' }, svg);
  el('text', { x: pad, y: 12, class: 'lab' }, svg).textContent = t('gap to max L (log)', 'scarto da max L (log)');
  el('text', { x: W - 10, y: H - 6, class: 'lab end' }, svg).textContent = t('iteration', 'iterazione');
  el('polyline', { points: gaps.map((g, i) => `${X(i)},${Y(Math.log10(g))}`).join(' '), class: 'gapline' }, svg);
}

function defs(svg) {
  const d = el('defs', {}, svg);
  const m = el('marker', { id: 'tip', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, d);
  el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'tipfill' }, m);
}

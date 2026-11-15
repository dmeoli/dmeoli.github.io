// Views of the scene with two multipliers: the primal with the two coupling
// constraints, and the dual as a map of the multipliers, where every region is
// the set of multipliers at which one column is the lowest in the model.

import { el } from './views.js';
import { hull } from './problems/lagrangian1d.js';
import { primalPoint, modelAt } from './problems/lagrangian2d.js';

const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
const pts = (ps, X, Y) => ps.map(p => `${X(p[0])},${Y(p[1])}`).join(' ');

export function primal2(svg, problem, state, hover) {
  svg.replaceChildren();
  const W = 440, H = 440, pad = 34;
  const [x0, x1, y0, y1] = problem.bounds, span = Math.max(x1 - x0, y1 - y0);
  const X = scale(x0, x0 + span, pad, W - pad), Y = scale(y0, y0 + span, H - pad, pad);
  const cid = svg.id + '-clip', cp = el('clipPath', { id: cid }, el('defs', {}, svg));
  el('rect', { x: pad, y: pad, width: W - 2 * pad, height: H - 2 * pad }, cp);
  const g = el('g', { 'clip-path': `url(#${cid})` }, svg);
  for (let i = Math.ceil(x0); i <= x0 + span; i++) {
    el('line', { x1: X(i), x2: X(i), y1: Y(y0), y2: Y(y0 + span), class: 'grid' }, g);
    el('line', { y1: Y(i), y2: Y(i), x1: X(x0), x2: X(x0 + span), class: 'grid' }, g);
  }
  // each coupling row a.x <= b: its infeasible side shaded, its line
  const far = 3 * span;
  problem.A.forEach((a, r) => {
    const b = problem.b[r], n = Math.hypot(a[0], a[1]);
    const p0 = [a[0] * b / n / n, a[1] * b / n / n], d = [-a[1] / n, a[0] / n], o = [a[0] / n, a[1] / n];
    const A1 = [p0[0] - far * d[0], p0[1] - far * d[1]], B1 = [p0[0] + far * d[0], p0[1] + far * d[1]];
    const B2 = [B1[0] + far * o[0], B1[1] + far * o[1]], A2 = [A1[0] + far * o[0], A1[1] + far * o[1]];
    el('polygon', { points: pts([A1, B1, B2, A2], X, Y), class: 'infeasible' }, g);
    el('line', { x1: X(A1[0]), y1: Y(A1[1]), x2: X(B1[0]), y2: Y(B1[1]), class: 'coupling' }, g);
  });
  if (!problem.points.every(p => Number.isInteger(p[0])))
    el('polygon', { points: pts(problem.hull, X, Y), class: 'inthull' }, g);
  else {
    el('polygon', { points: pts(problem.polygon, X, Y), class: 'relaxation' }, g);
    el('polygon', { points: pts(problem.hull, X, Y), class: 'inthull' }, g);
  }
  const cols = state.columns;
  if (cols.length > 2) el('polygon', { points: pts(hull(cols), X, Y), class: 'colhull' }, g);
  else if (cols.length === 2) el('line', { x1: X(cols[0][0]), y1: Y(cols[0][1]), x2: X(cols[1][0]), y2: Y(cols[1][1]), class: 'colseg' }, g);
  for (const p of problem.points) el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 2.6, class: 'ipt' }, g);
  const hot = hover != null && state.trace[hover] ? state.trace[hover].column : null;
  cols.forEach((p, i) => {
    const h = hot === p;
    el('circle', { cx: X(p[0]), cy: Y(p[1]), r: h ? 9 : 5.5, class: h ? 'col hot' : 'col' }, g);
    el('text', { x: X(p[0]) + 8, y: Y(p[1]) - 6, class: 'lab' }, g).textContent = i + 1;
  });
  // the continuous relaxation (its feasible region and optimum) and the
  // integer optimum
  if (problem.lp) {
    el('polygon', { points: pts(problem.lp.region, X, Y), class: 'lpregion' }, g);
    el('circle', { cx: X(problem.lp.x[0]), cy: Y(problem.lp.x[1]), r: 6, class: 'lpopt' }, g);
  }
  if (problem.ip) el('rect', { x: X(problem.ip.x[0]) - 5, y: Y(problem.ip.x[1]) - 5, width: 10, height: 10, class: 'ipopt' }, g);
  const opt = problem.optimum.x;
  el('rect', { x: X(opt[0]) - 6, y: Y(opt[1]) - 6, width: 12, height: 12, transform: `rotate(45 ${X(opt[0])} ${Y(opt[1])})`, class: 'opt' }, g);
  const dw = primalPoint(problem, cols, dualLam(state, problem));
  if (dw) el('circle', { cx: X(dw[0]), cy: Y(dw[1]), r: 5, class: 'dw' }, g);
}

// the multipliers at which the restricted master is read: the maximum of the model
function dualLam(state, problem) {
  let best = null, bv = -Infinity;
  for (const o of state.trace) {
    const v = modelAt(state.cuts, o.lam);
    if (v > bv) { bv = v; best = o.lam; }
  }
  return problem.optimum && state.trace.length ? best : null;
}

// a color for every column, in the violet scale of the site and its gold
// the same colors as the faces of the 3D view
function tint(i) {
  if (i % 5 === 4) return 'hsl(44 50% 55%)';
  return `hsl(${250 + 50 * ((i * 0.618) % 1)} 50% ${42 + 36 * ((i * 0.382) % 1)}%)`;
}

export function dualMap(box, problem, state, hover, onHover, params, algo) {
  const W = 480, H = 480, pad = 36, N = 160;
  let canvas = box.querySelector('canvas.map'), svg = box.querySelector('svg');
  if (!canvas) {
    canvas = Object.assign(document.createElement('canvas'), { width: N, height: N, className: 'map' });
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    box.replaceChildren(canvas, svg);
  }
  canvas.style.left = `${pad / W * 100}%`; canvas.style.top = `${14 / H * 100}%`;
  canvas.style.width = `${(W - pad - 14) / W * 100}%`; canvas.style.height = `${(H - pad - 14) / H * 100}%`;
  const m = problem.lmax, ctx = canvas.getContext('2d'), img = ctx.createImageData(N, N);
  const cuts = state.cuts, colors = cuts.map((_, i) => tint(i, cuts.length));
  const rgb = colors.map(c => { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data.slice(0, 3); });
  const vals = new Float64Array(N * N), arg = new Int32Array(N * N);
  let vmin = Infinity, vmax = -Infinity;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const l = [(i + 0.5) / N * m, (1 - (j + 0.5) / N) * m];
      let bv = Infinity, bk = 0;
      cuts.forEach((k, h) => { const v = k.value + k.slope[0] * l[0] + k.slope[1] * l[1]; if (v < bv) { bv = v; bk = h; } });
      vals[j * N + i] = bv; arg[j * N + i] = bk;
      vmin = Math.min(vmin, bv); vmax = Math.max(vmax, bv);
    }
  for (let q = 0; q < N * N; q++) {
    // the region's color, darker where the model is lower, a dark seam on borders
    const i = q % N, j = (q / N) | 0, s = 0.55 + 0.45 * (vals[q] - vmin) / ((vmax - vmin) || 1);
    const border = (i + 1 < N && arg[q + 1] !== arg[q]) || (j + 1 < N && arg[q + N] !== arg[q]);
    const c = rgb[arg[q]];
    img.data.set(border ? [60, 40, 90, 255] : [c[0] * s, c[1] * s, c[2] * s, 255], q * 4);
  }
  ctx.putImageData(img, 0, 0);

  svg.replaceChildren();
  const X = scale(0, m, pad, W - 14), Y = scale(0, m, H - pad, 14);
  el('rect', { x: pad, y: 14, width: W - pad - 14, height: H - pad - 14, class: 'mapframe' }, svg);
  for (let t = 0; t <= m + 1e-9; t += 0.5) {
    el('text', { x: X(t), y: H - pad + 16, class: 'tick' }, svg).textContent = t;
    el('text', { x: pad - 6, y: Y(t) + 4, class: 'tick end' }, svg).textContent = t;
  }
  el('text', { x: W - 14, y: H - 4, class: 'lab end' }, svg).textContent = 'λ1';
  el('text', { x: 4, y: 12, class: 'lab' }, svg).textContent = 'λ2';
  const L = problem.optimum.lam;
  el('path', { d: `M${X(L[0])},${Y(L[1]) - 9} l2.6,6 6.4,.6 -4.8,4.3 1.4,6.3 -5.6,-3.3 -5.6,3.3 1.4,-6.3 -4.8,-4.3 6.4,-.6z`, class: 'star' }, svg);
  const tr = state.trace;
  el('polyline', { points: tr.map(o => `${X(o.lam[0])},${Y(o.lam[1])}`).join(' '), class: 'path' }, svg);
  if (algo === 'bundle' || algo === 'level') {
    const c = state.center, r = Math.sqrt(2 * params.t) / m * (W - pad - 14) * 0.35;
    el('circle', { cx: X(c[0]), cy: Y(c[1]), r: Math.max(8, r), class: 'center' }, svg);
  }
  tr.forEach((o, i) => {
    const g = el('g', { class: 'iter' + (i === hover ? ' hot' : '') + (o.serious ? '' : ' null') }, svg);
    el('circle', { cx: X(o.lam[0]), cy: Y(o.lam[1]), r: i === hover ? 8 : 5 }, g);
    el('text', { x: X(o.lam[0]) + 7, y: Y(o.lam[1]) - 7, class: 'lab onmap' }, g).textContent = i;
    g.addEventListener('mouseenter', () => onHover(i));
    g.addEventListener('mouseleave', () => onHover(null));
  });
}

export function curve2(svg, problem, runs) {
  // runs: [{ state, cls }], the gap of each drawn on the same axes
  svg.replaceChildren();
  const W = 480, H = 140, pad = 30;
  const all = runs.map(({ state }) => {
    const gaps = [];
    let best = -Infinity;
    for (const o of state.trace) { best = Math.max(best, o.value); gaps.push(Math.max(problem.optimum.value - best, 1e-6)); }
    return gaps;
  });
  const n = Math.max(...all.map(g => g.length - 1), 10);
  const X = scale(0, n, pad, W - 10), Y = scale(-6, Math.log10(Math.max(...all.flat(), 1)) + 0.3, H - 22, 8);
  el('line', { x1: pad, x2: W - 10, y1: H - 22, y2: H - 22, class: 'axis' }, svg);
  el('text', { x: pad, y: 12, class: 'lab' }, svg).textContent = 'gap to max L (log)';
  el('text', { x: W - 10, y: H - 6, class: 'lab end' }, svg).textContent = 'iteration';
  all.forEach((gaps, r) =>
    el('polyline', { points: gaps.map((g, i) => `${X(i)},${Y(Math.log10(g))}`).join(' '), class: 'gapline ' + (runs[r].cls || '') }, svg));
}

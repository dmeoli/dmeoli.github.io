// A problem with one coupling constraint, relaxed with one multiplier:
//   min c.x  subject to  a.x <= b,  x integer in the polygon P.
// The Lagrangian function L(l) = min over the integer points v of P of
// c.v + l (a.v - b) is concave and piecewise linear: every integer point gives
// a line (a cut), and the oracle returns the point that is lowest at l.

import { t } from '../i18n.js';

// a regular polygon with n sides, radius r and centre (cx, cy), counter-clockwise
const ngon = (n, r, cx, cy, rot = 0.13) =>
  Array.from({ length: n }, (_, i) => {
    const t = rot + 2 * Math.PI * i / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });

export const presets = {
  disc: {
    get label() { return t('Disc (many columns)', "Disco (molte colonne)"); },
    polygon: ngon(18, 6.4, 7, 7),
    c: [-0.35, -1], a: [1, 0.25], b: 7.5, lmax: 3,
  },
  ellipse: {
    get label() { return t('Flat ellipse', "Ellisse schiacciata"); },
    polygon: ngon(20, 1, 0, 0).map(([x, y]) => [8 + 7.5 * x - 1.5 * y, 5 + 1.2 * x + 3.2 * y]),
    c: [-1, -0.45], a: [0.3, 1], b: 5.2, lmax: 3,
  },
  pentagon: {
    get label() { return t('Pentagon', "Pentagono"); },
    polygon: [[0, 0], [6, 0], [6, 2], [3, 5], [0, 4]],
    c: [-1, -1.6], a: [1, 1.2], b: 6.3, lmax: 3,
  },
  kite: {
    get label() { return t('Kite', "Aquilone"); },
    polygon: [[1, 0], [5, 1], [6, 5], [2, 6], [0, 3]],
    c: [-1.4, -1], a: [1.5, 0.6], b: 6.6, lmax: 3,
  },
};

const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

function inside(poly, p) {
  // convex polygon in counter-clockwise order
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if ((x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) < -1e-9) return false;
  }
  return true;
}

export function hull(points) {
  // Andrew's monotone chain, counter-clockwise
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// the maximum over [lo, hi] of the minimum of the lines (value, slope at 0)
export function maxOfMin(cuts, lo, hi) {
  const model = l => Math.min(...cuts.map(k => k.value + k.slope * l));
  const cand = [lo, hi];
  for (let i = 0; i < cuts.length; i++)
    for (let j = i + 1; j < cuts.length; j++) {
      const ds = cuts[i].slope - cuts[j].slope;
      if (Math.abs(ds) < 1e-12) continue;
      const l = (cuts[j].value - cuts[i].value) / ds;
      if (l > lo && l < hi) cand.push(l);
    }
  let best = lo, bv = -Infinity;
  for (const l of cand) { const v = model(l); if (v > bv + 1e-12) { bv = v; best = l; } }
  return { lam: best, value: bv };
}

// the primal point of a restricted master: the convex combination of the
// columns whose cuts are active at the maximum of the model
export function primalPoint(problem, columns, lam) {
  if (!columns.length) return null;
  const cuts = columns.map(v => problem.cut(v));
  const vals = cuts.map(k => k.value + k.slope * lam);
  const m = Math.min(...vals);
  const act = columns.map((v, i) => [v, cuts[i]]).filter((_, i) => vals[i] < m + 1e-7);
  const pos = act.filter(([, k]) => k.slope > 1e-9), neg = act.filter(([, k]) => k.slope <= 1e-9);
  if (!pos.length || lam < 1e-9) {
    // no need to mix: a column that satisfies the coupling constraint
    const [v] = (neg.length ? neg : act).sort((p, q) => problem.cost(p[0]) - problem.cost(q[0]))[0];
    return v;
  }
  if (!neg.length) return act[0][0];
  const [v1, k1] = pos[0], [v2, k2] = neg[0];
  const th = -k2.slope / (k1.slope - k2.slope);   // th g1 + (1 - th) g2 = 0
  return [th * v1[0] + (1 - th) * v2[0], th * v1[1] + (1 - th) * v2[1]];
}

export function make(name) {
  const s = presets[name];
  const xs = s.polygon.map(p => p[0]), ys = s.polygon.map(p => p[1]);
  const points = [];
  for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      if (inside(s.polygon, [x, y])) points.push([x, y]);
  const problem = {
    kind: 'lagrangian1d', name, ...s, points, hull: hull(points),
    bounds: [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...ys) - 0.5, Math.max(...ys) + 0.5],
    cost: v => dot(s.c, v),
    // the line of an integer point: c.v + l (a.v - b)
    cut: v => ({ value: dot(s.c, v), slope: dot(s.a, v) - s.b, v }),
    oracle(l) {
      let best = null, bv = Infinity;
      for (const v of points) {
        const val = dot(s.c, v) + l * (dot(s.a, v) - s.b);
        if (val < bv - 1e-12) { bv = val; best = v; }
      }
      return { lam: l, value: bv, subgradient: dot(s.a, best) - s.b, column: best };
    },
  };
  problem.L = l => problem.oracle(l).value;
  const all = maxOfMin(points.map(problem.cut), 0, s.lmax);
  problem.optimum = { lam: all.lam, value: all.value, x: primalPoint(problem, points, all.lam) };
  return problem;
}

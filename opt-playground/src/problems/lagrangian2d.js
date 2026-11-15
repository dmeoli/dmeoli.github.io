// A problem with two coupling constraints, relaxed with two multipliers:
//   min c.x  subject to  A x <= b (two rows),  x integer in the polygon P.
// L(l) = min over the integer points v of c.v + l.(A v - b), for l >= 0: every
// point gives a plane (a cut), and the space of the multipliers splits into the
// regions where each point is the lowest, a polyhedral complex.

import { hull } from './lagrangian1d.js';
import { t } from '../i18n.js';

const ngon = (n, r, cx, cy, rot = 0.13) =>
  Array.from({ length: n }, (_, i) => {
    const t = rot + 2 * Math.PI * i / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });

// columns spread densely on an ellipse: the dual is almost smooth, with many
// pieces, as in the tailing-off of column generation
const ring = ngon(120, 1, 0, 0, 0.05).map(([x, y]) => [7 + 6 * x, 6 + 4.5 * y]);

export const presets = {
  // the textbook cases of Lagrangian relaxation: z_LP <= z_LD <= z_IP
  integral: {
    get label() { return t('Integrality property (z_LD = z_LP)', "Proprietà di integralità (z_LD = z_LP)"); },
    polygon: [[0, 0], [8, 0], [9, 3], [6, 8], [1, 7]],
    c: [-1, -1.3], A: [[1, 0.3], [-0.4, 1]], b: [7.4, 5.9], lmax: 2,
  },
  // found by a search over random couplings: the continuous optimum lies on a
  // fractional side of the polygon, outside the hull, so one multiplier is zero
  gap: {
    get label() { return t('Strict improvement (z_LP < z_LD < z_IP)', "Miglioramento stretto (z_LP < z_LD < z_IP)"); },
    polygon: [[0.4, 0.3], [8.6, 0.5], [9.5, 3.4], [6.5, 8.6], [0.6, 7.4]],
    c: [-0.815, -1.297], A: [[1.284, 0.55], [-0.325, 1.247]], b: [4.017, 7.602], lmax: 3,
  },
  knapsack: {
    get label() { return t('Two knapsacks', "Due zaini"); },
    polygon: [[0, 0], [9.7, 0], [9.7, 2.6], [3.2, 6.1], [0, 6.1]],
    c: [-3, -4], A: [[3, 4], [4, 2.5]], b: [31.5, 33.3], lmax: 2,
  },
  ring: {
    get label() { return t('Many columns on an ellipse (tailing-off)', "Molte colonne su un'ellisse (tailing-off)"); },
    polygon: ring, points: ring,
    c: [-0.35, -1], A: [[1, 0.25], [-0.45, 1]], b: [9.2, 6.9], lmax: 3,
  },
  disc: {
    get label() { return t('Disc, two couplings', "Disco, due vincoli accoppianti"); },
    polygon: ngon(18, 6.4, 7, 7),
    c: [-0.35, -1], A: [[1, 0.25], [-0.45, 1]], b: [7.5, 8.2], lmax: 2,
  },
  ellipse: {
    get label() { return t('Ellipse, two couplings', "Ellisse, due vincoli accoppianti"); },
    polygon: ngon(20, 1, 0, 0).map(([x, y]) => [8 + 7.5 * x - 1.5 * y, 6 + 1.2 * x + 4.2 * y]),
    c: [-1, -0.6], A: [[0.35, 1], [1, -0.3]], b: [8.3, 8.8], lmax: 2,
  },
};

const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

function inside(poly, p) {
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if ((x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) < -1e-9) return false;
  }
  return true;
}

// the model of a set of cuts: min_k a_k + g_k.l
export const modelAt = (cuts, l) => Math.min(...cuts.map(k => k.value + dot(k.slope, l)));

// solve the 2x2 system M l = r, null if singular
function solve2(M, r) {
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (Math.abs(det) < 1e-12) return null;
  return [(r[0] * M[1][1] - M[0][1] * r[1]) / det, (M[0][0] * r[1] - r[0] * M[1][0]) / det];
}

// the rows that can be active in a master: the equality of two cuts, and the
// faces of the box [0, lmax]^2
function rows(cuts, lmax) {
  const R = [{ m: [1, 0], r: 0 }, { m: [1, 0], r: lmax }, { m: [0, 1], r: 0 }, { m: [0, 1], r: lmax }];
  for (let i = 0; i < cuts.length; i++)
    for (let j = i + 1; j < cuts.length; j++)
      R.push({ m: [cuts[i].slope[0] - cuts[j].slope[0], cuts[i].slope[1] - cuts[j].slope[1]],
               r: cuts[j].value - cuts[i].value });
  return R;
}
const inBox = (l, lmax) => l[0] > -1e-9 && l[1] > -1e-9 && l[0] < lmax + 1e-9 && l[1] < lmax + 1e-9;

// Kelley's master: the maximum of the model over the box is at a vertex of the
// arrangement, a point where two of the rows above are active; the box may be
// a smaller rectangle [lo, hi] (the trust region of the bundle)
export function maxModel(cuts, lmax, lo = [0, 0], hi = [lmax, lmax]) {
  const R = rows(cuts, lmax).slice(4).concat([{ m: [1, 0], r: lo[0] }, { m: [1, 0], r: hi[0] }, { m: [0, 1], r: lo[1] }, { m: [0, 1], r: hi[1] }]);
  const inRect = l => l[0] > lo[0] - 1e-9 && l[1] > lo[1] - 1e-9 && l[0] < hi[0] + 1e-9 && l[1] < hi[1] + 1e-9;
  let best = null, bv = -Infinity;
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const l = solve2([R[i].m, R[j].m], [R[i].r, R[j].r]);
      if (!l || !inRect(l)) continue;
      const v = modelAt(cuts, l);
      if (v > bv + 1e-12) { bv = v; best = l; }
    }
  return { lam: best, value: bv };
}

// the proximal master: max model(l) - |l - c|^2 / 2t over the box. The function
// is strongly concave, so its maximum is the best feasible point among those
// that maximize a single cut minus the proximal term with up to two rows active.
export function proxMax(cuts, lmax, c, t) {
  const R = rows(cuts, lmax);
  const obj = l => modelAt(cuts, l) - ((l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2) / (2 * t);
  let best = null, bv = -Infinity;
  const consider = l => {
    if (!l) return;
    const p = [Math.min(lmax, Math.max(0, l[0])), Math.min(lmax, Math.max(0, l[1]))];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-9) return;
    const v = obj(p);
    if (v > bv + 1e-13) { bv = v; best = p; }
  };
  for (const k of cuts) {
    // no row active: l = c + t g
    consider([c[0] + t * k.slope[0], c[1] + t * k.slope[1]]);
    // one row active: maximize g.l - |l - c|^2/2t on the line m.l = r
    for (const { m, r } of R) {
      const p = [c[0] + t * k.slope[0], c[1] + t * k.slope[1]], mm = dot(m, m);
      if (mm < 1e-12) continue;
      const mu = (dot(m, p) - r) / mm;
      consider([p[0] - mu * m[0], p[1] - mu * m[1]]);
    }
  }
  // two rows active: a vertex
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++)
      consider(solve2([R[i].m, R[j].m], [R[i].r, R[j].r]));
  return { lam: best, value: bv };
}

// the restricted master in the primal: a convex combination of up to three
// active columns with sum alpha_k g_k <= 0, = 0 where l_i > 0, of least cost
export function primalPoint(problem, columns, lam) {
  if (!columns.length || !lam) return null;
  const cuts = columns.map(v => problem.cut(v));
  const vals = cuts.map(k => k.value + dot(k.slope, lam));
  const m = Math.min(...vals);
  const act = columns.map((v, i) => ({ v, k: cuts[i] })).filter((_, i) => vals[i] < m + 1e-6);
  let best = null, bc = Infinity;
  const ok = (g, i) => (lam[i] > 1e-7 ? Math.abs(g[i]) < 1e-6 : g[i] < 1e-6);
  const take = (al, set) => {
    if (al.some(a => a < -1e-9)) return;
    const g = [0, 1].map(i => set.reduce((s, e, j) => s + al[j] * e.k.slope[i], 0));
    if (!ok(g, 0) || !ok(g, 1)) return;
    const x = [0, 1].map(i => set.reduce((s, e, j) => s + al[j] * e.v[i], 0));
    const cost = dot(problem.c, x);
    if (cost < bc - 1e-12) { bc = cost; best = x; }
  };
  for (const a of act) take([1], [a]);
  for (let i = 0; i < act.length; i++)
    for (let j = i + 1; j < act.length; j++) {
      // alpha g_i + (1 - alpha) g_j = 0 on the components where l > 0
      const gi = act[i].k.slope, gj = act[j].k.slope;
      for (const c of [0, 1]) {
        const d = gi[c] - gj[c];
        if (Math.abs(d) < 1e-12) continue;
        const al = -gj[c] / d;
        if (al >= -1e-9 && al <= 1 + 1e-9) take([al, 1 - al], [act[i], act[j]]);
      }
    }
  for (let i = 0; i < act.length; i++)
    for (let j = i + 1; j < act.length; j++)
      for (let h = j + 1; h < act.length; h++) {
        const s = [act[i], act[j], act[h]];
        // two equations sum alpha g = 0, and sum alpha = 1
        const [g1, g2, g3] = s.map(e => e.k.slope);
        const M = [[g1[0] - g3[0], g2[0] - g3[0]], [g1[1] - g3[1], g2[1] - g3[1]]];
        const ab = solve2(M, [-g3[0], -g3[1]]);
        if (ab) take([ab[0], ab[1], 1 - ab[0] - ab[1]], s);
      }
  return best;
}

export function make(name) {
  const s = presets[name];
  const xs = s.polygon.map(p => p[0]), ys = s.polygon.map(p => p[1]);
  // the columns: the integer points of the polygon, or a given finite set
  const points = s.points ? s.points.map(p => [...p]) : [];
  if (!s.points)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++)
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
        if (inside(s.polygon, [x, y])) points.push([x, y]);
  const problem = {
    kind: 'lagrangian2d', name, ...s, points, hull: hull(points),
    bounds: [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...ys) - 0.5, Math.max(...ys) + 0.5],
    cost: v => dot(s.c, v),
    cut: v => ({ value: dot(s.c, v), slope: [dot(s.A[0], v) - s.b[0], dot(s.A[1], v) - s.b[1]], v }),
    oracle(l) {
      let best = null, bv = Infinity;
      for (const v of points) {
        const val = dot(s.c, v) + l[0] * (dot(s.A[0], v) - s.b[0]) + l[1] * (dot(s.A[1], v) - s.b[1]);
        if (val < bv - 1e-12) { bv = val; best = v; }
      }
      return { lam: l, value: bv, subgradient: [dot(s.A[0], best) - s.b[0], dot(s.A[1], best) - s.b[1]], column: best };
    },
  };
  problem.L = l => problem.oracle(l).value;
  // the optimum, i.e., the dual of the problem over the hull of the integer
  // points: Kelley's method with the oracle, which ends in finitely many steps
  const o0 = problem.oracle([0, 0]);
  const cols = [o0.column], cuts = [problem.cut(o0.column)];
  let top = maxModel(cuts, s.lmax);
  for (let it = 0; it < 500; it++) {
    const o = problem.oracle(top.lam);
    if (top.value - o.value < 1e-9) break;
    cols.push(o.column); cuts.push(problem.cut(o.column));
    top = maxModel(cuts, s.lmax);
  }
  problem.optimum = { lam: top.lam, value: top.value, x: primalPoint(problem, cols, top.lam) };
  // the two other values of the textbook: the integer optimum, over the points
  // that satisfy the couplings, and the continuous relaxation, over the polygon
  // cut by the couplings (Sutherland-Hodgman, then the best vertex)
  const feasible = v => s.A.every((a, r) => dot(a, v) <= s.b[r] + 1e-9);
  const ip = points.filter(feasible).sort((u, v) => dot(s.c, u) - dot(s.c, v))[0];
  problem.ip = ip ? { x: ip, value: dot(s.c, ip) } : null;
  let poly = s.polygon;
  for (const [r, a] of s.A.entries()) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = dot(a, P) - s.b[r], fq = dot(a, Q) - s.b[r];
      if (fp <= 0) out.push(P);
      if (fp * fq < 0) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    poly = out;
  }
  const lp = poly.sort((u, v) => dot(s.c, u) - dot(s.c, v))[0];
  problem.lp = lp && !s.points ? { x: lp, value: dot(s.c, lp), region: poly } : null;
  return problem;
}

// the level master: the projection of c onto {l in the box : model(l) >= level},
// a convex polygon; in two dimensions the projection is c itself, or its
// projection onto one side, or a vertex where two sides meet
export function levelProject(cuts, lmax, c, level) {
  const S = cuts.map(k => ({ m: [-k.slope[0], -k.slope[1]], r: k.value - level }))   // m.l <= r
    .concat([{ m: [-1, 0], r: 0 }, { m: [1, 0], r: lmax }, { m: [0, -1], r: 0 }, { m: [0, 1], r: lmax }]);
  const feas = l => l && S.every(({ m, r }) => dot(m, l) <= r + 1e-9);
  const d2 = l => (l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2;
  if (feas(c)) return c;
  let best = null, bd = Infinity;
  const consider = l => { if (feas(l) && d2(l) < bd - 1e-15) { bd = d2(l); best = l; } };
  for (const { m, r } of S) {
    const mm = dot(m, m);
    if (mm < 1e-12) continue;
    const mu = (dot(m, c) - r) / mm;
    consider([c[0] - mu * m[0], c[1] - mu * m[1]]);
  }
  for (let i = 0; i < S.length; i++)
    for (let j = i + 1; j < S.length; j++)
      consider(solve2([S[i].m, S[j].m], [S[i].r, S[j].r]));
  return best;
}

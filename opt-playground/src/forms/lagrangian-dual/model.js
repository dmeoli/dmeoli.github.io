// The Lagrangian dual of a tiny problem with two coupling constraints:
//   min c.x  s.t.  a1.x >= b1,  a2.x >= b2  (relaxed),  w.x <= W,  x in {0,1}^7,
// L(l) = l.b + min over the points x of the knapsack of (c - l1 a1 - l2 a2).x,
// for l >= 0: the minimum of one plane per point, concave and piecewise
// linear, and max L <= the optimum of the problem. A bundle method maximizes
// it from the planes (cuts) the oracle returns. No DOM: solid() runs in a
// worker for the download panel.

import { maxModel, proxMax, levelProject, modelAt } from '../../problems/lagrangian2d.js';
import { heightfield } from '../../print/index.js';

export const inst = {
  c: [5, 9, 4, 6, 8, 4, 9], a1: [2, 3, 4, 2, 2, 0, 4], a2: [0, 4, 3, 2, 0, 4, 2],
  w: [5, 3, 3, 4, 2, 2, 2], W: 13, b: [8, 7], lmax: 3,
};
const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);

// the points of the knapsack and their planes, value + slope.l
export const points = (() => {
  const n = inst.c.length, out = [];
  for (let m = 0; m < 1 << n; m++) {
    const x = Array.from({ length: n }, (_, j) => (m >> j) & 1);
    if (dot(inst.w, x) <= inst.W) out.push(x);
  }
  return out;
})();
export const cuts = points.map((x, id) => ({ id, x, value: dot(inst.c, x), slope: [inst.b[0] - dot(inst.a1, x), inst.b[1] - dot(inst.a2, x)] }));

export function oracle(l) {
  let best = null;
  for (const k of cuts) { const v = k.value + k.slope[0] * l[0] + k.slope[1] * l[1]; if (!best || v < best.v - 1e-12) best = { v, k }; }
  return { value: best.v, cut: best.k };
}
export const L = l => oracle(l).value;

// the integer optimum: the cheapest point that meets both relaxed rows
export const primalOpt = (() => {
  let best = null;
  for (const k of cuts) if (k.slope[0] <= 0 && k.slope[1] <= 0 && (!best || k.value < best.value)) best = k;
  return best;
})();

// a bundle method from l0: 'proximal' (proximal parameter t, descent m1),
// 'level' (level gamma) or 'kelley' (no stabilization). Each step: the trial
// point, its value, serious or null, the centre, and the cuts collected.
export function bundle({ algo = 'proximal', t = 0.25, m1 = 0.1, gamma = 0.3, l0 = [2.8, 2.7], maxit = 40 } = {}) {
  const o0 = oracle(l0), B = [o0.cut];
  let center = l0, fc = o0.value, best = o0.value;
  const steps = [{ lam: l0, value: o0.value, serious: true, center: l0, cut: o0.cut.id, nb: 1 }];
  for (let k = 0; k < maxit; k++) {
    let lam, serious;
    if (algo === 'kelley') {
      const m = maxModel(B, inst.lmax);
      if (m.value - best < 1e-7) break;
      lam = m.lam;
    } else if (algo === 'level') {
      // the gap between the model and the best value, up to a thousandth
      const up = maxModel(B, inst.lmax).value;
      if (up - best < 1e-3 * Math.max(1, Math.abs(best))) break;
      lam = levelProject(B, inst.lmax, center, best + gamma * (up - best));
    } else {
      const m = proxMax(B, inst.lmax, center, t), delta = modelAt(B, m.lam) - fc;
      if (delta < 1e-7) break;
      lam = m.lam;
      const o = oracle(lam);
      serious = o.value - fc >= m1 * delta;
    }
    // the same point again: the model cannot change any more
    const prev = steps.at(-1).lam;
    if (Math.hypot(lam[0] - prev[0], lam[1] - prev[1]) < 1e-9) break;
    const o = oracle(lam);
    if (serious === undefined) serious = o.value > fc + 1e-12;
    if (!B.includes(o.cut)) B.push(o.cut);
    if (serious) { center = lam; fc = o.value; }
    best = Math.max(best, o.value);
    steps.push({ lam, value: o.value, serious, center, cut: o.cut.id, nb: B.length });
  }
  return steps;
}

// the dual optimum: Kelley's method ends there in a few steps, since the
// oracle is exact and the cuts are finitely many
export const dualOpt = (() => {
  const st = bundle({ algo: 'kelley', maxit: 200 });
  let best = st[0];
  for (const s of st) if (s.value > best.value) best = s;
  return { lam: best.lam, value: best.value };
})();

// the cuts known after step k
export const cutsAt = (steps, k) => {
  const ids = [];
  for (let s = 0; s <= Math.min(k, steps.length - 1); s++) if (!ids.includes(steps[s].cut)) ids.push(steps[s].cut);
  return ids.map(i => cuts[i]);
};

// the lowest value of L on the box, at one of its corners (L is concave)
export const Lmin = Math.min(...[[0, 0], [0, inst.lmax], [inst.lmax, 0], [inst.lmax, inst.lmax]].map(L));

// o: { size (mm, the side of the square of the multipliers), relief (mm, the
// height from the lowest corner to the top), surface: 'dual' | 'model',
// algo, t, k (steps of the method), path (engrave it), base (mm under the
// lowest point), cell (mm of the grid) }
export function solid(o = {}, progress) {
  const { size = 80, relief = 30, surface = 'dual', path = true, base = 3, cell = 0.3 } = o;
  const steps = bundle(o), k = Math.min(o.k ?? Infinity, steps.length - 1);
  const B = surface === 'model' ? cutsAt(steps, k) : cuts;
  const n = Math.round(size / cell) + 1, d = size / (n - 1), sc = inst.lmax / size;
  const top = dualOpt.value, z = v => Math.max(0, (v - Lmin) / (top - Lmin) * relief);
  const H = new Float32Array(n * n);
  // the trial points in mm, and the optimum
  const P = steps.slice(0, k + 1).map(s => [s.lam[0] / sc, s.lam[1] / sc]), O = [dualOpt.lam[0] / sc, dualOpt.lam[1] / sc];
  const gw = 0.9, gd = 0.7, pr = 1.5, pd = 0.9, orad = 3, oh = 3.5;
  for (let j = 0; j < n; j++) {
    if (progress && j % 32 === 0) progress(j / n);
    for (let i = 0; i < n; i++) {
      const x = i * d, y = j * d, l = [x * sc, y * sc];
      let v = Infinity;
      for (const c of B) v = Math.min(v, c.value + c.slope[0] * l[0] + c.slope[1] * l[1]);
      let h = z(v);
      if (path) {
        // a groove along the path of the trial points, a pit at each
        let dmin = Infinity;
        for (let s = 1; s < P.length; s++) {
          const a = P[s - 1], b = P[s], ex = b[0] - a[0], ey = b[1] - a[1], wx = x - a[0], wy = y - a[1];
          const tt = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
          dmin = Math.min(dmin, Math.hypot(wx - tt * ex, wy - tt * ey));
        }
        if (dmin < gw) h -= gd * Math.sqrt(1 - (dmin / gw) ** 2);
        for (const p of P) { const r = Math.hypot(x - p[0], y - p[1]); if (r < pr) h = Math.min(h, z(v) - pd * Math.sqrt(1 - (r / pr) ** 2)); }
      }
      // the dual optimum as a raised cone
      const ro = Math.hypot(x - O[0], y - O[1]);
      if (ro < orad) h = Math.max(h, z(v) + oh * (1 - ro / orad));
      H[j * n + i] = Math.max(0, h);
    }
  }
  const m = heightfield(H, n, n, { dx: d, dy: d, base });
  m.steps = k; m.value = +dualOpt.value.toFixed(4);
  return m;
}

export const fileName = o => `lagrangian_dual_${o.surface || 'dual'}_${o.algo || 'proximal'}_${o.size}mm`;

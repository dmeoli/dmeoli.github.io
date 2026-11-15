// The algebra of the LP in three variables, without any drawing, so that
// tests/lp3d.html can check it:  max c.x  s.t.  A x <= b, x >= 0,  b >= 0 (the
// origin is a vertex, the first basis of the simplex). The constraints are kept
// as rows g.x <= h: the m rows of A, then -x_j <= 0.

export const instances = {
  chvatal: { label: 'Chvátal: max 5x1 + 4x2 + 3x3', c: [5, 4, 3],
    A: [[2, 3, 1], [4, 1, 2], [3, 4, 2]], b: [5, 11, 8] },
  klee: { label: 'Klee-Minty cube', c: [4, 2, 1],
    A: [[1, 0, 0], [4, 1, 0], [8, 4, 1]], b: [5, 25, 125] },
  house: { label: 'A house: box, roof, a corner cut', c: [2, 3, 4],
    A: [[1, 0, 0], [0, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]], b: [4, 4, 6, 6, 9] },
  random: { label: 'Random (5 rows)', random: true },
};

// a small seeded generator (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a bounded instance: positive rows, so that every x_j is bounded by every row
export function randomInstance(seed, m = 5) {
  const r = rng(seed), q = (lo, hi) => Math.round((lo + (hi - lo) * r()) * 10) / 10;
  const A = Array.from({ length: m }, () => [q(0.2, 2), q(0.2, 2), q(0.2, 2)]);
  return { label: 'Random', c: [q(0.5, 3), q(0.5, 3), q(0.5, 3)], A, b: A.map(() => q(4, 9)) };
}

export const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);

export function cons(P) {
  const G = [...P.A, [-1, 0, 0], [0, -1, 0], [0, 0, -1]], h = [...P.b, 0, 0, 0];
  const names = [...P.A.map((_, i) => `row ${i + 1}`), 'x1 ≥ 0', 'x2 ≥ 0', 'x3 ≥ 0'];
  return { G, h, names };
}

// Gaussian elimination with partial pivoting; null when singular
export function solve(M, r) {
  const n = r.length, a = M.map((row, i) => [...row, r[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i;
    if (Math.abs(a[p][k]) < 1e-12) return null;
    [a[k], a[p]] = [a[p], a[k]];
    for (let i = k + 1; i < n; i++) { const f = a[i][k] / a[k][k]; for (let j = k; j <= n; j++) a[i][j] -= f * a[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = a[i][n]; for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j]; x[i] = s / a[i][i]; }
  return x;
}

const scaleOf = P => Math.max(1, ...P.b.map(Math.abs));

// brute force: every triple of constraints, solved, kept when feasible; the
// vertices with their active sets, duplicates (degenerate vertices) merged
export function vertices(P) {
  const { G, h } = cons(P), K = G.length, tol = 1e-9 * scaleOf(P), V = [];
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) for (let k = j + 1; k < K; k++) {
    const x = solve([G[i], G[j], G[k]], [h[i], h[j], h[k]]);
    if (!x || G.some((g, q) => dot(g, x) > h[q] + tol)) continue;
    if (V.some(v => Math.hypot(v.x[0] - x[0], v.x[1] - x[1], v.x[2] - x[2]) < 1e-7 * scaleOf(P))) continue;
    V.push({ x, act: G.map((g, q) => q).filter(q => Math.abs(dot(G[q], x) - h[q]) < tol * 10) });
  }
  return V;
}

export function bruteOpt(P) {
  let best = null;
  for (const v of vertices(P)) { const z = dot(P.c, v.x); if (!best || z > best.z) best = { x: v.x, z }; }
  return best;
}

const rank = rows => {
  // rank of at most a few vectors in R^3, by elimination
  const a = rows.map(r => r.slice()); let rk = 0;
  for (let col = 0; col < 3 && rk < a.length; col++) {
    let p = rk; for (let i = rk + 1; i < a.length; i++) if (Math.abs(a[i][col]) > Math.abs(a[p][col])) p = i;
    if (Math.abs(a[p][col]) < 1e-10) continue;
    [a[rk], a[p]] = [a[p], a[rk]];
    for (let i = rk + 1; i < a.length; i++) { const f = a[i][col] / a[rk][col]; for (let j = col; j < 3; j++) a[i][j] -= f * a[rk][j]; }
    rk++;
  }
  return rk;
};

// the drawing of the polytope: the vertices, the faces (the vertices on one
// constraint, in order around it) and the edges (two vertices are adjacent when
// the constraints active at both have rank 2)
export function geometry(P) {
  const { G } = cons(P), V = vertices(P), faces = [], edges = [];
  G.forEach((g, k) => {
    const on = V.map((v, i) => i).filter(i => V[i].act.includes(k));
    if (on.length < 3) return;
    const cen = [0, 1, 2].map(d => on.reduce((s, i) => s + V[i].x[d], 0) / on.length);
    const n = g.map(x => x / Math.hypot(...g));
    // two directions in the plane of the face
    let u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t = dot(u, n); u = u.map((x, d) => x - t * n[d]); const nu = Math.hypot(...u); u = u.map(x => x / nu);
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const ang = i => { const d = V[i].x.map((x, e) => x - cen[e]); return Math.atan2(dot(d, w), dot(d, u)); };
    faces.push({ k, poly: on.sort((a, b) => ang(a) - ang(b)) });
  });
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const common = V[i].act.filter(q => V[j].act.includes(q));
    if (common.length >= 2 && rank(common.map(q => G[q])) === 2) edges.push([i, j]);
  }
  return { V, faces, edges };
}

// the primal simplex on the tableau, from the slack basis. Variables 0..2 are
// x1..x3, 3..m+2 the slacks s1..sm. The rule picks the entering variable among
// those with a positive reduced cost: Dantzig's the largest, Bland's the first;
// the ratio test breaks ties by the smallest index. Returns every basis met.
export function simplex(P, rule = 'dantzig') {
  const m = P.A.length, nv = 3 + m, eps = 1e-9;
  const T = P.A.map((row, i) => [...row, ...Array.from({ length: m }, (_, k) => (k === i ? 1 : 0)), P.b[i]]);
  const r = [...P.c, ...new Array(m).fill(0)];
  const basis = Array.from({ length: m }, (_, i) => 3 + i);
  const steps = [];
  const record = (enter, leave) => {
    const x = [0, 0, 0];
    basis.forEach((v, i) => { if (v < 3) x[v] = T[i][nv]; });
    const vals = new Array(nv).fill(0); basis.forEach((v, i) => { vals[v] = T[i][nv]; });
    steps.push({ basis: basis.slice(), x, z: dot(P.c, x), r: r.slice(), vals, y: r.slice(3).map(v => -v), enter, leave });
  };
  record(null, null);
  for (let it = 0; it < 60; it++) {
    const cand = r.map((v, j) => j).filter(j => !basis.includes(j) && r[j] > eps);
    if (!cand.length) { steps.at(-1).optimal = true; break; }
    const e = rule === 'bland' ? cand[0] : cand.reduce((a, j) => (r[j] > r[a] + 1e-12 ? j : a), cand[0]);
    let p = -1, best = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][e] <= eps) continue;
      const q = T[i][nv] / T[i][e];
      if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && basis[i] < basis[p])) { best = q; p = i; }
    }
    if (p < 0) { steps.at(-1).unbounded = true; break; }
    const piv = T[p][e];
    for (let j = 0; j <= nv; j++) T[p][j] /= piv;
    for (let i = 0; i < m; i++) if (i !== p && T[i][e] !== 0) { const f = T[i][e]; for (let j = 0; j <= nv; j++) T[i][j] -= f * T[p][j]; }
    const f = r[e]; for (let j = 0; j < nv; j++) r[j] -= f * T[p][j];
    const leave = basis[p]; basis[p] = e;
    record(e, leave);
  }
  return steps;
}

export const varName = (j, m) => (j < 3 ? `x${j + 1}` : `s${j - 2}`);

// the barrier method: for t > 0, x(t) maximizes t c.x + sum log(h - G x), the
// central path, with mu = 1/t; t = 0 gives the analytic center. The dual
// estimate is y_i = mu / s_i on the rows, and the gap b.y - c.x is (m + 3) mu.
// Points are returned densely (t grows by rho^(1/sub)); the iterates of the
// method are every sub-th point, t growing by rho.
export function barrier(P, { rho = 1 / 0.6, sub = 6, tol = 1e-8 } = {}) {
  const { G, h } = cons(P), K = G.length;
  const slack = x => h.map((v, q) => v - dot(G[q], x));
  const phi = (x, t) => { const s = slack(x); return s.some(v => v <= 0) ? -Infinity : t * dot(P.c, x) + s.reduce((a, v) => a + Math.log(v), 0); };
  const center = (x, t) => {
    for (let it = 0; it < 80; it++) {
      const s = slack(x), g = P.c.map(v => t * v), H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      G.forEach((row, q) => {
        for (let a = 0; a < 3; a++) { g[a] -= row[a] / s[q]; for (let b = 0; b < 3; b++) H[a][b] += row[a] * row[b] / (s[q] * s[q]); }
      });
      const d = solve(H, g);
      if (!d) break;
      const lam2 = dot(g, d);
      if (lam2 < 1e-14) break;
      let a = 1;
      const f0 = phi(x, t);
      while (a > 1e-12) {
        const y = x.map((v, i) => v + a * d[i]);
        if (phi(y, t) >= f0 + 0.25 * a * lam2) { x = y; break; }
        a *= 0.5;
      }
      if (a <= 1e-12) break;
    }
    return x;
  };
  // a strictly feasible start: a small multiple of (1, 1, 1), halved once more
  // after the first feasible one, so that no slack is nearly zero
  let x = [1, 1, 1].map(v => v * scaleOf(P));
  while (slack(x).some(v => v <= 0)) x = x.map(v => v / 2);
  x = x.map(v => v / 2);
  const point = (x, t) => {
    const s = slack(x), mu = t > 0 ? 1 / t : Infinity;
    const y = P.A.map((_, i) => (t > 0 ? mu / s[i] : NaN));
    return { t, mu, x: x.slice(), z: dot(P.c, x), y, dval: t > 0 ? dot(P.b, y) : NaN, gap: K * mu };
  };
  x = center(x, 0);
  const dense = [point(x, 0)];
  const scale = Math.max(1, Math.abs(dot(P.c, x)));
  let t = K / (5 * scale);
  const f = Math.pow(rho, 1 / sub);
  for (let k = 0; k < 2000; k++) {
    x = center(x, t);
    dense.push(point(x, t));
    if (K / t < tol * Math.max(1, Math.abs(dot(P.c, x))) && (dense.length - 1) % sub === 0) break;
    t *= f;
  }
  const iters = dense.map((_, i) => i).filter(i => i === 0 || (i - 1) % sub === 0);
  return { dense, iters };
}

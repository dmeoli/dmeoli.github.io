// The simplex method on a polytope in three variables, as a solid to print:
//   max c.x  s.t.  A x <= b,  x >= 0,  b >= 0,
// the origin being the first vertex (the slack basis). The axes are rescaled
// so that the polytope spans the unit cube (an affine change of variables,
// which keeps the vertices, the edges and the path of the simplex). No DOM
// here: the download panel runs solid() in a worker.

import { implicitSolid, onBed } from '../../print/index.js';

export const presets = {
  // a Klee-Minty cube with small coefficients, so that it stays close to a
  // cube; the rule of Dantzig still visits its 8 vertices
  klee: { en: 'Klee-Minty cube', it: 'Cubo di Klee-Minty', c: [4, 3, 2],
    A: [[1, 0, 0], [2.5, 1, 0], [3, 2.5, 1]], b: [2, 12, 72] },
  chvatal: { en: 'Chvátal, max 5x1 + 4x2 + 3x3', it: 'Chvátal, max 5x1 + 4x2 + 3x3', c: [5, 4, 3],
    A: [[2, 3, 1], [4, 1, 2], [3, 4, 2]], b: [5, 11, 8] },
  gem: { en: 'A cut gem', it: 'Una gemma tagliata', c: [1, 2, 3],
    A: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]], b: [4, 4, 4, 7, 7, 7, 9.5] },
  house: { en: 'A house with a cut corner', it: 'Una casa con un angolo tagliato', c: [2, 3, 4],
    A: [[1, 0, 0], [0, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]], b: [4, 4, 6, 6, 9] },
};

const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

function solve3(M, r) {
  const a = M.map((row, i) => [...row, r[i]]);
  for (let k = 0; k < 3; k++) {
    let p = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i;
    if (Math.abs(a[p][k]) < 1e-12) return null;
    [a[k], a[p]] = [a[p], a[k]];
    for (let i = k + 1; i < 3; i++) { const f = a[i][k] / a[k][k]; for (let j = k; j < 4; j++) a[i][j] -= f * a[k][j]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = a[i][3]; for (let j = i + 1; j < 3; j++) s -= a[i][j] * x[j]; x[i] = s / a[i][i]; }
  return x;
}

// the polytope: rows g.x <= h (the m rows of A, then -x_j <= 0), its vertices
// with their active rows, its edges and faces, and the scale of every axis
export function polytope(P) {
  const G = [...P.A, [-1, 0, 0], [0, -1, 0], [0, 0, -1]], h = [...P.b, 0, 0, 0], K = G.length;
  const tol = 1e-9 * Math.max(1, ...P.b), V = [];
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) for (let k = j + 1; k < K; k++) {
    const x = solve3([G[i], G[j], G[k]], [h[i], h[j], h[k]]);
    if (!x || G.some((g, q) => dot(g, x) > h[q] + tol)) continue;
    if (V.some(v => Math.hypot(...sub(v.x, x)) < 1e-7 * Math.max(1, ...P.b))) continue;
    V.push({ x, act: G.map((_, q) => q).filter(q => Math.abs(dot(G[q], x) - h[q]) < 10 * tol) });
  }
  const scale = [0, 1, 2].map(d => Math.max(...V.map(v => v.x[d])) || 1);
  for (const v of V) v.u = v.x.map((x, d) => x / scale[d]);
  const edges = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const com = V[i].act.filter(q => V[j].act.includes(q));
    if (com.length < 2) continue;
    // two vertices are adjacent when two independent rows are active at both
    let ok = false;
    for (let a = 0; a < com.length && !ok; a++) for (let b = a + 1; b < com.length && !ok; b++)
      ok = Math.hypot(...cross(G[com[a]], G[com[b]])) > 1e-9;
    if (ok) edges.push([i, j]);
  }
  // the faces in the scaled coordinates: the rows become gs.u <= h with
  // gs_j = g_j * scale_j; the vertices of a face in order around it
  const Gs = G.map(g => g.map((v, d) => v * scale[d]));
  const faces = [];
  Gs.forEach((g, k) => {
    const on = V.map((_, i) => i).filter(i => V[i].act.includes(k));
    if (on.length < 3) return;
    const n = g.map(v => v / Math.hypot(...g)), cen = [0, 1, 2].map(d => on.reduce((s, i) => s + V[i].u[d], 0) / on.length);
    let a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t = dot(a, n); a = a.map((v, d) => v - t * n[d]); const na = Math.hypot(...a); a = a.map(v => v / na);
    const w = cross(n, a);
    const ang = i => { const d = sub(V[i].u, cen); return Math.atan2(dot(d, w), dot(d, a)); };
    faces.push({ k, n, poly: on.sort((p, q) => ang(p) - ang(q)) });
  });
  return { G, h, Gs, V, edges, faces, scale };
}

// The primal simplex on the tableau from the slack basis; the entering
// variable is the one of largest reduced cost (Dantzig), the first with a
// positive one (Bland), or the one whose edge rises fastest in the scaled
// coordinates (steepest edge); ties of the ratio test go to the smallest index.
// Returns the vertices met, as points x, with the pivots.
export function simplex(P, c, rule = 'dantzig', scale = [1, 1, 1]) {
  const m = P.A.length, nv = 3 + m, eps = 1e-9;
  const T = P.A.map((row, i) => [...row, ...Array.from({ length: m }, (_, k) => (k === i ? 1 : 0)), P.b[i]]);
  const r = [...c, ...new Array(m).fill(0)], basis = Array.from({ length: m }, (_, i) => 3 + i);
  const point = () => { const x = [0, 0, 0]; basis.forEach((v, i) => { if (v < 3) x[v] = T[i][nv]; }); return x; };
  const steps = [{ x: point(), z: 0, enter: null, leave: null }];
  let status = 'limit';
  for (let it = 0; it < 50; it++) {
    const cand = r.map((_, j) => j).filter(j => !basis.includes(j) && r[j] > eps);
    if (!cand.length) { status = 'optimal'; break; }
    let e = cand[0];
    if (rule === 'dantzig') e = cand.reduce((a, j) => (r[j] > r[a] + 1e-12 ? j : a), cand[0]);
    else if (rule === 'steepest') {
      const len = j => {
        const d = [0, 0, 0];
        if (j < 3) d[j] = 1;
        basis.forEach((v, i) => { if (v < 3) d[v] = -T[i][j]; });
        return Math.hypot(...d.map((x, k) => x / scale[k])) || 1;
      };
      e = cand.reduce((a, j) => (r[j] / len(j) > r[a] / len(a) + 1e-12 ? j : a), cand[0]);
    }
    let p = -1, best = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][e] <= eps) continue;
      const q = T[i][nv] / T[i][e];
      if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && basis[i] < basis[p])) { best = q; p = i; }
    }
    if (p < 0) { status = 'unbounded'; break; }
    const piv = T[p][e];
    for (let j = 0; j <= nv; j++) T[p][j] /= piv;
    for (let i = 0; i < m; i++) if (i !== p && T[i][e] !== 0) { const f = T[i][e]; for (let j = 0; j <= nv; j++) T[i][j] -= f * T[p][j]; }
    const f = r[e]; for (let j = 0; j < nv; j++) r[j] -= f * T[p][j];
    const leave = basis[p]; basis[p] = e;
    const x = point();
    steps.push({ x, z: dot(c, x), enter: e, leave, degenerate: best < 1e-12 });
  }
  return { steps, status };
}

// the path as indices of vertices, the degenerate pivots (same vertex) merged
export function path(poly, steps) {
  const near = x => {
    let bi = 0, bd = Infinity;
    poly.V.forEach((v, i) => { const d = Math.hypot(...sub(v.x, x)); if (d < bd) { bd = d; bi = i; } });
    return bi;
  };
  const out = [];
  for (const s of steps) { const i = near(s.x); if (out.at(-1) !== i) out.push(i); }
  return out;
}

export const varName = j => (j < 3 ? `x${j + 1}` : `s${j - 2}`);

// a cone, or a tapered capsule, from a (radius ra) to b (radius rb): the
// exact distance of I. Quilez
function cappedCone(p, a, b, ra, rb) {
  const ba = sub(b, a), pa = sub(p, a), baba = dot(ba, ba), papa = dot(pa, pa), paba = dot(pa, ba) / baba;
  const x = Math.sqrt(Math.max(0, papa - paba * paba * baba)), rba = rb - ra;
  const cax = Math.max(0, x - (paba < 0.5 ? ra : rb)), cay = Math.abs(paba - 0.5) - 0.5;
  const k = rba * rba + baba, f = Math.min(1, Math.max(0, (rba * (x - ra) + paba * baba) / k));
  const cbx = x - ra - f * rba, cby = paba - f, s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
}

// distance from p to the segment a-b, given as six numbers in S at k
function segDist(S, k, x, y, z) {
  const ax = S[k], ay = S[k + 1], az = S[k + 2], ex = S[k + 3] - ax, ey = S[k + 4] - ay, ez = S[k + 5] - az;
  const wx = x - ax, wy = y - ay, wz = z - az;
  const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / (ex * ex + ey * ey + ez * ez || 1)));
  const qx = wx - t * ex, qy = wy - t * ey, qz = wz - t * ez;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

// everything the print needs, in millimetres: the polytope of side `size`,
// the edges, the path and the arrow of the objective from the optimum
export function layout({ preset = 'klee', c, rule = 'dantzig', size = 80 } = {}) {
  const P = presets[preset] || presets.klee, cc = c || P.c;
  const poly = polytope(P), run = simplex(P, cc, rule, poly.scale), idx = path(poly, run.steps);
  const mm = v => v.u.map(u => u * size);
  // the objective in the scaled coordinates: c.x = sum c_j s_j u_j
  const cu = cc.map((v, d) => v * poly.scale[d]), cn = Math.hypot(...cu) || 1;
  return { P, poly, run, idx, mm, dir: cu.map(v => v / cn), c: cc };
}

// o: { preset, c: [c1, c2, c3], rule, size (mm, the side of the box of the
// polytope), style: 'solid' | 'struts', tube (radius of the path, mm),
// arrow (boolean), base (boolean), baseThick (mm), cells (cells across the
// size: 120 for the print, fewer for a preview) }
export function solid(o = {}, progress) {
  const { size = 80, style = 'solid', tube = 1.6, arrow = false, base = false, baseThick = 2, cells = 120 } = o;
  const L = layout(o), { poly, idx, mm } = L;
  const pathSet = new Set();
  for (let k = 1; k < idx.length; k++) pathSet.add(Math.min(idx[k - 1], idx[k]) + ':' + Math.max(idx[k - 1], idx[k]));
  const seg = (list) => { const S = new Float64Array(6 * list.length); list.forEach(([i, j], k) => { S.set([...mm(poly.V[i]), ...mm(poly.V[j])], 6 * k); }); return S; };
  const other = poly.edges.filter(([i, j]) => !pathSet.has(i + ':' + j));
  const onPath = [];
  for (let k = 1; k < idx.length; k++) onPath.push([idx[k - 1], idx[k]]);
  const So = seg(other), Sp = seg(onPath), Sa = seg(poly.edges);
  const rows = poly.Gs.map((g, k) => { const n = Math.hypot(...g); return [g[0] / n, g[1] / n, g[2] / n, poly.h[k] / n * size]; });
  const start = mm(poly.V[idx[0]]), opt = mm(poly.V[idx.at(-1)]);
  const rs = Math.max(0.8, tube * 0.6), groove = Math.max(0.5, tube * 0.45), ro = tube * 1.9;
  const arrowLen = 0.28 * size, tip = opt.map((v, d) => v + L.dir[d] * arrowLen), neck = opt.map((v, d) => v + L.dir[d] * (arrowLen - 3.2 * tube));
  const zcut = style === 'struts' ? -0.4 * rs : 0;
  const VP = Float64Array.from(poly.V.flatMap(mm)), rv = 1.5 * rs;
  const ball = (q, r, x, y, z) => Math.sqrt((x - q[0]) ** 2 + (y - q[1]) ** 2 + (z - q[2]) ** 2) - r;
  // far from every edge (beyond the largest radius) only the sign matters, so
  // the polytope alone answers there
  const reach = Math.max(ro, tube, rv) + 0.5;
  const f = (x, y, z) => {
    let F, Fp = -Infinity;
    for (const r of rows) Fp = Math.max(Fp, r[0] * x + r[1] * y + r[2] * z - r[3]);
    if (style === 'struts') {
      if (Fp > reach && !arrow && !base) return Fp;
      F = Infinity;
      for (let k = 0; k < Sa.length; k += 6) F = Math.min(F, segDist(Sa, k, x, y, z) - rs);
      for (let k = 0; k < VP.length; k += 3) {
        const dx = x - VP[k], dy = y - VP[k + 1], dz = z - VP[k + 2];
        F = Math.min(F, Math.sqrt(dx * dx + dy * dy + dz * dz) - rv);
      }
    } else {
      if (Fp < -reach) return Math.max(Fp, zcut - z);
      if (Fp > reach && !arrow && !base) return Fp;
      // the edges off the path engraved as rounded grooves
      let g = Infinity;
      for (let k = 0; k < So.length; k += 6) g = Math.min(g, segDist(So, k, x, y, z) - groove);
      F = Math.max(Fp, -g);
    }
    for (let k = 0; k < Sp.length; k += 6) F = Math.min(F, segDist(Sp, k, x, y, z) - tube);
    F = Math.min(F, ball(opt, ro, x, y, z), ball(start, 1.35 * tube, x, y, z));
    if (arrow) {
      F = Math.min(F, cappedCone([x, y, z], opt, neck, 0.75 * tube, 0.75 * tube));
      F = Math.min(F, cappedCone([x, y, z], neck, tip, 2 * tube, 0.05));
    }
    F = Math.max(F, zcut - z);
    if (base) F = Math.min(F, Math.max(-baseThick + zcut - z, z - zcut - 0.01, x - size - 6, -6 - x, y - size - 6, -6 - y));
    return F;
  };
  const pad = ro + 2, hi = [size + pad, size + pad, size + pad];
  if (arrow) for (let d = 0; d < 3; d++) hi[d] = Math.max(hi[d], tip[d] + 2 * tube + 1);
  const lo = [-pad - (base ? 6 : 0), -pad - (base ? 6 : 0), zcut - (base ? baseThick : 0) - 0.5];
  if (base) { hi[0] = Math.max(hi[0], size + 6.5); hi[1] = Math.max(hi[1], size + 6.5); }
  const h = size / cells;
  const m = implicitSolid(f, [lo, hi], h, { progress });
  onBed(m);
  m.path = idx.length; m.vertices = poly.V.length;
  return m;
}

export const fileName = o => `simplex_${o.preset || 'klee'}_${o.rule || 'dantzig'}_${o.style || 'solid'}_${o.size}mm${o.base ? '_base' : ''}`;

// Escher monster tiles: Escherization after Kaplan and Salesin (2000) in a
// simple form. The goal is the silhouette of a monster; for a tiling type
// given by the kinds of its edges (Heesch's notation: T an edge translated
// onto its partner, C an edge turned by a half turn about its midpoint) the
// tile is built from the corners chosen on the outline of the goal, moved to
// the nearest positions the type allows, with each edge the average of the
// pieces of outline it must stand for; simulated annealing chooses the
// corners that deform the goal least. The tiles are printed as flat
// interlocking pieces, laid in their places in the tiling with a clearance.

import { merge, triangulate, signedArea, extrude } from '../../print/index.js';
import { rng, annulus } from '../fantasy/util.js';

export const TYPES = {
  TTTT: { k: 4, kinds: 'TTTT', pairs: [[0, 2], [1, 3]] },
  TTTTTT: { k: 6, kinds: 'TTTTTT', pairs: [[0, 3], [1, 4], [2, 5]] },
  CCCC: { k: 4, kinds: 'CCCC', pairs: [] },
  TCCTCC: { k: 6, kinds: 'TCCTCC', pairs: [[0, 3]] },
};

/* --------------------------------------------------------- the monster -- */

// the outline of a monster, star-shaped around its belly: a body of radius 1
// with bumps for horns or ears, arms, feet and a tail, the size of each drawn
// from the seed; n points counterclockwise, the head up, eyes in o.eyes
export function monster(seed, n = 120) {
  const r = rng(seed * 101 + 7);
  const horn = r() < 0.6, B = [];
  // bumps [angle from the top, clockwise; height; width]
  const ha = r.range(0.35, 0.6), hh = horn ? r.range(0.8, 1.3) : r.range(0.5, 0.8), hw = horn ? r.range(0.07, 0.11) : r.range(0.14, 0.2);
  B.push([ha, hh, hw], [-ha, hh, hw]);
  const aa = r.range(1.35, 1.75), ah = r.range(0.45, 0.8), aw = r.range(0.1, 0.16);
  B.push([aa, ah, aw], [-aa, ah * r.range(0.8, 1.2), aw]);
  const fa = r.range(2.55, 2.85), fh = r.range(0.4, 0.6), fw = r.range(0.12, 0.18);
  B.push([fa, fh, fw], [-fa, fh, fw]);
  if (r() < 0.7) B.push([r.range(2.0, 2.3) * (r() < 0.5 ? 1 : -1), r.range(0.6, 1.0), r.range(0.07, 0.1)]);
  const wide = r.range(1.0, 1.2), belly = r.range(0.0, 0.2);
  const P = [];
  for (let i = 0; i < n; i++) {
    // counterclockwise from the top: alpha goes from 0 to -2 pi
    const a = -2 * Math.PI * i / n;
    let rad = 1 + belly * Math.cos(a - Math.PI);
    for (const [b, h, w] of B) { const d = Math.atan2(Math.sin(a - b), Math.cos(a - b)); rad += h * Math.exp(-d * d / (2 * w * w)); }
    P.push([wide * rad * Math.sin(a), rad * Math.cos(a)]);
  }
  const eyes = [[-0.32, 0.38], [0.32, 0.38]];
  return { P: resample(P, n), eyes };
}

/* ------------------------------------------------------------- polylines -- */

const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// a closed polyline resampled to n points equally spaced by arc length,
// starting at its first point
export function resample(P, n) {
  const m = P.length, cum = [0];
  for (let i = 1; i <= m; i++) cum.push(cum[i - 1] + len(P[i - 1], P[i % m]));
  const L = cum[m], out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = L * i / n;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = P[j], b = P[(j + 1) % m];
    out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return out;
}

// an open polyline resampled to k + 1 points, both ends kept
function resampleOpen(P, k) {
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + len(P[i - 1], P[i]));
  const L = cum[cum.length - 1], out = [];
  let j = 0;
  for (let i = 0; i <= k; i++) {
    const s = L * i / k;
    while (j < P.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([P[j][0] + t * (P[j + 1][0] - P[j][0]), P[j][1] + t * (P[j + 1][1] - P[j][1])]);
  }
  return out;
}

// the points S, whose ends are S[0] and S[last], moved by the similarity that
// takes those ends to A and B
function fitEnds(S, A, B) {
  const a = S[0], b = S[S.length - 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = B[0] - A[0], vy = B[1] - A[1];
  const d = ux * ux + uy * uy || 1, cr = (vx * ux + vy * uy) / d, ci = (vy * ux - vx * uy) / d;
  return S.map(([x, y]) => { const px = x - a[0], py = y - a[1]; return [A[0] + cr * px - ci * py, A[1] + ci * px + cr * py]; });
}

/* --------------------------------------------------------------- a tile -- */

// the tile of type ty with its corners at indices c of the goal G: returns
// { outline, corners, edges }, or null if the tile crosses itself
export function buildTile(G, ty, c) {
  const { k, kinds, pairs } = TYPES[ty], N = G.length;
  const sec = i => { const out = []; for (let q = c[i]; ; q = (q + 1) % N) { out.push(G[q]); if (q === c[(i + 1) % k]) break; } return out; };
  // the corners moved to the nearest positions of the type: a T pair (i, j)
  // needs P[j + 1] - P[i] = P[j] - P[i + 1]
  let P = c.map(q => [...G[q]]);
  if (ty === 'TTTT' || ty === 'TTTTTT') {
    // every edge translated onto the opposite one: the polygon of the
    // corners is centrally symmetric, and the nearest such polygon keeps the
    // mean and the differences of opposite corners
    const h = k / 2, cx = P.reduce((s, p) => s + p[0], 0) / k, cy = P.reduce((s, p) => s + p[1], 0) / k;
    P = P.map((p, i) => { const o = P[(i + h) % k]; return [cx + (p[0] - o[0]) / 2, cy + (p[1] - o[1]) / 2]; });
  } else for (const [i, j] of pairs) {
    // one pair: P[j + 1] - P[i] = P[j] - P[i + 1], met by moving the four
    // corners by the same amount
    const i1 = (i + 1) % k, j1 = (j + 1) % k;
    const ex = (P[j1][0] - P[i][0] - (P[j][0] - P[i1][0])) / 4, ey = (P[j1][1] - P[i][1] - (P[j][1] - P[i1][1])) / 4;
    P[j1][0] -= ex; P[j1][1] -= ey; P[i][0] += ex; P[i][1] += ey;
    P[j][0] += ex; P[j][1] += ey; P[i1][0] -= ex; P[i1][1] -= ey;
  }
  const E = new Array(k), K = i => Math.max(3, Math.round(sec(i).length - 1));
  for (const [i, j] of pairs) {
    const n = Math.max(3, Math.round((K(i) + K(j)) / 2)), i1 = (i + 1) % k, j1 = (j + 1) % k;
    const v = [P[j1][0] - P[i][0], P[j1][1] - P[i][1]];
    const a = fitEnds(resampleOpen(sec(i), n), P[i], P[i1]);
    const b = fitEnds(resampleOpen(sec(j), n), P[j], P[j1]).reverse().map(([x, y]) => [x - v[0], y - v[1]]);
    E[i] = a.map((p, q) => [(p[0] + b[q][0]) / 2, (p[1] + b[q][1]) / 2]);
    E[j] = E[i].map(([x, y]) => [x + v[0], y + v[1]]).reverse();
  }
  for (let i = 0; i < k; i++) {
    if (kinds[i] !== 'C') continue;
    const n = 2 * Math.max(2, Math.round(K(i) / 2)), A = P[i], B2 = P[(i + 1) % k], m = [(A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2];
    const a = fitEnds(resampleOpen(sec(i), n), A, B2), b = a.slice().reverse().map(([x, y]) => [2 * m[0] - x, 2 * m[1] - y]);
    E[i] = a.map((p, q) => [(p[0] + b[q][0]) / 2, (p[1] + b[q][1]) / 2]);
  }
  const outline = [];
  for (let i = 0; i < k; i++) outline.push(...E[i].slice(0, -1));
  if (crosses(outline)) return null;
  return { outline, corners: P, edges: E, type: ty };
}

// true if two sides of the closed polyline cross (neighbors excepted)
function crosses(P) {
  const n = P.length, o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = P[j], d = P[(j + 1) % n];
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])) continue;
      if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
  }
  return false;
}

// the deformation: mean squared distance between the tile and the goal,
// both resampled by arc length from the first corner, over the area of the
// goal (so that it does not depend on the scale)
function cost(G, T, c0) {
  const n = G.length, g = resample([...G.slice(c0), ...G.slice(0, c0)], n), t = resample(T.outline, n);
  let s = 0;
  for (let i = 0; i < n; i++) s += (g[i][0] - t[i][0]) ** 2 + (g[i][1] - t[i][1]) ** 2;
  return s / n / Math.abs(signedArea(G));
}

// simulated annealing over the corner indices of one type
export function escherize(G, ty, seed = 1, iters = 2500) {
  const { k } = TYPES[ty], N = G.length, r = rng(seed * 13 + ty.length);
  let c = Array.from({ length: k }, (_, i) => Math.round(i * N / k + r.int(Math.round(N / k / 2))) % N).sort((a, b) => a - b);
  const score = cc => { const T = buildTile(G, ty, cc); return T ? [cost(G, T, cc[0]), T] : [Infinity, null]; };
  let [f, T] = score(c), best = { f, T, c };
  const T0 = 0.02;
  for (let it = 0; it < iters; it++) {
    const temp = T0 * Math.pow(0.002, it / iters), d = c.slice();
    if (r() < 0.15) { const s = 1 + r.int(3); for (let i = 0; i < k; i++) d[i] = (d[i] + s) % N; d.sort((a, b) => a - b); }
    else {
      const i = r.int(k), step = (r() < 0.5 ? -1 : 1) * (1 + r.int(3)), lo = d[(i - 1 + k) % k], hi = d[(i + 1) % k];
      const q = (d[i] + step + N) % N, gap = (x, y) => (y - x + N) % N;
      if (gap(lo, q) < 3 || gap(q, hi) < 3 || gap(lo, q) + gap(q, hi) !== gap(lo, hi)) continue;
      d[i] = q; d.sort((a, b) => a - b);
    }
    const [g, U] = score(d);
    if (g < f || f === Infinity || r() < Math.exp(-(g - f) / temp)) { c = d; f = g; T = U; if (f < best.f) best = { f, T, c }; }
  }
  return { cost: best.f, tile: best.T, corners: best.c };
}

/* ----------------------------------------------------------- the tiling -- */

const rot = (m, [x, y]) => [2 * m[0] - x, 2 * m[1] - y];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// the motions of the tiling: two lattice vectors, and the half turn (if any)
// that maps the tile onto its second orientation
export function motions(T) {
  const P = T.corners, k = P.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  if (T.type === 'TTTT') return { a: sub(P[3], P[0]), b: sub(P[0], P[1]), half: null };
  if (T.type === 'TTTTTT') return { a: sub(P[4], P[0]), b: sub(P[5], P[1]), half: null };
  const m = i => mid(P[i], P[(i + 1) % k]);
  if (T.type === 'CCCC') return { a: sub(m(1), m(0)).map(x => 2 * x), b: sub(m(2), m(1)).map(x => 2 * x), half: m(0) };
  // 2 (m2 - m1) = P3 - P1 is the translation of the T pair again
  return { a: sub(P[4], P[0]), b: sub(m(4), m(1)).map(x => 2 * x), half: m(1) };
}

// the tiles within radius R of the center of the tile: [{ P, flip: 0 | 1, i, j }]
export function tiling(T, R) {
  const { a, b, half } = motions(T), out = [];
  const c0 = T.outline.reduce((s, p) => [s[0] + p[0] / T.outline.length, s[1] + p[1] / T.outline.length], [0, 0]);
  const copies = half ? [T.outline, T.outline.map(p => rot(half, p))] : [T.outline];
  const span = Math.ceil(R / Math.min(Math.hypot(...a), Math.hypot(...b))) + 2;
  for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) copies.forEach((C, f) => {
    const dx = i * a[0] + j * b[0], dy = i * a[1] + j * b[1];
    const cx = (f ? 2 * half[0] - c0[0] : c0[0]) + dx, cy = (f ? 2 * half[1] - c0[1] : c0[1]) + dy;
    const d = Math.hypot(cx - c0[0], cy - c0[1]);
    if (d <= R) out.push({ P: C.map(([x, y]) => [x + dx, y + dy]), flip: f, i, j, d, c: [cx, cy] });
  });
  return out.sort((p, q) => p.d - q.d);
}

/* ------------------------------------------------------------ the solid -- */

// the polygon moved inwards by d (vertices along the bisectors, the miter
// limited), for the clearance between printed tiles
function inset(P, d) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m);
    if (ml < 1e-9) { m = n1; ml = 1; }
    const k = Math.min(2, 1 / Math.max(0.5, (m[0] * n1[0] + m[1] * n1[1]) / ml));
    out.push([b[0] + d * k * m[0] / ml, b[1] + d * k * m[1] / ml]);
  }
  return out;
}

// drops points closer than eps to the previous one, and nearly straight ones
function clean(P, eps) {
  let Q = P.filter((p, i) => len(p, P[(i + 1) % P.length]) > eps);
  Q = Q.filter((p, i) => {
    const a = Q[(i - 1 + Q.length) % Q.length], c = Q[(i + 1) % Q.length];
    return Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) > eps * eps * 0.05;
  });
  return Q;
}

const inside = (P, [x, y]) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// the design for the settings o: the goal, the best tile and its tiling
let memo = null;
export function design(o) {
  const key = `${o.seed}|${o.type}|${o.iters}`;
  if (memo && memo.key === key) return memo.D;
  const D = designOf(o);
  memo = { key, D };
  return D;
}
function designOf(o) {
  const goal = monster(o.seed, 120);
  const types = o.type === 'auto' ? Object.keys(TYPES) : [o.type];
  let best = null;
  for (const ty of types) {
    const e = escherize(goal.P, ty, o.seed, o.iters || 2500);
    if (e.tile && (!best || e.cost < best.cost)) best = e;
  }
  return { goal, ...best };
}

// o: seed, type ('auto' or one of TYPES), count (tiles printed), size (mm,
// the largest side of one tile), thick (mm), gap (clearance, mm)
export function solid(o, progress) {
  const D = design(o);
  if (progress) progress(0.5);
  if (!D.tile) throw new Error('no tile found');
  const T = D.tile, xs = T.outline.map(p => p[0]), ys = T.outline.map(p => p[1]);
  const k = (o.size || 40) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const thick = o.thick ?? 3, gap = o.gap ?? 0.3, tiles = tiling(T, 4 * Math.max(Math.hypot(...motions(T).a), Math.hypot(...motions(T).b))).slice(0, o.count || 6);
  const { half } = motions(T), parts = [];
  for (const t of tiles) {
    // ear clipping fails on points nearly in line or on a corner pinched by
    // the inset: cleaned harder, then with fewer points, until it works
    let P, V, tri = null;
    for (const [eps, np] of [[0.05, 0], [0.15, 0], [0.3, 90], [0.3, 60], [0.5, 40]]) {
      const Q = np ? resample(t.P, np) : t.P;
      P = clean(inset(Q.map(([x, y]) => [x * k, y * k]), gap / 2), eps);
      V = signedArea(P) > 0 ? P : P.slice().reverse();
      try { tri = triangulate(V); break; } catch (e) { tri = null; }
    }
    if (!tri) continue;
    parts.push(extrude({ V, T: tri, loops: [[...V.keys()]] }, 0, thick));
    // the eyes, as two small studs where they fall inside the piece
    const dx = t.P[0][0] - (t.flip ? 2 * half[0] - T.outline[0][0] : T.outline[0][0]), dy = t.P[0][1] - (t.flip ? 2 * half[1] - T.outline[0][1] : T.outline[0][1]);
    for (const e of D.goal.eyes) {
      const q = t.flip ? [2 * half[0] - e[0] + dx, 2 * half[1] - e[1] + dy] : [e[0] + dx, e[1] + dy];
      const p = [q[0] * k, q[1] * k], er = Math.max(0.8, 0.09 * k);
      if (inside(P, p) && inside(P, [p[0] + er, p[1]]) && inside(P, [p[0] - er, p[1]])) parts.push(annulus(0, er, thick - 0.1, thick + 0.8, 20, p[0], p[1]));
    }
  }
  const m = merge(...parts);
  m.note = `${T.type} · ${(100 * D.cost).toFixed(1)}`;
  return m;
}

export const fileName = o => `escher_monster_${o.type}_s${o.seed}_${o.count}tiles_${o.size}mm`;

// the view: the solid, and for the drawing the goal, the tile, its corners
// and the tiling around it (plain arrays, which the worker passes back)
export function preview(o, progress) {
  const m = solid(o, progress), D = design(o);
  m.goal = D.goal.P; m.outline = D.tile.outline; m.corners = D.tile.corners; m.type = D.tile.type; m.cost = D.cost;
  m.tiles = tiling(D.tile, 3.2 * Math.max(...D.goal.P.map(p => Math.hypot(p[0], p[1])))).map(t => [t.flip, t.P]);
  return m;
}

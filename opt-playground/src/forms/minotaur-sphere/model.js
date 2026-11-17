// The Minotaur's spherical labyrinth: the cells are the vertices of a
// geodesic sphere (an icosahedron whose faces are cut into f^2 triangles and
// pushed onto the sphere), so that each cell is a hexagon or one of 12
// pentagons; the passages are a uniform spanning tree of their graph, drawn
// by Wilson's algorithm (1996); the walls stand on the sides of the cells
// that the tree does not cross. The solid is the ball with the walls in
// relief, cut flat at the bottom or split into two hemispheres.

import { isosurface, dropCrumbs, merge, transform } from '../../print/index.js';
import { Field } from '../mathematics/field.js';
import { rng, nrm } from '../fantasy/util.js';

// the geodesic sphere of frequency f: unit vertices, faces, edges
export function geodesic(f) {
  const t = (1 + Math.sqrt(5)) / 2;
  const V0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(nrm);
  const F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const V = [], key = new Map(), F = [];
  const vid = p => {
    const q = nrm(p), k = q.map(x => Math.round(x * 1e6)).join();
    let i = key.get(k);
    if (i === undefined) { i = V.length; V.push(q); key.set(k, i); }
    return i;
  };
  for (const [a, b, c] of F0) {
    const A = V0[a], B = V0[b], C = V0[c], id = [];
    const pt = (i, j) => { const k = f - i - j; return [0, 1, 2].map(q => (A[q] * k + B[q] * i + C[q] * j) / f); };
    for (let i = 0; i <= f; i++) { id[i] = []; for (let j = 0; i + j <= f; j++) id[i][j] = vid(pt(i, j)); }
    for (let i = 0; i < f; i++) for (let j = 0; i + j < f; j++) {
      F.push([id[i][j], id[i + 1][j], id[i][j + 1]]);
      if (i + j + 1 < f) F.push([id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]]);
    }
  }
  const E = new Map(), adj = V.map(() => []);
  F.forEach((fc, k) => {
    for (let e = 0; e < 3; e++) {
      const a = fc[e], b = fc[(e + 1) % 3], kk = a < b ? a * V.length + b : b * V.length + a;
      if (!E.has(kk)) { E.set(kk, { a: Math.min(a, b), b: Math.max(a, b), faces: [] }); adj[a].push(b); adj[b].push(a); }
      E.get(kk).faces.push(k);
    }
  });
  return { V, F, E: [...E.values()], adj };
}

// a uniform spanning tree by Wilson's algorithm: loop-erased random walks
// from each vertex not yet in the tree until they hit it; returns parent[]
export function wilson(adj, r) {
  const n = adj.length, inTree = new Uint8Array(n), next = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1);
  const root = r.int(n);
  inTree[root] = 1;
  for (let s = 0; s < n; s++) {
    let u = s;
    // the walk remembers only the last exit of each vertex, which erases loops
    while (!inTree[u]) { next[u] = adj[u][r.int(adj[u].length)]; u = next[u]; }
    for (u = s; !inTree[u]; u = next[u]) { inTree[u] = 1; parent[u] = next[u]; }
  }
  return parent;
}

// the maze of the settings: walls as arcs between centroids of faces, the
// start (the cell nearest the north pole) and the goal (the cell farthest
// from it along the passages), and the way between them
export function maze({ freq = 6, seed = 1 }) {
  const G = geodesic(freq), r = rng(seed * 7 + 1), parent = wilson(G.adj, r);
  const open = new Set();
  parent.forEach((p, u) => { if (p >= 0) open.add(Math.min(u, p) * G.V.length + Math.max(u, p)); });
  const cen = G.F.map(([a, b, c]) => nrm([0, 1, 2].map(q => G.V[a][q] + G.V[b][q] + G.V[c][q])));
  const walls = [];
  for (const e of G.E) if (!open.has(e.a * G.V.length + e.b)) walls.push([cen[e.faces[0]], cen[e.faces[1]]]);
  let start = 0;
  G.V.forEach((v, i) => { if (v[2] > G.V[start][2]) start = i; });
  // distances along the tree from the start
  const tadj = G.V.map(() => []);
  parent.forEach((p, u) => { if (p >= 0) { tadj[u].push(p); tadj[p].push(u); } });
  const dist = new Int32Array(G.V.length).fill(-1), from = new Int32Array(G.V.length).fill(-1), q = [start];
  dist[start] = 0;
  while (q.length) { const u = q.shift(); for (const v of tadj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; from[v] = u; q.push(v); } }
  let goal = start;
  dist.forEach((d, i) => { if (d > dist[goal]) goal = i; });
  const way = [];
  for (let u = goal; u >= 0; u = from[u]) way.push(G.V[u]);
  return { V: G.V, walls, start: G.V[start], goal: G.V[goal], way, cells: G.V.length, length: dist[goal] };
}

// points along the great circle from a to b (unit vectors), k + 1 of them
function arc(a, b, k) {
  const w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), s = Math.sin(w) || 1, out = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k, p = Math.sin((1 - t) * w) / s, q = Math.sin(t * w) / s;
    out.push([0, 1, 2].map(c => p * a[c] + q * b[c]));
  }
  return out;
}

// o: freq, seed, mode ('cut' or 'halves'), size (diameter with the walls,
// mm), wall (height, mm), width (of a wall, mm), res
export function solid(o, progress) {
  const M = maze(o), size = o.size || 80, H = o.wall ?? 2.4, rw = (o.width ?? 1.6) / 2;
  const R = size / 2 - H, Rw = R + H - rw;
  const h = size / (o.res === 'fine' ? 230 : o.res === 'draft' ? 150 : 85);
  const fld = new Field([[-R - H, -R - H, -R - H], [R + H, R + H, R + H]], h, rw + 2 * h);
  for (const [a, b] of M.walls) {
    const P = arc(a, b, 3).map(p => p.map(x => x * Rw));
    fld.curve(P);
  }
  if (progress) progress(0.3);
  const { x0, y0, z0, NX, NY, d } = fld;
  const gp = M.goal.map(x => x * R), sp = M.start.map(x => x * R), mark = Math.min(2.2, 0.3 * size / o.freq / 2);
  const ball = (x, y, z) => {
    const i = Math.round((x - x0) / h), j = Math.round((y - y0) / h), k = Math.round((z - z0) / h);
    let v = Math.min(d[(k * NY + j) * NX + i] - rw, Math.hypot(x, y, z) - R);
    // the start: a dome; the goal: a pit
    v = Math.min(v, Math.hypot(x - sp[0], y - sp[1], z - sp[2]) - mark);
    v = Math.max(v, mark - Math.hypot(x - gp[0], y - gp[1], z - gp[2]));
    return v;
  };
  const trace = f => dropCrumbs(isosurface(f, x0, y0, z0, h, fld.nx, fld.ny, fld.nz, p => progress && progress(0.3 + 0.35 * p)), 0.05);
  let m;
  if (o.mode === 'halves') {
    const top = trace((x, y, z) => Math.max(ball(x, y, z), -z));
    const bot = trace((x, y, z) => Math.max(ball(x, y, z), z));
    // the lower half turned over (a half turn about x) and set beside
    transform(bot, ([x, y, z]) => [x + size + 6, -y, -z]);
    m = merge(top, bot);
  } else {
    const zc = -R * Math.cos(Math.asin(0.4));
    m = trace((x, y, z) => Math.max(ball(x, y, z), zc - z));
    transform(m, ([x, y, z]) => [x, y, z - zc]);
  }
  return m;
}

// the view: the solid, with the maze for the maps (plain arrays)
export function preview(o, progress) {
  const m = solid(o, progress), M = maze(o);
  m.walls = M.walls; m.way = M.way; m.start = M.start; m.goal = M.goal; m.cells = M.cells; m.length = M.length;
  return m;
}

export const fileName = o => `minotaur_sphere_f${o.freq}_s${o.seed}_${o.mode}_${o.size}mm`;

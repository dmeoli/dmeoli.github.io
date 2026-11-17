// The model of the radiolarian form: lattice spheres after the plates of
// Haeckel, in model units (outer sphere of radius 1) for the view and in
// millimetres for the print.
//
// A lattice is the spherical Voronoi diagram of a set of seeds on the unit
// sphere: the seeds are the points of a Fibonacci sphere (spaced by the golden
// angle, optionally relaxed by Lloyd's iteration) or the vertices of a
// subdivided icosahedron, the Delaunay triangulation of the seeds is their
// convex hull, the Voronoi vertices are the normals of its faces and the bars
// of the skeleton run along the Voronoi edges. The skeleton (bars, radial
// beams between nested shells, spines and thorns) is a list of capsules
// tapered from one end to the other, joined with a smooth minimum into one
// implicit function, which src/print traces by marching tetrahedra; a grid of
// buckets keeps the evaluation local, so that each point sees only the few
// capsules near it.

import { implicitSolid, onBed } from '../../print/index.js';

const PHI = (1 + Math.sqrt(5)) / 2, GOLD = Math.PI * (3 - Math.sqrt(5));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const scl = (s, a) => [s * a[0], s * a[1], s * a[2]];

/* ------------------------------------------------------------ presets -- */

// lattice 'fib' (Fibonacci sphere) or 'ico' (subdivided icosahedron); cells
// (number of seeds), relax (Lloyd steps), bar (width of a bar as a fraction
// of the mean edge), shells (1 to 3 concentric spheres), spines (their
// arrangement), len (length of the spines, in outer radii), thorns (length
// of the thorns at every node of the outer lattice)
export const presets = {
  hexacontium: { en: 'Hexacontium (three shells, six spines)', it: 'Hexacontium (tre gusci, sei spine)',
    lattice: 'fib', cells: 170, relax: 8, bar: 0.3, shells: 3, spines: 'six', len: 0.62, thorns: 0.05 },
  aulonia: { en: 'Aulonia hexagona (icosahedral net)', it: 'Aulonia hexagona (rete icosaedrica)',
    lattice: 'ico', cells: 362, relax: 0, bar: 0.28, shells: 1, spines: 'none', len: 0, thorns: 0.06 },
  cenosphaera: { en: 'Cenosphaera (round pores)', it: 'Cenosphaera (pori rotondi)',
    lattice: 'fib', cells: 130, relax: 12, bar: 0.46, shells: 1, spines: 'none', len: 0, thorns: 0 },
  heliosphaera: { en: 'Heliosphaera (many spines)', it: 'Heliosphaera (molte spine)',
    lattice: 'fib', cells: 220, relax: 6, bar: 0.28, shells: 1, spines: 'many', len: 0.42, thorns: 0.04 },
  actinomma: { en: 'Actinomma (three shells, twelve beams)', it: 'Actinomma (tre gusci, dodici travi)',
    lattice: 'fib', cells: 240, relax: 8, bar: 0.3, shells: 3, spines: 'ico', len: 0.36, thorns: 0 },
  circogonia: { en: 'Circogonia icosahedra (twelve spines)', it: 'Circogonia icosahedra (dodici spine)',
    lattice: 'ico', cells: 92, relax: 0, bar: 0.3, shells: 1, spines: 'ico', len: 0.75, thorns: 0.04 },
  acanthometra: { en: 'Müller\'s law (Acantharia, twenty spines)', it: 'Legge di Müller (Acantharia, venti spine)',
    lattice: 'fib', cells: 70, relax: 12, bar: 0.32, shells: 2, spines: 'muller', len: 1.0, thorns: 0 },
};
export const KEYS = ['lattice', 'cells', 'relax', 'bar', 'shells', 'spines', 'len', 'thorns'];
export const defaults = () => { const p = presets.hexacontium, o = {}; for (const k of KEYS) o[k] = p[k]; return o; };

/* -------------------------------------------------------------- seeds -- */

export function fibonacciSphere(n) {
  return Array.from({ length: n }, (_, i) => {
    const z = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - z * z), a = i * GOLD;
    return [r * Math.cos(a), r * Math.sin(a), z];
  });
}

const ICO = (() => {
  const v = [];
  for (const s of [-1, 1]) for (const t of [-1, 1]) v.push([0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s]);
  return v.map(nrm);
})();

// the icosahedron subdivided f times along each edge, 10 f^2 + 2 points
export function geodesic(f) {
  const H = hull(ICO), pts = [], seen = new Map();
  for (const [a, b, c] of H.faces) for (let i = 0; i <= f; i++) for (let j = 0; i + j <= f; j++) {
    const k = f - i - j, A = ICO[a], B = ICO[b], C = ICO[c];
    const p = nrm([0, 1, 2].map(d => (k * A[d] + i * B[d] + j * C[d]) / f));
    const key = p.map(x => Math.round(x * 1e6)).join(',');
    if (!seen.has(key)) { seen.set(key, 1); pts.push(p); }
  }
  return pts;
}
export const icoFreq = n => Math.max(1, Math.round(Math.sqrt(Math.max(0, n - 2) / 10)));

/* ------------------------------------------------ convex hull, Voronoi -- */

// the convex hull of points on the unit sphere (all of them are on it), by
// the incremental algorithm: faces [a, b, c] counterclockwise seen from
// outside, and the map of directed edges a -> b to their face
export function hull(P) {
  const n = P.length, F = [], N = [], D = [], alive = [], emap = new Map();
  const key = (a, b) => a * n + b;
  const add = (a, b, c) => {
    const nn = nrm(crs(sub(P[b], P[a]), sub(P[c], P[a]))), id = F.length;
    F.push([a, b, c]); N.push(nn); D.push(dot(nn, P[a])); alive.push(true);
    emap.set(key(a, b), id); emap.set(key(b, c), id); emap.set(key(c, a), id);
  };
  const dist = (a, b) => Math.hypot(...sub(P[a], P[b]));
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0, best = -1;
  for (let i = 1; i < n; i++) if (dist(0, i) > best) { best = dist(0, i); i1 = i; }
  best = -1;
  const u = nrm(sub(P[i1], P[i0]));
  for (let i = 0; i < n; i++) { const w = sub(P[i], P[i0]), l = Math.hypot(...crs(w, u)); if (l > best) { best = l; i2 = i; } }
  const pn = nrm(crs(sub(P[i1], P[i0]), sub(P[i2], P[i0])));
  best = -1;
  for (let i = 0; i < n; i++) { const l = Math.abs(dot(pn, sub(P[i], P[i0]))); if (l > best) { best = l; i3 = i; } }
  if (dot(pn, sub(P[i3], P[i0])) > 0) [i1, i2] = [i2, i1];
  add(i0, i1, i2); add(i0, i3, i1); add(i1, i3, i2); add(i2, i3, i0);
  const stamp = [];
  for (let p = 0; p < n; p++) {
    if (p === i0 || p === i1 || p === i2 || p === i3) continue;
    const vis = [];
    for (let f = 0; f < F.length; f++) if (alive[f] && dot(N[f], P[p]) - D[f] > 1e-12) { vis.push(f); stamp[f] = p; }
    if (!vis.length) continue;
    const hor = [];
    for (const f of vis) {
      const [a, b, c] = F[f];
      for (const [x, y] of [[a, b], [b, c], [c, a]]) { const g = emap.get(key(y, x)); if (g === undefined || stamp[g] !== p) hor.push([x, y]); }
    }
    for (const f of vis) { alive[f] = false; const [a, b, c] = F[f]; emap.delete(key(a, b)); emap.delete(key(b, c)); emap.delete(key(c, a)); }
    for (const [x, y] of hor) add(x, y, p);
  }
  const keep = [];
  for (let f = 0; f < F.length; f++) if (alive[f]) keep.push(f);
  const faces = keep.map(f => F[f]), normals = keep.map(f => N[f]);
  const remap = new Map(keep.map((f, i) => [f, i])), edges = new Map();
  for (const [k, f] of emap) if (alive[f]) edges.set(k, remap.get(f));
  return { faces, normals, edges, n };
}

// the spherical Voronoi diagram of the seeds: vertices (unit vectors, those
// closer than 1e-6 merged), edges [i, j] between them and, for each seed, its
// cell as the cyclic list of its vertices
export function voronoi(seeds) {
  const H = hull(seeds), cl = [], verts = [], ids = new Map();
  for (const nn of H.normals) {
    const k = nn.map(x => Math.round(x * 1e6)).join(',');
    if (!ids.has(k)) { ids.set(k, verts.length); verts.push(nn); }
    cl.push(ids.get(k));
  }
  const edges = [], seenE = new Set(), n = H.n;
  H.faces.forEach(([a, b, c], f) => {
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      if (x > y) continue;
      const g = H.edges.get(y * n + x);
      if (g === undefined) continue;
      const p = cl[f], q = cl[g];
      if (p === q) continue;
      const k = Math.min(p, q) * 1e6 + Math.max(p, q);
      if (!seenE.has(k)) { seenE.add(k); edges.push([p, q]); }
    }
  });
  const around = seeds.map(() => []);
  H.faces.forEach((fc, f) => { for (const v of fc) around[v].push(cl[f]); });
  const cells = seeds.map((s, i) => {
    const u = nrm(crs(s, Math.abs(s[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), w = crs(s, u);
    const vs = [...new Set(around[i])];
    vs.sort((a, b) => Math.atan2(dot(verts[a], w), dot(verts[a], u)) - Math.atan2(dot(verts[b], w), dot(verts[b], u)));
    return vs;
  });
  return { seeds, verts, edges, cells };
}

// a lattice of the kind and number of cells, relaxed by Lloyd's iteration
// (each seed moved to the centre of its cell)
export function lattice(kind, cells, relax = 0) {
  let seeds = kind === 'ico' ? geodesic(icoFreq(cells)) : fibonacciSphere(Math.max(4, Math.round(cells)));
  let V = voronoi(seeds);
  for (let r = 0; r < relax; r++) {
    seeds = V.cells.map((c, i) => {
      if (c.length < 3) return seeds[i];
      // area-weighted centre of the fan of triangles from the seed
      let acc = [0, 0, 0];
      for (let k = 0; k < c.length; k++) {
        const a = V.verts[c[k]], b = V.verts[c[(k + 1) % c.length]], s = seeds[i];
        const ar = Math.hypot(...crs(sub(a, s), sub(b, s)));
        acc = acc.map((x, d) => x + ar * (a[d] + b[d] + s[d]));
      }
      return nrm(acc);
    });
    V = voronoi(seeds);
  }
  let len = 0;
  for (const [a, b] of V.edges) len += Math.hypot(...sub(V.verts[a], V.verts[b]));
  V.meanEdge = len / V.edges.length;
  return V;
}

// the cells by number of sides, and the two counts of Euler
export function stats(L) {
  const by = {};
  for (const c of L.cells) by[c.length] = (by[c.length] || 0) + 1;
  let defect = 0;
  for (const [k, m] of Object.entries(by)) defect += (6 - k) * m;
  return { by, V: L.verts.length, E: L.edges.length, F: L.cells.length, defect };
}

/* ------------------------------------------------------------- spines -- */

export function spineDirs(kind) {
  if (kind === 'six') return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  if (kind === 'ico') {
    // an icosahedron with a vertex at each pole
    const t = Math.atan(0.5), out = [[0, 0, 1], [0, 0, -1]];
    for (let k = 0; k < 5; k++) {
      const a = 2 * Math.PI * k / 5, b = a + Math.PI / 5;
      out.push([Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)], [Math.cos(t) * Math.cos(b), Math.cos(t) * Math.sin(b), -Math.sin(t)]);
    }
    return out;
  }
  if (kind === 'muller') {
    // Mueller's law: five circles of four, at latitudes 0, +-30 and +-60
    // degrees, each circle turned by 45 degrees from its neighbours
    const out = [], d2r = Math.PI / 180;
    for (const [lat, lon0] of [[0, 0], [30, 45], [-30, 45], [60, 0], [-60, 0]])
      for (let k = 0; k < 4; k++) { const la = lat * d2r, lo = (lon0 + 90 * k) * d2r; out.push([Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]); }
    return out;
  }
  if (kind === 'many') return fibonacciSphere(32);
  return [];
}

/* ----------------------------------------------------------- skeleton -- */

export const RADII = { 1: [1], 2: [1, 0.42], 3: [1, 0.6, 0.3] };

// the lattices of the shells: the inner ones with fewer cells, so that their
// pores are about as wide as the outer ones
export function lattices(o) {
  return RADII[o.shells].map((r, i) => {
    if (!i) return lattice(o.lattice, o.cells, o.relax);
    return o.lattice === 'ico' ? lattice('ico', 10 * Math.max(1, Math.round(icoFreq(o.cells) * r)) ** 2 + 2, 0)
      : lattice('fib', Math.max(12, Math.round(o.cells * r * r * 0.9)), o.relax);
  });
}

// the capsules [ax, ay, az, bx, by, bz, ra, rb] of the skeleton, outer radius
// 1; with a base, a column under the south pole and a disc on the bed
export function skeleton(o, Ls = lattices(o)) {
  const R = RADII[o.shells], caps = [];
  const cap = (a, b, ra, rb = ra) => caps.push([a[0], a[1], a[2], b[0], b[1], b[2], ra, rb]);
  const rbar = Ls.map((L, i) => o.bar * L.meanEdge * R[i] / 2);
  Ls.forEach((L, i) => {
    const r = R[i], rb = rbar[i];
    for (const [p, q] of L.edges) {
      const a = L.verts[p], b = L.verts[q], ang = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
      const m = Math.max(1, Math.ceil(ang / 0.12));
      let prev = scl(r, a);
      for (let k = 1; k <= m; k++) {
        const t = k / m, c = scl(r, nrm([0, 1, 2].map(d => a[d] * (1 - t) + b[d] * t)));
        cap(prev, c, rb); prev = c;
      }
    }
  });
  // where a beam or a spine crosses a shell, struts from the crossing point
  // to the corners of the cell it crosses, so that it holds on to the lattice
  const anchor = (d, i) => {
    const L = Ls[i], r = R[i];
    let best = 0, bd = -2;
    L.seeds.forEach((s, k) => { const v = dot(s, d); if (v > bd) { bd = v; best = k; } });
    for (const v of L.cells[best]) cap(scl(r, d), scl(r, L.verts[v]), rbar[i] * 0.9);
  };
  const dirs = spineDirs(o.spines), beams = dirs.length ? dirs : (o.shells > 1 ? spineDirs('six') : []);
  const rIn = R[R.length - 1];
  for (const d of beams) {
    if (o.shells > 1) { cap(scl(rIn, d), d, rbar[0] * 1.3, rbar[0] * 1.15); for (let i = 1; i < R.length; i++) anchor(d, i); }
    anchor(d, 0);
  }
  if (o.len > 0) for (const d of dirs) cap(d, scl(1 + o.len, d), rbar[0] * 1.7, Math.max(rbar[0] * 0.42, 0.004));
  if (o.thorns > 0) for (const v of Ls[0].verts) cap(v, scl(1 + o.thorns, v), rbar[0] * 0.95, rbar[0] * 0.45);
  let base = null;
  if (o.base) {
    const down = [0, 0, -1], zTop = -1.16, th = 0.06;
    anchor(down, 0);
    cap(scl(0.995, down), [0, 0, zTop + th / 2], 0.075, 0.1);
    base = { zBed: zTop - th, zTop, r: 0.42 };
  }
  return { caps, base, rbar, R, Ls };
}

/* ------------------------------------------------------ implicit field -- */

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// the bounding box of the skeleton (cut at the bed when there is a base)
export function boxOf({ caps, base }) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const c of caps) for (let e = 0; e < 2; e++) for (let d = 0; d < 3; d++) {
    const v = c[3 * e + d], r = c[6 + e];
    mn[d] = Math.min(mn[d], v - r); mx[d] = Math.max(mx[d], v + r);
  }
  if (base) { mn[0] = Math.min(mn[0], -base.r); mn[1] = Math.min(mn[1], -base.r); mx[0] = Math.max(mx[0], base.r); mx[1] = Math.max(mx[1], base.r); mn[2] = base.zBed; }
  return [mn, mx];
}

// the implicit function of the skeleton scaled by s: capsules joined by a
// smooth minimum of radius k, looked up through buckets of side `cell`
export function field(sk, s, k, h) {
  const caps = sk.caps.map(c => c.map(x => x * s)), n = caps.length;
  // per capsule: the start, the direction, 1 / its squared length, the two
  // radii and the larger one
  const C = new Float64Array(10 * n);
  caps.forEach((c, i) => {
    const ex = c[3] - c[0], ey = c[4] - c[1], ez = c[5] - c[2];
    C.set([c[0], c[1], c[2], ex, ey, ez, 1 / (ex * ex + ey * ey + ez * ez || 1), c[6], c[7] - c[6], Math.max(c[6], c[7])], 10 * i);
  });
  const [mn, mx] = boxOf({ caps, base: sk.base && { ...sk.base, zBed: sk.base.zBed * s, r: sk.base.r * s } });
  const cell = Math.max(4 * h, 2.2 * sk.rbar[0] * s + k);
  const x0 = mn[0] - 4 * cell, y0 = mn[1] - 4 * cell, z0 = mn[2] - 4 * cell;
  const NX = Math.ceil((mx[0] - x0) / cell) + 5, NY = Math.ceil((mx[1] - y0) / cell) + 5, NZ = Math.ceil((mx[2] - z0) / cell) + 5;
  const lists = new Map();
  const reach = k + 2 * h;
  for (let i = 0; i < n; i++) {
    const c = caps[i], r = Math.max(c[6], c[7]) + reach;
    const lo = [Math.min(c[0], c[3]) - r, Math.min(c[1], c[4]) - r, Math.min(c[2], c[5]) - r];
    const hi = [Math.max(c[0], c[3]) + r, Math.max(c[1], c[4]) + r, Math.max(c[2], c[5]) + r];
    const a = [Math.floor((lo[0] - x0) / cell), Math.floor((lo[1] - y0) / cell), Math.floor((lo[2] - z0) / cell)];
    const b = [Math.floor((hi[0] - x0) / cell), Math.floor((hi[1] - y0) / cell), Math.floor((hi[2] - z0) / cell)];
    // only the buckets that the segment, thickened, really reaches
    const ex = c[3] - c[0], ey = c[4] - c[1], ez = c[5] - c[2], ll = ex * ex + ey * ey + ez * ez || 1;
    for (let kz = a[2]; kz <= b[2]; kz++) for (let ky = a[1]; ky <= b[1]; ky++) for (let kx = a[0]; kx <= b[0]; kx++) {
      const px = x0 + (kx + 0.5) * cell - c[0], py = y0 + (ky + 0.5) * cell - c[1], pz = z0 + (kz + 0.5) * cell - c[2];
      const t = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / ll));
      if (Math.hypot(px - t * ex, py - t * ey, pz - t * ez) > r + 0.87 * cell) continue;
      const key = (kz * NY + ky) * NX + kx;
      let l = lists.get(key); if (!l) lists.set(key, l = []); l.push(i);
    }
  }
  // flat lists per bucket
  const start = new Int32Array(NX * NY * NZ + 1);
  for (const [key, l] of lists) start[key + 1] = l.length;
  for (let i = 0; i < NX * NY * NZ; i++) start[i + 1] += start[i];
  const items = new Int32Array(start[NX * NY * NZ]);
  for (const [key, l] of lists) items.set(l, start[key]);
  const B = sk.base && { zBed: sk.base.zBed * s, zTop: sk.base.zTop * s, r: sk.base.r * s };
  return (x, y, z) => {
    const kx = Math.floor((x - x0) / cell), ky = Math.floor((y - y0) / cell), kz = Math.floor((z - z0) / cell);
    let v = cell;
    if (kx >= 0 && ky >= 0 && kz >= 0 && kx < NX && ky < NY && kz < NZ) {
      const key = (kz * NY + ky) * NX + kx;
      for (let q = start[key], e = start[key + 1]; q < e; q++) {
        const o = 10 * items[q];
        const ex = C[o + 3], ey = C[o + 4], ez = C[o + 5], wx = x - C[o], wy = y - C[o + 1], wz = z - C[o + 2];
        let t = (wx * ex + wy * ey + wz * ez) * C[o + 6];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = wx - t * ex, dy = wy - t * ey, dz = wz - t * ez, d2 = dx * dx + dy * dy + dz * dz, far = v + k + C[o + 9];
        if (d2 >= far * far) continue;
        const d = Math.sqrt(d2) - (C[o + 7] + C[o + 8] * t);
        v = smin(v, d, k);
      }
    }
    if (B) {
      const dr = Math.hypot(x, y) - B.r, dz = Math.abs(z - (B.zBed + B.zTop) / 2) - (B.zTop - B.zBed) / 2;
      const disc = Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0);
      v = smin(v, disc, k);
      v = Math.max(v, B.zBed - z);
    }
    return v;
  };
}

/* --------------------------------------------------------- the meshes -- */

// the mesh of the view, in model units, cells of side h
export function viewMesh(o, h, progress) {
  const sk = skeleton(o), box = boxOf(sk), k = sk.rbar[0] * 0.9;
  const m = implicitSolid(field(sk, 1, k, h), box, h, { crumbs: 0.02, progress });
  return { m, sk };
}

// the scale (mm per model unit) that makes the largest side `size`
const scaleOf = (sk, size) => { const [mn, mx] = boxOf(sk); return size / Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); };

// o: the numbers of the scene plus size (mm, largest side), base (boolean),
// res ('draft' or 'fine'); the closed solid in millimetres, on the bed
export function solid(o, progress) {
  const p = { ...defaults(), size: 80, base: true, res: 'draft', ...o };
  const sk = skeleton(p), s = scaleOf(sk, p.size), rb = sk.rbar[0] * s;
  const h = Math.min(p.size / (p.res === 'fine' ? 260 : 190), Math.max(p.size / (p.res === 'fine' ? 360 : 240), rb / (p.res === 'fine' ? 2 : 1.3)));
  const k = rb * 0.9, [mn, mx] = boxOf(sk);
  const m = implicitSolid(field(sk, s, k, h), [mn.map(x => x * s), mx.map(x => x * s)], h, { crumbs: 0.02, progress });
  onBed(m);
  m.bar = +(2 * rb).toFixed(2);
  m.cell = +h.toFixed(3);
  return m;
}

export const fileName = o => `radiolarian_${o.lattice}${o.cells}_s${o.shells}_${o.spines}_${o.size}mm${o.base ? '_base' : ''}`;

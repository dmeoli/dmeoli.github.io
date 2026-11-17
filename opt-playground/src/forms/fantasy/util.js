// Helpers shared by the forms of the group Fantasy: a seeded random number
// generator, convex polytopes from half-spaces (crystals, rocks), closed
// meshes of columns on a grid (dungeon tiles), annuli and a seven-segment
// numeral as a signed distance (engraved numbers). No DOM: the models run in
// workers.

import { Grow, mesh } from '../../print/index.js';

// mulberry32: the same seed gives the same sequence on every browser
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a0, a1) => a0 + (a1 - a0) * r();
  r.int = n => Math.floor(r() * n);
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return r;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ---------------------------------------------------- convex polytopes -- */

// the polytope { x : n_i . x <= d_i } (planes [[n, d], ...], n of length 1,
// bounded); returns { mesh, faces: [{ n, d, poly: [[x, y, z], ...], area }] }
// with the faces counterclockwise from outside. Vertices are the points where
// three planes meet that satisfy all the others.
export function polytope(planes, eps = 1e-7) {
  const V = [];
  const m = planes.length;
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) {
    const [a, da] = planes[i], [b, db] = planes[j], [c, dc] = planes[k];
    const bc = crs(b, c), det = dot(a, bc);
    if (Math.abs(det) < 1e-10) continue;
    const ca = crs(c, a), ab = crs(a, b);
    const p = [0, 1, 2].map(q => (da * bc[q] + db * ca[q] + dc * ab[q]) / det);
    if (planes.every(([n, d]) => dot(n, p) <= d + 1e-6)) {
      if (!V.some(v => Math.abs(v[0] - p[0]) + Math.abs(v[1] - p[1]) + Math.abs(v[2] - p[2]) < 1e-6)) V.push(p);
    }
  }
  const pos = [], idx = [], faces = [];
  for (const p of V) pos.push(...p);
  for (const [n, d] of planes) {
    const on = [];
    V.forEach((p, i) => { if (Math.abs(dot(n, p) - d) < 1e-5) on.push(i); });
    if (on.length < 3) continue;
    const c = [0, 1, 2].map(q => on.reduce((s, i) => s + V[i][q], 0) / on.length);
    const u = nrm(sub(V[on[0]], c)), w = crs(n, u);
    on.sort((i, j) => {
      const pi = sub(V[i], c), pj = sub(V[j], c);
      return Math.atan2(dot(pi, w), dot(pi, u)) - Math.atan2(dot(pj, w), dot(pj, u));
    });
    let area = 0;
    for (let k = 1; k + 1 < on.length; k++) {
      idx.push(on[0], on[k], on[k + 1]);
      area += Math.hypot(...crs(sub(V[on[k]], V[on[0]]), sub(V[on[k + 1]], V[on[0]]))) / 2;
    }
    faces.push({ n, d, poly: on.map(i => V[i]), area });
  }
  return { mesh: mesh(pos, idx), faces, vertices: V };
}

// the rotation that takes the unit vector a onto b, as a function on points
export function rotateOnto(a, b) {
  const v = crs(a, b), c = dot(a, b);
  if (c < -0.999999) {
    const ax = nrm(Math.abs(a[0]) < 0.9 ? crs(a, [1, 0, 0]) : crs(a, [0, 1, 0]));
    return p => { const s = 2 * dot(ax, p); return [s * ax[0] - p[0], s * ax[1] - p[1], s * ax[2] - p[2]]; };
  }
  const k = 1 / (1 + c);
  return p => {
    const vx = crs(v, p), vvx = crs(v, vx);
    return [p[0] + vx[0] + k * vvx[0], p[1] + vx[1] + k * vvx[1], p[2] + vx[2] + k * vvx[2]];
  };
}

// a rotation by angle t around the unit axis u, as a function on points
export function rotateAxis(u, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return p => {
    const k = dot(u, p), x = crs(u, p);
    return [0, 1, 2].map(q => p[q] * c + x[q] * s + u[q] * k * (1 - c));
  };
}

/* ------------------------------------------------- columns on a grid -- */

// a closed mesh of square columns: H[j * nx + i] > 0 is the height of the
// cell (i, j), of side s, with corner (x0, y0); cells of height 0 are empty.
// The sides are split at every height that occurs, and no 2 x 2 block may
// hold two heights on its diagonals only (see unpinch), so that every edge is
// shared by two faces.
export function columns(H, nx, ny, s, x0 = 0, y0 = 0) {
  const P = new Grow(Float32Array), I = new Grow(Uint32Array), ids = new Map();
  const at = (i, j, z) => {
    const key = (j * (nx + 1) + i) * 4096 + Math.round(z * 64);
    let v = ids.get(key);
    if (v === undefined) { v = P.n / 3; P.push3(x0 + i * s, y0 + j * s, z); ids.set(key, v); }
    return v;
  };
  const h = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : H[j * nx + i]);
  const quad = (a, b, c, d) => { I.push3(a, b, c); I.push3(a, c, d); };
  const levels = [...new Set(Array.from(H).filter(z => z > 0))].sort((a, b) => a - b);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = h(i, j);
    if (z <= 0) continue;
    quad(at(i, j, z), at(i + 1, j, z), at(i + 1, j + 1, z), at(i, j + 1, z));
    quad(at(i, j, 0), at(i, j + 1, 0), at(i + 1, j + 1, 0), at(i + 1, j, 0));
    // the four sides, each from the neighbor's height (or 0) up to z
    const side = (zn, a0, a1) => {
      if (zn >= z) return;
      const [i0, j0] = a0, [i1, j1] = a1;
      // split at every level in between, so that the vertical edges of
      // neighboring sides meet at the same vertices
      let lo = zn;
      for (const L of levels) {
        if (L <= lo) continue;
        if (L > z) break;
        quad(at(i0, j0, lo), at(i1, j1, lo), at(i1, j1, L), at(i0, j0, L));
        lo = L;
      }
    };
    side(h(i, j - 1), [i, j], [i + 1, j]);
    side(h(i + 1, j), [i + 1, j], [i + 1, j + 1]);
    side(h(i, j + 1), [i + 1, j + 1], [i, j + 1]);
    side(h(i - 1, j), [i, j + 1], [i, j]);
  }
  return { pos: P.get(), idx: I.get() };
}

// changes cells of a binary grid (1 wall, 0 floor) so that no 2 x 2 block
// has walls on one diagonal and floors on the other: one of its walls not
// marked in `fixed` becomes floor, which never disconnects the floor
export function unpinch(G, nx, ny, fixed = null) {
  let again = true;
  while (again) {
    again = false;
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
      const a = G[j * nx + i], b = G[j * nx + i + 1], c = G[(j + 1) * nx + i], d = G[(j + 1) * nx + i + 1];
      if (a === d && b === c && a !== b) {
        const w = a === 1 ? [j * nx + i, (j + 1) * nx + i + 1] : [j * nx + i + 1, (j + 1) * nx + i];
        const k = w.find(q => !fixed || !fixed[q]);
        if (k === undefined) continue;
        G[k] = 0; again = true;
      }
    }
  }
  return G;
}

/* ------------------------------------------------------------ annulus -- */

// the ring r0 < r < r1, z0 < z < z1 around the z axis, n sides (r0 = 0 for a disc)
export function annulus(r0, r1, z0, z1, n = 96, cx = 0, cy = 0) {
  const pos = [], idx = [];
  const ring = (r, z) => { const o = pos.length / 3; for (let k = 0; k < n; k++) pos.push(cx + r * Math.cos(2 * Math.PI * k / n), cy + r * Math.sin(2 * Math.PI * k / n), z); return o; };
  if (r0 <= 0) {
    const b = ring(r1, z0), t = ring(r1, z1), cb = pos.length / 3; pos.push(cx, cy, z0); const ct = pos.length / 3; pos.push(cx, cy, z1);
    for (let k = 0; k < n; k++) {
      const l = (k + 1) % n;
      idx.push(cb, b + l, b + k, ct, t + k, t + l, b + k, b + l, t + l, b + k, t + l, t + k);
    }
    return mesh(pos, idx);
  }
  const ob = ring(r1, z0), ot = ring(r1, z1), ib = ring(r0, z0), it = ring(r0, z1);
  for (let k = 0; k < n; k++) {
    const l = (k + 1) % n;
    idx.push(ob + k, ob + l, ot + l, ob + k, ot + l, ot + k);
    idx.push(ib + k, it + l, ib + l, ib + k, it + k, it + l);
    idx.push(ot + k, ot + l, it + l, ot + k, it + l, it + k);
    idx.push(ob + k, ib + l, ob + l, ob + k, ib + k, ib + l);
  }
  return mesh(pos, idx);
}

/* --------------------------------------------- seven-segment numerals -- */

// segments a..g of a digit in a box of width 1 and height 2 (origin at the
// center), as [x0, y0, x1, y1]
const SEG = { a: [-0.5, 1, 0.5, 1], b: [0.5, 1, 0.5, 0], c: [0.5, 0, 0.5, -1], d: [-0.5, -1, 0.5, -1], e: [-0.5, 0, -0.5, -1], f: [-0.5, 1, -0.5, 0], g: [-0.5, 0, 0.5, 0] };
const DIG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
const segDist = (x, y, [x0, y0, x1, y1]) => {
  const ex = x1 - x0, ey = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * ex + (y - y0) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(x - x0 - t * ex, y - y0 - t * ey);
};
// the strokes of the number n (one or more digits) of height hgt centerd at
// (0, 0), as segments [x0, y0, x1, y1]
export function numeralSegments(n, hgt) {
  const s = String(n), k = hgt / 2, w = k * 1.6, segs = [];
  [...s].forEach((ch, i) => {
    const ox = (i - (s.length - 1) / 2) * w;
    for (const g of DIG[+ch]) { const [a, b, c, d] = SEG[g]; segs.push([ox + a * k * 0.9, b * k * 0.95, ox + c * k * 0.9, d * k * 0.95]); }
  });
  return segs;
}

// the distance from the strokes of the number n (one or more digits) of
// height hgt centerd at (0, 0), minus half the stroke: negative on the strokes
export function numeral(n, hgt, stroke) {
  const segs = numeralSegments(n, hgt);
  return (x, y) => { let v = Infinity; for (const g of segs) v = Math.min(v, segDist(x, y, g)); return v - stroke / 2; };
}

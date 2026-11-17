// Solids given by an implicit function f(x, y, z), negative inside, zero on
// the surface, positive outside, in millimetres: the zero set is traced by
// marching tetrahedra on a regular grid of cubes of side h, so the result is
// closed and consistently oriented whatever f is, and every edge is shared by
// two triangles; parts thinner than a cell may vanish or break into crumbs
// (dropCrumbs in mesh.js removes them). A distance-like f (|grad f| close to 1
// near the surface) gives the best triangles; the helpers below build some.

import { Grow, dropCrumbs } from './mesh.js';

/* ---------------------------------------------------- marching tetrahedra -- */

// the six tetrahedra of a cube along its main diagonal (Kuhn), corners coded
// by bits x = 1, y = 2, z = 4: the same split in every cube, so that the faces
// of neighbouring cubes match
const TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];

// the zero set of f over the box [x0, x0 + nx h] x ..., f > 0 on the border;
// triangles counterclockwise seen from outside (where f > 0)
export function isosurface(f, x0, y0, z0, h, nx, ny, nz, progress) {
  const P = new Grow(Float32Array), I = new Grow(Uint32Array);
  const NX = nx + 1, NY = ny + 1, plane = NX * NY;
  const eps = 1e-7 * h;
  const layer = k => {
    const a = new Float32Array(plane), z = z0 + k * h;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      let v = (i === 0 || j === 0 || k === 0 || i === nx || j === ny || k === nz) ? h : f(x0 + i * h, y0 + j * h, z);
      if (Math.abs(v) < eps) v = eps;
      a[j * NX + i] = v;
    }
    return a;
  };
  let lo = layer(0), hi, mapLo = new Map(), mapHi = new Map();
  const val = new Float64Array(8), cx = new Float64Array(8), cy = new Float64Array(8), cz = new Float64Array(8);
  const gid = new Float64Array(8);
  const vert = (a, b) => {
    // a's bits are a subset of b's: the edge from corner a to corner b
    const dir = a ^ b, key = gid[a] * 8 + dir, map = (a & 4) ? mapHi : mapLo;
    let id = map.get(key);
    if (id === undefined) {
      let t = val[a] / (val[a] - val[b]);
      t = Math.min(0.98, Math.max(0.02, t));
      id = P.n / 3;
      P.push3(cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]), cz[a] + t * (cz[b] - cz[a]));
      map.set(key, id);
    }
    return id;
  };
  const tri = (p, q, r, ox, oy, oz) => {
    const A = P.a;
    const ux = A[3 * q] - A[3 * p], uy = A[3 * q + 1] - A[3 * p + 1], uz = A[3 * q + 2] - A[3 * p + 2];
    const vx = A[3 * r] - A[3 * p], vy = A[3 * r + 1] - A[3 * p + 1], vz = A[3 * r + 2] - A[3 * p + 2];
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    if (nxv * ox + nyv * oy + nzv * oz < 0) I.push3(p, r, q); else I.push3(p, q, r);
  };
  for (let k = 0; k < nz; k++) {
    hi = layer(k + 1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const b = j * NX + i;
      val[0] = lo[b]; val[1] = lo[b + 1]; val[2] = lo[b + NX]; val[3] = lo[b + NX + 1];
      val[4] = hi[b]; val[5] = hi[b + 1]; val[6] = hi[b + NX]; val[7] = hi[b + NX + 1];
      let neg = 0;
      for (let c = 0; c < 8; c++) if (val[c] < 0) neg++;
      if (neg === 0 || neg === 8) continue;
      for (let c = 0; c < 8; c++) {
        const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
        cx[c] = x0 + (i + di) * h; cy[c] = y0 + (j + dj) * h; cz[c] = z0 + (k + dk) * h;
        gid[c] = ((k + dk) * NY + (j + dj)) * NX + (i + di);
      }
      for (const t of TETS) {
        const ins = [], out = [];
        for (const c of t) (val[c] < 0 ? ins : out).push(c);
        if (!ins.length || !out.length) continue;
        // outward: from the corners inside to those outside
        let ox = 0, oy = 0, oz = 0;
        for (const c of out) { ox += cx[c] / out.length; oy += cy[c] / out.length; oz += cz[c] / out.length; }
        for (const c of ins) { ox -= cx[c] / ins.length; oy -= cy[c] / ins.length; oz -= cz[c] / ins.length; }
        const e = (a, b) => (a < b ? vert(a, b) : vert(b, a));
        if (ins.length === 1 || out.length === 1) {
          const [s, o] = ins.length === 1 ? [ins[0], out] : [out[0], ins];
          tri(e(s, o[0]), e(s, o[1]), e(s, o[2]), ox, oy, oz);
        } else {
          const [a, b] = ins, [c, d] = out;
          const p = e(a, c), q = e(a, d), r = e(b, d), s = e(b, c);
          tri(p, q, r, ox, oy, oz); tri(p, r, s, ox, oy, oz);
        }
      }
    }
    lo = hi; mapLo = mapHi; mapHi = new Map();
    if (progress && (k & 7) === 0) progress((k + 1) / nz);
  }
  return { pos: P.get(), idx: I.get() };
}

/* ------------------------------------------------- a solid from f, in mm -- */

// the solid { pos, idx } of f over the box [[x0, y0, z0], [x1, y1, z1]] (which
// must hold the solid: the grid is padded by two cells and f is forced
// positive on its border), cells of side h; crumbs below `crumbs` of the
// largest piece are dropped (0 keeps everything)
export function implicitSolid(f, [[x0, y0, z0], [x1, y1, z1]], h, { crumbs = 0.05, progress } = {}) {
  const pad = 2 * h, n = [x1 - x0, y1 - y0, z1 - z0].map(d => Math.ceil((d + 2 * pad) / h));
  const m = isosurface(f, x0 - pad, y0 - pad, z0 - pad, h, n[0], n[1], n[2], progress);
  return crumbs > 0 ? dropCrumbs(m, crumbs) : m;
}

/* -------------------------------------------- signed distances and joins -- */

// exact or close distances, negative inside; the arguments after the point
// are the sizes, the shapes centred on the origin (move them with translate)
export const sphere = r => (x, y, z) => Math.hypot(x, y, z) - r;
export const box = (a, b, c) => (x, y, z) => {
  const qx = Math.abs(x) - a, qy = Math.abs(y) - b, qz = Math.abs(z) - c;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
};
// a cylinder of radius r along z, from z = -hz to hz
export const cylinder = (r, hz) => (x, y, z) => {
  const dx = Math.hypot(x, y) - r, dz = Math.abs(z) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
};
// a torus around z, radii R (of the centre line) and r (of the tube)
export const torus = (R, r) => (x, y, z) => Math.hypot(Math.hypot(x, y) - R, z) - r;
// the points within r of the segment from a to b
export const capsule = (a, b, r) => (x, y, z) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], wx = x - a[0], wy = y - a[1], wz = z - a[2];
  const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / (ex * ex + ey * ey + ez * ez || 1)));
  return Math.hypot(wx - t * ex, wy - t * ey, wz - t * ez) - r;
};
export const translate = (f, [dx, dy, dz]) => (x, y, z) => f(x - dx, y - dy, z - dz);
export const union = (...fs) => (x, y, z) => { let v = Infinity; for (const f of fs) v = Math.min(v, f(x, y, z)); return v; };
export const intersect = (...fs) => (x, y, z) => { let v = -Infinity; for (const f of fs) v = Math.max(v, f(x, y, z)); return v; };
export const subtract = (f, g) => (x, y, z) => Math.max(f(x, y, z), -g(x, y, z));
// a union with a fillet of radius k where the two meet
export const smoothUnion = (f, g, k) => (x, y, z) => {
  const a = f(x, y, z), b = g(x, y, z), hh = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * hh - k * hh * (1 - hh);
};
// the wall of thickness t inside the surface of f (a hollow solid, closed)
export const shell = (f, t) => (x, y, z) => { const v = f(x, y, z); return Math.max(v, -v - t); };
// a slab between z = z0 and z = z1, e.g. a base plate to union with
export const slab = (z0, z1) => (x, y, z) => Math.max(z0 - z, z - z1);

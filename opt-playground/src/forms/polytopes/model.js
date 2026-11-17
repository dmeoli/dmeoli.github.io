// The regular polytopes of four dimensions, in millimetres: the vertices of
// the 5-cell, the tesseract, the 16-cell, the 24-cell, the 120-cell and the
// 600-cell on the unit 3-sphere, turned in 4D, projected to space either in
// perspective from a point on the w axis (a Schlegel diagram when the point
// is just beyond the nearest cell) or stereographically from the pole of the
// 3-sphere (edges become arcs of circles), and printed as struts with balls at
// the joints. Struts and balls are written into the distance field of
// src/forms/mathematics/field.js with their own radius, so that they fuse
// into one closed solid. solid(o, progress) is what the page and the download
// panel call, in a worker; project(o) gives the edges for the quick drawing.

import { onBed, cylinder, translate } from '../../print/index.js';
import { Field } from '../mathematics/field.js';

const PHI = (1 + Math.sqrt(5)) / 2, S5 = Math.sqrt(5);

/* --------------------------------------------------------- the vertices -- */

// the 24 permutations of [0, 1, 2, 3] with their parity
const PERMS = (() => {
  const out = [];
  const rec = (a, k) => {
    if (k === 4) {
      let inv = 0;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (a[i] > a[j]) inv++;
      out.push({ p: a.slice(), even: inv % 2 === 0 });
      return;
    }
    for (let i = k; i < 4; i++) { [a[k], a[i]] = [a[i], a[k]]; rec(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  };
  rec([0, 1, 2, 3], 0);
  return out;
})();

// every point from c by the permutations (all, or the even ones) and by every
// change of sign of its non-zero entries, without repetitions
function orbit(c, evenOnly = false) {
  const seen = new Map();
  for (const { p, even } of PERMS) {
    if (evenOnly && !even) continue;
    const q = p.map(i => c[i]);
    for (let s = 0; s < 16; s++) {
      const r = q.map((x, i) => (s >> i & 1 ? -x : x));
      if (r.some((x, i) => x === 0 && (s >> i & 1))) continue;
      seen.set(r.map(x => x.toFixed(6)).join(','), r);
    }
  }
  return [...seen.values()];
}

const RAW = {
  '5-cell': () => {
    const k = 1 / S5;
    return [[1, 1, 1, -k], [1, -1, -1, -k], [-1, 1, -1, -k], [-1, -1, 1, -k], [0, 0, 0, 4 * k]];
  },
  tesseract: () => orbit([1, 1, 1, 1]),
  '16-cell': () => orbit([1, 0, 0, 0]),
  '24-cell': () => orbit([1, 1, 0, 0]),
  '120-cell': () => [
    ...orbit([0, 0, 2, 2]), ...orbit([1, 1, 1, S5]), ...orbit([1 / (PHI * PHI), PHI, PHI, PHI]),
    ...orbit([1 / PHI, 1 / PHI, 1 / PHI, PHI * PHI]), ...orbit([0, 1 / (PHI * PHI), 1, PHI * PHI], true),
    ...orbit([0, 1 / PHI, PHI, S5], true), ...orbit([1 / PHI, 1, PHI, 2], true)],
  '600-cell': () => [...orbit([0.5, 0.5, 0.5, 0.5]), ...orbit([1, 0, 0, 0]), ...orbit([PHI / 2, 0.5, 1 / (2 * PHI), 0], true)],
};

// Schläfli symbol and the numbers of vertices, edges, faces and cells
export const INFO = {
  '5-cell': { sym: '{3,3,3}', V: 5, E: 10, F: 10, C: 5, cell: ['tetrahedra', 'tetraedri'] },
  tesseract: { sym: '{4,3,3}', V: 16, E: 32, F: 24, C: 8, cell: ['cubes', 'cubi'] },
  '16-cell': { sym: '{3,3,4}', V: 8, E: 24, F: 32, C: 16, cell: ['tetrahedra', 'tetraedri'] },
  '24-cell': { sym: '{3,4,3}', V: 24, E: 96, F: 96, C: 24, cell: ['octahedra', 'ottaedri'] },
  '120-cell': { sym: '{5,3,3}', V: 600, E: 1200, F: 720, C: 120, cell: ['dodecahedra', 'dodecaedri'] },
  '600-cell': { sym: '{3,3,5}', V: 120, E: 720, F: 1200, C: 600, cell: ['tetrahedra', 'tetraedri'] },
};
export const NAMES = Object.keys(RAW);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const unit = a => { const l = Math.sqrt(dot(a, a)); return a.map(x => x / l); };

// the polytope on the unit 3-sphere: vertices, edges (the pairs at the least
// distance) and the directions of the centre of a cell and of a vertex
const CACHE = {};
export function polytope(name) {
  if (CACHE[name]) return CACHE[name];
  const V = RAW[name]().map(unit), n = V.length;
  let best = -2;
  for (let i = 1; i < n; i++) best = Math.max(best, dot(V[0], V[i]));
  const E = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dot(V[i], V[j]) > best - 1e-6) E.push([i, j]);
  // the centre of a cell: among the directions of the vertices of this and
  // of the dual polytopes (and their opposites), the one whose largest dot
  // product with the vertices is reached by the most of them
  const cand = [...V.map(v => v.map(x => -x)), ...RAW.tesseract().map(unit), ...RAW['16-cell']().map(unit)];
  if (name === '120-cell') cand.push(...RAW['600-cell']().map(unit));
  if (name === '600-cell') cand.push(...RAW['120-cell']().map(unit));
  let cell = V[0], most = 0;
  for (const c of cand) {
    let mx = -2, k = 0;
    for (const v of V) { const d = dot(c, v); if (d > mx + 1e-6) { mx = d; k = 1; } else if (d > mx - 1e-6) k++; }
    if (k > most) { most = k; cell = c; }
  }
  return (CACHE[name] = { V, E, cell, vertex: V[0], cellSize: most });
}

/* -------------------------------------------- rotation and projection -- */

// the reflection that takes the unit vector c to (0, 0, 0, 1)
function toPole(c) {
  const v = [c[0], c[1], c[2], c[3] - 1], vv = dot(v, v);
  if (vv < 1e-12) return x => x;
  return x => { const k = 2 * dot(v, x) / vv; return x.map((xi, i) => xi - k * v[i]); };
}
// rotations by angles (degrees) in the planes xw, yw, zw, in this order
function rotation({ xw = 0, yw = 0, zw = 0 }) {
  const R = [[0, xw], [1, yw], [2, zw]].map(([a, deg]) => [a, Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)]);
  return x => {
    const y = x.slice();
    for (const [a, c, s] of R) { const p = y[a], w = y[3]; y[a] = c * p - s * w; y[3] = s * p + c * w; }
    return y;
  };
}

// the edges as polylines in space, before scaling: each point [x, y, z, l]
// with l the factor by which the projection enlarges lengths there
export function edges4(o) {
  const { shape = '120-cell', proj = 'perspective', first = 'cell', eye = 0.25 } = o;
  const P = polytope(shape), pole = toPole(first === 'cell' ? P.cell : P.vertex), rot = rotation(o);
  // the cell or the vertex goes to the eye in perspective, and to the
  // centre, opposite the pole, in the stereographic projection
  const st = proj === 'stereographic';
  const V = P.V.map(v => { const q = pole(v); if (st) q[3] = -q[3]; return rot(q); });
  // perspective from (0, 0, 0, d), d beyond the nearest cell by `eye` of the
  // distance from the centre to it
  let wmax = -1;
  for (const v of V) wmax = Math.max(wmax, v[3]);
  const d = wmax * (1 + eye);
  const map = proj === 'stereographic'
    ? v => { const k = 1 / Math.max(1e-3, 1 - v[3]); return [v[0] * k, v[1] * k, v[2] * k, k]; }
    : v => { const k = 1 / (d - v[3]); return [v[0] * k, v[1] * k, v[2] * k, k]; };
  const seg = proj === 'stereographic' ? 12 : 4;
  return P.E.map(([i, j]) => {
    const a = V[i], b = V[j], th = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), s = Math.sin(th);
    const pts = [];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      // on the sphere the edge is the arc of great circle; in perspective the
      // chord, whose image is straight
      const q = proj === 'stereographic' && s > 1e-9
        ? a.map((x, m) => (Math.sin((1 - t) * th) * x + Math.sin(t * th) * b[m]) / s)
        : a.map((x, m) => x + t * (b[m] - x));
      pts.push(map(q));
    }
    return pts;
  });
}

// the edges in mm, centred, the radius of the strut at every point, and the
// joints: { lines: [[[x, y, z, r], ...], ...], joints: [[x, y, z, r], ...] }
export function project(o = {}) {
  const { size = 100, strut = 1.3, joint = 1.5, taper = true } = o;
  const L = edges4(o);
  let lmin = Infinity;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const l of L) for (const p of l) {
    lmin = Math.min(lmin, p[3]);
    for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); }
  }
  const W = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  // struts thicker where the projection enlarges, up to twice
  const rad = p => strut * (taper ? Math.min(2, p[3] / lmin) : 1);
  let rmax = 0;
  for (const l of L) for (const p of l) rmax = Math.max(rmax, rad(p) * joint);
  // the largest side of the box of the centre lines, plus the balls, is the size
  const s = Math.max(1e-6, size - 2 * rmax) / W;
  const lines = L.map(l => l.map(p => [p[0] * s, p[1] * s, p[2] * s, rad(p)]));
  const joints = new Map();
  for (const l of lines) for (const p of [l[0], l[l.length - 1]]) joints.set(p.slice(0, 3).map(x => x.toFixed(3)).join(','), [p[0], p[1], p[2], p[3] * joint]);
  return { lines, joints: [...joints.values()] };
}

/* ------------------------------------------------------------ the solid -- */

// the field of struts and balls of varying radius: d holds the signed
// distance itself, and the solid is its level 0
class Struts extends Field {
  // the cone from a (radius ra) to b (radius rb), with round ends
  cone(a, b, ra, rb) {
    const { h, x0, y0, z0, NX, NY, d } = this, c = Math.max(ra, rb) + 2 * h;
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], ee = ex * ex + ey * ey + ez * ez || 1;
    const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0]) - c - x0) / h)), i1 = Math.min(this.nx, Math.floor((Math.max(a[0], b[0]) + c - x0) / h));
    const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1]) - c - y0) / h)), j1 = Math.min(this.ny, Math.floor((Math.max(a[1], b[1]) + c - y0) / h));
    const k0 = Math.max(0, Math.ceil((Math.min(a[2], b[2]) - c - z0) / h)), k1 = Math.min(this.nz, Math.floor((Math.max(a[2], b[2]) + c - z0) / h));
    for (let k = k0; k <= k1; k++) {
      const wz = z0 + k * h - a[2];
      for (let j = j0; j <= j1; j++) {
        const wy = y0 + j * h - a[1], row = (k * NY + j) * NX;
        for (let i = i0; i <= i1; i++) {
          const wx = x0 + i * h - a[0];
          let t = (wx * ex + wy * ey + wz * ez) / ee;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = wx - t * ex, qy = wy - t * ey, qz = wz - t * ez;
          const s = Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + t * (rb - ra));
          if (s < d[row + i]) d[row + i] = s;
        }
      }
    }
  }
  ball(p, r) { this.cone(p, p, r, r); }
}

// the cell of the grid for a resolution, in mm: a few cells across the
// thinnest strut; coarser where the surface (area A, mm^2) would give more
// triangles than the resolution allows (marching tetrahedra give about
// 2.5 A / h^2), but never coarser than 1.25 cells across that radius
export function cellOf({ size = 100, strut = 1.3, res = 'draft' }, A = 0) {
  const [n, k, T] = { preview: [90, 1.3, 3e5], draft: [150, 2, 8e5], fine: [240, 3, 2.5e6] }[res] || [150, 2, 8e5];
  const h = Math.max(size / 400, Math.min(size / n, strut / k));
  return Math.min(strut / 1.25, Math.max(h, Math.sqrt(2.5 * A / T)));
}

// o: { shape, proj ('perspective', 'stereographic'), first ('cell',
// 'vertex'), eye, xw, yw, zw (degrees), size (mm, the widest), strut (radius
// of the thinnest strut, mm), joint (ball over strut), taper, base ('none',
// 'cut': a flat cut under the lowest balls, 'plate': a disc under them), res }
export function solid(o = {}, progress) {
  const { size = 100, base = 'cut' } = o;
  const { lines, joints } = project(o);
  let A = 0;
  for (const l of lines) for (let k = 0; k + 1 < l.length; k++) A += Math.PI * (l[k][3] + l[k + 1][3]) * Math.hypot(l[k + 1][0] - l[k][0], l[k + 1][1] - l[k][1], l[k + 1][2] - l[k][2]);
  for (const j of joints) A += 4 * Math.PI * j[3] * j[3];
  const h = cellOf(o, A);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let zlow = Infinity, rj = 0;
  for (const l of lines) for (const p of l) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a] - 2.5 * p[3]); mx[a] = Math.max(mx[a], p[a] + 2.5 * p[3]); }
  let low = null;
  for (const j of [...joints, ...lines.flat()]) if (j[2] - j[3] < zlow) { zlow = j[2] - j[3]; rj = j[3]; low = j; }
  // the flat cut takes 0.45 of its radius off the lowest ball or strut; the
  // plate, 2 mm thick, holds it sunk 0.35 of its radius
  const zc = zlow + 0.45 * rj, zp = zlow + 0.35 * rj;
  // the disc is centred under the box and reaches past the lowest point
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
  const plateR = Math.max(0.3 * size, Math.hypot(low[0] - cx, low[1] - cy) + 2 * rj);
  if (base === 'plate') { mn[2] = Math.min(mn[2], zp - 2); mn[0] = Math.min(mn[0], cx - plateR); mx[0] = Math.max(mx[0], cx + plateR); mn[1] = Math.min(mn[1], cy - plateR); mx[1] = Math.max(mx[1], cy + plateR); }
  const cut = 3 * h + 2.5 * Math.max(...joints.map(j => j[3]));
  const fd = new Struts([mn, mx], h, cut);
  lines.forEach((l, e) => {
    for (let k = 0; k + 1 < l.length; k++) fd.cone(l[k], l[k + 1], l[k][3], l[k + 1][3]);
    if (progress && e % 64 === 0) progress(0.4 * e / lines.length);
  });
  for (const j of joints) fd.ball(j, j[3]);
  const clip = base === 'cut' ? (x, y, z) => zc - z : undefined;
  const add = base === 'plate' ? translate(cylinder(plateR, 1), [cx, cy, zp - 1]) : undefined;
  const m = fd.solid(0, { clip, add, progress: progress && (f => progress(0.4 + 0.6 * f)) });
  return onBed(m);
}

export const fileName = o => `${o.shape}_${o.proj}_${o.first}first_${o.size}mm_s${o.strut}${o.base && o.base !== 'none' ? '_' + o.base : ''}`;

// Three fractals as printable solids, in millimetres: the Menger sponge
// (cubes of a grid of side 3^level, with the faces between a full and an
// empty cell), the Sierpinski tetrahedron (four half-size copies of itself,
// joined at the corners by a neck, traced as an implicit solid) and the
// Mandelbulb of power 8 (the set of points whose orbit under the "triplex"
// power z -> z^8 + c stays bounded, traced through its distance estimator
// by marching tetrahedra).

import { implicitSolid, onBed, transform, Grow } from '../../print/index.js';

/* ------------------------------------------------------- Menger sponge -- */

// is cell (i, j, k) of the grid of side 3^level full: not two coordinates
// with a digit 1 at the same place in base 3
export function mengerFull(i, j, k, level) {
  for (let l = 0; l < level; l++) {
    if ((i % 3 === 1) + (j % 3 === 1) + (k % 3 === 1) >= 2) return false;
    i = Math.floor(i / 3); j = Math.floor(j / 3); k = Math.floor(k / 3);
  }
  return true;
}

// the boundary between full and empty cells, two triangles per square, the
// vertices shared on the grid (every edge of the sponge has two triangles)
export function menger(level = 2, size = 60) {
  const n = 3 ** level, h = size / n, full = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < n && j < n && k < n && mengerFull(i, j, k, level);
  const F = new Uint8Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) F[(k * n + j) * n + i] = full(i, j, k) ? 1 : 0;
  const at = (i, j, k) => (i >= 0 && j >= 0 && k >= 0 && i < n && j < n && k < n ? F[(k * n + j) * n + i] : 0);
  const P = new Grow(Float32Array), I = new Grow(Uint32Array), ids = new Map();
  const v = (i, j, k) => {
    const key = (k * (n + 1) + j) * (n + 1) + i;
    let id = ids.get(key);
    if (id === undefined) { id = P.n / 3; P.push3(i * h, j * h, k * h); ids.set(key, id); }
    return id;
  };
  // the square of the face of cell c towards +axis or -axis, counterclockwise from outside
  const quad = (a, b, c, d) => { I.push3(a, b, c); I.push3(a, c, d); };
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!F[(k * n + j) * n + i]) continue;
    if (!at(i - 1, j, k)) quad(v(i, j, k), v(i, j, k + 1), v(i, j + 1, k + 1), v(i, j + 1, k));
    if (!at(i + 1, j, k)) quad(v(i + 1, j, k), v(i + 1, j + 1, k), v(i + 1, j + 1, k + 1), v(i + 1, j, k + 1));
    if (!at(i, j - 1, k)) quad(v(i, j, k), v(i + 1, j, k), v(i + 1, j, k + 1), v(i, j, k + 1));
    if (!at(i, j + 1, k)) quad(v(i, j + 1, k), v(i, j + 1, k + 1), v(i + 1, j + 1, k + 1), v(i + 1, j + 1, k));
    if (!at(i, j, k - 1)) quad(v(i, j, k), v(i, j + 1, k), v(i + 1, j + 1, k), v(i + 1, j, k));
    if (!at(i, j, k + 1)) quad(v(i, j, k + 1), v(i + 1, j, k + 1), v(i + 1, j + 1, k + 1), v(i, j + 1, k + 1));
  }
  const m = { pos: P.get(), idx: I.get() };
  return m;
}

/* ------------------------------------------------ Sierpinski tetrahedron -- */

// the regular tetrahedron with vertices (1,1,1), (1,-1,-1), (-1,1,-1),
// (-1,-1,1): two opposite edges are horizontal, at z = -1 and z = 1
const TV = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const TN = TV.map(v => v.map(x => -x / Math.sqrt(3)));
// the distance (close to it) to the tetrahedron of centre c and scale s,
// negative inside, rounded outside
function tet(x, y, z, cx, cy, cz, s) {
  let mx = -Infinity, s2 = 0;
  const d = s / Math.sqrt(3);
  for (const n of TN) {
    const g = n[0] * (x - cx) + n[1] * (y - cy) + n[2] * (z - cz) - d;
    if (g > mx) mx = g;
    if (g > 0) s2 += g * g;
  }
  return mx <= 0 ? mx : Math.sqrt(s2);
}
// the union of the 4^level tetrahedra, pruned: a copy farther than the best
// so far cannot hold a nearer piece
// ; a point farther than `far` from a copy is not looked at inside it (the
// value returned is then a lower bound, which is all marching needs there)
export function sierpinskiSDF(level, far = Infinity) {
  return (x, y, z) => {
    let best = Infinity;
    const go = (cx, cy, cz, s, l) => {
      const d = tet(x, y, z, cx, cy, cz, s);
      if (d >= best) return;
      if (l === 0 || d > far) { best = d; return; }
      for (const v of TV) go(cx + v[0] * s / 2, cy + v[1] * s / 2, cz + v[2] * s / 2, s / 2, l - 1);
    };
    go(0, 0, 0, 1, level);
    return best;
  };
}

// o: { level, size (mm, the edge), neck (mm: the copies are thickened by it,
// so that the corners where they touch become joints), stand ('edge': on an
// edge cut flat, no overhang beyond 35 degrees; 'face': on a face, the holes
// need bridges or supports), res }
export function sierpinski({ level = 4, size = 80, neck = 0.6, stand = 'edge', res = 'draft' } = {}, progress) {
  const h = Math.max(size / (res === 'fine' ? 220 : res === 'view' ? 85 : 140), 0.15);
  const k = size / (2 * Math.SQRT2), f0 = sierpinskiSDF(level, (neck + 3 * h) / k);
  // flat cut under the lowest edge, as wide as two necks
  const cut = -k + Math.max(1.2, 2 * neck);
  // the 'face' stand: the face opposite (1,1,1) turned down
  const R = stand === 'face' ? faceDown() : null;
  const f = (x, y, z) => {
    let p = [x, y, z];
    if (R) p = R.inv(p);
    const v = f0(p[0] / k, p[1] / k, p[2] / k) * k - neck;
    return stand === 'edge' ? Math.max(v, cut - z) : v;
  };
  const e = 1.2 * k + neck + h;
  const m = implicitSolid(f, [[-e, -e, -e], [e, e, e]], h, { progress });
  return onBed(m);
}

// a rotation taking the normal -(1,1,1)/sqrt 3 of a face to -z, and back
function faceDown() {
  const a = [-1, -1, -1].map(x => x / Math.sqrt(3)), b = [0, 0, -1];
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = Math.hypot(...v), c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], ax = v.map(x => x / s), ang = Math.atan2(s, c);
  const rot = th => p => {
    const cs = Math.cos(th), sn = Math.sin(th), kd = ax[0] * p[0] + ax[1] * p[1] + ax[2] * p[2];
    const kp = [ax[1] * p[2] - ax[2] * p[1], ax[2] * p[0] - ax[0] * p[2], ax[0] * p[1] - ax[1] * p[0]];
    return [0, 1, 2].map(i => p[i] * cs + kp[i] * sn + ax[i] * kd * (1 - cs));
  };
  return { fwd: rot(ang), inv: rot(-ang) };
}

/* ---------------------------------------------------------- Mandelbulb -- */

// the distance estimator of White and Nylander's Mandelbulb of power n:
// 0.5 r log r / |dz|, below zero inside (where the orbit stays bounded)
export function bulbDE(n = 8, iters = 10) {
  return (px, py, pz) => {
    // the bulb of power 8 lies within radius 1.15: a lower bound outside it
    const r0 = Math.sqrt(px * px + py * py + pz * pz);
    if (n === 8 && r0 > 1.3) return r0 - 1.2;
    let x = px, y = py, z = pz, dr = 1, r = 0;
    for (let i = 0; i < iters; i++) {
      r = Math.sqrt(x * x + y * y + z * z);
      if (r > 2) break;
      if (r < 1e-12) { r = 1e-12; }
      const th = Math.acos(Math.max(-1, Math.min(1, z / r))) * n, ph = Math.atan2(y, x) * n, rn = r ** n;
      dr = n * r ** (n - 1) * dr + 1;
      x = rn * Math.sin(th) * Math.cos(ph) + px; y = rn * Math.sin(th) * Math.sin(ph) + py; z = rn * Math.cos(th) + pz;
    }
    if (r <= 2) {
      // bounded within iters: inside; a rough depth below the surface
      return -0.02;
    }
    return 0.5 * Math.log(r) * r / dr;
  };
}

// o: { power, size (mm, the width), thick (mm added to the surface, so that
// the thinnest filaments print), cut (the flat base, as a fraction of the
// height cut away from below), res }
export function mandelbulb({ power = 8, size = 60, thick = 0.4, cut = 0.12, res = 'draft' } = {}, progress) {
  const de = bulbDE(power), R = 1.2, k = size / 2.2;
  const h = Math.max(size / (res === 'fine' ? 200 : res === 'view' ? 95 : 130), 0.15);
  // the bulb spans about [-1.1, 1.1] in x and y and [-1.05, 1.05] in z (power 8)
  const zc = -1.1 + 2.2 * cut;
  const f = (x, y, z) => {
    const v = de(x / k, y / k, z / k) * k - thick;
    return cut > 0 ? Math.max(v, zc * k - z) : v;
  };
  const e = R * k + thick + h;
  const m = implicitSolid(f, [[-e, -e, -e], [e, e, e]], h, { progress, crumbs: 0.02 });
  return onBed(m);
}

/* ------------------------------------------------------------ dispatch -- */

// o: { form: 'menger' | 'sierpinski' | 'mandelbulb', level, size, ... }
export function solid(o = {}, progress) {
  const form = o.form || 'menger';
  let m;
  if (form === 'menger') m = onBed(menger(Math.max(1, Math.min(3, o.level || 2)), o.size || 60));
  else if (form === 'sierpinski') m = sierpinski({ ...o, level: Math.max(1, Math.min(5, o.level || 4)) }, progress);
  else m = mandelbulb(o, progress);
  if (progress) progress(1);
  return m;
}

// the dimension of the self-similar ones: N copies scaled by 1/s
export const DIMENSION = { menger: Math.log(20) / Math.log(3), sierpinski: 2 };

export const fileName = o => `${o.form}${o.form === 'mandelbulb' ? '_p' + (o.power || 8) : '_level' + o.level}_${o.size}mm`;

void transform;

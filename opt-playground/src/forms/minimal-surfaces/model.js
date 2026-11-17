// Minimal surfaces as printable sheets, in millimetres: the triply periodic
// gyroid, Schwarz P and D and Neovius by their trigonometric approximations
// F(x, y, z) = 0 (a sheet of thickness w is |F| / |grad F| < w / 2, cut by a
// cube, a sphere or a cylinder), and Costa's and Enneper's surfaces by their
// Weierstrass-Enneper parametrizations, thickened by the distance field of
// src/forms/mathematics/field.js. solid(o, progress) is what the page and the
// download panel call, in a worker.

import { implicitSolid, onBed, box, sphere, cylinder, intersect, union, translate, slab } from '../../print/index.js';
import { Field } from '../mathematics/field.js';

/* ------------------------------------------- triply periodic surfaces -- */

// each gives [F, dF/dx, dF/dy, dF/dz] at a point of the period 2 pi
export const TPMS = {
  gyroid(x, y, z) {
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
    return [sx * cy + sy * cz + sz * cx, cx * cy - sz * sx, cy * cz - sx * sy, cz * cx - sy * sz];
  },
  'schwarz-p'(x, y, z) {
    return [Math.cos(x) + Math.cos(y) + Math.cos(z), -Math.sin(x), -Math.sin(y), -Math.sin(z)];
  },
  'schwarz-d'(x, y, z) {
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
    return [sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz,
      cx * sy * sz + cx * cy * cz - sx * sy * cz - sx * cy * sz,
      sx * cy * sz - sx * sy * cz + cx * cy * cz - cx * sy * sz,
      sx * sy * cz - sx * cy * sz - cx * sy * sz + cx * cy * cz];
  },
  neovius(x, y, z) {
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
    return [3 * (cx + cy + cz) + 4 * cx * cy * cz, -3 * sx - 4 * sx * cy * cz, -3 * sy - 4 * cx * sy * cz, -3 * sz - 4 * cx * cy * sz];
  },
};

/* ------------------------------------- Weierstrass functions, square lattice */

// complex numbers as [re, im]
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

// the lattice of periods 1 and i (half periods w1 = 1/2, w3 = i/2), nome
// q = exp(i pi tau) = exp(-pi); theta_1 and its first two derivatives at
// v = pi z, by their series (eight terms are more than enough here)
const Q = Math.exp(-Math.PI), NT = 8;
const QN = Array.from({ length: NT }, (_, n) => (n % 2 ? -2 : 2) * Math.pow(Q, (n + 0.5) * (n + 0.5)));
function theta(a, b) {
  let t0r = 0, t0i = 0, t1r = 0, t1i = 0, t2r = 0, t2i = 0;
  for (let n = 0; n < NT; n++) {
    const k = 2 * n + 1, ch = Math.cosh(k * b), sh = Math.sinh(k * b), s = Math.sin(k * a), c = Math.cos(k * a), w = QN[n];
    // sin(k v) = sin(ka) cosh(kb) + i cos(ka) sinh(kb), cos(k v) = cos(ka) cosh(kb) - i sin(ka) sinh(kb)
    t0r += w * s * ch; t0i += w * c * sh;
    t1r += w * k * c * ch; t1i -= w * k * s * sh;
    t2r -= w * k * k * s * ch; t2i -= w * k * k * c * sh;
  }
  return [[t0r, t0i], [t1r, t1i], [t2r, t2i]];
}
// eta_1 = zeta(w1) = -pi^2 theta_1'''(0) / (12 w1 theta_1'(0))
const ETA1 = (() => {
  let d1 = 0, d3 = 0;
  for (let n = 0; n < NT; n++) { const k = 2 * n + 1; d1 += QN[n] * k; d3 -= QN[n] * k * k * k; }
  return -Math.PI * Math.PI * d3 / (12 * 0.5 * d1);
})();
// zeta(z) = 2 eta_1 z + pi theta_1'(v) / theta_1(v) and
// wp(z) = -2 eta_1 - pi^2 (theta_1''/theta_1 - (theta_1'/theta_1)^2), v = pi z
export function zetaWp(z) {
  const [t0, t1, t2] = theta(Math.PI * z[0], Math.PI * z[1]);
  const L = cdiv(t1, t0), L2 = cdiv(t2, t0), LL = cmul(L, L);
  const zeta = [2 * ETA1 * z[0] + Math.PI * L[0], 2 * ETA1 * z[1] + Math.PI * L[1]];
  const wp = [-2 * ETA1 - Math.PI * Math.PI * (L2[0] - LL[0]), -Math.PI * Math.PI * (L2[1] - LL[1])];
  return { zeta, wp };
}
// e1 = wp(1/2) = 6.87519..., g2 = 189.0727...
export const E1 = zetaWp([0.5, 0]).wp[0];

// Costa's surface in the form of A. Gray (Modern Differential Geometry of
// Curves and Surfaces, 1998), for w = u + i v in the unit square: a planar
// end at the corners and two catenoidal ends at 1/2 and i/2; null near them
export function costa(u, v) {
  const a = zetaWp([u, v]), b = zetaWp([u - 0.5, v]), c = zetaWp([u, v - 0.5]);
  const k = Math.PI / (2 * E1), c0 = Math.PI * Math.PI / (4 * E1);
  const x = 0.5 * (-a.zeta[0] + Math.PI * u + c0 + k * (b.zeta[0] - c.zeta[0]));
  const y = 0.5 * (a.zeta[1] + Math.PI * v + c0 + k * (b.zeta[1] - c.zeta[1]));
  const r = cdiv([a.wp[0] - E1, a.wp[1]], [a.wp[0] + E1, a.wp[1]]);
  const z = Math.sqrt(2 * Math.PI) / 4 * Math.log(Math.hypot(r[0], r[1]));
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}
// the centre of Costa's surface in the coordinates above: the point where the
// lines of symmetry meet (w = (1 + i)/2), found once
export const COSTA_C = costa(0.5, 0.5);

// Enneper's surface, (u, v) = r (cos t, sin t)
export const enneper = (u, v) => [u - u * u * u / 3 + u * v * v, v - v * v * v / 3 + v * u * u, u * u - v * v];

/* ------------------------------------------------------------ the solid -- */

export const SURFACES = ['gyroid', 'schwarz-p', 'schwarz-d', 'neovius', 'costa', 'enneper'];
export const isTPMS = s => s in TPMS;

// the cell of the grid for a resolution, in mm
export function cellOf({ size = 60, wall = 1.6, res = 'draft' }) {
  const [n, k] = { preview: [70, 1.8], draft: [80, 1.8], fine: [140, 2.6] }[res] || [80, 1.8];
  return Math.min(size / n, wall / k);
}

// o: { surface, container ('cube', 'sphere', 'cylinder'), cells (periods
// across), wall (mm), size (mm, the side of the cube or the diameter),
// flat (a flat cut at the bottom of a sphere), reach (Enneper: the radius of
// the patch), base (Enneper: a disc and a post), res }
export function solid(o = {}, progress) {
  const { surface = 'gyroid', container = 'cube', cells = 2, wall = 1.6, size = 60, flat = true, reach = 1.4, base = true } = o;
  const h = cellOf(o), a = size / 2;
  // the container, and the height of the flat cut of a sphere
  const zcut = container === 'sphere' && flat ? -0.72 * a : -a;
  // Costa's surface in a cylinder half as tall as wide, which shows its
  // planar end as a flat ring between the two catenoids
  const hz = surface === 'costa' && container === 'cylinder' ? 0.5 * a : a;
  const shape = container === 'sphere' ? sphere(a) : container === 'cylinder' ? cylinder(a, hz) : box(a, a, a);
  const clip = zcut > -a ? intersect(shape, slab(zcut, a + 1)) : shape;
  const bnd = [[-a, -a, Math.max(zcut, -hz)], [a, a, hz]];
  let m;
  if (isTPMS(surface)) {
    const F = TPMS[surface], k = 2 * Math.PI * cells / size, w2 = wall / 2;
    // the cube holds whole periods; the sphere and the cylinder are centred
    // on a point of the surface
    const off = container === 'cube' ? 0 : surface === 'schwarz-p' || surface === 'neovius' ? Math.PI / 2 : 0;
    const sheet = (x, y, z) => {
      const [f, gx, gy, gz] = F(k * x + off, k * y + off, k * z + off);
      return Math.abs(f) / (k * Math.max(1e-3, Math.hypot(gx, gy, gz))) - w2;
    };
    m = implicitSolid(intersect(sheet, clip), bnd, h, { progress });
  } else if (surface === 'costa') {
    // radius 2.2 of Gray's coordinates to the container
    const s = a / 2.2, C = COSTA_C, fd = new Field(bnd, h, wall / 2 + 2 * h);
    const p = (u, v) => { const q = costa(u, v); return q && [(q[0] - C[0]) * s, (q[1] - C[1]) * s, q[2] * s]; };
    fd.surface(p, [0, 1], [0, 1], 160, 160, { keep: q => clip(...q) < wall });
    if (progress) progress(0.4);
    m = fd.solid(wall / 2, { clip, progress: progress && (f => progress(0.4 + 0.6 * f)) });
  } else {
    // Enneper's patch r <= reach, its largest side at the size (with the
    // stand under it, a disc and a post up to the saddle point, a third of
    // the height); W is the half width of the rim along x
    const R = reach, lift = base ? 0.32 * size : 0;
    let W = 0;
    for (let k = 0; k < 720; k++) W = Math.max(W, Math.abs(enneper(R * Math.cos(k * Math.PI / 360), R * Math.sin(k * Math.PI / 360))[0]));
    const s = Math.min(a / W, (size - lift) / (2 * R * R)), zl = -R * R * s, z0 = zl - lift;
    const fd = new Field([[-a, -a, z0], [a, a, R * R * s]], h, wall / 2 + 2 * h);
    fd.surface((r, t) => enneper(r * Math.cos(t), r * Math.sin(t)).map(c => c * s), [0, R], [0, 2 * Math.PI], 90, 240);
    if (progress) progress(0.4);
    const add = base ? union(translate(cylinder(0.32 * size, 1.2), [0, 0, z0 + 1.2]), translate(cylinder(Math.max(3, 0.07 * size), (0 - z0) / 2), [0, 0, z0 / 2])) : undefined;
    m = fd.solid(wall / 2, { add, progress: progress && (f => progress(0.4 + 0.6 * f)) });
  }
  return onBed(m);
}

export const fileName = o => `${o.surface}${o.surface === 'enneper' ? '' : '_' + o.container}${isTPMS(o.surface) ? '_' + o.cells + 'cells' : ''}_${o.size}mm_w${o.wall}`;

// Famous equations as printable solids, in millimetres: Taubin's heart, an
// algebraic surface of degree 6 traced by its level set (the value divided by
// the gradient, a distance to first order) and set on a disc; Fay's butterfly
// curve, drawn as a relief of strokes of constant width (a distance field in
// the plane, extruded); and a Lissajous knot, a tube around the curve of three
// cosines, by the distance field of src/forms/mathematics/field.js, standing
// on a disc. solid(o, progress) is what the page and the download panel call,
// in a worker.

import { implicitSolid, onBed, cylinder, translate, smoothUnion, intersect, slab } from '../../print/index.js';
import { Field } from '../mathematics/field.js';

export const EQUATIONS = ['heart', 'butterfly', 'lissajous'];

/* ------------------------------------------------------------- heart -- */

/* --------------------------------------------------------- butterfly -- */

// Fay's butterfly r = e^{sin t} - 2 cos 4t + sin^5((2t - pi)/24), turned so
// that the body is upright: [x, y] = r (cos t, sin t)
export const fayR = t => Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5);
export function butterfly(turns = 12, n = 0) {
  const N = n || Math.round(900 * turns), P = [];
  for (let i = 0; i <= N; i++) { const t = 2 * Math.PI * turns * i / N, r = fayR(t); P.push([r * Math.cos(t), r * Math.sin(t)]); }
  return P;
}

// a distance field in the plane: the distance from a polyline on a grid of
// step g over the box, read back bilinearly
function plane2d(pts, [[x0, y0], [x1, y1]], g, cut) {
  const nx = Math.ceil((x1 - x0) / g) + 1, ny = Math.ceil((y1 - y0) / g) + 1, d = new Float32Array(nx * ny).fill(cut);
  for (let s = 0; s + 1 < pts.length; s++) {
    const a = pts[s], b = pts[s + 1], ex = b[0] - a[0], ey = b[1] - a[1], ee = ex * ex + ey * ey || 1;
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - cut - x0) / g)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + cut - x0) / g));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - cut - y0) / g)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + cut - y0) / g));
    for (let j = j0; j <= j1; j++) {
      const wy = y0 + j * g - a[1];
      for (let i = i0; i <= i1; i++) {
        const wx = x0 + i * g - a[0];
        let t = (wx * ex + wy * ey) / ee;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const v = Math.hypot(wx - t * ex, wy - t * ey), k = j * nx + i;
        if (v < d[k]) d[k] = v;
      }
    }
  }
  return (x, y) => {
    const fx = (x - x0) / g, fy = (y - y0) / g, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return cut;
    const u = fx - i, v = fy - j, k = j * nx + i;
    return (1 - v) * ((1 - u) * d[k] + u * d[k + 1]) + v * ((1 - u) * d[k + nx] + u * d[k + nx + 1]);
  };
}

/* --------------------------------------------------------- Lissajous -- */

// the curve (cos(nx t + px), cos(ny t + py), cos(nz t + pz)), t in [0, 2 pi)
export function lissajous({ nx = 3, ny = 2, nz = 7, px = 0.7, py = 0.2, pz = 0 }, n = 2400) {
  return Array.from({ length: n }, (_, i) => {
    const t = 2 * Math.PI * i / n;
    return [Math.cos(nx * t + px), Math.cos(ny * t + py), Math.cos(nz * t + pz)];
  });
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// the frequencies pairwise coprime: only then is the curve a knot (else it
// runs over itself or crosses itself)
export const coprime = ({ nx, ny, nz }) => gcd(nx, ny) === 1 && gcd(ny, nz) === 1 && gcd(nx, nz) === 1;

/* ------------------------------------------------------------ the solid -- */

const H = { preview: [70, 2.2], draft: [130, 3], fine: [200, 4] };

// o: { eq, size (mm, the largest side), base, res; butterfly: turns,
// stroke (width, mm), relief (height, mm); Lissajous: nx, ny, nz, px, py,
// pz, tube (radius, mm) }
export function solid(o = {}, progress) {
  const { eq = 'heart', size = 70, base = true, res = 'draft' } = o;
  const [nres, kres] = H[res] || H.draft;
  let m;
  if (eq === 'heart') {
    // x in [-1.14, 1.14] at the widest: the width is the size
    const s = size / 2.28, h = size / nres;
    const lift = base ? 3 : 0, zt = -s;
    // f = A^3 - z^3 k with k = x^2 + 9/80 y^2 has the zeros of g = A - z k^(1/3),
    // whose gradient does not vanish on the surface (that of f does where
    // A = z = 0, all round the widest part); g over its gradient, taken by
    // differences, is a distance to first order
    const g = (x, y, z) => x * x + 2.25 * y * y + z * z - 1 - z * Math.cbrt(x * x + 0.1125 * y * y);
    const e = 1e-4;
    const f0 = (x, y, z) => {
      x /= s; y /= s; z /= s;
      const v = g(x, y, z), gx = g(x + e, y, z) - g(x - e, y, z), gy = g(x, y + e, z) - g(x, y - e, z), gz = g(x, y, z + e) - g(x, y, z - e);
      return s * v / Math.max(0.2, Math.hypot(gx, gy, gz) / (2 * e));
    };
    // the disc under the tip, joined with a fillet
    const disc = translate(cylinder(0.3 * size, lift / 2), [0, 0, zt - lift / 2 + 0.6]);
    const f = base ? smoothUnion(f0, disc, 0.06 * size) : f0;
    m = implicitSolid(f, [[-0.62 * size, -0.4 * size, zt - lift], [0.62 * size, 0.4 * size, 1.3 * s]], h, { progress });
  } else if (eq === 'butterfly') {
    const { turns = 12, stroke = 1.6, relief = 3 } = o;
    // the box of the curve, its width the size
    const P = butterfly(turns);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = (size - stroke) / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const Q = P.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
    const w = stroke / 2, ex = (x1 - x0) * s / 2 + stroke, ey = (y1 - y0) * s / 2 + stroke;
    const h = Math.min(size / nres, stroke / kres), d = plane2d(Q, [[-ex, -ey], [ex, ey]], h / 2, w + 3 * h);
    if (progress) progress(0.3);
    const f = (x, y, z) => Math.max(d(x, y) - w, -z, z - relief);
    m = implicitSolid(f, [[-ex, -ey, 0], [ex, ey, relief]], h, { progress: progress && (q => progress(0.3 + 0.7 * q)) });
  } else {
    const { tube = 2.4 } = o, kk = { nx: 3, ny: 2, nz: 7, px: 0.7, py: 0.2, pz: 0, ...o };
    const a = size / 2 - tube, h = Math.min(size / nres, tube / kres * 1.6);
    const P = lissajous(kk, 3000).map(p => p.map(c => c * a));
    const zb = -a - tube - (base ? 2.4 : 0);
    const fd = new Field([[-size / 2, -size / 2, zb], [size / 2, size / 2, a + tube]], h, tube + 2 * h);
    fd.curve(P, true);
    if (progress) progress(0.35);
    // a disc 3 mm thick into which the lowest arcs sink
    const add = base ? intersect(cylinder(0.45 * size, size), slab(zb, zb + 3)) : undefined;
    m = fd.solid(tube, { add, progress: progress && (q => progress(0.35 + 0.65 * q)) });
  }
  return onBed(m);
}

const r2 = x => Math.round(x * 100) / 100;
export const fileName = o => o.eq === 'heart' ? `taubin_heart_${o.size}mm${o.base ? '_base' : ''}`
  : o.eq === 'butterfly' ? `fay_butterfly_${o.turns}turns_${o.size}mm`
  : `lissajous_${o.nx}_${o.ny}_${o.nz}_${r2(o.px)}_${r2(o.py)}_${r2(o.pz)}_${o.size}mm${o.base ? '_base' : ''}`;

// The loss landscapes of a small network and of a logistic regression,
// computed offline by landscape.py (data.js), as reliefs to print: the loss
// on a plane through the trained weights, low where the loss is low, with the
// path of gradient descent engraved. No DOM: solid() runs in a worker.

import D from './data.js';
import { heightfield } from '../../print/index.js';

export const data = D;

// the loss of model m ('net' | 'logreg') on the plane of dirs ('random' |
// 'pca' | 'interp') at the plane coordinates (a, b), bilinear between the samples
export function lossAt(m, dirs, a, b) {
  const P = D[m][dirs], n = P.n;
  const u = (a - P.lo[0]) / (P.hi[0] - P.lo[0]) * (n - 1), v = (b - P.lo[1]) / (P.hi[1] - P.lo[1]) * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v)));
  const s = Math.max(0, Math.min(1, u - i)), t = Math.max(0, Math.min(1, v - j)), Lg = P.loss;
  return (1 - s) * (1 - t) * Lg[j * n + i] + s * (1 - t) * Lg[j * n + i + 1] + (1 - s) * t * Lg[(j + 1) * n + i] + s * t * Lg[(j + 1) * n + i + 1];
}

// the height of a loss in [0, 1]: its logarithm or the loss itself, from the
// minimum on the plane up to a cap (the 97th percentile), clipped above
export function scaler(m, dirs, scale = 'log') {
  const Lg = D[m][dirs].loss, f = scale === 'log' ? v => Math.log(v + 0.02) : v => v;
  const s = Array.from(Lg, f).sort((x, y) => x - y), lo = s[0], hi = s[Math.floor(0.97 * (s.length - 1))];
  return v => Math.max(0, Math.min(1, (f(v) - lo) / (hi - lo)));
}

// the heights of one landscape on an n x n grid of side `side` mm (row by
// row), with the path engraved: a groove, a cone at the start, a pit at the end
function relief(m, dirs, scale, side, n, reliefMm, engrave) {
  const P = D[m][dirs], h01 = scaler(m, dirs, scale), d = side / (n - 1), H = new Float32Array(n * n);
  const toMm = p => [(p[0] - P.lo[0]) / (P.hi[0] - P.lo[0]) * side, (p[1] - P.lo[1]) / (P.hi[1] - P.lo[1]) * side];
  const path = P.path.map(toMm), st = path[0], en = path.at(-1);
  const gw = 0.8, gd = 0.6, cr = 2.4, ch = 2.5, pr = 1.8, pd = 1.0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * d, y = j * d;
    const a = P.lo[0] + x / side * (P.hi[0] - P.lo[0]), b = P.lo[1] + y / side * (P.hi[1] - P.lo[1]);
    const z = reliefMm * h01(lossAt(m, dirs, a, b));
    let h = z;
    if (engrave) {
      let dm = Infinity;
      for (let k = 1; k < path.length; k++) {
        const p = path[k - 1], q = path[k], ex = q[0] - p[0], ey = q[1] - p[1], wx = x - p[0], wy = y - p[1];
        const tt = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
        dm = Math.min(dm, Math.hypot(wx - tt * ex, wy - tt * ey));
      }
      if (dm < gw) h -= gd * Math.sqrt(1 - (dm / gw) ** 2);
      const re = Math.hypot(x - en[0], y - en[1]);
      if (re < pr) h = Math.min(h, z - pd * Math.sqrt(1 - (re / pr) ** 2));
      const rs = Math.hypot(x - st[0], y - st[1]);
      if (rs < cr) h = Math.max(h, z + ch * (1 - rs / cr));
    }
    H[j * n + i] = h;
  }
  return H;
}

// o: { which: 'net' | 'logreg' | 'both', dirs, scale, size (mm, the width of
// the whole), relief (mm), base (mm), path (engrave it), cell (mm) }
export function solid(o = {}, progress) {
  const { which = 'net', dirs = 'interp', scale = 'log', size = 80, relief: R = 22, base = 3, path = true, cell = 0.35 } = o;
  const gap = 6;
  if (which !== 'both') {
    const n = Math.round(size / cell) + 1, H = relief(which, dirs, scale, size, n, R, path);
    for (let k = 0; k < H.length; k++) H[k] = Math.max(0, H[k] + 1);
    if (progress) progress(0.8);
    return heightfield(H, n, n, { dx: size / (n - 1), dy: size / (n - 1), base });
  }
  // the two side by side on one block, a flat strip between them
  const side = (size - gap) / 2, n = Math.round(side / cell) + 1, d = side / (n - 1);
  const g = Math.max(1, Math.round(gap / d)), nx = 2 * n + g;
  const A = relief('net', dirs, scale, side, n, R, path);
  if (progress) progress(0.4);
  const B = relief('logreg', dirs, scale, side, n, R, path);
  const H = new Float32Array(nx * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    H[j * nx + i] = Math.max(0, A[j * n + i] + 1);
    H[j * nx + n + g + i] = Math.max(0, B[j * n + i] + 1);
  }
  return heightfield(H, nx, n, { dx: d, dy: d, base });
}

export const fileName = o => `loss_landscape_${o.which || 'net'}_${o.dirs || 'interp'}_${o.scale || 'log'}_${o.size}mm`;

// where the second landscape starts, in mm, in the solid 'both'
export function twinOffset(size, cell = 0.35) {
  const side = (size - 6) / 2, n = Math.round(side / cell) + 1, d = side / (n - 1), g = Math.max(1, Math.round(6 / d));
  return { side, offset: (n + g) * d };
}

// the height in mm of the surface (before engraving) at plane coordinates
export const heightAt = (m, dirs, scale, R, base, a, b) => base + 1 + R * scaler(m, dirs, scale)(lossAt(m, dirs, a, b));

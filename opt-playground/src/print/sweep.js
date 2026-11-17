// A profile swept along a curve in space: a tube around a knot, a horn, a
// ribbon with thickness. The frames along the curve rotate as little as
// possible (double reflection, Wang et al. 2008), and on a closed curve the
// twist left at the end is spread along it, so that the last ring meets the
// first. The solid is closed: an open curve gets flat caps, a closed one
// none. It does not cross itself as long as the profile is smaller than the
// radius of curvature of the curve and the curve keeps away from itself.

import { outwards } from './mesh.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const axpy = (s, a, b) => [b[0] + s * a[0], b[1] + s * a[1], b[2] + s * a[2]];

// points [[x, y, z], ...] (a closed curve does not repeat its first point);
// profile [[u, v], ...] counterclockwise and star-shaped around (0, 0), u
// along the normal and v along the binormal; scale(t), t in [0, 1] along the
// curve, multiplies the profile
export function sweep(points, profile, { closed = false, scale = () => 1 } = {}) {
  const n = points.length, m = profile.length;
  const T = points.map((p, i) => {
    const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return nrm(sub(b, a));
  });
  // a first normal, perpendicular to the first tangent
  const t0 = T[0], pick = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const N = [nrm(crs(crs(t0, pick), t0))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n, v1 = sub(points[j], points[i]), c1 = dot(v1, v1) || 1;
    const rL = axpy(-2 * dot(v1, N[i]) / c1, v1, N[i]), tL = axpy(-2 * dot(v1, T[i]) / c1, v1, T[i]);
    const v2 = sub(T[j], tL), c2 = dot(v2, v2);
    N.push(c2 < 1e-20 ? rL : nrm(axpy(-2 * dot(v2, rL) / c2, v2, rL)));
  }
  let twist = 0;
  if (closed) {
    // the angle from the normal carried round to the first one
    const a = N[n], b = N[0];
    twist = Math.atan2(dot(crs(a, b), T[0]), dot(a, b));
  }
  const pos = new Float32Array(3 * (n * m + (closed ? 0 : 2))), idx = [];
  for (let i = 0; i < n; i++) {
    const tt = closed ? i / n : i / (n - 1), s = scale(tt), ang = twist * (closed ? i / n : 0);
    let Ni = N[i];
    const Bi0 = crs(T[i], Ni), c = Math.cos(ang), sn = Math.sin(ang);
    Ni = [c * Ni[0] + sn * Bi0[0], c * Ni[1] + sn * Bi0[1], c * Ni[2] + sn * Bi0[2]];
    const Bi = crs(T[i], Ni), C = points[i];
    for (let j = 0; j < m; j++) {
      const [u, v] = profile[j], o = 3 * (i * m + j);
      pos[o] = C[0] + s * (u * Ni[0] + v * Bi[0]); pos[o + 1] = C[1] + s * (u * Ni[1] + v * Bi[1]); pos[o + 2] = C[2] + s * (u * Ni[2] + v * Bi[2]);
    }
  }
  const ring = i => i * m, rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const a = ring(i), b = ring((i + 1) % n);
    for (let j = 0; j < m; j++) {
      const k = (j + 1) % m;
      idx.push(a + j, b + k, b + j, a + j, a + k, b + k);
    }
  }
  if (!closed) {
    const c0 = n * m, c1 = n * m + 1;
    pos.set(points[0], 3 * c0); pos.set(points[n - 1], 3 * c1);
    for (let j = 0; j < m; j++) {
      const k = (j + 1) % m;
      idx.push(c0, ring(0) + k, ring(0) + j, c1, ring(n - 1) + j, ring(n - 1) + k);
    }
  }
  return outwards({ pos, idx: Uint32Array.from(idx) });
}

// a regular polygon of `sides` sides and radius r, counterclockwise
export const circle = (r, sides = 24) => Array.from({ length: sides }, (_, j) => [r * Math.cos(2 * Math.PI * j / sides), r * Math.sin(2 * Math.PI * j / sides)]);

// a tube of radius r (a number, or a function of t in [0, 1]) along the curve
export function tube(points, r, { closed = false, sides = 24 } = {}) {
  return typeof r === 'function'
    ? sweep(points, circle(1, sides), { closed, scale: r })
    : sweep(points, circle(r, sides), { closed });
}

// a curve sampled from a function c(t) -> [x, y, z], t in [t0, t1], n points
// (for a closed curve t1 is not repeated)
export function sample(c, t0, t1, n, closed = false) {
  const k = closed ? n : n - 1;
  return Array.from({ length: n }, (_, i) => c(t0 + (t1 - t0) * i / k));
}

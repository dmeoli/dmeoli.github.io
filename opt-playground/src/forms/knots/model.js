// Knots and one-sided surfaces as printable solids, in millimetres: torus
// knots and links, the trefoil and the figure-eight knot as tubes; the
// Moebius band, the Klein bottle (the classic immersion and the figure-8 one)
// and Boy's surface (Bryant-Kusner) as walls. All of them are the points
// within a distance of a curve or of a surface, by the distance field of
// src/forms/mathematics/field.js, so that the tubes may touch and the
// surfaces cross themselves and the solid stays closed. solid(o, progress)
// is what the page and the download panel call, in a worker.

import { onBed, cylinder, translate, union, slab, intersect } from '../../print/index.js';
import { Field } from '../mathematics/field.js';

const { sin, cos, PI, sqrt } = Math;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/* ------------------------------------------------------------- curves -- */

// the (p, q) torus knot, or for d = gcd(p, q) > 1 the link of d components,
// each a (p/d, q/d) knot turned by 2 pi k / p about the core of the torus
export function torusKnot(p, q, n = 400) {
  const d = gcd(p, q), P = p / d, Q = q / d, N = n * Math.max(P, Q);
  return Array.from({ length: d }, (_, k) => Array.from({ length: N }, (_, i) => {
    const t = 2 * PI * i / N, th = Q * t + 2 * PI * k / p, r = 2 + cos(th);
    return [r * cos(P * t), r * sin(P * t), -sin(th)];
  }));
}
export const trefoil = (n = 900) => [Array.from({ length: n }, (_, i) => {
  const t = 2 * PI * i / n;
  return [sin(t) + 2 * sin(2 * t), cos(t) - 2 * cos(2 * t), -sin(3 * t)];
})];
export const figureEight = (n = 1200) => [Array.from({ length: n }, (_, i) => {
  const t = 2 * PI * i / n;
  return [(2 + cos(2 * t)) * cos(3 * t), (2 + cos(2 * t)) * sin(3 * t), sin(4 * t)];
})];

/* ----------------------------------------------------------- surfaces -- */

// the band of k half twists around the unit circle, half width 0.42
export const moebius = k => (s, t) => {
  const a = k * t / 2, w = 0.42 * s;
  return [(1 + w * cos(a)) * cos(t), (1 + w * cos(a)) * sin(t), w * sin(a)];
};
// the classic Klein bottle, u in [0, pi], v in [0, 2 pi] (the formula of
// R. Ferreol), turned so that the bottle stands along z
export function kleinRaw(u, v) {
  const cu = cos(u), su = sin(u), cv = cos(v), sv = sin(v), c2 = cu * cu, c4 = c2 * c2, c6 = c4 * c2;
  return [-2 / 15 * cu * (3 * cv - 30 * su + 90 * c4 * su - 60 * c6 * su + 5 * cu * cv * su),
    -1 / 15 * su * (3 * cv - 3 * c2 * cv - 48 * c4 * cv + 48 * c6 * cv - 60 * su + 5 * cu * cv * su
      - 5 * c2 * cu * cv * su - 80 * c4 * cu * cv * su + 80 * c6 * cu * cv * su),
    2 / 15 * (3 + 5 * cu * su) * sv];
}
// the figure-8 immersion, u, v in [0, 2 pi], radius 2
export function klein8(u, v) {
  const r = 2 + cos(u / 2) * sin(v) - sin(u / 2) * sin(2 * v);
  return [r * cos(u), r * sin(u), sin(u / 2) * sin(v) + cos(u / 2) * sin(2 * v)];
}
// Boy's surface by the formula of Bryant and Kusner, w = r e^{it} in the unit disc
export function boy(r, t) {
  const a = r * cos(t), b = r * sin(t);
  const mul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const div = (x, y) => { const d = y[0] * y[0] + y[1] * y[1]; return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; };
  const w = [a, b], w2 = mul(w, w), w3 = mul(w2, w), w4 = mul(w2, w2), w6 = mul(w3, w3);
  const den = [w6[0] + sqrt(5) * w3[0] - 1, w6[1] + sqrt(5) * w3[1]];
  const g1 = -1.5 * div(mul(w, [1 - w4[0], -w4[1]]), den)[1];
  const g2 = -1.5 * div(mul(w, [1 + w4[0], w4[1]]), den)[0];
  const g3 = div([1 + w6[0], w6[1]], den)[1] - 0.5;
  const q = g1 * g1 + g2 * g2 + g3 * g3;
  return [g1 / q, g2 / q, g3 / q];
}

/* ----------------------------------------------------------- objects -- */

export const OBJECTS = ['torus-knot', 'trefoil', 'figure-eight', 'moebius', 'klein', 'klein8', 'boy'];
export const isKnot = s => s === 'torus-knot' || s === 'trefoil' || s === 'figure-eight';

// the geometry in model units: { curves } or { surf, u, v, n }
function geometry({ object = 'trefoil', p = 2, q = 3, twists = 1, half = false }) {
  switch (object) {
    case 'torus-knot': return { curves: torusKnot(p, q) };
    case 'trefoil': return { curves: trefoil() };
    case 'figure-eight': return { curves: figureEight() };
    case 'moebius': return { surf: moebius(twists), u: [-1, 1], v: [0, 2 * PI], n: [24, 120 + 40 * twists] };
    case 'klein': {
      // upright (the axis of the bottle along z), or the half z >= 0 of the
      // raw formula, lying on its plane of symmetry
      const f = half ? kleinRaw : (u, v) => { const [x, y, z] = kleinRaw(u, v); return [x, z, -y]; };
      return { surf: f, u: [0, PI], v: [0, 2 * PI], n: [160, 64], cutBelow: half ? 0 : null };
    }
    case 'klein8': return { surf: klein8, u: [0, 2 * PI], v: [0, 2 * PI], n: [160, 64] };
    default: return { surf: (r, t) => { const [x, y, z] = boy(r, t); return [x, -y, -z]; }, u: [0, 1], v: [0, 2 * PI], n: [60, 200] };
  }
}

// the cell of the grid for a resolution, in mm
export function cellOf({ object = 'trefoil', size = 80, tube = 6, wall = 2, res = 'draft' }) {
  const t = isKnot(object) ? tube : wall;
  const [n, k] = { preview: [90, 1.8], draft: [150, 2.4], fine: [240, 3.2] }[res] || [150, 2.4];
  // Boy's surface and the figure-8 bottle fold over themselves inside: a
  // coarser grid keeps their triangles as many as those of the others
  const c = object === 'boy' ? 1.6 : object === 'klein8' ? 1.4 : 1;
  return c * Math.min(size / n, t / k);
}

// o: { object, p, q (torus knot), twists (Moebius, half twists), half (Klein
// bottle cut on its plane of symmetry), size (mm, the largest side of the
// form), tube (diameter of the knots, mm), wall (of the surfaces, mm),
// base (a disc; the surfaces stand on a post), res }
export function solid(o = {}, progress) {
  const { object = 'trefoil', size = 80, tube = 6, wall = 2, base = false } = o;
  const g = geometry(o), knot = isKnot(object), th = knot ? tube : wall, h = cellOf(o);
  // the points in model units, for the box
  let pts;
  if (g.curves) pts = g.curves.flat();
  else {
    pts = [];
    for (let i = 0; i <= 80; i++) for (let j = 0; j <= 80; j++) pts.push(g.surf(g.u[0] + (g.u[1] - g.u[0]) * i / 80, g.v[0] + (g.v[1] - g.v[0]) * j / 80));
    if (g.cutBelow !== null && g.cutBelow !== undefined) pts = pts.filter(p => p[2] >= g.cutBelow);
  }
  const mn = [0, 1, 2].map(a => Math.min(...pts.map(p => p[a]))), mx = [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])));
  const c = [0, 1, 2].map(a => (mn[a] + mx[a]) / 2);
  const cut = g.cutBelow === 0, post = base && !cut && !knot;
  // the largest side is the size, the post and the disc included
  const s = Math.min((size - th) / Math.max(mx[0] - mn[0], mx[1] - mn[1]),
    (size - th - (post ? 0.14 * size + 2.4 : 0)) / (mx[2] - (cut ? 0 : mn[2])));
  // to mm, centred in x and y, the lowest point (or the cut) at z = 0
  const z0 = cut ? 0 : mn[2];
  const T = p => [(p[0] - c[0]) * s, (p[1] - c[1]) * s, (p[2] - z0) * s];
  const W = (mx[0] - mn[0]) * s / 2, D = (mx[1] - mn[1]) * s / 2, H = (mx[2] - z0) * s;
  // the base: a disc 2.4 mm thick; a knot sinks into it by a quarter of the
  // tube, a surface stands on a post up to its lowest point
  let add, zb = -th / 2, clip;
  if (base && !cut) {
    const R = Math.max(12, (knot ? 0.42 : 0.36) * size), lift = knot ? 0 : 0.14 * size, top = -th / 2 + (knot ? th / 4 : 0) - lift;
    zb = top - 2.4;
    const low = T(pts.reduce((a, b) => (b[2] < a[2] ? b : a)));
    const pr = Math.max(2.5, 0.045 * size);
    const disc = translate(cylinder(R, 1.2), [0, 0, top - 1.2]);
    add = knot ? disc : union(disc, translate(cylinder(pr, (lift + th) / 2), [low[0], low[1], top + (lift + th) / 2 - 0.1]));
  }
  if (cut) clip = slab(0, H + th);
  const R0 = add ? Math.max(12, (knot ? 0.42 : 0.36) * size) : 0;
  const fd = new Field([[-Math.max(W, R0) - th, -Math.max(D, R0) - th, cut ? -h : zb - 0.5], [Math.max(W, R0) + th, Math.max(D, R0) + th, H + th]], h, th / 2 + 2 * h);
  if (g.curves) for (const cv of g.curves) fd.curve(cv.map(T), true);
  else fd.surface((u, v) => T(g.surf(u, v)), g.u, g.v, g.n[0], g.n[1], cut ? { keep: q => q[2] > -th } : {});
  if (progress) progress(0.35);
  const m = fd.solid(th / 2, { add, clip: clip && intersect(clip), progress: progress && (f => progress(0.35 + 0.65 * f)) });
  return onBed(m);
}

export const fileName = o => {
  const what = o.object === 'torus-knot' ? `torus_knot_${o.p}_${o.q}` : o.object === 'moebius' ? `moebius_${o.twists}` : o.object === 'klein' && o.half ? 'klein_half' : o.object.replace('-', '_');
  return `${what}_${o.size}mm_${isKnot(o.object) ? 't' + o.tube : 'w' + o.wall}${o.base ? '_base' : ''}`;
};

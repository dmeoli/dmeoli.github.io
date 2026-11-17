// Galton dice tower: the quincunx of Galton wrapped on a cylinder, as in the
// cylindrical board of Mardia, Goodall and Rubbo (2026): a ball that falls
// along the core is pushed half a step to the left or to the right by each
// row of pegs, and lands in one of M bins around the foot, with the wrapped
// binomial law. The solid: the core with teardrop pegs (printable without
// supports), the bins, and a base carrying in relief the numbers of the bins
// and the expected histogram.

import { merge, extrudePolygon, transform } from '../../print/index.js';
import { annulus, numeralSegments } from '../fantasy/util.js';

// the binomial law of the number of steps to the right in n rows, wrapped on
// M bins: bin j collects every k = j + ceil(n/2) mod M; returns M numbers
export function wrapped(n, M, p = 0.5) {
  const P = new Float64Array(M);
  let lg = Array.from({ length: n + 1 }, (_, k) => k);
  const lf = k => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  lg = lg.map(k => lf(n) - lf(k) - lf(n - k) + k * Math.log(p || 1e-300) + (n - k) * Math.log(1 - p || 1e-300));
  for (let k = 0; k <= n; k++) P[(((k - Math.ceil(n / 2)) % M) + M) % M] += Math.exp(lg[k]);
  return P;
}

// the total variation distance between two laws
export const tv = (a, b) => 0.5 * a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);

// the dimensions of the tower in mm, from the ball diameter d, the bins M
// and the rows n
export function geometry({ size: d = 6, M = 10, n = 10 }) {
  const s = 2.3 * d, R = M * s / (2 * Math.PI), v = 0.9 * s, rp = 0.2 * s, hp = 0.8 * d;
  const zb = 3, hw = 1.6 * d, Rg = R + d + 0.6;
  const zLast = zb + hw + 0.8 * s, z0 = zLast + (n - 1) * v, top = z0 + 0.8 * s;
  const Rn = Rg + 1.6 + 4.2, Rbar = Rn + 4.5, Lbar = 10, Rb = Rbar + Lbar + 2;
  return { d, M, n, s, R, v, rp, hp, zb, hw, Rg, zLast, z0, top, Rn, Rbar, Lbar, Rb };
}

// the angle of the pegs of row i (row 0 holds one peg, at angle 0)
export const pegAngle = (g, i, j) => (j + (i % 2) / 2) * 2 * Math.PI / g.M;
// the center of bin j, numbered 1..M from angle 0 on
export const binAngle = (g, j) => (j + (g.n % 2) / 2) * 2 * Math.PI / g.M;

// a peg: a teardrop of radius rp, point down (sides at 45 degrees), as a
// prism along the radius from inside the core to R + hp
function peg(g, th, zc) {
  const { rp, R, hp } = g, poly = [[0, -rp * Math.SQRT2]];
  for (let k = 0; k <= 18; k++) { const a = -Math.PI / 4 + (k / 18) * 1.5 * Math.PI; poly.push([rp * Math.cos(a), rp * Math.sin(a)]); }
  const m = extrudePolygon(poly, hp + 1);
  const u = [Math.cos(th), Math.sin(th)], t = [-Math.sin(th), Math.cos(th)];
  return transform(m, ([x, y, z]) => { const r = R - 1 + z; return [r * u[0] + x * t[0], r * u[1] + x * t[1], zc + y]; });
}

// a radial wall between two bins, from inside the core to inside the ring
function binWall(g, th) {
  const { R, Rg, zb, hw } = g, w = 1.2;
  const m = extrudePolygon([[R - 0.6, -w / 2], [Rg + 0.6, -w / 2], [Rg + 0.6, w / 2], [R - 0.6, w / 2]], hw + 0.2);
  const c = Math.cos(th), s = Math.sin(th);
  return transform(m, ([x, y, z]) => [x * c - y * s, x * s + y * c, zb - 0.2 + z]);
}

// the base: a disc carrying in relief the number of each bin and, further
// out, a bar per bin whose length is its expected probability (the longest
// bar is Lbar), with a thin circle at the uniform law 1/M; strokes and bars
// are thin boxes standing 0.6 mm on the disc
function base(g, P) {
  const { M, Rb, zb, Rn, Rbar, Lbar } = g, up = 0.6, Pm = Math.max(...P), parts = [annulus(0, Rb, 0, zb, Math.max(128, 12 * M))];
  // a box from (x0, y0) to (x1, y1) in the frame of bin j (q along the
  // radius, p across it), of width w
  const bar = (j, p0, q0, p1, q1, w) => {
    const L = Math.hypot(p1 - p0, q1 - q0) + w, ex = (p1 - p0) / (L - w || 1), ey = (q1 - q0) / (L - w || 1);
    const m = extrudePolygon([[-L / 2, -w / 2], [L / 2, -w / 2], [L / 2, w / 2], [-L / 2, w / 2]], up + 0.1);
    const cp = (p0 + p1) / 2, cq = (q0 + q1) / 2, a = binAngle(g, j), u = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
    return transform(m, ([x, y, z]) => {
      const pp = cp + x * ex - y * ey, qq = cq + x * ey + y * ex;
      return [qq * u[0] + pp * t[0], qq * u[1] + pp * t[1], zb - 0.1 + z];
    });
  };
  for (let j = 0; j < M; j++) {
    // the digits read from outside, upright towards the rim
    // (vertical strokes a little wider, so that no two boxes share a corner)
    for (const [x0, y0, x1, y1] of numeralSegments(j + 1, 3.2)) parts.push(bar(j, -x0, Rn + y0, -x1, Rn + y1, x0 === x1 ? 0.78 : 0.7));
    const len = Lbar * P[j] / Pm, half = Math.min(1.6, 0.35 * Rbar * 2 * Math.PI / M);
    if (len > 0.3) parts.push(bar(j, 0, Rbar, 0, Rbar + len - 2 * half, 2 * half));
  }
  const ru = Rbar + Lbar / M / Pm;
  parts.push(annulus(ru - 0.2, ru + 0.2, zb - 0.1, zb + up / 2, Math.max(128, 12 * M)));
  return merge(...parts);
}

// o: size (ball diameter, mm), M, n, p, sleeve, res
export function solid(o, progress) {
  const g = geometry(o), parts = [];
  const P = wrapped(g.n, g.M, o.p ?? 0.5);
  parts.push(base(g, P));
  if (progress) progress(0.5);
  parts.push(annulus(0, g.R, g.zb - 0.2, g.top, Math.max(64, 6 * g.M)));
  parts.push(annulus(g.Rg, g.Rg + 1.6, g.zb - 0.2, g.zb + g.hw, Math.max(96, 8 * g.M)));
  // the mark of the start, on the top of the core above the first peg
  parts.push(annulus(0, 1.2, g.top - 0.2, g.top + 1.2, 16, g.R - 2.5, 0));
  for (let i = 0; i < g.n; i++) {
    const zc = g.z0 - i * g.v;
    if (i === 0) parts.push(peg(g, 0, zc));
    else for (let j = 0; j < g.M; j++) parts.push(peg(g, pegAngle(g, i, j), zc));
  }
  for (let j = 0; j < g.M; j++) parts.push(binWall(g, binAngle(g, j) + Math.PI / g.M));
  if (o.sleeve) {
    // a tube to hold the balls against the pegs, printed beside the tower
    const off = g.Rb + g.Rg + 6, hgt = g.top - (g.zb + g.hw);
    parts.push(annulus(g.Rg + 0.05, g.Rg + 1.65, 0, hgt, Math.max(96, 8 * g.M), off, 0));
  }
  if (progress) progress(1);
  const m = merge(...parts);
  m.note = `${g.top.toFixed(0)} mm, Ø ${(2 * g.Rb).toFixed(0)} mm`;
  return m;
}

export const fileName = o => `galton_tower_M${o.M}_n${o.n}_ball${o.size}mm`;

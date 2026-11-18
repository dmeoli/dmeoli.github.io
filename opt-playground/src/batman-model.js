// The Batman equation as seven functions and two inequalities, after the
// GeoGebra file of the scene (assets/batman.ggb), where t(x) = sqrt(|x| / x)
// is 1 for x > 0 and undefined otherwise, so that each function exists only
// on the interval where the argument of its t is positive:
//   region = ((y > s) or (y > f)) and ((y < g) or (y < p) or (y < h) or (y < r) or (y < q)).
// At every x exactly one lower and one upper function is defined, hence the
// region is the set of the points between two curves, which are written here
// in closed form on their intervals (for x >= 0, the curve being even): the
// outline is sampled on the pieces themselves, never traced from pixels.
// The coefficient of x^2 in f is (3 sqrt 33 - 7) / 112, as in the equation
// of 2011: with it f(4) = s(4) and the outline closes.

import { Layers } from './print/index.js';

const S10 = Math.sqrt(10), S33 = Math.sqrt(33);

export const coef = den => (3 * S33 - 7) / den;

// the pieces: side, interval of |x|, value at x >= 0, straight or not, the
// formula as in the file, and the names
export function pieces(den = 112) {
  const c = coef(den);
  return [
    { id: 'p', side: 'upper', a: 0, b: 0.5, straight: true, y: () => 2.25,
      tex: 'p(x) = 2.25\\, t\\big(-(x - 0.5)(x + 0.5)\\big)', en: 'top of the head', it: 'sommità della testa' },
    { id: 'h', side: 'upper', a: 0.5, b: 0.75, straight: true, y: x => 3 * x + 0.75,
      tex: 'h(x) = 3|x| + 0.75\\, t\\big(-(|x| - 0.5)(|x| - 0.75)\\big)', en: 'inner side of the ears', it: 'lato interno delle orecchie' },
    { id: 'g', side: 'upper', a: 0.75, b: 1, straight: true, y: x => 9 - 8 * x,
      tex: 'g(x) = 9\\, t\\big(-(|x| - 1)(|x| - 0.75)\\big) - 8|x|', en: 'outer side of the ears', it: 'lato esterno delle orecchie' },
    { id: 'q', side: 'upper', a: 1, b: 3, y: x => 6 * S10 / 7 + 1.5 - 0.5 * x - 3 * S10 / 7 * Math.sqrt(Math.max(0, 4 - (x - 1) ** 2)),
      tex: 'q(x) = \\tfrac{6\\sqrt{10}}{7} + (1.5 - 0.5|x|)\\, t(|x| - 1) - \\tfrac{6\\sqrt{10}}{14} \\sqrt{4 - (|x| - 1)^2}', en: 'shoulders', it: 'spalle' },
    { id: 'r', side: 'upper', a: 3, b: 7, y: x => 3 * Math.sqrt(Math.max(0, 1 - (x / 7) ** 2)),
      tex: 'r(x) = 3 \\sqrt{1 - (x/7)^2}\\; t(|x| - 3)', en: 'top of the wings', it: 'bordo superiore delle ali' },
    { id: 's', side: 'lower', a: 4, b: 7, y: x => -3 * Math.sqrt(Math.max(0, 1 - (x / 7) ** 2)),
      tex: 's(x) = -3 \\sqrt{1 - (x/7)^2}\\; t(|x| - 4)', en: 'bottom of the wings', it: 'bordo inferiore delle ali' },
    { id: 'f', side: 'lower', a: 0, b: 4, y: x => x / 2 - c * x * x - 3 + Math.sqrt(Math.max(0, 1 - (Math.abs(x - 2) - 1) ** 2)),
      tex: `f(x) = \\left|\\tfrac{x}{2}\\right| - \\tfrac{3\\sqrt{33} - 7}{${den}}\\, x^2 - 3 + \\sqrt{1 - \\big(||x| - 2| - 1\\big)^2}`, en: 'scallops of the bottom', it: 'festoni del bordo inferiore' },
  ];
}

// the region by its two inequalities, with the semantics of GeoGebra: a
// comparison with an undefined value is false
export function inRegion(x, y, den = 112) {
  const c = coef(den), t = z => (z > 0 ? 1 : NaN), ax = Math.abs(x);
  const f = ax / 2 - c * x * x - 3 + Math.sqrt(1 - (Math.abs(ax - 2) - 1) ** 2);
  const g = 9 * t(-(ax - 1) * (ax - 0.75)) - 8 * ax;
  const h = 3 * ax + 0.75 * t(-(ax - 0.5) * (ax - 0.75));
  const p = 2.25 * t(-(x - 0.5) * (x + 0.5));
  const q = 6 * S10 / 7 + (1.5 - 0.5 * ax) * t(ax - 1) - 6 * S10 / 14 * Math.sqrt(4 - (ax - 1) ** 2);
  const r = 3 * Math.sqrt(1 - (x / 7) ** 2) * t(ax - 3);
  const s = -3 * Math.sqrt(1 - (x / 7) ** 2) * t(ax - 4);
  return (y > s || y > f) && (y < g || y < p || y < h || y < r || y < q);
}

// the abscissae of the samples on [-7, 7]: the ends of the pieces and of the
// arcs of f (|x| = 0, 1, 2, 3, 4), each interval split with cosine spacing,
// which is dense at both ends, where the square roots have vertical tangents
const BREAKS = [0, 0.5, 0.75, 1, 2, 3, 4, 7];
export function abscissae(density = 24) {
  const half = [0];
  for (let k = 0; k < BREAKS.length - 1; k++) {
    const a = BREAKS[k], b = BREAKS[k + 1], n = Math.max(3, Math.ceil((b - a) * density));
    for (let i = 1; i <= n; i++) half.push(i === n ? b : a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2);
  }
  return [...half.slice(1).reverse().map(x => -x), ...half];
}

// the value of the upper or lower boundary at x, as the limit from the left
// (dir = -1) or from the right (dir = +1) where the pieces change
export function boundary(ps, side, x, dir = 1) {
  const ax = Math.abs(x), d = x < 0 ? -dir : dir;
  for (const P of ps) {
    if (P.side !== side) continue;
    if ((d > 0 && ax >= P.a && ax < P.b) || (d < 0 && ax > P.a && ax <= P.b) || (ax === 0 && P.a === 0) || (ax === 7 && P.b === 7))
      return { y: P.y(ax), id: P.id };
  }
  return null;
}

// the samples of one piece, both halves, as two polylines (one when the
// piece crosses x = 0)
export function piecePolylines(P, xs) {
  const half = xs.filter(x => x >= P.a - 1e-12 && x <= P.b + 1e-12);
  const right = half.map(x => [x, P.y(x)]);
  if (P.a === 0) return [[...right.slice(1).reverse().map(([x, y]) => [-x, y]), ...right]];
  return [right.map(([x, y]) => [-x, y]).reverse(), right];
}

/* ------------------------------------------------- the planar mesh ------ */

// The outline of the bat and, when asked, the oval around it, as vertices in
// the plane and triangles: the region between two chains is cut into
// vertical strips at the sampled abscissae, each strip is a trapezoid with
// vertical sides (convex, possibly with more than two vertices on a side,
// where the outline steps), and is split by a ladder of triangles, each with
// one side on one vertical and the third vertex on the other, so that none
// is degenerate. The oval is the ellipse x^2/A^2 + y^2/B^2 = 1.
export const OVAL = { A: 8, B: 4.1 };

export function planar({ den = 112, density = 24, oval = false } = {}) {
  const ps = pieces(den), xs = abscissae(density), V = [], T = [];
  const vert = (x, y) => (V.push([x, y]), V.length - 1);
  const area = (a, b, c) => (V[b][0] - V[a][0]) * (V[c][1] - V[a][1]) - (V[b][1] - V[a][1]) * (V[c][0] - V[a][0]);
  const tri = (a, b, c) => { const s = area(a, b, c); if (s > 0) T.push(a, b, c); else if (s < 0) T.push(a, c, b); else throw new Error('degenerate triangle'); };
  // a strip between two columns of vertices, each from top to bottom
  const ladder = (L, R) => {
    let i = 0, j = 0;
    while (i < L.length - 1 || j < R.length - 1) {
      if (i === L.length - 1 || (j < R.length - 1 && V[R[j + 1]][1] > V[L[i + 1]][1])) { tri(L[i], R[j + 1], R[j]); j++; }
      else { tri(L[i], L[i + 1], R[j]); i++; }
    }
  };
  // the columns of the bat: the upper vertex and the lower one from each side
  const cols = xs.map(x => {
    const U = boundary(ps, 'upper', x).y, lo = boundary(ps, 'lower', x, -1).y, ro = boundary(ps, 'lower', x, 1).y;
    if (Math.abs(x) === 7) { const P = vert(x, 0); return { x, U: P, lo: P, ro: P, tip: true }; }
    const u = vert(x, U), l = vert(x, lo), r = Math.abs(lo - ro) < 1e-12 ? l : vert(x, ro);
    return { x, U: u, lo: l, ro: r };
  });
  // at a step, the vertical segment belongs to the side that goes deeper
  const batCol = (c, side) => {
    if (c.tip) return [c.U];
    if (c.lo === c.ro) return [c.U, c.lo];
    const deep = V[c.lo][1] < V[c.ro][1] ? 'left' : 'right';
    return side === deep ? [c.U, ...[c.lo, c.ro].sort((a, b) => V[b][1] - V[a][1])] : [c.U, side === 'left' ? c.lo : c.ro];
  };
  for (let k = 0; k < cols.length - 1; k++) ladder(batCol(cols[k], 'right'), batCol(cols[k + 1], 'left'));
  const batTris = T.length;
  // the loop of the outline, counter-clockwise: the lower chain from left to
  // right, then the upper chain back
  const bat = [];
  for (const c of cols) { bat.push(c.lo); if (c.ro !== c.lo) bat.push(c.ro); }
  for (let k = cols.length - 2; k > 0; k--) bat.push(cols[k].U);
  const out = { V, T, bat, batTris, ps, xs, cols };
  if (!oval) return out;

  // the oval: above the bat, below it, and two caps beyond the wing tips
  const { A, B } = OVAL, E = x => B * Math.sqrt(Math.max(0, 1 - (x / A) ** 2));
  const top = cols.map(c => vert(c.x, E(c.x))), bot = cols.map(c => vert(c.x, -E(c.x)));
  for (let k = 0; k < cols.length - 1; k++) {
    ladder([top[k], cols[k].U], [top[k + 1], cols[k + 1].U]);
    // under the bat the step belongs to the side that stays higher
    const under = (c, side) => {
      if (c.tip || c.lo === c.ro) return [c.lo];
      const high = V[c.lo][1] > V[c.ro][1] ? 'left' : 'right';
      return side === high ? [c.lo, c.ro].sort((a, b) => V[b][1] - V[a][1]) : [side === 'left' ? c.lo : c.ro];
    };
    ladder([...under(cols[k], 'right'), bot[k]], [...under(cols[k + 1], 'left'), bot[k + 1]]);
  }
  // the caps, x from 7 to A, with cosine spacing dense at A
  const n = Math.max(6, Math.ceil((A - 7) * density * 1.5)), capR = [], capL = [];
  for (let i = 1; i <= n; i++) {
    const x = 7 + (A - 7) * Math.sin(Math.PI / 2 * i / n);
    if (i === n) { const P = vert(A, 0), Q = vert(-A, 0); capR.push([P]); capL.push([Q]); }
    else { capR.push([vert(x, E(x)), vert(x, -E(x))]); capL.push([vert(-x, E(x)), vert(-x, -E(x))]); }
  }
  const last = cols.length - 1;
  let prevR = [top[last], cols[last].U, bot[last]], prevL = [top[0], cols[0].U, bot[0]];
  for (let i = 0; i < n; i++) { ladder(prevR, capR[i]); ladder(capL[i], prevL); prevR = capR[i]; prevL = capL[i]; }
  // the loop of the ellipse, counter-clockwise from the left end
  const ell = [capL[n - 1][0]];
  for (let i = n - 2; i >= 0; i--) ell.push(capL[i][1]);
  ell.push(...bot);
  for (let i = 0; i < n - 1; i++) ell.push(capR[i][1]);
  ell.push(capR[n - 1][0]);
  for (let i = n - 2; i >= 0; i--) ell.push(capR[i][0]);
  ell.push(...[...top].reverse());
  for (let i = 0; i < n - 1; i++) ell.push(capL[i][0]);
  return { ...out, ell };
}

/* ------------------------------------------------- the solid to print --- */

// The logo extruded into a closed solid in millimetres: the bat alone, of
// thickness thick, or standing thick above an oval plate of thickness plate.
// size is the width of the whole (the bat, or the oval with it).
export function solid({ den = 112, size = 100, thick = 4, plate = 0, density = 24 } = {}) {
  const P = planar({ den, density, oval: plate > 0 });
  const width = plate > 0 ? 2 * OVAL.A : 14, k = size / width;
  const L = new Layers(P.V, k);
  const batT = P.T.slice(0, P.batTris), rest = P.T.slice(P.batTris);
  if (plate > 0) {
    L.face(P.T, 0, false);
    L.face(rest, plate, true);
    L.face(batT, plate + thick, true);
    L.wall(P.ell, 0, plate);
    L.wall(P.bat, plate, plate + thick);
  } else {
    L.face(batT, 0, false);
    L.face(batT, thick, true);
    L.wall(P.bat, 0, thick);
  }
  return L.mesh();
}

export function fileName({ den, size, thick, plate }) {
  const r = x => +(+x).toPrecision(4);
  return `batman_${r(size)}mm_t${r(thick)}${plate > 0 ? `_oval${r(plate)}` : ''}`;
}

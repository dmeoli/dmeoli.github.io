// Fair dice. A convex die is fair by symmetry when its group of symmetries
// takes any face to any other (an isohedral polyhedron, Diaconis and Keller
// 1989): the Platonic solids, the bipyramids and the trapezohedra for every
// even number of faces, and the Catalan solids. Every die here is the
// intersection of half-spaces n_i . x <= d_i (for the isohedral ones all at
// distance 1 from the centre, the insphere), meshed as an implicit solid
// with rounded edges and numbers engraved as strokes (the digits are drawn
// here as polylines, no font file), and laid on a face for printing.

import { implicitSolid, onBed, transform } from '../../print/index.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/* ---------------------------------------------------- the face planes -- */

// all the sign changes of a vector, and its cyclic or all permutations
const signs = v => {
  let out = [[]];
  for (const x of v) out = out.flatMap(p => (x === 0 ? [[...p, 0]] : [[...p, x], [...p, -x]]));
  return out;
};
const cyc = v => [v, [v[1], v[2], v[0]], [v[2], v[0], v[1]]];
const perms = v => [[v[0], v[1], v[2]], [v[0], v[2], v[1]], [v[1], v[0], v[2]], [v[1], v[2], v[0]], [v[2], v[0], v[1]], [v[2], v[1], v[0]]];
const uniq = vs => {
  const seen = new Map();
  for (const v of vs) { const k = v.map(x => x.toFixed(6)).join(','); if (!seen.has(k)) seen.set(k, v); }
  return [...seen.values()];
};
const dirsOf = vs => uniq(vs).map(nrm);
const evenSigns = gens => dirsOf(gens.flatMap(g => cyc(g).flatMap(signs)));
const allPerms = gens => dirsOf(gens.flatMap(g => perms(g).flatMap(signs)));

// the uniform antiprism: the directions of its vertices are the normals of
// its dual, the trapezohedron
const antiprismTilt = n => {
  const R = 1 / (2 * Math.sin(Math.PI / n)), h = Math.sqrt(Math.max(0.05, 1 - 2 * R * R * (1 - Math.cos(Math.PI / n))));
  return Math.atan2(R, h / 2);
};

// the kinds of die: { normals, numbered (the faces that carry a number) }
export const KINDS = {
  d4: { en: 'd4 tetrahedron', it: 'd4 tetraedro', faces: 4, size: 24, planes: () => dirsOf([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) },
  d6: { en: 'd6 cube', it: 'd6 cubo', faces: 6, size: 18, planes: () => allPerms([[1, 0, 0]]) },
  d8: { en: 'd8 octahedron', it: 'd8 ottaedro', faces: 8, size: 20, planes: () => allPerms([[1, 1, 1]]) },
  d10: { en: 'd10 pentagonal trapezohedron', it: 'd10 trapezoedro pentagonale', faces: 10, size: 22, planes: () => trapezo(5) },
  d12: { en: 'd12 dodecahedron', it: 'd12 dodecaedro', faces: 12, size: 22, planes: () => evenSigns([[0, 1, PHI]]) },
  d20: { en: 'd20 icosahedron', it: 'd20 icosaedro', faces: 20, size: 24, planes: () => dirsOf([...signs([1, 1, 1]), ...cyc([0, 1 / PHI, PHI]).flatMap(signs)]) },
  trapezohedron: { en: 'trapezohedron, 2n faces', it: 'trapezoedro, 2n facce', family: true, size: 26, planes: n => trapezo(n) },
  bipyramid: { en: 'bipyramid, 2n faces', it: 'bipiramide, 2n facce', family: true, size: 26, planes: n => bipyr(n) },
  rhombic12: { en: 'd12 rhombic dodecahedron', it: 'd12 dodecaedro rombico', faces: 12, size: 24, planes: () => allPerms([[1, 1, 0]]) },
  tetrakis24: { en: 'd24 tetrakis hexahedron', it: 'd24 tetracisesaedro', faces: 24, size: 28, planes: () => allPerms([[0, 1, 2]]) },
  deltoid24: { en: 'd24 deltoidal icositetrahedron', it: 'd24 icositetraedro deltoidale', faces: 24, size: 28, planes: () => allPerms([[1, 1, 1 + Math.SQRT2]]) },
  rhombic30: { en: 'd30 rhombic triacontahedron', it: 'd30 triacontaedro rombico', faces: 30, size: 30, planes: () => evenSigns([[0, 0, PHI], [0.5, PHI / 2, PHI * PHI / 2]]) },
  disdyakis48: { en: 'd48 disdyakis dodecahedron', it: 'd48 esacisottaedro', faces: 48, size: 36, planes: () => allPerms([[1, 1 + Math.SQRT2, 1 + 2 * Math.SQRT2]]) },
  pentakis60: { en: 'd60 pentakis dodecahedron', it: 'd60 pentacisdodecaedro', faces: 60, size: 40, planes: () => evenSigns([[0, 1, 3 * PHI], [1, 2 + PHI, 2 * PHI], [PHI, 2, PHI ** 3]]) },
  disdyakis120: { en: 'd120 disdyakis triacontahedron', it: 'd120 esacisicosaedro', faces: 120, size: 56, planes: () => evenSigns([[1 / PHI, 1 / PHI, 3 + PHI], [2 / PHI, PHI, 1 + 2 * PHI], [1 / PHI, PHI * PHI, 3 * PHI - 1], [2 * PHI - 1, 2, 2 + PHI], [PHI, 3, 2 * PHI]]) },
  long: { en: 'long die, n faces', it: 'dado lungo, n facce', family: true, odd: true, size: 40, planes: n => longDie(n) },
};

// kite faces, normals tilted by the angle of the dual of the uniform antiprism
function trapezo(n) {
  const a = antiprismTilt(n), P = [];
  for (let k = 0; k < n; k++) {
    const t0 = 2 * Math.PI * k / n, t1 = t0 + Math.PI / n;
    P.push([Math.cos(t0) * Math.sin(a), Math.sin(t0) * Math.sin(a), Math.cos(a)]);
    P.push([Math.cos(t1) * Math.sin(a), Math.sin(t1) * Math.sin(a), -Math.cos(a)]);
  }
  return P;
}
// triangle faces, 2n of them, the apexes on the axis
function bipyr(n) {
  const a = Math.PI / 180 * (n <= 4 ? 54.7 : 50), P = [];
  for (let k = 0; k < n; k++) {
    const t = 2 * Math.PI * (k + 0.5) / n;
    P.push([Math.cos(t) * Math.sin(a), Math.sin(t) * Math.sin(a), Math.cos(a)]);
    P.push([Math.cos(t) * Math.sin(a), Math.sin(t) * Math.sin(a), -Math.cos(a)]);
  }
  return P;
}
// n long faces around the z axis and two pointed roofs that it cannot rest
// on; the roofs are the planes after the n sides (not numbered)
function longDie(n) {
  const P = [], L = 2.6, g = 0.55;
  for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n; P.push([Math.cos(t), Math.sin(t), 0]); }
  // roof planes: normal (cos t cos g, sin t cos g, +-sin g), offset so that
  // the roof meets the sides at z = +-L
  for (const s of [1, -1]) for (let k = 0; k < n; k++) {
    const t = 2 * Math.PI * k / n, nv = [Math.cos(t) * Math.cos(g), Math.sin(t) * Math.cos(g), s * Math.sin(g)];
    P.push({ n: nv, d: Math.cos(g) + Math.sin(g) * L });
  }
  return P;
}

/* ------------------------------------------------------------ the die -- */

// the die in model units: planes [{ n, d }], numbered faces, face polygons
export function die(kind = 'd6', n = 6) {
  const K = KINDS[kind];
  const half = K.family ? (K.odd ? n : Math.round(n / 2)) : 0;
  const raw = K.family ? K.planes(half) : K.planes();
  const planes = raw.map(p => (Array.isArray(p) ? { n: p, d: 1 } : p));
  const faces = planes.map((p, i) => facePolygon(planes, i));
  const count = K.family ? (K.odd ? n : 2 * half) : K.faces;
  const numbered = kind === 'long' ? [...Array(n).keys()] : planes.map((_, i) => i);
  return { kind, planes, faces, count, numbered };
}

// the polygon of face i: a big square in its plane clipped by every other
// half-space; with its frame (centre c, unit axes e1, e2)
function facePolygon(planes, i) {
  const { n, d } = planes[i];
  const c = n.map(x => x * d);
  const e1 = nrm(crs(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n)), e2 = crs(n, e1);
  let poly = [[-20, -20], [20, -20], [20, 20], [-20, 20]];
  planes.forEach((q, j) => {
    if (j === i) return;
    // q.n . (c + u e1 + v e2) <= q.d
    const a = dot(q.n, e1), b = dot(q.n, e2), r = q.d - dot(q.n, c);
    const val = ([u, v]) => r - a * u - b * v;
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const P = poly[k], Q = poly[(k + 1) % poly.length], vp = val(P), vq = val(Q);
      if (vp >= 0) out.push(P);
      if ((vp >= 0) !== (vq >= 0)) { const t = vp / (vp - vq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    poly = out;
  });
  // drop repeated corners
  poly = poly.filter((p, k) => { const q = poly[(k + 1) % poly.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7; });
  return { c, n, e1, e2, poly, pts: poly.map(([u, v]) => c.map((x, a) => x + u * e1[a] + v * e2[a])) };
}

// the vertices of the die, from the corners of its faces
export function vertices(D) {
  return uniq(D.faces.flatMap(f => f.pts));
}

// the faces paired with the face most opposite to each, and the numbers:
// opposite faces add to count + 1 wherever the die has opposite faces
export function numbering(D) {
  const F = D.numbered, m = F.length, num = new Array(D.planes.length).fill(0);
  const free = new Set(F), pairs = [];
  // greedy: the most antiparallel pairs first
  const cand = [];
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) cand.push([dot(D.planes[F[a]].n, D.planes[F[b]].n), F[a], F[b]]);
  cand.sort((x, y) => x[0] - y[0]);
  for (const [cos, i, j] of cand) if (free.has(i) && free.has(j) && cos < -0.5) { pairs.push([i, j]); free.delete(i); free.delete(j); }
  // pairs ordered around the die (by the longitude of the first face), and
  // low and high numbers alternated between the halves
  const lon = i => Math.atan2(D.planes[i].n[1], D.planes[i].n[0]) + (D.planes[i].n[2] < 0 ? 10 : 0);
  pairs.sort((p, q) => lon(p[0]) - lon(q[0]));
  pairs.forEach(([i, j], k) => {
    const lo = k + 1, hi = D.count - k;
    if (k % 2) { num[i] = hi; num[j] = lo; } else { num[i] = lo; num[j] = hi; }
  });
  let next = pairs.length + 1;
  for (const i of F) if (!num[i]) num[i] = next++;
  return { num, opposite: pairs.length * 2 === m };
}

/* ----------------------------------------------------- stroke digits -- */

// polylines in a box 0.6 wide and 1 tall, centred on the origin
const arc = (cx, cy, rx, ry, a0, a1, k = 10) => Array.from({ length: k + 1 }, (_, j) => {
  const a = (a0 + (a1 - a0) * j / k) * Math.PI / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const SIX = [[...arc(0.04, -0.06, 0.3, 0.54, 70, 180, 6), ...arc(0, -0.2, 0.28, 0.28, 180, 540, 16)]];
export const GLYPHS = {
  0: [arc(0, 0, 0.27, 0.48, 0, 360, 24)],
  1: [[[-0.14, 0.3], [0.04, 0.48], [0.04, -0.48]]],
  2: [[...arc(0, 0.2, 0.27, 0.28, 155, -30, 10), [-0.27, -0.48], [0.3, -0.48]]],
  3: [[...arc(0, 0.25, 0.23, 0.23, 150, -90, 10), ...arc(0, -0.22, 0.27, 0.26, 90, -150, 12)]],
  4: [[[0.14, -0.48], [0.14, 0.48], [-0.3, -0.16], [0.32, -0.16]]],
  5: [[[0.27, 0.48], [-0.2, 0.48], [-0.24, 0.05], ...arc(0, -0.18, 0.29, 0.3, 135, -150, 12)]],
  6: SIX,
  7: [[[-0.28, 0.48], [0.3, 0.48], [-0.06, -0.48]]],
  8: [arc(0, 0.26, 0.21, 0.22, -90, 270, 16), arc(0, -0.22, 0.27, 0.26, 90, 450, 18)],
  9: SIX.map(l => l.map(([x, y]) => [-x, -y])),
  _: [[[-0.24, -0.68], [0.24, -0.68]]],
};

// the strokes of a number as segments [x0, y0, x1, y1] in a box of height
// 1, centred, with a bar under it when it reads as another face upside down
export function numberStrokes(k, count) {
  const s = String(k), turn = { 0: '0', 1: '1', 6: '9', 8: '8', 9: '6' };
  const up = [...s].reverse().map(ch => turn[ch]).join('');
  const bar = up.length === s.length && !up.includes('undefined') && up !== s && +up >= 1 && +up <= count && up[0] !== '0';
  const segs = [], adv = 0.74, w = 0.6 + adv * (s.length - 1);
  [...s].forEach((ch, i) => {
    const x0 = -w / 2 + 0.3 + i * adv;
    for (const line of GLYPHS[ch]) for (let j = 0; j + 1 < line.length; j++) segs.push([line[j][0] + x0, line[j][1], line[j + 1][0] + x0, line[j + 1][1]]);
  });
  if (bar) for (const line of GLYPHS._) segs.push([line[0][0] * w / 0.6, line[0][1], line[1][0] * w / 0.6, line[1][1]]);
  return { segs, w, h: bar ? 1.36 : 1, bar };
}

// pip layouts in a 3 x 3 grid of cells -1, 0, 1
const PIPS = { 1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };

/* ---------------------------------------------------------- the solid -- */

// the distance from (u, v) to the polygon edges of a face, inside
const inradiusAt = (poly, [u, v]) => {
  let r = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length], ex = x1 - x0, ey = y1 - y0, l = Math.hypot(ex, ey);
    r = Math.min(r, ((u - x0) * ey - (v - y0) * ex) / -l);
  }
  return Math.abs(r);
};

// the up direction of the numbers of a face: towards its farthest corner, or
// towards the middle of an edge for a square
function upOf(f) {
  const P = f.poly, ds = P.map(([u, v]) => Math.hypot(u, v)), mx = Math.max(...ds);
  if (P.length === 4 && ds.every(d => Math.abs(d - mx) < 1e-6)) {
    const m = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2], l = Math.hypot(...m);
    return [m[0] / l, m[1] / l];
  }
  const k = ds.indexOf(mx);
  return [P[k][0] / mx, P[k][1] / mx];
}

// the marks of every face: segments in the face's (u, v) frame scaled to
// model units, their stroke half-width, and the pips (centres, radius)
export function marks(D, { pips = false } = {}) {
  const { num } = numbering(D), out = D.faces.map(() => ({ segs: [], dots: [] }));
  const rho = Math.min(...D.numbered.map(i => inradiusAt(D.faces[i].poly, [0, 0])));
  if (D.kind === 'd4') {
    // a number at each corner, upright towards it: the number at the top
    // corner reads the same on the three faces that show
    const V = vertices(D);
    D.faces.forEach((f, i) => f.pts.forEach(p => {
      const k = V.findIndex(q => Math.hypot(...sub(p, q)) < 1e-6) + 1;
      const u = dot(sub(p, f.c), f.e1), v = dot(sub(p, f.c), f.e2), l = Math.hypot(u, v);
      const s = 0.42 * rho, st = numberStrokes(k, 4), dir = [u / l, v / l];
      place(out[i].segs, st, s, [u * 0.5, v * 0.5], dir);
    }));
    return { out, num: D.faces.map((_, i) => i + 1), rho };
  }
  for (const i of D.numbered) {
    const f = D.faces[i], up = upOf(f);
    if (pips && D.kind === 'd6') {
      const g = 0.5 * rho, r = 0.17 * rho * 1.35;
      for (const [a, b] of PIPS[num[i]]) {
        // cells rotated with the face's up direction
        const x = a * g, y = b * g;
        out[i].dots.push([x * up[1] + y * up[0], -x * up[0] + y * up[1], r]);
      }
      continue;
    }
    const st = numberStrokes(num[i], D.count);
    const fitR = inradiusAt(f.poly, [0, 0]);
    const s = Math.min(1.05 * fitR, 0.82 * fitR / Math.hypot(st.w / 2, st.h / 2));
    const off = st.bar ? 0.18 * s : 0;
    place(out[i].segs, st, s, [off * up[0], off * up[1]], up);
  }
  return { out, num, rho };
}

// segments of a number of height s centred at c, turned so that its up is dir
function place(dst, st, s, c, dir) {
  const [ux, uy] = dir, rx = uy, ry = -ux;
  for (const [x0, y0, x1, y1] of st.segs) dst.push([c[0] + s * (x0 * rx + y0 * ux), c[1] + s * (x0 * ry + y0 * uy), c[0] + s * (x1 * rx + y1 * ux), c[1] + s * (x1 * ry + y1 * uy)]);
  dst.s = Math.max(dst.s || 0, s);
}

// the die, its marks, the rotation that lays it on the face of number 1
// (normal down) and the scale from model units to mm, for which the largest
// dimension of the sharp die so laid is `size`
export function layout({ kind = 'd6', n = 12, size = 0, pips = false } = {}) {
  const D = die(kind, n), M = marks(D, { pips }), V = vertices(D);
  const f1 = D.kind === 'd4' ? 0 : M.num.indexOf(1);
  const down = rotTo(D.planes[f1].n, [0, 0, -1]), RV = V.map(down);
  const span = a => Math.max(...RV.map(v => v[a])) - Math.min(...RV.map(v => v[a]));
  const k = (size || KINDS[kind].size) / Math.max(span(0), span(1), span(2));
  return { D, M, down, k, support: support(D, down) };
}

// the printable solid. o: { kind, n (faces, for the families), size (mm,
// largest dimension), round (mm, radius of the edges), depth (mm of the
// engraving), pips (d6 with pips), res ('draft' | 'fine') }
export function solid(o = {}, progress) {
  const { kind = 'd6', n = 12, size = 0, round = 0.8, depth = 0.6, pips = false, res = 'draft' } = o;
  const { D, M, down, k } = layout(o);
  const V = vertices(D);
  const planes = D.planes.map(p => ({ n: p.n, d: p.d * k }));
  const faceInfo = D.faces.map((f, i) => {
    const segs = M.out[i].segs.map(s => s.map(x => x * k)), dots = M.out[i].dots.map(([u, v, r]) => [u * k, v * k, r * k]);
    let half = 0;
    if (segs.length) half = Math.max(0.3, 0.075 * (M.out[i].segs.s || 1) * k);
    // a box around the marks, to skip them quickly
    let ext = 0;
    for (const s of segs) ext = Math.max(ext, Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]), Math.abs(s[3]));
    for (const [u, v, r] of dots) ext = Math.max(ext, Math.abs(u) + r, Math.abs(v) + r);
    return { c: f.c.map(x => x * k), n: f.n, e1: f.e1, e2: f.e2, d: planes[i].d, segs, dots, half, ext: ext + half + 0.5 };
  });
  const minHalf = Math.min(...faceInfo.filter(f => f.segs.length).map(f => f.half), Infinity);
  const r = Math.max(0, Math.min(round, 0.25 * M.rho * k || round));
  const dp = Math.min(depth, 0.9);
  const f = (x, y, z) => {
    let mx = -Infinity, arg = 0, s2 = 0;
    for (let i = 0; i < planes.length; i++) {
      const P = planes[i], g = P.n[0] * x + P.n[1] * y + P.n[2] * z - P.d;
      if (g > mx) { mx = g; arg = i; }
      const q = g + r;
      if (q > 0) s2 += q * q;
    }
    let v = mx + r <= 0 ? mx : Math.sqrt(s2) - r;
    if (mx < -dp - 0.5 || mx > 0.5) return v;
    // the engraving of the nearest face
    const F = faceInfo[arg];
    const px = x - F.c[0], py = y - F.c[1], pz = z - F.c[2];
    const u = px * F.e1[0] + py * F.e1[1] + pz * F.e1[2], w = px * F.e2[0] + py * F.e2[1] + pz * F.e2[2];
    if (Math.abs(u) > F.ext || Math.abs(w) > F.ext) return v;
    let e = Infinity;
    for (const [x0, y0, x1, y1] of F.segs) {
      const ex = x1 - x0, ey = y1 - y0, wx = u - x0, wy = w - y0;
      const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
      e = Math.min(e, Math.hypot(wx - t * ex, wy - t * ey));
    }
    let E = Math.max(e - F.half, -mx - dp);
    for (const [cu, cv, rr] of F.dots) {
      // a spherical dimple dp deep
      const R = (rr * rr + dp * dp) / (2 * dp);
      E = Math.min(E, Math.hypot(u - cu, w - cv, mx - R + dp) - R);
    }
    return Math.max(v, -E);
  };
  // the cell: fine enough for the strokes
  const S = size || KINDS[kind].size;
  let h = Math.min(S / 50, (isFinite(minHalf) ? minHalf : 1) * 0.8);
  if (res === 'fine') h *= 0.6;
  h = Math.max(h, S / 200);
  const ext = Math.max(...V.map(v => Math.hypot(...v))) * k;
  const m = implicitSolid(f, [[-ext, -ext, -ext], [ext, ext, ext]], h, { progress });
  transform(m, down);
  onBed(m);
  const info = support(D, down);
  m.overhang = info.overhang; m.supports = info.supports; m.faces = D.count; m.stroke = isFinite(minHalf) ? +(2 * minHalf).toFixed(2) : 0;
  m.cell = +h.toFixed(3);
  return m;
}

// the rotation taking unit a to unit b, as a map on points
function rotTo(a, b) {
  const v = crs(a, b), c = dot(a, b), s = Math.hypot(...v);
  if (s < 1e-9) return c > 0 ? (p => p) : (p => [p[0], -p[1], -p[2]]);
  const k = v.map(x => x / s), ang = Math.atan2(s, c), cs = Math.cos(ang), sn = Math.sin(ang);
  return p => {
    const kp = crs(k, p), kd = dot(k, p);
    return [0, 1, 2].map(i => p[i] * cs + kp[i] * sn + k[i] * kd * (1 - cs));
  };
}

// the steepest face that looks down, besides the one on the bed: its angle
// from the vertical (beyond 45 degrees a printer needs supports)
function support(D, R) {
  let worst = 0;
  for (const p of D.planes) {
    const nz = R(p.n)[2];
    if (nz < -0.999) continue;
    if (nz < 0) worst = Math.max(worst, Math.asin(Math.min(1, -nz)) * 180 / Math.PI);
  }
  return { overhang: Math.round(worst), supports: worst > 50 ? 'yes' : worst > 45 ? 'maybe' : 'no' };
}

// is the die stable on each face: the foot of the perpendicular from the
// centre of mass (here the centre, by symmetry) inside the face
export function stableFaces(D) {
  return D.faces.map(f => inradiusSigned(f.poly) > 0);
}
const inradiusSigned = poly => {
  let r = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length], ex = x1 - x0, ey = y1 - y0;
    r = Math.min(r, (x0 * ey - y0 * ex) / Math.hypot(ex, ey));
  }
  return r;
};

export const fileName = o => `${o.kind === 'trapezohedron' || o.kind === 'bipyramid' || o.kind === 'long' ? o.kind + '_d' + o.n : o.kind}_${o.size}mm${o.pips ? '_pips' : ''}${o.round ? '_r' + o.round : ''}`;

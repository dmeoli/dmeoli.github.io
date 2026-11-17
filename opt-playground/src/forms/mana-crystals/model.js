// Wulff mana crystals: the equilibrium shape of a crystal by the construction
// of Wulff (1901), the inner envelope of the planes n . x = gamma(n) over the
// facet families {100}, {111} and {110} of a cubic crystal, optionally
// stretched along one axis and twinned by the spinel law, as one crystal
// lying on a face or as a cluster sunk into a rock.

import { merge, transform, flip, onBed, bounds } from '../../print/index.js';
import { rng, polytope, nrm, rotateOnto, rotateAxis } from '../fantasy/util.js';

// the normals of the three families, each of length 1
const perms = v => {
  const out = [], seen = new Set();
  const signs = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
  for (const p of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (const s of signs) {
    const w = p.map((i, k) => v[i] * s[k]), key = w.join();
    if (!seen.has(key)) { seen.add(key); out.push(nrm(w)); }
  }
  return out;
};
export const FAMILIES = { '100': perms([1, 0, 0]), '111': perms([1, 1, 1]), '110': perms([1, 1, 0]) };

// the Wulff shape for the energies g = { '100': ., '111': ., '110': . }: the
// planes n . x = g(n) of every family (a family with energy beyond its
// reach simply leaves no face); returns the polytope with the faces tagged
export function wulff(g) {
  const planes = [], fam = [];
  for (const f of ['100', '111', '110']) for (const n of FAMILIES[f]) { planes.push([n, g[f]]); fam.push(f); }
  const P = polytope(planes);
  for (const F of P.faces) F.family = fam[planes.findIndex(([n]) => n === F.n)];
  return P;
}

// the share of each family in the area of the surface
export function shares(P) {
  const s = { '100': 0, '111': 0, '110': 0 }, tot = P.faces.reduce((a, F) => a + F.area, 0);
  for (const F of P.faces) s[F.family] += F.area / tot;
  return s;
}

// a crystal as a mesh, model units: the Wulff shape with its axis [001] (or
// [111] for an octahedral habit) along z, stretched by `stretch` along z;
// twin: the spinel law, the upper half mirrored across the (111) plane
// through the center (a contact twin with a re-entrant edge)
export function crystal(o) {
  const g = { '100': o.g100, '111': o.g111, '110': o.g110 };
  const axis = o.axis === '111' ? nrm([1, 1, 1]) : [0, 0, 1];
  if (!o.twin) {
    const P = wulff(g), R = rotateOnto(axis, [0, 0, 1]);
    const m = P.mesh;
    transform(m, p => { const q = R(p); return [q[0], q[1], q[2] * o.stretch]; });
    return m;
  }
  // the twin: the half on the side n . x >= 0 of the (111) plane, and its
  // mirror image, each convex; they share the cut face
  const n = nrm([1, 1, 1]), planes = [];
  for (const f of ['100', '111', '110']) for (const v of FAMILIES[f]) planes.push([v, g[f]]);
  const half = polytope([...planes, [[-n[0], -n[1], -n[2]], 0]]).mesh;
  const mirror = p => { const s = 2 * (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]); return [p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]]; };
  const other = { pos: half.pos.slice(), idx: half.idx.slice() };
  transform(other, mirror); flip(other);
  // the two halves overlap by a hair, so that a slicer fuses them
  transform(other, p => [p[0] + 0.002 * n[0], p[1] + 0.002 * n[1], p[2] + 0.002 * n[2]]);
  const m = merge(half, other), R = rotateOnto(n, [0, 0, 1]);
  transform(m, p => { const q = R(p); return [q[0], q[1], q[2] * o.stretch]; });
  return m;
}

// in place: turned so that its largest face lies on z = 0 (a convex solid
// prints from that face with the least overhang)
function onLargestFace(m) {
  // faces from the triangles: group by normal
  const P = m.pos, I = m.idx, acc = new Map();
  for (let k = 0; k < I.length; k += 3) {
    const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], A = Math.hypot(...nn) / 2;
    if (A < 1e-12) continue;
    const n = nn.map(x => x / (2 * A)), key = n.map(x => Math.round(x * 1000)).join();
    const e = acc.get(key) || { n, A: 0 }; e.A += A; acc.set(key, e);
  }
  let best = null;
  for (const e of acc.values()) if (!best || e.A > best.A + 1e-9) best = e;
  const R = rotateOnto(best.n, [0, 0, -1]);
  transform(m, R);
  return onBed(m);
}

// the share of the area that overhangs by more than 45 degrees (normals
// pointing down more steeply than 45 degrees, the bed excluded)
export function overhang(m) {
  const P = m.pos, I = m.idx, zmin = bounds(m)[0][2];
  let over = 0, tot = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], A = Math.hypot(...nn) / 2;
    if (A < 1e-12) continue;
    tot += A;
    const low = Math.max(P[a + 2], P[b + 2], P[c + 2]) < zmin + 0.05;
    if (!low && nn[2] / (2 * A) < -Math.SQRT1_2 - 1e-6) over += A;
  }
  return tot ? over / tot : 0;
}

// the rock: a low convex polytope of random planes around an ellipsoid,
// cut flat at z = 0, radius 1 across
function rock(r) {
  const planes = [[[0, 0, -1], 0]];
  for (let k = 0; k < 22; k++) {
    const z = r.range(0.15, 1), phi = r.range(0, 2 * Math.PI), s = Math.sqrt(1 - z * z);
    const n = nrm([s * Math.cos(phi) / 1, s * Math.sin(phi) / 0.85, z / 0.45]);
    planes.push([n, r.range(0.92, 1) * Math.hypot(n[0] * 1, n[1] * 0.85, n[2] * 0.45)]);
  }
  return polytope(planes).mesh;
}

// o: habit energies g100, g111, g110, stretch, axis, twin, mode ('single' or
// 'cluster'), count, seed, size (largest dimension, mm)
export function solid(o, progress) {
  const size = o.size || 60;
  let m;
  if (o.mode === 'cluster') {
    const r = rng(o.seed * 31 + 5), base = rock(r), parts = [base];
    const n = o.count || 7;
    for (let k = 0; k < n; k++) {
      // the largest in the middle, the others around it, leaning outwards
      const c = crystal(o);
      const [mn, mx] = bounds(c), h = mx[2] - mn[2], w = Math.max(mx[0] - mn[0], mx[1] - mn[1]);
      const big = k === 0 ? 1 : r.range(0.4, 0.75), s = 1.4 * big / Math.max(h, w * 1.9);
      const ang = k === 0 ? 0 : 2 * Math.PI * (k - 1) / (n - 1) + r.range(-0.3, 0.3);
      const rad = k === 0 ? 0 : r.range(0.35, 0.65), lean = k === 0 ? r.range(0, 0.12) : r.range(0.25, 0.6);
      const spin = r.range(0, 2 * Math.PI), axis = [-Math.sin(ang), Math.cos(ang), 0];
      const S = rotateAxis([0, 0, 1], spin), L = rotateAxis(k === 0 ? [1, 0, 0] : axis, lean);
      const cz = (mn[2] + mx[2]) / 2;
      // sunk so that its lower third is inside the rock
      transform(c, p => {
        const q = L(S([(p[0]) * s, (p[1]) * s, (p[2] - cz) * s]));
        return [q[0] + rad * Math.cos(ang), q[1] + rad * 0.85 * Math.sin(ang), q[2] + 0.42 * (1 - rad * 0.6) + h * s * 0.18];
      });
      // never below the bed, where the slicer would cut it
      const low = bounds(c)[0][2];
      if (low < 0.02) transform(c, p => [p[0], p[1], p[2] + 0.02 - low]);
      parts.push(c);
      if (progress) progress((k + 1) / n);
    }
    m = merge(...parts);
  } else {
    m = onLargestFace(crystal(o));
  }
  const [mn, mx] = bounds(m), k = size / Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  transform(m, p => [p[0] * k, p[1] * k, p[2] * k]);
  onBed(m);
  m.overhang = overhang(m);
  m.note = `${(100 * m.overhang).toFixed(1)}% > 45°`;
  return m;
}

export const fileName = o => `wulff_${o.mode}_${o.g100}_${o.g111}_${o.g110}${o.twin ? '_twin' : ''}_${o.size}mm`;

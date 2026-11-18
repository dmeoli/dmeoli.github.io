// The polytope P of polarity.html and its polar P° as two solids side by
// side, to print: P = conv(V) with the origin inside, P° the hull of the
// points n/d of the facets n.x = d of P. Each solid is the exact convex hull
// (its facets triangulated, no rounding), lying on its largest facet, both
// at one scale so that their sizes keep the ratio of the scene. No DOM here.

import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { Vector3 } from 'three';
import { onBed, merge } from '../../print/index.js';

// the facets of the hull of points, coplanar triangles merged: { n, d, tris }
export function facets(points) {
  const hull = new ConvexHull().setFromPoints(points.map(p => new Vector3(...p)));
  const out = [];
  for (const f of hull.faces) {
    const n = f.normal.clone(), d = n.dot(f.edge.head().point);
    let F = out.find(g => g.n.distanceTo(n) < 1e-6 && Math.abs(g.d - d) < 1e-6);
    if (!F) { F = { n, d, tris: [] }; out.push(F); }
    let e = f.edge; const tri = [];
    do { tri.push(e.head().point.clone()); e = e.next; } while (e !== f.edge);
    F.tris.push(tri);
  }
  return out;
}

export const polar = F => F.map(f => [f.n.x / f.d, f.n.y / f.d, f.n.z / f.d]);

// the closed mesh of the hull: shared vertices, triangles counterclockwise
// seen from outside
function hullMesh(F) {
  const key = p => p.toArray().map(v => v.toFixed(9)).join(','), at = new Map(), pos = [], idx = [];
  const vid = p => { const k = key(p); if (!at.has(k)) { at.set(k, pos.length / 3); pos.push(p.x, p.y, p.z); } return at.get(k); };
  for (const f of F) for (const [a, b, c] of f.tris) {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    const tri = nrm.dot(f.n) >= 0 ? [a, b, c] : [a, c, b];
    idx.push(...tri.map(vid));
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

// turns m so that the facet of largest area faces down
function largestDown(m, F) {
  const area = f => f.tris.reduce((s, [a, b, c]) => s + b.clone().sub(a).cross(c.clone().sub(a)).length() / 2, 0);
  const n = F.reduce((a, f) => (area(f) > area(a) ? f : a), F[0]).n.clone().normalize();
  const down = new Vector3(0, 0, -1), axis = n.clone().cross(down), s = axis.length(), c = n.dot(down);
  const v = new Vector3();
  for (let k = 0; k < m.pos.length; k += 3) {
    v.set(m.pos[k], m.pos[k + 1], m.pos[k + 2]);
    if (s > 1e-9) v.applyAxisAngle(axis.normalize(), Math.atan2(s, c));
    else if (c < 0) v.set(v.x, -v.y, -v.z);
    m.pos[k] = v.x; m.pos[k + 1] = v.y; m.pos[k + 2] = v.z;
  }
  return m;
}

const extent = m => {
  let r = 0;
  for (let a = 0; a < 3; a++) { let lo = Infinity, hi = -Infinity; for (let k = a; k < m.pos.length; k += 3) { lo = Math.min(lo, m.pos[k]); hi = Math.max(hi, m.pos[k]); } r = Math.max(r, hi - lo); }
  return r;
};

// o: { V (the vertices of P, as in the scene), which: 'both' | 'P' | 'polar',
// size (mm, the largest side of the larger of the two), gap (mm) }
export function solid(o) {
  const { V, which = 'both', size = 60, gap = 8 } = o;
  const FP = facets(V), W = polar(FP), FD = facets(W);
  const parts = [];
  if (which !== 'polar') parts.push(largestDown(hullMesh(FP), FP));
  if (which !== 'P') parts.push(largestDown(hullMesh(FD), FD));
  const k = size / Math.max(...parts.map(extent));
  let x = 0;
  for (const m of parts) {
    for (let i = 0; i < m.pos.length; i++) m.pos[i] *= k;
    onBed(m);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m.pos.length; i += 3) { lo = Math.min(lo, m.pos[i]); hi = Math.max(hi, m.pos[i]); }
    for (let i = 0; i < m.pos.length; i += 3) m.pos[i] += x - lo;
    x += hi - lo + gap;
  }
  const m = parts.length > 1 ? merge(...parts) : parts[0];
  onBed(m);
  m.counts = { P: [FP.length, V.length], polar: [FD.length, W.length] };
  return m;
}

export const fileName = o => `polarity_${o.shape || 'cube'}_${o.which || 'both'}_${o.size}mm`;

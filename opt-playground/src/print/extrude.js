// Solids extruded from a plane region, in layers: the region is given by its
// vertices V ([[x, y], ...]), its triangles T (flat, three indices each,
// counterclockwise seen from above) and its boundary loops (arrays of
// indices: outer boundaries counterclockwise, holes clockwise). A vertex at a
// given height is made once, so faces and walls that meet share it and the
// solid is closed when (i) every edge of the triangles of a face either lies
// inside the face or is an edge of a loop that gets a wall to the next layer,
// and (ii) the loops are made of the same vertices as the triangles (no
// vertex of a loop in the middle of an edge of a triangle).

export class Layers {
  // k scales x and y (e.g. model units to millimetres)
  constructor(V, k = 1) { this.V = V; this.k = k; this.pos = []; this.idx = []; this.ids = new Map(); }
  at(v, z) {
    const key = v + ':' + z;
    if (!this.ids.has(key)) { this.ids.set(key, this.pos.length / 3); this.pos.push(this.V[v][0] * this.k, this.V[v][1] * this.k, z); }
    return this.ids.get(key);
  }
  // the triangles tris at height z, facing up (top of a layer) or down
  face(tris, z, up) {
    for (let i = 0; i < tris.length; i += 3) {
      const a = this.at(tris[i], z), b = this.at(tris[i + 1], z), c = this.at(tris[i + 2], z);
      if (up) this.idx.push(a, b, c); else this.idx.push(a, c, b);
    }
  }
  // the side of a loop from z0 up to z1
  wall(loop, z0, z1) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const a0 = this.at(a, z0), b0 = this.at(b, z0), a1 = this.at(a, z1), b1 = this.at(b, z1);
      this.idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  mesh() {
    const p = Float32Array.from(this.pos);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i++) { mn[i % 3] = Math.min(mn[i % 3], p[i]); mx[i % 3] = Math.max(mx[i % 3], p[i]); }
    return { pos: p, idx: Uint32Array.from(this.idx), dims: mx.map((v, i) => v - mn[i]) };
  }
}

// the region {V, T, loops} as a prism from z0 to z1
export function extrude({ V, T, loops }, z0, z1, k = 1) {
  const L = new Layers(V, k);
  L.face(T, z0, false); L.face(T, z1, true);
  for (const loop of loops) L.wall(loop, z0, z1);
  return L.mesh();
}

// the triangles of a simple polygon (no holes, no crossing sides) by ear
// clipping, counterclockwise; a vertex on a side (collinear) is kept as a
// corner, so walls built on the same polygon match. O(n^2), for outlines of a
// few thousand points.
export function triangulate(poly) {
  const n = poly.length, area = signedArea(poly), ccw = area > 0;
  const idx = [...Array(n).keys()];
  if (!ccw) idx.reverse();
  const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const eps = 1e-12 * Math.abs(area);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const T = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n * n) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= eps) continue;
      let ok = true;
      for (const p of idx) if (p !== a && p !== b && p !== c && inside(p, a, b, c)) { ok = false; break; }
      if (!ok) continue;
      T.push(a, b, c); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) throw new Error('triangulate: not a simple polygon');
  }
  if (cross(idx[0], idx[1], idx[2]) > eps) T.push(idx[0], idx[1], idx[2]);
  else throw new Error('triangulate: the last ear is flat (too many collinear points)');
  return T;
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}

// a simple polygon [[x, y], ...] (any orientation) extruded from z = 0 to h
export function extrudePolygon(poly, h) {
  const V = signedArea(poly) > 0 ? poly : [...poly].reverse();
  return extrude({ V, T: triangulate(V), loops: [[...V.keys()]] }, 0, h);
}

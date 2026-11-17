// Triangle meshes for printing: { pos: Float32Array of x, y, z, idx:
// Uint32Array of three vertex indices per triangle }, counterclockwise seen
// from outside, in millimetres. Every builder of src/print returns one, and the
// writers of stl.js and threemf.js take one.

// a growable typed array, pushed three numbers at a time
export class Grow {
  constructor(T, n = 1 << 16) { this.T = T; this.a = new T(n); this.n = 0; }
  push3(a, b, c) {
    if (this.n + 3 > this.a.length) { const b2 = new this.T(this.a.length * 2); b2.set(this.a); this.a = b2; }
    this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c;
  }
  get() { return this.a.slice(0, this.n); }
}

// a mesh from plain arrays
export const mesh = (pos, idx) => ({ pos: Float32Array.from(pos), idx: Uint32Array.from(idx) });

// the bounding box [[x0, y0, z0], [x1, y1, z1]]
export function bounds({ pos }) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pos.length; k++) { const a = k % 3; mn[a] = Math.min(mn[a], pos[k]); mx[a] = Math.max(mx[a], pos[k]); }
  return [mn, mx];
}

// the sides of the box
export const dims = m => { const [mn, mx] = bounds(m); return mx.map((v, a) => v - mn[a]); };

// in place: the box moved to the origin and the largest side scaled to `size`
// mm; returns the mesh with its dims
export function fit(m, size) {
  const P = m.pos, [mn, mxv] = bounds(m);
  const k2 = size / Math.max(mxv[0] - mn[0], mxv[1] - mn[1], mxv[2] - mn[2]);
  for (let k = 0; k < P.length; k++) P[k] = (P[k] - mn[k % 3]) * k2;
  m.dims = [0, 1, 2].map(a => (mxv[a] - mn[a]) * k2);
  return m;
}

// in place: x, y centred on 0 and the lowest point at z = 0 (on the bed)
export function onBed(m) {
  const P = m.pos, [mn, mx] = bounds(m), c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
  for (let k = 0; k < P.length; k++) P[k] -= c[k % 3];
  return m;
}

// in place: every vertex mapped by f([x, y, z]) -> [x, y, z]; a map that
// mirrors (negative determinant) must be followed by flip()
export function transform(m, f) {
  const P = m.pos;
  for (let k = 0; k < P.length; k += 3) { const q = f([P[k], P[k + 1], P[k + 2]]); P[k] = q[0]; P[k + 1] = q[1]; P[k + 2] = q[2]; }
  return m;
}

// in place: every triangle turned the other way
export function flip(m) {
  const I = m.idx;
  for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  return m;
}

// the signed volume, positive when the triangles face outwards
export function volume({ pos: P, idx: I }) {
  let v = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return v / 6;
}

// in place: turned outwards if it was built inside out
export const outwards = m => (volume(m) < 0 ? flip(m) : m);

// several closed meshes as one (separate bodies: overlapping ones are not
// fused; for a true union build one implicit function, see implicit.js)
export function merge(...ms) {
  const nv = ms.reduce((s, m) => s + m.pos.length, 0), nt = ms.reduce((s, m) => s + m.idx.length, 0);
  const pos = new Float32Array(nv), idx = new Uint32Array(nt);
  let o = 0, p = 0;
  for (const m of ms) {
    pos.set(m.pos, o);
    for (let k = 0; k < m.idx.length; k++) idx[p + k] = m.idx[k] + o / 3;
    o += m.pos.length; p += m.idx.length;
  }
  return { pos, idx };
}

// edges with other than two triangles, and directed edges run twice: both
// zero for a closed, consistently oriented mesh (tools/check_mesh.py checks
// the written files more fully)
export function closedness({ pos, idx }) {
  const nv = pos.length / 3, und = new Map(), dir = new Set();
  let twice = 0;
  for (let k = 0; k < idx.length; k += 3) for (let e = 0; e < 3; e++) {
    const a = idx[k + e], b = idx[k + (e + 1) % 3], d = a * nv + b;
    if (dir.has(d)) twice++; else dir.add(d);
    const u = Math.min(a, b) * nv + Math.max(a, b);
    und.set(u, (und.get(u) || 0) + 1);
  }
  let bad = 0;
  for (const c of und.values()) if (c !== 2) bad++;
  return { badEdges: bad, repeated: twice };
}

// the crumbs that a grid leaves where a part gets thinner than a cell: only
// the pieces with at least `frac` of the vertices of the largest stay, each of
// them closed
export function dropCrumbs({ pos, idx }, frac = 0.05) {
  const nv = pos.length / 3, up = new Int32Array(nv).map((_, i) => i);
  const find = i => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let k = 0; k < idx.length; k += 3) {
    const a = find(idx[k]), b = find(idx[k + 1]), c = find(idx[k + 2]);
    up[b] = a; up[find(c)] = a;
  }
  const size = new Int32Array(nv);
  for (let i = 0; i < nv; i++) size[find(i)]++;
  let big = 0;
  for (let i = 0; i < nv; i++) big = Math.max(big, size[i]);
  const keep = new Int32Array(nv).fill(-1);
  let m = 0;
  for (let i = 0; i < nv; i++) if (size[find(i)] >= frac * big) keep[i] = m++;
  const P = new Float32Array(3 * m);
  for (let i = 0; i < nv; i++) if (keep[i] >= 0) P.set(pos.subarray(3 * i, 3 * i + 3), 3 * keep[i]);
  const I = [];
  for (let k = 0; k < idx.length; k += 3) if (keep[idx[k]] >= 0) I.push(keep[idx[k]], keep[idx[k + 1]], keep[idx[k + 2]]);
  return { pos: P, idx: Uint32Array.from(I) };
}

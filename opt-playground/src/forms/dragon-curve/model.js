// The dragon curves as folded strips of paper. Folding a strip in half n
// times in the same direction and opening every crease to a right angle
// gives Heighway's dragon (Gardner 1967): the turn after the k-th segment,
// k = 2^j m with m odd, is to the left when m = 1 mod 4 and to the right
// when m = 3 mod 4 (the regular paper-folding sequence, Davis and Knuth
// 1970). The twindragon is two dragons joined back to back at their start,
// and the terdragon turns by 120 degrees, left when the last nonzero
// ternary digit of k is 1 and right when it is 2 (Davis and Knuth 1970).
// Here every crease opens by the same fraction `fold` (0: the strip still
// folded flat, 1: the curve), and the creases of the right turns (the
// mountain folds) may be oblique: the strip turns left about W and right
// about cos(tilt) W + sin(tilt) N, where H runs along the strip, W across it
// and N = H x W, so that a tilt other than 0 lifts the curve into space (a
// right-angle tilt puts it on the cubic lattice). The solid is the union of the rectangles of the strip, each a
// thin box, as one implicit function; no DOM here (solid runs in a worker).

import { implicitSolid, onBed } from '../../print/index.js';

export const CURVES = {
  heighway: { en: 'Heighway dragon', it: 'drago di Heighway', angle: 90, max: 12, def: 10 },
  twin: { en: 'twindragon', it: 'drago gemello', angle: 90, max: 11, def: 9 },
  ter: { en: 'terdragon', it: 'terdrago', angle: 120, max: 7, def: 6 },
};

// the turns, +1 left, -1 right, 0 straight, between consecutive segments
export function turns(kind, n) {
  if (kind === 'ter') {
    const N = 3 ** n, s = new Int8Array(N - 1);
    for (let k = 1; k < N; k++) { let m = k; while (m % 3 === 0) m /= 3; s[k - 1] = m % 3 === 1 ? 1 : -1; }
    return s;
  }
  const N = 2 ** n, s = new Int8Array(N - 1);
  for (let k = 1; k < N; k++) { const m = k / (k & -k); s[k - 1] = (m & 3) === 1 ? 1 : -1; }
  if (kind !== 'twin') return s;
  // the first dragon walked backwards ends where the second starts, heading
  // the same way; walking a path backwards reverses and negates its turns,
  // which leaves the paper-folding sequence as it is
  const t = new Int8Array(2 * N - 1);
  t.set(s, 0); t[N - 1] = 0; t.set(s, N);
  return t;
}

const rot = (v, k, a) => {
  const c = Math.cos(a), s = Math.sin(a), d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  const x = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d];
};
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// the segments of the strip, each { a (start), H (along), W (across) },
// of unit length; fold in [0, 1], tilt in degrees
export function strip(kind, n, { fold = 1, tilt = 0 } = {}) {
  const s = turns(kind, n), base = CURVES[kind].angle * Math.PI / 180;
  const ang = Math.PI - fold * (Math.PI - base), ta = tilt * Math.PI / 180;
  let P = [0, 0, 0], H = [1, 0, 0], W = [0, 0, 1];
  const segs = [];
  for (let k = 0; k <= s.length; k++) {
    segs.push({ a: P, H, W });
    P = [P[0] + H[0], P[1] + H[1], P[2] + H[2]];
    if (k < s.length && s[k]) {
      // a left turn about W, a right turn about W tilted towards N by tilt
      const N = [H[1] * W[2] - H[2] * W[1], H[2] * W[0] - H[0] * W[2], H[0] * W[1] - H[1] * W[0]];
      const c = s[k] > 0 ? 1 : Math.cos(ta), sn = s[k] > 0 ? 0 : Math.sin(ta);
      const ax = nrm([c * W[0] + sn * N[0], c * W[1] + sn * N[1], c * W[2] + sn * N[2]]);
      H = nrm(rot(H, ax, s[k] * ang)); W = nrm(rot(W, ax, s[k] * ang));
    }
  }
  return segs;
}

// the box of the centres of the segments
export function extent(segs) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const g of segs) for (const p of [g.a, [g.a[0] + g.H[0], g.a[1] + g.H[1], g.a[2] + g.H[2]]]) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return [lo, hi];
}

/* ------------------------------------------------------------ the solid -- */

// the union of the boxes of the segments, segment length 1, strip width w
// across (along W) and thickness t (along N = H x W), every box lengthened
// by t / 2 at both ends so that the corners close; a grid of buckets keeps
// the evaluation local
function boxesField(segs, w, t) {
  const B = segs.map(({ a, H, W }) => {
    const N = [H[1] * W[2] - H[2] * W[1], H[2] * W[0] - H[0] * W[2], H[0] * W[1] - H[1] * W[0]];
    return { c: [a[0] + H[0] / 2, a[1] + H[1] / 2, a[2] + H[2] / 2], H, W, N };
  });
  const hl = 0.5 + t / 2, hw = w / 2, ht = t / 2, R = Math.hypot(hl, hw, ht);
  const [lo, hi] = extent(segs), cs = 1.5, pad = R + 1;
  const o = lo.map(v => v - pad), NX = [0, 1, 2].map(i => Math.ceil((hi[i] - lo[i] + 2 * pad) / cs) + 1);
  const cells = new Map();
  B.forEach((b, i) => {
    const e = R + 0.6, a0 = [0, 1, 2].map(k => Math.floor((b.c[k] - e - o[k]) / cs)), a1 = [0, 1, 2].map(k => Math.floor((b.c[k] + e - o[k]) / cs));
    for (let z = a0[2]; z <= a1[2]; z++) for (let y = a0[1]; y <= a1[1]; y++) for (let x = a0[0]; x <= a1[0]; x++) {
      const key = (z * NX[1] + y) * NX[0] + x;
      let l = cells.get(key); if (!l) cells.set(key, l = []); l.push(i);
    }
  });
  return (x, y, z) => {
    const l = cells.get((Math.floor((z - o[2]) / cs) * NX[1] + Math.floor((y - o[1]) / cs)) * NX[0] + Math.floor((x - o[0]) / cs));
    if (!l) return 0.6;
    let v = 0.6;
    for (const i of l) {
      const b = B[i], dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
      const qx = Math.abs(dx * b.H[0] + dy * b.H[1] + dz * b.H[2]) - hl;
      const qy = Math.abs(dx * b.W[0] + dy * b.W[1] + dz * b.W[2]) - hw;
      const qz = Math.abs(dx * b.N[0] + dy * b.N[1] + dz * b.N[2]) - ht;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
      if (d < v) v = d;
    }
    return v;
  };
}

// o: { kind, n, fold, tilt, size (mm, the largest side), strip (mm, its
// width), wall (mm, its thickness), base (a plate under it), res }
export function solid(o = {}, progress) {
  const kind = o.kind || 'heighway', n = Math.min(o.n ?? CURVES[kind].def, CURVES[kind].max);
  const segs = strip(kind, n, { fold: o.fold ?? 1, tilt: o.tilt ?? 0 });
  const [lo, hi] = extent(segs), size = o.size ?? 120, wallmm = o.wall ?? 1.2, stripmm = o.strip ?? 5;
  // the scale that makes the largest side `size` mm: the ends of the
  // segments spread by k (hi - lo), and the boxes stick out of them by pad
  const pad = [0, 0, 0];
  for (const { H, W } of segs) {
    const N = [H[1] * W[2] - H[2] * W[1], H[2] * W[0] - H[0] * W[2], H[0] * W[1] - H[1] * W[0]];
    for (let i = 0; i < 3; i++) pad[i] = Math.max(pad[i], (Math.abs(H[i]) * wallmm + Math.abs(W[i]) * stripmm + Math.abs(N[i]) * wallmm) / 2);
  }
  let k = Infinity;
  for (let i = 0; i < 3; i++) if (hi[i] - lo[i] > 1e-6) k = Math.min(k, (size - 2 * pad[i]) / (hi[i] - lo[i]));
  if (!(k > 0) || !isFinite(k)) throw new Error('the size is too small for the strip');
  const w = stripmm / k, t = wallmm / k;
  const g = boxesField(segs, w, t), f = (x, y, z) => g(x / k, y / k, z / k) * k;
  const m0 = Math.max(stripmm, wallmm) / 2 + 1;
  let b0 = lo.map(v => v * k - m0), b1 = hi.map(v => v * k + m0);
  const h = Math.min(size / (o.res === 'fine' ? 260 : 170), wallmm / (o.res === 'fine' ? 3 : 2.2));
  let F = f;
  if (o.base) {
    // a plate under the lowest point, the curve sunk 0.6 mm into it
    let zmin = Infinity;
    for (const { a, H, W } of segs) {
      const Nz = H[0] * W[1] - H[1] * W[0];
      zmin = Math.min(zmin, (a[2] + H[2] / 2) * k - (Math.abs(H[2]) * (k + wallmm) + Math.abs(W[2]) * stripmm + Math.abs(Nz) * wallmm) / 2);
    }
    const z0 = zmin + 0.6, bt = 2;
    F = (x, y, z) => Math.min(f(x, y, z), Math.max(b0[0] + 1 - x, x - b1[0] + 1, b0[1] + 1 - y, y - b1[1] + 1, z0 - bt - z, z - z0));
    b0 = [b0[0], b0[1], z0 - bt - 1];
  }
  const m = onBed(implicitSolid(F, [b0, b1], h, { progress }));
  m.segments = segs.length; m.seg = +k.toFixed(2);
  return m;
}

export const fileName = o => `dragon_${o.kind}_n${o.n}_fold${Math.round((o.fold ?? 1) * 100)}_tilt${o.tilt ?? 0}_${o.size}mm`;

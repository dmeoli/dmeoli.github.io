// Phyllotaxis after Vogel (1979): the n-th floret at the angle n alpha and at
// the area n / N of the surface that bears them, so that each floret takes
// the same area. On a disc this is Vogel's r = c sqrt(n); on a cone, a barrel
// or a sphere the same rule is applied to the area measured from the apex
// (on the sphere it gives the Fibonacci sphere). The surface is a closed
// surface of revolution, given by a profile from the upper pole to the lower
// one, and every floret is a bump on it: a dome (the seeds of a sunflower), a
// cushion with a central eye (the fruitlets of a pineapple), a shield with a
// keel (the scales of a pine cone), or a tubercle (Mammillaria). The bumps
// displace a grid of rings and meridians along the normal, which keeps the
// mesh closed and free of crossings, so that the same mesh is shown and
// printed. Nothing here touches the DOM: the view and the download panel run
// it in workers.

import { onBed, outwards } from '../../print/index.js';

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN = 360 * (2 - PHI);            // 137.5077...
const TAU = 2 * Math.PI;

export const presets = {
  sunflower: { shape: 'head', style: 'dome', N: 420, relief: 1, petals: true },
  pinecone: { shape: 'cone', style: 'scale', N: 150, relief: 1, petals: false },
  pineapple: { shape: 'barrel', style: 'eye', N: 190, relief: 1, petals: false },
  cactus: { shape: 'globe', style: 'tubercle', N: 260, relief: 1, petals: false },
};

export const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];

/* ------------------------------------------------------------ profiles -- */

// a profile: points [rho, z] from the upper pole (rho = 0) to the lower pole
// (rho = 0), each tagged 1 where florets grow, 0 elsewhere, and 2 on the
// flange of the petals; k is the scale in mm per unit, so that the petals and
// the plinth have a thickness in mm
function profile(shape, { petals = false, base = false } = {}, k = 40) {
  const P = [];
  const add = (r, z, tag) => P.push([Math.max(0, r), z, tag]);
  const plinth = (rTop, zTop) => {
    // a round stand under the cut: out to its rim, down 3 mm, in to the axis
    const rb = Math.max(rTop + 4 / k, 0.62), hb = 3 / k;
    for (let i = 1; i <= 16; i++) add(rTop + (rb - rTop) * i / 16, zTop, 0);
    for (let i = 1; i <= 6; i++) add(rb, zTop - hb * i / 6, 0);
    for (let i = 1; i <= 24; i++) add(rb * (1 - i / 24), zTop - hb, 0);
  };
  const cut = (r, z) => { for (let i = 1; i <= 24; i++) add(r * (1 - i / 24), z, 0); };
  if (shape === 'head') {
    // a sunflower head: a slightly domed disc of florets, a rounded rim and,
    // under it, a flat ring of ray petals 1.6 mm thick lying on the bed
    const Rh = 0.6, ra = 0.9 * Rh, tp = petals ? 1.6 / k : 0, Ht = 0.17, dome = 0.045;
    for (let i = 0; i <= 160; i++) { const r = ra * i / 160; add(r, Ht + dome * (1 - (r / ra) ** 2), 1); }
    for (let i = 1; i <= 40; i++) {
      const f = (i / 40) * Math.PI / 2;
      add(ra + (Rh - ra) * Math.sin(f), tp + (Ht - tp) * Math.cos(f), i < 6 ? 1 : 0);
    }
    if (petals) {
      const Rp = 1;
      for (let i = 1; i <= 50; i++) add(Rh + (Rp - Rh) * i / 50, tp, 2);
      for (let i = 1; i <= 3; i++) add(Rp, tp * (1 - i / 3), 2);
      for (let i = 1; i <= 50; i++) add(Rp - (Rp - Rh) * i / 50, 0, 2);
    }
    cut(Rh, 0);
  } else if (shape === 'cone') {
    // a closed pine cone: ovoid, widest at 0.7 of the height from the apex
    const H = 1, Rc = 0.43, p = Math.log(0.5) / Math.log(0.7), s1 = 0.95;
    for (let i = 0; i <= 300; i++) {
      const s = s1 * i / 300;
      add(Rc * Math.pow(Math.sin(Math.PI * Math.pow(s, p)), 0.62), H * (1 - s), 1);
    }
    const [r, z] = P[P.length - 1];
    base ? plinth(r, z) : cut(r, z);
  } else if (shape === 'barrel') {
    // a pineapple: a barrel cut flat at both ends, the crown left out
    const H = 1, Rb = 0.37, s0 = 0.07, s1 = 0.93, rr = s => Rb * Math.pow(Math.sin(Math.PI * s), 0.45);
    for (let i = 0; i <= 24; i++) add(rr(s0) * i / 24, H * (1 - s0), 0);
    for (let i = 1; i <= 300; i++) { const s = s0 + (s1 - s0) * i / 300; add(rr(s), H * (1 - s), 1); }
    const [r, z] = P[P.length - 1];
    base ? plinth(r, z) : cut(r, z);
  } else {
    // a globular cactus: a sphere cut 30 degrees below its equator, where
    // the wall overhangs by 30 degrees from the vertical
    const R = 0.5, a1 = Math.PI / 2 + Math.PI / 6;
    for (let i = 0; i <= 300; i++) { const a = a1 * i / 300; add(R * Math.sin(a), R * Math.cos(a), 1); }
    const [r, z] = P[P.length - 1];
    base ? plinth(r, z) : cut(r, z);
  }
  return P;
}

// the profile with arc length, area from the apex over the tagged part,
// and normals in the meridian plane (outward)
function measure(P) {
  const n = P.length, s = new Float64Array(n), A = new Float64Array(n), nr = new Float64Array(n), nz = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const ds = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    s[i] = s[i - 1] + ds;
    const act = P[i][2] === 1 && P[i - 1][2] === 1;
    A[i] = A[i - 1] + (act ? Math.PI * (P[i][0] + P[i - 1][0]) * ds : 0);
  }
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const tr = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tr, tz) || 1;
    nr[i] = -tz / l; nz[i] = tr / l;
  }
  return { s, A, nr, nz };
}

// linear interpolation of the profile at a value v of a monotone array X
function at(X, v) {
  let lo = 0, hi = X.length - 1;
  if (v <= X[0]) return [0, 0];
  if (v >= X[hi]) return [hi - 1, 1];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= v) lo = m; else hi = m; }
  return [lo, (v - X[lo]) / ((X[lo + 1] - X[lo]) || 1)];
}

/* ------------------------------------------------------------- florets -- */

// the florets of the profile: positions on the surface, the spacing between
// neighbours, and the area of the part that bears them
function florets(P, M, N, alpha) {
  const Atot = M.A[M.A.length - 1], a = alpha * Math.PI / 180;
  // the first index of the tagged part: the area counts from there
  const F = new Float64Array(3 * N), up = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const An = (n + 0.5) / N * Atot;
    // the area grows only on the tagged part, so the first point where A
    // reaches An is on it
    let lo = 0, hi = M.A.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (M.A[m] < An) lo = m; else hi = m; }
    const t = (An - M.A[lo]) / ((M.A[hi] - M.A[lo]) || 1);
    const r = P[lo][0] + t * (P[hi][0] - P[lo][0]), z = P[lo][1] + t * (P[hi][1] - P[lo][1]);
    const th = n * a;
    F[3 * n] = r * Math.cos(th); F[3 * n + 1] = r * Math.sin(th); F[3 * n + 2] = z;
    up[n] = M.s[lo] + t * (M.s[hi] - M.s[lo]);
  }
  // hexagonal spacing for the area per floret
  const spacing = Math.sqrt(2 / Math.sqrt(3) * Atot / N);
  return { F, up, spacing, Atot };
}

// a uniform grid of buckets over points in 3D, for the nearest neighbours
function buckets(F, c) {
  const map = new Map(), n = F.length / 3;
  const key = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  for (let p = 0; p < n; p++) {
    const kk = key(Math.floor(F[3 * p] / c), Math.floor(F[3 * p + 1] / c), Math.floor(F[3 * p + 2] / c));
    let b = map.get(kk); if (!b) map.set(kk, b = []); b.push(p);
  }
  // the two nearest points to (x, y, z) within about c: [n1, d1, n2, d2]
  const out = [0, 0, 0, 0];
  const near2 = (x, y, z) => {
    const i0 = Math.floor(x / c), j0 = Math.floor(y / c), k0 = Math.floor(z / c);
    let n1 = -1, d1 = Infinity, n2 = -1, d2 = Infinity;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      const b = map.get(key(i, j, k)); if (!b) continue;
      for (const p of b) {
        const dx = F[3 * p] - x, dy = F[3 * p + 1] - y, dz = F[3 * p + 2] - z, d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { n2 = n1; d2 = d1; n1 = p; d1 = d; } else if (d < d2) { n2 = p; d2 = d; }
      }
    }
    out[0] = n1; out[1] = Math.sqrt(d1); out[2] = n2; out[3] = Math.sqrt(d2);
    return out;
  };
  // the k nearest of point p (other than p), as [index, distance] pairs
  const knn = (p, kq) => {
    const x = F[3 * p], y = F[3 * p + 1], z = F[3 * p + 2], best = [];
    const i0 = Math.floor(x / c), j0 = Math.floor(y / c), k0 = Math.floor(z / c);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      const b = map.get(key(i, j, k)); if (!b) continue;
      for (const q of b) if (q !== p) best.push([q, Math.hypot(F[3 * q] - x, F[3 * q + 1] - y, F[3 * q + 2] - z)]);
    }
    best.sort((u, v) => u[1] - v[1]);
    return best.slice(0, kq);
  };
  return { near2, knn };
}

const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// the two families of parastichies among the florets with index in [n0, n1):
// the differences of index to the nearest neighbours, the two most frequent
export function families(F, N, spacing, n0, n1) {
  const B = buckets(F, 1.3 * spacing), count = new Map();
  for (let p = Math.max(0, n0); p < Math.min(N, n1); p++) {
    const nb = B.knn(p, 4);
    if (nb.length < 2) continue;
    const d0 = nb[0][1];
    for (const [q, d] of nb) if (d < 1.25 * d0) { const dn = Math.abs(q - p); count.set(dn, (count.get(dn) || 0) + 1); }
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).sort((a, b) => a - b);
  return top.length === 2 ? top : [top[0] || 0, top[0] || 0];
}

/* --------------------------------------------------------------- bumps -- */

// the height of the bump at a point of the base surface, given the two
// nearest florets; also the groove value g (0 on the boundary between cells)
function bump(style, x, y, z, near, F, s, h) {
  const [n1, d1, , d2] = near;
  if (n1 < 0) return [0, 1];
  const half = (d2 - d1) / 2;
  if (style === 'dome') {
    const R = 0.56 * s, dm = Math.sqrt(Math.max(0, 1 - (d1 / R) ** 2)), g = smooth(0, 0.1 * s, half);
    return [h * dm * g, Math.min(g, dm > 0 ? 1 : 0.3)];
  }
  if (style === 'tubercle') {
    const R = 0.6 * s, c = Math.max(0, 1 - d1 / R);
    // a cone rounded at the tip, with a small areole on top
    const v = c > 0 ? Math.pow(c, 1.35) * (1 - 0.12 * Math.exp(-((d1 / (0.07 * s)) ** 2))) : 0;
    return [h * v, smooth(0, 0.14 * s, half) * (c > 0 ? 1 : 0.5)];
  }
  const g = smooth(0, 0.2 * s, half), fade = smooth(0.85 * s, 0.6 * s, d1);
  let v = 0.78 + 0.3 * Math.exp(-((d1 / (0.2 * s)) ** 2));
  if (style === 'scale') {
    // a rhombic shield with a transverse keel through the umbo, lower half
    // raised: the apophysis of a pine scale
    const dz = z - F[3 * n1 + 2];
    v = 0.62 + 0.28 * Math.exp(-((dz / (0.09 * s)) ** 2)) + 0.25 * Math.exp(-((d1 / (0.16 * s)) ** 2)) - 0.22 * Math.tanh(dz / (0.3 * s));
  }
  return [h * Math.sqrt(g) * fade * v, g];
}

/* ---------------------------------------------------------------- mesh -- */

// the petals: a factor in [0.04, 1] by which the flange is stretched beyond
// the rim at the azimuth th
function petal(th, m) {
  const f = ((th * m / TAU) % 1 + 1) % 1 - 0.5;           // -0.5..0.5 in the petal
  return Math.max(0.04, Math.pow(Math.cos(Math.PI * f), 1.4) * (1 - 0.1 * Math.abs(Math.sin(TAU * f))));
}

// the whole form, in model units: { pos, idx, cell (floret of each vertex),
// groove, florets, spacing, fam, petals }; o: shape, style, N, alpha, relief,
// petals, base; res: [meridians, rings]; k: mm per unit
export function form(o, res = [320, 200], k = 40, progress) {
  const P = profile(o.shape, o, k), M = measure(P);
  const N = Math.max(10, Math.round(o.N)), alpha = o.alpha;
  const { F, spacing } = florets(P, M, N, alpha);
  // the families on the solid: at the rim of the head, at the widest band of
  // the others
  let fam;
  if (o.shape === 'head') fam = families(F, N, spacing, Math.round(0.8 * N), Math.round(0.97 * N));
  else {
    let w = 0, nw = 0;
    for (let n = 0; n < N; n++) { const r = Math.hypot(F[3 * n], F[3 * n + 1]); if (r > w) { w = r; nw = n; } }
    fam = families(F, N, spacing, nw - Math.round(0.08 * N), nw + Math.round(0.08 * N));
  }
  const npet = Math.max(8, Math.min(89, fam[0] || 34));
  const [nth, nring] = res;
  // rings by arc length, twice as dense where the florets are
  const wsum = new Float64Array(P.length);
  for (let i = 1; i < P.length; i++) wsum[i] = wsum[i - 1] + (M.s[i] - M.s[i - 1]) * (P[i][2] === 1 ? 1 : P[i][2] === 2 ? 0.8 : 0.35);
  const rings = [];
  for (let r = 1; r < nring - 1; r++) {
    const [i, t] = at(wsum, wsum[wsum.length - 1] * r / (nring - 1));
    const j = Math.min(P.length - 1, i + 1), lerp = (a, b) => a + t * (b - a);
    rings.push({ r: lerp(P[i][0], P[j][0]), z: lerp(P[i][1], P[j][1]), nr: lerp(M.nr[i], M.nr[j]), nz: lerp(M.nz[i], M.nz[j]),
      tag: P[t < 0.5 ? i : j][2], act: P[i][2] === 1 || P[j][2] === 1 });
  }
  const B = buckets(F, 0.9 * spacing), h0 = o.relief * (o.style === 'tubercle' ? 0.62 : o.style === 'dome' ? 0.34 : 0.3) * spacing;
  const nv = rings.length * nth + 2, pos = new Float32Array(3 * nv), cell = new Int32Array(nv).fill(-1), groove = new Float32Array(nv).fill(1);
  const top = P[0], bot = P[P.length - 1];
  // the poles: on the axis, raised by the bump of the floret there
  pos.set([0, 0, top[1]], 0); pos.set([0, 0, bot[1]], 3 * (nv - 1));
  if (top[2] === 1) {
    const nr = B.near2(0, 0, top[1]), [hb, g] = bump(o.style, 0, 0, top[1], nr, F, spacing, h0);
    pos[2] += hb; cell[0] = nr[0]; groove[0] = g;
  }
  const R0 = o.shape === 'head' ? 0.6 : 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const g0 = rings[ri], v0 = 1 + ri * nth;
    for (let j = 0; j < nth; j++) {
      const th = TAU * j / nth, c = Math.cos(th), sn = Math.sin(th);
      let r = g0.r;
      if (g0.tag === 2) r = R0 + (r - R0) * petal(th, npet);
      const x = r * c, y = r * sn, z = g0.z;
      let hb = 0, gv = 1, cid = -1;
      if (g0.act || g0.tag === 0) {
        const nr = B.near2(x, y, z);
        if (nr[0] >= 0 && nr[1] < 1.2 * spacing) { const b = bump(o.style, x, y, z, nr, F, spacing, h0); hb = g0.act ? b[0] : 0; gv = b[1]; cid = nr[0]; }
      }
      const o3 = 3 * (v0 + j);
      pos[o3] = x + hb * g0.nr * c; pos[o3 + 1] = y + hb * g0.nr * sn; pos[o3 + 2] = z + hb * g0.nz;
      cell[v0 + j] = cid; groove[v0 + j] = gv;
    }
    if (progress && (ri & 15) === 0) progress(0.9 * ri / rings.length);
  }
  const idx = new Uint32Array(6 * nth * (rings.length - 1) + 6 * nth);
  let q = 0;
  for (let j = 0; j < nth; j++) { const j1 = (j + 1) % nth; idx[q++] = 0; idx[q++] = 1 + j; idx[q++] = 1 + j1; }
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const a = 1 + ri * nth, b = a + nth;
    for (let j = 0; j < nth; j++) {
      const j1 = (j + 1) % nth;
      idx[q++] = a + j; idx[q++] = b + j; idx[q++] = a + j1;
      idx[q++] = a + j1; idx[q++] = b + j; idx[q++] = b + j1;
    }
  }
  const last = 1 + (rings.length - 1) * nth;
  for (let j = 0; j < nth; j++) { const j1 = (j + 1) % nth; idx[q++] = last + j; idx[q++] = nv - 1; idx[q++] = last + j1; }
  return { pos, idx, cell, groove, florets: F, N, spacing, fam, petals: o.shape === 'head' && o.petals ? npet : 0 };
}

/* ------------------------------------------------- Vogel's disc, packing -- */

// Vogel's plane model: r = sqrt(n + 1/2), angle n alpha
export function vogel(N, alpha) {
  const F = new Float64Array(3 * N), a = alpha * Math.PI / 180;
  for (let n = 0; n < N; n++) { const r = Math.sqrt(n + 0.5); F[3 * n] = r * Math.cos(n * a); F[3 * n + 1] = r * Math.sin(n * a); }
  return F;
}

// the links of every point of Vogel's disc to its near neighbours, with the
// difference of index: [n, m, m - n, ...]
export function links(F, N) {
  const s = Math.sqrt(2 * Math.PI / Math.sqrt(3)), B = buckets(F, 1.4 * s), L = [];
  for (let p = 0; p < N; p++) {
    const nb = B.knn(p, 4);
    if (!nb.length) continue;
    const d0 = nb[0][1];
    for (const [q, d] of nb) if (q > p && d < 1.3 * d0) L.push(p, q, q - p);
  }
  return L;
}

// how well N points of Vogel's disc are packed with the angle alpha: the
// smallest distance between two of them (past the first tenth, where the
// disc is too small to tell), over the side of the hexagonal lattice of the
// same density (1 for a perfect packing)
export function packing(alpha, N = 300) {
  const a = alpha * Math.PI / 180, X = new Float64Array(N), Y = new Float64Array(N);
  for (let n = 0; n < N; n++) { const r = Math.sqrt(n + 0.5); X[n] = r * Math.cos(n * a); Y[n] = r * Math.sin(n * a); }
  let best = Infinity;
  const n0 = Math.round(N / 10);
  for (let n = n0; n < N; n++) {
    const rn = Math.sqrt(n + 0.5);
    for (let m = n + 1; m < N; m++) {
      const dr = Math.sqrt(m + 0.5) - rn;
      if (dr * dr >= best) break;
      const dx = X[m] - X[n], dy = Y[m] - Y[n], d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best) / Math.sqrt(2 * Math.PI / Math.sqrt(3));
}

export function packingCurve(a0, a1, steps, N = 300) {
  const q = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) q[i] = packing(a0 + (a1 - a0) * i / steps, N);
  return q;
}

/* ------------------------------------------------------------ printing -- */

export const RES = { draft: [360, 240], normal: [500, 320], fine: [800, 520] };

// the printable solid in millimetres, the largest side equal to size
export function solid(o = {}, progress) {
  const p = { ...presets.sunflower, alpha: GOLDEN, base: false, size: 80, res: 'normal', ...o };
  // model units are about 2 across for the head and 1 high for the others:
  // the scale k (mm per unit) sets the thickness of petals and plinth
  const ext = p.shape === 'head' ? 2 : p.shape === 'globe' ? 1 : 1.04;
  const k = p.size / ext;
  const m = form(p, RES[p.res] || RES.normal, k, progress);
  const { pos } = m;
  // scale so that the largest side is exactly size
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const a = i % 3; if (pos[i] < mn[a]) mn[a] = pos[i]; if (pos[i] > mx[a]) mx[a] = pos[i]; }
  const sc = p.size / Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  for (let i = 0; i < pos.length; i++) pos[i] *= sc;
  const out = onBed(outwards({ pos, idx: m.idx }));
  out.florets = m.N; out.families = m.fam.join('/'); out.petals = m.petals;
  if (progress) progress(1);
  return out;
}

export const fileName = o => `phyllotaxis_${o.preset || o.shape}_${(+o.alpha).toFixed(3)}deg_N${o.N}_${o.size}mm${o.base ? '_base' : ''}`;

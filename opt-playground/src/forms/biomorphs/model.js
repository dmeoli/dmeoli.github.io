// Biomorphs in 3D, after Dawkins (The Blind Watchmaker, 1986): a genome of
// 23 genes, each a number from 0 to 15 (one hexadecimal digit, so that the
// genome is a code of 23 characters), develops into a creature made of
// spheres, ellipsoids and round cones joined by a smooth union; the creature
// is the zero set of one signed distance, which the screen draws coloured and
// src/print meshes into a closed solid. The development takes a stage, a
// number from 1 (the young) to 3 (the adult), which changes the proportions,
// adds segments and branches and lets horns, spikes and tail grow.
// Units: about 10 per body radius; x forward, y to the left, z up, the ground
// at z = 0. No DOM here: solid(o) runs in the worker of the download panel.

import { implicitSolid, onBed } from '../../print/index.js';

/* --------------------------------------------------------------- genome -- */

export const GENES = [
  ['seg', 'segments', 'segmenti'],
  ['fat', 'girth', 'corporatura'],
  ['len', 'length', 'lunghezza'],
  ['taper', 'taper', 'rastremazione'],
  ['posture', 'posture', 'postura'],
  ['legs', 'legs', 'zampe'],
  ['leglen', 'leg length', 'lunghezza zampe'],
  ['sym', 'symmetry', 'simmetria'],
  ['arms', 'arm branching', 'ramificazione braccia'],
  ['armang', 'branch angle', 'angolo dei rami'],
  ['armlen', 'arm length', 'lunghezza braccia'],
  ['head', 'head', 'testa'],
  ['eyes', 'eyes', 'occhi'],
  ['eyesize', 'eye size', 'grandezza occhi'],
  ['horn', 'horns', 'corna'],
  ['hornbend', 'horn bend', 'curva delle corna'],
  ['ears', 'ears', 'orecchie'],
  ['tail', 'tail', 'coda'],
  ['curl', 'tail curl', 'ricciolo della coda'],
  ['spikes', 'spikes', 'aculei'],
  ['snout', 'snout', 'muso'],
  ['hue', 'hue', 'tinta'],
  ['pattern', 'pattern', 'motivo'],
].map(([k, en, it]) => ({ k, en, it }));
export const NG = GENES.length;
const G = Object.fromEntries(GENES.map((g, i) => [g.k, i]));

export const encode = g => g.map(v => v.toString(16)).join('');
export function decode(s) {
  s = String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (s.length !== NG) return null;
  return [...s].map(c => parseInt(c, 16));
}

// a reproducible random number generator (mulberry32) and a string hash
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// the genome of a seed: every gene uniform, the first draws thrown away
export function fromSeed(seed) {
  const r = rng(hash('seed:' + seed));
  r(); r();
  return GENES.map(() => Math.floor(r() * 16));
}

// Dawkins' rule: a child differs from its parent in one gene by one step;
// the n children of a litter change n different genes, each by +-step
// (more genes per child with `genes` > 1). Reproducible from `key`.
export function litter(g, key, n = 8, { genes = 1, step = 1 } = {}) {
  const r = rng(hash(encode(g) + '|' + key));
  const order = GENES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const kids = [];
  for (let c = 0; c < n; c++) {
    const k = g.slice();
    for (let m = 0; m < genes; m++) {
      const i = m === 0 ? order[c % NG] : Math.floor(r() * NG);
      let d = (1 + Math.floor(r() * step)) * (r() < 0.5 ? -1 : 1);
      if (k[i] + d < 0 || k[i] + d > 15) d = -d;
      k[i] = Math.max(0, Math.min(15, k[i] + d));
    }
    kids.push(k);
  }
  return kids;
}

// six starting creatures, picked by looking at a few hundred seeds (the
// seed is the number in the comment)
export const GALLERY = [
  { code: '58591e622366e17f6d00d96', en: 'Horned pup', it: 'Cucciolo cornuto' },              // 120
  { code: '16cc3dd9ab7c0a3df9141dd', en: 'Sun urchin', it: 'Riccio solare' },                 // 43
  { code: '2e28c951cf4aa700179c6e5', en: 'Three-eyed hugger', it: 'Abbraccione a tre occhi' }, // 100
  { code: '489f34708eb03ec8fa8816c', en: 'Bristled crawler', it: 'Strisciante irsuto' },      // 142
  { code: 'f310926702b77d52362bc63', en: 'Spiny caterpillar', it: 'Bruco spinoso' },          // 116
  { code: '66233ce57db61d51bbf6e82', en: 'Antlered hopper', it: 'Saltatore palcuto' },        // 141
];

/* --------------------------------------------------------- small vectors -- */

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Rodrigues: v turned by angle t around the unit axis k
const rot = (v, k, t) => {
  const c = Math.cos(t), s = Math.sin(t), kv = cross(k, v), kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};
// the direction of azimuth a (from +x towards +y) and elevation e
const ae = (a, e) => [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
const UP = [0, 0, 1];

/* ------------------------------------------------------------- primitives -- */

// tags: what colour a part takes on the screen
//   body (with the pattern), head, ear, limb, accent, foot, eye, pupil
const sph = (c, r, k, tag) => ({ t: 0, c, r, k, tag });
// an ellipsoid with orthonormal axes u, v, w and semi-axes a, b, cc
const ell = (c, u, v, w, a, b, cc, k, tag) => ({ t: 1, c, u, v, w, a, b, cc, k, tag });
// a round cone: the hull of the spheres (a, r1) and (b, r2)
const rcone = (a, b, r1, r2, k, tag) => ({ t: 2, a, b, r1, r2, k, tag });
// a frame whose first axis is u, the second as close to v as it can be
const frame = (u, v) => { u = norm(u); const w = norm(cross(u, v)); return [u, cross(w, u), w]; };

// the tight box of a primitive
function box(p) {
  if (p.t === 0) return [sub(p.c, [p.r, p.r, p.r]), add(p.c, [p.r, p.r, p.r])];
  if (p.t === 1) {
    const e = [0, 1, 2].map(i => Math.hypot(p.a * p.u[i], p.b * p.v[i], p.cc * p.w[i]));
    return [sub(p.c, e), add(p.c, e)];
  }
  return [[0, 1, 2].map(i => Math.min(p.a[i] - p.r1, p.b[i] - p.r2)), [0, 1, 2].map(i => Math.max(p.a[i] + p.r1, p.b[i] + p.r2))];
}

// the signed distance of one primitive (close to it for the ellipsoid)
function dist(p, x, y, z) {
  if (p.t === 0) return Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r;
  if (p.t === 1) {
    const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
    const lx = (dx * p.u[0] + dy * p.u[1] + dz * p.u[2]) / p.a;
    const ly = (dx * p.v[0] + dy * p.v[1] + dz * p.v[2]) / p.b;
    const lz = (dx * p.w[0] + dy * p.w[1] + dz * p.w[2]) / p.cc;
    const k0 = Math.hypot(lx, ly, lz), k1 = Math.hypot(lx / p.a, ly / p.b, lz / p.cc);
    return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(p.a, p.b, p.cc);
  }
  // the round cone of Inigo Quilez
  const bx = p.b[0] - p.a[0], by = p.b[1] - p.a[1], bz = p.b[2] - p.a[2];
  const l2 = bx * bx + by * by + bz * bz, rr = p.r1 - p.r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const px = x - p.a[0], py = y - p.a[1], pz = z - p.a[2];
  const yy = px * bx + py * by + pz * bz, zz = yy - l2;
  const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.r1;
}

// the polynomial smooth minimum, a fillet of size k
const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/* ------------------------------------------------------------ development -- */

// the stage from 1 to 3 as a number; tuning of the young: 1 at stage 1, 0 at 3
const stageMix = s => clamp((3 - s) / 2, 0, 1);
const SYM = [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6];
const EYES = [2, 2, 2, 2, 2, 2, 1, 1, 3, 3, 3, 4, 4, 2, 2, 2];

// a discrete count that grows with the stage: the whole count n3 at stage 3,
// n1 at stage 1; returns [count, size of the newest one in (0, 1]]
const grown = (n1, n3, s) => {
  const c = n1 + (n3 - n1) * clamp((s - 1) / 2, 0, 1), n = Math.max(n1, Math.ceil(c - 1e-6));
  return [n, n > n1 ? clamp(c - (n - 1), 0.05, 1) : 1];
};

// the creature of genome g at stage s: its primitives (in the order of the
// union), the paint of the screen and what the card tells
export function develop(g, s = 3) {
  const P = [], paint = [], young = stageMix(s);
  const grow = lerp(1, 0.6, young);             // the young is smaller
  const R0 = 10 * (0.78 + g[G.fat] * 0.032);
  const minR = 1.0;                             // thinnest part, for printing
  const kb = R0 * 0.42;                         // the fillet of the body

  // body: n segments along a spine, rear (0) to front (n - 1)
  const n3 = 1 + Math.round(g[G.seg] * 4 / 15), n1 = Math.max(1, Math.ceil(n3 / 2));
  const [n, newest] = grown(n1, n3, s);
  const theta = g[G.posture] * 5 * Math.PI / 180;          // 0 (lying) to 75 degrees (upright)
  const spacing = 0.6 + g[G.len] * 0.03;
  const taper = 0.8 + g[G.taper] * 0.028;
  const seg = [];
  for (let i = 0; i < n; i++) {
    let r = R0 * clamp(Math.pow(taper, i - (n - 1)), 0.55, 1.45) * lerp(1, 1.08, young);
    if (i === 0 && n > n1) r *= lerp(0.45, 1, newest);
    const ang = theta + (i - (n - 1) / 2) * 0.16;
    const u = [Math.cos(ang), 0, Math.sin(ang)];
    let c = [0, 0, 0];
    if (i > 0) { const q = seg[i - 1]; c = add(q.c, mul(norm(add(q.u, u)), (q.r + r) * spacing)); }
    seg.push({ c, r, u, v: [0, 1, 0], w: norm(cross(u, [0, 1, 0])) });
  }
  const F = seg[n - 1], B = seg[0];

  // head on the front segment, bigger in the young
  const hr = clamp(F.r * (0.68 + g[G.head] * 0.04) * lerp(1, 1.42, young), 0.6 * R0, 1.9 * R0);
  const phi = theta + (78 - theta * 180 / Math.PI) * 0.5 * Math.PI / 180;
  let hc = add(F.c, mul([Math.cos(phi), 0, Math.sin(phi)], F.r * 0.5 + hr * 0.78));
  const ha = hr * 0.96, hb = hr * 1.06, hcz = hr * 0.93;   // head semi-axes x, y, z
  const onHead = d => { const rho = 1 / Math.hypot(d[0] / ha, d[1] / hb, d[2] / hcz); return add(hc, mul(d, rho)); };

  // the height: legs lift the body, without legs it lies sunk in the ground
  const sym = SYM[g[G.sym]];
  const ringsG = g[G.legs] >> 2;
  const rings = sym > 2 ? (ringsG > 0 ? 1 : 0) : ringsG;
  const legLen = R0 * (0.3 + g[G.leglen] * 0.1) * lerp(1, 0.62, young);
  let low = Infinity;
  for (const q of seg) low = Math.min(low, q.c[2] - q.r * Math.hypot(q.u[2] * 1.05, q.w[2] * 0.95));
  low = Math.min(low, hc[2] - hcz);
  const lift = rings > 0 ? legLen - low : -low - 0.22 * B.r;
  const up = c => add(c, [0, 0, lift]);
  for (const q of seg) q.c = up(q.c);
  const H = up(hc);
  hc = H;

  // segments, joined by a waist so that they never come apart, with a belly
  // of lighter colour and the pattern
  for (let i = 1; i < n; i++) P.push(rcone(seg[i - 1].c, seg[i].c, seg[i - 1].r * 0.6, seg[i].r * 0.6, kb, 'body'));
  for (const q of seg) {
    P.push(ell(q.c, q.u, q.v, q.w, q.r * lerp(1.12, 1.02, young), q.r, q.r * 0.95, kb, 'body'));
    paint.push({ kind: 'belly', c: add(q.c, mul(q.w, -q.r * 0.55)), r: q.r * 0.78 });
  }

  // neck
  if (len(sub(H, F.c)) > F.r * 0.4) P.push(rcone(F.c, H, F.r * 0.55, hr * 0.5, kb, 'body'));

  // tail: a chain of round cones from the rear, curling up or down
  const tailG = g[G.tail];
  if (tailG >= 2) {
    const tl = R0 * (tailG - 1) * 0.19 * lerp(1, 0.55, young);
    const curl = ((g[G.curl] >> 1) - 3.5) * 0.13;
    const m = 7, axis = [0, 1, 0];
    let p = add(B.c, mul(B.u, -B.r * 0.75)), d = norm(add(mul(B.u, -1), [0, 0, -0.25]));
    let r = B.r * 0.42;
    for (let j = 0; j < m; j++) {
      const r2 = Math.max(minR, lerp(B.r * 0.42, B.r * 0.13, (j + 1) / m));
      const q = add(p, mul(d, tl / m));
      P.push(rcone(p, q, Math.max(r, minR), r2, kb * 0.5, 'body'));
      p = q; r = r2; d = rot(d, axis, -curl);
    }
    if (g[G.curl] & 1) {
      const [u2, v2, w2] = frame(d, [0, 1, 0]);
      P.push(ell(add(p, mul(d, B.r * 0.18)), u2, v2, w2, B.r * 0.36, B.r * 0.16, B.r * 0.3, B.r * 0.12, 'accent'));
    }
  }

  // dorsal spikes, from stage 2 on
  const spikesN = g[G.spikes] >> 2, spikesS = ((g[G.spikes] & 3) + 1) * 0.16 * clamp((s - 1.4) / 1.6, 0, 1);
  if (spikesN > 0 && spikesS > 0.02) for (const q of seg) for (let j = 0; j < spikesN; j++) {
    const off = spikesN === 1 ? 0 : (j / (spikesN - 1) - 0.5) * 1.1;
    const base = add(add(q.c, mul(q.w, q.r * 0.8)), mul(q.u, off * q.r));
    const dir = norm(add(q.w, mul(q.u, -0.45)));
    P.push(rcone(base, add(base, mul(dir, q.r * (0.25 + spikesS * 1.6))), q.r * 0.24, minR, q.r * 0.15, 'accent'));
  }

  // legs: `rings` rings of `sym` legs, ending on the ground in feet
  const legs = [];
  if (rings > 0) for (let j = 0; j < rings; j++) {
    let si, off = 0;
    if (theta > 0.8) { si = Math.min(j, n - 1); if (j >= n) off = (j - n + 1) * 0.5; }
    else if (rings <= n) si = rings === 1 ? Math.max(0, n - 2) : Math.round(j * (n - 1) / (rings - 1));
    else { si = Math.min(n - 1, Math.floor(j * n / rings)); off = ((j * n) % rings) / rings - 0.3; }
    const q = seg[si];
    const rl = Math.max(minR * 1.3, q.r * 0.3 * lerp(1, 1.25, young) / (1 + 0.12 * legLen / R0));
    for (let m = 0; m < sym; m++) {
      const a = 2 * Math.PI * m / sym + Math.PI / sym, h = [Math.cos(a), Math.sin(a), 0];
      const hip = add(add(q.c, mul(h, q.r * 0.55)), add([0, 0, -q.r * 0.45], mul(q.u, off * q.r)));
      const foot = [hip[0] + h[0] * q.r * 0.35, hip[1] + h[1] * q.r * 0.4, rl * 0.55];
      const knee = add(mul(add(hip, foot), 0.5), add(mul(h, len(sub(hip, foot)) * 0.16), [rl * 0.3, 0, 0]));
      P.push(rcone(hip, knee, rl * 1.2, rl, kb * 0.45, 'limb'));
      P.push(rcone(knee, foot, rl, rl * 0.9, kb * 0.3, 'limb'));
      P.push(ell(add(foot, [rl * 0.45, 0, -rl * 0.05]), [1, 0, 0], [0, 1, 0], [0, 0, 1], rl * 1.75, rl * 1.3, rl * 0.62, rl * 0.5, 'foot'));
      legs.push(foot);
    }
  }

  // arms: a recursive tree from the shoulders, Dawkins' drawing in 3D
  const armsG = g[G.arms] >> 2;
  if (armsG > 0) {
    const [depth, last] = grown(Math.max(1, armsG - 2), armsG, s);
    const al = R0 * (0.55 + g[G.armlen] * 0.075) * lerp(1, 0.6, young);
    const ang = (15 + g[G.armang] * 4) * Math.PI / 180;
    const ra = Math.max(minR * 1.2, F.r * 0.24 * lerp(1, 1.2, young));
    const branch = (p, d, l, r, k, side) => {
      const e = add(p, mul(d, l)), r2 = Math.max(minR, r * 0.78);
      P.push(rcone(p, e, r, r2, kb * 0.3, 'limb'));
      if (k <= 1) { P.push(sph(e, Math.max(minR * 1.2, r * 1.3), r * 0.5, 'accent')); return; }
      const ax = norm((depth - k) % 2 === 0 ? cross(d, UP) : cross(d, norm(cross(d, UP))));
      const f = k === 2 ? last : 1;
      for (const sg of [-1, 1]) branch(e, rot(d, ax, sg * ang * 0.5 * side), l * 0.7 * f, r2, k - 1, side);
    };
    for (const side of [-1, 1]) {
      const sh = add(add(F.c, [0, side * F.r * 0.72, 0]), mul(F.u, F.r * 0.1));
      branch(sh, norm([0.6, side * 0.8, -0.3]), al, ra, depth, side);
    }
  }

  // the head, then its parts
  const [hu, hv, hw] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  P.push(ell(H, hu, hv, hw, ha, hb, hcz, kb * 0.8, 'head'));
  const kh = hr * 0.22;

  // snout
  const sn = g[G.snout] < 3 ? 0 : (g[G.snout] - 2) * 0.06 * lerp(1, 0.55, young);
  if (sn > 0) P.push(ell(add(H, [hr * (0.55 + sn * 0.35), 0, -hr * 0.3]), hu, hv, hw, hr * (0.3 + sn * 0.5), hr * 0.42, hr * 0.32, kh, 'head'));

  // ears: round, long, or frills on the sides
  const earT = g[G.ears] >> 2, E = hr * (0.3 + (g[G.ears] & 3) * 0.1) * lerp(1, 1.15, young);
  for (const side of [-1, 1]) {
    if (earT === 1) {
      const d = ae(side * 1.15, 0.78), c = onHead(d), [u2, v2, w2] = frame(d, [0, 0, 1]);
      P.push(ell(c, u2, v2, w2, E * 0.3, E * 0.95, E, kh * 0.6, 'ear'));
      paint.push({ kind: 'inner', c: add(c, mul(norm([1, 0, 0.2]), E * 0.25)), r: E * 0.6 });
    } else if (earT === 2) {
      const d = ae(side * 0.95, 0.95), b = onHead(d), tip = add(b, mul(norm(add(d, [-0.5, 0, 0.6])), E * 2.4));
      P.push(rcone(b, tip, E * 0.38, E * 0.3, kh * 0.6, 'ear'));
      paint.push({ kind: 'inner', c: add(mul(add(b, tip), 0.5), [E * 0.3, 0, 0]), r: E * 0.45 });
    } else if (earT === 3) {
      for (let j = 0; j < 3; j++) {
        const d = ae(side * 1.75, -0.15 + j * 0.42), b = onHead(d);
        const tip = add(b, mul(norm(add(d, [-0.7, 0, 0.15 * (j - 1)])), E * 1.5));
        P.push(rcone(b, tip, E * 0.24, Math.max(minR, E * 0.14), kh * 0.5, 'accent'));
        P.push(sph(tip, Math.max(minR, E * 0.2), E * 0.1, 'accent'));
      }
    }
  }

  // horns: a pair, antlers, or a crown (a crest when bilateral)
  const hornT = g[G.horn] >> 2, hornL = hr * (0.45 + ((g[G.horn] & 3) + 1) * 0.28) * lerp(1, 0.22, young);
  const bend = (g[G.hornbend] - 7.5) / 7.5 * 0.45;
  const hornChain = (b, d, l, r, m) => {
    let p = b, ax = norm(cross(d, UP)), r0 = r;
    if (!isFinite(ax[0]) || len(cross(d, UP)) < 1e-3) ax = [0, 1, 0];
    for (let j = 0; j < m; j++) {
      const r2 = Math.max(minR, lerp(r0, minR, (j + 1) / m)), q = add(p, mul(d, l / m));
      P.push(rcone(p, q, Math.max(minR, r), r2, r * 0.3, 'accent'));
      p = q; r = r2; d = rot(d, ax, bend);
    }
  };
  if (hornT === 1) for (const side of [-1, 1]) {
    const d = ae(side * 0.6, 0.85);
    hornChain(onHead(d), norm(add(d, [0, side * 0.2, 0.6])), hornL, hr * 0.2, 4);
  } else if (hornT === 2) {
    const [depth] = grown(1, 1 + ((g[G.horn] & 3) >> 1) + 1, s);
    const antler = (p, d, l, r, k) => {
      const e = add(p, mul(d, l)), r2 = Math.max(minR, r * 0.72);
      P.push(rcone(p, e, Math.max(minR, r), r2, r * 0.3, 'accent'));
      if (k <= 1) return;
      const ax = norm(cross(d, [1, 0, 0])) || [0, 1, 0];
      antler(e, rot(d, ax, 0.5 + bend), l * 0.68, r2, k - 1);
      antler(e, norm(add(rot(d, ax, -0.45 + bend), [0.35, 0, 0])), l * 0.55, r2, k - 1);
    };
    for (const side of [-1, 1]) {
      const d = ae(side * 0.55, 0.9);
      antler(onHead(d), norm(add(d, [-0.1, side * 0.3, 0.55])), hornL * 0.6, hr * 0.17, depth);
    }
  } else if (hornT === 3) {
    if (sym === 2) {
      const m = 3 + ((g[G.horn] & 3) >> 1);
      for (let j = 0; j < m; j++) {
        const e = 1.0 + j * 1.3 / m, d = [Math.cos(e), 0, Math.sin(e)], b = onHead(d);
        hornChain(b, norm(add(d, [0, 0, 0.2])), hornL * (0.75 - 0.08 * j), hr * 0.17, 2);
      }
    } else for (let j = 0; j < sym; j++) {
      const d = ae(2 * Math.PI * j / sym, 1.05);
      hornChain(onHead(d), norm(add(d, [0, 0, 0.9])), hornL * 0.7, hr * 0.15, 2);
    }
  }

  // eyes: white balls half sunk in the head, pupils looking forward
  const ne = EYES[g[G.eyes]];
  let er = hr * (0.19 + g[G.eyesize] * 0.013) * lerp(1, 1.3, young);
  const spots = ne === 1 ? [[0, 0.22]] : ne === 2 ? [[-0.42, 0.18], [0.42, 0.18]]
    : ne === 3 ? [[-0.52, 0.1], [0.52, 0.1], [0, 0.6]] : [[-0.36, 0.03], [0.36, 0.03], [-0.58, 0.48], [0.58, 0.48]];
  if (ne === 1) er *= 1.4; else if (ne === 4) er *= 0.78; else if (ne === 3) er *= 0.9;
  er = Math.min(er, hr * 0.42);
  const eyes = [];
  for (const [a, e] of spots) {
    const d = ae(a, e), c = add(onHead(d), mul(d, -er * 0.42));
    P.push(sph(c, er, er * 0.12, 'eye'));
    const look = norm(add(d, [0.9, 0, 0]));
    const pc = add(c, mul(look, er * 0.6));
    P.push(sph(pc, er * 0.6, er * 0.06, 'pupil'));
    paint.push({ kind: 'shine', c: add(add(pc, mul(look, er * 0.55)), [0, d[1] * er * 0.1 - er * 0.18 * Math.sign(a || 1), er * 0.32]), r: er * 0.2 });
    eyes.push(c);
  }
  // a smile under the eyes (or above the snout), and cheeks
  const mc = sn > 0 ? add(H, [hr * (0.55 + sn * 0.35) + hr * (0.3 + sn * 0.5) * 0.8, 0, -hr * 0.42]) : onHead(ae(0, -0.3));
  paint.push({ kind: 'mouth', c: mc, r: hr * 0.2, x0: mc[0] - hr * 0.22 });
  for (const side of [-1, 1]) paint.push({ kind: 'cheek', c: onHead(ae(side * 0.82, -0.18)), r: hr * 0.2 });

  // spots of the pattern: a few, reproducible from the genome
  const pat = g[G.pattern] >> 2;
  if (pat === 3) {
    const r = rng(hash('spots' + encode(g)));
    for (const q of seg) for (let j = 0; j < 4; j++) {
      const a = (r() - 0.5) * 2.6, b = (r() - 0.2) * 1.3;
      const d = norm(add(add(mul(q.w, Math.cos(b)), mul(q.v, Math.sin(a) * 0.9)), mul(q.u, Math.cos(a) * 0.4 - 0.2)));
      paint.push({ kind: 'spot', c: add(q.c, mul(d, q.r * 0.95)), r: q.r * (0.18 + r() * 0.14) });
    }
  }

  // the growth of the young: everything a little smaller
  if (grow !== 1) for (const p of P) scale(p, grow);
  for (const q of paint) { q.c = mul(q.c, grow); q.r *= grow; }

  const stripes = pat === 2 ? { u: norm(add(B.u, F.u)), o: mul(B.c, grow), period: R0 * 0.9 * grow } : null;
  return { P, paint, stripes, g, s, sym, rings, legs: legs.length, eyes: ne, depth: armsG, n };
}

function scale(p, k) {
  if (p.t === 2) { p.a = mul(p.a, k); p.b = mul(p.b, k); p.r1 *= k; p.r2 *= k; }
  else { p.c = mul(p.c, k); if (p.t === 0) p.r *= k; else { p.a *= k; p.b *= k; p.cc *= k; } }
  p.k *= k;
}

/* ------------------------------------------------------- the distance field -- */

// one or more creatures as a field: f(x, y, z) and the colour at a point, with
// a grid of buckets so that a point looks only at the primitives near it.
// `shift` places each creature (for the three stages on one base).
export function field(creatures, shifts = creatures.map(() => [0, 0, 0])) {
  const P = [], paint = [], stripes = [];
  creatures.forEach((c, i) => {
    const sft = shifts[i], mv = v => add(v, sft);
    for (const p0 of c.P) {
      const p = { ...p0 };
      if (p.t === 2) { p.a = mv(p.a); p.b = mv(p.b); } else p.c = mv(p.c);
      p.who = i; P.push(p);
    }
    for (const q of c.paint) paint.push({ ...q, c: mv(q.c), who: i });
    stripes.push(c.stripes ? { ...c.stripes, o: mv(c.stripes.o) } : null);
  });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of P) {
    p.box = box(p);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.box[0][a]); hi[a] = Math.max(hi[a], p.box[1][a]); }
  }
  const big = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const cs = big / 26, margin = cs * 1.2;
  const pad = Math.max(...P.map(p => p.k)) + margin;
  const o = lo.map(v => v - pad), N = [0, 1, 2].map(a => Math.ceil((hi[a] - lo[a] + 2 * pad) / cs) + 1);
  const cells = Array.from({ length: N[0] * N[1] * N[2] }, () => []);
  P.forEach((p, i) => {
    const e = p.k + margin;
    const a0 = [0, 1, 2].map(a => clamp(Math.floor((p.box[0][a] - e - o[a]) / cs), 0, N[a] - 1));
    const a1 = [0, 1, 2].map(a => clamp(Math.floor((p.box[1][a] + e - o[a]) / cs), 0, N[a] - 1));
    for (let z = a0[2]; z <= a1[2]; z++) for (let y = a0[1]; y <= a1[1]; y++) for (let x = a0[0]; x <= a1[0]; x++) cells[(z * N[1] + y) * N[0] + x].push(i);
  });
  const lists = cells.map(c => Int32Array.from(c));
  const cell = (x, y, z) => {
    const i = Math.floor((x - o[0]) / cs), j = Math.floor((y - o[1]) / cs), k = Math.floor((z - o[2]) / cs);
    if (i < 0 || j < 0 || k < 0 || i >= N[0] || j >= N[1] || k >= N[2]) return null;
    return lists[(k * N[1] + j) * N[0] + i];
  };
  const f = (x, y, z) => {
    const L = cell(x, y, z);
    if (!L || !L.length) return margin;
    let d = Infinity, who = -1;
    for (let m = 0; m < L.length; m++) {
      const p = P[L[m]], di = dist(p, x, y, z);
      if (p.who !== who) { d = Math.min(d, di); who = p.who; } else d = smin(d, di, p.k);
    }
    return d;
  };
  return { P, paint, stripes, f, cell, lo, hi };
}

/* ------------------------------------------------------------------ colour -- */

const hsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = x => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3)];
};
const OFFS = [150, 40, 200, -35];
export function palette(g) {
  const h = g[G.hue] * 22.5 + 8, off = OFFS[g[G.pattern] & 3];
  return {
    body: hsl(h, 0.62, 0.6), head: hsl(h, 0.62, 0.62), ear: hsl(h, 0.62, 0.62), limb: hsl(h, 0.55, 0.54),
    accent: hsl(h + off, 0.66, 0.52), foot: hsl(h + off, 0.45, 0.42),
    belly: hsl(h + 10, 0.7, 0.86), inner: hsl(345, 0.65, 0.8),
    eye: [0.98, 0.97, 0.99], pupil: [0.06, 0.04, 0.1], mouth: [0.25, 0.1, 0.2], shine: [1, 1, 1], cheek: hsl(350, 0.75, 0.78),
    spot: hsl(h + off, 0.55, 0.5), css: `hsl(${h.toFixed(0)} 58% 62%)`, cssAccent: `hsl(${(h + off).toFixed(0)} 62% 56%)`,
  };
}

// colours for the vertices of a mesh of the field (in the same units)
export function colours(F, pos, palettes) {
  const C = new Float32Array(pos.length), d = [];
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2], L = F.cell(x, y, z);
    let rgb = [0.6, 0.6, 0.6];
    if (L && L.length) {
      let best = Infinity, who = 0;
      d.length = L.length;
      for (let m = 0; m < L.length; m++) { d[m] = dist(F.P[L[m]], x, y, z); if (d[m] < best) { best = d[m]; who = F.P[L[m]].who; } }
      const pal = palettes[who];
      let w = 0, r = 0, gg = 0, b = 0;
      for (let m = 0; m < L.length; m++) {
        const p = F.P[L[m]];
        if (p.who !== who) continue;
        const sharp = p.tag === 'eye' || p.tag === 'pupil';
        const wid = sharp ? Math.max(1e-3, p.k * 0.6) : p.k * 0.5;
        const t = 1 - (d[m] - best) / wid;
        if (t <= 0) continue;
        let c = pal[p.tag];
        if (p.tag === 'body' && F.stripes[who]) {
          const S = F.stripes[who], s = dot(sub([x, y, z], S.o), S.u) / S.period;
          if (s - Math.floor(s) < 0.32) c = pal.accent;
        }
        const ww = t * t;
        w += ww; r += c[0] * ww; gg += c[1] * ww; b += c[2] * ww;
      }
      if (w > 0) rgb = [r / w, gg / w, b / w];
      // paint on the surface
      const tagNear = F.P[L.reduce((a, i, m) => (d[m] < d[a.m] ? { i, m } : a), { i: L[0], m: 0 }).i].tag;
      for (const q of F.paint) {
        if (q.who !== who) continue;
        const e = Math.hypot(x - q.c[0], y - q.c[1], z - q.c[2]) / q.r;
        if (q.kind === 'mouth') {
          if (x < q.x0 || (tagNear !== 'head')) continue;
          const ry = y - q.c[1], rz = z - (q.c[2] + q.r), dd = Math.hypot(ry, rz);
          if (Math.abs(dd - q.r) < q.r * 0.17 && rz < -q.r * 0.5) rgb = pal.mouth.slice();
          continue;
        }
        if (e >= 1) continue;
        const okTag = q.kind === 'shine' ? tagNear === 'pupil' : q.kind === 'inner' ? tagNear === 'ear' : q.kind === 'cheek' ? tagNear === 'head' : tagNear === 'body';
        if (!okTag) continue;
        const c = pal[q.kind], t = q.kind === 'belly' ? clamp((1 - e) * 2.2, 0, 0.85) : q.kind === 'cheek' ? clamp((1 - e) * 1.6, 0, 0.75) : clamp((1 - e) * 5, 0, 1);
        rgb = [lerp(rgb[0], c[0], t), lerp(rgb[1], c[1], t), lerp(rgb[2], c[2], t)];
      }
    }
    C[v] = rgb[0]; C[v + 1] = rgb[1]; C[v + 2] = rgb[2];
  }
  return C;
}

/* ----------------------------------------------------- the three stages -- */

// the creatures to show or print: one stage, or the three side by side
// (stage 1 on the left of a viewer who looks at their faces, along -x)
export function lineup(g, stage) {
  if (stage !== 'c') { const c = develop(g, +stage); return { cs: [c], shifts: [[0, 0, 0]] }; }
  const cs = [1, 2, 3].map(s => develop(g, s)), shifts = [];
  let y = 0;
  cs.forEach((c, i) => {
    const F1 = field([c]), w = F1.hi[1] - F1.lo[1];
    if (i > 0) y += w * 0.5 + 3;
    shifts.push([-(F1.lo[0] + F1.hi[0]) / 2, y - (F1.lo[1] + F1.hi[1]) / 2, 0]);
    y += w * 0.5 + 3;
  });
  return { cs, shifts };
}

// a mesh of the creatures for the screen: cells across the largest side
export function screenMesh(g, stage, cells = 70) {
  const { cs, shifts } = lineup(g, stage), F = field(cs, shifts);
  const big = Math.max(...[0, 1, 2].map(a => F.hi[a] - F.lo[a])), h = big / cells;
  const lo = [F.lo[0], F.lo[1], Math.max(0, F.lo[2])];
  const f = (x, y, z) => Math.max(F.f(x, y, z), -z);
  const m = implicitSolid(f, [lo, F.hi], h, { crumbs: 0.02 });
  const pal = palette(g);
  m.col = colours(F, m.pos, cs.map(() => pal));
  m.lo = lo; m.hi = F.hi;
  return m;
}

/* -------------------------------------------------------- the solid, in mm -- */

// o: { code, stage: '1' | '2' | '3' | 'c', size (height in mm of the tallest),
// base (a plate under the feet), res: 'draft' | 'fine' }
export function solid({ code, stage = '3', size = 70, base = true, res = 'draft' } = {}, progress) {
  const g = decode(code) || fromSeed(1);
  const { cs, shifts } = lineup(g, String(stage)), F = field(cs, shifts);
  const k = size / F.hi[2];                                  // model units to mm
  const lo = F.lo.map(v => v * k), hi = F.hi.map(v => v * k);
  const bt = 3, mg = 4;                                      // base: thickness, margin
  const bx0 = lo[0] - mg, bx1 = hi[0] + mg, by0 = lo[1] - mg, by1 = hi[1] + mg;
  const A = (bx1 - bx0) / 2, Bh = (by1 - by0) / 2, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const rc = Math.min(A, Bh) * 0.92, er = 1;                 // corners, rounded edge
  const plate = (x, y, z) => {
    const qx = Math.abs(x - cx) - (A - rc), qy = Math.abs(y - cy) - (Bh - rc);
    const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc + er;
    const dz = Math.abs(z + bt / 2) - bt / 2 + er;
    return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0) - er;
  };
  const f = base
    ? (x, y, z) => smin(Math.max(F.f(x / k, y / k, z / k) * k, -1 - z), plate(x, y, z), 1.6)
    : (x, y, z) => Math.max(F.f(x / k, y / k, z / k) * k, -z);
  const h = size / (res === 'fine' ? 130 : 85);
  const b0 = base ? [bx0, by0, -bt] : [lo[0], lo[1], 0], b1 = base ? [bx1, by1, hi[2]] : hi;
  const m = onBed(implicitSolid(f, [b0, b1], h, { progress }));
  // the overhangs: area facing down more than 45 degrees, above the bed
  let all = 0, over = 0;
  const p = m.pos, I = m.idx, zb = base ? bt + 0.5 : 0.5;
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const nn = cross(u, v), ar = len(nn) / 2;
    all += ar;
    if (nn[2] / (2 * ar || 1) < -0.71 && (p[a + 2] + p[b + 2] + p[c + 2]) / 3 > zb) over += ar;
  }
  m.overhang = +(100 * over / all).toFixed(1);
  return m;
}

export const fileName = o => `biomorph_${o.code}_${o.stage === 'c' ? 'stages' : 'stage' + o.stage}_${o.size}mm${o.base ? '_base' : ''}`;

/* ------------------------------------------------------------- the card -- */

const SYL = ['ba', 'bo', 'ki', 'lu', 'mo', 'nu', 'pi', 'ru', 'sa', 'to', 'vi', 'zu', 'fe', 'go', 'ya', 'quo',
  'mi', 'ta', 'ne', 'shi', 'do', 'ka', 'ly', 'po', 'wu', 'ze', 'ri', 'ha', 'lo', 'gu', 'fi', 'no'];
const END2 = ['l', 'n', 'm', 'sh', 'k', 'r', 'th', 'x'];
const END3 = ['dra', 'gorn', 'thax', 'mire', 'vane', 'loth', 'rusk', 'zeal', 'quorn', 'bray', 'wyth', 'drum'];
const cap = w => w[0].toUpperCase() + w.slice(1);

// three names, one per stage, from the body genes (not the colour)
export function names(g) {
  const r = rng(hash('name' + encode(g.slice(0, G.hue))));
  const a = SYL[Math.floor(r() * 32)], b = SYL[Math.floor(r() * 32)], c = SYL[Math.floor(r() * 32)];
  const e2 = END2[Math.floor(r() * END2.length)], e3 = END3[Math.floor(r() * END3.length)];
  const twin = a.replace(/[aeiouy]+$/, '') + (b.match(/[aeiouy]+$/) || ['i'])[0];
  return [cap(a + twin), cap(a + b + e2), cap(c + a + e3)];
}

// the number of the card, and its kind from the genes
export const number = g => hash(encode(g)) % 1000;
export function kind(g) {
  const c = develop(g, 3), out = [];
  if (c.sym > 2) out.push(['radial', 'radiale']);
  if (c.rings === 0) out.push(['crawler', 'strisciante']);
  else if (g[G.posture] >= 10 && c.rings === 1 && c.sym === 2) out.push(['biped', 'bipede']);
  else if (c.legs >= 6) out.push(['many-legged', 'multipede']);
  if (c.depth >= 2) out.push(['branching', 'ramificato']);
  const hornT = g[G.horn] >> 2;
  if (hornT) out.push([['horned', 'antlered', 'crested'][hornT - 1], ['cornuto', 'palcuto', 'crestato'][hornT - 1]]);
  if (c.n >= 4) out.push(['long', 'lungo']);
  if (c.eyes !== 2) out.push([`${c.eyes}-eyed`, `${c.eyes} occhi`]);
  return out.slice(0, 3);
}

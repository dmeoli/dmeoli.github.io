// Dragon eggs: the outline of an egg by the universal formula of Narushin,
// Romanov and Griffin (2021), a surface of revolution in millimetres, covered
// by scales in low relief whose centers are laid by phyllotaxis (the golden
// angle of Vogel 1979) or at random, each scale the Voronoi cell of its
// center, and cut flat at the blunt end to stand on the bed.

import { rng } from '../fantasy/util.js';

// the radius of the egg at abscissa x in [-L/2, L/2] (the blunt end at
// -L/2, the pointed end at L/2): L the length, B the largest breadth, w the
// shift of the largest breadth from the middle, D the diameter at L/4 from
// the pointed end; the first factor alone is Hügelschäffer's ovoid, and the
// second bends it so that the diameter at L/4 is D
export function eggRadius(x, L, B, w, D) {
  const a = (B / 2) * Math.sqrt(Math.max(0, (L * L - 4 * x * x) / (L * L + 8 * w * x + 4 * w * w)));
  const K = Math.sqrt(5.5 * L * L + 11 * L * w + 4 * w * w), M = Math.sqrt(L * L + 2 * w * L + 4 * w * w);
  const c = K * (Math.sqrt(3) * B * L - 2 * D * M) / (Math.sqrt(3) * B * L * (K - 2 * M));
  const q = L * (L * L + 8 * w * x + 4 * w * w) / (2 * (L - 2 * w) * x * x + (L * L + 8 * L * w - 4 * w * w) * x + 2 * L * w * w + L * L * w + L * L * L);
  return Math.max(0, a * (1 - c * (1 - Math.sqrt(Math.max(0, q)))));
}

export const SHAPES = {
  hen: { B: 0.75, w: 0.04, D: 0.62 },
  round: { B: 0.88, w: 0.02, D: 0.76 },
  pear: { B: 0.62, w: 0.1, D: 0.44 },
  dragon: { B: 0.64, w: 0.07, D: 0.5 },
};

// the profile r(z), z from 0 (blunt end) to L, sampled at n + 1 points
export function profile({ B, w, D }, L, n = 2000) {
  const z = new Float64Array(n + 1), r = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) { z[i] = L * i / n; r[i] = eggRadius(z[i] - L / 2, L, B * L, w * L, D * L); }
  return { z, r, n };
}

// the height of the cut: the highest point of the lower part where the
// profile widens by more than 1 mm per mm (the surface overhangs by more than
// 45 degrees below it), or a small cut of 4% when steep = false
export function cutHeight(P, steep = true) {
  const { z, r, n } = P;
  if (!steep) return z[Math.round(0.04 * n)];
  let im = 0;
  for (let i = 0; i <= n; i++) if (r[i] > r[im]) im = i;
  let cut = 0;
  for (let i = 1; i < im; i++) if ((r[i] - r[i - 1]) / (z[i] - z[i - 1]) > 1) cut = i;
  return z[Math.max(cut, Math.round(0.02 * n))];
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// o: shape B, w, D (fractions of the length), pattern ('phyllotaxis',
// 'voronoi', 'smooth'), scales (count), relief (mm), seed, size (the length,
// mm), cut ('45' or 'small'), res ('preview', 'draft', 'fine')
export function solid(o, progress) {
  const L = o.size || 80, P = profile(o, L), zc = cutHeight(P, o.cut !== 'small');
  const res = o.res === 'fine' ? 2.2 : o.res === 'draft' ? 1.4 : 0.8;
  const M = Math.round(128 * res), NR = Math.round(110 * res);
  // arc length along the profile from the cut, to space the rings evenly
  const S = [0];
  let i0 = 0;
  while (P.z[i0] < zc) i0++;
  for (let i = i0 + 1; i <= P.n; i++) S.push(S[S.length - 1] + Math.hypot(P.z[i] - P.z[i - 1], P.r[i] - P.r[i - 1]));
  const len = S[S.length - 1];
  const at = s => {
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m; else hi = m; }
    const t = (s - S[lo]) / (S[hi] - S[lo] || 1), i = i0 + lo;
    return [P.z[i] + t * (P.z[i + 1] - P.z[i]), P.r[i] + t * (P.r[i + 1] - P.r[i])];
  };
  // the centers of the scales, spread over the area of the lateral surface
  const area = [0];
  for (let i = 1; i <= P.n; i++) area.push(area[i - 1] + Math.PI * (P.r[i] + P.r[i - 1]) * Math.hypot(P.z[i] - P.z[i - 1], P.r[i] - P.r[i - 1]));
  const A = area[P.n], zAt = a => { let i = 1; while (i < P.n && area[i] < a) i++; const t = (a - area[i - 1]) / (area[i] - area[i - 1] || 1); return P.z[i - 1] + t * (P.z[i] - P.z[i - 1]); };
  const rAt = z => { const f = z / L * P.n, i = Math.min(P.n - 1, Math.floor(f)); return P.r[i] + (f - i) * (P.r[i + 1] - P.r[i]); };
  const n = o.pattern === 'smooth' ? 0 : (o.scales || 220), seeds = [];
  const r = rng(o.seed * 17 + 3), golden = Math.PI * (3 - Math.sqrt(5));
  const spacing = Math.sqrt(A / Math.max(1, n));
  for (let k = 0; k < n && o.pattern === 'phyllotaxis'; k++) {
    const z = zAt(A * (k + 0.5) / n), th = k * golden, rr = rAt(z);
    seeds.push([rr * Math.cos(th), rr * Math.sin(th), z]);
  }
  for (let tries = 0; o.pattern === 'voronoi' && seeds.length < n && tries < 60 * n; tries++) {
    const z = zAt(r() * A), th = r() * 2 * Math.PI, rr = rAt(z), p = [rr * Math.cos(th), rr * Math.sin(th), z];
    if (seeds.every(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 0.75 * spacing)) seeds.push(p);
  }
  const amp = o.relief ?? 0.8, B = o.B * L;
  // the relief at a point of the smooth egg: F1 and F2 are the distances to
  // the nearest and second nearest centers, the groove lies where they are
  // equal, and a scale is thickest at its lower edge, as shingles are
  const relief = (x, y, z, rr) => {
    if (!seeds.length || amp <= 0) return 0;
    let d1 = Infinity, d2 = Infinity, s1 = null;
    for (const q of seeds) {
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2;
      if (d < d1) { d2 = d1; d1 = d; s1 = q; } else if (d < d2) d2 = d;
    }
    const e = (Math.sqrt(d2) - Math.sqrt(d1)) / spacing;
    const low = Math.max(0, Math.min(1, 0.5 + (s1[2] - z) / spacing));
    return amp * smooth(0, 0.3, e) * (0.45 + 0.55 * low) * smooth(0, 0.3 * B, rr) * smooth(zc, zc + 0.6 * spacing, z);
  };
  // rings from the cut to the tip, then the pole at the tip and a flat cap
  const pos = [], idx = [];
  for (let j = 0; j < NR; j++) {
    const [z, rr] = at(len * j / NR);
    for (let k = 0; k < M; k++) {
      const th = 2 * Math.PI * k / M, c = Math.cos(th), s = Math.sin(th);
      const R = rr + relief(rr * c, rr * s, z, rr);
      pos.push(R * c, R * s, z);
    }
    if (progress && j % 8 === 0) progress(j / NR);
  }
  const tip = pos.length / 3; pos.push(0, 0, L);
  const cap = pos.length / 3; pos.push(0, 0, pos[2]);
  for (let j = 0; j + 1 < NR; j++) for (let k = 0; k < M; k++) {
    const a = j * M + k, b = j * M + (k + 1) % M, c = a + M, d = b + M;
    idx.push(a, b, d, a, d, c);
  }
  for (let k = 0; k < M; k++) {
    idx.push((NR - 1) * M + k, (NR - 1) * M + (k + 1) % M, tip);
    idx.push(cap, (k + 1) % M, k);
  }
  // to the bed: the cut at z = 0
  const z0 = pos[2];
  for (let q = 2; q < pos.length; q += 3) pos[q] -= z0;
  const m = { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
  m.cut = zc; m.scales = seeds.length;
  return m;
}

export const fileName = o => `dragon_egg_${o.pattern}_B${o.B}_w${o.w}_D${o.D}_${o.size}mm`;

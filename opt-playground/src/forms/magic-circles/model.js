// Magic circles: a round medallion whose raised lines are rings, a star
// polygon {n/k}, small circles on its corners, a spirograph curve
// (hypotrochoid or epitrochoid) and a band of glyphs, all drawn from a seed
// and from the order n of the rotational symmetry. The lines are kept as
// polylines in a disc of radius 1 (design), stamped into a height map
// (relief), and the medallion is a closed solid on a polar mesh (disc),
// which scenes with other round reliefs share.

/* -------------------------------------------------------------- numbers -- */

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const TAU = 2 * Math.PI;

/* ----------------------------------------------------------- the design -- */

const circle = (r, n = 0, x = 0, y = 0) => {
  const m = n || Math.max(24, Math.ceil(160 * r));
  return Array.from({ length: m }, (_, i) => [x + r * Math.cos(TAU * i / m), y + r * Math.sin(TAU * i / m)]);
};

// the vertices of {n/k}: d = gcd(n, k) closed polygons of n/d corners each,
// the corners on the circle of radius r, the first at angle a0
export function starPolygon(n, k, r, a0 = Math.PI / 2) {
  const d = gcd(n, k), out = [];
  for (let s = 0; s < d; s++) {
    const p = [];
    for (let i = 0; i < n / d; i++) { const a = a0 + TAU * (s + i * k) / n; p.push([r * Math.cos(a), r * Math.sin(a)]); }
    out.push(p);
  }
  return out;
}

// a roulette: the point at distance d from the centre of a circle of radius q
// rolling inside (hypo) or outside (epi) a circle of radius p; with gcd(p, q)
// = 1 it closes after q turns and has p-fold symmetry; scaled to radius r
export function trochoid(kind, p, q, d, r, n = 0) {
  const T = TAU * q, m = n || Math.ceil(90 * p * Math.max(1, q / 2)), pts = [];
  const s = kind === 'epi' ? 1 : -1, big = p + s * q, rmax = Math.abs(big) + d;
  for (let i = 0; i < m; i++) {
    const t = T * i / m, u = big / q * t;
    pts.push([r * (big * Math.cos(t) - s * d * Math.cos(u)) / rmax, r * (big * Math.sin(t) - d * Math.sin(u)) / rmax]);
  }
  return pts;
}

// a glyph: two to four strokes between points of a 3 x 3 lattice, u across
// and v up in [0, 1]
function glyph(R) {
  const P = [0, 0.5, 1], strokes = [], k = 2 + Math.floor(R() * 3);
  for (let s = 0; s < k; s++) {
    const a = [P[Math.floor(R() * 3)], P[Math.floor(R() * 3)]];
    let b;
    do b = [P[Math.floor(R() * 3)], P[Math.floor(R() * 3)]]; while (b[0] === a[0] && b[1] === a[1]);
    strokes.push(R() < 0.25 ? [a, [a[0], b[1]], b] : [a, b]);
  }
  return strokes;
}

// the lines of the circle for o = { seed, n, k, curve ('hypo' | 'epi' |
// 'none'), glyphs }: [{ pts, closed, w (width, times the line width),
// layer }], in a disc of radius 1; layer numbers the rings that turn
// together in the drawing of the scene
export function design({ seed = 1, n = 6, k = 2, curve = 'hypo', glyphs = true } = {}) {
  const R = rng(seed * 7919 + n * 31 + k), L = [];
  const add = (pts, closed, w, layer) => L.push({ pts, closed, w, layer });
  add(circle(0.985), true, 1.6, 0);
  add(circle(0.94), true, 1, 0);
  add(circle(0.8), true, 1, 1);
  if (glyphs) {
    // the band of glyphs between 0.8 and 0.94, each in a box of the band
    const m = 4 * Math.round((18 + R() * 10) / 4), r0 = 0.825, r1 = 0.915;
    for (let i = 0; i < m; i++) {
      const a0 = TAU * (i + 0.18) / m, a1 = TAU * (i + 0.82) / m;
      for (const st of glyph(R)) {
        const pts = [];
        for (let j = 0; j + 1 < st.length; j++) for (let s = 0; s <= 6; s++) {
          if (j > 0 && s === 0) continue;
          const u = st[j][0] + (st[j + 1][0] - st[j][0]) * s / 6, v = st[j][1] + (st[j + 1][1] - st[j][1]) * s / 6;
          const a = a1 + (a0 - a1) * u, r = r0 + (r1 - r0) * v;
          pts.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        add(pts, false, 0.8, 1);
      }
    }
  }
  // ticks inside the band, a multiple of n of them
  if (R() < 0.7) {
    const m = n * (2 + Math.floor(R() * 4));
    for (let i = 0; i < m; i++) {
      const a = TAU * i / m + Math.PI / 2, l = i % (m / n) === 0 ? 0.06 : 0.03;
      add([[0.78 * Math.cos(a), 0.78 * Math.sin(a)], [(0.78 - l) * Math.cos(a), (0.78 - l) * Math.sin(a)]], false, 0.8, 2);
    }
  }
  // the star {n/k}, its circle, and small circles on its corners
  const rs = 0.66, kk = Math.max(1, Math.min(k, Math.floor((n - 1) / 2)));
  for (const p of starPolygon(n, kk, rs)) add(p, true, 1, 3);
  add(circle(rs), true, 1, 3);
  if (R() < 0.75) {
    const ro = 0.055 + R() * 0.03, inner = R() < 0.5;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + TAU * i / n, x = rs * Math.cos(a), y = rs * Math.sin(a);
      add(circle(ro, 48, x, y), true, 0.8, 3);
      if (inner) add(circle(ro * 0.4, 24, x, y), true, 0.8, 3);
    }
  }
  // the circle that the sides of the star touch (radius rs cos(pi k / n)),
  // and in it the roulette, or a second star turned by pi / n
  const ri = rs * Math.cos(Math.PI * kk / n);
  add(circle(ri), true, 1, 4);
  const inside = ri * 0.94;
  if (curve === 'none' || ri < 0.12) {
    const k2 = Math.max(1, Math.floor((n - 1) / 2));
    for (const p of starPolygon(n, k2, inside, Math.PI / 2 + Math.PI / n)) add(p, true, 1, 4);
  } else {
    // p-fold, p a multiple of n; q coprime to p; the pen at distance d
    const mult = n <= 4 ? 2 + Math.floor(R() * 2) : 1 + Math.floor(R() * 2), p = n * mult;
    const qs = [];
    for (let q = 2; q < p && q <= 7; q++) if (gcd(p, q) === 1) qs.push(q);
    const q = qs.length ? qs[Math.floor(R() * qs.length)] : 1, d = q * (0.4 + R() * 0.7);
    const pts = trochoid(curve, p, q, d, inside);
    pts.forEach((v, i) => { const a = Math.PI / 2, c = Math.cos(a), s = Math.sin(a); pts[i] = [c * v[0] - s * v[1], s * v[0] + c * v[1]]; });
    add(pts, true, 0.8, 5);
    L.meta = { p, q, d: +d.toFixed(2) };
  }
  add(circle(Math.min(0.06, ri * 0.25)), true, 1, 4);
  L.n = n; L.k = kk;
  return L;
}

/* ----------------------------------------------------------- the relief -- */

// the lines stamped into a height map of N x N pixels over [-1, 1]^2 (row j
// at y = -1 + 2 j / (N - 1)): a line of half-width hw rises to 1 with flanks
// of width e (both in units of the disc), the higher line wins where they meet
export function relief(lines, N, hw, e) {
  const H = new Float32Array(N * N), px = 2 / (N - 1);
  const seg = (ax, ay, bx, by, w) => {
    const half = w * hw + e / 2, x0 = Math.max(0, Math.floor((Math.min(ax, bx) - half + 1) / px)), x1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + half + 1) / px));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - half + 1) / px)), y1 = Math.min(N - 1, Math.ceil((Math.max(ay, by) + half + 1) / px));
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-12;
    for (let j = y0; j <= y1; j++) {
      const y = -1 + j * px;
      for (let i = x0; i <= x1; i++) {
        const x = -1 + i * px, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2));
        const d = Math.hypot(x - ax - t * ex, y - ay - t * ey), h = Math.min(1, (half - d) / e);
        if (h > H[j * N + i]) H[j * N + i] = h;
      }
    }
  };
  for (const l of lines) {
    const P = l.pts, m = P.length;
    for (let i = 0; i < (l.closed ? m : m - 1); i++) { const a = P[i], b = P[(i + 1) % m]; seg(a[0], a[1], b[0], b[1], l.w); }
  }
  return H;
}

// bilinear reading of the map at (x, y) in [-1, 1]^2
export function sampler(H, N) {
  return (x, y) => {
    const u = Math.min(N - 1.0001, Math.max(0, (x + 1) / 2 * (N - 1))), v = Math.min(N - 1.0001, Math.max(0, (y + 1) / 2 * (N - 1)));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * N + i;
    return (H[o] * (1 - fu) + H[o + 1] * fu) * (1 - fv) + (H[o + N] * (1 - fu) + H[o + N + 1] * fu) * fv;
  };
}

/* ------------------------------------------------------- the polar disc -- */

// a closed disc of radius R mm: the top at z = base + top(x, y) on rings of
// vertices about h mm apart (each ring stitched to the next by angle), a
// flat bottom at z = 0 and a vertical wall; counterclockwise from outside
export function disc(R, h, base, top) {
  const NR = Math.max(2, Math.ceil(R / h)), pos = [], idx = [], rings = [];
  pos.push(0, 0, base + top(0, 0));
  rings.push([0]);
  for (let i = 1; i <= NR; i++) {
    const r = R * i / NR, n = Math.max(8, Math.ceil(TAU * r / h)), ring = [];
    for (let j = 0; j < n; j++) {
      const a = TAU * j / n, x = r * Math.cos(a), y = r * Math.sin(a);
      ring.push(pos.length / 3); pos.push(x, y, base + top(x, y));
    }
    rings.push(ring);
  }
  const R1 = rings[1];
  for (let j = 0; j < R1.length; j++) idx.push(0, R1[j], R1[(j + 1) % R1.length]);
  for (let i = 1; i < NR; i++) {
    const A = rings[i], B = rings[i + 1], na = A.length, nb = B.length;
    let a = 0, b = 0;
    while (a < na || b < nb) {
      const ta = (a + 1) / na, tb = (b + 1) / nb;
      if (b >= nb || (a < na && ta <= tb)) { idx.push(A[a % na], B[b % nb], A[(a + 1) % na]); a++; }
      else { idx.push(A[a % na], B[b % nb], B[(b + 1) % nb]); b++; }
    }
  }
  const O = rings[NR], n = O.length, c = pos.length / 3;
  pos.push(0, 0, 0);
  const bot = [];
  for (let j = 0; j < n; j++) { bot.push(pos.length / 3); pos.push(pos[3 * O[j]], pos[3 * O[j] + 1], 0); }
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    idx.push(c, bot[k], bot[j]);
    idx.push(bot[j], bot[k], O[k], bot[j], O[k], O[j]);
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

/* ------------------------------------------------------------ the solid -- */

// o: { seed, n, k, curve, glyphs, size (diameter, mm), line (width, mm),
// height (of the relief, mm), base (mm), res ('draft' | 'fine' | 'screen') }
export function solid(o = {}, progress) {
  const { size = 80, line = 1, height = 1.2, base = 2.4, res = 'draft' } = o;
  const R = size / 2, flank = 0.35, k = R - line;
  const px = res === 'fine' ? 0.12 : res === 'screen' ? 0.35 : 0.2, h = res === 'fine' ? 0.22 : res === 'screen' ? 0.6 : 0.32;
  const N = Math.ceil(size / px) + 1;
  // the design on radius R - line, so that the outer ring stays on the disc
  const lines = design(o).map(l => ({ ...l, pts: l.pts.map(([x, y]) => [x * k / R, y * k / R]) }));
  const H = relief(lines, N, line / 2 / R, flank / R);
  if (progress) progress(0.5);
  const S = sampler(H, N), m = disc(R, h, base, (x, y) => height * S(x / R, y / R));
  if (progress) progress(1);
  m.dims = [size, size, base + height];
  return m;
}

export const fileName = o => `magic_circle_${o.n}_${o.k}_${o.curve}_s${o.seed}_${o.size}mm`;

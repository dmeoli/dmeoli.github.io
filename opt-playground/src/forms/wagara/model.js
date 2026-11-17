// Japanese patterns (wagara) as wallpaper groups: each pattern is a motif of
// a few segments in a fundamental domain, copied by the point group of its
// wallpaper group and by the translations of its lattice. The distance from
// a point to the lines is found by bringing the point back into one cell of
// the lattice and measuring to the copies near that cell; a relief of
// rounded ridges follows from the distance, on a seamless tile, a framed
// square or a round coaster.

import { heightfield } from '../../print/index.js';
import { disc } from '../magic-circles/model.js';

const S3 = Math.sqrt(3);

/* ----------------------------------------------------- the point groups -- */

// the dihedral group of order 2m about the origin, as 2 x 2 matrices: m
// rotations by 2 pi / m and m reflections in lines at angles pi j / m
function dihedral(m) {
  const out = [];
  for (let j = 0; j < m; j++) {
    const a = 2 * Math.PI * j / m, c = Math.cos(a), s = Math.sin(a);
    out.push([c, -s, s, c, 0, 0]);
    out.push([c, s, s, -c, 0, 0]);
  }
  return out;
}

// sampled arc as segments: centre (cx, cy), radius r, from angle a0 to a1
function arc(cx, cy, r, a0, a1, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = a0 + (a1 - a0) * i / n, v = a0 + (a1 - a0) * (i + 1) / n;
    out.push([cx + r * Math.cos(u), cy + r * Math.sin(u), cx + r * Math.cos(v), cy + r * Math.sin(v)]);
  }
  return out;
}

/* --------------------------------------------------------- the patterns -- */

// lattice [t1, t2]; rect: the smallest rectangle that repeats (a seamless
// tile is a whole number of them); ops: affine maps [a, b, c, d, e, f]
// taking (x, y) to (a x + b y + e, c x + d y + f); motif: segments
// [x1, y1, x2, y2] in the fundamental domain
const HEX = [[1, 0], [0.5, S3 / 2]];
export const PATTERNS = {
  asanoha: {
    en: 'asanoha (hemp leaf)', it: 'asanoha (foglia di canapa)', group: 'p6m', orbifold: '*632', lattice: HEX, rect: [1, S3], ops: dihedral(6),
    // half an edge of the triangular lattice, and the spoke from a lattice
    // point to the centre of a triangle
    motif: () => [[0, 0, 0.5, 0], [0, 0, 0.5, S3 / 6]],
    domain: [[0, 0], [0.5, 0], [0.5, S3 / 6]],
  },
  kikko: {
    en: 'kikkō (tortoise shell)', it: 'kikkō (guscio di tartaruga)', group: 'p6m', orbifold: '*632', lattice: HEX, rect: [1, S3], ops: dihedral(6),
    // half a side of the hexagon around a lattice point, and of a smaller
    // hexagon inside it
    motif: ({ inner = 0.72 } = {}) => [[0.5, 0, 0.5, S3 / 6], ...(inner > 0 ? [[0.5 * inner, 0, 0.5 * inner, S3 / 6 * inner]] : [])],
    domain: [[0, 0], [0.5, 0], [0.5, S3 / 6]],
  },
  kagome: {
    en: 'kagome (basket weave)', it: 'kagome (intreccio di cesto)', group: 'p6m', orbifold: '*632', lattice: HEX, rect: [1, S3], ops: dihedral(6),
    // half a side of a small triangle, between midpoints of lattice edges
    motif: () => [[0.5, 0, 0.375, S3 / 8]],
    domain: [[0, 0], [0.5, 0], [0.5, S3 / 6]],
  },
  shippo: {
    en: 'shippō (seven treasures)', it: 'shippō (sette tesori)', group: 'p4m', orbifold: '*442', lattice: [[1, 0], [0, 1]], rect: [1, 1], ops: dihedral(4),
    // an eighth of the circle around a lattice point and of the circle
    // around the centre of the square, both of radius 1/2
    motif: () => [...arc(0, 0, 0.5, 0, Math.PI / 4), ...arc(0.5, 0.5, 0.5, 1.25 * Math.PI, 1.5 * Math.PI)],
    domain: [[0, 0], [0.5, 0], [0.5, 0.5]],
  },
  yabane: {
    en: 'yabane (arrow feathers)', it: 'yabane (penne di freccia)', group: 'pmg', orbifold: '22*', lattice: [[1, 0], [0, 0.25]], rect: [1, 0.25],
    // the mirror x -> 1/2 - x, the half turn about the origin, and the glide
    ops: [[1, 0, 0, 1, 0, 0], [-1, 0, 0, -1, 0, 0], [1, 0, 0, -1, 0.5, 0], [-1, 0, 0, 1, 0.5, 0]],
    // the left arm of a chevron and the edge of its column
    motif: () => [[0, 0, 0.25, 0.1], [0, 0, 0, 0.125]],
    domain: [[0, 0], [0.25, 0], [0.25, 0.125], [0, 0.125]],
  },
  seigaiha: {
    en: 'seigaiha (blue waves)', it: 'seigaiha (onde blu)', group: 'cm', orbifold: '*×', lattice: [[1, 0], [0.5, 0.25]], rect: [1, 0.5], ops: [[1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, 0, 0]],
    // fans of concentric arcs; each fan hides the upper rows (see waves below)
    motif: ({ rings = 4 } = {}) => Array.from({ length: rings }, (_, m) => arc(0, 0, 0.5 * (1 - m / rings), Math.PI / 2, Math.PI, 8)).flat(),
    domain: [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]],
  },
};

// the segments of the motif copied by the point group and by the
// translations i t1 + j t2 that can reach the cell [0, 1)^2 of the lattice
export function orbit(P, o = {}) {
  const out = [], seen = new Set(), [t1, t2] = P.lattice;
  for (const [a, b, c, d, e, f] of P.ops) for (const [x1, y1, x2, y2] of P.motif(o)) {
    const s = [a * x1 + b * y1 + e, c * x1 + d * y1 + f, a * x2 + b * y2 + e, c * x2 + d * y2 + f];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 3; j++) {
      const dx = i * t1[0] + j * t2[0], dy = i * t1[1] + j * t2[1];
      const q = [s[0] + dx, s[1] + dy, s[2] + dx, s[3] + dy];
      const key = q.map(v => v.toFixed(4)).join(',') , rev = [q[2], q[3], q[0], q[1]].map(v => v.toFixed(4)).join(',');
      if (seen.has(key) || seen.has(rev)) continue;
      // keep what comes within 0.75 of the cell
      const cx = (t1[0] + t2[0]) / 2, cy = (t1[1] + t2[1]) / 2, R = Math.hypot(t1[0] + t2[0], t1[1] + t2[1]) / 2 + Math.hypot(t1[0] - t2[0], t1[1] - t2[1]) / 2 + 0.75;
      if (Math.min(Math.hypot(q[0] - cx, q[1] - cy), Math.hypot(q[2] - cx, q[3] - cy)) > R) continue;
      seen.add(key); out.push(q);
    }
  }
  return out;
}

// the distance from (x, y) to the lines of the pattern, both in units of the
// lattice; for seigaiha, the distance to the arcs of the fan on top
export function distance(P, o = {}) {
  const [t1, t2] = P.lattice, det = t1[0] * t2[1] - t1[1] * t2[0];
  const reduce = (x, y) => {
    let u = (x * t2[1] - y * t2[0]) / det, v = (t1[0] * y - t1[1] * x) / det;
    u -= Math.floor(u); v -= Math.floor(v);
    return [u * t1[0] + v * t2[0], u * t1[1] + v * t2[1]];
  };
  if (P === PATTERNS.seigaiha) {
    const rings = o.rings || 4;
    return (x, y) => {
      // the fan of the lowest centre that covers the point is drawn last
      const [px, py] = reduce(x, y);
      let best = null;
      for (let j = -1; j <= 4; j++) for (let i = -2; i <= 2; i++) {
        const cx = i + 0.5 * j, cy = 0.25 * j, r = Math.hypot(px - cx, py - cy);
        if (py >= cy - 1e-9 && r <= 0.5 && (!best || cy < best[1])) best = [cx, cy, r];
      }
      if (!best) return 1;
      const r = best[2];
      let d = Infinity;
      for (let m = 0; m < rings; m++) d = Math.min(d, Math.abs(r - 0.5 * (1 - m / rings)));
      return d;
    };
  }
  const segs = orbit(P, o), n = segs.length, A = Float64Array.from(segs.flat());
  return (x, y) => {
    const [px, py] = reduce(x, y);
    let best = Infinity;
    for (let k = 0; k < 4 * n; k += 4) {
      const ax = A[k], ay = A[k + 1], ex = A[k + 2] - ax, ey = A[k + 3] - ay, wx = px - ax, wy = py - ay;
      const l2 = ex * ex + ey * ey, t = l2 > 0 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / l2)) : 0;
      const dx = wx - t * ex, dy = wy - t * ey, d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
}

/* ------------------------------------------------------------- the tile -- */

// the size of the tile in units of the lattice: nx rectangles across, and as
// many down as make it closest to a square
export function tileUnits(P, repeats) {
  const [rx, ry] = P.rect, ny = Math.max(1, Math.round(repeats * rx / ry));
  return [repeats * rx, ny * ry];
}

// o: { pattern, repeats, rings, inner, shape ('tile' | 'square' | 'round'),
// size (mm, the width), line (mm), height (mm, of the relief), base (mm),
// border (mm), res ('draft' | 'fine' | 'screen') }
export function solid(o = {}, progress) {
  const { pattern = 'asanoha', repeats = 4, shape = 'tile', size = 90, line = 1.2, height = 1.2, base = 2.4, border = 4, res = 'draft' } = o;
  const P = PATTERNS[pattern] || PATTERNS.asanoha, D = distance(P, o);
  const [W, Hh] = tileUnits(P, repeats);
  const k = size / W, half = line / 2, flank = 0.35;
  const rise = d => Math.max(0, Math.min(1, (half + flank / 2 - d) / flank));
  const px = res === 'fine' ? 0.15 : res === 'screen' ? 0.5 : 0.25;
  // the pattern centred on the tile, in mm
  const at = (x, y) => height * rise(D(x / k, y / k) * k);
  if (shape === 'round') {
    const R = size / 2, rim = Math.max(border, line);
    const m = disc(R, px * 1.4, base, (x, y) => (Math.hypot(x, y) > R - rim ? height : at(x + size * 0.5, y + size * 0.5)));
    m.dims = [size, size, base + height];
    return m;
  }
  const Wmm = size, Hmm = Hh * k, nx = Math.ceil(Wmm / px) + 1, ny = Math.ceil(Hmm / px) + 1, dx = Wmm / (nx - 1), dy = Hmm / (ny - 1);
  const H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * dx, y = j * dy;
      const edge = Math.min(x, y, Wmm - x, Hmm - y);
      H[j * nx + i] = shape === 'square' && edge < border ? height : at(x, y);
    }
    if (progress && (j & 31) === 0) progress(j / ny);
  }
  const m = heightfield(H, nx, ny, { dx, dy, base });
  m.dims = [Wmm, Hmm, base + height];
  return m;
}

export const fileName = o => `wagara_${o.pattern}_${o.shape}_${o.repeats}x_${o.size}mm`;

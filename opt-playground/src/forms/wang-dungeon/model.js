// Wang-tile dungeon: a set of Wang tiles (Cohen, Shade, Hiller and Deussen
// 2003) whose edge colors are the positions of the doors, the interior of each
// tile filled by cellular-automaton caves (Johnson, Yannakakis and Togelius
// 2010) or by the simple tiled model of wave function collapse (Gumin 2016),
// a dungeon laid by scanline with tiles that match their north and west
// neighbors, and the relief tiles as solids in millimetres.

import { merge } from '../../print/index.js';
import { rng, columns, unpinch } from '../fantasy/util.js';

export const N = 12;                 // cells per side of a tile
export const DOOR = [4, 7];          // the cell of the door for color 0 and 1

// the tiles as [n, e, s, w] colors. The set of 8 is that of Cohen et al.: two
// colors on the horizontal edges and two on the vertical ones, and for each
// pair of north and west colors two tiles, so that the scanline always has a
// choice; the set of 16 holds every combination.
export function tileSet(kind) {
  const T = [];
  if (kind === 'full16') {
    for (let k = 0; k < 16; k++) T.push([k & 1, (k >> 1) & 1, (k >> 2) & 1, (k >> 3) & 1]);
    return T;
  }
  for (const n of [0, 1]) for (const w of [0, 1]) {
    const se = n === w ? [[0, 0], [1, 1]] : [[0, 1], [1, 0]];
    for (const [s, e] of se) T.push([n, e, s, w]);
  }
  return T;
}

// the dungeon: rows x cols indices into the set, by scanline, each tile drawn
// among those whose north color equals the south color of the tile above and
// whose west color equals the east color of the tile on its left
export function layout({ seed = 1, set = 'cohen8', cols = 5, rows = 4 }) {
  const T = tileSet(set), r = rng(seed * 7919 + 13), D = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const up = j > 0 ? T[D[(j - 1) * cols + i]][2] : -1, left = i > 0 ? T[D[j * cols + i - 1]][1] : -1;
    const ok = T.map((t, k) => k).filter(k => (up < 0 || T[k][0] === up) && (left < 0 || T[k][3] === left));
    D.push(r.pick(ok));
  }
  return D;
}

const idx = (i, j) => j * N + i;

// the border of a tile: walls, but for the doors of its four colors (and the
// cell inside each door); fixed marks the cells that the fill may not change
function border([n, e, s, w]) {
  const G = new Uint8Array(N * N), fixed = new Uint8Array(N * N), doors = [];
  for (let k = 0; k < N; k++) for (const q of [idx(k, 0), idx(k, N - 1), idx(0, k), idx(N - 1, k)]) { G[q] = 1; fixed[q] = 1; }
  // y grows to the north: row N - 1 is the north edge
  const open = (i, j, ii, jj) => { G[idx(i, j)] = 0; G[idx(ii, jj)] = 0; fixed[idx(ii, jj)] = 1; doors.push(idx(ii, jj)); };
  open(DOOR[n], N - 1, DOOR[n], N - 2);
  open(DOOR[s], 0, DOOR[s], 1);
  open(N - 1, DOOR[e], N - 2, DOOR[e]);
  open(0, DOOR[w], 1, DOOR[w]);
  return { G, fixed, doors };
}

// Johnson et al.: rock with probability 1/2, then four steps in which a
// cell becomes rock when at least 5 of the 9 cells around it (itself
// included) are rock
function caves(G, fixed, r, fill = 0.5) {
  for (let q = 0; q < N * N; q++) if (!fixed[q]) G[q] = r() < fill ? 1 : 0;
  for (let it = 0; it < 4; it++) {
    const H = G.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (fixed[idx(i, j)]) continue;
      let c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) c += G[idx(i + a, j + b)];
      H[idx(i, j)] = c >= 5 ? 1 : 0;
    }
    G.set(H);
  }
}

// wave function collapse, simple tiled model, on 4 x 4 blocks of 3 x 3 cells:
// a module is a corridor or a room with a mask of open sides (N, E, S, W =
// bits 0..3), two blocks side by side must agree on their common side, and
// the sides on the border of the tile are open only at the doors. Since every
// mask exists, propagation never reaches a contradiction.
const MOD = [];
for (let m = 0; m < 16; m++) {
  const k = [0, 1, 2, 3].filter(b => m >> b & 1).length;
  MOD.push({ m, room: false, w: [3, 0.5, 2, 1.5, 1][k] * (k === 2 && (m === 5 || m === 10) ? 0.8 : 1) });
}
for (let m = 1; m < 16; m++) MOD.push({ m, room: true, w: 0.35 });
const OPP = [2, 3, 0, 1], DX = [0, 1, 0, -1], DY = [1, 0, -1, 0];
function wfc(G, fixed, r, sides) {
  const B = 4, opts = Array.from({ length: B * B }, () => MOD.map(() => true));
  const allow = (c, side, open) => { opts[c].forEach((v, k) => { if (v && ((MOD[k].m >> side & 1) === 1) !== open) opts[c][k] = false; }); };
  // the border: on each edge, open only at the block that holds the door
  for (let bj = 0; bj < B; bj++) for (let bi = 0; bi < B; bi++) {
    const c = bj * B + bi;
    if (bj === B - 1) allow(c, 0, sides[0] === bi);
    if (bi === B - 1) allow(c, 1, sides[1] === bj);
    if (bj === 0) allow(c, 2, sides[2] === bi);
    if (bi === 0) allow(c, 3, sides[3] === bj);
  }
  const propagate = start => {
    const stack = [start];
    while (stack.length) {
      const c = stack.pop(), ci = c % B, cj = (c / B) | 0;
      for (let s = 0; s < 4; s++) {
        const ni = ci + DX[s], nj = cj + DY[s];
        if (ni < 0 || nj < 0 || ni >= B || nj >= B) continue;
        const nb = nj * B + ni;
        const can = [false, false];
        opts[c].forEach((v, k) => { if (v) can[MOD[k].m >> s & 1] = true; });
        let changed = false;
        opts[nb].forEach((v, k) => { if (v && !can[MOD[k].m >> OPP[s] & 1]) { opts[nb][k] = false; changed = true; } });
        if (changed) stack.push(nb);
      }
    }
  };
  for (let c = 0; c < B * B; c++) propagate(c);
  for (;;) {
    // the cell of least entropy (fewest options, ties broken at random)
    let best = -1, bv = Infinity;
    for (let c = 0; c < B * B; c++) {
      const n = opts[c].filter(Boolean).length;
      if (n > 1 && n + r() * 0.5 < bv) { bv = n + r() * 0.5; best = c; }
    }
    if (best < 0) break;
    const ks = opts[best].map((v, k) => (v ? k : -1)).filter(k => k >= 0);
    let x = r() * ks.reduce((s, k) => s + MOD[k].w, 0), pick = ks[0];
    for (const k of ks) { x -= MOD[k].w; if (x <= 0) { pick = k; break; } }
    opts[best] = opts[best].map((_, k) => k === pick);
    propagate(best);
  }
  // each block drawn in its 3 x 3 cells
  for (let bj = 0; bj < B; bj++) for (let bi = 0; bi < B; bi++) {
    const k = opts[bj * B + bi].indexOf(true), { m, room } = MOD[k];
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const q = idx(3 * bi + a, 3 * bj + b);
      if (fixed[q]) continue;
      let floor;
      const side = b === 2 ? 0 : a === 2 ? 1 : b === 0 ? 2 : a === 0 ? 3 : -1;
      if (room) {
        // the ring of a room is open only on its open sides
        const sx = a === 0 ? 3 : a === 2 ? 1 : -1, sy = b === 0 ? 2 : b === 2 ? 0 : -1;
        floor = (sx < 0 || (m >> sx & 1)) && (sy < 0 || (m >> sy & 1));
      } else if (a === 1 && b === 1) floor = m > 0;
      else if ((a === 1 || b === 1) && side >= 0) floor = (m >> side & 1) === 1;
      else floor = false;
      G[q] = floor ? 0 : 1;
    }
  }
}

// the floor made one region holding all the doors: floor not reached from a
// door is filled, and the regions of the doors are joined by the cheapest
// paths through rock (0-1 breadth-first search)
function connect(G, fixed, doors) {
  const comp = () => {
    const C = new Int32Array(N * N).fill(-1);
    let n = 0;
    for (const d of doors) {
      if (C[d] >= 0) continue;
      const st = [d]; C[d] = n;
      while (st.length) {
        const q = st.pop(), i = q % N, j = (q / N) | 0;
        for (let s = 0; s < 4; s++) {
          const ii = i + DX[s], jj = j + DY[s];
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const p = idx(ii, jj);
          if (G[p] === 0 && C[p] < 0) { C[p] = n; st.push(p); }
        }
      }
      n++;
    }
    return { C, n };
  };
  for (let guard = 0; guard < 8; guard++) {
    const { C, n } = comp();
    if (n <= 1) { for (let q = 0; q < N * N; q++) if (G[q] === 0 && C[q] < 0) G[q] = 1; return; }
    // from region 0 to the nearest other region
    const D = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), dq = [];
    for (let q = 0; q < N * N; q++) if (C[q] === 0) { D[q] = 0; dq.push(q); }
    let hit = -1;
    while (dq.length) {
      const q = dq.shift(), i = q % N, j = (q / N) | 0;
      if (C[q] > 0) { hit = q; break; }
      for (let s = 0; s < 4; s++) {
        const ii = i + DX[s], jj = j + DY[s];
        if (ii < 1 || jj < 1 || ii >= N - 1 || jj >= N - 1) continue;
        const p = idx(ii, jj), w = G[p] === 1 ? 1 : 0;
        if (D[q] + w < D[p]) { D[p] = D[q] + w; from[p] = q; if (w) dq.push(p); else dq.unshift(p); }
      }
    }
    if (hit < 0) return;
    for (let q = hit; q >= 0 && C[q] !== 0; q = from[q]) if (!fixed[q] || G[q] === 0) G[q] = 0;
  }
}

// the cells of tile k of the set (1 wall, 0 floor)
export function tileCells(o, k) {
  const T = tileSet(o.set)[k], { G, fixed, doors } = border(T), r = rng((o.seed || 1) * 1009 + k * 101 + (o.fill === 'wfc' ? 7 : 0));
  if (o.fill === 'wfc') wfc(G, fixed, r, [DOOR[T[0]] === 4 ? 1 : 2, DOOR[T[1]] === 4 ? 1 : 2, DOOR[T[2]] === 4 ? 1 : 2, DOOR[T[3]] === 4 ? 1 : 2]);
  else caves(G, fixed, r, o.density ?? 0.5);
  connect(G, fixed, doors);
  unpinch(G, N, N, fixed);
  return G;
}

// one tile as a solid: floor of thickness base, walls `wall` mm above it
function tileMesh(G, side, base, wall, x0, y0) {
  const H = new Float32Array(N * N);
  for (let q = 0; q < N * N; q++) H[q] = G[q] ? base + wall : base;
  return columns(H, N, N, side / N, x0, y0);
}

// o: seed, set, fill, cols, rows, what ('dungeon' or 'set'), size (side of a
// tile, mm), wall (mm), base (mm), gap (between printed tiles, mm)
export function solid(o, progress) {
  const side = o.size || 40, base = o.base ?? 2.4, wall = o.wall ?? 10, gap = o.what === 'dungeon' ? 0.6 : (o.gap ?? 4);
  const set = tileSet(o.set), cells = set.map((_, k) => tileCells(o, k));
  const ms = [];
  if (o.what === 'dungeon') {
    const D = layout(o);
    for (let j = 0; j < o.rows; j++) for (let i = 0; i < o.cols; i++) {
      ms.push(tileMesh(cells[D[j * o.cols + i]], side, base, wall, i * (side + gap), j * (side + gap)));
      if (progress) progress((j * o.cols + i + 1) / (o.rows * o.cols));
    }
  } else {
    const c = Math.ceil(Math.sqrt(set.length));
    set.forEach((_, k) => ms.push(tileMesh(cells[k], side, base, wall, (k % c) * (side + gap), -Math.floor(k / c) * (side + gap))));
  }
  const m = merge(...ms);
  m.tiles = ms.length;
  return m;
}

export const fileName = o => `wang_dungeon_${o.what}_${o.set}_${o.fill}_s${o.seed}_${o.size}mm`;

// Island carved by erosion: the stream power law of geomorphology on a grid,
// as in the terrains of Cordonnier et al. (2016),
//   dh/dt = U(x) - K A(x)^m |grad h|,
// where U is the uplift, A the drainage area (the area whose water flows
// through x) and K the erodibility; n = 1, m = 0.5. Each step routes the
// water by a priority flood from the sea (Barnes et al. 2014), so that every
// cell drains to the sea through one receiver even across depressions, sums
// the areas down the tree and updates the heights implicitly from the sea up
// (Braun and Willett 2013), a step that is stable for any time step. A small
// hillslope diffusion rounds the ridges. No DOM: the model runs in workers.

import { heightfield } from '../../print/index.js';
import { rng } from '../fantasy/util.js';

export const DEFAULTS = { seed: 7, steps: 200, K: 2, m: 0.5, uplift: 1, rough: 0.5, n: 160 };

// a value noise with smooth interpolation, summed over octaves (fBm)
function noise2(seed) {
  const r = rng(seed), P = new Float64Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (i, j) => P[(((i * 73856093) ^ (j * 19349663)) >>> 0) % 512];
  const s = t => t * t * (3 - 2 * t);
  const v = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = s(x - i), fy = s(y - j);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, oct = 5) => { let f = 0, w = 0.5, k = 1; for (let o = 0; o < oct; o++) { f += w * v(x * k + 17 * o, y * k - 31 * o); w *= 0.5; k *= 2; } return f; };
}

// the uplift of the island: a blob of a few bumps from the seed, warped by
// noise; cells where it is not positive are sea, held at height 0
export function upliftMap({ seed, rough, n, uplift }) {
  const N = noise2(seed), r = rng(seed * 31 + 5), U = new Float64Array(n * n);
  const bumps = Array.from({ length: 3 + r.int(4) }, () => ({ x: r.range(0.3, 0.7), y: r.range(0.3, 0.7), s: r.range(0.16, 0.28), w: r.range(0.6, 1.1) }));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i / (n - 1), y = j / (n - 1);
    const wx = x + 0.16 * (N(2.5 * x, 2.5 * y) - 0.5), wy = y + 0.16 * (N(2.5 * x + 9, 2.5 * y + 4) - 0.5);
    let b = 0;
    for (const q of bumps) b = Math.max(b, q.w * Math.exp(-((wx - q.x) ** 2 + (wy - q.y) ** 2) / (2 * q.s * q.s)));
    const edge = Math.min(x, y, 1 - x, 1 - y), win = Math.min(1, edge / 0.12);
    const v = (b + rough * 0.7 * (N(5 * x, 5 * y) - 0.5)) * win - 0.3;
    U[j * n + i] = edge * n < 2 ? 0 : Math.max(0, v) * uplift;
  }
  return U;
}

// a binary heap of cells keyed by height
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// the evolution: n x n cells of side 1/n of the island, `steps` steps of dt;
// returns heights H, drainage areas A, receivers R and the order of the
// cells from the sea up (stack)
export function erode(o, progress) {
  const q = { ...DEFAULTS, ...o }, n = q.n, N = n * n, dx = 1 / n;
  const U = upliftMap(q), H = new Float64Array(N), A = new Float64Array(N), R = new Int32Array(N);
  const stack = new Int32Array(N), seen = new Uint8Array(N), heap = new Heap(8 * N);
  const sea = i => U[i] <= 0;
  const r = rng(q.seed * 7 + 1);
  for (let i = 0; i < N; i++) H[i] = sea(i) ? 0 : 1e-3 * r();
  const dt = 0.006, K = q.K * 8, m = q.m, kd = 2e-5;
  let top = 0;
  for (let s = 0; s < q.steps; s++) {
    // the priority flood from the sea: a cell is reached from its lowest
    // reached neighbour, which becomes its receiver
    seen.fill(0); heap.n = 0; top = 0;
    for (let i = 0; i < N; i++) if (sea(i)) { seen[i] = 1; R[i] = i; stack[top++] = i; }
    for (let i = 0; i < N; i++) if (sea(i)) {
      const x = i % n, y = (i / n) | 0;
      for (const [ax, ay] of D8) {
        const X = x + ax, Y = y + ay;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const k = Y * n + X;
        if (!seen[k]) { seen[k] = 1; R[k] = i; heap.push(H[k], k); }
      }
    }
    while (heap.n) {
      const i = heap.pop();
      stack[top++] = i;
      const x = i % n, y = (i / n) | 0;
      for (const [ax, ay] of D8) {
        const X = x + ax, Y = y + ay;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const k = Y * n + X;
        if (!seen[k]) { seen[k] = 1; R[k] = i; heap.push(Math.max(H[k], H[i] + 1e-9), k); }
      }
    }
    // the drainage area, summed from the summits down
    A.fill(dx * dx);
    for (let t = top - 1; t >= 0; t--) { const i = stack[t]; if (R[i] !== i) A[R[i]] += A[i]; }
    // uplift, and the implicit stream power update from the sea up
    for (let t = 0; t < top; t++) {
      const i = stack[t], j = R[i];
      if (j === i) continue;
      const hi = H[i] + dt * U[i];
      const L = ((i % n) !== (j % n) && ((i / n) | 0) !== ((j / n) | 0) ? Math.SQRT2 : 1) * dx;
      if (hi <= H[j]) { H[i] = hi; continue; }   // in a lake: no erosion
      const F = K * dt * Math.pow(A[i], m) / L;
      H[i] = (hi + F * H[j]) / (1 + F);
    }
    // hillslope diffusion, explicit and small
    if (kd > 0) {
      const H2 = H.slice(), c = kd * dt / (dx * dx);
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (sea(i)) continue;
        H2[i] = H[i] + c * (H[i - 1] + H[i + 1] + H[i - n] + H[i + n] - 4 * H[i]);
      }
      H.set(H2);
    }
    if (progress && (s & 7) === 0) progress(0.8 * s / q.steps);
  }
  return { H, A, R, U, n };
}

export function fileName(o) { return `erosion_island_seed${o.seed}_t${o.steps}_${o.mode || 'relief'}_${o.size}mm`; }

// o: the parameters of erode, mode ('relief' or 'lithophane'), size (mm,
// the side of the tile), height (mm, of the highest peak above the sea),
// base (mm), res ('preview', 'draft', 'fine')
export function solid(o, progress) {
  const res = o.res === 'fine' ? 256 : o.res === 'draft' ? 192 : 128;
  const q = { ...DEFAULTS, ...o, n: res };
  const { H, A, R, n } = erode(q, progress);
  let hmax = 0;
  for (let i = 0; i < H.length; i++) hmax = Math.max(hmax, H[i]);
  const size = o.size || 100, d = size / (n - 1);
  const Z = new Float64Array(n * n);
  let base, land = 0;
  if (o.mode === 'lithophane') {
    // thickness from 0.8 mm (the sea, brightest in the light) to 3.2 mm
    // (the peaks, darkest)
    base = 0.8;
    const rel = 2.4;
    for (let i = 0; i < n * n; i++) Z[i] = rel * Math.pow(H[i] / (hmax || 1), 0.8);
  } else {
    base = o.base ?? 3;
    for (let i = 0; i < n * n; i++) Z[i] = (o.height || 24) * H[i] / (hmax || 1);
  }
  for (let i = 0; i < n * n; i++) if (H[i] > 0) land++;
  const m = heightfield(Z, n, n, { dx: d, dy: d, base });
  m.dims = [size, size, base + Math.max(...Z)];
  m.land = land / (n * n);
  m.hmax = hmax;
  if (o.res === 'preview') { m.H = Array.from(H, v => v / (hmax || 1)); m.A = Array.from(A); m.R = Array.from(R); m.n = n; }
  if (progress) progress(1);
  return m;
}

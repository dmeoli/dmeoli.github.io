// A treasure chest as a recursive interlocking puzzle, after Song, Fu and
// Cohen-Or (SIGGRAPH Asia 2012). The chest is a small set of voxels; it is
// split into pieces P_1, ..., P_n so that in the assembly of P_i, ..., P_n
// the only part that can move is P_i, the key of that stage, which slides out
// along one direction d_i; once it is out, P_{i+1} is the key of the rest,
// and so on to the last two pieces. Pieces are grown by randomized rules in
// the spirit of the paper (each piece made of columns that run out of the
// remaining assembly along its direction, so that it can slide out), and a
// split is kept only when the exact test on the blocking graphs below passes
// at every stage; otherwise the next try is drawn. No DOM: runs in workers.

import { implicitSolid, merge, transform, onBed, bounds } from '../../print/index.js';
import { rng } from '../robots/model.js';

export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const DIRNAMES = ['+x', '−x', '+y', '−y', '+z', '−z'];

// the chests: a box and an arched lid one layer high, x across, y deep, z up
export const SHAPES = { small: [5, 4, 4], large: [6, 4, 4] };
export function chest(shape) {
  const [nx, ny, nz] = SHAPES[shape] || SHAPES.small, V = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    if (k < nz - 1 || (j > 0 && j < ny - 1)) V[(k * ny + j) * nx + i] = 1;
  return { nx, ny, nz, V };
}

/* --------------------------------------------------- blocking and tests -- */

// lab[c] = piece of the cell c (or -1); the directed blocking graph of
// direction d: piece a -> piece b when a moved by one cell along d would
// enter b. Returns an array of Sets.
function blocking(G, lab, n, d) {
  const { nx, ny, nz } = G, out = Array.from({ length: n }, () => new Set());
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = lab[(k * ny + j) * nx + i];
    if (a < 0) continue;
    const i2 = i + d[0], j2 = j + d[1], k2 = k + d[2];
    if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= nx || j2 >= ny || k2 >= nz) continue;
    const b = lab[(k2 * ny + j2) * nx + i2];
    if (b >= 0 && b !== a) out[a].add(b);
  }
  return out;
}

// the pieces reachable from p (its closure: what must move with p along d)
function closure(E, p) {
  const seen = new Set([p]), stack = [p];
  while (stack.length) for (const q of E[stack.pop()]) if (!seen.has(q)) { seen.add(q); stack.push(q); }
  return seen;
}

// can piece `key` slide along d to infinity without meeting another piece?
function slidesOut(G, lab, key, d) {
  const { nx, ny, nz } = G;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (lab[(k * ny + j) * nx + i] !== key) continue;
    for (let s = 1; ; s++) {
      const i2 = i + s * d[0], j2 = j + s * d[1], k2 = k + s * d[2];
      if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= nx || j2 >= ny || k2 >= nz) break;
      const b = lab[(k2 * ny + j2) * nx + i2];
      if (b >= 0 && b !== key) return false;
    }
  }
  return true;
}

// the exact test of one stage: in the assembly of the pieces `alive` (labels
// in lab, -1 elsewhere), with key `key`, (i) the key slides out along d, and
// (ii) for every direction e and every other piece p, the closure of p in
// the blocking graph of e holds every piece but possibly the key, i.e., the
// only sets of pieces that can move along e are {key} and the rest (which
// is the key moving along -e). Returns the directions of (ii) that fail, or
// [] when the stage is interlocked.
export function stageTest(G, lab, alive, key, d) {
  const n = Math.max(...alive) + 1, bad = [];
  if (!slidesOut(G, lab, key, DIRS[d])) bad.push('key');
  for (let e = 0; e < 6; e++) {
    const E = blocking(G, lab, n, DIRS[e]);
    for (const p of alive) {
      if (p === key) continue;
      const C = closure(E, p);
      if (alive.some(q => q !== key && !C.has(q))) { bad.push(e); break; }
    }
  }
  return bad;
}

// every stage of a split: pieces[i] the cells of P_i, dirs[i] its direction
export function fullTest(G, pieces, dirs) {
  const lab = new Int32Array(G.V.length).fill(-1);
  pieces.forEach((P, i) => { for (const c of P) lab[c] = i; });
  const report = [];
  for (let i = 0; i + 1 < pieces.length; i++) {
    const alive = pieces.map((_, j) => j).filter(j => j >= i);
    report.push(stageTest(G, lab, alive, i, dirs[i]));
    for (const c of pieces[i]) lab[c] = -1;
  }
  return report;
}

/* ----------------------------------------------------- growing a piece -- */

const conn = (G, set) => {
  // is the set of cells 6-connected?
  if (!set.size) return true;
  const { nx, ny } = G, first = set.values().next().value, seen = new Set([first]), st = [first];
  while (st.length) {
    const c = st.pop(), i = c % nx, j = Math.floor(c / nx) % ny;
    for (const [dx, dy, dz] of DIRS) {
      if ((dx === 1 && i === nx - 1) || (dx === -1 && i === 0) || (dy === 1 && j === ny - 1) || (dy === -1 && j === 0)) continue;
      const q = c + dx + dy * nx + dz * nx * ny;
      if (set.has(q) && !seen.has(q)) { seen.add(q); st.push(q); }
    }
  }
  return seen.size === set.size;
};

// the column of the cell c along d inside `rest`: c, c + d, ... while in
// rest; null if past its end the ray meets rest again (it could not slide)
function column(G, rest, c, d) {
  const { nx, ny, nz } = G, D = DIRS[d], col = [];
  let i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny)), inside = true;
  for (;;) {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return col;
    const q = (k * ny + j) * nx + i;
    if (rest.has(q)) { if (!inside) return null; col.push(q); } else inside = false;
    i += D[0]; j += D[1]; k += D[2];
  }
}

// a piece grown in rest: a seed column along d, then columns of neighbouring
// cells added at random, each with its whole column, while the piece stays
// below `size` cells and both the piece and the rest stay connected; the
// steps of different heights between its columns are what may block it in
// the other directions, which only the test decides
function grow(G, rest, size, R) {
  const { nx, ny } = G;
  for (let tries = 0; tries < 30; tries++) {
    const d = Math.floor(R() * 6);
    const cells = [...rest], c0 = cells[Math.floor(R() * cells.length)];
    const col0 = column(G, rest, c0, d);
    if (!col0 || !col0.length) continue;
    const P = new Set(col0);
    for (let guard = 0; P.size < size && guard < 40; guard++) {
      const from = [...P][Math.floor(R() * P.size)], e = DIRS[Math.floor(R() * 6)];
      const i = from % nx + e[0], j = Math.floor(from / nx) % ny + e[1];
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const q = from + e[0] + e[1] * nx + e[2] * nx * ny;
      if (!rest.has(q) || P.has(q)) continue;
      const col = column(G, rest, q, d);
      if (!col || P.size + col.length > size + 2) continue;
      const P2 = new Set([...P, ...col]), R2 = new Set([...rest].filter(x => !P2.has(x)));
      if (R2.size && conn(G, P2) && conn(G, R2)) col.forEach(x => P.add(x));
    }
    const restAfter = new Set([...rest].filter(x => !P.has(x)));
    if (P.size >= 3 && conn(G, P) && conn(G, restAfter)) return { P, d };
  }
  return null;
}

// the order of disassembly of a labelling of the cells into n pieces,
// chosen greedily: at each stage the key and its direction with the lowest
// stage score, which is 6 if the key cannot slide out along its direction,
// plus, for every direction e and every other piece p, the number of pieces
// besides the key that p would leave behind moving along e (the closure of
// p in the blocking graph of e); a stage scores 0 exactly when it passes
// stageTest(). Returns { order, dirs, score } (score 0: every stage passes)
function sequence(G, lab0, n) {
  const lab = Int32Array.from(lab0), alive = [...Array(n).keys()], order = [], dirs = [];
  let score = 0;
  while (alive.length > 1) {
    const Cl = DIRS.map(e => { const E = blocking(G, lab, n, e); return alive.map(p => closure(E, p)); });
    let best = null;
    alive.forEach((key, ki) => {
      let v = 0;
      if (alive.length > 2) for (let e = 0; e < 6; e++) alive.forEach((p, pi) => {
        if (p === key) return;
        for (const q of alive) if (q !== key && !Cl[e][pi].has(q)) v++;
      });
      if (best && v >= best[0]) return;
      let d = -1;
      for (let k = 0; k < 6 && d < 0; k++) if (slidesOut(G, lab, key, DIRS[k])) d = k;
      const w = v + (d < 0 ? 6 : 0);
      if (!best || w < best[0]) best = [w, key, d < 0 ? 0 : d];
    });
    score += best[0]; order.push(best[1]); dirs.push(best[2]);
    alive.splice(alive.indexOf(best[1]), 1);
    for (let c = 0; c < lab.length; c++) if (lab[c] === best[1]) lab[c] = -1;
  }
  order.push(alive[0]); dirs.push(-1);
  return { order, dirs, score };
}

// the cells of piece a, connected?
function pieceConn(G, lab, a) {
  const S = new Set();
  lab.forEach((x, c) => { if (x === a) S.add(c); });
  return S.size >= 2 && conn(G, S);
}

// the split of the chest into n pieces: a first split grown from the seed,
// then simulated annealing on moves of one cell from a piece to a
// neighbouring piece (keeping every piece connected and of 3 cells at
// least), until the total stage score is 0;
// { G, pieces (in the order of disassembly), dirs, tries, ok, report }
export function design(shape, n, seed, maxSteps = 20000) {
  const G = chest(shape), all = [], R = rng(seed * 100003 + 1);
  G.V.forEach((v, c) => { if (v) all.push(c); });
  let lab = null;
  for (let t = 0; t < 200 && !lab; t++) {
    let rest = new Set(all);
    const L = new Int32Array(G.V.length).fill(-1);
    let ok = true;
    for (let i = 0; i < n - 1 && ok; i++) {
      const g = grow(G, rest, Math.max(3, Math.round(rest.size / (n - i) * (0.7 + 0.5 * R()))), R);
      if (!g) { ok = false; break; }
      for (const c of g.P) L[c] = i;
      rest = new Set([...rest].filter(x => !g.P.has(x)));
    }
    if (ok && rest.size >= 3) { for (const c of rest) L[c] = n - 1; lab = L; }
  }
  if (!lab) throw new Error('no first split');
  const { nx, ny } = G, size = new Int32Array(n);
  lab.forEach(x => { if (x >= 0) size[x]++; });
  let cur = sequence(G, lab, n), steps = 0, best = { lab: Int32Array.from(lab), seq: cur };
  const cells = all.slice();
  // simulated annealing on the stage score: a worse split is taken with
  // probability exp(-increase / T), T falling from 1.5 to 0.05
  while (best.seq.score > 0 && steps < maxSteps) {
    const c = cells[Math.floor(R() * cells.length)], a = lab[c], e = DIRS[Math.floor(R() * 6)];
    const i = c % nx + e[0], j = Math.floor(c / nx) % ny + e[1];
    if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
    const q = c + e[0] + e[1] * nx + e[2] * nx * ny;
    if (q < 0 || q >= lab.length || lab[q] < 0 || lab[q] === a || size[a] <= 3) continue;
    const b = lab[q];
    lab[c] = b;
    if (!pieceConn(G, lab, a)) { lab[c] = a; continue; }
    steps++;
    const T = 1.5 * Math.pow(0.05 / 1.5, steps / maxSteps), nxt = sequence(G, lab, n);
    if (nxt.score <= cur.score || R() < Math.exp((cur.score - nxt.score) / T)) {
      cur = nxt; size[a]--; size[b]++;
      if (cur.score < best.seq.score) best = { lab: Int32Array.from(lab), seq: cur };
    } else lab[c] = a;
  }
  lab = best.lab; cur = best.seq;
  const pieces = cur.order.map(p => { const P = []; lab.forEach((x, k) => { if (x === p) P.push(k); }); return P; });
  const report = fullTest(G, pieces, cur.dirs);
  return { G, pieces, dirs: cur.dirs, tries: steps, ok: report.every(r => r.length === 0), report };
}

/* -------------------------------------------------------------- meshes -- */

const cellXYZ = (G, c) => [c % G.nx, Math.floor(c / G.nx) % G.ny, Math.floor(c / (G.nx * G.ny))];

// the faces of a piece on the voxel grid (unit cells), for the screen
export function pieceFaces(G, cells) {
  const S = new Set(cells), P = [], I = [];
  const quad = (a, b, c, d) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (const c of cells) {
    const [i, j, k] = cellXYZ(G, c);
    const has = (di, dj, dk) => {
      const a = i + di, b = j + dj, e = k + dk;
      return a >= 0 && b >= 0 && e >= 0 && a < G.nx && b < G.ny && e < G.nz && S.has((e * G.ny + b) * G.nx + a);
    };
    const x0 = i, x1 = i + 1, y0 = j, y1 = j + 1, z0 = k, z1 = k + 1;
    if (!has(1, 0, 0)) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (!has(-1, 0, 0)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!has(0, 1, 0)) quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (!has(0, -1, 0)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!has(0, 0, 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!has(0, 0, -1)) quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I) };
}

// the screen data of a design: the cells of every piece, its direction,
// and the result of the test, as plain fields beside an empty mesh (the
// shape of the answer of the worker of src/forms/mathematics)
export function screen(o) {
  const D = design(o.shape, o.n, o.seed);
  return { pos: new Float32Array(3), idx: new Uint32Array(3), nx: D.G.nx, ny: D.G.ny, nz: D.G.nz, pieces: D.pieces, dirs: D.dirs, tries: D.tries, ok: D.ok, fails: D.fails, report: D.report };
}

// the signed distance, in cells, of the union of the cells S (exact within
// one cell of the surface, which is all the shrink needs)
function voxelSDF(G, S) {
  const inn = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < G.nx && j < G.ny && k < G.nz && S.has((k * G.ny + j) * G.nx + i);
  return (x, y, z) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), me = inn(i, j, k);
    let best = 2;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (inn(i + di, j + dj, k + dk) === me) continue;
      const qx = Math.max(i + di - x, 0, x - (i + di + 1)), qy = Math.max(j + dj - y, 0, y - (j + dj + 1)), qz = Math.max(k + dk - z, 0, z - (k + dk + 1));
      best = Math.min(best, Math.hypot(qx, qy, qz));
    }
    return me ? -best : best;
  };
}

// the decoration of the chest, cut into its outer faces only (so that no
// piece gains material that could collide): two iron bands across the lid
// and the front, and a keyhole in the front; in cells, depth dep
function carving(G, whole, dep) {
  const xb = [0.75, G.nx - 0.75], zf = (G.nz - 1) * 0.55;
  return (x, y, z) => {
    const s = whole(x, y, z);
    if (s < -dep) return 1;
    let g = 1;
    for (const b of xb) g = Math.min(g, Math.abs(x - b) - 0.12);
    // the keyhole: a disc and a slot under it, on the face y = 0
    const kx = x - G.nx / 2, kz = z - zf;
    const key = Math.min(Math.hypot(kx, kz - 0.1) - 0.16, Math.max(Math.abs(kx) - 0.07, Math.abs(kz + 0.15) - 0.22));
    if (y < dep + 0.01) g = Math.min(g, key);
    return g;
  };
}

// o: { shape, n, seed, size (mm, the width of the chest), clearance (mm,
// between two pieces), res }. The pieces are laid on the bed each on the
// face that leaves the fewest cells without support below them.
export function solid(o, progress) {
  const D = design(o.shape, o.n, o.seed), G = D.G, v = (o.size || 60) / G.nx;
  const c = (o.clearance ?? 0.2) / v, h = (o.res === 'fine' ? 0.3 : 0.5) / v, dep = 0.6 / v;
  const all = new Set(D.pieces.flat()), whole = voxelSDF(G, all), carve = carving(G, whole, dep);
  const out = [];
  D.pieces.forEach((cells, n) => {
    const f0 = voxelSDF(G, new Set(cells)), f = (x, y, z) => Math.max(f0(x, y, z) + c / 2, -carve(x, y, z));
    const lo = [0, 1, 2].map(a => Math.min(...cells.map(q => cellXYZ(G, q)[a]))), hi = [0, 1, 2].map(a => Math.max(...cells.map(q => cellXYZ(G, q)[a])) + 1);
    const m = implicitSolid(f, [lo, hi], h, { crumbs: 0.2, progress: p => progress && progress((n + p) / D.pieces.length) });
    // the face to lie on: the axis turned down that leaves the fewest cells
    // with nothing of the piece below them
    const S = new Set(cells);
    let bestA = 5, bestU = Infinity;
    DIRS.forEach((e, a) => {
      let u = 0;
      for (const q of cells) {
        const [i, j, k] = cellXYZ(G, q), w = [i + e[0], j + e[1], k + e[2]];
        const ext = cells.map(p => cellXYZ(G, p)).reduce((m2, p) => Math.max(m2, p[0] * e[0] + p[1] * e[1] + p[2] * e[2]), -Infinity);
        const onBed = i * e[0] + j * e[1] + k * e[2] === ext;
        if (!onBed && !(w.every(x => x >= 0) && w[0] < G.nx && w[1] < G.ny && w[2] < G.nz && S.has((w[2] * G.ny + w[1]) * G.nx + w[0]))) u++;
      }
      if (u < bestU) { bestU = u; bestA = a; }
    });
    // turn so that DIRS[bestA] points down (-z), scaled to mm
    const rot = {
      0: p => [p[2], p[1], -p[0]], 1: p => [-p[2], p[1], p[0]], 2: p => [p[0], p[2], -p[1]],
      3: p => [p[0], -p[2], p[1]], 4: p => [p[0], -p[1], -p[2]], 5: p => p,
    }[bestA];
    transform(m, p => rot(p).map(x => x * v));
    m.unsupported = bestU;
    out.push(m);
  });
  // side by side in rows, 5 mm apart
  let x = 0, y = 0, row = 0, unsup = 0;
  const width = (o.size || 60) * 2.2;
  for (const m of out) {
    onBed(m);
    const [lo, hi] = bounds(m);
    if (x > 0 && x + hi[0] - lo[0] > width) { x = 0; y += row + 5; row = 0; }
    transform(m, ([a, b, cc]) => [a - lo[0] + x, b - lo[1] + y, cc]);
    x += hi[0] - lo[0] + 5; row = Math.max(row, hi[1] - lo[1]); unsup += m.unsupported;
  }
  const m = onBed(merge(...out));
  m.count = out.length; m.unsupported = unsup; m.ok = D.ok;
  return m;
}

export const fileName = o => `puzzle_chest_${o.shape}_${o.n}p_s${o.seed}_${o.size}mm_c${o.clearance}`;
